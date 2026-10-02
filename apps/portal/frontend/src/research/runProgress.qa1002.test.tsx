/**
 * QA 2026-10-02 · S03 fix wave.
 *
 *  - the passport reads `progress.claims[]` (four sealed methodology facts) instead of "not issued";
 *  - a FAILED run shows where it stopped and the server's sentence, not "400 / 400 · 80%";
 *  - a refused first read has a Retry and no skeletons; the console's outage is not "nothing published";
 *  - the dead "fold N" console filter, the cancelled title, the Gantt count, the history entry per fold.
 *
 * The progress read is the committed `e2e/research-foundation` fixture.
 */
import { act, cleanup, fireEvent, render, renderHook, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RunProgress, foldsMeta } from "./RunProgress";
import type { ConsoleLine, MethodologyClaim, ProgressRead, ProgressRunIdentity } from "./progressClient";
import { researchState } from "./state";
import { mergeRead, useRunProgress } from "./useRunProgress";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const BASE = JSON.parse(
  readFileSync(join(ROOT, "apps/portal/frontend/e2e/research-foundation/progress-read.json"), "utf8"),
) as ProgressRead;
const RUN_ID = BASE.run_id;
const IDENTITY = JSON.parse(
  readFileSync(join(ROOT, "packages/contracts/fixtures/research-progress.planned-folds.valid.json"), "utf8"),
) as ProgressRunIdentity;

/** The four rows R-WFO-020 / R-WFO-023 serve on `progress.claims[]` (QA S03 inventory #11). */
const FOUR: MethodologyClaim[] = [
  { kind: "VALIDATION", state: "ISSUED", text: "walk_forward_oos", reason_code: null, source: "SEALED_QUANTBT_CLAIM" },
  { kind: "CHRONOLOGY", state: "ISSUED", text: "not_causal_multi_fold_global_calibration", reason_code: null, source: "SEALED_QUANTBT_CLAIM" },
  { kind: "CAUSALITY", state: "ISSUED", text: "retrospective_global_calibration", reason_code: null, source: "SEALED_QUANTBT_CLAIM" },
  { kind: "OOS_SELECTION", state: "ISSUED", text: "USED", reason_code: null, source: "SEALED_QUANTBT_CLAIM" },
];

afterEach(cleanup);

function failedRead(): ProgressRead {
  const read = structuredClone(BASE);
  read.current = {
    ...read.current,
    effective_status: "FAILED",
    may_cancel: false,
    failed_at: { stage: "S4", fold: null, basis: "SOURCE_RUNNING_STAGE" },
    terminal_reason: { origin: "SOURCE", code: "ENGINE_ERROR", message: "The current-source summary exceeds the sealed local read-model budget." },
  } as ProgressRead["current"];
  read.progress = {
    ...read.progress!,
    status: "FAILED",
    claim: { state: "NOT_ISSUED", text: "The run failed before Stage 5 issued a claim.", cursor: null },
    failure: { code: "ENGINE_ERROR", message: "The current-source summary exceeds the sealed local read-model budget." },
    overall: { ...read.progress!.overall, trials_done: 400, trials_declared: 400, pct: 80, eta_s: null },
    stages: read.progress!.stages.map((stage) => ({ ...stage, state: stage.key === "S4" ? "RUNNING" : stage.key === "S5" ? "PENDING" : "DONE" })) as never,
    folds: [],
  };
  return read;
}

