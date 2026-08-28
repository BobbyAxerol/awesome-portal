/**
 * Paper Overview at /deployments/paper (smoke until BR-EX-62).
 *
 * Rules it protects: the sidebar's Paper entry never lands inside one alpha
 * unasked; a met gate's next step is its exit review; a VND figure never joins
 * a USDT sum; and the runway's cells are counted, not decorative.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { PaperOverview } from "./screens/PaperOverview";
import { PAPER_OVERVIEW, poCells } from "./paper.smoke";

afterEach(cleanup);

function view() {
  return render(
    <MemoryRouter initialEntries={["/deployments/paper"]}>
      <Routes>
        <Route path="/deployments/paper" element={<PaperOverview />} />
        <Route path="/deployments/paper/:id" element={<div>workbench</div>} />
        <Route path="/deployments/paper/:id/vn-market" element={<div>vn workbench</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Paper Overview — entry for WF 1c/4h", () => {
  it("lists every deployment in paper and says the data is smoke", () => {
    view();
    for (const r of PAPER_OVERVIEW.runway.rows) expect(screen.getAllByText(new RegExp(r.alpha)).length).toBeGreaterThan(0);
    expect(screen.getByText(/SMOKE DATA/)).toBeTruthy();
  });

  it("never sums VND into the USDT capital figure", () => {
    view();
    expect(screen.getByText(/VND — never summed/)).toBeTruthy();
  });

  it("the venue chips narrow the runway, and back", () => {
    view();
    const board = () => screen.getByLabelText("Observation runway");
    fireEvent.click(screen.getByRole("button", { name: "VN MARKET" }));
    expect(within(board()).getByText(/VnMomo v0.9/)).toBeTruthy();
    expect(within(board()).queryByText(/Carry v3.2/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(within(board()).getByText(/Carry v3.2/)).toBeTruthy();
  });

  it("a runway row opens its workbench — the VN row opens the VN variant", () => {
    view();
    fireEvent.click(screen.getByRole("button", { name: /Carry v3.2 on BINANCE/ }));
    expect(screen.getByText("workbench")).toBeTruthy();
    cleanup();
    view();
    fireEvent.keyDown(screen.getByRole("button", { name: /VnMomo v0.9 on VN MARKET/ }), { key: "Enter" });
    expect(screen.getByText("vn workbench")).toBeTruthy();
  });

  it("the met gate's next step is its exit review, marked as met", () => {
    view();
    const link = screen.getByRole("link", { name: /GATE MET → EX-771/ });
    expect(link.getAttribute("href")).toBe("/governance/exit-reviews/EX-771");
    expect(link.getAttribute("data-met")).toBe("true");
  });

  it("counts the runway cells: observed + today/next + ahead always equals the window", () => {
    for (const r of PAPER_OVERVIEW.runway.rows) {
      const cells = poCells(r.days);
      expect(cells.length, r.alpha).toBe(r.days.total);
      expect(cells.filter((c) => c.kind === "up" || c.kind === "down").length, r.alpha).toBe(r.days.results.length);
    }
    const { container } = view();
    expect(container.querySelectorAll(".exec-po-cells > span")).toHaveLength(90);
  });

  it("the funnel says what paper is for, and each bar names its shares", () => {
    view();
    expect(screen.getByText(/paper exists to prove the funnel, not the PnL/)).toBeTruthy();
    expect(screen.getByLabelText(/Carry: 67% filled, 7% working, 5% rejected, 21% skipped/)).toBeTruthy();
  });

  it("left-paper history links each hop of the promotion it records", () => {
    view();
    expect(screen.getByRole("link", { name: "canary d9/14" }).getAttribute("href")).toBe("/deployments/live/dep_88/canary");
    expect(screen.getByText(/REJECTED at exit \(drift FAIL\)/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /RSI v1.4/ })).toBeNull();
  });
});
