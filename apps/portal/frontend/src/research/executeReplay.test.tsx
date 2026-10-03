/**
 * P17 consumer tests — Screen 08 S4 Execute Replay.
 *
 * The claims that carry this phase:
 *
 *  - **A sample is not an execution state.** The chart, the playhead and the
 *    server's `state_at_cursor` are all labelled retrospective; the execution
 *    state is printed as not published.
 *  - **The transport never fetches.** Play, pause, step, seek and speed move
 *    over the loaded window; another window is an explicit button.
 *  - **An expired token is dropped, and recovery happens once.**
 *  - **Every hi-fi panel keeps its place** and names the reason code the route
 *    published. No order, fill, trade or candle row is drawn.
 */
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EXECUTE_TITLE, ExecuteScreen, PLAYHEAD_NOTE } from "./ExecuteDetail";
import { DEFAULT_CURSOR } from "./evidenceCursor";
import {
  REPLAY_REFUSAL_COPY,
  RETAINED_NOT_RETAINED,
  ROUTE_CAPABILITY_KEYS,
  replayApi,
  replayState,
  toReplayRefusal,
  type Replay,
} from "./replayClient";
import { DEFAULT_SPEED, JUMP, ReplayTransport, transportKey, type TransportScheduler } from "./replayTransport";
import { useReplay, type ReplayController } from "./useReplay";
import { PortalApiError } from "../lib/api";
import { ExecuteRoute } from "./ExecuteRoute";
import { HUB_LANE_REASON, forgetRunIdentities } from "./retainedLane";
import type { SplitBandSlot } from "./SplitBand";

/* W1: the stage pages read the Library status only when a lane refuses; these tests do not cover that read. */
vi.mock("./useRunStatus", () => ({
  useRunStatus: () => ({ state: "idle" }),
  setRunStatusSeed: () => undefined,
  clearRunStatusCache: () => undefined,
}));


afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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

/*
 * Shape and reason codes from `apps/control-api/test/research-replay.contract.spec.ts`
 * and `replay.service.ts` (no canonical frontend fixture is published yet —
 * CG-P17-01). Values are the spec's own, extended to a window of samples.
 */
const AVAILABLE = { state: "AVAILABLE", reason_code: null } as const;
const T0 = 1_725_000_000_000;
const HOUR = 3_600_000;
const token = (n: number) => `kc1.query-k1.${String(n).padStart(32, "a")}.${"b".repeat(43)}`;

const REASON: Record<string, string> = {
  orders: "P04_SOURCE_DID_NOT_PUBLISH_EXECUTION_ORDER_LEDGER",
  fills: "P04_SOURCE_DID_NOT_PUBLISH_AUDITED_FILLS",
  trades: "P04_SOURCE_DID_NOT_PUBLISH_EXECUTION_TRADE_LEDGER",
  positions: "P04_SOURCE_DID_NOT_PUBLISH_POSITION_STATE_SNAPSHOTS",
  execution_events: "P04_SOURCE_DID_NOT_PUBLISH_EXECUTION_EVENT_STREAM",
  candle_windows: "P04_SOURCE_DID_NOT_PUBLISH_REPLAY_CANDLE_WINDOWS",
  sl_tp_ambiguity: "P04_SOURCE_DID_NOT_PUBLISH_INTRABAR_SL_TP_AMBIGUITY",
  oco_tree: "P04_SOURCE_DID_NOT_PUBLISH_OCO_PARENT_CHILD_RELATIONSHIPS",
  multi_leg: "P04_SOURCE_DID_NOT_PUBLISH_MULTI_LEG_EXECUTION_FACTS",
  funding: "P04_SOURCE_DID_NOT_PUBLISH_FUNDING",
  mae_mfe: "P04_SOURCE_DID_NOT_PUBLISH_MAE_MFE_INPUTS",
  fold_capital: "P04_SOURCE_DID_NOT_PUBLISH_FOLD_CAPITAL_CONVENTION",
  child_audit_provenance: "P04_SOURCE_DID_NOT_PUBLISH_CHILD_AUDIT_REPLAY_PROVENANCE",
};
const EXEC_STATE = "P04_SOURCE_DID_NOT_PUBLISH_EXECUTION_STATE_SNAPSHOTS";

function notPublished(reason: string, parent?: { state: string; reason_code: string | null }) {
  return { state: "NOT_PUBLISHED", reason_code: reason, availability: parent ?? { state: "NOT_PUBLISHED", reason_code: reason } };
}

/**
 * E16-R1 · the retained OHLC overview of the same OOS window, as the server
 * serves it. Four true-extrema buckets over 240 bars; the envelope is a real
 * bucket's high/low, never a wider invented range.
 */
function candleOverview(bars: number, parent?: { state: string; reason_code: string | null }) {
  const bucketBars = bars / 4;
  const values = Array.from({ length: 4 }, (_, index) => ({
    first_ordinal: index * bucketBars,
    last_ordinal: (index + 1) * bucketBars - 1,
    open_utc_ms: T0 + index * bucketBars * HOUR,
    close_utc_ms: T0 + ((index + 1) * bucketBars - 1) * HOUR,
    open: (60000 + index * 500).toFixed(2),
    high: (61200 + index * 500).toFixed(2),
    low: (59400 + index * 500).toFixed(2),
    close: (60400 + index * 500).toFixed(2),
    volume: "1234.5",
    transitions: null,
  }));
  return {
    state: "AVAILABLE",
    reason_code: null,
    scope: "OOS_EQUITY_WINDOW",
    source_bar_count: bars,
    emitted_bucket_count: values.length,
    bucket_bars: bucketBars,
    sampling: "OHLC_BUCKET_V1",
    envelope: {
      max_high: values[3]!.high,
      max_high_at_utc_ms: values[3]!.close_utc_ms,
      min_low: values[0]!.low,
      min_low_at_utc_ms: values[0]!.open_utc_ms,
    },
    values,
    availability: parent ?? AVAILABLE,
  };
}

function absentOverview(reason: string, parent?: { state: string; reason_code: string | null }) {
  return {
    state: "NOT_PUBLISHED",
    reason_code: reason,
    scope: null,
    source_bar_count: null,
    emitted_bucket_count: null,
    bucket_bars: null,
    sampling: null,
    envelope: null,
    values: [],
    availability: parent ?? { state: "NOT_PUBLISHED", reason_code: reason },
  };
}

