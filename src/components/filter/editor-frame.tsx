/**
 * The inline frame every predicate editor sits in when the builder is open on the page
 * rather than in a sheet — a heading, the attribute's own controls, and a bottom action
 * row that spans the card: a compact red trash pill to remove (only when editing an
 * existing chip) and the commit pill filling the rest, both the same height. The commit
 * pill is dark ink, not forest, so it doesn't read as one more selected option among
 * the forest-filled controls above it. Cancel is the card's own × in the corner.
 *
 * Same prop shape as the old `editor-sheet.tsx` it replaced, so the per-attribute
 * editors in `predicate-editors.tsx` didn't have to change — only the wrapper. No
 * `Modal` and no `KeyboardAvoidingView`: the host `Screen` already scrolls and lifts
 * for the keyboard, and this now renders inside the builder's card.
 */

import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Eyebrow, Meta } from "@/components/text";
import { accent, ink, paper } from "@/theme";

export function EditorFrame({
  title,
  hint,
  commitLabel,
  commitDisabled,
  onCommit,
  onRemove,
  children,
}: {
  title: string;
  hint?: string;
  commitLabel: string;
  commitDisabled?: boolean;
  onCommit: () => void;
  /** Present only when editing an existing chip. */
  onRemove?: () => void;
  /** Kept for the editors that forward it; cancel is the card's corner ×. */
  onClose?: () => void;
  children: ReactNode;
}) {
  return (
    <View className="gap-4">
      <View className="gap-1">
        <Eyebrow style={{ fontSize: 12.5 }}>{title}</Eyebrow>
        {hint ? <Meta style={{ fontSize: 14 }}>{hint}</Meta> : null}
      </View>

      <View className="gap-4">{children}</View>

      <View className="flex-row items-center gap-3 pt-1">
        {onRemove ? (
          <Pressable
            onPress={onRemove}
            accessibilityRole="button"
            accessibilityLabel="Remove this filter"
            className="h-13 w-16 items-center justify-center rounded-full active:opacity-80"
            style={{ backgroundColor: accent.rust }}
          >
            <TrashGlyph color={paper.card} />
          </Pressable>
        ) : null}

        <Pressable
          onPress={onCommit}
          disabled={commitDisabled}
          accessibilityRole="button"
          accessibilityState={{ disabled: !!commitDisabled }}
          className="h-13 flex-1 flex-row items-center justify-center rounded-full px-5 active:opacity-90"
          style={{
            backgroundColor: ink.primary,
            opacity: commitDisabled ? 0.4 : 1,
          }}
        >
          <Text className="type-button text-card">{commitLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** A waste basket — drawn, per the no-icon-library rule. */
function TrashGlyph({ color, size = 15 }: { color: string; size?: number }) {
  const bodyW = size * 0.78;
  return (
    <View style={{ width: size, height: size, alignItems: "center" }}>
      {/* handle */}
      <View
        style={{
          width: size * 0.42,
          height: size * 0.18,
          borderWidth: 1.5,
          borderBottomWidth: 0,
          borderColor: color,
          borderTopLeftRadius: 2,
          borderTopRightRadius: 2,
        }}
      />
      {/* lid */}
      <View
        style={{
          width: size,
          height: 1.5,
          marginTop: 1,
          borderRadius: 1,
          backgroundColor: color,
        }}
      />
      {/* can */}
      <View
        style={{
          width: bodyW,
          flex: 1,
          marginTop: 1.5,
          borderWidth: 1.5,
          borderTopWidth: 0,
          borderColor: color,
          borderBottomLeftRadius: 2,
          borderBottomRightRadius: 2,
        }}
      />
    </View>
  );
}
