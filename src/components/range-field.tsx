/**
 * A "from / to" pair of small numeric inputs, for a bounded range where either end may
 * be left open — release year, runtime. An empty end means "no bound that side".
 *
 * Built on `Field` so it inherits the one proven TextInput setup in the app.
 */

import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Field } from "./field";

export function RangeField({
  label,
  value,
  onChange,
  unit,
  placeholder = { min: "Any", max: "Any" },
}: {
  label?: string;
  value: { min: number | null; max: number | null };
  onChange: (next: { min: number | null; max: number | null }) => void;
  /** Shown after the "to" field — "min", "yr". */
  unit?: string;
  placeholder?: { min: string; max: string };
}) {
  return (
    <View className="gap-1.5">
      {label ? <Text className="type-eyebrow text-ink-muted">{label}</Text> : null}
      <View className="flex-row items-baseline gap-3">
        <View className="flex-1">
          <Bound
            value={value.min}
            placeholder={placeholder.min}
            onCommit={(min) => onChange({ ...value, min })}
          />
        </View>
        <Text className="type-meta text-ink-muted">to</Text>
        <View className="flex-1">
          <Bound
            value={value.max}
            placeholder={placeholder.max}
            onCommit={(max) => onChange({ ...value, max })}
          />
        </View>
        {unit ? <Text className="type-meta text-ink-muted">{unit}</Text> : null}
      </View>
    </View>
  );
}

function Bound({
  value,
  placeholder,
  onCommit,
}: {
  value: number | null;
  placeholder: string;
  onCommit: (value: number | null) => void;
}) {
  const [text, setText] = useState(value == null ? "" : String(value));

  // Keep the field in step when the value changes from outside (a Clear, a round-trip).
  useEffect(() => {
    setText(value == null ? "" : String(value));
  }, [value]);

  const commit = () => {
    const trimmed = text.trim();
    if (trimmed === "") return onCommit(null);
    const n = Number(trimmed);
    if (Number.isFinite(n)) onCommit(Math.round(n));
    else setText(value == null ? "" : String(value));
  };

  return (
    <Field
      value={text}
      onChangeText={setText}
      onBlur={commit}
      onSubmitEditing={commit}
      placeholder={placeholder}
      keyboardType="number-pad"
      returnKeyType="done"
    />
  );
}
