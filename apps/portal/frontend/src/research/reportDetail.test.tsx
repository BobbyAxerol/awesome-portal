/**
 * P18 consumer tests — Screen 09 Run Report (S09-U01…U40).
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

import {
  ANNOTATION_TITLE,
  CHAIN_TITLE,
  EQUITY_LEGEND_IS,
  EQUITY_LEGEND_OOS,
  NOPRINT_NOTE,
  reportEvidenceLink,
  reportEvidenceLinkLabel,
  REPORT_PANELS,
  SERIES_UNAVAILABLE,
} from "./ReportDetail";
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

  it("S09-U27 the footer is the last printed block: warnings print inside the sheet, annotation and exports are screen-only", async () => {
    server({
      detail: [
        {
          status: 200,
          body: report({
            core: {
              warnings: [
                { definition_id: "research.warning.v1.fixed-profile", state: "ACTIVE", reason_code: "P04_FIXED_PROFILE", copy: "Fixed profile." },
                { definition_id: "research.warning.v1.other", state: "NOT_APPLICABLE", reason_code: null, copy: "Not applicable here." },
              ],
            },
          }),
        },
      ],
    });
    renderRoute();
    await screen.findByText("claim passport — sealed source facts, quoted verbatim");
    const sheet = document.querySelector("article.rr-sheet")!;
    const footer = panel("footer");
    expect(sheet.lastElementChild).toBe(footer);
    expect(sheet.contains(panel("warnings"))).toBe(true);
    expect(panel("warnings").closest(".no-print")).toBeNull();
    expect(panel("warnings").querySelectorAll("[data-warning]")).toHaveLength(2);
    expect(panel("warnings").textContent).toContain("P04_FIXED_PROFILE");
    const order = [...document.querySelectorAll("[data-panel]")].map((el) => el.getAttribute("data-panel"));
    expect(order.indexOf("warnings")).toBe(order.indexOf("artifacts") + 1);
    expect(order.indexOf("warnings")).toBeLessThan(order.indexOf("promotion"));
    expect(sheet.contains(panel("annotation"))).toBe(false);
    expect(panel("annotation").getAttribute("aria-label")).toBe(ANNOTATION_TITLE);
    /* Every element after the footer, outside it, is screen-only. */
    const after = [...document.querySelectorAll('[data-screen="run-report"] *')].filter(
      (el) => !footer.contains(el) && Boolean(footer.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING),
    );
    expect(after.length).toBeGreaterThan(0);
    for (const el of after) expect(el.closest(".no-print"), el.outerHTML.slice(0, 80)).not.toBeNull();
  });

  it("S09-U03 prints exact decimals and full digests as the server sent them", async () => {
    server();
    renderRoute();
    await screen.findByText("claim passport — sealed source facts, quoted verbatim");
    /* DQ-08 (W6a): a value is displayed by its unit and keeps the server's exact string beside it. */
    const drawdown = panel("headline").querySelector('[data-headline="MAX_DRAWDOWN"] [data-headline-value]')!;
    expect(drawdown.getAttribute("data-headline-value")).toBe("-0.02");
    expect(drawdown.querySelector("[data-exact]")?.getAttribute("title")).toBe("-0.02");
    expect(drawdown.textContent).toBe("−2.00%");
    expect(panel("headline").querySelector('[data-headline="TRADES"] [data-exact]')?.textContent).toBe("3");
    expect(panel("metrics").querySelector('[data-metric="NET_RETURN_FRACTION"] [data-metric-value]')?.getAttribute("data-metric-value")).toBe("0.1");
    expect(panel("metrics").querySelector('[data-metric="NET_RETURN_FRACTION"]')?.textContent).toContain("+10.00%");
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

  it("S09-U10 links back to Stage 5 of the Hub and forward to Screen 11 (P21)", async () => {
    server();
    renderRoute();
    await screen.findByText("claim passport — sealed source facts, quoted verbatim");
    const back = screen.getByRole("link", { name: "← Hub · Stage 5 Claim" });
    expect(back.getAttribute("href")).toMatch(new RegExp(`^/research/quantbt/runs/${RUN}/evidence#stage=claim`));
    const release = document.querySelector('[data-action="release-candidate"]')!;
    expect(release.tagName).toBe("A");
    expect(release.getAttribute("href")).toBe(`/research/quantbt/runs/${RUN}/release-candidate`);
    const promotion = document.querySelector('[data-action="promotion-release-candidate"]')!;
    expect(promotion.getAttribute("href")).toBe(`/research/quantbt/runs/${RUN}/release-candidate`);
    expect(promotion.closest(".no-print")).not.toBeNull();
    expect(document.querySelector("[data-action-unrouted]")).toBeNull();
  });

  it("S09-U11 offers only the published formats; Parquet and Archive are disabled with their reason", async () => {
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

/* ------------------------------------------------------------ layout rules */

/*
 * jsdom does not lay out, so these assert the rules the probe measured in a
 * real browser (package B, B1/N1/N2): the class a long value carries and the
 * route's scoped stylesheet text.
 */
describe("S09 Run Report — layout rules", () => {
  async function sheetCss() {
    server();
    renderRoute();
    await screen.findByText("claim passport — sealed source facts, quoted verbatim");
    return document.querySelector('[data-screen="run-report"] > style')!.textContent ?? "";
  }

  it("S09-U28 long sealed identifiers wrap in full and no block clips them", async () => {
    const css = await sheetCss();
    /* E3 (audit 9.2): wrap only when a token overflows — never split a word that fits. */
    expect(css).toContain(".rr-long { overflow-wrap: anywhere; word-break: normal; min-width: 0; }");
    expect(css).not.toContain("break-all");
    expect(css).toMatch(/\.rr-block \{[^}]*\}/);
    expect(/\.rr-block \{([^}]*)\}/.exec(css)![1]).not.toMatch(/overflow\s*:\s*(hidden|clip)/);
    /* The one clipped box is the off-screen screen-reader copy (.rr-sr, S09-U32). */
    expect(css.replace(/\.rr-sr \{[^}]*\}/, "")).not.toMatch(/overflow\s*:\s*hidden/);
    const long = [
      "[data-provenance-line]",
      "[data-meta]",
      "[data-run-chip]",
      "[data-data-signature]",
      ...Object.keys(REVS).map((key) => `[data-source-revision="${key}"] dd`),
      '[data-source-digest="manifest_digest"] dd',
      '[data-artifact="RUN_SPEC"] [data-artifact-digest]',
      '[data-identity="evidence_revision"] dd',
      '[data-passport-fact="1"]',
    ];
    for (const selector of long) {
      const el = document.querySelector(selector);
      expect(el, selector).not.toBeNull();
      expect(el!.classList.contains("rr-long"), selector).toBe(true);
    }
    /* Not shortened: the full 70-character revisions are in the text. */
    for (const revision of Object.values(REVS)) expect(panel("provenance").querySelector("[data-provenance-line]")!.textContent).toContain(revision);
  });

  it("S09-U29 the route owns the print page box: @page margin 0.55in inside the print rules", async () => {
    const css = await sheetCss();
    const print = css.slice(css.indexOf("@media print {"));
    expect(print).toContain("@page { margin: 0.55in; }");
  });

  it("S09-U30 the header keeps the certification box beside a shrinkable text column", async () => {
    const css = await sheetCss();
    const text = panel("header").querySelector("[data-head-text]")!;
    const cert = panel("header").querySelector("[data-cert-box]")!;
    expect(text.classList.contains("rr-head-text")).toBe(true);
    expect(cert.classList.contains("rr-cert")).toBe(true);
    expect(panel("header").lastElementChild).toBe(cert);
    expect(css).toContain(".rr-head-text { flex: 1 1 0; min-width: 0; }");
    expect(css).toMatch(/\.rr-cert \{ flex: none;/);
    expect(/\.rr-head \{([^}]*)\}/.exec(css)![1]).toContain("flex-wrap: nowrap");
    /* Narrow screens may stack; print restores the side-by-side header. */
    expect(css.slice(css.indexOf("@media (max-width: 700px)"), css.indexOf("@media print {"))).toContain(".rr-head { flex-wrap: wrap; }");
    expect(css.slice(css.indexOf("@media print {"))).toContain(".rr-head { flex-wrap: nowrap; }");
  });

  it("S09-U31 export format labels are written consistently", async () => {
    await sheetCss();
    for (const name of ["Export JSON", "Export CSV", "Export Parquet", "Export Archive"]) {
      expect(screen.getByRole("button", { name }), name).toBeTruthy();
    }
    expect(panel("exports").querySelector('[data-export-unavailable-reason="ARCHIVE"]')?.textContent).toContain("Archive — not available");
    expect(panel("exports").querySelector('[data-export="REPORT_JSON"] [data-export-line]')?.classList.contains("rr-long")).toBe(true);
  });
});

/* ------------------------------------------------------------ audit fixes */

describe("S09 Run Report — audit fixes (A1/A2)", () => {
  async function loaded(detail?: ReportDetail) {
    server(detail ? { detail: [{ status: 200, body: detail }] } : {});
    renderRoute();
    await screen.findByText("claim passport — sealed source facts, quoted verbatim");
    return document.querySelector('[data-screen="run-report"] > style')!.textContent ?? "";
  }

  it("S09-U32 the screen-reader equity table sits in a clipped box and never prints", async () => {
    const css = await loaded();
    const box = panel("equity").querySelector("[data-sr-equity-table]")!;
    expect(box.tagName).toBe("DIV");
    expect(box.classList.contains("rr-sr")).toBe(true);
    const table = box.querySelector("table")!;
    expect(table.className).toBe("");
    expect(table.querySelectorAll("tbody tr")).toHaveLength(3);
    const rule = /\.rr-sr \{([^}]*)\}/.exec(css)![1]!;
    for (const part of ["position: absolute", "width: 1px", "height: 1px", "overflow: hidden", "clip: rect(0, 0, 0, 0)"]) {
      expect(rule, part).toContain(part);
    }
    expect(css.slice(css.indexOf("@media print {"))).toContain(".rr-page .rr-sr { display: none !important; }");
  });

  it("S09-U33 table cells keep words whole; only sealed identifiers break anywhere", async () => {
    const css = await loaded();
    const td = /\.rr-table td \{([^}]*)\}/.exec(css)![1]!;
    expect(td).toContain("word-break: normal");
    expect(td).toContain("overflow-wrap: break-word");
    expect(td).not.toContain("break-all");
    expect(td).not.toContain("anywhere");
    expect(css).toContain(".rr-table td.rr-long { overflow-wrap: anywhere; }");
    /* Header cells too: at 660 "Initial equity" and "SCOPE" split before this rule (hi-fi pass). */
    const th = /\.rr-table th \{([^}]*)\}/.exec(css)![1]!;
    expect(th).toContain("word-break: normal; overflow-wrap: break-word");
    /* Artifacts are a hi-fi grid (S09-U39): only the digest slot breaks anywhere. */
    const row = panel("artifacts").querySelector('[data-artifact="RUN_SPEC"]')!;
    expect(row.querySelector("[data-artifact-digest]")!.classList.contains("rr-long")).toBe(true);
    expect(row.querySelector(".k")!.classList.contains("rr-long")).toBe(false);
    for (const cell of panel("stages").querySelectorAll("td")) expect(cell.classList.contains("rr-long")).toBe(false);
  });

  it("S09-U34 the screen adds no h1: the module header keeps the page's only one", async () => {
    await loaded();
    const root = document.querySelector('[data-screen="run-report"]')!;
    expect(root.querySelectorAll("h1")).toHaveLength(0);
    const title = root.querySelector("[data-report-title]")!;
    expect(title.tagName).toBe("H2");
    expect(title.textContent).toBe("QuantBT Run Report");
  });

  it("S09-U35 the fold caption reads the verdict rule from provenance", async () => {
    const detail = report();
    (detail.frozen_core.provenance as { verdict_rule_revision: string }).verdict_rule_revision = "research.report-verdict-rule.v1";
    await loaded(detail);
    expect(panel("folds").querySelector("[data-verdict-rule]")!.textContent).toContain("verdict rule research.report-verdict-rule.v1.");
    const source = readFileSync(join(process.cwd(), "src", "research", "ReportDetail.tsx"), "utf8");
    expect(source).not.toContain('"research.report-verdict-rule.v1"');
    expect(source).toContain("verdictRule={core.provenance.verdict_rule_revision}");
  });
});

