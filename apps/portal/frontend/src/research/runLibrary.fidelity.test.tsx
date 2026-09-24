/**
 * S01 fidelity pass (HiFi `QuantBT 01 Run Library.dc.html`, measured diff
 * 2026-09-24): numbers, withheld slots, sparkline placeholder, tooltips,
 * compare-bar id line, group order, run-id ellipsis and HiFi motion hooks.
 */
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RunLibrary, SPARKLINE_UNAVAILABLE, STAT_WITHHELD, groupRuns, statDisplay } from "./RunLibrary";
import { type Availability, type RunLibraryItem, type RunLibraryResponse } from "./runLibraryClient";
import { type LibraryFilters, type SelectedRun } from "./useRunLibrary";
import { researchState } from "./state";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/* ---------------------------------------------------------------- fixtures */

const AVAILABLE: Availability = { state: "AVAILABLE", reason_code: null };
const NOT_ISSUED: Availability = { state: "NOT_PUBLISHED", reason_code: "SOURCE_CLAIM_NOT_ISSUED" };
const NO_METRICS: Availability = {
  state: "NOT_PUBLISHED",
  reason_code: "P12_DOES_NOT_INFER_FINAL_METRICS_FROM_PROGRESS_OR_ARTIFACTS",
};
const NO_CERT: Availability = { state: "NOT_PUBLISHED", reason_code: "SOURCE_DID_NOT_PUBLISH_METHODOLOGY_CERTIFICATE" };

function item(overrides: Partial<RunLibraryItem> = {}): RunLibraryItem {
  return {
    run_id: "A",
    attempt_id: null,
    source_kind: "RESEARCH_DURABLE",
    row_kind: "LOGICAL_RUN",
    relationship: { kind: "PRIMARY", logical_run_key: "primary", parent_run_id: null, technical_retry_count: 0 },
    status: "COMPLETED",
    mode: { display: "mode_1_decay · three_window_decay", key: "mode_1_decay", availability: AVAILABLE, schedule: null, protocol: null },
    strategy_id: { value: "delta-rsi", availability: AVAILABLE },
    binding: {
      alpha_id: "delta-rsi",
      alpha_name: "Delta-RSI Polynomial Alpha",
      alpha_version_id: "av_delta_1_0_0",
      av: "av_1_0_0",
      digest: "34dc1847d051ca40f9ae3d2fbbf2d7e8",
    },
    binding_availability: AVAILABLE,
    rc: null,
    rc_availability: { state: "NOT_PUBLISHED", reason_code: "P21_NO_PERSISTED_RELEASE_CANDIDATE" },
    status_basis: { kind: "DURABLE_LIFECYCLE", availability: { state: "AVAILABLE", reason_code: null } },
    evidence_revision: null,
    instrument: { display: "BTCUSDT · 1h", availability: AVAILABLE },
    created_at_utc_ms: 1790226080369,
    certificate: { grade: null, availability: NO_CERT },
    claim: { state: null, text: null, availability: NOT_ISSUED },
    stages: (["S1", "S2", "S3", "S4", "S5"] as const).map((key) => ({
      key,
      state: "done" as const,
      tip: `Persisted ${key} state: DONE.`,
      tooltip_source: "DERIVED_FROM_PERSISTED_STATE" as const,
      availability: AVAILABLE,
    })),
    stats: [
      { key: "oos_sharpe", label: "OOS sharpe", role: "OOS_SHARPE", value: null, tone: "DEFAULT", availability: NO_METRICS, scope: null, definition_id: null },
      { key: "decay", label: "Δ decay", role: "DECAY", value: null, tone: "DEFAULT", availability: NO_METRICS, scope: null, definition_id: null },
      { key: "trades", label: "trades", role: "TRADE_COUNT", value: null, tone: "DEFAULT", availability: NO_METRICS, scope: null, definition_id: null },
    ],
    superseded_note: null,
    comparison: { key: "rck1_same", availability: AVAILABLE },
    sparkline: { kind: "oos_equity", availability: { state: "NOT_PUBLISHED", reason_code: "P12_DOES_NOT_READ_ARTIFACT_OR_PARQUET_SERIES" } },
    source_updated_at_utc_ms: 1790226090000,
    ...overrides,
  };
}

