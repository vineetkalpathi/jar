import { Poster } from "@/components/poster";
import { Screen } from "@/components/screen";
import { Segmented } from "@/components/segmented";
import { Body, Eyebrow, Hand, LayerTitle, Meta } from "@/components/text";
import { useUserId } from "@/lib/auth/session";
import { annotations, households } from "@/lib/db";
import { useHousehold } from "@/lib/household/active";
import { formatWatchedOn } from "@/lib/time";
import { posterUrl } from "@/lib/tmdb";
import { accent } from "@/theme";
import { useQuery } from "@powersync/react";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";

type LogRow = {
  id: string;
  title_id: string;
  user_id: string;
  watched_on: string;
  watched_precision: "year" | "month" | "day" | null;
  created_at: string;
  title_name: string | null;
  poster_path: string | null;
  /** Present on the household scope only. */
  display_name?: string | null;
  /** Present on the personal scope only. */
  household_name?: string | null;
};

/**
 * Whose history is on screen. `household` is what the group watched — the social
 * artifact, several members folded into one night. `mine` is the personal diary that
 * spans every Household, which is only legible because each Viewing records where it
 * happened.
 */
type Scope = "household" | "mine";

const SCOPES: { value: Scope; label: string }[] = [
  { value: "household", label: "This household" },
  { value: "mine", label: "Mine, everywhere" },
];

/** One title on one date — the rows for a single sitting, folded together. */
type Night = {
  key: string;
  titleId: string;
  titleName: string;
  posterPath: string | null;
  watchedOn: string;
  precision: "year" | "month" | "day" | null;
  /** Who watched. Empty in the personal scope, where the viewer is always you. */
  watchers: string[];
  /** Where it happened. Set in the personal scope only, and null if that group is gone. */
  householdName: string | null;
};

/**
 * Log — viewing history, most recent on top. Pushed over the Household tab
 * (`(tabs)/household.tsx`), a sibling of the settings hub.
 *
 * Two scopes behind a toggle, because they are genuinely two different things:
 *
 *   - **This household** — what this group watched. A "night" is one Title on one date:
 *     several members marking the same film seen collapse into a single card whose
 *     watcher list names them all, and a card whose watchers cover the whole household
 *     carries an amber left edge. Includes people who have since left the group; they
 *     were there.
 *   - **Mine, everywhere** — your own history across every Household, each night
 *     labelled with the one it happened in. Includes Households you have left.
 *
 * The default is the household, because this screen is reached from that tab and the
 * group's history is what the name above it promises.
 */
