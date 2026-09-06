/**
 * The type scale, as components.
 *
 * Every role in `theme/tokens.ts` has a `type-*` utility carrying its face, size and
 * leading together. These wrap the ones used often enough that repeating the className
 * would be the more error-prone option.
 *
 * Two faces only — the display serif for anything that names a thing, the UI sans for
 * everything small. There is no third face: a title reads the same on a slip, in the
 * Library and in the Log, which is the point.
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

/** A film title wherever one is named — slips, search results, Library, Log. */
export const TitleName = make("type-title-large text-ink");

// ---------------------------------------------------------------------------
// Dark register — Title detail, Rating entry.
//
// Same `type-*` scale as the paper components above; only the colour changes. Kept
// separate rather than a `register` prop on each one, because two colour utilities in
// one className string resolve by generation order, not JSX order — a real bug this
// avoided once already (see components/screen.tsx).
// ---------------------------------------------------------------------------

// Its own size rather than reusing `type-layer-title` — that token is also LayerTitle's
// (paper, create-jar/jar-detail headers), and shrinking it there wasn't asked for.
export const DarkTitle = make("type-section-title text-dark-ink");
export const DarkBody = make("type-body text-dark-ink-secondary");
export const DarkMeta = make("type-meta text-dark-ink-muted");
export const DarkEyebrow = make("type-eyebrow text-dark-ink-muted");
