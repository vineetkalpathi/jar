import { usePowerSync, useQuery } from "@powersync/react";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { Button } from "@/components/button";
import { CategoryPicker } from "@/components/category-picker";
import { Field } from "@/components/field";
import { Screen } from "@/components/screen";
import { Eyebrow, LayerTitle, Meta } from "@/components/text";
import { signOut } from "@/lib/auth/actions";
import { households, type RatingCategoryRow } from "@/lib/db";
import { useActiveHousehold, useHousehold } from "@/lib/household/active";
import { accent, ink, paper } from "@/theme";

/**
 * The Household hub — everything scoped to one watch group that isn't a Title, a Jar or
 * the Library list: its name, who's in it, the rating vocabulary it surfaces, and the
 * policy that resolves several members' scores to one answer in a Filter.
 *
 * Pushed over the Household tab (`(tabs)/household.tsx`), not a tab of its own.
 */
export default function HouseholdSettings() {
  const db = usePowerSync();
  const household = useHousehold();
  const { all, select } = useActiveHousehold();

  const { data: members } = useQuery<{ id: string; display_name: string }>(
    households.MEMBERS_OF_HOUSEHOLD,
    [household.id],
  );
  const { data: categories } = useQuery<RatingCategoryRow>(households.CATEGORIES_FOR_HOUSEHOLD, [
    household.id,
  ]);

  const [name, setName] = useState(household.name ?? "");
  const [pickerOpen, setPickerOpen] = useState(false);

  const saveName = () => {
    const next = name.trim();
    if (!next || next === household.name) return;
    households
      .renameHousehold(db, household.id, next)
      .catch(() => setName(household.name ?? ""));
  };

  const removeCategory = (category: RatingCategoryRow) => {
    Alert.alert(
      `Remove ${category.name}?`,
      "It stops showing on titles here. Ratings members have already given are kept.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => void households.deactivateCategory(db, household.id, category.id),
        },
      ],
    );
  };

  return (
    <Screen gutter="form" scroll>
      <View className="flex-row items-center gap-3 pb-6 pt-2">
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text className="type-section-title text-ink-secondary">‹</Text>
        </Pressable>
        <LayerTitle>Household</LayerTitle>
      </View>

      <View className="gap-9 pb-16">
        <Section title="Name">
          <Field
            label="Household name"
            value={name}
            onChangeText={setName}
            onBlur={saveName}
            onSubmitEditing={saveName}
            autoCapitalize="words"
            returnKeyType="done"
          />
        </Section>

        <Section title="Members">
          {members.map((m) => (
            <Text key={m.id} className="type-body py-1 text-ink">
              {m.display_name}
            </Text>
          ))}
          <View className="mt-3 gap-1">
            <Eyebrow>Invite code</Eyebrow>
            <Text selectable className="type-body text-ink-secondary">
              {household.id}
            </Text>
            <Meta>Anyone with this code can join. Real invites come later.</Meta>
          </View>
        </Section>

        {all.length > 1 ? (
          <Section title="Switch household">
            {all.map((h) => {
              const current = h.id === household.id;
              return (
                <Pressable
                  key={h.id}
                  onPress={() => !current && select(h.id)}
                  accessibilityRole="button"
                  className="flex-row items-center justify-between py-2 active:opacity-60"
                >
                  <Text
                    className="type-body"
                    style={{ color: current ? accent.forest : ink.primary }}
                  >
                    {h.name}
                  </Text>
                  {current ? (
                    <Text className="type-meta-small text-ink-faint">Current</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </Section>
        ) : null}

        <Section
          title="Rating axes"
          hint="The dimensions every title is scored on here. Shared by everyone in the household."
        >
          {categories.map((c) => (
            <View
              key={c.id}
              className="flex-row items-center justify-between border-b border-hairline py-3"
            >
              <Text className="type-body text-ink">
                {c.name}
                {c.archived_at ? "  · archived" : ""}
              </Text>
              <Pressable
                onPress={() => removeCategory(c)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${c.name}`}
              >
                <Text className="type-body text-rust">Remove</Text>
              </Pressable>
            </View>
          ))}
          <Pressable
            onPress={() => setPickerOpen(true)}
            accessibilityRole="button"
            className="py-3 active:opacity-60"
          >
            <Text className="type-body text-forest">＋ Add an axis</Text>
          </Pressable>
        </Section>

        <Section
          title="Rating policy"
          hint="How several members' scores resolve to one answer in a jar's filter. Changing it changes what existing jars mean."
        >
          <PolicyControls
            householdId={household.id}
            coverage={household.rating_coverage}
            aggregator={household.rating_aggregator}
          />
        </Section>

        <Button label="Sign out (dev)" variant="quiet" onPress={() => void signOut()} />
      </View>

      <CategoryPicker
        visible={pickerOpen}
        activeIds={categories.map((c) => c.id)}
        onClose={() => setPickerOpen(false)}
        onPick={(category) => households.activateCategory(db, household.id, category.id)}
      />
    </Screen>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-2">
      <Eyebrow>{title}</Eyebrow>
      {hint ? <Meta>{hint}</Meta> : null}
      <View className="gap-0.5 pt-1">{children}</View>
    </View>
  );
}

function PolicyControls({
  householdId,
  coverage,
  aggregator,
}: {
  householdId: string;
  coverage: string | null;
  aggregator: string | null;
}) {
  const db = usePowerSync();
  const cov = (coverage as "any" | "all" | null) ?? "any";
  const agg = (aggregator as "avg" | "min" | "max" | null) ?? "avg";

  const set = (next: { coverage?: "any" | "all"; aggregator?: "avg" | "min" | "max" }) => {
    void households.setRatingPolicy(db, householdId, {
      coverage: next.coverage ?? cov,
      aggregator: next.aggregator ?? agg,
    });
  };

  return (
    <View className="gap-4">
      <View className="gap-1.5">
        <Eyebrow>Coverage</Eyebrow>
        <Segmented
          value={cov}
          options={[
            { value: "any", label: "Anyone" },
            { value: "all", label: "Everyone" },
          ]}
          onChange={(v) => set({ coverage: v })}
        />
        <Meta>
          {cov === "all"
            ? "Every member must have rated a title for it to qualify."
            : "One member's rating is enough."}
        </Meta>
      </View>

      <View className="gap-1.5">
        <Eyebrow>Aggregator</Eyebrow>
        <Segmented
          value={agg}
          options={[
            { value: "avg", label: "Average" },
            { value: "min", label: "Lowest" },
            { value: "max", label: "Highest" },
          ]}
          onChange={(v) => set({ aggregator: v })}
        />
      </View>
    </View>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <View className="flex-row self-start overflow-hidden rounded-card border border-hairline">
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className={`px-3.5 py-1.5 active:opacity-70 ${i > 0 ? "border-l border-hairline" : ""}`}
            style={{ backgroundColor: active ? accent.forest : "transparent" }}
          >
            <Text
              className="type-meta-small"
              style={{ color: active ? paper.card : ink.muted }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
