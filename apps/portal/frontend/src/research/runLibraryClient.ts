/**
 * Research Loop — run library client (P12, Screen 01).
 *
 * Two named operations and nothing else. Every value the browser sends is a
 * generated one, and nothing it receives is decoded: the cursor is opaque, the
 * comparison key is the server's, and the order is fixed by the contract.
 *
 * Three prohibitions shape the surface:
 *
 *  - **`ids` is a poll, not a query.** The contract makes it mutually
 *    exclusive with cursors and filters and caps it at 50, so the builder
 *    refuses to mix them rather than letting the server discover the mistake.
 *  - **No opaque value is interpreted.** The cursor is passed back as given;
 *    `comparison.key` is compared for exact identity and never parsed,
 *    hashed or rebuilt from labels.
 *  - **No availability is invented.** Every field arrives beside an
 *    `Availability`, and a `NOT_PUBLISHED` fact keeps its placeholder and its
 *    reason rather than becoming a zero.
 */

import type { components } from "@portal/contracts-research-run-library";

import { PortalApiError } from "../lib/api";
import { toResearchRefusal, type ResearchRefusal } from "./researchRefusal";
import { rememberRunLabels } from "./runLabels";

type Schemas = components["schemas"];

export type RunLibraryResponse = Schemas["RunLibraryResponse"];
export type RunLibraryItem = Schemas["RunLibraryItem"];
export type RunSparklineResponse = Schemas["RunSparklineResponse"];
export type Availability = Schemas["Availability"];
export type RunStatus = Schemas["RunStatus"];
export type StageCell = Schemas["StageCell"];
export type MetricCell = Schemas["MetricCell"];
export type AlphaBinding = Schemas["AlphaBinding"];
export type ReleaseCandidateRef = Schemas["ReleaseCandidateRef"];
export type RunSparklineSource = Schemas["RunSparklineSource"];
export type RetainedFact = Schemas["RetainedAnalyticsV2Fact"];

/**
 * The two published paths, spelled exactly as
 * `research-run-library.openapi.json` publishes them. An earlier draft of
 * this client read `/api/v1/research/run-library`, a path no contract
 * declares — a reader URL the frontend had authored for itself.
 */
const BASE = "/api/v1/quantbt/runs";

/** Contract limits, named once so the UI and the builder cannot disagree. */
export const LIST_LIMIT = 50;
export const IDS_LIMIT = 50;
/** The visible-running poll interval the handoff fixes. */
export const RUNNING_POLL_MS = 10_000;

export interface ListQuery {
  workspace_id?: string;
  q?: string;
  status?: readonly RunStatus[];
  mode?: readonly string[];
  alpha?: readonly string[];
  cursor?: string;
  before?: string;
  limit?: number;
}

export interface IdsQuery {
  workspace_id?: string;
  ids: readonly string[];
}

export class RunLibraryQueryError extends Error {}

/**
 * Builds the list query string.
 *
 * `ids` may not travel with a filter or a cursor — the contract says so, and
 * sending them together would ask the server to resolve a contradiction the
 * browser created. The builder refuses instead.
 */
export function listQueryString(query: ListQuery | IdsQuery): string {
  const params = new URLSearchParams();
  if (query.workspace_id) params.set("workspace_id", query.workspace_id);

  if ("ids" in query) {
    if (query.ids.length === 0) throw new RunLibraryQueryError("ids poll needs at least one id");
    if (query.ids.length > IDS_LIMIT) {
      throw new RunLibraryQueryError(`ids poll accepts at most ${IDS_LIMIT} ids`);
    }
    for (const id of query.ids) params.append("ids", id);
    return `?${params.toString()}`;
  }

  if (query.cursor && query.before) {
    throw new RunLibraryQueryError("cursor and before are mutually exclusive");
  }
  if (query.q) params.set("q", query.q);
  for (const status of query.status ?? []) params.append("status", status);
  for (const mode of query.mode ?? []) params.append("mode", mode);
  for (const alpha of query.alpha ?? []) params.append("alpha", alpha);
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.before) params.set("before", query.before);
  params.set("limit", String(Math.min(query.limit ?? LIST_LIMIT, LIST_LIMIT)));
  return `?${params.toString()}`;
}

