/**
 * MembersStrip — a household's people as a horizontal row of circular initial
 * avatars with names, optionally trailed by a dashed "＋ Add" chip.
 *
 * Lives in the Household settings hub. Pass `onAdd` to show the add-member chip (the
 * hub wires it to the invite flow); without it the strip is roster-only.
 */

import { useQuery } from "@powersync/react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { households } from "@/lib/db";
import { font, ink } from "@/theme";

export function MembersStrip({
  householdId,
  onAdd,
}: {
  householdId: string;
  /** When set, a trailing dashed "＋ Add" chip that calls this. */
  onAdd?: () => void;
}) {
  const { data: members } = useQuery<{ id: string; display_name: string }>(
    households.MEMBERS_OF_HOUSEHOLD,
    [householdId],
  );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 16, paddingVertical: 2 }}
    >
      {members.map((m) => (
        <View key={m.id} className="w-16 items-center gap-1.5">
          <View
            className="items-center justify-center rounded-full bg-chip"
            style={{ width: 52, height: 52 }}
          >
            <Text style={{ fontFamily: font.uiBold, fontSize: 18, color: ink.secondary }}>
              {initial(m.display_name)}
            </Text>
          </View>
          <Text numberOfLines={1} className="type-meta-small text-ink-muted">
            {m.display_name}
          </Text>
        </View>
      ))}

      {onAdd ? (
        <Pressable
          onPress={onAdd}
          accessibilityRole="button"
          accessibilityLabel="Add a member"
          className="w-16 items-center gap-1.5 active:opacity-60"
        >
          <View
            className="items-center justify-center rounded-full border-dashed-hairline"
            style={{ width: 52, height: 52 }}
          >
            <Text className="type-title-large text-ink-faint">＋</Text>
          </View>
          <Text numberOfLines={1} className="type-meta-small text-ink-muted">
            Add
          </Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

/** First initial of a display name. */
function initial(name: string): string {
  const first = name.trim()[0];
  return first ? first.toUpperCase() : "?";
}
