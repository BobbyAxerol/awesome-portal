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

import { EXECUTE_RULES_FOOTER, EXECUTE_SUBTITLE, EXECUTE_TITLE, ExecuteScreen, PLAYHEAD_NOTE } from "./ExecuteDetail";
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
import { JUMP, ReplayTransport, transportKey, type TransportScheduler } from "./replayTransport";
import { useReplay, type ReplayController } from "./useReplay";
import { PortalApiError } from "../lib/api";
import { ExecuteRoute } from "./ExecuteRoute";
import { HUB_LANE_REASON, forgetRunIdentities } from "./retainedLane";

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

function replay(
  options: {
    count?: number;
    start?: number;
    sampling?: "FULL" | "EXTREMA_BUCKET_V1";
    selected?: number | null;
    route?: Replay["route"]["state"];
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

function renderScreen(controller: ReplayController, transport = new ReplayTransport(manualScheduler().scheduler)) {
  render(
    <MemoryRouter>
      <ExecuteScreen runId="run_p17" cursor={{ ...DEFAULT_CURSOR, stage: "execute" }} controller={controller} transport={transport} />
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
    expect(document.querySelector("[data-sampling-note]")!.textContent).toMatch(/not every observation.*Nothing is interpolated/);
    expect(document.querySelector("[data-counts]")!.textContent).toContain("source observations 5000 · emitted samples 240");
  });
});

