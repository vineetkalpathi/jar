/**
 * A panel that rises from the bottom of the screen over a dim scrim.
 *
 * Why this exists instead of `<Modal animationType="slide">`: that slides the *entire*
 * modal view — the scrim included — so the dim overlay visibly travels up with the
 * panel. Here the `Modal` itself does not animate. One Reanimated progress value fades
 * the scrim in place and translates only the panel, and the modal is held mounted
 * through the close animation so the panel slides back down before it unmounts.
 *
 * A `GestureHandlerRootView` wraps the contents: a `Modal` renders in its own view tree,
 * outside the app root's, so a gesture handler inside a sheet (a slider, a scroll wheel)
 * needs its own root here or it never sees a touch. The scrim is a sibling *behind* the
 * panel, never an ancestor, so it can't swallow those touches either.
 */

import { useEffect, useState, type ReactNode } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Matches the app's nav speed — quick, out of the way. */
const DURATION = 260;

export function BottomSheet({
  visible,
  onClose,
  children,
  style,
  scrimColor = "rgba(0,0,0,0.3)",
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Applied to the sliding panel wrapper — e.g. `{ maxHeight: "82%" }`. */
  style?: StyleProp<ViewStyle>;
  scrimColor?: string;
}) {
  const { height } = useWindowDimensions();
  // Kept mounted through the close animation, then unmounted by the timing callback.
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.value = withTiming(1, {
        duration: DURATION,
        easing: Easing.out(Easing.cubic),
      });
    } else {
      progress.value = withTiming(
        0,
        { duration: DURATION, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(setMounted)(false);
        },
      );
    }
  }, [visible, progress]);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * height }],
  }));

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1, justifyContent: "flex-end" }}>
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={onClose}
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: scrimColor },
            scrimStyle,
          ]}
        />
        <Animated.View style={[{ flexShrink: 1 }, style, panelStyle]}>
          {children}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}
