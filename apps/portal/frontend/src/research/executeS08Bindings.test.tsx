/**
 * F2 · S08 — the Execute screen reads what the server serves.
 *
 * Bodies are the published canonical fixtures (the real-HMD retained seal and
 * its P11 progress read); a test that needs an absence clones the fixture and
 * nulls exactly the field under test, so every assertion fails without its
 * binding. Covers: null counts are a typed absence (never 0 / a dash), counts
 * are thousands-grouped, each fold's params digest comes from the progress
 * read's `selection`, a claim fact the source did not publish says so.
 */
import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CandleOverviewStrip, foldParams } from "./ExecuteCandleReplay";
import { ExecuteRoute } from "./ExecuteRoute";
import { formatCount } from "./researchFormat";
import type { CurrentSourceReplay, ReplayChildAudit, ReplayTransitions } from "./replayClient";
import { forgetRunIdentities } from "./retainedLane";

vi.mock("lightweight-charts", () => {
  const series = () => ({ setData: vi.fn(), applyOptions: vi.fn(), data: () => [] });
  const markers = { setMarkers: vi.fn() };
  return {
    ColorType: { Solid: "solid" },
    LineType: { WithSteps: 1 },
    CandlestickSeries: "candles",
    LineSeries: "line",
    createSeriesMarkers: () => markers,
    createChart: () => ({
      addSeries: () => series(),
      panes: () => [],
      remove: vi.fn(),
      setCrosshairPosition: vi.fn(),
      timeScale: () => ({ getVisibleLogicalRange: () => null, setVisibleLogicalRange: vi.fn(), fitContent: vi.fn() }),
    }),
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
vi.setConfig({ testTimeout: 30_000 });

const FIXTURES = join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures");
const load = <T,>(name: string) => JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as T;
const clone = <T,>(value: T) => JSON.parse(JSON.stringify(value)) as T;
const FOLD0 = load<CurrentSourceReplay>("research-current-source.replay.fold0.valid.json");
const LEDGER = load<ReplayTransitions>("research-current-source.replay-transitions.valid.json");
const AUDIT0 = load<ReplayChildAudit>("research-current-source.replay-child-audit.fold0.valid.json");
const W3B = JSON.parse(readFileSync(join(process.cwd(), "src", "research", "w3bRealWfo.fixture.json"), "utf8")) as { progress: any; requested_spec: unknown };
const W3 = JSON.parse(readFileSync(join(process.cwd(), "src", "research", "w3RealWfo.fixture.json"), "utf8")) as { evidence: any; split: unknown };
const RUN = FOLD0.run_id;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const HUB = {
  schema_version: "research.replay.v1",
  run_id: RUN,
  route: { id: null, state: "NOT_PUBLISHED", replay_contract: null, availability: { state: "NOT_PUBLISHED", reason_code: "P04_SOURCE_DID_NOT_PUBLISH_X" } },
  equity_replay: { items: [], page: {}, state_at_cursor: { playback_ordinal: null } },
};

type Bodies = { replay?: unknown; audit?: unknown; progress?: unknown; evidence?: unknown };

async function settled(bodies: Bodies = {}) {
  forgetRunIdentities();
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const path = new URL(String(input), "http://x").pathname;
    if (path.endsWith("/current-source/split")) return json(W3.split);
    if (path.endsWith("/current-source/replay/transitions")) return json(LEDGER);
    if (path.endsWith("/current-source/replay/child-audit")) return json(bodies.audit ?? AUDIT0);
    if (path.endsWith("/current-source/replay")) return json(bodies.replay ?? FOLD0);
    if (path.endsWith("/current-source/evidence")) return json(bodies.evidence ?? W3.evidence);
    if (path.endsWith("/execute/replay")) return json(HUB);
    if (path.endsWith("/progress")) return json(bodies.progress ?? W3B.progress);
    if (path.endsWith("/requested-spec")) return json(W3B.requested_spec);
    return json({ error: { code: "UNEXPECTED" } }, 404);
  });
  const path = `/research/quantbt/runs/${RUN}/execute`;
  window.history.replaceState(null, "", path);
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/research/quantbt/runs/:runId/execute" element={<ExecuteRoute />} />
      </Routes>
    </MemoryRouter>,
  );
  await waitFor(() => expect(view.container.querySelector("[data-transitions='ready']")).toBeTruthy(), { timeout: 10_000 });
  await waitFor(() => expect(view.container.querySelector("[data-retained-in-flight='false'] [data-chart='replay-candles']")).toBeTruthy(), { timeout: 10_000 });
  return view;
}

const tile = (container: HTMLElement, key: string) => container.querySelector(`[data-tile='${key}']`) as HTMLElement;

describe("F2 S08 · formatCount", () => {
  it("groups thousands and never invents a number for an absence", () => {
    expect(formatCount(1056)).toBe("1,056");
    expect(formatCount(1234567)).toBe("1,234,567");
    expect(formatCount(0)).toBe("0");
    expect(formatCount(null)).toBeNull();
    expect(formatCount(undefined)).toBeNull();
  });
});

