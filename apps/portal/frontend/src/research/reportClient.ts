/**
 * Research Loop — Run Report client (P18, Screen 09).
 *
 * Four named operations and nothing else:
 *
 *  - `researchReportDetailGetV1` — the sealed, immutable report for a run. It
 *    is revalidated with the ETag the server sent: a `304` means the copy in
 *    hand is still the exact current revision, and the caller keeps it.
 *  - `researchReportExportCreateV1` — the one write on this screen. It carries
 *    the same-origin CSRF proof, offers only the formats the report declared,
 *    and a duplicate click returns the same durable job.
 *  - `researchReportExportStatusGetV1` — the job's own state, polled by the
 *    hook only while it is `QUEUED` or `RUNNING`.
 *  - `researchReportExportDownloadGetV1` — never fetched here. When a job is
 *    `READY` the server publishes an opaque same-origin `download_href`; the
 *    screen renders it as a link the reader follows, so no byte passes through
 *    this module and nothing downloads on its own.
 *
 * No number is computed here. Every value arrives as an exact decimal string
 * or UTC milliseconds and is rendered as it came.
 */

import type { components as ReportComponents } from "@portal/contracts-research-report";

import { CSRF_HEADER, csrfTokenFromCookie } from "../auth/authApi";
import { PortalApiError } from "../lib/api";
import { NOT_MODIFIED, type Fresh } from "./evidenceClient";
import { REPLAY_REFUSAL_COPY } from "./replayClient";
import type { ResearchState } from "./state";

type ReportSchemas = ReportComponents["schemas"];

export type ReportDetail = ReportSchemas["ReportDetail"];
export type FrozenCore = ReportSchemas["FrozenCore"];
export type ReportFact = ReportSchemas["ReportFact"];
export type ReportAvailability = ReportSchemas["Availability"];
export type IdentityField = ReportSchemas["IdentityField"];
export type ReportMetric = ReportSchemas["Metric"];
export type Headline = ReportSchemas["Headline"];
export type ReportEquity = ReportSchemas["Equity"];
export type ReportEquityPoint = ReportEquity["points"][number];
export type ReportFolds = ReportSchemas["Folds"];
export type FoldRow = ReportSchemas["FoldRow"];
export type ReportStage = ReportSchemas["Stage"];
export type ReportArtifact = ReportSchemas["Artifact"];
export type ReportWarning = ReportSchemas["Warning"];
export type Annotation = ReportSchemas["Annotation"];
export type ExportCapabilities = ReportSchemas["ExportCapabilities"];
export type ExportFormat = ReportSchemas["ExportCreate"]["format"];
export type UnavailableExportFormat = ReportSchemas["UnavailableExportFormat"];
export type ExportJob = ReportSchemas["ExportJob"];

export { NOT_MODIFIED };
export type { Fresh };

const RUNS = "/api/v1/quantbt/runs";

/** The two formats the contract can ever publish, in the order the bar offers them. */
export const EXPORT_FORMATS: readonly ExportFormat[] = ["REPORT_JSON", "REPORT_CSV"] as const;

function query(workspaceId?: string): string {
  if (!workspaceId) return "";
  const params = new URLSearchParams();
  params.set("workspace_id", workspaceId);
  return `?${params.toString()}`;
}

async function call<T>(path: string, init: RequestInit & { etag?: string | null } = {}): Promise<Fresh<T>> {
  const { etag, ...rest } = init;
  const method = (rest.method ?? "GET").toUpperCase();
  /* The CSRF proof rides on the one write and on nothing else. */
  const csrf = method === "POST" ? csrfTokenFromCookie() : null;
  const response = await fetch(path, {
    ...rest,
    credentials: "same-origin",
    headers: {
      ...(etag ? { "If-None-Match": etag } : {}),
      ...(csrf ? { [CSRF_HEADER]: csrf } : {}),
      ...(method === "POST" ? { "content-type": "application/json" } : {}),
    },
  });
  if (response.status === 304) return NOT_MODIFIED;
  if (!response.ok) {
    let code: string | null = null;
    let requestId: string | null = response.headers.get("x-request-id");
    try {
      const problem = (await response.json()) as Partial<ReportSchemas["Problem"]>;
      code = problem?.error?.code ?? null;
      requestId = problem?.request_id ?? requestId;
    } catch {
      /* non-JSON error body: the status is still typed */
    }
    /* The server's prose is never rendered: the screen speaks from
       `REPORT_REFUSAL_COPY`, keyed by status. */
    throw new PortalApiError(`${response.status} ${response.statusText}`, response.status, code, requestId);
  }
  return (await response.json()) as T;
}

