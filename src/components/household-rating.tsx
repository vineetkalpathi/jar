/**
 * The household rating section on Title detail — one bar per activated Rating
 * Category, amber-filled by average.
 *
 * Shared because two screens show it: the DB-linked Title detail screen, and the
 * pre-add TMDB preview, which grows this section in place the moment "Add to library"
 * resolves rather than navigating anywhere (there is nothing about this section that
 * needed a new screen — it only needed the Library row to exist).
 */

import { Text, View } from "react-native";
import { DarkBody, DarkEyebrow } from "./text";
import type { RatingCategoryRow, RatingRow } from "@/lib/db";

export type RatingWithCategory = RatingRow & { category_name: string; display_name: string };

export function HouseholdRating({
  categories,
  ratings,
}: {
  categories: RatingCategoryRow[];
  ratings: RatingWithCategory[];
}) {
  if (categories.length === 0) return null;
  const raterCount = new Set(ratings.map((r) => r.user_id)).size;

  return (
    <View className="mt-6 gap-3.5 border-t border-dark-hairline pt-5">
      <DarkEyebrow>
        Household rating
        {raterCount > 0
          ? ` · average of ${raterCount} ${raterCount === 1 ? "rater" : "raters"}`
          : ""}
      </DarkEyebrow>
      {categories.map((category) => (
        <RatingBar key={category.id} category={category} ratings={ratings} />
      ))}
    </View>
  );
}

function RatingBar({
  category,
  ratings,
}: {
  category: RatingCategoryRow;
  ratings: RatingWithCategory[];
}) {
  // `value` is nullable in the generated row type — SQLite carries none of Postgres'
  // `not null` constraints locally (schema.ts) — though nothing writes a null one today.
  const values = ratings
    .filter((r) => r.category_id === category.id)
    .map((r) => r.value)
    .filter((v): v is number => v != null);
  const average = values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : null;

  return (
    <View>
      <View className="flex-row items-baseline justify-between">
        <DarkBody>{category.name}</DarkBody>
        <Text className="type-title-large text-dark-ink">
          {average !== null ? average.toFixed(1) : "—"}
        </Text>
      </View>
      <View
        style={{ height: 3 }}
        className="mt-1.5 overflow-hidden rounded-sm bg-dark-hairline"
      >
        {average !== null ? (
          <View className="h-full bg-amber" style={{ width: `${(average / 10) * 100}%` }} />
        ) : null}
      </View>
    </View>
  );
}
