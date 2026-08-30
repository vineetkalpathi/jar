/**
 * Shared furniture for the filter builder's sections: the titled block, a labelled
 * control row, and the three-state "cycle chip" (off → include → exclude) that genres
 * and tags both use.
 */

import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Eyebrow, Meta } from "@/components/text";
import { accent, ink, paper } from "@/theme";

export function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <View className="gap-2">
      <Eyebrow>{title}</Eyebrow>
      {hint ? <Meta>{hint}</Meta> : null}
      <View className="gap-4 pt-1">{children}</View>
    </View>
  );
}

/** A control with a small caps label above it. */
export function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <View className="gap-1.5">
      <Text className="type-eyebrow text-ink-muted">{label}</Text>
      {children}
      {hint ? <Meta>{hint}</Meta> : null}
    </View>
  );
}

export type CycleState = "off" | "include" | "exclude";

export function nextCycle(state: CycleState): CycleState {
  return state === "off" ? "include" : state === "include" ? "exclude" : "off";
}

/**
 * A pill that cycles off → include (forest fill) → exclude (rust outline, struck). Used
 * for genre and tag chips, where "not this one" is as common as "this one".
 */
export function CycleChip({
  label,
  state,
  onPress,
}: {
  label: string;
  state: CycleState;
  onPress: () => void;
}) {
  const fill = state === "include" ? accent.forest : "transparent";
  const border =
    state === "include"
      ? accent.forest
      : state === "exclude"
        ? accent.rust
        : paper.border;
  const text =
    state === "include"
      ? paper.card
      : state === "exclude"
        ? accent.rust
        : ink.secondary;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: state !== "off" }}
      accessibilityLabel={`${label}${
        state === "include" ? ", included" : state === "exclude" ? ", excluded" : ""
      }`}
      className="flex-row items-center rounded-full border px-3.5 py-1.5 active:opacity-70"
      style={{ backgroundColor: fill, borderColor: border }}
    >
      {state === "exclude" ? (
        <Text style={{ color: text, fontSize: 14, marginRight: 3 }}>−</Text>
      ) : null}
      <Text
        className="type-meta"
        style={{
          color: text,
          textDecorationLine: state === "exclude" ? "line-through" : "none",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** The wrapping row chips sit in. */
export function ChipWrap({ children }: { children: ReactNode }) {
  return <View className="flex-row flex-wrap gap-2">{children}</View>;
}
