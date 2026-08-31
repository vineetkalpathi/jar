/**
 * A Title's jar affordances, both on the Title screen:
 *
 *   - `JarCountBadge` — how many jars this Title is currently in, beside the library
 *     status at the top.
 *   - `PinToJarButton` — a pill that opens a sheet listing the household's jars with the
 *     Title's standing in each (already there via the filter, Pinned, or Hidden), and
 *     offers the Pin action only where none of those apply.
 *
 * The sheet stays paper though it opens over the dark Title screen: a jar is the
 * household's own thing, and the household's surfaces stay paper (as `picker-sheet.tsx`).
 */

import { usePowerSync, useQuery } from "@powersync/react";
import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { BottomSheet } from "./bottom-sheet";
import { IconTablet } from "./icon-tablet";
import { Eyebrow, Meta } from "./text";
import { jars, type JarRow } from "@/lib/db";
import { useJarStanding } from "@/lib/jars/use-jar-standing";
import { accent, dark, font, ink, radius } from "@/theme";

// ---------------------------------------------------------------------------
// Jar count — top of the Title screen
// ---------------------------------------------------------------------------

/**
 * "N jars" — the count of jars this Title falls into right now (by filter or by Pin).
 * Each jar is probed by its own hidden child so the tally scales the way the Jars grid
 * does; the badge shows "…" until every jar has reported.
 */
export function JarCountBadge({
  titleId,
  householdId,
}: {
  titleId: string;
  householdId: string;
}) {
  const { data: jarRows } = useQuery<JarRow>(jars.JARS_FOR_HOUSEHOLD, [
    householdId,
  ]);
  const [inJar, setInJar] = useState<Record<string, boolean>>({});

  const report = useCallback((jarId: string, member: boolean) => {
    setInJar((prev) =>
      prev[jarId] === member ? prev : { ...prev, [jarId]: member },
    );
  }, []);

  if (jarRows.length === 0) return null;

  const settled = jarRows.every((j) => j.id in inJar);
  const count = jarRows.filter((j) => inJar[j.id]).length;

  return (
    <View className="flex-row items-center gap-1.5">
      {jarRows.map((jar) => (
        <JarProbe key={jar.id} jar={jar} titleId={titleId} onResult={report} />
      ))}
      <JarGlyph color={dark.textMuted} size={13} />
      <Text
        style={{
          fontFamily: font.uiMedium,
          fontSize: 12.5,
          letterSpacing: 0.3,
          color: dark.textMuted,
        }}
      >
        {settled ? `${count} ${count === 1 ? "jar" : "jars"}` : "…"}
      </Text>
    </View>
  );
}

/** Renders nothing — reports whether the Title is in this one jar. */
function JarProbe({
  jar,
  titleId,
  onResult,
}: {
  jar: JarRow;
  titleId: string;
  onResult: (jarId: string, member: boolean) => void;
}) {
  const standing = useJarStanding(jar, titleId);
  useEffect(() => {
    if (standing === "resolving") return;
    onResult(jar.id, standing === "pinned" || standing === "present");
  }, [standing, jar.id, onResult]);
  return null;
}

// ---------------------------------------------------------------------------
// Pin to jar — the glyph button and its sheet
// ---------------------------------------------------------------------------

/**
 * A bare jar glyph in a 36pt circle, the same shape as the library / seen controls it
 * sits beside at the top of the Title screen. Tapping opens the sheet, which explains
 * and carries the action.
 */
export function PinToJarButton({
  titleId,
  householdId,
}: {
  titleId: string;
  householdId: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Pin this title to a jar"
        className="active:opacity-70"
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          borderWidth: 1.5,
          borderColor: accent.forest,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <JarGlyph color={accent.forest} size={17} />
      </Pressable>

      <PinToJarSheet
        visible={open}
        titleId={titleId}
        householdId={householdId}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

function PinToJarSheet({
  visible,
  titleId,
  householdId,
  onClose,
}: {
  visible: boolean;
  titleId: string;
  householdId: string;
  onClose: () => void;
}) {
  const { height } = useWindowDimensions();
  const { data: jarRows } = useQuery<JarRow>(
    visible ? jars.JARS_FOR_HOUSEHOLD : "select null limit 0",
    visible ? [householdId] : [],
  );

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View
        className="bg-paper px-6 pb-10 pt-5"
        style={{
          borderTopLeftRadius: radius.sheet,
          borderTopRightRadius: radius.sheet,
        }}
      >
        <View className="flex-row items-center justify-between pb-1">
          <Eyebrow>Pin to a jar</Eyebrow>
          <Pressable onPress={onClose} accessibilityRole="button" hitSlop={10}>
            <Text className="type-body text-navy">Done</Text>
          </Pressable>
        </View>
        <Meta>Force this title into a jar, whatever its filter says.</Meta>

        {jarRows.length === 0 ? (
          <View className="py-6">
            <Meta>No jars in this household yet.</Meta>
          </View>
        ) : (
          <ScrollView
            className="mt-3"
            style={{ maxHeight: height * 0.55 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {jarRows.map((jar) => (
              <JarPinRow key={jar.id} jar={jar} titleId={titleId} />
            ))}
          </ScrollView>
        )}
      </View>
    </BottomSheet>
  );
}

/** One jar row: its name, and either the Pin action or the Title's standing in it. */
function JarPinRow({ jar, titleId }: { jar: JarRow; titleId: string }) {
  const db = usePowerSync();
  const [busy, setBusy] = useState(false);
  const standing = useJarStanding(jar, titleId);

  const pin = async () => {
    setBusy(true);
    try {
      await jars.setOverride(db, jar.id, titleId, "pin");
    } catch (cause) {
      console.warn("[pin-to-jar] pin failed", jar.id, cause);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="flex-row items-center justify-between border-b border-hairline py-3">
      <Text className="type-body flex-1 pr-3 text-ink" numberOfLines={1}>
        {jar.name ?? "Untitled"}
      </Text>

      {standing === "absent" ? (
        // Outline thumbtack — the same control as the jar screens, tap to pin.
        <IconTablet
          glyph="pin"
          tone={accent.forest}
          busy={busy}
          onPress={pin}
          accessibilityLabel={`Pin to ${jar.name}`}
        />
      ) : standing === "pinned" ? (
        // Filled thumbtack, settled — pinned, not an offer.
        <IconTablet
          glyph="pin"
          tone={accent.forest}
          filled
          accessibilityLabel="Pinned"
        />
      ) : (
        <StandingLabel standing={standing} />
      )}
    </View>
  );
}

function StandingLabel({
  standing,
}: {
  standing: "hidden" | "present" | "resolving";
}) {
  const map: Record<
    "hidden" | "present" | "resolving",
    { text: string; color: string }
  > = {
    hidden: { text: "Hidden", color: accent.rust },
    present: { text: "In this jar", color: ink.muted },
    resolving: { text: "…", color: ink.faint },
  };
  const { text, color } = map[standing];
  return (
    <Text className="type-meta-small" style={{ color }}>
      {text}
    </Text>
  );
}

/** A jar — rim rule over an open body. Drawn, per the no-icon-library rule. */
function JarGlyph({ color, size = 15 }: { color: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          width: size * 0.6,
          height: 1.5,
          borderRadius: 1,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          marginTop: 1.5,
          width: size * 0.8,
          height: size * 0.72,
          borderWidth: 1.5,
          borderColor: color,
          borderTopLeftRadius: 2,
          borderTopRightRadius: 2,
          borderBottomLeftRadius: 3,
          borderBottomRightRadius: 3,
        }}
      />
    </View>
  );
}
