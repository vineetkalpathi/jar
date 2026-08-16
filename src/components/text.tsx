/**
 * The type scale, as components.
 *
 * Every role in `theme/tokens.ts` has a `type-*` utility carrying its face, size and
 * leading together. These wrap the ones used often enough that repeating the className
 * would be the more error-prone option.
 *
 * `Hand` is the one that matters. Caveat appears only where a person wrote something
 * down — a slip, a candidate, a log entry — and never on a label, a button, a screen
 * title, or any TMDB-sourced text. Keeping it behind a named component makes that rule
 * visible at the call site instead of buried in a class list.
 */

import { Text, type TextProps } from "react-native";

type Props = TextProps & { className?: string };

const make = (base: string) =>
  function Styled({ className = "", ...props }: Props) {
    return <Text className={`${base} ${className}`} {...props} />;
  };

/** Screen titles — "Jars", "Library". Display serif at 36. */
export const ScreenTitle = make("type-screen-title text-ink");

/** Titles on a pushed layer — Jar detail, Filter, Add. */
export const LayerTitle = make("type-layer-title text-ink");

/** Body copy. */
export const Body = make("type-body text-ink-secondary");

/** Metadata, list subtitles, counts. */
export const Meta = make("type-meta text-ink-muted");

/**
 * Tracked caps — household names above a title, section headers.
 * Slow to read by design; never use it for buttons or list metadata.
 */
export const Eyebrow = make("type-eyebrow text-ink-muted");

/** Wider tracking still. Jar labels and section headers only. */
export const EyebrowWide = make("type-eyebrow-wide text-ink-muted");

/** Handwriting. A title someone wrote on a slip — and nowhere else. */
export const Hand = make("type-slip text-ink");
