/**
 * W2 (RF-05 P11) — Screen 03 consumes CG-P11-03/-06/-07/-08 and CG-P10-04.
 *
 * Every assertion is about a published fact reaching the screen unchanged, or
 * an absent one staying visibly absent: fold selections and the hand-off
 * cursor, the sealed-holdout DENIED card, the lease lapse, the one seeded
 * new-run action, server ETA states, and a stream that carries its own read
 * so the page does not refetch per event.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act, cleanup, render, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DENIED_HOLDOUT_NOTE, RunProgress } from "./RunProgress";
import { classifyFrame, type ProgressRead, type ProgressSnapshot } from "./progressClient";
import { patchSnapshot, useRunProgress } from "./useRunProgress";
import { researchState } from "./state";

afterEach(cleanup);

const DIGEST = "3a91c2d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9";

function snapshot(overrides: Partial<ProgressSnapshot> = {}): ProgressSnapshot {
  return {
    schema_version: "research.progress-snapshot.v1",
    run_id: "run_w2",
    status: "RUNNING",
    created_at_utc_ms: 1789836572000,
    updated_at_utc_ms: 1789836582000,
    latest_sequence: 20,
    retention_floor_sequence: 0,
    stages: [
      { key: "S1", state: "DONE", started_at_utc_ms: 1, completed_at_utc_ms: 2 },
      { key: "S2", state: "DONE", started_at_utc_ms: 2, completed_at_utc_ms: 3 },
      { key: "S3", state: "DONE", started_at_utc_ms: 3, completed_at_utc_ms: 4 },
      { key: "S4", state: "RUNNING", started_at_utc_ms: 4, completed_at_utc_ms: null },
      { key: "S5", state: "PENDING", started_at_utc_ms: null, completed_at_utc_ms: null },
    ],
    overall: {
      pct: 56, elapsed_s: 9, eta_s: 5, trials_done: 2, trials_declared: 3,
      tqdm_line: "global study · trial 2/3 · best J₁ -9.806 · pruned 1/2",
    },
    budget: { used: "0.122", cap: "2.000", unit: "core-min", pct: 7 },
    folds: [],
    artifacts: [],
    claim: { state: "FORECAST", text: "The walk-forward study has not sealed a publishable claim.", cursor: null },
    readiness: { mandatory: "PENDING", optional: "NOT_APPLICABLE" },
    failure: null,
    source: { kind: "DURABLE_P10", coverage: "ACTUAL_HOOKS", partial: false },
    ...overrides,
  };
}

function read(overrides: Partial<ProgressRead> = {}, snap: Partial<ProgressSnapshot> = {}): ProgressRead {
  return {
    schema_version: "research.progress-read.v1",
    run_id: "run_w2",
    availability: "AVAILABLE",
    run: {
      display_label: "R-WFO-118",
      alpha: { alpha_id: "delta-rsi-polynomial-alpha", alpha_name: null, alpha_version_id: "av_delta_1" },
      execution_profile_id: "p10.delta-signal-notional-wfo.v1",
      protocol: "advanced",
      mode: "mode_1_decay",
      schedule: "global",
      instrument: { symbol: "BTCUSDT", timeframe: "1h" },
      execution_route: "signal_notional",
      engine_release_id: "er_quantbt_111",
      config_digest: null,
      requested_spec_digest: "e".repeat(64),
      created_at_utc_ms: 1789836572000,
      declared_folds: { state: "DECLARED", count: 2, reason_code: null },
      planned_folds: { state: "NOT_PUBLISHED", folds: [], reason_code: null },
    },
    queue: { queue_class: "HEAVY", queued_at_utc_ms: 1789836572000, retry_not_before_utc_ms: null },
    attempts: [],
    current: {
      job_state: "RUNNING",
      effective_status: "RUNNING",
      terminal_resolution: "PENDING",
      terminal_materialization: "NOT_REQUIRED",
      source_latest_sequence: 20,
      retention_floor_sequence: 0,
      last_received_at_utc_ms: 1789836582000,
      may_cancel: false,
      may_retry: false,
      retry_reason: "FAIL_CLOSED_NEW_RUN_FROM_REQUESTED_SPEC",
      new_run_from: { state: "AVAILABLE", reason_code: null },
    },
    progress: snapshot(snap),
    retained_artifacts: [],
    denied_artifacts: [],
    ...overrides,
  };
}

const globalSelection = {
  state: "AVAILABLE" as const, scope: "GLOBAL_STUDY" as const, trial: 1,
  objective: "-9.806075711302508", params_digest: DIGEST, reason_code: null,
};

function completed(): ProgressRead {
  return read(
    { current: { ...read().current, effective_status: "COMPLETED", job_state: "SUCCEEDED", terminal_resolution: "SOURCE", terminal_materialization: "READY" } },
    {
      status: "COMPLETED",
      stages: snapshot().stages.map((stage) => ({ ...stage, state: "DONE" as const })),
      overall: { ...snapshot().overall, pct: 100, eta_s: null, trials_done: 3 },
      folds: [
        { fold: 1, state: "DONE", started_at_utc_ms: 10, completed_at_utc_ms: 10, selection: globalSelection },
        { fold: 2, state: "DONE", started_at_utc_ms: 10, completed_at_utc_ms: 10, selection: globalSelection },
      ],
      readiness: { mandatory: "SEALED", optional: "NOT_APPLICABLE" },
      claim: {
        state: "NOT_ISSUED",
        text: "The Delta walk-forward study sealed its artifacts but did not issue a release claim.",
        cursor: null,
        handoff_cursor: { fold: 2, trial: 1, params_digest: DIGEST },
      },
    },
  );
}

function view(r: ProgressRead, foldCursor: number | null = null) {
  return render(
    <RunProgress
      runId="run_w2"
      read={r}
      snapshot={r.progress}
      state={researchState({ kind: "ok", rowCount: 1 })}
      transport={r.current.effective_status === "RUNNING" ? "stream" : "closed"}
      lines={[]}
      linesDropped={false}
      onLoadOlder={vi.fn()}
      foldCursor={foldCursor}
      onPinFold={vi.fn()}
      cancelling={false}
      onCancel={vi.fn()}
    />,
  );
}

const $ = (selector: string) => document.querySelector(selector) as HTMLElement;

describe("CG-P11-03 — fold selection, hand-off cursor, declared folds", () => {
  it("names a global study, the declared fold count and the server's ETA", () => {
    view(read());
    expect($("[data-study]").textContent).toBe("study global — scores all 2 folds");
    expect($("[data-eta]").textContent).toBe("eta 5s");
    /* CG-P10-04: no rate field is published, so the cell is a short absence — no invented sentence. */
    expect($("[data-rate]").textContent).toBe("rate not published");
    expect($("[data-rate] [data-not-published]").getAttribute("title")).toBeNull();
    expect($('[data-research-panel="folds"]').textContent).toContain("0 of 2 folds");
    // A global study opens no fold row: nothing is drawn running.
    expect(document.querySelectorAll("[data-fold-row]")).toHaveLength(0);
  });

  it("says the search is done, never zero, when the server withdraws the ETA", () => {
    view(read({}, {
      stages: snapshot().stages.map((stage) => (stage.key === "S4" ? { ...stage, state: "DONE" as const } : stage)),
      overall: { ...snapshot().overall, eta_s: null, trials_done: 3 },
    }));
    expect($("[data-eta]").textContent).toBe("eta search done");
    cleanup();
    view(completed());
    expect($("[data-eta]").textContent).toBe("eta none — run final");
  });

  it("prints each fold's published selection and hands off its exact cursor", () => {
    view(completed(), 2);
    const note = $('[data-fold-note="2"]');
    expect(note.textContent).toBe("global best J₁ −9.806 · trial 1 · prm_3a91c2");
    expect(note.querySelector("[data-fold-selection]")?.getAttribute("title")).toContain(DIGEST);
    expect($("[data-cursor-trial]").textContent).toBe("trial 1");
    expect($("[data-cursor-params]").textContent).toBe("params prm_3a91c2");
    const open = $("[data-open-evidence]");
    expect(open.getAttribute("href")).toBe(
      `/research/quantbt/runs/run_w2/evidence#stage=summary&fold=2&trial=1&params=${DIGEST}`,
    );
    expect(open.getAttribute("aria-label")).toBe("open evidence flow at fold 2 · trial 1");
    expect($("[data-handoff-cursor]").textContent).toBe("fold 2 · trial 1 · prm_3a91c2");
  });

  it("fills the Stage log from the selection, labels a global objective and a fixed profile", () => {
    const { getByRole } = view(completed(), 2);
    act(() => getByRole("tab", { name: "Stage log" }).click());
    expect($('[data-ledger-trials="1"]').textContent).toBe("3 · global");
    expect($('[data-ledger-objective="1"]').textContent).toBe("−9.806 g");
    expect($('[data-ledger-selected="1"]').textContent).toBe("#1");
    expect($('[data-ledger-digest="1"]').textContent).toBe("prm_3a91c2");
    cleanup();
    const fixed = completed();
    fixed.progress!.folds = [{
      fold: 1, state: "DONE", started_at_utc_ms: 1, completed_at_utc_ms: 2,
      selection: { state: "AVAILABLE", scope: "FIXED_PROFILE", trial: 1, objective: null, params_digest: DIGEST, reason_code: null },
    }];
    const second = view(fixed, 1);
    act(() => second.getByRole("tab", { name: "Stage log" }).click());
    expect($('[data-ledger-trials="1"]').textContent).toBe("1 · fixed");
    expect($('[data-ledger-objective="1"]').textContent).toBe("no search");
  });

  it("keeps a not-published shell for a fold whose selection the source did not publish", () => {
    const legacy = completed();
    legacy.progress!.folds = [{ fold: 1, state: "DONE", started_at_utc_ms: 1, completed_at_utc_ms: 2 }];
    legacy.progress!.claim = { ...legacy.progress!.claim, handoff_cursor: null };
    view(legacy, 1);
    expect($('[data-fold-note="1"]').textContent).toBe("selection not published");
    expect($("[data-cursor-params] [data-not-published]")).toBeTruthy();
    expect($("[data-handoff-cursor]")).toBeNull();
  });

  it("lists the sealed holdout as a DENIED card with its bar count, never a link", () => {
    view(read({
      denied_artifacts: [{
        name: "sealed holdout", state: "DENIED", reason_code: "P08_SEALED_HOLDOUT_UNLOCK_NOT_INSTALLED",
        rows: "336", range: { start_utc_ms: 1786060800000, end_exclusive_utc_ms: 1787270400000 }, reader_href: null,
      }],
    }));
    const row = $('[data-artifact-state="DENIED"]');
    expect(row.textContent).toContain("denied");
    expect(row.textContent).toContain(`336 bars · ${DENIED_HOLDOUT_NOTE}`);
    expect(row.getAttribute("title")).toContain("P08_SEALED_HOLDOUT_UNLOCK_NOT_INSTALLED");
    expect(row.querySelector("a")).toBeNull();
  });
});

