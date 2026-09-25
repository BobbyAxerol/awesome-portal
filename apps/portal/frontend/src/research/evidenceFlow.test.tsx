/**
 * P13 consumer tests — Screen 04 Evidence Flow hub.
 *
 * The claims that carry this phase:
 *
 *  - **One cursor, seven tabs.** Changing tab does not move the cursor, and
 *    every change replaces the hash rather than pushing a history entry.
 *  - **A series belongs to a revision.** A chart answered at another revision
 *    is discarded, the Hub is reread, and that one series is asked for again —
 *    once, not in a loop.
 *  - **Nothing absent is filled in.** A certificate exists only when the
 *    server says `ISSUED`; a `NOT_PUBLISHED` metric is not a zero; a run
 *    outside the retained profile keeps its passport panel and the refusal.
 *  - **Only the panel on screen is read.** Four series exist; a reader who
 *    stays on one tab pays for the ones that tab draws and no others.
 */
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CERT_TOOLTIP, EvidenceFlow, WINDOW_DISCLOSURE } from "./EvidenceFlow";
import {
  SERIES_KINDS,
  seriesMatchesHub,
  toEvidenceRefusal,
  type CurrentSourceEvidence,
  type CurrentSourceEvidenceSeries,
  type EvidenceHub,
  type EvidenceSeries,
  type Metric,
} from "./evidenceClient";
import {
  DEFAULT_CURSOR,
  deepDiveHref,
  type EvidenceCursor,
  parseCursor,
  serializeCursor,
  useEvidenceCursor,
} from "./evidenceCursor";
import { useEvidence } from "./useEvidence";
import { PortalApiError } from "../lib/api";
import { researchState } from "./state";
import { ResearchLaneConflictError } from "./researchRefusal";

afterEach(cleanup);

function codeOf(name: string): string {
  return readFileSync(join(process.cwd(), "src", "research", name), "utf8")
    .split("\n")
    .filter((line) => {
      const t = line.trimStart();
      return !t.startsWith("*") && !t.startsWith("//") && !t.startsWith("/*");
    })
    .join("\n");
}

/* ---------------------------------------------------------------- fixtures */

const AVAILABLE = { state: "AVAILABLE", reason_code: null } as const;
const NOT_PUBLISHED = { state: "NOT_PUBLISHED", reason_code: "P04_SOURCE_PUBLISHES_NO_BENCHMARK" } as const;

function metric(overrides: Partial<Metric> = {}): Metric {
  return {
    key: "FINAL_EQUITY",
    label: "final equity",
    unit: "CURRENCY",
    scope: "OOS",
    frequency: "RUN_FINAL",
    origin: "ENGINE_DIRECT",
    definition_id: "def.final_equity.v1",
    value: "128400.00",
    availability: AVAILABLE,
    ...overrides,
  };
}

function hub(overrides: Partial<EvidenceHub> = {}): EvidenceHub {
  return {
    schema_version: "research.evidence-hub.v1",
    read_authority: "PORTAL_PERSISTED_RESEARCH",
    run_id: "R-WFO-118",
    revision: "rev_7",
    etag: '"rev_7"',
    availability: AVAILABLE,
    readiness: "COMPLETE",
    as_of_utc_ms: 1789836590000,
    metric_registry_version: "research.metric-registry.v2",
    core: {
      source_adapter_id: "p04.delta-rsi.v1",
      engine_version: "1.1.1",
      input_scope: "P08_OPTIONAL_WARMUP_PLUS_IS_OOS_ONLY",
      source_transform_digest: "sha256:aa01",
      requested_spec_digest: "sha256:bb02",
      effective_spec_digest: "sha256:cc03",
      dataset_binding_digest: "sha256:dd04",
      manifest_digest: "sha256:ee05",
      data: {
        dataset_id: "ds_btcusdt_4h",
        symbol: "BTCUSDT",
        timeframe: "4h",
        oos_observation_count: 2190,
      },
      run_identity: {
        status: { value: "READY", availability: AVAILABLE },
        binding: {
          alpha_id: "alpha_momentum_btc",
          alpha_name: "alpha_momentum_btc",
          alpha_version_id: "av_0_9_3",
          availability: AVAILABLE,
        },
        created_at_utc_ms: { value: 1789836572000, availability: AVAILABLE },
        mode: { value: "mode_1_decay · per_fold_causal", availability: AVAILABLE },
        schedule: { value: "per_fold_causal", availability: AVAILABLE },
        route: {
          id: { value: "close_target_v2", availability: AVAILABLE },
          contract: {
            value: null,
            availability: { state: "NOT_PUBLISHED", reason_code: "P13_ROUTE_CONTRACT_NOT_PUBLISHED" },
          },
        },
        config_digest: { value: "sha256:88ae0231bc44", availability: AVAILABLE },
        seed: {
          value: null,
          availability: { state: "NOT_APPLICABLE", reason_code: "P02_RANDOM_SEED_NOT_SELECTED" },
        },
      },
      fold_navigation: {
        observed_folds: [1, 2, 3, 5],
        published_fold_count: 4,
        availability: AVAILABLE,
      },
    },
    metrics: [
      metric(),
      metric({ key: "NET_RETURN_FRACTION", label: "net return", unit: "FRACTION", value: "0.284" }),
      metric({ key: "MAX_DRAWDOWN_FRACTION", label: "max drawdown", unit: "FRACTION", value: "-0.096" }),
      metric({ key: "TRADE_COUNT", label: "trades", unit: "COUNT", scope: "IS_PLUS_OOS", value: "214" }),
      metric({
        key: "BENCHMARK_RETURN_FRACTION",
        label: "benchmark return",
        unit: "FRACTION",
        scope: "NOT_PUBLISHED",
        origin: "NOT_PUBLISHED",
        value: null,
        availability: NOT_PUBLISHED,
      }),
    ],
    claim: {
      state: "ISSUED",
      text: "STRICT_OUTER_OOS — OOS read once after freeze · holdout sealed caps ≤ B",
      cursor: null,
      methodology_certificate: {
        state: "ISSUED",
        grade: "B",
        issued_at_utc_ms: 1789836580000,
        reason_code: null,
      },
      availability: AVAILABLE,
    },
    stages: [
      { key: "S1", state: "DONE", started_at_utc_ms: 1789830000000, completed_at_utc_ms: 1789831000000 },
      { key: "S2", state: "DONE", started_at_utc_ms: 1789831000000, completed_at_utc_ms: 1789833000000 },
      { key: "S3", state: "DONE", started_at_utc_ms: null, completed_at_utc_ms: null },
      { key: "S4", state: "DONE", started_at_utc_ms: 1789834000000, completed_at_utc_ms: 1789836000000 },
      { key: "S5", state: "DONE", started_at_utc_ms: 1789836000000, completed_at_utc_ms: 1789836500000 },
    ],
    series: [
      { kind: "EQUITY_OOS", availability: AVAILABLE, href: "/api/v1/quantbt/runs/R-WFO-118/evidence/series?kind=EQUITY_OOS" },
      { kind: "MONTHLY_RETURNS", availability: AVAILABLE, href: null },
      { kind: "ROLLING_RETURNS_20", availability: AVAILABLE, href: null },
      {
        kind: "RETURN_DISTRIBUTION",
        availability: { state: "NOT_APPLICABLE", reason_code: "P04_CHILD_PUBLISHED_NO_HISTOGRAM" },
        href: null,
      },
    ],
    warnings: [
      { definition_id: "warn.below_promotion_min_bars", state: "ACTIVE", reason_code: null, copy: "below promotion min bars" },
      { definition_id: "warn.funding_unmodelled", state: "NOT_APPLICABLE", reason_code: "NO_FUNDING_SOURCE", copy: "funding is not modelled" },
    ],
    source_absences: {
      benchmark: NOT_PUBLISHED,
      audited_fills: { state: "NOT_PUBLISHED", reason_code: "P04_HAS_NO_BROKER_EVIDENCE" },
    },
    ...overrides,
  };
}

function equitySeries(overrides: Partial<EvidenceSeries> = {}): EvidenceSeries {
  return {
    schema_version: "research.evidence-series.v1",
    run_id: "R-WFO-118",
    revision: "rev_7",
    etag: '"rev_7"',
    kind: "EQUITY_OOS",
    availability: AVAILABLE,
    source_sample: { source_observation_count: 2190, emitted_point_count: 2, sampling: "EXTREMA_BUCKET_V1" },
    values: [
      { at_utc_ms: 1789000000000, equity: "100000.00", drawdown_fraction: "0.000" },
      { at_utc_ms: 1789600000000, equity: "128400.00", drawdown_fraction: "-0.096" },
    ],
    ...overrides,
  };
}

const OK = researchState({ kind: "ok", rowCount: 5 });

function view(overrides: Partial<React.ComponentProps<typeof EvidenceFlow>> = {}) {
  return render(
    <MemoryRouter>
      <EvidenceFlow
        runId="R-WFO-118"
        hub={hub()}
        state={OK}
        cursor={DEFAULT_CURSOR}
        onStage={vi.fn()}
        onFold={vi.fn()}
        onResetCursor={vi.fn()}
        series={new Map()}
        ensureSeries={vi.fn()}
        passport={{ state: "idle" }}
        ensurePassport={vi.fn()}
        onReread={vi.fn()}
        {...overrides}
      />
    </MemoryRouter>,
  );
}

let requested: string[] = [];

function stub(responder: (url: string, init?: RequestInit) => [number, unknown]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      requested.push(url);
      const [status, payload] = responder(url, init);
      return {
        ok: status >= 200 && status < 300,
        status,
        statusText: String(status),
        headers: new Headers(),
        json: async () => payload,
      } as unknown as Response;
    }),
  );
}

beforeEach(() => {
  requested = [];
  vi.unstubAllGlobals();
});

/* -------------------------------------------------------------------------
 * P13-T01 — the cursor
 * ---------------------------------------------------------------------- */