describe("S08-U04 — every hi-fi panel keeps its place with a published reason", () => {
  it("names all thirteen route capabilities with their reason codes", () => {
    renderScreen(controllerOf(replay()));
    for (const key of ROUTE_CAPABILITY_KEYS) {
      const facts = document.querySelectorAll(`[data-capability="${key}"]`);
      expect(facts.length, key).toBeGreaterThan(0);
      expect(facts[0]!.textContent).toContain(REASON[key]);
    }
    expect(document.querySelector('[data-source-absence="cross_stream_order"]')!.textContent).toContain("not asserted");
  });

  it("keeps the anatomy, blotter, MAE×MFE, PnL distribution, cost and route panels — each without rows", () => {
    renderScreen(controllerOf(replay()));
    const ids = ["trade-anatomy", "trade-blotter", "mae-mfe", "pnl-distribution", "cost-timeline", "route-panel"];
    expect([...document.querySelectorAll("[data-absent-panel]")].map((el) => el.getAttribute("data-absent-panel"))).toEqual(ids);
    expect(document.querySelector('[data-absent-panel="pnl-distribution"] canvas, [data-absent-panel="pnl-distribution"] svg rect')).toBeNull();
    for (const id of ids) {
      const panel = document.querySelector(`[data-absent-panel="${id}"]`);
      expect(panel, id).toBeTruthy();
      expect(panel!.querySelector("table,tr")).toBeNull();
    }
  });

  it("draws samples in the ledger and calls them samples, not events", () => {
    renderScreen(controllerOf(replay()));
    const ledger = document.querySelector('[data-panel="event-ledger"]')!;
    expect(ledger.textContent).toContain("samples, not events");
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
    expect(document.querySelectorAll("[data-absent-panel]").length).toBe(6);
    expect(document.querySelector('[data-capability="orders"]')!.getAttribute("data-capability-state")).toBe("NOT_PUBLISHED");
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

  it("renders title, subtitle and footer under a refusal, and no panel content", () => {
    const refusal = toReplayRefusal(new PortalApiError("x", 403, "RESEARCH_REPLAY_FORBIDDEN", null));
    renderScreen(
      controllerOf(null, {
        refusal,
        state: { state: refusal.state, reason: refusal.message, mayRetry: false, retainsContent: false },
      }),
    );
    expect(screen.getByText(EXECUTE_TITLE)).toBeTruthy();
    expect(screen.getByText(EXECUTE_SUBTITLE)).toBeTruthy();
    expect(screen.getByText(EXECUTE_RULES_FOOTER)).toBeTruthy();
    expect(screen.getByText(REPLAY_REFUSAL_COPY[403])).toBeTruthy();
    expect(document.querySelector("[data-absent-panel]")).toBeNull();
  });
});

describe("S08-U07 — reads: one on arrival, one bounded recovery, and nothing else", () => {
  it("sends one plain GET on arrival, with no If-None-Match and no navigation input", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(replay()));
    const { result } = renderHook(() => useReplay("run_p17", null));
    await waitFor(() => expect(result.current.replay).not.toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("/api/v1/quantbt/runs/run_p17/execute/replay?limit=100");
    expect((init as RequestInit).method ?? "GET").toBe("GET");
    expect(JSON.stringify((init as RequestInit).headers ?? {})).not.toMatch(/If-None-Match/i);
  });

  it("restores an explicit deep link with one at_ordinal read", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(replay({ start: 40, selected: 45 })));
    const { result } = renderHook(() => useReplay("run_p17", 45));
    await waitFor(() => expect(result.current.replay).not.toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("at_ordinal=45");
  });

  it("sends exactly one navigation token per window request", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(replay()))
      .mockResolvedValueOnce(jsonResponse(replay({ start: 24 })));
    const { result } = renderHook(() => useReplay("run_p17", null));
    await waitFor(() => expect(result.current.replay).not.toBeNull());
    act(() => result.current.nextWindow());
    await waitFor(() => expect(result.current.replay!.equity_replay.items[0]!.playback_ordinal).toBe(24));
    const url = new URL(String(fetchMock.mock.calls[1]![0]), "http://x");
    expect(url.searchParams.get("cursor")).toBe(token(900));
    expect(["before", "at", "at_ordinal"].filter((k) => url.searchParams.has(k))).toEqual([]);
  });

  it("on 409 CURSOR_EXPIRED drops the token and recovers once by public ordinal", async () => {
    const expired = jsonResponse({ error: { code: "RESEARCH_REPLAY_CURSOR_EXPIRED", message: "x" } }, 409);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(replay()))
      .mockResolvedValueOnce(expired)
      .mockResolvedValueOnce(jsonResponse(replay({ start: 0, selected: 7 })));
    const { result } = renderHook(() => useReplay("run_p17", null));
    await waitFor(() => expect(result.current.replay).not.toBeNull());
    act(() => result.current.pin(token(7), 7));
    await waitFor(() => expect(result.current.recovered).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const recovery = String(fetchMock.mock.calls[2]![0]);
    expect(recovery).toContain("at_ordinal=7");
    expect(recovery).not.toContain(token(7));
  });

  it("does not loop: a second 409 is a refusal, not a third request", async () => {
    const expired = () => jsonResponse({ error: { code: "RESEARCH_REPLAY_CURSOR_EXPIRED", message: "x" } }, 409);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(replay()))
      .mockResolvedValueOnce(expired())
      .mockResolvedValueOnce(expired());
    const { result } = renderHook(() => useReplay("run_p17", null));
    await waitFor(() => expect(result.current.replay).not.toBeNull());
    act(() => result.current.nextWindow());
    await waitFor(() => expect(result.current.refusal?.status).toBe(409));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    /* The window already on screen stays; the refusal is stated over it. */
    expect(result.current.replay).not.toBeNull();
    expect(result.current.state.retainsContent).toBe(true);
  });

  it("reads the retained model replay only when asked", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(replay()))
      .mockResolvedValueOnce(jsonResponse({ error: { code: "RESEARCH_CURRENT_SOURCE_CONFLICT", message: "x" } }, 409));
    const { result } = renderHook(() => useReplay("run_p17", null));
    await waitFor(() => expect(result.current.replay).not.toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    act(() => result.current.ensureRetained());
    act(() => result.current.ensureRetained());
    await waitFor(() => expect(result.current.retained.state).toBe("refused"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    /* A retained 409 means "not retained yet", not an expired cursor or a changed revision. */
    const slot = result.current.retained as {
      state: "refused";
      refusal: { message: string; cursorExpired: boolean; state: string };
    };
    expect(slot.refusal.message).toBe(RETAINED_NOT_RETAINED);
    expect(slot.refusal.state).toBe("unavailable");
    expect(slot.refusal.cursorExpired).toBe(false);
    expect(String(fetchMock.mock.calls[1]![0])).toBe("/api/v1/quantbt/runs/run_p17/current-source/replay");
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
    expect(container.querySelector("[data-counts]")?.textContent).toMatch(/^source observations 1056 · window 1–24 of 1056$/);
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
