/**
 * Buttons.
 *
 * Hairlines rather than shadows, per the design language — a button is an edge and a
 * ground, never a lifted card. Only drawn slips and the winner card get a shadow.
 */

import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { accent, paper } from "@/theme";

type Variant = "primary" | "secondary" | "quiet";

const grounds: Record<Variant, string> = {
  /** Forest — the "go" of the app. Primary action, one per screen. */
  primary: "bg-forest border-forest active:bg-forest-pressed",
  /** Paper card with a hairline. The alternative that isn't a rejection. */
  secondary: "bg-card border-hairline active:bg-chip",
  /** No ground at all — a text link that happens to be a button. */
  quiet: "bg-transparent border-transparent",
};

const labels: Record<Variant, string> = {
  primary: "text-card",
  secondary: "text-ink",
  quiet: "text-navy",
};

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  pill = false,
  accessibilityLabel,
  className = "",
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  /** Shows a spinner and blocks presses. The label stays, so width doesn't jump. */
  loading?: boolean;
  /** Fully rounded ends — for buttons that sit in a row rather than full width. */
  pill?: boolean;
  accessibilityLabel?: string;
  className?: string;
}) {
  const blocked = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: blocked, busy: loading }}
      disabled={blocked}
      onPress={onPress}
      className={`
        h-13 flex-row items-center justify-center gap-2 border px-5
        ${pill ? "rounded-full" : "rounded-button"}
        ${grounds[variant]} ${blocked ? "opacity-40" : ""} ${className}
      `}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === "primary" ? paper.card : accent.forest}
        />
      ) : null}
      <Text className={`type-button ${labels[variant]}`}>{label}</Text>
    </Pressable>
  );
}

/**
 * A press target with no chrome, for a row that is entirely its own affordance —
 * a jar tile, a slip, a list row.
 */
export function Tappable({
  children,
  onPress,
  className = "",
  accessibilityLabel,
}: {
  children: React.ReactNode;
  onPress: () => void;
  className?: string;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      className={`active:opacity-70 ${className}`}
    >
      <View className="flex-1">{children}</View>
    </Pressable>
  );
}
