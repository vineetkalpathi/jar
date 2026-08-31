import { Poster } from "@/components/poster";
import { Screen } from "@/components/screen";
import { Body, Eyebrow, Hand, LayerTitle, Meta } from "@/components/text";
import { annotations, households } from "@/lib/db";
import { useHousehold } from "@/lib/household/active";
import { formatWatchedOn } from "@/lib/time";
import { posterUrl } from "@/lib/tmdb";
import { accent } from "@/theme";
import { useQuery } from "@powersync/react";
import { router } from "expo-router";
import { useMemo } from "react";
import { FlatList, Pressable, Text, View } from "react-native";

type LogRow = {
  id: string;
  title_id: string;
  user_id: string;
  watched_on: string;
  watched_precision: "year" | "month" | "day" | null;
  created_at: string;
  title_name: string;
  poster_path: string | null;
  display_name: string;
};

/** One title on one date — the rows for a single sitting, folded together. */
type Night = {
  key: string;
  titleId: string;
  titleName: string;
  posterPath: string | null;
  watchedOn: string;
  precision: "year" | "month" | "day" | null;
  watchers: string[];
};

/**
 * Log — the household's viewing history, most recent on top. Pushed over the Household
 * tab (`(tabs)/household.tsx`), a sibling of the settings hub.
 *
 * A "night" is one Title watched on one date: several members marking the same film
 * seen collapse into a single card whose watcher list names them all. A card whose
 * watchers cover the whole household carries an amber left edge — everyone was there.
 */
export default function Log() {
  const household = useHousehold();
  const { data } = useQuery<LogRow>(annotations.VIEWINGS_FOR_HOUSEHOLD, [household.id]);
  const { data: members } = useQuery<{ id: string }>(households.MEMBERS_OF_HOUSEHOLD, [
    household.id,
  ]);

  // `data` already arrives newest-first, so first-seen key order is display order.
  const nights = useMemo(() => {
    const out: Night[] = [];
    const byKey = new Map<string, Night>();
    for (const r of data) {
      const key = `${r.title_id}|${r.watched_on}`;
      let night = byKey.get(key);
      if (!night) {
        night = {
          key,
          titleId: r.title_id,
          titleName: r.title_name,
          posterPath: r.poster_path,
          watchedOn: r.watched_on,
          precision: r.watched_precision,
          watchers: [],
        };
        byKey.set(key, night);
        out.push(night);
      }
      if (!night.watchers.includes(r.display_name)) night.watchers.push(r.display_name);
    }
    return out;
  }, [data]);

  const memberCount = members.length;

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
          <View className="gap-1 pb-4">
            <Eyebrow>{household.name}</Eyebrow>
            <Meta>
              {nights.length === 0
                ? "Nothing watched yet"
                : `${nights.length} ${nights.length === 1 ? "night" : "nights"}, most recent on top`}
            </Meta>
          </View>
        }
        ListEmptyComponent={
          <Body className="pt-2">
            Mark a title seen from the library and the night lands here — who watched,
            and when.
          </Body>
        }
        renderItem={({ item }) => (
          <NightCard
            night={item}
            everyone={memberCount > 0 && item.watchers.length >= memberCount}
          />
        )}
      />
    </Screen>
  );
}

function NightCard({ night, everyone }: { night: Night; everyone: boolean }) {
  const poster = posterUrl(night.posterPath, "w154");

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
        <Meta numberOfLines={1}>{night.watchers.join(", ")}</Meta>
      </View>
    </Pressable>
  );
}
