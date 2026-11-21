/**
 * BudgetBar and ShareBar (WP-F1): what the two bars print and say. The geometry is `capitalModel.test.ts`; here the DOM: one bar per
 * partition, the words "limit, not cash", the exact published strings, a meter that a reader can hear, and no bar where none can be drawn.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { absentMetric, moneyMetric, partition } from "../../readers/managerDataset.testbase";
import { BudgetBar, ShareBar } from "./CapitalBlocks";
import { datasetFor } from "./datasetFixtures.testbase";

afterEach(cleanup);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;

const statements = (metrics: Record<string, Body>, p = partition("ACTUAL", "USDT", "actual")) =>
  datasetFor("PORTFOLIO", "pf_x", (body: Body) => { body.capital_statements = [{ partition: p, metrics }]; }).capitalStatements;

describe("BudgetBar", () => {
  it("prints used / limit as published, the budget-is-a-limit sentence, a meter with words, and the recalling segment", () => {
    render(<BudgetBar list={statements({ allocation: moneyMetric({ value: "14580.00" }), current_budget: moneyMetric({ value: "18000.00" }), recalling: moneyMetric({ value: "360.00" }) })} />);
    const group = screen.getByRole("group", { name: "Budget used" });
    expect(group.textContent).toContain("14,580.00 USDT");
    expect(group.textContent).toContain("18,000.00 USDT");
    expect(group.textContent).toContain("Recalling");
    expect(group.textContent).toContain("360.00 USDT");
    expect(screen.getByText("Budget used").getAttribute("title")).toContain("The budget is a limit, not cash");
    const meter = within(group).getByRole("meter");
    expect(meter.getAttribute("aria-valuenow")).toBe("81");
    expect(meter.getAttribute("aria-valuetext")).toBe("14,580.00 USDT of 18,000.00 USDT, 360.00 USDT recalling");
    expect(group.querySelector(".exec-cap-bar-recall")).not.toBeNull();
  });

  it("one line per partition, each with its own label and bar", () => {
    const list = datasetFor("PORTFOLIO", "pf_x", (body: Body) => {
      body.capital_statements = [
        { partition: partition("ACTUAL", "USDT", "actual"), metrics: { allocation: moneyMetric({ value: "50" }), current_budget: moneyMetric({ value: "100" }) } },
        { partition: partition("PAPER", "EUR", "eur"), metrics: { allocation: moneyMetric({ currency: "EUR", value: "10" }), current_budget: moneyMetric({ currency: "EUR", value: "100" }) } },
      ];
    }).capitalStatements;
    render(<BudgetBar list={list} />);
    expect(screen.getAllByRole("meter").map((m) => m.getAttribute("aria-valuenow"))).toEqual(["50", "10"]);
    expect(screen.getByRole("group", { name: "Budget used" }).textContent).toContain("Real-funded · USDT");
    expect(screen.getByRole("group", { name: "Budget used" }).textContent).toContain("Paper · EUR");
  });

  it("draws no meter when a figure is absent, and says Not published rather than 0%", () => {
    render(<BudgetBar list={statements({ allocation: absentMetric({ reason_code: "SOURCE_FACTS_NOT_PUBLISHED", unit: "MONEY", currency: "USDT" }), current_budget: moneyMetric({ value: "100" }) })} />);
    expect(screen.queryByRole("meter")).toBeNull();
    expect(screen.getByRole("group", { name: "Budget used" }).textContent).toContain("Not published");
    expect(screen.getByRole("group", { name: "Budget used" }).textContent).toContain("allocation is not published");
  });

  it("draws nothing at all for statements that carry neither key", () => {
    const { container } = render(<BudgetBar list={statements({ balance_total: moneyMetric({ value: "1" }) })} />);
    expect(container.textContent).toBe("");
  });

  it("takes its own title (the 360 says 'Allocated of approved budget')", () => {
    render(<BudgetBar title="Allocated of approved budget" list={statements({ allocation: moneyMetric({ value: "1" }), current_budget: moneyMetric({ value: "2" }) })} />);
    expect(screen.getByRole("group", { name: "Allocated of approved budget" })).toBeTruthy();
  });
});

describe("ShareBar", () => {
  const share = (value: string | null) => ({
    net_pnl: moneyMetric({ value: "1" }),
    allocation_share_pct: value === null ? absentMetric({ reason_code: "SOURCE_FACTS_NOT_PUBLISHED", unit: "PERCENT", currency: null }) : { ...moneyMetric({ value }), unit: "PERCENT", currency: null },
  });
  const groups = (shares: [string, string | null][]) => datasetFor("PORTFOLIO", "pf_x", (body: Body) => {
    body.groups = shares.map(([alpha, value]) => ({ key: [{ field: "alpha_id", value: alpha }], unique_row_count: 1, totals_scope: "FULL_AUTHORIZED_FILTERED_QUERY", economic_partitions: [{ partition: partition("ACTUAL", "USDT", "actual"), metrics: share(value) }] }));
  }).groups;

  it("stacks one segment per alpha with its published share in the legend; colour is never the only cue", () => {
    render(<ShareBar groups={groups([["alpha_a", "37"], ["alpha_b", "63"]])} />);
    const stack = screen.getByRole("img", { name: /Real-funded · USDT: alpha_a 37\.00%, alpha_b 63\.00%/ });
    expect(stack.querySelectorAll(".exec-cap-seg")).toHaveLength(2);
    const legend = screen.getByRole("list", { name: "Real-funded · USDT shares" });
    expect(legend.textContent).toContain("alpha_a");
    expect(legend.textContent).toContain("37.00%");
    expect((stack.querySelectorAll(".exec-cap-seg")[0] as HTMLElement).style.width).toBe("37%");
  });

  it("counts a group that publishes no share instead of drawing it", () => {
    render(<ShareBar groups={groups([["alpha_a", "100"], ["alpha_b", null]])} />);
    expect(screen.getByRole("group", { name: "Concentration by alpha" }).textContent).toContain("1 alpha publishes no share and has no segment.");
    expect(document.querySelectorAll(".exec-cap-seg")).toHaveLength(1);
  });

  it("draws nothing for no groups", () => {
    const { container } = render(<ShareBar groups={[]} />);
    expect(container.textContent).toBe("");
  });
});
