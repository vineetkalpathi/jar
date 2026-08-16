import { useQuery, usePowerSync } from "@powersync/react";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { Loading } from "@/components/loading";
import { Screen } from "@/components/screen";
import { Body, Eyebrow, LayerTitle } from "@/components/text";
import { useUserId } from "@/lib/auth/session";
import { ConstraintError, households, type HouseholdRow } from "@/lib/db";

/**
 * Fallback only. `householdExists` has already confirmed the code is real and the
 * network is up by the time this starts, so the local write behind it should confirm
 * in well under this — it's a safety net for sync hiccupping after a good validation,
 * not the primary wait.
 */
const SYNC_TIMEOUT_MS = 5_000;

/**
 * Joining by household code.
 *
 * A stopgap: the "code" is the household's id, and an existing member reads it off
 * their own settings screen. It works against the current RLS with no schema change,
 * and it is meant to be replaced by real invites — see `joinHousehold`.
 *
 * The code is checked with `householdExists` before anything is written locally, so a
 * bad code or no connection fails immediately rather than being indistinguishable from
 * a slow sync.
 */
export default function JoinHousehold() {
  const db = usePowerSync();
  const userId = useUserId();

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [joinedId, setJoinedId] = useState<string | null>(null);

  // The membership write is local and instant, but the Household row it points at is
  // not — it only exists here once sync delivers it. Watching the same query the
  // household gate reads means we navigate exactly when the gate would let us through,
  // instead of guessing and bouncing back through `/welcome` when we guess wrong.
  const { data: memberships } = useQuery<HouseholdRow>(households.HOUSEHOLDS_FOR_USER, [
    userId,
  ]);

  useEffect(() => {
    if (joinedId && memberships.some((h) => h.id === joinedId)) {
      router.replace("/jars");
    }
  }, [joinedId, memberships]);

  useEffect(() => {
    if (!joinedId) return;
    // Only reachable here after a confirmed-good code, so this is a defensive fallback
    // for sync lagging behind an already-verified write — not a guess. `/welcome`'s
    // pending-join note takes over if it ever fires.
    const timer = setTimeout(() => router.replace("/welcome"), SYNC_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [joinedId]);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const exists = await households.householdExists(code);
      if (!exists) {
        setError("That code doesn't match a household.");
        setBusy(false);
        return;
      }
      const householdId = await households.joinHousehold(db, { householdId: code, userId });
      setJoinedId(householdId);
    } catch (cause) {
      setError(
        cause instanceof ConstraintError
          ? cause.message
          : cause instanceof Error && /network|fetch failed/i.test(cause.message)
            ? "Couldn't reach the server. Check your connection."
            : "Couldn't join with that code.",
      );
      setBusy(false);
    }
  };

  if (joinedId) return <Loading note="Joining…" />;

  return (
    <Screen scroll>
      <View className="flex-1 justify-center gap-8 py-12">
        <View className="gap-2">
          <Eyebrow>Join a household</Eyebrow>
          <LayerTitle>Paste the code</LayerTitle>
          <Body>
            Someone already in the household can find it in their household settings.
          </Body>
        </View>

        <Field
          label="Household code"
          value={code}
          onChangeText={setCode}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          returnKeyType="go"
          onSubmitEditing={submit}
          error={error ?? undefined}
          hint="A long string of letters, numbers and dashes."
        />

        <View className="gap-3">
          <Button
            label="Join household"
            onPress={submit}
            loading={busy}
            disabled={!code.trim()}
          />
          <Button label="Back" variant="quiet" onPress={() => router.back()} />
        </View>
      </View>
    </Screen>
  );
}
