/**
 * P18 consumer tests — Screen 09 Run Report (S09-U01…).
 *
 * The claims that carry this phase:
 *
 *  - **Every value is the server's string.** Nothing on the sheet formats,
 *    rounds or invents a number; a null headline is withheld with its reason.
 *  - **Every hi-fi block keeps its place**, in order, and names the reason code
 *    the report published when it has nothing to show.
 *  - **The report is read once.** A remount revalidates with `If-None-Match`
 *    and a `304` keeps the copy in hand; refusals never confirm the run.
 *  - **Export is bounded.** One POST per click, polling only while a job is
 *    pending and the page is visible; the download link is followed, never
 *    fetched. Printing sends nothing.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NOPRINT_NOTE, REPORT_PANELS, SERIES_UNAVAILABLE } from "./ReportDetail";
import { PRINT_SHEET_ATTRIBUTE, ReportRoute } from "./ReportRoute";
import { REPORT_REFUSAL_COPY, exportDownloadHref, toReportRefusal, type ExportJob, type ReportDetail } from "./reportClient";
import { equitySvg } from "./reportEquity";
import { forgetHeldReports } from "./useReport";
import { EXPORT_POLL_MS } from "./useReportExport";
import { REPLAY_REFUSAL_COPY } from "./replayClient";
import { PortalApiError } from "../lib/api";

let hidden = false;
Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  forgetHeldReports();
  hidden = false;
});

/* ---------------------------------------------------------------- fixtures */

/*
 * Shape, keys, labels and reason codes from
 * `apps/control-api/src/research/report.service.ts` and the values of
 * `test/research-report.service.spec.ts` (no canonical frontend fixture is
 * published for P18).
 */
const RUN = "run_p18";
const REV = `p18r1_${"7".repeat(64)}`;
const SEALED = 1_727_000_002_000;
const T0 = 1_727_000_000_000;
const AVAILABLE = { state: "AVAILABLE", reason_code: null } as const;
const REVS = {
  evidence_revision: `p13r1_${"a".repeat(64)}`,
  split_revision: `p14r1_${"1".repeat(64)}`,
  search_revision: `p15r1_${"2".repeat(64)}`,
  freeze_revision: `p16r1_${"3".repeat(64)}`,
  replay_revision: `p17r1_${"4".repeat(64)}`,
};
const np = (reason: string) => ({ state: "NOT_PUBLISHED", reason_code: reason }) as const;
const absent = (reason: string) => ({ state: "NOT_PUBLISHED", text: null, reason_code: reason, availability: np(reason) }) as const;
const fact = (text: string) => ({ state: "AVAILABLE", text, reason_code: null, availability: AVAILABLE }) as const;
const metric = (key: string, label: string, unit: string, value: string | null, availability: { state: string; reason_code: string | null } = AVAILABLE) => ({
  key,
  label,
  unit,
  scope: value === null ? "NOT_PUBLISHED" : "OOS",
  origin: value === null ? "NOT_PUBLISHED" : "ENGINE_DIRECT",
  definition_id: `research.metric.v1.${key.toLowerCase()}`,
  value,
  availability,
});

