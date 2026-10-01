/**
 * D4 (Unified plan §13.4.1, G2) — Screen 02 prefills the outermost window
 * bounds from the coverage the reader's dataset and symbol published.
 *
 * The decision is "prefill from coverage, editable, blank when there is none —
 * no invented default". What that can mean is narrower than it sounds, and the
 * cells below hold the line:
 *
 *  - the catalog states month partitions, "not the exact first or last bar", so
 *    only the outer envelope of the outermost window is filled — the first day
 *    of the first month and the month after the last. **No interior boundary is
 *    ever filled**: no server fact defines one;
 *  - a value the reader typed is never replaced, by a later pick, a re-render or
 *    a catalog that arrives late — and a value a coverage put there is replaced
 *    (not merged) when the dataset or symbol changes;
 *  - the provenance never reaches the payload, the serializer stays the one
 *    serializer, and a held preflight token still dies with any spec change.
 *
 * Every catalog, atlas, registry and preflight document is a canonical fixture
 * from `packages/contracts/fixtures`, never a hand-built object.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useCallback, useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RegistryListResponse } from "./alphaImportClient";
import type { AtlasDocument } from "./atlas";
import type { DatasetCatalog } from "./datasetClient";
import { NewRun } from "./NewRun";
import { NewRunRoute, constraintsFrom, emptyDraft } from "./NewRunRoute";
import type { PreflightResponse, RequestedSpec } from "./preflightClient";
import { SPEC_CHANGED_NOTE } from "./usePreflight";
import {
  type CoveragePlan,
  type RunDraft,
  applyCoveragePrefill,
  carriedCoverage,
  coverageMonthEdges,
  draftFromRequestedSpec,
  markPrefillTouched,
  outerFields,
  planCoverage,
  serializeRequestedSpec,
} from "./runDraft";
import { researchState } from "./state";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/* ---------------------------------------------------------------- fixtures */

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(ROOT, "packages/contracts/fixtures", name), "utf8")) as T;
}

const CATALOG = fixture<DatasetCatalog>("research-preflight.dataset-catalog.valid.json");
const ATLAS_RESPONSE = fixture<{ atlas: AtlasDocument }>("research-foundation.atlas-current.valid.json");
const ATLAS = ATLAS_RESPONSE.atlas;
const REGISTRY = fixture<RegistryListResponse>("research-alpha-import.registry.valid.json");
const PREFLIGHT = fixture<PreflightResponse>("research-preflight.response.valid.json");

const ALPHA = REGISTRY.entries[0]!;
const LIMITS = constraintsFrom(ATLAS, REGISTRY.entries, ALPHA.alpha_version_id);
const OK = researchState({ kind: "ok", rowCount: 1 });

/** BTCUSDT on crypto-binance-1m: `2020-01 → 2026-09`, 81 partitions. */
const BTC = { dataset: "crypto-binance-1m", symbol: "BTCUSDT", lower: "2020-01-01T00:00", upper: "2026-10-01T00:00" };
/** The same symbol name on another dataset, with different coverage: `2022-05 → 2025-11`. */
const BTC_BYBIT = { dataset: "fixture-bybit-1h", symbol: "BTCUSDT", lower: "2022-05-01T00:00", upper: "2025-12-01T00:00" };
/** A quarterly contract with a much shorter coverage: `2025-09 → 2026-04`. */
const QUARTERLY = { dataset: "crypto-binance-1m", symbol: "BTCUSDT_260327", lower: "2025-09-01T00:00", upper: "2026-05-01T00:00" };

const WINDOW_LABELS = [
  "IS start",
  "IS end exclusive",
  "OOS start",
  "OOS end exclusive",
  "Holdout start",
  "Holdout end exclusive",
] as const;

function catalogWith(change: (copy: DatasetCatalog) => void): DatasetCatalog {
  const copy = structuredClone(CATALOG);
  change(copy);
  return copy;
}

function ready(plan: CoveragePlan) {
  if (plan.state !== "ready") throw new Error(`expected a ready plan, got ${plan.state}: ${plan.reason}`);
  return plan;
}

/* ------------------------------------------------------------ the pure rule */

