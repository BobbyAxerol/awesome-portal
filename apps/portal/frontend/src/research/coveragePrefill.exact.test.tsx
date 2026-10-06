/**
 * S02_PREFILL — the outer bounds a symbol's coverage prefills are, on a v2 catalog that serves
 * `coverage_by_timeframe` for the CHOSEN timeframe, that timeframe's exact bar edges (UTC, as served:
 * the first bar, and the end of the last closed bar), not month edges. Month edges stay the fallback
 * everywhere else (v1, no entry for the timeframe, a not-published entry, a non-UTC dataset).
 *
 * Fixtures are read at run time from the repo root with `readFileSync`, never imported.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useCallback, useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RegistryListResponse } from "./alphaImportClient";
import type { AtlasDocument } from "./atlas";
import { normalizeCatalog } from "./dataDeclarationV2";
import { type DatasetCatalog, resetDatasetRouteMemory } from "./datasetClient";
import { NewRun } from "./NewRun";
import { NewRunRoute, constraintsFrom, emptyDraft } from "./NewRunRoute";
import { type CoveragePlan, type RunDraft, applyCoveragePrefill, planCoverage } from "./runDraft";
import { researchState } from "./state";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetDatasetRouteMemory();
});

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(ROOT, "packages/contracts/fixtures", name), "utf8")) as T;
}

const V2 = fixture<DatasetCatalog>("research-dataset-catalog.v2.healthy.valid.json");
const V1 = fixture<DatasetCatalog>("research-preflight.dataset-catalog.valid.json");
const ATLAS_RESPONSE = fixture<{ atlas: AtlasDocument }>("research-foundation.atlas-current.valid.json");
const ATLAS = ATLAS_RESPONSE.atlas;
const REGISTRY = fixture<RegistryListResponse>("research-alpha-import.registry.valid.json");
const ALPHA = REGISTRY.entries[0]!;
const LIMITS = constraintsFrom(ATLAS, REGISTRY.entries, ALPHA.alpha_version_id);
const OK = researchState({ kind: "ok", rowCount: 1 });

const DS = "crypto-binance-1m";
/* The canonical 1h entry of BTCUSDT: first bar 2026-07-01 00:00Z, last bar 2026-07-02 23:00Z, closed end 2026-07-03 00:00Z. */
const H1 = { first: 1782864000000, last: 1783033200000, end: 1783036800000, lower: "2026-07-01T00:00", upper: "2026-07-03T00:00" };
const MONTH = { lower: "2020-01-01T00:00", upper: "2026-10-01T00:00" };

/** The healthy fixture, plus a 4h entry on BTCUSDT whose edges differ from its 1h ones. */
function v2With(change: (copy: DatasetCatalog) => void = () => undefined): DatasetCatalog {
  const copy = structuredClone(V2);
  const btc = copy.datasets[0]!.symbols.items[0]! as unknown as { coverage_by_timeframe: Record<string, unknown>[] };
  btc.coverage_by_timeframe.push({
    ...btc.coverage_by_timeframe[0]!,
    timeframe: "4h",
    resolution_seconds: 14400,
    first_bar_utc_ms: 1782950400000,
    last_bar_utc_ms: 1783008000000,
    last_closed_bar_end_utc_ms: 1783022400000,
    indexed_start_utc_ms: 1782950400000,
    indexed_end_exclusive_utc_ms: 1783022400000,
  });
  change(copy);
  return copy;
}

const frames = (catalog: DatasetCatalog) =>
  (catalog.datasets[0]!.symbols.items[0]! as unknown as { coverage_by_timeframe: Record<string, unknown>[] }).coverage_by_timeframe;

function ready(plan: CoveragePlan) {
  if (plan.state !== "ready") throw new Error(`expected ready, got ${plan.state}`);
  return plan;
}