function report(overrides: { core?: Record<string, unknown>; top?: Record<string, unknown> } = {}): ReportDetail {
  const core = {
    schema_version: "research.report-frozen-core.v1",
    report_source: "P13_P17_FIXED_PROFILE",
    source_revisions: REVS,
    source_digests: {
      source_transform_digest: "b".repeat(64),
      requested_spec_digest: "c".repeat(64),
      effective_spec_digest: "d".repeat(64),
      dataset_binding_digest: "e".repeat(64),
      manifest_digest: "f".repeat(64),
    },
    passport: [
      fact("p04.delta-rsi.v1"),
      fact("1.1.1"),
      fact("P08_OPTIONAL_WARMUP_PLUS_IS_OOS_ONLY"),
      absent("P18_SPLIT_PROTOCOL_NOT_PUBLISHED"),
      fact("FIXED_PROFILE_NO_SEARCH"),
      absent("P18_INTEGRITY_NOT_PUBLISHED"),
    ],
    identity: [
      ["run_id", "Run ID", RUN],
      ["source_adapter", "Source adapter", "p04.delta-rsi.v1"],
      ["engine_version", "Engine version", "1.1.1"],
      ["input_scope", "Input scope", "P08_OPTIONAL_WARMUP_PLUS_IS_OOS_ONLY"],
      ["dataset_id", "Dataset", "delta-rsi"],
      ["symbol", "Symbol", "BTCUSDT"],
      ["timeframe", "Timeframe", "1h"],
      ["evidence_revision", "Evidence revision", REVS.evidence_revision],
      ["split_revision", "Split revision", REVS.split_revision],
      ["search_revision", "Search revision", REVS.search_revision],
      ["freeze_revision", "Freeze revision", REVS.freeze_revision],
      ["replay_revision", "Replay revision", REVS.replay_revision],
    ].map(([key, label, value]) => ({ key, label, value, availability: AVAILABLE })),
    metrics: [
      metric("INITIAL_EQUITY", "Initial equity", "CURRENCY", "100"),
      metric("FINAL_EQUITY", "Final equity", "CURRENCY", "110"),
      metric("NET_RETURN_FRACTION", "Net return", "FRACTION", "0.1"),
      metric("MAX_DRAWDOWN_FRACTION", "Max drawdown", "FRACTION", "-0.02"),
      metric("TRADE_COUNT", "Trades", "COUNT", "3"),
      metric("BARS_PROCESSED", "Bars processed", "COUNT", "1000"),
      metric("BENCHMARK_RETURN_FRACTION", "Benchmark return", "FRACTION", null, np("P18_METRIC_NOT_PUBLISHED")),
      metric("FUNDING_TOTAL", "Funding", "CURRENCY", null, np("P18_METRIC_NOT_PUBLISHED")),
    ],
    headline: [
      { key: "OOS_SHARPE", label: "OOS Sharpe", value: null, availability: np("P04_SOURCE_DID_NOT_PUBLISH_OOS_SHARPE") },
      { key: "DECAY_MEAN", label: "Decay mean", value: null, availability: np("P04_SOURCE_DID_NOT_PUBLISH_DECAY_MEAN") },
      { key: "MAX_DRAWDOWN", label: "Max drawdown", value: "-0.02", availability: AVAILABLE },
      { key: "TRADES", label: "Trades", value: "3", availability: AVAILABLE },
      { key: "WIN_RATE", label: "Win rate", value: null, availability: np("P04_SOURCE_DID_NOT_PUBLISH_WIN_RATE") },
      { key: "FUNDING", label: "Funding", value: null, availability: np("P18_METRIC_NOT_PUBLISHED") },
    ],
    headline_footnote:
      "All values retain the scope and availability stated by the sealed Evidence Hub; missing optimizer and execution facts are not inferred.",
    equity: {
      state: "AVAILABLE",
      source_observation_count: 3,
      emitted_point_count: 3,
      sampling: "FULL",
      points: [
        { at_utc_ms: T0, equity: "100", drawdown_fraction: "0" },
        { at_utc_ms: T0 + 60_000, equity: "105", drawdown_fraction: "-0.01" },
        { at_utc_ms: T0 + 120_000, equity: "110", drawdown_fraction: "-0.02" },
      ],
      availability: AVAILABLE,
    },
    folds: {
      state: "NOT_PUBLISHED",
      reason_code: "P04_SOURCE_DID_NOT_PUBLISH_PER_FOLD_REPORT_ROWS",
      rows: [],
      availability: np("P04_SOURCE_DID_NOT_PUBLISH_PER_FOLD_REPORT_ROWS"),
    },
    stages: (["S1", "S2", "S3", "S4", "S5"] as const).map((key) => ({
      key,
      state: "DONE",
      started_at_utc_ms: T0,
      completed_at_utc_ms: T0 + 1_000,
    })),
    artifacts: [
      ["RUN_SPEC", "P18_REQUESTED_SPEC_BYTES_NOT_PUBLISHED"],
      ["SELECTION_TRACE", "P04_FIXED_PROFILE_HAS_NO_SELECTION_TRACE"],
      ["FOLD_PLAN", "P04_SOURCE_DID_NOT_PUBLISH_FOLD_PLAN"],
      ["FILL_LEDGER", "P04_SOURCE_DID_NOT_PUBLISH_AUDITED_FILLS"],
      ["METRICS_SUMMARY", "P13_EVIDENCE_PROJECTION_IS_NOT_ARTIFACT_FILE"],
      ["CLAIM", "P13_CLAIM_IS_NOT_AN_ARTIFACT_DIGEST"],
      ["BUNDLE", "P18_MANIFEST_BYTES_NOT_PUBLISHED"],
    ].map(([key, reason]) => ({ key, digest: null, state: "NOT_PUBLISHED", availability: np(reason!) })),
    warnings: [
      { definition_id: "research.warning.v1.fixed-profile", state: "ACTIVE", reason_code: "P04_FIXED_PROFILE", copy: "Fixed profile." },
    ],
    promotion: {
      state: "NOT_PUBLISHED",
      line: "Promotion/governance approval is not published by the current P04 source.",
      availability: np("P04_SOURCE_DID_NOT_PUBLISH_PROMOTION_APPROVAL"),
    },
    provenance: {
      line: `P18 report sealed from ${REVS.evidence_revision}, ${REVS.split_revision}, ${REVS.search_revision}, ${REVS.freeze_revision} and ${REVS.replay_revision}; replay remains retrospective equity only (AVAILABLE).`,
      metric_registry_version: "research.metric-registry.v2",
      data_signature: "e".repeat(64),
      read_model_revision: "research.report-read-model.v1",
      verdict_rule_revision: "research.report-verdict-rule.v1",
    },
    source_absences: {
      audited_fills: absent("P04_SOURCE_DID_NOT_PUBLISH_AUDITED_FILLS"),
      per_fold_rows: absent("P04_SOURCE_DID_NOT_PUBLISH_PER_FOLD_REPORT_ROWS"),
      approval_annotation: absent("P18_APPROVAL_ANNOTATION_NOT_PUBLISHED"),
      replay_execution_state: absent("P04_SOURCE_DID_NOT_PUBLISH_EXECUTION_STATE_SNAPSHOTS"),
    },
    ...overrides.core,
  };
  return {
    schema_version: "research.report-detail.v1",
    read_authority: "PORTAL_PERSISTED_RESEARCH",
    run_id: RUN,
    report_revision: REV,
    etag: `"${REV}"`,
    sealed_at_utc_ms: SEALED,
    presentation_revision: "research.report-presentation.v1",
    frozen_core: core,
    approval_annotation: {
      state: "NOT_PUBLISHED",
      text: null,
      source_updated_at_utc_ms: null,
      availability: np("P18_APPROVAL_ANNOTATION_NOT_PUBLISHED"),
    },
    exports: {
      formats: ["REPORT_JSON", "REPORT_CSV"],
      maximum_bytes: 524288,
      unavailable_formats: [
        { format: "PARQUET", reason_code: "P18_SOURCE_DID_NOT_PUBLISH_REPORT_ROWSET_FOR_PARQUET" },
        { format: "ARCHIVE", reason_code: "P18_SOURCE_ARTIFACT_ARCHIVE_NOT_EXPOSED_TO_REPORT" },
      ],
    },
    ...overrides.top,
  } as unknown as ReportDetail;
}

