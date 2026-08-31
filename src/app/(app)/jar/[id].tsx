import { useQuery, usePowerSync } from "@powersync/react";
import { router, useLocalSearchParams } from "expo-router";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { BottomSheet } from "@/components/bottom-sheet";
import { Button } from "@/components/button";
import { DrawSetupSheet } from "@/components/draw-setup-sheet";
import { IconTablet } from "@/components/icon-tablet";
import { Loading } from "@/components/loading";
import { Poster } from "@/components/poster";
import { Screen } from "@/components/screen";
import { SearchField } from "@/components/search-field";
import { Body, Eyebrow, LayerTitle, Meta, TitleName } from "@/components/text";
import { useUserId } from "@/lib/auth/session";
import { jars, library, type JarRow, type TitleRow } from "@/lib/db";
import type { LibraryEntryView } from "@/lib/db/repositories/library";
import type { CompiledQuery } from "@/lib/filter";
import {
  getPersonCredits,
  posterUrl,
  searchPeople,
  searchTitles,
  type TmdbCredit,
  type TmdbMediaType,
  type TmdbSearchResult,
} from "@/lib/tmdb";
import { addTmdbTitleToLibrary } from "@/lib/tmdb/import";
import { useLibrarySearch } from "@/lib/library/use-library-search";
import { accent, font, ink, paper, radius } from "@/theme";

/** Poster grid gutter — matches the row gap so the grid reads as even. */
const GRID_GAP = 10;

/** Valid, cheap, returns nothing — what the search query sits on while the box is empty. */
const NO_MATCHES = "select null as id limit 0";
/** A stable empty params reference, so `useQuery` doesn't re-subscribe every render. */
const NO_PARAMS: never[] = [];

/**
 * A Jar and its slips — now a poster wall.
 *
 * The screen is three things stacked over the grid: the standing actions (edit filter,
 * pin a title, exclude a title) as a pill row, a search scoped to what is already in
 * the jar, and — off the header — a destructive "delete jar". Pins and Exclusions both
 * go through `jars.setOverride`; the contents query unions the Pins and subtracts the
 * Exclusions, so the grid reacts to either the moment the row lands.
 */
