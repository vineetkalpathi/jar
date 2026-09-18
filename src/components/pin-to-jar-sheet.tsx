/**
 * A Title's jar affordances, both on the Title screen:
 *
 *   - `JarCountBadge` — how many jars this Title is currently in, beside the library
 *     status at the top.
 *   - `PinToJarButton` — a pill that opens a sheet listing the household's jars with the
 *     Title's standing in each. A jar holding it offers Hide; a jar leaving it out offers
 *     Pin; an existing Pin or Hide shows filled and clears on tap (ADR-0011).
 *
 * The sheet stays paper though it opens over the dark Title screen: a jar is the
 * household's own thing, and the household's surfaces stay paper (as `picker-sheet.tsx`).
 */

import { usePowerSync } from "@powersync/react";
import { useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { BottomSheet } from "./sheet";
import { IconTablet } from "./icon-tablet";
import { Eyebrow, Meta } from "./text";
import { jars, type JarRow } from "@/lib/db";
import type { JarStanding, JarStandings } from "@/lib/jars/use-jar-standings";
import { accent, dark, font, ink, paper, radius } from "@/theme";

/**
 * Both controls take their standings rather than fetching them. They sit side by side
 * on the same screen showing two views of one answer, and each computing it separately
 * meant every Jar's Filter was compiled and watched twice over — see
 * `use-jar-standings.ts`. The screen calls `useJarStandings` once and passes it in.
 */

// ---------------------------------------------------------------------------
// Jar count — top of the Title screen
// ---------------------------------------------------------------------------

/**
 * "N jars" — the count of jars this Title falls into right now (by filter or by Pin).
 * Shows "…" until every jar has an answer.
 */
export function JarCountBadge({ standings }: { standings: JarStandings }) {
  const { jars: jarRows, standing, settled } = standings;

  if (jarRows.length === 0) return null;

  // The Library Jar holds every Library Title, so counting it would say nothing.
  const count = jarRows.filter(
    (jar) => !jars.isLibraryJar(jar) && isIn(standing(jar.id)),
  ).length;

  return (
    <View className="flex-row items-center gap-1.5">
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

/** In the jar, however it got there — held by the Filter or forced in by a Pin. */
function isIn(standing: JarStanding): boolean {
  return standing === "present" || standing === "pinned";
}

// ---------------------------------------------------------------------------
// Pin to jar — the glyph button and its sheet
// ---------------------------------------------------------------------------

/**
 * A jar glyph in a 36pt circle, the same shape as the library / seen controls it sits
 * beside at the top of the Title screen. Filled once the Title is in one or more jars,
 * an outline otherwise. Tapping opens the sheet, which explains and carries the action.
 */
export function PinToJarButton({
  titleId,
  standings,
}: {
  titleId: string;
  standings: JarStandings;
}) {
  const [open, setOpen] = useState(false);
  const anyJar = standings.jars.some(
    (jar) => !jars.isLibraryJar(jar) && isIn(standings.standing(jar.id)),
  );

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={
          anyJar ? "Jars this title is in" : "Pin this title to a jar"
        }
        className="active:opacity-70"
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
          ...(anyJar
            ? { backgroundColor: accent.forest }
            : { borderWidth: 1.5, borderColor: accent.forest }),
        }}
      >
        <JarGlyph color={anyJar ? paper.card : accent.forest} size={17} />
      </Pressable>

      <PinToJarSheet
        visible={open}
        titleId={titleId}
        standings={standings}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

function PinToJarSheet({
  visible,
  titleId,
  standings,
  onClose,
}: {
  visible: boolean;
  titleId: string;
  standings: JarStandings;
  onClose: () => void;
}) {
  const { height } = useWindowDimensions();
  const { jars: jarRows, standing } = standings;

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
          <Eyebrow>Jars</Eyebrow>
          <Pressable onPress={onClose} accessibilityRole="button" hitSlop={10}>
            <Text className="type-body text-navy">Done</Text>
          </Pressable>
        </View>
        <Meta>
          Hide this title from a jar it's in, or pin it into one whose filter leaves it
          out.
        </Meta>

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
              <JarPinRow
                key={jar.id}
                jar={jar}
                titleId={titleId}
                standing={standing(jar.id)}
              />
            ))}
          </ScrollView>
        )}
      </View>
    </BottomSheet>
  );
}

/**
 * One jar row: its name and the one action that fits the Title's standing there.
 *
 *   - in the jar (by filter) → outline hide; tap hides it
 *   - hidden                 → filled hide; tap un-hides
 *   - left out by the filter → outline thumbtack; tap pins it
 *   - pinned                 → filled thumbtack; tap unpins
 *
 * Hide is the common case now that every jar starts as the whole Library (ADR-0011).
 */
function JarPinRow({
  jar,
  titleId,
  standing,
}: {
  jar: JarRow;
  titleId: string;
  standing: JarStanding;
}) {
  const db = usePowerSync();
  const [busy, setBusy] = useState(false);

  const act = async () => {
    setBusy(true);
    try {
      if (standing === "pinned" || standing === "hidden") {
        await jars.clearOverride(db, jar.id, titleId);
      } else {
        await jars.setOverride(
          db,
          jar.id,
          titleId,
          standing === "present" ? "exclusion" : "pin",
        );
      }
    } catch (cause) {
      console.warn("[pin-to-jar] toggle failed", jar.id, cause);
    } finally {
      setBusy(false);
    }
  };

  const name = jar.name ?? "Untitled";

  // The Library Jar only leaves out a Title that isn't in the Library, and pinning can't
  // change that — so it never offers Pin.
  const pinnable = !jars.isLibraryJar(jar);

  let control;
  if (standing === "resolving" || (standing === "absent" && !pinnable)) {
    control = (
      <Text className="type-meta-small" style={{ color: ink.faint }}>
        {standing === "resolving" ? "…" : "Not in this jar"}
      </Text>
    );
  } else if (standing === "present" || standing === "hidden") {
    const hidden = standing === "hidden";
    control = (
      <IconTablet
        glyph="hide"
        tone={accent.rust}
        filled={hidden}
        busy={busy}
        onPress={act}
        accessibilityLabel={hidden ? `Un-hide from ${name}` : `Hide from ${name}`}
      />
    );
  } else {
    const pinned = standing === "pinned";
    control = (
      <IconTablet
        glyph="pin"
        tone={accent.forest}
        filled={pinned}
        busy={busy}
        onPress={act}
        accessibilityLabel={pinned ? `Unpin from ${name}` : `Pin to ${name}`}
      />
    );
  }

  return (
    <View className="flex-row items-center justify-between border-b border-hairline py-3">
      <Text className="type-body flex-1 pr-3 text-ink" numberOfLines={1}>
        {name}
      </Text>
      {control}
    </View>
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
