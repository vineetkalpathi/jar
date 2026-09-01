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

  const x = useSharedValue(0);
  const settled = useRef(false);

  useEffect(() => {
    if (slot === 0) return;
    const target = state.index * slot;
    // First real measurement: place the slider, don't fly it in from the edge.
    if (!settled.current) {
      x.value = target;
      settled.current = true;
    } else {
      x.value = withSpring(target, { damping: 18, stiffness: 200, mass: 0.7 });
    }
  }, [state.index, slot, x]);

  const sliderStyle = useAnimatedStyle(() => ({
    width: slot,
    transform: [{ translateX: x.value }],
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
                { position: "absolute", top: SLIDER_INSET, bottom: SLIDER_INSET },
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
