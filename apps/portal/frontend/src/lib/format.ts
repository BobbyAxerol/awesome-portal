/** Number & time formatting — single source (§27.7 rule 9). */

/**
 * Thousands grouping with a fixed number of decimals.
 *
 * `toFixed` alone printed `24837.88%` — a four-digit percentage with no grouping,
 * which is the hardest possible way to read a number. Every formatter below goes
 * through here so one rule covers percent, ratio and count alike.
 */
function grouped(value: number, digits: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtPct(value: number | null | undefined, signed = false): string {
  if (value == null || Number.isNaN(value) || !Number.isFinite(value)) return "—";
  const prefix = signed && value > 0 ? "+" : "";
  return `${prefix}${grouped(value, 2)}%`;
}

export function fmtDelta(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value) || !Number.isFinite(value)) return "—";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${grouped(value, 2)}%`;
}

export function fmtMoney(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value) || !Number.isFinite(value)) return "—";
  return Math.abs(value) >= 1000
    ? value.toLocaleString("en-US", { maximumFractionDigits: 0 })
    : value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtRatio(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value) || !Number.isFinite(value)) return "—";
  return grouped(value, digits);
}

export function fmtDecay(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value) || !Number.isFinite(value)) return "—";
  return value.toFixed(3);
}

export function fmtCount(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value) || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US");
}

export function fmtShortHash(hash: string | null | undefined, length = 8): string {
  if (!hash) return "—";
  return hash.slice(0, length);
}

export function fmtTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(
    date.getUTCHours(),
  )}:${pad(date.getUTCMinutes())} UTC`;
}

export function fmtDuration(startIso: string | null | undefined, endIso?: string | null): string {
  const start = startIso ? new Date(startIso).getTime() : NaN;
  if (Number.isNaN(start)) return "—";
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export const SEGMENT_LABELS: Record<string, string> = {
  is: "IS",
  oos: "OOS",
  holdout_live: "Holdout Live",
  stitched: "Stitched OOS",
};

export const SEGMENT_COLORS: Record<string, string> = {
  is: "var(--role-is)",
  oos: "var(--role-oos)",
  holdout_live: "var(--role-holdout)",
  stitched: "var(--accent)",
};
