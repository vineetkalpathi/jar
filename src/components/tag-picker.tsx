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
 * screen and the dark Title screen and returns a value. The sheet stays paper in both
 * places — a Household's own vocabulary is paper, never the dark TMDB register. Sibling
 * of `category-picker.tsx`, kept separate because a Tag and a Rating axis are different
 * things with different stores.
 */

import { usePowerSync, useQuery } from "@powersync/react";
import { useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, Text, View } from "react-native";
import { Field } from "./field";
import { Eyebrow, Meta } from "./text";
import { annotations, type TagRow } from "@/lib/db";
import { accent, ink } from "@/theme";

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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable
        className="flex-1 justify-end"
        style={{ backgroundColor: "rgba(0,0,0,0.3)" }}
        onPress={close}
      >
        <Pressable
          className="bg-paper px-6 pb-10 pt-5"
          style={{ borderTopLeftRadius: 10, borderTopRightRadius: 10 }}
          onPress={() => {}}
        >
          <View className="mb-4 gap-1">
            <Eyebrow>{heading}</Eyebrow>
            {note ? <Meta>{note}</Meta> : null}
          </View>

          <Field
            label="Search tags"
            value={query}
            onChangeText={setQuery}
            placeholder="cozy, date-night, long-haul…"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />

          <View className="mt-4">
            {q && !exact ? (
              <Row label={`Create “${query.trim()}”`} accent disabled={busy} onPress={coin} />
            ) : null}

            {matches.map((t) =>
              active.has(t.id) ? (
                <Row key={t.id} label={t.name ?? ""} trailing="Added" disabled />
              ) : (
                <Row
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