export default function Log() {
  const household = useHousehold();
  const userId = useUserId();
  const [scope, setScope] = useState<Scope>("household");
  const mine = scope === "mine";

  const { data } = useQuery<LogRow>(
    mine ? annotations.VIEWINGS_FOR_USER : annotations.VIEWINGS_FOR_HOUSEHOLD,
    mine ? [userId] : [household.id],
  );
  const { data: members } = useQuery<{ id: string; display_name: string }>(
    households.MEMBERS_OF_HOUSEHOLD,
    [household.id],
  );

  // `data` already arrives newest-first, so first-seen key order is display order.
  //
  // The fold is per (title, date) in the household scope — that is what makes one
  // evening one card no matter how many people marked it. In the personal scope every
  // row is already yours, so the key carries the Household too: the same film on the
  // same day with two different groups is two occasions, not one.
  const nights = useMemo(() => {
    const out: Night[] = [];
    const byKey = new Map<string, Night>();
    for (const r of data) {
      const key = mine
        ? `${r.title_id}|${r.watched_on}|${r.household_name ?? ""}`
        : `${r.title_id}|${r.watched_on}`;
      let night = byKey.get(key);
      if (!night) {
        night = {
          key,
          titleId: r.title_id,
          // Null only in the window between recording a Viewing and its Title syncing
          // back. Naming that state beats dropping the row, which reads as data loss.
          titleName: r.title_name ?? "Untitled",
          posterPath: r.poster_path,
          watchedOn: r.watched_on,
          precision: r.watched_precision,
          watchers: [],
          householdName: mine ? (r.household_name ?? null) : null,
        };
        byKey.set(key, night);
        out.push(night);
      }
      // A member who left keeps their night; `app_user` is a left join, so the name can
      // be missing even though the Viewing is real.
      const watcher = r.display_name;
      if (watcher && !night.watchers.includes(watcher)) night.watchers.push(watcher);
    }
    return out;
  }, [data, mine]);

  /**
   * Whether a night's watchers cover the whole household — the amber edge.
   *
   * Containment, not a count. Now that the Log keeps nights by people who have left the
   * group (and, once Guests exist, by people who were never in it), a headcount can
   * reach the member total without every member actually being there.
   */
  const everyoneWasThere = useMemo(() => {
    const names = members.map((m) => m.display_name);
    return (watchers: string[]) => {
      if (names.length === 0) return false;
      const present = new Set(watchers);
      return names.every((name) => present.has(name));
    };
  }, [members]);

  return (
    <Screen gutter="form">
      <View className="flex-row items-center gap-3 pb-6 pt-2">
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text className="type-section-title text-ink-secondary">‹</Text>
        </Pressable>
        <LayerTitle>Log</LayerTitle>
      </View>

      <FlatList
        data={nights}
        keyExtractor={(night) => night.key}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 48 }}
        ItemSeparatorComponent={() => <View className="h-2.5" />}
        ListHeaderComponent={
          <View className="gap-3 pb-4">
            <View className="gap-1">
              <Eyebrow>{mine ? "Everywhere" : household.name}</Eyebrow>
              <Meta>
                {nights.length === 0
                  ? "Nothing watched yet"
                  : `${nights.length} ${nights.length === 1 ? "night" : "nights"}, most recent on top`}
              </Meta>
            </View>
            <Segmented value={scope} options={SCOPES} onChange={setScope} />
          </View>
        }
        ListEmptyComponent={
          <Body className="pt-2">
            {mine
              ? "Nothing yet. Mark a title seen in any household and the night lands here, labelled with where you watched it."
              : "Mark a title seen from the library and the night lands here — who watched, and when."}
          </Body>
        }
        renderItem={({ item }) => (
          <NightCard
            night={item}
            // Only meaningful for the group's own history: "everyone was there" is a
            // claim about this household, and a personal card has one watcher by
            // definition.
            everyone={!mine && everyoneWasThere(item.watchers)}
          />
        )}
      />
    </Screen>
  );
}

function NightCard({ night, everyone }: { night: Night; everyone: boolean }) {
  const poster = posterUrl(night.posterPath, "w154");
  // Who, in the group's history; where, in your own.
  const subtitle = night.householdName ?? night.watchers.join(", ");

  return (
    <Pressable
      onPress={() => router.push(`/title/${night.titleId}`)}
      accessibilityRole="button"
      accessibilityLabel={`${night.titleName}, watched ${formatWatchedOn(night.watchedOn, night.precision)}`}
      className="flex-row gap-3 overflow-hidden rounded-card border border-hairline bg-paper p-3 active:opacity-70"
    >
      {everyone ? (
        <View
          className="absolute bottom-3 left-0 top-3 w-0.5 rounded-full"
          style={{ backgroundColor: accent.amber }}
        />
      ) : null}
      <Poster uri={poster} width={40} height={58} />
      <View className="flex-1 gap-1">
        <Text className="type-eyebrow text-ink-faint">
          {formatWatchedOn(night.watchedOn, night.precision)}
        </Text>
        <Hand numberOfLines={1}>{night.titleName}</Hand>
        {subtitle ? <Meta numberOfLines={1}>{subtitle}</Meta> : null}
      </View>
    </Pressable>
  );
}
