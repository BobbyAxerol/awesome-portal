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

/** A metric value for a tile or a table cell, by unit. */
export function formatMetric(value: string | number | null | undefined, unit: string | null | undefined): string | null {
  const parsed = parse(value);
  if (parsed === null) return null;
  switch (unit) {
    case "currency":
      return GROUPED(2).format(parsed);
    case "fraction":
      return `${parsed >= 0 ? "+" : "−"}${GROUPED(2).format(Math.abs(parsed * 100))}%`;
    case "count":
    case "bars":
      return Number.isInteger(parsed) ? GROUPED(0).format(parsed) : GROUPED(2).format(parsed);
    case "seconds":
      return formatDuration(parsed);
    case "ratio":
      return GROUPED(3).format(parsed);
    default:
      return Math.abs(parsed) >= 1000 ? GROUPED(2).format(parsed) : String(Number(parsed.toPrecision(6)));
  }
}

/** A chart axis/tooltip value: a fraction shown as a percentage with sensible precision. */
export function formatFractionAxis(value: number, digits = 2): string {
  return `${GROUPED(digits).format(value * 100)}%`;
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
  return (Math.abs(parsed) >= 1000 ? AXIS_LARGE : AXIS_SMALL).format(parsed);
}

/** A correlation coefficient to two places, as the S13 hi-fi prints ρ (DQ-08); `null` when not numeric. */
export function formatCorrelation(value: string | null | undefined): string | null {
  const parsed = parse(value);
  return parsed === null ? null : GROUPED(2).format(parsed);
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
