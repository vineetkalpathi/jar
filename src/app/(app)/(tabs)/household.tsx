import { Tappable } from "@/components/button";
import { TAB_BAR_CLEARANCE } from "@/components/floating-tab-bar";
import { Poster } from "@/components/poster";
import { Screen } from "@/components/screen";
import { SearchField } from "@/components/search-field";
import { Tag, TagList, TagStrip } from "@/components/tag";
import { TagPicker } from "@/components/tag-picker";
import { Body, Eyebrow, EyebrowWide, Meta, ScreenTitle, TitleName } from "@/components/text";
import { useUserId } from "@/lib/auth/session";
import { annotations, households, library, type TagRow } from "@/lib/db";
import type { LibraryEntryView } from "@/lib/db/repositories/library";
import { useHousehold } from "@/lib/household/active";
import { posterUrl } from "@/lib/tmdb";
import { backfillPosterPath } from "@/lib/tmdb/import";
import { accent, font, ink, paper } from "@/theme";
import { usePowerSync, useQuery } from "@powersync/react";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, ScrollView, Text, View } from "react-native";

/**
 * Titles whose missing poster has already been chased this session — so a row that
 * TMDB has no poster for, or one still in flight, isn't re-fetched on every re-render
 * or FlatList recycle.
 */
const posterBackfillAttempted = new Set<string>();

/**
 * Household — the left tab, and the watch group's first-class home. The page stacks a
 * few household-wide sections — Members, and placeholders for the Log and Tags — above
 * the Library browse view, so the shelf stays one scroll away; the household name is
 * the page identity and the gear opens the hub (`household-settings.tsx`).
 *
 * The sections above Library scroll with the list — they ride in `ListHeaderComponent`
 * so the carousel and placeholders don't eat fixed vertical space.
 */
export default function Household() {
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

  const count =
    data.length === 0
      ? "Nothing added yet"
      : `${data.length} ${data.length === 1 ? "title" : "titles"}`;

  return (
    <Screen gutter="grid">
      <View className="flex-row items-start justify-between pb-4 pt-2">
        <ScreenTitle>{household.name}</ScreenTitle>
        <Pressable
          onPress={() => router.push("/household-settings")}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Household settings"
          className="pt-3 active:opacity-60"
        >
          <SettingsGlyph />
        </Pressable>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(row) => row.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 4, paddingBottom: TAB_BAR_CLEARANCE }}
        ItemSeparatorComponent={() => <View className="h-px bg-hairline" />}
        ListHeaderComponent={
          <View className="gap-8 pb-3">
            <MembersStrip householdId={household.id} />

            <PlaceholderSection title="Log" note="Recent viewings will land here." />
            <TagsSection householdId={household.id} />

            <View className="gap-2">
              <View className="flex-row items-baseline justify-between">
                <Eyebrow>Library</Eyebrow>
                <Meta>{count}</Meta>
              </View>
              <LibrarySearch
                value={query}
                onChangeText={setQuery}
                onAdd={() => router.navigate("/explore")}
              />
            </View>
          </View>
        }
        ListEmptyComponent={<ListEmpty query={query} hasLibrary={data.length > 0} />}
        renderItem={({ item }) => <LibraryRow row={item} householdId={household.id} />}
      />
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Household sections
// ---------------------------------------------------------------------------

/** Circular avatars with names, and a dashed "＋ Invite" that opens the hub. */
function MembersStrip({ householdId }: { householdId: string }) {
  const { data: members } = useQuery<{ id: string; display_name: string }>(
    households.MEMBERS_OF_HOUSEHOLD,
    [householdId],
  );

  return (
    <View className="gap-2">
      <Eyebrow>Members</Eyebrow>
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
                {initials(m.display_name)}
              </Text>
            </View>
            <Text numberOfLines={1} className="type-meta-small text-ink-muted">
              {m.display_name}
            </Text>
          </View>
        ))}

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
      </ScrollView>
    </View>
  );
}