describe("S02_PREFILL — the pure plan", () => {
  it("places the chosen timeframe's exact bar edges, UTC, end exclusive", () => {
    const plan = ready(planCoverage(V2, DS, "BTCUSDT", "1h"));
    expect(plan.lower).toBe(H1.lower);
    expect(plan.upperExclusive).toBe(H1.upper);
    expect(plan.source.exact).toEqual({ timeframe: "1h", firstBarUtcMs: H1.first, lastBarUtcMs: H1.last, endExclusiveUtcMs: H1.end });
    /* The month fields stay the served month coverage (the timeline and the caption's months read them). */
    expect(plan.source).toMatchObject({ firstMonth: "2020-01", lastMonth: "2026-09", months: 81 });
    /* The last bar ends well before the month end the month prefill would have used. */
    expect(plan.upperExclusive < MONTH.upper).toBe(true);
    expect(plan.lower > MONTH.lower).toBe(true);
  });

  it("differs per timeframe", () => {
    const catalog = v2With();
    expect(ready(planCoverage(catalog, DS, "BTCUSDT", "1h")).lower).toBe("2026-07-01T00:00");
    const four = ready(planCoverage(catalog, DS, "BTCUSDT", "4h"));
    expect([four.lower, four.upperExclusive]).toEqual(["2026-07-02T00:00", "2026-07-02T20:00"]);
  });

  it("falls back to month edges when no timeframe is chosen or the symbol has no entry for it", () => {
    for (const timeframe of ["", "15min", "4h"]) {
      const plan = ready(planCoverage(V2, DS, "BTCUSDT", timeframe));
      expect([plan.lower, plan.upperExclusive]).toEqual([MONTH.lower, MONTH.upper]);
      expect(plan.source.exact).toBeUndefined();
    }
  });

  it("falls back to month edges when the entry is NOT_PUBLISHED, whatever numbers it carries", () => {
    const catalog = v2With((copy) => {
      Object.assign(frames(copy)[0]!, { availability: "NOT_PUBLISHED", reason_code: "HMD_SYMBOL_INTERVAL_NOT_INDEXED" });
    });
    const plan = ready(planCoverage(catalog, DS, "BTCUSDT", "1h"));
    expect([plan.lower, plan.upperExclusive]).toEqual([MONTH.lower, MONTH.upper]);
    expect(plan.source.exact).toBeUndefined();
  });

  it("falls back on a v1 catalog, which has no per-timeframe coverage", () => {
    const plan = ready(planCoverage(V1, DS, "BTCUSDT", "1h"));
    expect([plan.lower, plan.upperExclusive]).toEqual([MONTH.lower, MONTH.upper]);
    expect(plan.source.exact).toBeUndefined();
  });

  it("does not trust edges it cannot put into the draft as served", () => {
    const month = [MONTH.lower, MONTH.upper];
    const plan = (change: (row: Record<string, unknown>) => void, timezone = "UTC") => {
      const catalog = v2With((copy) => {
        change(frames(copy)[0]!);
        copy.datasets[0]!.source_timezone = timezone;
      });
      const result = ready(planCoverage(catalog, DS, "BTCUSDT", "1h"));
      return [result.lower, result.upperExclusive];
    };
    /* A zone other than UTC would read the text in that zone, not as served. */
    expect(plan(() => undefined, "Asia/Ho_Chi_Minh")).toEqual(month);
    /* A sub-minute instant cannot be typed into the input. */
    expect(plan((row) => { row.first_bar_utc_ms = H1.first + 1000; })).toEqual(month);
    /* A range that does not run forward. */
    expect(plan((row) => { row.indexed_end_exclusive_utc_ms = H1.last; })).toEqual(month);
    expect(plan((row) => { row.last_bar_utc_ms = H1.first - 3600000; })).toEqual(month);
    /* No served end: the end is never computed here from the resolution. */
    expect(plan((row) => { row.indexed_end_exclusive_utc_ms = null; })).toEqual(month);
  });
});

