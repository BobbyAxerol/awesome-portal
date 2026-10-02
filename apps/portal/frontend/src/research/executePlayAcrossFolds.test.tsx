/**
 * D7 · Screen 08 — "play across folds" (HiFi 8.10, Unified §13.4.1 rows D7/G1).
 *
 * The decision: a switch, off by default. On, and only while playing, reaching
 * the last bar of the loaded window reads the next window through the screen's
 * one window-read path and keeps playing. The rules this file pins:
 *
 *   - 0 requests while it is off, while paused, and while stopped;
 *   - exactly one window read per boundary, never two in flight;
 *   - none past the last fold, none after turning it off;
 *   - a refusal or an unusable window stops playback and says why;
 *   - causal reveal changes nothing about the requests;
 *   - no control on the P04 hub lane or on a seal without a bar ledger.
 *
 * Every body is a published canonical fixture from `packages/contracts/fixtures`
 * (`research-current-source.replay.fold0`, the transitions ledger, the child
 * audit, `research-replay.p04-real.first-window`, the legacy seal). The canonical
 * fold-0 window is the only replay window the package publishes, so the window
 * of another fold is that same real window moved onto the fold's own published
 * span (`alignedFoldWindow`) — the shape the preview's own WFO run answers with
 * (2 folds × 168 bars, last fold `has_more: false`). Nothing here is a claim
 * about a real run.
 *
 * "A request" below is a window read: `GET …/current-source/replay`. The screen's
 * other reads (transitions, evidence, progress, split, a fold's child audit) are
 * counted separately, and the test that matters says the child audit does not
 * ride along with a boundary.
 */

import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExecuteScreen } from "./ExecuteDetail";
import { ExecuteRoute } from "./ExecuteRoute";
import { DEFAULT_CURSOR } from "./evidenceCursor";
import { REPLAY_REFUSAL_COPY, type CurrentSourceReplay, type FoldSegment, type Replay, type ReplayChildAudit, type ReplayTransitions } from "./replayClient";
import { ReplayTransport, type TransportScheduler } from "./replayTransport";
import { forgetRunIdentities } from "./retainedLane";
import { ACROSS_HELP, ACROSS_LABEL, ACROSS_SINGLE_FOLD, SEQUENCE_GAP_WORDS, decideBoundary } from "./usePlayAcrossFolds";
import { useReplay } from "./useReplay";
import { SYNTHETIC_FOLDS, alignedFoldWindow, scaleToFolds, syntheticChildAudit, syntheticFoldCursor } from "./w5bFoldScale.fixture";

vi.mock("lightweight-charts", () => {
  /* jsdom has no canvas: a recording double, so the tests read the data the chart was given. */
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
    __markers: markers,
  };
});

vi.setConfig({ testTimeout: 30_000 });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/* ---------------------------------------------------------------- fixtures */

const FIXTURES = join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures");
const load = <T,>(name: string) => JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as T;
const FOLD0 = load<CurrentSourceReplay>("research-current-source.replay.fold0.valid.json");
const LEDGER = load<ReplayTransitions>("research-current-source.replay-transitions.valid.json");
const LEGACY = load<CurrentSourceReplay>("research-current-source.replay.legacy-seal.valid.json");
const AUDIT0 = load<ReplayChildAudit>("research-current-source.replay-child-audit.fold0.valid.json");
const P04 = load<Replay>("research-replay.p04-real.first-window.valid.json");
const W3B = JSON.parse(readFileSync(join(process.cwd(), "src", "research", "w3bRealWfo.fixture.json"), "utf8")) as { progress: unknown; requested_spec: unknown };
const W3 = JSON.parse(readFileSync(join(process.cwd(), "src", "research", "w3RealWfo.fixture.json"), "utf8")) as { evidence: unknown; split: unknown };

const RUN = FOLD0.run_id;
const SEGMENTS = FOLD0.execution.fold_capital.segments;
const FOUR = scaleToFolds(FOLD0, 4);
const lastRow = (body: CurrentSourceReplay) => body.replay.rows.at(-1)!;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/* ------------------------------------------------------------ the stub API */