const JOB_ID = { REPORT_JSON: "rpex_01J8Z3QK4R5T6V7W8X9Y0ABCDE", REPORT_CSV: "rpex_01J8Z3QK4R5T6V7W8X9Y0ABCDF" } as const;
const DOWNLOAD = (format: keyof typeof JOB_ID) => `/api/v1/quantbt/runs/${RUN}/report/exports/${JOB_ID[format]}/download`;

function job(format: keyof typeof JOB_ID, state: ExportJob["state"], over: Partial<ExportJob> = {}): ExportJob {
  const ready = state === "READY";
  const ext = format === "REPORT_JSON" ? "json" : "csv";
  return {
    schema_version: "research.report-export.v1",
    job_id: JOB_ID[format],
    run_id: RUN,
    report_revision: REV,
    format,
    state,
    requested_at_utc_ms: SEALED + 10_000,
    completed_at_utc_ms: ready || state === "FAILED" ? SEALED + 20_000 : null,
    size_bytes: ready ? 2048 : null,
    sha256: ready ? "9".repeat(64) : null,
    content_type: ready ? (ext === "json" ? "application/json" : "text/csv") : null,
    filename: ready ? `quantbt-${RUN}-${REV}.${ext}` : null,
    download_href: ready ? DOWNLOAD(format) : null,
    failure_code: null,
    ...over,
  };
}

/* ------------------------------------------------------------------ server */

type Answer = { status: number; body?: unknown };
interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

function res({ status, body }: Answer): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

const problem = (status: number, code: string): Answer => ({
  status,
  body: { error: { code, message: "server prose: run owned by alice@example" }, request_id: "req_p18" },
});

/**
 * A scripted server: the detail read, the create, and per-job status reads
 * answer from their own queues (the last answer repeats).
 */