describe("CG-P11-06 — the attempt drawer keeps a lease lapse apart from when it was recorded", () => {
  it("shows the lapse, the recording and a real retry-not-before", () => {
    view(read({
      queue: { queue_class: "HEAVY", queued_at_utc_ms: 1789836572000, retry_not_before_utc_ms: 1789837000000 },
      attempts: [{
        ordinal: 1, state: "LOST_LEASE", claimed_at_utc_ms: 1789836572000, started_at_utc_ms: null,
        ended_at_utc_ms: 1789837652000, lease_expired_at_utc_ms: 1789836692000,
      }],
    }));
    const drawer = $("[data-queue-attempts]");
    expect($("[data-lease-lapsed]").textContent).toBe("lease lapsed 2026-09-19 16:51 UTC");
    expect(drawer.textContent).toContain("recorded 2026-09-19 17:07 UTC");
    expect($("[data-retry-not-before]").textContent).toContain("next attempt not before 2026-09-19 16:56 UTC");
  });
});

/* ------------------------------------------------------------- the stream */

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
  emit(payload: unknown) {
    const message = { data: JSON.stringify(payload) } as MessageEvent<string>;
    for (const listener of this.listeners.get("research.progress") ?? []) listener(message);
  }
}

let fetched: string[] = [];

function stubFetch(body: () => unknown) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    fetched.push(url);
    const payload = url.includes("/console?")
      ? { schema_version: "research.progress-console.v1", run_id: "run_w2", after_seq: 0, source_latest_sequence: 20, retention_floor_sequence: 0, lines: [] }
      : body();
    return { ok: true, status: 200, statusText: "", headers: { get: () => null }, json: async () => payload } as unknown as Response;
  }));
}