describe("F2 S08 · tiles: a null count is a typed absence", () => {
  it("served counts print grouped, with no absence marker", async () => {
    const body = clone(FOLD0);
    body.execution.counts.orders_published = 12345;
    body.execution.counts.fills_published = 2000;
    body.execution.counts.trades_published = 0;
    body.execution.counts.transitions = 1500;
    body.execution.counts.rejected_orders = 3000;
    const { container } = await settled({ replay: body });
    expect(tile(container, "orders · fills · trades").textContent).toContain("12,345 · 2,000 · 0");
    expect(tile(container, "orders · fills · trades").querySelector("[data-tile-absent]")).toBeNull();
    expect(tile(container, "target transitions").textContent).toContain("1,500");
    expect(tile(container, "rejected orders").textContent).toContain("3,000");
  });

  it("null counts say 'not published' with the route fact's served reason code, never 0 or a dash", async () => {
    const body = clone(FOLD0);
    body.execution.counts.orders_published = null;
    body.execution.counts.fills_published = 7;
    body.execution.counts.trades_published = null;
    body.execution.counts.transitions = null;
    body.execution.counts.rejected_orders = null;
    const { container } = await settled({ replay: body });
    const orders = tile(container, "orders · fills · trades");
    expect(orders.textContent).toContain("not published · 7 · not published");
    expect(orders.querySelector("[data-tile-absent]")).toBeTruthy();
    const codes = [...orders.querySelectorAll("[data-reason-code]")].map((node) => node.getAttribute("data-reason-code"));
    const code = (fact: { reason_code?: string | null; availability: { reason_code: string | null } }) => fact.reason_code ?? fact.availability.reason_code;
    expect(codes).toEqual([code(body.route_capabilities.orders), code(body.route_capabilities.trades)].filter((c) => c));
    expect(tile(container, "target transitions").textContent).toContain("not published");
    expect(tile(container, "rejected orders").textContent).toContain("not published");
    for (const key of ["orders · fills · trades", "target transitions", "rejected orders"]) {
      expect(tile(container, key).textContent).not.toMatch(/—|\bN\/A\b/);
    }
    expect(tile(container, "rejected orders").querySelector("[data-tile-absent]")).toBeTruthy();
  });
});

describe("F2 S08 · child audit: window, caption counts", () => {
  it("a null test window is 'not published', not a dash; the caption groups served counts", async () => {
    const audit = clone(AUDIT0);
    audit.records[0]!.test_start_utc_ms = null;
    audit.records[0]!.test_end_utc_ms = null;
    const body = clone(FOLD0);
    body.execution.child_audit.source_record_count = 12345;
    body.execution.child_audit.records_dropped_by_source = 2000;
    const { container } = await settled({ audit, replay: body });
    await waitFor(() => expect(container.querySelector("[data-child-audit='0']")).toBeTruthy());
    const row = container.querySelector(`[data-audit-row='${audit.records[0]!.audit_ordinal}']`) as HTMLElement;
    expect(row.textContent).toContain("not published → not published");
    expect(row.textContent).not.toContain("—");
    /* T-06: the run-level facts ride in the caption's tooltip, still served and still exact. */
    const caption = container.querySelector("[data-child-audit-caption]")!.getAttribute("title")!;
    expect(caption).toContain("run total 12,345");
    expect(caption).toContain("dropped by QuantBT 2,000");
  });

  it("an unpublished run total says so", async () => {
    const body = clone(FOLD0);
    body.execution.child_audit.source_record_count = null;
    body.execution.child_audit.records_dropped_by_source = null;
    const { container } = await settled({ replay: body });
    await waitFor(() => expect(container.querySelector("[data-child-audit='0']")).toBeTruthy());
    const caption = container.querySelector("[data-child-audit-caption]")!.getAttribute("title")!;
    expect(caption).toContain("run total not published");
    expect(caption).toContain("dropped by QuantBT not published");
    expect(caption).not.toContain("—");
  });
});

describe("F2 S08 · overview caption counts are grouped", () => {
  const overview = {
    source_bar_count: 12000, emitted_bucket_count: 1500, bucket_bars: 8, sampling: "OHLC_BUCKET_V1" as const,
    envelope: { max_high: "12", min_low: "8" },
    values: [{ first_ordinal: 0, last_ordinal: 7, open_utc_ms: 0, close_utc_ms: 7, open: "10", high: "12", low: "8", close: "11", volume: null, transitions: null }],
  };
  it("prints 12,000 bars · 1,500 candles (8 bars each)", () => {
    const { container } = render(<CandleOverviewStrip overview={overview} scope="OOS" label="overview" />);
    expect(container.querySelector("[data-overview-caption]")?.textContent).toContain("12,000 bars · 1,500 candles (8 bars each)");
  });
  it("the fixture's real 1056-bar overview prints grouped on the screen", async () => {
    const { container } = await settled();
    expect(container.querySelector("[data-overview-caption]")?.textContent).toContain("1,056 bars · 151 candles (7 bars each)");
  });
});

