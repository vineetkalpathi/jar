/**
 * "Have you seen this?" — the viewing counterpart of `library-status.tsx`, and it
 * borrows that component's shape on purpose: a 36pt circle, `accent.forest`, outlined
 * when the answer is no (an invitation) and solid when the answer is yes (settled,
 * matching the primary-button treatment). The glyph is a drawn eye rather than a `+`.
 *
 * `SeenStatus` is the bare control — the library rows use it as a one-tap "mark seen".
 * `ViewingStatus` wraps it for the Title screen: there the eye toggles both ways and a
 * line beside it opens `WatchedDateSheet` to pin down a rough date.
 */

import { usePowerSync, useQuery } from "@powersync/react";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { WatchedDateSheet } from "./watched-date-sheet";
import { annotations, type ViewingRow } from "@/lib/db";
import { formatWatchedOn, watchedOnParts, type WatchPrecision } from "@/lib/time";
import { accent, dark, font, paper } from "@/theme";

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
    <View style={{ width: 22, height: 16, alignItems: "center", justifyContent: "center" }}>
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
      <View style={{ width: 6.5, height: 6.5, borderRadius: 3.25, backgroundColor: color }} />
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
 * The Title-screen viewing block: the eye toggles seen/unseen straight away (today, at
 * `day` precision), and the line beside it opens the sheet to log or refine a rough
 * date. Forest-toned so it reads as *your* status next to TMDB's own rating above it.
 */
export function ViewingStatus({ titleId, userId }: { titleId: string; userId: string }) {
  const db = usePowerSync();
  const { data: viewings } = useQuery<ViewingRow>(annotations.VIEWINGS_BY_USER_FOR_TITLE, [
    userId,
    titleId,
  ]);
  const latest = viewings[0] ?? null;
  const seen = viewings.length > 0;

  const [busy, setBusy] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const toggle = async () => {
    setBusy(true);
    try {
      if (seen) await annotations.unmarkLatestViewing(db, { userId, titleId });
      else await annotations.recordViewing(db, { userId, titleId });
    } catch (cause) {
      console.warn("[viewing] could not toggle", cause);
    } finally {
      setBusy(false);
    }
  };

  const save = async (on: { year: number; month: number | null; day: number | null }) => {
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

  const precision = (latest?.watched_precision ?? null) as WatchPrecision | null;
  const line =
    seen && latest?.watched_on
      ? `Seen · ${formatWatchedOn(latest.watched_on, precision)}`
      : "Unwatched";

  return (
    <View className="flex-row items-center gap-2 pt-4">
      <SeenStatus seen={seen} busy={busy} onPress={toggle} />
      <Pressable
        onPress={() => setSheetOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={seen ? "Edit when you watched it" : "Log when you watched it"}
        className="flex-1 active:opacity-60"
      >
        <Text
          numberOfLines={1}
          style={{
            fontFamily: font.uiMedium,
            fontSize: 12.5,
            letterSpacing: 0.3,
            color: seen ? accent.forest : dark.textMuted,
          }}
        >
          {line}
        </Text>
      </Pressable>

      <WatchedDateSheet
        visible={sheetOpen}
        seen={seen}
        initial={latest?.watched_on ? watchedOnParts(latest.watched_on) : null}
        initialPrecision={precision}
        onClose={() => setSheetOpen(false)}
        onSave={save}
        onRemove={seen ? remove : undefined}
      />
    </View>
  );
}
