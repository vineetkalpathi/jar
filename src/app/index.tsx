/**
 * Where a launch lands.
 *
 * Three questions in order: is there a session, has the replica caught up, and does
 * this user belong to a Household yet. Getting the middle one wrong is the interesting
 * failure — a fresh install has an empty replica for a moment, and reading that as
 * "no households" walks an existing member through creating a new one.
 */

import { useQuery, useStatus } from "@powersync/react";
import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { Loading } from "@/components/loading";
import { useSession } from "@/lib/auth/session";
import { db, households, type HouseholdRow } from "@/lib/db";

export default function Index() {
  const { session, loading } = useSession();

  if (loading) return <Loading />;
  if (!session) return <Redirect href="/sign-in" />;

  return <HouseholdRouter userId={session.user.id} />;
}

function HouseholdRouter({ userId }: { userId: string }) {
  const status = useStatus();
  const { data: memberships, isLoading } = useQuery<HouseholdRow>(
    households.HOUSEHOLDS_FOR_USER,
    [userId],
  );

  // `status.hasSynced` and this `useQuery` are two independent subscriptions — a
  // checkpoint can commit and flip `hasSynced` a render before the query's own listener
  // re-fires with the newly-applied rows. Trusting an empty `memberships` on that one
  // stale render sends an existing member to create a second household. A direct,
  // un-cached read confirms the table is actually empty before acting on it.
  const [confirmedEmpty, setConfirmedEmpty] = useState(false);
  const looksEmpty = !isLoading && memberships.length === 0 && status.hasSynced === true;

  useEffect(() => {
    if (!looksEmpty) {
      setConfirmedEmpty(false);
      return;
    }
    let active = true;
    void db
      .getAll<HouseholdRow>(households.HOUSEHOLDS_FOR_USER, [userId])
      .then((rows) => {
        if (active && rows.length === 0) setConfirmedEmpty(true);
      });
    return () => {
      active = false;
    };
  }, [looksEmpty, userId]);

  if (isLoading) return <Loading />;

  if (memberships.length > 0) return <Redirect href="/jars" />;

  // No households locally — which is either the truth or an empty replica. Only the
  // completed first sync tells them apart.
  //
  // `hasSynced` is persisted, so this waits on the very first launch after install and
  // never again. That launch necessarily had connectivity, because signing in did.
  if (!status.hasSynced || !confirmedEmpty) return <Loading note="Catching up…" />;

  return <Redirect href="/welcome" />;
}
