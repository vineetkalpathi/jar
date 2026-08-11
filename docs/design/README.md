# Handoff: Movie Jar — visual design language

## Overview

This bundle carries the **design language** for Jar: palette, typography, the two visual
registers, the jar object, and the navigation model. It is deliberately *not* a build order
for every screen. The intent is that Claude Code has enough context to build any screen in
the app consistently — not that it builds them all now.

Read this alongside `docs/movie-jar-design-brief.md` in the repo. Where the two disagree,
**this file wins for §5 (Design tokens)**; the brief still wins for §1–§4 (what the app is,
the feeling, the physical→digital map).

## About the design files

`Movie Jar v3.dc.html` is a **design reference**, not production code. It is an HTML/React
prototype used to make decisions — it runs in a browser, uses CSS custom properties and
`color-mix()`, and mounts inside a fake iPhone bezel. None of that transfers.

The target is **Expo SDK 57 / React Native, expo-router, `src/app/`** (see `README.md` and
`docs/README.md` in the repo). Recreate the *design* in React Native using the repo's own
conventions — `StyleSheet.create`, the existing `src/lib` data layer, expo-router file
routes. Do not port the HTML.

Two RN-specific consequences:
- `color-mix()` does not exist. The dark register's derived colours are shipped as resolved
  constants in `theme.ts`.
- The prototype's `--fd` / `--fu` CSS variables become plain `theme.font.display` /
  `theme.font.ui` values.

## Fidelity

**High-fidelity for colour, type, and the jar object.** Those are decided; match them exactly.

**Medium-fidelity for layout and copy.** Spacing and hierarchy in the prototype are
considered but not sacred — adapt to real content and real safe areas. Copy is
representative, not final.

**Undecided, do not lock in:** navigation model (see below), and the display face may still
change — Vollkorn is current but the user is still researching.

## The decided system

### 1. Two registers

The app has two visual worlds, and keeping them distinct is the point.

| | **Paper** | **Dark** |
|---|---|---|
| Screens | Jars, Jar detail, Library, Log, Filter, Draw flow, Add | Title detail, Rating entry |
| Ground | `paper.bg` (Fawn `#E9E1D6`) | `dark.bg` (`#312F29`) |
| Belongs to | what the household owns and handles | what TMDB knows |
| Type | display serif + handwriting on slips | display serif only, no handwriting |
| Texture | subtle noise, hairline borders | flat, hairline dividers |

They are related, not separate: **every dark tone is derived from the paper colour**, so the
two registers share a hue. If the paper changes, the dark screens change with it.

### 2. Palette — Fawn

Warm greige, hue pulled nearly to zero. Reads as "unbleached" rather than as a colour, which
keeps the jars and slips the only thing on screen with personality.

Full values, plus the accent set and the derived dark register, are in **`theme.ts`**.

Rules that matter more than the hex values:
- **Never pure white or pure black.** Everything sits slightly warm.
- **Warm brown ink (`#2E2A24`) on every ground.** Do not shift text colour toward the
  background's hue — the slight mismatch is deliberate.
- **Hairlines, not shadows.** Every edge is a 1px `border` in `paper.border`. Shadow appears
  only on things meant to be physically lifted: drawn slips and the winner card.
- **Amber `#C98A3C` is reserved.** It appears on the winner reveal, the pre-reveal pause dot,
  and the rating ticks. Nothing else may use it — it is the app's only "this is the good
  part" signal, and it is the one colour that does *not* shift with the paper.

### 3. Typography

Three faces, each with one job.

| Role | Face | Where |
|---|---|---|
| Display | **Vollkorn** 400/600 | jar names, screen titles, film titles, big numerals |
| UI | **Alegreya Sans** 400/500/700 | buttons, labels, metadata, all small text |
| Hand | **Caveat** 600/700 | titles written on slips — and nowhere else |

The Caveat rule is the load-bearing one. Handwriting appears **only where a person wrote
something down**: a slip in a jar, a candidate in the draw grid, the winner, a log entry.
Never on a label, a button, a screen title, or any TMDB-sourced text. That restraint is what
stops the app reading as a scrapbook theme.

One further move, borrowed from the user's references: small text can be set in the *display
serif*, uppercase, tracked to `0.18–0.28em`, instead of the sans. Use it for jar labels and
section eyebrows only — tracked caps are slow to read, so buttons and list metadata stay sans.

Sizes and the scale are in `theme.ts`. Base 16px, ratio 1.25.

### 4. The jar object — line-drawn

Jars render as **1.5px outline drawings**, not filled cards:

- Rim: a 1.5px horizontal rule, 44% of the tile width.
- Neck: 36% width, 11px tall, left and right strokes only.
- Body: 88% width, fills remaining height, 1.5px border, radius `10px 10px 14px 14px`,
  **transparent** background.
- Contents: absolutely positioned at the bottom, height = `fillPercent`, background
  `rgba(63,91,74,0.14)` with a 1.5px top edge at `rgba(46,42,36,0.55)`. This is the fill
  level and it is real data — it rises with the slip count.
- Label: absolutely positioned in the **upper half**, centred — jar name in the display
  serif at 16px, count beneath in tracked sans caps at 9px.
- Tile is 212px tall, two per row, 14px column gap / 16px row gap.