async function call<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", signal });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    let code: string | null = null;
    let requestId: string | null = response.headers.get("x-request-id");
    try {
      const problem = (await response.json()) as Partial<Schemas["Problem"]>;
      if (problem?.error?.message) message = problem.error.message;
      code = problem?.error?.code ?? null;
      requestId = problem?.request_id ?? requestId;
    } catch {
      /* non-JSON error body: keep the status line the server gave */
    }
    throw new PortalApiError(message, response.status, code, requestId);
  }
  return (await response.json()) as T;
}

export const runLibraryApi = {
  list: (query: ListQuery | IdsQuery, signal?: AbortSignal) =>
    call<RunLibraryResponse>(`${BASE}${listQueryString(query)}`, signal).then((answer) => {
      /*
       * D1: the Library is the one read that returns many runs at once, so a
       * single page teaches the shared registry every label on it — Screen 10
       * then prints `R-WFO-118` for the run behind an attempt without asking
       * for it again. Rows the server did not label are remembered as
       * unlabelled, not skipped, so a later read cannot be mistaken for one.
       */
      rememberRunLabels(answer.items);
      return answer;
    }),

  sparkline: (runId: string, workspaceId?: string, signal?: AbortSignal) =>
    call<RunSparklineResponse>(
      `${BASE}/${encodeURIComponent(runId)}/sparkline${
        workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : ""
      }`,
      signal,
    ),
} as const;

/* -------------------------------------------------------------------------
 * All-time summary (`enrich_analysis`, `library_summary`)
 * ---------------------------------------------------------------------- */

/**
 * The `analytics_all_time` block of a Library item (the generated
 * `EnrichedAnalysisLibrarySummary`, = `library_summary` of the enrichment).
 * It is optional (an old seal has none), so the item is read through a guard:
 * nothing here is trusted until it has the canonical shape.
 */
export interface AllTimeFact {
  state: "AVAILABLE" | "NOT_PUBLISHED" | "NOT_APPLICABLE";
  reason_code: string | null;
  value: string | null;
}
export interface AllTimeSummary {
  label: string;
  /** FULL_RETAINED_OOS, or SAMPLED_RETAINED_EQUITY (a sampled curve, not a full daily ledger). */
  coverage: "FULL_RETAINED_OOS" | "SAMPLED_RETAINED_EQUITY";
  source_observation_count: number;
  input_digest: string;
  state: "AVAILABLE" | "NOT_PUBLISHED" | "NOT_APPLICABLE";
  reason_code: string | null;
  sparkline: readonly { at_utc_ms: number; value: string }[];
  return_fraction: string | null;
  sharpe: AllTimeFact | null;
  max_drawdown_fraction: string | null;
  /** Served basis of `return_fraction` (first/last retained OOS equity); absent when the server omitted it. */
  return_basis?: AllTimeReturnBasis;
}
export interface AllTimeReturnBasis {
  definition_id: string;
  scope: string;
  first_at_utc_ms: number;
  last_at_utc_ms: number;
  start_equity: string;
  end_equity: string;
}

/**
 * What a card knows about its all-time block.
 *
 *  - `absent`  - the server did not send one: the card keeps its own source,
 *    labelled as that source labels itself.
 *  - `refused` - it sent one whose basis is not `ALL_TIME`, whose `rolling`
 *    is not null, or whose shape is wrong: a typed absence, never drawn and
 *    never relabelled.
 *  - `summary` - drawn.
 */
export type AllTimeRead =
  | { kind: "absent" }
  | { kind: "refused"; why: string }
  | { kind: "summary"; summary: AllTimeSummary };

