/**
 * The Jar filter builder. Starts blank; every condition is added deliberately through
 * "Add filter", lands as a chip that states it in words, and re-opens its editor on tap.
 *
 * It holds no draft state of its own — the host screen owns the `FilterDraft`, the name
 * field, and the footer (match count + save), and decides what "save" means. Everything
 * it produces is a slice of the closed catalogue in `docs/filter-leaves.md`; the draft
 * is still assembled by `draftToFilter` and gated by `parseFilter` before it is stored.
 *
 * The chip layer is presentation only: `draftToChips` derives chips from the draft, and
 * the editors write straight back into the draft slice. A tree the sections can't
 * represent still arrives as `advanced` and the builder offers to start over.
 */

import { useMemo, useState } from "react";
import { LayoutAnimation, Pressable, Text, View } from "react-native";
import { emptyDraft, type FilterDraft } from "@/lib/filter";
import { ink } from "@/theme";
import { Body, Eyebrow, Meta } from "@/components/text";
import { MULTI_ATTRS, type AttrKey } from "@/lib/filter/catalogue";
import { draftToChips, removeChip } from "@/lib/filter/chips";
import { AttributePicker } from "./attribute-picker";
import { PredicateChip } from "./predicate-chip";
import { EditorHost, type EditRequest } from "./predicate-editors";
import { useChipContext } from "./use-chip-context";

/** Cast/director chips have nothing to edit — the rule is always "contains". */
const NON_EDITABLE: ReadonlySet<AttrKey> = new Set<AttrKey>(["cast", "director"]);

/**
 * What the builder's tail is showing: the dashed "Add filter" button, the attribute
 * grid, or one attribute's editor. Only ever one at a time — the card expands in place
 * rather than stacking a sheet.
 */
type Phase =
  | { kind: "idle" }
  | { kind: "picking" }
  | { kind: "editing"; request: EditRequest };

export function FilterBuilder({
  value,
  onChange,
  householdId,
}: {
  value: FilterDraft;
  onChange: (next: FilterDraft) => void;
  householdId: string;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const ctx = useChipContext(householdId, value);

  /** Animate every phase change — card expand/collapse, chip swap. */
  const go = (next: Phase) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPhase(next);
  };

  const chips = useMemo(() => draftToChips(value, ctx), [value, ctx]);
  const present = useMemo(
    () => new Set<AttrKey>(chips.map((c) => c.attr)),
    [chips],
  );

  if (value.advanced) {
    return (
      <View className="gap-3 rounded-card border-dashed-hairline p-4">
        <Eyebrow style={{ fontSize: 12.5 }}>Advanced filter</Eyebrow>
        <Body style={{ fontSize: 16 }}>
          This jar&apos;s filter was built outside the section editor, so it can&apos;t
          be shown here. You can keep it as is, or start over.
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

  const remove = (attr: AttrKey, chipId: string, refId?: string) =>
    onChange(removeChip(value, attr, chipId, refId));

  return (
    <View className="gap-4">
      {chips.length === 0 ? (
        <Meta style={{ fontSize: 14 }}>
          No filters yet — with none, the jar stays empty until you pin titles to it.
        </Meta>
      ) : (
        <View className="gap-2">
          {chips.map((chip) => (
            <PredicateChip
              key={chip.id}
              chip={chip}
              editable={!NON_EDITABLE.has(chip.attr)}
              onEdit={() =>
                go({
                  kind: "editing",
                  request: { attr: chip.attr, refId: chip.refId, isNew: false },
                })
              }
              onRemove={() => remove(chip.attr, chip.id, chip.refId)}
            />
          ))}
        </View>
      )}

      {phase.kind === "idle" ? (
        <Pressable
          onPress={() => go({ kind: "picking" })}
          accessibilityRole="button"
          accessibilityLabel="Add filter"
          className="w-full items-center rounded-full border-dashed-hairline py-4 active:opacity-60"
        >
          <Text className="type-meta text-navy">＋ Add filter</Text>
        </Pressable>
      ) : (
        <View className="w-full gap-3 rounded-sheet border border-hairline bg-card p-5">
          {/* Cancel — its own top-right row, in flow, so nothing below has to make
              room for it and the action buttons stay symmetric in the card. */}
          <View className="flex-row justify-end">
            <Pressable
              onPress={() => go({ kind: "idle" })}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              hitSlop={12}
              className="h-6 w-6 items-center justify-center active:opacity-50"
            >
              <Text style={{ color: ink.muted, fontSize: 20, lineHeight: 20 }}>×</Text>
            </Pressable>
          </View>

          <View className="gap-4">
            {phase.kind === "picking" ? (
              <AttributePicker
                present={present}
                onPick={(key) =>
                  // A single-instance attribute already on the draft re-opens its
                  // editor; the list attributes always start a fresh chip.
                  go({
                    kind: "editing",
                    request: {
                      attr: key,
                      isNew: MULTI_ATTRS.has(key) || !present.has(key),
                    },
                  })
                }
              />
            ) : (
              <>
                {phase.request.isNew ? (
                  <Pressable
                    onPress={() => go({ kind: "picking" })}
                    accessibilityRole="button"
                    className="self-start active:opacity-60"
                  >
                    <Text className="type-meta text-navy">‹  All filters</Text>
                  </Pressable>
                ) : null}
                <EditorHost
                  request={phase.request}
                  draft={value}
                  onChange={onChange}
                  householdId={householdId}
                  onClose={() => go({ kind: "idle" })}
                />
              </>
            )}
          </View>
        </View>
      )}
    </View>
  );
}