describe("D4 — the coverage envelope is calendar text, nothing more", () => {
  it("turns a month range into the first day of the first month and the month after the last", () => {
    expect(coverageMonthEdges("2020-01", "2026-09")).toEqual({ lower: "2020-01-01T00:00", upperExclusive: "2026-10-01T00:00", monthsSpanned: 81 });
    /* One partition: the window is that whole month. */
    expect(coverageMonthEdges("2021-02", "2021-02")).toEqual({ lower: "2021-02-01T00:00", upperExclusive: "2021-03-01T00:00", monthsSpanned: 1 });
    /* December rolls the year over; there is no Date and no timezone in it. */
    expect(coverageMonthEdges("2025-12", "2025-12")?.upperExclusive).toBe("2026-01-01T00:00");
    expect(coverageMonthEdges("2024-11", "2025-01")).toMatchObject({ lower: "2024-11-01T00:00", upperExclusive: "2025-02-01T00:00", monthsSpanned: 3 });
  });

  it("refuses text that is not a real month range instead of guessing one", () => {
    expect(coverageMonthEdges("2026-13", "2026-13")).toBeNull();
    expect(coverageMonthEdges("2026-00", "2026-09")).toBeNull();
    expect(coverageMonthEdges("2026-09", "2020-01")).toBeNull();
    expect(coverageMonthEdges("2026-9", "2026-09")).toBeNull();
    expect(coverageMonthEdges("9999-12", "9999-12")).toBeNull();
  });
});

describe("D4 — every reason nothing is prefilled is its own state, worded on its own", () => {
  it("plans a ready coverage from the canonical catalog, reading the symbol as the form does", () => {
    const plan = ready(planCoverage(CATALOG, BTC.dataset, " btcusdt "));
    expect(plan).toMatchObject({ lower: BTC.lower, upperExclusive: BTC.upper });
    expect(plan.source).toEqual({
      datasetId: BTC.dataset, symbol: BTC.symbol, firstMonth: "2020-01", lastMonth: "2026-09", months: 81, monthsSpanned: 81, timezone: "UTC",
    });
  });

  it("names nothing chosen, an unread catalog and an unlisted dataset separately", () => {
    expect(planCoverage(CATALOG, "", "")).toMatchObject({ state: "no-dataset", reason: "No dataset is chosen, so nothing is prefilled." });
    expect(planCoverage(null, BTC.dataset, BTC.symbol)).toMatchObject({
      state: "no-catalog", reason: "The dataset catalog was not read, so there is no coverage to prefill from.",
    });
    expect(planCoverage(CATALOG, "crypto-nowhere", BTC.symbol)).toMatchObject({
      state: "dataset-unlisted", reason: "crypto-nowhere is not in the dataset catalog, so there is no coverage to prefill from.",
    });
  });

  it("uses the server's own sentence when a dataset is unavailable or lists no symbols", () => {
    expect(planCoverage(CATALOG, "fixture-unavailable-1h", "BTCUSDT")).toMatchObject({
      state: "dataset-unavailable", reason: "The approved historical source is not mounted on this host. Nothing is prefilled.",
    });
    expect(planCoverage(CATALOG, "fixture-query-any-symbol", "BTCUSDT")).toMatchObject({
      state: "symbols-not-published", reason: "This source answers any symbol by query and publishes no symbol list. Nothing is prefilled.",
    });
  });

  it("tells a missing symbol, an unlisted symbol and unpublished coverage apart", () => {
    expect(planCoverage(CATALOG, BTC.dataset, "")).toMatchObject({ state: "no-symbol", reason: "No symbol is chosen, so nothing is prefilled." });
    expect(planCoverage(CATALOG, BTC.dataset, "DOGEUSDT")).toMatchObject({
      state: "symbol-unlisted", reason: "DOGEUSDT is not among this dataset's 5 listed symbols, so nothing is prefilled.",
    });
    expect(planCoverage(CATALOG, "fixture-single-symbol-1d", "VN30F1M")).toMatchObject({
      state: "coverage-not-published", reason: "Coverage is not published for VN30F1M in fixture-single-symbol-1d, so nothing is prefilled.",
    });
  });

  it("does not read a truncated symbol list as proof that a symbol is absent", () => {
    const truncated = catalogWith((copy) => { copy.datasets[0]!.symbols.truncated = true; });
    expect(planCoverage(truncated, BTC.dataset, "DOGEUSDT")).toMatchObject({
      state: "symbol-unlisted", reason: "DOGEUSDT is not among the 5 symbols listed (the list is truncated), so nothing is prefilled.",
    });
  });

  it("refuses a coverage that contradicts itself rather than filling a range from it", () => {
    const backwards = catalogWith((copy) => {
      const first = copy.datasets[0]!.symbols.items[0]!.coverage!;
      first.first_month = "2026-09";
      first.last_month = "2020-01";
    });
    expect(planCoverage(backwards, BTC.dataset, BTC.symbol).state).toBe("coverage-unreadable");
    const notAMonth = catalogWith((copy) => { copy.datasets[0]!.symbols.items[0]!.coverage!.last_month = "2026-13"; });
    expect(planCoverage(notAMonth, BTC.dataset, BTC.symbol).state).toBe("coverage-unreadable");
    /* More partitions than months between first and last cannot be true. */
    const impossible = catalogWith((copy) => { copy.datasets[0]!.symbols.items[0]!.coverage!.months = 90; });
    expect(planCoverage(impossible, BTC.dataset, BTC.symbol)).toMatchObject({
      state: "coverage-unreadable",
      reason: "The published coverage of BTCUSDT (2020-01 → 2026-09, 90 months) is not a consistent month range, so nothing is prefilled.",
    });
  });
});

