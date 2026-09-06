/**
 * The navigation shell — a floating bar over the three base screens.
 *
 * Not a native tab bar bolted to the screen edge. The design language wants a lifted
 * object, so this is a rounded tablet that clears the home-gesture inset, carries the
 * one shadow the language allows (README §2 — shadow only on things meant to be picked
 * up), and marks the active screen with a slider that glides between slots. On iOS 26
 * the slider is real liquid glass; everywhere else it's a forest-tinted highlight, the
 * same wash the jar fill uses.
 *
 * ## Why the slider is positioned by layout, not by the animated value
 *
 * The obvious shape — one shared value holding the slider's absolute offset, written
 * whenever the index changes — puts the resting position in animation state, and
 * animation state is the one thing that does not reliably survive this screen being
 * torn down and rebuilt. The tabs sit under a Stack: push a Jar, a Title or the Log and
 * the whole tab screen is detached; pop back and it is re-attached, sometimes as fresh
 * views. An offset that reset to zero then left the slider under Household while the
 * labels correctly lit Explore — and nothing re-ran, because neither the index nor the
 * track width had changed.
 *
 * So `left` carries the slot, straight from `state.index`: every render paints the
 * slider where the focused tab is, with nothing to consult. The shared value carries
 * only the distance still to travel, which is zero at rest — the same value it takes
 * when it is created. Whatever happens to it, the slider lands in the right slot.
 *
 * It consumes the standard React Navigation tab-bar contract, so it drops into
 * `<Tabs tabBar={…}>` without any screen below knowing it exists — which keeps the
 * shell swappable, per `(app)/_layout.tsx`.
 */

import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { font, ink, paper, shadow } from "@/theme";

const HEIGHT = 60;
const MARGIN = 20;
const BOTTOM_GAP = 10;
const SLIDER_INSET = 6;

/** Bottom padding a scrolling tab screen needs so its last row clears the bar. */
export const TAB_BAR_CLEARANCE = HEIGHT + BOTTOM_GAP + 20;

/** The forest wash, shared with the jar fill — a highlight, not a hole. */
const SLIDER_TINT = "rgba(63,91,74,0.10)";
const SLIDER_EDGE = "rgba(63,91,74,0.20)";

type TabBarProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: {
    emit: (event: {
      type: "tabPress";
      target: string;
      canPreventDefault: true;
    }) => { defaultPrevented: boolean };
    navigate: (name: string) => void;
  };
};

const LABELS: Record<string, string> = {
  household: "Household",
  jars: "Jars",
  explore: "Explore",
};

