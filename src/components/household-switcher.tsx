/**
 * The household name, as the way to change household.
 *
 * The rule this component enforces: **wherever the app prints the current Household's
 * name, that name is the switcher.** It appears as the Household tab's screen title, as
 * the eyebrow over Jars, and as Explore's "adding to" line — three different type roles,
 * one behaviour, so nobody has to learn where switching lives.
 *
 * Tapping it drops a `TopSheet` from directly beneath the name: every Household the user
 * belongs to — scrolling after five — with the two ways to gain another pinned beneath
 * them, since those are the way out of a list you didn't find your household in. The name itself stays lit above the
 * scrim, which is the whole reason the sheet comes from the top — the list visibly
 * belongs to the thing you touched.
 *
 * ## Header actions
 *
 * A screen that shows the name beside its own controls (Household's log and settings
 * glyphs) hands them over as `actions` rather than rendering them itself. The sheet is a
 * `Modal` — its own view tree — so anything left behind it is unreachable while open,
 * and a glyph that still looks live but only dismisses is worse than one that's gone.
 * Owning the row lets the switcher measure it and re-draw those controls *over* the
 * clear scrim, where a press closes the sheet and then navigates.
 *
 * ## Why the anchor is measured at press time
 *
 * The sheet has to start below the name, and the name sits at a different height on
 * every screen that shows it (a 36pt display serif on Household, tracked caps on Jars
 * and Explore) — plus whatever the safe-area inset is on the device. `measureInWindow`
 * at press time is the only number that is right in all of those cases; an `onLayout`
 * offset would be relative to the parent, which is not what the sheet needs.
 */

import { useQuery } from "@powersync/react";
import { router, type Href } from "expo-router";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from "react-native-reanimated";
import { TopSheet } from "./sheet";
import { Eyebrow, ScreenTitle } from "./text";
import { households } from "@/lib/db";
import { useUserId } from "@/lib/auth/session";
import { useActiveHousehold } from "@/lib/household/active";
import { accent, ink, paper, radius } from "@/theme";

/** Matches the sheet's own slide, so the chevron turns with the panel. */
const TURN = 260;

/**
 * How many Households the list shows before it starts scrolling.
 *
 * The cap is measured, not assumed: the rows are as tall as their own text, which moves
 * with the OS text size, so the sheet adds up the first `VISIBLE_ROWS` heights as they
 * lay out and caps the scroller at that. `ROW_ESTIMATE` (name + members + padding at the
 * default text size) stands in for the frame before those measurements land, so the
 * panel doesn't open tall and then snap shorter.
 */
const VISIBLE_ROWS = 5;
const ROW_ESTIMATE = 66;

type Variant = "title" | "eyebrow";

/** A control that sits beside the name and stays live while the sheet is open. */
export type SwitcherAction = {
  label: string;
  href: Href;
  glyph: ReactNode;
};

/** Window frame of the actions row, for re-drawing it over the sheet's clear scrim. */
type Frame = { x: number; y: number; width: number };

