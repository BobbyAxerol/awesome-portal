/**
 * W4B — Screen 04 hub: the tab is the summary, the deep dive is the full body.
 *
 * Test data is derived: the canonical WFO hub and progress read from `runStates.fixture.ts`
 * (readFileSync of repo fixtures, only lifecycle / stages overridden). Words asserted are the
 * ones the hub prints; nothing is hand-written copy.
 */
import { act, cleanup, render, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EvidenceFlow } from "./EvidenceFlow";
import { DEFAULT_CURSOR, forgetObservedFolds, useEvidenceCursor, type EvidenceCursor } from "./evidenceCursor";
import { stageFacts, selectionOf } from "./hubStageSummary";
import { researchState } from "./state";
import { hubFor, progressFor, type HubPhase } from "./runStates.fixture";
import type { ProgressRead } from "./progressClient";

afterEach(() => {
  cleanup();
  forgetObservedFolds();
  window.history.replaceState(null, "", "/");
});

const OK = researchState({ kind: "ok", rowCount: 5 });
const RUN = "rrun_00000000000000000000000000000001";

function view(phase: HubPhase, cursor: EvidenceCursor = DEFAULT_CURSOR, runIdentity?: unknown) {
  return render(
    <MemoryRouter initialEntries={[`/research/quantbt/runs/${RUN}/evidence`]}>
      <EvidenceFlow
        runId={RUN}
        hub={hubFor(phase)}
        state={OK}
        cursor={cursor}
        onStage={vi.fn()}
        onFold={vi.fn()}
        onResetCursor={vi.fn()}
        series={new Map()}
        ensureSeries={vi.fn()}
        passport={{ state: "idle" }}
        ensurePassport={vi.fn()}
        onReread={vi.fn()}
        {...(runIdentity ? { runIdentity: runIdentity as never } : {})}
      />
    </MemoryRouter>,
  );
}

const tabs = (c: HTMLElement) => [...c.querySelectorAll("[role='tab']")].map((tab) => tab.getAttribute("data-tab"));

describe("W4B — a run with nothing sealed is one status panel", () => {
  it("QUEUED: the notice and its exit, no tab, no claim passport, no cursor bar, no body", () => {
    const { container } = view("queued");
    expect(container.querySelector("[data-not-ready]")).toBeTruthy();
    expect(container.querySelector("[data-action='watch-progress']")).toBeTruthy();
    expect(tabs(container)).toEqual([]);
    expect(container.querySelector("[data-claim-passport]")).toBeNull();
    expect(container.querySelector("[data-cursor-bar]")).toBeNull();
    expect(container.querySelector("[data-panel]")).toBeNull();
    expect(container.querySelector("[data-stage-nav]")).toBeNull();
    expect(container.textContent).not.toMatch(/pending source|not published/);
  });

  it("FAILED: tabs only for the stages that started, each a summary card; Summary, Claim and Atlas are not tabs", () => {
    const { container } = view("failed", { ...DEFAULT_CURSOR, stage: "execute" });
    expect(tabs(container)).toEqual(["split", "search", "freeze", "execute"]);
    expect(container.querySelector("[data-claim-passport]")).toBeNull();
    expect(container.querySelector("[data-cursor-bar]")).toBeNull();
    expect(container.querySelector("[data-hub-stage-summary='execute'] [data-stage-state]")?.getAttribute("data-stage-state")).toBe("failed");
    expect(container.querySelector("[data-panel-kept='summary']")).toBeNull();
  });

  it("FAILED: a cursor naming Summary shows the first stage that started, without rewriting the cursor", () => {
    const { container } = view("failed", DEFAULT_CURSOR);
    expect(container.querySelector("[data-panel='split']")).toBeTruthy();
    expect(container.querySelector("[data-tab='split']")?.getAttribute("aria-selected")).toBe("true");
  });

  it("every state of the hub has one h1 and it names the run", () => {
    for (const phase of ["queued", "failed", "cancelled", "completed"] as const) {
      const { container, unmount } = view(phase);
      expect(container.querySelectorAll("h1"), phase).toHaveLength(1);
      expect(container.querySelector("h1")?.textContent, phase).toMatch(/^Evidence flow · run /);
      unmount();
    }
  });
});