describe("F2 S08 · each fold's params digest from the progress selection", () => {
  const folds = W3B.progress.progress.folds as { fold: number; selection: { params_digest: string } }[];

  it("joins engine fold 0 to progress fold 1 and carries the full digest in the title", () => {
    const digest = folds[0]!.selection.params_digest;
    expect(foldParams(W3B.progress, "0", true)).toEqual({ state: "value", digest });
    expect(foldParams(W3B.progress, "1", true)).toEqual({ state: "value", digest: folds[1]!.selection.params_digest });
  });

  it("absence keeps the served reason code; an unread progress is distinct from a missing selection", () => {
    const progress = clone(W3B.progress);
    progress.progress.folds[0].selection = {
      state: "NOT_PUBLISHED", scope: null, trial: null, objective: null, params_digest: null, reason_code: "SOURCE_DID_NOT_PUBLISH_FOLD_SELECTION",
    };
    delete progress.progress.folds[1].selection;
    expect(foldParams(progress, "0", true)).toEqual({ state: "absent", code: "SOURCE_DID_NOT_PUBLISH_FOLD_SELECTION" });
    expect(foldParams(progress, "1", true)).toEqual({ state: "absent", code: null });
    expect(foldParams(progress, "9", true)).toEqual({ state: "absent", code: null });
    expect(foldParams(null, "0", false)).toEqual({ state: "unread", answered: false });
    expect(foldParams(null, "0", true)).toEqual({ state: "unread", answered: true });
    expect(foldParams(progress, null, true)).toEqual({ state: "unread", answered: true });
  });

  it("the screen shows the active fold's params digest, and each fold chip carries it in its title", async () => {
    const { container } = await settled();
    const digest = folds[0]!.selection.params_digest;
    await waitFor(() => expect(container.querySelector("[data-fold-params]")?.getAttribute("data-fold-params")).toBe(digest));
    /* T-14: the digest is a tooltip, not a line of the screen. */
    expect(container.querySelector("[data-fold-params]")?.textContent).toBe("params");
    expect(container.querySelector("[data-fold-params]")?.getAttribute("title")).toBe(`params ${digest}`);
    expect(container.querySelector("[data-fold='0']")?.getAttribute("title")).toContain(`params ${digest}`);
  });

  it("a selection the source did not publish is shown as an absence with its reason code", async () => {
    const progress = clone(W3B.progress);
    progress.progress.folds[0].selection = {
      state: "NOT_PUBLISHED", scope: null, trial: null, objective: null, params_digest: null, reason_code: "SOURCE_DID_NOT_PUBLISH_FOLD_SELECTION",
    };
    const { container } = await settled({ progress });
    await waitFor(() => expect(container.querySelector("[data-fold-params='absent']")).toBeTruthy());
    const text = container.querySelector("[data-fold-params='absent']")!.textContent!;
    expect(text).toContain("params — not published");
    expect(container.querySelector("[data-fold-params='absent'] [data-reason-code]")?.getAttribute("data-reason-code")).toBe("SOURCE_DID_NOT_PUBLISH_FOLD_SELECTION");
    expect(container.querySelector("[data-fold='0']")?.getAttribute("title")).toContain("params not published SOURCE_DID_NOT_PUBLISH_FOLD_SELECTION");
  });
});

describe("F2 S08 · claim strip tokens", () => {
  it("a claim the source did not publish says so with the served reason code, never a dash", async () => {
    const evidence = clone(W3.evidence);
    const strip = evidence.claim;
    expect(strip).toBeTruthy();
    strip.validation_claim = { ...strip.validation_claim, value: null, state: "NOT_PUBLISHED", reason_code: "SOURCE_DID_NOT_PUBLISH_VALIDATION_CLAIM" };
    strip.causality_claim = { ...strip.causality_claim, value: null, state: "NOT_PUBLISHED", reason_code: null, availability: { state: "NOT_PUBLISHED", reason_code: "SOURCE_DID_NOT_PUBLISH_CAUSALITY_CLAIM" } };
    const { container } = await settled({ evidence });
    await waitFor(() => expect(container.querySelector("[data-claim] [data-reason-code]")).toBeTruthy());
    const claim = container.querySelector("[data-claim]")!;
    expect(claim.textContent).toContain("not published");
    expect(claim.querySelector("[data-reason-code]")?.getAttribute("data-reason-code")).toBe("SOURCE_DID_NOT_PUBLISH_VALIDATION_CLAIM");
    const causality = claim.nextElementSibling as HTMLElement;
    expect(causality.textContent).toContain("not published");
    expect(causality.querySelector("[data-reason-code]")?.getAttribute("data-reason-code")).toBe("SOURCE_DID_NOT_PUBLISH_CAUSALITY_CLAIM");
    expect(claim.textContent).not.toContain("—");
  });
});