export function HouseholdSwitcher({
  variant,
  /**
   * Words before the name, for a screen where the household is the destination rather
   * than the subject — Explore's "Adding to Family".
   */
  prefix,
  /** Screen controls to sit opposite the name — see "Header actions" above. */
  actions,
}: {
  variant: Variant;
  prefix?: string;
  actions?: SwitcherAction[];
}) {
  const { all, active, select } = useActiveHousehold();
  const userId = useUserId();
  const [open, setOpen] = useState(false);
  const [anchorY, setAnchorY] = useState(0);
  // Row id → measured height, for the scroll cap. See `VISIBLE_ROWS`.
  const [rowHeights, setRowHeights] = useState<Record<string, number>>({});
  const anchor = useRef<View>(null);
  const actionsRow = useRef<View>(null);
  const [actionsFrame, setActionsFrame] = useState<Frame | null>(null);
  // Set on close, run once the sheet is gone — see `sheet.tsx` on the iOS presentation
  // race that makes "navigate after a timer" unreliable.
  const afterClose = useRef<(() => void) | null>(null);

  // One query for every household's roster rather than one per row: the sheet renders
  // all of them at once, and a query each would make the hook count vary with the data.
  const { data: everyone } = useQuery<{ household_id: string; display_name: string }>(
    households.MEMBERS_OF_MY_HOUSEHOLDS,
    [userId],
  );
  const rosters = useMemo(() => {
    const byHousehold = new Map<string, string[]>();
    for (const m of everyone) {
      const names = byHousehold.get(m.household_id);
      if (names) names.push(m.display_name);
      else byHousehold.set(m.household_id, [m.display_name]);
    }
    return byHousehold;
  }, [everyone]);

  const name = active?.name ?? "";
  const label = prefix ? `${prefix} ${name}` : name;

  const openSheet = () => {
    // Both frames come from the same press: the sheet hangs from the name's bottom edge,
    // and the actions replica has to land exactly on top of the originals it hides.
    actionsRow.current?.measureInWindow((x, y, width) =>
      setActionsFrame({ x, y, width }),
    );
    anchor.current?.measureInWindow((_x, y, _width, height) => {
      setAnchorY(y + height);
      setOpen(true);
    });
  };

  const closeThen = (next?: () => void) => {
    afterClose.current = next ?? null;
    setOpen(false);
  };

  const go = (href: Href) => closeThen(() => router.push(href));

  // Where the list stops and starts scrolling. `undefined` means there are few enough
  // households to show whole.
  const scrollCap = useMemo(() => {
    if (all.length <= VISIBLE_ROWS) return undefined;
    // Half of the next row stays visible, so the list reads as scrollable without
    // having to be scrolled first.
    const rows = all.slice(0, VISIBLE_ROWS + 1);
    let total = 0;
    for (const [i, household] of rows.entries()) {
      const height = rowHeights[household.id] ?? ROW_ESTIMATE;
      total += i === VISIBLE_ROWS ? height / 2 : height;
    }
    return total;
  }, [all, rowHeights]);

  // Whether the overlay copy of the actions is up. The header copy goes invisible for
  // exactly that span: two identical rows stacked would make the overlay's press
  // feedback invisible, since the lit original shows straight through it.
  const replicated = open && actionsFrame != null;

  /**
   * The actions, drawn identically in both places they appear. `overlay` is the copy
   * that sits over the open sheet: it can't navigate straight away, since iOS won't
   * present a screen while the sheet is still dismissing — it closes first, and pushes
   * from `onClosed`.
   */
  const renderActions = (overlay: boolean) =>
    actions ? (
      <View
        ref={overlay ? undefined : actionsRow}
        // `shrink-0`: the glyphs keep their width, and a long name truncates instead.
        className="shrink-0 flex-row items-center gap-5 pt-3"
        // Invisible, not unmounted: the row still has to hold its place in the header,
        // and stay measurable for the next open.
        style={{ opacity: !overlay && replicated ? 0 : 1 }}
      >
        {actions.map((action) => (
          <Pressable
            key={action.label}
            onPress={() =>
              overlay ? go(action.href) : router.push(action.href)
            }
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            className="active:opacity-60"
          >
            {action.glyph}
          </Pressable>
        ))}
      </View>
    ) : null;

  const nameAnchor = (
    <Pressable
      ref={anchor}
      onPress={openSheet}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={`${label}. Switch household`}
      accessibilityState={{ expanded: open }}
      // `shrink` + `min-w-0`: a long Household name must give way to whatever sits
      // beside it in the header (the Log and Settings glyphs), rather than pushing it
      // off the screen. The name truncates; the chevron never does.
      className="min-w-0 shrink flex-row items-center active:opacity-60"
      style={{ gap: variant === "title" ? 10 : 6 }}
    >
      {variant === "title" ? (
        <ScreenTitle className="shrink" numberOfLines={1}>
          {label}
        </ScreenTitle>
      ) : (
        <Eyebrow className="shrink" numberOfLines={1}>
          {label}
        </Eyebrow>
      )}
      <Chevron
        open={open}
        size={variant === "title" ? 9 : 6}
        color={variant === "title" ? ink.secondary : ink.muted}
      />
    </Pressable>
  );

  return (
    <>
      {actions ? (
        <View className="flex-row items-start justify-between gap-4">
          {nameAnchor}
          {renderActions(false)}
        </View>
      ) : (
        nameAnchor
      )}

      <TopSheet
        visible={open}
        anchorY={anchorY}
        onClose={() => closeThen()}
        aboveAnchor={
          actionsFrame ? (
            <View
              style={{
                position: "absolute",
                top: actionsFrame.y,
                left: actionsFrame.x,
                width: actionsFrame.width,
              }}
            >
              {renderActions(true)}
            </View>
          ) : null
        }
        onClosed={() => {
          const next = afterClose.current;
          afterClose.current = null;
          next?.();
        }}
        style={{
          backgroundColor: paper.bg,
          borderBottomLeftRadius: radius.sheet,
          borderBottomRightRadius: radius.sheet,
          borderBottomWidth: 1,
          borderColor: paper.border,
          // A backstop only: the row cap below decides the height in practice. This is
          // what keeps a device with enormous text from running off the bottom.
          maxHeight: "88%",
        }}
      >
        {/*
          Only the Households scroll. Create and Join are the two ways *out* of a list
          you didn't find what you wanted in, so they stay pinned beneath it rather than
          sinking below the fold with the eighth household.
        */}
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={scrollCap === undefined ? undefined : { maxHeight: scrollCap }}
          contentContainerStyle={{ paddingVertical: 8 }}
        >
          {all.map((household) => (
            <HouseholdRow
              key={household.id}
              name={household.name ?? ""}
              members={rosters.get(household.id) ?? []}
              current={household.id === active?.id}
              onLayout={(height) =>
                setRowHeights((heights) =>
                  heights[household.id] === height
                    ? heights
                    : { ...heights, [household.id]: height },
                )
              }
              onPress={() =>
                closeThen(() => {
                  if (household.id !== active?.id) select(household.id);
                })
              }
            />
          ))}
        </ScrollView>

        {/*
          Padding matches the scroller's own, and nothing more: this panel hangs from the
          header, so it ends well above the home indicator and owes it no inset.
        */}
        <View style={{ paddingBottom: 8 }}>
          <View className="mx-5 my-1 border-t border-hairline" />
          <SheetAction label="＋  Create a household" onPress={() => go("/create-household")} />
          <SheetAction label="＋  Join with a code" onPress={() => go("/join-household")} />
        </View>
      </TopSheet>
    </>
  );
}