describe("W4B — each stage tab is one summary card", () => {
  it.each([
    ["split", "Open S5 Split →", "split"],
    ["search", "Open S6 Search →", "search"],
    ["freeze", "Open S7 Freeze →", "freeze"],
    ["execute", "Open S8 Execute →", "execute"],
  ] as const)("%s: a chip, facts and a primary button that carries the cursor", (stage, label, path) => {
    const { container } = view("completed", { ...DEFAULT_CURSOR, stage, fold: 2 });
    const card = container.querySelector(`[data-hub-stage-summary='${stage}']`) as HTMLElement;
    expect(card).toBeTruthy();
    expect(card.querySelector("[data-stage-state]")?.getAttribute("data-stage-state")).toBe("done");
    const link = card.querySelector("a[data-deep-dive]") as HTMLAnchorElement;
    expect(link.textContent).toBe(label);
    expect(link.getAttribute("href")).toContain(`/runs/${RUN}/${path}#`);
    expect(link.getAttribute("href")).toContain("fold=2");
    /* nothing of the deep dive is embedded, and the card makes no request of its own */
    expect(container.querySelector("[data-hub-stage-body]")).toBeNull();
    expect(container.querySelectorAll("table").length).toBe(0);
  });

  it("split: the published fold count and the cursor fold's window bars come from the hub", () => {
    const hub = hubFor("completed");
    const { container } = view("completed", { ...DEFAULT_CURSOR, stage: "split", fold: 1 });
    const facts = stageFacts("split", hub, { ...DEFAULT_CURSOR, stage: "split", fold: 1 }, null, null);
    const count = hub.core.fold_navigation?.published_fold_count;
    expect(facts.find((fact) => fact.id === "folds")?.value.startsWith(String(count))).toBe(true);
    expect(container.querySelector("[data-stage-fact='folds']")).toBeTruthy();
  });

  it("a fact the reads did not serve is not printed, and a card with none says so once", () => {
    const hub = { ...hubFor("completed"), core: { ...hubFor("completed").core, fold_navigation: undefined, window_disclosure: undefined, dataset_coverage: undefined } } as never;
    expect(stageFacts("split", hub, DEFAULT_CURSOR, null, null)).toEqual([]);
    expect(stageFacts("search", hub, DEFAULT_CURSOR, null, null)).toEqual([]);
  });
});

describe("W4B — facts from the progress read", () => {
  const withSelection = (read: ProgressRead, fold: number, sel: Record<string, unknown>): ProgressRead => {
    const next = structuredClone(read);
    const snapshot = next.progress as unknown as { folds: { fold: number; selection?: unknown }[]; claim: Record<string, unknown>; overall: Record<string, unknown> };
    snapshot.folds = [{ ...(snapshot.folds[0] ?? { state: "DONE", started_at_utc_ms: null, completed_at_utc_ms: null }), fold, selection: { state: "AVAILABLE", ...sel } } as never];
    return next;
  };
  const base = progressFor("COMPLETED");

  it("search: trials evaluated of declared, and the selected trial as `trial N · source M` where both are served", () => {
    const read = withSelection(base, 1, { scope: "GLOBAL_STUDY", trial: 351, source_trial_id: "350", params_digest: "a".repeat(64), objective: null });
    (read.progress as unknown as { overall: Record<string, unknown> }).overall = { ...(read.progress as unknown as { overall: object }).overall, trials_done: 400, trials_declared: 400 };
    const facts = stageFacts("search", hubFor("completed"), DEFAULT_CURSOR, read, null);
    expect(facts.find((fact) => fact.id === "trials")?.value).toBe("400 of 400");
    expect(facts.find((fact) => fact.id === "selected")?.value).toBe("trial 351 · source 350");
  });

  it("freeze: the frozen candidate is the short digest, the whole one in the tooltip", () => {
    const digest = "b".repeat(64);
    const read = withSelection(base, 1, { scope: "GLOBAL_STUDY", trial: 3, params_digest: digest, objective: null });
    const fact = stageFacts("freeze", hubFor("completed"), DEFAULT_CURSOR, read, null).find((entry) => entry.id === "candidate");
    expect(fact?.value).toBe("bbbbbbbb");
    expect(fact?.title).toContain(digest);
  });

  it("the selection falls back to the retained lane's global one, then to the hand-off cursor that names this fold", () => {
    const empty = structuredClone(base);
    (empty.progress as unknown as { folds: unknown[]; claim: Record<string, unknown> }).folds = [];
    expect(selectionOf(empty, DEFAULT_CURSOR, { trial: 7, sourceId: 6, paramsDigest: "c".repeat(64) })?.trial).toBe(7);
    (empty.progress as unknown as { claim: Record<string, unknown> }).claim = { ...(empty.progress as unknown as { claim: object }).claim, handoff_cursor: { fold: 1, trial: 9, params_digest: "d".repeat(64) } };
    expect(selectionOf(empty, DEFAULT_CURSOR, null)?.trial).toBe(9);
    expect(selectionOf(empty, { ...DEFAULT_CURSOR, fold: 2 }, null)).toBeNull();
  });
});

