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
 *
 * ## Unmounting, and `onClosed`
 *
 * The unmount is driven by a JS timer rather than the slide animation's completion
 * callback. `withTiming` reports `finished: false` when something interrupts it, and a
 * callback that only unmounts on `finished` leaves an invisible, full-screen `Modal`
 * mounted over the whole app, swallowing every touch. A timer cannot be lost that way,
 * and re-opening cancels it through the effect's cleanup.
 *
 * `onClosed` is the signal a caller needs before opening whatever comes next. iOS
 * refuses to present a view controller while another is still being dismissed, so
 * "wait 300ms and hope" is a race — see `jar/[id].tsx`. `Modal`'s `onDismiss` is the
 * real answer on iOS; the timer is the backstop everywhere else, and for the case where
 * `onDismiss` never arrives.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Matches the app's nav speed — quick, out of the way. */
const DURATION = 260;

/** How long past the slide to wait for `onDismiss` before reporting the close anyway. */
const DISMISS_BACKSTOP = 200;

export function BottomSheet({
  visible,
  onClose,
  onClosed,
  children,
  style,
  scrimColor = "rgba(0,0,0,0.3)",
}: {
  visible: boolean;
  onClose: () => void;
  /**
   * Fired once per close, after the sheet is gone — on iOS when the modal reports its
   * dismissal, elsewhere once the slide has finished. Open the next layer from here
   * rather than from a timer.
   */
  onClosed?: () => void;
  children: ReactNode;
  /** Applied to the sliding panel wrapper — e.g. `{ maxHeight: "82%" }`. */
  style?: StyleProp<ViewStyle>;
  scrimColor?: string;
}) {
  const { height } = useWindowDimensions();
  // Kept mounted through the close animation, then unmounted by the timer below.
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);

  // Read at fire time, so a close never calls last render's callback.
  const closedRef = useRef(onClosed);
  closedRef.current = onClosed;
  // True while a close is in flight, so `onClosed` fires exactly once — whichever of
  // `onDismiss` and the backstop gets there first — and not at all on a sheet that was
  // never open.
  const closing = useRef(false);
  // Whether this sheet has ever been open. A ref rather than reading `mounted`, which
  // would put the unmount itself in the effect's dependencies and cancel the timers the
  // same effect just armed.
  const opened = useRef(visible);

  const fireClosed = useCallback(() => {
    if (!closing.current) return;
    closing.current = false;
    closedRef.current?.();
  }, []);

  useEffect(() => {
    if (visible) {
      // Re-opening mid-close retracts the pending notification: the caller asked for
      // this sheet again, so nothing downstream should run.
      closing.current = false;
      opened.current = true;
      setMounted(true);
      progress.value = withTiming(1, {
        duration: DURATION,
        easing: Easing.out(Easing.cubic),
      });
      return;
    }

    // Nothing to close, and nothing to report — this is the initial render of a sheet
    // that starts hidden.
    if (!opened.current) return;

    closing.current = true;
    progress.value = withTiming(0, {
      duration: DURATION,
      easing: Easing.in(Easing.cubic),
    });
    const slide = setTimeout(() => setMounted(false), DURATION);
    const backstop = setTimeout(fireClosed, DURATION + DISMISS_BACKSTOP);
    return () => {
      clearTimeout(slide);
      clearTimeout(backstop);
    };
  }, [visible, progress, fireClosed]);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * height }],
  }));

  if (!mounted) return null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={onClose}
      // iOS only; the backstop timer covers every other platform.
      onDismiss={Platform.OS === "ios" ? fireClosed : undefined}
    >
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
