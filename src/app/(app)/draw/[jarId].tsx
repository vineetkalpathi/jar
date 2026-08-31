/**
 * The Draw flow — its own ground (`paper-deep`), set apart from the jar.
 *
 * Four phases, deliberately slow (see the design language's §5):
 *
 *   shake (750ms)  → knockout grid  → pause (900ms)  → reveal
 *
 * The slate is frozen the moment `startDraw` runs; the shake is theatre over an already
 * decided set. Knockout is the veto — tap a slip to take it out of tonight, not out of
 * the jar — and when one Candidate is left the pause runs and the winner is revealed.
 * "Saucy" (count 1) skips the grid: one slip, straight through.
 *
 * Participants are just the drawer for now — a "who's here tonight" picker (guests
 * included) is a later pass. It matters only on "Start watching", which records a
 * Viewing per participant via `finishAsWatched`.
 */

import { useQuery, usePowerSync } from "@powersync/react";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { Screen } from "@/components/screen";
import { Body, Eyebrow, Meta } from "@/components/text";
import { useUserId } from "@/lib/auth/session";
import { draws, type TitleRow } from "@/lib/db";
import { accent, font, ink, motion, paper, radius, shadow } from "@/theme";

type Phase = "shake" | "knockout" | "pause" | "reveal";
type CandidateRow = TitleRow & { knocked_out_at: string | null };

/** Fire-and-forget haptic — wrapped, a dev client built before `expo-haptics` throws
 *  synchronously rather than rejecting. */
function tap(fire: () => Promise<unknown> | void) {
  try {
    const result = fire();
    if (result && typeof (result as Promise<unknown>).catch === "function") {
      (result as Promise<unknown>).catch(() => {});
    }
  } catch {
    // no haptics on this build
  }
}