beforeEach(() => {
  fetched = [];
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource as unknown as typeof EventSource);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function progressReads(): number {
  return fetched.filter((url) => url.includes("/progress")).length;
}

function trialEvent(sequence: number, trial: number) {
  return {
    schema_version: "research.progress-event.v1", run_id: "run_w2", sequence, event_type: "trial_completed",
    occurred_at_utc_ms: 1789836600000,
    payload: { study: "GLOBAL", trial, state: "COMPLETE", overall_pct: 80, eta_s: null, tqdm_line: "global study · trial 3/3" },
  };
}

describe("CG-P11-08 — each live frame carries the read; the page does not refetch per event", () => {
  it("applies current/availability from the frame and makes no GET for it", async () => {
    stubFetch(() => read());
    const { result } = renderHook(() => useRunProgress("run_w2"));
    await waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0));
    const before = progressReads();
    const next = read({ current: { ...read().current, may_cancel: true, last_received_at_utc_ms: 1789836599000 } }, { latest_sequence: 21, overall: { ...snapshot().overall, trials_done: 3, pct: 80 } });
    await act(async () => {
      FakeEventSource.instances[0]!.emit({ event: trialEvent(21, 3), snapshot: null, read: next });
    });
    expect(result.current.read?.current.may_cancel).toBe(true);
    expect(result.current.snapshot?.overall.trials_done).toBe(3);
    expect(progressReads()).toBe(before);
  });

  it("patches the read's older snapshot with the frame's own event", async () => {
    stubFetch(() => read());
    const { result } = renderHook(() => useRunProgress("run_w2"));
    await waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0));
    await act(async () => {
      // The relay has not advanced the source snapshot to sequence 22 yet.
      FakeEventSource.instances[0]!.emit({ event: trialEvent(22, 3), snapshot: null, read: read() });
    });
    expect(result.current.snapshot?.overall.trials_done).toBe(3);
    expect(result.current.snapshot?.overall.tqdm_line).toBe("global study · trial 3/3");
  });

  it("closes on a terminal frame that carries its read without a reconcile GET", async () => {
    stubFetch(() => read());
    const { result } = renderHook(() => useRunProgress("run_w2"));
    await waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0));
    const before = progressReads();
    const done = completed();
    await act(async () => {
      FakeEventSource.instances[0]!.emit({
        event: {
          schema_version: "research.progress-event.v1", run_id: "run_w2", sequence: 30, event_type: "run_completed",
          occurred_at_utc_ms: 1789836700000,
          payload: {
            usage: { peak_rss_bytes: 314572800, cpu_seconds: 6, scratch_bytes: null, fd_peak: null },
            handoff_cursor: { fold: 2, trial: 1, params_digest: DIGEST },
          },
        },
        snapshot: null,
        read: { ...done, progress: { ...done.progress!, latest_sequence: 30 } },
      });
    });
    expect(FakeEventSource.instances[0]!.closed).toBe(true);
    expect(result.current.read?.current.effective_status).toBe("COMPLETED");
    expect(result.current.snapshot?.claim.handoff_cursor?.fold).toBe(2);
    expect(progressReads()).toBe(before);
  });

  it("makes exactly one GET when the server omitted an oversized read", async () => {
    stubFetch(() => read());
    renderHook(() => useRunProgress("run_w2"));
    await waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0));
    const before = progressReads();
    await act(async () => {
      FakeEventSource.instances[0]!.emit({
        event: trialEvent(21, 3), snapshot: null, read: null, read_omitted_reason: "P11_STREAM_READ_OVER_FRAME_BUDGET",
      });
    });
    await waitFor(() => expect(progressReads()).toBe(before + 1));
  });

  it("classifies the frame's read and its omission", () => {
    const frame = classifyFrame(JSON.stringify({ event: trialEvent(21, 3), snapshot: null, read: read() }));
    expect(frame?.kind === "event" && frame.read?.run?.execution_profile_id).toBe("p10.delta-signal-notional-wfo.v1");
    const omitted = classifyFrame(JSON.stringify({ event: trialEvent(21, 3), snapshot: null, read: null, read_omitted_reason: "P11_STREAM_READ_OVER_FRAME_BUDGET" }));
    expect(omitted?.kind === "event" && omitted.readOmitted).toBe(true);
    const replay = classifyFrame(JSON.stringify({ event: trialEvent(21, 3), snapshot: null, read: null }));
    expect(replay?.kind === "event" && replay.read === null && !replay.readOmitted).toBe(true);
  });
});

