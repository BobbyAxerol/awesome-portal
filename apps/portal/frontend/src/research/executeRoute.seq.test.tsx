/**
 * W5 · S08 retained-lane / hub-lane `seq` at the route (SPEC_W5 §3.5).
 * seq is the 1-based public sample number: hub = playback_ordinal + 1,
 * retained = the bar's source_ordinal + 1. Only a reader's move writes it.
 */
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExecuteRoute } from "./ExecuteRoute";
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
const FOLD0 = load<CurrentSourceReplay>("research-current-source.replay.fold0.valid.json");
const LEDGER = load<ReplayTransitions>("research-current-source.replay-transitions.valid.json");
const AUDIT0 = load<ReplayChildAudit>("research-current-source.replay-child-audit.fold0.valid.json");
const HUB_P04 = load<{ run_id: string; equity_replay: { items: { playback_ordinal: number }[] } }>("research-replay.p04-real.first-window.valid.json");
const W3B = JSON.parse(readFileSync(join(process.cwd(), "src", "research", "w3bRealWfo.fixture.json"), "utf8")) as { progress: any; requested_spec: unknown };
const W3 = JSON.parse(readFileSync(join(process.cwd(), "src", "research", "w3RealWfo.fixture.json"), "utf8")) as { evidence: any; split: any };
const RUN = FOLD0.run_id;
const FIRST = FOLD0.replay.rows[0]!.source_ordinal; // 720
const LAST = FOLD0.replay.rows[FOLD0.replay.rows.length - 1]!.source_ordinal; // 887

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const HUB_DECLINES = {
  schema_version: "research.replay.v1",
  run_id: RUN,
  route: { id: null, state: "NOT_PUBLISHED", replay_contract: null, availability: { state: "NOT_PUBLISHED", reason_code: "P04_SOURCE_DID_NOT_PUBLISH_X" } },
  equity_replay: { items: [], page: {}, state_at_cursor: { playback_ordinal: null } },
};

function mountRetained(hash: string) {
  forgetRunIdentities();
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
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
  return mountAt(RUN, hash);
}

function mountAt(runId: string, hash: string) {
  const path = `/research/quantbt/runs/${runId}/execute`;
  window.history.replaceState(null, "", `${path}${hash}`);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/research/quantbt/runs/:runId/execute" element={<ExecuteRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}

const retainedReady = (container: HTMLElement) =>
  waitFor(() => expect(container.querySelector("[data-retained-in-flight='false'] [data-chart='replay-candles']")).toBeTruthy(), { timeout: 10_000 });
const readout = (container: HTMLElement) => container.querySelector("[data-playhead-readout]")?.getAttribute("data-playhead-readout");
const seqInHash = () => new URLSearchParams(window.location.hash.replace(/^#/, "")).get("seq");
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 150)); });

describe("S08 retained lane · seq", () => {
  it("(a) #seq=N inside the loaded window puts the playhead on source bar N and keeps seq", async () => {
    const { container } = mountRetained(`#stage=execute&seq=${FIRST + 11}`);
    await retainedReady(container);
    await waitFor(() => expect(readout(container)).toBe(String(FIRST + 10)));
    await settle();
    expect(seqInHash()).toBe(String(FIRST + 11));
    expect(container.querySelector("[data-cursor-notice]")).toBeNull();
  });

  it("(b) an out-of-window seq says so in one line and strips seq from the address", async () => {
    const { container } = mountRetained("#stage=execute&seq=5");
    await retainedReady(container);
    await waitFor(() => expect(container.querySelector("[data-cursor-notice]")).toBeTruthy());
    const notice = container.querySelector("[data-cursor-notice]")!;
    expect(notice.textContent).toContain(`bar 5 (last ${LAST + 1})`);
    await waitFor(() => expect(seqInHash()).toBeNull());
    expect(readout(container)).toBe(String(FIRST));
  });

  it("(c) step then rest writes seq = the playhead's source_ordinal + 1", async () => {
    const { container } = mountRetained("#stage=execute");
    await retainedReady(container);
    for (let at = 1; at <= 3; at += 1) {
      fireEvent.click(container.querySelector("[aria-label='step forward']")!);
      await waitFor(() => expect(readout(container)).toBe(String(FIRST + at)));
    }
    await waitFor(() => expect(seqInHash()).toBe(String(FIRST + 4)));
  });

  it("(e) a mount with no movement writes no seq", async () => {
    const { container } = mountRetained("#stage=execute");
    await retainedReady(container);
    await settle();
    expect(seqInHash()).toBeNull();
    expect(window.location.hash).not.toContain("seq");
  });
});

describe("S08 hub lane · seq", () => {
  function mountHub(hash: string) {
    forgetRunIdentities();
    const body = { ...HUB_P04, run_id: HUB_P04.run_id };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = new URL(String(input), "http://x").pathname;
      if (path.endsWith("/execute/replay")) return json(body);
      if (path.endsWith("/progress")) return json(W3B.progress);
      if (path.endsWith("/requested-spec")) return json(W3B.requested_spec);
      return json({ error: { code: "UNEXPECTED" } }, 404);
    });
    return mountAt(HUB_P04.run_id, hash);
  }

  it("(d) stepping writes playback_ordinal + 1; (e) P04 mounted without movement writes none", async () => {
    const { container } = mountHub("#stage=execute");
    await waitFor(() => expect(container.querySelector("[aria-label='step forward']")).toBeTruthy(), { timeout: 10_000 });
    await settle();
    expect(seqInHash()).toBeNull();
    const first = HUB_P04.equity_replay.items[0]!.playback_ordinal;
    for (let at = 1; at <= 2; at += 1) {
      fireEvent.click(container.querySelector("[aria-label='step forward']")!);
      await waitFor(() => expect(readout(container)).toBe(String(first + at)));
    }
    await waitFor(() => expect(seqInHash()).toBe(String(first + 3)));
  });
});
