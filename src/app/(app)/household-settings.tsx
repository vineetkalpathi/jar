import { Button } from "@/components/button";
import { CategoryPicker } from "@/components/category-picker";
import { Field } from "@/components/field";
import { MembersStrip } from "@/components/members-strip";
import { Screen } from "@/components/screen";
import { Segmented } from "@/components/segmented";
import { AddTag, Tag, TagList } from "@/components/tag";
import { TagPicker } from "@/components/tag-picker";
import { Eyebrow, LayerTitle, Meta } from "@/components/text";
import { signOut } from "@/lib/auth/actions";
import { useUserId } from "@/lib/auth/session";
import { annotations, households, type RatingCategoryRow, type TagRow } from "@/lib/db";
import { useActiveHousehold, useHousehold } from "@/lib/household/active";
import { accent, ink, paper } from "@/theme";
import { usePowerSync, useQuery } from "@powersync/react";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

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
  const userId = useUserId();
  const { all, select } = useActiveHousehold();

  const { data: categories } = useQuery<RatingCategoryRow>(
    households.CATEGORIES_FOR_HOUSEHOLD,
    [household.id],
  );
  const { data: members } = useQuery<{ id: string; display_name: string }>(
    households.MEMBERS_OF_HOUSEHOLD,
    [household.id],
  );

  const [name, setName] = useState(household.name ?? "");
  const [pickerOpen, setPickerOpen] = useState(false);

  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );
  const copyInviteCode = () => {
    // A dev client built before `expo-clipboard` was added has no native module,
    // so `setStringAsync` is undefined and throws synchronously — fall back to an
    // Alert with the code so it's still shareable.
    Promise.resolve()
      .then(() => Clipboard.setStringAsync(household.id))
      .then(() => {
        Haptics.selectionAsync().catch(() => {});
        setCopied(true);
        if (copiedTimer.current) clearTimeout(copiedTimer.current);
        copiedTimer.current = setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => Alert.alert("Invite code", household.id));
  };

  // The "＋ Add" on the members carousel. No real invite system yet, so this is the
  // honest version: hand over the code and point at where they redeem it.
  const inviteMember = () => {
    Alert.alert(
      "Add a member",
      `Share this code and they can join from the welcome screen.\n\n${household.id}`,
      [
        { text: "Close", style: "cancel" },
        { text: "Copy code", onPress: copyInviteCode },
      ],
    );
  };

  const saveName = () => {
    const next = name.trim();
    if (!next || next === household.name) return;
    households
      .renameHousehold(db, household.id, next)
      .catch(() => setName(household.name ?? ""));
  };

  const removeMember = (member: { id: string; display_name: string }) => {
    Alert.alert(
      `Remove ${member.display_name}?`,
      "They lose access to this household. Ratings and viewings they've made are kept.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () =>
            void households
              .removeMember(db, { householdId: household.id, userId: member.id })
              .catch((cause) => console.warn("[members] could not remove", cause)),
        },
      ],
    );
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
          onPress: () =>
            void households.deactivateCategory(db, household.id, category.id),
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
        <LayerTitle>Household Settings</LayerTitle>
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
          <MembersStrip householdId={household.id} onAdd={inviteMember} />

          {members.length > 1 ? (
            <View className="mt-3">
              {members.map((m) => {
                const isSelf = m.id === userId;
                return (
                  <View
                    key={m.id}
                    className="flex-row items-center justify-between border-b border-hairline py-3"
                  >
                    <Text className="type-body text-ink">
                      {m.display_name}
                      {isSelf ? "  · you" : ""}
                    </Text>
                    {isSelf ? null : (
                      <Pressable
                        onPress={() => removeMember(m)}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${m.display_name}`}
                      >
                        <Text className="type-body text-rust">Remove</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          ) : null}

          <View className="mt-3 gap-1">
            <Eyebrow>Invite code</Eyebrow>
            <View className="flex-row items-center gap-3">
              <Text selectable className="type-body flex-1 text-ink-secondary">
                {household.id}
              </Text>
              <Pressable
                onPress={copyInviteCode}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Copy invite code"
                className="flex-row items-center gap-1.5 active:opacity-60"
              >
                <CopyGlyph color={copied ? accent.forest : ink.muted} />
                <Text
                  className="type-meta-small"
                  style={{ color: copied ? accent.forest : ink.muted }}
                >
                  {copied ? "Copied" : "Copy"}
                </Text>
              </Pressable>
            </View>
            <Meta>
              Anyone with this code can join. Real invites come later.
            </Meta>
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
                    <Text className="type-meta-small text-ink-faint">
                      Current
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </Section>
        ) : null}

        <TagsSection householdId={household.id} />

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

        <Button
          label="Sign out (dev)"
          variant="quiet"
          onPress={() => void signOut()}
        />
      </View>

      <CategoryPicker
        visible={pickerOpen}
        activeIds={categories.map((c) => c.id)}
        onClose={() => setPickerOpen(false)}
        onPick={(category) =>
          households.activateCategory(db, household.id, category.id)
        }
      />
    </Screen>
  );
}

/**
 * The Household's shared tag vocabulary. Each chip carries a `×` that deletes the tag
 * everywhere — off every title that carries it (confirmed). "＋ New tag" opens the same
 * picker the Title screen uses; the only live action here is coining a new one.
 */
function TagsSection({ householdId }: { householdId: string }) {
  const db = usePowerSync();
  const { data: tags } = useQuery<TagRow & { title_count: number }>(
    annotations.TAGS_FOR_HOUSEHOLD,
    [householdId],
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  const remove = (tag: TagRow) => {
    Alert.alert(
      `Delete ${tag.name}?`,
      "It comes off every title that carries it. Ratings and viewings are untouched.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            void annotations
              .deleteTag(db, tag.id)
              .catch((cause) => console.warn("[tags] could not delete", cause)),
        },
      ],
    );
  };

  return (
    <Section title="Tags" hint="Shared labels the household applies to titles here.">
      {tags.length === 0 ? (
        <Meta>None yet — coin the first below.</Meta>
      ) : null}
      <View className="pt-1">
        <TagList>
          {tags.map((tag) => (
            <Tag key={tag.id} label={tag.name ?? ""} onRemove={() => remove(tag)} />
          ))}
          <AddTag label="New tag" onPress={() => setPickerOpen(true)} />
        </TagList>
      </View>

      <TagPicker
        visible={pickerOpen}
        householdId={householdId}
        activeIds={tags.map((t) => t.id)}
        heading="New tag"
        note="Type a label the household will share across titles."
        onClose={() => setPickerOpen(false)}
        onPick={() => {}}
      />
    </Section>
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

/** Two stacked cards — the standard "copy" mark. Drawn, per the no-icon-library rule. */
function CopyGlyph({ color = ink.muted }: { color?: string }) {
  return (
    <View style={{ width: 15, height: 15 }}>
      <View
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: 10,
          height: 10,
          borderRadius: 2.5,
          borderWidth: 1.5,
          borderColor: color,
        }}
      />
      {/* Front card, filled with the page ground so the back card reads as behind it. */}
      <View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: 10,
          height: 10,
          borderRadius: 2.5,
          borderWidth: 1.5,
          borderColor: color,
          backgroundColor: paper.bg,
        }}
      />
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

  const set = (next: {
    coverage?: "any" | "all";
    aggregator?: "avg" | "min" | "max";
  }) => {
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

