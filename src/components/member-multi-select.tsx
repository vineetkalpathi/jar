/**
 * A checkable list of a Household's members, for the people-spanning filter leaves —
 * a rating rule's `raters`, a viewing rule's `population`.
 *
 * An empty selection is not "nobody" — the leaves treat an omitted list as the whole
 * Household (ADR-0009), and the sections translate `[]`/all-selected back to that.
 */

import { useQuery } from "@powersync/react";
import { Pressable, Text, View } from "react-native";
import { households } from "@/lib/db";
import { accent, ink, paper } from "@/theme";

export function MemberMultiSelect({
  householdId,
  selected,
  onChange,
}: {
  householdId: string;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const { data: members } = useQuery<{ id: string; display_name: string }>(
    households.MEMBERS_OF_HOUSEHOLD,
    [householdId],
  );

  const chosen = new Set(selected);
  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  return (
    <View className="flex-row flex-wrap gap-2">
      {members.map((m) => {
        const on = chosen.has(m.id);
        return (
          <Pressable
            key={m.id}
            onPress={() => toggle(m.id)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            className="flex-row items-center gap-1.5 rounded-full border px-3 py-1 active:opacity-70"
            style={{
              borderColor: on ? accent.forest : paper.border,
              backgroundColor: on ? accent.forest : "transparent",
            }}
          >
            <Text
              className="type-meta-small"
              style={{ color: on ? paper.card : ink.muted }}
            >
              {m.display_name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
