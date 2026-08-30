/**
 * The per-attribute editors behind each chip, plus `EditorHost` — the switch the builder
 * mounts when a chip is being added or edited.
 *
 * Each editor is a small controlled form in an `EditorFrame` — the inline block the
 * builder's card expands into. It seeds a working copy from the relevant slice of the
 * `FilterDraft` (or a sensible default when the chip is new), and on commit writes that
 * slice straight back. "Remove" clears the slice.
 *
 * `cast` and `director` have no frame: they route straight to `PersonPicker`, and each
 * person is its own add-only chip. `rating` opens `CategoryPicker` for the axis choice,
 * then drops back into an `EditorFrame` for the op/value.
 */

import { usePowerSync, useQuery } from "@powersync/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { CategoryPicker } from "@/components/category-picker";
import { MemberMultiSelect } from "@/components/member-multi-select";
import { PersonPicker } from "@/components/person-picker";
import { RangeField } from "@/components/range-field";
import { RatingSlider } from "@/components/rating-slider";
import { Segmented } from "@/components/segmented";
import { Stepper } from "@/components/stepper";
import { Meta } from "@/components/text";
import { TimeField } from "@/components/time-field";
import {
  annotations,
  households,
  library,
  type RatingCategoryRow,
  type TagRow,
} from "@/lib/db";
import { ATTR_LABEL, type AttrKey } from "@/lib/filter/catalogue";
import type {
  FilterDraft,
  RaterScope,
  RatingClauseDraft,
  TimeDraft,
  WatchedMode,
} from "@/lib/filter";
import { movieGenres, tvGenres } from "@/lib/tmdb/genres";
import { accent, ink, paper } from "@/theme";
import { EditorFrame } from "./editor-frame";
import { ChipWrap, CycleChip, nextCycle, type CycleState } from "./section";

// ---------------------------------------------------------------------------
// Host
// ---------------------------------------------------------------------------

export type EditRequest = {
  attr: AttrKey;
  /** Which row of a multi attribute — person / tag / category id. */
  refId?: string;
  /** No slice yet; seed from a default and show "Add", not "Remove". */
  isNew: boolean;
};

const DEFAULT_LAST_WATCHED: TimeDraft = {
  mode: "older_than",
  amount: 1,
  unit: "year",
};
const DEFAULT_ADDED: TimeDraft = { mode: "within", amount: 6, unit: "month" };
const DEFAULT_DRAWN: TimeDraft = { mode: "older_than", amount: 1, unit: "month" };

export function EditorHost({
  request,
  draft,
  onChange,
  householdId,
  onClose,
}: {
  request: EditRequest | null;
  draft: FilterDraft;
  onChange: (next: FilterDraft) => void;
  householdId: string;
  onClose: () => void;
}) {
  if (!request) return null;
  const { attr, refId, isNew } = request;
  const common = { draft, onChange, onClose, householdId };

  switch (attr) {
    case "mediaType":
      return <MediaTypeEditor {...common} isNew={isNew} />;
    case "releaseYear":
    case "runtime":
      return <RangeEditor {...common} attr={attr} isNew={isNew} />;
    case "genre":
      return <GenreEditor {...common} isNew={isNew} />;
    case "language":
      return <LanguageEditor {...common} isNew={isNew} />;
    case "cast":
    case "director":
      return <PersonFlow {...common} field={attr === "cast" ? "cast" : "directors"} />;
    case "tag":
      return <TagFlow {...common} tagId={refId} isNew={isNew} />;
    case "rating":
      return <RatingFlow {...common} categoryId={refId} isNew={isNew} />;
    case "watched":
      return <WatchedEditor {...common} isNew={isNew} />;
    case "watchCount":
      return <WatchCountEditor {...common} isNew={isNew} />;
    case "lastWatched":
      return <LastWatchedEditor {...common} isNew={isNew} />;
    case "addedToLibrary":
      return <AddedToLibraryEditor {...common} isNew={isNew} />;
    case "addedBy":
      return <AddedByEditor {...common} isNew={isNew} />;
    case "lastDrawn":
      return <LastDrawnEditor {...common} isNew={isNew} />;
  }
}

