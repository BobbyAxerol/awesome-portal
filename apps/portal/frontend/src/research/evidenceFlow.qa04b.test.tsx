/**
 * QA 2026-10-02 wave 2 — S04 Evidence Flow (hub).
 *  - U4: a failed lane read makes every lane fact "not read", never "not published"
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
  window.history.replaceState(null, "", "/");
});

const W3B = JSON.parse(readFileSync(join(process.cwd(), "src", "research", "w3bRealWfo.fixture.json"), "utf8")) as { hub_evidence: EvidenceHub };

function view(passport: PassportSlot, onReread = vi.fn()) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, headers: new Headers(), json: async () => ({}), text: async () => "" })));
  return render(
    <MemoryRouter initialEntries={["/research/quantbt/runs/R-WFO-118/evidence"]}>
      <EvidenceFlow
        runId="R-WFO-118"
        hub={W3B.hub_evidence}
        state={researchState({ kind: "ok", rowCount: 5 })}
        cursor={DEFAULT_CURSOR}
        onStage={vi.fn()}
        onFold={vi.fn()}
        onResetCursor={vi.fn()}
        series={new Map()}
        ensureSeries={vi.fn()}
        passport={passport}
        ensurePassport={vi.fn()}
        onReread={onReread}
      />
    </MemoryRouter>,
  );
}

const REFUSED: PassportSlot = {
  state: "refused",
  refusal: { code: "MOCK_500", message: "The Research service did not answer. Try again.", detail: null, status: 500, requestId: "req-1", state: "unavailable", mayRetry: true } as never,
};

describe("S04 U4 (wave 2) · body panels say not read while the lane read failed", () => {
  it("with the lane read refused no typed 'not published' remains; with it idle they do", () => {
    const idle = view({ state: "idle" });
    expect(idle.container.querySelectorAll('[data-withheld="NOT_PUBLISHED"]').length).toBeGreaterThan(0);
    cleanup();
    const { container } = view(REFUSED);
    expect(container.querySelectorAll('[data-withheld="NOT_PUBLISHED"]').length).toBe(0);
    expect(container.querySelectorAll('[data-withheld="NOT_READ"]').length).toBeGreaterThan(0);
    expect(container.textContent).not.toContain("published no sealed evidence");
  });

  it("a settled answer (the lane holds no such run, no retry) is not a failed read: typed absences stay", () => {
    const settled: PassportSlot = { state: "refused", refusal: { ...(REFUSED as { refusal: object }).refusal, status: 404, mayRetry: false } as never };
    const { container } = view(settled);
    expect(container.querySelectorAll('[data-withheld="NOT_PUBLISHED"]').length).toBeGreaterThan(0);
  });
});
