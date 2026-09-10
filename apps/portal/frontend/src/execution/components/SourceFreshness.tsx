/**
 * PHASE 3C (round 2) · one header, one way of saying how old the data is.
 *
 * Five screens grew the same header independently: a live dot, a label, a chip
 * carrying the freshness word, and an absolute source stamp. Two things were
 * missing from all five and A38.7 requires both.
 *
 * The age. A stamp reading `2026-09-10 13:03:20 UTC` is a fact the reader has
 * to subtract from a clock they cannot see. Whether that is four minutes or
 * four days is the entire question, and it was never on screen.
 *
 * A tone for UNKNOWN. Every non-FRESH tier rendered "warn", so AGING, STALE
 * and "no timestamp was published" looked identical — and an absent age is not
 * a mildly old one.
 */
import type { JSX } from "react";
import { StatusChip } from "./badges";
import { ageFrom, ageLabel, type FreshnessTier } from "./FreshnessBanner";
import type { FreshnessBudgetMs } from "../api/profileRead";

/** What the source published, before we decide what to call it. */
/** Whatever the contract published — the vocabulary drifts, so accept it wide. */
export type PublishedFreshness = string | null | undefined;

/** The vocabulary drifts across contracts; `OK` and `READY` both mean fresh. */
export function normaliseTier(value: PublishedFreshness): FreshnessTier {
  if (value === "OK" || value === "FRESH") return "FRESH";
  if (value === "AGING" || value === "STALE" || value === "UNKNOWN") return value;
  return "UNKNOWN";
}

/**
 * Exported because a screen that keeps its own masthead markup — Alpha Fleet
 * lights its source clock, which this component cannot do — still has to
 * reach the same verdict. It was mapping `FRESH ? good : warn`, which said
 * the same thing about AGING, STALE and "nobody measured it".
 */
export const tierTone: Readonly<Record<FreshnessTier, "good" | "warn" | "bad">> = {
  FRESH: "good",
  AGING: "warn",
  // Stale keeps the data on screen, so the chip has to carry the warning.
  STALE: "bad",
  // Not a warmer FRESH and not a milder STALE: nobody measured it.
  UNKNOWN: "warn",
};

export const tierTitle: Readonly<Record<FreshnessTier, string>> = {
  FRESH: "Within the declared refresh cadence.",
  AGING: "Past one cadence but not yet past the stale-after policy.",
  STALE: "Older than the stale-after policy. Shown because it is the last data published, not because it is current.",
  UNKNOWN: "No usable timestamp was published, so the age cannot be computed.",
};

/** The policy behind the word, appended only when the server published one. */
export function budgetTitle(base: string, budget: FreshnessBudgetMs | null | undefined): string {
  if (!budget) return base;
  const seconds = (value: number) => `${Math.round(value / 1000)}s`;
  return `${base} FRESH under ${seconds(budget.freshMs)}, STALE past ${seconds(budget.staleMs)}.`;
}

export function SourceFreshness({ label, freshness, sourceAsOf, tierBasisAsOf, freshnessBudgetMs, nowMs, dot }: {
  label: string;
  freshness: PublishedFreshness;
  /** ISO instant the source published, or null when it published none. */
  sourceAsOf: string | null;
  /**
   * The instant the tier was computed from — our last projection refresh.
   *
   * The age shown is this one, not `sourceAsOf`, because a tier a reader
   * cannot check against the number beside it is worse than no tier: the
   * bindings header read "FRESH · 54s ago" against a 30s budget, and both
   * halves were true about different clocks.
   */
  tierBasisAsOf?: string | null;
  /**
   * The server's own thresholds. Shown in the chip's title so a reader can
   * check the tier instead of taking it on faith.
   */
  freshnessBudgetMs?: FreshnessBudgetMs | null;
  nowMs: number;
  dot?: JSX.Element | null;
}): JSX.Element {
  const tier = normaliseTier(freshness);
  const basis = tierBasisAsOf ?? sourceAsOf;
  const asOfMs = basis ? Date.parse(basis) : Number.NaN;
  const ageMs = ageFrom(Number.isFinite(asOfMs) ? asOfMs : null, nowMs);
  return (
    <span className="exec-af-source" data-tier={tier}>
      {dot ?? null}
      <b>{label}</b>
      {" · "}
      <StatusChip label={tier} tone={tierTone[tier]} title={budgetTitle(tierTitle[tier], freshnessBudgetMs)} />
      {" · "}
      <span className="exec-af-num" title={tierBasisAsOf
        ? `projection refreshed ${tierBasisAsOf}${sourceAsOf ? ` · source published ${sourceAsOf}` : ""}`
        : sourceAsOf ?? "The source published no instant for this read."}>
        {ageLabel(ageMs)}
      </span>
      {sourceAsOf ? <span className="exec-af-dim">{` · source ${sourceAsOf.replace("T", " ").replace(/\.\d+Z?$/, "")} UTC`}</span> : null}
    </span>
  );
}
