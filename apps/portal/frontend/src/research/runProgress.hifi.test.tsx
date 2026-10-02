/**
 * Screen 03 · HiFi fidelity and RF-06 behaviour (FE-S03-03…19).
 *
 * Each test pins one diff row from the S03 fidelity report: it fails on the
 * pre-RF-06 screen and passes on this one. Look-only rows (sizes, colours) are
 * asserted through the inline styles and motion attributes the screen sets,
 * never through a snapshot image.
 */
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CANCEL_BODY, FOLLOW_SLACK_PX, RunProgress, SSE_LIVE, SSE_POLL, SSE_RESTING, consoleStamp } from "./RunProgress";
import type { ProgressEvent, ProgressRead, ProgressSnapshot } from "./progressClient";
import { POLL_FLOOR_MS } from "./progressClient";
import { foldFromHash, mergeRead, patchSnapshot, useRunProgress } from "./useRunProgress";
import { researchState } from "./state";

afterEach(cleanup);

/* ---------------------------------------------------------------- fixtures */

function snapshot(overrides: Partial<ProgressSnapshot> = {}): ProgressSnapshot {
  return {
    schema_version: "research.progress-snapshot.v1",
    run_id: "run_01",
    status: "RUNNING",
    created_at_utc_ms: 1789836572000,
    updated_at_utc_ms: 1789836582000,
    latest_sequence: 40,
    retention_floor_sequence: 1,
    stages: [
      { key: "S1", state: "DONE", started_at_utc_ms: 1, completed_at_utc_ms: 2 },
      { key: "S2", state: "RUNNING", started_at_utc_ms: 2, completed_at_utc_ms: null },
      { key: "S3", state: "PENDING", started_at_utc_ms: null, completed_at_utc_ms: null },
      { key: "S4", state: "PENDING", started_at_utc_ms: null, completed_at_utc_ms: null },
      { key: "S5", state: "PENDING", started_at_utc_ms: null, completed_at_utc_ms: null },
    ],
    overall: {
      pct: 42,
      elapsed_s: 610,
      eta_s: 880,
      trials_done: 1603,
      trials_declared: 3000,
      tqdm_line: "fold 3/5 · trial 403/600",
    },
    budget: { used: "12.500", cap: "60.000", unit: "core-min", pct: 20 },
    folds: [
      { fold: 1, state: "DONE", started_at_utc_ms: 1000, completed_at_utc_ms: 2000 },
      { fold: 2, state: "RUNNING", started_at_utc_ms: 2000, completed_at_utc_ms: null },
    ],
    artifacts: [
      {
        name: "trials.parquet",
        state: "SEALED",
        size: "6279",
        digest: "2abc4bf2a2283253e174186f435cc1acd138b72f1bb2fe441d1eef23765de3fe",
        reader_href: null,
      },
      { name: "selection_trace.json", state: "WRITING", size: null, digest: null, reader_href: null },
      { name: "claim.json", state: "PENDING", size: null, digest: null, reader_href: null },
    ],
    claim: { state: "FORECAST", text: "forecast sentence from the server", cursor: null },
    readiness: { mandatory: "PENDING", optional: "NOT_APPLICABLE" },
    failure: null,
    source: { kind: "DURABLE_P10", coverage: "ACTUAL_HOOKS", partial: false },
    ...overrides,
  };
}

function read(overrides: Partial<ProgressRead> = {}, snap: Partial<ProgressSnapshot> = {}): ProgressRead {
  return {
    schema_version: "research.progress-read.v1",
    run_id: "run_01",
    availability: "AVAILABLE",
    current: {
      job_state: "running",
      effective_status: "RUNNING",
      terminal_resolution: "PENDING",
      source_latest_sequence: 40,
      retention_floor_sequence: 1,
      last_received_at_utc_ms: 1789836582000,
      may_cancel: true,
      may_retry: false,
      retry_reason: "FAIL_CLOSED_NEW_RUN_FROM_REQUESTED_SPEC",
      new_run_from: { state: "AVAILABLE", reason_code: null },
    },
    run: identity(),
    denied_artifacts: [],
    progress: snapshot(snap),
    ...overrides,
  };
}