function runPath(runId: string): string {
  return `${RUNS}/${encodeURIComponent(runId)}/report`;
}

async function fresh<T>(promise: Promise<Fresh<T>>): Promise<T> {
  const answer = await promise;
  /* Only the detail read sends a validator, so only it can answer 304. */
  if (answer === NOT_MODIFIED) throw new PortalApiError("304 unexpected", 304, null, null);
  return answer;
}

export const reportApi = {
  /** `researchReportDetailGetV1` */
  detail: (runId: string, options: { workspaceId?: string; etag?: string | null; signal?: AbortSignal } = {}) =>
    call<ReportDetail>(`${runPath(runId)}${query(options.workspaceId)}`, {
      etag: options.etag,
      signal: options.signal,
    }),

  /** `researchReportExportCreateV1` — only ever from an explicit click. */
  exportCreate: (runId: string, format: ExportFormat, options: { workspaceId?: string; signal?: AbortSignal } = {}) =>
    fresh(
      call<ExportJob>(`${runPath(runId)}/exports${query(options.workspaceId)}`, {
        method: "POST",
        body: JSON.stringify({ format }),
        signal: options.signal,
      }),
    ),

  /** `researchReportExportStatusGetV1` */
  exportStatus: (runId: string, jobId: string, options: { workspaceId?: string; signal?: AbortSignal } = {}) =>
    fresh(
      call<ExportJob>(`${runPath(runId)}/exports/${encodeURIComponent(jobId)}${query(options.workspaceId)}`, {
        signal: options.signal,
      }),
    ),
} as const;

/**
 * `researchReportExportDownloadGetV1`, as the only thing the browser does with
 * it: follow the link the server published. Returns `null` unless the job is
 * `READY` and the href is a same-origin path — a scheme or a protocol-relative
 * host would be an address this screen was never given.
 */
export function exportDownloadHref(job: ExportJob | null): string | null {
  if (!job || job.state !== "READY" || !job.download_href) return null;
  const href = job.download_href;
  return href.charAt(0) === "/" && href.charAt(1) !== "/" && href.charAt(1) !== "\\" ? href : null;
}

export function exportPending(job: ExportJob | null): boolean {
  return job !== null && (job.state === "QUEUED" || job.state === "RUNNING");
}

/* -------------------------------------------------------------------------
 * Words
 * ---------------------------------------------------------------------- */

export const REPORT_WITHHELD_WORDS: Record<ReportAvailability["state"], string> = {
  AVAILABLE: "available",
  NOT_PUBLISHED: "not published",
  NOT_APPLICABLE: "not applicable",
  PENDING_SOURCE_CALLBACK: "pending source",
  LEGACY_METADATA_ONLY: "legacy metadata",
};

export const REPORT_FACT_WORDS: Record<ReportFact["state"], string> = {
  AVAILABLE: "available",
  NOT_PUBLISHED: "not published",
  NOT_ASSERTED: "not asserted",
  NOT_APPLICABLE: "not applicable",
};

export const ARTIFACT_STATE_WORDS: Record<ReportArtifact["state"], string> = {
  SEALED: "sealed",
  NOT_PUBLISHED: "not published",
  NOT_APPLICABLE: "not applicable",
  ABORTED: "aborted",
};

export const EXPORT_STATE_WORDS: Record<ExportJob["state"], string> = {
  QUEUED: "queued",
  RUNNING: "running",
  READY: "ready",
  FAILED: "failed",
};

export const EXPORT_FORMAT_LABEL: Record<ExportFormat | UnavailableExportFormat["format"], string> = {
  REPORT_JSON: "JSON",
  REPORT_CSV: "CSV",
  PARQUET: "Parquet",
  ARCHIVE: "archive",
};

/** Spec 09 §16.6's artifact names, keyed by the contract's own enum. */
export const ARTIFACT_LABEL: Record<ReportArtifact["key"], string> = {
  RUN_SPEC: "run_spec",
  SELECTION_TRACE: "selection_trace",
  FOLD_PLAN: "fold_plan",
  FILL_LEDGER: "fill_ledger",
  METRICS_SUMMARY: "metrics_summary",
  CLAIM: "claim",
  BUNDLE: "bundle",
};

