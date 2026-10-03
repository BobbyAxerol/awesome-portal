/**
 * W3b mobile contract for the Evidence Flow hub: the evidence cursor is a one-line summary that opens on
 * demand, and the tab strip holds only the seven stages (the "Promotion · soon" cell is outside the tablist).
 * The phone CSS that hides/shows these hooks is pinned in researchScreenMobile.w3b.test.ts. Bodies are the
 * canonical capture `w3bRealWfo.fixture.json`; nothing is hand-built.
 */
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EvidenceFlow } from "./EvidenceFlow";
import type { EvidenceHub } from "./evidenceClient";
import { DEFAULT_CURSOR } from "./evidenceCursor";
import { researchState } from "./state";

afterEach(cleanup);

const local = <T,>(name: string) => JSON.parse(readFileSync(join(process.cwd(), "src", "research", name), "utf8")) as T;
const W3B = local<{ hub_evidence: EvidenceHub }>("w3bRealWfo.fixture.json");
const OK = researchState({ kind: "ok", rowCount: 5 });

function view(overrides: Partial<React.ComponentProps<typeof EvidenceFlow>> = {}) {
  return render(
    <MemoryRouter>
      <EvidenceFlow
        runId="R-WFO-118"
        hub={W3B.hub_evidence}
        state={OK}
        cursor={DEFAULT_CURSOR}
        onStage={vi.fn()}
        onFold={vi.fn()}
        onResetCursor={vi.fn()}
        series={new Map()}
        ensureSeries={vi.fn()}
        passport={{ state: "idle" }}
        ensurePassport={vi.fn()}
        onReread={vi.fn()}
        {...overrides}
      />
    </MemoryRouter>,
  );
}

describe("W3b Evidence Flow hub — mobile hooks", () => {
  it("the cursor bar starts collapsed with a summary line of the served cursor", () => {
    const { container } = view({ cursor: { ...DEFAULT_CURSOR, fold: 3, trial: 351 } });
    const bar = container.querySelector("[data-cursor-bar]") as HTMLElement;
    expect(bar.getAttribute("data-collapsed")).toBe("true");
    const toggle = bar.querySelector("[data-cursor-toggle]") as HTMLButtonElement;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.querySelector("[data-cursor-summary]")?.textContent).toBe("fold 3 · trial 351 · window OOS");
  });

  it("the toggle opens and closes the bar", () => {
    const { container } = view();
    const bar = container.querySelector("[data-cursor-bar]") as HTMLElement;
    const toggle = bar.querySelector("[data-cursor-toggle]") as HTMLButtonElement;
    fireEvent.click(toggle);
    expect(bar.getAttribute("data-collapsed")).toBe("false");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle);
    expect(bar.getAttribute("data-collapsed")).toBe("true");
  });

  it("the summary never invents a trial: none served, none printed beyond the lane's own", () => {
    const { container } = view({ cursor: { ...DEFAULT_CURSOR, fold: 2, trial: null } });
    const text = container.querySelector("[data-cursor-summary]")?.textContent ?? "";
    expect(text.startsWith("fold 2")).toBe(true);
    expect(text).toMatch(/window (OOS|IS|Holdout)$/);
  });

  it("the Promotion cell is not part of the tablist", () => {
    const { container } = view();
    const list = container.querySelector("[role='tablist']") as HTMLElement;
    expect(within(list).queryByText(/promotion/i)).toBeNull();
    /* W4B: the hard-coded "Promotion SOON" cell is gone from the strip altogether. */
    expect(container.querySelector("[data-promotion-soon]")).toBeNull();
    expect(list.querySelectorAll("[role='tab']").length).toBe(7);
  });
});
