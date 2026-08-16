import { usePowerSync } from "@powersync/react";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { Screen } from "@/components/screen";
import { Body, Eyebrow, LayerTitle } from "@/components/text";
import { ConstraintError, jars } from "@/lib/db";
import { useHousehold } from "@/lib/household/active";

/**
 * A new Jar, name only.
 *
 * It is created with no Filter, which the model defines as a hand-curated Jar: its Pins
 * alone, and empty until something is pinned. That is a real state rather than a
 * placeholder — the filter builder is a separate screen and gets its own pass.
 */
export default function CreateJar() {
  const db = usePowerSync();
  const household = useHousehold();

  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const jarId = await jars.createJar(db, { householdId: household.id, name });
      router.replace(`/jar/${jarId}`);
    } catch (cause) {
      setError(
        cause instanceof ConstraintError ? cause.message : "Couldn't create that jar.",
      );
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <View className="flex-1 justify-center gap-8 py-12">
        <View className="gap-2">
          <Eyebrow>New jar</Eyebrow>
          <LayerTitle>What's it for?</LayerTitle>
          <Body>
            Name it for the mood, not the contents — you'll say what goes in it next.
          </Body>
        </View>

        <Field
          label="Jar name"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          autoFocus
          returnKeyType="go"
          onSubmitEditing={submit}
          error={error ?? undefined}
          hint="“Friday night”, “Long haul”, “Nobody's seen it”"
        />

        <View className="gap-3">
          <Button
            label="Create jar"
            onPress={submit}
            loading={busy}
            disabled={!name.trim()}
          />
          <Button label="Cancel" variant="quiet" onPress={() => router.back()} />
        </View>
      </View>
    </Screen>
  );
}
