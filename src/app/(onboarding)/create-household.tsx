import { usePowerSync } from "@powersync/react";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { Screen } from "@/components/screen";
import { Body, Eyebrow, LayerTitle } from "@/components/text";
import { useUserId } from "@/lib/auth/session";
import { ConstraintError, households } from "@/lib/db";

export default function CreateHousehold() {
  const db = usePowerSync();
  const userId = useUserId();

  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // Local and offline-capable: the household, the membership and the starter
      // Rating Categories are one local transaction, and sync catches up later.
      await households.createHousehold(db, { name, userId });
      router.replace("/jars");
    } catch (cause) {
      setError(
        cause instanceof ConstraintError
          ? cause.message
          : "Couldn't create that household.",
      );
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <View className="flex-1 justify-center gap-8 py-12">
        <View className="gap-2">
          <Eyebrow>New household</Eyebrow>
          <LayerTitle>Give it a name</LayerTitle>
          <Body>
            Something you'd say out loud. You can change it later, and everyone you
            invite will see it.
          </Body>
        </View>

        <Field
          label="Household name"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          autoFocus
          returnKeyType="go"
          onSubmitEditing={submit}
          error={error ?? undefined}
          hint="“The Kalras”, “Thursday Club”, “Us two”"
        />

        <View className="gap-3">
          <Button
            label="Create household"
            onPress={submit}
            loading={busy}
            disabled={!name.trim()}
          />
          <Button label="Back" variant="quiet" onPress={() => router.back()} />
        </View>
      </View>
    </Screen>
  );
}
