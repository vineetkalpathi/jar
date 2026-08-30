import { Button, Tappable } from "@/components/button";
import { Field } from "@/components/field";
import { FilterBuilder } from "@/components/filter/filter-builder";
import { MatchBar } from "@/components/filter/match-bar";
import { TAB_BAR_CLEARANCE } from "@/components/floating-tab-bar";
import { MembersStrip } from "@/components/members-strip";
import { Poster } from "@/components/poster";
import { Screen } from "@/components/screen";
import { SearchField } from "@/components/search-field";
import { SeenStatus } from "@/components/seen-status";
import { AddTag, Tag, TagList, TagStrip } from "@/components/tag";
import { TagPicker } from "@/components/tag-picker";
import { Body, Eyebrow, LayerTitle, Meta, ScreenTitle, TitleName } from "@/components/text";
import { useUserId } from "@/lib/auth/session";
import { annotations, jars, library, type TagRow } from "@/lib/db";
import type { LibraryEntryView } from "@/lib/db/repositories/library";
import {
  draftToPreviewFilter,
  emptyDraft,
  isEmptyDraft,
  type FilterDraft,
} from "@/lib/filter";
import { resolveDraftFilter } from "@/lib/filter/resolve";
import { useFilterMatches } from "@/lib/filter/use-match-count";
import { useHousehold } from "@/lib/household/active";
import { posterUrl } from "@/lib/tmdb";
import { backfillPosterPath } from "@/lib/tmdb/import";
import { accent, font, ink, paper } from "@/theme";
import { usePowerSync, useQuery } from "@powersync/react";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";

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
  const db = usePowerSync();
  const household = useHousehold();
  const userId = useUserId();
  const { data } = useQuery<LibraryEntryView>(library.LIBRARY_FOR_HOUSEHOLD, [
    userId,
    household.id,
  ]);

  const [query, setQuery] = useState("");

  // Tapping the search field pulls the Library section up under the keyboard so the
  // results stay in view while typing — the sections above it (Members, Log, Tags)
  // scroll away. `searchY` is the section's offset in the list, caught on layout.
  const listRef = useRef<FlatList<LibraryEntryView>>(null);
  const searchY = useRef(0);
  const focusSearch = () =>
    listRef.current?.scrollToOffset({ offset: searchY.current + 4, animated: true });

  // Library search reaches the same "title or person" way Explore's does — but over the
  // local Library, not TMDB. The match runs in SQLite (title name OR any credited
  // person, cast or crew); this query hands back just the matching ids, and the row
  // data still comes from the always-live `LIBRARY_FOR_HOUSEHOLD` above. Wildcards
  // escaped so a title with a literal % or _ still matches itself.
  const needle = query.trim();
  const { data: matches } = useQuery<{ id: string }>(library.LIBRARY_TITLE_IDS_MATCHING, [
    household.id,
    `%${needle.replace(/[\\%_]/g, "\\$&")}%`,
  ]);

  // An optional ad-hoc filter over the shelf. Ephemeral — nothing is stored until
  // "Save as jar" turns it into a real Jar. People chips are dropped from the preview
  // (`draftToPreviewFilter`); the save path resolves them properly.
  const [filterDraft, setFilterDraft] = useState<FilterDraft | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [savingJar, setSavingJar] = useState(false);
  const filterActive = filterDraft != null && !isEmptyDraft(filterDraft);
  const appliedFilter = useMemo(
    () => (filterActive ? draftToPreviewFilter(filterDraft!, userId) : null),
    [filterActive, filterDraft, userId],
  );
  const { ids: filterIds } = useFilterMatches(
    household.id,
    filterActive ? appliedFilter : null,
  );

  const rows = useMemo(() => {
    let out = data;
    if (needle) {
      const ids = new Set(matches.map((m) => m.id));
      out = out.filter((row) => ids.has(row.id));
    }
    if (filterActive && filterIds) {
      out = out.filter((row) => filterIds.has(row.id));
    }
    return out;
  }, [data, matches, needle, filterActive, filterIds]);

  const count =
    data.length === 0
      ? "Nothing added yet"
      : filterActive && filterIds
        ? `${rows.length} of ${data.length}`
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
        ref={listRef}
        data={rows}
        keyExtractor={(row) => row.id}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: 4,
          paddingBottom: TAB_BAR_CLEARANCE,
        }}
        ItemSeparatorComponent={() => <View className="h-px bg-hairline" />}
        ListHeaderComponent={
          <View className="gap-8 pb-3">
            <View className="gap-2">
              <Eyebrow>Members</Eyebrow>
              <MembersStrip householdId={household.id} />
            </View>

            <PlaceholderSection
              title="Log"
              note="Recent viewings will land here."
            />
            <TagsSection householdId={household.id} />

            <View
              className="gap-2"
              onLayout={(e) => {
                searchY.current = e.nativeEvent.layout.y;
              }}
            >
              <View className="flex-row items-baseline justify-between">
                <Eyebrow>Library</Eyebrow>
                <Meta>{count}</Meta>
              </View>
              <LibrarySearch
                value={query}
                onChangeText={setQuery}
                onFocus={focusSearch}
                onAdd={() => router.navigate("/explore")}
                filterActive={filterActive}
                onFilter={() => {
                  setFilterDraft((d) => d ?? emptyDraft());
                  setFilterOpen(true);
                }}
              />
              {filterActive ? (
                <ActiveFilterBar
                  onClear={() => setFilterDraft(null)}
                  onSaveAsJar={() => setSavingJar(true)}
                />
              ) : null}
            </View>
          </View>
        }
        ListEmptyComponent={
          <ListEmpty query={query} hasLibrary={data.length > 0} />
        }
        renderItem={({ item }) => (
          <LibraryRow row={item} householdId={household.id} userId={userId} />
        )}
      />

      <LibraryFilterModal
        visible={filterOpen}
        householdId={household.id}
        draft={filterDraft ?? emptyDraft()}
        onChange={setFilterDraft}
        onClose={() => setFilterOpen(false)}
        onClear={() => {
          setFilterDraft(null);
          setFilterOpen(false);
        }}
      />

      <SaveAsJarModal
        visible={savingJar}
        onCancel={() => setSavingJar(false)}
        onSave={async (name) => {
          if (!filterDraft) return;
          try {
            const filter = await resolveDraftFilter(db, filterDraft, userId);
            const jarId = await jars.createJar(db, {
              householdId: household.id,
              name,
              filter,
            });
            setSavingJar(false);
            router.push(`/jar/${jarId}`);
          } catch {
            Alert.alert("Couldn't save", "That filter didn't save as a jar.");
          }
        }}
      />
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Library filter
// ---------------------------------------------------------------------------