/** CG-P11-03: the progress read's own run identity. */
function identity(): NonNullable<ProgressRead["run"]> {
  return {
    display_label: "R-WFO-118",
    alpha: {
      alpha_id: "delta-rsi-polynomial-alpha",
      alpha_name: "Delta-RSI Polynomial Alpha",
      alpha_version_id: "av_delta_rsi_polynomial_alpha_1_0_0",
    },
    execution_profile_id: "p04.fixed-qualification.v1",
    protocol: "three_window_decay",
    mode: "mode_1_decay",
    schedule: "global",
    instrument: { symbol: "BTCUSDT", timeframe: "1h" },
    execution_route: "signal_notional",
    engine_release_id: "er_quantbt_111",
    config_digest: "909514e09820e9fc8c2a37946c66053aaf7a9106875c73ed97165f7d1d02f452",
    requested_spec_digest: "e".repeat(64),
    created_at_utc_ms: 1789836572000,
    declared_folds: { state: "DECLARED", count: 5, reason_code: null },
    planned_folds: { state: "NOT_PUBLISHED", folds: [], reason_code: null },
  };
}

function completed(snap: Partial<ProgressSnapshot> = {}): ProgressRead {
  return read(
    { current: { ...read().current, effective_status: "COMPLETED", terminal_resolution: "SOURCE", may_cancel: false } },
    {
      status: "COMPLETED",
      stages: snapshot().stages.map((s) => ({ ...s, state: "DONE" as const })),
      folds: [{ fold: 1, state: "DONE", started_at_utc_ms: 1000, completed_at_utc_ms: 2000 }],
      artifacts: snapshot().artifacts.map((a) => ({ ...a, state: "SEALED" as const })),
      readiness: { mandatory: "SEALED", optional: "NOT_APPLICABLE" },
      claim: { state: "NOT_ISSUED", text: "The fixed P10 qualification did not issue a release claim.", cursor: null },
      ...snap,
    },
  );
}

const OK = researchState({ kind: "ok", rowCount: 1 });

function view(overrides: Partial<React.ComponentProps<typeof RunProgress>> = {}) {
  const r = overrides.read === undefined ? read() : overrides.read;
  return render(
    <RunProgress
      runId="run_01"
      read={r}
      snapshot={r?.progress ?? null}
      state={OK}
      transport="stream"
      lines={[]}
      linesDropped={false}
      onLoadOlder={vi.fn()}
      foldCursor={null}
      onPinFold={vi.fn()}
      cancelling={false}
      onCancel={vi.fn()}
      {...overrides}
    />,
  );
}

function event(sequence: number, event_type: string, payload: Record<string, unknown>): ProgressEvent {
  return {
    schema_version: "research.progress-event.v1",
    run_id: "run_01",
    sequence,
    event_type,
    occurred_at_utc_ms: 1789836600000,
    payload,
  } as unknown as ProgressEvent;
}

const $ = (selector: string) => document.querySelector(selector) as HTMLElement;

/* ---------------------------------------------------------- stream double */

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((e: MessageEvent<string>) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  closed = false;
  private listeners = new Map<string, ((e: MessageEvent<string>) => void)[]>();
  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(name: string, listener: (e: MessageEvent<string>) => void) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
  }
  close() {
    this.closed = true;
  }
  emit(payload: unknown, name = "research.progress") {
    const message = { data: JSON.stringify(payload) } as MessageEvent<string>;
    for (const listener of this.listeners.get(name) ?? []) listener(message);
  }
  static last() {
    return FakeEventSource.instances[FakeEventSource.instances.length - 1];
  }
}

let fetched: string[] = [];
function stubFetch(responder: (url: string) => [number, unknown]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      fetched.push(url);
      const [status, payload] = responder(url);
      return {
        ok: status < 400,
        status,
        statusText: "",
        headers: { get: () => null },
        json: async () => payload,
      } as unknown as Response;
    }),
  );
}

beforeEach(() => {
  fetched = [];
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource as unknown as typeof EventSource);
  window.history.replaceState(null, "", "/research/quantbt/runs/run_01/progress");
});
afterEach(() => vi.unstubAllGlobals());

/* -------------------------------------------------------------------------
 * DQ-13 / FE-S03-13 — live events patch the screen
 * ---------------------------------------------------------------------- */

