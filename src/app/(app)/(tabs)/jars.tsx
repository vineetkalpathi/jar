import { useQuery } from "@powersync/react";
import { router } from "expo-router";
import { FlatList, View } from "react-native";
import { Button } from "@/components/button";
import { TAB_BAR_CLEARANCE } from "@/components/floating-tab-bar";
import { JarTile, NewJarTile } from "@/components/jar-tile";
import { Screen } from "@/components/screen";
import { Body, Eyebrow, Meta, ScreenTitle } from "@/components/text";
import { signOut } from "@/lib/auth/actions";
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

  // The "＋ New jar" tile is a grid cell, not a footer — it sits in the flow so it
  // lands beside the last jar rather than below the grid. A trailing spacer keeps the
  // final row half-width; without it `flex-1` stretches a lone tile across both
  // columns and the jar comes out twice as wide as its neighbours.
  const cells: (JarRow | "new" | "spacer")[] = [...data, "new"];
  if (cells.length % jarTokens.columns !== 0) cells.push("spacer");

  return (
    <Screen gutter="grid">
      <View className="gap-1 pb-6 pt-2">
        <Eyebrow>{household.name}</Eyebrow>
        <ScreenTitle>Jars</ScreenTitle>
        <Meta>
          {data.length === 0
            ? "Nothing to draw from yet"
            : `${data.length} ${data.length === 1 ? "jar" : "jars"}`}
        </Meta>
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
          if (item === "new") {
            return <NewJarTile onPress={() => router.push("/create-jar")} />;
          }
          return <JarCell jar={item} />;
        }}
        ListFooterComponent={<DevSignOutButton />}
      />
    </Screen>
  );
}

// TEMP — testing only, remove before shipping. No sign-out UI exists yet (test-plan.md
// blocker #1); this is the cheapest way to get a signed-out cold start without
// reinstalling the app.
function DevSignOutButton() {
  return (
    <Button
      label="Sign out (dev)"
      variant="quiet"
      onPress={() => void signOut()}
      className="mt-6"
    />
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
