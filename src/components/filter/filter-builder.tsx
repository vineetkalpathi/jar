/**
 * The Jar filter builder — one section per attribute domain, in the order the design
 * README lays out: title attributes, tags, ratings, viewing history, library & draws.
 *
 * It holds no state of its own. The host screen owns the `FilterDraft`, supplies the
 * name field and the footer (match count + save), and decides what "save" means — a new
 * Jar, an edit, or an ephemeral Library narrowing. Everything the builder produces is a
 * subset of the closed catalogue in `docs/filter-leaves.md`; `draftToFilter` assembles
 * the stored tree and `parseFilter` is the gate before it is ever persisted.
 */

import { Pressable, Text, View } from "react-native";
import { Body, Eyebrow } from "@/components/text";
import { emptyDraft, type FilterDraft } from "@/lib/filter";
import { AttributesSection } from "./attributes-section";
import { HistorySection } from "./history-section";
import { RatingsSection } from "./ratings-section";
import { TagsSection } from "./tags-section";
import { ViewingSection } from "./viewing-section";

export function FilterBuilder({
  value,
  onChange,
  householdId,
}: {
  value: FilterDraft;
  onChange: (next: FilterDraft) => void;
  householdId: string;
}) {
  if (value.advanced) {
    return (
      <View className="gap-3 rounded-card border-dashed-hairline p-4">
        <Eyebrow>Advanced filter</Eyebrow>
        <Body>
          This jar's filter was built outside the section editor, so it can't be shown
          here. You can keep it as is, or start over with the sections.
        </Body>
        <Pressable
          onPress={() => onChange(emptyDraft())}
          accessibilityRole="button"
          className="self-start active:opacity-60"
        >
          <Text className="type-meta-small text-rust">Start over</Text>
        </Pressable>
      </View>
    );
  }

  const sectionProps = { value, onChange, householdId };

  return (
    <View className="gap-9">
      <AttributesSection {...sectionProps} />
      <TagsSection {...sectionProps} />
      <RatingsSection {...sectionProps} />
      <ViewingSection {...sectionProps} />
      <HistorySection {...sectionProps} />
    </View>
  );
}
