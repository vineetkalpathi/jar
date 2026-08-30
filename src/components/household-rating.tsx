/**
 * The rating section on Title detail — one capsule per activated Rating Category.
 *
 * Each row is a single tablet: the Category name, the value, the whole-number notches
 * and the amber level all live inside the one rounded shape. Two modes behind a toggle:
 *   - **Mine** — the signed-in User's own score. The capsule is the slider: drag
 *     anywhere on it. The drag is continuous and calibrates to one decimal place; a
 *     haptic tick and a taller notch fall on every whole number, without the value
 *     snapping to them. Writes on release.
 *   - **Household** — the average across every member who has rated, read-only.
 *
 * Shared because two screens show it: the DB-linked Title detail screen, and the
 * pre-add TMDB preview, which grows this section in place the moment "Add to library"
 * resolves rather than navigating anywhere.
 */

import { usePowerSync } from "@powersync/react";
import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  ReduceMotion,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { CategoryPicker } from "./category-picker";
import { DarkEyebrow, DarkMeta } from "./text";
import { annotations, households, type RatingCategoryRow, type RatingRow } from "@/lib/db";
import { useUserId } from "@/lib/auth/session";
import { accent, dark, font } from "@/theme";

export type RatingWithCategory = RatingRow & { category_name: string; display_name: string };

type Mode = "mine" | "household";

const MIN = 0;
const MAX = 10;
const SPAN = MAX - MIN;

/**
 * Detent shaping for the slider. The finger position is passed through an S-curve per
 * unit interval: near-flat approaching every whole number (the handle "sticks" to the
 * notch and the value creeps), steep through the middle of the gap (a deliberate move
 * still reaches any decimal). `GAMMA > 1` sets how sticky — higher is stickier.
 * `LOCK_EPS` is the last hair that pins exactly to the integer so it reads as locked.
 */
const DETENT_GAMMA = 2.2;
const LOCK_EPS = 0.05;

const CAPSULE_HEIGHT = 52;
const CAPSULE_RADIUS = CAPSULE_HEIGHT / 2;
const PAD_X = 22;
const EDGE_WIDTH = 2.5;
/** Amber as a wash, not a block — a level you can read text over, per the design language. */
const AMBER_WASH = "rgba(201,138,60,0.22)";
const NOTCH = "rgba(235,227,217,0.16)";
const NOTCH_STRONG = "rgba(235,227,217,0.32)";

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

/**
 * Fire-and-forget selection haptic, hoisted so the gesture worklet captures a stable
 * ref. Wrapped because a dev client built before `expo-haptics` was added throws
 * synchronously here rather than rejecting.
 */
const tick = () => {
  try {
    Haptics.selectionAsync().catch(() => {});
  } catch {
    // no haptics on this build
  }
};

