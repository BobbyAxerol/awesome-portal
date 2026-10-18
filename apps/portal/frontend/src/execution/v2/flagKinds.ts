/**
 * Flag kinds — the one table behind `<Flag>`.
 *
 * A flag's kind is chosen by the caller from this enum, never inferred from
 * its label. The old kit matched label text with a regex, so "Recall pending"
 * rendered as pending, "Needs attention" as a failure and "Accepted" as
 * applied (review2/03 F2, review2/06 s2.2). One table keeps glyph, default
 * label and announced text from drifting apart.
 *
 * Hue and tint live in tokens.css as `--f-<kind>` / `--f-<kind>-bg`; a test
 * holds this list equal to the tokens.
 */

export const FLAG_KINDS = [
  "ok",
  "pending",
  "recall",
  "partial",
  "unknown",
  "applied",
  "rejected",
  "display",
  "stale",
  "paused",
  "approval",
  "incident",
  "operation",
  "attention",
  "na",
  "neutral",
] as const;

export type FlagKind = (typeof FLAG_KINDS)[number];

export interface FlagKindSpec {
  /** Canonical label, used when the caller passes none. */
  label: string;
  /** Decorative shape that backs the colour; rendered aria-hidden. */
  glyph: string;
  /** What a screen reader hears for the kind when the label is custom. */
  announce: string;
}

/**
 * Glyphs follow the hi-fi kit. `ok` and `applied` share a tick and differ by
 * hue and word; partial, stale, unknown and pending never borrow it, so a
 * not-yet-good state cannot read as done in greyscale.
 */
export const FLAG_KIND_TABLE: Readonly<Record<FlagKind, FlagKindSpec>> = {
  ok: { label: "OK", glyph: "✓", announce: "OK" },
  pending: { label: "Pending", glyph: "◔", announce: "Pending" },
  recall: { label: "Recall pending", glyph: "↩", announce: "Recall pending" },
  partial: { label: "Partial", glyph: "◐", announce: "Partial data" },
  unknown: { label: "Unknown", glyph: "?", announce: "Outcome unknown" },
  applied: { label: "Applied", glyph: "✓", announce: "Applied" },
  rejected: { label: "Rejected", glyph: "✕", announce: "Rejected or failed" },
  display: { label: "Catching up", glyph: "⟳", announce: "Display catching up" },
  stale: { label: "Stale", glyph: "◷", announce: "Stale" },
  paused: { label: "Paused", glyph: "❚❚", announce: "Paused" },
  approval: { label: "Approval", glyph: "◈", announce: "Awaiting approval" },
  incident: { label: "Incident", glyph: "▲", announce: "Incident" },
  operation: { label: "Operation", glyph: "◆", announce: "Operation" },
  attention: { label: "Needs attention", glyph: "⚠", announce: "Needs attention" },
  na: { label: "Not applicable", glyph: "○", announce: "Not applicable" },
  neutral: { label: "Neutral", glyph: "•", announce: "Informational" },
};
