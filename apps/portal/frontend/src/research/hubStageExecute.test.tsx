/**
 * Screen 04's Execute tab draws Screen 08's body (HiFi 04 `isExecute`).
 *
 * The tab used to print four "not published — the Evidence Hub publishes this
 * stage's timeline, not its content" boxes while Screen 08 read and drew that
 * very data. It now mounts Screen 08's container with `embedded`: the same
 * reads and body blocks, without the deep dive's breadcrumb, h1 and copy link.
 *
 * Bodies are the published canonical fixtures the Screen 08 tests use:
 *   - research-current-source.replay.fold0 / replay-transitions / child-audit
 *     (the W5b retained WFO bar ledger) with w3/w3b for split, evidence, identity
 *   - research-replay.p04-real.first-window (the P04 hub lane)
 */
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EvidenceFlow } from "./EvidenceFlow";
import { EXECUTE_TITLE } from "./ExecuteDetail";
import { ExecuteRoute } from "./ExecuteRoute";
import { DEFAULT_CURSOR } from "./evidenceCursor";
import type { CurrentSourceReplay, Replay, ReplayChildAudit, ReplayTransitions } from "./replayClient";
import { forgetRunIdentities } from "./retainedLane";
import { researchState } from "./state";

vi.mock("lightweight-charts", () => {
  /* jsdom has no canvas: a recording double, as in the Screen 08 tests. */
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

const FIXTURES = join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures");
const load = <T,>(name: string) => JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as T;
const local = <T,>(name: string) => JSON.parse(readFileSync(join(process.cwd(), "src", "research", name), "utf8")) as T;

const FOLD0 = load<CurrentSourceReplay>("research-current-source.replay.fold0.valid.json");
const LEDGER = load<ReplayTransitions>("research-current-source.replay-transitions.valid.json");
const AUDIT0 = load<ReplayChildAudit>("research-current-source.replay-child-audit.fold0.valid.json");
const P04 = load<Replay>("research-replay.p04-real.first-window.valid.json");
const W3 = local<{ evidence: unknown; split: unknown }>("w3RealWfo.fixture.json");
const W3B = local<{
  progress: unknown;
  requested_spec: unknown;
  hub_evidence: React.ComponentProps<typeof EvidenceFlow>["hub"] & object;
}>("w3bRealWfo.fixture.json");

const TIMELINE_SENTENCE = "the Evidence Hub publishes this stage's timeline";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** The P04 hub declines a WFO run; the screen then reads the retained lane. */
const HUB_DECLINES = {
  schema_version: "research.replay.v1",
  run_id: FOLD0.run_id,
  route: { id: null, state: "NOT_PUBLISHED", replay_contract: null, availability: { state: "NOT_PUBLISHED", reason_code: "P04_SOURCE_DID_NOT_PUBLISH_X" } },
  equity_replay: { items: [], page: {}, state_at_cursor: { playback_ordinal: null } },
};

function retainedFetch() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const path = new URL(String(input), "http://x").pathname;
    if (path.endsWith("/current-source/split")) return json(W3.split);
    if (path.endsWith("/current-source/replay/transitions")) return json(LEDGER);
    if (path.endsWith("/current-source/replay/child-audit")) return json(AUDIT0);
    if (path.endsWith("/current-source/replay")) return json(FOLD0);
    if (path.endsWith("/current-source/evidence")) return json(W3.evidence);
    if (path.endsWith("/execute/replay")) return json(HUB_DECLINES);
    if (path.endsWith("/progress")) return json(W3B.progress);
    if (path.endsWith("/requested-spec")) return json(W3B.requested_spec);
    return json({ error: { code: "UNEXPECTED" } }, 404);
  });
}

function p04Fetch() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const path = new URL(String(input), "http://x").pathname;
    if (path.endsWith("/execute/replay")) return json(P04);
    return json({ error: { code: "UNEXPECTED" } }, 404);
  });
}

