/**
 * A segmented control — a hairline-bordered row of mutually exclusive options, the
 * selected one filled forest. The paper counterpart to the dark `ModeToggle` on the
 * Title screen.
 *
 * Lifted out of `household-settings.tsx`, where it started as a private helper for the
 * Rating Policy controls. The filter builder leans on it heavily, so it lives here now.
 */

import { Pressable, Text, View } from "react-native";
import { accent, ink, paper } from "@/theme";

export type SegmentedOption<T extends string> = { value: T; label: string };

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  /** Fill the width, splitting it evenly, rather than sizing to content. */
  stretch = false,
  /** Let the options wrap to a second line instead of overflowing. */
  wrap = false,
}: {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  stretch?: boolean;
  wrap?: boolean;
}) {
  return (
    <View
      className={`flex-row overflow-hidden rounded-card border border-hairline ${
        stretch ? "" : "self-start"
      } ${wrap ? "flex-wrap" : ""}`}
    >
      {options.map((option, i) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className={`px-3.5 py-1.5 active:opacity-70 ${
              i > 0 ? "border-l border-hairline" : ""
            } ${stretch ? "flex-1 items-center" : ""}`}
            style={{ backgroundColor: active ? accent.forest : "transparent" }}
          >
            <Text
              className="type-meta-small"
              style={{ color: active ? paper.card : ink.muted }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
