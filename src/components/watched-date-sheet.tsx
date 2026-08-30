/**
 * A rough "when did you watch it?" picker, in the dark register the Title screen uses.
 *
 * Three snapping wheels — year, month, day — rather than a native date picker, so it
 * carries the app's own type and colour. Approximate by design: month and day each
 * lead with "Any", so a year alone reads back as "2024", a year + month as "March
 * 2024" (see `time.ts`). The day wheel greys out until there's a month to hang it on.
 *
 * The wheels snap: `snapToInterval` plus a fast deceleration means a spin always
 * settles a row dead-centre under the selection band, with a haptic tick per row as it
 * passes, and rows scaling and tilting away from the centre the way a physical dial
 * would.
 */

import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedRef,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { DarkEyebrow, DarkMeta } from "./text";
import { daysInMonth, MONTH_NAMES, type WatchPrecision } from "@/lib/time";
import { accent, dark, font, paper } from "@/theme";

const NOW = new Date();
const THIS_YEAR = NOW.getUTCFullYear();
const TODAY = {
  year: THIS_YEAR,
  month: NOW.getUTCMonth() + 1,
  day: NOW.getUTCDate(),
};

const MIN_YEAR = 1920;
const YEAR_ITEMS = Array.from({ length: THIS_YEAR - MIN_YEAR + 1 }, (_, i) =>
  String(MIN_YEAR + i),
);
const MONTH_ITEMS = ["Any", ...MONTH_NAMES];

const ITEM_HEIGHT = 34;
const VISIBLE = 5;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE;
const PAD = ITEM_HEIGHT * ((VISIBLE - 1) / 2);

type Parts = { year: number; month: number | null; day: number | null };

/** Fire-and-forget selection tick — wrapped, like the rating slider's. */
const tick = () => {
  try {
    Haptics.selectionAsync().catch(() => {});
  } catch {
    // no haptics on this build
  }
};