/**
 * The strip below the search row while a Library filter is on — the match summary and
 * the two actions the filter button itself doesn't cover. Tapping the button re-opens
 * the builder, so there's no "Edit" here.
 */
function ActiveFilterBar({
  onClear,
  onSaveAsJar,
}: {
  onClear: () => void;
  onSaveAsJar: () => void;
}) {
  return (
    <View className="mt-1 flex-row items-center justify-between rounded-card border border-hairline bg-card px-3 py-2">
      <View className="flex-row items-center gap-1.5">
        <FunnelGlyph color={accent.forest} />
        <Text className="type-meta-small" style={{ color: accent.forest }}>
          Filtered
        </Text>
      </View>
      <View className="flex-row items-center gap-4">
        <Pressable onPress={onSaveAsJar} accessibilityRole="button" className="active:opacity-60">
          <Text className="type-meta-small text-navy">Save as jar</Text>
        </Pressable>
        <Pressable onPress={onClear} accessibilityRole="button" className="active:opacity-60">
          <Text className="type-meta-small text-rust">Clear</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** A funnel — drawn, per the no-icon-library rule. Sized to fit its container. */
function FunnelGlyph({ color = ink.muted, size = 13 }: { color?: string; size?: number }) {
  const half = size / 2;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: half,
          borderRightWidth: half,
          borderTopWidth: Math.round(size * 0.55),
          borderLeftColor: "transparent",
          borderRightColor: "transparent",
          borderTopColor: color,
        }}
      />
      <View style={{ width: 1.5, height: Math.round(size * 0.32), backgroundColor: color }} />
    </View>
  );
}

/** Full-screen builder over the Library, applied on close. */
function LibraryFilterModal({
  visible,
  householdId,
  draft,
  onChange,
  onClose,
  onClear,
}: {
  visible: boolean;
  householdId: string;
  draft: FilterDraft;
  onChange: (next: FilterDraft) => void;
  onClose: () => void;
  onClear: () => void;
}) {
  const userId = useUserId();
  const preview = useMemo(
    () => (isEmptyDraft(draft) ? null : draftToPreviewFilter(draft, userId)),
    [draft, userId],
  );
  const { count, pending } = useFilterMatches(householdId, preview);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <Screen scroll>
        <View className="gap-6 pb-16 pt-2">
          <View className="flex-row items-center justify-between">
            <LayerTitle>Filter library</LayerTitle>
            <Pressable onPress={onClose} accessibilityRole="button" hitSlop={10}>
              <Text className="type-body text-navy">Done</Text>
            </Pressable>
          </View>

          <FilterBuilder value={draft} onChange={onChange} householdId={householdId} />

          <View className="gap-3">
            <MatchBar count={count} pending={pending} />
            <Button label="Apply" onPress={onClose} />
            <Button label="Clear filter" variant="quiet" onPress={onClear} />
          </View>
        </View>
      </Screen>
    </Modal>
  );
}

