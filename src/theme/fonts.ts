/**
 * The three faces, mapped from their Google Fonts assets to the names the tokens use.
 *
 * The keys here are what `font-family` resolves to at runtime, so they must match
 * `font` in `tokens.ts` exactly — a typo is a silent fallback to the system face rather
 * than an error, which is easy to miss on a serif-heavy screen.
 *
 * Imported by weight-specific subpath, not from the package root. The root re-exports
 * every weight and italic, and Metro bundles each one it can see: importing three faces
 * that way put 1.5MB of unused .ttf into the app. Add a weight only when a token needs
 * it.
 */

import { AlegreyaSans_400Regular } from "@expo-google-fonts/alegreya-sans/400Regular";
import { AlegreyaSans_500Medium } from "@expo-google-fonts/alegreya-sans/500Medium";
import { AlegreyaSans_700Bold } from "@expo-google-fonts/alegreya-sans/700Bold";
import { Caveat_600SemiBold } from "@expo-google-fonts/caveat/600SemiBold";
import { Vollkorn_400Regular } from "@expo-google-fonts/vollkorn/400Regular";
import { Vollkorn_600SemiBold } from "@expo-google-fonts/vollkorn/600SemiBold";
import { font } from "./tokens";

export const fontAssets = {
  [font.display]: Vollkorn_400Regular,
  [font.displaySemi]: Vollkorn_600SemiBold,
  [font.ui]: AlegreyaSans_400Regular,
  [font.uiMedium]: AlegreyaSans_500Medium,
  [font.uiBold]: AlegreyaSans_700Bold,
  [font.hand]: Caveat_600SemiBold,
};