/** Spec 09 §2.8's stage names, keyed by the contract's own enum. */
export const STAGE_LABEL: Record<ReportStage["key"], string> = {
  S1: "Split",
  S2: "Search",
  S3: "Freeze",
  S4: "Execute",
  S5: "Claim",
};

/** The reason a withheld fact carries, most specific first. */
export function factReason(fact: { reason_code?: string | null; availability?: ReportAvailability }): string {
  return fact.reason_code ?? fact.availability?.reason_code ?? fact.availability?.state ?? "unknown";
}

/* -------------------------------------------------------------------------
 * Refusals
 * ---------------------------------------------------------------------- */

export type ReportLane = "report" | "export";

/**
 * Fixed copy per refusal and lane. The 403 sentence is the one S08 settled on
 * (`002e4098`), shared rather than restated: a denial must not confirm the run
 * exists or say whose it is (audit F-04). A 404 is a scope fact in the same
 * spirit — the server answers foreign and unknown runs identically, so the
 * copy never says the run exists.
 */
export const REPORT_REFUSAL_COPY = {
  report: {
    network: "The request did not reach the server.",
    400: "This report request is not valid. Reopen the report from the run.",
    401: "Your session has ended. Sign in again to read this report.",
    403: REPLAY_REFUSAL_COPY[403],
    404: "No report was found for this run in your current workspace.",
    409: "The report is not sealed yet. Nothing on this screen was changed.",
    503: "The report is unavailable right now. Nothing on this screen was changed.",
    other: "The report could not be read.",
  },
  export: {
    network: "The export request did not reach the server.",
    400: "This export request is not valid. Nothing was queued.",
    401: "Your session has ended. Sign in again to export this report.",
    403: REPLAY_REFUSAL_COPY[403],
    404: "No export was found for this report in your current workspace.",
    409: "This export is not ready. The current job was kept and no replacement job was requested.",
    503: "Export is unavailable right now. Nothing was queued.",
    other: "The export could not be requested.",
  },
} as const;

export interface ReportRefusal {
  code: string | null;
  message: string;
  status: number;
  requestId: string | null;
  state: ResearchState["state"];
  mayRetry: boolean;
  /** True when asking again cannot change the answer; nothing is kept. */
  terminal: boolean;
}

export function toReportRefusal(error: unknown, lane: ReportLane = "report"): ReportRefusal {
  const copy = REPORT_REFUSAL_COPY[lane];
  if (!(error instanceof PortalApiError)) {
    return {
      code: null,
      message: copy.network,
      status: 0,
      requestId: null,
      state: "failed-retryable",
      mayRetry: true,
      terminal: false,
    };
  }
  const { status } = error;
  const denied = status === 401 || status === 403;
  const known = status === 400 || status === 401 || status === 403 || status === 404 || status === 409 || status === 503;
  return {
    code: error.code,
    message: known ? copy[status] : copy.other,
    status,
    requestId: error.requestId,
    state: denied
      ? "denied"
      : status === 404
        ? "empty"
        : status === 409
          ? "stale"
          : status >= 500
            ? "unavailable"
            : "terminal",
    mayRetry: status >= 500,
    terminal: denied || status === 404 || status === 400,
  };
}

/* -------------------------------------------------------------------------
 * Screen state from a typed answer
 * ---------------------------------------------------------------------- */

/** The facts the report names as absent, for the screen's own partial notice. */
export function reportAbsences(report: ReportDetail): string[] {
  const core = report.frozen_core;
  const absent: string[] = [];
  if (core.equity.state !== "AVAILABLE") absent.push("equity series");
  if (core.folds.state !== "AVAILABLE") absent.push("per-fold rows");
  if (core.headline.some((cell) => cell.value === null)) absent.push("headline values");
  if (core.artifacts.some((artifact) => artifact.state !== "SEALED")) absent.push("artifact digests");
  if (core.passport.some((fact) => fact.state !== "AVAILABLE")) absent.push("passport facts");
  return absent;
}

export function reportState(report: ReportDetail): ResearchState {
  const absent = reportAbsences(report);
  if (absent.length > 0) {
    return {
      state: "partial",
      reason: `Sealed report. The source did not publish ${absent.join(", ")}; each is named below with its reason code.`,
      mayRetry: false,
      retainsContent: true,
    };
  }
  return { state: "available", reason: "", mayRetry: false, retainsContent: true };
}
