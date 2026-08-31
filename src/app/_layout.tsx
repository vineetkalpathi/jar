import { SessionProvider } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { accent, font, fontAssets, ink, paper, radius, type } from "@/theme";
import { PowerSyncContext } from "@powersync/react";
import { useFonts } from "expo-font";
import { Stack, type ErrorBoundaryProps } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "../global.css";

/**
 * The last line before a render error takes the whole app down.
 *
 * There was nothing here, and the app has several deliberate throws below this point:
 * `useHousehold` and `useUserId` throw rather than return null, so that screens inside
 * `(app)` can index by them without a null check at every call site (`session.tsx`,
 * `household/active.tsx`). That is a good trade only if the throw is survivable, and
 * without a boundary any of them — or any other render error — was a fatal JS crash
 * with no way back short of relaunching.
 *
 * Exported from the root layout, so it catches every route beneath it. `retry` re-runs
 * the failed render, which is usually enough: most of these are a screen reading state
 * that has since resolved (a membership that had not synced, a household left on
 * another device).
 *
 * Deliberately plain — react-native primitives and theme constants, no `Screen`, no
 * `Text` wrapper, nothing from `components/`. Whatever just failed, this has to render.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={{ flex: 1, backgroundColor: paper.bg }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          padding: 28,
          gap: 14,
        }}
      >
        <Text style={{ ...type.layerTitle, color: ink.primary }}>
          That didn't go to plan.
        </Text>
        <Text
          style={{
            fontFamily: font.ui,
            fontSize: 16,
            lineHeight: 23,
            color: ink.secondary,
          }}
        >
          Something went wrong drawing this screen. Nothing you've saved is
          affected — it's all on the device and syncs when it can.
        </Text>

        <Text
          style={{
            fontFamily: font.ui,
            fontSize: 13,
            lineHeight: 19,
            color: ink.muted,
            backgroundColor: paper.card,
            borderColor: paper.border,
            borderWidth: 1,
            borderRadius: radius.sheet,
            padding: 12,
            marginTop: 4,
          }}
        >
          {error.message || String(error)}
        </Text>

        <Pressable
          onPress={retry}
          accessibilityRole="button"
          accessibilityLabel="Try again"
          style={{
            marginTop: 8,
            alignSelf: "flex-start",
            backgroundColor: accent.forest,
            paddingVertical: 12,
            paddingHorizontal: 22,
            borderRadius: 999,
          }}
        >
          <Text
            style={{ fontFamily: font.uiMedium, fontSize: 16, color: paper.card }}
          >
            Try again
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

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
    <GestureHandlerRootView style={{ flex: 1 }}>
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
    </GestureHandlerRootView>
  );
}