describe("P13-T01 — the evidence cursor is one contract, shared by 04–08", () => {
  it("defaults a missing hash instead of inventing keys", () => {
    expect(parseCursor("")).toEqual(DEFAULT_CURSOR);
    // A fact the server never published must not appear as a plausible digest.
    expect(parseCursor("#stage=claim").params).toBeNull();
    expect(parseCursor("#stage=claim").trial).toBeNull();
  });

  it("reads every key the spec names", () => {
    const cursor = parseCursor("#stage=execute&fold=4&trial=143&params=prm_7c1a9e&schedule=s1&route=r1&seq=9");
    expect(cursor).toEqual({
      stage: "execute",
      fold: 4,
      trial: 143,
      params: "prm_7c1a9e",
      schedule: "s1",
      route: "r1",
      seq: 9,
    });
  });

  it("drops a key it cannot trust rather than guessing at it", () => {
    expect(parseCursor("#stage=nowhere").stage).toBe("summary");
    expect(parseCursor("#fold=0").fold).toBe(1);
    expect(parseCursor("#fold=-3").fold).toBe(1);
    expect(parseCursor("#trial=abc").trial).toBeNull();
    expect(parseCursor("#params=").params).toBeNull();
  });

  it("writes stage and fold always, and an optional key only when it holds one", () => {
    expect(serializeCursor(DEFAULT_CURSOR)).toBe("#stage=summary&fold=1");
    expect(serializeCursor({ ...DEFAULT_CURSOR, params: "prm_1" })).toContain("params=prm_1");
    expect(serializeCursor(DEFAULT_CURSOR)).not.toContain("params=");
  });

  it("round-trips: a deep dive href carries exactly this cursor back", () => {
    const cursor = parseCursor("#stage=search&fold=3&trial=88&params=prm_9d44f2");
    const href = deepDiveHref("/research/quantbt/runs/R-1/search", cursor);
    expect(parseCursor(href.slice(href.indexOf("#")))).toEqual(cursor);
  });

  it("changes the hash by replacing, never by pushing", () => {
    const replace = vi.spyOn(window.history, "replaceState");
    const push = vi.spyOn(window.history, "pushState");
    const { result } = renderHook(() => useEvidenceCursor());

    act(() => result.current.setStage("claim"));
    expect(result.current.cursor.stage).toBe("claim");
    expect(replace).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    replace.mockRestore();
    push.mockRestore();
  });

  it("keeps the whole cursor when only the stage changes", () => {
    window.location.hash = "#stage=summary&fold=4&trial=143&params=prm_7c1a9e";
    const { result } = renderHook(() => useEvidenceCursor());
    expect(result.current.cursor.fold).toBe(4);

    act(() => result.current.setStage("execute"));
    expect(result.current.cursor).toMatchObject({ stage: "execute", fold: 4, trial: 143, params: "prm_7c1a9e" });
  });

  it("will not step a fold below the first", () => {
    const { result } = renderHook(() => useEvidenceCursor());
    act(() => result.current.setFold(0));
    expect(result.current.cursor.fold).toBe(1);
  });
});

/* -------------------------------------------------------------------------
 * P13-T02 — revision binding
 * ---------------------------------------------------------------------- */

describe("P13-T02 — a series belongs to the revision it was read at", () => {
  it("matches only on two present, identical revisions", () => {
    expect(seriesMatchesHub(hub(), equitySeries())).toBe(true);
    expect(seriesMatchesHub(hub(), equitySeries({ revision: "rev_8" }))).toBe(false);
    // Two unknown revisions are not the same revision.
    expect(seriesMatchesHub(hub({ revision: null }), equitySeries({ revision: null }))).toBe(false);
  });

  it("discards a mismatch, rereads the hub and asks that series again — once", async () => {
    let hubReads = 0;
    let seriesReads = 0;
    stub((url) => {
      if (url.includes("/evidence/series")) {
        seriesReads += 1;
        /* The first answer belongs to an older projection; the second is
           current. */
        return [200, equitySeries({ revision: seriesReads === 1 ? "rev_6" : "rev_7" })];
      }
      hubReads += 1;
      return [200, hub()];
    });

    const { result } = renderHook(() => useEvidence("R-WFO-118"));
    await waitFor(() => expect(result.current.hub).not.toBeNull());
    await act(async () => {
      result.current.ensureSeries("EQUITY_OOS");
    });

    await waitFor(() => expect(result.current.series.get("EQUITY_OOS")?.state).toBe("ready"));
    expect(seriesReads).toBe(2);
    expect(hubReads).toBe(2);
  });

  it("stops at one retry rather than spinning on a mismatch that persists", async () => {
    stub((url) =>
      url.includes("/evidence/series") ? [200, equitySeries({ revision: "rev_6" })] : [200, hub()],
    );

    const { result } = renderHook(() => useEvidence("R-WFO-118"));
    await waitFor(() => expect(result.current.hub).not.toBeNull());
    await act(async () => {
      result.current.ensureSeries("EQUITY_OOS");
    });

    await waitFor(() => expect(result.current.series.get("EQUITY_OOS")?.state).toBe("revision-mismatch"));
    const seriesCalls = requested.filter((url) => url.includes("/evidence/series"));
    expect(seriesCalls.length).toBe(2);
  });
});

/* -------------------------------------------------------------------------
 * P13-T03 — lazy reads
 * ---------------------------------------------------------------------- */

describe("P13-T03 — a series is read when a panel needs it, once", () => {
  it("reads no series on mount", async () => {
    stub(() => [200, hub()]);
    const { result } = renderHook(() => useEvidence("R-WFO-118"));
    await waitFor(() => expect(result.current.hub).not.toBeNull());
    expect(requested.filter((url) => url.includes("/evidence/series"))).toHaveLength(0);
  });

  it("asks once however many panels ask", async () => {
    stub((url) => (url.includes("/evidence/series") ? [200, equitySeries()] : [200, hub()]));
    const { result } = renderHook(() => useEvidence("R-WFO-118"));
    await waitFor(() => expect(result.current.hub).not.toBeNull());

    await act(async () => {
      result.current.ensureSeries("EQUITY_OOS");
      result.current.ensureSeries("EQUITY_OOS");
      result.current.ensureSeries("EQUITY_OOS");
    });
    await waitFor(() => expect(result.current.series.get("EQUITY_OOS")?.state).toBe("ready"));
    expect(requested.filter((url) => url.includes("/evidence/series"))).toHaveLength(1);
  });

  it("names the kind in the query and nothing else the browser made up", async () => {
    stub((url) => (url.includes("/evidence/series") ? [200, equitySeries()] : [200, hub()]));
    const { result } = renderHook(() => useEvidence("R-WFO-118"));
    await waitFor(() => expect(result.current.hub).not.toBeNull());
    await act(async () => result.current.ensureSeries("MONTHLY_RETURNS"));

    const url = requested.find((entry) => entry.includes("/evidence/series")) ?? "";
    expect(url).toContain("kind=MONTHLY_RETURNS");
    expect(url).not.toMatch(/revision|ordinal|table|cursor|path/);
  });

  it("sends the hub's ETag so an unchanged projection costs nothing", async () => {
    const seen: (HeadersInit | undefined)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        seen.push(init?.headers);
        requested.push(url);
        return {
          ok: true,
          status: 200,
          statusText: "200",
          headers: new Headers(),
          json: async () => hub(),
        } as unknown as Response;
      }),
    );

    const { result, rerender } = renderHook(() => useEvidence("R-WFO-118"));
    await waitFor(() => expect(result.current.hub).not.toBeNull());
    await act(async () => result.current.reread());
    await waitFor(() => expect(requested.length).toBeGreaterThan(1));

    expect(seen[0]).toBeUndefined();
    expect(seen[1]).toEqual({ "If-None-Match": '"rev_7"' });
    rerender();
  });

  it("keeps the copy in hand when the server answers 304", async () => {
    let reads = 0;
    stub(() => {
      reads += 1;
      return reads === 1 ? [200, hub()] : [304, null];
    });

    const { result } = renderHook(() => useEvidence("R-WFO-118"));
    await waitFor(() => expect(result.current.hub).not.toBeNull());
    const first = result.current.hub;

    await act(async () => result.current.reread());
    await waitFor(() => expect(reads).toBe(2));
    // Same object: a 304 is not a reason to repaint the screen.
    expect(result.current.hub).toBe(first);
  });
});

/* -------------------------------------------------------------------------
 * P13-T04 — truthful presentation
 * ---------------------------------------------------------------------- */

