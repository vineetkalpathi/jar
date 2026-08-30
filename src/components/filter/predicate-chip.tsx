/**
 * One saved predicate, collapsed: a full-width rounded-rect row whose labelled segments
 * read as a sentence, a tap target over the whole thing to re-open its editor, a faint
 * caret marking it as editable, and a trailing × to drop it. Segments are styled by
 * role — the attribute in tracked caps, the operator muted, the value in forest, joins
 * and notes quiet.
 */

import { Pressable, Text, View } from "react-native";
import { accent, ink, paper } from "@/theme";
import type { Chip, ChipSegment } from "@/lib/filter/chips";

const SEGMENT_STYLE: Record<
  ChipSegment["kind"],
  { className: string; style: { color: string; fontSize?: number } }
> = {
  attr: { className: "type-eyebrow", style: { color: ink.muted, fontSize: 13.5 } },
  op: { className: "type-meta", style: { color: ink.secondary, fontSize: 15.5 } },
  value: { className: "type-meta", style: { color: accent.forest, fontSize: 15.5 } },
  join: { className: "type-meta", style: { color: ink.muted, fontSize: 15.5 } },
  note: { className: "type-meta", style: { color: ink.faint, fontSize: 15.5 } },
};

export function PredicateChip({
  chip,
  editable,
  onEdit,
  onRemove,
}: {
  chip: Chip;
  editable: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <View
      className="w-full flex-row items-center gap-2 rounded-full border border-hairline px-4 py-3"
      style={{ backgroundColor: paper.card }}
    >
      <Pressable
        onPress={editable ? onEdit : undefined}
        disabled={!editable}
        accessibilityRole={editable ? "button" : "text"}
        accessibilityLabel={chip.segments.map((s) => s.text).join(" ")}
        className="flex-1 flex-row flex-wrap items-center gap-x-1.5 gap-y-0.5 active:opacity-60"
      >
        {chip.segments.map((seg, i) => {
          const s = SEGMENT_STYLE[seg.kind];
          return (
            <Text key={i} className={s.className} style={s.style}>
              {seg.text}
            </Text>
          );
        })}
      </Pressable>

      {editable ? <EditCaret /> : null}

      <Pressable
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel="Remove filter"
        hitSlop={8}
        className="active:opacity-50"
      >
        <Text style={{ color: ink.muted, fontSize: 18, lineHeight: 18 }}>×</Text>
      </Pressable>
    </View>
  );
}

/** A faint chevron — "tap to edit". Drawn, per the no-icon-library rule. */
function EditCaret() {
  return (
    <View
      style={{
        width: 7,
        height: 7,
        borderRightWidth: 1.5,
        borderTopWidth: 1.5,
        borderColor: ink.faint,
        transform: [{ rotate: "45deg" }],
      }}
    />
  );
}
