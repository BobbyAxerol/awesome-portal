/**
 * Portfolio 360: the PORTFOLIO SCORE tile (value, band, P / R / B, evidence, provisional, policy) and the Contributors table
 * (Net PnL, Return and Score per alpha from the portfolio's own `group_by=alpha_id` read). Both come from the Manager dataset
 * through the port; nothing is computed on the page. The Contributors read is the Overview's own model and body.
 */
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { PF } from "../../../../../../e2e/bffDoublePortfolios";
import { encodeManagerDatasetQuery, type ManagerDatasetQuery } from "../../../../api/managerDatasetQuery";
import type { ExecutionApi } from "../../../../api/ports";
import { absentMetric, moneyMetric, partition } from "../../../readers/managerDataset.testbase";
import { datasetFor, withDataset } from "../datasetFixtures.testbase";
import { makeApi } from "../harness.fixtures";
import PortfolioScreen from "./index";

afterEach(cleanup);

const mount360 = (api: ExecutionApi, query = "?env=paper&window=30d") =>
  render(<MemoryRouter initialEntries={[`/deployments/portfolios/${PF.core}${query}`]}><PortfolioScreen api={api} portfolioId={PF.core} /></MemoryRouter>);

const score = (value: string, extra: Record<string, unknown> = {}) => ({ ...moneyMetric({ value }), unit: "SCORE", currency: null, source_confidence: "VERIFIED", policy_revision: "FIXTURE_LAB", methodology_ref: "FIXTURE_LAB:direct-nav", ...extra });
const ratio = (value: string) => ({ ...moneyMetric({ value }), unit: "RATIO", currency: null });
const pct = (value: string) => ({ ...moneyMetric({ value }), unit: "PERCENT", currency: null });

/** The portfolio group carries the score keys; the alpha groups carry net_pnl, return and the raw alpha score under `score`. */
function answer(asked: ManagerDatasetQuery[], options: { provisional?: boolean } = {}) {
  return withDataset(makeApi().api, (query) => {
    asked.push(query as ManagerDatasetQuery);
    const byAlpha = query.groupBy?.[0] === "alpha_id";
    return datasetFor("PORTFOLIO", PF.core, (body: any) => {
      if (!byAlpha) {
        const entry = body.groups[0].economic_partitions[0];
        Object.assign(entry.metrics, {
          portfolio_score: score("82.8", options.provisional ? { source_confidence: "PROVISIONAL" } : {}),
          portfolio_score_p: score("80"), portfolio_score_r: score("85"), portfolio_score_b: score("83"),
          portfolio_score_evidence: ratio("0.9712"),
        });
        return;
      }
      const group = (alpha: string, metrics: Record<string, unknown>) => ({
        key: [{ field: "alpha_id", value: alpha }], unique_row_count: 1, totals_scope: body.groups[0].totals_scope,
        economic_partitions: [{ partition: partition("PAPER", "USDT", "u"), metrics }],
      });
      body.groups = [
        group("alpha_trend", { net_pnl: moneyMetric({ value: "320.5" }), return_30d_pct: pct("3.2"), score: score("88.1") }),
        group("alpha_grid", { net_pnl: moneyMetric({ value: "-40" }), return_30d_pct: pct("-0.4"), score: absentMetric({ unit: "SCORE", currency: null, reason_code: "INSUFFICIENT_EVIDENCE" }) }),
        group("alpha_flat", { net_pnl: moneyMetric({ value: "0" }), return_30d_pct: pct("0"), score: score("0") }),
      ];
      body.page.returned_count = 2;
    });
  }, asked);
}

const tile = (label: string) => within(screen.getByRole("group", { name: "Portfolio identity" })).getByText(label).closest("div") as HTMLElement;

