/**
 * Ratings — three-valued, so an unrated Title never matches, in either polarity
 * (ADR-0006). One optional rule per Rating Category the Household has activated.
 *
 * `coverage` and `aggregator` are left off unless the user opens Advanced and changes
 * them: absence means "inherit the Household's Rating Policy", which is what lets
 * changing that policy change what existing Jars mean (ADR-0009).
 */

import { useQuery } from "@powersync/react";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { MemberMultiSelect } from "@/components/member-multi-select";
import { Segmented } from "@/components/segmented";
import { Stepper } from "@/components/stepper";
import { Meta } from "@/components/text";
import { households, type RatingCategoryRow } from "@/lib/db";
import type { FilterDraft, RaterScope, RatingClauseDraft } from "@/lib/filter";
import { Row, Section } from "./section";

type OpKey = "gte" | "lte" | "between" | "is_not_null" | "is_null";

const OP_OPTIONS: { value: OpKey; label: string }[] = [
  { value: "gte", label: "≥" },
  { value: "lte", label: "≤" },
  { value: "between", label: "range" },
  { value: "is_not_null", label: "rated" },
  { value: "is_null", label: "unrated" },
];

export function RatingsSection({
  value,
  onChange,
  householdId,
}: {
  value: FilterDraft;
  onChange: (next: FilterDraft) => void;
  householdId: string;
}) {
  const { data: categories } = useQuery<RatingCategoryRow>(
    households.CATEGORIES_FOR_HOUSEHOLD,
    [householdId],
  );

  const byId = new Map(value.ratings.map((r) => [r.categoryId, r]));

  const patch = (categoryId: string, next: RatingClauseDraft | null) => {
    const rest = value.ratings.filter((r) => r.categoryId !== categoryId);
    onChange({ ...value, ratings: next ? [...rest, next] : rest });
  };

  if (categories.length === 0) {
    return (
      <Section title="Ratings">
        <Meta>This household has no rating axes yet.</Meta>
      </Section>
    );
  }

  return (
    <Section title="Ratings" hint="Scored 0–10. An unrated title never matches.">
      {categories.map((category) => (
        <RatingRow
          key={category.id}
          category={category}
          clause={byId.get(category.id) ?? null}
          householdId={householdId}
          onChange={(next) => patch(category.id, next)}
        />
      ))}
    </Section>
  );
}

function RatingRow({
  category,
  clause,
  householdId,
  onChange,
}: {
  category: RatingCategoryRow;
  clause: RatingClauseDraft | null;
  householdId: string;
  onChange: (next: RatingClauseDraft | null) => void;
}) {
  const [advanced, setAdvanced] = useState(false);

  if (!clause) {
    return (
      <View className="flex-row items-center justify-between border-b border-hairline py-2.5">
        <Text className="type-body text-ink">{category.name}</Text>
        <Pressable
          onPress={() =>
            onChange({
              categoryId: category.id,
              op: "gte",
              value: 7,
              scope: "household",
            })
          }
          accessibilityRole="button"
          className="active:opacity-60"
        >
          <Text className="type-meta-small text-navy">＋ Add a rule</Text>
        </Pressable>
      </View>
    );
  }

  const op = clause.op as OpKey;
  const setOp = (nextOp: OpKey) => {
    if (nextOp === "between") {
      onChange({ ...clause, op: "between", value: undefined, min: 6, max: 9 });
    } else if (nextOp === "is_null" || nextOp === "is_not_null") {
      onChange({ ...clause, op: nextOp, value: undefined, min: undefined, max: undefined });
    } else {
      onChange({ ...clause, op: nextOp, value: clause.value ?? 7, min: undefined, max: undefined });
    }
  };

  return (
    <View className="gap-2.5 border-b border-hairline py-3">
      <View className="flex-row items-center justify-between">
        <Text className="type-body text-ink">{category.name}</Text>
        <Pressable
          onPress={() => onChange(null)}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${category.name} rule`}
          className="active:opacity-60"
        >
          <Text className="type-meta-small text-rust">Remove</Text>
        </Pressable>
      </View>

      <Segmented value={op} options={OP_OPTIONS} wrap onChange={setOp} />

      {op === "gte" || op === "lte" ? (
        <Stepper
          value={clause.value ?? 7}
          min={0}
          max={10}
          step={0.5}
          precision={1}
          onChange={(value) => onChange({ ...clause, value })}
        />
      ) : null}

      {op === "between" ? (
        <View className="flex-row items-center gap-3">
          <Stepper
            value={clause.min ?? 6}
            min={0}
            max={10}
            step={0.5}
            precision={1}
            onChange={(min) => onChange({ ...clause, min })}
          />
          <Text className="type-meta text-ink-muted">to</Text>
          <Stepper
            value={clause.max ?? 9}
            min={0}
            max={10}
            step={0.5}
            precision={1}
            onChange={(max) => onChange({ ...clause, max })}
          />
        </View>
      ) : null}

      <Row label="Whose ratings">
        <ScopeControls
          scope={clause.scope}
          householdId={householdId}
          onChange={(scope) => onChange({ ...clause, scope })}
        />
      </Row>

      <Pressable
        onPress={() => setAdvanced((a) => !a)}
        accessibilityRole="button"
        className="self-start active:opacity-60"
      >
        <Text className="type-meta-small text-navy">
          {advanced ? "Hide policy" : "Policy…"}
        </Text>
      </Pressable>

      {advanced ? (
        <View className="gap-2.5">
          <Row label="Coverage" hint="How many of them must have rated it.">
            <Segmented
              value={clause.coverage ?? "inherit"}
              options={[
                { value: "inherit", label: "Inherit" },
                { value: "any", label: "Any" },
                { value: "all", label: "All" },
              ]}
              onChange={(c) =>
                onChange({
                  ...clause,
                  coverage: c === "inherit" ? undefined : (c as "any" | "all"),
                })
              }
            />
          </Row>
          <Row label="Combine" hint="How their scores resolve to one number.">
            <Segmented
              value={clause.aggregator ?? "inherit"}
              options={[
                { value: "inherit", label: "Inherit" },
                { value: "avg", label: "Avg" },
                { value: "min", label: "Lowest" },
                { value: "max", label: "Highest" },
              ]}
              onChange={(a) =>
                onChange({
                  ...clause,
                  aggregator:
                    a === "inherit" ? undefined : (a as "avg" | "min" | "max"),
                })
              }
            />
          </Row>
        </View>
      ) : null}
    </View>
  );
}

function ScopeControls({
  scope,
  householdId,
  onChange,
}: {
  scope: RaterScope;
  householdId: string;
  onChange: (next: RaterScope) => void;
}) {
  const kind =
    scope === "household" ? "household" : scope === "me" ? "me" : "pick";

  return (
    <View className="gap-2">
      <Segmented
        value={kind}
        options={[
          { value: "household", label: "Household" },
          { value: "me", label: "Me" },
          { value: "pick", label: "Pick…" },
        ]}
        onChange={(k) => {
          if (k === "household") onChange("household");
          else if (k === "me") onChange("me");
          else onChange({ userIds: typeof scope === "object" ? scope.userIds : [] });
        }}
      />
      {kind === "pick" ? (
        <MemberMultiSelect
          householdId={householdId}
          selected={typeof scope === "object" ? scope.userIds : []}
          onChange={(userIds) => onChange({ userIds })}
        />
      ) : null}
    </View>
  );
}
