/**
 * QA 2026-10-02 — S04 Evidence Flow (hub): states and words.
 *  - U4: a failed read of the sealed evidence is an error with a retry, never "not published"
 *  - U14: the cursor's window pill is a word, not the raw token
 *  - tab sub-line / EChart tags / claim read-out words
 */
import { cleanup, fireEvent, render } from "@testing-library/react";
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

describe("S04 U4 · a failed read is not 'not published'", () => {
  it("shows an error with a read-again action and no 'projection is not published' sentence", () => {
    const onReread = vi.fn();
    const { container } = view(REFUSED, onReread);
    const error = container.querySelector("[data-passport-error]") as HTMLElement;
    expect(error).toBeTruthy();
    expect(error.textContent).toContain("could not be read");
    expect(container.textContent).not.toContain("evidence projection is not published");
    fireEvent.click(container.querySelector("[data-action='reread-passport']") as Element);
    expect(onReread).toHaveBeenCalledTimes(1);
  });

  it("a read that answered shows no error card", () => {
    const { container } = view({ state: "idle" });
    expect(container.querySelector("[data-passport-error]")).toBeNull();
  });

  it("a refusal that cannot be retried offers no retry", () => {
    const { container } = view({ state: "refused", refusal: { ...(REFUSED as { refusal: object }).refusal, mayRetry: false } as never });
    expect(container.querySelector("[data-passport-error]")).toBeTruthy();
    expect(container.querySelector("[data-action='reread-passport']")).toBeNull();
  });
});

describe("S04 · words on the hub", () => {
  it("the Summary tab names its window; the counts ride in the tooltip", () => {
    const { container } = view({ state: "idle" });
    const tab = container.querySelector("[data-tab='summary']") as HTMLElement;
    expect(tab.querySelector("[data-tab-sub]")?.textContent).toBe("OOS");
    expect(tab.getAttribute("title")).toMatch(/\d+ of \d+ metrics · \d+ series/);
  });

  it("no figure carries an 'EChart n' tag", () => {
    const { container } = view({ state: "idle" });
    expect(container.querySelector("[data-chart-no]")).toBeNull();
    expect(container.textContent).not.toMatch(/EChart \d/);
  });

  it("the cursor's window pill reads OOS, not the raw token", () => {
    const { container } = view({ state: "idle" });
    expect(container.querySelector("[data-cursor-window]")?.textContent).toBe("window OOS");
  });
});
