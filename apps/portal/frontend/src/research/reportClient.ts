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
import { readEnrichedAnalysis, type EnrichedRead } from "./enrichedAnalysis";

import { CSRF_HEADER, csrfTokenFromCookie } from "../auth/authApi";
import { reportSessionExpired } from "../auth/sessionExpiry";
import { PortalApiError } from "../lib/api";
import { NOT_MODIFIED, type Fresh } from "./evidenceClient";
import { REPLAY_REFUSAL_COPY } from "./replayClient";
import { rememberRunLabel } from "./runLabels";
import type { ResearchState } from "./state";

type ReportSchemas = ReportComponents["schemas"];

export type ReportDetail = ReportSchemas["ReportDetail"];
/** Every sealed core shape, including a failed run's sheet (X2 · spec 09 T06). */
export type AnyFrozenCore = ReportSchemas["FrozenCore"];
/** X2: the sheet of a run that FAILED or was cancelled — no claim, no metric. */
export type FrozenCoreFailed = ReportSchemas["FrozenCoreFailedV1"];
/** A core with a claim to report (v1 or v2); the sheet's claim blocks read only these. */
export type FrozenCore = Exclude<AnyFrozenCore, FrozenCoreFailed>;
/** X2 · P18-T10: reused original vs linked child. */
export type FinalAudit = ReportSchemas["FinalAudit"];
export type FrozenCoreV1 = ReportSchemas["FrozenCoreV1"];
/** W6a: every report sealed after CG-P18-01…11 is v2 (both lanes); a v1 core stays readable. */
export type FrozenCoreV2 = ReportSchemas["FrozenCoreV2"];
export type ReportFact = ReportSchemas["ReportFact"];
export type ReportFactV2 = ReportSchemas["ReportFactV2"];
export type FoldRowV2 = ReportSchemas["FoldRowV2"];
export type StageCheck = ReportSchemas["StageCheck"];
export type ReportAvailability = ReportSchemas["Availability"];
export type IdentityField = ReportSchemas["IdentityField"];
export type ReportMetric = ReportSchemas["Metric"];
export type Headline = ReportSchemas["Headline"];
export type ReportEquity = ReportSchemas["Equity"] | ReportSchemas["EquityV2"];
export type ReportEquityPoint = ReportSchemas["EquityPoint"];
export type ReportFolds = ReportSchemas["Folds"] | ReportSchemas["FoldsV2"];
export type FoldRow = ReportSchemas["FoldRow"];
export type ReportStage = ReportSchemas["Stage"] | ReportSchemas["StageV2"];
export type ReportArtifact = ReportSchemas["Artifact"] | ReportSchemas["ArtifactV2"];
export type ReportWarning = ReportSchemas["Warning"];
export type Annotation = ReportSchemas["Annotation"];
export type ExportCapabilities = ReportSchemas["ExportCapabilities"];
export type ExportFormat = ReportSchemas["ExportCreate"]["format"];
export type UnavailableExportFormat = ReportSchemas["UnavailableExportFormat"];
export type ExportJob = ReportSchemas["ExportJob"];

/** The v2 core, or null for a report sealed before W6a (it keeps its v1 shape) or a failed-run sheet. */
export function coreV2(core: AnyFrozenCore): FrozenCoreV2 | null {
  return core.schema_version === "research.report-frozen-core.v2" ? core : null;
}

/** X2: the failed-run sheet, or null for a report with a claim. */
export function coreFailed(core: AnyFrozenCore): FrozenCoreFailed | null {
  return core.schema_version === "research.report-failed-core.v1" ? core : null;
}

/** Display unit of a report metric, for `researchFormat.formatMetric`. */
export const REPORT_UNIT: Record<string, "currency" | "fraction" | "count" | "ratio"> = {
  CURRENCY: "currency",
  FRACTION: "fraction",
  COUNT: "count",
  RATIO: "ratio",
};

/** Headline tiles carry no unit of their own; the key decides it. */
export const HEADLINE_UNIT: Record<Headline["key"], "currency" | "fraction" | "count" | "ratio"> = {
  /** E14 · 9.8: the net return tile; the server states the scope it belongs to. */
  NET_RETURN: "fraction",
  OOS_SHARPE: "ratio",
  DECAY_MEAN: "ratio",
  MAX_DRAWDOWN: "fraction",
  TRADES: "count",
  WIN_RATE: "fraction",
  FUNDING: "currency",
};

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

const enrichedReads = new WeakMap<object, EnrichedRead>();

/**
 * B6: the Report's supplemental all-time block is TOP-LEVEL `enriched_analysis` (never inside the frozen
 * core). Absent on a report sealed before the enrichment; refused (never drawn) when it is not the
 * contract's. Read once per response.
 */
