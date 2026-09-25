/**
 * Research Loop — Compare client (P20, Screen 13).
 *
 * One named read and nothing else:
 *
 *  - `researchCompareGetV1` — one bounded, persisted comparison inside one
 *    Alpha, in one of three modes: `attempts` (a claim-first ladder, already
 *    ordered by the server), `markets` (small multiples, never an overlay) or
 *    `pair` (exactly two opaque run ids of the same Alpha).
 *
 * The contract publishes an `etag` and a `304`, so this module resends the
 * validator the server gave and a `304` keeps the copy in hand (the same
 * `Fresh<T>` / `NOT_MODIFIED` shape the evidence client uses).
 *
 * Nothing here orders, compares, subtracts or correlates. The server refuses
 * a mismatched pair (`state: "REFUSED"`, `pair: null`), derives the common
 * window and the correlation, and ranks the attempts; the browser prints the
 * strings it receives. The only local check is the one the URL needs before a
 * request can be addressed at all: a pair names exactly two non-empty ids.
 */

import type { components as CompareComponents } from "@portal/contracts-research-compare";

import { PortalApiError } from "../lib/api";
import { NOT_MODIFIED, type Fresh } from "./evidenceClient";
import { toLineageRefusal, type LineageRefusal } from "./lineageClient";
import type { ResearchState } from "./state";

type CompareSchemas = CompareComponents["schemas"];

export type Compare = CompareSchemas["CompareResponse"];
export type CompareRun = CompareSchemas["Run"];
export type CompareAvailability = CompareSchemas["Availability"];
export type CompareKey = CompareSchemas["ComparisonContractKey"];
export type CompareClaim = CompareSchemas["Claim"];
export type ClaimFamily = CompareClaim["family"];
export type CompareMetric = CompareSchemas["Metric"];
export type CompareCoverage = CompareSchemas["Coverage"];
export type AttemptResult = CompareSchemas["AttemptResult"];
export type MarketResult = CompareSchemas["MarketResult"];
export type MarketCard = MarketResult["cards"][number];
export type MarketChart = CompareSchemas["MarketChart"];
export type PairResult = CompareSchemas["PairResult"];
export type PairComparable = CompareSchemas["PairComparableResult"];
export type PairRefused = CompareSchemas["PairRefusedResult"];
export type PairData = CompareSchemas["PairData"];
export type IntentionalDifference = PairData["intentional_differences"][number];
export type WeakerClaim = PairData["weaker_claim"];
export type CommonWindow = CompareSchemas["CommonWindow"];
export type CommonMetric = CommonWindow["metrics"][number];
export type Correlation = CompareSchemas["Correlation"];
export type Overlay = CompareSchemas["Overlay"];
/** W6a · CG-P20-04 per-fold OOS Sharpe of one attempt. */
export type FoldSeries = CompareSchemas["FoldSeries"];
/** W6a · CG-P20-05 allow-listed config keys that differ across the attempts. */
export type ConfigDiff = CompareSchemas["ConfigDiff"];

/** Display unit of each original metric, for `researchFormat.formatMetric` (DQ-08). */
export const COMPARE_METRIC_UNIT: Record<CompareMetric["key"], "fraction" | "count" | "ratio"> = {
  NET_RETURN_FRACTION: "fraction",
  MAX_DRAWDOWN_FRACTION: "fraction",
  TRADE_COUNT: "count",
  OOS_SHARPE: "ratio",
  DECAY: "ratio",
};

/** The Δ direction the contract fixes (CG-P20-09), as the column header reads it. */
export const DELTA_DIRECTION_LABEL: Record<CommonWindow["delta_definition"], string> = {
  RIGHT_MINUS_LEFT: "B − A · contract invariant",
};

export { NOT_MODIFIED };
export type { Fresh };

/** The three modes, in the hi-fi's segment order. */
export type CompareMode = "attempts" | "markets" | "pair";
export const COMPARE_MODES: readonly CompareMode[] = ["attempts", "markets", "pair"] as const;

export function isCompareMode(value: string | null): value is CompareMode {
  return value === "attempts" || value === "markets" || value === "pair";
}

const ALPHAS = "/api/v1/research/alphas";

