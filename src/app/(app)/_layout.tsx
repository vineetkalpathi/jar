import { Redirect, Stack } from "expo-router";
import { Loading } from "@/components/loading";
import { useSession } from "@/lib/auth/session";
import { ActiveHouseholdProvider, useActiveHousehold } from "@/lib/household/active";

/**
 * The signed-in, household-scoped app.
 *
 * Screens below here may assume both a User and a Household, which is what lets
 * `useUserId` and `useHousehold` throw instead of returning null.
 *
 * Note what this layout is not: it is not the navigation shell. The design language
 * leaves swipe-versus-tab-bar undecided, so the shell has to stay swappable — it goes
 * around these screens later without any of them changing.
 */
export default function AppLayout() {
  const { session, loading } = useSession();

  if (loading) return <Loading />;
  if (!session) return <Redirect href="/sign-in" />;

  return (
    <ActiveHouseholdProvider>
      <HouseholdGate />
    </ActiveHouseholdProvider>
  );
}

function HouseholdGate() {
  const { active, loading } = useActiveHousehold();

  if (loading) return <Loading />;

  // Membership can end while the app is open — another member removes you, or the last
  // household is left. Back to the router, which decides where that leaves you.
  if (!active) return <Redirect href="/" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