interface Deferred {
  promise: Promise<void>;
  release: () => void;
}
function deferred(): Deferred {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

interface ServerOptions {
  /** fold index → the refusal that fold's window read gets: an HTTP status, or a status with the server's own code. */
  refuse?: Record<number, number | { status: number; code: string }>;
  /** fold indexes whose window read is held until `release(fold)`. */
  hold?: number[];
  /** fold index → the body that fold's window read answers with. */
  answer?: Record<number, (base: CurrentSourceReplay) => CurrentSourceReplay>;
  /** serve fold 0 as two windows (bars 1–100, then the rest) so a boundary can fall inside a fold;
   *  "no-next" serves only the first, with no continuation offered. */
  paged?: boolean | "no-next";
  /** HTTP status: a `cursor=` read (the reader's own ‹next window›) is refused. */
  refuseCursor?: number;
}

type Kind = "window" | "audit" | "other";
interface Logged {
  kind: Kind;
  path: string;
  search: string;
}

/**
 * The retained lane for `base`. A first plain read answers the canonical window
 * (as the real API's plain read is answered in the existing S08 suite); a read
 * `?at=<fold start cursor>` answers that fold's window; `?cursor=` answers the
 * second slice of a paged fold 0.
 */
function serve(base: CurrentSourceReplay, options: ServerOptions = {}) {
  const segments = base.execution.fold_capital.segments;
  const gates = new Map<number, Deferred>((options.hold ?? []).map((fold) => [fold, deferred()]));
  const log: Logged[] = [];
  let live = 0;
  let peak = 0;
  const hub = {
    schema_version: "research.replay.v1",
    run_id: base.run_id,
    route: { id: null, state: "NOT_PUBLISHED", replay_contract: null, availability: { state: "NOT_PUBLISHED", reason_code: "P04_SOURCE_DID_NOT_PUBLISH_X" } },
    equity_replay: { items: [], page: {}, state_at_cursor: { playback_ordinal: null } },
  };
  const sliceOf = (from: number, to: number) => {
    const body = alignedFoldWindow(base, 0);
    const rows = body.replay.rows.slice(from, to);
    body.replay.rows = rows;
    body.replay.state_at_cursor = { ...body.replay.state_at_cursor, source_ordinal: rows[0]!.source_ordinal, at_utc_ms: rows[0]!.at_utc_ms };
    return body;
  };
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new URL(String(input), "http://x");
    const path = url.pathname;
    const record = (kind: Kind) => log.push({ kind, path, search: url.search });
    if (path.endsWith("/current-source/replay/transitions")) return record("other"), jsonResponse(LEDGER);
    if (path.endsWith("/current-source/replay/child-audit")) {
      record("audit");
      return jsonResponse(syntheticChildAudit(AUDIT0, Number(url.searchParams.get("fold"))));
    }
    if (path.endsWith("/current-source/replay")) {
      record("window");
      live += 1;
      peak = Math.max(peak, live);
      try {
        const at = url.searchParams.get("at");
        const cursor = url.searchParams.get("cursor");
        if (cursor !== null && options.refuseCursor) {
          return jsonResponse({ error: { code: "RESEARCH_CURRENT_SOURCE_UNAVAILABLE", message: "hidden" } }, options.refuseCursor);
        }
        if (cursor !== null && options.paged) return jsonResponse(sliceOf(100, 168));
        if (at === null) return jsonResponse(base);
        const fold = segments.findIndex((segment) => segment.start_cursor === at);
        if (fold === -1) return jsonResponse({ error: { code: "UNEXPECTED" } }, 404);
        await gates.get(fold)?.promise;
        const refusal = options.refuse?.[fold];
        if (refusal) {
          const { status, code } = typeof refusal === "number" ? { status: refusal, code: "RESEARCH_CURRENT_SOURCE_UNAVAILABLE" } : refusal;
          return jsonResponse({ error: { code, message: "hidden" } }, status);
        }
        if (options.paged && fold === 0) {
          const first = sliceOf(0, 100);
          first.replay.page =
            options.paged === "no-next"
              ? { ...first.replay.page, has_more: false, next_cursor: null }
              : { ...first.replay.page, has_more: true, next_cursor: FOLD0.replay.page.next_cursor };
          return jsonResponse(first);
        }
        return jsonResponse(options.answer?.[fold]?.(base) ?? alignedFoldWindow(base, fold));
      } finally {
        live -= 1;
      }
    }
    record("other");
    if (path.endsWith("/current-source/split")) return jsonResponse(W3.split);
    if (path.endsWith("/current-source/evidence")) return jsonResponse(W3.evidence);
    if (path.endsWith("/execute/replay")) return jsonResponse(hub);
    if (path.endsWith("/progress")) return jsonResponse(W3B.progress);
    if (path.endsWith("/requested-spec")) return jsonResponse(W3B.requested_spec);
    return jsonResponse({ error: { code: "UNEXPECTED" } }, 404);
  });
  return {
    spy,
    log,
    /** Every window read, as its query string, in the order sent. */
    windows: () => log.filter((entry) => entry.kind === "window").map((entry) => entry.search),
    audits: () => log.filter((entry) => entry.kind === "audit").map((entry) => new URLSearchParams(entry.search).get("fold")),
    peak: () => peak,
    release: (fold: number) => gates.get(fold)?.release(),
  };
}

/* ------------------------------------------------------- the manual clock */

/** A scheduler the test advances by hand, so playback is deterministic. */
function manualClock() {
  let now = 0;
  let queued: ((t: number) => void) | null = null;
  const scheduler: TransportScheduler = {
    request: (callback) => {
      queued = callback;
      return 1;
    },
    cancel: () => {
      queued = null;
    },
    now: () => now,
  };
  return {
    scheduler,
    advance(ms: number) {
      now += ms;
      const run = queued;
      queued = null;
      run?.(now);
    },
    pending: () => queued !== null,
  };
}

function Harness({ transport, runId }: { transport: ReplayTransport; runId: string }) {
  const controller = useReplay(runId, null, {});
  useEffect(() => () => transport.dispose(), [transport]);
  return (
    <MemoryRouter>
      <ExecuteScreen runId={runId} cursor={{ ...DEFAULT_CURSOR, stage: "execute" }} controller={controller} transport={transport} />
    </MemoryRouter>
  );
}

async function mountAcross(base: CurrentSourceReplay, options: ServerOptions = {}) {
  forgetRunIdentities();
  const server = serve(base, options);
  const clock = manualClock();
  const transport = new ReplayTransport(clock.scheduler);
  const view = render(<Harness transport={transport} runId={base.run_id} />);
  const { container } = view;
  await waitFor(() => expect(container.querySelector("[data-transitions='ready']")).toBeTruthy(), { timeout: 10_000 });
  await waitFor(() => expect(container.querySelector("[data-retained-in-flight='false'] [data-chart='replay-candles']")).toBeTruthy(), { timeout: 10_000 });
  await waitFor(() => expect(container.querySelector("[data-child-audit='0']")).toBeTruthy(), { timeout: 10_000 });
  const q = <T extends Element = HTMLElement>(selector: string) => container.querySelector(selector) as T | null;
  const ui = {
    switch: () => q<HTMLButtonElement>("[data-action='play-across-folds']")!,
    play: () => q<HTMLButtonElement>("[data-action='play']")!,
    status: () => q("[data-across-status]")?.getAttribute("data-across-status") ?? null,
    statusText: () => q("[data-across-status]")?.textContent ?? "",
    playing: () => q("[data-transport]")?.getAttribute("data-playing") === "true",
    foldOnScreen: () => q("[data-band-fold]")?.textContent ?? "",
    /** The playhead reaches the last loaded bar by itself. */
    runToEnd: () => act(() => clock.advance(600_000)),
    /** Let any stray request show itself before counting. */
    settle: () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 60)); }),
    total: () => server.spy.mock.calls.length,
  };
  return { ...view, server, clock, transport, ui };
}

type Mounted = Awaited<ReturnType<typeof mountAcross>>;

/** ON, press play, run to the window's end and wait for the boundary's outcome. */
async function playAcrossOnce(m: Mounted, expected: string) {
  await m.ui.runToEnd();
  await waitFor(() => expect(m.ui.status()).toBe(expected), { timeout: 5_000 });
}

const at = (segment: FoldSegment) => `at=${encodeURIComponent(segment.start_cursor)}`;

/* ------------------------------------------------------------------- units */

