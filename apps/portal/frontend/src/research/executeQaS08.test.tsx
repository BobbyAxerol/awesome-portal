/**
 * QA 2026-10-02 · GROUP S08 (Execute Replay) — fixes, each with a test that
 * fails without it. Real published fixtures, a fetch double per endpoint so a
 * single read can fail (and then recover) without touching the others.
 *
 *  UX-03  retained read 403/404/5xx/network is not "the source did not publish"
 *  UX-02  a failed fold read never draws in-sample bars under an OOS selection
 *  UX-04  child-audit chip follows the response; the anatomy row always resolves
 *  UX-06  transitions failure names the panel and offers Retry
 *  UX-08  HOLDOUT is disabled with a tooltip for a run that has none
 *  UX-13  a ledger row of another fold loads THAT fold's window
 *  UX-14  previous / next transition disabled when there is none
 *  UX-05  readiness chip never spins for a progress read that failed
 *  UX-01/19  window change is one history entry; a bogus ?window= is dropped
 *  UX-12/T-13/I-17  short reveal chips, run-cumulative labels, fold scores
 *  I-13   window fee: exact sum of served per-bar fees, typed absence if a bar has none
 */
import { act, cleanup, fireEvent, render, renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExecuteRoute } from "./ExecuteRoute";
import { useExecuteWindow } from "./executeWindows";
import { formatCount } from "./researchFormat";
import type { CurrentSourceReplay, ReplayChildAudit, ReplayTransitions } from "./replayClient";
import { forgetRunIdentities } from "./retainedLane";

