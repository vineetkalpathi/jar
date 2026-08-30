/**
 * The "N titles match right now" strip that sits under the builder — the design mock's
 * `--jar` bar. Recomputes live as the draft changes (`useFilterMatchCount`).
 */

import { Text, View } from "react-native";
import { accent, font, ink } from "@/theme";

export function MatchBar({
  count,
  pending,
}: {
  count: number | null;
  pending: boolean;
}) {
  const shown = count == null ? (pending ? "…" : "—") : String(count);
  const label =
    count == null
      ? "couldn't count these"
      : count === 1
        ? "title matches right now"
        : "titles match right now";

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
