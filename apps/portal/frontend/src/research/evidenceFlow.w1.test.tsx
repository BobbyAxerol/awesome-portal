/**
 * W1 · G2 — Screen 04 hub, run lifecycle.
 *
 * Data is derived (see runStates.fixture.ts): the canonical WFO hub with only
 * `lifecycle` and `stages[]` overridden. Asserts hooks and words from the
 * §1.1 table, not copy written for the test.
 *
 *  B1  a FAILED / CANCELLED run never prints RUNNING on the stage that was running
 *  W1  one-line banner (long sentence in the tooltip), exits, no metric wall
 *  B3  report / candidate links carry the cursor and window
 */
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EvidenceFlow, hubPhase } from "./EvidenceFlow";
import { DEFAULT_CURSOR, type EvidenceCursor } from "./evidenceCursor";
import { researchState } from "./state";
import { hubFor, type HubPhase } from "./runStates.fixture";

afterEach(cleanup);

const OK = researchState({ kind: "ok", rowCount: 5 });
const RUN = "rrun_00000000000000000000000000000001";

function view(phase: HubPhase, cursor: EvidenceCursor = DEFAULT_CURSOR, extra: { notFound?: boolean } = {}) {
  const ensurePassport = vi.fn();
  const utils = render(
    <MemoryRouter initialEntries={[`/research/quantbt/runs/${RUN}/evidence`]}>
      <EvidenceFlow
        runId={RUN}
        hub={extra.notFound ? null : hubFor(phase)}
        state={OK}
        notFound={extra.notFound}
        cursor={cursor}
        onStage={vi.fn()}
        onFold={vi.fn()}
        onResetCursor={vi.fn()}
        series={new Map()}
        ensureSeries={vi.fn()}
        passport={{ state: "idle" }}
        ensurePassport={ensurePassport}
        onReread={vi.fn()}
      />
    </MemoryRouter>,
  );
  return { ...utils, ensurePassport };
}

const sub = (c: HTMLElement, stage: string) => c.querySelector(`[data-tab='${stage}'] [data-tab-sub]`)?.textContent ?? "";
const dot = (c: HTMLElement, stage: string) => c.querySelector(`[data-tab='${stage}'] [data-stage-dot]`)?.getAttribute("data-stage-dot");

describe("W1-hub B1 — stage chip follows the run's lifecycle", () => {
  it("FAILED: the stage that was RUNNING reads failed, later stages not run, done stays done", () => {
    const { container } = view("failed");
    expect(container.querySelector("[data-run-phase]")?.getAttribute("data-run-phase")).toBe("failed");
    expect(sub(container, "execute")).toBe("failed");
    expect(dot(container, "execute")).toBe("failed");
    expect(sub(container, "claim")).not.toMatch(/running/i);
    expect(dot(container, "split")).toBe("done");
    expect(container.textContent).not.toMatch(/\bRUNNING\b/);
  });

  it("CANCELLED: the running stage reads cancelled", () => {
    const { container } = view("cancelled");
    expect(sub(container, "execute")).toBe("cancelled");
    expect(dot(container, "execute")).toBe("cancelled");
  });

  it("RUNNING keeps the genuine running chip", () => {
    const { container } = view("running");
    expect(dot(container, "execute")).toBe("running");
  });

  it("hubPhase reads the lifecycle's terminal outcome", () => {
    expect(hubPhase(hubFor("failed"))).toBe("failed");
    expect(hubPhase(hubFor("cancelled"))).toBe("cancelled");
    expect(hubPhase(hubFor("running"))).toBe("running");
    expect(hubPhase(hubFor("completed"))).toBe("completed");
    expect(hubPhase(null)).toBeNull();
  });
});