describe("D4 — what a pick may and may not touch", () => {
  const blank = () => emptyDraft();
  const pick = (draft: RunDraft, dataset: string, symbol: string, catalog: DatasetCatalog | null = CATALOG): RunDraft => ({
    ...draft, datasetId: dataset, symbol, ...applyCoveragePrefill(draft, planCoverage(catalog, dataset, symbol)),
  });

  it("fills exactly the four outer bounds and no interior boundary", () => {
    const filled = pick(blank(), BTC.dataset, BTC.symbol);
    expect(filled.windows).toEqual({
      is: { start: BTC.lower, endExclusive: "" },
      oos: { start: "", endExclusive: "" },
      holdout: { start: "", endExclusive: BTC.upper },
    });
    expect(filled.walkForward).toMatchObject({ start: BTC.lower, endExclusive: BTC.upper, splitMode: "" });
    expect(Object.keys(filled.coveragePrefill!.placed).sort()).toEqual(
      ["holdout.endExclusive", "is.start", "walkForward.endExclusive", "walkForward.start"],
    );
  });

  it("changes nothing when there is no dataset", () => {
    const untouched = blank();
    const planned = applyCoveragePrefill(untouched, planCoverage(CATALOG, "", ""));
    expect(planned.windows).toEqual(untouched.windows);
    expect(planned.walkForward).toEqual(untouched.walkForward);
    expect(planned.coveragePrefill).toEqual({ source: null, placed: {}, touched: [] });
  });

  it("replaces a prefilled bound with the new coverage's, and never merges the two", () => {
    const first = pick(blank(), BTC.dataset, BTC.symbol);
    const second = pick(first, BTC_BYBIT.dataset, BTC_BYBIT.symbol);
    expect(second.windows.is.start).toBe(BTC_BYBIT.lower);
    expect(second.windows.holdout.endExclusive).toBe(BTC_BYBIT.upper);
    expect(JSON.stringify(second.windows)).not.toContain("2020");
    expect(JSON.stringify(second.windows)).not.toContain("2026");
  });

  it("empties a prefilled bound when the new pick publishes no coverage", () => {
    const first = pick(blank(), BTC.dataset, BTC.symbol);
    const none = pick(first, "fixture-single-symbol-1d", "VN30F1M");
    expect(none.windows.is.start).toBe("");
    expect(none.windows.holdout.endExclusive).toBe("");
    expect(none.walkForward).toMatchObject({ start: "", endExclusive: "" });
    expect(none.coveragePrefill).toEqual({ source: null, placed: {}, touched: [] });
  });

  it("keeps a value the reader edited through every later pick", () => {
    const first = pick(blank(), BTC.dataset, BTC.symbol);
    const edited: RunDraft = {
      ...first,
      windows: { ...first.windows, is: { ...first.windows.is, start: "2021-03-04T05:00" } },
      coveragePrefill: markPrefillTouched(first, "is.start"),
    };
    const second = pick(edited, QUARTERLY.dataset, QUARTERLY.symbol);
    expect(second.windows.is.start).toBe("2021-03-04T05:00");
    expect(second.windows.holdout.endExclusive).toBe(QUARTERLY.upper);
    const third = pick(second, "fixture-single-symbol-1d", "VN30F1M");
    expect(third.windows.is.start).toBe("2021-03-04T05:00");
    expect(third.windows.holdout.endExclusive).toBe("");
  });

  it("does not refill a bound the reader cleared", () => {
    const first = pick(blank(), BTC.dataset, BTC.symbol);
    const cleared: RunDraft = {
      ...first,
      windows: { ...first.windows, holdout: { ...first.windows.holdout, endExclusive: "" } },
      coveragePrefill: markPrefillTouched(first, "holdout.endExclusive"),
    };
    expect(pick(cleared, QUARTERLY.dataset, QUARTERLY.symbol).windows.holdout.endExclusive).toBe("");
  });

  it("never overwrites a value it did not place — a typed or copied one", () => {
    const typed: RunDraft = { ...blank(), windows: { ...blank().windows, is: { start: "2019-05-05T00:00", endExclusive: "" } } };
    const filled = pick(typed, BTC.dataset, BTC.symbol);
    expect(filled.windows.is.start).toBe("2019-05-05T00:00");
    expect(filled.windows.holdout.endExclusive).toBe(BTC.upper);
  });

  it("knows which coverage a field's value came from, and only while it still holds it", () => {
    const filled = pick(blank(), BTC.dataset, BTC.symbol);
    expect(carriedCoverage(filled, "is.start")).toMatchObject({ datasetId: BTC.dataset, symbol: BTC.symbol, firstMonth: "2020-01" });
    expect(carriedCoverage(filled, "holdout.endExclusive")?.lastMonth).toBe("2026-09");
    expect(carriedCoverage({ ...filled, symbol: "ETHUSDT" }, "is.start")).toBeNull();
    expect(carriedCoverage({ ...filled, datasetId: BTC_BYBIT.dataset }, "is.start")).toBeNull();
    expect(carriedCoverage({ ...filled, windows: { ...filled.windows, is: { start: "2020-01-02T00:00", endExclusive: "" } } }, "is.start")).toBeNull();
    expect(carriedCoverage(markPrefillTouchedDraft(filled, "is.start"), "is.start")).toBeNull();
  });

  it("names the two outer bounds each protocol actually sends", () => {
    expect(outerFields("three_window_decay")).toEqual(["is.start", "holdout.endExclusive"]);
    expect(outerFields("advanced")).toEqual(["walkForward.start", "walkForward.endExclusive"]);
  });
});