export function WatchedDateSheet({
  visible,
  seen,
  initial,
  initialPrecision,
  onClose,
  onSave,
  onRemove,
}: {
  visible: boolean;
  /** Drives the primary button's label and whether "remove" shows. */
  seen: boolean;
  initial: { year: number; month: number; day: number } | null;
  initialPrecision: WatchPrecision | null;
  onClose: () => void;
  onSave: (on: Parts) => void | Promise<void>;
  /** Omit when there's nothing to remove yet. */
  onRemove?: () => void;
}) {
  const [year, setYear] = useState(TODAY.year);
  const [month, setMonth] = useState<number | null>(TODAY.month);
  const [day, setDay] = useState<number | null>(TODAY.day);
  // Bumped on every open so the wheel row remounts and each wheel positions itself
  // fresh on its seeded row.
  const [openKey, setOpenKey] = useState(0);

  // Re-seed each time the sheet opens. A new Viewing starts at today, fully filled, so
  // an un-edited "Mark as seen" matches the one-tap eye; the User dials parts back to
  // "Any" to make it rough. An existing one starts at its stored date and precision.
  useEffect(() => {
    if (!visible) return;
    if (!initial) {
      setYear(TODAY.year);
      setMonth(TODAY.month);
      setDay(TODAY.day);
    } else {
      setYear(initial.year);
      setMonth(initialPrecision === "year" ? null : initial.month);
      setDay(
        initialPrecision === "year" || initialPrecision === "month" ? null : initial.day,
      );
    }
    setOpenKey((k) => k + 1);
  }, [visible, initial, initialPrecision]);

  const dayCount = month == null ? 0 : daysInMonth(year, month);
  const DAY_ITEMS = ["Any", ...Array.from({ length: dayCount }, (_, i) => String(i + 1))];

  const clampDay = (y: number, m: number | null, d: number | null) => {
    if (m == null || d == null) return d;
    return Math.min(d, daysInMonth(y, m));
  };

  const onYear = (i: number) => {
    const y = MIN_YEAR + i;
    setYear(y);
    setDay((d) => clampDay(y, month, d));
  };

  const onMonth = (i: number) => {
    const m = i === 0 ? null : i;
    setMonth(m);
    setDay((d) => (m == null ? null : clampDay(year, m, d)));
  };

  const onDay = (i: number) => setDay(i === 0 ? null : i);

  const save = () => onSave({ year, month, day: month == null ? null : day });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* A Modal renders in its own view tree, outside the app's GestureHandlerRootView,
          so the wheels' scroll views get their own root here or they never see a drag. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View className="flex-1 justify-end">
          {/* Backdrop as a sibling *behind* the sheet — never an ancestor of the
              scroll views, which would swallow their pan. */}
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.45)" }]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />

          <View
            className="px-6 pb-10 pt-5"
            style={{
              backgroundColor: dark.surface,
              borderTopLeftRadius: 14,
              borderTopRightRadius: 14,
              borderWidth: 1,
              borderColor: dark.border,
            }}
          >
            <View className="mb-4 gap-1">
              <DarkEyebrow>When did you watch it?</DarkEyebrow>
              <DarkMeta>Approximate is fine — leave the day, or the month, on “Any”.</DarkMeta>
            </View>

            <View className="mt-1 flex-row">
              <ColumnHead flex={1}>Year</ColumnHead>
              <ColumnHead flex={1.25}>Month</ColumnHead>
              <ColumnHead flex={0.9}>Day</ColumnHead>
            </View>

            <View style={{ height: WHEEL_HEIGHT }}>
              <View key={openKey} className="flex-row" style={{ height: WHEEL_HEIGHT }}>
                <Wheel items={YEAR_ITEMS} index={year - MIN_YEAR} onChange={onYear} flex={1} />
                <Wheel items={MONTH_ITEMS} index={month ?? 0} onChange={onMonth} flex={1.25} />
                <Wheel
                  items={DAY_ITEMS}
                  index={day ?? 0}
                  onChange={onDay}
                  enabled={month != null}
                  flex={0.9}
                />
              </View>

              {/* The selection band — one row tall, centred, spanning all three wheels. */}
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: PAD,
                  height: ITEM_HEIGHT,
                  borderTopWidth: 1,
                  borderBottomWidth: 1,
                  borderColor: dark.border,
                  backgroundColor: "rgba(63,91,74,0.12)",
                }}
              />
            </View>

            <View className="mt-6 flex-row gap-3">
              {onRemove ? (
                <Pressable
                  onPress={onRemove}
                  accessibilityRole="button"
                  className="flex-1 items-center justify-center rounded-full active:opacity-70"
                  style={{ height: 46, borderWidth: 1.5, borderColor: dark.border }}
                >
                  <Text
                    style={{ fontFamily: font.uiBold, fontSize: 14, color: dark.textSecondary }}
                  >
                    Mark unwatched
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={save}
                accessibilityRole="button"
                className="flex-1 items-center justify-center rounded-full active:opacity-80"
                style={{ height: 46, backgroundColor: accent.forest }}
              >
                <Text style={{ fontFamily: font.uiBold, fontSize: 14, color: paper.card }}>
                  {seen ? "Save date" : "Mark as seen"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

function ColumnHead({ children, flex }: { children: string; flex: number }) {
  return (
    <Text
      style={{
        flex,
        textAlign: "center",
        fontFamily: font.uiMedium,
        fontSize: 10.5,
        letterSpacing: 1.4,
        textTransform: "uppercase",
        color: dark.textMuted,
        marginBottom: 6,
      }}
    >
      {children}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// One wheel
// ---------------------------------------------------------------------------

function Wheel({
  items,
  index,
  onChange,
  enabled = true,
  flex = 1,
}: {
  items: string[];
  /** The selected row. Drives the initial position and any outside correction. */
  index: number;
  onChange: (index: number) => void;
  enabled?: boolean;
  flex?: number;
}) {
  const listRef = useAnimatedRef<Animated.ScrollView>();
  const scroll = useSharedValue(index * ITEM_HEIGHT);
  // Last row handed to `onChange`, so an outside correction (the day clamp) can be told
  // apart from this wheel's own settle and not fight it.
  const reported = useRef(index);
  const didInit = useRef(false);

  const onScroll = useAnimatedScrollHandler((e) => {
    scroll.value = e.contentOffset.y;
  });

  const placeAtIndex = (animated: boolean) => {
    listRef.current?.scrollTo({ y: index * ITEM_HEIGHT, animated });
    scroll.value = index * ITEM_HEIGHT;
    didInit.current = true;
  };

  // Belt to `onContentSizeChange`'s braces: place the selected row once, next frame.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      if (!didInit.current) placeAtIndex(false);
    });
    return () => cancelAnimationFrame(raf);
    // Mount only — later `index` changes are handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A tick each time a new row crosses the centre — the dial feel.
  useAnimatedReaction(
    () => Math.round(scroll.value / ITEM_HEIGHT),
    (curr, prev) => {
      if (prev != null && curr !== prev && curr >= 0 && curr < items.length) {
        scheduleOnRN(tick);
      }
    },
  );

  // Outside corrections only — e.g. a shorter month dropping the current day. The
  // initial placement is done in `onContentSizeChange`, once the rows have a height.
  useEffect(() => {
    if (!didInit.current || reported.current === index) {
      reported.current = index;
      return;
    }
    reported.current = index;
    placeAtIndex(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const settle = (y: number) => {
    const i = Math.min(Math.max(Math.round(y / ITEM_HEIGHT), 0), items.length - 1);
    if (i !== reported.current) {
      reported.current = i;
      onChange(i);
    }
  };

  return (
    <Animated.ScrollView
      ref={listRef}
      style={{ flex, height: WHEEL_HEIGHT }}
      contentContainerStyle={{ paddingVertical: PAD }}
      scrollEnabled={enabled}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM_HEIGHT}
      snapToAlignment="start"
      disableIntervalMomentum
      decelerationRate="fast"
      scrollEventThrottle={16}
      nestedScrollEnabled
      onScroll={onScroll}
      onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.y)}
      onScrollEndDrag={(e) => settle(e.nativeEvent.contentOffset.y)}
      onContentSizeChange={() => {
        if (!didInit.current) placeAtIndex(false);
      }}
    >
      {items.map((label, i) => (
        <WheelRow key={`${label}-${i}`} label={label} i={i} scroll={scroll} enabled={enabled} />
      ))}
    </Animated.ScrollView>
  );
}

function WheelRow({
  label,
  i,
  scroll,
  enabled,
}: {
  label: string;
  i: number;
  scroll: SharedValue<number>;
  enabled: boolean;
}) {
  const style = useAnimatedStyle(() => {
    const d = Math.abs(scroll.value / ITEM_HEIGHT - i);
    return {
      opacity: interpolate(d, [0, 1, 2, 3], [1, 0.44, 0.17, 0.06], Extrapolation.CLAMP),
      transform: [
        { perspective: 480 },
        { scale: interpolate(d, [0, 1, 2], [1, 0.88, 0.8], Extrapolation.CLAMP) },
        { rotateX: `${interpolate(d, [0, 1, 2.5], [0, 24, 52], Extrapolation.CLAMP)}deg` },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        { height: ITEM_HEIGHT, alignItems: "center", justifyContent: "center" },
        style,
      ]}
    >
      <Text
        numberOfLines={1}
        style={{
          fontFamily: font.uiMedium,
          fontSize: 16,
          letterSpacing: 0.2,
          color: enabled ? dark.text : dark.textFaint,
        }}
      >
        {label}
      </Text>
    </Animated.View>
  );
}
