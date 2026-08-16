import { useQuery, usePowerSync } from "@powersync/react";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, View } from "react-native";
import { Button } from "@/components/button";
import { Loading } from "@/components/loading";
import { Screen } from "@/components/screen";
import { Body, Eyebrow, Hand, LayerTitle, Meta } from "@/components/text";
import { jars, type JarRow, type TitleRow } from "@/lib/db";
import type { CompiledQuery } from "@/lib/filter";

/**
 * A Jar and its slips.
 *
 * Partial by design, and worth being clear about what is missing: the filter summary
 * chips, the ⓘ link to Title detail, and the "Shake the jar" CTA. Those depend on the
 * filter builder, the dark register and the draw flow respectively, and each gets its
 * own pass. What is here is the slip list, which is the object the screen is about.
 */
export default function JarDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = usePowerSync();

  const { data: rows, isLoading } = useQuery<JarRow>(`select * from jar where id = ?`, [
    id,
  ]);
  const jar = rows[0];

  const [contents, setContents] = useState<CompiledQuery | null>(null);

  useEffect(() => {
    if (!jar) return;
    let active = true;
    jars
      .jarContentsQuery(db, jar.id)
      .then((query) => active && setContents(query))
      .catch((cause) => console.warn(`[jars] could not read ${jar.id}:`, cause));
    return () => {
      active = false;
    };
  }, [db, jar?.id, jar?.filter]);

  const { data: titles } = useQuery<TitleRow>(
    contents?.sql ?? "select null limit 0",
    contents?.params ?? [],
  );

  if (isLoading) return <Loading />;

  // The Jar was deleted, or its row hasn't synced. Either way there is nothing to show
  // and the grid is the honest place to be.
  if (!jar) return <Loading note="That jar isn't here." />;

  return (
    <Screen gutter="grid">
      <View className="gap-1 pb-6 pt-2">
        <Button label="← Jars" variant="quiet" onPress={() => router.back()} />
        <LayerTitle>{jar.name}</LayerTitle>
        <Meta>
          {titles.length} {titles.length === 1 ? "slip" : "slips"}
        </Meta>
      </View>

      <FlatList
        data={titles}
        keyExtractor={(title) => title.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
        ItemSeparatorComponent={() => <View className="h-px bg-hairline" />}
        ListEmptyComponent={<EmptyJar />}
        renderItem={({ item }) => <Slip title={item} />}
      />
    </Screen>
  );
}

/** The slip itself — a title someone wrote down, so it is set in the hand. */
function Slip({ title }: { title: TitleRow }) {
  const meta = [title.release_year, title.runtime ? `${title.runtime} min` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <View className="gap-0.5 py-3">
      <Hand>{title.name}</Hand>
      {meta ? <Meta>{meta}</Meta> : null}
    </View>
  );
}

function EmptyJar() {
  return (
    <View className="gap-2 py-6">
      <Eyebrow>Empty</Eyebrow>
      <Body>
        This jar has no filter yet, so nothing falls into it. Give it one and everything
        in your library that matches turns up here on its own.
      </Body>
    </View>
  );
}
