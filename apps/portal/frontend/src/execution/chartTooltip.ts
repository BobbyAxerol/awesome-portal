/**
 * One tooltip for every chart on the surface.
 *
 * Before this each chart wrote its own: some printed the raw ISO stamp with
 * milliseconds and a `Z`, some repeated `as_of` inside a box the reader had
 * opened to see one value, and the rows lined up differently in each. A reader
 * moving between two tiles had to re-learn the box.
 *
 * Three rules it holds:
 *
 *   1. **The stamp is a stamp, not a payload.** `2026-08-29 07:30:00 UTC` —
 *      seconds, no milliseconds, no `T`. Milliseconds in a hover box are four
 *      characters nobody reads that push the value out of alignment.
 *   2. **Provenance is one quiet line, and `as_of` is not in it.** The chart's
 *      own caption already carries the envelope; repeating it in the hover
 *      states the same fact twice and buries the value the reader came for.
 *   3. **Values are right-aligned against their labels**, so two series read as
 *      a column rather than as two sentences of different length.
 */

/** `2026-08-29 07:30:00 UTC` — the one stamp a hover box ever shows. */
export function tooltipStamp(value: string | number | Date | null | undefined): string {
  // A hover box has room for a word, and a dash here reads as zero.
  if (value === null || value === undefined || value === "") return "not published";
  // Only a real instant is reformatted. `new Date()` accepts a startling range
  // of prose — "bucket 4" parses to April 2001 — so a string that is not an
  // ISO-ish stamp is handed back untouched rather than turned into a date the
  // chart never had.
  if (typeof value === "string" && !/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?/.test(value.trim())) return value;
  const at = value instanceof Date ? value
    : typeof value === "number" ? new Date(value)
      : new Date(value);
  if (Number.isNaN(at.valueOf())) return String(value);
  const iso = at.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;
}

const escape = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export interface TooltipRow {
  /** ECharts' own series marker, or empty for a plain row. */
  marker?: string;
  label: string;
  value: string;
  /** A short qualifier after the value — units, a count, a source word. */
  note?: string | null;
}

export interface TooltipInput {
  /** The x value: a timestamp, a bucket name, a category. */
  head?: string | number | Date | null;
  /** Already-formatted head, when the x axis is not a clock. */
  headText?: string | null;
  rows: readonly TooltipRow[];
  /** Authority and formula. `as_of` deliberately does not appear. */
  provenance?: { authority?: string | null; formula?: string | null } | null;
}

/**
 * Renders the box. Kept as an HTML string because that is what ECharts'
 * formatter contract takes; every interpolated value is escaped.
 */
export function chartTooltip(input: TooltipInput): string {
  const head = input.headText ?? (input.head === undefined ? null : tooltipStamp(input.head));
  const rows = input.rows
    .map((row) => {
      const note = row.note ? `<span style="color:var(--ink-mute);padding-left:6px">${escape(row.note)}</span>` : "";
      return `<tr>`
        + `<td style="padding:1px 10px 1px 0;white-space:nowrap">${row.marker ?? ""}${escape(row.label)}</td>`
        + `<td style="padding:1px 0;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums">${escape(row.value)}${note}</td>`
        + `</tr>`;
    })
    .join("");
  const provenance = [input.provenance?.authority, input.provenance?.formula]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .map(escape)
    .join(" · ");
  return [
    head ? `<div style="color:var(--ink-mute);padding-bottom:4px">${escape(head)}</div>` : "",
    `<table style="border-collapse:collapse">${rows}</table>`,
    provenance ? `<div style="color:var(--ink-faint);padding-top:5px">${provenance}</div>` : "",
  ].filter(Boolean).join("");
}