describe("CG-P10-04 — events patch only what they publish", () => {
  it("a global trial opens no fold, moves ETA and trials; fold_completed carries its selection", () => {
    const base = snapshot();
    const trial = patchSnapshot(base, trialEvent(21, 3) as never);
    expect(trial.folds).toEqual([]);
    expect(trial.overall.trials_done).toBe(3);
    expect(trial.overall.eta_s).toBeNull();
    const fold = patchSnapshot(trial, {
      schema_version: "research.progress-event.v1", run_id: "run_w2", sequence: 22, event_type: "fold_completed",
      occurred_at_utc_ms: 1789836601000,
      payload: { fold: 1, selection: { scope: "GLOBAL_STUDY", trial: 1, objective: "-9.8", params_digest: DIGEST } },
    } as never);
    expect(fold.folds[0]).toMatchObject({ fold: 1, state: "DONE", selection: { state: "AVAILABLE", trial: 1, params_digest: DIGEST, reason_code: null } });
  });
});

describe("E10 (audit 01-5/03-4) — a FAILED run shows where it stopped and why, from the server", () => {
  // The canonical fixture is a real PostgreSQL read (p11-progress.spec E10-03):
  // the lease was lost while S4 ran and no dispatcher claimed the retry.
  const fixture = JSON.parse(
    readFileSync(join(process.cwd(), "../../../packages/contracts/fixtures/research-progress.failed-at.valid.json"), "utf8"),
  ) as { current: Pick<ProgressRead["current"], "job_state" | "effective_status" | "may_cancel" | "failed_at" | "terminal_reason"> };

  function failedRead(): ProgressRead {
    return read({ current: { ...read().current, ...fixture.current, terminal_resolution: "SOURCE" } });
  }

  it("draws the failing stage red, and only that stage", () => {
    view(failedRead());
    const s4 = $('[data-stage="S4"]');
    expect(s4.getAttribute("data-stage-state")).toBe("FAILED");
    expect(s4.style.color).toBe("var(--bad)");
    expect(s4.textContent).toMatch(/^✕ S4 /);
    expect(s4.getAttribute("title")).toBe("Failed during this stage.");
    expect(s4.getAttribute("data-motion")).toBeNull();
    for (const key of ["S1", "S2", "S3", "S5"]) expect($(`[data-stage="${key}"]`).style.color).not.toBe("var(--bad)");
  });

  it("states the control-side reason when the source reported none", () => {
    view(failedRead());
    const failure = $("[data-failure]");
    expect(failure.getAttribute("data-failure")).toBe("P06_RETRY_NOT_DISPATCHED");
    expect(failure.textContent).toContain("no dispatcher claimed the scheduled retry");
  });

  it("marks nothing red while the run is live", () => {
    view(read());
    expect(document.querySelector('[data-stage-state="FAILED"]')).toBeNull();
    expect(document.querySelector("[data-failure]")).toBeNull();
  });
});
