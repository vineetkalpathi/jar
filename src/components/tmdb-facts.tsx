/**
 * The parts of a TMDB response that are display-only — never cached locally (see
 * `title/[id].tsx`'s note on why) and shown identically wherever a Title's TMDB details
 * are on screen: the read-only detail view and the pre-add preview.
 */

import { Image } from "expo-image";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { DarkMeta } from "./text";
import { imdbUrl, JUSTWATCH_ATTRIBUTION, providerLogoUrl, tmdbUrl } from "@/lib/tmdb";
import type { TmdbMediaType, TmdbWatchProviders } from "@/lib/tmdb";

export function TmdbRating({
  voteAverage,
}: {
  voteAverage: number | null | undefined;
}) {
  if (!voteAverage) return null;
  return <DarkMeta>TMDB {voteAverage.toFixed(1)}/10</DarkMeta>;
}

export function CastAndCrew({
  cast,
  directors,
}: {
  cast: { name: string }[];
  directors: { name: string }[];
}) {
  if (cast.length === 0 && directors.length === 0) return null;
  return (
    <>
      {cast.length > 0 ? (
        <DarkMeta>Starring {cast.slice(0, 4).map((c) => c.name).join(", ")}</DarkMeta>
      ) : null}
      {directors.length > 0 ? (
        <DarkMeta>Directed by {directors.map((d) => d.name).join(", ")}</DarkMeta>
      ) : null}
    </>
  );
}

/**
 * Subscription-streaming logos for the US, TMDB's own watch page linked underneath.
 * Region is pinned in `lib/tmdb/details.ts` — see that file for why. Attribution to
 * JustWatch (TMDB's source for this data) is a separate licence condition from
 * `TMDB_ATTRIBUTION` and has to appear here, not just once in an About screen, because
 * this is the one place that data is shown.
 */
export function WatchProviders({ providers }: { providers: TmdbWatchProviders | null }) {
  if (!providers || providers.flatrate.length === 0) return null;

  return (
    <Pressable
      onPress={() => Linking.openURL(providers.link)}
      accessibilityRole="link"
      className="mt-5 gap-2"
    >
      <DarkMeta>Streaming now</DarkMeta>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {providers.flatrate.map((p) => (
          <Image
            key={p.providerId}
            source={{ uri: providerLogoUrl(p.logoPath, "w92") ?? undefined }}
            accessibilityLabel={p.name}
            style={{ width: 32, height: 32, borderRadius: 6, marginRight: 8 }}
          />
        ))}
      </ScrollView>
      <Text className="type-meta-small text-dark-ink-faint">{JUSTWATCH_ATTRIBUTION}</Text>
    </Pressable>
  );
}

/**
 * Out to TMDB's own page, and IMDB's when TMDB has a match. `tmdbId`/`mediaType` are
 * nullable so a caller can pass a Title straight through without checking first — null
 * covers both "still loading" and "a hand-entered Title with no TMDB link at all."
 */
export function ExternalLinks({
  tmdbId,
  mediaType,
  imdbId,
}: {
  tmdbId: number | null;
  mediaType: TmdbMediaType | null;
  imdbId: string | null;
}) {
  if (!tmdbId || !mediaType) return null;
  const imdb = imdbUrl(imdbId);

  return (
    <View className="mt-5 flex-row gap-5">
      <Pressable onPress={() => Linking.openURL(tmdbUrl(tmdbId, mediaType))}>
        <DarkMeta>View on TMDB ↗</DarkMeta>
      </Pressable>
      {imdb ? (
        <Pressable onPress={() => Linking.openURL(imdb)}>
          <DarkMeta>View on IMDB ↗</DarkMeta>
        </Pressable>
      ) : null}
    </View>
  );
}
