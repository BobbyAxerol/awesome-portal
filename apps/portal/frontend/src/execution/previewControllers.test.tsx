/**
 * EL-V2-03 — every §8.1 class has an implementation, and it is observable.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { alpha360 } from "./alpha360.fixtures";
import { paperWorkbench } from "./paper.fixtures";
import {
  AccountBroker360Preview,
  AlphaThreeSixtyPreview,
  FullBlotterPreview,
  PaperWorkbenchPreview,
  PortfolioThreeSixtyPreview,
  ROUTES,
  scopeAlpha,
  workbenchRouteFor,
} from "./previewControllers";

afterEach(cleanup);

function Probe() {
  const loc = useLocation();
  return <output data-testid="loc">{loc.pathname + loc.search}</output>;
}

function mount(ui: React.ReactNode, at = "/x") {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route path="*" element={<>{ui}<Probe /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("canonical routes", () => {
  it.each([
    ["PAPER_OBSERVATION", "/deployments/paper/dep_94"],
    ["SANDBOX_VALIDATION", "/deployments/sandbox/dep_94"],
    ["LIVE_CANARY", "/deployments/live/dep_94/canary"],
    ["LIVE_FULL", "/deployments/live/dep_94"],
  ])("%s → %s", (stage, path) => {
    expect(workbenchRouteFor(stage, "dep_94")).toBe(path);
  });
  it("carries the entity id in the path, never in a query", () => {
    expect(ROUTES.account("acct-1")).toBe("/deployments/accounts/acct-1");
    expect(ROUTES.exitReview("EX-771")).toBe("/governance/exit-reviews/EX-771");
  });
});

describe("scopeAlpha — narrowing shows less, never invents", () => {
  const base = alpha360();
  it("filters venue and deployment rows to the chosen venue", () => {
    const scoped = scopeAlpha(base, "BINANCE");
    expect(scoped.venues.every((v) => v.venue === "BINANCE")).toBe(true);
    expect(scoped.deployments.every((d) => d.venue === "BINANCE")).toBe(true);
    expect(scoped.scope.venue).toBe("BINANCE");
  });
  it("marks alpha-wide KPIs absent with the reason instead of summing in the browser", () => {
    const scoped = scopeAlpha(base, "OKX");
    for (const k of scoped.kpis) {
      expect(k.value).toBeNull();
      expect(k.absentReason).toMatch(/not published for scope OKX/);
    }
  });
  it("is the identity for All", () => {
    expect(scopeAlpha(base, "All")).toBe(base);
  });
});

describe("local UI interactions mirror into the URL", () => {
  it("Paper: a tab click changes the panel and the search string; back navigation would restore it", () => {
    mount(<PaperWorkbenchPreview deploymentId="dep_94" />, "/deployments/paper/dep_94");
    fireEvent.click(screen.getByRole("tab", { name: "Fills" }));
    expect(screen.getByTestId("loc").textContent).toContain("tab=Fills");
    expect(screen.getByRole("tab", { name: "Fills" }).getAttribute("aria-selected")).toBe("true");
  });
  it("Paper: a hand-edited tab that does not exist falls back instead of selecting nothing", () => {
    mount(<PaperWorkbenchPreview deploymentId="dep_94" />, "/deployments/paper/dep_94?tab=Nope");
    // EL-V2-04: Overview is the first tab (§10.1), so it is the fallback.
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe("true");
  });
  it("Alpha: changing the venue scope narrows the deployments table", () => {
    mount(<AlphaThreeSixtyPreview alphaId="av_2041" />, "/deployments/alphas/av_2041");
    const before = screen.getAllByRole("row").length;
    fireEvent.change(screen.getByLabelText(/Venue/), { target: { value: "BINANCE" } });
    expect(screen.getByTestId("loc").textContent).toContain("venue=BINANCE");
    expect(screen.getAllByRole("row").length).toBeLessThan(before);
    expect(screen.getAllByText(/not published for scope BINANCE/).length).toBeGreaterThan(0);
  });
  it("Portfolio: tabs switch and the URL follows", () => {
    mount(<PortfolioThreeSixtyPreview portfolioId="PF-CRYPTO" />, "/deployments/portfolios/PF-CRYPTO");
    fireEvent.click(screen.getByRole("tab", { name: "Capital Ledger" }));
    expect(screen.getByTestId("loc").textContent).toContain("tab=Capital");
  });
  it("Blotter: filter, reset and expand each change visible state", () => {
    mount(<FullBlotterPreview initialFilter="ALL" />, "/deployments/blotter");
    fireEvent.click(screen.getByRole("button", { name: /^Filled/ }));
    expect(screen.getByTestId("loc").textContent).toContain("filter=FILLED");
    fireEvent.click(screen.getByRole("button", { name: /Reset the cross-filter/ }));
    expect(screen.queryByText(/Cross-filter ·/)).toBeNull();
    expect(document.querySelector(".exec-sim-live")?.textContent).toContain("reset cross-filter");
  });
});

describe("safe simulated workflows are explicit", () => {
  it("Account: sync and dry-run announce a fixture result and record it", () => {
    mount(<AccountBroker360Preview accountId="acct-live-grid-v21" initial={{ operatorAdmin: true }} />);
    fireEvent.click(screen.getByRole("button", { name: /Sync now/ }));
    const live = () => document.querySelector(".exec-sim-live")?.textContent ?? "";
    expect(live()).toMatch(/Simulated · sync now/);
    fireEvent.click(screen.getByRole("button", { name: /Dry-run reconcile/ }));
    const status = live();
    expect(status).toMatch(/dry-run reconcile/);
    expect(status).toMatch(/0 findings/);
    // The ledger keeps the earlier action visible: two clicks, two records.
    expect(document.querySelector("[data-simulation-ledger]")?.getAttribute("data-simulation-ledger")).toBe("2");
  });
  it("Paper: load older says the fixture ends rather than pretending to page", () => {
    // The control only exists when the page says there is more; the fixture
    // is given a cursor so the button renders and the simulation can answer.
    const page = paperWorkbench().orders;
    if (!page) throw new Error("the Paper fixture must publish an orders page");
    const orders = { ...page, hasMore: true, nextCursor: "c_fixture_next" };
    mount(<PaperWorkbenchPreview deploymentId="dep_94" initial={{ orders }} />, "/deployments/paper/dep_94?tab=Orders");
    const older = screen.getAllByRole("button", { name: /load older/i });
    fireEvent.click(older[0]);
    expect(document.querySelector(".exec-sim-live")?.textContent).toMatch(/no older rows exist/);
  });
});

describe("canonical navigation carries context", () => {
  it("Paper: request exit routes to the Exit Review with a return address", () => {
    mount(<PaperWorkbenchPreview deploymentId="dep_94" />, "/deployments/paper/dep_94?tab=Fills");
    fireEvent.click(screen.getByRole("button", { name: /Request Paper Exit Review/ }));
    const loc = screen.getByTestId("loc").textContent ?? "";
    expect(loc).toContain("/governance/exit-reviews/EX-771");
    expect(decodeURIComponent(loc)).toContain("from=/deployments/paper/dep_94?tab=Fills");
  });
  it("Alpha: a deployment row opens the workbench for its stage", () => {
    mount(<AlphaThreeSixtyPreview alphaId="av_2041" />, "/deployments/alphas/av_2041");
    fireEvent.click(screen.getByRole("button", { name: "dep_88" }));
    expect(screen.getByTestId("loc").textContent).toBe("/deployments/live/dep_88/canary");
  });
  it("Portfolio: an account cell opens Account 360°", () => {
    mount(<PortfolioThreeSixtyPreview portfolioId="PF-CRYPTO" />, "/deployments/portfolios/PF-CRYPTO?tab=Structure+%26+Correlation");
    fireEvent.click(screen.getAllByRole("button", { name: "acct-canary-grid" })[0]);
    expect(screen.getByTestId("loc").textContent).toBe("/deployments/accounts/acct-canary-grid");
  });
});
