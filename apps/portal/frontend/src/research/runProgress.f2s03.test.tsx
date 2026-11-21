/**
 * Batch F2 · S03 — served-but-unread fields.
 *
 *  - `trial_completed.best_objective`  the study's exact best objective; the tqdm
 *    line only carries its 3-place rendering (and "—" for a null).
 *  - `CancelResponse.source_marker` / `status`  the server's answer to a cancel.
 *
 * The progress read comes from the committed `e2e/research-foundation` fixture.
 */
import { act, cleanup, render, renderHook, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RunProgress } from "./RunProgress";
import { progressApi, type CancelResponse, type ProgressRead } from "./progressClient";
import { useRunProgress, type LiveBestObjective } from "./useRunProgress";
import { researchState } from "./state";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const BASE = JSON.parse(
  readFileSync(join(ROOT, "apps/portal/frontend/e2e/research-foundation/progress-read.json"), "utf8"),
) as ProgressRead;
const RUN_ID = BASE.run_id;

afterEach(cleanup);

function view(overrides: Partial<React.ComponentProps<typeof RunProgress>> = {}) {
  return render(
    <MemoryRouter>
      <RunProgress
        runId={RUN_ID}
        read={BASE}
        snapshot={BASE.progress ?? null}
        state={researchState({ kind: "ok", rowCount: 1 })}
        transport="closed"
        lines={[]}
        linesDropped={false}
        onLoadOlder={vi.fn()}
        foldCursor={null}
        onPinFold={vi.fn()}
        cancelling={false}
        onCancel={vi.fn()}
        {...overrides}
      />
    </MemoryRouter>,
  );
}
const $ = (selector: string) => document.querySelector(selector) as HTMLElement | null;

describe("S03 best_objective on the study line", () => {
  it("prints the exact served value, not the 3-place tqdm rendering", () => {
    const best: LiveBestObjective = { fold: null, value: "1.23456789" };
    view({ bestObjective: best });
    const node = $("[data-best-objective]")!;
    expect(node.textContent).toBe("best 1.23456789");
    expect(node.getAttribute("data-best-objective")).toBe("1.23456789");
    expect(node.getAttribute("title")).toBe("best objective · global study");
  });

  it("names the fold on a fold-bound study", () => {
    view({ bestObjective: { fold: 2, value: "-0.5" } });
    expect($("[data-best-objective]")!.getAttribute("title")).toBe("best objective · fold 2");
    expect($("[data-best-objective]")!.textContent).toBe("best -0.5");
  });

  it("a served null is a typed absence, not 0 or a dash", () => {
    view({ bestObjective: { fold: null, value: null } });
    const node = $("[data-best-objective]")!;
    expect(node.querySelector("[data-not-published]")?.textContent).toBe("not published");
    expect(node.textContent).toBe("best not published");
    expect(node.textContent).not.toMatch(/[0—]/);
  });

  it("shows nothing when no trial event has been seen", () => {
    view({ bestObjective: null });
    expect($("[data-best-objective]")).toBeNull();
  });
});

