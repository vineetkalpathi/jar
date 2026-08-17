import { useQuery, usePowerSync } from "@powersync/react";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Button } from "@/components/button";
import { HouseholdRating, type RatingWithCategory } from "@/components/household-rating";
import { Loading } from "@/components/loading";
import { Poster } from "@/components/poster";
import { Screen } from "@/components/screen";
import { TagChips } from "@/components/tag-chips";
import { CastAndCrew, ExternalLinks, TmdbRating, WatchProviders } from "@/components/tmdb-facts";
import { DarkBody, DarkMeta, DarkTitle } from "@/components/text";
import { annotations, households, library, type RatingCategoryRow, type TagRow } from "@/lib/db";
import { useUserId } from "@/lib/auth/session";
import { useHousehold } from "@/lib/household/active";
import { getTitleDetails, posterUrl, type TmdbMediaType, type TmdbTitleDetails } from "@/lib/tmdb";
import { addTmdbTitleToLibrary } from "@/lib/tmdb/import";

/**
 * A preview of a TMDB result, before it's a Title at all.
 *
 * `/title/[id]` reads from the local replica — it has nothing to read for something
 * that was only ever a search result. This screen reads TMDB directly instead.
 *
 * "Add to library" grows this screen in place rather than navigating to `/title/[id]`:
 * the two views differ by one section (Library-scoped tags and household ratings,
 * absent until now because there was no Library row to hang them off), not by identity,
 * so a push/replace transition would read as "you went somewhere new" for something
 * that's still the same title on screen. `titleId` tracks whether that Library row
 * exists — checked on load (already added, this visit or an earlier one) and set again
 * after a successful add — and once it's set, the same queries `/title/[id]` runs light
 * up here too.
 */
export default function TmdbPreview() {
  const { tmdbId, mediaType } = useLocalSearchParams<{
    tmdbId: string;
    mediaType: TmdbMediaType;
  }>();
  const db = usePowerSync();
  const household = useHousehold();
  const userId = useUserId();

  const [details, setDetails] = useState<TmdbTitleDetails | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [titleId, setTitleId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    getTitleDetails(Number(tmdbId), mediaType)
      .then((found) => {
        if (!active) return;
        setDetails(found);
        setStatus("ready");
      })
      .catch((cause) => {
        if (!active) return;
        console.warn("[title/tmdb] could not fetch details:", cause);
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [tmdbId, mediaType]);

  // A local read, not a fetch — resolves near-instantly, well before the TMDB request
  // above, so this is what decides "Add to library" vs. "Added ✓" on first paint rather
  // than the button flashing before flipping. Independent of `handleAdd`'s own
  // `setTitleId`: this is what catches a title reached again after being added in an
  // earlier visit (or on another device, synced down) — `handleAdd` alone only ever
  // knew about titles added within this screen instance.
  useEffect(() => {
    let active = true;
    library
      .libraryEntryForTmdbId(db, { householdId: household.id, tmdbId: Number(tmdbId) })
      .then((entry) => {
        if (active && entry) setTitleId(entry.titleId);
      })
      .catch((cause) => {
        console.warn("[title/tmdb] could not check library membership:", cause);
      });
    return () => {
      active = false;
    };
  }, [db, household.id, tmdbId]);

  // Household-scoped, so this doesn't depend on `titleId` — fetched early, but the
  // household-rating section below stays unmounted until there's a Title to rate.
  const { data: categories } = useQuery<RatingCategoryRow>(
    households.CATEGORIES_FOR_HOUSEHOLD,
    [household.id],
  );

  // Title-scoped: nothing to read until `titleId` exists. "select null limit 0"
  // (matching jar/[id].tsx's own use of the pattern) keeps the hook called
  // unconditionally, as hooks require, while returning no rows until then.
  const { data: tags } = useQuery<TagRow>(
    titleId ? annotations.TAGS_FOR_TITLE : "select null limit 0",
    titleId ? [household.id, titleId] : [],
  );
  const { data: ratings } = useQuery<RatingWithCategory>(
    titleId ? annotations.RATINGS_FOR_TITLE_IN_HOUSEHOLD : "select null limit 0",
    titleId ? [titleId, household.id] : [],
  );

  const handleAdd = async () => {
    setAdding(true);
    setAddError(null);
    try {
      const newTitleId = await addTmdbTitleToLibrary(db, {
        tmdbId: Number(tmdbId),
        mediaType,
        householdId: household.id,
        userId,
      });
      setTitleId(newTitleId);
    } catch (cause) {
      console.warn("[title/tmdb] could not add", tmdbId, cause);
      setAddError("Couldn't add that — try again.");
    } finally {
      setAdding(false);
    }
  };

  return (
    <Screen register="dark" gutter="form" scroll>
      <View className="gap-3 pb-2 pt-2">
        <Pressable onPress={() => router.back()}>
          <DarkMeta>‹ Back</DarkMeta>
        </Pressable>
      </View>

      {status === "loading" ? (
        <Loading />
      ) : status === "error" || !details ? (
        <DarkMeta>Couldn't reach TMDB for this title.</DarkMeta>
      ) : (
        <>
          <View className="flex-row items-start gap-4">
            <Poster
              uri={posterUrl(details.posterPath, "w185")}
              width={104}
              height={154}
              register="dark"
            />
            <View className="flex-1 gap-1.5">
              <DarkTitle>{details.name}</DarkTitle>
              <Text className="type-title-large text-dark-ink-muted">
                {[details.releaseYear, details.runtime ? `${details.runtime} min` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
              {details.genres.length > 0 ? (
                <DarkMeta>{details.genres.join(" · ")}</DarkMeta>
              ) : null}
              <TmdbRating voteAverage={details.voteAverage} />
              <TagChips tags={tags} />
            </View>
          </View>

          <View className="gap-1.5 pt-5">
            {details.overview ? <DarkBody>{details.overview}</DarkBody> : null}
            <CastAndCrew cast={details.cast} directors={details.directors} />
          </View>

          <WatchProviders providers={details.watchProviders} />

          <ExternalLinks tmdbId={details.tmdbId} mediaType={details.mediaType} imdbId={details.imdbId} />

          {titleId ? <HouseholdRating categories={categories} ratings={ratings} /> : null}

          <View className="mt-6 gap-2">
            {addError ? <Text className="type-meta-small text-rust">{addError}</Text> : null}
            {titleId ? (
              <Text className="type-meta text-forest">Added to your library ✓</Text>
            ) : (
              <Button label="Add to library" onPress={handleAdd} loading={adding} />
            )}
          </View>
        </>
      )}
    </Screen>
  );
}