export function HouseholdRating({
  titleId,
  householdId,
  categories,
  ratings,
}: {
  titleId: string;
  householdId: string;
  categories: RatingCategoryRow[];
  ratings: RatingWithCategory[];
}) {
  const db = usePowerSync();
  const userId = useUserId();
  const [mode, setMode] = useState<Mode>("mine");
  const [pickerOpen, setPickerOpen] = useState(false);

  // Only bail out entirely in the read-only view — in "mine", the add-axis affordance
  // below is the way back from a household that has removed all of its axes.
  if (categories.length === 0 && mode !== "mine") return null;

  const raterCount = new Set(ratings.map((r) => r.user_id)).size;

  // Adding an axis here activates it for the whole household — every title gains the
  // capsule. Confirmed because that is a lot of reach for one title screen.
  const addAxis = (category: { id: string; name: string }) => {
    Alert.alert(
      `Add ${category.name}?`,
      "It becomes a rating axis for the whole household and shows on every title.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Add",
          onPress: () => void households.activateCategory(db, householdId, category.id),
        },
      ],
    );
  };

  return (
    <View className="mt-6 gap-3 border-t border-dark-hairline pt-5">
      {/* One line in both modes — the toggle states the mode, the eyebrow stays put,
          and the aggregate detail rides alongside it only when there's one to give.
          Keeps the capsules starting at the same Y whichever view you're in. */}
      <View className="flex-row items-baseline justify-between">
        <View className="flex-1 flex-row items-baseline gap-2 pr-2">
          <DarkEyebrow>Ratings</DarkEyebrow>
          {mode === "household" ? (
            <DarkMeta numberOfLines={1}>
              {raterCount > 0
                ? `· avg of ${raterCount} ${raterCount === 1 ? "rater" : "raters"}`
                : "· not yet rated"}
            </DarkMeta>
          ) : null}
        </View>
        <ModeToggle mode={mode} onChange={setMode} />
      </View>

      <View className="gap-2.5 pt-1">
        {categories.map((category) =>
          mode === "mine" ? (
            <MineRow
              key={category.id}
              titleId={titleId}
              userId={userId}
              category={category}
              value={ownValue(ratings, userId, category.id)}
            />
          ) : (
            <AverageRow key={category.id} category={category} ratings={ratings} />
          ),
        )}
      </View>

      {mode === "mine" ? (
        <Pressable
          onPress={() => setPickerOpen(true)}
          accessibilityRole="button"
          className="mt-1 self-start active:opacity-60"
        >
          <Text
            style={{
              fontFamily: font.uiMedium,
              fontSize: 12.5,
              letterSpacing: 0.4,
              color: dark.textSecondary,
            }}
          >
            ＋ Add a rating axis
          </Text>
        </Pressable>
      ) : null}

      <CategoryPicker
        visible={pickerOpen}
        activeIds={categories.map((c) => c.id)}
        heading="Add a rating axis"
        note="Adds it for everyone in the household — it shows on every title."
        onClose={() => setPickerOpen(false)}
        onPick={addAxis}
      />
    </View>
  );
}

/** The signed-in User's score for one Category, or null if they haven't set it. */
function ownValue(
  ratings: RatingWithCategory[],
  userId: string,
  categoryId: string,
): number | null {
  const row = ratings.find((r) => r.user_id === userId && r.category_id === categoryId);
  return row?.value ?? null;
}

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <View className="flex-row overflow-hidden rounded-card border border-dark-hairline">
      {(["mine", "household"] as const).map((m) => {
        const active = m === mode;
        return (
          <Pressable
            key={m}
            onPress={() => onChange(m)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className="px-2.5 py-1 active:opacity-70"
            style={{ backgroundColor: active ? accent.amber : "transparent" }}
          >
            <Text
              style={{
                fontFamily: font.uiMedium,
                fontSize: 11,
                letterSpacing: 0.6,
                color: active ? dark.bg : dark.textMuted,
              }}
            >
              {m === "mine" ? "Mine" : "Household"}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// The capsule frame — shared between the editable and read-only rows
// ---------------------------------------------------------------------------

/** Position 0–1 for a rating value. Runs on both runtimes — render and gesture. */
const asProgress = (value: number) => {
  "worklet";
  return (value - MIN) / SPAN;
};

/** One decimal place, formatted without `toFixed` so it's worklet-safe. */
function format(value: number): string {
  "worklet";
  const scaled = Math.round(value * 10);
  const whole = Math.trunc(scaled / 10);
  const tenths = Math.abs(scaled % 10);
  return `${whole}.${tenths}`;
}

const labelStyle = {
  fontFamily: font.uiMedium,
  fontSize: 11.5,
  letterSpacing: 1.5,
  textTransform: "uppercase" as const,
  color: dark.textSecondary,
};

/** The value: same face as the Category label, kept big and prominent. Color is per-row. */
const numeralStyle = {
  fontFamily: font.uiBold,
  fontSize: 22,
  lineHeight: 26,
  letterSpacing: 0.3,
  padding: 0,
  minWidth: 46,
  textAlign: "right" as const,
};

/** Interior whole-number marks. 1 and 10 are the ends of the capsule itself. */
function Notches() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: SPAN - 1 }, (_, i) => MIN + 1 + i).map((n) => {
        const strong = n % 5 === 0;
        const inset = strong ? CAPSULE_HEIGHT * 0.24 : CAPSULE_HEIGHT * 0.34;
        return (
          <View
            key={n}
            style={{
              position: "absolute",
              left: `${asProgress(n) * 100}%`,
              marginLeft: -1,
              top: inset,
              bottom: inset,
              width: 2,
              borderRadius: 1,
              backgroundColor: strong ? NOTCH_STRONG : NOTCH,
            }}
          />
        );
      })}
    </View>
  );
}