function view(props: Partial<React.ComponentProps<typeof RunProgress>> = {}) {
  const read = props.read === undefined ? BASE : props.read;
  return render(
    <MemoryRouter>
      <RunProgress
        runId={RUN_ID}
        read={read}
        snapshot={read?.progress ?? null}
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
const line = (sequence: number, fold: number | null): ConsoleLine => ({
  sequence,
  occurred_at_utc_ms: 1789836582000 + sequence,
  tone: "INFO",
  text: `line ${sequence}`,
  fold,
  trial: sequence,
});

describe("S03 claim passport reads progress.claims[]", () => {
  it("value path: four sealed facts print as chips with their served text, and the header counts them", () => {
    const read = { ...BASE, claims: FOUR, progress: { ...BASE.progress!, claim: { state: "NOT_ISSUED" as const, text: "", cursor: null } } } as ProgressRead;
    view({ read });
    const chips = [...document.querySelectorAll("[data-claim-kind]")];
    expect(chips.map((chip) => chip.getAttribute("data-claim-kind"))).toEqual(["VALIDATION", "CHRONOLOGY", "CAUSALITY", "OOS_SELECTION"]);
    expect(chips[0].textContent).toContain("walk_forward_oos");
    expect(chips[3].textContent).toContain("USED");
    expect($("[data-claim-badge]")?.textContent).toBe("claim passport — 4 facts sealed");
    expect($("[data-claim-badge]")?.textContent).not.toContain("not issued");
  });

  it("typed-absence path: an unpublished fact says so with the server's reason code in the tooltip", () => {
    const claims: MethodologyClaim[] = [
      FOUR[0],
      { kind: "HOLDOUT_STATE", state: "NOT_PUBLISHED", text: null, reason_code: "SOURCE_DID_NOT_PUBLISH_HOLDOUT_STATE", source: null },
      { kind: "EXECUTION_CONTRACT", state: "NOT_APPLICABLE", text: null, reason_code: "P10_FIXED_PROFILE", source: null },
    ];
    view({ read: { ...BASE, claims } as ProgressRead });
    const holdout = $('[data-claim-kind="HOLDOUT_STATE"]')!;
    expect(holdout.textContent).toContain("not published");
    expect(holdout.getAttribute("title")).toContain("SOURCE_DID_NOT_PUBLISH_HOLDOUT_STATE");
    expect($('[data-claim-kind="EXECUTION_CONTRACT"]')!.textContent).toContain("not applicable");
    expect($("[data-claim-badge]")?.textContent).toBe("claim passport — forecast");
  });

  it("a read without claims[] draws no claims field and keeps the plain header", () => {
    view({ read: { ...BASE, progress: { ...BASE.progress!, claim: { state: "NOT_ISSUED", text: "", cursor: null } } } as ProgressRead });
    expect($("[data-claims]")).toBeNull();
    expect($("[data-claim-badge]")?.textContent).toBe("claim passport — not issued");
  });

  it("an SSE frame that omits claims keeps the last served four", () => {
    const withClaims = { ...BASE, claims: FOUR } as ProgressRead;
    const frame = { ...BASE, progress: { ...BASE.progress!, latest_sequence: BASE.progress!.latest_sequence + 1 } } as ProgressRead;
    expect(frame.claims).toBeUndefined();
    expect(mergeRead(withClaims, frame).claims).toEqual(FOUR);
    expect(mergeRead(withClaims, { ...frame, claims: [] }).claims).toEqual([]);
  });
});

describe("S03 failed run", () => {
  it("says where it stopped and prints the server's sentence once, with no percent and no ETA", () => {
    view({ read: failedRead() });
    expect($("[data-progress-text]")?.textContent).toBe("400 / 400 trials · failed at S4 Execute");
    expect($("[data-progress-text]")?.textContent).not.toContain("%");
    expect($("[data-eta]")).toBeNull();
    const failure = $("[data-failure]")!;
    expect(failure.textContent).toContain("failed at S4 Execute — The current-source summary exceeds the sealed local read-model budget.");
    expect($("[data-claim-badge]")?.textContent).toBe("claim passport — not issued");
    // the claim sentence is not repeated three times
    expect($("[data-claim-text]")).toBeNull();
    expect(document.body.textContent).not.toContain("the run failed before Stage 5");
  });

  it("the heading says the run failed, and no Evidence Flow is offered when nothing was sealed", () => {
    view({ read: failedRead() });
    expect($("h1")?.textContent).toMatch(/^Run failed/);
    expect($("[data-action='next-evidence']")).toBeNull();
  });

  it("a completed run still prints the percent and offers the next stage", () => {
    view();
    expect($("[data-progress-text]")?.textContent).toMatch(/trials · \d+%$/);
    expect($("[data-action='next-evidence']")).toBeTruthy();
  });
});

describe("S03 refused first read", () => {
  const refusal = { state: "unavailable", status: 503, notFound: false, mayRetry: true, message: "The Research service did not answer. Try again.", code: null, detail: null, requestId: null, closesStream: false } as never;
  const unavailable = { state: "unavailable" as const, reason: "The Research service did not answer. Try again.", mayRetry: true, retainsContent: false };

  it("offers a Retry that reads again, and leaves no skeleton, no forecast passport and no raw id behind", () => {
    const onRetry = vi.fn();
    view({ read: null, snapshot: null, refusal, state: unavailable, onRetry });
    fireEvent.click($("[data-action='retry']")!);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(document.querySelector("[aria-label='Loading']")).toBeNull();
    expect($("[data-research-panel='claim']")).toBeNull();
    expect($("[data-console-box]")).toBeNull();
    expect($("h1")?.textContent).toBe("Run progress");
    expect($("[data-action='next-evidence']")).toBeNull();
  });

  it("a denied read has no Retry (retrying cannot change the answer)", () => {
    view({
      read: null,
      snapshot: null,
      refusal: { ...(refusal as object), state: "denied", status: 403, mayRetry: false } as never,
      state: { state: "denied", reason: "no access", mayRetry: false, retainsContent: false },
      onRetry: vi.fn(),
    });
    expect($("[data-action='retry']")).toBeNull();
  });

  it("while nothing has answered yet it is still a loading skeleton, not a failure", () => {
    view({ read: null, snapshot: null, state: researchState({ kind: "in-flight", hasAcceptedResponse: false }) });
    expect(document.querySelector("[aria-label='Loading']")).toBeTruthy();
    expect($("[data-action='retry']")).toBeNull();
  });
});

describe("S03 console", () => {
  const consoleRefusal = { state: "unavailable", status: 503, mayRetry: true, message: "x", code: null, detail: null, requestId: null, notFound: false, closesStream: false } as never;

  it("an outage is 'did not load' with a Retry, never 'nothing was published'", () => {
    const onRetryConsole = vi.fn();
    view({ consoleRefusal, onRetryConsole });
    expect($("[data-console-empty]")?.textContent).toContain("The console did not load.");
    expect($("[data-console-empty]")?.textContent).not.toContain("No console observation has been published");
    fireEvent.click($("[data-action='retry-console']")!);
    expect(onRetryConsole).toHaveBeenCalledTimes(1);
  });

  it("without a refusal the published-nothing sentence stays (the other state)", () => {
    view({ read: { ...BASE, current: { ...BASE.current, effective_status: "COMPLETED", may_cancel: false } } as ProgressRead });
    expect($("[data-console-empty]")?.textContent).toBe("No console observation has been published for this run.");
  });

  it("hides the fold filter when no line carries a fold (a global study), and keeps it when one does", () => {
    view({ lines: [line(1, null), line(2, null)], foldCursor: 1 });
    expect($('[data-console-filter^="fold"]')).toBeNull();
    cleanup();
    view({ lines: [line(1, null), line(2, 1)], foldCursor: 1 });
    expect($('[data-console-filter="fold 1"]')).toBeTruthy();
  });

  it("an empty fold filter names the fold; an empty errors filter says there are none", () => {
    view({ lines: [line(1, 2), line(2, 2)], foldCursor: 1 });
    fireEvent.click($('[data-console-filter="fold 1"]')!);
    expect($("[data-console-empty]")?.textContent).toBe("No line for fold 1.");
    fireEvent.click($('[data-console-filter="errors"]')!);
    expect($("[data-console-empty]")?.textContent).toBe("No errors or warnings in this log.");
  });

  it("the '↓ latest' pill and the box frame use console tokens, so dark mode stays readable", () => {
    view({ lines: [line(1, 1)] });
    const box = $("[data-console-box]")!;
    expect(box.style.border).toContain("var(--console-faint)");
    fireEvent.click($("[data-console-follow]")!);
    const pill = $("[data-console-latest]");
    if (pill) {
      expect(pill.style.background).toContain("var(--console-bg)");
      expect(pill.style.color).toContain("var(--console-accent)");
    }
  });
});

describe("S03 labels and counts", () => {
  it("the Gantt header counts folds once, never '9 of 9 reported' over three rows", () => {
    expect(foldsMeta(9, 9)).toBe("9 folds");
    expect(foldsMeta(1, null)).toBe("1 fold");
    expect(foldsMeta(3, 9)).toBe("3 of 9 folds");
    expect(foldsMeta(0, 9)).toBe("0 of 9 folds");
  });

  it("compact cells carry an accessible name 'fold 1, done' and the 'one cell per fold' caption is a tooltip", () => {
    const read = structuredClone(BASE);
    read.progress = {
      ...read.progress!,
      folds: Array.from({ length: 9 }, (_, i) => ({ fold: i + 1, state: "DONE" as const, started_at_utc_ms: 1, completed_at_utc_ms: 2 })),
    };
    view({ read, foldCursor: 1 });
    expect($("[data-gantt-cells] [data-fold='1']")?.getAttribute("aria-label")).toBe("fold 1, done");
    expect(document.body.textContent).not.toContain("one cell per fold");
    expect($("[data-gantt-cells]")?.getAttribute("title")).toContain("One cell per fold");
  });

  it("the evidence cursor names the fold by its number, not 'fold fold_01'", () => {
    view({ foldCursor: 1 });
    expect($("[data-cursor-fold]")?.textContent).toBe("fold 1");
  });

  it("the artifacts card says the reader route is absent once, in its tooltip, and drops 'manifest preview'", () => {
    view();
    expect(document.body.textContent).not.toContain("reader route — not published");
    expect(document.body.textContent).not.toContain("manifest preview");
    expect($("[data-research-panel='artifacts'] h2")?.getAttribute("title")).toBe("reader route — not published");
  });

  it("a cancelled run before its source: label in the title, one statement of the fact, a compact button", () => {
    const read = {
      ...structuredClone(BASE),
      availability: "CANCELLED_BEFORE_SOURCE",
      progress: null,
      attempts: [],
      queue: undefined,
      run: { ...IDENTITY, display_label: "R-WFO-018" },
      current: { ...BASE.current, effective_status: "CANCELLED", terminal_resolution: "CONTROL_CANCELLATION", may_cancel: false, new_run_from: { state: "AVAILABLE", reason_code: null } },
    } as unknown as ProgressRead;
    view({ read, snapshot: null, transport: "closed" });
    expect($("h1")?.textContent).not.toMatch(/rrun_/);
    expect($("[data-terminal-resolution]")).toBeNull();
    // no stream indicator for a run that never had one
    expect($("[data-transport-state='never-opened']")).toBeNull();
    // a disclosure that would open onto nothing is not drawn
    expect($("[data-job-state]")).toBeNull();
    expect($("[data-action='new-run-from']")?.parentElement?.style.alignSelf).toBe("flex-start");
  });
});

describe("S03 hook — retry, console outage, history", () => {
  class FakeEventSource {
    close() {}
    addEventListener() {}
    onerror: unknown = null;
    onmessage: unknown = null;
  }
  let plan: (url: string) => [number, unknown];

  beforeEach(() => {
    vi.stubGlobal("EventSource", FakeEventSource as unknown as typeof EventSource);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const [status, payload] = plan(url);
        return {
          ok: status < 400,
          status,
          statusText: "",
          headers: { get: () => null },
          json: async () => payload,
        } as unknown as Response;
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/");
  });

  it("retry reads again and clears the refusal on success", async () => {
    let calls = 0;
    plan = (url) => {
      if (url.includes("/console?")) return [200, { lines: [] }];
      calls += 1;
      return calls === 1 ? [503, { error: { code: "X", message: "down" } }] : [200, BASE];
    };
    const { result } = renderHook(() => useRunProgress(RUN_ID));
    await waitFor(() => expect(result.current.refusal).not.toBeNull());
    expect(result.current.read).toBeNull();
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.read).not.toBeNull());
    expect(result.current.refusal).toBeNull();
    expect(result.current.retrying).toBe(false);
  });

  it("a console 503 is the console's own refusal: the snapshot stays good and no page-wide refusal is set; retryConsole reads again", async () => {
    let consoleCalls = 0;
    plan = (url) => {
      if (url.includes("/console?")) {
        consoleCalls += 1;
        return consoleCalls === 1 ? [503, { error: { code: "X", message: "down" } }] : [200, { lines: [] }];
      }
      return [200, { ...BASE, current: { ...BASE.current, effective_status: "COMPLETED", may_cancel: false } }];
    };
    const { result } = renderHook(() => useRunProgress(RUN_ID));
    await waitFor(() => expect(result.current.consoleRefusal).not.toBeNull());
    expect(result.current.refusal).toBeNull();
    expect(result.current.read).not.toBeNull();
    act(() => result.current.retryConsole());
    await waitFor(() => expect(result.current.consoleRefusal).toBeNull());
    expect(consoleCalls).toBe(2);
  });

  it("picking a fold on a final run pushes a history entry, and Back (popstate) restores the earlier fold", async () => {
    plan = (url) =>
      url.includes("/console?")
        ? [200, { lines: [] }]
        : [200, { ...BASE, current: { ...BASE.current, effective_status: "COMPLETED", may_cancel: false } }];
    window.history.replaceState(null, "", "/runs/x/progress#fold=1");
    const before = window.history.length;
    const { result } = renderHook(() => useRunProgress(RUN_ID));
    await waitFor(() => expect(result.current.read).not.toBeNull());
    act(() => result.current.pinFold(3));
    expect(window.location.hash).toBe("#fold=3");
    expect(window.history.length).toBe(before + 1);
    window.history.replaceState(null, "", "/runs/x/progress#fold=1");
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(result.current.foldCursor).toBe(1);
  });

  it("while the run is live a pick does not touch the address bar", async () => {
    plan = (url) => (url.includes("/console?") ? [200, { lines: [] }] : [200, BASE]);
    window.history.replaceState(null, "", "/runs/x/progress");
    const { result } = renderHook(() => useRunProgress(RUN_ID));
    await waitFor(() => expect(result.current.read).not.toBeNull());
    act(() => result.current.pinFold(2));
    expect(window.location.hash).toBe("");
  });
});
