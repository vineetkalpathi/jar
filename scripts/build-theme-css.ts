/**
 * Generates `src/theme/tokens.css` from `src/theme/tokens.ts`.
 *
 * Tailwind v4 is configured in CSS rather than JavaScript, which would normally mean
 * keeping the palette in two places. Instead the TypeScript tokens stay authoritative
 * and this emits the `@theme` block from them, so `bg-paper`, `text-ink`, `font-hand`
 * and the rest all resolve to the same constants the components import.
 *
 * Run with `pnpm theme` after editing tokens.ts. Node runs this directly — the file is
 * kept to erasable TypeScript so no build step is needed.
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { accent, dark, font, ink, paper, radius, type } from "../src/theme/tokens.ts";

/**
 * Tailwind colour utilities, by the name they take in a className.
 *
 * Written out rather than derived from the object keys so the utility names read as
 * design language — `bg-paper`, `text-ink-muted`, `border-hairline` — rather than as a
 * flattening of the token tree. The right-hand side is the only thing that ever moves.
 */
const colors: Record<string, string> = {
  // Paper register
  paper: paper.bg,
  "paper-deep": paper.bg2,
  card: paper.card,
  /** `paper.jar` — filled chips and handle bars. Jar *bodies* are transparent. */
  chip: paper.jar,
  hairline: paper.border,
  rim: paper.rim,
  "rim-deep": paper.rimDeep,

  // Ink — the same warm brown on every ground, deliberately not tinted to match it.
  ink: ink.primary,
  "ink-secondary": ink.secondary,
  "ink-muted": ink.muted,
  "ink-faint": ink.faint,

  // Accents
  forest: accent.forest,
  "forest-pressed": accent.forestPressed,
  rust: accent.rust,
  navy: accent.navy,
  /** RESERVED: winner reveal, pause dot, rating ticks. Nothing else. */
  amber: accent.amber,

  // Dark register — Title detail and Rating entry only.
  "dark-bg": dark.bg,
  "dark-surface": dark.surface,
  "dark-hairline": dark.border,
  "dark-ink": dark.text,
  "dark-ink-secondary": dark.textSecondary,
  "dark-ink-muted": dark.textMuted,
  "dark-ink-faint": dark.textFaint,
};

/** `font-display`, `font-ui`, `font-hand` … */
const fonts: Record<string, string> = {
  display: font.display,
  "display-semi": font.displaySemi,
  ui: font.ui,
  "ui-medium": font.uiMedium,
  "ui-bold": font.uiBold,
  hand: font.hand,
};

/** `rounded-card`, `rounded-sheet`. The jar's asymmetric radii stay in TS. */
const radii: Record<string, string> = {
  card: `${radius.card}px`,
  button: `${radius.button}px`,
  sheet: `${radius.sheet}px`,
};

const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/**
 * `--text-*` sizes, for the rare place that needs a size without its face.
 */
const textSizes = Object.entries(type).flatMap(([name, value]) => {
  if (!("fontSize" in value)) return [];
  const lines = [`  --text-${kebab(name)}: ${value.fontSize}px;`];
  if ("lineHeight" in value) {
    lines.push(`  --text-${kebab(name)}--line-height: ${value.lineHeight}px;`);
  }
  return lines;
});

/**
 * One `type-*` utility per role in the scale — `type-screen-title`, `type-slip`,
 * `type-eyebrow` — carrying face, size, leading and tracking together.
 *
 * Binding the face to the role is the point. The design language's load-bearing rule is
 * that Caveat appears only where a person wrote something down, so `type-slip` shipping
 * its own `font-family` means a slip cannot be styled without it, and nothing else
 * reaches for the handwriting by accident.
 */
const typeUtilities = Object.entries(type).map(([name, value]) => {
  const declarations = [`  font-family: ${value.fontFamily};`];
  if ("fontSize" in value) declarations.push(`  font-size: ${value.fontSize}px;`);
  if ("lineHeight" in value) declarations.push(`  line-height: ${value.lineHeight}px;`);
  if ("letterSpacing" in value) {
    declarations.push(`  letter-spacing: ${value.letterSpacing}px;`);
  }
  if ("textTransform" in value) {
    declarations.push(`  text-transform: ${value.textTransform};`);
  }
  return `@utility type-${kebab(name)} {\n${declarations.join("\n")}\n}`;
});

const block = (entries: Record<string, string>, prefix: string) =>
  Object.entries(entries).map(([name, value]) => `  --${prefix}-${name}: ${value};`);

const css = `/*
 * GENERATED FILE — do not edit.
 *
 * Written by \`pnpm theme\` from src/theme/tokens.ts. Change a value there and
 * re-run; edits made here are lost on the next run.
 */

@theme {
${block(colors, "color").join("\n")}

${block(fonts, "font").join("\n")}

${block(radii, "radius").join("\n")}

${textSizes.join("\n")}
}

${typeUtilities.join("\n\n")}
`;

const outputPath = join(dirname(fileURLToPath(import.meta.url)), "../src/theme/tokens.css");
writeFileSync(outputPath, css);
console.log(`wrote ${outputPath}`);