function server(script: { detail?: Answer[]; create?: Partial<Record<keyof typeof JOB_ID, Answer[]>>; status?: Partial<Record<keyof typeof JOB_ID, Answer[]>> } = {}) {
  const calls: Call[] = [];
  const take = (queue: Answer[] | undefined, fallback: Answer) => (queue && queue.length > 1 ? queue.shift()! : queue?.[0] ?? fallback);
  const pending: { resolve: () => void }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ url, method, headers: (init?.headers ?? {}) as Record<string, string>, body: (init?.body as string) ?? null });
    if (url.includes("/download")) throw new Error("the download must never be fetched");
    if (method === "POST") {
      const format = (JSON.parse(String(init?.body)) as { format: keyof typeof JOB_ID }).format;
      return res(take(script.create?.[format], { status: 201, body: job(format, "QUEUED") }));
    }
    const exportMatch = /\/exports\/(rpex_[0-9A-Z]+)/.exec(url);
    if (exportMatch) {
      const format = (Object.keys(JOB_ID) as (keyof typeof JOB_ID)[]).find((f) => JOB_ID[f] === exportMatch[1])!;
      return res(take(script.status?.[format], { status: 200, body: job(format, "RUNNING") }));
    }
    return res(take(script.detail, { status: 200, body: report() }));
  });
  return {
    calls,
    pending,
    detailCalls: () => calls.filter((c) => /\/report(\?|$)/.test(c.url)),
    posts: () => calls.filter((c) => c.method === "POST"),
    statusCalls: () => calls.filter((c) => c.method === "GET" && c.url.includes("/exports/")),
  };
}

function renderRoute(runId = RUN) {
  return render(
    <MemoryRouter initialEntries={[`/research/quantbt/runs/${runId}/report`]}>
      <Routes>
        <Route path="/research/quantbt/runs/:runId/report" element={<ReportRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function flush(ms = 0) {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(i === 0 ? ms : 0);
    });
  }
}

const panel = (name: string) => document.querySelector(`[data-panel="${name}"]`) as HTMLElement;

/* ------------------------------------------------------------------ screen */