/** Two initials from a display name — first + last, or the first two letters. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** A section that has a home on the page but no content yet. */
function PlaceholderSection({ title, note }: { title: string; note: string }) {
  return (
    <View className="gap-2">
      <Eyebrow>{title}</Eyebrow>
      <View className="rounded-card border-dashed-hairline px-4 py-5">
        <Text className="type-meta text-ink-faint">{note}</Text>
      </View>
    </View>
  );
}

/**
 * The Household's shared tag vocabulary. Each chip carries its title count and a `×`
 * that deletes the tag everywhere (confirmed — it pulls the label off every title).
 * "＋ New tag" opens the same picker the Title screen uses; existing tags show as
 * "Added", so the only live action from here is coining a new one.
 */
function TagsSection({ householdId }: { householdId: string }) {
  const db = usePowerSync();
  const { data: tags } = useQuery<TagRow & { title_count: number }>(
    annotations.TAGS_FOR_HOUSEHOLD,
    [householdId],
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  const remove = (tag: TagRow) => {
    Alert.alert(
      `Delete ${tag.name}?`,
      "It comes off every title that carries it. Ratings and viewings are untouched.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            void annotations
              .deleteTag(db, tag.id)
              .catch((cause) => console.warn("[tags] could not delete", cause)),
        },
      ],
    );
  };

  return (
    <View className="gap-2">
      <Eyebrow>Tags</Eyebrow>
      {tags.length === 0 ? (
        <View className="rounded-card border-dashed-hairline px-4 py-5">
          <Text className="type-meta text-ink-faint">
            The household's shared labels, once there are some.
          </Text>
        </View>
      ) : (
        <TagList>
          {tags.map((tag) => (
            <Tag key={tag.id} label={tag.name ?? ""} onRemove={() => remove(tag)} />
          ))}
        </TagList>
      )}
      <Pressable
        onPress={() => setPickerOpen(true)}
        accessibilityRole="button"
        className="mt-1 self-start py-1 active:opacity-60"
      >
        <Text className="type-body text-forest">＋ New tag</Text>
      </Pressable>

      <TagPicker
        visible={pickerOpen}
        householdId={householdId}
        activeIds={tags.map((t) => t.id)}
        heading="New tag"
        note="Type a label the household will share across titles."
        onClose={() => setPickerOpen(false)}
        onPick={() => {}}
      />
    </View>
  );
}

/** Search over the Library and the "add a title" affordance, as one row. */
function LibrarySearch({
  value,
  onChangeText,
  onAdd,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onAdd: () => void;
}) {
  return (
    <View className="flex-row items-center gap-2">
      <View className="flex-1">
        <SearchField
          value={value}
          onChangeText={onChangeText}
          placeholder="Search library"
          accessibilityLabel="Search library"
        />
      </View>
      <Pressable
        onPress={onAdd}
        accessibilityRole="button"
        accessibilityLabel="Add a title"
        style={{ width: 44, height: 44, borderWidth: 1.5 }}
        className="items-center justify-center rounded-full border-forest active:opacity-70"
      >
        <Text
          style={{ fontFamily: font.uiBold, fontSize: 22, lineHeight: 24, color: accent.forest }}
        >
          +
        </Text>
      </Pressable>
    </View>
  );
}

/** A sliders mark — "adjust this household". Drawn, per the no-icon-library rule. */
function SettingsGlyph({ color = ink.muted }: { color?: string }) {
  return (
    <View style={{ width: 22, height: 16, justifyContent: "space-between", paddingVertical: 2 }}>
      {[13, 6].map((knobX, i) => (
        <View key={i} style={{ height: 1.5, borderRadius: 1, backgroundColor: color }}>
          <View
            style={{
              position: "absolute",
              top: -3.25,
              left: knobX,
              width: 8,
              height: 8,
              borderRadius: 4,
              borderWidth: 1.5,
              borderColor: color,
              backgroundColor: paper.bg,
            }}
          />
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Library list
// ---------------------------------------------------------------------------

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
              <View className="mt-1">
                <TagStrip tags={tags} />
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