function markPrefillTouchedDraft(draft: RunDraft, field: Parameters<typeof markPrefillTouched>[1]): RunDraft {
  return { ...draft, coveragePrefill: markPrefillTouched(draft, field) };
}

describe("D4 — provenance is for the screen, never for the payload", () => {
  it("serializes a prefilled draft exactly as it would the same dates typed by hand", () => {
    const draft: RunDraft = {
      ...emptyDraft(), alphaId: ALPHA.alpha_id, alphaVersionId: ALPHA.alpha_version_id, datasetId: BTC.dataset, symbol: BTC.symbol,
    };
    const prefilled = { ...draft, ...applyCoveragePrefill(draft, planCoverage(CATALOG, BTC.dataset, BTC.symbol)) };
    const typedByHand: RunDraft = { ...prefilled, coveragePrefill: undefined };
    const spec = serializeRequestedSpec(prefilled);
    expect(spec).toEqual(serializeRequestedSpec(typedByHand));
    expect(spec.windows?.is.start).toBe(BTC.lower);
    expect(spec.windows?.holdout.end_exclusive).toBe(BTC.upper);
    expect(JSON.stringify(spec)).not.toMatch(/coverage|prefill|placed|touched/i);
  });

  it("drops the provenance when a run is copied, and a later pick still keeps the copied dates", () => {
    const source: RequestedSpec = serializeRequestedSpec({
      ...emptyDraft(),
      datasetId: BTC.dataset,
      symbol: BTC.symbol,
      windows: {
        is: { start: "2021-01-01T00:00", endExclusive: "2023-01-01T00:00" },
        oos: { start: "2023-01-01T00:00", endExclusive: "2024-01-01T00:00" },
        holdout: { start: "2024-01-01T00:00", endExclusive: "2025-01-01T00:00" },
      },
    });
    const preFilled: RunDraft = { ...emptyDraft(), datasetId: BTC.dataset, symbol: BTC.symbol };
    const base = { ...preFilled, ...applyCoveragePrefill(preFilled, planCoverage(CATALOG, BTC.dataset, BTC.symbol)) };
    expect(base.coveragePrefill?.placed["is.start"]).toBe(BTC.lower);
    const copied = draftFromRequestedSpec(source, base);
    expect(copied.coveragePrefill).toBeUndefined();
    expect(copied.windows.is.start).toBe("2021-01-01T00:00");
    const repicked = { ...copied, ...applyCoveragePrefill(copied, planCoverage(CATALOG, QUARTERLY.dataset, QUARTERLY.symbol)) };
    expect(repicked.windows).toEqual(copied.windows);
    expect(carriedCoverage(repicked, "is.start")).toBeNull();
  });
});

/* ------------------------------------------------------ the real route, real hook */

interface Served {
  calls: { method: string; path: string; body: string | null }[];
}

/**
 * Serves the route's four reads and the preflight POST from canonical fixtures.
 * Anything else is a request the screen should not be making, and throws.
 */