function page(items: RunLibraryItem[], pageOverrides: Partial<RunLibraryResponse["page"]> = {}): RunLibraryResponse {
  return {
    schema_version: "research.run-library.v1",
    read_authority: "PORTAL_PERSISTED_RESEARCH",
    items,
    page: {
      limit: 50,
      total_rows: 12,
      filtered_rows: items.length,
      next_cursor: null,
      prev_cursor: null,
      has_more: false,
      has_previous: false,
      order: "CREATED_AT_DESC_RUN_ID_DESC",
      ...pageOverrides,
    },
    counters: { logical_runs: 12, worker_children: 0, technical_retries: 0, legacy_metadata_rows: 1 },
    claim_ledger: { issued: 0, not_issued: 7, pending_source: 5, failed: 0, cancelled_before_source: 0, legacy_metadata_only: 0 },
    filter_catalog: {
      alphas: [{ alpha_id: "delta-rsi", alpha_name: "Delta-RSI Polynomial Alpha" }],
      modes: [{ key: "mode_1_decay", display: "mode_1_decay" }],
      scratch_available: true,
    },
    as_of_utc_ms: 1790226095000,
  };
}

const EMPTY: LibraryFilters = { q: "", status: [], mode: [], alpha: [], group: false, sel: [] };
const OK = researchState({ kind: "ok", rowCount: 1 });

function view(overrides: Partial<React.ComponentProps<typeof RunLibrary>> = {}) {
  const response = overrides.response === undefined ? page([item()]) : overrides.response;
  const props = {
    filters: EMPTY,
    onFilters: vi.fn(),
    onToggleSel: vi.fn(),
    response,
    items: response?.items ?? [],
    state: OK,
    sparklines: new Map(),
    onVisible: vi.fn(),
    onLoadNext: vi.fn(),
    onLoadPrevious: vi.fn(),
    ...overrides,
  };
  render(
    <MemoryRouter>
      <RunLibrary {...props} />
    </MemoryRouter>,
  );
  return props;
}


describe("S01 fidelity — stat values", () => {
  it("shows ratios at the hi-fi's two places and keeps the server string in title", () => {
    expect(statDisplay({ role: "OOS_SHARPE", value: "1.049" })).toBe("1.05");
    expect(statDisplay({ role: "DECAY", value: "0.2312" })).toBe("0.23");
    expect(statDisplay({ role: "TRADE_COUNT", value: "214" })).toBe("214");
    expect(statDisplay({ role: "TRADE_COUNT", value: "1214" })).toBe("1,214");
    expect(statDisplay({ role: "PROGRESS" as never, value: "fold 3/5" })).toBe("fold 3/5");
    view({
      response: page([
        item({
          stats: [
            { key: "oos_sharpe", label: "OOS sharpe", role: "OOS_SHARPE", value: "1.049", tone: "DEFAULT", availability: AVAILABLE, scope: null, definition_id: null },
            { key: "decay", label: "Δ decay", role: "DECAY", value: "0.23", tone: "DEFAULT", availability: AVAILABLE, scope: null, definition_id: null },
            { key: "trades", label: "trades", role: "TRADE_COUNT", value: "214", tone: "DEFAULT", availability: AVAILABLE, scope: null, definition_id: null },
          ],
        }),
      ]),
    });
    const sharpe = document.querySelector('[data-metric="OOS_SHARPE"]')!.lastElementChild as HTMLElement;
    expect(sharpe.textContent).toBe("1.05");
    expect(sharpe.getAttribute("title")).toBe("1.049");
    // Unchanged display carries no redundant title.
    expect((document.querySelector('[data-metric="DECAY"]')!.lastElementChild as HTMLElement).hasAttribute("title")).toBe(false);
  });

  it("keeps a withheld stat's slot as a dash with the reason in title, three times over", () => {
    view();
    const dashes = Array.from(document.querySelectorAll("[data-stats] [data-withheld]"));
    expect(dashes).toHaveLength(3);
    for (const dash of dashes) {
      expect(dash.textContent).toBe(STAT_WITHHELD);
      expect(dash.getAttribute("title")).toMatch(/never inferred/);
    }
    expect(document.querySelector("[data-stats]")?.textContent).not.toContain("not published");
  });
});

describe("S01 fidelity — sparkline placeholder (spec 01 §4.3)", () => {
  it("draws 24 grey columns titled 'sparkline unavailable', never a text block", () => {
    view();
    const placeholder = document.querySelector("[data-sparkline-placeholder]") as HTMLElement;
    expect(placeholder.children).toHaveLength(24);
    expect(placeholder.getAttribute("title")).toMatch(new RegExp(`^${SPARKLINE_UNAVAILABLE}`));
    expect(placeholder.textContent).toBe("");
    // All one height: a placeholder must not look like a series.
    const heights = new Set(Array.from(placeholder.children).map((bar) => (bar as HTMLElement).style.height));
    expect(heights.size).toBe(1);
  });

  it("uses the hi-fi captions", () => {
    view();
    expect(document.querySelector("[data-sparkline]")?.firstElementChild?.textContent).toBe("stitched OOS equity");
  });

  it("draws a published series as at most 24 columns", () => {
    const values = Array.from({ length: 30 }, (_, index) => String(index + 1));
    view({
      response: page([item({ sparkline: { kind: "oos_equity", availability: AVAILABLE } })]),
      sparklines: new Map([["A", values]]),
    });
    expect(document.querySelector("[data-sparkline-values]")?.children).toHaveLength(24);
  });
});