/** Reason codes the P20 service publishes (`compare.service.ts`), named once. */
export const COMPARE_REASON = {
  boundedAttempts: "P20_BOUNDED_ATTEMPT_LIMIT_REACHED",
  withoutPrimaryRun: "P20_ATTEMPTS_WITHOUT_PRIMARY_RUN_NOT_COMPAREABLE",
  boundedMarkets: "P20_MARKET_SMALL_MULTIPLES_BOUNDED",
  noPrimaryRun: "P20_ALPHA_HAS_NO_COMPAREABLE_PRIMARY_RUN",
  requestedSpecAbsent: "P20_REQUESTED_SPEC_NOT_AVAILABLE",
  claimFamilyAbsent: "P20_STRUCTURED_CLAIM_FAMILY_NOT_PUBLISHED",
  evidenceAbsent: "P20_P13_EVIDENCE_PROJECTION_NOT_AVAILABLE",
  oosSharpeAbsent: "P20_SOURCE_DID_NOT_PUBLISH_OOS_SHARPE",
  decayAbsent: "P20_SOURCE_DID_NOT_PUBLISH_DECAY",
  weakerClaimAbsent: "P20_WEAKER_CLAIM_NOT_PUBLISHED",
  equalRankUnresolved: "P20_EQUAL_CLAIM_RANK_FAMILY_NOT_RESOLVED",
  tradeCountNotApplicable: "P20_COMMON_WINDOW_DOES_NOT_DEFINE_TRADE_COUNT",
  commonWindowAbsent: "P20_COMMON_WINDOW_NOT_AVAILABLE",
  rawFactsIncompatible: "P20_RAW_OBSERVATION_FACTS_INCOMPATIBLE",
  noCommonWindow: "P20_NO_COMMON_RAW_RETURN_WINDOW",
  numericFactsIncompatible: "P20_COMMON_WINDOW_NUMERIC_FACTS_INCOMPATIBLE",
  insufficientReturns: "P20_INSUFFICIENT_COMMON_RAW_RETURNS",
  zeroVariance: "P20_ZERO_VARIANCE_RAW_RETURNS",
  equityAbsent: "P20_P13_EQUITY_SERIES_NOT_AVAILABLE",
  equityChronology: "P20_P13_EQUITY_SERIES_CHRONOLOGY_INCOMPATIBLE",
  sealMismatch: "P20_CURRENT_SOURCE_SEAL_DOES_NOT_MATCH_P14_AND_RUN_BINDINGS",
  outerOosCount: "P20_OUTER_OOS_SOURCE_COUNT_DOES_NOT_MATCH_P14_RECEIPT",
  pairModeOnly: "P20_FULL_RESOLUTION_RETURNS_APPLY_TO_PAIR_MODE_ONLY",
  keyMismatch: "P20_CONTRACT_KEY_MISMATCH",
  scopeMismatch: "P20_SOURCE_SCOPE_MISMATCH",
} as const;

/* -------------------------------------------------------------------------
 * Claim rank map — spec 13 §9, as data
 * ---------------------------------------------------------------------- */

export interface ClaimRankEntry {
  /** The spec's rank; `null` for a family the source did not publish. */
  rank: 1 | 2 | 3 | 4 | null;
  /** The spec's word for the tier. */
  tier: string;
  /** Palette token for the chip (spec §7/§9 colour, no raw hex). */
  token: string;
}

/**
 * Every claim family the contract can return, with the spec's rank and chip
 * colour. The screen reads the chip from here and never branches on a
 * family name; the order of attempts is the server's, not this table's.
 */
export const CLAIM_RANK_MAP: Record<ClaimFamily, ClaimRankEntry> = {
  STRICT_OUTER_OOS: { rank: 1, tier: "strict", token: "var(--good)" },
  SELECTION_ADJUSTED_OOS: { rank: 2, tier: "selection-adjusted", token: "var(--accent-2)" },
  WALK_FORWARD_OOS_COMPATIBILITY: {
    rank: 3,
    tier: "retrospective / walk-forward compatibility",
    token: "var(--warn)",
  },
  NONE_FULL_SAMPLE_CALIBRATION: { rank: 4, tier: "calibration", token: "var(--bad)" },
  NOT_PUBLISHED: { rank: null, tier: "not published", token: "var(--ink-faint)" },
};