function serve(options: { catalog: DatasetCatalog | "not-served" } = { catalog: CATALOG }): Served {
  const served: Served = { calls: [] };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const method = (init?.method ?? "GET").toUpperCase();
    served.calls.push({ method, path: url.pathname, body: typeof init?.body === "string" ? init.body : null });
    if (method === "GET" && url.pathname === "/api/v1/research/quantbt/atlas") return json(ATLAS_RESPONSE);
    if (method === "GET" && url.pathname === "/api/v1/research/alphas") return json(REGISTRY);
    if (method === "GET" && url.pathname === "/api/v1/research/datasets") {
      return options.catalog === "not-served"
        ? json({ error: { code: "NOT_FOUND", message: "not found" } }, 404)
        : json(options.catalog);
    }
    if (method === "POST" && url.pathname === "/api/v1/research/preflights") return json(PREFLIGHT);
    throw new Error(`unexpected request ${method} ${url.pathname}`);
  }));
  return served;
}

async function settle() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
}

async function mountRoute(step: "data" | "windows", options?: Parameters<typeof serve>[0]) {
  const served = serve(options);
  const search = `?step=${step}&alpha=${ALPHA.alpha_id}&av=${ALPHA.alpha_version_id}`;
  const view = render(
    <MemoryRouter initialEntries={[`/research/quantbt/runs/new${search}`]}>
      <NewRunRoute />
    </MemoryRouter>,
  );
  /* The registry read binds the version through `?alpha=&av=`; the review
     rail shows it on every step, so it says the route has finished reading. */
  await waitFor(() => expect(document.querySelector('[data-review-row="alpha binding"]')?.textContent).toContain(ALPHA.version_label));
  await settle();
  return { served, view };
}

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const windowValues = () => WINDOW_LABELS.map((label) => field(label).value);
const goTo = (step: string) => { fireEvent.click(document.querySelector(`[data-step-pill="${step}"]`) as HTMLElement); };
const choose = (dataset: string, symbol: string) => {
  fireEvent.change(field("Dataset"), { target: { value: dataset } });
  fireEvent.change(field("Symbol"), { target: { value: symbol } });
};
const text = (selector: string) => document.querySelector(selector)?.textContent ?? null;

