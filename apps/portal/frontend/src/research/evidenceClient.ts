/**
 * Research Loop — Evidence Flow client (P13 + RS-02, Screen 04).
 *
 * Four named operations, from two generated contracts that answer different
 * questions about the same run:
 *
 *  - **P13 `research-evidence`** publishes the immutable Hub projection: the
 *    metric registry, the Stage-5 claim and its methodology certificate, the
 *    stage timeline, four named series and the run's typed source absences.
 *    Every run that sealed has one.
 *  - **RS-02 `research-current-source`** publishes the retained Advanced-WFO
 *    passport for the one admitted profile. It rejects every other profile
 *    rather than falling back, so a refusal from it is a fact about the run,
 *    not an error in the screen.
 *
 * The screen reads the Hub first and the passport second. Nothing here decides
 * which is "right": both are rendered as what they are, and a run outside the
 * admitted profile keeps the passport panel with the server's own reason.
 *
 * Two prohibitions shape the surface:
 *
 *  - **A revision binds a series to its Hub.** A series answered at another
 *    revision is discarded rather than drawn beside metrics it does not
 *    belong to — the consumer rule the P13 handoff fixes.
 *  - **No number is computed here.** Values arrive as exact decimal strings
 *    and are rendered as strings; monthly, rolling and histogram values are
 *    server facts, never a reduction of the equity series.
 */

import type { components as EvidenceComponents } from "@portal/contracts-research-evidence";
import type { components as CurrentSourceComponents } from "@portal/contracts-research-current-source";

import { PortalApiError } from "../lib/api";
import type { ResearchState } from "./state";

type HubSchemas = EvidenceComponents["schemas"];
type SourceSchemas = CurrentSourceComponents["schemas"];

export type EvidenceHub = HubSchemas["EvidenceHub"];
export type EvidenceSeries = HubSchemas["EvidenceSeries"];
export type SeriesKind = HubSchemas["SeriesKind"];
export type Metric = HubSchemas["Metric"];
export type Warning = HubSchemas["Warning"];
export type Claim = HubSchemas["Claim"];
export type Stage = HubSchemas["Stage"];
export type SeriesLink = HubSchemas["SeriesLink"];
export type Availability = HubSchemas["Availability"];
export type EquityPoint = HubSchemas["EquityPoint"];
export type MonthlyReturnPoint = HubSchemas["MonthlyReturnPoint"];
export type RollingReturnPoint = HubSchemas["RollingReturnPoint"];
export type DistributionBucket = HubSchemas["DistributionBucket"];
export type CorrectedDistributionBucket = HubSchemas["CorrectedDistributionBucket"];

export type CurrentSourceEvidence = SourceSchemas["Evidence"];
export type CurrentSourceAvailability = SourceSchemas["Availability"];

/**
 * The four published paths, spelled as the OpenAPI documents publish them.
 *
 * `runId` is the only path input and it is percent-encoded; no query the
 * browser builds names a relation, revision, ordinal or artifact.
 */
const RUNS = "/api/v1/quantbt/runs";

export const SERIES_KINDS: readonly SeriesKind[] = [
  "EQUITY_OOS",
  "MONTHLY_RETURNS",
  "ROLLING_RETURNS_20",
  "RETURN_DISTRIBUTION",
] as const;

/** The contract's own ceiling, named once so a test can assert the screen honours it. */
export const SERIES_POINT_CAP = 192;

