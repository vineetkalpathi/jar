/**
 * One TMDB title as a row: poster, name, a caller-supplied meta line, and the shared
 * add/added control. Used identically wherever a list of TMDB titles needs to become
 * addable rows — search results and a person's filmography today — since both are "here
 * is a title, tap it to preview or add it directly," and differ only in what belongs on
 * the meta line.
 */

import { useQuery, usePowerSync } from "@powersync/react";
import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { Tappable } from "./button";
import { LibraryStatus } from "./library-status";
import { Poster } from "./poster";
import { Meta, TitleName } from "./text";
import { library } from "@/lib/db";
import { useUserId } from "@/lib/auth/session";
import { useHousehold } from "@/lib/household/active";
import { posterUrl, type TmdbMediaType } from "@/lib/tmdb";
import { addTmdbTitleToLibrary } from "@/lib/tmdb/import";

export function TitleRow({
  tmdbId,
  mediaType,
  name,
  posterPath,
  meta,
}: {
  tmdbId: number;
  mediaType: TmdbMediaType;
  name: string;
  posterPath: string | null;
  meta: string;
}) {
  const db = usePowerSync();
  const household = useHousehold();
  const userId = useUserId();

  // Live, not a one-time check — the same fix as everywhere else this pattern is used:
  // an add from any screen (this row, the TMDB preview, another device) shows up here
  // the moment the write lands, because `library_entry` is the source of truth, not
  // locally-tracked state.
  const { data: libraryRows } = useQuery<{ title_id: string }>(
    library.LIBRARY_ENTRY_FOR_TMDB_ID,
    [tmdbId, household.id],
  );
  const addedTitleId = libraryRows[0]?.title_id ?? null;

  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const handleAdd = async () => {
    setAdding(true);
    setAddError(null);
    try {
      await addTmdbTitleToLibrary(db, {
        tmdbId,
        mediaType,
        householdId: household.id,
        userId,
      });
    } catch (cause) {
      console.warn("[title-row] could not add", tmdbId, cause);
      setAddError("Couldn't add that — try again.");
    } finally {
      setAdding(false);
    }
  };

  const openDetails = () =>
    addedTitleId
      ? router.push(`/title/${addedTitleId}`)
      : router.push({
          pathname: "/title/tmdb/[tmdbId]",
          params: { tmdbId: String(tmdbId), mediaType },
        });

  return (
    <View className="gap-1 py-3">
      <View className="flex-row items-center gap-3">
        <Tappable onPress={openDetails} accessibilityLabel={`${name} details`} className="flex-1">
          <View className="flex-row items-center gap-3">
            <Poster uri={posterUrl(posterPath, "w154")} width={42} height={62} />
            <View className="flex-1 gap-0.5">
              <TitleName numberOfLines={1}>{name}</TitleName>
              <Meta numberOfLines={1}>{meta}</Meta>
            </View>
          </View>
        </Tappable>

        <LibraryStatus inLibrary={!!addedTitleId} busy={adding} onAdd={handleAdd} />
      </View>
      {addError ? <Text className="type-meta-small text-rust">{addError}</Text> : null}
    </View>
  );
}