export function enrichedOfReport(report: ReportDetail | null | undefined): EnrichedRead {
  if (report === null || report === undefined) return { kind: "absent" };
  const known = enrichedReads.get(report);
  if (known !== undefined) return known;
  const read = readEnrichedAnalysis((report as { enriched_analysis?: unknown }).enriched_analysis);
  enrichedReads.set(report, read);
  return read;
}

export const reportApi = {
  /** `researchReportDetailGetV1` */
  detail: (runId: string, options: { workspaceId?: string; etag?: string | null; signal?: AbortSignal } = {}) =>
    call<ReportDetail>(`${runPath(runId)}${query(options.workspaceId)}`, {
      etag: options.etag,
      signal: options.signal,
    }).then((answer) => {
      if (answer !== NOT_MODIFIED && answer.run_id === runId) {
        rememberRunLabel(answer.run_id, answer.display_label);
      }
      return answer;
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
  ARCHIVE: "Archive",
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
  SEARCH_TRACE: "search_trace",
  CANDIDATES: "candidates",
  OBSERVATIONS: "observations",
};

/** CG-P18-05: a stage check result, as words. */
export const STAGE_CHECK_WORDS: Record<StageCheck["result"], string> = {
  PASS: "pass",
  CAVEAT: "caveat",
  FAIL: "fail",
  NOT_PUBLISHED: "not published",
  NOT_APPLICABLE: "not applicable",
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
    /* CG-P18-10: the read never answers 409 — an unsealed run is a 404.
       X3 2026-09-26 (VD-P23-03, F-04): a 404 says exactly what a 403 says. */
    404: REPLAY_REFUSAL_COPY[404],
    503: "The report is unavailable right now. Nothing on this screen was changed.",
    other: "The report could not be read.",
  },
  export: {
    network: "The export request did not reach the server.",
    400: "This export request is not valid. Nothing was queued.",
    401: "Your session has ended. Sign in again to export this report.",
    403: REPLAY_REFUSAL_COPY[403],
    404: REPLAY_REFUSAL_COPY[404],
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
  /* RF01-F3 / VD-P23-02: an expired session goes to the shell's Frame 01D. */
  if (status === 401) reportSessionExpired();
  /* F-04 (X3 2026-09-26): 403 and 404 are one state on every Research screen. */
  const denied = status === 401 || status === 403 || status === 404;
  /* A 409 is declared only on the export lane (CG-P18-10); on the read it is an undeclared answer. */
  const conflict = status === 409 && lane === "export";
  const known = status === 400 || status === 401 || status === 403 || status === 404 || conflict || status === 503;
  return {
    code: error.code,
    message: known ? (copy as Record<number, string>)[status]! : copy.other,
    status,
    requestId: error.requestId,
    state: denied ? "denied" : conflict ? "stale" : status >= 500 ? "unavailable" : "terminal",
    mayRetry: status >= 500,
    terminal: denied || status === 400,
  };
}

/* -------------------------------------------------------------------------
 * Screen state from a typed answer
 * ---------------------------------------------------------------------- */

/** The facts the report names as absent, for the screen's own partial notice. */
export function reportAbsences(report: ReportDetail): string[] {
  /* A failed run's sheet states its failure in the headline; nothing is "missing" from it. */
  if (coreFailed(report.frozen_core)) return [];
  const core = report.frozen_core as FrozenCore;
  const absent: string[] = [];
  if (core.equity.state !== "AVAILABLE") absent.push("equity series");
  const v2 = coreV2(core);
  if (v2 && v2.equity_is.state !== "AVAILABLE") absent.push("IS equity segment");
  if (core.folds.state !== "AVAILABLE") absent.push("per-fold rows");
  /* E3 (audit 9.4): name how many are missing, not the whole category. */
  const count = (missing: number, of: number, what: string) => {
    if (missing > 0) absent.push(missing === of ? `all ${of} ${what}` : `${missing} of ${of} ${what}`);
  };
  count(core.headline.filter((cell) => cell.value === null).length, core.headline.length, "headline values");
  count(core.artifacts.filter((artifact) => artifact.state !== "SEALED").length, core.artifacts.length, "artifact digests");
  count(core.passport.filter((fact) => fact.state !== "AVAILABLE").length, core.passport.length, "passport facts");
  return absent;
}

export function reportState(report: ReportDetail): ResearchState {
  const absent = reportAbsences(report);
  if (absent.length > 0) {
    return {
      state: "partial",
      reason: `Partial — not published: ${absent.join(" · ")}`,
      mayRetry: false,
      retainsContent: true,
    };
  }
  return { state: "available", reason: "", mayRetry: false, retainsContent: true };
}