describe("D4 — Screen 02, real route and hook", () => {
  it("nothing chosen → every date is blank, and the reason is on screen", async () => {
    const { served } = await mountRoute("windows");
    expect(windowValues()).toEqual(["", "", "", "", "", ""]);
    expect(document.querySelector("[data-window-prefill-note]")?.getAttribute("data-prefill-state")).toBe("no-dataset");
    expect(text("[data-prefill-reason]")).toBe("No dataset is chosen, so nothing is prefilled.");
    expect(document.querySelector("[data-prefill-caption]")).toBeNull();
    /* Reading the form is not a write: only GETs so far. */
    expect(served.calls.every((call) => call.method === "GET")).toBe(true);
  });

  it("choose a dataset and symbol → the outer bounds are filled and captioned with their source", async () => {
    await mountRoute("data");
    fireEvent.change(field("Dataset"), { target: { value: BTC.dataset } });
    expect(text("[data-window-prefill-status]")).toBe("No symbol is chosen, so nothing is prefilled.");
    fireEvent.change(field("Symbol"), { target: { value: BTC.symbol } });
    expect(text("[data-window-prefill-status]")).toBe("Bounds prefilled from coverage");

    goTo("windows");
    expect(windowValues()).toEqual([BTC.lower, "", "", "", "", BTC.upper]);
    expect(text('[data-prefill-caption="is.start"]')).toBe("prefilled from BTCUSDT coverage · first day of 2020-01");
    expect(text('[data-prefill-caption="holdout.endExclusive"]')).toBe("prefilled from BTCUSDT coverage · end of 2026-09");
    expect(text("[data-prefill-source]")).toBe("Prefilled from the coverage of crypto-binance-1m · BTCUSDT: 2020-01 → 2026-09 · 81 months, UTC month partitions.");
    /* The version's own declared warmup (the registry fixture's 32 bars) is named, not converted into a date. */
    expect(text("[data-prefill-edges]")).toBe("Month edges, not bar times — preflight checks the exact range, and the 32 warmup bars the version declares must fit before IS start. Every value stays editable.");
    expect(text("[data-prefill-interior]")).toBe("IS end, OOS and holdout start are left empty: the server publishes no rule for splitting coverage into windows.");
    expect(text("[data-window-prefill-rail]")).toBe("Outer bounds prefilled from BTCUSDT coverage (2020-01 → 2026-09) until edited.");
    /* Nothing is locked: every input stays enabled and editable. */
    for (const label of WINDOW_LABELS) expect(field(label).disabled).toBe(false);
  });

  it("edit → the value survives a re-render, later effects and the next pick", async () => {
    const { view } = await mountRoute("data");
    choose(BTC.dataset, BTC.symbol);
    goTo("windows");
    fireEvent.change(field("IS start"), { target: { value: "2021-03-04T05:00" } });
    expect(field("IS start").value).toBe("2021-03-04T05:00");
    /* The edited field loses its caption; the untouched one keeps it. */
    expect(document.querySelector('[data-prefill-caption="is.start"]')).toBeNull();
    expect(document.querySelector('[data-prefill-caption="holdout.endExclusive"]')).not.toBeNull();

    /* A re-render, a step away and back, and every late effect the route runs. */
    view.rerender(
      <MemoryRouter initialEntries={["/research/quantbt/runs/new?step=windows"]}>
        <NewRunRoute />
      </MemoryRouter>,
    );
    goTo("review");
    goTo("windows");
    await settle();
    expect(field("IS start").value).toBe("2021-03-04T05:00");
    expect(field("Holdout end exclusive").value).toBe(BTC.upper);

    /* A later pick with a different coverage: the edit stays, the prefill moves. */
    goTo("data");
    fireEvent.change(field("Symbol"), { target: { value: QUARTERLY.symbol } });
    goTo("windows");
    expect(windowValues()).toEqual(["2021-03-04T05:00", "", "", "", "", QUARTERLY.upper]);
    expect(text("[data-prefill-source]")).toContain("BTCUSDT_260327: 2025-09 → 2026-04 · 8 months");
  });

  it("change the dataset → the prefilled bounds are replaced by the new coverage, not merged", async () => {
    await mountRoute("data");
    choose(BTC.dataset, BTC.symbol);
    goTo("windows");
    expect(windowValues()[0]).toBe(BTC.lower);

    goTo("data");
    fireEvent.change(field("Dataset"), { target: { value: BTC_BYBIT.dataset } });
    goTo("windows");
    expect(windowValues()).toEqual([BTC_BYBIT.lower, "", "", "", "", BTC_BYBIT.upper]);
    expect(text("[data-prefill-source]")).toContain("fixture-bybit-1h · BTCUSDT: 2022-05 → 2025-11 · 43 months");

    /* A dataset that does not list the symbol takes the bounds away rather than keeping the old ones. */
    goTo("data");
    fireEvent.change(field("Dataset"), { target: { value: "fixture-single-symbol-1d" } });
    goTo("windows");
    expect(windowValues()).toEqual(["", "", "", "", "", ""]);
    expect(text("[data-prefill-reason]")).toBe("BTCUSDT is not among this dataset's 1 listed symbols, so nothing is prefilled.");
  });

  it("coverage not published → blank, with the reason on both steps", async () => {
    await mountRoute("data");
    choose("fixture-single-symbol-1d", "VN30F1M");
    const reason = "Coverage is not published for VN30F1M in fixture-single-symbol-1d, so nothing is prefilled.";
    expect(text("[data-window-prefill-status]")).toBe(reason);
    expect(document.querySelector("[data-window-prefill-status]")?.getAttribute("data-prefill-state")).toBe("coverage-not-published");
    /* The symbol line already says the coverage is not published; the two agree. */
    expect(text("[data-symbol-coverage]")).toContain("coverage not published");
    goTo("windows");
    expect(windowValues()).toEqual(["", "", "", "", "", ""]);
    expect(text("[data-prefill-reason]")).toBe(reason);
  });

  it("a source that lists no symbols, and a catalog that was not served, each leave the form blank with their own reason", async () => {
    await mountRoute("data");
    choose("fixture-query-any-symbol", "BTCUSDT");
    goTo("windows");
    expect(windowValues()).toEqual(["", "", "", "", "", ""]);
    expect(text("[data-prefill-reason]")).toBe("This source answers any symbol by query and publishes no symbol list. Nothing is prefilled.");
    cleanup();

    await mountRoute("data", { catalog: "not-served" });
    fireEvent.change(field("Dataset"), { target: { value: BTC.dataset } });
    fireEvent.change(field("Symbol"), { target: { value: BTC.symbol } });
    expect(document.querySelector("[data-catalog-unread]")).not.toBeNull();
    goTo("windows");
    expect(windowValues()).toEqual(["", "", "", "", "", ""]);
    expect(text("[data-prefill-reason]")).toBe("The dataset catalog was not read, so there is no coverage to prefill from.");
  });

  it("a prefill is an ordinary declaration: it sends what is on screen, and a held preflight dies with any change", async () => {
    const { served } = await mountRoute("data");
    fireEvent.click(document.querySelector('[data-timeframe-chip="1h"]') as HTMLElement);
    choose(BTC.dataset, BTC.symbol);
    goTo("windows");
    /* The interior boundaries are the reader's to choose. */
    fireEvent.change(field("IS end exclusive"), { target: { value: "2024-01-01T00:00" } });
    fireEvent.change(field("OOS start"), { target: { value: "2024-01-01T00:00" } });
    fireEvent.change(field("OOS end exclusive"), { target: { value: "2025-01-01T00:00" } });
    fireEvent.change(field("Holdout start"), { target: { value: "2025-01-01T00:00" } });
    goTo("optimization");
    fireEvent.change(field("Random seed"), { target: { value: "42" } });

    /* Filling the form has written nothing. */
    expect(served.calls.filter((call) => call.method !== "GET")).toEqual([]);

    goTo("review");
    const button = document.querySelector('[data-action="preflight"]') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(document.querySelector("[data-preflight-preview]")).toBeNull());

    const posts = served.calls.filter((call) => call.method === "POST");
    expect(posts).toHaveLength(1);
    const sent = JSON.parse(posts[0]!.body ?? "{}") as { requested_spec: RequestedSpec };
    expect(sent.requested_spec.data).toEqual({ dataset_id: BTC.dataset, symbol: BTC.symbol, timeframe: "1h" });
    expect(sent.requested_spec.windows).toEqual({
      is: { start: BTC.lower, end_exclusive: "2024-01-01T00:00" },
      oos: { start: "2024-01-01T00:00", end_exclusive: "2025-01-01T00:00" },
      holdout: { start: "2025-01-01T00:00", end_exclusive: BTC.upper },
    });
    expect(posts[0]!.body).not.toMatch(/coverage|prefill|placed|touched/i);

    /* A pick with different coverage changes the spec (the symbol, and the IS
       start the coverage replaced), so the held preview is gone. */
    goTo("data");
    fireEvent.change(field("Symbol"), { target: { value: "SOLUSDT" } });
    goTo("review");
    await waitFor(() => expect(document.querySelector("[data-preflight-preview]")).not.toBeNull());
    expect(text("[data-cleared-note]")).toBe(SPEC_CHANGED_NOTE);
    /* The change itself sent nothing: still exactly one POST. */
    expect(served.calls.filter((call) => call.method === "POST")).toHaveLength(1);

    /* The next preflight carries the replaced bound, not the old one. */
    fireEvent.click(document.querySelector('[data-action="preflight"]') as HTMLButtonElement);
    await waitFor(() => expect(served.calls.filter((call) => call.method === "POST")).toHaveLength(2));
    const second = JSON.parse(served.calls.filter((call) => call.method === "POST")[1]!.body ?? "{}") as { requested_spec: RequestedSpec };
    expect(second.requested_spec.windows?.is).toEqual({ start: "2020-09-01T00:00", end_exclusive: "2024-01-01T00:00" });
    expect(second.requested_spec.windows?.holdout.end_exclusive).toBe(BTC.upper);
    await waitFor(() => expect(document.querySelector("[data-preflight-preview]")).toBeNull());
  });
});

