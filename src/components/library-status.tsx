/**
 * Whether a Title is in the Household's Library — a circular action in the corner
 * rather than a bottom button/text pair, so it reads as chrome around the screen
 * rather than competing with the screen's own content for attention.
 *
 * Two states, deliberately different treatments: not-added is outlined — an invitation,
 * green (`accent.forest`, the app's one "positive/go" colour) on transparent — while
 * added is solid, matching the app's own primary-button treatment (`bg-forest`, cream
 * glyph), because that one's settled rather than offered.
 */

import * as Haptics from "expo-haptics";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { accent, font, paper } from "@/theme";

const SIZE = 36;
const BORDER_WIDTH = 1.5;
const GLYPH = { fontFamily: font.uiBold, fontSize: 20, lineHeight: 22 };

/**
 * Fire-and-forget light impact on tapping add. Wrapped because a dev client built
 * before `expo-haptics` was added throws synchronously rather than rejecting.
 */
const tapFeedback = () => {
  try {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  } catch {
    // no haptics on this build
  }
};

export function LibraryStatus({
  inLibrary,
  busy = false,
  onAdd,
}: {
  inLibrary: boolean;
  /** Add in flight — shows a spinner and blocks another tap. */
  busy?: boolean;
  /** Omit once `inLibrary` is true, or on a screen where adding isn't the action at all. */
  onAdd?: () => void;
}) {
  // Already added, or nothing to do about it here (the linked Title detail screen,
  // where "in the Library" is simply always true) — settled, not offered.
  if (inLibrary || !onAdd) {
    return (
      <View
        style={{ width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: accent.forest }}
        className="items-center justify-center"
        accessibilityLabel={inLibrary ? "In your library" : undefined}
      >
        <Text style={[GLYPH, { color: paper.card }]}>✓</Text>
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => {
        tapFeedback();
        onAdd();
      }}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel="Add to library"
      accessibilityState={{ disabled: busy, busy }}
      style={{
        width: SIZE,
        height: SIZE,
        borderRadius: SIZE / 2,
        borderWidth: BORDER_WIDTH,
        borderColor: accent.forest,
      }}
      className={`items-center justify-center active:opacity-70 ${busy ? "opacity-70" : ""}`}
    >
      {busy ? (
        <ActivityIndicator size="small" color={accent.forest} />
      ) : (
        <Text style={[GLYPH, { color: accent.forest }]}>+</Text>
      )}
    </Pressable>
  );
}