export default function JarDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = usePowerSync();
  const userId = useUserId();
  const { width } = useWindowDimensions();

  const { data: rows, isLoading } = useQuery<JarRow>(
    `select * from jar where id = ?`,
    [id],
  );
  const jar = rows[0];

  const [contents, setContents] = useState<CompiledQuery | null>(null);

  useEffect(() => {
    if (!jar) return;
    let active = true;
    jars
      .jarContentsQuery(db, jar.id)
      .then((query) => active && setContents(query))
      .catch((cause) =>
        console.warn(`[jars] could not read ${jar.id}:`, cause),
      );
    return () => {
      active = false;
    };
  }, [db, jar?.id, jar?.filter]);

  const { data: titles } = useQuery<TitleRow>(
    contents?.sql ?? "select null limit 0",
    contents?.params ?? [],
  );

  // Jar-scoped search: the same "title or person" reach as Explore and Library, but the
  // result set is intersected with what is already in the jar. Row data still comes from
  // the live contents query above. Debounced, and parked while the box is empty — see
  // `use-library-search.ts` for what the unguarded version cost.
  const [query, setQuery] = useState("");
  const { needle, idle, pattern } = useLibrarySearch(query);
  const { data: matches } = useQuery<{ id: string }>(
    idle ? NO_MATCHES : library.LIBRARY_TITLE_IDS_MATCHING,
    idle ? NO_PARAMS : [jar?.household_id ?? "", pattern],
  );

  const shown = useMemo(() => {
    if (!needle) return titles;
    const ids = new Set(matches.map((m) => m.id));
    return titles.filter((t) => ids.has(t.id));
  }, [titles, matches, needle]);

  const inJarIds = useMemo(() => new Set(titles.map((t) => t.id)), [titles]);
  const inJarTmdbIds = useMemo(
    () =>
      new Set(
        titles.map((t) => t.tmdb_id).filter((v): v is number => v != null),
      ),
    [titles],
  );

  // The jar's overrides, so the Add / Remove screens can label and route each row:
  // on Remove, a Pinned title's − unpins rather than excludes; on Add, an Excluded
  // title's + un-excludes rather than pinning.
  const { data: overrides } = useQuery<
    TitleRow & { kind: "pin" | "exclusion" }
  >(jars.OVERRIDES_FOR_JAR, [id]);
  const pinnedIds = useMemo(
    () => new Set(overrides.filter((o) => o.kind === "pin").map((o) => o.id)),
    [overrides],
  );
  const exclusions = useMemo(
    () => overrides.filter((o) => o.kind === "exclusion"),
    [overrides],
  );

  const [picker, setPicker] = useState<"pin" | "exclusion" | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [managing, setManaging] = useState(false);

  if (isLoading) return <Loading />;

  // The Jar was deleted, or its row hasn't synced. Either way there is nothing to show.
  if (!jar) return <Loading note="That jar isn't here." />;

  const tileW = Math.floor((width - 40 - GRID_GAP * 2) / 3);
  const tileH = Math.round(tileW * 1.48);

  const confirmDelete = () => {
    Alert.alert(
      `Delete ${jar.name}?`,
      "The jar and its filter go. Titles, ratings and viewings are untouched.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            jars
              .deleteJar(db, jar.id)
              .then(() => router.back())
              .catch((cause) => {
                console.warn("[jars] could not delete", jar.id, cause);
                Alert.alert("Couldn't delete", "That jar didn't delete.");
              });
          },
        },
      ],
    );
  };

  const runOption = (action: "rename" | "manual" | "delete") => {
    setOptionsOpen(false);
    const go = () => {
      if (action === "rename") setRenaming(true);
      else if (action === "manual") setManaging(true);
      else confirmDelete();
    };
    // Let the sheet finish sliding out before the next layer opens (iOS stacks poorly).
    if (Platform.OS === "ios") setTimeout(go, 300);
    else go();
  };

  const countLine = needle
    ? `${shown.length} of ${titles.length}`
    : `${titles.length} ${titles.length === 1 ? "slip" : "slips"}`;

  return (
    <Screen
      gutter="grid"
      footer={
        <Button
          label="Shake the jar"
          pill
          onPress={() => setDrawing(true)}
          disabled={titles.length === 0}
          accessibilityLabel={`Draw from ${jar.name}`}
        />
      }
    >
      <View className="flex-row items-start justify-between pt-2">
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text className="type-section-title text-ink-secondary">‹</Text>
        </Pressable>
        <Pressable
          onPress={() => setOptionsOpen(true)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Jar options"
          className="pt-1 active:opacity-60"
        >
          <Text className="type-section-title text-ink-secondary">⋯</Text>
        </Pressable>
      </View>

      <View className="gap-1 pb-3">
        {renaming ? (
          <TitleEditor
            current={jar.name ?? ""}
            onCancel={() => setRenaming(false)}
            onSave={async (name) => {
              try {
                await jars.renameJar(db, jar.id, name);
                setRenaming(false);
              } catch {
                Alert.alert("Couldn't rename", "That title didn't save.");
              }
            }}
          />
        ) : (
          <LayerTitle>{jar.name}</LayerTitle>
        )}
        <Meta>{countLine}</Meta>
      </View>

      <View className="flex-row flex-wrap gap-2 pb-3">
        <PillButton
          label={jar.filter ? "Edit filter" : "Add a filter"}
          color={accent.navy}
          onPress={() => router.push(`/filter/${jar.id}`)}
        />
        <PillButton
          label="Pin a title"
          mark="＋"
          color={accent.forest}
          onPress={() => setPicker("pin")}
        />
        <PillButton
          label="Hide a title"
          mark="－"
          color={accent.rust}
          onPress={() => setPicker("exclusion")}
        />
      </View>

      <View className="pb-3">
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Search this jar"
          accessibilityLabel="Search this jar by title or person"
        />
      </View>

      <FlatList
        data={shown}
        key="grid-3"
        numColumns={3}
        keyExtractor={(title) => title.id}
        showsVerticalScrollIndicator={false}
        columnWrapperStyle={{ gap: GRID_GAP }}
        contentContainerStyle={{ gap: GRID_GAP, paddingBottom: 24 }}
        ListEmptyComponent={
          needle ? (
            <Body className="pt-2">No matches for "{needle}".</Body>
          ) : (
            <EmptyJar jarId={jar.id} />
          )
        }
        renderItem={({ item }) => (
          <PosterCell title={item} width={tileW} height={tileH} />
        )}
      />

      <AddTitleModal
        visible={picker === "pin"}
        jarId={jar.id}
        jarName={jar.name ?? "this jar"}
        householdId={jar.household_id ?? ""}
        userId={userId}
        inJarTitleIds={inJarIds}
        inJarTmdbIds={inJarTmdbIds}
        exclusions={exclusions}
        onClose={() => setPicker(null)}
      />

      <RemoveTitleModal
        visible={picker === "exclusion"}
        jarId={jar.id}
        jarName={jar.name ?? "this jar"}
        titles={titles}
        pinnedTitleIds={pinnedIds}
        onClose={() => setPicker(null)}
      />

      <DrawSetupSheet
        visible={drawing}
        jarName={jar.name ?? "This jar"}
        jarCount={titles.length}
        onClose={() => setDrawing(false)}
        onStart={({ count, saucy }) => {
          setDrawing(false);
          const go = () =>
            router.push(
              `/draw/${jar.id}?count=${count}&saucy=${saucy ? 1 : 0}`,
            );
          // Let the sheet slide out before the flow pushes (iOS stacks poorly).
          if (Platform.OS === "ios") setTimeout(go, 260);
          else go();
        }}
      />

      <JarOptionsSheet
        visible={optionsOpen}
        jarName={jar.name ?? "Jar"}
        onClose={() => setOptionsOpen(false)}
        onSelect={runOption}
      />

      <ManualTitlesSheet
        visible={managing}
        jarId={jar.id}
        onClose={() => setManaging(false)}
      />
    </Screen>
  );
}

