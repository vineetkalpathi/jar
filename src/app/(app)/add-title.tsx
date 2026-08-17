import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { Field } from "@/components/field";
import { Screen } from "@/components/screen";
import { TitleRow } from "@/components/title-row";
import { Body, LayerTitle } from "@/components/text";
import {
  getPersonCredits,
  searchPeople,
  searchTitles,
  type TmdbCredit,
  type TmdbMediaType,
  type TmdbSearchResult,
} from "@/lib/tmdb";

/** What a row needs, regardless of whether it came from a title search or a person's filmography. */
type Row = {
  tmdbId: number;
  mediaType: TmdbMediaType;
  name: string;
  posterPath: string | null;
  meta: string;
  popularity: number;
  /** Always false for a literal title match — this is a credit-only concept. See `TmdbCredit`. */
  selfAppearance: boolean;
};

const rowKey = (r: Row) => `${r.mediaType}:${r.tmdbId}`;

/**
 * Folds a name down to base letters for the exact-match check below — "timothee
 * chalamet" should match TMDB's "Timothée Chalamet" even though a bare `toLowerCase()`
 * comparison wouldn't, and most people typing a search box don't reach for the accented
 * form. `normalize("NFD")` splits an accented character into its base letter plus a
 * separate combining mark, which the second step then strips.
 */
function foldName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function fromSearchResult(r: TmdbSearchResult): Row {
  return {
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

function fromCredit(c: TmdbCredit): Row {
  return {
    tmdbId: c.tmdbId,
    mediaType: c.mediaType,
    name: c.name,
    posterPath: c.posterPath,
    meta: [c.releaseYear, c.role].filter(Boolean).join(" · "),
    popularity: c.popularity,
    selfAppearance: c.selfAppearance,
  };
}

/**
 * Titles win on a collision (unlikely — nothing's both literally titled and credited to
 * the same id/type pair). Ranked non-self-appearances first, popularity descending
 * within each group — the same ordering `getPersonCredits` already applies to its own
 * list, preserved here rather than flattened by a plain popularity sort.
 */
function mergeRows(titles: Row[], credits: Row[]): Row[] {
  const byKey = new Map<string, Row>();
  for (const r of credits) byKey.set(rowKey(r), r);
  for (const r of titles) byKey.set(rowKey(r), r);
  return [...byKey.values()].sort((a, b) => {
    if (a.selfAppearance !== b.selfAppearance) return a.selfAppearance ? 1 : -1;
    return b.popularity - a.popularity;
  });
}

const MAX_CREDITS = 30;

/**
 * Search TMDB and add a Title to the Library.
 *
 * Adding doesn't leave this screen — the design's own note is why: it drops the Title in
 * the Library and jars pick it up on their own if it matches their filter, so there is
 * nothing further to do here except keep searching.
 *
 * Searching a person's name shows their filmography merged straight into the results —
 * no separate "people" list to browse through first. The trigger is deliberately narrow:
 * a search result's name has to be an *exact* match for what was typed, modulo case and
 * accents (`foldName` below) — so "timothee chalamet" still matches TMDB's "Timothée
 * Chalamet" without anyone having to reach for the accented character. That's what keeps
 * "Tom" from exploding into every actor and crew member named Tom's entire filmography
 * merged with every title that happens to contain the word — nobody in TMDB is named
 * just "Tom," so a bare, ambiguous word never matches and this
 * screen quietly stays a title search. Type a full name ("Tom Hanks") or even a
 * single-word stage name that's an exact match ("Madonna") and it does.
 */
export default function AddTitle() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Row[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setStatus("idle");
      return;
    }

    let active = true;
    setStatus("loading");

    // Debounced rather than fired per keystroke — every character otherwise means at
    // least two TMDB requests. `active` guards against a slow early response landing
    // after a faster later one and showing stale results.
    const timer = setTimeout(async () => {
      try {
        const [titleMatches, peopleMatches] = await Promise.all([
          searchTitles(trimmed),
          searchPeople(trimmed),
        ]);
        if (!active) return;

        const titleRows = titleMatches.map(fromSearchResult);
        const exactPerson = peopleMatches.find((p) => foldName(p.name) === foldName(trimmed));

        if (!exactPerson) {
          setResults(titleRows);
          setStatus("idle");
          return;
        }

        const credits = await getPersonCredits(exactPerson.tmdbPersonId);
        if (!active) return;
        setResults(mergeRows(titleRows, credits.slice(0, MAX_CREDITS).map(fromCredit)));
        setStatus("idle");
      } catch (cause) {
        if (!active) return;
        console.warn("[add-title] search failed:", cause);
        setStatus("error");
      }
    }, 350);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <Screen gutter="form">
      <View className="gap-3 pb-4 pt-2">
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Text className="type-section-title text-ink-secondary">‹</Text>
        </Pressable>
        <LayerTitle>Add a title</LayerTitle>
        <Field
          label="Search TMDB"
          value={query}
          onChangeText={setQuery}
          placeholder="A movie, show, or person's full name…"
          autoFocus
          autoCorrect={false}
          returnKeyType="search"
        />
        {status === "error" ? (
          <Text className="type-meta-small text-rust">
            Couldn't search TMDB. Check your connection.
          </Text>
        ) : null}
      </View>

      <FlatList
        data={results}
        keyExtractor={rowKey}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
        ItemSeparatorComponent={() => <View className="h-px bg-hairline" />}
        ListEmptyComponent={<ListEmpty query={query} status={status} />}
        ListFooterComponent={
          results.length > 0 ? (
            <Body className="pt-4">
              Adding drops it in the Library. Jars pick it up on their own if it matches
              their filter.
            </Body>
          ) : null
        }
        renderItem={({ item }) => (
          <TitleRow
            tmdbId={item.tmdbId}
            mediaType={item.mediaType}
            name={item.name}
            posterPath={item.posterPath}
            meta={item.meta}
          />
        )}
      />
    </Screen>
  );
}

function ListEmpty({
  query,
  status,
}: {
  query: string;
  status: "idle" | "loading" | "error";
}) {
  if (status === "loading") {
    return (
      <View className="items-center py-8">
        <ActivityIndicator />
      </View>
    );
  }
  if (!query.trim()) {
    return (
      <Body className="pt-2">
        Search movies and shows from TMDB — or a person's full name to see what they've
        been in — then add the ones that belong in your library.
      </Body>
    );
  }
  if (status === "idle") {
    return <Body className="pt-2">No results for "{query.trim()}".</Body>;
  }
  return null;
}
