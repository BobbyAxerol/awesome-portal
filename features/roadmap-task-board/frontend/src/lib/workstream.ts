/**
 * Workstream identity colours.
 *
 * Colour here encodes *identity*, not magnitude or status — so it is a
 * categorical assignment: eight fixed hues (`--ws-1`…`--ws-8` in tokens.css)
 * handed out in a stable order and never cycled. A ninth workstream takes the
 * neutral `--ws-other` slot rather than a generated hue, because a repeated
 * hue would claim two workstreams are the same thing.
 *
 * Colour is never the only channel: every surface that uses these also prints
 * the workstream name.
 */

/** Number of identity hues the token file defines. */
export const WORKSTREAM_SLOTS = 8;

/**
 * Assigns slots from a stable, caller-supplied ordering.
 *
 * The order is derived once from the whole task set (alphabetical), not from
 * render order, so filtering the board cannot repaint the workstreams that
 * survive the filter.
 */
export function workstreamSlots(workstreams: readonly string[]): Map<string, number> {
  const ordered = [...new Set(workstreams.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const slots = new Map<string, number>();
  ordered.forEach((name, index) => {
    slots.set(name, index < WORKSTREAM_SLOTS ? index + 1 : 0);
  });
  return slots;
}

/** CSS variable for a slot; slot 0 is the neutral overflow colour. */
export function workstreamVar(slot: number | undefined): string {
  return slot && slot >= 1 && slot <= WORKSTREAM_SLOTS ? `var(--ws-${slot})` : "var(--ws-other)";
}

/**
 * Resolves the palette to concrete hex values for a non-CSS renderer.
 *
 * Mermaid builds an SVG from a JS config object, so it cannot read CSS
 * variables. Reading the computed values keeps tokens.css the single source of
 * truth instead of duplicating the ramp in TypeScript.
 */
export function readTokenPalette(root: HTMLElement = document.documentElement): {
  workstream: string[];
  other: string;
  token: (name: string) => string;
} {
  const styles = getComputedStyle(root);
  const token = (name: string) => styles.getPropertyValue(name).trim();
  return {
    workstream: Array.from({ length: WORKSTREAM_SLOTS }, (_, index) => token(`--ws-${index + 1}`)),
    other: token("--ws-other"),
    token,
  };
}
