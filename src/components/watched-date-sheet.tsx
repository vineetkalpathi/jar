/**
 * A rough "when did you watch it?" picker, in the dark register the Title screen uses.
 *
 * Approximate by design: a year is required, month and day are optional. What the User
 * fills in becomes `watched_precision` — a year alone reads back as "2024", a month as
 * "March 2024" (see `time.ts`). No calendar widget: a year stepper, a month pill row,
 * and a day stepper that only appears once there's a month to hang it on.
 */

import { useEffect, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { DarkEyebrow, DarkMeta } from "./text";
import { daysInMonth, MONTH_NAMES, type WatchPrecision } from "@/lib/time";
import { accent, dark, font, paper } from "@/theme";

const NOW = new Date();
const THIS_YEAR = NOW.getUTCFullYear();
const TODAY = {
  year: THIS_YEAR,
  month: NOW.getUTCMonth() + 1,
  day: NOW.getUTCDate(),
};

type Parts = { year: number; month: number | null; day: number | null };

export function WatchedDateSheet({
  visible,
  seen,
  initial,
  initialPrecision,
  onClose,
  onSave,
  onRemove,
}: {
  visible: boolean;
  /** Drives the primary button's label and whether "remove" shows. */
  seen: boolean;
  initial: { year: number; month: number; day: number } | null;
  initialPrecision: WatchPrecision | null;
  onClose: () => void;
  onSave: (on: Parts) => void | Promise<void>;
  /** Omit when there's nothing to remove yet. */
  onRemove?: () => void;
}) {
  const [year, setYear] = useState(TODAY.year);
  const [month, setMonth] = useState<number | null>(TODAY.month);
  const [day, setDay] = useState<number | null>(TODAY.day);

  // Re-seed each time the sheet opens. A new Viewing starts at today, fully filled, so
  // an un-edited "Mark as seen" matches the one-tap eye; the User dials parts back to
  // "Any" to make it rough. An existing one starts at its stored date and precision.
  useEffect(() => {
    if (!visible) return;
    if (!initial) {
      setYear(TODAY.year);
      setMonth(TODAY.month);
      setDay(TODAY.day);
      return;
    }
    setYear(initial.year);
    setMonth(initialPrecision === "year" ? null : initial.month);
    setDay(initialPrecision === "year" || initialPrecision === "month" ? null : initial.day);
  }, [visible, initial, initialPrecision]);

  const pickMonth = (m: number | null) => {
    setMonth(m);
    if (m == null) setDay(null);
    else if (day != null) setDay(Math.min(day, daysInMonth(year, m)));
  };

  const cycleDay = (delta: number) => {
    if (month == null) return;
    const max = daysInMonth(year, month);
    const next = (day ?? 0) + delta;
    setDay(next < 1 || next > max ? null : next);
  };

  const save = () =>
    onSave({ year, month, day: month == null ? null : day });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        className="flex-1 justify-end"
        style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
        onPress={onClose}
      >
        <Pressable
          onPress={() => {}}
          className="px-6 pb-10 pt-5"
          style={{
            backgroundColor: dark.surface,
            borderTopLeftRadius: 14,
            borderTopRightRadius: 14,
            borderWidth: 1,
            borderColor: dark.border,
          }}
        >
          <View className="mb-4 gap-1">
            <DarkEyebrow>When did you watch it?</DarkEyebrow>
            <DarkMeta>Approximate is fine — skip the day, or the month.</DarkMeta>
          </View>

          <FieldLabel>Year</FieldLabel>
          <Stepper
            value={String(year)}
            onPrev={() => setYear((y) => Math.max(1900, y - 1))}
            onNext={() => setYear((y) => Math.min(THIS_YEAR, y + 1))}
          />

          <FieldLabel>Month</FieldLabel>
          <View className="flex-row flex-wrap gap-1.5">
            <MonthPill label="Any" active={month == null} onPress={() => pickMonth(null)} />
            {MONTH_NAMES.map((name, i) => (
              <MonthPill
                key={name}
                label={name.slice(0, 3)}
                active={month === i + 1}
                onPress={() => pickMonth(i + 1)}
              />
            ))}
          </View>

          {month != null ? (
            <>
              <FieldLabel>Day</FieldLabel>
              <Stepper
                value={day == null ? "Any" : String(day)}
                onPrev={() => cycleDay(-1)}
                onNext={() => cycleDay(1)}
              />
            </>
          ) : null}

          <Pressable
            onPress={save}
            accessibilityRole="button"
            className="mt-6 items-center rounded-button py-3 active:opacity-80"
            style={{ backgroundColor: accent.forest }}
          >
            <Text style={{ fontFamily: font.uiBold, fontSize: 15, color: paper.card }}>
              {seen ? "Save date" : "Mark as seen"}
            </Text>
          </Pressable>

          {onRemove ? (
            <Pressable
              onPress={onRemove}
              accessibilityRole="button"
              className="mt-2 items-center py-2 active:opacity-60"
            >
              <Text style={{ fontFamily: font.uiMedium, fontSize: 13, color: accent.rust }}>
                Remove from seen
              </Text>
            </Pressable>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function FieldLabel({ children }: { children: string }) {
  return (
    <Text
      style={{
        fontFamily: font.uiMedium,
        fontSize: 11,
        letterSpacing: 1.4,
        textTransform: "uppercase",
        color: dark.textMuted,
        marginTop: 16,
        marginBottom: 8,
      }}
    >
      {children}
    </Text>
  );
}

function Stepper({
  value,
  onPrev,
  onNext,
}: {
  value: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <View
      className="flex-row items-center justify-between rounded-card px-2"
      style={{ height: 44, borderWidth: 1, borderColor: dark.border, backgroundColor: dark.bg }}
    >
      <Chevron label="‹" onPress={onPrev} />
      <Text style={{ fontFamily: font.uiBold, fontSize: 16, color: dark.text }}>{value}</Text>
      <Chevron label="›" onPress={onNext} />
    </View>
  );
}

function Chevron({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label === "‹" ? "Decrease" : "Increase"}
      className="h-11 w-11 items-center justify-center active:opacity-50"
    >
      <Text style={{ fontFamily: font.uiBold, fontSize: 22, color: dark.textSecondary }}>
        {label}
      </Text>
    </Pressable>
  );
}

function MonthPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className="rounded-full px-3 py-1.5 active:opacity-70"
      style={{
        backgroundColor: active ? accent.forest : "transparent",
        borderWidth: 1,
        borderColor: active ? accent.forest : dark.border,
      }}
    >
      <Text
        style={{
          fontFamily: font.uiMedium,
          fontSize: 12,
          letterSpacing: 0.3,
          color: active ? paper.card : dark.textSecondary,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
