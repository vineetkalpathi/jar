/**
 * Editing a `TimeDraft` — the shape behind `lastWatched`, `addedToLibrary` and
 * `lastDrawn`. Relative first (ADR-0006): a long-lived Jar wants "older than 2 years",
 * not a date that silently means something different every day. An "exact dates" switch
 * reveals the absolute form for retrospective windows.
 */

import { useState } from "react";
import { Switch, Text, View } from "react-native";
import { Field } from "./field";
import { Segmented } from "./segmented";
import { Stepper } from "./stepper";
import type { TimeDraft } from "@/lib/filter";
import { accent, ink } from "@/theme";

const UNITS = [
  { value: "day", label: "days" },
  { value: "week", label: "weeks" },
  { value: "month", label: "months" },
  { value: "year", label: "years" },
] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isAbsolute(t: TimeDraft): boolean {
  return t.mode === "before" || t.mode === "after" || t.mode === "between";
}

const RELATIVE_DEFAULT: TimeDraft = { mode: "older_than", amount: 1, unit: "year" };
const ABSOLUTE_DEFAULT: TimeDraft = { mode: "after", date: "" };

export function TimeField({
  value,
  onChange,
  relativeLabels = { within: "within the last", older_than: "more than" },
}: {
  value: TimeDraft;
  onChange: (next: TimeDraft) => void;
  relativeLabels?: { within: string; older_than: string };
}) {
  const [absolute, setAbsolute] = useState(isAbsolute(value));

  const toggle = (next: boolean) => {
    setAbsolute(next);
    onChange(next ? ABSOLUTE_DEFAULT : RELATIVE_DEFAULT);
  };

  return (
    <View className="gap-3">
      {absolute ? (
        <AbsoluteControls value={value} onChange={onChange} />
      ) : (
        <RelativeControls value={value} onChange={onChange} labels={relativeLabels} />
      )}

      <View className="flex-row items-center gap-2">
        <Switch
          value={absolute}
          onValueChange={toggle}
          trackColor={{ true: accent.forest, false: ink.faint }}
        />
        <Text className="type-meta text-ink-muted">Exact dates</Text>
      </View>
    </View>
  );
}

function RelativeControls({
  value,
  onChange,
  labels,
}: {
  value: TimeDraft;
  onChange: (next: TimeDraft) => void;
  labels: { within: string; older_than: string };
}) {
  const v =
    value.mode === "within" || value.mode === "older_than"
      ? value
      : (RELATIVE_DEFAULT as Extract<TimeDraft, { mode: "within" | "older_than" }>);

  return (
    <View className="gap-2.5">
      <Segmented
        value={v.mode}
        stretch
        options={[
          { value: "older_than", label: labels.older_than },
          { value: "within", label: labels.within },
        ]}
        onChange={(mode) => onChange({ ...v, mode })}
      />
      <View className="flex-row items-center gap-3">
        <Stepper
          value={v.amount}
          min={1}
          max={99}
          onChange={(amount) => onChange({ ...v, amount })}
        />
        <Segmented
          value={v.unit}
          wrap
          options={UNITS.map((u) => ({ value: u.value, label: u.label }))}
          onChange={(unit) => onChange({ ...v, unit })}
        />
      </View>
    </View>
  );
}

function AbsoluteControls({
  value,
  onChange,
}: {
  value: TimeDraft;
  onChange: (next: TimeDraft) => void;
}) {
  const mode =
    value.mode === "before" || value.mode === "after" || value.mode === "between"
      ? value.mode
      : "after";

  const setMode = (next: "before" | "after" | "between") => {
    if (next === "between") onChange({ mode: "between", from: "", to: "" });
    else onChange({ mode: next, date: "" });
  };

  return (
    <View className="gap-2.5">
      <Segmented
        value={mode}
        stretch
        options={[
          { value: "after", label: "after" },
          { value: "before", label: "before" },
          { value: "between", label: "between" },
        ]}
        onChange={setMode}
      />
      {value.mode === "between" ? (
        <View className="flex-row items-baseline gap-3">
          <DateInput
            value={value.from}
            onChange={(from) => onChange({ ...value, from })}
          />
          <Text className="type-meta text-ink-muted">and</Text>
          <DateInput value={value.to} onChange={(to) => onChange({ ...value, to })} />
        </View>
      ) : (
        <DateInput
          value={"date" in value ? value.date : ""}
          onChange={(date) =>
            onChange({ mode: mode as "before" | "after", date })
          }
        />
      )}
    </View>
  );
}

function DateInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  const bad = text.trim() !== "" && !DATE_RE.test(text.trim());

  return (
    <View className="flex-1">
      <Field
        value={text}
        onChangeText={setText}
        onBlur={() => onChange(text.trim())}
        onSubmitEditing={() => onChange(text.trim())}
        placeholder="YYYY-MM-DD"
        autoCapitalize="none"
        autoCorrect={false}
        error={bad ? "Use YYYY-MM-DD" : undefined}
      />
    </View>
  );
}