const capsuleStyle = {
  height: CAPSULE_HEIGHT,
  borderRadius: CAPSULE_RADIUS,
  backgroundColor: dark.surface,
  borderWidth: 1,
  borderColor: dark.border,
  overflow: "hidden" as const,
};

const contentRowStyle = {
  position: "absolute" as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  flexDirection: "row" as const,
  alignItems: "center" as const,
  justifyContent: "space-between" as const,
  paddingHorizontal: PAD_X,
};

// ---------------------------------------------------------------------------
// Mine — the sliding capsule
// ---------------------------------------------------------------------------

function MineRow({
  titleId,
  userId,
  category,
  value,
}: {
  titleId: string;
  userId: string;
  category: RatingCategoryRow;
  value: number | null;
}) {
  const db = usePowerSync();

  const progress = useSharedValue(value != null ? asProgress(value) : 0);
  const tabletWidth = useSharedValue(0);
  const dragging = useSharedValue(false);
  // Which integer detent the handle is currently pinned in, or -1 when between them —
  // so the haptic fires once each time it drops into a whole number.
  const lockedInt = useSharedValue(
    value != null && Math.abs(value - Math.round(value)) < LOCK_EPS ? Math.round(value) : -1,
  );
  const label = useSharedValue(value != null ? format(value) : "—");
  // Whether there's a value to show a level for — a rating of 0.0 sits at 0% fill, so
  // "empty" and "unrated" would otherwise look the same.
  const [rated, setRated] = useState(value != null);
  const started = useSharedValue(value != null);

  const mounted = useRef(false);
  useEffect(() => {
    const target = value != null ? asProgress(value) : 0;
    if (!mounted.current) {
      mounted.current = true;
      progress.set(target);
    } else if (!dragging.get()) {
      // A sync from another device, or our own write echoing back.
      progress.set(
        withSpring(target, { duration: 300, dampingRatio: 1, reduceMotion: ReduceMotion.System }),
      );
      setRated(value != null);
      started.set(value != null);
      label.set(value != null ? format(value) : "—");
      lockedInt.set(
        value != null && Math.abs(value - Math.round(value)) < LOCK_EPS ? Math.round(value) : -1,
      );
    }
  }, [value, progress, dragging, label, lockedInt, started]);

  const persist = (next: number) => {
    annotations
      .rate(db, { userId, titleId, categoryId: category.id, value: next })
      .catch((cause) => console.warn("[rating] could not save", category.name, cause));
  };

  const gesture = useMemo(() => {
    const move = (x: number) => {
      "worklet";
      const w = tabletWidth.get();
      const p = w > 0 ? Math.min(Math.max(x / w, 0), 1) : 0;

      // Shape the raw finger fraction into a value through the per-unit detent curve.
      const linear = p * SPAN;
      const k = Math.min(Math.floor(linear), MAX - 1);
      const t = linear - k;
      const shaped =
        t < 0.5
          ? 0.5 * Math.pow(2 * t, DETENT_GAMMA)
          : 1 - 0.5 * Math.pow(2 * (1 - t), DETENT_GAMMA);
      let v = k + shaped;
      const nearest = Math.round(v);
      if (Math.abs(v - nearest) < LOCK_EPS) v = nearest;
      v = Math.min(Math.max(v, MIN), MAX);

      // Store the *shaped* position, so the handle itself sticks to the notch and the
      // finger can run ahead of it inside a detent.
      progress.set(asProgress(v));
      label.set(format(v));

      if (!started.get()) {
        started.set(true);
        scheduleOnRN(setRated, true);
      }

      const locked = Math.abs(v - Math.round(v)) < LOCK_EPS ? Math.round(v) : -1;
      if (locked !== lockedInt.get()) {
        lockedInt.set(locked);
        if (locked >= 0) scheduleOnRN(tick);
      }
    };

    // Land on the nearest tenth — the finest value the column stores — and save.
    const release = () => {
      "worklet";
      const snapped = Math.round((MIN + progress.get() * SPAN) * 10) / 10;
      progress.set(
        withSpring(asProgress(snapped), {
          duration: 300,
          dampingRatio: 0.9,
          reduceMotion: ReduceMotion.System,
        }),
      );
      label.set(format(snapped));
      dragging.set(false);
      scheduleOnRN(persist, snapped);
    };

    // `activeOffsetX` lets a vertical drag fall through to the surrounding ScrollView;
    // the Tap keeps a plain touch working as "set it here".
    const drag = Gesture.Pan()
      .activeOffsetX([-8, 8])
      .onStart((e) => {
        dragging.set(true);
        move(e.x);
      })
      .onUpdate((e) => move(e.x))
      .onEnd(release)
      .onFinalize(() => dragging.set(false));

    const tap = Gesture.Tap()
      .maxDuration(250)
      .onEnd((e) => {
        dragging.set(true);
        move(e.x);
        release();
      });

    return Gesture.Race(drag, tap);
    // Shared values and `tick` are stable; `persist`'s inputs are the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, titleId, userId, category.id]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${progress.get() * 100}%` }));
  const edgeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.get() * (tabletWidth.get() - EDGE_WIDTH) }],
  }));
  const numeralProps = useAnimatedProps(
    () => ({ text: label.get(), defaultValue: label.get() }) as never,
  );

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        onLayout={(e) => tabletWidth.set(e.nativeEvent.layout.width)}
        style={capsuleStyle}
        accessibilityRole="adjustable"
        accessibilityLabel={`${category.name} rating`}
        accessibilityValue={{
          min: MIN,
          max: MAX,
          now: value ?? undefined,
          text: value != null ? format(value) : "not rated",
        }}
      >
        <Animated.View
          style={[
            { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: AMBER_WASH },
            fillStyle,
            { opacity: rated ? 1 : 0 },
          ]}
        />
        <Notches />
        <Animated.View
          pointerEvents="none"
          style={[
            { position: "absolute", left: 0, top: 0, bottom: 0, width: EDGE_WIDTH, backgroundColor: accent.amber },
            edgeStyle,
            { opacity: rated ? 1 : 0 },
          ]}
        />

        <View pointerEvents="none" style={contentRowStyle}>
          <Text style={labelStyle}>{category.name}</Text>
          <AnimatedTextInput
            editable={false}
            pointerEvents="none"
            underlineColorAndroid="transparent"
            animatedProps={numeralProps}
            accessibilityElementsHidden
            importantForAccessibility="no"
            style={[numeralStyle, { color: rated ? accent.amber : dark.textMuted }]}
          />
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