describe("D7 · the fixtures are the real two-fold run", () => {
  it("fold 0 and fold 1 are 168 bars each, carry-position, contiguous; the canonical window is fold 0", () => {
    expect(SEGMENTS.map((segment) => [segment.fold_id, segment.first_ordinal, segment.last_ordinal, segment.bars])).toEqual([
      ["0", 720, 887, 168],
      ["1", 888, 1055, 168],
    ]);
    expect(FOLD0.execution.fold_capital.equity_continuity).toBe("CONTINUOUS_ACROSS_FOLDS");
    expect(FOLD0.replay.rows[0]!.source_ordinal).toBe(720);
    expect(lastRow(FOLD0).source_ordinal).toBe(887);
    /* The derived window of fold 1 is on fold 1's own span and is the run's last window. */
    const one = alignedFoldWindow(FOLD0, 1);
    expect([one.replay.rows[0]!.source_ordinal, lastRow(one).source_ordinal]).toEqual([888, 1055]);
    expect(new Set(one.replay.rows.map((row) => row.bar!.fold_id))).toEqual(new Set(["1"]));
    expect([one.replay.page.has_more, one.replay.page.next_cursor]).toEqual([false, null]);
  });
});

describe("D7 · which read a boundary is (pure — nothing is sent)", () => {
  const page = FOLD0.replay.page;
  const rows = FOLD0.replay.rows;

  it("the last bar of fold 0 is a boundary into fold 1; the last bar of fold 1 is the end of the run", () => {
    expect(decideBoundary(rows, SEGMENTS, page)).toMatchObject({ kind: "fold", from: { fold_id: "0" }, to: { fold_id: "1" } });
    const second = alignedFoldWindow(FOLD0, 1);
    expect(decideBoundary(second.replay.rows, SEGMENTS, second.replay.page)).toMatchObject({ kind: "last-fold", segment: { fold_id: "1" } });
  });

  it("a window that stops inside a fold reads that fold's next window — only if the server offered one", () => {
    const inside = rows.slice(0, 100);
    expect(decideBoundary(inside, SEGMENTS, page)).toMatchObject({ kind: "window", segment: { fold_id: "0" } });
    expect(decideBoundary(inside, SEGMENTS, { ...page, has_more: false, next_cursor: null })).toMatchObject({ kind: "no-next-window" });
  });

  it("a bar in no published fold window (in-sample) and an empty window read nothing", () => {
    expect(decideBoundary([{ source_ordinal: 100 }], SEGMENTS, page)).toEqual({ kind: "not-in-a-fold" });
    expect(decideBoundary([], SEGMENTS, page)).toEqual({ kind: "not-in-a-fold" });
  });
});

describe("D7 · the transport announces only playback running dry", () => {
  it("fires once when the loop reaches the last bar; never for a step, a seek, a pause, a hidden tab or a load", () => {
    const clock = manualClock();
    const transport = new ReplayTransport(clock.scheduler);
    const ended = vi.fn();
    transport.subscribeEnd(ended);
    transport.load(24, 0);
    transport.step(3);
    transport.seek(23);
    transport.step(-1);
    transport.play();
    transport.pause();
    transport.play();
    transport.hide();
    transport.load(24, 0);
    expect(ended).not.toHaveBeenCalled();
    transport.play();
    clock.advance(1_000);
    expect(ended).not.toHaveBeenCalled();
    clock.advance(600_000);
    expect(transport.getSnapshot()).toMatchObject({ index: 23, playing: false });
    expect(ended).toHaveBeenCalledTimes(1);
    /* Nothing is scheduled after the end, so it cannot fire again by itself. */
    expect(clock.pending()).toBe(false);
  });

  it("counts the reader's own actions, not the loop's", () => {
    const clock = manualClock();
    const transport = new ReplayTransport(clock.scheduler);
    transport.load(24, 0);
    const start = transport.userActions;
    transport.play();
    clock.advance(600_000);
    expect(transport.userActions).toBe(start + 1);
    transport.step(-1);
    expect(transport.userActions).toBeGreaterThan(start + 1);
  });
});

/* ---------------------------------------------------- the switch, off / on */

