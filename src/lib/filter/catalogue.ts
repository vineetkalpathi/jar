/**
 * The UI-facing catalogue of filterable attributes — what the "Add filter" sheet lists
 * and what each chip is keyed to. One entry per way of starting a condition; it mirrors
 * the closed leaf catalogue in `docs/filter-leaves.md` / `LEAF_SPECS` and must not
 * exceed it.
 *
 * `multi` entries (cast, director, tag, rating) add another chip each time they are
 * picked; the rest are a single chip — including genre and language, whose one editor is
 * a multi-select — that re-opens its editor when picked again.
 */

export type AttrKey =
  | "mediaType"
  | "genre"
  | "releaseYear"
  | "runtime"
  | "language"
  | "cast"
  | "director"
  | "tag"
  | "rating"
  | "watched"
  | "watchCount"
  | "lastWatched"
  | "addedToLibrary"
  | "addedBy"
  | "lastDrawn";

export type AttrGroup =
  | "Title"
  | "Tags"
  | "Ratings"
  | "Viewing"
  | "Library & draws";

export type AttrEntry = {
  key: AttrKey;
  label: string;
  group: AttrGroup;
  /** Several of this attribute can coexist; picking it again adds another. */
  multi: boolean;
  hint?: string;
};

export const ATTRIBUTES: AttrEntry[] = [
  { key: "mediaType", label: "Title type", group: "Title", multi: false },
  { key: "genre", label: "Genre", group: "Title", multi: false },
  { key: "releaseYear", label: "Release year", group: "Title", multi: false },
  { key: "runtime", label: "Runtime", group: "Title", multi: false },
  { key: "language", label: "Original language", group: "Title", multi: false },
  { key: "cast", label: "Cast member", group: "Title", multi: true },
  { key: "director", label: "Director", group: "Title", multi: true },
  { key: "tag", label: "Tag", group: "Tags", multi: true },
  { key: "rating", label: "Rating", group: "Ratings", multi: true },
  { key: "watched", label: "Seen by", group: "Viewing", multi: false },
  { key: "watchCount", label: "Rewatch count", group: "Viewing", multi: false },
  { key: "lastWatched", label: "Last watched", group: "Viewing", multi: false },
  {
    key: "addedToLibrary",
    label: "Added to library",
    group: "Library & draws",
    multi: false,
  },
  { key: "addedBy", label: "Added by", group: "Library & draws", multi: false },
  {
    key: "lastDrawn",
    label: "Draw history",
    group: "Library & draws",
    multi: false,
    hint: "For jars like “nothing this one has picked before.”",
  },
];

export const GROUP_ORDER: AttrGroup[] = [
  "Title",
  "Tags",
  "Ratings",
  "Viewing",
  "Library & draws",
];

export const ATTR_LABEL: Record<AttrKey, string> = Object.fromEntries(
  ATTRIBUTES.map((a) => [a.key, a.label]),
) as Record<AttrKey, string>;

/** Attributes that add another chip on each pick, rather than re-opening one editor. */
export const MULTI_ATTRS: ReadonlySet<AttrKey> = new Set(
  ATTRIBUTES.filter((a) => a.multi).map((a) => a.key),
);
