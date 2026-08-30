/**
 * The "N titles match right now" readout that sits under the builder — the design mock's
 * `--jar` bar. Recomputes live as the draft changes (`useFilterMatchCount`).
 *
 * `compact` is the footer form: no card, one line, sized to share a row with the
 * screen's action button rather than stack above it.
 */

import { Text, View } from "react-native";
import { accent, font, ink } from "@/theme";

export function MatchBar({
  count,
  pending,
  compact = false,
}: {
  count: number | null;
  pending: boolean;
  compact?: boolean;
}) {
  const shown = count == null ? (pending ? "…" : "—") : String(count);
  const label =
    count == null
      ? "couldn't count these"
      : count === 1
        ? compact
          ? "title matches"
          : "title matches right now"
        : compact
          ? "titles match"
          : "titles match right now";

  if (compact) {
    return (
      <View
        className="flex-1 flex-row items-baseline gap-1.5"
        accessibilityLabel={`${shown} ${label}`}
      >
        <Text
          style={{
            fontFamily: font.displaySemi,
            fontSize: 26,
            lineHeight: 28,
            color: accent.forest,
          }}
        >
          {shown}
        </Text>
        <Text
          className="type-meta"
          style={{ color: ink.secondary }}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
    );
  }

  return (
    <View
      className="flex-row items-baseline justify-between rounded-card border border-hairline bg-chip px-4 py-3.5"
      accessibilityLabel={`${shown} ${label}`}
    >
      <Text style={{ fontFamily: font.display, fontSize: 30, lineHeight: 32, color: accent.forest }}>
        {shown}
      </Text>
      <Text className="type-meta" style={{ color: ink.secondary }}>
        {label}
      </Text>
    </View>
  );
}
