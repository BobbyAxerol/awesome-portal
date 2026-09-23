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
  type EvidenceHub,
  type EvidenceSeries,
  type Metric,
} from "./evidenceClient";
import {
  DEFAULT_CURSOR,
  deepDiveHref,
  parseCursor,
  serializeCursor,
  useEvidenceCursor,
} from "./evidenceCursor";
import { useEvidence } from "./useEvidence";
import { PortalApiError } from "../lib/api";
import { researchState } from "./state";

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
  it("prints the server's exact decimal string, not a reformatted number", () => {
    view();
    expect(screen.getByText("128400.00")).toBeTruthy();
    expect(screen.getByText("-0.096")).toBeTruthy();
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

  it("opens the dataset drawer and closes it on Escape", async () => {
    const { container } = view();
    fireEvent.click(container.querySelector("[data-action='dataset-drawer']") as Element);
    expect(container.querySelector("[data-drawer='dataset']")).toBeTruthy();
    expect(screen.getByText("ds_btcusdt_4h")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(container.querySelector("[data-drawer='dataset']")).toBeNull());
  });

  it("states what the drawer does not receive rather than drawing a coverage bar", () => {
    const { container } = view();
    fireEvent.click(container.querySelector("[data-action='dataset-drawer']") as Element);
    expect(container.querySelector("[data-gap='dataset-coverage']")).toBeTruthy();
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
    expect(container.querySelector("[data-claim-strip]")).toBeTruthy();
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
    expect(of(404).state).toBe("empty");
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
    const { container } = view({ hub: hub({ readiness: "NOT_READY" }) });
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
    expect(container.querySelector("[data-header-value='route']")?.textContent).toBe("close_target_v2");
    const contract = container.querySelector("[data-header-fact='route contract'] [data-withheld]");
    expect(contract?.getAttribute("data-withheld")).toBe("NOT_PUBLISHED");
    expect(contract?.getAttribute("title")).toBe("P13_ROUTE_CONTRACT_NOT_PUBLISHED");
  });

  it("treats a deliberately unselected seed as an answer, not a gap", () => {
    const { container } = view();
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