describe("D7 · the switch: off by default, a real switch, its label says it reads", () => {
  it("renders as a labelled switch, off, with the read disclosed in its name and description", async () => {
    const m = await mountAcross(FOLD0);
    const control = within(m.container).getByRole("switch", { name: ACROSS_LABEL });
    expect(control).toBe(m.ui.switch());
    expect(control.getAttribute("aria-checked")).toBe("false");
    expect(control.tagName).toBe("BUTTON");
    expect(control.getAttribute("type")).toBe("button");
    expect(ACROSS_LABEL).toBe("play across folds");
    expect(control.textContent).toContain("off");
    expect(m.container.querySelector(`[id='${control.getAttribute("aria-describedby")}']`)?.textContent).toBe(ACROSS_HELP);
    expect(control.getAttribute("title")).toBe(ACROSS_HELP);
    /* VD-TEXT-01: the help was 68 words; it is a tooltip and a description, so it stays a short line. */
    expect(ACROSS_HELP.split(/\s+/).length).toBeLessThanOrEqual(12);
    /* The pill's measured HiFi geometry (padding 3px 10px, 10.5px mono, 3px radius). */
    expect(control.style.padding).toBe("3px 10px");
    expect(control.style.fontSize).toBe("10.5px");
    expect(control.className).toContain("rounded-[3px]");
    /* It sits in the transport row, between the speeds and the seek bar. */
    const row = [...m.container.querySelector("[data-transport]")!.children];
    const position = (element: Element | null) => row.indexOf(element!);
    expect(position(control)).toBeGreaterThan(-1);
    expect(position(control)).toBeGreaterThan(position(m.container.querySelector("[data-transport] > [role='group'][aria-label='speed']")));
    expect(position(control)).toBeLessThan(position(m.container.querySelector("[data-transport] > [data-seek]")));
  });

  it("toggling is local: it sends nothing, in either direction", async () => {
    const m = await mountAcross(FOLD0);
    const before = m.ui.total();
    fireEvent.click(m.ui.switch());
    expect(m.ui.switch().getAttribute("aria-checked")).toBe("true");
    expect(m.ui.switch().textContent).toContain("ON");
    fireEvent.click(m.ui.switch());
    expect(m.ui.switch().getAttribute("aria-checked")).toBe("false");
    await m.ui.settle();
    expect(m.ui.total()).toBe(before);
  });

  it("no link turns it on: a deep link with a fold and playback-looking keys still opens it off", async () => {
    forgetRunIdentities();
    const server = serve(FOLD0);
    const path = `/research/quantbt/runs/${RUN}/execute`;
    const hash = "#fold=2&across=on&across_folds=1&play=1";
    window.history.replaceState(null, "", `${path}${hash}`);
    const { container } = render(
      <MemoryRouter initialEntries={[`${path}${hash}`]}>
        <Routes>
          <Route path="/research/quantbt/runs/:runId/execute" element={<ExecuteRoute />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(container.querySelector("[data-retained-in-flight='false'] [data-chart='replay-candles']")).toBeTruthy(), { timeout: 10_000 });
    const control = container.querySelector("[data-action='play-across-folds']")!;
    expect(control.getAttribute("aria-checked")).toBe("false");
    expect(container.querySelector("[data-transport]")?.getAttribute("data-playing")).toBe("false");
    /* Arrival read the run once for the window and once more for fold 2's own window — nothing else. */
    expect(server.windows()).toHaveLength(2);
  });

  it("a run with one fold window has nothing to cross: the switch is disabled and says so", async () => {
    const m = await mountAcross(scaleToFolds(FOLD0, 1));
    expect(m.ui.switch().disabled).toBe(true);
    expect(m.ui.switch().getAttribute("title")).toBe(ACROSS_SINGLE_FOLD);
    expect(m.container.querySelector(`[id='${m.ui.switch().getAttribute("aria-describedby")}']`)?.textContent).toBe(ACROSS_SINGLE_FOLD);
    expect(m.ui.switch().getAttribute("aria-checked")).toBe("false");
  });
});

describe("D7 · OFF: playing stops at the end of the window, and nothing is read", () => {
  it("plays the whole window to its last bar and sends zero requests; the screen still says reads are on request", async () => {
    const m = await mountAcross(FOLD0);
    expect(m.container.querySelector("[data-read-rule]")?.getAttribute("data-read-rule")).toBe("asked");
    expect(m.container.querySelector("[data-read-rule]")?.getAttribute("title")).toBe("Windows are read only when you ask.");
    const before = m.ui.total();
    fireEvent.click(m.ui.play());
    expect(m.ui.playing()).toBe(true);
    await m.ui.runToEnd();
    await m.ui.settle();
    expect(m.ui.playing()).toBe(false);
    expect(m.transport.getSnapshot().index).toBe(167);
    expect(m.ui.total()).toBe(before);
    expect(m.server.windows()).toHaveLength(2);
    expect(m.ui.status()).toBeNull();
    /* Play from the end starts over; a second run to the end is still silent. */
    fireEvent.click(m.ui.play());
    await m.ui.runToEnd();
    await m.ui.settle();
    expect(m.ui.total()).toBe(before);
  });

  it("turned on then off again before playing, it is as silent as never having been on", async () => {
    const m = await mountAcross(FOLD0);
    const before = m.ui.total();
    fireEvent.click(m.ui.switch());
    fireEvent.click(m.ui.switch());
    fireEvent.click(m.ui.play());
    await m.ui.runToEnd();
    await m.ui.settle();
    expect(m.ui.total()).toBe(before);
    expect(m.ui.status()).toBeNull();
  });
});

/* -------------------------------------------------- ON: the boundary reads */

describe("D7 · ON, on the canonical two-fold run: one read at the boundary, none past the last fold", () => {
  it("reads fold 2's window once at the end of fold 1, keeps playing it, and stops at the last fold with nothing more read", async () => {
    const m = await mountAcross(FOLD0);
    const baseline = m.server.windows().length;
    expect(baseline).toBe(2); // the plain first window, then fold 1's own window
    fireEvent.click(m.ui.switch());
    expect(m.container.querySelector("[data-read-rule]")?.getAttribute("data-read-rule")).toBe("across");
    fireEvent.click(m.ui.play());
    await m.ui.settle();
    expect(m.server.windows()).toHaveLength(baseline); // turning on and pressing play read nothing

    await playAcrossOnce(m, "crossed");
    /* Exactly one more window read, for fold 2's own start cursor at that fold's own length. */
    expect(m.server.windows()).toHaveLength(baseline + 1);
    expect(m.server.windows().at(-1)).toContain(at(SEGMENTS[1]!));
    expect(m.server.windows().at(-1)).toContain("limit=168");
    expect(m.server.peak()).toBe(1);
    /* And it kept playing, on fold 2's first bar. */
    expect(m.ui.foldOnScreen()).toBe("fold_02");
    expect(m.ui.playing()).toBe(true);
    expect(m.transport.getSnapshot().index).toBe(0);
    expect(m.ui.statusText()).toContain("Entered fold_02");
    expect(m.ui.statusText()).toContain("capital carry_position, continuous across folds");
    expect(m.ui.statusText()).toContain("0 bars between the two test windows");
    expect(m.ui.statusText()).toContain("1 window read by play across folds");
    expect(m.container.querySelector("[data-across-status]")?.getAttribute("data-across-reads")).toBe("1");

    /* The last fold: playing ends there and nothing is read past it. */
    await playAcrossOnce(m, "end");
    await m.ui.settle();
    expect(m.server.windows()).toHaveLength(baseline + 1);
    expect(m.ui.statusText()).toBe("Reached the last bar of fold_02, the last fold of this run. Nothing is read past it.");
    expect(m.ui.playing()).toBe(false);
    /* Play again from the end: it restarts the last fold and ends there again, still reading nothing. */
    fireEvent.click(m.ui.play());
    await m.ui.runToEnd();
    await m.ui.settle();
    expect(m.server.windows()).toHaveLength(baseline + 1);
    expect(m.server.peak()).toBe(1);
  });

  it("the only request a boundary sends is the window read; the fold's child audit waits until playback rests", async () => {
    const m = await mountAcross(FOLD0);
    const mark = m.server.log.length;
    expect(m.server.audits()).toEqual(["0"]);
    fireEvent.click(m.ui.switch());
    fireEvent.click(m.ui.play());
    await playAcrossOnce(m, "crossed");
    /* Playing in fold 2 now. Everything sent since ON is one window read — no audit, no ledger, nothing. */
    expect(m.server.log.slice(mark).map((entry) => entry.kind)).toEqual(["window"]);
    /* And the card does not pretend to be reading: it says when it will. */
    expect(m.container.querySelector("[data-child-audit='waiting']")?.textContent).toBe(
      "fold_02's child audit loads when playback rests.",
    );
    expect(m.container.querySelector("[data-child-audit='loading']")).toBeNull();
    await playAcrossOnce(m, "end");
    /* Playback rests at the last fold: only now is that fold's audit read, once, as a fold switch would. */
    await waitFor(() => expect(m.server.audits()).toEqual(["0", "1"]));
    await m.ui.settle();
    expect(m.server.log.slice(mark).map((entry) => entry.kind)).toEqual(["window", "audit"]);
    await waitFor(() => expect(m.container.querySelector("[data-child-audit='1']")).toBeTruthy());
  });

  it("a pause ends the chain the same way: the deferred audit is read once, then, and no window is", async () => {
    const m = await mountAcross(FOUR);
    const baseline = m.server.windows().length;
    fireEvent.click(m.ui.switch());
    fireEvent.click(m.ui.play());
    await playAcrossOnce(m, "crossed");
    expect(m.server.audits()).toEqual(["0"]);
    act(() => m.clock.advance(3_000));
    fireEvent.click(m.ui.play()); // pause, mid fold 2
    await waitFor(() => expect(m.server.audits()).toEqual(["0", "1"]));
    await m.ui.settle();
    expect(m.server.windows()).toHaveLength(baseline + 1);
    expect(m.server.audits()).toEqual(["0", "1"]);
  });

  it("with four folds it is exactly one read per boundary — three — each for the next fold's own cursor, and none for a fifth", async () => {
    const m = await mountAcross(FOUR);
    const baseline = m.server.windows().length;
    fireEvent.click(m.ui.switch());
    fireEvent.click(m.ui.play());
    for (const [boundary, fold] of [1, 2, 3].entries()) {
      await playAcrossOnce(m, "crossed");
      expect(m.server.windows()).toHaveLength(baseline + boundary + 1);
      expect(m.server.windows().at(-1)).toContain(`at=${encodeURIComponent(syntheticFoldCursor(fold))}`);
      expect(m.ui.foldOnScreen()).toBe(`fold_0${fold + 1}`);
      expect(m.container.querySelector("[data-across-status]")?.getAttribute("data-across-reads")).toBe(String(boundary + 1));
      /* the next run-to-end below is a fresh natural end, not this one lingering */
      expect(m.ui.playing()).toBe(true);
      if (boundary < 2) await m.ui.settle();
    }
    await playAcrossOnce(m, "end");
    await m.ui.settle();
    expect(m.server.windows()).toHaveLength(baseline + 3);
    expect(m.server.peak()).toBe(1);
    expect(m.ui.statusText()).toContain("Reached the last bar of fold_04, the last fold");
    /* The audits followed once, for the fold playback rested on. */
    expect(m.server.audits()).toEqual(["0", "3"]);
  });

  it("a window that ends inside a fold reads that fold's next window (the very ‹next window› read), then crosses the fold boundary", async () => {
    const m = await mountAcross(FOLD0, { paged: true });
    const baseline = m.server.windows().length;
    expect(m.container.querySelectorAll("[data-candle-row]")).toHaveLength(100);
    fireEvent.click(m.ui.switch());
    fireEvent.click(m.ui.play());
    await playAcrossOnce(m, "crossed");
    /* Boundary 1 was inside fold 1: the continuation cursor, 68 more bars of the same fold. */
    expect(m.server.windows()).toHaveLength(baseline + 1);
    expect(m.server.windows().at(-1)).toContain(`cursor=${encodeURIComponent(FOLD0.replay.page.next_cursor!)}`);
    expect(m.container.querySelectorAll("[data-candle-row]")).toHaveLength(68);
    expect(m.ui.foldOnScreen()).toBe("fold_01");
    expect(m.ui.statusText()).toContain("Read the next window of fold_01");
    /* Boundary 2 is the fold's last bar: fold 2's first window. */
    await playAcrossOnce(m, "crossed");
    expect(m.server.windows()).toHaveLength(baseline + 2);
    expect(m.server.windows().at(-1)).toContain(at(SEGMENTS[1]!));
    expect(m.ui.foldOnScreen()).toBe("fold_02");
    expect(m.ui.statusText()).toContain("2 windows read by play across folds");
    expect(m.server.peak()).toBe(1);
  });
});

/* --------------------------------------------------- stopping, at any moment */

describe("D7 · no request while paused or stopped, and none after turning it off", () => {
  it("pausing mid-window: the window never ends, so nothing is read; stepping or seeking to the last bar by hand ends nothing either", async () => {
    const m = await mountAcross(FOUR);
    const baseline = m.server.windows().length;
    fireEvent.click(m.ui.switch());
    fireEvent.click(m.ui.play());
    act(() => m.clock.advance(5_000));
    expect(m.ui.playing()).toBe(true);
    fireEvent.click(m.ui.play()); // pause
    expect(m.ui.playing()).toBe(false);
    await m.ui.runToEnd(); // no frame is queued: nothing to advance
    /* By hand to the very last bar. */
    fireEvent.change(m.container.querySelector("[data-seek]")!, { target: { value: "167" } });
    fireEvent.click(m.container.querySelector("[aria-label='step back']")!);
    fireEvent.click(m.container.querySelector("[aria-label='step forward']")!);
    expect(m.transport.getSnapshot()).toMatchObject({ index: 167, playing: false });
    await m.ui.settle();
    expect(m.server.windows()).toHaveLength(baseline);
    expect(m.ui.status()).toBeNull();
  });

  it("turning it off mid-window: playback ends at the window's last bar and reads nothing", async () => {
    const m = await mountAcross(FOUR);
    const baseline = m.server.windows().length;
    fireEvent.click(m.ui.switch());
    act(() => m.transport.setSpeed(1)); // the default is 4×; 1× keeps this window from running dry in 20 s
    fireEvent.click(m.ui.play());
    act(() => m.clock.advance(20_000));
    expect(m.ui.playing()).toBe(true);
    fireEvent.click(m.ui.switch()); // off, while playing
    expect(m.ui.switch().getAttribute("aria-checked")).toBe("false");
    await m.ui.runToEnd();
    await m.ui.settle();
    expect(m.ui.playing()).toBe(false);
    expect(m.server.windows()).toHaveLength(baseline);
    expect(m.container.querySelector("[data-read-rule]")?.getAttribute("data-read-rule")).toBe("asked");
  });

  it("turning it off after a crossing stops every further read: one boundary read in all", async () => {
    const m = await mountAcross(FOUR);
    const baseline = m.server.windows().length;
    fireEvent.click(m.ui.switch());
    fireEvent.click(m.ui.play());
    await playAcrossOnce(m, "crossed");
    expect(m.server.windows()).toHaveLength(baseline + 1);
    fireEvent.click(m.ui.switch()); // off, while playing fold 2
    /* Off does not open the door to the deferred audit read while the window is still playing. */
    await m.ui.settle();
    expect(m.server.audits()).toEqual(["0"]);
    await m.ui.runToEnd();
    await m.ui.settle();
    expect(m.ui.playing()).toBe(false);
    expect(m.server.windows()).toHaveLength(baseline + 1);
    expect(m.ui.foldOnScreen()).toBe("fold_02");
    /* Once playback rests it is the screen's own arrival read for the fold on screen, sent once. */
    expect(m.server.audits()).toEqual(["0", "1"]);
  });

  it("turning it off while the boundary read is on its way: that read finishes, playback does not go on, nothing more is read", async () => {
    const m = await mountAcross(FOUR, { hold: [1] });
    const baseline = m.server.windows().length;
    fireEvent.click(m.ui.switch());
    fireEvent.click(m.ui.play());
    await m.ui.runToEnd();
    await waitFor(() => expect(m.server.windows()).toHaveLength(baseline + 1));
    expect(m.ui.status()).toBe("reading");
    expect(m.container.querySelector("[data-retained-in-flight='true']")).toBeTruthy();
    fireEvent.click(m.ui.switch());
    expect(m.ui.status()).toBe("off");
    await act(async () => { m.server.release(1); });
    await waitFor(() => expect(m.ui.foldOnScreen()).toBe("fold_02"));
    await m.ui.settle();
    expect(m.ui.playing()).toBe(false);
    expect(m.ui.statusText()).toContain("was turned off while this window was loading");
    expect(m.server.windows()).toHaveLength(baseline + 1);
    /* Even running the clock from here reads nothing: the loop is not running. */
    await m.ui.runToEnd();
    await m.ui.settle();
    expect(m.server.windows()).toHaveLength(baseline + 1);
  });

  it("turned off and on again while the boundary read is on its way: that one read is still the run's — counted once, playback goes on", async () => {
    const m = await mountAcross(FOUR, { hold: [1] });
    const baseline = m.server.windows().length;
    fireEvent.click(m.ui.switch());
    fireEvent.click(m.ui.play());
    await m.ui.runToEnd();
    await waitFor(() => expect(m.server.windows()).toHaveLength(baseline + 1));
    fireEvent.click(m.ui.switch());
    expect(m.ui.status()).toBe("off");
    fireEvent.click(m.ui.switch());
    expect(m.ui.status()).toBe("reading");
    await act(async () => { m.server.release(1); });
    await waitFor(() => expect(m.ui.status()).toBe("crossed"));
    expect(m.ui.statusText()).toContain("1 window read by play across folds");
    expect(m.ui.playing()).toBe(true);
    expect(m.server.windows()).toHaveLength(baseline + 1);
  });

  it("taking over the transport while the window loads: it lands, playback does not resume by itself", async () => {
    const m = await mountAcross(FOUR, { hold: [1] });
    const baseline = m.server.windows().length;
    fireEvent.click(m.ui.switch());
    fireEvent.click(m.ui.play());
    await m.ui.runToEnd();
    await waitFor(() => expect(m.server.windows()).toHaveLength(baseline + 1));
    fireEvent.click(m.container.querySelector("[aria-label='step back']")!); // the reader acts
    await act(async () => { m.server.release(1); });
    await waitFor(() => expect(m.ui.status()).toBe("took-over"));
    expect(m.ui.playing()).toBe(false);
    await m.ui.runToEnd();
    await m.ui.settle();
    expect(m.server.windows()).toHaveLength(baseline + 1);
  });
});

describe("D7 · never more than one window read in flight", () => {
  it("a second natural end while the boundary read is still on its way sends nothing; the peak is one", async () => {
    const m = await mountAcross(FOUR, { hold: [1] });
    const baseline = m.server.windows().length;
    fireEvent.click(m.ui.switch());
    fireEvent.click(m.ui.play());
    await m.ui.runToEnd();
    await waitFor(() => expect(m.server.windows()).toHaveLength(baseline + 1));
    /* The reader plays the old window again while fold 2's window is still loading, and it runs dry again. */
    fireEvent.click(m.ui.play());
    expect(m.ui.playing()).toBe(true);
    await m.ui.runToEnd();
    await m.ui.settle();
    expect(m.server.windows()).toHaveLength(baseline + 1);
    expect(m.server.peak()).toBe(1);
    await act(async () => { m.server.release(1); });
    await waitFor(() => expect(m.ui.foldOnScreen()).toBe("fold_02"));
    await m.ui.settle();
    expect(m.server.windows()).toHaveLength(baseline + 1);
    expect(m.server.peak()).toBe(1);
  });

  it("the reads through a whole 32-fold run are 31, one at a time", async () => {
    const big = scaleToFolds(FOLD0, SYNTHETIC_FOLDS);
    const m = await mountAcross(big);
    const baseline = m.server.windows().length;
    fireEvent.click(m.ui.switch());
    fireEvent.click(m.ui.play());
    for (let boundary = 1; boundary < SYNTHETIC_FOLDS; boundary += 1) {
      await playAcrossOnce(m, "crossed");
      expect(m.server.windows()).toHaveLength(baseline + boundary);
    }
    await playAcrossOnce(m, "end");
    await m.ui.settle();
    expect(m.server.windows()).toHaveLength(baseline + SYNTHETIC_FOLDS - 1);
    expect(m.server.peak()).toBe(1);
    expect(m.ui.statusText()).toContain(`Reached the last bar of fold_${SYNTHETIC_FOLDS}, the last fold`);
  }, 120_000);
});

/* ----------------------------------------------- a refusal or a bad window */

describe("D7 · a refusal or an unusable window stops playback and says why", () => {
  it("a refused read stops at the end of the fold on screen, in the screen's own words; nothing retries by itself", async () => {
    const m = await mountAcross(FOUR, { refuse: { 2: 503 } });
    const baseline = m.server.windows().length;
    fireEvent.click(m.ui.switch());
    fireEvent.click(m.ui.play());
    await playAcrossOnce(m, "crossed"); // fold 2 is fine
    expect(m.ui.foldOnScreen()).toBe("fold_02");
    await playAcrossOnce(m, "refused"); // fold 3 is refused
    expect(m.server.windows()).toHaveLength(baseline + 2);
    expect(m.ui.statusText()).toContain("Play across folds stopped at the end of fold_02: the read of fold_03 was refused.");
    expect(m.ui.statusText()).toContain(REPLAY_REFUSAL_COPY[503]);
    expect(m.ui.statusText()).not.toContain("hidden"); // the server's own message is never shown
    expect(m.container.querySelector("[data-across-status]")?.getAttribute("style")).toContain("var(--warn)");
    expect(m.ui.playing()).toBe(false);
    /* The window on screen is still fold 2's, on its last bar; the reason is said once. */
    expect(m.ui.foldOnScreen()).toBe("fold_02");
    expect(m.transport.getSnapshot().index).toBe(167);
    expect(m.container.querySelectorAll("[data-page-refusal]")).toHaveLength(0);
    expect((m.container.textContent!.match(new RegExp(REPLAY_REFUSAL_COPY[503].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length).toBe(1);
    await m.ui.runToEnd();
    await m.ui.settle();
    expect(m.server.windows()).toHaveLength(baseline + 2);
    /* Still no fifth-fold or retry read: a retry is the reader pressing play again — one read per press. */
    fireEvent.click(m.ui.play());
    expect(m.ui.status()).toBeNull(); // pressing play retires the stop
    await m.ui.runToEnd();
    await waitFor(() => expect(m.ui.status()).toBe("refused"));
    expect(m.server.windows()).toHaveLength(baseline + 3);
    expect(m.server.peak()).toBe(1);
  });

  it("its refusal is said once — but the reader's own refused ‹next window› afterwards is still said", async () => {
    const m = await mountAcross(FOUR, { refuse: { 1: 503 }, refuseCursor: 503 });
    fireEvent.click(m.ui.switch());
    fireEvent.click(m.ui.play());
    await playAcrossOnce(m, "refused");
    expect(m.container.querySelectorAll("[data-page-refusal]")).toHaveLength(0);
    /* A different read, the reader's, is refused too: it must not be swallowed by the earlier note. */
    fireEvent.click(m.container.querySelector("[data-action='next-window']")!);
    await waitFor(() => expect(m.container.querySelectorAll("[data-page-refusal]")).toHaveLength(1));
    expect(m.container.querySelector("[data-page-refusal]")?.textContent).toContain(REPLAY_REFUSAL_COPY[503]);
    /* QA S08: a refused read that may be repeated offers one explicit Retry. */
    expect(m.container.querySelector("[data-page-refusal] [data-action='retry-window']")).toBeTruthy();
  });

  it("a sequence gap is said as the gap it is, not as a generic refusal", async () => {
    const m = await mountAcross(FOUR, { refuse: { 1: { status: 409, code: "RESEARCH_CURRENT_SOURCE_SEQUENCE_GAP" } } });
    fireEvent.click(m.ui.switch());
    fireEvent.click(m.ui.play());
    await m.ui.runToEnd();
    await waitFor(() => expect(m.ui.status()).toBe("refused"));
    expect(m.ui.statusText()).toContain(SEQUENCE_GAP_WORDS);
    expect(m.ui.playing()).toBe(false);
    expect(m.ui.foldOnScreen()).toBe("fold_01");
  });

  it("an expired position costs the existing bounded recovery (one more read, the first window) and then stops rather than play it", async () => {
    const m = await mountAcross(FOUR, { refuse: { 1: { status: 409, code: "RESEARCH_CURRENT_SOURCE_CURSOR_EXPIRED" } } });
    const baseline = m.server.windows().length;
    fireEvent.click(m.ui.switch());
    fireEvent.click(m.ui.play());
    await playAcrossOnce(m, "unplayable");
    /* The boundary read, plus the screen's one recovery read of the first window — never a third. */
    expect(m.server.windows()).toHaveLength(baseline + 2);
    expect(m.server.windows().at(-2)).toContain(at(FOUR.execution.fold_capital.segments[1]!));
    expect(m.server.windows().at(-1)).not.toMatch(/at=|cursor=|before=/); // the first window, no token
    expect(m.ui.statusText()).toContain("the read position expired, so the first window was read again once instead");
    expect(m.ui.playing()).toBe(false);
    await m.ui.runToEnd();
    await m.ui.settle();
    expect(m.server.windows()).toHaveLength(baseline + 2);
    expect(m.server.peak()).toBe(1);
  });

  it("a window with fewer than two bars cannot be played: it says so and stops", async () => {
    const m = await mountAcross(FOLD0, {
      answer: {
        1: (base) => {
          const body = alignedFoldWindow(base, 1);
          body.replay.rows = body.replay.rows.slice(0, 1);
          return body;
        },
      },
    });
    const baseline = m.server.windows().length;
    fireEvent.click(m.ui.switch());
    fireEvent.click(m.ui.play());
    await playAcrossOnce(m, "unplayable");
    expect(m.ui.statusText()).toContain("the first window of fold_02 holds fewer than two bars");
    expect(m.ui.playing()).toBe(false);
    await m.ui.runToEnd();
    await m.ui.settle();
    expect(m.server.windows()).toHaveLength(baseline + 1);
  });

  it("a window that is not the one asked for (it starts elsewhere) stops instead of playing another fold's bars", async () => {
    const m = await mountAcross(FOUR, { answer: { 1: (base) => alignedFoldWindow(base, 3) } });
    fireEvent.click(m.ui.switch());
    fireEvent.click(m.ui.play());
    await playAcrossOnce(m, "unplayable");
    expect(m.ui.statusText()).toContain("the first window of fold_02 arrived starting at source bar");
    expect(m.ui.playing()).toBe(false);
  });

  it("a window that ends inside a fold with no continuation offered is not guessed at: nothing is read", async () => {
    const m = await mountAcross(FOLD0, { paged: "no-next" });
    const baseline = m.server.windows().length;
    fireEvent.click(m.ui.switch());
    fireEvent.click(m.ui.play());
    await playAcrossOnce(m, "no-next-window");
    expect(m.ui.statusText()).toContain("fold_01 has bars beyond this window, but the server offered no next window");
    expect(m.ui.playing()).toBe(false);
    await m.ui.settle();
    expect(m.server.windows()).toHaveLength(baseline);
  });
});

/* ------------------------------------------------------------------ reveal */

describe("D7 · causal reveal is unaffected", () => {
  it("the same reads are sent with reveal on as with reveal off; nothing revealed early, no outcome in the notice", async () => {
    const off = await mountAcross(FOLD0);
    fireEvent.click(off.ui.switch());
    fireEvent.click(off.ui.play());
    await playAcrossOnce(off, "crossed");
    const withoutReveal = off.server.windows();
    cleanup();
    vi.restoreAllMocks();

    const on = await mountAcross(FOLD0);
    fireEvent.click(on.container.querySelector("[data-action='causal-reveal']")!);
    fireEvent.click(on.ui.switch());
    fireEvent.click(on.ui.play());
    await playAcrossOnce(on, "crossed");
    expect(on.server.windows()).toEqual(withoutReveal);
    expect(on.container.querySelector("[data-action='causal-reveal']")?.getAttribute("aria-pressed")).toBe("true");
    /* Reveal cuts the new window at the playhead: it opens on its first bar, the rest is not drawn. */
    expect(on.container.querySelectorAll("[data-candle-row]").length).toBeLessThan(20);
    expect(on.ui.statusText()).not.toMatch(/[+−-]\d+\.\d+%|equity|return/i);
    /* And the reveal switch still works after a crossing. */
    fireEvent.click(on.container.querySelector("[data-action='causal-reveal']")!);
    expect(on.container.querySelectorAll("[data-candle-row]")).toHaveLength(168);
  });
});

/* -------------------------------------------------------------- other lanes */

describe("D7 · the control is the retained WFO lane's only", () => {
  it("the P04 hub lane draws no switch and says nothing about it", async () => {
    forgetRunIdentities();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = new URL(String(input), "http://x").pathname;
      if (path.endsWith("/execute/replay")) return jsonResponse(P04);
      return jsonResponse({ error: { code: "UNEXPECTED" } }, 404);
    });
    const path = `/research/quantbt/runs/${P04.run_id}/execute`;
    window.history.replaceState(null, "", path);
    const { container } = render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/research/quantbt/runs/:runId/execute" element={<ExecuteRoute />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(container.querySelector("[data-sample-row]")).toBeTruthy(), { timeout: 10_000 });
    expect(container.querySelector("[data-screen='execute-replay']")?.getAttribute("data-lane")).toBe("hub");
    expect(container.querySelector("[role='switch']")).toBeNull();
    expect(container.querySelector("[data-action='play-across-folds']")).toBeNull();
    expect(container.textContent).not.toMatch(/across folds|next window at each boundary/i);
  });

  it("a seal retained before the bar ledger has no fold windows to cross: no switch there either", async () => {
    forgetRunIdentities();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = new URL(String(input), "http://x").pathname;
      if (path.endsWith("/current-source/replay/transitions")) return jsonResponse(LEDGER);
      if (path.endsWith("/current-source/replay")) return jsonResponse(LEGACY);
      if (path.endsWith("/current-source/evidence")) return jsonResponse(W3.evidence);
      if (path.endsWith("/execute/replay")) {
        return jsonResponse({
          schema_version: "research.replay.v1",
          run_id: LEGACY.run_id,
          route: { id: null, state: "NOT_PUBLISHED", replay_contract: null, availability: { state: "NOT_PUBLISHED", reason_code: "P04_SOURCE_DID_NOT_PUBLISH_X" } },
          equity_replay: { items: [], page: {}, state_at_cursor: { playback_ordinal: null } },
        });
      }
      if (path.endsWith("/progress")) return jsonResponse(W3B.progress);
      if (path.endsWith("/requested-spec")) return jsonResponse(W3B.requested_spec);
      if (path.endsWith("/split")) return jsonResponse(W3.split);
      return jsonResponse({ error: { code: "UNEXPECTED" } }, 404);
    });
    const path = `/research/quantbt/runs/${LEGACY.run_id}/execute`;
    window.history.replaceState(null, "", path);
    const { container } = render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/research/quantbt/runs/:runId/execute" element={<ExecuteRoute />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(container.querySelector("[data-route-state='RETAINED_MODEL_SAMPLE']")).toBeTruthy(), { timeout: 10_000 });
    expect(container.querySelector("[role='switch']")).toBeNull();
    expect(container.textContent).not.toMatch(/across folds/i);
  });
});

