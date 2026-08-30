import { Tappable } from "@/components/button";
import { Field } from "@/components/field";
import { TAB_BAR_CLEARANCE } from "@/components/floating-tab-bar";
import { Poster } from "@/components/poster";
import { Screen } from "@/components/screen";
import {
  Body,
  Eyebrow,
  EyebrowWide,
  Meta,
  ScreenTitle,
  TitleName,
} from "@/components/text";
import { useUserId } from "@/lib/auth/session";
import { annotations, library, type TagRow } from "@/lib/db";
import type { LibraryEntryView } from "@/lib/db/repositories/library";
import { useHousehold } from "@/lib/household/active";
import { posterUrl } from "@/lib/tmdb";
import { backfillPosterPath } from "@/lib/tmdb/import";
import { accent, font } from "@/theme";
import { usePowerSync, useQuery } from "@powersync/react";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";

/**
 * Titles whose missing poster has already been chased this session — so a row that
 * TMDB has no poster for, or one still in flight, isn't re-fetched on every re-render
 * or FlatList recycle.
 */
const posterBackfillAttempted = new Set<string>();

/**
 * Library — the left tab. Everything the Household has deliberately added, with the
 * facts a list needs derived per row: what it is, how the Household has tagged it, and
 * whether this User has seen it.
 *
 * This is the browse view. The Log (reverse-chronological Viewings, per the design
 * brief) is a second face of the same tab and gets its own pass — nothing here needs
 * changing when it lands.
 */
export default function Library() {
  const household = useHousehold();
  const userId = useUserId();
  const { data } = useQuery<LibraryEntryView>(library.LIBRARY_FOR_HOUSEHOLD, [
    userId,
    household.id,
  ]);

  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data;
    return data.filter((row) => row.name?.toLowerCase().includes(q));
  }, [data, query]);

  return (
    <Screen gutter="grid">
      <View className="gap-1 pb-4 pt-2">
        <Eyebrow>{household.name}</Eyebrow>
        <ScreenTitle>Library</ScreenTitle>
        <View className="flex-row items-center justify-between">
          <Meta>
            {data.length === 0
              ? "Nothing added yet"
              : `${data.length} ${data.length === 1 ? "title" : "titles"}`}
          </Meta>
          <Pressable
            onPress={() => router.navigate("/explore")}
            accessibilityRole="button"
            accessibilityLabel="Add a title"
            style={{ borderWidth: 1.5 }}
            className="items-center justify-center rounded-full border-forest px-5 py-1 active:opacity-70"
          >
            <Text style={{ fontFamily: font.uiBold, fontSize: 20, lineHeight: 24, color: accent.forest }}>
              +
            </Text>
          </Pressable>
        </View>
      </View>

      <Field
        label="Search library"
        value={query}
        onChangeText={setQuery}
        placeholder="Filter by title…"
        autoCorrect={false}
        returnKeyType="search"
      />

      <FlatList
        data={rows}
        keyExtractor={(row) => row.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: 16,
          paddingBottom: TAB_BAR_CLEARANCE,
        }}
        ItemSeparatorComponent={() => <View className="h-px bg-hairline" />}
        ListEmptyComponent={
          <ListEmpty query={query} hasLibrary={data.length > 0} />
        }
        renderItem={({ item }) => (
          <LibraryRow row={item} householdId={household.id} />
        )}
      />
    </Screen>
  );
}

/** Split out so each row owns its own Tags query, the pattern used everywhere else. */
function LibraryRow({
  row,
  householdId,
}: {
  row: LibraryEntryView;
  householdId: string;
}) {
  const db = usePowerSync();
  const { data: tags } = useQuery<TagRow>(annotations.TAGS_FOR_TITLE, [
    householdId,
    row.id,
  ]);

  const poster = posterUrl(row.poster_path, "w154");

  // Rows added before `poster_path` existed have none. Fetch it once, write it back,
  // and the LIBRARY_FOR_HOUSEHOLD query re-fires with the artwork in place — a
  // self-healing migration that costs one request per pre-existing title, ever.
  useEffect(() => {
    if (poster || !row.tmdb_id || !row.media_type) return;
    if (posterBackfillAttempted.has(row.id)) return;
    posterBackfillAttempted.add(row.id);
    backfillPosterPath(db, {
      id: row.id,
      tmdbId: row.tmdb_id,
      mediaType: row.media_type as "movie" | "tv",
    }).catch((cause) => {
      posterBackfillAttempted.delete(row.id);
      console.warn("[library] poster backfill failed for", row.id, cause);
    });
  }, [db, poster, row.id, row.tmdb_id, row.media_type]);

  const meta = [
    row.release_year,
    row.runtime ? `${row.runtime} min` : null,
    row.media_type === "tv"
      ? "TV series"
      : row.media_type === "movie"
        ? "Movie"
        : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const seen =
    row.watch_count > 0
      ? row.watch_count === 1
        ? "Seen"
        : `Seen ${row.watch_count}×`
      : "Not seen";

  // Root stays a plain `View` — a `Tappable` here wraps its children in `flex-1`, which
  // collapses to zero height inside a FlatList cell (title-row.tsx dodges the same way).
  return (
    <View className="flex-row items-center gap-3 py-3">
      <Tappable
        onPress={() => router.push(`/title/${row.id}`)}
        accessibilityLabel={`${row.name} details`}
        className="flex-1"
      >
        <View className="flex-row items-center gap-3">
          <Poster uri={poster} width={42} height={62} />
          <View className="flex-1 gap-0.5">
            <TitleName numberOfLines={1}>{row.name}</TitleName>
            {meta ? <Meta numberOfLines={1}>{meta}</Meta> : null}
            {tags.length > 0 ? (
              <View className="mt-1 flex-row flex-wrap gap-1">
                {tags.slice(0, 4).map((tag) => (
                  <View
                    key={tag.id}
                    className="rounded-card border border-hairline px-1.5 py-0.5"
                  >
                    <Text className="type-meta-small text-ink-muted">
                      {tag.name}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </View>
      </Tappable>
      <EyebrowWide className="text-ink-faint">{seen}</EyebrowWide>
    </View>
  );
}

function ListEmpty({
  query,
  hasLibrary,
}: {
  query: string;
  hasLibrary: boolean;
}) {
  if (query.trim()) {
    return <Body className="pt-2">No titles matching "{query.trim()}".</Body>;
  }
  if (hasLibrary) return null;
  return (
    <Body className="pt-2">
      Your Household's shelf. Add titles from Explore and they turn up here —
      tagged, rated, and ready for a jar's filter to pick them up.
    </Body>
  );
}
