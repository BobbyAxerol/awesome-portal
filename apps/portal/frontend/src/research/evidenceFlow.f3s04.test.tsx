/**
 * F3 — Screen 04 Evidence Flow: HiFi parity (S04 group).
 *  - AN-18: no rolling 20-observation figure, no series request for it
 *  - 04-H: the Split tab's subtitle carries the served fold count
 *  - 04-G: the claim strip's engine note stacks below the fields under md, side column from md
 *  - 04-S: the monthly row does not stretch its card over blank space
 */
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EvidenceFlow, RETAINED_PANEL_KINDS } from "./EvidenceFlow";
import type { EvidenceHub } from "./evidenceClient";
import { DEFAULT_CURSOR } from "./evidenceCursor";
import { researchState } from "./state";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

const W3B = JSON.parse(readFileSync(join(process.cwd(), "src", "research", "w3bRealWfo.fixture.json"), "utf8")) as { hub_evidence: EvidenceHub };

function view(hub: EvidenceHub, ensureSeries = vi.fn()) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, headers: new Headers(), json: async () => ({}), text: async () => "" })));
  return render(
    <MemoryRouter initialEntries={["/research/quantbt/runs/R-WFO-118/evidence"]}>
      <EvidenceFlow
        runId="R-WFO-118"
        hub={hub}
        state={researchState({ kind: "ok", rowCount: 5 })}
        cursor={DEFAULT_CURSOR}
        onStage={vi.fn()}
        onFold={vi.fn()}
        onResetCursor={vi.fn()}
        series={new Map()}
        ensureSeries={ensureSeries}
        passport={{ state: "idle" }}
        ensurePassport={vi.fn()}
        onReread={vi.fn()}
      />
    </MemoryRouter>,
  );
}

describe("F3 · S04", () => {
  it("AN-18: the rolling 20-observation panel and its series request are gone", () => {
    expect([...RETAINED_PANEL_KINDS]).not.toContain("ROLLING_RETURNS_20");
    const ensure = vi.fn();
    const { container } = view(W3B.hub_evidence, ensure);
    expect(container.querySelector("[data-series-panel='ROLLING_RETURNS_20']")).toBeNull();
    expect(ensure).not.toHaveBeenCalledWith("ROLLING_RETURNS_20");
  });

  it("04-H (W4B): the Split tab subtitle is the stage's state alone; the fold count is the summary card's", () => {
    const { container } = view(W3B.hub_evidence);
    expect(container.querySelector("[data-tab='split'] [data-tab-sub]")?.textContent).toBe("done");
  });

  it("04-H (W4B): with no fold count served the subtitle is still the state alone, and invents no seal", () => {
    const hub = { ...W3B.hub_evidence, core: { ...W3B.hub_evidence.core, fold_navigation: undefined } } as unknown as EvidenceHub;
    const { container } = view(hub);
    const sub = container.querySelector("[data-tab='split'] [data-tab-sub]")?.textContent ?? "";
    expect(sub).toBe("done");
    expect(sub).not.toMatch(/holdout|sealed/i);
  });

  it("04-G: the claim strip stacks under md and puts the note beside the fields from md", () => {
    const { container } = view(W3B.hub_evidence);
    const strip = container.querySelector("[data-claim-passport]") as HTMLElement;
    expect(strip.className).toContain("flex-col");
    expect(strip.className).toContain("md:flex-row");
    const note = container.querySelector("[data-passport-note]") as HTMLElement;
    expect(note.className).not.toMatch(/(^|\s)hidden(\s|$)/);
    expect(note.className).not.toContain("sm:flex");
    expect(note.className).toContain("md:border-l");
  });

  it("04-S: the monthly row aligns its cards to the top so an empty card is not stretched", () => {
    const { container } = view(W3B.hub_evidence);
    expect(container.querySelector("[data-monthly-row]")?.className).toContain("items-start");
  });
});
