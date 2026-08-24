/**
 * Paper Workbench tests (phase 4).
 *
 * The screen exists to exit Paper, so most of what follows is about the gate:
 * whether it is reachable, whether it says what is unmet, and whether a stale
 * projection can be mistaken for a live one.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PaperWorkbench, WORKBENCH_TABS } from "./screens/PaperWorkbench";
import { GATE_MET, STALE, ordersAtScale, paperWorkbench, sessionsAtScale } from "./paper.fixtures";
import { paperHandlers } from "./testHandlers";

afterEach(cleanup);

describe("Paper Workbench — the screen exists to exit Paper", () => {
  it("puts the observation gate beside the equity chart, not below it", () => {
    // The wireframe is explicit, and the reason is the screen's purpose: a
    // reader who has to scroll to find how far along they are will read the
    // chart instead and guess.
    // EL-V2-04: the gate lives in the context rail ("Next: Paper Exit Review")
    // beside the chart canvas, and both are on the first screen at 1440×900
    // (asserted in e2e/execution-journeys.spec.ts).
    render(<PaperWorkbench {...paperHandlers()} {...paperWorkbench()} />);
    expect(screen.getByText(/Next: Paper Exit Review/)).toBeTruthy();
    expect(screen.getByLabelText("Equity vs approved research evidence")).toBeTruthy();
  });

  it("names every unmet criterion rather than counting them", () => {
    // "Blocked" is a support ticket. "18 more days of observation" is an
    // instruction.
    render(<PaperWorkbench {...paperHandlers()} {...paperWorkbench()} />);
    expect(screen.getByRole("button", { name: /Request Paper Exit Review/ })).toHaveProperty(
      "disabled",
      true,
    );
    // Named twice on purpose: the observation progress and the Blockers rail.
    expect(screen.getAllByText(/18 more days of observation/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/116 more trades/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/1 more clean restart cycle/).length).toBeGreaterThanOrEqual(1);
  });

  it("opens the exit once the gate is met", () => {
    const onRequestExit = vi.fn();
    render(<PaperWorkbench {...paperHandlers()} {...paperWorkbench(GATE_MET)} onRequestExit={onRequestExit} />);
    const cta = screen.getByRole("button", { name: /Request Paper Exit Review/ });
    expect(cta).toHaveProperty("disabled", false);
    cta.click();
    expect(onRequestExit).toHaveBeenCalledOnce();
  });

  it("never enables the exit on elapsed time alone", () => {
    // The policy line says it and the component must mean it: days can be met
    // while trades are not, and promotion is the conjunction.
    render(
      <PaperWorkbench {...paperHandlers()}
        {...paperWorkbench({
          observation: {
            items: [
              { label: "days observed", current: 30, target: 30, unit: "days" },
              { label: "trades", current: 184, target: 300, unit: "trades" },
            ],
            met: false,
          },
          unmetCriteria: ["116 more trades (184 of 300)"],
        })}
      />,
    );
    expect(screen.getByRole("button", { name: /Request Paper Exit Review/ })).toHaveProperty(
      "disabled",
      true,
    );
  });
});

describe("Paper Workbench — a stale projection cannot pass for a live one", () => {
  it("keeps the last good values and says they are the last good ones", () => {
    // Not a spinner and not a blank: an operator can act on a number they know
    // is old, and cannot act on nothing.
    render(<PaperWorkbench {...paperHandlers()} {...paperWorkbench(STALE)} />);
    expect(screen.getByText(/Projection stale/)).toBeTruthy();
    expect(screen.getByText(/last good ones/)).toBeTruthy();
    expect(screen.getByText("51,842.18")).toBeTruthy();
  });

  it("says risk fails closed in the Execution cell, so nobody reads it as permissive", () => {
    render(<PaperWorkbench {...paperHandlers()} {...paperWorkbench(STALE)} />);
    expect(screen.getByText(/Orders remain authoritative in the Execution cell/)).toBeTruthy();
    expect(screen.getByText(/fails closed/)).toBeTruthy();
  });

  it("shows no stale banner when the projection is fresh", () => {
    render(<PaperWorkbench {...paperHandlers()} {...paperWorkbench()} />);
    expect(screen.queryByText(/Projection stale/)).toBeNull();
  });
});

describe("Paper Workbench — lineage, drift and mutation controls", () => {
  it("renders every lineage id as its own chip", () => {
    // EL-V2-04: lineage moved into the provenance drawer (context rail).
    render(<PaperWorkbench {...paperHandlers()} {...paperWorkbench()} />);
    for (const id of ["AP-101", "AP-207", "PF-MAIN"]) {
      expect(screen.getAllByText(id).length, id).toBeGreaterThanOrEqual(1);
    }
    expect(screen.getByRole("button", { name: /Copy/ })).toBeTruthy();
  });

  it("carries the R1 and R2 decisions on the lifecycle rail as links", () => {
    const { container } = render(<PaperWorkbench {...paperHandlers()} {...paperWorkbench()} />);
    const rail = container.querySelector(".exec-rail") ?? container;
    expect(within(rail as HTMLElement).getAllByRole("link").length).toBeGreaterThanOrEqual(2);
  });

  it("takes each drift verdict from the server rather than comparing the two figures", () => {
    // What "within band" means is a policy the approval was granted against.
    // 52.7 against 54.1 is inside one band and outside another.
    const { container } = render(<PaperWorkbench {...paperHandlers()} {...paperWorkbench({ tab: "Evidence" })} />);
    const table = within(container.querySelector("table.exec-360-sync") as HTMLElement);
    expect(table.getAllByText("WITHIN_BAND")).toHaveLength(2);
    expect(table.getAllByText("WATCH")).toHaveLength(2);
    expect(table.getByText("INSUFFICIENT_DATA")).toBeTruthy();
  });

  it("says a WATCH blocks nothing and a FAIL blocks the exit", () => {
    render(<PaperWorkbench {...paperHandlers()} {...paperWorkbench({ tab: "Evidence" })} />);
    expect(screen.getByText(/WATCH item blocks nothing; a FAIL item blocks/)).toBeTruthy();
  });

  it("hides mutation controls entirely rather than disabling them", () => {
    render(<PaperWorkbench {...paperHandlers()} {...paperWorkbench()} />);
    expect(screen.queryByRole("button", { name: "Admin actions" })).toBeNull();
    cleanup();
    render(<PaperWorkbench {...paperHandlers()} {...paperWorkbench({ operatorAdmin: true })} />);
    expect(screen.getByRole("button", { name: "Admin actions" })).toBeTruthy();
  });

  it("renders a panel state rather than a half-built screen when the read fails", () => {
    render(<PaperWorkbench {...paperHandlers()} {...paperWorkbench({ status: "denied", reason: "Not your deployment." })} />);
    expect(screen.getByText("Not your deployment.")).toBeTruthy();
    expect(screen.queryByText(/Observation gate/)).toBeNull();
  });
});

describe("Paper Workbench — at the volume the Trading System holds", () => {
  it("pages orders rather than capping them, because they have no retention", () => {
    const { container } = render(
      <PaperWorkbench {...paperHandlers()} {...paperWorkbench({ orders: ordersAtScale() })} />,
    );
    expect(screen.getByText("1,284,991")).toBeTruthy();
    expect(screen.queryByText(/showing .* of .* orders/)).toBeNull();
    expect(container.querySelector(".exec-table-nav")).toBeTruthy();
  });

  it("caps 400 sessions and keeps the one that never recovered", () => {
    render(
      <PaperWorkbench {...paperHandlers()} {...paperWorkbench({ tab: "Sessions", sessions: sessionsAtScale() })} />,
    );
    // Row 317 of 400 — outside any head-cap window.
    expect(screen.getByText("exs_2317")).toBeTruthy();
    expect(screen.getByText(/recovery incomplete/)).toBeTruthy();
  });

  it("offers all seven tabs and renders one", () => {
    render(<PaperWorkbench {...paperHandlers()} {...paperWorkbench()} />);
    for (const tab of WORKBENCH_TABS) expect(screen.getByRole("tab", { name: tab })).toBeTruthy();
    expect(WORKBENCH_TABS).toHaveLength(7);
    expect(screen.getByRole("tabpanel", { name: "Orders" })).toBeTruthy();
  });

  it("keeps both quantities on a partial fill", () => {
    render(<PaperWorkbench {...paperHandlers()} {...paperWorkbench()} />);
    expect(screen.getByText("0.3000/0.4000")).toBeTruthy();
  });

  it("states a market order's missing limit price rather than inventing one", () => {
    render(<PaperWorkbench {...paperHandlers()} {...paperWorkbench()} />);
    expect(screen.getByText("no limit price")).toBeTruthy();
  });
});

describe("the drift caption never invents a linkage", () => {
  it("states the linkage the server stated", () => {
    render(<PaperWorkbench {...paperHandlers()} {...paperWorkbench({ tab: "Evidence" })} />);
    expect(screen.getByText(/linked by run_5512/)).toBeTruthy();
  });

  it("says the linkage is unstated when no note was published", () => {
    // The fallback used to read "Linked to the approved run by artifact
    // digest." — a provenance claim manufactured from silence, printed as the
    // caption of the one table whose purpose is to report divergence from the
    // approved run. An operator reading it would believe the digest had been
    // checked.
    render(<PaperWorkbench {...paperHandlers()} {...paperWorkbench({ driftNote: null, tab: "Evidence" })} />);
    expect(screen.getByText(/No linkage to the approved run is stated/)).toBeTruthy();
    expect(screen.queryByText(/Linked to the approved run by artifact digest/)).toBeNull();
  });
});