Two things to preserve if this gets replaced with a hand-drawn asset (the user intends to
draw their own): keep the **stroke at 1.5px**, and leave the **top ~45% of the body clear**
for the name. Fill level, label position, and tap target all keep working if the outline
becomes an SVG.

Do not reintroduce a taped-on paper label. Getting the label off the glass is what keeps the
object from reading as craft-fair.

### 5. Motion

The brief's two-speed rule holds and is implemented:

- **Navigation: 180–260ms.** Get out of the way.
- **The draw flow only: slow on purpose.** 750ms shake → knockouts at 300ms each → **900ms
  of nothing** → reveal. The dead pause before the reveal is a feature; do not shorten it.
- Rating: discrete taps, no interpolation. One detent per whole number.

Haptics per the brief's §5 table — they are not in the prototype and need adding in RN
(`expo-haptics`): light on add, medium "thunk" on knock out, success pattern on reveal, light
tick per rating step.

## Screens in the prototype

Enough detail to rebuild each; not an instruction to build all of them now.

**Jars** (paper) — household eyebrow, "Jars" title, count line. Two-column grid of
line-drawn jars, plus a dashed "＋ New jar" tile of matching height. Tap a jar → Jar detail.

**Jar detail** (paper) — back link, jar name, filter summary as chips (one per predicate,
plus a dashed "Edit filter"), stats line. Vertical list of slips: title in Caveat 21px, year
and runtime beneath, and a **26px circled ⓘ** on the right that opens Title detail. The slip
itself is the object; the link is an aside. Bottom: a fading gradient over a full-width
"Shake the jar" button.

**Draw setup** (sheet over paper) — bottom sheet, 10px top corners, grab handle. "How many
slips?" then three large tap targets: **3 / 5 / 8**. Below them, an "I'm feelin' saucy" row
with a radio dot — one slip, straight out, no knockout. CTA text changes with the choice
("Shake out 5" / "Just give me one"). Dismissing returns to the screen that opened it.

**Draw flow** (paper, own ground `paper.bg2`) — shake (jittering blank slips, 750ms) →
knockout grid (2 columns; 1 column when n ≤ 3; tap to strike: rust rule, tilt, scale 0.94,
opacity 0.34) → pause (single amber dot, 900ms) → reveal (winner on a taped card, animated
amber glow, Caveat 42px). Saucy skips the grid entirely.

**Library** (paper) — search field, then rows: 42×62 poster placeholder, title in display
serif, meta, tags, household score right-aligned.

**Log** (paper) — reverse-chronological cards, date in tracked caps, title in Caveat, who
watched, score. An amber left edge marks nights everyone attended.

**Filter builder** (paper) — one card per predicate, each labelled with its kind (Tag / Title
attribute / Viewing / Draw), joined by tappable AND/OR pills. Live match count at the bottom.
The closed predicate catalogue is `docs/filter-leaves.md` — the UI must not exceed it.

**Add a title** (paper, rises from the bottom) — search field showing typed text in Caveat,
TMDB results with Add buttons. Note beneath: adding puts it in the Library; jars pick it up
themselves if it matches their filter.

**Title detail** (dark) — poster placeholder, title, year/runtime, genres, tags, TMDB
overview, household rating bars per Rating Category with amber fills, then a footer row
linking to rating entry.

**Rating entry** (dark, rises) — per Rating Category: name in tracked caps, current value as
a large amber numeral, and a row of **10 tick marks** — tap to set, active ticks tall and
amber, inactive short and dim. Average recomputes live. Explicitly not a slider.

## Navigation — still undecided

The prototype ships the **swipe model**: Log · Jars · Library sit side by side on one
horizontal strip you drag between, with no tab bar. A slim rail at the bottom shows position
(three dashes) and names the neighbours; dragging its pill upward opens Add.

The user has **not committed to this over a standard tab bar.** Build screens so the shell is
swappable — don't couple screen layout to either model. If you implement swipe: the rail must
clear the bottom 34px home-gesture inset, or iOS eats the upward swipe.

Layers (Jar detail, Filter, Title detail, Rating entry, Add) push over the base and dismiss
back to whatever opened them — that part is settled either way.

## State in the prototype

Prototype-local only; the real app reads from `src/lib/db`. Listed so behaviour is
reproducible: active base screen index, drag offset, current layer, draw phase
(`shake | knock | pause | reveal`), knocked-out candidate indices, draw size, saucy flag, and
per-category scores.

Real data model: `CONTEXT.md` (glossary) and `docs/data-model.md`. **Use the domain
vocabulary in code** — Draw, Candidate, Knock Out, Jar, Slip, Viewing, Rating Category. The
warm words ("shake the jar", "I'm feelin' saucy", "not tonight") are **button copy only** and
must not leak into type or function names.

## Assets

None. Every visual is CSS/RN primitives. Posters are placeholder blocks
(`repeating-linear-gradient` at 135°, 5px stripes) awaiting TMDB images — see ADR-0003 for
the attribution requirement. Fonts are Google Fonts: Vollkorn, Alegreya Sans, Caveat — load
via `expo-font`.

## Files

- `Movie Jar v3.dc.html` — the prototype. Open in a browser. Palette, jar style, and type
  pairing are live switchers in the right-hand panel; the panel also carries the reasoning
  behind each choice and the options that were rejected.
- `theme.ts` — drop-in tokens for the RN app.
- `ios-frame.jsx` — the fake device bezel the prototype mounts in. Reference only, not part
  of the design.