function replay(
  options: {
    count?: number;
    start?: number;
    sampling?: "FULL" | "EXTREMA_BUCKET_V1";
    selected?: number | null;
    route?: Replay["route"]["state"];
    /** E16-R1: `null` drops the field entirely, as an un-rolled-forward reader does. */
    overviewReason?: string | null;
  } = {},
): Replay {
  const { count = 24, start = 0, sampling = "FULL", selected = null, route = "RETROSPECTIVE_EQUITY_ONLY" } = options;
  const available = route === "RETROSPECTIVE_EQUITY_ONLY";
  const parent = available
    ? undefined
    : { state: route === "NOT_PUBLISHED" ? "NOT_PUBLISHED" : route, reason_code: `P13_${route}` };
  const total = 240;
  const items = available
    ? Array.from({ length: count }, (_, i) => ({
        playback_ordinal: start + i,
        at_utc_ms: T0 + (start + i) * HOUR,
        equity: (100 + (start + i) * 0.25).toFixed(2),
        drawdown_fraction: i % 5 === 0 ? "0.0125" : "0",
        playback_cursor: token(start + i),
      }))
    : [];
  const point = selected === null ? null : items.find((p) => p.playback_ordinal === selected) ?? null;
  return {
    schema_version: "research.replay.v1",
    read_authority: "PORTAL_PERSISTED_RESEARCH",
    run_id: "run_p17",
    revision: available ? `p17r1_${"a".repeat(64)}` : null,
    etag: available ? `"p17r1_${"a".repeat(64)}"` : null,
    availability: (parent ?? AVAILABLE) as Replay["availability"],
    readiness: available ? "PARTIAL" : "NOT_READY",
    as_of_utc_ms: 1_726_000_000_000,
    provenance: {
      source_adapter_id: "p04.delta-rsi.v1",
      evidence_revision: `p13r1_${"b".repeat(64)}`,
      source_transform_digest: "c".repeat(64),
      input_scope: "P08_OPTIONAL_WARMUP_PLUS_IS_OOS_ONLY",
    },
    route: {
      id: "signal_notional",
      state: route,
      replay_contract: available ? "P17_CURRENT_P04_EQUITY_SAMPLE_V1" : null,
      availability: (parent ?? AVAILABLE) as Replay["availability"],
    },
    equity_replay: {
      state: available ? "AVAILABLE" : "NOT_PUBLISHED",
      source_observation_count: available ? (sampling === "FULL" ? total : 5_000) : null,
      emitted_point_count: available ? total : null,
      sampling: available ? sampling : null,
      items,
      page: {
        limit: 100,
        next_cursor: available && start + count < total ? token(900 + start) : null,
        prev_cursor: available && start > 0 ? token(800 + start) : null,
        has_more: available && start + count < total,
        has_previous: available && start > 0,
        order: "SOURCE_CHRONOLOGICAL_SAMPLE_ORDINAL_ASC",
      },
      state_at_cursor: point
        ? {
            state: "AVAILABLE_RETROSPECTIVE_EQUITY_SAMPLE",
            semantics: "RETROSPECTIVE_EQUITY_NOT_EXECUTION_STATE",
            playback_ordinal: point.playback_ordinal,
            at_utc_ms: point.at_utc_ms,
            equity: point.equity,
            drawdown_fraction: point.drawdown_fraction,
            source_sampling: sampling,
            execution_state: notPublished(EXEC_STATE),
            availability: AVAILABLE,
          }
        : {
            state: available ? "NOT_SELECTED" : "NOT_PUBLISHED",
            semantics: available ? "NO_SELECTED_PLAYHEAD" : "SOURCE_DID_NOT_PUBLISH_EXECUTION_STATE",
            playback_ordinal: null,
            at_utc_ms: null,
            equity: null,
            drawdown_fraction: null,
            source_sampling: null,
            execution_state: notPublished(EXEC_STATE, parent),
            availability: (parent ?? AVAILABLE) as Replay["availability"],
          },
      availability: (parent ?? AVAILABLE) as Replay["availability"],
    },
    ...(options.overviewReason === null
      ? {}
      : {
        candle_overview: (options.overviewReason !== undefined
          ? absentOverview(options.overviewReason, parent)
          : available
            ? candleOverview(total)
            : absentOverview("P13_EVIDENCE_NOT_READABLE_FOR_RETAINED_CANDLE_OVERVIEW", parent)
        ) as Replay["candle_overview"],
      }),
    route_capabilities: Object.fromEntries(
      ROUTE_CAPABILITY_KEYS.map((key) => [key, notPublished(REASON[key]!, parent)]),
    ) as Replay["route_capabilities"],
    source_absences: {
      execution_state: notPublished(EXEC_STATE, parent),
      cross_stream_order: {
        state: "NOT_ASSERTED",
        reason_code: "P04_SOURCE_DID_NOT_PUBLISH_CROSS_STREAM_EXECUTION_ORDER",
        availability: parent ?? { state: "NOT_PUBLISHED", reason_code: "P04_SOURCE_DID_NOT_PUBLISH_CROSS_STREAM_EXECUTION_ORDER" },
      },
    } as Replay["source_absences"],
  } as Replay;
}

function controllerOf(value: Replay | null, patch: Partial<ReplayController> = {}): ReplayController {
  return {
    replay: value,
    refusal: null,
    state: value ? replayState(value) : { state: "loading", reason: "Loading.", mayRetry: true, retainsContent: false },
    inFlight: false,
    recovered: false,
    requestCount: 1,
    nextWindow: vi.fn(),
    previousWindow: vi.fn(),
    pin: vi.fn(),
    reread: vi.fn(),
    retained: { state: "idle" },
    ensureRetained: vi.fn(),
    ...patch,
  };
}

function renderScreen(
  controller: ReplayController,
  transport = new ReplayTransport(manualScheduler().scheduler),
  band: SplitBandSlot = { state: "idle" },
) {
  render(
    <MemoryRouter>
      <ExecuteScreen runId="run_p17" cursor={{ ...DEFAULT_CURSOR, stage: "execute" }} controller={controller} transport={transport} band={band} />
    </MemoryRouter>,
  );
  return transport;
}

/** A scheduler the test advances by hand, so playback is deterministic. */
function manualScheduler() {
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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/**
 * The hub read is followed by one read of the fixed observation route
 * (`researchFixedReplayObservationsGetV1`) for a P04 run. These tests count the
 * hub/retained reads only, so that route answers the canonical not-applicable
 * fixture (typed absence: the legacy lane stands) and is recorded apart.
 */
function routedFetch(responses: Response[], fallback?: () => Response) {
  const queue = [...responses];
  const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
  const fixedCalls: string[] = [];
  const notApplicable = JSON.parse(
    readFileSync(
      join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures", "research-fixed-replay-companion.not-applicable.valid.json"),
      "utf8",
    ),
  );
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    if (String(url).includes("/replay/observations")) {
      fixedCalls.push(String(url));
      return jsonResponse(notApplicable);
    }
    calls.push([url, init]);
    const next = queue.shift();
    if (next) return next;
    if (fallback) return fallback();
    throw new Error("unexpected extra request");
  });
  return { mock: { calls }, fixedCalls };
}

/* ------------------------------------------------------------------- tests */

