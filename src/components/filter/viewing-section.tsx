/**
 * Viewings — closed-world, no unknown case (ADR-0006). "Nobody has seen it" is a plain
 * fact, so these rules read straight.
 */

import { Switch, Text, View } from "react-native";
import { MemberMultiSelect } from "@/components/member-multi-select";
import { Segmented } from "@/components/segmented";
import { Stepper } from "@/components/stepper";
import { TimeField } from "@/components/time-field";
import type { FilterDraft, TimeDraft, WatchedMode } from "@/lib/filter";
import { accent, ink } from "@/theme";
import { Row, Section } from "./section";

const LAST_WATCHED_DEFAULT: TimeDraft = { mode: "older_than", amount: 1, unit: "year" };

export function ViewingSection({
  value,
  onChange,
  householdId,
}: {
  value: FilterDraft;
  onChange: (next: FilterDraft) => void;
  householdId: string;
}) {
  return (
    <Section title="Viewing history">
      <Row label="Seen">
        <Segmented
          value={value.watched.mode}
          wrap
          options={[
            { value: "any", label: "Ignore" },
            { value: "anyone", label: "By anyone" },
            { value: "everyone", label: "By everyone" },
            { value: "nobody", label: "By nobody" },
            { value: "not_everyone", label: "Not by all" },
          ]}
          onChange={(mode) =>
            onChange({ ...value, watched: { ...value.watched, mode: mode as WatchedMode } })
          }
        />
        {value.watched.mode !== "any" ? (
          <View className="mt-2.5 gap-2">
            <Text className="type-meta text-ink-muted">Who counts</Text>
            <Segmented
              value={value.watched.population ? "pick" : "household"}
              options={[
                { value: "household", label: "Household" },
                { value: "pick", label: "Pick…" },
              ]}
              onChange={(k) =>
                onChange({
                  ...value,
                  watched: {
                    ...value.watched,
                    population: k === "pick" ? (value.watched.population ?? []) : null,
                  },
                })
              }
            />
            {value.watched.population ? (
              <MemberMultiSelect
                householdId={householdId}
                selected={value.watched.population}
                onChange={(population) =>
                  onChange({ ...value, watched: { ...value.watched, population } })
                }
              />
            ) : null}
          </View>
        ) : null}
      </Row>

      <Row label="Rewatch count">
        <View className="flex-row items-center gap-2">
          <Switch
            value={value.watchCount != null}
            onValueChange={(on) =>
              onChange({
                ...value,
                watchCount: on ? { op: "gte", value: 3 } : null,
              })
            }
            trackColor={{ true: accent.forest, false: ink.faint }}
          />
          <Text className="type-meta text-ink-muted">
            {value.watchCount ? "Watched…" : "Any"}
          </Text>
        </View>
        {value.watchCount ? (
          <View className="mt-2.5 flex-row items-center gap-3">
            <Segmented
              value={value.watchCount.op}
              options={[
                { value: "gte", label: "≥" },
                { value: "eq", label: "=" },
                { value: "lte", label: "≤" },
              ]}
              onChange={(op) =>
                onChange({
                  ...value,
                  watchCount: { ...value.watchCount!, op: op as "gte" | "eq" | "lte" },
                })
              }
            />
            <Stepper
              value={value.watchCount.value}
              min={0}
              max={50}
              suffix="times"
              onChange={(v) =>
                onChange({ ...value, watchCount: { ...value.watchCount!, value: v } })
              }
            />
          </View>
        ) : null}
      </Row>

      <Row label="Last watched">
        <View className="flex-row items-center gap-2">
          <Switch
            value={value.lastWatched != null}
            onValueChange={(on) =>
              onChange({
                ...value,
                lastWatched: on
                  ? { ...LAST_WATCHED_DEFAULT, population: null }
                  : null,
              })
            }
            trackColor={{ true: accent.forest, false: ink.faint }}
          />
          <Text className="type-meta text-ink-muted">
            {value.lastWatched ? "" : "Any"}
          </Text>
        </View>
        {value.lastWatched ? (
          <View className="mt-2.5">
            <TimeField
              value={value.lastWatched}
              onChange={(t) =>
                onChange({
                  ...value,
                  lastWatched: { ...t, population: value.lastWatched?.population ?? null },
                })
              }
              relativeLabels={{ within: "in the last", older_than: "not for" }}
            />
          </View>
        ) : null}
      </Row>
    </Section>
  );
}
