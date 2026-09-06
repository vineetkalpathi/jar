/**
 * A panel that slides in over a dim scrim — from the bottom (`BottomSheet`, the app's
 * pickers and confirmations) or from beneath a header (`TopSheet`, the household
 * switcher). One implementation, because everything hard about it is shared.
 *
 * Why this exists instead of `<Modal animationType="slide">`: that slides the *entire*
 * modal view — the scrim included — so the dim overlay visibly travels with the panel.
 * Here the `Modal` itself does not animate. One Reanimated progress value fades the
 * scrim in place and translates only the panel, and the modal is held mounted through
 * the close animation so the panel slides back out before it unmounts.
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
 *
 * ## What differs between the two directions
 *
 * A bottom sheet translates by the screen height: it is always taller than its travel,
 * so it never needs measuring. A top sheet cannot do that — it unfurls from under an
 * anchor partway down the screen, so a screen-height translate would leave it invisible
 * for most of the animation and then snap. It measures its own panel instead, and stays
 * transparent for the one frame before that measurement lands.
 *
 * The top sheet also splits its dismiss surface in two. Above `anchorY` the scrim is
 * *clear*, so the header that opened the sheet stays lit and reads as still-live; below
 * it the scrim dims as usual. Both halves dismiss on press, which is what makes
 * re-tapping the anchor close the sheet — the modal covers the whole screen, so the
 * anchor's own `Pressable` never sees that second tap.
 *
 * That last fact is also why `aboveAnchor` exists. A modal is its own view tree: nothing
 * behind it can be touched, so a header control that *looks* live above the clear scrim
 * is dead, and tapping it only dismisses. Anything that must keep working while the
 * sheet is open is re-rendered into `aboveAnchor`, positioned over its real counterpart.
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
  View,
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

/** How long past the slide to wait for iOS's `onDismiss` before reporting anyway. */
const DISMISS_BACKSTOP = 200;

const DEFAULT_SCRIM = "rgba(0,0,0,0.3)";

type SharedProps = {
  visible: boolean;
  onClose: () => void;
  /**
   * Fired once per close, after the sheet is gone — on iOS when the modal reports its
   * dismissal, elsewhere once the slide has finished. Open the next layer from here
   * rather than from a timer of the caller's own.
   */
  onClosed?: () => void;
  children: ReactNode;
  /** Applied to the sliding panel wrapper — e.g. `{ maxHeight: "82%" }`. */
  style?: StyleProp<ViewStyle>;
  scrimColor?: string;
};

/**
 * The open/close machinery, shared by both directions: mount lifecycle, the progress
 * value, and the once-per-close `onClosed`. Returns null while unmounted.
 */
function useSheetLifecycle({
  visible,
  onClosed,
}: {
  visible: boolean;
  onClosed?: () => void;
}) {
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
    // iOS is the only platform that presents sheets as view controllers, so it is the
    // only one where the real dismissal matters — `onDismiss` reports it, and this only
    // covers the case where it never arrives. Everywhere else the unmount is the close.
    const backstop = setTimeout(
      fireClosed,
      Platform.OS === "ios" ? DURATION + DISMISS_BACKSTOP : DURATION,
    );
    return () => {
      clearTimeout(slide);
      clearTimeout(backstop);
    };
  }, [visible, progress, fireClosed]);

  return { mounted, progress, fireClosed };
}

export function BottomSheet({
  visible,
  onClose,
  onClosed,
  children,
  style,
  scrimColor = DEFAULT_SCRIM,
}: SharedProps) {
  const { height } = useWindowDimensions();
  const { mounted, progress, fireClosed } = useSheetLifecycle({ visible, onClosed });

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

/**
 * A panel that unfurls downward from `anchorY` — the distance, in points from the top
 * of the window, of the bottom edge of whatever opened it.
 *
 * The region above `anchorY` is left clear so the anchor keeps reading as live; below,
 * the scrim dims and a clipping view hides the panel's travel, so it appears to slide
 * out from directly beneath the header rather than in from off-screen.
 */
export function TopSheet({
  visible,
  onClose,
  onClosed,
  children,
  style,
  scrimColor = DEFAULT_SCRIM,
  anchorY,
  aboveAnchor,
}: SharedProps & {
  anchorY: number;
  /**
   * Live controls to lay over the clear region — window-positioned by the caller, since
   * only it knows where the originals sit. `box-none` here, so the layer itself stays
   * transparent to touch and only what the caller draws in it takes a press.
   */
  aboveAnchor?: ReactNode;
}) {
  const { mounted, progress, fireClosed } = useSheetLifecycle({ visible, onClosed });

  // The panel's own height, so it travels exactly its own length. Zero until the first
  // layout pass, which `panelStyle` treats as "not ready" rather than "no travel".
  const panelHeight = useSharedValue(0);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const panelStyle = useAnimatedStyle(() => ({
    opacity: panelHeight.value === 0 ? 0 : 1,
    transform: [{ translateY: -(1 - progress.value) * panelHeight.value }],
  }));

  if (!mounted) return null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={onClose}
      onDismiss={Platform.OS === "ios" ? fireClosed : undefined}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        {/*
          Clear, above the anchor. It exists only to catch the tap that re-presses the
          anchor: the modal is over the whole window, so the anchor's own Pressable is
          unreachable while this is open.
        */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={onClose}
          style={{ height: anchorY }}
        />

        <Animated.View style={{ flex: 1, overflow: "hidden" }}>
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
          <Animated.View
            onLayout={(e) => {
              panelHeight.value = e.nativeEvent.layout.height;
            }}
            style={[{ flexShrink: 1 }, style, panelStyle]}
          >
            {children}
          </Animated.View>
        </Animated.View>

        {/* Last, so it takes the press before the clear dismiss region beneath it. */}
        {aboveAnchor ? (
          <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
            {aboveAnchor}
          </View>
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}
