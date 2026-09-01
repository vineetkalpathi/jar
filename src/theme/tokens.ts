/**
 * Movie Jar — design tokens.
 *
 * Source of truth for colour, type and spacing. Derived from the design language
 * decided in `docs/design/Movie Jar v3.dc.html`; see `docs/design/README.md` for the
 * rules that the values alone don't carry.
 *
 * **This file is the only place a colour, face or size is written down.** Tailwind does
 * not get its own copy: `src/theme/tokens.css` is generated from here by
 * `pnpm theme` (`scripts/build-theme-css.ts`), so changing a value below and
 * re-running it updates every `className` in the app. Never hand-edit `tokens.css`.
 *
 * Values with no className equivalent — `motion`, `jar`, `shadow` — are imported
 * directly by the components that need them.
 *
 * Two notes before you edit anything:
 *
 * 1. `dark` is DERIVED from `paper.bg`. The prototype computes it with CSS
 *    `color-mix(in oklab, ...)`, which React Native has no equivalent for, so the
 *    resolved constants for the chosen paper (Fawn) are written out below. If the
 *    paper colour ever changes, regenerate `dark` rather than hand-picking new
 *    values — the whole point is that both registers share a hue.
 *
 * 2. `accent.amber` does NOT shift with the paper, and is reserved for the winner
 *    reveal, the pre-reveal pause, and rating ticks. Nothing else.
 */

export const paper = {
  /** App background. Fawn — warm greige, hue pulled nearly to zero. */
  bg: '#E9E1D6',
  /** Draw-flow ground. One step down from bg, so the ritual feels set apart. */
  bg2: '#E2D9CC',
  /** Slips, sheets, list cards. */
  card: '#F8F4ED',
  /** Jar bodies and filled chips. */
  jar: '#DBD0BF',
  /** Hairline borders and dividers. Used generously in place of shadow. */
  border: '#CBBEA9',
  /** Jar rims, handle bars, heavier edges. */
  rim: '#BAAB93',
  rimDeep: '#A8977D',
} as const;

export const ink = {
  /** Primary text on paper. Warm brown-black — never pure black. */
  primary: '#2E2A24',
  /** Secondary text, body copy. */
  secondary: '#6B6155',
  /** Metadata, disabled, placeholder. */
  muted: '#8A7F6E',
  /** Faintest — dashed-tile labels, empty states. */
  faint: '#A79B87',
} as const;

export const accent = {
  /** Primary actions, positive states, "go". */
  forest: '#3F5B4A',
  forestPressed: '#365040',
  /** Knock out, destructive, veto. */
  rust: '#A8492F',
  /** Links and secondary actions. */
  navy: '#2D4356',
  /**
   * RESERVED. Winner reveal, pause dot, rating ticks — nowhere else.
   * Fixed across both registers; does not derive from the paper.
   */
  amber: '#C98A3C',
} as const;

/**
 * The dark register — Title detail and Rating entry.
 * Resolved from `paper.bg` mixed toward #16140F (oklab), at the shares noted.
 * Regenerate these if `paper.bg` changes.
 */
export const dark = {
  /** Screen ground. bg @ 13% */
  bg: '#312F29',
  /** Raised surfaces, poster placeholder. bg @ 21% */
  surface: '#423F39',
  /** Hairlines, tag borders, rating track. bg @ 31% */
  border: '#57544D',
  /** Primary text. bg @ 93% toward white */
  text: '#EBE3D9',
  /** Body copy, secondary text. bg @ 72% */
  textSecondary: '#AEA89E',
  /** Metadata, eyebrows, tick numerals. bg @ 66% — do not go dimmer at small sizes. */
  textMuted: '#A19B92',
  /** Placeholder captions on `surface` only. bg @ 42% */
  textFaint: '#6F6A63',
} as const;

export const font = {
  /** Jar names, screen titles, film titles, big numerals. */
  display: 'Vollkorn',
  displaySemi: 'Vollkorn_600SemiBold',
  /** Buttons, labels, metadata — all small text. */
  ui: 'AlegreyaSans',
  uiMedium: 'AlegreyaSans_500Medium',
  uiBold: 'AlegreyaSans_700Bold',
  /**
   * Titles written on slips, and NOWHERE else. Not on labels, buttons,
   * screen titles, or any TMDB-sourced text.
   */
  hand: 'Caveat_600SemiBold',
} as const;

