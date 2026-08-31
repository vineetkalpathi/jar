/**
 * A Household's aggregate score for one Title, as it reads in a list row.
 *
 * Deliberately bare — a numeral and nothing around it. It sits immediately left of the
 * round "seen" control in a library row, so anything circular or bordered here would
 * read as a second button; this is a fact about the title, not an action on it. Amber
 * because that is the app's rating colour and nothing else (`theme/tokens.ts`), and an
 * em dash in `ink.faint` when nobody has rated it yet.
 *
 * The score itself is computed in SQL — see `LIBRARY_FOR_HOUSEHOLD`.
 */

import { Text, View } from "react-native";
import { accent, font, ink } from "@/theme";

/** Wide enough for a "10.0", so the eye beside it stays on the same x in every row. */
const WIDTH = 36;

export function HouseholdScore({ value }: { value: number | null }) {
  const rated = value != null;
  return (
    <View
      style={{ width: WIDTH, alignItems: "flex-end" }}
      accessibilityLabel={
        rated
          ? `Household rating ${value.toFixed(1)} out of 10`
          : "No household rating yet"
      }
    >
      <Text
        style={{
          fontFamily: font.uiBold,
          fontSize: rated ? 19 : 17,
          lineHeight: 24,
          letterSpacing: 0.2,
          color: rated ? accent.amber : ink.faint,
        }}
      >
        {rated ? value.toFixed(1) : "—"}
      </Text>
    </View>
  );
}