/* ------------------------------------------------------ the whole product route */

describe("D7 · on the product route with the real clock", () => {
  it("plays across the one boundary of the canonical run at 64×: one read, the hash follows, the last fold ends it", async () => {
    forgetRunIdentities();
    const server = serve(FOLD0);
    const path = `/research/quantbt/runs/${RUN}/execute`;
    window.history.replaceState(null, "", path);
    const { container } = render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/research/quantbt/runs/:runId/execute" element={<ExecuteRoute />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(container.querySelector("[data-transitions='ready']")).toBeTruthy(), { timeout: 10_000 });
    await waitFor(() => expect(container.querySelector("[data-retained-in-flight='false'] [data-chart='replay-candles']")).toBeTruthy(), { timeout: 10_000 });
    await waitFor(() => expect(container.querySelector("[data-child-audit='0']")).toBeTruthy(), { timeout: 10_000 });
    const baseline = server.windows().length;
    fireEvent.click(container.querySelector("[data-speed='64']")!);
    fireEvent.click(container.querySelector("[data-action='play-across-folds']")!);
    fireEvent.click(container.querySelector("[data-action='play']")!);
    await waitFor(() => expect(container.querySelector("[data-across-status='end']")).toBeTruthy(), { timeout: 20_000 });
    expect(server.windows()).toHaveLength(baseline + 1);
    expect(server.windows().at(-1)).toContain(at(SEGMENTS[1]!));
    expect(server.peak()).toBe(1);
    await waitFor(() => expect(window.location.hash).toContain("fold=2"));
    expect(container.querySelector("[data-band-fold]")?.textContent).toBe("fold_02");
  }, 40_000);
});
