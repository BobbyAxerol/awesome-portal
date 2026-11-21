/**
 * Batch F4/MISC · S03 — the two fields Codex published on 2026-10-01.
 *
 *  - `run.planned_folds` (CG-FG-S03-01): a rail of planned outer-OOS windows above the Gantt, coloured
 *    by the observed fold of the same number; NOT_PUBLISHED is a typed absence with the server's code.
 *  - `overall.rate_trials_per_s` / `trial_completed.rate_trials_per_s` (S03 trial rate): the study rate as
 *    served; a null or an absent field is "not published", never 0 or a dash.
 * The identity is the canonical `research-progress.planned-folds` fixture.
 */
import { act, cleanup, render, renderHook, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RunProgress } from "./RunProgress";
import type { ProgressRead, ProgressRunIdentity } from "./progressClient";
import { researchState } from "./state";
import { useRunProgress } from "./useRunProgress";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const BASE = JSON.parse(readFileSync(join(ROOT, "apps/portal/frontend/e2e/research-foundation/progress-read.json"), "utf8")) as ProgressRead;
const IDENTITY = JSON.parse(
  readFileSync(join(ROOT, "packages/contracts/fixtures/research-progress.planned-folds.valid.json"), "utf8"),
) as ProgressRunIdentity;

afterEach(cleanup);

function view(identity: Partial<ProgressRunIdentity> | null, overall: Record<string, unknown> = {}, props: Record<string, unknown> = {}) {
  const read = { ...BASE, run: identity === null ? undefined : { ...IDENTITY, ...identity }, progress: { ...BASE.progress!, overall: { ...BASE.progress!.overall, ...overall } } } as ProgressRead;
  return render(
    <MemoryRouter>
      <RunProgress
        runId={read.run_id}
        read={read}
        snapshot={read.progress ?? null}
        state={researchState({ kind: "ok", rowCount: 1 })}
        transport="closed"
        lines={[]}
        linesDropped={false}
        onLoadOlder={vi.fn()}
        foldCursor={null}
        onPinFold={vi.fn()}
        cancelling={false}
        onCancel={vi.fn()}
        {...props}
      />
    </MemoryRouter>,
  );
}
const $ = (selector: string) => document.querySelector(selector) as HTMLElement | null;

describe("S03 planned_folds", () => {
  const nine = {
    ...IDENTITY.planned_folds,
    folds: Array.from({ length: 9 }, (_, i) => ({
      fold: i + 1,
      test_start_utc_ms: 1790274478000 + i * 86_400_000,
      test_end_utc_ms: 1790274478000 + (i + 1) * 86_400_000,
    })),
  } as ProgressRunIdentity["planned_folds"];

  it("draws one cell per planned window, coloured by the observed fold of the same number", () => {
    view({ planned_folds: nine });
    expect($("[data-planned-windows]")?.getAttribute("data-planned-windows")).toBe("9");
    expect(document.querySelectorAll("[data-planned-fold]")).toHaveLength(9);
    /* the committed progress read observes folds 1-2 DONE and 3 RUNNING */
    expect($('[data-planned-fold="1"]')?.getAttribute("data-planned-state")).toBe("DONE");
    expect($('[data-planned-fold="3"]')?.getAttribute("data-planned-state")).toBe("RUNNING");
    expect($('[data-planned-fold="4"]')?.getAttribute("data-planned-state")).toBe("PLANNED");
  });

  it("every cell names its fold, the served window and its state, as title and accessible name", () => {
    view({ planned_folds: nine });
    const cell = $('[data-planned-fold="2"]')!;
    expect(cell.getAttribute("title")).toBe("fold_02 · test 2026-09-25 18:27 UTC → 2026-09-26 18:27 UTC · done");
    expect(cell.getAttribute("aria-label")).toBe(cell.getAttribute("title"));
    expect($("[data-planned-span]")?.textContent).toBe("2026-09-24 18:27 UTC → 2026-10-03 18:27 UTC");
  });

  it("NOT_PUBLISHED prints the server's own reason code, no cells and no 0", () => {
    view({ planned_folds: { state: "NOT_PUBLISHED", folds: [], reason_code: "P08_TOPOLOGY_DID_NOT_DECLARE_FOLDS" } });
    const node = $('[data-planned-windows="absent"]')!;
    expect(node.getAttribute("data-reason-code")).toBe("P08_TOPOLOGY_DID_NOT_DECLARE_FOLDS");
    expect(node.textContent).toContain("not published");
    expect(node.textContent).toContain("P08_TOPOLOGY_DID_NOT_DECLARE_FOLDS");
    expect(document.querySelectorAll("[data-planned-fold]")).toHaveLength(0);
  });

  it("a server that predates the field is the same typed absence, without a code", () => {
    view({ planned_folds: undefined });
    expect($('[data-planned-windows="absent"]')?.textContent).toContain("not published");
    expect($('[data-planned-windows="absent"]')?.hasAttribute("data-reason-code")).toBe(false);
  });
});

describe("S03 rate_trials_per_s", () => {
  it("prints the served decimal string exactly, with its unit", () => {
    view(IDENTITY, { rate_trials_per_s: "0.35084033613445376" });
    const node = $("[data-rate]")!;
    // QA S03: two decimals on screen; the served string stays on the node and in the tooltip.
    expect(node.getAttribute("data-rate")).toBe("0.35084033613445376");
    expect(node.textContent).toBe("rate 0.35 trials/s");
    expect(node.getAttribute("title")).toContain("0.35084033613445376");
  });

  it("a served null, or no field at all, is 'not published' — never 0 or a dash", () => {
    for (const overall of [{ rate_trials_per_s: null }, {}]) {
      cleanup();
      view(IDENTITY, overall);
      const node = $("[data-rate]")!;
      expect(node.querySelector("[data-not-published]")?.textContent).toBe("not published");
      expect(node.textContent).toBe("rate not published");
    }
  });

  it("the live trial event's rate wins over the snapshot; a live null is kept as null", () => {
    view(IDENTITY, { rate_trials_per_s: "0.1" }, { liveRate: "0.4" });
    expect($("[data-rate]")?.textContent).toBe("rate 0.4 trials/s");
    cleanup();
    view(IDENTITY, { rate_trials_per_s: "0.1" }, { liveRate: null });
    expect($("[data-rate]")?.textContent).toBe("rate not published");
  });
});

describe("S03 live rate in the stream hook", () => {
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
    run_id: BASE.run_id,
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
          ? { schema_version: "research.progress-console.v1", run_id: BASE.run_id, after_seq: 0, source_latest_sequence: 0, retention_floor_sequence: 0, lines: [] }
          : BASE;
        return { ok: true, status: 200, statusText: "", headers: { get: () => null }, json: async () => body } as unknown as Response;
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the last served rate, a served null, and ignores an event that omits it", async () => {
    const { result } = renderHook(() => useRunProgress(BASE.run_id));
    await waitFor(() => expect(FakeEventSource.instances.length).toBeGreaterThan(0));
    expect(result.current.liveRate).toBeUndefined();
    const es = () => FakeEventSource.instances[0]!;
    await act(async () => es().emit({ event: trial(9001, { rate_trials_per_s: "0.5" }), snapshot: null, read: BASE }));
    expect(result.current.liveRate).toBe("0.5");
    await act(async () => es().emit({ event: trial(9002, {}), snapshot: null, read: BASE }));
    expect(result.current.liveRate).toBe("0.5");
    await act(async () => es().emit({ event: trial(9003, { rate_trials_per_s: null }), snapshot: null, read: BASE }));
    expect(result.current.liveRate).toBeNull();
  });
});
