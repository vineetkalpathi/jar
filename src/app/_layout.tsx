import { SessionProvider } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { fontAssets, paper } from "@/theme";
import { PowerSyncContext } from "@powersync/react";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "../global.css";

// Held until the faces are ready. The app is serif-heavy enough that a frame in the
// system font is a visible flash of the wrong design rather than a cosmetic detail.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);

  useEffect(() => {
    // Hide on error too. A missing face falls back to the system serif, which is worse
    // than the design but far better than a splash screen that never leaves.
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <PowerSyncContext value={db}>
        <SessionProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: paper.bg },
            }}
          />
        </SessionProvider>
      </PowerSyncContext>
    </SafeAreaProvider>
  );
}