/* -------------------------------------------------------------------------
 * Copy — spec 13 §8 verbatim where the contract agrees with it
 * ---------------------------------------------------------------------- */

/** Spec 13 §8, verbatim. */
export const LADDER_HEADER = "claims rank before numbers — a weaker claim with a prettier Sharpe still ranks lower.";

/** Spec 13 §8 / contract `PairRefusal.message`, verbatim. The screen prints the server's string. */
export const COMPARE_REFUSAL_MESSAGE =
  "these two runs do not share a ComparisonContractKey (symbol · timeframe · route · protocol) — a side-by-side would be a comparison lie, so the button refuses.";

/** Spec 13 §8 / contract `MarketResult.caption`, verbatim. The screen prints the server's string. */
export const MARKETS_CAPTION = "different contract keys — small multiples only; an overlay across keys would be a comparison lie.";

/** Spec 13 §8, verbatim. */
export function promotesUnder(claim: string): string {
  return `the pair promotes under its weaker claim: ${claim}`;
}

/**
 * VD-P20-02: spec §8 says "correlation artifact absent — the engine did not
 * publish one for this pair." The contract's correlation is Portal-derived,
 * so an absent one was not derived; the sentence names the server's reason.
 */
export function correlationAbsent(reasonCode: string): string {
  return `correlation not derived — ${reasonCode}`;
}

/* -------------------------------------------------------------------------
 * Paths
 * ---------------------------------------------------------------------- */

export interface CompareRequest {
  /** Sent as given: an unknown mode is the server's 400 to give, not the browser's. */
  mode: string;
  /** Only sent in pair mode, and only as exactly two non-empty ids. */
  runs?: readonly string[] | null;
  workspaceId?: string;
}

/** The two ids a pair needs, or `null`. Content is the server's to judge. */
export function pairRuns(runs: readonly string[] | null | undefined): [string, string] | null {
  if (!runs || runs.length !== 2) return null;
  const [left, right] = runs;
  return left && right ? [left, right] : null;
}

/** `runs=` from a URL, split on commas exactly as written. */
export function splitRuns(raw: string | null): string[] | null {
  return raw === null || raw === "" ? null : raw.split(",");
}

export function comparePath(alphaId: string, request: CompareRequest): string {
  const params = new URLSearchParams();
  if (request.workspaceId) params.set("workspace_id", request.workspaceId);
  params.set("mode", request.mode);
  const pair = request.mode === "pair" ? pairRuns(request.runs) : null;
  if (pair) params.set("runs", pair.join(","));
  return `${ALPHAS}/${encodeURIComponent(alphaId)}/compare?${params.toString()}`;
}

/** The screen's canonical route (VD-P20-09). */
export function compareHref(alphaId: string, options: { mode?: CompareMode; runs?: readonly string[] | null } = {}): string {
  const base = `/research/quantbt/alphas/${encodeURIComponent(alphaId)}/compare`;
  const parts: string[] = [];
  if (options.mode) parts.push(`mode=${options.mode}`);
  const pair = pairRuns(options.runs);
  if (pair) parts.push(`runs=${pair.map(encodeURIComponent).join(",")}`);
  return parts.length > 0 ? `${base}?${parts.join("&")}` : base;
}

/** The route spec 13 names (`/research/quantbt/compare`), kept as a resolver. */
export const COMPARE_RESOLVER_ROUTE = "/research/quantbt/compare";

/**
 * The run library's entry into Screen 13: two run ids and, when both runs
 * are bound to the same Alpha, that Alpha — which is what the canonical route
 * needs. Without it the resolver says compare reads inside one Alpha.
 */
export function compareEntryHref(runs: readonly string[], alphaId: string | null): string {
  const tail = alphaId ? `&alpha=${encodeURIComponent(alphaId)}` : "";
  return `${COMPARE_RESOLVER_ROUTE}?runs=${runs.join(",")}${tail}`;
}

/* -------------------------------------------------------------------------
 * Transport
 * ---------------------------------------------------------------------- */

