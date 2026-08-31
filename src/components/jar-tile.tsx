/**
 * A jar, drawn rather than boxed.
 *
 * Outline only — 1.5px strokes, transparent body, no fill and no shadow. The design
 * language is explicit that this is a line drawing of an object, not a card, and that a
 * taped-on paper label is what makes it read as craft-fair. The label sits *on* the
 * glass, in the upper half.
 *
 * Two things survive replacing this with a hand-drawn SVG, and both are load-bearing:
 * the 1.5px stroke, and leaving the top ~45% of the body clear for the name. Fill
 * level, label position and tap target all keep working around a different outline.
 */

import { Pressable, Text, View } from "react-native";
import { EyebrowWide } from "./text";
import { border, jar as jarTokens, paper, radius } from "@/theme";

/**
 * The slip count a jar is considered full at.
 *
 * The fill is scaled against a constant rather than against the largest jar in the
 * household, so a jar's level means the same thing tomorrow — relative scaling would
 * make one jar appear to drain because a different one grew.
 */
const FULL_AT = 40;

/** Never quite empty and never quite full: the glass should still read as glass. */
function fillPercent(count: number): number {
  return Math.min(0.88, 0.06 + (count / FULL_AT) * 0.82) * 100;
}

export function JarTile({
  name,
  count,
  onPress,
}: {
  name: string;
  /** Slips in the jar — its contents. Null while the count is still resolving. */
  count: number | null;
  onPress: () => void;
}) {
  return (
    // A plain Pressable, not `Tappable` — that wraps its child in a `flex-1` View, which
    // collapses to zero height inside a FlatList grid cell and makes the rows overlap.
    // The fixed-height child below is what gives the cell its height.
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${count ?? 0} ${count === 1 ? "slip" : "slips"}`}
      onPress={onPress}
      className="flex-1 active:opacity-70"
    >
      <View style={{ height: jarTokens.tileHeight }} className="items-center">
        {/* Rim — a bare rule, wider than the neck it sits on. */}
        <View
          style={{
            width: `${jarTokens.rimWidthPct}%`,
            height: border.jar,
            backgroundColor: paper.rim,
          }}
        />

        {/* Neck — sides only, so the rim reads as sitting above an opening. */}
        <View
          style={{
            width: `${jarTokens.neckWidthPct}%`,
            height: jarTokens.neckHeight,
            borderLeftWidth: border.jar,
            borderRightWidth: border.jar,
            borderColor: paper.rim,
          }}
        />

        {/* Body — transparent, so the paper shows through the glass. */}
        <View
          style={{
            width: `${jarTokens.bodyWidthPct}%`,
            borderWidth: border.jar,
            borderColor: paper.rim,
            borderTopLeftRadius: radius.jar.topLeft,
            borderTopRightRadius: radius.jar.topRight,
            borderBottomLeftRadius: radius.jar.bottomLeft,
            borderBottomRightRadius: radius.jar.bottomRight,
          }}
          className="flex-1 overflow-hidden"
        >
          {/* Contents. The height is the fill level, and it is real data. */}
          {count ? (
            <View
              style={{
                height: `${fillPercent(count)}%`,
                backgroundColor: jarTokens.fill.background,
                borderTopWidth: border.jar,
                borderTopColor: jarTokens.fill.topEdge,
              }}
              className="absolute bottom-0 left-0 right-0"
            />
          ) : null}

          {/* Label — on the glass, in the clear upper half. */}
          <View
            style={{ top: jarTokens.labelTop }}
            className="absolute left-0 right-0 items-center gap-1 px-2"
          >
            {/* Two lines at most; a third would run down into the fill. */}
            <Text numberOfLines={2} className="type-jar-name text-center text-ink">
              {name}
            </Text>
            <EyebrowWide className="text-ink-faint">
              {count === null ? "…" : `${count} ${count === 1 ? "slip" : "slips"}`}
            </EyebrowWide>
          </View>
        </View>
      </View>
    </Pressable>
  );
}
