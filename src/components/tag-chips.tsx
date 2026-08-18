/** A Household's Tags on a Title — dark register only; both current call sites are. */

import { View } from "react-native";
import { DarkMeta } from "./text";
import type { TagRow } from "@/lib/db";

export function TagChips({ tags }: { tags: TagRow[] }) {
  if (tags.length === 0) return null;
  return (
    <View className="mt-1 flex-row flex-wrap gap-1.5">
      {tags.map((tag) => (
        <View key={tag.id} className="rounded-card border border-dark-hairline px-2 py-1">
          <DarkMeta>{tag.name}</DarkMeta>
        </View>
      ))}
    </View>
  );
}
