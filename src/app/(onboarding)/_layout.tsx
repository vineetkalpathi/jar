import { Redirect, Stack } from "expo-router";
import { Loading } from "@/components/loading";
import { useSession } from "@/lib/auth/session";

/**
 * Household creation and joining.
 *
 * Gated on a session and nothing else. It deliberately does not redirect away when the
 * user already belongs to a Household — these same screens are how someone starts a
 * second one later.
 */
export default function OnboardingLayout() {
  const { session, loading } = useSession();

  if (loading) return <Loading />;
  if (!session) return <Redirect href="/sign-in" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
