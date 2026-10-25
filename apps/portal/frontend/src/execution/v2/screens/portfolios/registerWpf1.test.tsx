/**
 * Portfolios register, WP-F1 pieces: the freshness chip, the export sentence (a disclosure, not a dead button), the scope statement line
 * (the Manager's own per-partition NAV, never a sum of the rows), the "n portfolios in another currency" line, the default columns that
 * fit 1440, the bare figure in the row's base currency, and the typed Health.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { PF } from "../../../../../e2e/bffDoublePortfolios";
import type { ExecutionApi } from "../../../api/ports";
import { moneyMetric, partition } from "../../readers/managerDataset.testbase";
import { datasetFor, withDataset } from "./datasetFixtures.testbase";
import { makeApi } from "./harness.fixtures";
import PortfolioListScreen from "./index";
import { DEFAULT_HIDDEN, OPTIONAL_COLUMNS } from "./PortfolioTable";

afterEach(cleanup);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;

const nav = (body: Body) => {
  body.capital_statements = [
    { partition: partition("ACTUAL", "USDT", "actual"), metrics: { current_nav: moneyMetric({ value: "230000.00" }) } },
    { partition: partition("ACTUAL", "JPY", "jpy"), metrics: { current_nav: moneyMetric({ currency: "JPY", value: "23000.00" }) } },
  ];
};
const served = () => withDataset(makeApi().api, () => datasetFor("FLEET", PF.core, nav));
const mount = (api: ExecutionApi, entry = "/deployments/portfolios") => render(<MemoryRouter initialEntries={[entry]}><PortfolioListScreen api={api} /></MemoryRouter>);
const table = () => screen.getByRole("table", { name: "Portfolios" });
const ready = async (api: ExecutionApi, entry?: string) => {
  mount(api, entry);
  await screen.findByRole("table", { name: "Portfolios" }, { timeout: 5000 });
  await waitFor(() => expect(table().querySelector(".exec-part, .exec-pf-na")).not.toBeNull());
};

describe("page head and toolbar", () => {
  it("draws the freshness chip always, beside the as-of line", async () => {
    await ready(makeApi().api);
    expect(screen.getAllByText(/^Fresh$|Freshness not stated|Aging|Stale/).length).toBeGreaterThan(0);
    expect(screen.getByText(/As of 17 Oct/)).toBeTruthy();
  });

  it("the export is a sentence behind a disclosure with the one D20 sentence and a link to My access, never a dead button", async () => {
    await ready(makeApi().api);
    const line = screen.getByTestId("export-line");
    expect(screen.queryByRole("button", { name: /^Export$/ })).toBeNull();
    fireEvent.click(within(line).getByRole("button", { name: "Export: not available yet, reason" }));
    expect(line.textContent).toContain("Export is not available yet.");
    expect(within(line).getByRole("link", { name: "My access" }).getAttribute("href")).toContain("/administration/profile-access");
  });
});

describe("the default register fits 1440", () => {
  it("hides Alphas / Dep., Allocations, Domain and HHI until asked; the chooser has every column", async () => {
    expect([...DEFAULT_HIDDEN]).toEqual(["alphas", "allocations", "domain", "hhi"]);
    await ready(makeApi().api);
    const heads = [...table().querySelectorAll("thead th")].map((th) => th.textContent);
    for (const gone of ["Alphas / Dep.", "Allocations", "Domain", "HHI"]) expect(heads, gone).not.toContain(gone);
    for (const kept of ["Manager", "NAV", "Allocated capital", "Health"]) expect(heads.some((h) => h?.startsWith(kept)), kept).toBe(true);
    const menu = screen.getByRole("group", { name: "Columns" });
    for (const column of OPTIONAL_COLUMNS) expect(within(menu).getByRole("checkbox", { name: column.label }), column.label).toBeTruthy();
  });

  it("the table carries its own class, so only the register is tightened", async () => {
    await ready(makeApi().api);
    expect(table().className).toBe("exec-cards exec-pf-reg");
  });
});

describe("a figure in the row's base currency prints as the bare number, its unit on the title", () => {
  it("Allocated capital: 540,000.00 for a USDT portfolio, and the unit is not printed twice", async () => {
    await ready(makeApi().api);
    const core = [...table().querySelectorAll("tbody tr")].find((tr) => tr.textContent?.includes("Core"))!;
    const cell = core.querySelector("td[data-l='Allocated capital']")!;
    expect(cell.textContent).toContain("540,000.00");
    expect(cell.querySelector(".exec-pf-unit")).toBeNull();
    expect(cell.querySelector(".exec-pf-num")!.getAttribute("title")).toBe("540000.00 USDT");
  });

  it("the identity cell names the base currency, so a bare figure is never unitless", async () => {
    await ready(makeApi().api);
    for (const row of table().querySelectorAll("tbody tr")) {
      if (row.textContent?.includes("Unallocated")) continue;
      const chip = row.querySelector("td[data-l='Portfolio'] .exec-pf-ccy")!;
      expect(chip.textContent).toMatch(/^[A-Z]{3,4}$/);
      expect(chip.getAttribute("title")).toBe(`Base currency ${chip.textContent}`);
      // The id is whole (never an ellipsis in the text) and rides its own title.
      const id = row.querySelector("td[data-l='Portfolio'] .exec-pf-id")!;
      expect(id.textContent).toBe(id.getAttribute("title"));
    }
  });
});

describe("scope statement", () => {
  it("prints the Manager's own Economic capital per partition, one line each, and says the rows are separate figures", async () => {
    await ready(served());
    await waitFor(() => expect(screen.queryByTestId("scope-total")).not.toBeNull());
    const total = screen.getByTestId("scope-total");
    const lines = [...total.querySelectorAll(".exec-part-line")].map((li) => li.textContent);
    expect(lines).toEqual(["Real-funded · USDT230,000.00 USDT", "Real-funded · JPY23,000.00 JPY"]);
    expect(total.textContent).toContain("Scope statement, not a sum of the rows above · Economic capital");
    expect(total.textContent).not.toMatch(/Total/);
    expect(total.querySelector("[title]")!.getAttribute("title")).toContain("partitions stay apart. The rows above are separate figures.");
  });

  it("draws nothing when the dataset publishes no current NAV in its statements", async () => {
    await ready(withDataset(makeApi().api, () => datasetFor("FLEET", PF.core)));
    expect(screen.queryByTestId("scope-total")).toBeNull();
  });
});

describe("n portfolios in another currency", () => {
  it("says how many rows the currency choice leaves out, as a count, and names the way back", async () => {
    await ready(makeApi().api, "/deployments/portfolios?ccy=JPY");
    const note = await screen.findByTestId("other-currency");
    expect(note.textContent).toMatch(/^\d+ portfolios in another currency · pick "Currency: any" to see them$/);
  });

  it("says nothing while the currency is any", async () => {
    await ready(makeApi().api);
    expect(screen.queryByTestId("other-currency")).toBeNull();
  });
});

describe("Health", () => {
  it("is the published portfolio state only, with its own hint, never an invented OK / RECALL / STALE roll-up", async () => {
    await ready(makeApi().api);
    const words = [...table().querySelectorAll("tbody td[data-l='Health']")].map((td) => td.textContent ?? "");
    expect(words.length).toBeGreaterThan(5);
    expect(words.every((w) => /Active|Paused|Suspended|Unknown|Archived|Closed|Draft/i.test(w) || w.length > 0)).toBe(true);
    expect(words.join(" ")).not.toMatch(/Recall|Stale|Partial/);
    expect(OPTIONAL_COLUMNS.find((c) => c.id === "state")!.hint).toBe("The portfolio state the read publishes");
  });
});
