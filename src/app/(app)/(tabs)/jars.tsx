import { useQuery } from "@powersync/react";
import { router } from "expo-router";
import { FlatList, Pressable, Text, View } from "react-native";
import { TAB_BAR_CLEARANCE } from "@/components/floating-tab-bar";
import { JarTile } from "@/components/jar-tile";
import { Screen } from "@/components/screen";
import { Body, Eyebrow, Meta, ScreenTitle } from "@/components/text";
import { jars, type JarRow } from "@/lib/db";
import { useHousehold } from "@/lib/household/active";
import { useJarCount } from "@/lib/jars/use-jar-count";
import { jar as jarTokens } from "@/theme";

/**
 * The Jars grid — the app's home, the centre tab.
 *
 * The screen still assumes nothing about the shell around it: `FloatingTabBar` wraps it
 * from `(tabs)/_layout.tsx` and the only accommodation here is bottom padding on the
 * scroll so the last row clears the bar.
 */
export default function Jars() {
  const household = useHousehold();
  const { data } = useQuery<JarRow>(jars.JARS_FOR_HOUSEHOLD, [household.id]);

  // A trailing spacer keeps a lone final tile half-width; without it `flex-1`
  // stretches it across both columns and the jar comes out twice as wide as its
  // neighbours.
  const cells: (JarRow | "spacer")[] = [...data];
  if (cells.length % jarTokens.columns !== 0) cells.push("spacer");

  return (
    <Screen gutter="grid">
      <View className="flex-row items-start justify-between pb-6 pt-2">
        <View className="gap-1">
          <Eyebrow>{household.name}</Eyebrow>
          <ScreenTitle>Jars</ScreenTitle>
          <Meta>
            {data.length === 0
              ? "Nothing to draw from yet"
              : `${data.length} ${data.length === 1 ? "jar" : "jars"}`}
          </Meta>
        </View>
        <Pressable
          onPress={() => router.push("/create-jar")}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="New jar"
          className="pt-1 active:opacity-60"
        >
          <Text className="type-screen-title text-ink">＋</Text>
        </Pressable>
      </View>

      <FlatList
        data={cells}
        keyExtractor={(cell) => (typeof cell === "string" ? cell : cell.id)}
        numColumns={jarTokens.columns}
        columnWrapperStyle={{ gap: jarTokens.gapX }}
        contentContainerStyle={{ gap: jarTokens.gapY, paddingBottom: TAB_BAR_CLEARANCE }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={data.length === 0 ? <EmptyNote /> : null}
        renderItem={({ item }) => {
          if (item === "spacer") return <View className="flex-1" />;
          return <JarCell jar={item} />;
        }}
      />
    </Screen>
  );
}

/** Split out so each tile owns its own watched count query. */
function JarCell({ jar }: { jar: JarRow }) {
  const count = useJarCount(jar);

  return (
    <JarTile
      name={jar.name ?? "Untitled"}
      count={count}
      onPress={() => router.push(`/jar/${jar.id}`)}
    />
  );
}

function EmptyNote() {
  return (
    <View className="pb-4">
      <Body>
        A jar is a filter over your library — everything matching goes in, and you shake
        it when nobody can decide.
      </Body>
    </View>
  );
}
