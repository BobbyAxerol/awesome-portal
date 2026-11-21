/**
 * QA 2026-10-02 wave 2 — S04 U9: one state for the holdout fact on a run the retained lane does not hold.
 */
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EvidenceFlow } from "./EvidenceFlow";
import type { EvidenceHub } from "./evidenceClient";
import { DEFAULT_CURSOR } from "./evidenceCursor";
import { researchState } from "./state";
import type { PassportSlot } from "./useEvidence";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const W3B = JSON.parse(readFileSync(join(process.cwd(), "src", "research", "w3bRealWfo.fixture.json"), "utf8")) as { hub_evidence: EvidenceHub };

describe("S04 U9", () => {
  it("the window table says `not published`, like the header, never `not applicable`", () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, headers: new Headers(), json: async () => ({}), text: async () => "" })));
    const passport = {
      state: "not-applicable",
      answer: { availability: { state: "NOT_APPLICABLE", reason_code: "P13_LANE_NOT_RETAINED" }, lane: { reason_code: "P13_LANE_NOT_RETAINED" } },
    } as unknown as PassportSlot;
    const { container } = render(
      <MemoryRouter initialEntries={["/research/quantbt/runs/R-P04-021/evidence"]}>
        <EvidenceFlow
          runId="R-P04-021"
          hub={W3B.hub_evidence}
          state={researchState({ kind: "ok", rowCount: 5 })}
          cursor={{ ...DEFAULT_CURSOR, stage: "claim" }}
          onStage={vi.fn()}
          onFold={vi.fn()}
          onResetCursor={vi.fn()}
          series={new Map()}
          ensureSeries={vi.fn()}
          passport={passport}
          ensurePassport={vi.fn()}
          onReread={vi.fn()}
        />
      </MemoryRouter>,
    );
    const row = container.querySelector("[data-window-row='Holdout']") as HTMLElement;
    expect(row).toBeTruthy();
    const cell = row.querySelector("[data-withheld]") as HTMLElement;
    expect(cell.getAttribute("data-withheld")).toBe("NOT_PUBLISHED");
    expect(cell.textContent).toBe("holdout — not published");
  });

  it("U8: the verdict header does not repeat the absence the table already states", () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, headers: new Headers(), json: async () => ({}), text: async () => "" })));
    const mount = (hub: EvidenceHub) =>
      render(
        <MemoryRouter initialEntries={["/research/quantbt/runs/R-P04-021/evidence"]}>
          <EvidenceFlow
            runId="R-P04-021"
            hub={hub}
            state={researchState({ kind: "ok", rowCount: 5 })}
            cursor={DEFAULT_CURSOR}
            onStage={vi.fn()}
            onFold={vi.fn()}
            onResetCursor={vi.fn()}
            series={new Map()}
            ensureSeries={vi.fn()}
            passport={{ state: "idle" }}
            ensurePassport={vi.fn()}
            onReread={vi.fn()}
          />
        </MemoryRouter>,
      );
    const before = mount(W3B.hub_evidence);
    expect(before.container.querySelector("[data-verdict-summary]")?.textContent).toContain("OOS Sharpe not published");
    cleanup();
    const hub = {
      ...W3B.hub_evidence,
      source_absences: { ...W3B.hub_evidence.source_absences, per_fold_metrics: { state: "NOT_APPLICABLE", reason_code: "P13_X" } },
    } as unknown as EvidenceHub;
    const { container } = mount(hub);
    const text = container.querySelector("[data-verdict-summary]")?.textContent ?? "";
    expect(text).toMatch(/observed folds?/);
    expect(text).not.toContain("Sharpe");
    expect(text).not.toContain("decay");
    expect(container.textContent).toContain("per-fold metrics — not applicable");
  });
});