/**
 * The jar's own options — a paper bottom sheet rather than the platform action sheet,
 * so it reads as part of the app. Each row hands its action back to the screen, which
 * closes this sheet before opening whatever comes next.
 */
function JarOptionsSheet({
  visible,
  jarName,
  onClose,
  onSelect,
}: {
  visible: boolean;
  jarName: string;
  onClose: () => void;
  onSelect: (action: "rename" | "manual" | "delete") => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View
        className="bg-paper pb-10 pt-3"
        style={{
          borderTopLeftRadius: radius.sheet,
          borderTopRightRadius: radius.sheet,
        }}
      >
        <View className="items-center pb-2">
          <View
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: paper.rim,
            }}
          />
        </View>
        <View className="px-6 pb-2 pt-1">
          <Eyebrow>{jarName}</Eyebrow>
        </View>
        <OptionRow label="Edit jar title" onPress={() => onSelect("rename")} />
        <OptionRow
          label="Pinned & hidden titles"
          onPress={() => onSelect("manual")}
        />
        <OptionRow
          label="Delete jar"
          destructive
          last
          onPress={() => onSelect("delete")}
        />
      </View>
    </BottomSheet>
  );
}

function OptionRow({
  label,
  onPress,
  destructive,
  last,
}: {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`px-6 py-4 active:opacity-60 ${last ? "" : "border-b border-hairline"}`}
    >
      <Text
        className="type-body"
        style={{ color: destructive ? accent.rust : ink.primary }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * The jar's hand-made changes: Titles Pinned in regardless of the filter, and Titles
 * held out even though they match. This sheet is for undoing them — pinning and hiding
 * new titles is what the pill row above the grid does.
 */
function ManualTitlesSheet({
  visible,
  jarId,
  onClose,
}: {
  visible: boolean;
  jarId: string;
  onClose: () => void;
}) {
  const db = usePowerSync();
  const { height } = useWindowDimensions();
  const { data } = useQuery<TitleRow & { kind: "pin" | "exclusion" }>(
    visible ? jars.OVERRIDES_FOR_JAR : "select null limit 0",
    visible ? [jarId] : [],
  );

  const pins = data.filter((d) => d.kind === "pin");
  const hidden = data.filter((d) => d.kind === "exclusion");

  const clear = (titleId: string) => {
    jars
      .clearOverride(db, jarId, titleId)
      .catch((cause) => console.warn("[jars] could not clear override", cause));
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View
        className="bg-paper px-6 pb-10 pt-5"
        style={{
          borderTopLeftRadius: radius.sheet,
          borderTopRightRadius: radius.sheet,
        }}
      >
        <View className="flex-row items-center justify-between pb-1">
          <Eyebrow>Pinned & hidden titles</Eyebrow>
          <Pressable onPress={onClose} accessibilityRole="button" hitSlop={10}>
            <Text className="type-body text-navy">Done</Text>
          </Pressable>
        </View>
        <Meta>
          Pins force a title into the jar whatever the filter says. Hidden
          titles stay out even when they match.
        </Meta>

        {data.length === 0 ? (
          <View className="py-6">
            <Body>
              Nothing pinned or hidden. Use “Pin a title” or “Hide a title”
              above the grid to make one.
            </Body>
          </View>
        ) : (
          <ScrollView
            className="mt-3"
            style={{ maxHeight: height * 0.62 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {pins.length > 0 ? (
              <View className="pb-4">
                <Eyebrow>Pinned in</Eyebrow>
                {pins.map((t) => (
                  <OverrideRow
                    key={t.id}
                    title={t}
                    glyph="pin"
                    tone={accent.forest}
                    actionLabel="Unpin"
                    onAction={() => clear(t.id)}
                  />
                ))}
              </View>
            ) : null}

            {hidden.length > 0 ? (
              <View className="pb-4">
                <Eyebrow>Hidden</Eyebrow>
                {hidden.map((t) => (
                  <OverrideRow
                    key={t.id}
                    title={t}
                    glyph="hide"
                    tone={accent.rust}
                    actionLabel="Un-hide"
                    onAction={() => clear(t.id)}
                  />
                ))}
              </View>
            ) : null}
          </ScrollView>
        )}
      </View>
    </BottomSheet>
  );
}

function OverrideRow({
  title,
  glyph,
  tone,
  actionLabel,
  onAction,
}: {
  title: TitleRow;
  glyph: "pin" | "hide";
  tone: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <TitleResultRow
      name={title.name ?? "Untitled"}
      posterPath={title.poster_path}
      meta={titleMeta(title)}
      trailing={
        // Every row here has an override applied → filled. Tapping clears it and the
        // row falls off the list.
        <IconTablet
          glyph={glyph}
          tone={tone}
          filled
          onPress={onAction}
          accessibilityLabel={`${actionLabel} ${title.name}`}
        />
      }
    />
  );
}

/**
 * The jar title itself, swapped for an inline input while "Edit jar title" is active —
 * same type as `LayerTitle`, so the name is edited in place rather than in a modal.
 * Commits on submit or blur; an empty or unchanged value just backs out.
 */
function TitleEditor({
  current,
  onCancel,
  onSave,
}: {
  current: string;
  onCancel: () => void;
  onSave: (name: string) => void | Promise<void>;
}) {
  const [name, setName] = useState(current);
  const [busy, setBusy] = useState(false);

  const commit = async () => {
    if (busy) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === current) {
      onCancel();
      return;
    }
    setBusy(true);
    await onSave(trimmed);
    setBusy(false);
  };

  return (
    <TextInput
      value={name}
      onChangeText={setName}
      editable={!busy}
      autoFocus
      selectTextOnFocus
      autoCapitalize="words"
      returnKeyType="done"
      onSubmitEditing={commit}
      onBlur={commit}
      selectionColor={ink.secondary}
      accessibilityLabel="Jar name"
      className="type-layer-title text-ink border-b border-hairline pb-1"
    />
  );
}

/** One title in the wall — poster, then the name in the hand, since a slip is written. */
function PosterCell({
  title,
  width,
  height,
}: {
  title: TitleRow;
  width: number;
  height: number;
}) {
  return (
    <Pressable
      onPress={() => router.push(`/title/${title.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${title.name} details`}
      className="gap-1 active:opacity-70"
      style={{ width }}
    >
      <Poster
        uri={posterUrl(title.poster_path, "w342")}
        width={width}
        height={height}
        fallback={title.name?.[0]?.toUpperCase()}
      />
      <Text
        numberOfLines={1}
        style={{
          fontFamily: font.hand,
          fontSize: 14,
          lineHeight: 16,
          color: ink.primary,
        }}
      >
        {title.name}
      </Text>
    </Pressable>
  );
}

/** A hairline pill with an optional drawn mark — the jar's standing actions. */
function PillButton({
  label,
  color,
  onPress,
  mark,
}: {
  label: string;
  color: string;
  onPress: () => void;
  mark?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-row items-center gap-1.5 rounded-full border px-3.5 py-2 active:opacity-60"
      style={{ borderColor: paper.border }}
    >
      {mark ? (
        <Text
          style={{
            fontFamily: font.uiBold,
            fontSize: 14,
            lineHeight: 16,
            color,
          }}
        >
          {mark}
        </Text>
      ) : null}
      <Text className="type-meta" style={{ color }}>
        {label}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Pin / Hide title screens
// ---------------------------------------------------------------------------

/** The year / runtime / kind line under a title, the same shape Library uses. */
function titleMeta(t: {
  release_year: number | null;
  runtime: number | null;
  media_type: string | null;
}): string {
  return [
    t.release_year,
    t.runtime ? `${t.runtime} min` : null,
    t.media_type === "tv"
      ? "TV series"
      : t.media_type === "movie"
        ? "Movie"
        : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** An explore/library-style row: poster, title, a meta line, and a trailing control. */
function TitleResultRow({
  name,
  posterPath,
  meta,
  note,
  trailing,
}: {
  name: string;
  posterPath: string | null;
  meta: string;
  /** A small forest line under the meta — e.g. "Added to your library". */
  note?: string;
  trailing: ReactNode;
}) {
  return (
    <View className="flex-row items-center gap-3 py-3">
      <Poster
        uri={posterUrl(posterPath, "w154")}
        width={42}
        height={62}
        fallback={name?.[0]?.toUpperCase()}
      />
      <View className="flex-1 gap-0.5">
        <TitleName numberOfLines={1}>{name}</TitleName>
        {meta ? <Meta numberOfLines={1}>{meta}</Meta> : null}
        {note ? (
          <Text className="type-meta-small" style={{ color: accent.forest }}>
            {note}
          </Text>
        ) : null}
      </View>
      {trailing}
    </View>
  );
}

/** A row in the Add screen — a library title or a TMDB search hit, unified. */
type AddRow = {
  key: string;
  /** Set once the Title exists locally; null for a TMDB hit not yet imported. */
  titleId: string | null;
  tmdbId: number | null;
  mediaType: TmdbMediaType | null;
  name: string;
  posterPath: string | null;
  meta: string;
  popularity: number;
  selfAppearance: boolean;
};

function fromLibraryRow(r: LibraryEntryView): AddRow {
  return {
    key: `lib:${r.id}`,
    titleId: r.id,
    tmdbId: r.tmdb_id ?? null,
    mediaType: (r.media_type as TmdbMediaType | null) ?? null,
    name: r.name ?? "Untitled",
    posterPath: r.poster_path ?? null,
    meta: titleMeta(r),
    popularity: 0,
    selfAppearance: false,
  };
}

function fromSearchResult(r: TmdbSearchResult): AddRow {
  return {
    key: `${r.mediaType}:${r.tmdbId}`,
    titleId: null,
    tmdbId: r.tmdbId,
    mediaType: r.mediaType,
    name: r.name,
    posterPath: r.posterPath,
    meta: [r.releaseYear, r.mediaType === "tv" ? "TV series" : "Movie"]
      .filter(Boolean)
      .join(" · "),
    popularity: r.popularity,
    selfAppearance: false,
  };
}

function fromCredit(c: TmdbCredit): AddRow {
  return {
    key: `${c.mediaType}:${c.tmdbId}`,
    titleId: null,
    tmdbId: c.tmdbId,
    mediaType: c.mediaType,
    name: c.name,
    posterPath: c.posterPath,
    meta: [c.releaseYear, c.role].filter(Boolean).join(" · "),
    popularity: c.popularity,
    selfAppearance: c.selfAppearance,
  };
}

/** Base letters only — so "timothee" matches TMDB's "Timothée". Mirrors Explore. */
function foldName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function mergeRows(titleRows: AddRow[], creditRows: AddRow[]): AddRow[] {
  const byKey = new Map<string, AddRow>();
  for (const r of creditRows) byKey.set(r.key, r);
  for (const r of titleRows) byKey.set(r.key, r);
  return [...byKey.values()].sort((a, b) => {
    if (a.selfAppearance !== b.selfAppearance) return a.selfAppearance ? 1 : -1;
    return b.popularity - a.popularity;
  });
}

/**
 * Pin a title into the jar. The search box runs the full Explore search over TMDB (title,
 * or an exact person's filmography); an empty box browses the Library. The pin action on
 * a library title writes a Pin; on a TMDB hit it imports the title into the Library
 * first, then pins it; on a title the jar has hidden it simply clears the Exclusion.
 */
function AddTitleModal({
  visible,
  jarId,
  jarName,
  householdId,
  userId,
  inJarTitleIds,
  inJarTmdbIds,
  exclusions,
  onClose,
}: {
  visible: boolean;
  jarId: string;
  jarName: string;
  householdId: string;
  userId: string;
  inJarTitleIds: Set<string>;
  inJarTmdbIds: Set<number>;
  exclusions: { id: string; tmdb_id: number | null }[];
  onClose: () => void;
}) {
  const db = usePowerSync();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AddRow[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // Rows pinned this session — kept visible (as a filled thumbtack) once they've moved
  // into the jar, and tappable again to unpin. The value is the resolved local id, so
  // the second tap can clear the override.
  const [pinnedKeys, setPinnedKeys] = useState<Map<string, string>>(new Map());
  // The subset of those whose pin also had to import the Title into the Library.
  const [importedKeys, setImportedKeys] = useState<Set<string>>(new Set());

  const excludedTitleIds = useMemo(
    () => new Set(exclusions.map((e) => e.id)),
    [exclusions],
  );
  const excludedTmdbIds = useMemo(
    () =>
      new Set(
        exclusions.map((e) => e.tmdb_id).filter((v): v is number => v != null),
      ),
    [exclusions],
  );
  const excludedIdByTmdb = useMemo(
    () =>
      new Map(
        exclusions
          .filter((e) => e.tmdb_id != null)
          .map((e) => [e.tmdb_id as number, e.id] as const),
      ),
    [exclusions],
  );

  const { data: lib } = useQuery<LibraryEntryView>(
    visible ? library.LIBRARY_FOR_HOUSEHOLD : "select null limit 0",
    visible ? [userId, householdId] : [],
  );

  useEffect(() => {
    if (!visible) {
      setQuery("");
      setResults([]);
      setStatus("idle");
      setPinnedKeys(new Map());
      setImportedKeys(new Set());
    }
  }, [visible]);

  // Debounced TMDB search — the same two-request-plus-exact-person shape as Explore.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setStatus("idle");
      return;
    }
    let active = true;
    setStatus("loading");
    const timer = setTimeout(async () => {
      try {
        const [titleMatches, peopleMatches] = await Promise.all([
          searchTitles(trimmed),
          searchPeople(trimmed),
        ]);
        if (!active) return;
        const titleRows = titleMatches.map(fromSearchResult);
        const exact = peopleMatches.find(
          (p) => foldName(p.name) === foldName(trimmed),
        );
        if (!exact) {
          setResults(titleRows);
          setStatus("idle");
          return;
        }
        const credits = await getPersonCredits(exact.tmdbPersonId);
        if (!active) return;
        setResults(mergeRows(titleRows, credits.slice(0, 30).map(fromCredit)));
        setStatus("idle");
      } catch (cause) {
        if (!active) return;
        console.warn("[jar] add search failed:", cause);
        setStatus("error");
      }
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  const browsing = query.trim() === "";
  const browseRows = useMemo(() => lib.map(fromLibraryRow), [lib]);

  const inJar = (row: AddRow) =>
    (row.titleId != null && inJarTitleIds.has(row.titleId)) ||
    (row.tmdbId != null && inJarTmdbIds.has(row.tmdbId));

  const isExcluded = (row: AddRow) =>
    (row.titleId != null && excludedTitleIds.has(row.titleId)) ||
    (row.tmdbId != null && excludedTmdbIds.has(row.tmdbId));

  /** The local Title id for an Excluded row, from either the id or the tmdb id. */
  const excludedLocalId = (row: AddRow): string | undefined => {
    if (row.titleId != null && excludedTitleIds.has(row.titleId))
      return row.titleId;
    if (row.tmdbId != null) return excludedIdByTmdb.get(row.tmdbId);
    return undefined;
  };

  // A pre-existing jar member is noise on an "add" screen; one pinned this session stays
  // so the filled state is visible and reversible.
  const shownRows = (browsing ? browseRows : results).filter(
    (row) => !inJar(row) || pinnedKeys.has(row.key),
  );

  /** Pin the row. A Title the jar has Hidden is resolved to its local id and the pin
   *  replaces that Exclusion; a TMDB hit is imported first. */
  const pin = async (row: AddRow) => {
    setBusyKey(row.key);
    try {
      const existingId = row.titleId ?? excludedLocalId(row);
      const needsImport = existingId == null;
      const titleId =
        existingId ??
        (await addTmdbTitleToLibrary(db, {
          tmdbId: row.tmdbId!,
          mediaType: row.mediaType!,
          householdId,
          userId,
        }));
      await jars.setOverride(db, jarId, titleId, "pin");
      if (needsImport) {
        setImportedKeys((prev) => new Set(prev).add(row.key));
      }
      setPinnedKeys((prev) => new Map(prev).set(row.key, titleId));
    } catch (cause) {
      console.warn("[jar] pin failed", row.key, cause);
      Alert.alert("Couldn't pin", "That title didn't get pinned into the jar.");
    } finally {
      setBusyKey(null);
    }
  };

  /** Second tap: clear the pin this session put on. */
  const unpin = async (row: AddRow) => {
    const titleId = pinnedKeys.get(row.key);
    if (!titleId) return;
    setBusyKey(row.key);
    try {
      await jars.clearOverride(db, jarId, titleId);
      setPinnedKeys((prev) => {
        const next = new Map(prev);
        next.delete(row.key);
        return next;
      });
      setImportedKeys((prev) => {
        if (!prev.has(row.key)) return prev;
        const next = new Set(prev);
        next.delete(row.key);
        return next;
      });
    } catch (cause) {
      console.warn("[jar] unpin failed", row.key, cause);
      Alert.alert("Couldn't unpin", "That change didn't revert.");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <Screen gutter="grid">
        <View className="flex-row items-center justify-between pt-2">
          <LayerTitle>Pin a title</LayerTitle>
          <Pressable onPress={onClose} accessibilityRole="button" hitSlop={10}>
            <Text className="type-body text-navy">Done</Text>
          </Pressable>
        </View>
        <Meta className="pt-1">
          Keep a title in {jarName} no matter what its filter says — from your
          library or straight from TMDB.
        </Meta>

        <View className="py-3">
          <SearchField
            value={query}
            onChangeText={setQuery}
            placeholder="Search TMDB by title or person"
            accessibilityLabel="Search TMDB"
          />
        </View>
        {status === "error" ? (
          <Text className="type-meta-small text-rust pb-2">
            Couldn't search TMDB. Check your connection.
          </Text>
        ) : null}

        <FlatList
          data={shownRows}
          keyExtractor={(r) => r.key}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 24 }}
          ItemSeparatorComponent={() => <View className="h-px bg-hairline" />}
          ListHeaderComponent={
            browsing && shownRows.length > 0 ? (
              <View className="pb-1 pt-1">
                <Eyebrow>In your library</Eyebrow>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <AddEmpty browsing={browsing} status={status} query={query} />
          }
          renderItem={({ item }) => {
            const pinned = pinnedKeys.has(item.key);
            const hidden = !pinned && isExcluded(item);
            return (
              <TitleResultRow
                name={item.name}
                posterPath={item.posterPath}
                meta={item.meta}
                note={
                  importedKeys.has(item.key)
                    ? "Added to your library"
                    : hidden
                      ? "Currently hidden from this jar"
                      : undefined
                }
                trailing={
                  <IconTablet
                    glyph="pin"
                    tone={accent.forest}
                    filled={pinned}
                    busy={busyKey === item.key}
                    onPress={() => (pinned ? unpin(item) : pin(item))}
                    accessibilityLabel={`${pinned ? "Unpin" : "Pin"} ${item.name}`}
                  />
                }
              />
            );
          }}
        />
      </Screen>
    </Modal>
  );
}

function AddEmpty({
  browsing,
  status,
  query,
}: {
  browsing: boolean;
  status: "idle" | "loading" | "error";
  query: string;
}) {
  if (status === "loading") {
    return (
      <View className="items-center py-8">
        <ActivityIndicator />
      </View>
    );
  }
  if (browsing) {
    return (
      <Body className="pt-2">
        Nothing in your library to pin here. Search TMDB to bring something new
        in.
      </Body>
    );
  }
  if (status === "idle") {
    return <Body className="pt-2">No results for "{query.trim()}".</Body>;
  }
  return null;
}

/**
 * Hide a title from the jar. Lists the filter-matched contents (Pinned titles belong on
 * the Pin screen and the manage sheet, not here) plus anything hidden this session. The
 * − inverts each row: a matched title is Excluded and stays — filled — so it can be
 * un-hidden.
 */
function RemoveTitleModal({
  visible,
  jarId,
  jarName,
  titles,
  pinnedTitleIds,
  onClose,
}: {
  visible: boolean;
  jarId: string;
  jarName: string;
  titles: TitleRow[];
  pinnedTitleIds: Set<string>;
  onClose: () => void;
}) {
  const db = usePowerSync();
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  // Titles hidden this session — a hide drops them from `titles`, so keep a copy to
  // render the filled state and let a second tap put them back.
  const [hiddenNow, setHiddenNow] = useState<Map<string, TitleRow>>(new Map());

  useEffect(() => {
    if (!visible) {
      setQuery("");
      setHiddenNow(new Map());
    }
  }, [visible]);

  const needle = query.trim().toLowerCase();
  const rows = useMemo(() => {
    // Pinned titles are not hideable from here — drop them.
    const base = titles.filter((t) => !pinnedTitleIds.has(t.id));
    const extras = [...hiddenNow.values()].filter(
      (h) => !base.some((t) => t.id === h.id),
    );
    const all = [...base, ...extras];
    return needle
      ? all.filter((t) => (t.name ?? "").toLowerCase().includes(needle))
      : all;
  }, [titles, pinnedTitleIds, hiddenNow, needle]);

  // Each row's − inverts its state: hide a filter-matched title, or un-hide one this
  // session hid.
  const toggle = async (row: TitleRow) => {
    const hidden = hiddenNow.has(row.id);
    setBusyId(row.id);
    try {
      if (hidden) {
        await jars.clearOverride(db, jarId, row.id);
        setHiddenNow((prev) => {
          const next = new Map(prev);
          next.delete(row.id);
          return next;
        });
      } else {
        await jars.setOverride(db, jarId, row.id, "exclusion");
        setHiddenNow((prev) => new Map(prev).set(row.id, row));
      }
    } catch (cause) {
      console.warn("[jar] hide toggle failed", row.id, cause);
      Alert.alert("Couldn't update", "That title didn't change.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <Screen gutter="grid">
        <View className="flex-row items-center justify-between pt-2">
          <LayerTitle>Hide a title</LayerTitle>
          <Pressable onPress={onClose} accessibilityRole="button" hitSlop={10}>
            <Text className="type-body text-navy">Done</Text>
          </Pressable>
        </View>
        <Meta className="pt-1">
          Keep a title out of {jarName} even when its filter matches it.
        </Meta>

        <View className="py-3">
          <SearchField
            value={query}
            onChangeText={setQuery}
            placeholder="Search this jar"
            accessibilityLabel="Search this jar"
          />
        </View>

        <FlatList
          data={rows}
          keyExtractor={(t) => t.id}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 24 }}
          ItemSeparatorComponent={() => <View className="h-px bg-hairline" />}
          ListEmptyComponent={
            <Body className="pt-2">
              {needle
                ? `No matches for "${query.trim()}".`
                : "This jar is empty."}
            </Body>
          }
          renderItem={({ item }) => {
            const hidden = hiddenNow.has(item.id);
            return (
              <TitleResultRow
                name={item.name ?? "Untitled"}
                posterPath={item.poster_path}
                meta={titleMeta(item)}
                note={hidden ? "Hidden from this jar" : undefined}
                trailing={
                  // Outline hide icon for a matched title; filled once it's hidden this
                  // session, and a tap inverts it.
                  <IconTablet
                    glyph="hide"
                    tone={accent.rust}
                    filled={hidden}
                    busy={busyId === item.id}
                    onPress={() => toggle(item)}
                    accessibilityLabel={`${hidden ? "Un-hide" : "Hide"} ${item.name}`}
                  />
                }
              />
            );
          }}
        />
      </Screen>
    </Modal>
  );
}

function EmptyJar({ jarId }: { jarId: string }) {
  return (
    <View className="gap-3 py-6">
      <Eyebrow>Empty</Eyebrow>
      <Body>
        Nothing falls into this jar yet. Give it a filter and everything in your
        library that matches turns up here on its own — or pin a title in by
        hand.
      </Body>
      <Button
        label="Build a filter"
        pill
        onPress={() => router.push(`/filter/${jarId}`)}
      />
    </View>
  );
}
