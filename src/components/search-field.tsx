/**
 * A pill search input — a fully-rounded filled field with a magnifier glyph. Distinct
 * from `Field` (the underline form input): this one is meant to read as a search box,
 * and is shared so every search on paper looks the same — the Household library search
 * and the Explore search both sit on it.
 *
 * Renders just the input pill. A caller that needs something beside it (the library
 * search puts an "add" button on the right) wraps this in its own flex row.
 */

import { forwardRef } from "react";
import { TextInput, View, type TextInputProps } from "react-native";
import { ink } from "@/theme";

type Props = Omit<TextInputProps, "className">;

export const SearchField = forwardRef<TextInput, Props>(function SearchField(props, ref) {
  return (
    <View
      className="flex-row items-center gap-2 rounded-full border border-hairline bg-card px-4"
      style={{ height: 44 }}
    >
      <SearchGlyph />
      <TextInput
        ref={ref}
        placeholderTextColor={ink.faint}
        // Warm, not the platform blue — matches `Field`.
        selectionColor={ink.secondary}
        autoCorrect={false}
        returnKeyType="search"
        className="type-body flex-1 p-0 text-ink"
        {...props}
      />
    </View>
  );
});

/** A magnifier — the same line drawing as the Explore tab icon, smaller. */
export function SearchGlyph({ color = ink.muted }: { color?: string }) {
  return (
    <View style={{ width: 16, height: 16 }}>
      <View
        style={{
          position: "absolute",
          top: 1,
          left: 1,
          width: 10,
          height: 10,
          borderRadius: 5,
          borderWidth: 1.5,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: "absolute",
          right: 1,
          bottom: 1,
          width: 6,
          height: 1.5,
          borderRadius: 1,
          backgroundColor: color,
          transform: [{ rotate: "45deg" }],
        }}
      />
    </View>
  );
}
