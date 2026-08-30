/**
 * Tags — the Household's own vocabulary. Closed-world, unlike the TMDB attributes: an
 * untagged Title genuinely does not have the tag, so "doesn't have cozy" is a real
 * answer, not unknown (ADR-0006).
 */

import { useQuery } from "@powersync/react";
import { useState } from "react";
import { Pressable, Text } from "react-native";
import { TagPicker } from "@/components/tag-picker";
import { Meta } from "@/components/text";
import { annotations, type TagRow } from "@/lib/db";
import type { FilterDraft } from "@/lib/filter";
import {
  ChipWrap,
  CycleChip,
  nextCycle,
  Section,
  type CycleState,
} from "./section";

export function TagsSection({
  value,
  onChange,
  householdId,
}: {
  value: FilterDraft;
  onChange: (next: FilterDraft) => void;
  householdId: string;
}) {
  const { data: tags } = useQuery<TagRow>(annotations.TAGS_FOR_HOUSEHOLD, [householdId]);
  const [picking, setPicking] = useState(false);

  const stateOf = (id: string): CycleState =>
    value.tags.include.includes(id)
      ? "include"
      : value.tags.exclude.includes(id)
        ? "exclude"
        : "off";

  const cycle = (id: string) => {
    const next = nextCycle(stateOf(id));
    onChange({
      ...value,
      tags: {
        include:
          next === "include"
            ? [...new Set([...value.tags.include, id])]
            : value.tags.include.filter((x) => x !== id),
        exclude:
          next === "exclude"
            ? [...new Set([...value.tags.exclude, id])]
            : value.tags.exclude.filter((x) => x !== id),
      },
    });
  };

  return (
    <Section title="Tags" hint="Tap once to require, twice to rule out.">
      {tags.length === 0 ? (
        <Meta>No tags yet — add some to titles, or coin one below.</Meta>
      ) : (
        <ChipWrap>
          {tags.map((tag) => (
            <CycleChip
              key={tag.id}
              label={tag.name ?? ""}
              state={stateOf(tag.id)}
              onPress={() => cycle(tag.id)}
            />
          ))}
          <Pressable
            onPress={() => setPicking(true)}
            accessibilityRole="button"
            className="rounded-full border-dashed-hairline px-3 py-1 active:opacity-60"
          >
            <Text className="type-meta-small text-navy">＋ New tag</Text>
          </Pressable>
        </ChipWrap>
      )}

      {tags.length === 0 ? (
        <Pressable
          onPress={() => setPicking(true)}
          accessibilityRole="button"
          className="self-start rounded-full border-dashed-hairline px-3 py-1 active:opacity-60"
        >
          <Text className="type-meta-small text-navy">＋ New tag</Text>
        </Pressable>
      ) : null}

      <TagPicker
        visible={picking}
        householdId={householdId}
        activeIds={[...value.tags.include, ...value.tags.exclude]}
        heading="Tag to filter on"
        note="Pick an existing tag or coin a new one for the household."
        onClose={() => setPicking(false)}
        onPick={(tag) =>
          onChange({
            ...value,
            tags: {
              ...value.tags,
              include: [...new Set([...value.tags.include, tag.id])],
            },
          })
        }
      />
    </Section>
  );
}