describe("S02_PREFILL — what a timeframe change may touch", () => {
  const pick = (draft: RunDraft, timeframe: string, catalog: DatasetCatalog = v2With()): RunDraft => ({
    ...draft,
    timeframe,
    ...applyCoveragePrefill(draft, planCoverage(catalog, DS, "BTCUSDT", timeframe)),
  });
  const start = (): RunDraft => ({ ...emptyDraft(), datasetId: DS, symbol: "BTCUSDT" });

  it("re-places a prefilled bound on the new timeframe's edges", () => {
    const one = pick(start(), "1h");
    expect([one.windows.is.start, one.windows.holdout.endExclusive]).toEqual(["2026-07-01T00:00", "2026-07-03T00:00"]);
    const four = pick(one, "4h");
    expect([four.windows.is.start, four.windows.holdout.endExclusive]).toEqual(["2026-07-02T00:00", "2026-07-02T20:00"]);
    expect([four.walkForward.start, four.walkForward.endExclusive]).toEqual(["2026-07-02T00:00", "2026-07-02T20:00"]);
  });

  it("moves a month-edge prefill onto exact edges once the timeframe is known, and back", () => {
    const month = pick(start(), "");
    expect(month.windows.is.start).toBe(MONTH.lower);
    const exact = pick(month, "1h");
    expect(exact.windows.is.start).toBe(H1.lower);
    /* 15min has no entry: the month prefill comes back. */
    expect(pick(exact, "15min").windows.holdout.endExclusive).toBe(MONTH.upper);
  });

  it("never overwrites a bound the reader edited", () => {
    const one = pick(start(), "1h");
    const edited: RunDraft = {
      ...one,
      windows: { ...one.windows, is: { ...one.windows.is, start: "2026-07-01T12:00" } },
      coveragePrefill: {
        ...one.coveragePrefill!,
        placed: Object.fromEntries(Object.entries(one.coveragePrefill!.placed).filter(([key]) => key !== "is.start")),
        touched: ["is.start"],
      },
    };
    const four = pick(edited, "4h");
    expect(four.windows.is.start).toBe("2026-07-01T12:00");
    /* The untouched end moves. */
    expect(four.windows.holdout.endExclusive).toBe("2026-07-02T20:00");
  });
});

/* ------------------------------------------------------------------- screen */

function Harness({ catalog, limits = LIMITS, step = "data" }: { catalog: DatasetCatalog; limits?: typeof LIMITS; step?: "data" | "windows" }) {
  const [draft, setDraft] = useState<RunDraft>({ ...emptyDraft(), datasetId: DS });
  const patch = useCallback((change: Partial<RunDraft>) => setDraft((previous) => ({ ...previous, ...change })), []);
  return (
    <NewRun
      draft={draft}
      patch={patch}
      limits={limits}
      atlas={ATLAS}
      atlasState={OK}
      preflight={null}
      preflightState={researchState({ kind: "ok", rowCount: 0 })}
      onRunPreflight={vi.fn()}
      mayCreateRun={false}
      canSubmit={false}
      created={null}
      createState={researchState({ kind: "ok", rowCount: 0 })}
      outcomeUnknown={false}
      onSubmit={vi.fn()}
      onRecheck={vi.fn()}
      catalog={normalizeCatalog(catalog)}
      initialStep={step}
    />
  );
}

/* The four linked edges of the calendar (was six independent inputs): A, B (IS end = OOS start), C (OOS end = Holdout start), D. */
const WINDOW_LABELS = ["IS start (A)", "IS end · OOS start (B)", "OOS end · Holdout start (C)", "Holdout end exclusive (D)"];
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const windowValues = () => WINDOW_LABELS.map((label) => field(label).value);
/* The window inputs are whole UTC-day date inputs: they show the DATE of a draft instant (the draft keeps its time). */
const day = (instant: string) => instant.slice(0, 10);
const goTo = (step: string) => { fireEvent.click(document.querySelector(`[data-step-pill="${step}"]`) as HTMLElement); };
const text = (selector: string) => document.querySelector(selector)?.textContent ?? null;
const tip = (selector: string) => document.querySelector(selector)?.getAttribute("title") ?? null;
const chip = (timeframe: string) => document.querySelector(`[data-timeframe-chip="${timeframe}"]`) as HTMLElement;
/* The sole available dataset is the draft's own (identity row, no input); only the symbol is typed. */
const choose = (_dataset: string, symbol: string) => {
  fireEvent.change(field("Symbol"), { target: { value: symbol } });
};
const BOTH = { ...LIMITS, declaredTimeframes: ["1h", "4h"] };

