/**
 * The horizontal drag value selector for a 0–10 rating — the same capsule the Title
 * screen uses in "Mine" mode (`household-rating.tsx`), reworked as a plain controlled
 * input for the paper register: it takes a `value` and reports back on release, with no
 * DB or scope knowledge of its own.
 *
 * Drag anywhere on the tablet. The finger runs through a per-unit S-curve so the handle
 * sticks to each whole-number notch and a haptic tick fires as it drops in, without the
 * value snapping — a deliberate move still reaches any tenth. Lands on the nearest tenth
 * on release.
 */

import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useRef } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  ReduceMotion,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { accent, font, ink, paper } from "@/theme";

const MIN = 0;
const MAX = 10;
const SPAN = MAX - MIN;

/** Detent shaping — see the Title-screen slider for the full rationale. */
const DETENT_GAMMA = 2.2;
const LOCK_EPS = 0.05;

const CAPSULE_HEIGHT = 52;
const CAPSULE_RADIUS = CAPSULE_HEIGHT / 2;
const PAD_X = 20;
const EDGE_WIDTH = 2.5;

/** Amber as a wash, not a block — a level you can read text over. */
const AMBER_WASH = "rgba(201,138,60,0.22)";
const NOTCH = "rgba(46,42,36,0.10)";
const NOTCH_STRONG = "rgba(46,42,36,0.20)";

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

const asProgress = (value: number) => {
  "worklet";
  return (value - MIN) / SPAN;
};

const format = (value: number) => {
  "worklet";
  const scaled = Math.round(value * 10);
  const whole = Math.trunc(scaled / 10);
  const tenths = Math.abs(scaled % 10);
  return `${whole}.${tenths}`;
};

const tick = () => {
  Haptics.selectionAsync().catch(() => {});
};

export function RatingSlider({
  value,
  onChange,
}: {
  value: number;
  /** Fired on release / tap, snapped to the nearest tenth. */
  onChange: (value: number) => void;
}) {
  const progress = useSharedValue(asProgress(value));
  const width = useSharedValue(0);
  const dragging = useSharedValue(false);
  const lockedInt = useSharedValue(
    Math.abs(value - Math.round(value)) < LOCK_EPS ? Math.round(value) : -1,
  );
  const label = useSharedValue(format(value));

  // Stable indirection so the gesture is built once, not on every parent re-render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const emit = (v: number) => onChangeRef.current(v);

  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (dragging.get()) return;
    progress.set(
      withSpring(asProgress(value), {
        duration: 300,
        dampingRatio: 1,
        reduceMotion: ReduceMotion.System,
      }),
    );
    label.set(format(value));
  }, [value, progress, dragging, label]);

  const gesture = useMemo(() => {
    const move = (x: number) => {
      "worklet";
      const w = width.get();
      const p = w > 0 ? Math.min(Math.max(x / w, 0), 1) : 0;

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

      progress.set(asProgress(v));
      label.set(format(v));

      const locked = Math.abs(v - Math.round(v)) < LOCK_EPS ? Math.round(v) : -1;
      if (locked !== lockedInt.get()) {
        lockedInt.set(locked);
        if (locked >= 0) scheduleOnRN(tick);
      }
    };

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
      scheduleOnRN(emit, snapped);
    };

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
    // Everything referenced is stable (shared values, `tick`, the `emit` ref wrapper).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fillStyle = useAnimatedStyle(() => ({ width: `${progress.get() * 100}%` }));
  const edgeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.get() * (width.get() - EDGE_WIDTH) }],
  }));
  const numeralProps = useAnimatedProps(
    () => ({ text: label.get(), defaultValue: label.get() }) as never,
  );

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        onLayout={(e) => width.set(e.nativeEvent.layout.width)}
        style={capsuleStyle}
        accessibilityRole="adjustable"
        accessibilityLabel="Rating value"
        accessibilityValue={{ min: MIN, max: MAX, now: value, text: format(value) }}
      >
        <Animated.View
          style={[
            { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: AMBER_WASH },
            fillStyle,
          ]}
        />
        <Notches />
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: EDGE_WIDTH,
              backgroundColor: accent.amber,
            },
            edgeStyle,
          ]}
        />

        <View pointerEvents="none" style={contentRowStyle}>
          <Text style={endStyle}>0</Text>
          <AnimatedTextInput
            editable={false}
            pointerEvents="none"
            underlineColorAndroid="transparent"
            animatedProps={numeralProps}
            accessibilityElementsHidden
            importantForAccessibility="no"
            style={numeralStyle}
          />
          <Text style={endStyle}>10</Text>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

/** Interior whole-number marks. 0 and 10 are the ends of the capsule itself. */
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
  backgroundColor: paper.jar,
  borderWidth: 1,
  borderColor: paper.border,
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

const numeralStyle = {
  fontFamily: font.uiBold,
  fontSize: 22,
  lineHeight: 26,
  letterSpacing: 0.3,
  padding: 0,
  minWidth: 46,
  textAlign: "center" as const,
  color: accent.amber,
};

const endStyle = {
  fontFamily: font.uiMedium,
  fontSize: 12,
  color: ink.faint,
};
