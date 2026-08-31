/**
 * A 36pt circular action, the same shape as `library-status.tsx` / `seen-status.tsx`:
 * outlined in its tone when it is an invitation, solid with a cream glyph when the state
 * it represents is applied, a spinner while a write is in flight. `onPress` omitted → a
 * settled badge with no action.
 *
 * The glyphs are drawn from primitives, per the app's no-icon-library rule.
 */

import * as Haptics from "expo-haptics";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { font, paper } from "@/theme";

/** Fire-and-forget light impact — wrapped because a dev client built before
 *  `expo-haptics` throws synchronously rather than rejecting. */
const tapFeedback = () => {
  try {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  } catch {
    // no haptics on this build
  }
};

/**
 * A thumbtack seen head-on — a round head, a short collar, then a tapered needle.
 */
export function PinGlyph({ color }: { color: string }) {
  return (
    <View
      style={{
        width: 20,
        height: 20,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View style={{ alignItems: "center" }}>
        <View
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            borderWidth: 1.7,
            borderColor: color,
          }}
        />
        <View style={{ width: 2.5, height: 2.5, backgroundColor: color }} />
        <View
          style={{
            width: 0,
            height: 0,
            borderLeftWidth: 2.5,
            borderRightWidth: 2.5,
            borderTopWidth: 5.5,
            borderLeftColor: "transparent",
            borderRightColor: "transparent",
            borderTopColor: color,
          }}
        />
      </View>
    </View>
  );
}

/** An almond eye with a slash across it — the universal "hide" mark. */
export function HideGlyph({ color }: { color: string }) {
  return (
    <View
      style={{
        width: 22,
        height: 16,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          position: "absolute",
          width: 13,
          height: 13,
          transform: [{ rotate: "45deg" }],
          borderWidth: 1.6,
          borderColor: color,
          borderTopLeftRadius: 13,
          borderBottomRightRadius: 13,
          borderTopRightRadius: 1.5,
          borderBottomLeftRadius: 1.5,
        }}
      />
      <View
        style={{
          width: 5.5,
          height: 5.5,
          borderRadius: 2.75,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: "absolute",
          width: 24,
          height: 1.7,
          borderRadius: 1,
          backgroundColor: color,
          transform: [{ rotate: "-45deg" }],
        }}
      />
    </View>
  );
}

export function IconTablet({
  glyph,
  tone,
  filled = false,
  busy = false,
  onPress,
  accessibilityLabel,
}: {
  glyph: "pin" | "hide" | "check";
  tone: string;
  filled?: boolean;
  busy?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const SIZE = 36;
  const base = {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  };
  const skin = filled
    ? { backgroundColor: tone }
    : { borderWidth: 1.5, borderColor: tone };
  const glyphColor = filled ? paper.card : tone;

  const inner = busy ? (
    <ActivityIndicator size="small" color={glyphColor} />
  ) : glyph === "check" ? (
    <Text
      style={{
        fontFamily: font.uiBold,
        fontSize: 20,
        lineHeight: 22,
        color: glyphColor,
      }}
    >
      ✓
    </Text>
  ) : glyph === "pin" ? (
    <PinGlyph color={glyphColor} />
  ) : (
    <HideGlyph color={glyphColor} />
  );

  if (!onPress) {
    return (
      <View style={[base, skin]} accessibilityLabel={accessibilityLabel}>
        {inner}
      </View>
    );
  }
  return (
    <Pressable
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: busy, busy }}
      style={[base, skin, busy ? { opacity: 0.7 } : null]}
      className="active:opacity-70"
    >
      {inner}
    </Pressable>
  );
}
