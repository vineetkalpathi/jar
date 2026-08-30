import { useQuery, usePowerSync } from "@powersync/react";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { FilterBuilder } from "@/components/filter/filter-builder";
import { MatchBar } from "@/components/filter/match-bar";
import { Loading } from "@/components/loading";
import { Screen } from "@/components/screen";
import { Eyebrow, LayerTitle } from "@/components/text";
import { useUserId } from "@/lib/auth/session";
import { jars, type JarRow } from "@/lib/db";
import { filterToDraft, type FilterDraft } from "@/lib/filter";
import { resolveDraftFilter } from "@/lib/filter/resolve";
import { useFilterMatchCount } from "@/lib/filter/use-match-count";
import { usePreviewFilter } from "@/lib/filter/use-preview-filter";

/**
 * Edit an existing Jar's filter. Pushed from Jar detail. The draft is read back from
 * the stored tree with `filterToDraft`; a tree the sections can't represent comes
 * through as `advanced` and the builder offers to start over rather than mangle it.
 */
export default function EditJarFilter() {
  const { jarId } = useLocalSearchParams<{ jarId: string }>();
  const db = usePowerSync();
  const userId = useUserId();

  const { data: rows, isLoading } = useQuery<JarRow>(
    `select * from jar where id = ?`,
    [jarId],
  );
  const jar = rows[0];

  const initial = useMemo<FilterDraft | null>(() => {
    if (!jar) return null;
    try {
      return filterToDraft(jars.parseJarFilter(jar), userId);
    } catch {
      // An unreadable stored filter. Start from empty rather than blocking the screen.
      return filterToDraft(null, userId);
    }
  }, [jar, userId]);

  const [name, setName] = useState("");
  const [draft, setDraft] = useState<FilterDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (jar && draft === null && initial) {
      setName(jar.name ?? "");
      setDraft(initial);
    }
  }, [jar, draft, initial]);

  const previewFilter = usePreviewFilter(draft ?? filterToDraft(null), userId);
  const { count, pending } = useFilterMatchCount(
    jar?.household_id ?? "",
    previewFilter,
    jarId,
  );

  if (isLoading) return <Loading />;
  if (!jar) return <Loading note="That jar isn't here." />;

  const saveName = () => {
    const next = name.trim();
    if (!next || next === jar.name) return;
    jars.renameJar(db, jar.id, next).catch(() => setName(jar.name ?? ""));
  };

  const save = async () => {
    if (busy || !draft) return;
    setBusy(true);
    setError(null);
    try {
      const filter = await resolveDraftFilter(db, draft, userId);
      await jars.setJarFilter(db, jar.id, filter);
      router.back();
    } catch {
      setError("Couldn't save that filter.");
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <View className="gap-8 pb-16 pt-2">
        <View className="gap-1">
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Text className="type-section-title text-ink-secondary">‹</Text>
          </Pressable>
          <Eyebrow>Filter</Eyebrow>
          <LayerTitle>What goes in</LayerTitle>
        </View>

        <Field
          label="Jar name"
          value={name}
          onChangeText={setName}
          onBlur={saveName}
          onSubmitEditing={saveName}
          autoCapitalize="words"
          returnKeyType="done"
        />

        {draft ? (
          <FilterBuilder
            value={draft}
            onChange={setDraft}
            householdId={jar.household_id ?? ""}
          />
        ) : null}

        <View className="gap-3">
          <MatchBar count={count} pending={pending} />
          {error ? (
            <Text className="type-meta-small text-rust">{error}</Text>
          ) : null}
          <Button label="Save filter" onPress={save} loading={busy} />
        </View>
      </View>
    </Screen>
  );
}
