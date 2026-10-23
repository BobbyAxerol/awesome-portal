/**
 * Compare on the PREVIEW lane (WP-C, FIXTURE_LAB): the fixture BFF's answer order, populated profile, medium scale.
 *
 * Comparable pairs draw the overlay from the published series port (aligned, per partition, never rebased or summed across currencies),
 * the chart ends on the figure the metrics table prints, the best of a row is marked by an exact decimal comparison, and a pair that
 * cannot share a basis gets the typed state. The Alphas tab reads the Alpha Fleet and the ALPHA dataset, and draws its overlay from the
 * same series port asked for ALPHA subjects (WP-K, FIXTURE_LAB). Nothing here proves what the real Edge returns.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { endPreviewLane, startPreviewLane } from "../alpha/previewLane.testbase";
import CompareScreen from "./index";

afterEach(() => { cleanup(); endPreviewLane(); });

function mount(query: string) {
  const lane = startPreviewLane();
  render(
    <MemoryRouter initialEntries={[`/deployments/compare${query}`]}>
      <CompareScreen api={lane.api} />
    </MemoryRouter>,
  );
  return lane;
}
const metrics = () => within(screen.getByRole("table", { name: "Metrics" }));
const rowOf = (label: string) => metrics().getByText(label, { selector: "td[data-l='Metric'] *, td[data-l='Metric']" }).closest("tr") as HTMLElement;

describe("comparable portfolios (Satellite and a generated USDT book, Real-funded)", () => {
  it("draws two lines with end tags on the shared axis, and the basis line says what the axis is", async () => {
    mount("?in=pf_TEST_ONLY_satellite,pf_scale_006");
    await waitFor(() => expect(screen.getAllByTestId("compare-line")).toHaveLength(2), { timeout: 4000 });
    expect(screen.getAllByTestId("end-tag")).toHaveLength(2);
    expect(screen.getByTestId("basis").textContent).toMatch(/^Basis: /);
    expect(screen.queryByText("Pick two comparable portfolios")).toBeNull();
  });

  it("fills the metrics table with the dataset's figures for the TEST_ONLY subject and marks the best of a row with a square", async () => {
    mount("?in=pf_TEST_ONLY_satellite,pf_scale_006");
    await waitFor(() => expect(rowOf("Net PnL").textContent).toMatch(/\d/), { timeout: 4000 });
    for (const label of ["NAV", "Net PnL", "Return", "Max drawdown"]) {
      await waitFor(() => expect(rowOf(label).textContent).not.toMatch(/Loading|Not available/), { timeout: 4000 });
    }
    // Score is the register's published portfolio score (value and band) or the typed absence, never a number invented here.
    await waitFor(() => expect(rowOf("Score").textContent).not.toMatch(/Loading/), { timeout: 4000 });
    expect(rowOf("Score").textContent).toMatch(/Weak|Neutral|Fair|Good|Very good|Insufficient evidence|Window not published/);
    // Net PnL: exactly one pick is better; the other is not marked.
    expect(within(rowOf("Net PnL")).getAllByRole("img", { name: "Best in this row" })).toHaveLength(1);
    expect(screen.getByText("Square marks the best in a row")).toBeTruthy();
  });

  it.each([["NAV", "NAV"], ["Net PnL", "Net PnL"]])("the overlay ends on the number the table prints: the %s series is read for the same window and the same dataset", async (button, row) => {
    mount("?in=pf_TEST_ONLY_satellite,pf_scale_006");
    await waitFor(() => expect(screen.getAllByTestId("end-tag")).toHaveLength(2), { timeout: 4000 });
    if (button !== "NAV") fireEvent.click(screen.getByRole("button", { name: button }));
    await waitFor(() => expect(screen.getAllByTestId("end-tag")).toHaveLength(2), { timeout: 4000 });
    await waitFor(() => expect(rowOf(row).textContent).toMatch(/\d/), { timeout: 4000 });
    const tags = screen.getAllByTestId("end-tag").map((tag) => tag.textContent ?? "");
    const figures = [...rowOf(row).querySelectorAll("td")].slice(1).map((td) => (td.textContent ?? "").match(/[+-]?[\d,]+\.\d+/)?.[0] ?? "");
    expect(figures.every((figure) => figure !== "")).toBe(true);
    for (const figure of figures) expect(tags.some((tag) => tag.includes(figure)), `${figure} in ${tags.join(" | ")}`).toBe(true);
  });
});

describe("the Drawdown measure on the Portfolios tab", () => {
  it("is offered beside NAV, Net PnL and Return and draws the published DRAWDOWN series of the two portfolios", async () => {
    mount("?in=pf_TEST_ONLY_satellite,pf_scale_006");
    await waitFor(() => expect(screen.getAllByTestId("end-tag")).toHaveLength(2), { timeout: 4000 });
    fireEvent.click(screen.getByRole("button", { name: "Drawdown" }));
    await waitFor(() => expect(screen.getByTestId("basis-caption").textContent).toMatch(/Drawdown, a ratio stated as a fraction/), { timeout: 4000 });
    await waitFor(() => expect(screen.getAllByTestId("compare-line")).toHaveLength(2), { timeout: 4000 });
  });
});

describe("pairs that cannot share a basis", () => {
  it("Core spans Real-funded and Simulated books: it is listed apart with the reason, and the overlay says so instead of drawing", async () => {
    mount("?in=pf_TEST_ONLY_core,pf_TEST_ONLY_satellite");
    expect(await screen.findByText("Pick two comparable portfolios", {}, { timeout: 4000 })).toBeTruthy();
    expect(screen.queryAllByTestId("compare-line")).toHaveLength(0);
    expect(screen.getAllByTestId("not-comparable").length).toBeGreaterThan(0);
  });
});

describe("the Alphas tab", () => {
  it("lists the Fleet's alphas, reads each pick's dataset and draws the overlay from the ALPHA series read", async () => {
    mount("?kind=alpha");
    const group = await screen.findByRole("group", { name: "Alphas to compare" }, { timeout: 4000 });
    const chips = within(group).getAllByRole("button");
    expect(chips.length).toBeGreaterThan(2);
    fireEvent.click(chips[0]!);
    fireEvent.click(chips[1]!);
    await waitFor(() => expect(screen.getAllByTestId("compare-line")).toHaveLength(2), { timeout: 4000 });
    expect(screen.queryByText("Not published (FE-033)")).toBeNull();
    const table = within(await screen.findByRole("table", { name: "Alpha metrics" }));
    await waitFor(() => expect(table.getAllByText(/USDT/).length).toBeGreaterThan(0), { timeout: 4000 });
    for (const label of ["Net PnL", "Return", "Max drawdown", "Score", "Allocation"]) expect(table.getByText(label, { selector: "td[data-l='Metric'] *, td[data-l='Metric']" })).toBeTruthy();
  });

  it("the Drawdown measure is the published DRAWDOWN series of the picked alphas: a ratio at or below zero, drawn as percent, never worked out from NAV here", async () => {
    mount("?kind=alpha");
    const group = await screen.findByRole("group", { name: "Alphas to compare" }, { timeout: 4000 });
    const chips = within(group).getAllByRole("button");
    fireEvent.click(chips[0]!);
    fireEvent.click(chips[1]!);
    await waitFor(() => expect(screen.getAllByTestId("compare-line")).toHaveLength(2), { timeout: 4000 });
    const measure = within(screen.getByRole("group", { name: "Series measure" }));
    expect(measure.getAllByRole("button").map((b) => b.textContent)).toEqual(["NAV", "Net PnL", "Return", "Drawdown"]);
    fireEvent.click(measure.getByRole("button", { name: "Drawdown" }));
    await waitFor(() => expect(screen.getByTestId("basis-caption").textContent).toMatch(/Drawdown, a ratio stated as a fraction/), { timeout: 4000 });
    await waitFor(() => expect(screen.getAllByTestId("end-tag")).toHaveLength(2), { timeout: 4000 });
    for (const tag of screen.getAllByTestId("end-tag")) expect(tag.textContent ?? "").toMatch(/(?:^|[^\d])(?:0|-[\d,]+\.\d+)%|%/);
  });
});
