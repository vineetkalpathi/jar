/**
 * The parts of a TMDB response that are display-only — never cached locally (see
 * `title/[id].tsx`'s note on why) and shown identically wherever a Title's TMDB details
 * are on screen: the read-only detail view and the pre-add preview.
 */

import { Image } from "expo-image";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { Poster } from "./poster";
import { DarkMeta } from "./text";
import { imdbUrl, JUSTWATCH_ATTRIBUTION, profileUrl, providerLogoUrl, tmdbUrl } from "@/lib/tmdb";
import type { TmdbMediaType, TmdbWatchProviders } from "@/lib/tmdb";

export function TmdbRating({
  voteAverage,
}: {
  voteAverage: number | null | undefined;
}) {
  if (!voteAverage) return null;
  return <DarkMeta>TMDB {voteAverage.toFixed(1)}/10</DarkMeta>;
}

// Portrait, not square — the same 2:3-ish shape as every other poster in the app
// (`Poster` itself, `jar-tile`'s), so a cast photo reads as "the same kind of picture,"
// not a different image treatment.
const AVATAR_WIDTH = 68;
const AVATAR_HEIGHT = 102;

/**
 * Cast, as a horizontal carousel of photo + name + character — enriched for free:
 * `profile_path` rides along on every `credits.cast` entry TMDB already returns, so this
 * needed no extra request per person, just capturing a field `topCast()` was discarding
 * (`lib/tmdb/details.ts`). Directors stay a plain text line beneath; a few names in a row
 * don't need a carousel the way ten cast members do.
 */
export function CastAndCrew({
  cast,
  directors,
}: {
  cast: { tmdbPersonId: number; name: string; character: string; profilePath: string | null }[];
  directors: { name: string }[];
}) {
  if (cast.length === 0 && directors.length === 0) return null;
  return (
    <View className="gap-3">
      {cast.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {cast.map((member, index) => (
            <View
              key={member.tmdbPersonId}
              className="items-center"
              style={{ width: 76, marginRight: index === cast.length - 1 ? 0 : 8 }}
            >
              <Poster
                uri={profileUrl(member.profilePath, "w185")}
                width={AVATAR_WIDTH}
                height={AVATAR_HEIGHT}
                register="dark"
                fallback={member.name.charAt(0)}
              />
              <Text numberOfLines={1} className="type-meta-small text-dark-ink mt-1.5 text-center">
                {member.name}
              </Text>
              <Text numberOfLines={1} className="type-meta-small text-dark-ink-faint text-center">
                {member.character}
              </Text>
            </View>
          ))}
        </ScrollView>
      ) : null}
      {directors.length > 0 ? (
        <DarkMeta>Directed by {directors.map((d) => d.name).join(", ")}</DarkMeta>
      ) : null}
    </View>
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

// Each service's actual brand colour, on the wordmark only — not a reproduction of
// either logo (no logo assets are available to this app; see ExternalLinks below).
const TMDB_BRAND = "#01B4E4";
const IMDB_BRAND = "#F5C518";

function ExternalLinkButton({
  label,
  brandColor,
  onPress,
}: {
  label: string;
  brandColor: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      className="h-13 flex-1 flex-row items-center justify-center gap-1.5 rounded-button border border-dark-hairline bg-dark-surface active:opacity-70"
    >
      <Text className="type-button" style={{ color: brandColor }}>
        {label}
      </Text>
      <DarkMeta>↗</DarkMeta>
    </Pressable>
  );
}

/**
 * Out to TMDB's own page, and IMDB's when TMDB has a match. `tmdbId`/`mediaType` are
 * nullable so a caller can pass a Title straight through without checking first — null
 * covers both "still loading" and "a hand-entered Title with no TMDB link at all."
 *
 * No logo images — this app has no TMDB/IMDB logo assets, and reproducing either
 * (IMDB's especially, which has its own badge-usage guidelines) isn't something to
 * improvise without the real files. Each brand's actual colour on the wordmark instead,
 * inside the same button chrome the rest of the app uses.
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
    <View className="mt-5 flex-row gap-3">
      <ExternalLinkButton
        label="TMDB"
        brandColor={TMDB_BRAND}
        onPress={() => Linking.openURL(tmdbUrl(tmdbId, mediaType))}
      />
      {imdb ? (
        <ExternalLinkButton label="IMDb" brandColor={IMDB_BRAND} onPress={() => Linking.openURL(imdb)} />
      ) : null}
    </View>
  );
}
