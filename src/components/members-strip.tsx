/**
 * MembersStrip — a household's people as a horizontal row of circular initial
 * avatars with names, trailed by a dashed "＋ Invite" that opens the hub. Shared by
 * the Household tab and the Household settings hub so the two read the same.
 *
 * `showInvite` is off on the settings screen, where an invite-code block sits right
 * below and the "＋" would only route back to the same page.
 */

import { useQuery } from "@powersync/react";
import { router } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { households } from "@/lib/db";
import { font, ink } from "@/theme";

export function MembersStrip({
  householdId,
  showInvite = true,
}: {
  householdId: string;
  showInvite?: boolean;
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

      {showInvite ? (
        <Pressable
          onPress={() => router.push("/household-settings")}
          accessibilityRole="link"
          accessibilityLabel="Invite a member"
          className="w-16 items-center gap-1.5 active:opacity-60"
        >
          <View
            className="items-center justify-center rounded-full border-dashed-hairline"
            style={{ width: 52, height: 52 }}
          >
            <Text className="type-title-large text-ink-faint">＋</Text>
          </View>
          <Text numberOfLines={1} className="type-meta-small text-ink-muted">
            Invite
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
