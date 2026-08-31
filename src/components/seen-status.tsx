/**
 * "Have you seen this?" — the viewing counterpart of `library-status.tsx`, and it
 * borrows that component's shape on purpose: a 36pt circle, `accent.forest`, outlined
 * when the answer is no (an invitation) and solid when the answer is yes (settled,
 * matching the primary-button treatment). The glyph is a drawn eye rather than a `+`.
 *
 * `SeenStatus` is the bare control — the library rows use it as a one-tap "mark seen".
 * `ViewingStatus` wraps it for the Title screen, where it is just the eye glyph: tapping
 * opens `WatchedDateSheet`, which does the explaining and the marking.
 */

import { usePowerSync, useQuery } from "@powersync/react";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { WatchedDateSheet } from "./watched-date-sheet";
import { annotations, type ViewingRow } from "@/lib/db";
import { watchedOnParts, type WatchPrecision } from "@/lib/time";
import { accent, paper } from "@/theme";

const SIZE = 36;
const BORDER_WIDTH = 1.5;

const tapFeedback = () => {
  try {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  } catch {
    // no haptics on this build
  }
};

/**
 * An almond eye with an iris — drawn, per the app's no-icon-library rule. The outline
 * is a square with two opposite corners fully rounded and the other two nearly sharp;
 * rotating it 45° turns those sharp corners into the inner and outer canthi, so the
 * curved sides read as lids. Same stroke in both states — only the surrounding circle
 * fills, exactly like `library-status.tsx`.
 */
function EyeGlyph({ color }: { color: string }) {
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
          width: 14,
          height: 14,
          transform: [{ rotate: "45deg" }],
          borderWidth: 1.7,
          borderColor: color,
          borderTopLeftRadius: 14,
          borderBottomRightRadius: 14,
          borderTopRightRadius: 1.5,
          borderBottomLeftRadius: 1.5,
        }}
      />
      <View
        style={{
          width: 6.5,
          height: 6.5,
          borderRadius: 3.25,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

export function SeenStatus({
  seen,
  busy = false,
  onPress,
  accessibilityLabel,
}: {
  seen: boolean;
  /** A write is in flight — shows a spinner and blocks another tap. */
  busy?: boolean;
  /** Omit to render a settled badge with no action (the list's "already seen" state). */
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const base = {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  };
  const skin = seen
    ? { backgroundColor: accent.forest }
    : { borderWidth: BORDER_WIDTH, borderColor: accent.forest };
  const glyphColor = seen ? paper.card : accent.forest;
  const label = accessibilityLabel ?? (seen ? "Seen" : "Not seen");

  const inner = busy ? (
    <ActivityIndicator size="small" color={seen ? paper.card : accent.forest} />
  ) : (
    <EyeGlyph color={glyphColor} />
  );

  if (!onPress) {
    return (
      <View style={[base, skin]} accessibilityLabel={label}>
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
      accessibilityLabel={label}
      accessibilityState={{ selected: seen, disabled: busy, busy }}
      style={[base, skin, busy ? { opacity: 0.7 } : null]}
      className="active:opacity-70"
    >
      {inner}
    </Pressable>
  );
}

/**
 * The Title-screen viewing control — just the eye glyph (filled when seen, outline when
 * not). Tapping opens `WatchedDateSheet`, which explains itself and carries the actions:
 * "Mark as seen" / "Mark unwatched" and the rough-date wheels.
 */
export function ViewingStatus({
  titleId,
  userId,
}: {
  titleId: string;
  userId: string;
}) {
  const db = usePowerSync();
  const { data: viewings } = useQuery<ViewingRow>(
    annotations.VIEWINGS_BY_USER_FOR_TITLE,
    [userId, titleId],
  );
  const latest = viewings[0] ?? null;
  const seen = viewings.length > 0;

  const [sheetOpen, setSheetOpen] = useState(false);

  const save = async (on: {
    year: number;
    month: number | null;
    day: number | null;
  }) => {
    try {
      if (latest) await annotations.setViewingDate(db, latest.id, on);
      else await annotations.recordViewing(db, { userId, titleId, on });
    } catch (cause) {
      console.warn("[viewing] could not save date", cause);
    } finally {
      setSheetOpen(false);
    }
  };

  const remove = async () => {
    try {
      await annotations.unmarkLatestViewing(db, { userId, titleId });
    } catch (cause) {
      console.warn("[viewing] could not remove", cause);
    } finally {
      setSheetOpen(false);
    }
  };

  const precision = (latest?.watched_precision ??
    null) as WatchPrecision | null;

  return (
    <>
      <SeenStatus
        seen={seen}
        onPress={() => setSheetOpen(true)}
        accessibilityLabel={seen ? "Your viewing" : "Mark as watched"}
      />
      <WatchedDateSheet
        visible={sheetOpen}
        seen={seen}
        initial={latest?.watched_on ? watchedOnParts(latest.watched_on) : null}
        initialPrecision={precision}
        onClose={() => setSheetOpen(false)}
        onSave={save}
        onRemove={seen ? remove : undefined}
      />
    </>
  );
}
