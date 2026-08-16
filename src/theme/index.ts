/**
 * Design tokens. Import from here rather than reaching into `tokens.ts` directly.
 *
 * Most styling goes through Tailwind classNames, which read the same values via the
 * generated `tokens.css`. Import these when a value has no className behind it —
 * animation durations, the jar's geometry, a colour passed to a native prop.
 */

export * from "./tokens";
export { fontAssets } from "./fonts";
