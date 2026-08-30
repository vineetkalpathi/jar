/**
 * Tags — a Household's shared labels. Their own chip, deliberately distinct from a
 * rating capsule or a plain bordered row: a small fully-rounded pill, a hairline edge
 * over a faint fill, the UI face at a tag-sized 12px. Two registers, because tags show
 * on the paper Household list and the dark Title screen both.
 *
 * `Tag` is the chip, `AddTag` the dashed "＋" affordance that opens the picker, and
 * `TagList` the wrapping row the two sit in.
 */

import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { dark, font, ink, paper } from "@/theme";

type Register = "paper" | "dark";

const palette = {
  paper: { border: paper.border, bg: paper.card, text: ink.secondary },
  dark: { border: dark.border, bg: dark.surface, text: dark.textSecondary },
} as const;

const chipStyle = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  // Fully rounded — a pill. Larger than any chip height, so the ends stay circular.
  borderRadius: 999,
  paddingVertical: 4,
  paddingHorizontal: 11,
  gap: 5,
};

const labelStyle = {
  fontFamily: font.uiMedium,
  fontSize: 12,
  letterSpacing: 0.3,
};

export function Tag({
  label,
  register = "paper",
  onPress,
  onRemove,
}: {
  label: string;
  register?: Register;
  onPress?: () => void;
  /** When set, the chip carries a `×` that calls this. */
  onRemove?: () => void;
}) {
  const c = palette[register];
  const chip = (
    <View
      style={[
        chipStyle,
        { borderWidth: 1, borderColor: c.border, backgroundColor: c.bg, flexShrink: 1 },
      ]}
    >
      <Text numberOfLines={1} style={[labelStyle, { color: c.text, flexShrink: 1 }]}>
        {label}
      </Text>
      {onRemove ? (
        <Pressable
          onPress={onRemove}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${label}`}
        >
          <Text style={{ fontFamily: font.ui, fontSize: 14, lineHeight: 14, color: c.text }}>
            ×
          </Text>
        </Pressable>
      ) : null}
    </View>
  );

  if (!onPress) return chip;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="active:opacity-60">
      {chip}
    </Pressable>
  );
}

/** The dashed "＋ Tag" chip. Same footprint as a `Tag`, no fill. */
export function AddTag({
  register = "paper",
  label = "Tag",
  onPress,
}: {
  register?: Register;
  label?: string;
  onPress: () => void;
}) {
  const c = palette[register];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Add a tag"
      className="active:opacity-60"
    >
      <View style={[chipStyle, { borderWidth: 1, borderStyle: "dashed", borderColor: c.border }]}>
        <Text style={[labelStyle, { color: c.text }]}>＋ {label}</Text>
      </View>
    </Pressable>
  );
}

/** The wrapping row `Tag`s and an `AddTag` sit in. */
export function TagList({ children }: { children: ReactNode }) {
  return <View className="flex-row flex-wrap items-center gap-1.5">{children}</View>;
}

/**
 * Read-only, single-line tag display for list rows: up to `max` chips, then a muted
 * "+n" for the rest. The whole list lives on the Title detail page, which every row
 * that uses this already taps through to — so "+n" needs no tap target of its own.
 */
export function TagStrip({
  tags,
  max = 3,
  register = "paper",
}: {
  tags: { id: string; name: string | null }[];
  max?: number;
  register?: Register;
}) {
  if (tags.length === 0) return null;
  const shown = tags.slice(0, max);
  const extra = tags.length - shown.length;
  const c = palette[register];
  return (
    <View className="flex-row items-center gap-1.5">
      {shown.map((t) => (
        <Tag key={t.id} label={t.name ?? ""} register={register} />
      ))}
      {extra > 0 ? (
        <Text style={[labelStyle, { color: c.text, flexShrink: 0 }]}>+{extra}</Text>
      ) : null}
    </View>
  );
}
