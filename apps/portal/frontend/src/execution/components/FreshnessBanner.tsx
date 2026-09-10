/**
 * PHASE 3C (round 2) · a panel says how old its data is, in words.
 *
 * A38.7: every financial and history panel renders data age and freshness
 * tier; STALE keeps the chart or table it already has but carries a
 * conspicuous age banner; UNKNOWN never masquerades as FRESH.
 *
 * The reason UNKNOWN needs its own tier: an age nobody could compute used to
 * fall through every comparison and render as current. A reader cannot tell a
 * value measured a second ago from one whose timestamp would not parse, and
 * the difference is the whole point of the phase.
 */
import type { JSX } from "react";

export type FreshnessTier = "FRESH" | "AGING" | "STALE" | "UNKNOWN";

/** The words. Short enough for a panel header, complete enough to act on. */
const SENTENCE: Readonly<Record<FreshnessTier, string>> = {
  FRESH: "within the declared refresh cadence",
  AGING: "past one cadence, not yet stale",
  STALE: "older than the stale-after policy — shown because it is the last data published, not because it is current",
  UNKNOWN: "no usable timestamp was published, so the age cannot be computed",
};

/** Whole units, because a panel header is not the place for milliseconds. */
export function ageLabel(ageMs: number | null): string {
  if (ageMs === null || !Number.isFinite(ageMs) || ageMs < 0) return "age not published";
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h ago`;
}

/**
 * Derive the age from an `as_of` the envelope published.
 *
 * Returns null rather than a number for anything unusable — a NaN date, a
 * future instant, an absent field. A future timestamp is not a fresh one; it
 * means the clocks disagree, and claiming freshness from it would be worse
 * than admitting the age is unknown.
 */
export function ageFrom(asOfMs: number | null | undefined, nowMs: number): number | null {
  if (typeof asOfMs !== "number" || !Number.isFinite(asOfMs)) return null;
  const age = nowMs - asOfMs;
  return age < 0 ? null : age;
}

export function FreshnessBanner({ tier, ageMs, source }: {
  tier: FreshnessTier;
  ageMs: number | null;
  /** Which table or operation published it, when the panel knows. */
  source?: string | null;
}): JSX.Element {
  return (
    <div className="exec-freshness" data-tier={tier} role="status">
      <span className="exec-freshness-tier">{tier}</span>
      <span className="exec-freshness-age">{ageLabel(ageMs)}</span>
      <span className="exec-freshness-note">{SENTENCE[tier]}</span>
      {source ? <span className="exec-af-dim">{` · ${source}`}</span> : null}
    </div>
  );
}