type EditorProps = {
  draft: FilterDraft;
  onChange: (next: FilterDraft) => void;
  onClose: () => void;
  householdId: string;
  isNew: boolean;
};

// ---------------------------------------------------------------------------
// Title type
// ---------------------------------------------------------------------------

function MediaTypeEditor({ draft, onChange, onClose, isNew }: EditorProps) {
  const [value, setValue] = useState<"movie" | "tv">(
    draft.mediaType === "tv" ? "tv" : "movie",
  );

  return (
    <EditorFrame
      title={ATTR_LABEL.mediaType}
      commitLabel={isNew ? "Add filter" : "Update"}
      onCommit={() => {
        onChange({ ...draft, mediaType: value });
        onClose();
      }}
      onRemove={isNew ? undefined : () => reset(draft, onChange, onClose, { mediaType: "any" })}
      onClose={onClose}
    >
      <Segmented
        value={value}
        stretch
        options={[
          { value: "movie", label: "Movies" },
          { value: "tv", label: "TV" },
        ]}
        onChange={setValue}
      />
    </EditorFrame>
  );
}

// ---------------------------------------------------------------------------
// Release year / Runtime
// ---------------------------------------------------------------------------

function RangeEditor({
  draft,
  onChange,
  onClose,
  isNew,
  attr,
}: EditorProps & { attr: "releaseYear" | "runtime" }) {
  const [range, setRange] = useState(draft[attr]);
  const empty = range.min == null && range.max == null;

  return (
    <EditorFrame
      title={ATTR_LABEL[attr]}
      hint={
        attr === "runtime"
          ? "In minutes. Leave a side blank for no bound there."
          : "Leave a side blank for no bound there."
      }
      commitLabel={isNew ? "Add filter" : "Update"}
      commitDisabled={empty}
      onCommit={() => {
        onChange({ ...draft, [attr]: range });
        onClose();
      }}
      onRemove={
        isNew
          ? undefined
          : () => reset(draft, onChange, onClose, { [attr]: { min: null, max: null } })
      }
      onClose={onClose}
    >
      <RangeField
        value={range}
        onChange={setRange}
        unit={attr === "runtime" ? "min" : undefined}
        placeholder={
          attr === "releaseYear"
            ? { min: "Earliest", max: "Latest" }
            : { min: "Any", max: "Any" }
        }
      />
    </EditorFrame>
  );
}

// ---------------------------------------------------------------------------
// Genre
// ---------------------------------------------------------------------------