/* ---------------------------------------------- the view, both protocols */

function Harness({ initial, step, catalog = CATALOG, limits = LIMITS }: { initial: RunDraft; step: "data" | "windows"; catalog?: DatasetCatalog | null; limits?: typeof LIMITS }) {
  const [draft, setDraft] = useState<RunDraft>(initial);
  /* The same merge `useNewRun.patch` performs. */
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
      catalog={catalog}
      initialStep={step}
    />
  );
}

describe("D4 — the advanced protocol fills its own outer bounds and leaves the first OOS instant", () => {
  it("prefills the analysis span, says the first OOS instant has no default, and stays editable", () => {
    render(<Harness initial={{ ...emptyDraft(), protocol: "advanced" }} step="data" />);
    choose(BTC.dataset, BTC.symbol);
    goTo("windows");
    expect(field("Analysis start").value).toBe(BTC.lower);
    expect(field("Analysis end exclusive").value).toBe(BTC.upper);
    expect(field("First OOS instant").value).toBe("");
    expect(text('[data-prefill-caption="walkForward.start"]')).toBe("prefilled from BTCUSDT coverage · first day of 2020-01");
    expect(text("[data-prefill-interior]")).toBe("First OOS instant is left empty: the release publishes no default for it.");
    expect(text("[data-prefill-edges]")).toContain("must fit before the analysis start.");

    fireEvent.change(field("Analysis end exclusive"), { target: { value: "2020-06-01T00:00" } });
    expect(field("Analysis end exclusive").value).toBe("2020-06-01T00:00");
    expect(document.querySelector('[data-prefill-caption="walkForward.endExclusive"]')).toBeNull();
    expect(document.querySelector('[data-prefill-caption="walkForward.start"]')).not.toBeNull();
  });

  it("carries the outer bounds of both protocols, so switching protocol shows the same coverage", () => {
    render(<Harness initial={emptyDraft()} step="data" />);
    choose(BTC.dataset, BTC.symbol);
    goTo("windows");
    expect(windowValues()).toEqual([BTC.lower, "", "", "", "", BTC.upper]);
  });
});

