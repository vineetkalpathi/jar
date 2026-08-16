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

import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
}: {
  children: React.ReactNode;
  register?: Register;
  gutter?: Gutter;
  /** Wraps the content in a ScrollView. Off by default — most screens shouldn't. */
  scroll?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const body = <View className={`flex-1 ${gutters[gutter]}`}>{children}</View>;

  return (
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
            className="flex-1"
            contentContainerClassName="grow"
            keyboardShouldPersistTaps="handled"
          >
            {body}
          </ScrollView>
        ) : (
          body
        )}
      </KeyboardAvoidingView>
    </View>
  );
}
