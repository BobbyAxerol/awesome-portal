/**
 * QA3 R1-10: a ticket code (FE-nnn, BR-EX-, A360-) is never rendered text on Overview, Portfolios or Portfolio 360 (any tab). A code may sit in a
 * tooltip (`title`) or a disclosure the user opens; it is not in the text a reader or a screen reader gets.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetOverviewDouble, setOverviewDoubleVariants } from "../../../../e2e/bffDoubleOverview";
import { PF } from "../../../../e2e/bffDoublePortfolios";
import { httpApi, serveDoubles } from "../../../../e2e/screensV2Harness";
import { sessionOf } from "./alpha/testApi";
import { makeApi } from "./portfolios/harness.fixtures";
import { newSeriesDouble, wrapFetch } from "./series/seriesDouble.testbase";
import OverviewScreen from "./overview/index";
import PortfolioListScreen from "./portfolios/index";
import PortfolioScreen from "./portfolios/portfolio/index";

const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../../auth/session", () => ({ useSession: () => session.current }));

const TICKET = /\bFE-\d{2,3}\b|\bBR-EX-|\bA360-\d/;
/** The first text node that carries a ticket code, with its surrounding markup (for the failure message), else null. */
const leak = (root: HTMLElement): string | null => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (TICKET.test(node.textContent ?? "")) return `${node.parentElement?.className} | ${node.textContent?.slice(0, 160)}`;
  }
  return null;
};

beforeEach(() => {
  session.current = { ...sessionOf(["governance.r1.read"]), principal: null };
  resetOverviewDouble();
  setOverviewDoubleVariants({ fleet: "multi-currency" });
  serveDoubles();
  vi.stubGlobal("fetch", wrapFetch(globalThis.fetch, newSeriesDouble("unavailable")));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("no ticket code in rendered text", () => {
  it("Overview", async () => {
    const view = render(<MemoryRouter initialEntries={["/execution?env=paper&window=30D"]}><OverviewScreen api={httpApi()} sseFactory={null} /></MemoryRouter>);
    await screen.findByRole("heading", { name: /^Overview/ });
    await waitFor(() => expect(screen.queryByRole("status", { name: /^Loading/ })).toBeNull());
    expect(leak(view.container)).toBeNull();
  });

  it("Portfolios register", async () => {
    const view = render(<MemoryRouter initialEntries={["/deployments/portfolios?env=paper"]}><PortfolioListScreen api={makeApi().api} /></MemoryRouter>);
    await screen.findByRole("region", { name: "Portfolio register" });
    expect(leak(view.container)).toBeNull();
  });

  it("Portfolio 360, every tab", async () => {
    const view = render(<MemoryRouter initialEntries={[`/deployments/portfolios/${PF.core}`]}><PortfolioScreen api={makeApi().api} portfolioId={PF.core} /></MemoryRouter>);
    const tabs = await screen.findByRole("tablist", { name: "Portfolio sections" });
    const names = [...tabs.querySelectorAll("[role=tab]")].map((t) => t.textContent ?? "");
    expect(names.length).toBeGreaterThan(3);
    for (const name of names) {
      fireEvent.click(screen.getByRole("tab", { name }));
      await waitFor(() => expect(screen.getByRole("tab", { name }).getAttribute("aria-selected")).toBe("true"));
      await new Promise((r) => setTimeout(r, 30));
      expect(leak(view.container), `tab ${name}`).toBeNull();
    }
  });
});