describe("S09 Run Report — the sheet", () => {
  it("S09-U01 shows the loading frame, the no-print bar and the footer before the server answers", () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(() => {}));
    renderRoute();
    expect(document.querySelector('[data-screen="run-report"]')?.getAttribute("data-report-state")).toBe("loading");
    expect(panel("noprint-bar")).toBeTruthy();
    expect(panel("header")).toBeTruthy();
    expect(panel("footer")).toBeTruthy();
    expect(panel("passport")).toBeNull();
    expect(screen.getByRole("status", { name: "Loading" })).toBeTruthy();
  });

  it("S09-U02 renders every block in the sheet's order", async () => {
    server();
    renderRoute();
    await screen.findByText("claim passport — sealed source facts, quoted verbatim");
    const order = [...document.querySelectorAll("[data-panel]")].map((el) => el.getAttribute("data-panel"));
    expect(order).toEqual([...REPORT_PANELS]);
  });

  it("S09-U03 prints exact decimals and full digests as the server sent them", async () => {
    server();
    renderRoute();
    await screen.findByText("claim passport — sealed source facts, quoted verbatim");
    expect(panel("headline").querySelector('[data-headline="MAX_DRAWDOWN"] [data-headline-value]')?.textContent).toBe("-0.02");
    expect(panel("headline").querySelector('[data-headline="TRADES"] [data-headline-value]')?.textContent).toBe("3");
    expect(panel("metrics").querySelector('[data-metric="NET_RETURN_FRACTION"]')?.textContent).toContain("0.1");
    expect(panel("provenance").querySelector("[data-data-signature]")?.textContent).toBe("e".repeat(64));
    expect(panel("provenance").querySelector('[data-source-digest="manifest_digest"]')?.textContent).toContain("f".repeat(64));
    expect(panel("header").textContent).toContain(REV);
    expect(panel("header").textContent).toContain("2024-09-22 10:13Z");
  });

  it("S09-U04 withholds a null headline with its reason code, never a zero", async () => {
    server();
    renderRoute();
    await screen.findByText("claim passport — sealed source facts, quoted verbatim");
    for (const [key, reason] of [
      ["OOS_SHARPE", "P04_SOURCE_DID_NOT_PUBLISH_OOS_SHARPE"],
      ["DECAY_MEAN", "P04_SOURCE_DID_NOT_PUBLISH_DECAY_MEAN"],
      ["WIN_RATE", "P04_SOURCE_DID_NOT_PUBLISH_WIN_RATE"],
      ["FUNDING", "P18_METRIC_NOT_PUBLISHED"],
    ]) {
      const cell = panel("headline").querySelector(`[data-headline="${key}"]`)!;
      expect(cell.querySelector("[data-headline-withheld]")).toBeTruthy();
      expect(cell.querySelector("[data-headline-value]")).toBeNull();
      expect(cell.textContent).toContain(reason);
      expect(cell.textContent).toContain("not published");
      expect(cell.textContent).not.toMatch(/(^|[^0-9A-Z_])(0|N\/A|—|-)($|[^0-9A-Z_])/);
    }
    expect(panel("headline").querySelector("[data-headline-footnote]")?.textContent).toContain("are not inferred");
  });

  it("S09-U05 names each unpublished passport fact, artifact and promotion with its reason", async () => {
    server();
    renderRoute();
    await screen.findByText("claim passport — sealed source facts, quoted verbatim");
    const facts = panel("passport").querySelectorAll("[data-passport-fact]");
    expect(facts).toHaveLength(6);
    expect(facts[0]!.textContent).toContain("p04.delta-rsi.v1");
    expect(facts[3]!.textContent).toContain("P18_SPLIT_PROTOCOL_NOT_PUBLISHED");
    expect(facts[5]!.textContent).toContain("P18_INTEGRITY_NOT_PUBLISHED");
    expect(panel("artifacts").querySelectorAll('[data-artifact-state="NOT_PUBLISHED"]')).toHaveLength(7);
    expect(panel("artifacts").querySelector('[data-artifact="SELECTION_TRACE"]')?.textContent).toContain(
      "P04_FIXED_PROFILE_HAS_NO_SELECTION_TRACE",
    );
    expect(panel("promotion").textContent).toContain("P04_SOURCE_DID_NOT_PUBLISH_PROMOTION_APPROVAL");
    expect(panel("annotation").textContent).toContain("P18_APPROVAL_ANNOTATION_NOT_PUBLISHED");
    expect(panel("provenance").querySelector('[data-source-absence="replay_execution_state"]')?.textContent).toContain(
      "P04_SOURCE_DID_NOT_PUBLISH_EXECUTION_STATE_SNAPSHOTS",
    );
    expect(panel("identity").querySelector('[data-identity="symbol"]')?.textContent).toBe("SymbolBTCUSDT");
    expect(panel("stages").querySelectorAll('[data-stage-state="DONE"]')).toHaveLength(5);
    expect(panel("stages").textContent).not.toContain("PASS");
  });

  it("S09-U06 draws the sealed equity as a static SVG, without a chart library", async () => {
    server();
    renderRoute();
    await screen.findByText("claim passport — sealed source facts, quoted verbatim");
    const svg = panel("equity").querySelector("[data-equity-svg]")!;
    expect(svg.getAttribute("aria-label")).toContain("3 sealed points");
    expect(panel("equity").textContent).toContain("emitted 3 of 3 source observations · sampling full");
    expect(panel("equity").textContent).toContain("P04_SOURCE_DID_NOT_PUBLISH_PER_FOLD_REPORT_ROWS");
    expect(document.querySelector("canvas")).toBeNull();
  });

  it("S09-U07 partial: an unpublished series and fold table keep their frame and reason", async () => {
    server({
      detail: [
        {
          status: 200,
          body: report({
            core: {
              equity: {
                state: "NOT_PUBLISHED",
                source_observation_count: null,
                emitted_point_count: 0,
                sampling: null,
                points: [],
                availability: np("P13_EQUITY_SERIES_NOT_AVAILABLE"),
              },
            },
          }),
        },
      ],
    });
    renderRoute();
    await screen.findByText(SERIES_UNAVAILABLE);
    expect(document.querySelector('[data-screen="run-report"]')?.getAttribute("data-report-state")).toBe("partial");
    expect(panel("equity").querySelector("[data-equity-svg]")).toBeNull();
    expect(panel("equity").textContent).toContain("P13_EQUITY_SERIES_NOT_AVAILABLE");
    expect(panel("folds").querySelector("[data-folds-absent]")?.textContent).toContain(
      "P04_SOURCE_DID_NOT_PUBLISH_PER_FOLD_REPORT_ROWS",
    );
    expect(document.querySelector('[data-report-notice="partial"]')?.textContent).toContain("equity series");
  });

  it("S09-U08 printing sends no request and the chrome is marked no-print", async () => {
    const api = server();
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    renderRoute();
    await screen.findByText("claim passport — sealed source facts, quoted verbatim");
    const before = api.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Print" }));
    expect(print).toHaveBeenCalledTimes(1);
    expect(api.calls.length).toBe(before);
    expect(panel("noprint-bar").classList.contains("no-print")).toBe(true);
    expect(panel("exports").classList.contains("no-print")).toBe(true);
    expect(screen.getByText(NOPRINT_NOTE)).toBeTruthy();
  });

  it("S09-U09 the route marks the document for print only while mounted", async () => {
    server();
    const { unmount } = renderRoute();
    expect(document.documentElement.hasAttribute(PRINT_SHEET_ATTRIBUTE)).toBe(true);
    await screen.findByText("claim passport — sealed source facts, quoted verbatim");
    unmount();
    expect(document.documentElement.hasAttribute(PRINT_SHEET_ATTRIBUTE)).toBe(false);
  });

  it("S09-U10 links back to Stage 5 of the Hub and keeps Screen 11 refused", async () => {
    server();
    renderRoute();
    await screen.findByText("claim passport — sealed source facts, quoted verbatim");
    const back = screen.getByRole("link", { name: "← Hub · Stage 5 Claim" });
    expect(back.getAttribute("href")).toMatch(new RegExp(`^/research/quantbt/runs/${RUN}/evidence#stage=claim`));
    const release = document.querySelector('[data-action-unrouted="release-candidate"]')!;
    expect(release.tagName).toBe("SPAN");
    expect(release.getAttribute("title")).toContain("no published route");
  });

  it("S09-U11 offers only the published formats; Parquet and archive are disabled with their reason", async () => {
    server();
    renderRoute();
    await screen.findByText("claim passport — sealed source facts, quoted verbatim");
    expect((screen.getByRole("button", { name: "Export JSON" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Export CSV" }) as HTMLButtonElement).disabled).toBe(false);
    const parquet = screen.getByRole("button", { name: "Export Parquet" }) as HTMLButtonElement;
    expect(parquet.disabled).toBe(true);
    expect(parquet.title).toBe("P18_SOURCE_DID_NOT_PUBLISH_REPORT_ROWSET_FOR_PARQUET");
    expect(document.querySelector('[data-export-unavailable="ARCHIVE"]')?.getAttribute("title")).toBe(
      "P18_SOURCE_ARTIFACT_ARCHIVE_NOT_EXPOSED_TO_REPORT",
    );
    expect(panel("exports").textContent).toContain("at most 524288 bytes per file");
  });
});

/* ---------------------------------------------------------------- the read */

describe("S09 Run Report — reading", () => {
  it("S09-U12 reads once on arrival; a remount revalidates with If-None-Match and a 304 keeps the report", async () => {
    const api = server({ detail: [{ status: 200, body: report() }, { status: 304 }] });
    const first = renderRoute();
    await screen.findByText("claim passport — sealed source facts, quoted verbatim");
    expect(api.detailCalls()).toHaveLength(1);
    expect(api.detailCalls()[0]!.headers["If-None-Match"]).toBeUndefined();
    first.unmount();

    renderRoute();
    await screen.findByText("claim passport — sealed source facts, quoted verbatim");
    expect(api.detailCalls()).toHaveLength(2);
    expect(api.detailCalls()[1]!.headers["If-None-Match"]).toBe(`"${REV}"`);
    expect(document.querySelector('[data-screen="run-report"]')?.getAttribute("data-report-revision")).toBe(REV);
    expect(panel("headline").querySelector('[data-headline="TRADES"] [data-headline-value]')?.textContent).toBe("3");
  });

  it("S09-U13 a 304 with no copy in hand is not shown as a report", async () => {
    server({ detail: [{ status: 304 }] });
    renderRoute();
    await screen.findByText("The server said the report is unchanged, but no copy is held here. Read it again.");
    expect(panel("passport")).toBeNull();
    expect(screen.getByRole("button", { name: "read again" })).toBeTruthy();
  });

  it.each([
    [400, "RESEARCH_REPORT_INVALID", "terminal"],
    [401, "RESEARCH_REPORT_FORBIDDEN", "denied"],
    [403, "RESEARCH_REPORT_FORBIDDEN", "denied"],
    [404, "RESEARCH_REPORT_NOT_FOUND", "empty"],
    [503, "RESEARCH_REPORT_UNAVAILABLE", "unavailable"],
  ] as const)("S09-U14 a %i refusal shows fixed copy and confirms nothing about the run", async (status, code, state) => {
    server({ detail: [problem(status, code)] });
    renderRoute();
    const copy = REPORT_REFUSAL_COPY.report[status];
    await screen.findByText(copy);
    expect(document.querySelector('[data-screen="run-report"]')?.getAttribute("data-report-state")).toBe(state);
    expect(document.body.textContent).not.toContain("alice");
    expect(document.body.textContent).not.toContain("server prose");
    expect(copy).not.toContain(RUN);
    expect(copy.toLowerCase()).not.toContain("owner");
    expect(panel("passport")).toBeNull();
    expect(screen.queryByRole("button", { name: "Export JSON" })).toBeNull();
    expect(Boolean(screen.queryByRole("button", { name: "read again" }))).toBe(status === 503);
  });

  it("S09-U15 403 uses the audited F-04 sentence, 409 maps to stale and keeps the job", () => {
    expect(REPORT_REFUSAL_COPY.report[403]).toBe(REPLAY_REFUSAL_COPY[403]);
    expect(REPORT_REFUSAL_COPY.export[403]).toBe(REPLAY_REFUSAL_COPY[403]);
    const conflict = toReportRefusal(new PortalApiError("409", 409, "RESEARCH_REPORT_NOT_READY", "req"), "export");
    expect(conflict).toMatchObject({ state: "stale", mayRetry: false, terminal: false, message: REPORT_REFUSAL_COPY.export[409] });
    expect(toReportRefusal(new TypeError("offline"), "report")).toMatchObject({ state: "failed-retryable", mayRetry: true });
  });

  it("S09-U16 a 503 retry reads again with the held ETag only when asked", async () => {
    const api = server({ detail: [problem(503, "RESEARCH_REPORT_UNAVAILABLE"), { status: 200, body: report() }] });
    renderRoute();
    await screen.findByText(REPORT_REFUSAL_COPY.report[503]);
    expect(api.detailCalls()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "read again" }));
    await screen.findByText("claim passport — sealed source facts, quoted verbatim");
    expect(api.detailCalls()).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ export */

describe("S09 Run Report — export", () => {
  async function ready() {
    vi.useFakeTimers();
    renderRoute();
    await flush();
    expect(panel("passport")).toBeTruthy();
  }

  it("S09-U17 JSON goes queued → running → ready; the link is the server's href and is never fetched", async () => {
    const api = server({
      status: { REPORT_JSON: [{ status: 200, body: job("REPORT_JSON", "RUNNING") }, { status: 200, body: job("REPORT_JSON", "READY") }] },
    });
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Export JSON" }));
    await flush();
    expect(api.posts()).toHaveLength(1);
    expect(api.posts()[0]!.body).toBe(JSON.stringify({ format: "REPORT_JSON" }));
    expect(panel("exports").querySelector('[data-export="REPORT_JSON"]')?.getAttribute("data-export-state")).toBe("QUEUED");
    expect((screen.getByRole("button", { name: "Export JSON" }) as HTMLButtonElement).disabled).toBe(true);

    await flush(EXPORT_POLL_MS);
    expect(api.statusCalls()).toHaveLength(1);
    expect(panel("exports").querySelector('[data-export="REPORT_JSON"]')?.getAttribute("data-export-state")).toBe("RUNNING");

    await flush(EXPORT_POLL_MS);
    expect(api.statusCalls()).toHaveLength(2);
    const link = panel("exports").querySelector("[data-download-href]") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(DOWNLOAD("REPORT_JSON"));
    expect(link.textContent).toBe(`download quantbt-${RUN}-${REV}.json`);
    expect(panel("exports").textContent).toContain("2048 bytes");

    await flush(EXPORT_POLL_MS * 5);
    expect(api.statusCalls()).toHaveLength(2);
    expect(api.calls.some((c) => c.url.includes("/download"))).toBe(false);
  });

  it("S09-U18 CSV that fails shows the failure code and stops polling", async () => {
    const api = server({
      status: { REPORT_CSV: [{ status: 200, body: job("REPORT_CSV", "FAILED", { failure_code: "P18_EXPORT_MAXIMUM_BYTES_EXCEEDED" }) }] },
    });
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    await flush();
    await flush(EXPORT_POLL_MS);
    const row = panel("exports").querySelector('[data-export="REPORT_CSV"]')!;
    expect(row.getAttribute("data-export-state")).toBe("FAILED");
    expect(row.textContent).toContain("P18_EXPORT_MAXIMUM_BYTES_EXCEEDED");
    expect(row.querySelector("[data-download-href]")).toBeNull();
    await flush(EXPORT_POLL_MS * 5);
    expect(api.statusCalls()).toHaveLength(1);
  });

  it("S09-U19 a 409 on create keeps the held job, asks for nothing else and does not loop", async () => {
    const api = server({ create: { REPORT_JSON: [problem(409, "RESEARCH_REPORT_NOT_READY")] } });
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Export JSON" }));
    await flush();
    await flush(EXPORT_POLL_MS * 5);
    expect(api.posts()).toHaveLength(1);
    expect(api.statusCalls()).toHaveLength(0);
    const row = panel("exports").querySelector('[data-export="REPORT_JSON"]')!;
    expect(row.getAttribute("data-export-state")).toBe("NONE");
    expect(row.querySelector('[data-export-refusal="409"]')?.textContent).toBe(REPORT_REFUSAL_COPY.export[409]);
  });

  it("S09-U20 a second click while a job is pending sends nothing", async () => {
    const api = server();
    await ready();
    const button = screen.getByRole("button", { name: "Export JSON" });
    fireEvent.click(button);
    fireEvent.click(button);
    await flush();
    fireEvent.click(button);
    await flush();
    expect(api.posts()).toHaveLength(1);
  });

  it("S09-U21 polling stops on unmount", async () => {
    const api = server();
    const view = renderRouteWithFakeTimers();
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Export JSON" }));
    await flush();
    await flush(EXPORT_POLL_MS);
    expect(api.statusCalls()).toHaveLength(1);
    view.unmount();
    await flush(EXPORT_POLL_MS * 5);
    expect(api.statusCalls()).toHaveLength(1);
  });

  it("S09-U22 polling pauses while the page is hidden and resumes when visible", async () => {
    const api = server();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Export JSON" }));
    await flush();
    hidden = true;
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await flush(EXPORT_POLL_MS * 5);
    expect(api.statusCalls()).toHaveLength(0);
    hidden = false;
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await flush(EXPORT_POLL_MS);
    expect(api.statusCalls()).toHaveLength(1);
  });

  function renderRouteWithFakeTimers() {
    vi.useFakeTimers();
    return renderRoute();
  }
});

/* ------------------------------------------------------------------- pure */

describe("S09 Run Report — pure parts and source rules", () => {
  it("S09-U23 the equity geometry is pure, time-based and drops points that do not parse", () => {
    const geometry = equitySvg(
      [
        { at_utc_ms: T0, equity: "100", drawdown_fraction: "0" },
        { at_utc_ms: T0 + 60_000, equity: "not-a-number", drawdown_fraction: "0" },
        { at_utc_ms: T0 + 120_000, equity: "110", drawdown_fraction: "-0.02" },
      ],
      [{ label: "F1", at_utc_ms: T0 + 60_000 }],
    );
    expect(geometry.drawn).toBe(2);
    expect(geometry.dropped).toBe(1);
    expect(geometry.line.startsWith("M")).toBe(true);
    expect(geometry.boundaries).toEqual([{ label: "F1", x: expect.any(Number) }]);
    const flat = equitySvg([{ at_utc_ms: T0, equity: "100", drawdown_fraction: "0" }]);
    expect(flat.drawn).toBe(1);
    expect(flat.line).not.toContain("NaN");
  });

  it("S09-U24 a download href is followed only when READY and same-origin", () => {
    expect(exportDownloadHref(job("REPORT_JSON", "READY"))).toBe(DOWNLOAD("REPORT_JSON"));
    expect(exportDownloadHref(job("REPORT_JSON", "RUNNING"))).toBeNull();
    expect(exportDownloadHref(job("REPORT_JSON", "READY", { download_href: "https://elsewhere.example/x" }))).toBeNull();
    expect(exportDownloadHref(job("REPORT_JSON", "READY", { download_href: "/" + "/elsewhere.example/x" }))).toBeNull();
    expect(exportDownloadHref(null)).toBeNull();
  });

  it("S09-U25 no S09 file formats a number on the client", () => {
    for (const name of ["ReportDetail.tsx", "ReportRoute.tsx", "reportClient.ts", "reportEquity.ts", "useReport.ts", "useReportExport.ts", "utcMinute.ts"]) {
      const source = readFileSync(join(process.cwd(), "src", "research", name), "utf8");
      expect(source, name).not.toMatch(/toFixed|Intl\.|toLocaleString/);
    }
  });

  it("S09-U26 the route is registered under QuantBT and the S08/Hub actions link to it", () => {
    const module = readFileSync(join(process.cwd(), "src", "features", "quantbt", "QuantBTModule.tsx"), "utf8");
    expect(module).toContain('<Route path="runs/:runId/report" element={<ReportRoute />} />');
    const execute = readFileSync(join(process.cwd(), "src", "research", "ExecuteDetail.tsx"), "utf8");
    expect(execute).toMatch(/to=\{`\/research\/quantbt\/runs\/\$\{run\}\/report`\}\s+className="mono"\s+style=\{\{ color: "var\(--accent\)" \}\}\s+data-next="run-report"/);
    const hub = readFileSync(join(process.cwd(), "src", "research", "EvidenceFlow.tsx"), "utf8");
    expect(hub).toContain('data-action="generate-report"');
    expect(hub).toContain('"release candidate → 11"');
  });
});
