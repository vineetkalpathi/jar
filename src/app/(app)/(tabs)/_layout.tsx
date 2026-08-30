import { Tabs } from "expo-router";
import { FloatingTabBar } from "@/components/floating-tab-bar";

/**
 * The navigation shell: Library · Jars · Explore, left to right, with Jars in the
 * centre as the home. The bar itself is `FloatingTabBar` — declared here rather than
 * left to the default so the screens stay ignorant of it (`(app)/_layout.tsx`).
 *
 * Layers — Jar detail, Title detail, Add-by-hand — live one level up in the `(app)`
 * stack, so they push over this whole thing, bar included.
 */
export default function TabsLayout() {
  return (
    <Tabs
      initialRouteName="jars"
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <FloatingTabBar {...props} />}
    >
      <Tabs.Screen name="library" />
      <Tabs.Screen name="jars" />
      <Tabs.Screen name="explore" />
    </Tabs>
  );
}
