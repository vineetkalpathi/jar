/**
 * Pick a Rating Category from the global catalogue, or coin a new one.
 *
 * The catalogue is find-or-create by name (`households.findOrCreateCategory`), so the
 * list is every existing axis plus a "Create …" row when the search text matches none
 * of them. Picking resolves to a category id and hands it back; the caller decides what
 * to do with it — every call site so far activates it for the Household.
 *
 * A plain controlled component rather than a routed modal: it opens over both the paper
 * Household screen and the dark Title screen, and it returns a value. The sheet itself
 * stays paper in both places — a Household's own vocabulary is paper, never the dark
 * TMDB register.
 */

import { usePowerSync, useQuery } from "@powersync/react";
import { useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, Text, View } from "react-native";
import { Field } from "./field";
import { Eyebrow, Meta } from "./text";
import { households, type RatingCategoryRow } from "@/lib/db";
import { accent, ink } from "@/theme";

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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable
        className="flex-1 justify-end"
        style={{ backgroundColor: "rgba(0,0,0,0.3)" }}
        onPress={close}
      >
        <Pressable
          className="bg-paper px-6 pb-10 pt-5"
          style={{ borderTopLeftRadius: 10, borderTopRightRadius: 10 }}
          // Catches the touch so a tap on the sheet doesn't dismiss it.
          onPress={() => {}}
        >
          <View className="mb-4 gap-1">
            <Eyebrow>{heading}</Eyebrow>
            {note ? <Meta>{note}</Meta> : null}
          </View>

          <Field
            label="Search axes"
            value={query}
            onChangeText={setQuery}
            placeholder="Plot, Tension, Chemistry…"
            autoCapitalize="words"
            autoCorrect={false}
            autoFocus
          />

          <View className="mt-4">
            {q && !exact ? (
              <Row label={`Create “${query.trim()}”`} accent disabled={busy} onPress={coin} />
            ) : null}

            {matches.map((c) =>
              active.has(c.id) ? (
                <Row key={c.id} label={c.name ?? ""} trailing="Added" disabled />
              ) : (
                <Row
                  key={c.id}
                  label={c.name ?? ""}
                  disabled={busy}
                  onPress={() => hand({ id: c.id, name: c.name ?? "" })}
                />
              ),
            )}

            {all.length === 0 ? <ActivityIndicator className="py-4" color={accent.forest} /> : null}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Row({
  label,
  trailing,
  accent: isAccent,
  disabled,
  onPress,
}: {
  label: string;
  trailing?: string;
  accent?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole="button"
      className="flex-row items-center justify-between border-b border-hairline py-3 active:opacity-60"
    >
      <Text className="type-body" style={{ color: isAccent ? accent.forest : ink.primary }}>
        {label}
      </Text>
      {trailing ? <Text className="type-meta-small text-ink-faint">{trailing}</Text> : null}
    </Pressable>
  );
}