function query(workspaceId?: string, extra?: Record<string, string>): string {
  const params = new URLSearchParams();
  if (workspaceId) params.set("workspace_id", workspaceId);
  for (const [key, value] of Object.entries(extra ?? {})) params.set(key, value);
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

/**
 * A read that may legitimately answer "nothing changed".
 *
 * The Hub and every series are immutable at a revision, so the contract offers
 * `304`. A 304 is not an error and not an empty document: it means the copy in
 * hand is still exact, so the caller keeps it.
 */
export const NOT_MODIFIED = Symbol("evidence.not-modified");
export type Fresh<T> = T | typeof NOT_MODIFIED;

async function call<T>(path: string, etag?: string | null, signal?: AbortSignal): Promise<Fresh<T>> {
  const response = await fetch(path, {
    credentials: "same-origin",
    signal,
    headers: etag ? { "If-None-Match": etag } : undefined,
  });
  if (response.status === 304) return NOT_MODIFIED;
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    let code: string | null = null;
    let requestId: string | null = response.headers.get("x-request-id");
    try {
      const problem = (await response.json()) as Partial<HubSchemas["Problem"]>;
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

export const evidenceApi = {
  /** `researchEvidenceHubGetV1` */
  hub: (runId: string, options: { workspaceId?: string; etag?: string | null; signal?: AbortSignal } = {}) =>
    call<EvidenceHub>(
      `${RUNS}/${encodeURIComponent(runId)}/evidence${query(options.workspaceId)}`,
      options.etag,
      options.signal,
    ),

  /** `researchEvidenceSeriesGetV1` */
  series: (
    runId: string,
    kind: SeriesKind,
    options: { workspaceId?: string; etag?: string | null; signal?: AbortSignal } = {},
  ) =>
    call<EvidenceSeries>(
      `${RUNS}/${encodeURIComponent(runId)}/evidence/series${query(options.workspaceId, { kind })}`,
      options.etag,
      options.signal,
    ),

  /** `researchCurrentSourceEvidenceGetV1` */
  currentSource: (runId: string, options: { workspaceId?: string; signal?: AbortSignal } = {}) =>
    call<CurrentSourceEvidence>(
      `${RUNS}/${encodeURIComponent(runId)}/current-source/evidence${query(options.workspaceId)}`,
      null,
      options.signal,
    ),
} as const;

/* -------------------------------------------------------------------------
 * Revision binding
 * ---------------------------------------------------------------------- */

/**
 * Whether a series may be drawn beside this Hub.
 *
 * The projection is immutable at a revision; a series answered at a different
 * one describes another projection of the same run. Drawing them together
 * would put a chart from one seal next to metrics from another, which is the
 * kind of mismatch nobody would ever see. The consumer rule is: discard the
 * series, reread the Hub, then ask for the series again.
 */
export function seriesMatchesHub(hub: EvidenceHub, series: EvidenceSeries): boolean {
  if (hub.revision === null || series.revision === null) return false;
  return hub.revision === series.revision;
}

export const REVISION_MISMATCH =
  "this chart answered at a different projection revision than the summary above it, so it was discarded rather than drawn beside numbers it does not belong to.";

/* -------------------------------------------------------------------------
 * Availability presentation
 * ---------------------------------------------------------------------- */

/** Whether a fact may be shown as a value. Everything else keeps its reason. */
export function isAvailable(availability: Availability | CurrentSourceAvailability): boolean {
  return availability.state === "AVAILABLE";
}

/**
 * The words each withheld state gets.
 *
 * They are not synonyms. `NOT_APPLICABLE` means the question does not arise
 * for this run; `NOT_PUBLISHED` means it does and the source did not answer;
 * `PENDING_SOURCE_CALLBACK` means the answer is still coming. A screen that
 * prints one phrase for all three tells the reader nothing.
 */
export const WITHHELD_WORDS: Record<
  Availability["state"] | CurrentSourceAvailability["state"],
  string
> = {
  AVAILABLE: "available",
  NOT_PUBLISHED: "not published",
  NOT_APPLICABLE: "not applicable",
  PENDING_SOURCE_CALLBACK: "pending source",
  LEGACY_METADATA_ONLY: "legacy metadata",
  PENDING_RETENTION: "pending retention",
  NOT_RETAINED_LEGACY: "not retained (legacy)",
};

export function unavailableReason(availability: Availability | CurrentSourceAvailability): string {
  return availability.reason_code ?? availability.state;
}

/* -------------------------------------------------------------------------
 * Refusals
 * ---------------------------------------------------------------------- */

export interface EvidenceRefusal {
  code: string | null;
  message: string;
  status: number;
  requestId: string | null;
  state: ResearchState["state"];
  mayRetry: boolean;
  /** True when asking again cannot change the answer. */
  terminal: boolean;
}

export function toEvidenceRefusal(error: unknown): EvidenceRefusal {
  if (!(error instanceof PortalApiError)) {
    return {
      code: null,
      message: "The request did not reach the server.",
      status: 0,
      requestId: null,
      state: "failed-retryable",
      mayRetry: true,
      terminal: false,
    };
  }
  const { status } = error;
  const denied = status === 401 || status === 403;
  return {
    code: error.code,
    message: error.message,
    status,
    requestId: error.requestId,
    state:
      denied
        ? "denied"
        : status === 404
          ? "empty"
          : status === 409
            ? "stale"
            : status >= 500
              ? "unavailable"
              : "terminal",
    /* A 409 says the revision moved under the read: rereading is exactly the
       right response, and the only one. */
    mayRetry: status >= 500 || status === 409,
    terminal: denied || status === 404,
  };
}
