/**
 * The ground every screen sits on.
 *
 * Two registers, per the design language: `paper` for what the household owns and
 * handles, `dark` for what TMDB knows. Passing the register here rather than setting a
 * background per screen is what keeps the two worlds from drifting into each other.
 *
 * ## Why the insets are applied by hand
 *
 * This deliberately does not use `SafeAreaView`. Under NativeWind v5's polyfill, that
 * component silently ignores `className` — no error, no warning, the props are simply
 * dropped. The `flex-1` never lands, the view collapses to zero height, and every
 * screen in the app renders as a blank grey page while the components beneath it are
 * mounted and correct. It cost an afternoon to find.
 *
 * `useSafeAreaInsets` returns plain numbers, so the padding goes on through `style`
 * while everything visual stays in `className`. If a future NativeWind fixes the
 * component, this still works — there is no reason to go back.
 */

import { createContext, useCallback, useContext, useRef } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Lets a deep `Field` ask the screen's ScrollView to lift it clear of the keyboard —
 * with enough headroom that the row of actions sitting just below it (the filter
 * editor's Add / Update, say) is visible too, not just the input. Null when the screen
 * has no scroll body.
 */
type ScreenScrollApi = { revealInput: (node: number | null) => void };
const ScreenScrollContext = createContext<ScreenScrollApi | null>(null);
export const useScreenScroll = () => useContext(ScreenScrollContext);

type Register = "paper" | "paper-deep" | "dark";

const grounds: Record<Register, string> = {
  paper: "bg-paper",
  /** The draw flow's own ground — one step down, so the ritual feels set apart. */
  "paper-deep": "bg-paper-deep",
  dark: "bg-dark-bg",
};

/**
 * Side margins. A prop rather than a `className` override, because two conflicting
 * padding utilities on one element resolve by stylesheet order rather than by the order
 * they were written, and the result is a coin flip.
 */
type Gutter = "form" | "grid" | "none";

const gutters: Record<Gutter, string> = {
  /** Reading measure — forms, prose, single-column screens. */
  form: "px-6",
  /** Slightly tighter, so a two-column grid keeps its tiles wide enough to read. */
  grid: "px-5",
  /** Full bleed. The screen handles its own insets. */
  none: "",
};

export function Screen({
  children,
  register = "paper",
  gutter = "form",
  scroll = false,
  footer,
  keyboardHidesFooter = false,
}: {
  children: React.ReactNode;
  register?: Register;
  gutter?: Gutter;
  /** Wraps the content in a ScrollView. Off by default — most screens shouldn't. */
  scroll?: boolean;
  /**
   * A row pinned to the bottom, below the scroll and above the keyboard — for the
   * screen's standing actions (a match count, a Save). Same gutter as the body, with a
   * hairline separating it from what scrolls past.
   */
  footer?: React.ReactNode;
  /**
   * Let the keyboard cover the footer instead of lifting it. For screens whose footer
   * is a commit-and-leave action (Save filter, Create jar) sitting above an editor that
   * takes keyboard input — keeping it above the keyboard makes it an easy mis-tap that
   * discards the field you were filling. The scroll body still avoids the keyboard.
   */
  keyboardHidesFooter?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const body = <View className={`flex-1 ${gutters[gutter]}`}>{children}</View>;

  const revealInput = useCallback((node: number | null) => {
    if (node == null) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const responder = scrollRef.current?.getScrollResponder() as any;
    // Give 140px of clearance below the field's bottom edge — RN's built-in
    // auto-scroll only frees the input itself, which leaves the editor's commit
    // button hidden behind the keyboard and easy to mis-tap.
    responder?.scrollResponderScrollNativeHandleToKeyboard?.(node, 140, true);
  }, []);

  const footerNode = footer ? (
    <View
      className={`border-t border-hairline ${grounds[register]} ${gutters[gutter]} pb-2 pt-3`}
    >
      {footer}
    </View>
  ) : null;

  return (
    <ScreenScrollContext.Provider value={scroll ? { revealInput } : null}>
      <View
        className={`flex-1 ${grounds[register]}`}
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <KeyboardAvoidingView
          className="flex-1"
          // Only iOS needs this; Android's windowSoftInputMode already resizes.
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          {scroll ? (
            <ScrollView
              ref={scrollRef}
              className="flex-1"
              contentContainerClassName="grow"
              keyboardShouldPersistTaps="handled"
            >
              {body}
            </ScrollView>
          ) : (
            body
          )}
          {/* Inside the avoider → rides above the keyboard. */}
          {keyboardHidesFooter ? null : footerNode}
        </KeyboardAvoidingView>
        {/* Outside the avoider → the keyboard draws over it. */}
        {keyboardHidesFooter ? footerNode : null}
      </View>
    </ScreenScrollContext.Provider>
  );
}