describe("P13-T04 — the hub renders facts, and names what is missing", () => {
  it("rounds by unit for reading and keeps the server's exact string in the title (DQ-08)", () => {
    const { container } = view();
    const equity = container.querySelector("[data-metric-value='FINAL_EQUITY']");
    expect(equity?.textContent).toBe("128,400.00");
    expect(equity?.getAttribute("title")).toBe("128400.00");
    const drawdown = container.querySelector("[data-metric-value='MAX_DRAWDOWN_FRACTION']");
    expect(drawdown?.textContent).toBe("−9.60%");
    expect(drawdown?.getAttribute("title")).toBe("-0.096");
  });

  it("never turns an unpublished metric into a zero", () => {
    const { container } = view();
    const benchmark = container.querySelector("[data-metric='BENCHMARK_RETURN_FRACTION']");
    expect(benchmark?.textContent).toContain("not published");
    expect(benchmark?.querySelector("[data-metric-value]")).toBeNull();
    expect(benchmark?.textContent).not.toMatch(/\b0(\.0+)?\b/);
  });

  it("shows a certificate only when the server issued one", () => {
    const { container } = view();
    expect(container.querySelector("[data-certificate='B']")).toBeTruthy();
    expect(container.querySelector("[data-certificate='B']")?.getAttribute("title")).toBe(CERT_TOOLTIP);

    cleanup();
    const withoutCert = view({
      hub: hub({
        claim: {
          ...hub().claim,
          methodology_certificate: { state: "NOT_ISSUED", grade: null, issued_at_utc_ms: null, reason_code: "S1_CAP" },
        },
      }),
    });
    expect(withoutCert.container.querySelector("[data-certificate]")).toBeNull();
  });

  it("does not earn a certificate from a claim string alone", () => {
    const { container } = view({
      hub: hub({
        claim: {
          state: "ISSUED",
          text: "STRICT_OUTER_OOS — caps ≤ B",
          cursor: null,
          methodology_certificate: { state: "NOT_PUBLISHED", grade: null, issued_at_utc_ms: null, reason_code: null },
          availability: AVAILABLE,
        },
      }),
    });
    expect(container.querySelector("[data-claim-text]")).toBeTruthy();
    expect(container.querySelector("[data-certificate]")).toBeNull();
  });

  it("distinguishes a series that does not apply from one not published", () => {
    const { container } = view();
    const distribution = container.querySelector("[data-series-panel='RETURN_DISTRIBUTION']");
    expect(distribution?.textContent).toContain("not applicable");
    expect(distribution?.textContent).not.toContain("not published");
  });

  it("keeps the window disclosure verbatim", () => {
    view();
    expect(screen.getByText(WINDOW_DISCLOSURE)).toBeTruthy();
  });

  it("renders an active warning and a not-applicable one differently", () => {
    const { container } = view();
    expect(
      container.querySelector("[data-warning='warn.below_promotion_min_bars']")?.getAttribute("data-warning-state"),
    ).toBe("ACTIVE");
    expect(
      container.querySelector("[data-warning='warn.funding_unmodelled']")?.getAttribute("data-warning-state"),
    ).toBe("NOT_APPLICABLE");
  });

  it("keeps every panel the source does not fill", () => {
    const { container } = view();
    expect(container.querySelector("[data-gap='per-fold-verdict']")).toBeTruthy();
    expect(container.querySelector("[data-gap='behavior-tiles']")).toBeTruthy();
  });

  it("reserves nothing for an rc the contract does not carry", () => {
    const { container } = view();
    expect(container.querySelector("[data-rc]")).toBeNull();
  });
});

/* -------------------------------------------------------------------------
 * P13-T05 — tabs, drawer and keyboard
 * ---------------------------------------------------------------------- */