/** Base 16, major third (1.25). Sizes below are the ones actually in use. */
export const type = {
  screenTitle: { fontFamily: font.display, fontSize: 36, lineHeight: 38 },
  layerTitle: { fontFamily: font.display, fontSize: 33, lineHeight: 35 },
  sectionTitle: { fontFamily: font.display, fontSize: 28, lineHeight: 31 },
  titleLarge: { fontFamily: font.display, fontSize: 19, lineHeight: 24 },
  /** Section headings inside a page — Household Settings' groups. */
  sectionHeading: { fontFamily: font.displaySemi, fontSize: 21, lineHeight: 26 },
  jarName: { fontFamily: font.display, fontSize: 16, lineHeight: 18 },

  slip: { fontFamily: font.hand, fontSize: 21, lineHeight: 24 },
  slipDraw: { fontFamily: font.hand, fontSize: 22, lineHeight: 25 },
  slipWinner: { fontFamily: font.hand, fontSize: 42, lineHeight: 44 },

  body: { fontFamily: font.ui, fontSize: 15, lineHeight: 23 },
  /** Body copy on read-it-carefully pages — settings rows, policy choices. */
  bodyLarge: { fontFamily: font.ui, fontSize: 17, lineHeight: 26 },
  button: { fontFamily: font.uiBold, fontSize: 16 },
  meta: { fontFamily: font.ui, fontSize: 12.5, lineHeight: 19 },
  metaSmall: { fontFamily: font.ui, fontSize: 11.5 },

  /** Tracked caps. Also available in `font.display` for jar labels and eyebrows. */
  eyebrow: {
    fontFamily: font.uiMedium,
    fontSize: 11,
    letterSpacing: 1.8, // ≈ 0.16em
    textTransform: 'uppercase' as const,
  },
  eyebrowWide: {
    fontFamily: font.uiMedium,
    fontSize: 10,
    letterSpacing: 3, // ≈ 0.3em — jar labels, section headers only
    textTransform: 'uppercase' as const,
  },
} as const;

/** 8px grid. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = {
  /** Paper has soft corners, not rounded-rect app corners. */
  card: 4,
  button: 4,
  sheet: 10,
  jar: { topLeft: 10, topRight: 10, bottomLeft: 14, bottomRight: 14 },
} as const;

export const border = {
  hairline: 1,
  /** Jar outlines. Keep at 1.5 if the drawing is ever replaced with an SVG. */
  jar: 1.5,
} as const;

/**
 * Used sparingly — only on things meant to be physically lifted
 * (drawn slips, the winner card). Everywhere else uses a hairline border.
 */
export const shadow = {
  slip: {
    shadowColor: '#2E2A24',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  lifted: {
    shadowColor: '#2E2A24',
    shadowOpacity: 0.11,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
} as const;

/**
 * Two speeds, deliberately. Navigation is quick; the draw is not.
 * Nothing under ~180ms anywhere.
 */
export const motion = {
  nav: 180,
  layer: 260,
  sheet: 300,
  draw: {
    shake: 750,
    knockOut: 300,
    /** Dead air before the winner. A feature — do not shorten. */
    pause: 900,
    reveal: 500,
  },
} as const;

/** Jar tile geometry — see README §4. */
export const jar = {
  tileHeight: 212,
  columns: 2,
  gapX: 14,
  gapY: 16,
  rimWidthPct: 44,
  neckWidthPct: 36,
  neckHeight: 11,
  bodyWidthPct: 88,
  /** Leave the top ~45% of the body clear for the name. */
  labelTop: 38,
  fill: {
    background: 'rgba(63,91,74,0.14)',
    topEdge: 'rgba(46,42,36,0.55)',
  },
} as const;

export const theme = {
  paper, ink, accent, dark, font, type, space, radius, border, shadow, motion, jar,
} as const;

export default theme;
