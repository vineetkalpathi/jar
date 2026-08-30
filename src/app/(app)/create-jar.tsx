import { usePowerSync } from "@powersync/react";
import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { FilterBuilder } from "@/components/filter/filter-builder";
import { MatchBar } from "@/components/filter/match-bar";
import { Screen } from "@/components/screen";
import { Body, Eyebrow, LayerTitle } from "@/components/text";
import { useUserId } from "@/lib/auth/session";
import { ConstraintError, jars } from "@/lib/db";
import { emptyDraft, type FilterDraft } from "@/lib/filter";
import { resolveDraftFilter } from "@/lib/filter/resolve";
import { useFilterMatchCount } from "@/lib/filter/use-match-count";
import { usePreviewFilter } from "@/lib/filter/use-preview-filter";
import { useHousehold } from "@/lib/household/active";

/**
 * A new Jar. The filter is the jar: you name it, say what falls in, and the two are
 * saved together. Leaving the builder untouched makes a hand-curated Jar — its Pins
 * alone, empty until something is pinned — which is a real state, not a placeholder.
 */
export default function CreateJar() {
  const db = usePowerSync();
  const household = useHousehold();
  const userId = useUserId();

  const [name, setName] = useState("");
  const [draft, setDraft] = useState<FilterDraft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const previewFilter = usePreviewFilter(draft, userId);
  const { count, pending } = useFilterMatchCount(household.id, previewFilter);

  const create = async (withFilter: boolean) => {
    if (busy || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const filter = withFilter
        ? await resolveDraftFilter(db, draft, userId)
        : null;
      const jarId = await jars.createJar(db, {
        householdId: household.id,
        name,
        filter,
      });
      router.replace(`/jar/${jarId}`);
    } catch (cause) {
      setError(
        cause instanceof ConstraintError
          ? cause.message
          : "Couldn't create that jar.",
      );
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <View className="gap-8 pb-16 pt-12">
        <View className="gap-2">
          <Eyebrow>New jar</Eyebrow>
          <LayerTitle>What's it for?</LayerTitle>
          <Body>
            Name it for the mood, then say what goes in. Everything in your library that
            matches falls in on its own.
          </Body>
        </View>

        <Field
          label="Jar name"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          returnKeyType="next"
          hint="“Friday night”, “Long haul”, “Nobody's seen it”"
        />

        <FilterBuilder value={draft} onChange={setDraft} householdId={household.id} />

        <View className="gap-3">
          <MatchBar count={count} pending={pending} />
          {error ? (
            <Text className="type-meta-small text-rust">{error}</Text>
          ) : null}
          <Button
            label="Create jar"
            onPress={() => create(true)}
            loading={busy}
            disabled={!name.trim()}
          />
          <Button
            label="Create without a filter"
            variant="quiet"
            onPress={() => create(false)}
          />
        </View>
      </View>
    </Screen>
  );
}