describe("D4 — the caption tells the truth about the coverage it came from", () => {
  it("says how many months are present when the partitions have holes", () => {
    render(<Harness initial={emptyDraft()} step="data" />);
    choose(BTC_BYBIT.dataset, "ETHUSDT");
    goTo("windows");
    expect(text("[data-prefill-source]")).toBe("Prefilled from the coverage of fixture-bybit-1h · ETHUSDT: 2022-05 → 2025-11 · 40 of 43 months present, UTC month partitions.");
    expect(field("IS start").value).toBe("2022-05-01T00:00");
  });

  it("keeps a bound the reader cleared cleared, and a bound they retyped theirs, through the next pick", () => {
    render(<Harness initial={emptyDraft()} step="data" />);
    choose(BTC.dataset, BTC.symbol);
    goTo("windows");
    /* Cleared: an empty field is the reader's answer, not a blank waiting to be filled. */
    fireEvent.change(field("Holdout end exclusive"), { target: { value: "" } });
    expect(field("Holdout end exclusive").value).toBe("");
    /* Retyped to the very value the coverage had put there: it is theirs from that keystroke. */
    fireEvent.change(field("IS start"), { target: { value: "2020-02-02T00:00" } });
    fireEvent.change(field("IS start"), { target: { value: BTC.lower } });
    expect(document.querySelector('[data-prefill-caption="is.start"]')).toBeNull();
    expect(document.querySelector('[data-prefill-caption="holdout.endExclusive"]')).toBeNull();

    goTo("data");
    fireEvent.change(field("Symbol"), { target: { value: "SOLUSDT" } });
    goTo("windows");
    expect(field("IS start").value).toBe(BTC.lower);
    expect(field("Holdout end exclusive").value).toBe("");
    /* Nothing of the coverage is left to caption: both bounds are the reader's. */
    expect(document.querySelector("[data-prefill-caption]")).toBeNull();
    expect(text("[data-prefill-reason]")).toBe("The coverage of crypto-binance-1m · SOLUSDT is 2020-09 → 2026-09 · 73 months. The outer bounds here hold your own values, so nothing was prefilled.");
  });

  it("names no warmup it was not told, and none when the version declares none", () => {
    render(<Harness initial={emptyDraft()} step="data" limits={{ ...LIMITS, warmupBars: null }} />);
    choose(BTC.dataset, BTC.symbol);
    goTo("windows");
    expect(text("[data-prefill-edges]")).toBe("Month edges, not bar times — preflight checks the exact range and the declared warmup. Every value stays editable.");
    cleanup();
    render(<Harness initial={emptyDraft()} step="data" limits={{ ...LIMITS, warmupBars: 0 }} />);
    choose(BTC.dataset, BTC.symbol);
    goTo("windows");
    expect(text("[data-prefill-edges]")).toBe("Month edges, not bar times — preflight checks the exact range. Every value stays editable.");
  });

  it("names the dataset's own clock, because the server reads a naive boundary in it", () => {
    const zoned = catalogWith((copy) => { copy.datasets[0]!.source_timezone = "Asia/Ho_Chi_Minh"; });
    render(<Harness initial={emptyDraft()} step="data" catalog={zoned} />);
    choose(BTC.dataset, BTC.symbol);
    goTo("windows");
    expect(text("[data-prefill-source]")).toContain("Asia/Ho_Chi_Minh month partitions");
  });

  it("does not say a coverage filled anything once every outer bound is the reader's own", () => {
    render(<Harness initial={emptyDraft()} step="windows" />);
    fireEvent.change(field("IS start"), { target: { value: "2021-01-01T00:00" } });
    fireEvent.change(field("Holdout end exclusive"), { target: { value: "2025-01-01T00:00" } });
    goTo("data");
    choose(BTC.dataset, BTC.symbol);
    expect(text("[data-window-prefill-status]")).toBe("Not prefilled — bounds already set");
    goTo("windows");
    expect(windowValues()).toEqual(["2021-01-01T00:00", "", "", "", "", "2025-01-01T00:00"]);
    expect(text("[data-prefill-reason]")).toBe("The coverage of crypto-binance-1m · BTCUSDT is 2020-01 → 2026-09 · 81 months. The outer bounds here hold your own values, so nothing was prefilled.");
    expect(document.querySelector("[data-prefill-caption]")).toBeNull();
    expect(document.querySelector("[data-window-prefill-rail]")).toBeNull();
  });
});
