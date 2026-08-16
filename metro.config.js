const { getDefaultConfig } = require("expo/metro-config");
const { withNativewind } = require("nativewind/metro");

// NativeWind v5 has no `input` option — `src/global.css` is imported by the root
// layout and Metro compiles it through react-native-css. `nativewind-env.d.ts` is
// generated on the first bundle; it is gitignored.
module.exports = withNativewind(getDefaultConfig(__dirname));