describe("S02_PREFILL — Screen 02", () => {
  it("prefills the exact edges for the chosen timeframe and says so in one line", () => {
    render(<Harness catalog={v2With()} limits={BOTH} />);
    choose(DS, "BTCUSDT");
    fireEvent.click(chip("1h"));
    goTo("windows");
    expect(windowValues()).toEqual([day(H1.lower), "", "", day(H1.upper)]);
    expect(text("[data-prefill-source]")).toBe("Prefilled from crypto-binance-1m · BTCUSDT · 2026-07-01 00:00 → 2026-07-02 23:00 (1h)");
    /* The per-edge captions are gone with the six-row layout: the one source line above says it. */
    expect(document.querySelector("[data-prefill-caption]")).toBeNull();
    expect(tip("[data-prefill-source]")).toContain("Exact bar edges, UTC, end exclusive");
    /* Warmup is the index's answer, not a date computed here. */
    expect(tip("[data-prefill-source]")).toContain("not computed here");
    expect(tip("[data-prefill-source]")).not.toContain("Month edges");
  });

  it("re-prefills when the timeframe changes, and keeps what the reader typed", () => {
    render(<Harness catalog={v2With()} limits={BOTH} />);
    choose(DS, "BTCUSDT");
    fireEvent.click(chip("1h"));
    goTo("windows");
    fireEvent.change(field("IS start (A)"), { target: { value: "2026-06-30" } });
    goTo("data");
    fireEvent.click(chip("4h"));
    goTo("windows");
    expect(windowValues()).toEqual(["2026-06-30", "", "", "2026-07-02"]);
    expect(text("[data-prefill-source]")).toBe("Prefilled from crypto-binance-1m · BTCUSDT · 2026-07-02 00:00 → 2026-07-02 16:00 (4h)");
  });

  it("keeps the month edges when the catalog is v1, and says month partitions", () => {
    render(<Harness catalog={V1} limits={BOTH} />);
    choose(DS, "BTCUSDT");
    fireEvent.click(chip("1h"));
    goTo("windows");
    expect(windowValues()).toEqual([day(MONTH.lower), "", "", day(MONTH.upper)]);
    expect(text("[data-prefill-source]")).toBe("Prefilled from crypto-binance-1m · BTCUSDT · 2020-01 → 2026-09 · 81 months");
    expect(tip("[data-prefill-source]")).toContain("Month edges, not bar times");
  });

  it("says nothing exact for a timeframe the symbol has no entry for", () => {
    render(<Harness catalog={V2} limits={{ ...LIMITS, declaredTimeframes: ["1h", "4h"] }} />);
    choose(DS, "BTCUSDT");
    fireEvent.click(chip("4h"));
    goTo("windows");
    expect(windowValues()).toEqual([day(MONTH.lower), "", "", day(MONTH.upper)]);
    expect(text("[data-prefill-source]")).toContain("2020-01 → 2026-09 · 81 months");
  });
});

describe("S02_PREFILL — the route", () => {
  async function settle() {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  }

  it("re-places a month prefill on exact edges when the version's timeframe is adopted", async () => {
    const catalog = v2With();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      if (url.pathname === "/api/v1/research/quantbt/atlas") return json(ATLAS_RESPONSE);
      if (url.pathname === "/api/v1/research/alphas") return json(REGISTRY);
      if (url.pathname === "/api/v1/research/datasets/catalog-v2") return json(catalog);
      return json({ error: { code: "NOT_FOUND", message: "not found" } }, 404);
    }));
    render(
      <MemoryRouter initialEntries={[`/research/quantbt/runs/new?step=data&alpha=${ALPHA.alpha_id}&av=${ALPHA.alpha_version_id}`]}>
        <NewRunRoute />
      </MemoryRouter>,
    );
    await waitFor(() => expect(document.querySelector('[data-binding-chip]')?.textContent).toContain(ALPHA.version_label));
    await settle();
    choose(DS, "BTCUSDT");
    goTo("windows");
    /* The version declares 1h, the route adopted it, and the symbol's 1h entry is served. */
    expect(windowValues()).toEqual([day(H1.lower), "", "", day(H1.upper)]);
    expect(text("[data-prefill-source]")).toBe("Prefilled from crypto-binance-1m · BTCUSDT · 2026-07-01 00:00 → 2026-07-02 23:00 (1h)");
  });
});

/* The draft is autosaved for the session: each test starts from a blank one. */
import { beforeEach as clearDraftBeforeEach } from "vitest";
clearDraftBeforeEach(() => { window.sessionStorage.clear(); });
