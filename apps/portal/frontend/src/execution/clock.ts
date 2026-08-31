/**
 * Pure clock/format helpers shared by product screens — no business facts,
 * no fixture values (N29-FE-01 §8). Moved out of the `*.smoke` modules; the
 * smoke modules re-export them so the lab keeps its imports.
 */

export function fmtAge(t: number): string {
  if (t >= 3600) return `${Math.floor(t / 3600)}h`;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export function sparkPolyline(values: number[], w = 220, h = 26): string {
  const max = Math.max(...values, 1);
  return values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(0)},${(h - 2 - (v / max) * (h - 6)).toFixed(0)}`).join(" ");
}

/** 24h throughput as data — real counts per hourly bucket ending 10:00Z. */
export function throughputSeries(values: readonly number[]): [string, number][] {
  return values.map((v, i) => [
    new Date(Date.UTC(2026, 7, 22, 10) - (values.length - 1 - i) * 3_600_000).toISOString(),
    v,
  ]);
}

export function mmss(seconds: number): string {
  const m = String(Math.floor(seconds / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export function hhmm(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  return `${h}h ${m}m`;
}

export const clockZ = (d: Date) => (d.getTime() === 0 ? "—" : `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}Z`);


export const fmtPlus = (v: number) => `+${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const sbClock = (d: Date, z = true) =>
  d.getTime() === 0
    ? "—"
    : `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}${z ? "Z" : ""}`;

export const sbAge = (d: Date) => (d.getTime() === 0 ? "—" : `${sbAgeSeconds(d)}s`);

/** REST snapshot age against the venue policy — the hi-fi's `now % 58`. */
export const sbAgeSeconds = (d: Date) => (d.getTime() === 0 ? 0 : Math.floor((d.getTime() / 1000) % 58));

/** ISO as_of advanced by `seconds`, printed without milliseconds. */
export function advanceAsOf(asOf: string | null, seconds: number): string | null {
  if (!asOf) return null;
  const t = Date.parse(asOf);
  if (!Number.isFinite(t)) return asOf;
  return new Date(t + seconds * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function fmtBlotterAge(t: number): string {
  if (t >= 3600) return `${Math.floor(t / 3600)}h ${Math.floor((t % 3600) / 60)}m`;
  if (t >= 60) return `${Math.floor(t / 60)}m ${String(t % 60).padStart(2, "0")}s`;
  return `${t}s`;
}

/**
 * The masthead prints a clock, never the ISO string.
 *
 * `2026-08-22T10:42:01Z` is eleven characters of date the reader already knows,
 * and those eleven characters are what pushed the hi-fi's single masthead row
 * onto a second line. The date stays in the provenance drawer, where a reader
 * who wants it goes looking.
 */
export function clockOf(asOf: string | null | undefined): string {
  if (!asOf) return "—";
  const m = /(\d{2}:\d{2}:\d{2})/.exec(asOf);
  return m ? `${m[1]}${asOf.endsWith("Z") ? "Z" : ""}` : asOf;
}

/** Countdown to the next 09:00 ICT open (02:00Z), as the VN hi-fi prints it. */
export function untilVnOpen(now: Date): string {
  const d = now;
  let target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 2, 0, 0));
  if (target <= d) target = new Date(target.getTime() + 86_400_000);
  const left = Math.max(0, Math.floor((target.getTime() - d.getTime()) / 1000));
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${Math.floor(left / 3600)}h ${p2(Math.floor((left % 3600) / 60))}m ${p2(left % 60)}s`;
}

export const paperClock = (d: Date) =>
  `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}Z`;



/** The live mismatch spark as data — one point per minute from detection. */
export function incidentSparkSeries(values: readonly number[]): [string, number][] {
  return values.map((v, i) => [new Date(Date.UTC(2026, 7, 22, 10, 0) + i * 60_000).toISOString(), v]);
}

/** Deterministic ±1 wobble for demo motion — pure, seeded, no Math.random. */
export function jitter(tick: number, seed = 1): number {
  const x = Math.sin(tick * 12.9898 + seed) * 43758.5453;
  return ((x - Math.floor(x)) - 0.5) * 2;
}
