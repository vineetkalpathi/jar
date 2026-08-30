import { useQuery } from "@powersync/react";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { HouseholdRating, type RatingWithCategory } from "@/components/household-rating";
import { LibraryStatus } from "@/components/library-status";
import { Loading } from "@/components/loading";
import { Poster } from "@/components/poster";
import { Screen } from "@/components/screen";
import { TagChips } from "@/components/tag-chips";
import { CastAndCrew, ExternalLinks, TmdbRating, WatchProviders } from "@/components/tmdb-facts";
import { DarkBody, DarkMeta, DarkTitle } from "@/components/text";
import {
  annotations,
  households,
  library,
  type RatingCategoryRow,
  type TagRow,
  type TitleRow,
} from "@/lib/db";
import { useHousehold } from "@/lib/household/active";
import { getTitleDetails, posterUrl, type TmdbMediaType, type TmdbTitleDetails } from "@/lib/tmdb";

/**
 * A Title, read — not handled. The design language's own words for the dark register:
 * no paper, no handwriting, no tape. Genres and language come from the local cache
 * (`title.language`, `title_genre` — written by `lib/tmdb/import.ts`), since those are
 * what Jar filters actually match against (`language` has its own predicate,
 * `filter/types.ts`); the poster, overview, TMDB's own rating and cast/crew are fetched
 * live via `getTitleDetails`, because they're display-only and were never worth caching
 * against ADR-0003's six-month limit.
 *
 * Left out, deliberately: "in N jars" and the "Mark a card" link to Rating entry.
 * The former has no query yet — it would mean compiling every Jar's filter against one
 * Title — and the latter's screen doesn't exist. Both are natural next passes.
 */
export default function TitleDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const household = useHousehold();

  const { data: titleRows, isLoading } = useQuery<TitleRow>(library.TITLE_BY_ID, [id]);
  const title = titleRows[0];

  const { data: genreRows } = useQuery<{ genre: string }>(library.GENRES_FOR_TITLE, [id]);
  const { data: tags } = useQuery<TagRow>(annotations.TAGS_FOR_TITLE, [household.id, id]);
  const { data: categories } = useQuery<RatingCategoryRow>(
    households.CATEGORIES_FOR_HOUSEHOLD,
    [household.id],
  );
  const { data: ratings } = useQuery<RatingWithCategory>(
    annotations.RATINGS_FOR_TITLE_IN_HOUSEHOLD,
    [id, household.id],
  );

  const [tmdb, setTmdb] = useState<TmdbTitleDetails | null>(null);
  const [tmdbStatus, setTmdbStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!title?.tmdb_id || !title.media_type) {
      setTmdbStatus("ready");
      return;
    }
    let active = true;
    setTmdbStatus("loading");
    getTitleDetails(title.tmdb_id, title.media_type as "movie" | "tv")
      .then((details) => {
        if (!active) return;
        setTmdb(details);
        setTmdbStatus("ready");
      })
      .catch((cause) => {
        if (!active) return;
        console.warn("[title] could not fetch TMDB details:", cause);
        setTmdbStatus("error");
      });
    return () => {
      active = false;
    };
  }, [title?.tmdb_id, title?.media_type]);

  if (isLoading) return <Loading />;
  if (!title) return <Loading note="That title isn't here." />;

  const meta = [title.release_year, title.runtime ? `${title.runtime} min` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <Screen register="dark" gutter="form" scroll>
      <View className="flex-row items-center justify-between pb-2 pt-2">
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text className="type-section-title text-dark-ink-secondary">‹</Text>
        </Pressable>
        {/* Every path into this screen originates from the Household's own Library
            (a Jar slip, or "View" right after adding) — always true, never a live check. */}
        <LibraryStatus inLibrary />
      </View>

      <View className="flex-row items-start gap-4">
        <Poster
          // The cached path shows the poster on first paint; the live fetch resolves
          // to the same image, so there's no swap to see.
          uri={posterUrl(tmdb?.posterPath ?? title.poster_path, "w185")}
          width={128}
          height={190}
          register="dark"
        />
        <View className="flex-1 gap-1.5">
          <DarkTitle>{title.name}</DarkTitle>
          {meta ? <Text className="type-title-large text-dark-ink-muted">{meta}</Text> : null}
          {genreRows.length > 0 ? (
            <DarkMeta>{genreRows.map((g) => g.genre).join(" · ")}</DarkMeta>
          ) : null}
          {title.language ? <DarkMeta>{title.language}</DarkMeta> : null}
          <TmdbRating voteAverage={tmdb?.voteAverage} />
          <TagChips tags={tags} />
        </View>
      </View>

      <View className="gap-1.5 pt-5">
        <Overview title={title} tmdb={tmdb} status={tmdbStatus} />
        <CastAndCrew cast={tmdb?.cast ?? []} directors={tmdb?.directors ?? []} />
      </View>

      <WatchProviders providers={tmdb?.watchProviders ?? null} />

      <ExternalLinks
        tmdbId={title.tmdb_id}
        mediaType={title.media_type as TmdbMediaType | null}
        imdbId={tmdb?.imdbId ?? null}
      />

      <HouseholdRating titleId={title.id} categories={categories} ratings={ratings} />
    </Screen>
  );
}

function Overview({
  title,
  tmdb,
  status,
}: {
  title: TitleRow;
  tmdb: TmdbTitleDetails | null;
  status: "loading" | "ready" | "error";
}) {
  if (!title.tmdb_id) {
    return <DarkMeta>Not linked to TMDB — added by hand.</DarkMeta>;
  }
  if (status === "loading") return <DarkMeta>Loading overview…</DarkMeta>;
  if (status === "error") return <DarkMeta>Couldn't reach TMDB for the overview.</DarkMeta>;
  if (!tmdb?.overview) return null;
  return <DarkBody>{tmdb.overview}</DarkBody>;
}