describe("FE-S03-13 — an event without a snapshot patches only what it publishes", () => {
  it("moves stages, folds, artifacts, budget and the seal", () => {
    let s = snapshot();
    s = patchSnapshot(s, event(41, "stage_completed", { stage: "S2" }));
    s = patchSnapshot(s, event(42, "stage_started", { stage: "S3" }));
    s = patchSnapshot(s, event(43, "fold_completed", { fold: 2 }));
    s = patchSnapshot(s, event(44, "artifact_writing", { name: "fold_results/" }));
    s = patchSnapshot(s, event(45, "artifact_sealed", { name: "selection_trace.json", size: "402", digest: "aa", reader_href: null }));
    s = patchSnapshot(s, event(46, "budget_tick", { used: "13.000", cap: "60.000", pct: 21 }));
    s = patchSnapshot(s, event(47, "seal_started", {}));
    expect(s.stages.map((x) => x.state)).toEqual(["DONE", "DONE", "RUNNING", "PENDING", "PENDING"]);
    expect(s.folds.find((f) => f.fold === 2)?.state).toBe("DONE");
    expect(s.artifacts.find((a) => a.name === "fold_results/")?.state).toBe("WRITING");
    expect(s.artifacts.find((a) => a.name === "selection_trace.json")).toMatchObject({ state: "SEALED", size: "402" });
    expect(s.budget).toMatchObject({ used: "13.000", pct: 21 });
    expect(s.readiness.mandatory).toBe("SEALING");
    expect(s.latest_sequence).toBe(47);
  });

  it("takes pct and tqdm from a trial, never lets pct go back, adds an unseen fold", () => {
    let s = patchSnapshot(snapshot(), event(41, "trial_completed", { fold: 3, trial: 7, overall_pct: 55, tqdm_line: "trial 7" }));
    expect(s.overall.pct).toBe(55);
    expect(s.overall.tqdm_line).toBe("trial 7");
    expect(s.folds.map((f) => f.fold)).toEqual([1, 2, 3]);
    s = patchSnapshot(s, event(42, "trial_completed", { fold: 3, trial: 8, overall_pct: 50 }));
    expect(s.overall.pct).toBe(55);
    // Nothing the event did not publish is changed.
    expect(s.overall.trials_done).toBe(1603);
  });

  it("applies a snapshot-less stream event to the screen", async () => {
    stubFetch((url) => (url.includes("/evidence") ? [404, {}] : url.includes("/console?") ? [200, { lines: [] }] : [200, read()]));
    const { result } = renderHook(() => useRunProgress("run_01"));
    await waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0));
    await act(async () => {
      FakeEventSource.last().emit({ event: event(41, "trial_completed", { fold: 2, trial: 9, overall_pct: 61 }), snapshot: null });
    });
    expect(result.current.snapshot?.overall.pct).toBe(61);
    expect(result.current.foldTrials[2]).toBe(9);
  });
});

describe("FE-S03-14 — the floor keeps refreshing current state under a live stream", () => {
  it("re-reads current every 5 s while streaming, so may_cancel does not freeze", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      let next = read();
      stubFetch((url) => (url.includes("/evidence") ? [404, {}] : url.includes("/console?") ? [200, { lines: [] }] : [200, next]));
      const { result } = renderHook(() => useRunProgress("run_01"));
      await waitFor(() => expect(result.current.transport).toBe("stream"));
      expect(result.current.read?.current.may_cancel).toBe(true);
      next = read({ current: { ...read().current, may_cancel: false, effective_status: "FINISHING" } });
      await act(async () => {
        vi.advanceTimersByTime(POLL_FLOOR_MS);
      });
      await waitFor(() => expect(result.current.read?.current.may_cancel).toBe(false));
      expect(result.current.read?.current.effective_status).toBe("FINISHING");
      // The stream stays open: the floor runs underneath it, not instead of it.
      expect(result.current.transport).toBe("stream");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a newer applied snapshot when an older read arrives, and clamps pct", () => {
    const newer = read({}, { latest_sequence: 60, overall: { ...snapshot().overall, pct: 70 } });
    const older = read({ current: { ...read().current, may_cancel: false } }, { latest_sequence: 50 });
    const merged = mergeRead(newer, older);
    expect(merged.current.may_cancel).toBe(false);
    expect(merged.progress?.latest_sequence).toBe(60);
    const lower = mergeRead(newer, read({}, { latest_sequence: 61, overall: { ...snapshot().overall, pct: 65 } }));
    expect(lower.progress?.overall.pct).toBe(70);
  });
});

/* -------------------------------------------------------------------------
 * FE-S03-03 — meta strip from the P13 Hub
 * ---------------------------------------------------------------------- */