describe("W1-hub — one line, exits, no wall", () => {
  it("FAILED: banner is one short line; the sentence rides in the tooltip; exits Progress, New run, Library", () => {
    const { container } = view("failed");
    const notice = container.querySelector("[data-not-ready]") as HTMLElement;
    expect(notice.querySelector("[data-seal-sentence]")?.textContent).toBe("Failed.");
    expect(notice.getAttribute("title")).toMatch(/before sealing evidence/);
    expect(notice.querySelector("[data-action='open-progress-record']")?.getAttribute("href")).toContain("/progress");
    expect(notice.querySelector("[data-action='new-run']")?.getAttribute("href")).toContain("from=");
    expect(notice.querySelector("[data-action='open-runs']")?.getAttribute("href")).toBe("/research/quantbt/runs");
  });

  it("CANCELLED: Cancelled. with Library first, then New run; the passport is not asked (no 409)", () => {
    const { container, ensurePassport } = view("cancelled");
    const notice = container.querySelector("[data-not-ready]") as HTMLElement;
    expect(notice.querySelector("[data-seal-sentence]")?.textContent).toBe("Cancelled.");
    expect([...notice.querySelectorAll("a")].map((a) => a.getAttribute("data-action"))).toEqual(["open-runs", "new-run"]);
    expect(ensurePassport).not.toHaveBeenCalled();
  });

  it("QUEUED and RUNNING: Queued. / Running. with Progress", () => {
    for (const [phase, word] of [["queued", "Queued."], ["running", "Running."]] as const) {
      const { container, unmount } = view(phase);
      expect(container.querySelector("[data-seal-sentence]")?.textContent).toBe(word);
      expect(container.querySelector("[data-action='watch-progress']")).toBeTruthy();
      unmount();
    }
  });

  it("FAILED: no metric wall in the summary panel", () => {
    const { container } = view("failed");
    expect(container.querySelector("[data-panel-kept='summary'] [data-metric]")).toBeNull();
    expect(container.querySelector("[data-passport]")).toBeNull();
  });

  it("not found: one Run not available. line, only Library, no tabs", () => {
    const { container } = view("completed", DEFAULT_CURSOR, { notFound: true });
    expect(container.querySelector("[data-run-not-found]")).toBeTruthy();
    expect(container.querySelector("[data-run-exit-bar] [data-run-phase='unavailable']")?.textContent).toBe("Run not available.");
    expect([...container.querySelectorAll("[data-exit]")].map((a) => a.getAttribute("data-exit"))).toEqual(["library"]);
    expect(container.querySelector("[role='tab']")).toBeNull();
  });
});

describe("W1-hub B3 — links carry the cursor", () => {
  const cursor: EvidenceCursor = { ...DEFAULT_CURSOR, stage: "claim", fold: 4, trial: 351 };

  it("report and promotion links in the way-out nav keep fold and trial, with the stage forced to claim", () => {
    const { container } = view("completed", cursor);
    const nav = container.querySelector("[data-deep-dives]") as HTMLElement;
    const report = nav.querySelector("[data-nav-stage='report']")?.getAttribute("href") ?? "";
    expect(report).toContain("/report#");
    expect(report).toContain("fold=4");
    expect(report).toContain("trial=351");
    const rc = [...nav.querySelectorAll("a")].find((a) => a.getAttribute("href")?.includes("/release-candidate"))?.getAttribute("href") ?? "";
    expect(rc).toContain("fold=4");
  });

  it("the claim tab's next links keep the cursor", () => {
    const { container } = view("completed", cursor);
    const report = container.querySelector("[data-action='generate-report']")?.getAttribute("href") ?? "";
    expect(report).toContain("fold=4");
    expect(container.querySelector("[data-action='release-candidate']")?.getAttribute("href") ?? "").toContain("fold=4");
    expect(container.querySelector("[data-stage-next='report']")?.getAttribute("href") ?? "").toContain("fold=4");
  });
});

describe("W1-hub trial label", () => {
  it("the trial pill prints `trial 351`, never a hash prefix", () => {
    const { container } = view("completed", { ...DEFAULT_CURSOR, trial: 351 });
    const pill = container.querySelector("[data-cursor-trial]")?.textContent ?? "";
    expect(pill).toContain("trial 351");
    expect(pill).not.toMatch(/[#]\d/);
  });
});
