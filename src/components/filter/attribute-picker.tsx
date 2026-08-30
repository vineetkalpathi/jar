/**
 * The "pick an attribute" phase of the inline builder card — the whole catalogue as a
 * grid of outlined pills, grouped under quiet caps labels. The inline replacement for
 * the old `add-filter-sheet.tsx`.
 *
 * A single-value attribute already represented by a chip renders greyed with an
 * "Added" note; tapping it still routes through `onPick`, so it doubles as "edit that
 * one". The list attributes (cast, director, tag, rating) never grey out.
 *
 * Cancel is the card's corner ×, so there's no dismiss control in here.
 */

import { Pressable, Text, View } from "react-native";
import { ink, paper } from "@/theme";
import { ATTRIBUTES, GROUP_ORDER, type AttrKey } from "@/lib/filter/catalogue";
import { ChipWrap } from "./section";

export function AttributePicker({
  present,
  onPick,
}: {
  /** Attribute keys already represented by a chip — only matters for single-value ones. */
  present: Set<AttrKey>;
  onPick: (key: AttrKey) => void;
}) {
  return (
    <View className="gap-4">
      {GROUP_ORDER.map((group) => {
        const entries = ATTRIBUTES.filter((a) => a.group === group);
        if (entries.length === 0) return null;
        return (
          <View key={group} className="gap-2">
            <Text className="type-eyebrow text-ink-faint" style={{ fontSize: 12 }}>
              {group}
            </Text>
            <ChipWrap>
              {entries.map((entry) => {
                const added = !entry.multi && present.has(entry.key);
                return (
                  <Pressable
                    key={entry.key}
                    onPress={() => onPick(entry.key)}
                    accessibilityRole="button"
                    className="rounded-full border px-3.5 py-1.5 active:opacity-70"
                    style={{ borderColor: paper.border, backgroundColor: "transparent" }}
                  >
                    <Text
                      className="type-meta"
                      style={{ color: added ? ink.faint : ink.secondary }}
                    >
                      {entry.label}
                      {added ? "  · added" : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </ChipWrap>
          </View>
        );
      })}
    </View>
  );
}
