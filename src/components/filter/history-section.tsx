/**
 * Library and Draw history — when a Title was added, by whom, and how the Jar's own
 * Draws have treated it. `lastDrawn` is the one leaf with a real "never" case, because
 * unlike "never watched" nothing else expresses it (ADR-0009).
 */

import { useQuery } from "@powersync/react";
import { Pressable, Switch, Text, View } from "react-native";
import { Segmented } from "@/components/segmented";
import { TimeField } from "@/components/time-field";
import { households } from "@/lib/db";
import type { FilterDraft, TimeDraft } from "@/lib/filter";
import { accent, ink, paper } from "@/theme";
import { Row, Section } from "./section";

const ADDED_DEFAULT: TimeDraft = { mode: "within", amount: 6, unit: "month" };
const DRAWN_DEFAULT: TimeDraft = { mode: "older_than", amount: 1, unit: "month" };

export function HistorySection({
  value,
  onChange,
  householdId,
}: {
  value: FilterDraft;
  onChange: (next: FilterDraft) => void;
  householdId: string;
}) {
  const { data: members } = useQuery<{ id: string; display_name: string }>(
    households.MEMBERS_OF_HOUSEHOLD,
    [householdId],
  );

  const drawnMode = !value.lastDrawn
    ? "off"
    : value.lastDrawn.mode === "never"
      ? "never"
      : "stale";

  return (
    <Section title="Library & draws">
      <Row label="Added to library">
        <View className="flex-row items-center gap-2">
          <Switch
            value={value.addedToLibrary != null}
            onValueChange={(on) =>
              onChange({ ...value, addedToLibrary: on ? ADDED_DEFAULT : null })
            }
            trackColor={{ true: accent.forest, false: ink.faint }}
          />
          <Text className="type-meta text-ink-muted">
            {value.addedToLibrary ? "" : "Any time"}
          </Text>
        </View>
        {value.addedToLibrary ? (
          <View className="mt-2.5">
            <TimeField
              value={value.addedToLibrary}
              onChange={(addedToLibrary) => onChange({ ...value, addedToLibrary })}
              relativeLabels={{ within: "in the last", older_than: "more than" }}
            />
          </View>
        ) : null}
      </Row>

      <Row label="Added by">
        <View className="flex-row flex-wrap gap-2">
          {members.map((m) => {
            const on = value.addedBy?.userId === m.id;
            return (
              <Pressable
                key={m.id}
                onPress={() =>
                  onChange({
                    ...value,
                    addedBy: on
                      ? null
                      : { userId: m.id, negate: value.addedBy?.negate ?? false },
                  })
                }
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                className="rounded-full border px-3 py-1 active:opacity-70"
                style={{
                  borderColor: on ? accent.forest : paper.border,
                  backgroundColor: on ? accent.forest : "transparent",
                }}
              >
                <Text
                  className="type-meta-small"
                  style={{ color: on ? paper.card : ink.secondary }}
                >
                  {m.display_name}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {value.addedBy ? (
          <View className="mt-2 flex-row items-center gap-2">
            <Switch
              value={value.addedBy.negate}
              onValueChange={(negate) =>
                onChange({ ...value, addedBy: { ...value.addedBy!, negate } })
              }
              trackColor={{ true: accent.rust, false: ink.faint }}
            />
            <Text className="type-meta text-ink-muted">Anyone but them</Text>
          </View>
        ) : null}
      </Row>

      <Row label="Draw history" hint="For jars like “nothing this one has picked before.”">
        <Segmented
          value={drawnMode}
          wrap
          options={[
            { value: "off", label: "Ignore" },
            { value: "never", label: "Never drawn" },
            { value: "stale", label: "Not drawn in…" },
          ]}
          onChange={(m) => {
            if (m === "off") return onChange({ ...value, lastDrawn: null });
            const scope = value.lastDrawn?.scope ?? "this_jar";
            if (m === "never")
              return onChange({ ...value, lastDrawn: { mode: "never", scope } });
            return onChange({ ...value, lastDrawn: { ...DRAWN_DEFAULT, scope } });
          }}
        />
        {drawnMode === "stale" && value.lastDrawn && value.lastDrawn.mode !== "never" ? (
          <View className="mt-2.5">
            <TimeField
              value={value.lastDrawn}
              onChange={(t) =>
                onChange({
                  ...value,
                  lastDrawn: { ...t, scope: value.lastDrawn?.scope ?? "this_jar" },
                })
              }
              relativeLabels={{ within: "in the last", older_than: "not for" }}
            />
          </View>
        ) : null}
        {value.lastDrawn ? (
          <View className="mt-2.5">
            <Segmented
              value={value.lastDrawn.scope}
              options={[
                { value: "this_jar", label: "This jar" },
                { value: "household", label: "Any jar" },
              ]}
              onChange={(scope) =>
                onChange({
                  ...value,
                  lastDrawn: { ...value.lastDrawn!, scope: scope as "this_jar" | "household" },
                })
              }
            />
          </View>
        ) : null}
      </Row>
    </Section>
  );
}
