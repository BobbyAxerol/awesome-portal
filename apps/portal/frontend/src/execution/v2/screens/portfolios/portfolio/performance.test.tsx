/**
 * Portfolio 360 Performance card (WP-F1): flow pins from the published ledger, the tabs, the typed drawdown strip, the one-sentence
 * export. Lane BFF_DOUBLE: the series route is the published fixtures behind the harness override; the ledger is the double's own.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { PF, answerPortfolios } from "../../../../../../e2e/bffDoublePortfolios";
import { readCapitalLedger } from "../../../../analytics";
import { makeApi, type Override } from "../harness.fixtures";
import { seriesBodyFor } from "../../series/seriesDouble.testbase";
import PortfolioScreen from "./index";
import { flowPins } from "./Performance";

afterEach(cleanup);

const ledgerOf = (id: string, environment: string) => readCapitalLedger(answerPortfolios("GET", `/portfolios/${id}/capital-ledger`, new URLSearchParams({ environment }))!.body);

describe("flowPins", () => {
  it("one pin per entry that moved allocated capital, signed by its direction, in the series' currency only", () => {
    const pins = flowPins(ledgerOf(PF.core, "live"), "USDT");
    // The double's core ledger: WITHDRAW 20,000 (decrease), ALLOCATE 50,000, REBALANCE (unchanged: not a flow), ALLOCATE 100,000, INITIAL 60,000.
    expect(pins.map((p) => p.value)).toEqual(["-20000.00", "50000.00", "100000.00", "60000.00"]);
    expect(new Set(pins.map((p) => p.id)).size).toBe(pins.length);
    expect(pins.every((p) => Number.isFinite(p.t))).toBe(true);
  });

  it("a bucket in another currency is not drawn on this chart, and no ledger or no currency gives no pin", () => {
    expect(flowPins(ledgerOf(PF.core, "live"), "JPY")).toEqual([]);
    expect(flowPins(ledgerOf(PF.core, "live"), null)).toEqual([]);
    expect(flowPins(null, "USDT")).toEqual([]);
    expect(flowPins(ledgerOf(PF.core, "paper"), "USDT")).toEqual([]);
    expect(flowPins(ledgerOf(PF.yen, "paper"), "JPY").map((p) => p.value)).toEqual(["18000000", "30000000"]);
  });

  it("nothing is added: the exact strings are the ledger's own", () => {
    const pins = flowPins(ledgerOf(PF.core, "live"), "USDT");
    const raw = (answerPortfolios("GET", `/portfolios/${PF.core}/capital-ledger`, new URLSearchParams({ environment: "live" }))!.body as { analytics: { data: { buckets: { entries: { amount: string }[] }[] } } }).analytics.data.buckets[0]!.entries.map((e) => e.amount);
    for (const pin of pins) expect(raw).toContain(pin.value.replace(/^-/, ""));
  });
});

describe("the Performance card", () => {
  const serving: Override = (_method, path, search) => (path === "/manager/series" ? { status: 200, body: seriesBodyFor(search, "populated") } : undefined);
  const mount = (api: ReturnType<typeof makeApi>["api"], query = "") =>
    render(<MemoryRouter initialEntries={[`/deployments/portfolios/${PF.core}${query}`]}><PortfolioScreen api={api} portfolioId={PF.core} /></MemoryRouter>);
  const card = () => screen.getByRole("region", { name: "Performance" });

  it("served: Net PnL is the default tab, NAV and Return are one press away, and each tab asks the port once for its metric", async () => {
    const harness = makeApi(serving);
    mount(harness.api, "?window=30d");
    const group = await screen.findByRole("group", { name: "Performance measure" });
    await waitFor(() => expect(within(group).getByRole("button", { name: "Net PnL" }).getAttribute("aria-pressed")).toBe("true"));
    expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual(["Net PnL", "Return", "NAV"]);
    await waitFor(() => expect(card().querySelector("[data-testid='series-caption']")?.textContent).toContain("Net PnL in USDT"));
    fireEvent.click(within(group).getByRole("button", { name: "Return" }));
    await waitFor(() => expect(card().querySelector("[data-testid='series-caption']")?.textContent).toContain("Return"));
    fireEvent.click(within(group).getByRole("button", { name: "NAV" }));
    await waitFor(() => expect(card().querySelector("[data-testid='series-caption']")?.textContent).toContain("NAV in USDT"));
    const metrics = harness.queriesOf("/manager/series").map((q) => q.get("metric"));
    expect([...new Set(metrics)].sort()).toEqual(["DRAWDOWN", "NAV", "NET_PNL", "RETURN"]);
    expect(metrics.filter((m) => m === "NAV")).toHaveLength(1);
  });

  it("the drawdown strip is the port's DRAWDOWN series of the same portfolio, environment and window; the export and report pack are sentences", async () => {
    const harness = makeApi(serving);
    mount(harness.api, "?window=30d");
    await waitFor(() => expect(card().querySelector("[data-testid='drawdown-pane']")?.textContent).toContain("-3.00%"));
    const query = harness.queriesOf("/manager/series").find((q) => q.get("metric") === "DRAWDOWN")!;
    expect(JSON.parse(query.get("subjects")!)).toEqual([{ subject_type: "PORTFOLIO", subject_id: PF.core }]);
    expect(query.get("window")).toBe("\"30D\"");
    expect(card().querySelector("[data-testid='drawdown-pane']")!.textContent).not.toContain("Not published");
    expect(card().textContent).toContain("Export: not available yet");
    // The reasons are behind disclosures (a button that opens them, by keyboard and touch), the one sentence of D20 in both.
    fireEvent.click(within(screen.getByTestId("report-pack")).getByRole("button", { name: "Report pack: not available yet, reason" }));
    expect(screen.getByTestId("report-pack").textContent).toContain("Export is not available yet.");
    fireEvent.click(within(card()).getByRole("button", { name: "Export: not available yet, reason" }));
    expect(card().textContent).toContain("Export is not available yet.");
  });

  it("draws the allocation flows of the published ledger as pins on the Net PnL line, and says what they are", async () => {
    mount(makeApi(serving).api, "?window=all");
    // ALL has no published series window; use a bounded one so the line is drawn and pins may fall inside it.
    cleanup();
    mount(makeApi(serving).api, "?window=90d");
    await waitFor(() => expect(card().querySelector("[data-testid='perf-flows-note']")).not.toBeNull());
    const note = card().querySelector("[data-testid='perf-flows-note']")!.textContent!;
    expect(note).toMatch(/allocation flows? from the published capital ledger|No allocation flow in this window/);
    if (note.startsWith("No allocation flow")) expect(card().querySelectorAll("[data-testid='flow-pin']")).toHaveLength(0);
    else expect(note).toContain("The ledger records allocations to accounts, not funding.");
  });
});