function metaLine(t: {
  release_year: number | null;
  runtime: number | null;
  media_type: string | null;
}): string {
  return [
    t.release_year,
    t.runtime ? `${t.runtime} min` : null,
    t.media_type === "tv"
      ? "TV series"
      : t.media_type === "movie"
        ? "Movie"
        : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function DrawFlow() {
  const { jarId, count: countParam, saucy: saucyParam } = useLocalSearchParams<{
    jarId: string;
    count?: string;
    saucy?: string;
  }>();
  const db = usePowerSync();
  const userId = useUserId();

  const count = Math.max(1, Number(countParam) || 1);
  const saucy = saucyParam === "1";

  const [drawId, setDrawId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("shake");
  const [error, setError] = useState<"empty" | "failed" | null>(null);
  // Bumped by "Shake again" to re-run the start effect with a fresh Draw.
  const [nonce, setNonce] = useState(0);
  const finishedRef = useRef(false);
  const knockBusyRef = useRef(false);

  // Start (or restart) the Draw.
  useEffect(() => {
    let active = true;
    setDrawId(null);
    setPhase("shake");
    setError(null);
    finishedRef.current = false;

    (async () => {
      try {
        // Don't leave a half-finished Draw behind us.
        const stale = await draws.activeDraw(db, jarId);
        if (stale && active) {
          await draws.finishWithoutWatching(db, stale.id, "no_pick");
        }
        const id = await draws.startDraw(db, {
          jarId,
          n: count,
          participantIds: [userId],
        });
        if (active) setDrawId(id);
      } catch (cause) {
        if (!active) return;
        if (cause instanceof draws.EmptyJarError) setError("empty");
        else {
          console.warn("[draw] could not start", jarId, cause);
          setError("failed");
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [jarId, count, nonce, db, userId]);

  // If we leave mid-Draw, record it as no_pick — the served titles still feed Cooldown.
  useEffect(() => {
    return () => {
      if (drawId && !finishedRef.current) {
        draws
          .finishWithoutWatching(db, drawId, "no_pick")
          .catch(() => {});
      }
    };
  }, [drawId, db]);

  const { data: candidates } = useQuery<CandidateRow>(
    drawId ? draws.CANDIDATES_FOR_DRAW : "select null limit 0",
    drawId ? [drawId] : [],
  );

  const survivors = useMemo(
    () => candidates.filter((c) => c.knocked_out_at == null),
    [candidates],
  );

  // shake → knockout, or straight to the pause when there is nothing to knock out.
  useEffect(() => {
    if (!drawId || phase !== "shake") return;
    const timer = setTimeout(async () => {
      try {
        const served = await draws.survivors(db, drawId);
        setPhase(saucy || served.length <= 1 ? "pause" : "knockout");
      } catch (cause) {
        console.warn("[draw] could not read the slate", cause);
        setError("failed");
      }
    }, motion.draw.shake);
    return () => clearTimeout(timer);
  }, [drawId, phase, saucy, db]);

  // knockout → pause, once one Candidate is left standing.
  useEffect(() => {
    if (phase !== "knockout" || !drawId || survivors.length !== 1) return;
    const timer = setTimeout(
      () => setPhase("pause"),
      motion.draw.knockOut + 120,
    );
    return () => clearTimeout(timer);
  }, [phase, drawId, survivors.length]);

  // pause → reveal. The dead air is a feature; do not shorten it.
  useEffect(() => {
    if (phase !== "pause") return;
    const timer = setTimeout(() => setPhase("reveal"), motion.draw.pause);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase === "reveal") {
      tap(() =>
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
      );
    }
  }, [phase]);

  const knockOut = async (titleId: string) => {
    if (
      phase !== "knockout" ||
      survivors.length <= 1 ||
      knockBusyRef.current ||
      !drawId
    ) {
      return;
    }
    knockBusyRef.current = true;
    tap(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
    try {
      await draws.knockOut(db, drawId, titleId);
    } catch (cause) {
      console.warn("[draw] knock out failed", cause);
    } finally {
      knockBusyRef.current = false;
    }
  };

  const putThemBack = async () => {
    if (!drawId) return;
    tap(() => Haptics.selectionAsync());
    try {
      await Promise.all(
        candidates
          .filter((c) => c.knocked_out_at != null)
          .map((c) => draws.restoreCandidate(db, drawId, c.id)),
      );
    } catch (cause) {
      console.warn("[draw] could not restore candidates", cause);
    }
  };

  const winner = survivors[0] ?? candidates[0] ?? null;
  const knockedCount = Math.max(0, candidates.length - 1);
  const revealSub = saucy
    ? "Straight out of the jar. No arguing."
    : knockedCount > 0
      ? `${knockedCount} knocked out · everything goes back in`
      : "Straight out of the jar.";

  const startWatching = async () => {
    if (!winner || !drawId) return;
    finishedRef.current = true;
    try {
      await draws.finishAsWatched(db, drawId, winner.id);
    } catch (cause) {
      console.warn("[draw] could not finish the draw", cause);
    }
    router.replace(`/title/${winner.id}`);
  };

  const shakeAgain = async () => {
    if (drawId) {
      finishedRef.current = true;
      try {
        await draws.finishWithoutWatching(db, drawId, "no_pick");
      } catch {
        // a stale in_progress row is harmless; the next start sweeps it
      }
    }
    setNonce((n) => n + 1);
  };

  return (
    <Screen register="paper-deep" gutter="none">
      <View className="flex-1">
        {error ? (
          <DrawError kind={error} jarId={jarId} />
        ) : phase === "shake" ? (
          <ShakeStage />
        ) : phase === "knockout" ? (
          <KnockoutStage
            candidates={candidates}
            survivorCount={survivors.length}
            onKnockOut={knockOut}
            onPutThemBack={putThemBack}
          />
        ) : phase === "pause" ? (
          <PauseStage />
        ) : (
          <RevealStage
            winner={winner}
            sub={revealSub}
            onStartWatching={startWatching}
            onShakeAgain={shakeAgain}
          />
        )}
      </View>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

function ShakeStage() {
  // The whole cluster judders on a fast axis; the slips fling around inside it.
  const rumble = useSharedValue(0);

  useEffect(() => {
    rumble.value = withRepeat(
      withTiming(1, { duration: 70, easing: Easing.linear }),
      -1,
      true,
    );
    tap(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
    const pulse = setInterval(
      () => tap(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
      140,
    );
    return () => {
      cancelAnimation(rumble);
      clearInterval(pulse);
    };
  }, [rumble]);

  const clusterStyle = useAnimatedStyle(() => {
    const s = rumble.value - 0.5;
    return {
      transform: [
        { translateX: s * 22 },
        { translateY: s * -16 },
        { rotate: `${s * 4}deg` },
      ],
    };
  });

  return (
    <View className="flex-1 items-center justify-center">
      <Animated.View style={[{ width: 280, height: 280 }, clusterStyle]}>
        <JitterSlip style={{ left: 30, top: 40, width: 150 }} i={0} />
        <JitterSlip style={{ left: 90, top: 98, width: 170 }} i={1} />
        <JitterSlip style={{ left: 16, top: 154, width: 190 }} i={2} />
        <JitterSlip style={{ left: 74, top: 212, width: 140 }} i={3} />
      </Animated.View>
      <Text
        className="pt-6"
        style={{ fontFamily: font.display, fontSize: 24, color: ink.secondary }}
      >
        Shaking the jar…
      </Text>
    </View>
  );
}

/**
 * A blank slip, flung around. Two independent oscillators (fast X/rotation, slightly
 * slower Y) on their own tempo per slip, so the four never sync up.
 */
function JitterSlip({ style, i }: { style: ViewStyle; i: number }) {
  const x = useSharedValue((i * 0.17) % 1);
  const y = useSharedValue((i * 0.41) % 1);

  useEffect(() => {
    x.value = withRepeat(
      withTiming(1, {
        duration: 120 + i * 22,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      true,
    );
    y.value = withRepeat(
      withTiming(1, {
        duration: 170 + i * 16,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(x);
      cancelAnimation(y);
    };
  }, [x, y, i]);

  const animated = useAnimatedStyle(() => {
    const sx = x.value - 0.5;
    const sy = y.value - 0.5;
    return {
      transform: [
        { translateX: sx * (52 + i * 9) },
        { translateY: sy * (40 + i * 6) },
        { rotate: `${sx * (i % 2 ? 24 : -28)}deg` },
        { scale: 1 + Math.abs(sy) * 0.09 },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          height: 34,
          backgroundColor: paper.card,
          borderWidth: 1,
          borderColor: paper.border,
          borderRadius: 3,
        },
        style,
        animated,
      ]}
    />
  );
}

function KnockoutStage({
  candidates,
  survivorCount,
  onKnockOut,
  onPutThemBack,
}: {
  candidates: CandidateRow[];
  survivorCount: number;
  onKnockOut: (titleId: string) => void;
  onPutThemBack: () => void;
}) {
  const cols = candidates.length <= 3 ? 1 : 2;
  const anyOut = candidates.some((c) => c.knocked_out_at != null);

  return (
    <View className="flex-1">
      <View className="px-6 pt-2">
        <BackChevron />
      </View>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="items-center pb-5 pt-2">
          <Eyebrow>{candidates.length} drawn</Eyebrow>
          <Text
            className="pt-1.5"
            style={{ fontFamily: font.display, fontSize: 28, color: ink.primary }}
          >
            {survivorCount} left
          </Text>
          <Meta className="pt-1">
            Tap a slip to knock it out. Not tonight — not forever.
          </Meta>
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 11 }}>
          {candidates.map((c, idx) => (
            <View key={c.id} style={{ width: cols === 1 ? "100%" : "48%" }}>
              <CandidateCard
                title={c}
                index={idx}
                knockedOut={c.knocked_out_at != null}
                disabled={survivorCount <= 1}
                onPress={() => onKnockOut(c.id)}
              />
            </View>
          ))}
        </View>

        {anyOut ? (
          <View className="items-center pt-5">
            <Pressable
              onPress={onPutThemBack}
              accessibilityRole="button"
              accessibilityLabel="Put them all back"
              className="active:opacity-60"
            >
              <Text
                className="type-meta text-ink-muted"
                style={{
                  borderBottomWidth: 1,
                  borderColor: paper.border,
                  paddingBottom: 2,
                }}
              >
                Put them back
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const TILTS = [-4, 3, -2.5, 4, -3.5, 2.5, -4, 3];

function CandidateCard({
  title,
  index,
  knockedOut,
  disabled,
  onPress,
}: {
  title: CandidateRow;
  index: number;
  knockedOut: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const k = useSharedValue(knockedOut ? 1 : 0);
  const tilt = TILTS[index % TILTS.length];

  useEffect(() => {
    k.value = withTiming(knockedOut ? 1 : 0, {
      duration: motion.draw.knockOut,
      easing: Easing.out(Easing.cubic),
    });
  }, [knockedOut, k]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: 1 - k.value * 0.66,
    transform: [
      { scale: 1 - k.value * 0.06 },
      { rotate: `${k.value * tilt}deg` },
    ],
  }));
  const strikeStyle = useAnimatedStyle(() => ({ opacity: k.value }));

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || knockedOut}
      accessibilityRole="button"
      accessibilityLabel={`Knock out ${title.name}`}
      className="active:opacity-90"
    >
      <Animated.View
        style={[
          {
            minHeight: 104,
            padding: 13,
            borderRadius: radius.card,
            borderWidth: 1,
            borderColor: paper.border,
            backgroundColor: paper.card,
            justifyContent: "space-between",
          },
          shadow.slip,
          cardStyle,
        ]}
      >
        <Text
          style={{
            fontFamily: font.hand,
            fontSize: 22,
            lineHeight: 25,
            color: ink.primary,
          }}
        >
          {title.name}
        </Text>
        <Text
          style={{
            fontFamily: font.ui,
            fontSize: 11.5,
            color: ink.muted,
            marginTop: 8,
          }}
        >
          {metaLine(title)}
        </Text>
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              left: 8,
              right: 8,
              top: "50%",
              height: 2,
              backgroundColor: accent.rust,
              transform: [{ rotate: "-4deg" }],
            },
            strikeStyle,
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}

function PauseStage() {
  const p = useSharedValue(0);

  useEffect(() => {
    p.value = withRepeat(
      withTiming(1, { duration: 600, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => cancelAnimation(p);
  }, [p]);

  const dot = useAnimatedStyle(() => ({
    opacity: 0.35 + p.value * 0.65,
    transform: [{ scale: 0.85 + p.value * 0.3 }],
  }));

  return (
    <View className="flex-1 items-center justify-center">
      <Animated.View
        style={[
          { width: 9, height: 9, borderRadius: 5, backgroundColor: accent.amber },
          dot,
        ]}
      />
    </View>
  );
}

function RevealStage({
  winner,
  sub,
  onStartWatching,
  onShakeAgain,
}: {
  winner: TitleRow | null;
  sub: string;
  onStartWatching: () => void;
  onShakeAgain: () => void;
}) {
  const fade = useSharedValue(0);
  const glow = useSharedValue(0);

  useEffect(() => {
    fade.value = withTiming(1, {
      duration: motion.draw.reveal,
      easing: Easing.out(Easing.cubic),
    });
    glow.value = withRepeat(
      withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => cancelAnimation(glow);
  }, [fade, glow]);

  const fadeStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateY: (1 - fade.value) * 10 }],
  }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: 0.25 + glow.value * 0.5 }));

  return (
    <View className="flex-1 items-center justify-center px-7">
      <View className="absolute left-0 top-0 px-6 pt-2">
        <BackChevron />
      </View>

      <Animated.View style={[{ width: "100%", alignItems: "center" }, fadeStyle]}>
        <Eyebrow>Tonight</Eyebrow>

        <View style={{ width: "100%", marginTop: 20 }}>
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                left: -3,
                right: -3,
                top: -3,
                bottom: -3,
                borderRadius: radius.card + 3,
                borderWidth: 2,
                borderColor: accent.amber,
              },
              ringStyle,
            ]}
          />
          <View
            style={[
              {
                width: "100%",
                backgroundColor: paper.card,
                borderWidth: 1,
                borderColor: accent.amber,
                borderRadius: radius.card,
                paddingVertical: 34,
                paddingHorizontal: 24,
                alignItems: "center",
              },
              shadow.lifted,
            ]}
          >
            <View
              style={{
                position: "absolute",
                top: -11,
                left: "50%",
                marginLeft: -37,
                width: 74,
                height: 22,
                backgroundColor: paper.jar,
                borderWidth: 1,
                borderColor: paper.border,
                transform: [{ rotate: "-1.5deg" }],
              }}
            />
            <Text
              style={{
                fontFamily: font.hand,
                fontSize: 42,
                lineHeight: 44,
                color: ink.primary,
                textAlign: "center",
              }}
            >
              {winner?.name ?? "—"}
            </Text>
            {winner ? (
              <Text
                style={{
                  fontFamily: font.ui,
                  fontSize: 12.5,
                  color: ink.muted,
                  marginTop: 10,
                }}
              >
                {metaLine(winner)}
              </Text>
            ) : null}
          </View>
        </View>

        <Meta className="pt-3.5 text-center">{sub}</Meta>

        <View style={{ width: "100%", marginTop: 24, gap: 9 }}>
          <Pressable
            onPress={onStartWatching}
            accessibilityRole="button"
            accessibilityLabel="Start watching"
            className="items-center rounded-button bg-forest py-4 active:bg-forest-pressed"
          >
            <Text className="type-button text-card">Start watching</Text>
          </Pressable>
          <Pressable
            onPress={onShakeAgain}
            accessibilityRole="button"
            accessibilityLabel="Shake again"
            className="items-center rounded-button border py-3.5 active:opacity-60"
            style={{ borderColor: paper.border }}
          >
            <Text className="type-meta text-navy">Shake again</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

function BackChevron() {
  return (
    <Pressable
      onPress={() => router.back()}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel="Back"
      className="active:opacity-60"
    >
      <Text className="type-section-title text-ink-secondary">‹</Text>
    </Pressable>
  );
}

function DrawError({
  kind,
  jarId,
}: {
  kind: "empty" | "failed";
  jarId: string;
}) {
  return (
    <View className="flex-1 px-6">
      <View className="pt-2">
        <BackChevron />
      </View>
      <View className="flex-1 justify-center gap-3">
        <Eyebrow>{kind === "empty" ? "Nothing to draw" : "Didn't start"}</Eyebrow>
        <Body>
          {kind === "empty"
            ? "This jar's filter doesn't match anything right now. Widen the filter or pin a title in, then shake again."
            : "That draw didn't get going. Head back and try once more."}
        </Body>
        {kind === "empty" ? (
          <Pressable
            onPress={() => router.replace(`/filter/${jarId}`)}
            accessibilityRole="button"
            accessibilityLabel="Edit filter"
            className="self-start rounded-full border px-4 py-2 active:opacity-60"
            style={{ borderColor: paper.border }}
          >
            <Text className="type-meta text-navy">Edit filter</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
