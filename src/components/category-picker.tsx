/**
 * Pick a Rating Category from the global catalogue, or coin a new one.
 *
 * The catalogue is find-or-create by name (`households.findOrCreateCategory`), so the
 * list is every existing axis plus a "Create …" row when the search text matches none
 * of them. Picking resolves to a category id and hands it back; the caller decides what
 * to do with it — every call site so far activates it for the Household.
 *
 * A plain controlled component rather than a routed modal: it opens over both the paper
 * Household screen and the dark Title screen, and it returns a value. The paper sheet
 * shell and its keyboard handling live in `picker-sheet.tsx`.
 */

import { usePowerSync, useQuery } from "@powersync/react";
import { useMemo, useState } from "react";
import { ActivityIndicator } from "react-native";
import { PickerRow, PickerSheet } from "./picker-sheet";
import { households, type RatingCategoryRow } from "@/lib/db";
import { accent } from "@/theme";

export function CategoryPicker({
  visible,
  activeIds,
  heading = "Add a rating axis",
  note,
  onClose,
  onPick,
}: {
  visible: boolean;
  /** Categories already active for the Household — shown as "Added", not tappable. */
  activeIds: string[];
  heading?: string;
  note?: string;
  onClose: () => void;
  onPick: (category: { id: string; name: string }) => void | Promise<void>;
}) {
  const db = usePowerSync();
  const { data: all } = useQuery<RatingCategoryRow>(households.ALL_CATEGORIES);

  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () => (q ? all.filter((c) => c.name?.toLowerCase().includes(q)) : all),
    [all, q],
  );
  const exact = all.some((c) => c.name?.toLowerCase() === q);
  const active = new Set(activeIds);

  const close = () => {
    setQuery("");
    onClose();
  };

  const hand = async (category: { id: string; name: string }) => {
    if (busy) return;
    setBusy(true);
    try {
      await onPick(category);
      close();
    } finally {
      setBusy(false);
    }
  };

  const coin = async () => {
    if (busy || !q) return;
    setBusy(true);
    try {
      const id = await households.findOrCreateCategory(db, query);
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
      placeholder="Plot, Tension, Chemistry…"
      autoCapitalize="words"
      searchAccessibilityLabel="Search axes"
      onClose={close}
    >
      {q && !exact ? (
        <PickerRow label={`Create “${query.trim()}”`} accent disabled={busy} onPress={coin} />
      ) : null}

      {matches.map((c) =>
        active.has(c.id) ? (
          <PickerRow key={c.id} label={c.name ?? ""} added disabled />
        ) : (
          <PickerRow
            key={c.id}
            label={c.name ?? ""}
            disabled={busy}
            onPress={() => hand({ id: c.id, name: c.name ?? "" })}
          />
        ),
      )}

      {all.length === 0 ? (
        <ActivityIndicator className="py-4" color={accent.forest} />
      ) : null}
    </PickerSheet>
  );
}