describe("FE-S03-03 / CG-P11-03 — the run meta strip reads the progress read's identity", () => {
  it("prints protocol, mode, schedule, alpha, symbol, timeframe, route, engine release and config digest", () => {
    view();
    const strip = $("[data-run-meta]");
    expect(strip.getAttribute("data-run-meta")).toBe("ready");
    expect($('[data-meta="mode"]').textContent).toBe("three_window_decay · mode_1_decay · global");
    expect($('[data-meta="binding"]').textContent).toBe("delta-rsi-polynomial-alpha · BTCUSDT · 1h");
    expect($('[data-meta="route"]').textContent).toBe("route signal_notional");
    expect($('[data-meta="engine"]').textContent).toContain("engine er_quantbt_111");
    expect($('[data-meta="engine"]').textContent).toContain("sha256:909514…");
    expect(within(strip).getByText("RUNNING").getAttribute("data-status-pill")).toBe("RUNNING");
  });

  it("renders a null fact as not published, never as a guess", () => {
    view({ read: read({ run: { ...identity(), instrument: { symbol: null, timeframe: "1h" }, config_digest: null } }) });
    expect($('[data-meta="binding"] [data-not-published]').textContent).toBe("not published");
    expect($('[data-meta="engine"] [data-not-published]')).toBeTruthy();
  });

  it("keeps the strip and says so when an older server sends no identity", () => {
    view({ read: read({ run: null }) });
    expect($("[data-run-meta]").getAttribute("data-run-meta")).toBe("not-published");
    expect($("[data-meta-refused]").textContent).toContain("not published");
  });

  it("reads identity from the progress read alone — no evidence request", async () => {
    stubFetch((url) => (url.includes("/console?") ? [200, { lines: [] }] : [200, completed()]));
    const { result } = renderHook(() => useRunProgress("run_01"));
    await waitFor(() => expect(result.current.read?.run?.alpha.alpha_id).toBe("delta-rsi-polynomial-alpha"));
    expect(fetched.filter((u) => u.includes("/evidence"))).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------
 * FE-S03-16 / -15 / -05 — passport first, neutral no-claim, hand-off
 * ---------------------------------------------------------------------- */

describe("FE-S03-16 — the HiFi order: passport, progress, Gantt beside artifacts, console", () => {
  it("puts the claim passport before the progress card and the console last", () => {
    view();
    const order = Array.from(document.querySelectorAll("[data-research-panel]")).map((n) => n.getAttribute("data-research-panel"));
    expect(order).toEqual(["run meta", "claim", "progress", "folds", "artifacts", "trial console"]);
  });

  it("draws the passport as key/value fields with a dashed forecast value", () => {
    view();
    expect($("[data-claim-badge]").textContent).toBe("claim passport — forecast");
    const text = $("[data-claim-text]");
    expect(text.style.border).toContain("dashed");
    expect(text.style.fontStyle).toBe("italic");
    expect($('[data-passport-field="certification"]').textContent).toContain("not published");
  });
});

describe("FE-S03-15 — a completed run with no claim is neutral, a failed one is red", () => {
  it("uses the neutral border on COMPLETED + NOT_ISSUED", () => {
    view({ read: completed(), transport: "closed" });
    const passport = $("[data-claim]");
    expect(passport.style.border).toBe("1px solid var(--viz-legend-inactive)");
    expect(passport.style.border).not.toContain("--bad");
  });

  it("keeps red for a failed run", () => {
    view({
      read: read(
        { current: { ...read().current, effective_status: "FAILED", may_cancel: false } },
        { status: "FAILED", claim: { state: "NOT_ISSUED", text: "", cursor: null }, failure: { code: "E", message: "m" } },
      ),
    });
    expect($("[data-claim]").style.border).toContain("var(--bad)");
  });
});

describe("FE-S03-05 — hand-off with the cursor", () => {
  it("puts a filled OPEN EVIDENCE FLOW button in the passport head, carrying fold, trial and params", () => {
    view({
      read: completed({ claim: { state: "ISSUED", text: "issued", cursor: "fold=1&trial=143&params=prm_7c1a9e" } }),
      foldCursor: 1,
      transport: "closed",
    });
    const button = $("[data-open-evidence]");
    expect(button.closest("[data-claim]")).toBeTruthy();
    expect(button.style.background).toBe("var(--accent)");
    expect(button.getAttribute("href")).toBe(
      "/research/quantbt/runs/run_01/evidence#stage=summary&fold=1&trial=143&params=prm_7c1a9e",
    );
  });

  it("shows the done banner with S1–S5 links only when sealed", () => {
    view();
    expect(document.querySelector("[data-done-banner]")).toBeNull();
    cleanup();
    view({ read: completed(), foldCursor: 1, transport: "closed" });
    const links = Array.from(document.querySelectorAll("[data-done-link]")).map((a) => a.getAttribute("href"));
    expect(links).toEqual([
      "/research/quantbt/runs/run_01/split#fold=1",
      "/research/quantbt/runs/run_01/search#fold=1",
      "/research/quantbt/runs/run_01/freeze#fold=1",
      "/research/quantbt/runs/run_01/evidence#stage=execute&fold=1",
      "/research/quantbt/runs/run_01/evidence#stage=claim&fold=1",
    ]);
    // A run without an issued claim does not say claims were issued (DQ-15).
    expect($("[data-done-banner]").textContent).toContain("ARTIFACTS SEALED");
  });
});

/* -------------------------------------------------------------------------
 * DQ-04 stage pills, FE-S03-19 a11y
 * ---------------------------------------------------------------------- */

describe("DQ-04 — five contract stages as HiFi pills", () => {
  it("links a done stage to its deep dive with the fold cursor and pulses the running one", () => {
    view({ foldCursor: 2 });
    const s1 = $('[data-stage="S1"]');
    expect(s1.tagName).toBe("A");
    expect(s1.getAttribute("href")).toBe("/research/quantbt/runs/run_01/split#fold=2");
    expect(s1.textContent).toBe("✓ S1 Split");
    expect(s1.style.borderRadius).toBe("999px");
    const s2 = $('[data-stage="S2"]');
    expect(s2.getAttribute("data-motion")).toBe("pulse");
    expect(s2.style.getPropertyValue("--rs-motion-duration")).toBe("1.6s");
    const s3 = $('[data-stage="S3"]');
    expect(s3.getAttribute("aria-disabled")).toBe("true");
    expect(s3.tabIndex).toBe(0);
  });
});

describe("FE-S03-19 — folds are pressed buttons and arrow keys move the cursor", () => {
  it("marks the picked fold aria-pressed and moves with ArrowRight", () => {
    const onPinFold = vi.fn();
    view({ foldCursor: 1, onPinFold });
    const first = $('[data-fold="1"]');
    expect(first.getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(onPinFold).toHaveBeenCalledWith(2);
  });

  it("switches to compact cells past twelve folds, with detail rows around the pick", () => {
    const folds = Array.from({ length: 12 }, (_, i) => ({
      fold: i + 1,
      state: (i < 6 ? "DONE" : i === 6 ? "RUNNING" : "RUNNING") as "DONE" | "RUNNING",
      started_at_utc_ms: 1000 + i,
      completed_at_utc_ms: i < 6 ? 2000 + i : null,
    })).slice(0, 7);
    const many = [...folds, ...Array.from({ length: 6 }, (_, i) => ({ fold: 8 + i, state: "DONE" as const, started_at_utc_ms: 1, completed_at_utc_ms: 2 }))];
    view({ read: read({}, { folds: many }), foldCursor: 3 });
    expect($("[data-gantt]").getAttribute("data-gantt-mode")).toBe("compact");
    expect(document.querySelectorAll("[data-gantt-cells] [data-fold]")).toHaveLength(13);
    const rows = Array.from(document.querySelectorAll("[data-fold-row]")).map((r) => Number(r.getAttribute("data-fold-row")));
    expect(rows).toEqual([1, 2, 3, 4, 7, 13]);
    expect($('[data-gantt-cells] [data-fold="3"]').getAttribute("aria-pressed")).toBe("true");
  });

  it("uses one heading level below the h1", () => {
    view();
    expect(document.querySelectorAll("h3")).toHaveLength(0);
    expect(document.querySelectorAll("h2").length).toBeGreaterThanOrEqual(2);
  });

  it("prints the status once", () => {
    view();
    expect(document.querySelectorAll("[data-status-pill]")).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------
 * FE-S03-11 — formats, bar, motion
 * ---------------------------------------------------------------------- */

describe("FE-S03-11 — numbers, bar and motion", () => {
  it("formats trials with separators, elapsed and eta as durations", () => {
    view();
    expect($("[data-progress-text]").textContent).toBe("1,603 / 3,000 trials · 42%");
    expect($("[data-elapsed]").textContent).toBe("elapsed 10m 10s");
    expect($("[data-eta]").textContent).toBe("eta 14m 40s");
    expect($("[data-study]").textContent).toBe("study 2 / 5");
  });

  it("draws the overall bar as a 14 px pill with the HiFi gradient, a 400 ms width transition and fold ticks", () => {
    view();
    const bar = $('[aria-label="Overall run progress"]');
    expect(bar.getAttribute("role")).toBe("progressbar");
    expect(bar.style.height).toBe("14px");
    expect(bar.style.borderRadius).toBe("999px");
    const fill = $("[data-bar-pct]");
    expect(fill.style.background).toContain("linear-gradient");
    expect(fill.style.transition).toContain("400ms");
    expect(fill.getAttribute("data-motion")).toBe("pulse");
    expect(document.querySelectorAll("[data-fold-tick]")).toHaveLength(4);
  });

  it("pulses the SSE dot at 1.4 s and the status chip at 1.8 s while live", () => {
    view();
    const dot = $("[data-pulse]");
    expect(dot.style.getPropertyValue("--rs-motion-duration")).toBe("1.4s");
    expect($("[data-status-pill]").style.getPropertyValue("--rs-motion-duration")).toBe("1.8s");
  });

  it("stops every pulse on a terminal run", () => {
    view({ read: completed(), transport: "closed" });
    expect(document.querySelectorAll('[data-motion="pulse"]')).toHaveLength(0);
  });

  it("labels the transport it actually has (FE-S03-17)", () => {
    const { rerender } = view({ transport: "stream" });
    expect(screen.getByText(SSE_LIVE)).toBeTruthy();
    rerender(
      <RunProgress
        runId="run_01"
        read={read()}
        snapshot={read().progress}
        state={OK}
        transport="poll"
        lines={[]}
        linesDropped={false}
        onLoadOlder={vi.fn()}
        foldCursor={null}
        onPinFold={vi.fn()}
        cancelling={false}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(SSE_POLL)).toBeTruthy();
    expect($("[data-transport] span").style.background).toBe("var(--ink-faint)");
  });

  it("never calls a live run's closed stream final", () => {
    view({ transport: "closed" });
    expect(screen.getByText(SSE_RESTING)).toBeTruthy();
  });

  it("shows no raw retry code on screen", () => {
    view({ read: read({ current: { ...read().current, effective_status: "FAILED", may_cancel: false } }), transport: "closed" });
    expect(document.body.textContent).not.toContain("FAIL_CLOSED_NEW_RUN_FROM_REQUESTED_SPEC");
    expect(document.body.textContent).not.toContain("P12_OWNED_NO_P11_RETRY_ROUTE");
    expect($('[data-action="new-run-from"]').textContent).toBe("new run with same draft →");
  });
});

/* -------------------------------------------------------------------------
 * FE-S03-08 — artifacts as HiFi rows
 * ---------------------------------------------------------------------- */

describe("FE-S03-08 — artifacts are table rows with uppercase states", () => {
  it("formats bytes and an 8-hex digest, pulses WRITING and dashes nothing", () => {
    view();
    const sealed = $('[data-artifact="trials.parquet"]');
    expect(sealed.textContent).toContain("SEALED");
    expect(sealed.textContent).toContain("6.1 KB · sha256:2abc4bf2…");
    expect(sealed.querySelector("a")).toBeNull();
    const writing = $('[data-artifact="selection_trace.json"] [data-motion="pulse"]');
    expect(writing.textContent).toBe("WRITING");
    expect(writing.style.textTransform).toBe("uppercase");
    expect(document.body.textContent).not.toContain("READY");
  });
});

/* -------------------------------------------------------------------------
 * FE-S03-06 — console and Stage log
 * ---------------------------------------------------------------------- */

describe("FE-S03-06 — Live console / Stage log", () => {
  const line = (sequence: number, tone: "INFO" | "ERROR" = "INFO") => ({
    sequence,
    occurred_at_utc_ms: 1790226088660,
    tone,
    text: `line ${sequence}`,
    fold: 2,
    trial: sequence,
  });

  it("stamps each line with a level letter and a UTC clock with its zone", () => {
    expect(consoleStamp({ tone: "INFO", occurred_at_utc_ms: 1790226088660 })).toBe("[I 05:01:28Z]");
    expect(consoleStamp({ tone: "ERROR", occurred_at_utc_ms: 1790226088660 })).toBe("[E 05:01:28Z]");
    view({ lines: [line(1)] });
    expect($('[data-console-line="1"]').textContent).toBe("[I 05:01:28Z] line 1");
  });

  it("uses the HiFi console box: fixed 330 px, line height 1.75, console tokens", () => {
    view();
    const box = $("[data-console-box]");
    expect(box.style.height).toBe("330px");
    expect(box.style.lineHeight).toBe("1.75");
    expect(box.style.background).toBe("var(--console-bg)");
    expect(box.querySelector('[data-motion="caret"]')).toBeTruthy();
  });

  it("lets go of auto-scroll only after the reader scrolls up more than 40 px", () => {
    view({ lines: Array.from({ length: 30 }, (_, i) => line(i + 1)) });
    const box = $("[data-console-box]");
    Object.defineProperty(box, "scrollHeight", { configurable: true, value: 1000 });
    Object.defineProperty(box, "clientHeight", { configurable: true, value: 330 });
    box.scrollTop = 1000 - 330 - FOLLOW_SLACK_PX;
    fireEvent.scroll(box);
    expect(document.querySelector("[data-console-latest]")).toBeNull();
    box.scrollTop = 1000 - 330 - FOLLOW_SLACK_PX - 1;
    fireEvent.scroll(box);
    expect($("[data-console-follow]").textContent).toBe("auto-scroll off");
    fireEvent.click($("[data-console-latest]"));
    expect($("[data-console-follow]").textContent).toBe("auto-scroll on");
  });

  it("says a filter matched nothing instead of saying nothing was published", () => {
    view({ lines: [line(1)] });
    fireEvent.click($('[data-console-filter="errors"]'));
    // QA S03: an empty errors filter says there are no errors, not that the lines failed to load.
    expect($("[data-console-empty]").textContent).toBe("No errors or warnings in this log.");
  });

  it("offers load older only while older retained lines remain", () => {
    view();
    expect(document.querySelector('[data-action="load-older"]')).toBeNull();
    cleanup();
    view({ canLoadOlder: true });
    expect(document.querySelector('[data-action="load-older"]')).toBeTruthy();
  });

  it("knows the bootstrap page already reached the floor", async () => {
    stubFetch((url) =>
      url.includes("/evidence") ? [404, {}] : url.includes("/console?") ? [200, { lines: [line(11)] }] : [200, completed({ retention_floor_sequence: 0, latest_sequence: 25 })],
    );
    const { result } = renderHook(() => useRunProgress("run_01"));
    await waitFor(() => expect(result.current.lines).toHaveLength(1));
    expect(result.current.canLoadOlder).toBe(false);
  });

  it("switches to a Stage log ledger whose unpublished cells say so", () => {
    view();
    fireEvent.click($('[data-tab="stage"]'));
    expect(document.querySelector("[data-console-box]")).toBeNull();
    const row = $('[data-ledger-row="1"]');
    expect(row.textContent).toContain("fold_01");
    expect(row.textContent).toContain("n/p");
    expect(row.textContent).toContain("DONE");
    expect($('[data-tab="stage"]').getAttribute("aria-selected")).toBe("true");
  });
});

/* -------------------------------------------------------------------------
 * Spec §23 — cancel is an alert dialog
 * ---------------------------------------------------------------------- */

describe("spec 03 §23 — cancel confirms in an alert dialog", () => {
  it("opens an alertdialog with the spec copy, focuses keep running, and Escape keeps the run", () => {
    const onCancel = vi.fn();
    view({ onCancel });
    fireEvent.click($('[data-action="cancel"]'));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("Cancel run_01?");
    expect(dialog.textContent).toContain(CANCEL_BODY);
    expect(document.activeElement?.getAttribute("data-action")).toBe("cancel-dismiss");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("withdraws cancel and every pulse once the source frame is terminal, before current catches up", () => {
    const frame = completed().progress as ProgressSnapshot;
    view({ read: read({}, frame) });
    expect(document.querySelector('[data-action="cancel"]')).toBeNull();
    expect(document.querySelectorAll('[data-motion="pulse"]')).toHaveLength(0);
    expect(document.querySelector('[data-motion="caret"]')).toBeNull();
  });

  it("shows cancelling… disabled while the request is in flight", () => {
    view({ cancelling: true });
    const button = $('[data-action="cancel"]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe("cancelling…");
  });
});

/* -------------------------------------------------------------------------
 * FE-S03-09 / -10 — states without a source, 404, attempts
 * ---------------------------------------------------------------------- */

describe("FE-S03-09 / FE-S03-10 — states and attempts", () => {
  it("shows the served attempts, a LOST_LEASE included, on a run cancelled before its source", () => {
    view({
      read: read({
        availability: "CANCELLED_BEFORE_SOURCE",
        progress: null,
        current: {
          ...read().current,
          effective_status: "CANCELLED",
          terminal_resolution: "CONTROL_CANCELLATION",
          terminal_materialization: "PENDING",
          may_cancel: false,
        },
        queue: { queue_class: "INTERACTIVE", queued_at_utc_ms: 1790174760803, retry_not_before_utc_ms: null },
        attempts: [{ ordinal: 1, state: "LOST_LEASE", claimed_at_utc_ms: 1790174760827, started_at_utc_ms: null, ended_at_utc_ms: 1790175849426 }],
      }),
      transport: "closed",
    });
    // QA S03 U7: the heading uses the run label, never the raw id.
    expect($("h1").textContent).toBe("Run cancelled — R-WFO-118");
    expect($('[data-job-state="LOST_LEASE"]')).toBeTruthy();
    // QA S03: "resolved by cancellation" is the card's own headline on a run with no source; not said a third time.
    expect($("[data-terminal-resolution]")).toBeNull();
    expect($("[data-terminal-materialization]")).toBeTruthy();
    expect($("[data-run-meta]")).toBeTruthy();
  });

  it("renders run-not-found with a Runs link from a 404 refusal", () => {
    view({
      read: null,
      refusal: {
        state: "terminal",
        status: 404,
        notFound: true,
        mayRetry: false,
        message: "not found",
        code: "RESEARCH_PROGRESS_NOT_FOUND",
        detail: null,
        requestId: null,
        closesStream: true,
      } as never,
      state: { state: "terminal", reason: "Not found.", mayRetry: false, retainsContent: false },
    });
    expect($("[data-run-not-found]")).toBeTruthy();
    expect(screen.getByText("Open Run Library →").getAttribute("href")).toBe("/research/quantbt/runs");
  });

  it("draws one screen-level notice instead of one per card", () => {
    view({ state: { state: "stale", reason: "old", mayRetry: true, retainsContent: true } });
    expect(document.querySelectorAll("[data-research-state]")).toHaveLength(1);
  });

  it("does not repeat the pending-source sentence as a notice", () => {
    view({ read: read({ availability: "PENDING_SOURCE_CALLBACK" }), state: { state: "partial", reason: "waiting", mayRetry: true, retainsContent: true } });
    expect(document.querySelectorAll("[data-research-state]")).toHaveLength(0);
    expect($("[data-pending-source]")).toBeTruthy();
  });
});

/* -------------------------------------------------------------------------
 * Spec §3.2 — the cursor in the URL
 * ---------------------------------------------------------------------- */

describe("spec 03 §3.2 — #fold= is written once the run is final and restored on arrival", () => {
  it("reads a fold from the hash", () => {
    expect(foldFromHash("#fold=3")).toBe(3);
    expect(foldFromHash("#stage=summary")).toBeNull();
    expect(foldFromHash("#fold=abc")).toBeNull();
  });

  it("writes #fold= for a completed run", async () => {
    stubFetch((url) => (url.includes("/evidence") ? [404, {}] : url.includes("/console?") ? [200, { lines: [] }] : [200, completed()]));
    renderHook(() => useRunProgress("run_01"));
    await waitFor(() => expect(window.location.hash).toBe("#fold=1"));
  });

  it("restores a pinned fold from #fold= and follows a new pick", async () => {
    window.history.replaceState(null, "", "/research/quantbt/runs/run_01/progress#fold=1");
    const twoFolds = completed({
      folds: [
        { fold: 1, state: "DONE", started_at_utc_ms: 1000, completed_at_utc_ms: 2000 },
        { fold: 2, state: "DONE", started_at_utc_ms: 2000, completed_at_utc_ms: 3000 },
      ],
    });
    stubFetch((url) => (url.includes("/evidence") ? [404, {}] : url.includes("/console?") ? [200, { lines: [] }] : [200, twoFolds]));
    const { result } = renderHook(() => useRunProgress("run_01"));
    await waitFor(() => expect(result.current.read).not.toBeNull());
    // Not the latest fold (2): the link's fold wins.
    expect(result.current.foldCursor).toBe(1);
    act(() => result.current.pinFold(2));
    await waitFor(() => expect(window.location.hash).toBe("#fold=2"));
  });

  it("never writes the hash while the run is live", async () => {
    stubFetch((url) => (url.includes("/evidence") ? [404, {}] : url.includes("/console?") ? [200, { lines: [] }] : [200, read()]));
    const { result } = renderHook(() => useRunProgress("run_01"));
    await waitFor(() => expect(result.current.read).not.toBeNull());
    act(() => result.current.pinFold(1));
    expect(window.location.hash).toBe("");
  });
});