describe("S03 best_objective in the hook", () => {
  class FakeEventSource {
    static instances: FakeEventSource[] = [];
    onerror: ((e: Event) => void) | null = null;
    private listeners = new Map<string, ((e: MessageEvent<string>) => void)[]>();
    constructor(readonly url: string) {
      FakeEventSource.instances.push(this);
    }
    addEventListener(name: string, listener: (e: MessageEvent<string>) => void) {
      this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
    }
    close() {}
    emit(payload: unknown) {
      const message = { data: JSON.stringify(payload) } as MessageEvent<string>;
      for (const listener of this.listeners.get("research.progress") ?? []) listener(message);
    }
  }
  const trial = (sequence: number, extra: Record<string, unknown>) => ({
    schema_version: "research.progress-event.v1",
    run_id: RUN_ID,
    sequence,
    event_type: "trial_completed",
    occurred_at_utc_ms: 1789836600000,
    payload: { study: "GLOBAL", trial: sequence, state: "COMPLETE", ...extra },
  });

  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource as unknown as typeof EventSource);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const body = url.includes("/console")
          ? { schema_version: "research.progress-console.v1", run_id: RUN_ID, after_seq: 0, source_latest_sequence: 0, retention_floor_sequence: 0, lines: [] }
          : BASE;
        return { ok: true, status: 200, statusText: "", headers: { get: () => null }, json: async () => body } as unknown as Response;
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the last served best objective, a served null, and ignores an event that omits it", async () => {
    const { result } = renderHook(() => useRunProgress(RUN_ID));
    await waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0));
    expect(result.current.bestObjective).toBeNull();
    const es = () => FakeEventSource.instances[0]!;
    await act(async () => es().emit({ event: trial(9001, { best_objective: "1.5" }), snapshot: null, read: BASE }));
    expect(result.current.bestObjective).toEqual({ fold: null, value: "1.5" });
    await act(async () => es().emit({ event: trial(9002, {}), snapshot: null, read: BASE }));
    expect(result.current.bestObjective).toEqual({ fold: null, value: "1.5" });
    await act(async () => es().emit({ event: trial(9003, { best_objective: null }), snapshot: null, read: BASE }));
    expect(result.current.bestObjective).toEqual({ fold: null, value: null });
  });
});

describe("S03 cancel answer", () => {
  const answer = (status: CancelResponse["status"], marker: CancelResponse["source_marker"]): CancelResponse => ({
    schema_version: "research.progress-cancel.v1",
    run_id: RUN_ID,
    status,
    source_marker: marker,
  });

  it("renders the served source_marker token as a mono chip beside the status", () => {
    view({ cancelResult: answer("CANCEL_REQUESTED", "PENDING_RECONCILIATION") });
    const chip = $("[data-cancel-marker]")!;
    expect(chip.textContent).toBe("PENDING_RECONCILIATION");
    expect(chip.getAttribute("data-cancel-status")).toBe("CANCEL_REQUESTED");
    expect(chip.getAttribute("aria-label")).toBe("cancel CANCEL_REQUESTED, source PENDING_RECONCILIATION");
    expect(chip.style.fontFamily).toMatch(/mono/i);
  });

  it("follows the served token, whatever it is", () => {
    view({ cancelResult: answer("ALREADY_TERMINAL", "NOT_REQUIRED") });
    expect($("[data-cancel-marker]")!.textContent).toBe("NOT_REQUIRED");
  });

  it("shows no chip before a cancel was answered", () => {
    view({ cancelResult: null });
    expect($("[data-cancel-marker]")).toBeNull();
  });

  it("the client posts the reason and workspace, and the hook keeps the answer for the page", async () => {
    const response = answer("CANCEL_REQUESTED", "PENDING_RECONCILIATION");
    const spy = vi.spyOn(progressApi, "cancel").mockResolvedValue(response);
    vi.stubGlobal("EventSource", class { addEventListener() {} close() {} } as unknown as typeof EventSource);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
      ok: true, status: 200, statusText: "", headers: { get: () => null },
      json: async () => (url.includes("/console")
        ? { schema_version: "research.progress-console.v1", run_id: RUN_ID, after_seq: 0, source_latest_sequence: 0, retention_floor_sequence: 0, lines: [] }
        : BASE),
    }) as unknown as Response));
    const { result } = renderHook(() => useRunProgress(RUN_ID, "ws_probe"));
    await act(async () => result.current.cancel("cancelled by portal operator"));
    expect(spy).toHaveBeenCalledWith(RUN_ID, "cancelled by portal operator", "ws_probe");
    await waitFor(() => expect(result.current.cancelResult).toEqual(response));
    spy.mockRestore();
    vi.unstubAllGlobals();
  });
});