describe("P13-T05 — seven tabs over one cursor", () => {
  it("marks exactly one tab selected and gives the panel its label", () => {
    const { container } = view({ cursor: { ...DEFAULT_CURSOR, stage: "claim" } });
    expect(container.querySelectorAll("[role='tab']")).toHaveLength(7);
    expect(container.querySelectorAll("[aria-selected='true']")).toHaveLength(1);
    expect(container.querySelector("[data-panel='claim']")).toBeTruthy();
    expect(container.querySelector("[role='tabpanel']")?.getAttribute("aria-labelledby")).toBe("ef-tab-claim");
  });

  it("moves between tabs with the arrow keys", () => {
    const onStage = vi.fn();
    const { container } = view({ onStage });
    fireEvent.keyDown(container.querySelector("[role='tablist']") as Element, { key: "ArrowRight" });
    expect(onStage).toHaveBeenCalledWith("split");
    fireEvent.keyDown(container.querySelector("[role='tablist']") as Element, { key: "End" });
    expect(onStage).toHaveBeenCalledWith("atlas");
  });

  it("sends a claim-strip chip to the tab that owns it", () => {
    const onStage = vi.fn();
    const { container } = view({ onStage });
    fireEvent.click(container.querySelector("[data-certificate='B']") as Element);
    expect(onStage).toHaveBeenCalledWith("claim");
  });

  it("opens the dataset panel and closes it on Escape", async () => {
    const { container } = view();
    fireEvent.click(container.querySelector("[data-action='dataset-panel']") as Element);
    expect(container.querySelector("[data-dataset-panel='dataset']")).toBeTruthy();
    expect(screen.getAllByText("ds_btcusdt_4h").length).toBeGreaterThan(0);

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(container.querySelector("[data-dataset-panel='dataset']")).toBeNull());
  });

  it("states what the panel does not receive rather than drawing a coverage bar", () => {
    const { container } = view();
    fireEvent.click(container.querySelector("[data-action='dataset-panel']") as Element);
    expect(container.querySelector("[data-gap='dataset-coverage']")?.textContent).toContain("not published");
  });

  it("disables the previous-fold step at the first fold", () => {
    const { container } = view();
    expect(
      (container.querySelector("[data-action='fold-previous']") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (container.querySelector("[data-action='fold-next']") as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("carries the cursor into a deep dive it cannot yet open", () => {
    const { container } = view({ cursor: { ...DEFAULT_CURSOR, stage: "search", fold: 4 } });
    expect(container.querySelector("[data-carried-cursor]")?.textContent).toContain("fold=4");
    // P15 opened Screen 06, so this is a link that carries the cursor.
    const dive = container.querySelector("[data-deep-dive='search']");
    expect(dive?.tagName).toBe("A");
    expect(dive?.getAttribute("href")).toContain("/runs/R-WFO-118/search#");
    expect(dive?.getAttribute("href")).toContain("fold=4");
  });
});

/* -------------------------------------------------------------------------
 * P13-T06 — the retained passport
 * ---------------------------------------------------------------------- */

describe("P13-T06 — the retained-source passport is a panel, not the route", () => {
  it("keeps a profile refusal inside its own panel", () => {
    const { container } = view({
      passport: {
        state: "refused",
        refusal: toEvidenceRefusal(
          new PortalApiError("This run is not in the admitted Advanced-WFO profile.", 404, "RESEARCH_CURRENT_SOURCE_NOT_ADMITTED", null),
        ),
      },
    });
    expect(container.querySelector("[data-passport-refusal]")?.textContent).toContain("admitted Advanced-WFO");
    // The rest of the screen is untouched: the hub is still a hub.
    expect(container.querySelector("[data-metrics]")).toBeTruthy();
    expect(container.querySelector("[data-claim-passport]")).toBeTruthy();
  });

  it("reads the passport once", async () => {
    stub((url) =>
      url.includes("/current-source/evidence")
        ? [404, { error: { code: "NOT_ADMITTED", message: "no" } }]
        : [200, hub()],
    );
    const { result } = renderHook(() => useEvidence("R-WFO-118"));
    await waitFor(() => expect(result.current.hub).not.toBeNull());
    await act(async () => {
      result.current.ensurePassport();
      result.current.ensurePassport();
    });
    await waitFor(() => expect(result.current.passport.state).toBe("refused"));
    expect(requested.filter((url) => url.includes("/current-source/"))).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------
 * P13-T07 — refusals
 * ---------------------------------------------------------------------- */

describe("P13-T07 — a refusal keeps the screen", () => {
  it("classifies each status the contract declares", () => {
    const of = (status: number) => toEvidenceRefusal(new PortalApiError("no", status, null, null));
    expect(of(401).state).toBe("denied");
    expect(of(403).state).toBe("denied");
    expect(of(404).state).toBe("terminal");
    expect(of(409).state).toBe("stale");
    expect(of(503).state).toBe("unavailable");
    expect(of(400).state).toBe("terminal");
  });

  it("offers a reread for a revision conflict and not for a denial", () => {
    expect(toEvidenceRefusal(new PortalApiError("no", 409, null, null)).mayRetry).toBe(true);
    expect(toEvidenceRefusal(new PortalApiError("no", 403, null, null)).mayRetry).toBe(false);
  });

  it("keeps the shell and the cursor bar when the hub is refused", () => {
    const { container } = view({
      hub: null,
      state: { state: "denied", reason: "Not your workspace.", mayRetry: false, retainsContent: false },
    });
    expect(container.querySelector("[data-screen='evidence-flow']")).toBeTruthy();
    expect(container.querySelector("[data-cursor-bar]")).toBeTruthy();
    expect(screen.getAllByText("Not your workspace.").length).toBeGreaterThan(0);
  });

  it("sends a run whose evidence has not sealed to the screen that owns it", () => {
    const base = hub();
    const running = {
      ...base,
      readiness: "NOT_READY" as const,
      core: {
        ...base.core,
        run_identity: { ...base.core.run_identity!, status: { value: "RUNNING" as const, availability: AVAILABLE } },
      },
    };
    const { container } = view({ hub: running });
    expect(container.querySelector("[data-not-ready]")).toBeTruthy();
    expect(container.querySelector("[data-action='watch-progress']")?.getAttribute("href")).toBe(
      "/research/quantbt/runs/R-WFO-118/progress",
    );
  });
});

/* -------------------------------------------------------------------------
 * P13-T08 — the boundary
 * ---------------------------------------------------------------------- */

describe("P13-T08 — the surface requests only the four named operations", () => {
  it("names only the published paths", () => {
    const code = codeOf("evidenceClient.ts");
    const paths = [...code.matchAll(/["'`](\/api\/[^"'`$]*)/g)].map((match) => match[1]);
    expect([...new Set(paths)]).toEqual(["/api/v1/quantbt/runs"]);
    expect(code).not.toMatch(/["'`](https?:)?\/\//);
    expect(code).not.toMatch(/\/internal\/|parquet|artifact|journal/i);
  });

  it("declares every series kind the contract publishes and no other", () => {
    expect([...SERIES_KINDS]).toEqual([
      "EQUITY_OOS",
      "MONTHLY_RETURNS",
      "ROLLING_RETURNS_20",
      "RETURN_DISTRIBUTION",
      "ROLLING_SHARPE_63",
      "ROLLING_BETA_63",
    ]);
  });

  it("computes no financial value in the composition", () => {
    const code = codeOf("EvidenceFlow.tsx");
    // `Number(...)` appears only where a chart library needs a plotted point;
    // no arithmetic operator is applied to a server value anywhere.
    expect(code).not.toMatch(/Number\([^)]*\)\s*[-+*/]/);
    expect(code).not.toMatch(/reduce\(/);
    expect(code).not.toMatch(/toFixed\(/);
  });
});

/* -------------------------------------------------------------------------
 * P13-T09 — the run identity amendment
 * ---------------------------------------------------------------------- */

describe("P13-T09 — the header is the Hub's own, fact by fact", () => {
  it("renders the durable status rather than inferring one", () => {
    const { container } = view();
    expect(container.querySelector("[data-run-status='READY']")).toBeTruthy();
    // `READY` is the run's lifecycle word. Nothing rewrites it to COMPLETED.
    expect(container.querySelector("[data-run-status='COMPLETED']")).toBeNull();
  });

  it("does not upgrade a selected route id into a route contract", () => {
    const { container } = view();
    fireEvent.click(container.querySelector("[data-action='dataset-panel']") as Element);
    expect(container.querySelector("[data-header-value='route']")?.textContent).toBe("close_target_v2");
    const contract = container.querySelector("[data-header-fact='route contract'] [data-withheld]");
    expect(contract?.getAttribute("data-withheld")).toBe("NOT_PUBLISHED");
    expect(contract?.getAttribute("title")).toBe("P13_ROUTE_CONTRACT_NOT_PUBLISHED");
  });

  it("treats a deliberately unselected seed as an answer, not a gap", () => {
    const { container } = view();
    fireEvent.click(container.querySelector("[data-action='dataset-panel']") as Element);
    const seed = container.querySelector("[data-header-fact='seed'] [data-withheld]");
    expect(seed?.getAttribute("data-withheld")).toBe("NOT_APPLICABLE");
    expect(seed?.textContent).toContain("not applicable");
    expect(seed?.textContent).not.toContain("not published");
  });

  it("keeps the header when an older responder sends no identity at all", () => {
    const base = hub();
    const { run_identity, ...core } = base.core;
    void run_identity;
    const { container } = view({ hub: { ...base, core } });
    // The shell stands, the run is still named, and nothing was invented.
    expect(container.querySelector("[data-run-header]")).toBeTruthy();
    expect(container.querySelector("[data-run-id]")?.textContent).toBe("R-WFO-118");
    expect(container.querySelector("[data-run-identity]")).toBeNull();
  });
});

describe("P13-T11 — a deep dive is a link once its screen exists", () => {
  /* P17 published Screen 08's route, so the last refused deep dive is a link. */
  it("links all four, including Execute since P17", () => {
    for (const [stage, path] of [
      ["split", "split"],
      ["search", "search"],
      ["freeze", "freeze"],
      ["execute", "execute"],
    ] as const) {
      const { container, unmount } = view({ cursor: { ...DEFAULT_CURSOR, stage } });
      const dive = container.querySelector(`[data-deep-dive='${stage}']`);
      expect(dive?.tagName, stage).toBe("A");
      expect(dive?.getAttribute("href"), stage).toContain(`/runs/R-WFO-118/${path}#`);
      unmount();
    }
  });
});

describe("P13-T10 — the fold selector is bounded by what P11 observed", () => {
  it("counts the observed set and offers exactly its members", () => {
    const { container } = view();
    expect(container.querySelector("[data-fold-bound]")?.textContent).toContain("of 4 observed");
    expect(container.querySelectorAll("[data-fold-select] option")).toHaveLength(4);
  });

  it("steps within the observed set rather than by one", () => {
    const onFold = vi.fn();
    const { container } = view({ cursor: { ...DEFAULT_CURSOR, fold: 3 }, onFold });
    fireEvent.click(container.querySelector("[data-action='fold-next']") as Element);
    // The set is [1,2,3,5]: after 3 comes 5, not 4.
    expect(onFold).toHaveBeenCalledWith(5);
  });

  it("disables both edges at the ends of the observed set", () => {
    const first = view({ cursor: { ...DEFAULT_CURSOR, fold: 1 } });
    expect((first.container.querySelector("[data-action='fold-previous']") as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    const last = view({ cursor: { ...DEFAULT_CURSOR, fold: 5 } });
    expect((last.container.querySelector("[data-action='fold-next']") as HTMLButtonElement).disabled).toBe(true);
  });

  it("disables the controls with the server's reason when no set is published", () => {
    const { container } = view({
      hub: hub({
        core: {
          ...hub().core,
          fold_navigation: {
            observed_folds: [],
            published_fold_count: null,
            availability: { state: "PENDING_SOURCE_CALLBACK", reason_code: "P11_HAS_NOT_OBSERVED_A_FOLD_YET" },
          },
        },
      }),
    });
    expect((container.querySelector("[data-action='fold-next']") as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelector("[data-fold-bound]")?.textContent).toContain("pending source");
    expect(container.querySelector("[data-action='fold-next']")?.getAttribute("title")).toBe(
      "P11_HAS_NOT_OBSERVED_A_FOLD_YET",
    );
  });

  it("says so when the cursor names a fold outside the observed set", () => {
    const { container } = view({ cursor: { ...DEFAULT_CURSOR, fold: 40 } });
    expect(container.querySelector("[data-fold-bound]")?.textContent).toContain("not in the observed set");
    expect((container.querySelector("[data-action='fold-next']") as HTMLButtonElement).disabled).toBe(true);
  });

  it("asks no other screen's operation to bound itself", () => {
    const code = codeOf("EvidenceFlow.tsx") + codeOf("useEvidence.ts") + codeOf("evidenceClient.ts");
    expect(code).not.toMatch(/current-source\/split|researchCurrentSourceSplitGetV1|run-library/);
  });
});

/* -------------------------------------------------------------------------
 * RF-06 — the 2026-09-24 browser audit (AUDIT_P11_P15 §2 P13, FE-S04-01…13)
 * ---------------------------------------------------------------------- */

function withStatus(status: "READY" | "RUNNING" | "CANCELLED" | "FAILED", overrides: Partial<EvidenceHub> = {}): EvidenceHub {
  const base = hub(overrides);
  return {
    ...base,
    core: { ...base.core, run_identity: { ...base.core.run_identity!, status: { value: status, availability: AVAILABLE } } },
  };
}

const NOT_ISSUED_SENTENCE = "The fixed P10 qualification sealed its artifacts but did not issue a release claim.";

function notIssuedHub(): EvidenceHub {
  return hub({
    claim: {
      state: "NOT_ISSUED",
      text: NOT_ISSUED_SENTENCE,
      cursor: null,
      methodology_certificate: {
        state: "NOT_PUBLISHED",
        grade: null,
        issued_at_utc_ms: null,
        reason_code: "SOURCE_DID_NOT_PUBLISH_METHODOLOGY_CERTIFICATE",
      },
      availability: AVAILABLE,
    },
  });
}

describe("RF-06 FE-S04-01 — a claim that was not issued says so", () => {
  it("does not call a NOT_ISSUED claim available, and quotes the server's sentence", () => {
    const { container } = view({ hub: notIssuedHub() });
    const strip = container.querySelector("[data-claim-passport]");
    expect(strip?.textContent).not.toContain("claim — available");
    expect(strip?.querySelector("[data-claim-not-issued]")?.textContent).toContain("NOT_ISSUED");
    expect(strip?.textContent).toContain(NOT_ISSUED_SENTENCE);
    expect(strip?.querySelector("[data-claim-text]")).toBeNull();
  });

  it("styles a NOT_ISSUED sentence on the Claim tab unlike an issued claim", () => {
    const issued = view({ cursor: { ...DEFAULT_CURSOR, stage: "claim" } });
    const issuedQuote = issued.container.querySelector("[data-claim-quote='ISSUED']") as HTMLElement;
    expect(issuedQuote.style.color).toBe("var(--role-holdout)");
    cleanup();
    const notIssued = view({ hub: notIssuedHub(), cursor: { ...DEFAULT_CURSOR, stage: "claim" } });
    const quote = notIssued.container.querySelector("[data-claim-quote='NOT_ISSUED']") as HTMLElement;
    expect(quote.textContent).toBe(NOT_ISSUED_SENTENCE);
    expect(quote.style.color).not.toBe("var(--role-holdout)");
    expect(notIssued.container.querySelector("[data-claim-state]")?.textContent).toBe("NOT_ISSUED");
  });

  it("names a NOT_ISSUED certificate as not issued, not as not applicable", () => {
    const { container } = view({
      hub: hub({
        claim: {
          ...hub().claim,
          methodology_certificate: { state: "NOT_ISSUED", grade: null, issued_at_utc_ms: null, reason_code: "S1_CAP" },
        },
      }),
    });
    const strip = container.querySelector("[data-claim-passport]");
    expect(strip?.querySelector("[data-certificate-state='NOT_ISSUED']")?.textContent).toContain("NOT_ISSUED");
    expect(strip?.textContent).not.toContain("not applicable");
  });
});

describe("RF-06 FE-S04-02 — metric tiles round by unit and keep the exact value", () => {
  const LONG = "-0.001544941240185635450293621818514223089782795749";

  it("prints a 47-digit fraction as a percentage with two decimals, exact in the title", () => {
    const { container } = view({
      hub: hub({ metrics: [metric({ key: "NET_RETURN_FRACTION", label: "net return", unit: "FRACTION", value: LONG })] }),
    });
    const value = container.querySelector("[data-metric-value='NET_RETURN_FRACTION']");
    expect(value?.textContent).toBe("−0.15%");
    expect(value?.getAttribute("title")).toBe(LONG);
    expect(container.textContent).not.toContain("0.0015449412401856354502");
  });

  it("prints a count as an integer and a currency grouped to two decimals", () => {
    const { container } = view({
      hub: hub({
        metrics: [
          metric({ key: "FINAL_EQUITY", value: "19965.998848845535" }),
          metric({ key: "TRADE_COUNT", label: "trades", unit: "COUNT", value: "45" }),
        ],
      }),
    });
    expect(container.querySelector("[data-metric-value='FINAL_EQUITY']")?.textContent).toBe("19,966.00");
    expect(container.querySelector("[data-metric-value='TRADE_COUNT']")?.textContent).toBe("45");
  });

  it("puts the exact string on the clipboard when the tile is copied", () => {
    const { container } = view({
      hub: hub({ metrics: [metric({ key: "NET_RETURN_FRACTION", label: "net return", unit: "FRACTION", value: LONG })] }),
    });
    const setData = vi.fn();
    fireEvent.copy(container.querySelector("[data-metric-value='NET_RETURN_FRACTION']") as Element, {
      clipboardData: { setData },
    });
    expect(setData).toHaveBeenCalledWith("text/plain", LONG);
  });
});

describe("RF-06 FE-S04-04 — the tab card sticks like the HiFi's", () => {
  it("draws the claims as a passport card that does not stick", () => {
    const { container } = view();
    const passport = container.querySelector("[data-claim-passport]") as HTMLElement;
    expect(passport.className).not.toMatch(/sticky/);
    expect(passport.style.background).toBe("var(--paper-raised)");
    expect(container.querySelector("[data-claim-strip]")).toBeNull();
  });

  it("keeps tabs and cursor in one card that slides under the topbar until only the cursor bar shows", async () => {
    const bar = document.createElement("header");
    bar.className = "portal-topbar";
    bar.getBoundingClientRect = () => ({ height: 90, width: 660, top: 0, left: 0, right: 660, bottom: 90, x: 0, y: 0, toJSON: () => ({}) });
    document.body.appendChild(bar);
    const observed: Element[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(private readonly callback: () => void) {}
        observe(element: Element) {
          observed.push(element);
          this.callback();
        }
        disconnect() {}
      },
    );
    const original = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      return this.hasAttribute("data-stage-tabs")
        ? ({ height: 48, width: 900, top: 0, left: 0, right: 900, bottom: 48, x: 0, y: 0, toJSON: () => ({}) } as DOMRect)
        : original.call(this);
    };
    try {
      const { container } = view();
      const card = container.querySelector("[data-stage-card]") as HTMLElement;
      expect(card.querySelector("[role='tablist']")).toBeTruthy();
      expect(card.querySelector("[data-cursor-bar]")).toBeTruthy();
      expect(card.className).toMatch(/(^|\s)sticky(\s|$)/);
      // topbar 90 − tab row 48: jsdom folds the calc() to its result.
      await waitFor(() => expect(card.style.top).toMatch(/^calc\((90px - 48px|42px)\)$/));
    } finally {
      HTMLElement.prototype.getBoundingClientRect = original;
      bar.remove();
    }
  });
});

describe("RF-06 FE-S04-05 — state vocabulary", () => {
  it("renders a 404 as run-not-found with a way back to the Run Library", () => {
    const { container } = view({
      hub: null,
      notFound: true,
      state: { state: "terminal", reason: "Nothing with this id exists in your current workspace.", mayRetry: false, retainsContent: false },
    });
    expect(container.querySelector("[data-run-not-found]")).toBeTruthy();
    expect(container.querySelector("[data-action='open-runs']")?.getAttribute("href")).toBe("/research/quantbt/runs");
    // No cursor for a run that does not exist.
    expect(container.querySelector("[data-cursor-bar]")).toBeNull();
    expect(container.querySelector("[role='tab']")).toBeNull();
  });

  it("does not tell a cancelled run to watch its progress", () => {
    const { container } = view({ hub: withStatus("CANCELLED", { readiness: "NOT_READY" }) });
    const notice = container.querySelector("[data-not-ready]");
    expect(notice?.getAttribute("data-not-ready")).toBe("CANCELLED");
    expect(notice?.textContent).toContain("CANCELLED");
    expect(container.querySelector("[data-action='watch-progress']")).toBeNull();
    expect(notice?.textContent).not.toMatch(/has not sealed its evidence yet/);
  });

  it("keeps strip, header and tabs as shells when the first read is refused", () => {
    for (const refused of [
      { state: "failed-retryable" as const, reason: "This changed while it was being read. Read it again." },
      { state: "unavailable" as const, reason: "The Research service did not answer. Try again." },
    ]) {
      const { container, unmount } = view({ hub: null, state: { ...refused, mayRetry: true, retainsContent: false } });
      expect(container.querySelector("[data-claim-passport]"), refused.state).toBeTruthy();
      expect(container.querySelector("[data-run-header]")?.textContent, refused.state).toContain("R-WFO-118");
      expect(container.querySelectorAll("[role='tab']"), refused.state).toHaveLength(7);
      expect(container.querySelector("[data-action='reread']"), refused.state).toBeTruthy();
      unmount();
    }
  });

  it("exposes a 404 to the route as notFound", async () => {
    stub(() => [404, { error: { code: "RESEARCH_EVIDENCE_NOT_FOUND", message: "Research run was not found." } }]);
    const { result } = renderHook(() => useEvidence("rrun_nope"));
    await waitFor(() => expect(result.current.refusal).not.toBeNull());
    expect(result.current.refusal?.notFound).toBe(true);
    expect(result.current.state.state).toBe("terminal");
  });
});

describe("RF-06 FE-S04-07 — the drawer gives focus back", () => {
  it("returns focus to the dataset chip when Escape closes the panel", async () => {
    const { container } = view();
    const chip = container.querySelector("[data-action='dataset-panel']") as HTMLButtonElement;
    chip.focus();
    fireEvent.click(chip);
    expect(container.querySelector("[data-dataset-panel='dataset']")).toBeTruthy();
    // Focus from inside the panel, as a keyboard reader would be.
    (container.querySelector("[data-action='copy-digest']") as HTMLButtonElement).focus();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(container.querySelector("[data-dataset-panel='dataset']")).toBeNull());
    expect(document.activeElement).toBe(chip);
  });

  it("opens inline under the header, not as a modal drawer, and toggles from the chip", () => {
    const { container } = view();
    const chip = container.querySelector("[data-action='dataset-panel']") as HTMLButtonElement;
    fireEvent.click(chip);
    const panel = container.querySelector("[data-dataset-panel='dataset']") as HTMLElement;
    expect(panel.getAttribute("role")).toBeNull();
    expect(container.querySelector("[role='dialog']")).toBeNull();
    expect(chip.getAttribute("aria-expanded")).toBe("true");
    expect(chip.getAttribute("aria-controls")).toBe(panel.id);
    // The panel follows the header in the page flow, before the claims passport.
    expect(container.querySelector("[data-run-header]")?.nextElementSibling).toBe(panel);
    expect(chip.textContent).toContain("▴");
    fireEvent.click(chip);
    expect(container.querySelector("[data-dataset-panel='dataset']")).toBeNull();
  });

  it("shortens a digest, keeps it whole in the title and copies the whole", () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    const long = "sha256:16cc048b2605839be82718e77ca1c9f0333ed0e5b58317665dc4836ea0b0a5ab";
    const { container } = view({ hub: hub({ core: { ...hub().core, dataset_binding_digest: long } }) });
    fireEvent.click(container.querySelector("[data-action='dataset-panel']") as Element);
    const cell = container.querySelector(`[data-digest='${long}']`) as HTMLElement;
    const shown = cell.querySelector("[data-drawer-value]") as HTMLElement;
    expect(shown.textContent).toBe("sha256:16cc048b2605839b…");
    expect(shown.getAttribute("title")).toBe(long);
    fireEvent.click(cell.querySelector("[data-action='copy-digest']") as Element);
    expect(writeText).toHaveBeenCalledWith(long);
  });
});

describe("RF-06 FE-S04-08 — the Atlas link carries this run's cell", () => {
  it("names the run's mode, schedule and route in the Atlas hash", () => {
    const { container } = view({ cursor: { ...DEFAULT_CURSOR, stage: "atlas" } });
    const href = container.querySelector("[data-action='open-atlas']")?.getAttribute("href") ?? "";
    const params = new URLSearchParams(href.split("#")[1]);
    expect(params.get("run")).toBe("R-WFO-118");
    expect(params.get("route")).toBe("close_target_v2");
    expect(params.get("schedule")).toBe("per_fold_causal");
    expect(params.get("mode")).toBe("mode_1_decay · per_fold_causal");
  });
});

describe("RF-06 FE-S04-09 — the passport refusal names the real cause", () => {
  /* RF-05 CG-P13-09: the cause is the 409's typed `details.lane_state`, not
     the message text (see evidenceFlow.rf05.test.tsx for the text-only case). */
  const pending = () =>
    toEvidenceRefusal(
      new ResearchLaneConflictError(
        "Current QuantBT output is PENDING_RETENTION; a sealed retained artifact is required.",
        409,
        "RESEARCH_CURRENT_SOURCE_CONFLICT",
        "req_1",
        "PENDING_RETENTION",
      ),
    );

  it("says pending retention, not a profile claim", () => {
    const { container } = view({ passport: { state: "refused", refusal: pending() } });
    const panel = container.querySelector("[data-passport-refusal]");
    expect(panel?.querySelector("[data-passport-cause]")?.getAttribute("data-passport-cause")).toBe("PENDING_RETENTION");
    expect(panel?.textContent).toContain("has not been retained yet");
    expect(panel?.textContent).not.toMatch(/Advanced-WFO profile|admits one/);
  });

  it("does not ask the retention lane about a run that never sealed", () => {
    const ensurePassport = vi.fn();
    const { container } = view({ hub: withStatus("CANCELLED", { readiness: "NOT_READY" }), ensurePassport });
    expect(ensurePassport).not.toHaveBeenCalled();
    expect(container.querySelector("[data-passport-cause='NOT_RETAINABLE']")?.textContent).toContain("CANCELLED");
  });
});

describe("RF-06 FE-S04-10 — an empty series says it is empty", () => {
  it("gives an answered MONTHLY_RETURNS with no points an empty-state sentence", () => {
    const monthly: EvidenceSeries = {
      ...equitySeries(),
      kind: "MONTHLY_RETURNS",
      source_sample: { source_observation_count: 744, emitted_point_count: 0, sampling: "FULL" },
      values: [],
    };
    const { container } = view({ series: new Map([["MONTHLY_RETURNS", { state: "ready", series: monthly }]]) });
    const panel = container.querySelector("[data-series-panel='MONTHLY_RETURNS']");
    expect(panel?.getAttribute("data-series-state")).toBe("empty");
    expect(panel?.querySelector("[data-series-empty]")?.textContent).toContain("no calendar month");
  });
});

describe("RF-06 FE-S04-11 — durable strings are rendered exactly", () => {
  it("prints status, readiness, input scope, metric scope and stage state as sent", () => {
    const { container } = view();
    expect(container.querySelector("[data-run-status]")?.textContent).toBe("READY");
    expect(container.querySelector("[data-readiness]")?.textContent).toContain("COMPLETE");
    fireEvent.click(container.querySelector("[data-action='dataset-panel']") as Element);
    expect(container.querySelector("[data-header-value='input scope']")?.textContent).toBe(
      "P08_OPTIONAL_WARMUP_PLUS_IS_OOS_ONLY",
    );
    // The foot words are a lookup of the enums; the enums themselves ride in the title.
    const foot = container.querySelector("[data-metric='FINAL_EQUITY'] [data-metric-scope]");
    expect(foot?.textContent).toBe("oos · currency · engine-direct");
    expect(foot?.getAttribute("title")).toContain("OOS · CURRENCY · ENGINE_DIRECT");
    cleanup();
    const split = view({ cursor: { ...DEFAULT_CURSOR, stage: "split" } });
    expect(split.container.querySelector("[data-stage-state]")?.textContent).toBe("DONE");
  });
});

describe("RF-06 FE-S04-12 — the chart library is not in the route chunk", () => {
  it("reaches ECharts only through a lazy import", () => {
    const code = codeOf("EvidenceFlow.tsx");
    expect(code).not.toMatch(/from\s+["'](\.\.\/charts\/EChart|echarts[^"']*|\.\/EvidenceCharts)["']/);
    expect(code).toMatch(/lazy\(\(\) => import\("\.\/EvidenceCharts"\)/);
  });

  it("keeps the chart's height while the chart chunk loads", async () => {
    const { container } = view({ series: new Map([["EQUITY_OOS", { state: "ready", series: equitySeries() }]]) });
    const placeholder = container.querySelector("[data-chart-loading]") as HTMLElement;
    expect(placeholder.style.height).toBe("380px");
    await waitFor(() => expect(container.querySelector("[data-chart='equity']")).toBeTruthy(), { timeout: 15_000 });
    expect(container.querySelector("[data-chart-table='equity']")?.textContent).toContain("128400.00");
  }, 20_000);
});

describe("RF-06 FE-S04-12 — Summary keeps its charts across a tab switch", () => {
  it("hides the Summary panel on another tab instead of unmounting it, and shows it again", () => {
    const ensureSeries = vi.fn();
    const props = { series: new Map([["EQUITY_OOS", { state: "ready", series: equitySeries() }]]) as never, ensureSeries };
    const { container, rerender } = view(props);
    const kept = container.querySelector("[data-panel-kept='summary']");
    expect(kept).toBeTruthy();
    const rerenderAt = (stage: EvidenceCursor["stage"]) =>
      rerender(
        <MemoryRouter>
          <EvidenceFlow
            runId="R-WFO-118"
            hub={hub()}
            state={OK}
            cursor={{ ...DEFAULT_CURSOR, stage }}
            onStage={vi.fn()}
            onFold={vi.fn()}
            onResetCursor={vi.fn()}
            series={props.series}
            ensureSeries={ensureSeries}
            passport={{ state: "idle" }}
            ensurePassport={vi.fn()}
            onReread={vi.fn()}
          />
        </MemoryRouter>,
      );
    rerenderAt("claim");
    expect(container.querySelector("[data-panel-kept='summary']")).toBe(kept);
    expect((kept as HTMLElement).hidden).toBe(true);
    expect(container.querySelector("[data-panel='claim']")).toBeTruthy();
    rerenderAt("summary");
    expect(container.querySelector("[data-panel-kept='summary']")).toBe(kept);
    expect((kept as HTMLElement).hidden).toBe(false);
  });
});

describe("RF-06 FE-S04-13 — the HiFi layout", () => {
  it("has no extra page title and names the tab in the HiFi grammar", () => {
    const { container } = view();
    expect(container.querySelector("h1")).toBeNull();
    const summary = container.querySelector("[data-tab='summary']");
    expect(summary?.textContent).toContain("Summary");
    expect(summary?.querySelector("[data-tab-sub]")?.textContent).toBe("4 of 5 metrics · 4 series");
  });

  it("keeps an absent claim field in the passport with its label and reason", () => {
    const { container } = view();
    for (const name of ["validation_claim", "chronological_claim", "oos_used_for_selection", "holdout_state", "causality_claim", "runtime authority"]) {
      const field = container.querySelector(`[data-claim-field='${name}']`);
      expect(field?.textContent, name).toContain(name);
      expect(field?.textContent, name).toContain("not published");
    }
  });

  it("gives each stage tab its HiFi heading and honest panel shells", () => {
    const { container } = view({ cursor: { ...DEFAULT_CURSOR, stage: "freeze" } });
    expect(container.querySelector("[data-tab-heading]")?.textContent).toContain(
      "Stage 3 · Freeze — the hinge between Search and Execute",
    );
    const shells = container.querySelectorAll("[data-stage-shells='freeze'] [data-gap]");
    expect(shells.length).toBe(2);
    for (const shell of shells) expect(shell.textContent).toContain("not published");
  });

  it("links the built report and the P21 release candidate composer", () => {
    const { container } = view({ cursor: { ...DEFAULT_CURSOR, stage: "claim" } });
    const report = container.querySelector('[data-action="generate-report"]');
    expect(report?.tagName).toBe("A");
    expect(report?.getAttribute("href")).toContain("/report");
    const rc = container.querySelector('[data-action="release-candidate"]');
    expect(rc?.tagName).toBe("A");
    expect(rc?.getAttribute("href")).toMatch(/\/release-candidate$/);
  });
});

/* -------------------------------------------------------------------------
 * RF-06 fidelity pass — HiFi look, spec behaviour (DQ-02)
 * ---------------------------------------------------------------------- */

describe("RF-06 fidelity — cursor bar", () => {
  it("offers the fold dropdown even for a single observed fold, holding exactly the observed set", () => {
    const { container } = view({
      hub: hub({ core: { ...hub().core, fold_navigation: { observed_folds: [1], published_fold_count: 1, availability: AVAILABLE } } }),
    });
    const select = container.querySelector("[data-fold-select]") as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect([...select.options].map((option) => option.value)).toEqual(["1"]);
    expect(select.disabled).toBe(false);
  });

  it("moves the cursor when a fold is picked from the dropdown", () => {
    const onFold = vi.fn();
    const { container } = view({ onFold });
    fireEvent.change(container.querySelector("[data-fold-select]") as Element, { target: { value: "5" } });
    expect(onFold).toHaveBeenCalledWith(5);
  });

  it("disables the dropdown with the server's reason when no set is published", () => {
    const { container } = view({
      hub: hub({
        core: {
          ...hub().core,
          fold_navigation: {
            observed_folds: [],
            published_fold_count: null,
            availability: { state: "PENDING_SOURCE_CALLBACK", reason_code: "P11_HAS_NOT_OBSERVED_A_FOLD_YET" },
          },
        },
      }),
    });
    const select = container.querySelector("[data-fold-select]") as HTMLSelectElement;
    expect(select.disabled).toBe(true);
    expect(select.getAttribute("title")).toBe("P11_HAS_NOT_OBSERVED_A_FOLD_YET");
  });

  it("reads the observed bound aloud and shows it only when it adds something", () => {
    const quiet = view();
    expect(quiet.container.querySelector("[data-fold-bound]")?.className).toBe("sr-only");
    cleanup();
    const loud = view({ cursor: { ...DEFAULT_CURSOR, fold: 40 } });
    expect(loud.container.querySelector("[data-fold-bound]")?.className).not.toBe("sr-only");
  });

  it("carries seq, schedule and window chips, saying not published where the Hub is silent", () => {
    const { container } = view();
    expect(container.querySelector("[data-cursor-seq]")?.textContent).toContain("not published");
    expect(container.querySelector("[data-cursor-schedule]")?.textContent).toContain("per_fold_causal");
    expect(container.querySelector("[data-cursor-window]")?.textContent).toContain("oos");
    cleanup();
    const withSeq = view({ cursor: { ...DEFAULT_CURSOR, seq: 92200 } });
    expect(withSeq.container.querySelector("[data-cursor-seq]")?.textContent).toContain("92200");
  });
});

describe("RF-06 fidelity — window switcher and tiles", () => {
  it("draws the window choices as buttons, only OOS live, each refused one titled", () => {
    const { container } = view();
    const buttons = [...container.querySelectorAll("[data-window-switcher] [data-segment]")] as HTMLButtonElement[];
    expect(buttons.map((button) => button.textContent)).toEqual(["IS", "OOS", "Holdout Live", "Compare", "Capital", "Rebased 100"]);
    for (const button of buttons) {
      expect(button.tagName).toBe("BUTTON");
      const live = button.textContent === "OOS" || button.textContent === "Capital";
      expect(button.disabled, button.textContent ?? "").toBe(!live);
      expect(button.getAttribute("title"), button.textContent ?? "").toBeTruthy();
    }
    expect(container.querySelector("[data-capital-toggle]")).toBeTruthy();
  });

  it("lays tiles five to a row, never under 150px", () => {
    const { container } = view();
    expect((container.querySelector("[data-metrics]") as HTMLElement).style.gridTemplateColumns).toContain(
      "calc((100% - 32px) / 5)",
    );
  });

  it("maps each unit enum to its word and never prints a currency code", () => {
    const { container } = view();
    const foot = (key: string) => container.querySelector(`[data-metric='${key}'] [data-metric-scope]`)?.textContent;
    expect(foot("FINAL_EQUITY")).toBe("oos · currency · engine-direct");
    expect(foot("NET_RETURN_FRACTION")).toBe("oos · percent · engine-direct");
    expect(foot("TRADE_COUNT")).toBe("is + oos · count · engine-direct");
    expect(container.querySelector("[data-metrics]")?.textContent).not.toMatch(/USD|\$/);
  });

  it("prints a negative currency with the screen's one minus sign", () => {
    const { container } = view({ hub: hub({ metrics: [metric({ value: "-1250.5" })] }) });
    const value = container.querySelector("[data-metric-value='FINAL_EQUITY']");
    expect(value?.textContent).toBe("−1,250.50");
    expect(value?.getAttribute("title")).toBe("-1250.5");
  });
});

describe("RF-06 fidelity — summary panels", () => {
  it("draws equity and underwater as two figures labelled EChart 1 and 2", () => {
    const { container } = view();
    const figures = [...container.querySelectorAll("figure[data-series-panel='EQUITY_OOS']")];
    expect(figures).toHaveLength(2);
    expect(figures.map((figure) => figure.querySelector("[data-chart-no]")?.textContent)).toEqual(["EChart 1", "EChart 2"]);
    expect(figures[1].textContent).toContain("Underwater — drawdown derived from equity");
  });

  it("puts the provenance row under EChart 1, each cell a fact or its absence", () => {
    const { container } = view({ series: new Map([["EQUITY_OOS", { state: "ready", series: equitySeries() }]]) });
    const row = container.querySelector("[data-provenance='EQUITY_OOS']");
    const cell = (label: string) => row?.querySelector(`[data-provenance-cell='${label}']`)?.textContent ?? "";
    expect(cell("source")).toContain("EQUITY_OOS");
    expect(cell("segment")).toContain("not published");
    expect(cell("units")).toContain("not published");
    expect(cell("timezone")).toContain("UTC");
    expect(cell("as-of")).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}Z/);
    expect(cell("digest")).toContain("not published");
  });

  it("keeps the per-fold verdict table with the HiFi's nine columns and no invented row", () => {
    const { container } = view();
    const table = container.querySelector("[data-gap='per-fold-verdict']");
    expect([...(table?.querySelectorAll("th") ?? [])].map((th) => th.textContent)).toEqual([
      "fold",
      "OOS sharpe",
      "Δ decay",
      "trades",
      "max dd",
      "contribution",
      "worst moment",
      "verdict",
      "open",
    ]);
    expect(table?.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(table?.querySelector("tbody")?.textContent).toContain("not published");
  });

  it("keeps the monthly and behaviour cards in the HiFi label header", () => {
    const { container } = view();
    expect(container.querySelector("[data-series-panel='MONTHLY_RETURNS'] h3")?.textContent).toBe(
      "monthly returns — stitched OOS",
    );
    expect(container.querySelectorAll("[data-behavior-tile]")).toHaveLength(8);
  });

  it("stamps the header's created instant with Z, as the HiFi does", () => {
    const { container } = view();
    expect(container.querySelector("[data-created]")?.textContent).toMatch(/created \d{4}-\d{2}-\d{2} \d{2}:\d{2}Z$/);
  });

  it("colours the status pill with its own tone", () => {
    const { container } = view();
    const pill = container.querySelector("[data-run-status='READY']") as HTMLElement;
    expect(pill.style.color).toBe("var(--good)");
    expect(pill.style.background).toBe("var(--good-bg)");
  });
});

describe("RF-06 fidelity — claim tab next card", () => {
  it("draws linked report as primary and the release candidate as the outline action", () => {
    const { container } = view({ cursor: { ...DEFAULT_CURSOR, stage: "claim" } });
    const report = container.querySelector('[data-action="generate-report"]') as HTMLElement;
    expect(report.tagName).toBe("A");
    expect(report.style.background).toBe("var(--accent)");
    const rc = container.querySelector('[data-action="release-candidate"]') as HTMLElement;
    expect(rc.tagName).toBe("A");
    expect(rc.style.background).toBe("transparent");
    expect(container.querySelectorAll("[data-soon-hook] button[disabled]")).toHaveLength(2);
  });
});

/* -------------------------------------------------------------------------
 * W3 — Screen 04 on a real retained WFO run (CG-P13-05/07/08)
 *
 * The retained bodies are what the Control API serves for the real QuantBT
 * 1.1.1 Delta WFO on BTCUSDT 1h (`w3RealWfo.fixture.json`).
 * ---------------------------------------------------------------------- */

const W3 = JSON.parse(readFileSync(join(process.cwd(), "src", "research", "w3RealWfo.fixture.json"), "utf8")) as {
  evidence: CurrentSourceEvidence;
  series: CurrentSourceEvidenceSeries;
};
const retainedPassport = { state: "ready" as const, evidence: W3.evidence };

describe("W3 — a sealed retained WFO run fills the claim strip (CG-P13-07)", () => {
  it("asks the retained lane on mount, from the hub level, not only when Summary is open", () => {
    const ensurePassport = vi.fn();
    view({ ensurePassport, cursor: { ...DEFAULT_CURSOR, stage: "claim" } });
    expect(ensurePassport).toHaveBeenCalled();
  });

  it("prints QuantBT's own claim tokens, each jumping to its stage; the WFO holdout reads n/a", () => {
    const onStage = vi.fn();
    const { container } = view({ passport: retainedPassport, onStage });
    const value = (name: string) => container.querySelector(`[data-claim-field='${name}']`)?.getAttribute("data-claim-value");
    expect(value("validation_claim")).toBe("walk_forward_oos");
    expect(value("chronological_claim")).toBe("not_causal_multi_fold_global_calibration");
    expect(value("oos_used_for_selection")).toBe("true");
    expect(value("causality_claim")).toBe("retrospective_global_calibration");
    expect(value("execution_contract")).toBe("close_target_v2");
    expect(value("runtime authority")).toBe("native_vectorized");
    expect(container.querySelector("[data-claim-field='holdout_state'] [data-claim-na]")?.textContent).toBe("n/a");
    // No "not published" shell remains for a fact the lane answered.
    expect(container.querySelectorAll("[data-claim-field='validation_claim']")).toHaveLength(1);
    fireEvent.click(container.querySelector("[data-claim-field='oos_used_for_selection'] button") as Element);
    expect(onStage).toHaveBeenCalledWith("search");
  });

  it("keeps the P04 lane's shells when the lane answered not applicable", () => {
    const { container } = view({
      passport: {
        state: "not-applicable",
        answer: {
          schema_version: "research.current-source-not-applicable.v1",
          read_authority: "PORTAL_RETAINED_CURRENT_SOURCE",
          run_id: "R-WFO-118",
          revision: "rs02_not-applicable_" + "a".repeat(64),
          etag: '"rs02_not-applicable_' + "a".repeat(64) + '"',
          availability: { state: "NOT_APPLICABLE", reason_code: "RS02_RETAINED_LANE_NOT_APPLICABLE_TO_P04_FIXED_QUALIFICATION" },
          lane: {
            state: "NOT_APPLICABLE",
            operation: "evidence",
            run_profile: "P04_FIXED_QUALIFICATION",
            run_adapter_contract_digest: "9".repeat(64),
            retainable_profile_id: "rs02.delta-wfo-global.v1",
            reason_code: "RS02_RETAINED_LANE_NOT_APPLICABLE_TO_P04_FIXED_QUALIFICATION",
          },
        },
      },
    });
    expect(container.querySelector("[data-claim-field='validation_claim']")?.getAttribute("data-withheld")).toBe("NOT_PUBLISHED");
    expect(container.querySelector("[data-retained-verdicts]")).toBeNull();
    expect(container.querySelector("[data-gap='per-fold-verdict']")).toBeTruthy();
  });
});

describe("W3 — per-fold verdicts from the server rule (CG-P13-08)", () => {
  it("renders the HiFi columns worst first, formatted, with the server's verdict chips", () => {
    const { container } = view({ passport: retainedPassport });
    const table = container.querySelector("[data-retained-verdicts='AVAILABLE']") as HTMLElement;
    expect(table).toBeTruthy();
    expect(table.querySelector("[data-verdict-summary]")?.textContent).toContain("2 DRAG · 0 WARN · 0 PASS — OOS −5.35, decay +3.91");
    const rows = [...table.querySelectorAll("[data-verdict-row]")];
    expect(rows.map((row) => row.getAttribute("data-verdict-row"))).toEqual(["0", "1"]);
    const cells = [...rows[0]!.querySelectorAll("td")].map((cell) => cell.textContent?.trim());
    expect(cells.slice(0, 6)).toEqual(["fold_01", "−7.80", "+7.44", "5", "−0.38%", "−0.34%"]);
    expect(cells[6]).toMatch(/^−0\.16% single bar · 2026-07-\d\d \d\d:\d\dZ$/);
    expect(rows[0]!.querySelector("[data-verdict-chip]")?.textContent).toBe("DRAG");
    // The exact server string rides in the title; the bar is clamped, not negative.
    expect(rows[0]!.querySelector("[data-exact]")?.getAttribute("data-exact")).toBe("-7.799572637865059");
    expect(rows[0]!.querySelector("[data-oos-bar]")?.getAttribute("data-oos-bar")).toBe("0");
    expect(table.querySelector("[data-verdict-foot]")?.textContent).toContain("research.fold-verdict.v1");
  });

  it("moves the cursor on a row click and reorders by fold without refetching", () => {
    const onFold = vi.fn();
    const { container } = view({ passport: retainedPassport, onFold });
    fireEvent.click(container.querySelector("[data-verdict-row='1']") as Element);
    expect(onFold).toHaveBeenCalledWith(2);
    fireEvent.click(container.querySelector("[data-verdict-sort='fold']") as Element);
    expect([...container.querySelectorAll("[data-verdict-row]")].map((row) => row.getAttribute("data-verdict-row"))).toEqual(["0", "1"]);
    const search = container.querySelector("[data-verdict-row='0'] [data-verdict-open='search']") as HTMLAnchorElement;
    expect(search.getAttribute("href")).toContain("/search#");
    expect(search.getAttribute("href")).toContain("fold=1");
  });

  it("a seal without per-fold facts reads 'not published', never 0", () => {
    const evidence = JSON.parse(JSON.stringify(W3.evidence)) as CurrentSourceEvidence;
    evidence.fold_verdicts = {
      ...evidence.fold_verdicts,
      state: "NOT_PUBLISHED",
      reason_code: "RS02_SEAL_PREDATES_W3_SOURCE_FACTS_V1",
      availability: { state: "NOT_PUBLISHED", reason_code: "RS02_SEAL_PREDATES_W3_SOURCE_FACTS_V1" },
      counts: { folds: 2, pass: 0, warn: 0, drag: 0, not_evaluated: 2 },
      mean_oos_sharpe: null,
      mean_decay: null,
      rows: evidence.fold_verdicts.rows.map((row) => ({
        ...row, oos_sharpe: null, is_sharpe: null, decay: null, oos_trades: null, max_drawdown_fraction: null,
        return_fraction: null, worst_return_fraction: null, worst_at_utc_ms: null, observation_count: null,
        verdict: "NOT_EVALUATED" as const, failed_criteria: [], drag_target: null,
        reason_code: "RS02_RETAINED_ROW_PREDATES_W3_FACT_BLOCK_V1",
      })),
    };
    const { container } = view({ passport: { state: "ready", evidence } });
    const table = container.querySelector("[data-retained-verdicts]") as HTMLElement;
    expect(table.textContent).not.toMatch(/\b0\.00\b|\+0\.00%/);
    expect(table.querySelectorAll("[data-verdict-chip='NOT_EVALUATED']")).toHaveLength(2);
    expect(table.textContent).toContain("not published");
  });
});

describe("W3 — the retained equity is drawn at full resolution (CG-P13-05)", () => {
  it("asks for the retained series, not the Hub's, and captions the whole relation with its extrema", () => {
    const ensureRetainedSeries = vi.fn();
    const ensureSeries = vi.fn();
    const { container } = view({
      passport: retainedPassport,
      retainedSeries: { state: "ready", series: W3.series },
      ensureRetainedSeries,
      ensureSeries,
    });
    expect(ensureRetainedSeries).toHaveBeenCalled();
    expect(ensureSeries).not.toHaveBeenCalledWith("EQUITY_OOS");
    const caption = container.querySelector("[data-retained-sampling='FULL']") as HTMLElement;
    expect(caption.textContent).toContain("all 1,056 retained observations");
    expect(caption.querySelector("[data-envelope]")?.textContent).toContain("deepest drawdown −0.67%");
    expect(container.querySelector("[data-fold-boundaries]")?.getAttribute("data-fold-boundaries")).toBe("2");
    expect(container.querySelector("[data-series-panel='EQUITY_OOS']")).toBeNull();
  });
});

/* -------------------------------------------------------------------------
 * W3b — Screen 04 reads the retained lane, not the P04 hub, on a WFO run
 *
 * The hub body is the one the preview served for the same run
 * (`w3bRealWfo.fixture.json` hub_evidence): NOT_PUBLISHED with
 * P13_SOURCE_EVIDENCE_NOT_PUBLISHED everywhere. None of that may reach the
 * screen once the retained lane answered.
 * ---------------------------------------------------------------------- */

const W3B = JSON.parse(readFileSync(join(process.cwd(), "src", "research", "w3bRealWfo.fixture.json"), "utf8")) as {
  hub_evidence: React.ComponentProps<typeof EvidenceFlow>["hub"] & object;
  progress: import("./progressClient").ProgressRead;
  requested_spec: import("./progressClient").RunRequestedSpec;
  series_monthly: CurrentSourceEvidenceSeries;
  series_distribution: CurrentSourceEvidenceSeries;
};
const W3B_IDENTITY = {
  state: "ready" as const,
  identity: { progress: W3B.progress, requested: W3B.requested_spec },
};

describe("W3b — S04 on the retained lane (real hub + retained bodies)", () => {
  it("fills the tiles the passport publishes, labels them source-derived, and keeps retained absences", () => {
    const { container } = view({ hub: W3B.hub_evidence, passport: retainedPassport, runIdentity: W3B_IDENTITY });
    const exact = (key: string) => container.querySelector(`[data-metric-value='${key}']`)?.getAttribute("data-exact");
    const shown = (key: string) => container.querySelector(`[data-metric-value='${key}']`)?.textContent;
    expect(exact("FINAL_EQUITY")).toBe(W3.evidence.passport.final_equity);
    expect(shown("FINAL_EQUITY")).toBe("19,926.51");
    expect(shown("INITIAL_EQUITY")).toBe("20,000.00");
    expect(shown("NET_RETURN_FRACTION")).toBe("−0.37%");
    expect(shown("MAX_DRAWDOWN_FRACTION")).toBe("−0.67%");
    expect(shown("BARS_PROCESSED")).toBe("1,056");
    expect(shown("OOS_SHARPE")).toBe("−5.35");
    expect(container.querySelector("[data-metric='FINAL_EQUITY'] [data-metric-scope]")?.textContent).toContain("source-derived");
    // A tile the lane has no field for names the lane; the benchmark tile carries the lane's own reason.
    expect(container.querySelector("[data-metric='OOS_SORTINO'] [data-withheld]")?.getAttribute("data-reason-code")).toBe(
      "UI_RETAINED_LANE_HAS_NO_FIELD",
    );
    expect(container.querySelector("[data-metric='BENCHMARK_RETURN_FRACTION'] [data-withheld]")?.getAttribute("data-reason-code")).toBe(
      "QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_BENCHMARK_SERIES",
    );
  });

  it("shows no P04-hub banner or reason code once the retained seal is READY", () => {
    const { container } = view({ hub: W3B.hub_evidence, passport: retainedPassport, runIdentity: W3B_IDENTITY });
    expect(container.querySelector("[data-not-ready]")).toBeNull();
    expect(container.querySelector("[data-readiness]")?.getAttribute("data-readiness")).toBe("READY");
    expect(container.innerHTML).not.toMatch(/P13_SOURCE_EVIDENCE_NOT_PUBLISHED|P13_PUBLISHES_NO_BEHAVIOR_ANALYTIC/);
    expect(container.textContent).not.toContain("This run published no sealed evidence");
    // The engine is the retained provenance's, not "engine — not published".
    expect(container.querySelector("[data-engine]")?.getAttribute("data-engine")).toBe("1.1.1");
    // Global schedule: the cursor shows the one selection every fold froze.
    expect(container.querySelector("[data-cursor-trial] [data-cursor-lane='global']")?.textContent).toContain("#1");
  });

  it("never claims READY before the progress read answered", () => {
    const { container } = view({ hub: W3B.hub_evidence, passport: retainedPassport });
    expect(container.querySelector("[data-readiness]")?.getAttribute("data-readiness")).toBe("not read");
  });

  it("reads the retained derived series: monthly strip, distribution; rolling Sharpe/beta keep the lane's absences", async () => {
    const ensureRetainedKind = vi.fn();
    const retainedKinds = new Map([
      ["MONTHLY_RETURNS", { state: "ready" as const, series: W3B.series_monthly }],
      ["RETURN_DISTRIBUTION", { state: "ready" as const, series: W3B.series_distribution }],
    ]) as NonNullable<React.ComponentProps<typeof EvidenceFlow>["retainedKinds"]>;
    const { container } = view({
      hub: W3B.hub_evidence,
      passport: retainedPassport,
      runIdentity: W3B_IDENTITY,
      retainedKinds,
      ensureRetainedKind,
    });
    expect(ensureRetainedKind).toHaveBeenCalledWith("ROLLING_RETURNS_20");
    expect(container.querySelector("[data-month='2026-07'] [data-month-value]")?.textContent).toBe("−0.37%");
    const distribution = container.querySelector("[data-series-panel='RETURN_DISTRIBUTION']");
    expect(distribution?.getAttribute("data-series-state")).toBe("ready");
    expect(distribution?.querySelector("[data-sampling]")?.getAttribute("data-sampling")).toBe("FULL_RETURN_HISTOGRAM_V2");
    expect(container.querySelector("[data-series-panel='ROLLING_SHARPE_63'] [data-absence-note]")?.getAttribute("data-reason-code")).toBe(
      "UI_RETAINED_LANE_HAS_NO_SERIES",
    );
    expect(container.querySelector("[data-series-panel='ROLLING_BETA_63'] [data-absence-note]")?.getAttribute("data-reason-code")).toBe(
      "QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_BENCHMARK_SERIES",
    );
    // The lazy chart chunk settles before the test ends (console guard).
    await waitFor(() => expect(container.querySelector("[data-chart-table='distribution']")).toBeTruthy(), { timeout: 15_000 });
  }, 20_000);

  it("leaves a run the lane never answered on the hub: hub tiles and the hub's banner", () => {
    const { container } = view({ hub: W3B.hub_evidence });
    expect(container.querySelector("[data-metric-lane='retained']")).toBeNull();
    expect(container.querySelector("[data-not-ready]")?.getAttribute("data-not-ready")).toBe("COMPLETED");
  });
});