function GenreEditor({ draft, onChange, onClose, householdId, isNew }: EditorProps) {
  const [g, setG] = useState(draft.genres);
  const { data: rows } = useQuery<{ genre: string }>(library.GENRES_IN_LIBRARY, [
    householdId,
  ]);
  const [catalogue, setCatalogue] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    Promise.all([movieGenres(), tvGenres()])
      .then(([m, t]) => {
        if (!active) return;
        setCatalogue([...new Set([...m, ...t].map((x) => x.name))].sort());
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const names = [
    ...new Set([...g.include, ...g.exclude, ...catalogue, ...rows.map((r) => r.genre)]),
  ].sort();

  const stateOf = (name: string): CycleState =>
    g.include.includes(name) ? "include" : g.exclude.includes(name) ? "exclude" : "off";

  const cycle = (name: string) => {
    const next = nextCycle(stateOf(name));
    setG({
      ...g,
      include:
        next === "include"
          ? [...new Set([...g.include, name])]
          : g.include.filter((n) => n !== name),
      exclude:
        next === "exclude"
          ? [...new Set([...g.exclude, name])]
          : g.exclude.filter((n) => n !== name),
    });
  };

  const empty =
    g.include.length === 0 && g.exclude.length === 0 && !g.includeUnknown;

  return (
    <EditorFrame
      title={ATTR_LABEL.genre}
      hint="Tap once to require, twice to rule out."
      commitLabel={isNew ? "Add filter" : "Update"}
      commitDisabled={empty}
      onCommit={() => {
        onChange({ ...draft, genres: g });
        onClose();
      }}
      onRemove={
        isNew
          ? undefined
          : () =>
              reset(draft, onChange, onClose, {
                genres: {
                  include: [],
                  exclude: [],
                  includeUnknown: false,
                  matchAll: false,
                },
              })
      }
      onClose={onClose}
    >
      {names.length === 0 ? (
        <Meta style={{ fontSize: 14 }}>Add some titles and their genres show up here.</Meta>
      ) : (
        <ChipWrap>
          {names.map((name) => (
            <CycleChip
              key={name}
              label={name}
              state={stateOf(name)}
              onPress={() => cycle(name)}
            />
          ))}
        </ChipWrap>
      )}

      {g.include.length > 1 ? (
        <Segmented
          value={g.matchAll ? "all" : "any"}
          options={[
            { value: "any", label: "Match any" },
            { value: "all", label: "Match all" },
          ]}
          onChange={(m) => setG({ ...g, matchAll: m === "all" })}
        />
      ) : null}

      {!g.matchAll ? (
        <View className="flex-row items-center gap-2">
          <Switch
            value={g.includeUnknown}
            onValueChange={(includeUnknown) => setG({ ...g, includeUnknown })}
            trackColor={{ true: accent.forest, false: ink.faint }}
          />
          <Text className="type-meta text-ink-muted" style={{ fontSize: 14 }}>Also titles with no genre</Text>
        </View>
      ) : null}
    </EditorFrame>
  );
}

// ---------------------------------------------------------------------------
// Original language
// ---------------------------------------------------------------------------

function LanguageEditor({ draft, onChange, onClose, householdId, isNew }: EditorProps) {
  const [picked, setPicked] = useState<string[]>(draft.languages);
  const { data: rows } = useQuery<{ language: string }>(
    library.LANGUAGES_IN_LIBRARY,
    [householdId],
  );
  const names = [...new Set([...picked, ...rows.map((r) => r.language)])].sort();

  const toggle = (name: string) =>
    setPicked(
      picked.includes(name) ? picked.filter((n) => n !== name) : [...picked, name],
    );

  return (
    <EditorFrame
      title={ATTR_LABEL.language}
      hint="Matches a title in any language you pick."
      commitLabel={isNew ? "Add filter" : "Update"}
      commitDisabled={picked.length === 0}
      onCommit={() => {
        onChange({ ...draft, languages: picked });
        onClose();
      }}
      onRemove={
        isNew ? undefined : () => reset(draft, onChange, onClose, { languages: [] })
      }
      onClose={onClose}
    >
      {names.length === 0 ? (
        <Meta style={{ fontSize: 14 }}>Add some titles and their languages show up here.</Meta>
      ) : (
        <ChipWrap>
          {names.map((name) => {
            const on = picked.includes(name);
            return (
              <Pressable
                key={name}
                onPress={() => toggle(name)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                className="rounded-full border px-3.5 py-1.5 active:opacity-70"
                style={{
                  borderColor: on ? accent.forest : paper.border,
                  backgroundColor: on ? accent.forest : "transparent",
                }}
              >
                <Text
                  className="type-meta"
                  style={{ color: on ? paper.card : ink.secondary }}
                >
                  {name}
                </Text>
              </Pressable>
            );
          })}
        </ChipWrap>
      )}
    </EditorFrame>
  );
}

// ---------------------------------------------------------------------------
// Cast / Director
// ---------------------------------------------------------------------------

function PersonFlow({
  draft,
  onChange,
  onClose,
  field,
}: Omit<EditorProps, "isNew"> & { field: "cast" | "directors" }) {
  const db = usePowerSync();
  const valueRef = useRef(draft);
  valueRef.current = draft;

  const add = (person: { tmdbPersonId: number; name: string }) => {
    const current = valueRef.current[field];
    if (!current.some((p) => p.tmdbPersonId === person.tmdbPersonId)) {
      onChange({ ...valueRef.current, [field]: [...current, person] });
      library
        .findOrCreatePerson(db, {
          tmdbPersonId: person.tmdbPersonId,
          name: person.name,
        })
        .then((personId) => {
          const list = valueRef.current[field];
          onChange({
            ...valueRef.current,
            [field]: list.map((p) =>
              p.tmdbPersonId === person.tmdbPersonId ? { ...p, personId } : p,
            ),
          });
        })
        .catch((cause) => console.warn("[filter] could not resolve person:", cause));
    }
    onClose();
  };

  return (
    <PersonPicker
      visible
      heading={field === "cast" ? "Someone in the cast" : "Directed by"}
      note="Searches all of TMDB."
      onClose={onClose}
      onPick={add}
    />
  );
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

function TagFlow({
  draft,
  onChange,
  onClose,
  householdId,
  tagId,
  isNew,
}: EditorProps & { tagId?: string }) {
  const { data: tags } = useQuery<TagRow>(annotations.TAGS_FOR_HOUSEHOLD, [householdId]);

  const stateOf = (id: string): CycleState =>
    draft.tags.include.includes(id)
      ? "include"
      : draft.tags.exclude.includes(id)
        ? "exclude"
        : "off";

  const setState = (id: string, next: CycleState) =>
    onChange({
      ...draft,
      tags: {
        include:
          next === "include"
            ? [...new Set([...draft.tags.include, id])]
            : draft.tags.include.filter((x) => x !== id),
        exclude:
          next === "exclude"
            ? [...new Set([...draft.tags.exclude, id])]
            : draft.tags.exclude.filter((x) => x !== id),
      },
    });

  if (!isNew && tagId) {
    return (
      <EditorFrame
        title={ATTR_LABEL.tag}
        commitLabel="Update"
        onCommit={onClose}
        onRemove={() => {
          setState(tagId, "off");
          onClose();
        }}
        onClose={onClose}
      >
        <Segmented
          value={stateOf(tagId) === "exclude" ? "not_has" : "has"}
          stretch
          options={[
            { value: "has", label: "Has this tag" },
            { value: "not_has", label: "Doesn’t have it" },
          ]}
          onChange={(v) => setState(tagId, v === "not_has" ? "exclude" : "include")}
        />
      </EditorFrame>
    );
  }

  return (
    <EditorFrame
      title="Add a tag filter"
      hint="Tap once to require, twice to rule out."
      commitLabel="Done"
      onCommit={onClose}
      onClose={onClose}
    >
      {tags.length === 0 ? (
        <Meta style={{ fontSize: 14 }}>No tags yet — add some to titles first.</Meta>
      ) : (
        <ChipWrap>
          {tags.map((tag) => (
            <CycleChip
              key={tag.id}
              label={tag.name ?? ""}
              state={stateOf(tag.id)}
              onPress={() => setState(tag.id, nextCycle(stateOf(tag.id)))}
            />
          ))}
        </ChipWrap>
      )}
    </EditorFrame>
  );
}

// ---------------------------------------------------------------------------
// Ratings
// ---------------------------------------------------------------------------

type RatingOpKey = "lt" | "eq" | "gt";

const RATING_OPS: { value: RatingOpKey; label: string }[] = [
  { value: "lt", label: "less than" },
  { value: "eq", label: "equal to" },
  { value: "gt", label: "greater than" },
];

function RatingFlow({
  draft,
  onChange,
  onClose,
  householdId,
  categoryId,
  isNew,
}: EditorProps & { categoryId?: string }) {
  const { data: categories } = useQuery<RatingCategoryRow>(
    households.CATEGORIES_FOR_HOUSEHOLD,
    [householdId],
  );
  const [chosen, setChosen] = useState<string | undefined>(categoryId);
  // `CategoryPicker` fires `onClose` right after `onPick`; without this the whole
  // editor would tear down the instant an axis is picked (the "filter just cancels"
  // bug). Only an un-picked dismissal should close it.
  const picked = useRef(false);

  if (isNew && !chosen) {
    return (
      <CategoryPicker
        visible
        activeIds={draft.ratings.map((r) => r.categoryId)}
        heading="Which rating"
        onClose={() => {
          if (!picked.current) onClose();
        }}
        onPick={(c) => {
          picked.current = true;
          setChosen(c.id);
        }}
      />
    );
  }

  const id = chosen ?? categoryId;
  if (!id) return null;
  const category = categories.find((c) => c.id === id);
  const existing = draft.ratings.find((r) => r.categoryId === id) ?? null;

  return (
    <RatingEditor
      draft={draft}
      onChange={onChange}
      onClose={onClose}
      householdId={householdId}
      isNew={existing == null}
      categoryId={id}
      categoryName={category?.name ?? "Rating"}
      seed={existing}
    />
  );
}

function RatingEditor({
  draft,
  onChange,
  onClose,
  householdId,
  isNew,
  categoryId,
  categoryName,
  seed,
}: EditorProps & {
  categoryId: string;
  categoryName: string;
  seed: RatingClauseDraft | null;
}) {
  const seedOp: RatingOpKey =
    seed && (seed.op === "lt" || seed.op === "eq" || seed.op === "gt")
      ? seed.op
      : "gt";
  const [clause, setClause] = useState<RatingClauseDraft>(
    seed
      ? { ...seed, op: seedOp, value: seed.value ?? 7, min: undefined, max: undefined }
      : { categoryId, op: "gt", value: 7, scope: "household" },
  );
  const [showPolicy, setShowPolicy] = useState(false);
  const op = clause.op as RatingOpKey;
  const value = clause.value ?? 7;

  const commit = () => {
    const rest = draft.ratings.filter((r) => r.categoryId !== categoryId);
    onChange({ ...draft, ratings: [...rest, clause] });
    onClose();
  };

  return (
    <EditorFrame
      title={categoryName}
      hint="Scored 0–10."
      commitLabel={isNew ? "Add filter" : "Update"}
      onCommit={commit}
      onRemove={
        isNew
          ? undefined
          : () => {
              onChange({
                ...draft,
                ratings: draft.ratings.filter((r) => r.categoryId !== categoryId),
              });
              onClose();
            }
      }
      onClose={onClose}
    >
      <Segmented
        value={op}
        stretch
        options={RATING_OPS}
        onChange={(next) => setClause({ ...clause, op: next })}
      />

      <RatingSlider
        value={value}
        onChange={(v) => setClause({ ...clause, value: v })}
      />

      <View className="flex-row items-center gap-2">
        <Switch
          value={clause.includeUnrated ?? false}
          onValueChange={(includeUnrated) =>
            setClause({ ...clause, includeUnrated })
          }
          trackColor={{ true: accent.forest, false: ink.faint }}
        />
        <Text className="type-meta text-ink-muted" style={{ fontSize: 14 }}>Also keep unrated titles</Text>
      </View>

      <View className="gap-2">
        <Text className="type-eyebrow text-ink-muted" style={{ fontSize: 12.5 }}>Whose ratings</Text>
        <ScopeControls
          scope={clause.scope}
          householdId={householdId}
          onChange={(scope) => setClause({ ...clause, scope })}
        />
      </View>

      <Pressable
        onPress={() => setShowPolicy((s) => !s)}
        accessibilityRole="button"
        className="self-start active:opacity-60"
      >
        <Text className="type-meta-small text-navy">
          {showPolicy ? "Hide policy" : "Policy…"}
        </Text>
      </Pressable>

      {showPolicy ? (
        <View className="gap-2.5">
          <Text className="type-eyebrow text-ink-muted" style={{ fontSize: 12.5 }}>Coverage</Text>
          <Segmented
            value={clause.coverage ?? "inherit"}
            options={[
              { value: "inherit", label: "Inherit" },
              { value: "any", label: "Any" },
              { value: "all", label: "All" },
            ]}
            onChange={(c) =>
              setClause({
                ...clause,
                coverage: c === "inherit" ? undefined : (c as "any" | "all"),
              })
            }
          />
          <Text className="type-eyebrow text-ink-muted" style={{ fontSize: 12.5 }}>Combine</Text>
          <Segmented
            value={clause.aggregator ?? "inherit"}
            options={[
              { value: "inherit", label: "Inherit" },
              { value: "avg", label: "Avg" },
              { value: "min", label: "Lowest" },
              { value: "max", label: "Highest" },
            ]}
            onChange={(a) =>
              setClause({
                ...clause,
                aggregator:
                  a === "inherit" ? undefined : (a as "avg" | "min" | "max"),
              })
            }
          />
        </View>
      ) : null}
    </EditorFrame>
  );
}

function ScopeControls({
  scope,
  householdId,
  onChange,
}: {
  scope: RaterScope;
  householdId: string;
  onChange: (next: RaterScope) => void;
}) {
  const kind = scope === "household" ? "household" : scope === "me" ? "me" : "pick";
  return (
    <View className="gap-2">
      <Segmented
        value={kind}
        options={[
          { value: "household", label: "Household" },
          { value: "me", label: "Me" },
          { value: "pick", label: "Pick…" },
        ]}
        onChange={(k) => {
          if (k === "household") onChange("household");
          else if (k === "me") onChange("me");
          else onChange({ userIds: typeof scope === "object" ? scope.userIds : [] });
        }}
      />
      {kind === "pick" ? (
        <MemberMultiSelect
          householdId={householdId}
          selected={typeof scope === "object" ? scope.userIds : []}
          onChange={(userIds) => onChange({ userIds })}
        />
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Seen by
// ---------------------------------------------------------------------------

function WatchedEditor({ draft, onChange, onClose, householdId, isNew }: EditorProps) {
  const [mode, setMode] = useState<Exclude<WatchedMode, "any">>(
    draft.watched.mode === "any" ? "anyone" : draft.watched.mode,
  );
  const [population, setPopulation] = useState<string[] | null>(
    draft.watched.population,
  );

  return (
    <EditorFrame
      title={ATTR_LABEL.watched}
      commitLabel={isNew ? "Add filter" : "Update"}
      onCommit={() => {
        onChange({ ...draft, watched: { mode, population } });
        onClose();
      }}
      onRemove={
        isNew
          ? undefined
          : () =>
              reset(draft, onChange, onClose, {
                watched: { mode: "any", population: null },
              })
      }
      onClose={onClose}
    >
      <Segmented
        value={mode}
        wrap
        options={[
          { value: "anyone", label: "By anyone" },
          { value: "everyone", label: "By everyone" },
          { value: "nobody", label: "By nobody" },
          { value: "not_everyone", label: "Not by all" },
        ]}
        onChange={setMode}
      />
      <View className="gap-2">
        <Text className="type-eyebrow text-ink-muted" style={{ fontSize: 12.5 }}>Who counts</Text>
        <Segmented
          value={population ? "pick" : "household"}
          options={[
            { value: "household", label: "Household" },
            { value: "pick", label: "Pick…" },
          ]}
          onChange={(k) => setPopulation(k === "pick" ? (population ?? []) : null)}
        />
        {population ? (
          <MemberMultiSelect
            householdId={householdId}
            selected={population}
            onChange={setPopulation}
          />
        ) : null}
      </View>
    </EditorFrame>
  );
}

// ---------------------------------------------------------------------------
// Rewatch count
// ---------------------------------------------------------------------------

function WatchCountEditor({ draft, onChange, onClose, isNew }: EditorProps) {
  const [state, setState] = useState<{ op: "gte" | "eq" | "lte"; value: number }>(
    draft.watchCount
      ? { op: draft.watchCount.op as "gte" | "eq" | "lte", value: draft.watchCount.value }
      : { op: "gte", value: 3 },
  );

  return (
    <EditorFrame
      title={ATTR_LABEL.watchCount}
      commitLabel={isNew ? "Add filter" : "Update"}
      onCommit={() => {
        onChange({ ...draft, watchCount: state });
        onClose();
      }}
      onRemove={
        isNew ? undefined : () => reset(draft, onChange, onClose, { watchCount: null })
      }
      onClose={onClose}
    >
      <View className="flex-row items-center gap-3">
        <Segmented
          value={state.op}
          options={[
            { value: "gte", label: "≥" },
            { value: "eq", label: "=" },
            { value: "lte", label: "≤" },
          ]}
          onChange={(op) => setState({ ...state, op: op as "gte" | "eq" | "lte" })}
        />
        <Stepper
          value={state.value}
          min={0}
          max={50}
          suffix="times"
          onChange={(value) => setState({ ...state, value })}
        />
      </View>
    </EditorFrame>
  );
}

// ---------------------------------------------------------------------------
// Time editors — last watched, added to library, draw history
// ---------------------------------------------------------------------------

function LastWatchedEditor({
  draft,
  onChange,
  onClose,
  householdId,
  isNew,
}: EditorProps) {
  const [time, setTime] = useState<TimeDraft>(
    draft.lastWatched ?? DEFAULT_LAST_WATCHED,
  );
  const [population, setPopulation] = useState<string[] | null>(
    draft.lastWatched?.population ?? null,
  );

  return (
    <EditorFrame
      title={ATTR_LABEL.lastWatched}
      commitLabel={isNew ? "Add filter" : "Update"}
      onCommit={() => {
        onChange({ ...draft, lastWatched: { ...time, population } });
        onClose();
      }}
      onRemove={
        isNew ? undefined : () => reset(draft, onChange, onClose, { lastWatched: null })
      }
      onClose={onClose}
    >
      <TimeField
        value={time}
        onChange={setTime}
        relativeLabels={{ within: "in the last", older_than: "not for" }}
      />
      <View className="gap-2">
        <Text className="type-eyebrow text-ink-muted" style={{ fontSize: 12.5 }}>Who counts</Text>
        <Segmented
          value={population ? "pick" : "household"}
          options={[
            { value: "household", label: "Household" },
            { value: "pick", label: "Pick…" },
          ]}
          onChange={(k) => setPopulation(k === "pick" ? (population ?? []) : null)}
        />
        {population ? (
          <MemberMultiSelect
            householdId={householdId}
            selected={population}
            onChange={setPopulation}
          />
        ) : null}
      </View>
    </EditorFrame>
  );
}

function AddedToLibraryEditor({ draft, onChange, onClose, isNew }: EditorProps) {
  const [time, setTime] = useState<TimeDraft>(draft.addedToLibrary ?? DEFAULT_ADDED);

  return (
    <EditorFrame
      title={ATTR_LABEL.addedToLibrary}
      commitLabel={isNew ? "Add filter" : "Update"}
      onCommit={() => {
        onChange({ ...draft, addedToLibrary: time });
        onClose();
      }}
      onRemove={
        isNew
          ? undefined
          : () => reset(draft, onChange, onClose, { addedToLibrary: null })
      }
      onClose={onClose}
    >
      <TimeField
        value={time}
        onChange={setTime}
        relativeLabels={{ within: "in the last", older_than: "more than" }}
      />
    </EditorFrame>
  );
}

function LastDrawnEditor({ draft, onChange, onClose, isNew }: EditorProps) {
  const [scope, setScope] = useState<"this_jar" | "household">(
    draft.lastDrawn?.scope ?? "this_jar",
  );
  const [never, setNever] = useState(draft.lastDrawn?.mode === "never");
  const [time, setTime] = useState<TimeDraft>(
    draft.lastDrawn && draft.lastDrawn.mode !== "never"
      ? draft.lastDrawn
      : DEFAULT_DRAWN,
  );

  return (
    <EditorFrame
      title={ATTR_LABEL.lastDrawn}
      hint="For jars like “nothing this one has picked before.”"
      commitLabel={isNew ? "Add filter" : "Update"}
      onCommit={() => {
        onChange({
          ...draft,
          lastDrawn: never ? { mode: "never", scope } : { ...time, scope },
        });
        onClose();
      }}
      onRemove={
        isNew ? undefined : () => reset(draft, onChange, onClose, { lastDrawn: null })
      }
      onClose={onClose}
    >
      <Segmented
        value={never ? "never" : "stale"}
        stretch
        options={[
          { value: "stale", label: "Not drawn in…" },
          { value: "never", label: "Never drawn" },
        ]}
        onChange={(m) => setNever(m === "never")}
      />
      {!never ? (
        <TimeField
          value={time}
          onChange={setTime}
          relativeLabels={{ within: "in the last", older_than: "not for" }}
        />
      ) : null}
      <View className="gap-2">
        <Text className="type-eyebrow text-ink-muted" style={{ fontSize: 12.5 }}>Scope</Text>
        <Segmented
          value={scope}
          options={[
            { value: "this_jar", label: "This jar" },
            { value: "household", label: "Any jar" },
          ]}
          onChange={setScope}
        />
      </View>
    </EditorFrame>
  );
}

// ---------------------------------------------------------------------------
// Added by
// ---------------------------------------------------------------------------

function AddedByEditor({ draft, onChange, onClose, householdId, isNew }: EditorProps) {
  const { data: members } = useQuery<{ id: string; display_name: string }>(
    households.MEMBERS_OF_HOUSEHOLD,
    [householdId],
  );
  const [userId, setUserId] = useState(draft.addedBy?.userId ?? "");
  const [negate, setNegate] = useState(draft.addedBy?.negate ?? false);

  return (
    <EditorFrame
      title={ATTR_LABEL.addedBy}
      commitLabel={isNew ? "Add filter" : "Update"}
      commitDisabled={!userId}
      onCommit={() => {
        onChange({ ...draft, addedBy: { userId, negate } });
        onClose();
      }}
      onRemove={
        isNew ? undefined : () => reset(draft, onChange, onClose, { addedBy: null })
      }
      onClose={onClose}
    >
      <ChipWrap>
        {members.map((m) => {
          const on = userId === m.id;
          return (
            <Pressable
              key={m.id}
              onPress={() => setUserId(m.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              className="rounded-full border px-3.5 py-1.5 active:opacity-70"
              style={{
                borderColor: on ? accent.forest : paper.border,
                backgroundColor: on ? accent.forest : "transparent",
              }}
            >
              <Text
                className="type-meta"
                style={{ color: on ? paper.card : ink.secondary }}
              >
                {m.display_name}
              </Text>
            </Pressable>
          );
        })}
      </ChipWrap>
      <View className="flex-row items-center gap-2">
        <Switch
          value={negate}
          onValueChange={setNegate}
          trackColor={{ true: accent.rust, false: ink.faint }}
        />
        <Text className="type-meta text-ink-muted" style={{ fontSize: 14 }}>Anyone but them</Text>
      </View>
    </EditorFrame>
  );
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

function reset(
  draft: FilterDraft,
  onChange: (next: FilterDraft) => void,
  onClose: () => void,
  patch: Partial<FilterDraft>,
) {
  onChange({ ...draft, ...patch });
  onClose();
}

