/**
 * The Tags section on Title detail — the Household's shared labels for this Title, with
 * the affordance to add and remove them. Sibling of `household-rating.tsx`: same place
 * on the screen, same dark register, same "chips plus a ＋" shape.
 *
 * A Tag belongs to the Household, so adding one here draws from (or extends) the
 * Household's whole vocabulary — the `TagPicker` searches existing tags first and
 * coins a new one only when nothing matches. Attaching and detaching a Title is
 * unconfirmed: both are cheap and reversible, unlike activating a rating axis.
 *
 * Shared because two screens show it: the DB-linked Title detail screen and the
 * pre-add TMDB preview, which grows this section in place once there's a Library row.
 */

import { usePowerSync } from "@powersync/react";
import { useState } from "react";
import { View } from "react-native";
import { AddTag, Tag, TagList } from "./tag";
import { TagPicker } from "./tag-picker";
import { DarkEyebrow, DarkMeta } from "./text";
import { annotations, type TagRow } from "@/lib/db";

export function TitleTags({
  titleId,
  householdId,
  tags,
}: {
  titleId: string;
  householdId: string;
  tags: TagRow[];
}) {
  const db = usePowerSync();
  const [pickerOpen, setPickerOpen] = useState(false);

  const add = (tags: { id: string }[]) =>
    annotations
      .tagTitleMany(db, { householdId, titleId, tagIds: tags.map((t) => t.id) })
      .catch((cause) => console.warn("[tags] could not attach", cause));

  const remove = (tagId: string) =>
    annotations
      .untagTitle(db, { householdId, titleId, tagId })
      .catch((cause) => console.warn("[tags] could not detach", cause));

  return (
    <View className="mt-6 gap-3 border-t border-dark-hairline pt-5">
      <DarkEyebrow>Tags</DarkEyebrow>

      {tags.length === 0 ? (
        <DarkMeta>No tags yet — labels the whole household shares.</DarkMeta>
      ) : null}

      <TagList>
        {tags.map((tag) => (
          <Tag
            key={tag.id}
            label={tag.name ?? ""}
            register="dark"
            onRemove={() => remove(tag.id)}
          />
        ))}
        <AddTag register="dark" onPress={() => setPickerOpen(true)} />
      </TagList>

      <TagPicker
        visible={pickerOpen}
        householdId={householdId}
        activeIds={tags.map((t) => t.id)}
        note="Belongs to the household — pick an existing label or make a new one."
        multi
        onClose={() => setPickerOpen(false)}
        onSubmit={add}
      />
    </View>
  );
}