/* ------------------------------------------------------- hi-fi geometry */

describe("S09 Run Report — hi-fi sheet geometry", () => {
  async function loaded(detail?: ReportDetail) {
    server(detail ? { detail: [{ status: 200, body: detail }] } : {});
    renderRoute();
    await screen.findByText("claim passport — sealed source facts, quoted verbatim");
    return document.querySelector('[data-screen="run-report"] > style')!.textContent ?? "";
  }
  const rule = (css: string, selector: string) => {
    /* The top-level rule for exactly this selector (not a grouped or media copy). */
    const at = css.indexOf(`\n${selector} {`);
    expect(at, selector).toBeGreaterThanOrEqual(0);
    return css.slice(at, css.indexOf("}", at));
  };
  const narrow = (css: string) => css.slice(css.indexOf("@media (max-width: 700px)"), css.indexOf("@media print {"));
  const folded = () => {
    const detail = report();
    (detail.frozen_core as { folds: unknown }).folds = {
      state: "AVAILABLE",
      reason_code: null,
      availability: AVAILABLE,
      rows: [
        { fold_id: "F1", start_utc_ms: T0, end_exclusive_utc_ms: T0 + 60_000, verdict: "PASS" },
        { fold_id: "F2", start_utc_ms: T0 + 60_000, end_exclusive_utc_ms: T0 + 120_000, verdict: "WARN" },
      ],
    };
    return detail;
  };

  it("S09-U36 the passport lays its facts side by side, label over value", async () => {
    const css = await loaded();
    const passport = panel("passport");
    expect(passport.querySelector(":scope > h2.t")?.textContent).toBe("claim passport — sealed source facts, quoted verbatim");
    const row = passport.querySelector(".facts")!;
    expect(row.querySelectorAll(":scope > [data-passport-fact]")).toHaveLength(6);
    const first = row.querySelector('[data-passport-fact="1"]')!;
    expect([...first.children].map((el) => el.className)).toEqual(["k", "v"]);
    expect(first.querySelector(".k")?.textContent).toBe("fact 1");
    expect(first.querySelector(".v")?.textContent).toBe("p04.delta-rsi.v1");
    expect(css).toContain(".rr-passport .facts { display: flex; flex-wrap: wrap; gap: 8px 26px; padding: 9px 12px; }");
    expect(rule(css, ".rr-passport .fact .k")).toContain("font-size: 8.5px; text-transform: uppercase");
    expect(rule(css, ".rr-passport .fact .v")).toContain("font-size: 10.5px");
    expect(passport.classList.contains("rr-block")).toBe(true);
  });

  it("S09-U37 identity and the six headline tiles share one row; the footnote closes the tiles", async () => {
    const css = await loaded();
    const row = panel("identity").parentElement!;
    expect(row.classList.contains("rr-idrow")).toBe(true);
    expect(row.lastElementChild).toBe(panel("headline"));
    expect(panel("identity").querySelector(".rr-id")).toBeTruthy();
    const cells = panel("headline").querySelectorAll(":scope > .cell");
    expect(cells).toHaveLength(6);
    expect(panel("headline").lastElementChild?.hasAttribute("data-headline-footnote")).toBe(true);
    expect(rule(css, ".rr-idrow")).toContain("display: flex; gap: 10px");
    expect(rule(css, ".rr-idcard")).toContain("flex: 1.15 1 0");
    expect(rule(css, ".rr-id")).toContain("grid-template-columns: auto minmax(0, 1fr); gap: 2px 12px; font-family: var(--font-mono); font-size: 10px");
    expect(rule(css, ".rr-headline .cell")).toContain("flex: 1 1 44%");
    expect(rule(css, ".rr-headline .v")).toContain("font-size: 15px; font-weight: 600");
    expect(rule(css, ".rr-headline .foot")).toContain("flex: 1 1 100%; font-size: 9px");
    expect(narrow(css)).toContain(".rr-idrow, .rr-chainrow, .rr-pp { flex-direction: column; }");
    const print = css.slice(css.indexOf("@media print {"));
    expect(print).toContain(".rr-idrow, .rr-pp { flex-direction: row; }");
    /* X2 · F6: on paper the stage chain and the artifacts stack, and the sheet's tables flow (Letter/A4 re-run). */
    expect(print).toContain(".rr-chainrow { flex-direction: column; }");
    expect(print).toContain(".rr-page table.rr-table { break-inside: auto; }");
    expect(print).toContain(".rr-scroll { overflow: visible; }");
    /* Metrics (not in the hi-fi) stays right after the row. */
    const order = [...document.querySelectorAll("[data-panel]")].map((el) => el.getAttribute("data-panel"));
    expect(order.indexOf("metrics")).toBe(order.indexOf("headline") + 1);
  });

  it("S09-U38 the equity figure formats its axis labels and keeps the server strings in their titles, over a 92px underwater strip", async () => {
    const css = await loaded();
    const figure = panel("equity");
    expect(figure.querySelector("[data-equity-title]")?.textContent).toBe("Equity — stitched OOS");
    expect(figure.querySelector("[data-equity-counts]")?.textContent).toBe("emitted 3 of 3 source observations · sampling full · UTC");
    expect([...figure.querySelectorAll("[data-y-label]")].map((el) => el.textContent)).toEqual(["110.00", "100.00"]);
    expect([...figure.querySelectorAll("[data-y-label]")].map((el) => el.getAttribute("title"))).toEqual(["110", "100"]);
    expect([...figure.querySelectorAll("[data-x-label]")].map((el) => el.textContent)).toEqual(["2024-09-22"]);
    expect(figure.querySelectorAll("line.rr-eq-grid").length).toBeGreaterThan(0);
    expect(figure.querySelector('[data-legend="oos"]')?.textContent).toBe(EQUITY_LEGEND_OOS);
    expect(figure.querySelector('[data-legend="is"]')?.textContent).toBe(EQUITY_LEGEND_IS);
    expect(figure.querySelector("[data-dd-top]")?.textContent).toBe("0.00%");
    expect(figure.querySelector("[data-dd-top]")?.getAttribute("title")).toBe("0");
    expect(figure.querySelector("[data-dd-deepest]")?.textContent).toBe("deepest \u22122.00%");
    expect(figure.querySelector("[data-dd-deepest]")?.getAttribute("title")).toBe("-0.02 (fraction)");
    expect(figure.querySelector("[data-boundary]")).toBeNull();
    expect(rule(css, ".rr-eq-plot")).toContain("height: 215px");
    expect(rule(css, ".rr-dd-plot")).toContain("height: 92px");
    expect(rule(css, ".rr-eq-title")).toContain("font-size: 13.5px");
    expect(rule(css, ".rr-eq-meta")).toContain("font-size: 8.5px");
    cleanup();
    forgetHeldReports();
    await loaded(folded());
    const withFolds = panel("equity");
    expect(withFolds.querySelector("[data-equity-title]")?.textContent).toBe("Equity — stitched OOS (2 folds)");
    expect([...withFolds.querySelectorAll("[data-boundary-label]")].map((el) => el.textContent)).toEqual(["F1", "F2"]);
    expect(withFolds.querySelectorAll("line[data-boundary]")).toHaveLength(2);
  });

  it("S09-U39 the certification chain and the key artifacts are two cards in one row", async () => {
    const css = await loaded();
    const row = panel("stages").parentElement!;
    expect(row.classList.contains("rr-chainrow")).toBe(true);
    expect(row.lastElementChild).toBe(panel("artifacts"));
    expect(panel("stages").querySelector("h2")?.textContent).toBe(CHAIN_TITLE);
    const s1 = panel("stages").querySelector('[data-stage="S1"]')!;
    const cells = [...s1.querySelectorAll("td")];
    expect(cells.map((cell) => cell.className)).toEqual(["key", "desc", "st"]);
    expect(cells[0]!.textContent).toBe("S1 · Split");
    expect(cells[1]!.textContent).toBe("done · started 2024-09-22 10:13Z · completed 2024-09-22 10:13Z");
    expect(cells[2]!.textContent).toBe("DONE");
    expect(panel("stages").querySelector("thead")).toBeNull();
    const grid = panel("artifacts").querySelector(".rr-artgrid")!;
    expect(grid.querySelectorAll("[data-artifact]")).toHaveLength(7);
    const trace = grid.querySelector('[data-artifact="SELECTION_TRACE"]')!;
    expect(trace.querySelector(".k")?.textContent).toBe("selection_trace");
    expect(trace.querySelector("[data-artifact-digest]")?.getAttribute("data-tone")).toBe("NOT_PUBLISHED");
    expect(rule(css, ".rr-chainrow > [data-panel=\"stages\"]")).toContain("flex: 1.1 1 0");
    expect(rule(css, ".rr-chainrow > [data-panel=\"artifacts\"]")).toContain("flex: 1 1 0");
    expect(rule(css, ".rr-artgrid")).toContain("grid-template-columns: auto minmax(0, 1fr); gap: 2px 12px; padding: 7px 12px; font-family: var(--font-mono); font-size: 9.5px");
  });

  it("S09-U40 promotion and provenance share one two-column card; the footer follows the hi-fi copy", async () => {
    const css = await loaded();
    const card = panel("promotion").parentElement!;
    expect(card.classList.contains("rr-pp")).toBe(true);
    expect(card.lastElementChild).toBe(panel("provenance"));
    expect(panel("promotion").querySelector("h2")?.textContent).toBe("Promotion state");
    expect(panel("provenance").querySelector("h2")?.textContent).toBe("Provenance of this report");
    expect(rule(css, '.rr-pp > [data-panel="provenance"]')).toContain("border-left: 1px solid var(--line-soft); padding-left: 16px");
    const spans = [...panel("footer").children].map((el) => el.textContent);
    expect(spans[0]).toBe("Quant Ecosystem Portal · Research · confidential");
    expect(spans[1]).toBe(`${RUN} · report 2024-09-22 10:13Z · page prints on letter or A4`);
    expect(rule(css, ".rr-title")).toContain("font-size: 27px");
    expect(rule(css, ".rr-meta")).toContain("font-size: 10px");
    expect(rule(css, ".rr-head")).toContain("border-bottom: 2px solid var(--ink)");
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
    [404, "RESEARCH_REPORT_NOT_FOUND", "denied"], // F-04 (X3): a 404 reads as a 403
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
    expect(REPORT_REFUSAL_COPY.report[404]).toBe(REPORT_REFUSAL_COPY.report[403]);
    expect(REPORT_REFUSAL_COPY.report[403]).toBe(REPLAY_REFUSAL_COPY[403]);
    expect(REPORT_REFUSAL_COPY.export[403]).toBe(REPLAY_REFUSAL_COPY[403]);
    const conflict = toReportRefusal(new PortalApiError("409", 409, "RESEARCH_REPORT_NOT_READY", "req"), "export");
    expect(conflict).toMatchObject({ state: "stale", mayRetry: false, terminal: false, message: REPORT_REFUSAL_COPY.export[409] });
    expect(toReportRefusal(new TypeError("offline"), "report")).toMatchObject({ state: "failed-retryable", mayRetry: true });
    /* CG-P18-10: the read never declares 409; an unexpected one is not mistaken for "not sealed yet". */
    expect("409" in REPORT_REFUSAL_COPY.report).toBe(false);
    expect(toReportRefusal(new PortalApiError("409", 409, "X", "req"), "report")).toMatchObject({ state: "terminal", message: REPORT_REFUSAL_COPY.report.other });
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
    expect(geometry.boundaries).toEqual([{ label: "F1", x: expect.any(Number), pct: expect.any(Number) }]);
    /* Axis labels are the server's strings and the points' own UTC days. */
    expect(geometry.yLabels.map((label) => label.text)).toEqual(["110", "100"]);
    expect(geometry.xLabels.map((label) => label.text)).toEqual(["2024-09-22"]);
    expect(geometry.drawdownTop).toBe("0");
    expect(geometry.deepest?.text).toBe("-0.02");
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

  it("S09-U25 no S09 file formats a number on its own: display units come only from researchFormat (DQ-08)", () => {
    for (const name of ["ReportDetail.tsx", "ReportRoute.tsx", "reportClient.ts", "reportEquity.ts", "useReport.ts", "useReportExport.ts", "utcMinute.ts"]) {
      const source = readFileSync(join(process.cwd(), "src", "research", name), "utf8");
      expect(source, name).not.toMatch(/toFixed|Intl\.|toLocaleString/);
    }
  });

  it("S09-U26 the route is registered under QuantBT and the S08/Hub actions link to it", () => {
    const module = readFileSync(join(process.cwd(), "src", "features", "quantbt", "QuantBTModule.tsx"), "utf8");
    expect(module).toContain('<Route path="runs/:runId/report" element={<ReportRoute />} />');
    const execute = readFileSync(join(process.cwd(), "src", "research", "ExecuteDetail.tsx"), "utf8");
    expect(execute).toMatch(/to=\{`\/research\/quantbt\/runs\/\$\{run\}\/report`\}\s+className="mono text-\[10px\]"\s+style=\{\{ color: "var\(--accent\)" \}\}\s+data-next="run-report"/);
    const hub = readFileSync(join(process.cwd(), "src", "research", "EvidenceFlow.tsx"), "utf8");
    expect(hub).toContain('data-action="generate-report"');
    expect(hub).toContain('data-action="release-candidate"');
    expect(hub).not.toContain('<UnroutedAction label="release candidate →"');
  });
});

/*
 * W6a · frozen core v2 (CG-P18-01…11). These tests load the canonical
 * fixtures the control-api publishes from the real retained WFO seal
 * (CG-P18-09) instead of building a body here (CLAUDE.md §7.8).
 */
const FIXTURES = join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures");
const fixture = (name: string) => JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as ReportDetail;

describe("S09 Run Report — v2 core on the canonical fixtures (W6a)", () => {
  async function open(name: string) {
    const body = fixture(name);
    server({ detail: [{ status: 200, body }] });
    renderRoute(body.run_id);
    await screen.findAllByText(/per-fold verdict/i);
    await act(async () => {});
    return body as unknown as { run_id: string; frozen_core: Record<string, any> };
  }

  it("S09-U41 CG-P18-03/02 the title is the report's own and the certification box names its typed absence", async () => {
    const body = await open("research-report.wfo-retained.valid.json");
    const title = document.querySelector("[data-report-title]")!;
    expect(title.textContent).toBe(body.frozen_core.title.text);
    expect(title.getAttribute("data-title-source")).toBe("report");
    expect(panel("header").querySelector("[data-cert]")?.getAttribute("data-cert-state")).toBe("NOT_PUBLISHED");
    expect(panel("header").querySelector("[data-cert] [data-reason-code]")?.textContent).toBe(body.frozen_core.certification.reason_code);
  });

  it("S09-U42 CG-P18-01 the passport labels each engine fact by its key, verbatim", async () => {
    const body = await open("research-report.wfo-retained.valid.json");
    expect(panel("passport").querySelector("h2")?.textContent).toBe("Claim passport — issued by the engine, quoted verbatim");
    const facts = [...panel("passport").querySelectorAll("[data-passport-key]")];
    expect(facts.map((fact) => fact.getAttribute("data-passport-key"))).toEqual(body.frozen_core.passport.map((fact: { key: string }) => fact.key));
    expect(facts[0]!.querySelector(".k")?.textContent).toBe("validation_claim");
    expect(facts[0]!.querySelector(".v")?.textContent).toBe("walk_forward_oos");
    expect(facts[3]!.getAttribute("data-fact-state")).toBe("NOT_APPLICABLE");
    expect(panel("passport").textContent).not.toContain("numbered rather than named");
  });

  it("S09-U43 CG-P18-04/08 the fold table has the hi-fi's eight columns and each cell keeps its exact value", async () => {
    const body = await open("research-report.wfo-retained.valid.json");
    const table = panel("folds").querySelector("table")!;
    expect(table.getAttribute("data-fold-columns")).toBe("8");
    expect([...table.querySelectorAll("th")].map((th) => th.textContent)).toEqual(["fold", "OOS window (UTC)", "params", "IS", "OOS", "Δ decay", "contribution", "verdict"]);
    const rows = body.frozen_core.folds.rows as Array<{ fold_id: string; oos_sharpe: { value: string }; decay: { value: string }; contribution_fraction: { value: string }; verdict: string }>;
    expect(table.querySelectorAll("[data-fold]")).toHaveLength(rows.length);
    for (const row of rows) {
      const tr = table.querySelector(`[data-fold="${row.fold_id}"]`)!;
      expect(tr.querySelector("[data-fold-oos]")?.getAttribute("data-fold-oos")).toBe(row.oos_sharpe.value);
      expect(tr.querySelector("[data-fold-decay]")?.getAttribute("data-fold-decay")).toBe(row.decay.value);
      expect(tr.querySelector("[data-fold-contribution]")?.getAttribute("data-fold-contribution")).toBe(row.contribution_fraction.value);
      expect(tr.querySelector("[data-v]")?.textContent).toBe(row.verdict);
      expect(tr.querySelector("[data-fold-params] [title]")?.getAttribute("title")).toBe(body.frozen_core.folds.params_handoff.text);
    }
    expect(panel("equity").querySelector("[data-equity-caption]")?.textContent).toContain(`params handoff at each boundary: ${body.frozen_core.folds.params_handoff.text}`);
  });

  it("S09-U44 CG-P18-05 each stage shows its sourced check, never a pass from progress alone", async () => {
    const body = await open("research-report.wfo-retained.valid.json");
    for (const stage of body.frozen_core.stages as Array<{ key: string; check: { result: string; text: string | null; source_key: string | null } }>) {
      const row = panel("stages").querySelector(`[data-stage="${stage.key}"]`)!;
      expect(row.getAttribute("data-stage-check")).toBe(stage.check.result);
      if (stage.check.text) expect(row.querySelector(".desc")?.textContent).toContain(stage.check.text);
      if (stage.check.source_key) expect(row.querySelector(".desc")?.textContent).toContain(stage.check.source_key);
    }
    expect(panel("stages").querySelector('[data-stage="S3"] .st')?.textContent).toBe("pass");
  });

  it("S09-U45 CG-P18-06 the figure draws the IS account dashed before the stitched OOS", async () => {
    const body = await open("research-report.wfo-retained.valid.json");
    expect(panel("equity").querySelector("[data-equity-title]")?.textContent).toBe("Equity — IS account vs stitched OOS (2 folds, frozen params each)");
    expect(panel("equity").querySelector("[data-equity-is-path]")).not.toBeNull();
    expect(panel("equity").querySelector("[data-equity-oos-path]")).not.toBeNull();
    expect(panel("equity").querySelector('[data-legend="is"]')?.getAttribute("data-legend-state")).toBe("published");
    expect(panel("equity").querySelector("[data-equity-counts]")?.textContent).toContain(`OOS emitted ${body.frozen_core.equity.emitted_point_count} of ${body.frozen_core.equity.source_observation_count} source observations`);
  });

  it("S09-U46 CG-P18-07 sealed artifacts show their in-artifact filename and digest; nothing is a download", async () => {
    const body = await open("research-report.wfo-retained.valid.json");
    const fold = body.frozen_core.artifacts.find((artifact: { key: string }) => artifact.key === "FOLD_PLAN");
    const cell = panel("artifacts").querySelector('[data-artifact="FOLD_PLAN"]')!;
    expect(cell.querySelector("[data-artifact-filename]")?.getAttribute("data-artifact-filename")).toBe(fold.filename);
    expect(cell.querySelector("[data-exact]")?.getAttribute("data-exact")).toBe(fold.digest);
    expect(panel("artifacts").querySelectorAll("a")).toHaveLength(0);
    expect(panel("artifacts").textContent).toContain(fold.download.reason_code);
  });

  it("S09-U47 CG-P18-11 a scratch run says NOT_PUBLISHABLE in its identity and keeps the generic title", async () => {
    await open("research-report.wfo-scratch.valid.json");
    expect(panel("identity").querySelector('[data-identity="binding"] dd')?.textContent).toBe("scratch — NOT_PUBLISHABLE");
    expect(document.querySelector("[data-report-title]")?.getAttribute("data-title-source")).toBe("generic");
  });

  it("S09-U48 a P04 v2 report keeps its hub facts, names each passport fact and withholds folds in the 8-column frame", async () => {
    await open("research-report.p04-fixed-profile.valid.json");
    expect(panel("passport").querySelector("h2")?.textContent).toBe("claim passport — sealed source facts, quoted verbatim");
    expect(panel("passport").querySelector('[data-passport-key="split_protocol"] .k')?.textContent).toBe("Split protocol");
    expect(panel("folds").querySelector("[data-folds-absent]")?.textContent).toContain("P04_SOURCE_DID_NOT_PUBLISH_PER_FOLD_REPORT_ROWS");
    expect(panel("equity").querySelector('[data-legend="is"]')?.textContent).toContain("P04_SOURCE_DID_NOT_PUBLISH_IS_EQUITY_SERIES");
  });
});

/* -------------------------------------------------------------------------
 * X2 · B5/F6 — spec 09 T06 (failed run), T03 (32 folds), P18-T10 (final audit)
 * and the real export reasons, on the canonical fixtures.
 * ---------------------------------------------------------------------- */
describe("S09 X2 — failed run, 32 folds, final audit", () => {
  it("S09-T06 a failed run's sheet: 'no claim — run failed at S2 Search', stages to the failure, ABORTED artifacts, series unavailable", async () => {
    const body = fixture("research-report.wfo-failed.valid.json");
    server({ detail: [{ status: 200, body }] });
    renderRoute(body.run_id);
    await screen.findByText("no claim — run failed at S2 Search");
    await act(async () => {});
    const outcome = panel("failed-outcome");
    expect(outcome.getAttribute("data-outcome")).toBe("FAILED");
    expect(outcome.getAttribute("role")).toBe("status");
    expect(outcome.querySelector("[data-failure-code]")?.textContent).toBe("QUANTBT_CHILD_EXITED");
    expect([...panel("stages").querySelectorAll("[data-stage]")].map((row) => row.getAttribute("data-stage-check"))).toEqual([
      "NOT_PUBLISHED", "FAIL", "NOT_APPLICABLE", "NOT_APPLICABLE", "NOT_APPLICABLE",
    ]);
    expect(panel("artifacts").querySelector('[data-artifact="search/trials.parquet"]')?.getAttribute("data-artifact-state")).toBe("ABORTED");
    expect(panel("artifacts").textContent).toContain("ABORTED");
    expect(panel("equity").querySelector("[data-series-unavailable]")?.textContent).toBe("series unavailable — numbers unaffected");
    // No claim block is drawn for a run without a claim.
    expect(panel("headline")).toBeNull();
    expect(panel("passport")).toBeNull();
    expect(panel("folds")).toBeNull();
    expect(document.querySelector("[data-report-title]")?.textContent).toBe("Delta-RSI Polynomial Alpha on BTCUSDT · 1h");
  });

  it("S09-T03 the 32-fold sheet draws one verdict row per fold, in source order", async () => {
    const body = fixture("research-report.wfo-32-folds.valid.json");
    server({ detail: [{ status: 200, body }] });
    renderRoute(body.run_id);
    await screen.findAllByText(/per-fold verdict/i);
    await act(async () => {});
    const rows = [...panel("folds").querySelectorAll("[data-fold]")];
    expect(rows).toHaveLength(32);
    expect(rows.map((row) => row.getAttribute("data-fold"))).toEqual(Array.from({ length: 32 }, (_, index) => String(index)));
  });

  it("P18-T10 the final audit names reused original, the optimizer not re-invoked, and each fold's generation child", async () => {
    const body = fixture("research-report.wfo-retained.valid.json");
    server({ detail: [{ status: 200, body }] });
    renderRoute(body.run_id);
    await screen.findAllByText(/per-fold verdict/i);
    await act(async () => {});
    const audit = panel("final-audit");
    expect(audit.getAttribute("data-final-audit")).toBe("REUSED_ORIGINAL");
    expect(audit.querySelector("[data-optimizer-reinvoked]")?.getAttribute("data-optimizer-reinvoked")).toBe("false");
    expect(audit.querySelector("[data-final-audit-folds]")?.textContent).toBe("fold_01: child #10 2671e27b = θ* · fold_02: child #11 2671e27b = θ*");
    expect(audit.querySelector("[data-final-audit-refs]")?.textContent).toContain("frozen_candidate");
  });

  it("X2-D09 PARQUET and ARCHIVE stay disabled with the server's real reasons", async () => {
    const body = fixture("research-report.wfo-retained.valid.json");
    server({ detail: [{ status: 200, body }] });
    renderRoute(body.run_id);
    await screen.findAllByText(/per-fold verdict/i);
    expect(document.querySelector('[data-export-unavailable="PARQUET"]')?.getAttribute("title")).toBe("P18_CONTROL_API_HAS_NO_PINNED_PARQUET_WRITER");
    expect(document.querySelector('[data-export-unavailable="ARCHIVE"]')?.getAttribute("title")).toBe("P18_ARCHIVE_WOULD_EXPOSE_PRIVATE_P05_BYTES_AND_RAW_MARKET_ROWS");
  });
});

/* -------------------------------------------------------------------------
 * E14 — Screen 09: the OOS return tile (9.8), the identity qualifier (9.7),
 * the equity grid (9.10) and the provenance evidence link (9.15).
 *
 * Every body is a canonical fixture the control API publishes.
 * ---------------------------------------------------------------------- */
describe("E14 — S09 headline return, identity qualifier, equity grid and evidence link", () => {
  async function open(name: string) {
    const body = fixture(name);
    server({ detail: [{ status: 200, body }] });
    renderRoute(body.run_id);
    await screen.findAllByText(/per-fold verdict/i);
    await act(async () => {});
    return body as unknown as { run_id: string; report_revision: string; frozen_core: Record<string, any> };
  }

  it("9.8 the retained sheet leads with a net return tile, its exact value, its scope and its sign colour", async () => {
    const body = await open("research-report.wfo-retained.valid.json");
    const tiles = [...panel("headline").querySelectorAll("[data-headline]")];
    expect(tiles.map((tile) => tile.getAttribute("data-headline"))).toEqual([
      "NET_RETURN", "OOS_SHARPE", "DECAY_MEAN", "MAX_DRAWDOWN", "TRADES", "WIN_RATE", "FUNDING",
    ]);
    const tile = tiles[0]!;
    const value = tile.querySelector("[data-headline-value]")!;
    expect(value.getAttribute("data-headline-value")).toBe(body.frozen_core.headline[0].value);
    expect(value.getAttribute("data-sign")).toBe("neg");
    expect(value.textContent).toContain("−0.37%");
    /* The value is the whole account path, so the tile says so rather than
       letting the reader take it for an OOS-only return. */
    expect(tile.querySelector("[data-headline-scope]")?.textContent).toBe("is plus oos");
    expect(panel("headline").querySelector("[data-headline-footnote]")?.textContent).toContain("they are not OOS-only");
  });

  it("9.8 a P04 sheet shows the same tile under the scope its hub published", async () => {
    const body = await open("research-report.p04-fixed-profile.valid.json");
    const tile = panel("headline").querySelector('[data-headline="NET_RETURN"]')!;
    expect(tile.querySelector("[data-headline-value]")?.getAttribute("data-headline-value")).toBe(body.frozen_core.headline[0].value);
    expect(tile.querySelector("[data-headline-scope]")?.textContent).toBe("oos");
    expect(tile.querySelector("[data-headline-value]")?.getAttribute("data-sign")).toBe("pos");
  });

  it("9.7 a fixed-profile run's optimizer identity says it was declared, not executed", async () => {
    const body = await open("research-report.p04-fixed-profile.valid.json");
    const row = panel("identity").querySelector('[data-identity="optimization"]')!;
    expect(row.querySelector("dd")?.textContent).toContain(body.frozen_core.identity.find((f: { key: string }) => f.key === "optimization").value);
    const qualifier = row.querySelector("[data-identity-qualifier]")!;
    expect(qualifier.getAttribute("data-identity-qualifier")).toBe("DECLARED_NOT_EXECUTED");
    expect(qualifier.textContent).toContain("declared, not executed");
    expect(qualifier.textContent).toContain("P04_FIXED_PROFILE_RUN_DID_NOT_EXECUTE_THE_DECLARED_OPTIMIZER");
    expect(qualifier.getAttribute("title")).toContain("no search was executed");
  });

  it("9.7 a run whose search really ran carries no qualifier on any identity row", async () => {
    await open("research-report.wfo-retained.valid.json");
    expect(panel("identity").querySelectorAll("[data-identity-qualifier]")).toHaveLength(0);
    expect(panel("identity").querySelector('[data-identity="optimization"] dd')?.textContent).toBe("mode_1_decay × global");
  });

  it("9.10 the equity axis draws the hi-fi's six grid rules at equal steps, and still labels only server values", async () => {
    await open("research-report.wfo-retained.valid.json");
    const rules = [...panel("equity").querySelectorAll("[data-y-rule]")].map((line) => Number(line.getAttribute("y1")));
    expect(rules).toHaveLength(6);
    const steps = rules.slice(1).map((y, index) => Math.round((y - rules[index]!) * 100) / 100);
    expect(new Set(steps).size).toBe(1);
    /* VD-P20-27: only the two extremes carry a label, and each is verbatim. */
    const labels = [...panel("equity").querySelectorAll("[data-y-label]")] as HTMLElement[];
    expect(labels).toHaveLength(2);
    for (const label of labels) expect(label.getAttribute("data-exact")).toBe(label.getAttribute("title"));
    /* The first and last rule sit on those two labels, so the grid spans the
       sealed extremes and no rule stands for a level of its own. */
    const labelY = labels.map((label) => Math.round(Number.parseFloat(label.style.top) * 10 * 100) / 100);
    expect(rules[0]).toBeCloseTo(labelY[0]!, 1);
    expect(rules[5]).toBeCloseTo(labelY[1]!, 1);
  });

  it("9.10 the grid spans exactly the two labelled extremes", () => {
    const geometry = equitySvg([
      { at_utc_ms: T0, equity: "100", drawdown_fraction: "0" },
      { at_utc_ms: T0 + 1_000, equity: "120", drawdown_fraction: "-0.1" },
      { at_utc_ms: T0 + 2_000, equity: "90", drawdown_fraction: "-0.25" },
    ]);
    expect(geometry.yRulePcts).toHaveLength(6);
    const [top] = geometry.yLabels.map((label) => label.pct);
    const bottom = geometry.yLabels[1]!.pct;
    expect(geometry.yRulePcts[0]).toBeCloseTo(top!, 2);
    expect(geometry.yRulePcts[5]).toBeCloseTo(bottom, 2);
    /* A flat series spans nothing and keeps its one rule rather than six. */
    const flat = equitySvg([
      { at_utc_ms: T0, equity: "100", drawdown_fraction: "0" },
      { at_utc_ms: T0 + 1_000, equity: "100", drawdown_fraction: "0" },
    ]);
    expect(flat.yRulePcts).toHaveLength(1);
  });

  /* -------------------------------------------------------------------
   * G5 — defects the Letter/A4 print re-run and the 660px look found.
   * ---------------------------------------------------------------- */

  const seriesOf = (body: { frozen_core: Record<string, any> }) => [
    ...(body.frozen_core.equity_is?.points ?? []),
    ...body.frozen_core.equity.points,
  ] as { at_utc_ms: number; equity: string; drawdown_fraction: string }[];

  it("G5 the x axis labels stand at equal steps of time, so a dense OOS run never overprints them", async () => {
    const body = await open("research-report.wfo-retained.valid.json");
    /* The retained lane's IS segment is sparse and its stitched OOS one dense: stepping by point
       count put four of the six days inside the last 15% of the axis. */
    const geometry = equitySvg(seriesOf(body));
    expect(geometry.xLabels.length).toBeGreaterThan(1);
    expect(geometry.xLabels.length).toBeLessThanOrEqual(6);
    const gaps = geometry.xLabels.slice(1).map((label, index) => label.pct - geometry.xLabels[index]!.pct);
    /* Six labels over five gaps are 20% apart; nearest-point snapping may shave a little, never most of it. */
    expect(Math.min(...gaps)).toBeGreaterThan(14);
    /* Each label is still the UTC day of a sealed point's own timestamp. */
    const days = new Set(seriesOf(body).map((point) => new Date(point.at_utc_ms).toISOString().slice(0, 10)));
    for (const label of geometry.xLabels) expect(days.has(label.text)).toBe(true);
    /* And the screen prints exactly those labels. */
    expect([...panel("equity").querySelectorAll("[data-x-label]")].map((el) => el.textContent)).toEqual(geometry.xLabels.map((label) => label.text));
  });

  it("G5 a deepest-drawdown mark at the right edge hangs its label inward, so it stays inside the figure and on the page", async () => {
    /* The fixed-profile fixture's deepest drawdown is its last point: the label centred on it left the figure. */
    const p04 = await open("research-report.p04-fixed-profile.valid.json");
    const geometry = equitySvg(seriesOf(p04));
    expect(geometry.deepest?.xPct).toBeGreaterThanOrEqual(88);
    expect(geometry.deepest?.align).toBe("end");
    expect(panel("equity").querySelector("[data-dd-deepest]")?.getAttribute("data-align")).toBe("end");
    cleanup();
    forgetHeldReports();
    /* The retained WFO fixture's trough is at ~93% of the axis: also an end mark, at 660px too close to centre. */
    const wfo = await open("research-report.wfo-retained.valid.json");
    const trough = equitySvg(seriesOf(wfo)).deepest!;
    expect(trough.xPct).toBeGreaterThanOrEqual(88);
    expect(trough.align).toBe("end");
    expect(panel("equity").querySelector("[data-dd-deepest]")?.getAttribute("data-align")).toBe("end");
    /* A mark in the body of the strip keeps its centred label. */
    const mid = equitySvg([
      { at_utc_ms: T0, equity: "100", drawdown_fraction: "0" },
      { at_utc_ms: T0 + 60_000, equity: "98", drawdown_fraction: "-0.20" },
      { at_utc_ms: T0 + 120_000, equity: "101", drawdown_fraction: "-0.01" },
    ]).deepest!;
    expect(mid.xPct).toBe(50);
    expect(mid.align).toBe("center");
    /* The mirror case: a mark at the left edge hangs its label to the right. */
    const first = equitySvg([
      { at_utc_ms: T0, equity: "100", drawdown_fraction: "-0.30" },
      { at_utc_ms: T0 + 60_000, equity: "101", drawdown_fraction: "-0.01" },
      { at_utc_ms: T0 + 120_000, equity: "102", drawdown_fraction: "0" },
    ]);
    expect(first.deepest?.xPct).toBe(0);
    expect(first.deepest?.align).toBe("start");
  });

  it("G5 on paper a block's title bar stays with its first row, and the promotion + provenance card flows instead of jumping", async () => {
    await open("research-report.wfo-retained.valid.json");
    const css = document.querySelector('[data-screen="run-report"] > style')!.textContent ?? "";
    const print = css.slice(css.indexOf("@media print {"));
    expect(print).toContain(".rr-block > .t, .rr-t2 { break-after: avoid; }");
    expect(print).toContain(".rr-pp.rr-keep { break-inside: auto; }");
    expect(print).toContain(".rr-pp .rr-id .k, .rr-pp .rr-id .v { break-inside: avoid; }");
    /* The screen keeps the hanging-label rules that pair with data-align. */
    expect(css).toContain('.rr-dd-marklbl[data-align="end"] { transform: translate(-100%, 6px); }');
    expect(css).toContain('.rr-dd-marklbl[data-align="start"] { transform: translate(0, 6px); }');
  });

  it("9.15 provenance carries an evidence link to this sheet at the revision the reader is on", async () => {
    const body = await open("research-report.wfo-retained.valid.json");
    const link = panel("provenance").querySelector("[data-evidence-link] a") as HTMLAnchorElement;
    expect(link.getAttribute("data-evidence-href")).toBe(
      `${window.location.origin}/research/quantbt/runs/${encodeURIComponent(body.run_id)}/report?report_revision=${encodeURIComponent(body.report_revision)}`,
    );
    /* E1: the printed address is short, the whole one stays in href and title. */
    expect(link.getAttribute("title")).toBe(link.getAttribute("data-evidence-href"));
    expect(link.textContent).toBe(reportEvidenceLinkLabel(body.run_id, body as unknown as ReportDetail));
    /* The 64-hex revision is cut to its prefix + 8, as every other id is. */
    expect(link.textContent).toContain(`report_revision=${body.report_revision.slice(0, "p18r1_".length + 8)}`);
    expect(link.textContent).not.toContain(body.report_revision);
    expect(link.textContent).not.toContain("portal://");
    expect(link.textContent!.length).toBeLessThan(80);
  });

  it("9.15 with no report in hand there is no link, and no address is invented", () => {
    expect(reportEvidenceLink("rrun_x", null)).toBeNull();
  });
});
