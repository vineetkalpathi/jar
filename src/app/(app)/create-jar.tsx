import { usePowerSync } from "@powersync/react";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
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
 * A new Jar. It starts as the whole Library and each filter narrows it (ADR-0011) —
 * which is what the match count has always shown. Leaving the builder untouched makes a
 * second whole-library Jar, which is allowed; the filter can be added later.
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

  const create = async () => {
    if (busy || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      // An untouched builder resolves to `null` — the whole Library.
      const filter = await resolveDraftFilter(db, draft, userId);
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
    <Screen
      scroll
      keyboardHidesFooter
      footer={
        <View className="gap-2">
          {error ? (
            <Text className="type-meta-small text-rust">{error}</Text>
          ) : null}
          <View className="flex-row items-center gap-3">
            <MatchBar count={count} pending={pending} compact />
            <Button
              label="Create jar"
              pill
              onPress={create}
              loading={busy}
              disabled={!name.trim()}
            />
          </View>
        </View>
      }
    >
      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Back"
        className="pt-2 active:opacity-60"
      >
        <Text className="type-section-title text-ink-secondary">‹</Text>
      </Pressable>

      <View className="gap-8 pb-8 pt-6">
        <View className="gap-2">
          <Eyebrow>New jar</Eyebrow>
          <LayerTitle>What's it for?</LayerTitle>
          <Body>
            Name it for the mood. It starts with your whole library — each filter you
            add narrows it down.
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
      </View>
    </Screen>
  );
}