describe("S01 fidelity — tooltips and the compare bar", () => {
  it("gives the binding chip the spec sentence only, without the digest", () => {
    view();
    const title = document.querySelector('[data-binding="av_delta_1_0_0"]')?.getAttribute("title");
    expect(title).toBe("bound to Delta-RSI Polynomial Alpha av_1_0_0 — publishable evidence");
  });

  it("lists selected ids only when one of them is hidden by the filter", () => {
    const both: SelectedRun[] = [
      { runId: "A", item: item({ run_id: "A" }), hidden: false, pending: false },
      { runId: "B", item: item({ run_id: "B" }), hidden: false, pending: false },
    ];
    view({ filters: { ...EMPTY, sel: ["A", "B"] }, selection: both });
    expect(document.querySelector("[data-compare-selected]")).toBeNull();
    cleanup();
    view({ filters: { ...EMPTY, sel: ["A", "B"] }, selection: [both[0], { ...both[1], hidden: true }] });
    expect(document.querySelector('[data-compare-selected="B"]')?.textContent).toBe("B (hidden by filter)");
  });
});

describe("S01 fidelity — group order follows the hi-fi (alpha name, then av)", () => {
  it("sorts bound groups by name then av, with scratch and legacy last", () => {
    const bound = (run_id: string, alpha_name: string, av: string) =>
      item({
        run_id,
        binding: { alpha_id: alpha_name, alpha_name, alpha_version_id: `${alpha_name}_${av}`, av, digest: "d" },
      });
    const legacy = item({ run_id: "L", binding: null, source_kind: "LEGACY_1_0_8_METADATA" });
    const groups = groupRuns([
      item({ run_id: "S", binding: null }),
      bound("M3", "alpha_momentum_btc", "av_0_9_3"),
      legacy,
      bound("E1", "alpha_meanrev_eth", "av_0_2_1"),
      bound("M2", "alpha_momentum_btc", "av_0_9_2"),
    ]);
    expect(groups.map((group) => group.title)).toEqual([
      "alpha_meanrev_eth · av_0_2_1",
      "alpha_momentum_btc · av_0_9_2",
      "alpha_momentum_btc · av_0_9_3",
      "scratch — unbound",
      "legacy 1.0.8 — binding not recorded",
    ]);
  });
});

describe("S01 fidelity — run id", () => {
  it("keeps the full id, ellipsises it in place and copies it on click", async () => {
    const id = "rrun_91f4b6acfda7c4eda62c34b407a52e13";
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    view({ response: page([item({ run_id: id })]) });
    const button = document.querySelector(`[data-run-id="${id}"]`) as HTMLElement;
    expect(button.textContent).toBe(id);
    expect(button.className).toContain("truncate");
    expect(button.getAttribute("title")).toBe(`${id} — click to copy`);
    await act(async () => {
      fireEvent.click(button);
    });
    expect(writeText).toHaveBeenCalledWith(id);
    expect(button.getAttribute("title")).toBe(`${id} — copied`);
  });
});

describe("S01 fidelity — hi-fi motion hooks", () => {
  it("pulses the whole RUNNING pill at 2 s and the running trail cell at 1.6 s", () => {
    const stages = item().stages.map((stage, index) => (index === 1 ? { ...stage, state: "run" as const } : stage));
    view({ response: page([item({ status: "RUNNING", stages })]) });
    const pill = document.querySelector('[data-status="RUNNING"]') as HTMLElement;
    expect(pill.getAttribute("data-motion")).toBe("pulse");
    expect(pill.style.getPropertyValue("--rs-motion-duration")).toBe("2s");
    expect(pill.children).toHaveLength(0); // no separate dot: the hi-fi pulses the pill
    const cell = document.querySelector('[data-stage-cell="S2"]') as HTMLElement;
    expect(cell.getAttribute("data-motion")).toBe("pulse");
    expect(cell.style.getPropertyValue("--rs-motion-duration")).toBe("1.6s");
    expect(document.querySelector('[data-stage-cell="S1"]')?.hasAttribute("data-motion")).toBe(false);
  });

  it("keeps a finished pill still", () => {
    view();
    expect(document.querySelector('[data-status="COMPLETED"]')?.hasAttribute("data-motion")).toBe(false);
  });
});
