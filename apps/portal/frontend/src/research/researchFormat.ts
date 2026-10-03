/**
 * Display formatting for Research screens (RF-06 FE-X-13, DQ-08).
 *
 * The server publishes exact decimal strings, and the screen must never lose
 * them: every formatter here is for *display*, and callers keep the exact
 * value in a `title` (and in copy-to-clipboard) next to it. Nothing here
 * computes a new number — a fraction becomes a percentage by moving the
 * decimal point, which is a change of unit, not a calculation.
 *
 * `null` and non-numeric strings are returned as `null`, so the caller renders
 * its own "not published" state instead of a `0` or a `NaN`.
 */

export type MetricUnit = "currency" | "fraction" | "count" | "ratio" | "bars" | "seconds";

function parse(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const GROUPED = (digits: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** The HiFi prints a negative with the typographic minus (U+2212), not a hyphen. Display only: exact decimals the server published stay as served. */
export function typographicMinus(text: string): string {
  return text.replace(/^-(?=\d)/, "−");
}

/** A metric value for a tile or a table cell, by unit. */
export function formatMetric(value: string | number | null | undefined, unit: string | null | undefined): string | null {
  const parsed = parse(value);
  if (parsed === null) return null;
  switch (unit) {
    case "currency":
      return typographicMinus(GROUPED(2).format(parsed));
    case "fraction":
      return `${parsed >= 0 ? "+" : "−"}${GROUPED(2).format(Math.abs(parsed * 100))}%`;
    case "count":
    case "bars":
      return typographicMinus(Number.isInteger(parsed) ? GROUPED(0).format(parsed) : GROUPED(2).format(parsed));
    case "seconds":
      return formatDuration(parsed);
    case "ratio":
      return typographicMinus(GROUPED(3).format(parsed));
    default:
      return typographicMinus(Math.abs(parsed) >= 1000 ? GROUPED(2).format(parsed) : String(Number(parsed.toPrecision(6))));
  }
}

/** A chart axis/tooltip value: a fraction shown as a percentage with sensible precision. */
export function formatFractionAxis(value: number, digits = 2): string {
  return `${typographicMinus(GROUPED(digits).format(value * 100))}%`;
}

const AXIS_LARGE = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const AXIS_SMALL = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/**
 * A server value printed on a chart axis (S13 small multiples and overlay):
 * grouped, whole above 1,000 and at most two places below, so a ~300px
 * figure keeps its plot. The exact string stays in the caller's title.
 * A non-numeric string comes back unchanged.
 */
export function formatAxisValue(value: string): string {
  const parsed = parse(value);
  if (parsed === null) return value;
  return typographicMinus((Math.abs(parsed) >= 1000 ? AXIS_LARGE : AXIS_SMALL).format(parsed));
}

/** A correlation coefficient to two places, as the S13 hi-fi prints ρ (DQ-08); `null` when not numeric. */
export function formatCorrelation(value: string | null | undefined): string | null {
  const parsed = parse(value);
  return parsed === null ? null : typographicMinus(GROUPED(2).format(parsed));
}

/** `8s`, `3m 12s`, `1h 04m`. */
export function formatDuration(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return null;
  const whole = Math.round(seconds);
  if (whole < 60) return `${whole}s`;
  const minutes = Math.floor(whole / 60);
  if (minutes < 60) return `${minutes}m ${String(whole % 60).padStart(2, "0")}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/** `2026-09-24 05:03 UTC` — never ISO with milliseconds in a header. */
export function formatUtc(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const iso = date.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

/** A digest shortened for display; the caller keeps the full value in a title. */
export function shortDigest(digest: string | null | undefined, length = 8): string | null {
  if (!digest) return null;
  const bare = digest.replace(/^sha256:/, "");
  return bare.length <= length ? bare : bare.slice(0, length);
}

/** Bytes as `34.2 KB`. */
export function formatBytes(bytes: number | null | undefined): string | null {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

/**
 * A server id shortened for display (E1, HiFi audit 2026-09-26): the type
 * prefix (`rrun_`, `ratt_`, `rc_`…) plus the first 8 characters after it.
 * A 37-character id wraps every header it sits in; the full value always
 * stays in the caller's `title` and copy. Ids without a prefix fall back to
 * `shortDigest`.
 */
export function shortId(id: string | null | undefined, length = 8): string | null {
  if (!id) return null;
  const match = /^([a-z][a-z0-9]{0,7}_)(.+)$/.exec(id);
  /* Only a bare digest is shortened; a label such as `R-WFO-118` is already short. */
  if (!match) return /^(sha256:)?[0-9a-f]{16,}$/i.test(id) ? shortDigest(id, length) : id;
  const [, prefix, rest] = match;
  /* Only an opaque hex tail is cut: `av_delta_rsi_polynomial_alpha_1_0_0` is a name, not an id to shorten. */
  return rest.length <= length || !/^[0-9a-f]+$/i.test(rest) ? id : `${prefix}${rest.slice(0, length)}`;
}

/**
 * A claim value as the HiFi prints it (E1): the server's token in capitals
 * (`NOT_CAUSAL_MULTI_FOLD_GLOBAL_CALIBRATION`, as HiFi 04 prints
 * `CHRONOLOGICAL_CAUSAL`), a boolean as YES / NO. Nothing is reworded, so
 * the screen never claims more than the token says; callers keep the exact
 * value in a data attribute.
 */
export function claimToken(value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "YES" : "NO";
  return String(value).toUpperCase();
}

/**
 * An exact decimal string grouped with commas for display, without ever
 * turning it into a float (`9007199254740993` stays `…993`, never `…992`).
 * Anything that is not a plain decimal comes back unchanged.
 */
export function groupDecimalString(value: string): string {
  const match = /^(-?)(\d+)(\.\d+)?$/.exec(value);
  if (!match) return value;
  const [, sign, whole, fraction = ""] = match;
  return `${sign}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction}`;
}

/**
 * QuantBT's `fold_id` as the HiFi numbers folds (E2, audit X3): the engine
 * publishes a 0-based id ("0", "1"); the hash, the progress read and every
 * sentence count from 1. `"0"` prints `fold_01`, so row 1 and `#fold=1` are
 * the same fold. A non-numeric id is printed unchanged; callers keep the
 * engine's id in a data attribute or title.
 */
export function foldLabel(foldId: string | number): string {
  const text = String(foldId);
  return /^\d+$/.test(text) ? `fold_${String(Number(text) + 1).padStart(2, "0")}` : text;
}

/**
 * The humanised short fold label for visible text: `0`/`fold_01` -> `F1`. Put the
 * served id in the `title` (`foldTitle`); data attributes keep the raw id.
 */
export function foldShort(foldId: string | number): string {
  const text = String(foldId);
  const m = /^fold_0*(\d+)$/.exec(text);
  if (m) return `F${m[1]}`;
  return /^\d+$/.test(text) ? `F${Number(text) + 1}` : text;
}

/** Tooltip for a short fold label: the full server id. */
export function foldTitle(foldId: string | number): string {
  return `fold_id ${String(foldId)}`;
}

/**
 * A served integer count, thousands-grouped (`10,000`). `null` for an absent
 * count so the caller renders its own typed absence, never `0` or `—`.
 */
export function formatCount(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}
