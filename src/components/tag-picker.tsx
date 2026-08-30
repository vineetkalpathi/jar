/**
 * Pick a Tag from the Household's vocabulary, or coin a new one.
 *
 * The list is every Tag the Household already has; typing filters it, and when the
 * text matches none of them a "Create …" row appears that runs
 * `annotations.findOrCreateTag`. Picking resolves to a tag id and hands it back — the
 * caller decides what to do with it (Title detail attaches it; the Household page has
 * nothing more to do, the coin already persisted).
 *
 * `multi` turns it into a select-then-save flow: picking a row (or coining) collects
 * the tag as a removable chip at the top of the sheet and marks its row "Added"
 * instead of closing, and a pinned "Add N tags" button commits the whole set through
 * `onSubmit`. Without `multi` a single pick calls `onPick` and closes, as before.
 *
 * A controlled component, not a routed modal: it opens over both the paper Household
 * screen and the dark Title screen and returns a value. The paper sheet shell and its
 * keyboard handling live in `picker-sheet.tsx`. Sibling of `category-picker.tsx`, kept
 * separate because a Tag and a Rating axis are different things with different stores.
 */

import { usePowerSync, useQuery } from "@powersync/react";
import { useMemo, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Button } from "./button";
import { PickerRow, PickerSheet } from "./picker-sheet";
import { Tag } from "./tag";
import { Meta } from "./text";
import { annotations, type TagRow } from "@/lib/db";
import { accent } from "@/theme";

type TagWithCount = TagRow & { title_count: number };
type PickedTag = { id: string; name: string };

export function TagPicker({
  visible,
  householdId,
  activeIds,
  heading = "Add a tag",
  note,
  multi = false,
  onClose,
  onPick,
  onSubmit,
}: {
  visible: boolean;
  householdId: string;
  /** Tags already applied here — shown as "Added", not tappable. */
  activeIds: string[];
  heading?: string;
  note?: string;
  /** Collect several tags as chips, then commit them together through `onSubmit`. */
  multi?: boolean;
  onClose: () => void;
  /** Single-pick mode — one tag, then the sheet closes. */
  onPick?: (tag: PickedTag) => void | Promise<void>;
  /** Multi mode — every chip the person selected before pressing "Add". */
  onSubmit?: (tags: PickedTag[]) => void | Promise<void>;
}) {
  const db = usePowerSync();
  const { data: all, isLoading } = useQuery<TagWithCount>(annotations.TAGS_FOR_HOUSEHOLD, [
    householdId,
  ]);

  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<PickedTag[]>([]);

  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () => (q ? all.filter((t) => t.name?.toLowerCase().includes(q)) : all),
    [all, q],
  );
  const exact = all.some((t) => t.name?.toLowerCase() === q);
  const active = new Set(activeIds);
  const pickedIds = new Set(picked.map((t) => t.id));

  const close = () => {
    setQuery("");
    setPicked([]);
    onClose();
  };

  const toggle = (tag: PickedTag) =>
    setPicked((cur) =>
      cur.some((t) => t.id === tag.id) ? cur.filter((t) => t.id !== tag.id) : [...cur, tag],
    );

  const hand = async (tag: PickedTag) => {
    if (busy) return;
    if (multi) {
      toggle(tag);
      return;
    }
    setBusy(true);
    try {
      await onPick?.(tag);
      close();
    } finally {
      setBusy(false);
    }
  };

  const coin = async () => {
    if (busy || !q) return;
    setBusy(true);
    try {
      const id = await annotations.findOrCreateTag(db, householdId, query);
      const tag = { id, name: query.trim() };
      if (multi) {
        if (!pickedIds.has(id)) setPicked((cur) => [...cur, tag]);
        setQuery("");
      } else {
        await onPick?.(tag);
        close();
      }
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (busy || picked.length === 0) return;
    setBusy(true);
    try {
      await onSubmit?.(picked);
      close();
    } finally {
      setBusy(false);
    }
  };

  return (
    <PickerSheet
      visible={visible}
      heading={heading}
      note={note}
      query={query}
      onChangeText={setQuery}
      placeholder="cozy, date-night, long-haul…"
      autoCapitalize="none"
      searchAccessibilityLabel="Search tags"
      onClose={close}
      footer={
        multi ? (
          <Button
            label={
              picked.length === 0
                ? "Add tags"
                : `Add ${picked.length} ${picked.length === 1 ? "tag" : "tags"}`
            }
            onPress={submit}
            disabled={picked.length === 0}
            loading={busy}
          />
        ) : undefined
      }
    >
      {multi && picked.length > 0 ? (
        <View className="mb-1 flex-row flex-wrap items-center gap-1.5 border-b border-hairline pb-3">
          {picked.map((t) => (
            <Tag key={t.id} label={t.name} onRemove={() => toggle(t)} />
          ))}
        </View>
      ) : null}

      {q && !exact ? (
        <PickerRow label={`Create “${query.trim()}”`} accent disabled={busy} onPress={coin} />
      ) : null}

      {matches.map((t) => {
        if (active.has(t.id)) {
          return <PickerRow key={t.id} label={t.name ?? ""} added disabled />;
        }
        if (multi && pickedIds.has(t.id)) {
          return (
            <PickerRow
              key={t.id}
              label={t.name ?? ""}
              added
              onPress={() => toggle({ id: t.id, name: t.name ?? "" })}
            />
          );
        }
        return (
          <PickerRow
            key={t.id}
            label={t.name ?? ""}
            trailing={t.title_count > 0 ? `${t.title_count}` : undefined}
            disabled={busy}
            onPress={() => hand({ id: t.id, name: t.name ?? "" })}
          />
        );
      })}

      {isLoading && all.length === 0 ? (
        <ActivityIndicator className="py-4" color={accent.forest} />
      ) : null}
      {!isLoading && all.length === 0 && !q ? (
        <Meta>No tags yet — type one above to make the first.</Meta>
      ) : null}
    </PickerSheet>
  );
}