describe("S08-U01 — the transport moves over loaded samples and never fetches", () => {
  it("clamps, steps and jumps within the window", () => {
    const transport = new ReplayTransport(manualScheduler().scheduler);
    transport.load(24, 0);
    transport.step(-1);
    expect(transport.getSnapshot().index).toBe(0);
    transport.step(JUMP);
    expect(transport.getSnapshot().index).toBe(10);
    transport.seek(999);
    expect(transport.getSnapshot().index).toBe(23);
  });

  it("opens at 4×, the HiFi default, and the 4× pill is the pressed one", () => {
    expect(DEFAULT_SPEED).toBe(4);
    expect(new ReplayTransport(manualScheduler().scheduler).getSnapshot().speed).toBe(4);
  });

  it("plays by elapsed time and speed, then stops at the end of the window", () => {
    const clock = manualScheduler();
    const transport = new ReplayTransport(clock.scheduler);
    transport.load(24, 0);
    transport.setSpeed(4);
    transport.play();
    clock.advance(500); // 0.5 s × 4/s × 4 = 8 samples
    expect(transport.getSnapshot().index).toBe(8);
    clock.advance(10_000);
    expect(transport.getSnapshot()).toMatchObject({ index: 23, playing: false });
    expect(clock.pending()).toBe(false);
  });

  it("pauses when the page hides, says why, and does not resume by itself", () => {
    const clock = manualScheduler();
    const transport = new ReplayTransport(clock.scheduler);
    transport.load(24, 0);
    transport.play();
    transport.hide();
    expect(transport.getSnapshot()).toMatchObject({ playing: false, pausedHidden: true });
    clock.advance(1_000);
    expect(transport.getSnapshot().index).toBe(0);
    transport.play();
    expect(transport.getSnapshot().pausedHidden).toBe(false);
  });

  it("maps Space, ←/→ and Shift+←/→, and leaves text fields alone", () => {
    const transport = new ReplayTransport(manualScheduler().scheduler);
    transport.load(40, 0);
    const body = document.body;
    expect(transportKey(transport, { key: "ArrowRight", shiftKey: false, target: body })).toBe(true);
    expect(transportKey(transport, { key: "ArrowRight", shiftKey: true, target: body })).toBe(true);
    expect(transport.getSnapshot().index).toBe(11);
    expect(transportKey(transport, { key: "ArrowLeft", shiftKey: false, target: body })).toBe(true);
    expect(transport.getSnapshot().index).toBe(10);
    expect(transportKey(transport, { key: " ", code: "Space", shiftKey: false, target: body })).toBe(true);
    expect(transport.getSnapshot().playing).toBe(true);
    transport.pause();
    const field = document.createElement("input");
    expect(transportKey(transport, { key: "ArrowRight", shiftKey: false, target: field })).toBe(false);
  });

  it("sends no request while the reader plays, steps, seeks or changes speed", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const transport = renderScreen(controllerOf(replay()));
    fireEvent.click(screen.getByRole("button", { name: "step forward" }));
    fireEvent.click(screen.getByRole("button", { name: "4×" }));
    fireEvent.change(screen.getByLabelText("seek within the loaded window"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "play" }));
    act(() => transport.pause());
    expect(transport.getSnapshot().index).toBe(12);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("S08-U02 — a sample is never an execution state", () => {
  it("labels the playhead and states the execution state as not published", () => {
    renderScreen(controllerOf(replay({ start: 40, selected: 45 })));
    expect(screen.getByText(PLAYHEAD_NOTE)).toBeTruthy();
    const at = document.querySelector("[data-state-at-cursor]")!;
    expect(at.getAttribute("data-state-at-cursor")).toBe("AVAILABLE_RETROSPECTIVE_EQUITY_SAMPLE");
    expect(at.textContent).toContain("retrospective equity not execution state");
    expect(document.querySelector("[data-execution-state]")!.textContent).toContain(EXEC_STATE);
  });

  it("puts the playhead on the sample the server selected", () => {
    const transport = renderScreen(controllerOf(replay({ start: 40, selected: 45 })));
    expect(transport.getSnapshot().index).toBe(5);
    expect(document.querySelector("[data-readout]")!.textContent).toContain("sample 46 of 240");
  });

  it("prints exact decimal strings, not re-formatted numbers", () => {
    renderScreen(controllerOf(replay()));
    expect(document.querySelector("[data-playhead-readout]")!.textContent).toContain("equity 100.00");
  });
});

describe("S08-U03 — sampling is shown as a limit", () => {
  it("says extrema buckets are not every observation and are not interpolated", () => {
    renderScreen(controllerOf(replay({ sampling: "EXTREMA_BUCKET_V1" })));
    expect(document.querySelector("[data-sampling]")!.getAttribute("data-sampling")).toBe("EXTREMA_BUCKET_V1");
    expect(document.querySelector("[data-sampling-note]")!.textContent).toBe("bucket extrema, not every observation");
    expect(document.querySelector("[data-counts]")!.textContent).toContain("source observations 5,000 · emitted samples 240");
  });
});

describe("S08-E16R1 — the retained OHLC overview on the P04 hub lane", () => {
  it("draws the whole out-of-sample window as true-extrema buckets, and says it is a downsample with its bucket size", () => {
    renderScreen(controllerOf(replay()));
    const block = document.querySelector('[data-candle-overview]')!;
    expect(block.getAttribute("data-candle-overview")).toBe("AVAILABLE");
    const strip = block.querySelector("[data-overview]")!;
    expect(strip.getAttribute("data-overview")).toBe("OHLC_BUCKET_V1");
    // One line per bucket, none invented and none dropped.
    expect(strip.querySelectorAll("svg line").length).toBe(4);
    const caption = block.querySelector("[data-overview-caption]")!.textContent!;
    expect(caption).toContain("out-of-sample window · 240 bars");
    expect(caption).toContain("4 candles (60 bars each)");
    // The long sentence is a tooltip now (VD-TEXT-01); the downsample itself stays on the caption.
    expect(caption).not.toContain("true extreme");
    expect(block.querySelector("[data-overview-caption]")!.getAttribute("title")).toContain("true extremes of its bars");
    // T-07: the envelope is the tooltip (grouped like the axis); the caption keeps the counts.
    expect(block.querySelector("[data-overview-caption]")!.getAttribute("title")).toContain("range 59,400.00 – 62,700.00");
  });

  it("keeps the per-bar candle ledger absent: a summary is not a bar ledger", () => {
    renderScreen(controllerOf(replay()));
    expect(document.querySelector('[data-candle-overview]')!.getAttribute("data-candle-overview")).toBe("AVAILABLE");
    const capability = document.querySelector('[data-capability="candle_windows"]')!;
    expect(capability.getAttribute("data-capability-state")).toBe("NOT_PUBLISHED");
    expect(capability.getAttribute("title")).toContain("P04_SOURCE_DID_NOT_PUBLISH_REPLAY_CANDLE_WINDOWS");
  });

  it("a run sealed before the producer retained an overview says so, with its own reason code and no zero", () => {
    renderScreen(controllerOf(replay({ overviewReason: "P13_SOURCE_PREDATES_RETAINED_CANDLE_OVERVIEW" })));
    const block = document.querySelector('[data-candle-overview]')!;
    expect(block.getAttribute("data-candle-overview")).toBe("NOT_PUBLISHED");
    expect(block.querySelector("[data-reason-code]")!.textContent).toBe("P13_SOURCE_PREDATES_RETAINED_CANDLE_OVERVIEW");
    expect(block.querySelector("[data-overview-note]")!.textContent)
      .toMatch(/sealed before the producer retained a price overview.*deleted when the run finished/);
    expect(block.querySelector("[data-overview-caption]")).toBeNull();
    expect(block.querySelectorAll("svg line").length).toBe(0);
    expect(block.textContent).not.toMatch(/\b0 bars\b|—\s*bars/);
  });

  it("distinguishes a pre-change run from an unreadable source and from an un-rolled-forward reader", () => {
    const seen = new Set<string>();
    for (const reason of [
      "P13_SOURCE_PREDATES_RETAINED_CANDLE_OVERVIEW",
      "P13_RETAINED_CANDLE_OVERVIEW_IS_INCOMPATIBLE",
      "P13_EVIDENCE_NOT_READABLE_FOR_RETAINED_CANDLE_OVERVIEW",
      "P13_CANDLE_OVERVIEW_EXCEEDS_RECEIPT_BYTE_BUDGET",
      "P04_OOS_WINDOW_HAS_NO_PRICED_BAR",
    ]) {
      cleanup();
      renderScreen(controllerOf(replay({ overviewReason: reason })));
      const block = document.querySelector("[data-candle-overview]")!;
      const note = block.querySelector("[data-overview-note]")!.textContent!;
      expect(block.querySelector("[data-reason-code]")!.textContent, reason).toBe(reason);
      expect(note.length, reason).toBeGreaterThan(20);
      seen.add(note);
    }
    // Five different reasons must read as five different sentences.
    expect(seen.size).toBe(5);
  });

  it("a replay read that predates the field at all is named, not treated as a run without bars", () => {
    renderScreen(controllerOf(replay({ overviewReason: null })));
    const block = document.querySelector('[data-candle-overview]')!;
    expect(block.getAttribute("data-candle-overview")).toBe("NOT_PUBLISHED");
    expect(block.querySelector("[data-reason-code]")!.textContent)
      .toBe("P17_REPLAY_READ_PREDATES_RETAINED_CANDLE_OVERVIEW");
    expect(block.querySelector("[data-overview-note]")!.textContent)
      .toMatch(/deployment's replay read does not publish a price overview yet/);
  });
});

describe("S08-U04 — every hi-fi panel keeps its place with a published reason", () => {
  it("names all thirteen route capabilities with their reason codes", () => {
    renderScreen(controllerOf(replay()));
    for (const key of ROUTE_CAPABILITY_KEYS) {
      /* W4: ONE "Not published by this source" block; each name's reason code is its tooltip. */
      const facts = document.querySelectorAll(`[data-not-published-block] [data-capability="${key}"]`);
      expect(facts.length, key).toBe(1);
      expect(facts[0]!.getAttribute("title")).toContain(REASON[key]);
    }
    expect(document.querySelectorAll("[data-not-published-block]")).toHaveLength(1);
    expect(document.querySelector("[data-not-published-block]")!.getAttribute("title")).toContain("not asserted");
    expect(document.querySelector("[data-not-published-block]")!.getAttribute("title")).toContain("cross stream order");
  });

  it("W4: the five empty cards and the 7-sentence disclosure are one block", () => {
    renderScreen(controllerOf(replay()));
    expect(document.querySelectorAll("[data-absent-panel]")).toHaveLength(0);
    expect(document.querySelector("[data-source-absences] summary")).toBeNull();
    const block = document.querySelector("[data-not-published-block]") as HTMLElement;
    expect(block.querySelector("h2")?.textContent).toBe("Not published by this source");
    expect(block.querySelector("table,tr")).toBeNull();
  });

  it("draws samples in the ledger and calls them samples, not events", () => {
    renderScreen(controllerOf(replay()));
    const ledger = document.querySelector('[data-panel="event-ledger"]')!;
    /* T-16: the filler sentence is gone; the panel title already says what the rows are. */
    expect(ledger.textContent).not.toContain("not events");
    expect(ledger.querySelectorAll("[data-sample-row]").length).toBe(14);
    expect(document.body.textContent).not.toMatch(/\bFILL\b|\bORDER_NEW\b|\bSIGNAL\b/);
  });

  it("seeks from a ledger row without a request", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const transport = renderScreen(controllerOf(replay()));
    fireEvent.click(screen.getByRole("button", { name: "6" }));
    expect(transport.getSnapshot().index).toBe(5);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("S08-U05 — route states other than retrospective equity", () => {
  it.each([
    ["PENDING_SOURCE_CALLBACK", "has not called back"],
    ["LEGACY_METADATA_ONLY", "legacy metadata only"],
    ["NOT_PUBLISHED", "did not publish a replay"],
  ] as const)("%s keeps the shell and every panel, with no chart", (route, words) => {
    const value = replay({ route });
    expect(replayState(value).state).toBe("unavailable");
    renderScreen(controllerOf(value));
    expect(screen.getByText(EXECUTE_TITLE)).toBeTruthy();
    expect(document.querySelector("[data-route-note]")!.textContent).toContain(words);
    expect(document.querySelector('[data-chart="replay-equity"]')).toBeNull();
    expect(document.querySelector("[data-transport]")).toBeNull();
    expect(document.querySelectorAll("[data-absent-panel]").length).toBe(0);
    expect(document.querySelector('[data-not-published-block] [data-capability="orders"]')!.getAttribute("data-capability-state")).toBe("NOT_PUBLISHED");
  });
});

describe("S08-U06 — refusals speak fixed copy and keep the shell", () => {
  it.each([
    [400, "RESEARCH_REPLAY_CURSOR_INVALID", "terminal"],
    [401, "AUTH_REQUIRED", "denied"],
    [403, "RESEARCH_REPLAY_FORBIDDEN", "denied"],
    /* X3 2026-09-26 (VD-P23-03, F-04): a 404 reads as a 403. */
    [404, "RESEARCH_REPLAY_NOT_FOUND", "denied"],
    [409, "RESEARCH_REPLAY_CURSOR_EXPIRED", "stale"],
    [503, "RESEARCH_REPLAY_UNAVAILABLE", "unavailable"],
  ] as const)("%i %s → %s", (status, code, state) => {
    const refusal = toReplayRefusal(new PortalApiError("internal prose /private/path", status, code, "req_1"));
    expect(refusal.state).toBe(state);
    expect(refusal.message).toBe(REPLAY_REFUSAL_COPY[status]);
    expect(refusal.message).not.toContain("/private");
    expect(refusal.cursorExpired).toBe(status === 409);
  });

  it("a denial neither confirms the run exists nor names its owner (F-04)", () => {
    const refusal = toReplayRefusal(new PortalApiError("x", 403, "RESEARCH_REPLAY_FORBIDDEN", null));
    expect(refusal.message).not.toMatch(/belongs|member|owner/i);
    expect(refusal.message).toContain("or it doesn't exist");
  });

  it("on the retained lane, 409 is pending retention and 404 reads as 403 (F-04)", () => {
    const pending = toReplayRefusal(new PortalApiError("x", 409, "RESEARCH_CURRENT_SOURCE_CONFLICT", null), "retained");
    expect([pending.state, pending.message, pending.cursorExpired]).toEqual(["unavailable", RETAINED_NOT_RETAINED, false]);
    const missing = toReplayRefusal(new PortalApiError("x", 404, "RESEARCH_CURRENT_SOURCE_NOT_FOUND", null), "retained");
    const forbidden = toReplayRefusal(new PortalApiError("x", 403, "RESEARCH_CURRENT_SOURCE_FORBIDDEN", null), "retained");
    expect([missing.state, missing.message]).toEqual(["denied", forbidden.message]);
  });

  it("while loading, keeps the shell busy and draws no sample, panel or zero", () => {
    renderScreen(controllerOf(null, { inFlight: true }));
    expect(screen.getByText(EXECUTE_TITLE)).toBeTruthy();
    expect(document.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(document.querySelector("[data-replay-window]")).toBeNull();
    expect(document.querySelector("[data-absent-panel]")).toBeNull();
    expect(document.body.textContent).not.toMatch(/\bsample 0\b|\b0 of\b/);
  });

  it("renders the title under a refusal, without subtitle or footer, and no panel content", () => {
    const refusal = toReplayRefusal(new PortalApiError("x", 403, "RESEARCH_REPLAY_FORBIDDEN", null));
    renderScreen(
      controllerOf(null, {
        refusal,
        state: { state: refusal.state, reason: refusal.message, mayRetry: false, retainsContent: false },
      }),
    );
    expect(screen.getByText(EXECUTE_TITLE)).toBeTruthy();
    // VD-TEXT-01: no subtitle under the title and no "rules of this screen" footer.
    expect(document.querySelector("[data-subtitle]")).toBeNull();
    expect(document.querySelector("[data-rules]")).toBeNull();
    expect(document.body.textContent).not.toMatch(/rules of this screen/i);
    expect(screen.getByText(REPLAY_REFUSAL_COPY[403])).toBeTruthy();
    expect(document.querySelector("[data-absent-panel]")).toBeNull();
  });
});

describe("S08-U07 — reads: one on arrival, one bounded recovery, and nothing else", () => {
  it("sends one plain GET on arrival, with no If-None-Match and no navigation input", async () => {
    const { mock: fetchMock } = routedFetch([], () => jsonResponse(replay()));
    const { result } = renderHook(() => useReplay("run_p17", null));
    await waitFor(() => expect(result.current.replay).not.toBeNull());
    expect(fetchMock.calls).toHaveLength(1);
    const [url, init] = fetchMock.calls[0]!;
    expect(String(url)).toBe("/api/v1/quantbt/runs/run_p17/execute/replay?limit=100");
    expect((init as RequestInit).method ?? "GET").toBe("GET");
    expect(JSON.stringify((init as RequestInit).headers ?? {})).not.toMatch(/If-None-Match/i);
  });

  it("restores an explicit deep link with one at_ordinal read", async () => {
    const { mock: fetchMock } = routedFetch([], () => jsonResponse(replay({ start: 40, selected: 45 })));
    const { result } = renderHook(() => useReplay("run_p17", 45));
    await waitFor(() => expect(result.current.replay).not.toBeNull());
    expect(fetchMock.calls).toHaveLength(1);
    expect(String(fetchMock.calls[0]![0])).toContain("at_ordinal=45");
  });

  it("sends exactly one navigation token per window request", async () => {
    const { mock: fetchMock } = routedFetch([jsonResponse(replay()), jsonResponse(replay({ start: 24 }))]);
    const { result } = renderHook(() => useReplay("run_p17", null));
    await waitFor(() => expect(result.current.replay).not.toBeNull());
    act(() => result.current.nextWindow());
    await waitFor(() => expect(result.current.replay!.equity_replay.items[0]!.playback_ordinal).toBe(24));
    const url = new URL(String(fetchMock.calls[1]![0]), "http://x");
    expect(url.searchParams.get("cursor")).toBe(token(900));
    expect(["before", "at", "at_ordinal"].filter((k) => url.searchParams.has(k))).toEqual([]);
  });

  it("on 409 CURSOR_EXPIRED drops the token and recovers once by public ordinal", async () => {
    const expired = jsonResponse({ error: { code: "RESEARCH_REPLAY_CURSOR_EXPIRED", message: "x" } }, 409);
    const { mock: fetchMock } = routedFetch([jsonResponse(replay()), expired, jsonResponse(replay({ start: 0, selected: 7 }))]);
    const { result } = renderHook(() => useReplay("run_p17", null));
    await waitFor(() => expect(result.current.replay).not.toBeNull());
    act(() => result.current.pin(token(7), 7));
    await waitFor(() => expect(result.current.recovered).toBe(true));
    expect(fetchMock.calls).toHaveLength(3);
    const recovery = String(fetchMock.calls[2]![0]);
    expect(recovery).toContain("at_ordinal=7");
    expect(recovery).not.toContain(token(7));
  });

  it("does not loop: a second 409 is a refusal, not a third request", async () => {
    const expired = () => jsonResponse({ error: { code: "RESEARCH_REPLAY_CURSOR_EXPIRED", message: "x" } }, 409);
    const { mock: fetchMock } = routedFetch([jsonResponse(replay()), expired(), expired()]);
    const { result } = renderHook(() => useReplay("run_p17", null));
    await waitFor(() => expect(result.current.replay).not.toBeNull());
    act(() => result.current.nextWindow());
    await waitFor(() => expect(result.current.refusal?.status).toBe(409));
    expect(fetchMock.calls).toHaveLength(3);
    /* The window already on screen stays; the refusal is stated over it. */
    expect(result.current.replay).not.toBeNull();
    expect(result.current.state.retainsContent).toBe(true);
  });

  it("reads the retained model replay only when asked", async () => {
    const { mock: fetchMock } = routedFetch([
      jsonResponse(replay()),
      jsonResponse({ error: { code: "RESEARCH_CURRENT_SOURCE_CONFLICT", message: "x" } }, 409),
    ]);
    const { result } = renderHook(() => useReplay("run_p17", null));
    await waitFor(() => expect(result.current.replay).not.toBeNull());
    expect(fetchMock.calls).toHaveLength(1);
    act(() => result.current.ensureRetained());
    act(() => result.current.ensureRetained());
    await waitFor(() => expect(result.current.retained.state).toBe("refused"));
    expect(fetchMock.calls).toHaveLength(2);
    /* A retained 409 means "not retained yet", not an expired cursor or a changed revision. */
    const slot = result.current.retained as {
      state: "refused";
      refusal: { message: string; cursorExpired: boolean; state: string };
    };
    expect(slot.refusal.message).toBe(RETAINED_NOT_RETAINED);
    expect(slot.refusal.state).toBe("unavailable");
    expect(slot.refusal.cursorExpired).toBe(false);
    expect(String(fetchMock.calls[1]![0])).toBe("/api/v1/quantbt/runs/run_p17/current-source/replay");
  });
});

describe("S08-U08 — the surface is read-only and names only its two operations", () => {
  const files = ["replayClient.ts", "useReplay.ts", "ExecuteDetail.tsx", "ExecuteRoute.tsx", "replayTransport.ts"];

  it("has no write, no CSRF proof and no command", () => {
    for (const file of files) {
      const code = codeOf(file);
      expect(code, file).not.toMatch(/method:\s*"(POST|PUT|PATCH|DELETE)"/);
      expect(code, file).not.toMatch(/csrf/i);
    }
  });

  it("calls only the two published replay paths", () => {
    const client = codeOf("replayClient.ts");
    const paths = [...client.matchAll(/\/(execute\/replay|current-source\/replay)/g)].map((m) => m[1]);
    expect(new Set(paths)).toEqual(new Set(["execute/replay", "current-source/replay"]));
    expect(client).not.toMatch(/relation|source_cursor|artifact_path|route=/);
  });

  it("never renders the server's error prose", () => {
    expect(codeOf("replayClient.ts")).not.toMatch(/problem\?\.error\?\.message/);
  });

  it("keeps the two replay operations distinct in the client", () => {
    expect(typeof replayApi.detail).toBe("function");
    expect(typeof replayApi.currentSource).toBe("function");
  });
});

/* -------------------------------------------------------------------------
 * W3b — Screen 08 on the retained WFO lane (rrun_c860…, real served bodies)
 * ---------------------------------------------------------------------- */

const W3B_EXEC = JSON.parse(readFileSync(join(process.cwd(), "src", "research", "w3bRealWfo.fixture.json"), "utf8")) as {
  replay: { run_id: string; replay: { source_observation_count: number } };
  progress: unknown;
  requested_spec: unknown;
};
const W3_EXEC = JSON.parse(readFileSync(join(process.cwd(), "src", "research", "w3RealWfo.fixture.json"), "utf8")) as {
  evidence: unknown;
};
const W3B_RUN = W3B_EXEC.replay.run_id;

/** What the hub answers a Delta WFO run: its replay route is NOT_PUBLISHED, with its own P04/P13 codes. */
function hubReplayFor(runId: string): Replay {
  return { ...replay({ route: "NOT_PUBLISHED" }), run_id: runId } as Replay;
}

function w3bExecuteFetch() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const path = new URL(String(input), "http://x").pathname;
    if (path.endsWith("/current-source/replay")) return jsonResponse(W3B_EXEC.replay);
    if (path.endsWith("/current-source/evidence")) return jsonResponse(W3_EXEC.evidence);
    if (path.endsWith("/execute/replay")) return jsonResponse(hubReplayFor(W3B_RUN));
    if (path.endsWith("/progress")) return jsonResponse(W3B_EXEC.progress);
    if (path.endsWith("/requested-spec")) return jsonResponse(W3B_EXEC.requested_spec);
    return jsonResponse({ error: { code: "UNEXPECTED" } }, 404);
  });
}

function mountExecute(runId = W3B_RUN) {
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

describe("W3b — Execute on the retained WFO lane", () => {
  async function settled() {
    forgetRunIdentities();
    const fetchMock = w3bExecuteFetch();
    const view = mountExecute();
    await waitFor(() => expect(view.container.querySelector("[data-counts]")).toBeTruthy());
    await waitFor(() => expect(view.container.textContent).not.toContain("reading…"));
    return { ...view, fetchMock };
  }

  it("reads the run identity: route signal_notional and readiness ready from the P11 progress read", async () => {
    const { container, fetchMock } = await settled();
    const route = container.querySelector("[data-route-id='signal_notional']");
    expect(route?.textContent).toBe("signal_notional");
    const readiness = container.querySelector("[data-route-state='RETAINED_MODEL_SAMPLE'] [data-readiness]");
    expect(readiness?.getAttribute("data-readiness")).toBe("READY");
    expect(readiness?.textContent).toBe("readiness ready");
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.includes(`/research/runs/${W3B_RUN}/progress`))).toBe(true);
    expect(urls.some((url) => url.includes(`/research/runs/${W3B_RUN}/requested-spec`))).toBe(true);
  });

  it("counts the 1056 retained source observations", async () => {
    const { container } = await settled();
    expect(W3B_EXEC.replay.replay.source_observation_count).toBe(1056);
    expect(container.querySelector("[data-counts]")?.textContent).toMatch(/^source observations 1,056 · window 1–24 of 1,056$/);
  });

  it("names orders, fills and candles absent with the retained lane's own QuantBT codes", async () => {
    const { container } = await settled();
    const code = (capability: string) =>
      container.querySelector(`[data-capability='${capability}'][data-capability-lane='retained'] [data-reason-code]`)?.getAttribute("data-reason-code");
    expect(code("orders")).toBe("QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_EXECUTION_ORDER_LEDGER");
    expect(code("fills")).toBe("QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_AUDITED_FILLS");
    expect(code("candle_windows")).toBe("QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_REPLAY_CANDLES");
  });

  it("formats ledger equity for reading and keeps the exact decimal in title / data-exact", async () => {
    const { container } = await settled();
    const row = container.querySelector("[data-sample-row='0']") as HTMLElement;
    const equity = row.querySelectorAll("td")[3]!.querySelector("[data-exact]");
    expect(equity?.textContent).toBe("20,000.00");
    expect(equity?.getAttribute("data-exact")).toBe("20000");
    expect(equity?.getAttribute("title")).toBe("20000");
  });

  it("prints no P04-hub reason code anywhere, though the hub answered with them", async () => {
    const { container } = await settled();
    expect(JSON.stringify(hubReplayFor(W3B_RUN))).toMatch(HUB_LANE_REASON);
    expect(container.textContent).not.toMatch(HUB_LANE_REASON);
    expect(container.innerHTML).not.toMatch(HUB_LANE_REASON);
  });
});

/* X2 · B6: the P04 hub lane on the published canonical fixtures (the real P04 receipt through the Control API). */
describe("S08 · P04 hub replay on the canonical fixtures (X2 · B6)", () => {
  const FIXTURES = join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures");
  const load = (name: string) => JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as Replay;

  it("draws the real retrospective-equity window row by row and names the absent order ledger", () => {
    const body = load("research-replay.p04-real.first-window.valid.json");
    renderScreen(controllerOf(body));
    expect(document.querySelector("[data-route-state]")?.getAttribute("data-route-state")).toBe(body.route.state);
    /* The ledger shows a bounded window of the served page; every row is a served ordinal. */
    const rows = [...document.querySelectorAll("[data-sample-row]")].map((row) => Number(row.getAttribute("data-sample-row")));
    const served = new Set(body.equity_replay.items.map((item) => item.playback_ordinal));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((ordinal) => served.has(ordinal))).toBe(true);
  });

  it("a far seek keeps its own ordinal; an unpublished answer draws no row", () => {
    const seek = load("research-replay.p04-real.far-seek.valid.json");
    renderScreen(controllerOf(seek));
    expect(document.querySelector("[data-sample-row]")?.getAttribute("data-sample-row")).toBe(String(seek.equity_replay.items[0]!.playback_ordinal));
    cleanup();
    renderScreen(controllerOf(load("research-replay.p04-not-published.valid.json")));
    expect(document.querySelectorAll("[data-sample-row]")).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------------
 * E2c · row 8.5 — the IS / OOS / HOLDOUT band on the P04 hub lane
 *
 * The three windows come from P14's split read for this run. The sealed
 * holdout is shaded in its own hatched tone, exactly as on Screens 05 and 07;
 * a window P14 did not publish is never given a width. The read itself
 * belongs to the route, so the screen is handed the answer.
 * --------------------------------------------------------------------- */
describe("E2c · 8.5 — the P04 band is P14's three-window truth", () => {
  const DAY = 86_400_000;
  const T0 = Date.UTC(2026, 0, 1);
  /* Window shapes and roles from the P14 split contract. */
  const WINDOWS = {
    warmup: { state: "AVAILABLE", start_utc_ms: T0, end_exclusive_utc_ms: T0 + DAY, bars: 6, data_role: "WARMUP_NOT_SCORED", child_input_state: "EXPOSED_TO_CHILD_TAPE", availability: AVAILABLE },
    is: { start_utc_ms: T0 + DAY, end_exclusive_utc_ms: T0 + 500 * DAY, bars: 2994, data_role: "IS_CALIBRATION_HISTORY", child_input_state: "EXPOSED_TO_CHILD_TAPE", availability: AVAILABLE },
    outer_oos: { start_utc_ms: T0 + 500 * DAY, end_exclusive_utc_ms: T0 + 700 * DAY, bars: 1200, data_role: "OUTER_OOS_OBSERVATION", child_input_state: "EXPOSED_TO_CHILD_TAPE", evaluation_state: "P04_OBSERVED_AFTER_FIXED_PROFILE", availability: AVAILABLE },
    holdout: { start_utc_ms: T0 + 700 * DAY, end_exclusive_utc_ms: T0 + 800 * DAY, bars: null, data_role: "HOLDOUT", child_input_state: "NOT_EXPOSED_TO_CHILD_TAPE", availability: AVAILABLE },
  };
  const ready = (windows: unknown = WINDOWS): SplitBandSlot =>
    ({ state: "ready", hub: { schema_version: "research.split-detail.v1", run_id: "run_p17", windows } as never, folds: null });

  it("shades IS, the plotted OOS and the sealed holdout in proportion to their published spans", () => {
    renderScreen(controllerOf(replay()), undefined, ready());
    const band = document.querySelector("[data-split-band='hub']") as HTMLElement;
    expect(band).toBeTruthy();
    expect(band.getAttribute("data-split-band-drawn")).toBe("3");
    const width = (key: string) => (band.querySelector(`[data-band='${key}']`) as HTMLElement).parentElement!.style.flexGrow;
    expect(width("is")).toBe(String(499 * DAY));
    expect(width("outer_oos")).toBe(String(200 * DAY));
    expect(width("holdout")).toBe(String(100 * DAY));
    /* These three windows are contiguous, so nothing is drawn between them. */
    expect(band.querySelector("[data-band-gap]")).toBeNull();
    /* The whole band is one sentence for a reader who cannot see it. */
    expect(band.getAttribute("aria-label")).toContain("OOS (plotted)");
  });

  it("the sealed holdout keeps its own hatched tone — never the colour of a window something read", () => {
    renderScreen(controllerOf(replay()), undefined, ready());
    const holdout = document.querySelector("[data-band='holdout']") as HTMLElement;
    const oos = document.querySelector("[data-band='outer_oos']") as HTMLElement;
    expect(holdout.style.background).toContain("repeating-linear-gradient");
    expect(holdout.style.border).toContain("dashed");
    expect(oos.style.background).toBe("var(--role-oos)");
    expect(holdout.style.background).not.toBe(oos.style.background);
  });

  it("a window P14 did not publish keeps its label and its reason, and gets no width", () => {
    const absent = { state: "NOT_PUBLISHED", reason_code: "P14_SOURCE_SPLIT_RECEIPT_NOT_PUBLISHED", availability: { state: "NOT_PUBLISHED", reason_code: "P14_SOURCE_SPLIT_RECEIPT_NOT_PUBLISHED" } };
    renderScreen(controllerOf(replay()), undefined, ready({ ...WINDOWS, holdout: absent }));
    const holdout = document.querySelector("[data-band='holdout']") as HTMLElement;
    expect(holdout.getAttribute("data-band-state")).toBe("NOT_PUBLISHED");
    expect(holdout.textContent).toContain("HOLDOUT");
    expect(holdout.textContent).toContain("not published");
    expect(holdout.textContent).not.toContain("0");
    expect(holdout.querySelector("[data-band-reason]")!.getAttribute("data-band-reason")).toBe("P14_SOURCE_SPLIT_RECEIPT_NOT_PUBLISHED");
    expect(document.querySelector("[data-split-band='hub']")!.getAttribute("data-split-band-drawn")).toBe("2");
  });

  it("a split read that failed says so on one line; the replay keeps its own answer", () => {
    renderScreen(controllerOf(replay()), undefined, { state: "absent", reason: "This run's split could not be read, so the windows are not drawn." });
    expect(document.querySelector("[data-split-band]")).toBeNull();
    expect(document.querySelector("[data-split-band-absent]")!.textContent).toContain("could not be read");
    /* A band that cannot be drawn never takes the chart down with it. */
    expect(document.querySelectorAll("[data-sample-row]").length).toBeGreaterThan(0);
  });

  it("the route reads the split once on arrival and the band is drawn from it", async () => {
    const detail = { schema_version: "research.split-detail.v1", run_id: "run_p17", windows: WINDOWS };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = new URL(String(input), "http://x").pathname;
      const body = path.endsWith("/split") ? detail : replay();
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    });
    forgetRunIdentities();
    window.history.replaceState(null, "", "/research/quantbt/runs/run_p17/execute");
    render(
      <MemoryRouter initialEntries={["/research/quantbt/runs/run_p17/execute"]}>
        <Routes>
          <Route path="/research/quantbt/runs/:runId/execute" element={<ExecuteRoute />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(document.querySelector("[data-split-band='hub']")).toBeTruthy());
    const splitReads = fetchMock.mock.calls
      .map(([url]) => new URL(String(url), "http://x").pathname)
      .filter((path) => path.endsWith("/split"));
    expect(splitReads).toEqual(["/api/v1/quantbt/runs/run_p17/split"]);
    expect(document.querySelector("[data-split-band='hub']")!.getAttribute("data-split-band-drawn")).toBe("3");
  });
});

describe("F1 · FG 08-05 — the P04 'state at cursor' prints formatted numbers with the exact string in title", () => {
  it("equity as currency, drawdown as a percentage, no raw float on the line", () => {
    const body = replay({ start: 40, selected: 45 });
    body.equity_replay.state_at_cursor = {
      ...body.equity_replay.state_at_cursor,
      equity: "19931.280844135865",
      drawdown_fraction: "0.012345678901234",
    } as typeof body.equity_replay.state_at_cursor;
    renderScreen(controllerOf(body));
    const at = document.querySelector("[data-state-at-cursor]") as HTMLElement;
    expect(at.textContent).toContain("equity 19,931.28");
    expect(at.textContent).toContain("drawdown +1.23%");
    expect(at.textContent).not.toMatch(/\d\.\d{7,}/);
    const exact = [...at.querySelectorAll("[data-exact]")].map((node) => node.getAttribute("title"));
    expect(exact).toEqual(["19931.280844135865", "0.012345678901234"]);
  });

  it("a cursor with no equity prints no equity and no zero", () => {
    const body = replay({ start: 40, selected: null });
    renderScreen(controllerOf(body));
    const at = document.querySelector("[data-state-at-cursor]") as HTMLElement;
    expect(at.textContent).not.toMatch(/· equity |· drawdown /);
  });
});

describe("F2b · S08 draws ONE overview: candle_overview, with market_overview only as the rolling-deploy fallback", () => {
  const legacyOf = (bars: number) => {
    const { state: _s, reason_code: _r, scope: _c, availability: _a, ...data } = candleOverview(bars);
    return {
      state: "AVAILABLE",
      reason_code: null,
      semantics: "BOUNDED_SOURCE_OVERVIEW_NOT_PER_BAR_REPLAY",
      data,
      availability: AVAILABLE,
    };
  };

  it("a responder without candle_overview but with an AVAILABLE market_overview draws it once, with the source-overview chip", () => {
    const body = { ...replay({ overviewReason: null }), market_overview: legacyOf(240) } as unknown as Replay;
    renderScreen(controllerOf(body));
    const blocks = document.querySelectorAll("[data-candle-overview]");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.getAttribute("data-overview-source")).toBe("market_overview");
    expect(blocks[0]!.querySelector("[data-overview-chip='source']")!.textContent).toBe("source overview");
    expect(blocks[0]!.querySelector("[data-overview-chip='source']")!.getAttribute("title")).toContain("legacy market overview");
    expect(blocks[0]!.querySelectorAll("svg line")).toHaveLength(4);
  });

  it("when candle_overview is served, market_overview is never drawn — not as a second chart, not as a chip", () => {
    const body = { ...replay(), market_overview: legacyOf(240) } as unknown as Replay;
    renderScreen(controllerOf(body));
    expect(document.querySelectorAll("[data-candle-overview]")).toHaveLength(1);
    expect(document.querySelector("[data-overview-source]")).toBeNull();
    expect(document.querySelector("[data-overview-chip]")).toBeNull();
    expect(document.querySelectorAll("[data-overview]")).toHaveLength(1);
  });

  it("a NOT_PUBLISHED market_overview is no fallback: the absence keeps its own reason code", () => {
    const absent = { state: "NOT_PUBLISHED", reason_code: "P13_SOURCE_PREDATES_RETAINED_CANDLE_OVERVIEW", semantics: "BOUNDED_SOURCE_OVERVIEW_NOT_PER_BAR_REPLAY", data: null, availability: AVAILABLE };
    const body = { ...replay({ overviewReason: null }), market_overview: absent } as unknown as Replay;
    renderScreen(controllerOf(body));
    const block = document.querySelector("[data-candle-overview]")!;
    expect(block.getAttribute("data-candle-overview")).toBe("NOT_PUBLISHED");
    expect(document.querySelector("[data-overview-chip]")).toBeNull();
  });

  it("the earlier / later buttons are not named 'window', so they cannot be mistaken for the IS / OOS / HOLDOUT switch", () => {
    renderScreen(controllerOf(replay()));
    expect(document.querySelector("[data-action='previous-window']")!.textContent).toBe("‹ earlier");
    expect(document.querySelector("[data-action='next-window']")!.textContent).toBe("later ›");
  });
});

/* ---------------------------------------------------------------------------
 * QA 2026-10-02 · S08 — the hub-lane fixes
 * ------------------------------------------------------------------------ */

describe("QA S08 UX-03 · a failed retained read is not 'the source did not publish a replay'", () => {
  const unpublished = () => replay({ route: "NOT_PUBLISHED" });
  const refused = (status: number | null) => ({
    state: "refused" as const,
    refusal: toReplayRefusal(status === null ? new Error("offline") : new PortalApiError(`${status}`, status, null, null), "retained"),
  });
  const panel = () => document.querySelector("[data-research-panel='stitched account — retained walk-forward lane']");

  it.each([403, 404])("a %i is a denied state in the screen's own words; the hub's 'did not publish' sentence is not drawn", (status) => {
    renderScreen(controllerOf(unpublished(), { retained: refused(status) }));
    expect(panel()?.getAttribute("data-state")).toBe("denied");
    expect(panel()?.textContent).toContain(REPLAY_REFUSAL_COPY[403]);
    expect(document.body.textContent).not.toMatch(/did not publish a replay|not published|readiness/i);
    expect(document.querySelector("[data-action='retry-retained']")).toBeNull();
  });

  it.each([500, 503, null])("a %s is unavailable with one Retry that re-sends the same read", (status) => {
    const retryRetained = vi.fn();
    renderScreen(controllerOf(unpublished(), { retained: refused(status), retryRetained }));
    expect(panel()?.getAttribute("data-state")).toBe(status === null ? "failed-retryable" : "unavailable");
    expect(document.body.textContent).not.toMatch(/did not publish a replay/i);
    fireEvent.click(document.querySelector("[data-action='retry-retained']")!);
    expect(retryRetained).toHaveBeenCalledTimes(1);
  });

  it("a 409 is the lane's typed 'no sealed source yet': the existing hub answer stays, not an error panel", () => {
    renderScreen(controllerOf(unpublished(), { retained: refused(409) }));
    expect(panel()).toBeNull();
    expect(document.querySelector("[data-route-state='NOT_PUBLISHED']")).toBeTruthy();
  });

  it("a retained lane that answered is untouched (value path)", () => {
    renderScreen(controllerOf(replay()));
    expect(panel()).toBeNull();
    expect(document.querySelector("[data-route-state='RETROSPECTIVE_EQUITY_ONLY']")).toBeTruthy();
  });
});

describe("QA S08 · filler sentences are gone from the hub lane", () => {
  it("T-15: the partial-state banner is two words, not a restatement of the chips below it", () => {
    expect(replayState(replay()).reason).toBe("Equity samples only.");
  });

  it("T-16 / T-23: no 'around the playhead' filler, no route-aware note, and the missing-input panels say what is missing", () => {
    renderScreen(controllerOf(replay()));
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("around the playhead");
    expect(text).not.toContain("SL/TP, OCO and multi-leg: not published.");
    expect(text).not.toContain("Needs trades and their price paths");
    /* W4: the empty MAE x MFE / PnL / route cards are gone (the PnL card is dropped on every lane); the block names each capability. */
    expect(document.querySelector("[data-absent-panel='pnl-distribution']")).toBeNull();
    expect(document.querySelector("[data-not-published-block] [data-capability='trades']")!.getAttribute("title")).toBeTruthy();
  });

  it("T-18: the receipt-budget overview absence reads as one short sentence; the served code stays", () => {
    renderScreen(controllerOf(replay({ overviewReason: "P13_CANDLE_OVERVIEW_EXCEEDS_RECEIPT_BYTE_BUDGET" })));
    const block = document.querySelector("[data-candle-overview]")!;
    expect(block.querySelector("[data-overview-note]")!.textContent).toBe("No price overview stored for this run.");
    expect(block.querySelector("[data-reason-code]")!.textContent).toBe("P13_CANDLE_OVERVIEW_EXCEEDS_RECEIPT_BYTE_BUDGET");
  });

  it("T-19: the retained-lane 409 is one short sentence", () => {
    expect(toReplayRefusal(new PortalApiError("409", 409, null, null), "retained").message).toBe("No retained source for this run yet.");
  });
});
