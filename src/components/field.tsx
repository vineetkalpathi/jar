/**
 * A labelled text field.
 *
 * Underline rather than a box: a filled input on paper reads as a form, and the design
 * language wants edges, not containers. The label sits above in tracked caps, which is
 * one of the two places the eyebrow style is allowed.
 */

import { forwardRef } from "react";
import { Text, TextInput, View, type TextInputProps } from "react-native";
import { ink } from "@/theme";

type Props = Omit<TextInputProps, "className"> & {
  label: string;
  /** Shown beneath in rust. Also marks the underline. */
  error?: string;
  /** Shown beneath in muted ink when there is no error. */
  hint?: string;
};

export const Field = forwardRef<TextInput, Props>(function Field(
  { label, error, hint, ...props },
  ref,
) {
  return (
    <View className="gap-1.5">
      <Text className="type-eyebrow text-ink-muted">{label}</Text>

      <TextInput
        ref={ref}
        placeholderTextColor={ink.faint}
        // Warm, not the platform blue — the amber is reserved and the forest is the
        // one accent that means "active" outside the draw.
        selectionColor={ink.secondary}
        className={`
          type-body pb-2 text-ink border-b
          ${error ? "border-rust" : "border-hairline"}
        `}
        {...props}
      />

      {error ? (
        <Text className="type-meta-small text-rust">{error}</Text>
      ) : hint ? (
        <Text className="type-meta-small text-ink-muted">{hint}</Text>
      ) : null}
    </View>
  );
});
