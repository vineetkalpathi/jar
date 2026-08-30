/**
 * Pick a Tag from the Household's vocabulary, or coin a new one.
 *
 * The list is every Tag the Household already has; typing filters it, and when the
 * text matches none of them a "Create …" row appears that runs
 * `annotations.findOrCreateTag`. Picking resolves to a tag id and hands it back — the
 * caller decides what to do with it (Title detail attaches it; the Household page has
 * nothing more to do, the coin already persisted).
 *
 * A controlled component, not a routed modal: it opens over both the paper Household
 * screen and the dark Title screen and returns a value. The paper sheet shell and its
 * keyboard handling live in `picker-sheet.tsx`. Sibling of `category-picker.tsx`, kept
 * separate because a Tag and a Rating axis are different things with different stores.
 */

import { usePowerSync, useQuery } from "@powersync/react";
import { useMemo, useState } from "react";
import { ActivityIndicator } from "react-native";
import { PickerRow, PickerSheet } from "./picker-sheet";
import { Meta } from "./text";
import { annotations, type TagRow } from "@/lib/db";
import { accent } from "@/theme";

type TagWithCount = TagRow & { title_count: number };

export function TagPicker({
  visible,
  householdId,
  activeIds,
  heading = "Add a tag",
  note,
  onClose,
  onPick,
}: {
  visible: boolean;
  householdId: string;
  /** Tags already applied here — shown as "Added", not tappable. */
  activeIds: string[];
  heading?: string;
  note?: string;
  onClose: () => void;
  onPick: (tag: { id: string; name: string }) => void | Promise<void>;
}) {
  const db = usePowerSync();
  const { data: all, isLoading } = useQuery<TagWithCount>(annotations.TAGS_FOR_HOUSEHOLD, [
    householdId,
  ]);

  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () => (q ? all.filter((t) => t.name?.toLowerCase().includes(q)) : all),
    [all, q],
  );
  const exact = all.some((t) => t.name?.toLowerCase() === q);
  const active = new Set(activeIds);

  const close = () => {
    setQuery("");
    onClose();
  };

  const hand = async (tag: { id: string; name: string }) => {
    if (busy) return;
    setBusy(true);
    try {
      await onPick(tag);
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
      await onPick({ id, name: query.trim() });
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
    >
      {q && !exact ? (
        <PickerRow label={`Create “${query.trim()}”`} accent disabled={busy} onPress={coin} />
      ) : null}

      {matches.map((t) =>
        active.has(t.id) ? (
          <PickerRow key={t.id} label={t.name ?? ""} added disabled />
        ) : (
          <PickerRow
            key={t.id}
            label={t.name ?? ""}
            trailing={t.title_count > 0 ? `${t.title_count}` : undefined}
            disabled={busy}
            onPress={() => hand({ id: t.id, name: t.name ?? "" })}
          />
        ),
      )}

      {isLoading && all.length === 0 ? (
        <ActivityIndicator className="py-4" color={accent.forest} />
      ) : null}
      {!isLoading && all.length === 0 && !q ? (
        <Meta>No tags yet — type one above to make the first.</Meta>
      ) : null}
    </PickerSheet>
  );
}