function mountHub(runId: string) {
  const path = `/research/quantbt/runs/${runId}/evidence`;
  const hash = "#stage=execute&fold=1";
  window.history.replaceState(null, "", `${path}${hash}`);
  return render(
    <MemoryRouter initialEntries={[`${path}${hash}`]}>
      <Routes>
        <Route
          path="/research/quantbt/runs/:runId/evidence"
          element={
            <EvidenceFlow
              runId={runId}
              hub={W3B.hub_evidence}
              state={researchState({ kind: "ok", rowCount: 5 })}
              cursor={{ ...DEFAULT_CURSOR, stage: "execute", fold: 1 }}
              onStage={vi.fn()}
              onFold={vi.fn()}
              onResetCursor={vi.fn()}
              series={new Map()}
              ensureSeries={vi.fn()}
              passport={{ state: "idle" }}
              ensurePassport={vi.fn()}
              onReread={vi.fn()}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

function mountDeepDive(runId: string) {
  const path = `/research/quantbt/runs/${runId}/execute`;
  window.history.replaceState(null, "", path);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/research/quantbt/runs/:runId/execute" element={<ExecuteRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Screen 04 · Execute tab draws Screen 08's body (retained WFO lane)", () => {
  it("renders the candle replay, the transitions ledger and the band inside [data-panel='execute']", async () => {
    forgetRunIdentities();
    const fetchMock = retainedFetch();
    const { container } = mountHub(FOLD0.run_id);
    const panel = () => container.querySelector("[data-panel='execute']") as HTMLElement;
    await waitFor(() => expect(panel().querySelector("[data-transitions='ready']")).toBeTruthy(), { timeout: 10_000 });
    await waitFor(() => expect(panel().querySelector("[data-chart='replay-candles']")).toBeTruthy(), { timeout: 10_000 });

    const body = panel().querySelector("[data-screen='execute-replay']") as HTMLElement;
    expect(body.getAttribute("data-embedded")).toBe("hub");
    expect(body.getAttribute("data-lane")).toBe("retained");
    // The hub keeps the HiFi's tab title and the deep-dive link; the deep dive's own header is gone.
    expect(panel().querySelector("h2")?.textContent).toBe("Stage 4 · Execute — candle replay");
    expect(panel().querySelector("[data-deep-dive='execute']")?.getAttribute("href")).toContain(`/runs/${FOLD0.run_id}/execute#`);
    expect(body.querySelector("nav[aria-label='Breadcrumb']")).toBeNull();
    expect(body.querySelector("h1")).toBeNull();
    expect(body.querySelector("[data-header-actions]")).toBeNull();
    // No preview shell, and not the untrue sentence.
    expect(panel().querySelector("[data-stage-shells]")).toBeNull();
    expect(panel().textContent).not.toContain(TIMELINE_SENTENCE);
    // The reads are Screen 08's own.
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.includes(`/runs/${FOLD0.run_id}/current-source/replay`))).toBe(true);
    expect(urls.some((url) => url.includes("/current-source/replay/transitions"))).toBe(true);
  });
});

describe("Screen 04 · the hub's fold and the replay's fold stay one fold", () => {
  function hubAt(runId: string, fold: number, onFold: (fold: number) => void) {
    return (
      <MemoryRouter initialEntries={[`/research/quantbt/runs/${runId}/evidence#stage=execute&fold=1`]}>
        <Routes>
          <Route
            path="/research/quantbt/runs/:runId/evidence"
            element={
              <EvidenceFlow
                runId={runId}
                hub={W3B.hub_evidence}
                state={researchState({ kind: "ok", rowCount: 5 })}
                cursor={{ ...DEFAULT_CURSOR, stage: "execute", fold }}
                onStage={vi.fn()}
                onFold={onFold}
                onResetCursor={vi.fn()}
                series={new Map()}
                ensureSeries={vi.fn()}
                passport={{ state: "idle" }}
                ensurePassport={vi.fn()}
                onReread={vi.fn()}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );
  }

  it("a hub fold step reads that fold's window once, from its segment's start cursor", async () => {
    forgetRunIdentities();
    const fetchMock = retainedFetch();
    window.history.replaceState(null, "", `/research/quantbt/runs/${FOLD0.run_id}/evidence#stage=execute&fold=1`);
    const onFold = vi.fn();
    const { container, rerender } = render(hubAt(FOLD0.run_id, 1, onFold));
    await waitFor(() => expect(container.querySelector("[data-panel='execute'] [data-chart='replay-candles']")).toBeTruthy(), { timeout: 10_000 });
    const replayReads = () =>
      fetchMock.mock.calls.map(([url]) => new URL(String(url), "http://x")).filter((url) => url.pathname.endsWith("/current-source/replay"));
    const before = replayReads().length;
    expect(onFold).not.toHaveBeenCalled();

    rerender(hubAt(FOLD0.run_id, 2, onFold));
    await waitFor(() => expect(replayReads().length).toBe(before + 1));
    const segment = FOLD0.execution?.state === "AVAILABLE" ? FOLD0.execution.fold_capital.segments[1] : undefined;
    expect(segment).toBeTruthy();
    expect(replayReads().at(-1)!.search).toContain(encodeURIComponent(segment!.start_cursor).slice(0, 12));
  });
});

describe("Screen 04 · Execute tab draws Screen 08's body (P04 hub lane)", () => {
  it("renders the execution contract, the equity window and the sample ledger", async () => {
    forgetRunIdentities();
    p04Fetch();
    const { container } = mountHub(P04.run_id);
    const panel = () => container.querySelector("[data-panel='execute']") as HTMLElement;
    await waitFor(() => expect(panel().querySelector("[data-sample-row]")).toBeTruthy(), { timeout: 10_000 });
    const body = panel().querySelector("[data-screen='execute-replay']") as HTMLElement;
    expect(body.getAttribute("data-lane")).toBe("hub");
    expect(body.querySelector("[data-route-state]")?.getAttribute("data-route-state")).toBe(P04.route.state);
    expect(body.querySelector("[data-replay-window]")).toBeTruthy();
    expect(body.querySelector("[data-panel='event-ledger']")).toBeTruthy();
    expect(body.querySelector("h1")).toBeNull();
    expect(panel().textContent).not.toContain(TIMELINE_SENTENCE);
  });
});

describe("Screen 08 on its own route is unchanged (embedded = false)", () => {
  it("still draws the breadcrumb, the h1 and the copy-link header, in the screen frame", async () => {
    forgetRunIdentities();
    p04Fetch();
    const { container } = mountDeepDive(P04.run_id);
    await waitFor(() => expect(container.querySelector("[data-sample-row]")).toBeTruthy(), { timeout: 10_000 });
    const screen = container.querySelector("[data-screen='execute-replay']") as HTMLElement;
    expect(screen.hasAttribute("data-embedded")).toBe(false);
    expect(screen.className).toContain("max-w-[1440px]");
    expect(screen.querySelector("nav[aria-label='Breadcrumb'] [data-action='back-to-hub']")).toBeTruthy();
    expect(screen.querySelector("h1")?.textContent).toBe(EXECUTE_TITLE);
    expect(screen.querySelector("[data-header-actions]")).toBeTruthy();
  });
});

describe("the Execute body stays in the Execute tab", () => {
  /* V2 merge: every stage tab now embeds its own deep-dive body; this pins that Split's tab never mounts the replay. */
  it("Split's tab carries the Split body, not the replay", async () => {
    const { container } = render(
      <MemoryRouter>
        <EvidenceFlow
          runId={FOLD0.run_id}
          hub={W3B.hub_evidence}
          state={researchState({ kind: "ok", rowCount: 5 })}
          cursor={{ ...DEFAULT_CURSOR, stage: "split" }}
          onStage={vi.fn()}
          onFold={vi.fn()}
          onResetCursor={vi.fn()}
          series={new Map()}
          ensureSeries={vi.fn()}
          passport={{ state: "idle" }}
          ensurePassport={vi.fn()}
          onReread={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(container.querySelector("[data-panel='split'] [data-screen='execute-replay']")).toBeNull();
    /* The embedded Split body reads on mount; let it settle inside act. */
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  });
});