export function FloatingTabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const [trackWidth, setTrackWidth] = useState(0);
  const slot = trackWidth > 0 ? trackWidth / state.routes.length : 0;

  // Where the slider belongs, as plain layout rather than animation state — see the
  // note on the slider at the top of this file.
  const target = state.index * slot;

  // How far it still has to travel, and zero at rest.
  const offset = useSharedValue(0);
  const from = useRef(state.index);

  useEffect(() => {
    const previous = from.current;
    from.current = state.index;
    // Nothing to glide: the first measurement, or a re-layout at the same index. The
    // slider is already in the right slot because `left` put it there.
    if (slot === 0 || previous === state.index) return;
    // Start from the slot it was in, then spring home.
    offset.value = (previous - state.index) * slot;
    offset.value = withSpring(0, { damping: 18, stiffness: 200, mass: 0.7 });
  }, [state.index, slot, offset]);

  const sliderStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: insets.bottom + BOTTOM_GAP,
        alignItems: "center",
      }}
    >
      <View
        style={{
          alignSelf: "stretch",
          marginHorizontal: MARGIN,
          borderRadius: HEIGHT / 2,
          backgroundColor: paper.card,
          ...shadow.lifted,
        }}
      >
        <View
          onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
          style={{
            flexDirection: "row",
            height: HEIGHT,
            borderRadius: HEIGHT / 2,
            borderWidth: 1,
            borderColor: paper.border,
            backgroundColor: paper.card,
            overflow: "hidden",
          }}
        >
          {slot > 0 ? (
            <Animated.View
              pointerEvents="none"
              style={[
                {
                  position: "absolute",
                  top: SLIDER_INSET,
                  bottom: SLIDER_INSET,
                  left: target,
                  width: slot,
                },
                sliderStyle,
              ]}
            >
              <Slider />
            </Animated.View>
          ) : null}

          {state.routes.map((route, i) => {
            const focused = state.index === i;
            const label = LABELS[route.name] ?? route.name;
            const onPress = () => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
            };

            return (
              <Pressable
                key={route.key}
                onPress={onPress}
                accessibilityRole="button"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={label}
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 3,
                }}
              >
                <NavIcon name={route.name} color={focused ? ink.primary : ink.muted} />
                <Text
                  style={{
                    fontFamily: font.uiMedium,
                    fontSize: 10,
                    letterSpacing: 1.4,
                    textTransform: "uppercase",
                    color: focused ? ink.primary : ink.muted,
                  }}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

/** Liquid glass where the platform has it; the forest wash everywhere else. */
function Slider() {
  const shape = { flex: 1, marginHorizontal: SLIDER_INSET, borderRadius: 20 } as const;

  if (Platform.OS === "ios" && isLiquidGlassAvailable()) {
    return <GlassView glassEffectStyle="regular" style={shape} />;
  }
  return (
    <View
      style={{ ...shape, backgroundColor: SLIDER_TINT, borderWidth: 1, borderColor: SLIDER_EDGE }}
    />
  );
}

// ---------------------------------------------------------------------------
// Icons — geometry only, no icon library in the project. Each is a 1.5px line
// drawing that takes its stroke from `color`, echoing the jar object.
// ---------------------------------------------------------------------------

function NavIcon({ name, color }: { name: string; color: string }) {
  if (name === "jars") return <JarGlyph color={color} />;
  if (name === "explore") return <SearchGlyph color={color} />;
  return <HouseGlyph color={color} />;
}

/** The household — a roof over a room. */
function HouseGlyph({ color }: { color: string }) {
  return (
    <View style={{ width: 22, height: 22, alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: 9,
          borderRightWidth: 9,
          borderBottomWidth: 8,
          borderLeftColor: "transparent",
          borderRightColor: "transparent",
          borderBottomColor: color,
        }}
      />
      <View style={{ width: 13, height: 9, borderWidth: 1.5, borderTopWidth: 0, borderColor: color }} />
    </View>
  );
}

/**
 * A jar — the app icon at 22pt, and the same line drawing as the tiles it navigates to.
 * Lid at 79% of the body's width, floating one stroke clear of it; no neck.
 */
function JarGlyph({ color }: { color: string }) {
  return (
    <View style={{ width: 22, height: 22, alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: 12, height: 1.5, borderRadius: 0.75, backgroundColor: color }} />
      <View
        style={{
          marginTop: 1.5,
          width: 15,
          height: 14,
          borderWidth: 1.5,
          borderColor: color,
          borderTopLeftRadius: 3,
          borderTopRightRadius: 3,
          borderBottomLeftRadius: 4.5,
          borderBottomRightRadius: 4.5,
        }}
      />
    </View>
  );
}

/** Exploration — a magnifier. */
function SearchGlyph({ color }: { color: string }) {
  return (
    <View style={{ width: 22, height: 22 }}>
      <View
        style={{
          position: "absolute",
          top: 2,
          left: 2,
          width: 13,
          height: 13,
          borderRadius: 7,
          borderWidth: 1.5,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: "absolute",
          right: 2,
          bottom: 2,
          width: 7,
          height: 1.5,
          borderRadius: 1,
          backgroundColor: color,
          transform: [{ rotate: "45deg" }],
        }}
      />
    </View>
  );
}