/**
 * One household in the sheet: its name, and beneath it the people in it.
 *
 * Names rather than a count, because people are how anyone actually tells two
 * households apart — "the one with Sam in it" is a thought you have; "the one with four
 * members" is not.
 */
function HouseholdRow({
  name,
  members,
  current,
  onPress,
  onLayout,
}: {
  name: string;
  members: string[];
  current: boolean;
  onPress: () => void;
  /** Reports this row's height, so the list can cap itself at `VISIBLE_ROWS` of them. */
  onLayout: (height: number) => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLayout={(e) => onLayout(e.nativeEvent.layout.height)}
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityState={{ selected: current }}
      className="gap-0.5 px-5 py-3 active:opacity-60"
    >
      <Text
        className="type-body-large"
        numberOfLines={1}
        style={{ color: current ? accent.forest : ink.primary }}
      >
        {name}
      </Text>
      {members.length > 0 ? (
        <Text className="type-meta-small text-ink-muted" numberOfLines={1}>
          {members.join(", ")}
        </Text>
      ) : null}
    </Pressable>
  );
}

function SheetAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="px-5 py-3 active:opacity-60"
    >
      <Text className="type-body" style={{ color: accent.navy }}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * A downward chevron that turns to point up while the sheet is open.
 *
 * Two borders on a square, rotated 45° — the same View-drawn approach as the copy glyph
 * in settings, since the app carries no SVG dependency. The rotation is composed with
 * that fixed 45°, so the animated value runs 0 → 180 and the arrowhead flips end over
 * end rather than spinning to somewhere arbitrary.
 */
function Chevron({
  open,
  size,
  color,
}: {
  open: boolean;
  size: number;
  color: string;
}) {
  const turn = useDerivedValue(() => withTiming(open ? 180 : 0, { duration: TURN }));
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${45 + turn.value}deg` }],
  }));

  return (
    // A box the size of the glyph's diagonal, so the rotation has room and the row's
    // vertical rhythm doesn't shift as it turns.
    <View
      style={{
        width: size * 1.9,
        height: size * 1.9,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            borderRightWidth: 1.6,
            borderBottomWidth: 1.6,
            borderColor: color,
            // The arrowhead's visual centre sits below its box centre; nudging up
            // keeps it optically level with the text baseline it sits beside.
            marginTop: -size * 0.25,
          },
          style,
        ]}
      />
    </View>
  );
}
