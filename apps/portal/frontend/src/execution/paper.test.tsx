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

afterEach(cleanup);

describe("Paper Workbench — the screen exists to exit Paper", () => {
  it("puts the observation gate beside the equity chart, not below it", () => {
    // The wireframe is explicit, and the reason is the screen's purpose: a
    // reader who has to scroll to find how far along they are will read the
    // chart instead and guess.
    const { container } = render(<PaperWorkbench {...paperWorkbench()} />);
    const grid = container.querySelector('.exec-grid-2[data-ratio="1.35"]')!;
    expect(within(grid as HTMLElement).getByText(/Observation gate/)).toBeTruthy();
    expect(within(grid as HTMLElement).getByText(/Equity vs approved research evidence/)).toBeTruthy();
  });

  it("names every unmet criterion rather than counting them", () => {
    // "Blocked" is a support ticket. "18 more days of observation" is an
    // instruction.
    render(<PaperWorkbench {...paperWorkbench()} />);
    expect(screen.getByRole("button", { name: /Request Paper Exit Review/ })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByText(/18 more days of observation/)).toBeTruthy();
    expect(screen.getByText(/116 more trades/)).toBeTruthy();
    expect(screen.getByText(/1 more clean restart cycle/)).toBeTruthy();
  });

  it("opens the exit once the gate is met", () => {
    const onRequestExit = vi.fn();
    render(<PaperWorkbench {...paperWorkbench({ ...GATE_MET, onRequestExit })} />);
    const cta = screen.getByRole("button", { name: /Request Paper Exit Review/ });
    expect(cta).toHaveProperty("disabled", false);
    cta.click();
    expect(onRequestExit).toHaveBeenCalledOnce();
  });

  it("never enables the exit on elapsed time alone", () => {
    // The policy line says it and the component must mean it: days can be met
    // while trades are not, and promotion is the conjunction.
    render(
      <PaperWorkbench
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
    render(<PaperWorkbench {...paperWorkbench(STALE)} />);
    expect(screen.getByText(/Projection stale/)).toBeTruthy();
    expect(screen.getByText(/last good ones/)).toBeTruthy();
    expect(screen.getByText("51,842.18")).toBeTruthy();
  });

  it("says risk fails closed in the Execution cell, so nobody reads it as permissive", () => {
    render(<PaperWorkbench {...paperWorkbench(STALE)} />);
    expect(screen.getByText(/Orders remain authoritative in the Execution cell/)).toBeTruthy();
    expect(screen.getByText(/fails closed/)).toBeTruthy();
  });

  it("shows no stale banner when the projection is fresh", () => {
    render(<PaperWorkbench {...paperWorkbench()} />);
    expect(screen.queryByText(/Projection stale/)).toBeNull();
  });
});

describe("Paper Workbench — lineage, drift and mutation controls", () => {
  it("renders every lineage id as its own chip", () => {
    const { container } = render(<PaperWorkbench {...paperWorkbench()} />);
    const strip = container.querySelector(".exec-paper-lineage")!;
    for (const id of ["AP-101", "AP-207", "PF-MAIN", "dep_74"]) {
      expect(within(strip as HTMLElement).getByText(id), id).toBeTruthy();
    }
  });

  it("carries the R1 and R2 decisions on the lifecycle rail as links", () => {
    const { container } = render(<PaperWorkbench {...paperWorkbench()} />);
    const rail = container.querySelector(".exec-rail") ?? container;
    expect(within(rail as HTMLElement).getAllByRole("link").length).toBeGreaterThanOrEqual(2);
  });

  it("takes each drift verdict from the server rather than comparing the two figures", () => {
    // What "within band" means is a policy the approval was granted against.
    // 52.7 against 54.1 is inside one band and outside another.
    render(<PaperWorkbench {...paperWorkbench()} />);
    expect(screen.getAllByText("WITHIN_BAND")).toHaveLength(2);
    expect(screen.getAllByText("WATCH")).toHaveLength(2);
    expect(screen.getByText("INSUFFICIENT_DATA")).toBeTruthy();
  });

  it("says a WATCH blocks nothing and a FAIL blocks the exit", () => {
    render(<PaperWorkbench {...paperWorkbench()} />);
    expect(screen.getByText(/WATCH item blocks nothing, a FAIL item blocks/)).toBeTruthy();
  });

  it("hides mutation controls entirely rather than disabling them", () => {
    render(<PaperWorkbench {...paperWorkbench()} />);
    expect(screen.queryByRole("button", { name: "Admin actions" })).toBeNull();
    cleanup();
    render(<PaperWorkbench {...paperWorkbench({ operatorAdmin: true })} />);
    expect(screen.getByRole("button", { name: "Admin actions" })).toBeTruthy();
  });

  it("renders a panel state rather than a half-built screen when the read fails", () => {
    render(<PaperWorkbench {...paperWorkbench({ status: "denied", reason: "Not your deployment." })} />);
    expect(screen.getByText("Not your deployment.")).toBeTruthy();
    expect(screen.queryByText(/Observation gate/)).toBeNull();
  });
});

describe("Paper Workbench — at the volume the Trading System holds", () => {
  it("pages orders rather than capping them, because they have no retention", () => {
    const { container } = render(
      <PaperWorkbench {...paperWorkbench({ orders: ordersAtScale() })} />,
    );
    expect(screen.getByText("1,284,991")).toBeTruthy();
    expect(screen.queryByText(/showing .* of .* orders/)).toBeNull();
    expect(container.querySelector(".exec-table-nav")).toBeTruthy();
  });

  it("caps 400 sessions and keeps the one that never recovered", () => {
    render(
      <PaperWorkbench {...paperWorkbench({ tab: "Sessions", sessions: sessionsAtScale() })} />,
    );
    // Row 317 of 400 — outside any head-cap window.
    expect(screen.getByText("exs_2317")).toBeTruthy();
    expect(screen.getByText(/recovery incomplete/)).toBeTruthy();
  });

  it("offers all four tabs and renders one", () => {
    render(<PaperWorkbench {...paperWorkbench()} />);
    for (const tab of WORKBENCH_TABS) expect(screen.getByRole("tab", { name: tab })).toBeTruthy();
    expect(WORKBENCH_TABS).toHaveLength(4);
    expect(screen.getByRole("tabpanel", { name: "Orders" })).toBeTruthy();
  });

  it("keeps both quantities on a partial fill", () => {
    render(<PaperWorkbench {...paperWorkbench()} />);
    expect(screen.getByText("0.3000/0.4000")).toBeTruthy();
  });

  it("states a market order's missing limit price rather than inventing one", () => {
    render(<PaperWorkbench {...paperWorkbench()} />);
    expect(screen.getByText("no limit price")).toBeTruthy();
  });
});

describe("the drift caption never invents a linkage", () => {
  it("states the linkage the server stated", () => {
    render(<PaperWorkbench {...paperWorkbench()} />);
    expect(screen.getByText(/linked by run_5512/)).toBeTruthy();
  });

  it("says the linkage is unstated when no note was published", () => {
    // The fallback used to read "Linked to the approved run by artifact
    // digest." — a provenance claim manufactured from silence, printed as the
    // caption of the one table whose purpose is to report divergence from the
    // approved run. An operator reading it would believe the digest had been
    // checked.
    render(<PaperWorkbench {...paperWorkbench({ driftNote: null })} />);
    expect(screen.getByText(/No linkage to the approved run is stated/)).toBeTruthy();
    expect(screen.queryByText(/Linked to the approved run by artifact digest/)).toBeNull();
  });
});
