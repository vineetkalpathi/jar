import { Redirect, Stack } from "expo-router";
import { Loading } from "@/components/loading";
import { useSession } from "@/lib/auth/session";

/** Signed out only. A signed-in user landing here is sent back to the router. */
export default function AuthLayout() {
  const { session, loading } = useSession();

  if (loading) return <Loading />;
  if (session) return <Redirect href="/" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