describe("Portfolio score tile", () => {
  it("prints the published value, its band, P / R / B, evidence and the policy label", async () => {
    mount360(answer([]));
    await screen.findByRole("tablist", { name: "Portfolio sections" }, { timeout: 5000 });
    await waitFor(() => expect(screen.getByRole("group", { name: "Portfolio identity" }).querySelector(".exec-pf-score")).not.toBeNull());
    const text = tile("Portfolio score").textContent ?? "";
    expect(text).toContain("82.80");
    expect(text).toContain("Good");
    expect(text).toContain("Evidence 97%");
    expect(text).toContain("FIXTURE_LAB");
    expect(text).toContain("P 80.00");
    expect(text).toContain("R 85.00");
    expect(text).toContain("B 83.00");
    expect(text).toContain("Direct from NAV, window 30D");
    expect(text).not.toContain("Provisional");
    // The score is named once: the one-line gap list no longer carries it.
    expect(screen.getByTestId("not-available-line").textContent).not.toContain("Score");
  });

  it("a provisional score wears the badge and keeps its numeric band", async () => {
    mount360(answer([], { provisional: true }));
    await screen.findByRole("tablist", { name: "Portfolio sections" }, { timeout: 5000 });
    await waitFor(() => expect(tile("Portfolio score").textContent).toContain("Provisional"));
    expect(tile("Portfolio score").textContent).toContain("Good");
  });

  it("with no served dataset the tile keeps Not published (FE-011) and the line names Score", async () => {
    mount360(withDataset(makeApi().api, null));
    await screen.findByRole("tablist", { name: "Portfolio sections" }, { timeout: 5000 });
    await waitFor(() => expect(tile("Portfolio score").textContent).toContain("Not published (FE-011)"));
    expect(screen.getByTestId("not-available-line").textContent).toContain("Score");
  });
});

describe("Contributors", () => {
  it("asks the portfolio dataset grouped by alpha_id for the same environment and window: exact wire", async () => {
    const asked: ManagerDatasetQuery[] = [];
    mount360(answer(asked));
    await screen.findByRole("table", { name: "Contributors by alpha" }, { timeout: 5000 });
    const grouped = asked.find((query) => query.groupBy?.[0] === "alpha_id")!;
    expect(encodeManagerDatasetQuery(grouped)).toEqual({
      path: `/manager/portfolios/${PF.core}/overview`,
      wire: { environment: "live", window: "\"30D\"", group_by: "alpha_id", limit: "1", workspace_id: "workspace_execution_manager" },
    });
  });

  it("one line per alpha with Amount, Return and Score; a typed absence for the score; a true zero stays a value", async () => {
    mount360(answer([]));
    const table = await screen.findByRole("table", { name: "Contributors by alpha" }, { timeout: 5000 });
    expect([...table.querySelectorAll("thead th")].map((th) => th.textContent)).toEqual(["Alpha", "Partition", "Rows", "Amount", "Return", "Score"]);
    const row = (alpha: string) => [...table.querySelectorAll("tbody tr")].find((tr) => tr.textContent?.toLowerCase().includes(alpha)) as HTMLElement;
    expect(row("alpha_trend").textContent).toContain("+320.50 USDT");
    expect(row("alpha_trend").textContent).toMatch(/\+3\.2/);
    expect(row("alpha_trend").textContent).toContain("88.1");
    expect(row("alpha_grid").textContent).toContain("-40.00 USDT");
    expect(row("alpha_grid").textContent).toContain("Not available");
    expect(row("alpha_flat").textContent).toContain("0.00 USDT");
    expect(row("alpha_flat").querySelector("[data-zero='true']")).not.toBeNull();
  });

  it("is a typed absence, not an empty panel, when the dataset is not served", async () => {
    mount360(withDataset(makeApi().api, null));
    await screen.findByRole("tablist", { name: "Portfolio sections" }, { timeout: 5000 });
    await waitFor(() => expect(screen.getByRole("region", { name: "Contributors" }).textContent).toMatch(/not served|not published|not asked/i));
    expect(screen.queryByRole("table", { name: "Contributors by alpha" })).toBeNull();
  });
});