const FACT_STATES = ["AVAILABLE", "NOT_PUBLISHED", "NOT_APPLICABLE"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stringOrNull(value: unknown): string | null | undefined {
  return value === null ? null : typeof value === "string" ? value : undefined;
}

/**
 * `enriched_analysis_availability` (generated `EnrichedAnalysisAvailability`): why a card has no
 * all-time block. Only a served NOT_PUBLISHED state with a string code is a typed absence;
 * anything else (not served, AVAILABLE, malformed) is `null` - today's behaviour, no invented reason.
 */
export function readEnrichmentAbsence(item: RunLibraryItem): { reason_code: string } | null {
  const raw: unknown = item.enriched_analysis_availability;
  if (!isRecord(raw) || raw.state !== "NOT_PUBLISHED") return null;
  return typeof raw.reason_code === "string" && raw.reason_code !== "" ? { reason_code: raw.reason_code } : null;
}

export function readAllTime(item: RunLibraryItem): AllTimeRead {
  const raw: unknown = item.analytics_all_time;
  if (raw === undefined || raw === null) return { kind: "absent" };
  if (!isRecord(raw)) return { kind: "refused", why: "the block is not an object" };
  if (raw.basis !== "ALL_TIME") {
    return { kind: "refused", why: `the server labelled this block ${JSON.stringify(raw.basis ?? null)}, not ALL_TIME` };
  }
  if (raw.rolling !== undefined && raw.rolling !== null) {
    return { kind: "refused", why: "a rolling figure came with the all-time block" };
  }
  const state = raw.state;
  if (typeof state !== "string" || !FACT_STATES.includes(state)) {
    return { kind: "refused", why: "the block has no state" };
  }
  if (raw.sampling !== "EXTREMA_BUCKET_V1") return { kind: "refused", why: "the block's sampling is not the contract's" };
  if (raw.coverage !== "FULL_RETAINED_OOS" && raw.coverage !== "SAMPLED_RETAINED_EQUITY") {
    return { kind: "refused", why: "the block declares no coverage" };
  }
  if (typeof raw.source_observation_count !== "number" || !Number.isInteger(raw.source_observation_count) || raw.source_observation_count < 0) {
    return { kind: "refused", why: "the block's source count is not an integer" };
  }
  if (typeof raw.input_digest !== "string" || raw.input_digest === "") return { kind: "refused", why: "the block has no input digest" };
  const reason = stringOrNull(raw.reason_code);
  const ret = stringOrNull(raw.return_fraction);
  const drawdown = stringOrNull(raw.max_drawdown_fraction);
  if (reason === undefined || ret === undefined || drawdown === undefined) {
    return { kind: "refused", why: "the block's figures are not strings" };
  }
  let sharpe: AllTimeFact | null = null;
  if (isRecord(raw.sharpe)) {
    const value = stringOrNull(raw.sharpe.value);
    const why = stringOrNull(raw.sharpe.reason_code);
    if (
      typeof raw.sharpe.state !== "string" ||
      !FACT_STATES.includes(raw.sharpe.state) ||
      value === undefined ||
      why === undefined
    ) {
      return { kind: "refused", why: "the sharpe fact is malformed" };
    }
    sharpe = { state: raw.sharpe.state as AllTimeFact["state"], reason_code: why, value };
  } else if (raw.sharpe !== null && raw.sharpe !== undefined) {
    return { kind: "refused", why: "the sharpe fact is malformed" };
  }
  const points = raw.sparkline;
  if (
    !Array.isArray(points) ||
    !points.every((p) => isRecord(p) && Number.isFinite(p.at_utc_ms) && typeof p.value === "string")
  ) {
    return { kind: "refused", why: "the sparkline points are malformed" };
  }
  const basisRaw = raw.return_basis;
  const basis: AllTimeReturnBasis | undefined =
    isRecord(basisRaw) &&
    typeof basisRaw.definition_id === "string" &&
    basisRaw.definition_id !== "" &&
    typeof basisRaw.scope === "string" &&
    Number.isFinite(basisRaw.first_at_utc_ms) &&
    Number.isFinite(basisRaw.last_at_utc_ms) &&
    typeof basisRaw.start_equity === "string" &&
    typeof basisRaw.end_equity === "string"
      ? {
          definition_id: basisRaw.definition_id,
          scope: basisRaw.scope,
          first_at_utc_ms: basisRaw.first_at_utc_ms as number,
          last_at_utc_ms: basisRaw.last_at_utc_ms as number,
          start_equity: basisRaw.start_equity,
          end_equity: basisRaw.end_equity,
        }
      : undefined;
  return {
    kind: "summary",
    summary: {
      ...(basis ? { return_basis: basis } : {}),
      label: typeof raw.label !== "string" ? "all time" : raw.label,
      coverage: raw.coverage,
      source_observation_count: raw.source_observation_count,
      input_digest: raw.input_digest,
      state: state as AllTimeSummary["state"],
      reason_code: reason,
      sparkline: points as AllTimeSummary["sparkline"],
      return_fraction: ret,
      sharpe,
      max_drawdown_fraction: drawdown,
    },
  };
}

/* -------------------------------------------------------------------------
 * Comparison
 * ---------------------------------------------------------------------- */

/** Spec 01 §2.6 — shown when two selected runs cannot be compared. */
export const COMPARE_REFUSAL =
  "these two runs do not share a ComparisonContractKey (symbol · timeframe · route · protocol) — a side-by-side would be a comparison lie, so the button refuses.";

/**
 * Shown while only one run is selected — the hi-fi's sentence (DQ-02: the
 * hi-fi wins on copy; spec 01 §2.6 has a shorter draft of the same rule).
 */
export const COMPARE_PICK_ONE_MORE =
  "select a second run to compare — only runs sharing a ComparisonContractKey (symbol · timeframe · route · protocol) can sit side by side";

/**
 * Screen 13 Compare is not built; phase P20 delivers it. The button says so
 * and stays disabled rather than navigating to a route that bounces back here
 * and loses the selection (FE-S01-05).
 */
export const COMPARE_PHASE = "P20";
export const COMPARE_DEFERRED =
  "same ComparisonContractKey — comparable. The Compare screen (13) is not built yet; phase P20 delivers it.";

/**
 * Screen 11 Release Candidate is P21's. The rc chip shows the persisted P21
 * relation and opens Screen 11 for its run (W5c; RF-06 wave C drew it inert
 * while the route did not exist).
 */
export const RC_PHASE = "P21";

/**
 * Whether two selected runs may be compared.
 *
 * The server owns the key. Two runs are comparable only when both keys are
 * present and exactly identical — never when their labels, alpha names or any
 * locally derived hash happen to match, because those agree in cases the
 * methodology does not.
 */
export function mayCompare(a: RunLibraryItem | undefined, b: RunLibraryItem | undefined): boolean {
  if (!a || !b) return false;
  const left = a.comparison.key;
  const right = b.comparison.key;
  return left !== null && right !== null && left === right;
}

/* -------------------------------------------------------------------------
 * Availability presentation
 * ---------------------------------------------------------------------- */

/**
 * Whether a fact may be shown as a value.
 *
 * Everything else keeps its placeholder and states its reason. A
 * `NOT_PUBLISHED` metric is not a zero, a `LEGACY_METADATA_ONLY` row is not
 * current engine evidence, and a `PENDING_SOURCE_CALLBACK` is not stale
 * success.
 */
export function isAvailable(availability: Availability): boolean {
  return availability.state === "AVAILABLE";
}

/**
 * The state's reader sentence (FE-S01-09). Screen 01 layers its per-code
 * sentences on top (`RunLibrary.tsx`); nothing here ever returns a raw code.
 */
const STATE_SENTENCES: Record<Availability["state"], string> = {
  AVAILABLE: "Published.",
  NOT_PUBLISHED: "Not published by the engine for this run.",
  LEGACY_METADATA_ONLY: "Recorded by the legacy 1.0.8 engine as metadata only — not current engine evidence.",
  PENDING_SOURCE_CALLBACK: "Waiting for the engine to report it.",
};

/** The sentence a withheld fact carries when no more specific one is known. */
export function unavailableReason(availability: Availability): string {
  return STATE_SENTENCES[availability.state];
}

/* -------------------------------------------------------------------------
 * Refusals
 * ---------------------------------------------------------------------- */

/**
 * RF01-F4: one refusal mapper serves every Research surface
 * (`researchRefusal.ts`). These names stay so existing callers and the
 * shared-module rule (additive only) hold.
 */
export type LibraryRefusal = ResearchRefusal;
export const toLibraryRefusal = toResearchRefusal;