/** A one-field name prompt for turning the Library filter into a Jar. */
function SaveAsJarModal({
  visible,
  onCancel,
  onSave,
}: {
  visible: boolean;
  onCancel: () => void;
  onSave: (name: string) => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    await onSave(trimmed);
    setBusy(false);
    setName("");
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable
        className="flex-1 items-center justify-center px-8"
        style={{ backgroundColor: "rgba(0,0,0,0.3)" }}
        onPress={onCancel}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="w-full"
        >
          <Pressable
            className="gap-4 rounded-sheet bg-paper p-6"
            onPress={() => {}}
          >
            <Eyebrow>Save as jar</Eyebrow>
            <Field
              label="Jar name"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoFocus
              returnKeyType="go"
              onSubmitEditing={submit}
            />
            <View className="gap-2">
              <Button label="Create jar" onPress={submit} loading={busy} disabled={!name.trim()} />
              <Button label="Cancel" variant="quiet" onPress={onCancel} />
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Household sections
// ---------------------------------------------------------------------------

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
        <Meta>The household's shared labels, once there are some.</Meta>
      ) : null}
      <TagList>
        {tags.map((tag) => (
          <Tag
            key={tag.id}
            label={tag.name ?? ""}
            onRemove={() => remove(tag)}
          />
        ))}
        <AddTag label="New tag" onPress={() => setPickerOpen(true)} />
      </TagList>

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

/** Search, filter, and "add a title" — one row of first-class controls. */
function LibrarySearch({
  value,
  onChangeText,
  onFocus,
  onAdd,
  onFilter,
  filterActive,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onFocus: () => void;
  onAdd: () => void;
  onFilter: () => void;
  filterActive: boolean;
}) {
  return (
    <View className="flex-row items-center gap-2">
      <View className="flex-1">
        <SearchField
          value={value}
          onChangeText={onChangeText}
          onFocus={onFocus}
          placeholder="Search by title or person"
          accessibilityLabel="Search library by title or person"
        />
      </View>

      {/* Filter — a toggle: hairline circle when off, filled forest when a filter is
          on. Tapping it opens the builder either way; "Clear" lives in the bar below. */}
      <Pressable
        onPress={onFilter}
        accessibilityRole="button"
        accessibilityLabel={filterActive ? "Edit library filter" : "Filter the library"}
        accessibilityState={{ selected: filterActive }}
        style={{
          width: 44,
          height: 44,
          backgroundColor: filterActive ? accent.forest : "transparent",
          borderWidth: filterActive ? 0 : 1,
          borderColor: paper.border,
        }}
        className="items-center justify-center rounded-full active:opacity-80"
      >
        <FunnelGlyph size={17} color={filterActive ? paper.card : ink.muted} />
      </Pressable>

      {/* Solid forest — a filled primary action, so it doesn't read as another
          of the round outlined "seen" toggles sitting in the rows just below. */}
      <Pressable
        onPress={onAdd}
        accessibilityRole="button"
        accessibilityLabel="Add a title"
        style={{ width: 44, height: 44, backgroundColor: accent.forest }}
        className="items-center justify-center rounded-full active:opacity-80"
      >
        <Text
          style={{
            fontFamily: font.uiBold,
            fontSize: 22,
            lineHeight: 24,
            color: paper.card,
          }}
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
    <View
      style={{
        width: 22,
        height: 16,
        justifyContent: "space-between",
        paddingVertical: 2,
      }}
    >
      {[13, 6].map((knobX, i) => (
        <View
          key={i}
          style={{ height: 1.5, borderRadius: 1, backgroundColor: color }}
        >
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
  userId,
}: {
  row: LibraryEntryView;
  householdId: string;
  userId: string;
}) {
  const db = usePowerSync();
  const { data: tags } = useQuery<TagRow>(annotations.TAGS_FOR_TITLE, [
    householdId,
    row.id,
  ]);
  const [marking, setMarking] = useState(false);

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

  const seen = row.watch_count > 0;

  // One-way from the list: tap the eye to log a Viewing (today). Un-marking and rough
  // dates live on the Title screen — the same split as add-to-library.
  const markSeen = async () => {
    setMarking(true);
    try {
      await annotations.recordViewing(db, { userId, titleId: row.id });
    } catch (cause) {
      console.warn("[library] could not mark seen", row.id, cause);
    } finally {
      setMarking(false);
    }
  };

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
      <SeenStatus
        seen={seen}
        busy={marking}
        onPress={seen ? undefined : markSeen}
        accessibilityLabel={
          seen
            ? row.watch_count === 1
              ? "Seen"
              : `Seen ${row.watch_count} times`
            : `Mark ${row.name} as seen`
        }
      />
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
