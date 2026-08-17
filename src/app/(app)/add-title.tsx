import { usePowerSync } from "@powersync/react";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { Button, Tappable } from "@/components/button";
import { Field } from "@/components/field";
import { Poster } from "@/components/poster";
import { Screen } from "@/components/screen";
import { Body, LayerTitle, Meta, TitleName } from "@/components/text";
import { useUserId } from "@/lib/auth/session";
import { useHousehold } from "@/lib/household/active";
import { posterUrl, searchTitles, type TmdbSearchResult } from "@/lib/tmdb";
import { addTmdbTitleToLibrary } from "@/lib/tmdb/import";

const resultKey = (r: TmdbSearchResult) => `${r.mediaType}:${r.tmdbId}`;

/**
 * Search TMDB and add a Title to the Library.
 *
 * Adding doesn't leave this screen — the design's own note is why: it drops the Title in
 * the Library and jars pick it up on their own if it matches their filter, so there is
 * nothing further to do here except keep searching.
 */
export default function AddTitle() {
  const db = usePowerSync();
  const household = useHousehold();
  const userId = useUserId();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TmdbSearchResult[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  // Which results have been added, and the Title id each one resolved to — the latter is
  // what an added row's tap opens (`/title/[id]`) instead of the pre-add TMDB preview.
  const [added, setAdded] = useState<Map<string, string>>(new Map());
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setStatus("idle");
      return;
    }

    let active = true;
    setStatus("loading");

    // Debounced rather than fired per keystroke — every character otherwise means two
    // TMDB requests. `active` guards against a slow early response landing after a
    // faster later one and showing stale results.
    const timer = setTimeout(() => {
      searchTitles(trimmed)
        .then((found) => {
          if (!active) return;
          setResults(found);
          setStatus("idle");
        })
        .catch((cause) => {
          if (!active) return;
          console.warn("[add-title] search failed:", cause);
          setStatus("error");
        });
    }, 350);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  const handleAdd = async (result: TmdbSearchResult) => {
    const key = resultKey(result);
    setAddingKey(key);
    setAddError(null);
    try {
      const titleId = await addTmdbTitleToLibrary(db, {
        tmdbId: result.tmdbId,
        mediaType: result.mediaType,
        householdId: household.id,
        userId,
      });
      setAdded((prev) => new Map(prev).set(key, titleId));
    } catch (cause) {
      console.warn("[add-title] could not add", result.tmdbId, cause);
      setAddError("Couldn't add that — try again.");
    } finally {
      setAddingKey(null);
    }
  };

  return (
    <Screen gutter="form">
      <View className="gap-3 pb-4 pt-2">
        <Button label="‹ Close" variant="quiet" onPress={() => router.back()} />
        <LayerTitle>Add a title</LayerTitle>
        <Field
          label="Search TMDB"
          value={query}
          onChangeText={setQuery}
          placeholder="A movie or show…"
          autoFocus
          autoCorrect={false}
          returnKeyType="search"
        />
        {status === "error" ? (
          <Text className="type-meta-small text-rust">
            Couldn't search TMDB. Check your connection.
          </Text>
        ) : null}
        {addError ? <Text className="type-meta-small text-rust">{addError}</Text> : null}
      </View>

      <FlatList
        data={results}
        keyExtractor={resultKey}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
        ItemSeparatorComponent={() => <View className="h-px bg-hairline" />}
        ListEmptyComponent={
          <ListEmpty query={query} status={status} />
        }
        ListFooterComponent={
          results.length > 0 ? (
            <Body className="pt-4">
              Adding drops it in the Library. Jars pick it up on their own if it matches
              their filter.
            </Body>
          ) : null
        }
        renderItem={({ item }) => (
          <ResultRow
            result={item}
            adding={addingKey === resultKey(item)}
            addedTitleId={added.get(resultKey(item)) ?? null}
            onAdd={() => handleAdd(item)}
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
        Search movies and shows from TMDB, then add the ones that belong in your
        library.
      </Body>
    );
  }
  if (status === "idle") {
    return <Body className="pt-2">No results for "{query.trim()}".</Body>;
  }
  return null;
}

function ResultRow({
  result,
  adding,
  addedTitleId,
  onAdd,
}: {
  result: TmdbSearchResult;
  adding: boolean;
  addedTitleId: string | null;
  onAdd: () => void;
}) {
  const meta = [result.releaseYear, result.mediaType === "tv" ? "TV series" : "Movie"]
    .filter(Boolean)
    .join(" · ");

  const openDetails = () =>
    addedTitleId
      ? router.push(`/title/${addedTitleId}`)
      : router.push({
          pathname: "/title/tmdb/[tmdbId]",
          params: { tmdbId: String(result.tmdbId), mediaType: result.mediaType },
        });

  return (
    <View className="flex-row items-center gap-3 py-3">
      <Tappable onPress={openDetails} accessibilityLabel={`${result.name} details`} className="flex-1">
        <View className="flex-row items-center gap-3">
          <Poster uri={posterUrl(result.posterPath, "w154")} width={42} height={62} />
          <View className="flex-1 gap-0.5">
            <TitleName numberOfLines={1}>{result.name}</TitleName>
            <Meta>{meta}</Meta>
          </View>
        </View>
      </Tappable>

      {addedTitleId ? (
        // Tapping the row itself (above) now opens this same Title — nothing further
        // to link to here.
        <Text className="type-meta text-forest">Added ✓</Text>
      ) : (
        <Pressable
          onPress={onAdd}
          disabled={adding}
          className={`rounded-card border border-hairline bg-card px-3 py-1.5 ${adding ? "opacity-40" : ""}`}
        >
          {adding ? (
            <ActivityIndicator size="small" />
          ) : (
            <Text className="type-meta text-forest">Add</Text>
          )}
        </Pressable>
      )}
    </View>
  );
}