describe("W4B — the Atlas tab is a summary and a link", () => {
  it("does not embed the Engine Atlas", () => {
    const { container } = view("completed", { ...DEFAULT_CURSOR, stage: "atlas" });
    const card = container.querySelector("[data-hub-stage-summary='atlas']") as HTMLElement;
    expect(card).toBeTruthy();
    expect(card.querySelector("[data-action='open-atlas']")?.textContent).toBe("Open S12 Atlas →");
    expect(card.querySelector("[data-action='open-atlas']")?.getAttribute("href")).toContain("/research/quantbt/atlas#");
    expect(container.querySelector("[data-hub-stage-body='atlas']")).toBeNull();
  });
});

describe("W4B — the shell is short", () => {
  it("the claim fields the lane never publishes are one count; the real fields stay", () => {
    const { container } = view("completed");
    expect(container.querySelectorAll("[data-claim-field]").length).toBeLessThanOrEqual(3);
    expect(container.querySelector("[data-claim-absent]")?.textContent).toMatch(/^\d+ not published$/);
  });

  it("no raw enum token in the passport and no Promotion cell in the strip", () => {
    const { container } = view("completed");
    expect(container.querySelector("[data-claim-passport]")?.textContent).not.toMatch(/NOT_ISSUED|COMPLETE|[a-z]+_[a-z]+/);
    expect(container.querySelector("[data-promotion-soon]")).toBeNull();
  });

  it("the tabs carry one word at most (the stage's state)", () => {
    const { container } = view("completed");
    expect([...container.querySelectorAll("[data-tab-sub]")].map((node) => node.textContent)).toEqual(["done", "done", "done", "done"]);
  });
});

describe("W4B — reset to θ* returns to the cursor the screen was entered with", () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={["/research/quantbt/runs/rrun_a/evidence"]}>
      <Routes>
        <Route path="/research/quantbt/runs/:runId/evidence" element={children} />
      </Routes>
    </MemoryRouter>
  );

  it("fold 9 / trial 351 from the Progress hand-off, not fold 1; the tab the reader is on is kept", () => {
    const params = "e".repeat(64);
    window.history.replaceState(null, "", `/x#stage=summary&fold=9&trial=351&params=${params}`);
    const { result } = renderHook(() => useEvidenceCursor(), { wrapper });
    expect(result.current.cursor.fold).toBe(9);
    act(() => result.current.setStage("search"));
    act(() => result.current.setFold(2));
    expect(result.current.cursor.fold).toBe(2);
    act(() => result.current.reset());
    expect(result.current.cursor.fold).toBe(9);
    expect(result.current.cursor.trial).toBe(351);
    expect(result.current.cursor.stage).toBe("search");
  });

  it("entered with no cursor, reset is the default fold", () => {
    window.history.replaceState(null, "", "/x");
    const { result } = renderHook(() => useEvidenceCursor(), { wrapper });
    act(() => result.current.setFold(4));
    act(() => result.current.reset());
    expect(result.current.cursor.fold).toBe(DEFAULT_CURSOR.fold);
  });
});
