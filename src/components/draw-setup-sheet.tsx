/**
 * Draw setup — "How many slips?", raised over the jar.
 *
 * A paper bottom sheet, matching `JarOptionsSheet` rather than the platform sheet: one
 * bounded count on a big-numeral stepper (2 up to the jar's size, capped at 10), then
 * "I'm feelin' saucy" — one slip, no knocking out. The CTA copy follows the choice;
 * dismissing returns to the jar.
 *
 * The warm words ("shake", "saucy") are button copy only — the flow itself is a Draw.
 */

import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { BottomSheet } from "@/components/bottom-sheet";
import { Meta } from "@/components/text";
import { accent, font, ink, paper, radius } from "@/theme";

const CARD_RADIUS = 16;
const HARD_MAX = 10;
const HARD_MIN = 2;
const DEFAULT_COUNT = 5;
/** Hold a stepper key: first repeat after this, then every REPEAT_MS. */
const HOLD_DELAY_MS = 260;
const REPEAT_MS = 110;

/** Light tick on a choice — wrapped, a dev client built before `expo-haptics` throws
 *  synchronously rather than rejecting. */
const tick = () => {
  try {
    Haptics.selectionAsync().catch(() => {});
  } catch {
    // no haptics on this build
  }
};

export function DrawSetupSheet({
  visible,
  jarName,
  jarCount,
  onClose,
  onClosed,
  onStart,
}: {
  visible: boolean;
  jarName: string;
  jarCount: number;
  onClose: () => void;
  /** Fired once the sheet is gone — for whatever the caller opens or pushes next. */
  onClosed?: () => void;
  /** `saucy` ⇒ one slip, no knockout grid. */
  onStart: (input: { count: number; saucy: boolean }) => void;
}) {
  const maxN = Math.min(HARD_MAX, Math.max(HARD_MIN, jarCount));
  const clamp = (n: number) => Math.min(maxN, Math.max(HARD_MIN, n));

  const [count, setCount] = useState(clamp(DEFAULT_COUNT));
  const [saucy, setSaucy] = useState(false);

  useEffect(() => {
    if (!visible) {
      setCount(clamp(DEFAULT_COUNT));
      setSaucy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, maxN]);

  const step = (delta: number) => {
    const next = clamp(count + delta);
    if (next === count) return;
    tick();
    setCount(next);
  };

  const atCeiling = count >= maxN;
  const shown = Math.min(count, Math.max(jarCount, 1));
  const cta = saucy ? "Just give me one" : `Shake out ${shown}`;

  return (
    <BottomSheet visible={visible} onClose={onClose} onClosed={onClosed}>
      <View
        className="bg-paper px-6 pb-12 pt-3"
        style={{
          borderTopLeftRadius: radius.sheet,
          borderTopRightRadius: radius.sheet,
        }}
      >
        <View className="items-center pb-4">
          <View
            style={{
              width: 42,
              height: 4,
              borderRadius: 3,
              backgroundColor: paper.rim,
            }}
          />
        </View>

        <Text className="type-section-title text-ink">How many slips?</Text>
        <Meta className="pt-1">
          {jarName} has {jarCount} in it.
        </Meta>

        <View
          pointerEvents={saucy ? "none" : "auto"}
          className="mt-5 flex-row items-center justify-between px-4 py-5"
          style={{
            borderRadius: CARD_RADIUS,
            borderWidth: 1,
            borderColor: paper.border,
            backgroundColor: paper.card,
            opacity: saucy ? 0.4 : 1,
          }}
        >
          <StepKey
            glyph="–"
            onStep={() => step(-1)}
            disabled={count <= HARD_MIN}
          />
          <View
            className="items-center"
            accessibilityRole="adjustable"
            accessibilityLabel="Slips to draw"
            accessibilityValue={{ min: HARD_MIN, max: maxN, now: count }}
          >
            <Text
              style={{
                fontFamily: font.display,
                fontSize: 44,
                lineHeight: 46,
                color: ink.primary,
              }}
            >
              {count}
            </Text>
            <Text
              className="type-eyebrow-wide pt-1.5"
              style={{ color: ink.muted }}
            >
              slips
            </Text>
          </View>
          <StepKey glyph="+" onStep={() => step(1)} disabled={atCeiling} />
        </View>

        {!saucy && atCeiling && maxN === jarCount ? (
          <Meta className="pt-2">That's the whole jar.</Meta>
        ) : null}

        <Pressable
          onPress={() => {
            tick();
            setSaucy((s) => !s);
          }}
          accessibilityRole="radio"
          accessibilityState={{ selected: saucy }}
          accessibilityLabel="I'm feelin' saucy — one slip, no knocking out"
          className="mt-3 flex-row items-center gap-3 border px-4 py-3.5 active:opacity-70"
          style={{
            borderRadius: CARD_RADIUS,
            borderColor: saucy ? accent.rust : paper.border,
            backgroundColor: saucy ? "#F6E7D6" : paper.card,
          }}
        >
          <View
            className="items-center justify-center rounded-full"
            style={{
              width: 20,
              height: 20,
              borderWidth: 1.5,
              borderColor: saucy ? accent.rust : paper.rim,
            }}
          >
            {saucy ? (
              <View
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 5,
                  backgroundColor: accent.rust,
                }}
              />
            ) : null}
          </View>
          <View className="flex-1">
            <Text
              style={{
                fontFamily: font.display,
                fontSize: 19,
                lineHeight: 22,
                color: saucy ? accent.rust : ink.primary,
              }}
            >
              I'm feelin' saucy
            </Text>
            <Meta>One slip, straight out of the jar. No knocking out.</Meta>
          </View>
        </Pressable>

        <Pressable
          onPress={() => onStart({ count: saucy ? 1 : count, saucy })}
          accessibilityRole="button"
          accessibilityLabel={cta}
          className="mt-4 items-center rounded-full bg-forest py-4 active:bg-forest-pressed"
        >
          <Text className="type-button text-card">{cta}</Text>
        </Pressable>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Not yet"
          className="items-center pt-3 active:opacity-60"
        >
          <Text className="type-meta text-ink-muted">Not yet</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

/**
 * A ⊖ / ⊕ key. A tap steps once; a hold repeats — the latest `onStep`/`disabled` are
 * read through a ref so the repeat keeps stepping past the value it started on and
 * stops itself the moment a bound is hit.
 */
function StepKey({
  glyph,
  onStep,
  disabled,
}: {
  glyph: "–" | "+";
  onStep: () => void;
  disabled: boolean;
}) {
  const latest = useRef({ onStep, disabled });
  latest.current = { onStep, disabled };
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  };
  const fire = () => {
    if (latest.current.disabled) {
      stop();
      return;
    }
    latest.current.onStep();
  };
  const startRepeating = () => {
    stop();
    fire();
    timer.current = setInterval(fire, REPEAT_MS);
  };

  useEffect(() => stop, []);

  return (
    <Pressable
      onPress={fire}
      onLongPress={startRepeating}
      delayLongPress={HOLD_DELAY_MS}
      onPressOut={stop}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={glyph === "+" ? "Increase" : "Decrease"}
      className="items-center justify-center active:opacity-50"
      style={{
        width: 46,
        height: 46,
        borderRadius: 23,
        borderWidth: 1,
        borderColor: paper.border,
        opacity: disabled ? 0.3 : 1,
      }}
    >
      <Text style={{ fontSize: 22, lineHeight: 24, color: ink.secondary }}>
        {glyph}
      </Text>
    </Pressable>
  );
}
