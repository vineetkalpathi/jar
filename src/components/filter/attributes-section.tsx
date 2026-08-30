/**
 * Title attributes — everything cached from TMDB. Unknown never matches here, so a
 * hand-entered Title with no attributes falls through every rule in this section
 * (ADR-0006); the builder says so in the hint.
 */

import { usePowerSync, useQuery } from "@powersync/react";
import { useEffect, useRef, useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { PersonPicker } from "@/components/person-picker";
import { RangeField } from "@/components/range-field";
import { Segmented } from "@/components/segmented";
import { Meta } from "@/components/text";
import { library } from "@/lib/db";
import type { FilterDraft, PersonRef } from "@/lib/filter";
import { movieGenres, tvGenres } from "@/lib/tmdb/genres";
import { accent, ink, paper } from "@/theme";
import {
  ChipWrap,
  CycleChip,
  nextCycle,
  Row,
  Section,
  type CycleState,
} from "./section";

type Props = {
  value: FilterDraft;
  onChange: (next: FilterDraft) => void;
  householdId: string;
};

export function AttributesSection({ value, onChange, householdId }: Props) {
  const db = usePowerSync();

  // The async person resolve below lands after other edits, so it reads the draft
  // through a ref rather than the closure it was fired from.
  const valueRef = useRef(value);
  valueRef.current = value;

  const addPerson = (
    field: "cast" | "directors",
    person: { tmdbPersonId: number; name: string },
  ) => {
    const current = valueRef.current[field];
    if (current.some((p) => p.tmdbPersonId === person.tmdbPersonId)) return;
    onChange({ ...valueRef.current, [field]: [...current, person] });

    // Resolve the TMDB person to a local `person.id` so the live match count reflects
    // the rule now, not only once the jar is saved. `findOrCreatePerson` is idempotent
    // on `tmdb_person_id`.
    library
      .findOrCreatePerson(db, { tmdbPersonId: person.tmdbPersonId, name: person.name })
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
  };

  const removePerson = (field: "cast" | "directors", ref: PersonRef) => {
    onChange({
      ...valueRef.current,
      [field]: valueRef.current[field].filter((p) => p !== ref),
    });
  };

  return (
    <Section
      title="Title attributes"
      hint="From TMDB. A hand-added title with no details won't match any of these."
    >
      <Row label="Kind">
        <Segmented
          value={value.mediaType}
          options={[
            { value: "any", label: "Any" },
            { value: "movie", label: "Movies" },
            { value: "tv", label: "TV" },
          ]}
          onChange={(mediaType) => onChange({ ...value, mediaType })}
        />
      </Row>

      <GenreControls value={value} onChange={onChange} householdId={householdId} />

      <Row label="Release year">
        <RangeField
          label=""
          value={value.releaseYear}
          onChange={(releaseYear) => onChange({ ...value, releaseYear })}
          placeholder={{ min: "Earliest", max: "Latest" }}
        />
      </Row>

      <Row label="Runtime">
        <RangeField
          label=""
          value={value.runtime}
          onChange={(runtime) => onChange({ ...value, runtime })}
          unit="min"
        />
      </Row>

      <LanguageControls value={value} onChange={onChange} householdId={householdId} />

      <PeopleControls
        label="Cast"
        heading="Someone in the cast"
        people={value.cast}
        onAdd={(person) => addPerson("cast", person)}
        onRemove={(ref) => removePerson("cast", ref)}
      />
      <PeopleControls
        label="Director"
        heading="Directed by"
        people={value.directors}
        onAdd={(person) => addPerson("directors", person)}
        onRemove={(ref) => removePerson("directors", ref)}
      />
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Genre
// ---------------------------------------------------------------------------

function GenreControls({ value, onChange, householdId }: Props) {
  const { data: rows } = useQuery<{ genre: string }>(library.GENRES_IN_LIBRARY, [
    householdId,
  ]);
  const [catalogue, setCatalogue] = useState<string[]>([]);

  // Fall back to TMDB's full genre list when the Library is too thin to offer choices.
  useEffect(() => {
    let active = true;
    Promise.all([movieGenres(), tvGenres()])
      .then(([m, t]) => {
        if (!active) return;
        const names = [...new Set([...m, ...t].map((g) => g.name))].sort();
        setCatalogue(names);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const g = value.genres;
  const chosen = new Set([...g.include, ...g.exclude, ...catalogue, ...rows.map((r) => r.genre)]);
  const names = [...chosen].sort();

  const stateOf = (name: string): CycleState =>
    g.include.includes(name)
      ? "include"
      : g.exclude.includes(name)
        ? "exclude"
        : "off";

  const cycle = (name: string) => {
    const next = nextCycle(stateOf(name));
    onChange({
      ...value,
      genres: {
        ...g,
        include:
          next === "include"
            ? [...new Set([...g.include, name])]
            : g.include.filter((n) => n !== name),
        exclude:
          next === "exclude"
            ? [...new Set([...g.exclude, name])]
            : g.exclude.filter((n) => n !== name),
      },
    });
  };

  if (names.length === 0) {
    return (
      <Row label="Genre">
        <Meta>Add some titles and their genres show up here.</Meta>
      </Row>
    );
  }

  return (
    <Row label="Genre">
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

      {g.include.length > 1 ? (
        <View className="mt-2.5">
          <Segmented
            value={g.matchAll ? "all" : "any"}
            options={[
              { value: "any", label: "Match any" },
              { value: "all", label: "Match all" },
            ]}
            onChange={(m) =>
              onChange({ ...value, genres: { ...g, matchAll: m === "all" } })
            }
          />
        </View>
      ) : null}

      {!g.matchAll ? (
        <View className="mt-2.5 flex-row items-center gap-2">
          <Switch
            value={g.includeUnknown}
            onValueChange={(includeUnknown) =>
              onChange({ ...value, genres: { ...g, includeUnknown } })
            }
            trackColor={{ true: accent.forest, false: ink.faint }}
          />
          <Text className="type-meta text-ink-muted">Also titles with no genre</Text>
        </View>
      ) : null}
    </Row>
  );
}

// ---------------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------------

function LanguageControls({ value, onChange, householdId }: Props) {
  const { data: rows } = useQuery<{ language: string }>(library.LANGUAGES_IN_LIBRARY, [
    householdId,
  ]);
  const names = [...new Set([...value.languages, ...rows.map((r) => r.language)])].sort();

  if (names.length === 0) return null;

  const toggle = (name: string) => {
    onChange({
      ...value,
      languages: value.languages.includes(name)
        ? value.languages.filter((n) => n !== name)
        : [...value.languages, name],
    });
  };

  return (
    <Row label="Original language" hint="Matches any you pick.">
      <ChipWrap>
        {names.map((name) => {
          const on = value.languages.includes(name);
          return (
            <Pressable
              key={name}
              onPress={() => toggle(name)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              className="rounded-full border px-3 py-1 active:opacity-70"
              style={{
                borderColor: on ? accent.forest : paper.border,
                backgroundColor: on ? accent.forest : "transparent",
              }}
            >
              <Text
                className="type-meta-small"
                style={{ color: on ? paper.card : ink.secondary }}
              >
                {name}
              </Text>
            </Pressable>
          );
        })}
      </ChipWrap>
    </Row>
  );
}

// ---------------------------------------------------------------------------
// Cast / Director
// ---------------------------------------------------------------------------

function PeopleControls({
  label,
  heading,
  people,
  onAdd,
  onRemove,
}: {
  label: string;
  heading: string;
  people: PersonRef[];
  onAdd: (person: { tmdbPersonId: number; name: string }) => void;
  onRemove: (ref: PersonRef) => void;
}) {
  const [picking, setPicking] = useState(false);

  return (
    <Row label={label} hint="Every one you add must be credited (AND).">
      <ChipWrap>
        {people.map((p) => (
          <Pressable
            key={p.tmdbPersonId || p.personId || p.name}
            onPress={() => onRemove(p)}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${p.name || "person"}`}
            className="flex-row items-center gap-1.5 rounded-full border border-hairline px-3 py-1 active:opacity-70"
            style={{ backgroundColor: paper.card }}
          >
            <Text className="type-meta-small text-ink-secondary">
              {p.name || "Unknown person"}
            </Text>
            <Text style={{ color: ink.muted, fontSize: 13 }}>×</Text>
          </Pressable>
        ))}
        <Pressable
          onPress={() => setPicking(true)}
          accessibilityRole="button"
          className="rounded-full border-dashed-hairline px-3 py-1 active:opacity-60"
        >
          <Text className="type-meta-small text-navy">＋ Add</Text>
        </Pressable>
      </ChipWrap>

      <PersonPicker
        visible={picking}
        heading={heading}
        note="Searches all of TMDB."
        onClose={() => setPicking(false)}
        onPick={onAdd}
      />
    </Row>
  );
}