async function call<T>(path: string, etag?: string | null, signal?: AbortSignal): Promise<Fresh<T>> {
  const response = await fetch(path, {
    credentials: "same-origin",
    signal,
    headers: etag ? { "If-None-Match": etag } : undefined,
  });
  if (response.status === 304) return NOT_MODIFIED;
  if (!response.ok) {
    let code: string | null = null;
    let requestId: string | null = response.headers.get("x-request-id");
    try {
      const problem = (await response.json()) as Partial<CompareSchemas["Problem"]>;
      code = problem?.error?.code ?? null;
      requestId = problem?.request_id ?? requestId;
    } catch {
      /* non-JSON error body: the status is still typed */
    }
    /* The server's prose is never rendered: the screen speaks from
       `COMPARE_REFUSAL_COPY`, keyed by status. */
    throw new PortalApiError(`${response.status} ${response.statusText}`, response.status, code, requestId);
  }
  return (await response.json()) as T;
}

export const compareApi = {
  /** `researchCompareGetV1` */
  get: (alphaId: string, request: CompareRequest & { etag?: string | null; signal?: AbortSignal }) =>
    call<Compare>(comparePath(alphaId, request), request.etag, request.signal),
} as const;

/* -------------------------------------------------------------------------
 * Words
 * ---------------------------------------------------------------------- */

export const COMPARE_WITHHELD_WORDS: Record<CompareAvailability["state"], string> = {
  AVAILABLE: "available",
  NOT_PUBLISHED: "not published",
  PARTIAL: "partial",
  NOT_APPLICABLE: "not applicable",
};

export function reasonOf(availability: CompareAvailability): string {
  return availability.reason_code ?? availability.state;
}

/* -------------------------------------------------------------------------
 * Refusals
 * ---------------------------------------------------------------------- */

/**
 * 403 and 404 say the same sentence and take the same state on purpose: the
 * server answers a foreign workspace, an unknown Alpha and a run outside the
 * Alpha identically, so the screen must not turn any of them into an
 * existence hint (audit F-04).
 */
export const COMPARE_NEUTRAL_REFUSAL =
  "This alpha or these runs may not exist or may be outside your access — nothing here confirms either.";

export const COMPARE_REFUSAL_COPY = {
  network: "The request did not reach the server.",
  400: "This compare request is not valid. Reopen compare from the run library or the attempt lineage.",
  401: "Your session has ended. Sign in again to read this comparison.",
  403: COMPARE_NEUTRAL_REFUSAL,
  404: COMPARE_NEUTRAL_REFUSAL,
  503: "Compare is unavailable right now. Nothing on this screen was changed.",
  other: "The comparison could not be read.",
} as const;

export type CompareRefusal = LineageRefusal;

/**
 * The lineage mapper decides state, retry and terminality by status (the
 * same F-04 rules); only the sentence is Screen 13's own.
 */
export function toCompareRefusal(error: unknown): CompareRefusal {
  const base = toLineageRefusal(error);
  const { status } = base;
  const message =
    status === 0
      ? COMPARE_REFUSAL_COPY.network
      : status === 400 || status === 401 || status === 403 || status === 404 || status === 503
        ? COMPARE_REFUSAL_COPY[status]
        : COMPARE_REFUSAL_COPY.other;
  return { ...base, message };
}

/* -------------------------------------------------------------------------
 * Screen state from a typed answer
 * ---------------------------------------------------------------------- */

/** The boundaries and absences the answer itself declares, for the partial notice. */
export function compareGaps(compare: Compare): string[] {
  const gaps: string[] = [];
  const { result } = compare;
  if (result.mode === "attempts" || result.mode === "markets") {
    if (result.coverage.state === "PARTIAL") gaps.push(`coverage (${result.coverage.reason_code ?? "PARTIAL"})`);
  } else if (result.state === "PARTIAL") {
    gaps.push(`pair (${reasonOf(result.pair.common_window.availability)})`);
  }
  return gaps;
}

export function compareState(compare: Compare): ResearchState {
  if (compare.availability.state !== "AVAILABLE") {
    return {
      state: "empty",
      reason: `No run of this alpha can be compared yet (${reasonOf(compare.availability)}).`,
      mayRetry: false,
      retainsContent: true,
    };
  }
  const gaps = compareGaps(compare);
  if (gaps.length > 0) {
    return {
      state: "partial",
      reason: `Persisted comparison with declared gaps: ${gaps.join(", ")}. Each is named where it applies.`,
      mayRetry: false,
      retainsContent: true,
    };
  }
  return { state: "available", reason: "", mayRetry: false, retainsContent: true };
}
