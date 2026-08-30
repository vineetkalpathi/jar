/**
 * Search TMDB for a person, for the `castMember` / `director` filter leaves.
 *
 * Same paper half-sheet as `TagPicker` and `CategoryPicker`, but the list is a live
 * TMDB search rather than a local vocabulary — so it debounces, shows a spinner while a
 * query is in flight, and returns the raw `{ tmdbPersonId, name }`. Resolving that to a
 * local `person.id` happens when the Jar is saved (`library.findOrCreatePerson`), not
 * here — a person with no Titles in any Library yet has no local row to point at.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Field } from "./field";
import { Eyebrow, Meta } from "./text";
import { searchPeople, type TmdbPersonResult } from "@/lib/tmdb/people";
import { accent } from "@/theme";

export function PersonPicker({
  visible,
  heading,
  note,
  onClose,
  onPick,
}: {
  visible: boolean;
  heading: string;
  note?: string;
  onClose: () => void;
  onPick: (person: { tmdbPersonId: number; name: string }) => void;
}) {
  const { height } = useWindowDimensions();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TmdbPersonResult[]>([]);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  const trimmed = query.trim();

  useEffect(() => {
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const mine = ++seq.current;
    const timer = setTimeout(() => {
      searchPeople(trimmed)
        .then((people) => {
          if (seq.current === mine) {
            setResults(people);
            setLoading(false);
          }
        })
        .catch((cause) => {
          if (seq.current === mine) {
            console.warn("[person-picker] search failed:", cause);
            setResults([]);
            setLoading(false);
          }
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [trimmed]);

  const close = () => {
    setQuery("");
    setResults([]);
    seq.current++;
    onClose();
  };

  const hand = (person: TmdbPersonResult) => {
    onPick({ tmdbPersonId: person.tmdbPersonId, name: person.name });
    close();
  };

  const body = useMemo(
    () => (
      <ScrollView
        className="mt-4 flex-1"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {results.map((p) => (
          <Pressable
            key={p.tmdbPersonId}
            onPress={() => hand(p)}
            accessibilityRole="button"
            className="border-b border-hairline py-3 active:opacity-60"
          >
            <Text className="type-body text-ink">{p.name}</Text>
          </Pressable>
        ))}
        {loading ? <ActivityIndicator className="py-4" color={accent.forest} /> : null}
        {!loading && trimmed.length >= 2 && results.length === 0 ? (
          <Meta>No one by that name on TMDB.</Meta>
        ) : null}
        {trimmed.length < 2 ? <Meta>Type a name to search.</Meta> : null}
      </ScrollView>
    ),
    // hand/close are stable enough for this list; results & loading drive it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [results, loading, trimmed],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable
        className="flex-1 justify-end"
        style={{ backgroundColor: "rgba(0,0,0,0.3)" }}
        onPress={close}
      >
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable
            className="bg-paper px-6 pb-10 pt-5"
            style={{
              borderTopLeftRadius: 10,
              borderTopRightRadius: 10,
              height: height * 0.6,
            }}
            onPress={() => {}}
          >
            <View className="mb-4 gap-1">
              <Eyebrow>{heading}</Eyebrow>
              {note ? <Meta>{note}</Meta> : null}
            </View>

            <Field
              label="Search people"
              value={query}
              onChangeText={setQuery}
              placeholder="Greta Gerwig, Toshiro Mifune…"
              autoCapitalize="words"
              autoCorrect={false}
              autoFocus
            />

            {body}
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}
