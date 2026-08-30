/**
 * A small − value + stepper for a single bounded number. Used for a rewatch count and
 * for a rating threshold, where a full slider would be too much furniture for one row.
 */

import { Pressable, Text, View } from "react-native";
import { ink, paper } from "@/theme";

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 99,
  step = 1,
  /** Decimal places to show — 1 for a rating threshold, 0 for a count. */
  precision = 0,
  suffix,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  suffix?: string;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const round = (n: number) => Math.round(n / step) * step;
  const set = (n: number) => onChange(Number(clamp(round(n)).toFixed(precision)));

  return (
    <View className="flex-row items-center self-start overflow-hidden rounded-card border border-hairline">
      <Key label="–" onPress={() => set(value - step)} disabled={value <= min} />
      <View className="min-w-14 items-center border-x border-hairline px-2 py-1.5">
        <Text className="type-body text-ink">
          {value.toFixed(precision)}
          {suffix ? <Text className="type-meta-small text-ink-muted"> {suffix}</Text> : null}
        </Text>
      </View>
      <Key label="+" onPress={() => set(value + step)} disabled={value >= max} />
    </View>
  );
}

function Key({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label === "+" ? "Increase" : "Decrease"}
      className="items-center justify-center px-3.5 py-1.5 active:opacity-60"
      style={{ backgroundColor: paper.card, opacity: disabled ? 0.35 : 1 }}
    >
      <Text style={{ fontSize: 18, lineHeight: 20, color: ink.secondary }}>{label}</Text>
    </Pressable>
  );
}