// ---------------------------------------------------------------------------
// Household — the read-only average
// ---------------------------------------------------------------------------

function AverageRow({
  category,
  ratings,
}: {
  category: RatingCategoryRow;
  ratings: RatingWithCategory[];
}) {
  // `value` is nullable in the generated row type — SQLite carries none of Postgres'
  // `not null` constraints locally (schema.ts) — though nothing writes a null one today.
  const values = ratings
    .filter((r) => r.category_id === category.id)
    .map((r) => r.value)
    .filter((v): v is number => v != null);
  const average = values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
  const rated = average !== null;

  // Read-only view: keep the amber level so the value reads at a glance, but drop the
  // notches and the edge handle — the affordances that say "drag me".
  return (
    <View
      style={capsuleStyle}
      accessibilityLabel={`${category.name} household rating`}
      accessibilityValue={{ text: rated ? average.toFixed(1) : "not rated" }}
    >
      {rated ? (
        <View
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${asProgress(average) * 100}%`,
            backgroundColor: AMBER_WASH,
          }}
        />
      ) : null}

      <View style={contentRowStyle}>
        <Text style={labelStyle}>{category.name}</Text>
        <Text style={[numeralStyle, { color: rated ? accent.amber : dark.textMuted }]}>
          {rated ? average.toFixed(1) : "—"}
        </Text>
      </View>
    </View>
  );
}