vi.mock("lightweight-charts", () => {
  const series = () => ({ setData: vi.fn(), applyOptions: vi.fn(), data: () => [] });
  return {
    ColorType: { Solid: "solid" },
    LineType: { WithSteps: 1 },
    CandlestickSeries: "candles",
    LineSeries: "line",
    createSeriesMarkers: () => ({ setMarkers: vi.fn() }),
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
const W3 = JSON.parse(readFileSync(join(process.cwd(), "src", "research", "w3RealWfo.fixture.json"), "utf8")) as { evidence: any; split: any };
const RUN = FOLD0.run_id;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const fail = (status: number) => json({ error: { code: "TEST_FAILURE" } }, status);
const HUB = {
  schema_version: "research.replay.v1",
  run_id: RUN,
  route: { id: null, state: "NOT_PUBLISHED", replay_contract: null, availability: { state: "NOT_PUBLISHED", reason_code: "P04_SOURCE_DID_NOT_PUBLISH_X" } },
  equity_replay: { items: [], page: {}, state_at_cursor: { playback_ordinal: null } },
};

type Handler = (url: URL, call: number) => Response | Promise<Response>;
type Handlers = Partial<Record<"replay" | "transitions" | "audit" | "progress" | "evidence" | "split", Handler>>;

function mount(handlers: Handlers = {}) {
  forgetRunIdentities();
  const calls: Record<string, URL[]> = {};
  const answer = (key: keyof Handlers, url: URL, fallback: () => Response) => {
    (calls[key] ??= []).push(url);
    const handler = handlers[key];
    return handler ? handler(url, calls[key]!.length - 1) : fallback();
  };
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new URL(String(input), "http://x");
    const path = url.pathname;
    if (path.endsWith("/current-source/split")) return answer("split", url, () => json(W3.split));
    if (path.endsWith("/current-source/replay/transitions")) return answer("transitions", url, () => json(LEDGER));
    if (path.endsWith("/current-source/replay/child-audit")) return answer("audit", url, () => json(AUDIT0));
    if (path.endsWith("/current-source/replay")) return answer("replay", url, () => json(FOLD0));
    if (path.endsWith("/current-source/evidence")) return answer("evidence", url, () => json(W3.evidence));
    if (path.endsWith("/execute/replay")) return json(HUB);
    if (path.endsWith("/progress")) return answer("progress", url, () => json(W3B.progress));
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
  return { ...view, calls };
}

const q = (container: HTMLElement, selector: string) => container.querySelector(selector) as HTMLElement | null;
const ready = (container: HTMLElement) =>
  waitFor(() => expect(q(container, "[data-retained-in-flight='false'] [data-chart='replay-candles']")).toBeTruthy(), { timeout: 10_000 });
const ledgerReady = (container: HTMLElement) => waitFor(() => expect(q(container, "[data-transitions='ready']")).toBeTruthy(), { timeout: 10_000 });
const retainedPanel = (container: HTMLElement) => q(container, "[data-research-panel='stitched account — retained walk-forward lane']");

describe("UX-03 · the retained read failed: one state per meaning", () => {
  it.each([403, 404])("a %i on the retained replay is 'denied', never 'the source did not publish a replay'", async (status) => {
    const { container } = mount({ replay: () => fail(status) });
    await waitFor(() => expect(retainedPanel(container)?.getAttribute("data-state")).toBe("denied"), { timeout: 10_000 });
    expect(container.textContent).not.toMatch(/did not publish a replay|readiness|route — not published/i);
    expect(q(container, "[data-action='retry-retained']")).toBeNull();
  });

  it("a 500 is 'unavailable' with Retry; Retry re-sends the read and the lane then renders", async () => {
    const { container, calls } = mount({ replay: (_url, call) => (call === 0 ? fail(500) : json(FOLD0)) });
    await waitFor(() => expect(retainedPanel(container)?.getAttribute("data-state")).toBe("unavailable"), { timeout: 10_000 });
    expect(container.textContent).not.toMatch(/did not publish a replay/i);
    const before = calls.replay!.length;
    fireEvent.click(q(container, "[data-action='retry-retained']")!);
    await ready(container);
    expect(calls.replay!.length).toBeGreaterThan(before);
    expect(retainedPanel(container)).toBeNull();
  });
});

describe("UX-02 · a failed fold read never draws in-sample bars under OOS", () => {
  const inSample = () => {
    const body = clone(FOLD0);
    for (const row of body.replay.rows) if (row.bar) row.bar.fold_id = null;
    return body;
  };

  it("shows 'Fold window not loaded' with Retry instead of the in-sample chart, and Retry loads the fold", async () => {
    let foldReads = 0;
    const { container } = mount({
      replay: (url) => {
        if (!url.searchParams.get("at")) return json(inSample());
        foldReads += 1;
        return foldReads === 1 ? fail(500) : json(FOLD0);
      },
    });
    await waitFor(() => expect(q(container, "[data-window-panel='oos-pending'][data-window-state='failed']")).toBeTruthy(), { timeout: 10_000 });
    expect(q(container, "[data-chart='replay-candles']")).toBeNull();
    expect(q(container, "[data-transport]")).toBeNull();
    expect(container.textContent).not.toContain("in-sample bars (no fold)");
    fireEvent.click(q(container, "[data-page-refusal] [data-action='retry-window']")!);
    await ready(container);
    expect(q(container, "[data-window-panel='oos-pending']")).toBeNull();
    expect(q(container, "[data-band-fold]")?.textContent).toBe("fold_01");
  });

  it("while the fold window is being read it says so, and the in-sample bars are not drawn meanwhile", async () => {
    let release: (value: Response) => void = () => undefined;
    const { container } = mount({
      replay: (url) => (url.searchParams.get("at") ? new Promise<Response>((resolve) => { release = resolve; }) : json(inSample())),
    });
    await waitFor(() => expect(q(container, "[data-window-panel='oos-pending'][data-window-state='reading']")).toBeTruthy(), { timeout: 10_000 });
    expect(q(container, "[data-chart='replay-candles']")).toBeNull();
    await act(async () => { release(json(FOLD0)); });
    await ready(container);
  });
});

describe("UX-04 · the child audit chip follows the response and the anatomy row resolves", () => {
  it("a 409 is 'could not be read' on the chip (not 'available') and on the anatomy row; nothing spins", async () => {
    const { container } = mount({ audit: () => fail(409) });
    await ready(container);
    await ledgerReady(container);
    await waitFor(() => expect(q(container, "[data-child-audit='refused']")).toBeTruthy());
    const chip = q(container, "[data-panel='child-audit'] [data-capability='child_audit']")!;
    expect(chip.getAttribute("data-capability-state")).toBe("READ_FAILED");
    expect(chip.textContent).toContain("could not be read");
    expect(q(container, "[data-panel='child-audit']")!.textContent).not.toMatch(/available/i);
    await waitFor(() => expect(q(container, "[data-anatomy] [data-link='child']")).toBeTruthy());
    const child = q(container, "[data-anatomy] [data-link='child']")!.textContent!;
    expect(child).toContain("not read");
    expect(child).not.toContain("reading");
    expect(q(container, "[data-action='retry-child-audit']")).toBeNull();
  });

  it("a 503 offers Retry and Retry reads the audit again", async () => {
    const { container } = mount({ audit: (_url, call) => (call === 0 ? fail(503) : json(AUDIT0)) });
    await ready(container);
    await waitFor(() => expect(q(container, "[data-action='retry-child-audit']")).toBeTruthy());
    fireEvent.click(q(container, "[data-action='retry-child-audit']")!);
    await waitFor(() => expect(q(container, "[data-child-audit='0']")).toBeTruthy());
    expect(q(container, "[data-panel='child-audit'] [data-capability-state='READ_FAILED']")).toBeNull();
  });

  it("an audit that loaded but holds no generation record for the transition says 'not in the N loaded records', not 'reading…'", async () => {
    const audit = clone(AUDIT0);
    for (const record of audit.records) record.context = "in-sample selection";
    const { container } = mount({ audit: () => json(audit) });
    await ready(container);
    await ledgerReady(container);
    await waitFor(() => expect(q(container, "[data-anatomy] [data-link='child']")?.textContent).toContain("not in the"));
    expect(q(container, "[data-anatomy] [data-link='child']")!.textContent).toContain(`not in the ${formatCount(audit.records.length)} loaded records`);
    expect(q(container, "[data-anatomy] [data-link='child']")!.textContent).not.toContain("reading");
  });
});

describe("UX-06 · transitions failure names the panel and offers Retry", () => {
  it("503 → 'Transitions unavailable' + Retry; Retry reads again and the ledger appears", async () => {
    const { container } = mount({ transitions: (_url, call) => (call === 0 ? fail(503) : json(LEDGER)) });
    await ready(container);
    await waitFor(() => expect(q(container, "[data-transitions='refused']")).toBeTruthy());
    expect(q(container, "[data-transitions='refused']")!.textContent).toContain("Transitions unavailable");
    fireEvent.click(q(container, "[data-action='retry-transitions']")!);
    await ledgerReady(container);
  });
});

describe("UX-08 · HOLDOUT for a run that has none", () => {
  it("is disabled with a tooltip, not a live button that answers with a code", async () => {
    const { container } = mount();
    await ready(container);
    await waitFor(() => expect((q(container, "[data-window='holdout']") as HTMLButtonElement).disabled).toBe(true));
    expect(q(container, "[data-window='holdout']")!.getAttribute("title")).toBe("This run has no holdout window.");
  });

  it("stays a live button when the run's holdout is only 'not published' (value path)", async () => {
    const evidence = clone(W3.evidence);
    evidence.claim.holdout = { ...evidence.claim.holdout, state: "NOT_PUBLISHED", availability: { state: "NOT_PUBLISHED", reason_code: "X" }, reason_code: "X" };
    const { container } = mount({ evidence: () => json(evidence) });
    await ready(container);
    await waitFor(() => expect(q(container, "[data-fold-strip]")).toBeTruthy());
    await waitFor(() => expect(q(container, "[data-fold-params]")).toBeTruthy());
    await waitFor(() => expect(q(container, "[data-claim]")?.textContent).not.toContain("reading"));
    expect((q(container, "[data-window='holdout']") as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("UX-13 · a ledger row of another fold loads that fold's own window", () => {
  it("reads the fold window by the fold's start cursor and its bar count — not a window starting at the clicked bar", async () => {
    const { container, calls } = mount();
    await ready(container);
    await ledgerReady(container);
    const segment = FOLD0.execution.fold_capital.segments[1]!;
    const row = LEDGER.rows.find((candidate) => candidate.source_ordinal === 890)!;
    const before = calls.replay!.length;
    fireEvent.click(q(container, `[data-transition-row='${row.source_ordinal}']`)!);
    await waitFor(() => expect(calls.replay!.length).toBe(before + 1));
    const url = calls.replay!.at(-1)!;
    expect(url.searchParams.get("at")).toBe(segment.start_cursor);
    expect(url.searchParams.get("at")).not.toBe(row.playback_cursor);
    expect(url.searchParams.get("limit")).toBe(String(segment.bars));
  });

  it("a row already inside the loaded window only moves the playhead (no read)", async () => {
    const { container, calls } = mount();
    await ready(container);
    await ledgerReady(container);
    const before = calls.replay!.length;
    fireEvent.click(q(container, "[data-transition-row='736']")!);
    expect(q(container, "[data-playhead-readout]")!.getAttribute("data-playhead-readout")).toBe("736");
    expect(calls.replay!.length).toBe(before);
  });
});

describe("UX-14 / UX-15 · transport buttons say what they do", () => {
  it("'previous transition' is disabled before the first one and enabled after it; speeds carry names", async () => {
    const { container } = mount();
    await ready(container);
    await ledgerReady(container);
    const previous = q(container, "[aria-label='previous transition']") as HTMLButtonElement;
    const next = q(container, "[aria-label='next transition']") as HTMLButtonElement;
    expect(previous.disabled).toBe(true);
    expect(previous.getAttribute("title")).toBe("This is the first transition.");
    expect(next.disabled).toBe(false);
    fireEvent.click(next);
    expect(q(container, "[data-playhead-readout]")!.getAttribute("data-playhead-readout")).toBe("727");
    expect(previous.disabled).toBe(true);
    fireEvent.click(next);
    expect(q(container, "[data-playhead-readout]")!.getAttribute("data-playhead-readout")).toBe("736");
    expect(previous.disabled).toBe(false);
    expect(q(container, "[data-speed='16']")!.getAttribute("aria-label")).toBe("playback speed 16×");
  });
});

describe("UX-05 · a progress read that failed is said once, not 'reading…' forever", () => {
  it("readiness chip and route chip use the same words", async () => {
    const { container } = mount({ progress: () => fail(500) });
    await ready(container);
    await waitFor(() => expect(q(container, "[data-readiness]")?.textContent).not.toContain("reading"), { timeout: 10_000 });
    expect(q(container, "[data-readiness]")!.textContent).toBe("readiness — the progress read did not answer");
    expect(q(container, "[data-route-id]")!.textContent).toBe("route — the progress read did not answer");
  });
});

describe("UX-01 / UX-19 · the window in the address", () => {
  it("a change of window is one history entry; the same window again adds none", () => {
    window.history.replaceState(null, "", "/x");
    const { result } = renderHook(() => useExecuteWindow());
    const depth = window.history.length;
    act(() => result.current[1]("is"));
    expect(window.location.search).toBe("?window=is");
    expect(window.history.length).toBe(depth + 1);
    act(() => result.current[1]("is"));
    expect(window.history.length).toBe(depth + 1);
    act(() => result.current[1]("oos"));
    expect(window.location.search).toBe("");
    expect(window.history.length).toBe(depth + 2);
  });

  it("an unreadable ?window= is dropped from the address on arrival, with no history entry", () => {
    window.history.replaceState(null, "", "/x?window=bogus&keep=1");
    const depth = window.history.length;
    const { result } = renderHook(() => useExecuteWindow());
    expect(result.current[0]).toBe("oos");
    expect(window.location.search).toBe("?keep=1");
    expect(window.history.length).toBe(depth);
  });

  it("Back / forward re-read the address", () => {
    window.history.replaceState(null, "", "/x?window=is");
    const { result } = renderHook(() => useExecuteWindow());
    expect(result.current[0]).toBe("is");
    window.history.replaceState(null, "", "/x");
    act(() => { window.dispatchEvent(new PopStateEvent("popstate")); });
    expect(result.current[0]).toBe("oos");
  });
});

describe("UX-12 / T-13 / I-17 · reveal chips, cumulative labels, fold scores", () => {
  it("under causal reveal the fold chips say 'hidden' (the long phrase is their tooltip)", async () => {
    const { container } = mount();
    await ready(container);
    await ledgerReady(container);
    await waitFor(() => expect(q(container, "[data-child-audit='0']")).toBeTruthy());
    act(() => { fireEvent.click(q(container, "[data-action='causal-reveal']")!); });
    const hidden = [...container.querySelectorAll("[data-fold] [data-reveal-hidden]")];
    expect(hidden.length).toBeGreaterThan(0);
    for (const node of hidden) {
      expect(node.textContent).toBe("hidden");
      expect(node.getAttribute("title")).toBe("hidden by causal reveal");
    }
  });

  it("the playhead readout says which numbers are run-cumulative", async () => {
    const { container } = mount();
    await ready(container);
    const readout = q(container, "[data-playhead-readout]")!;
    expect(readout.textContent).toContain("run fees so far");
    expect(readout.textContent).toContain("run transitions so far");
    expect(readout.textContent).not.toContain("to here");
    expect(readout.textContent).not.toContain("model state");
    expect(readout.getAttribute("title")).toContain("not a broker account");
  });

  it("each fold chip's tooltip carries the served fold score; an unpublished score adds nothing", async () => {
    const split = clone(W3.split);
    const first = split.fold_plan.folds[0];
    first.score = { state: "AVAILABLE", reason_code: null, is_sharpe: "1.25", oos_sharpe: "0.75", decay: "0.5", oos_trades: "42" };
    split.fold_plan.folds[1].score = { state: "NOT_PUBLISHED", reason_code: "X", is_sharpe: null, oos_sharpe: null, decay: null, oos_trades: null };
    const { container } = mount({ split: () => json(split) });
    await ready(container);
    await waitFor(() => expect(q(container, `[data-fold='${first.fold_id}']`)?.getAttribute("title")).toContain("OOS Sharpe 0.75"));
    expect(q(container, `[data-fold='${first.fold_id}']`)!.getAttribute("title")).toContain("IS Sharpe 1.25");
    expect(q(container, `[data-fold='${first.fold_id}']`)!.getAttribute("title")).toContain("OOS trades 42");
    expect(q(container, `[data-fold='${split.fold_plan.folds[1].fold_id}']`)!.getAttribute("title")).not.toContain("Sharpe");
  });
});

describe("I-13 · the window fee", () => {
  it("is 'not published' (typed absence) when one bar of the window carries no fee — never a partial sum, never 0", async () => {
    const body = clone(FOLD0);
    body.replay.rows[3]!.bar!.fee = null as unknown as string;
    const { container } = mount({ replay: () => json(body) });
    await ready(container);
    const line = q(container, "[data-cost-window]")!;
    expect(line.querySelector("[data-window-fee='NOT_PUBLISHED']")?.textContent).toBe("not published");
    expect(line.querySelector("[data-window-fee='NOT_PUBLISHED']")?.getAttribute("title")).toContain("no fee");
  });
});
