/**
 * Paper entry list at /deployments/paper (smoke until BR-EX-62).
 *
 * The rule it protects: the sidebar's "Paper Trading" never lands an operator
 * inside one alpha unasked, and a met gate's next stop is its exit review.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { PaperList } from "./screens/PaperList";
import { PAPER_LIST } from "./paper.smoke";

afterEach(cleanup);

function list() {
  return render(
    <MemoryRouter initialEntries={["/deployments/paper"]}>
      <Routes>
        <Route path="/deployments/paper" element={<PaperList />} />
        <Route path="/deployments/paper/:id" element={<div>workbench</div>} />
        <Route path="/deployments/paper/:id/vn-market" element={<div>vn workbench</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Paper entry list", () => {
  it("lists every deployment in paper and says the data is smoke", () => {
    list();
    for (const r of PAPER_LIST) expect(screen.getAllByText(new RegExp(r.dep)).length).toBeGreaterThan(0);
    expect(screen.getByText(/SMOKE DATA/)).toBeTruthy();
  });

  it("a row opens its workbench — the session-aware one opens the VN variant", () => {
    list();
    fireEvent.click(screen.getByRole("button", { name: /Carry v3.2 dep_74/ }));
    expect(screen.getByText("workbench")).toBeTruthy();
    cleanup();
    list();
    fireEvent.keyDown(screen.getByRole("button", { name: /VnMomo v0.9 dep_102/ }), { key: "Enter" });
    expect(screen.getByText("vn workbench")).toBeTruthy();
  });

  it("the met gate's next step is its exit review, not more observation", () => {
    const { container } = list();
    const row = screen.getByRole("button", { name: /Grid v2.1 dep_94/ });
    expect(within(row).getByRole("link", { name: /Exit Review → EX-771/ }).getAttribute("href"))
      .toBe("/governance/exit-reviews/EX-771");
    expect(container.querySelectorAll('[data-tone="good"]').length).toBeGreaterThan(0);
  });

  it("the VN row says the market is closed without saying the deployment stopped", () => {
    list();
    expect(screen.getByText(/market CLOSED · reopens 09:00 ICT/)).toBeTruthy();
    expect(screen.getByText(/a calendar closure does not consume the window/)).toBeTruthy();
  });
});
