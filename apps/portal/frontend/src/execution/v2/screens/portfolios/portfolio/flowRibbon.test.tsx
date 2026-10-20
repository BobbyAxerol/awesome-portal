/**
 * Portfolio 360 event ribbon (concept C3), against the Playwright double through
 * the real readers. The ribbon draws only what the published capital ledger can
 * place (flow); every other lane says it has no source. Per currency, bounded,
 * with a table for whoever cannot use the picture.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { PF, answerPortfolios } from "../../../../../../e2e/bffDoublePortfolios";
import { makeApi, type Override } from "../harness.fixtures";
import PortfolioScreen from "./index";
import { RIBBON_LANE_NP, ledgerFlow } from "./model";
import { readCapitalLedger } from "../../../../analytics";

afterEach(cleanup);

type Draft = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const mount = (api: ReturnType<typeof makeApi>["api"], query = "", portfolioId: string = PF.core) =>
  render(
    <MemoryRouter initialEntries={[`/deployments/portfolios/${portfolioId}${query}`]}>
      <PortfolioScreen api={api} portfolioId={portfolioId} />
    </MemoryRouter>,
  );

const ribbon = (env = "Live") => screen.findByRole("group", { name: `Capital flow events, ${env}` });
const lane = (root: HTMLElement, kind: string) => root.querySelector(`.exec-ribbon-lane[data-kind='${kind}']`) as HTMLElement;
const marks = (root: HTMLElement) => within(root).queryAllByTestId("ribbon-event");

/** The double's ledger for one environment with the buckets replaced. */
const withLedger = (buckets: Draft[], bounded: { total: number; returned: number; hasMore: boolean }, env = "live"): Override => (_m, path, query) => {
  if (!path.endsWith("/capital-ledger") || query.get("environment") !== env) return undefined;
  const base = answerPortfolios("GET", path, query)!.body as Draft;
  const data = base.analytics.data;
  return { status: 200, body: { ...base, analytics: { ...base.analytics, data: { ...data, entry_count: bounded.total, returned_entry_count: bounded.returned, has_more: bounded.hasMore, buckets } } } };
};

const entry = (i: number, direction: string, amount: string, at: string, movement = "ALLOCATE") => ({
  ledger_id: `ledger-${String(i).padStart(5, "0")}`, allocation_id: `a-${i}`, account_id: "Binance-02", movement_type: movement, direction,
  amount, before_allocated: "0", after_allocated: amount, occurred_at: at,
});

describe("ribbon under the equity", () => {
  it("sits inside the Equity panel, under the readout, as a named group of real buttons", async () => {
    mount(makeApi().api);
    const group = await ribbon();
    const equity = screen.getByRole("region", { name: "Equity" });
    expect(equity.contains(group)).toBe(true);
    expect(group.compareDocumentPosition(equity.querySelector(".exec-c2-svg")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const mark of marks(group)) expect(mark.tagName).toBe("BUTTON");
  });

  it("draws one flow mark per ledger entry that moved capital, named with the movement, the exact amount, its currency and a UTC time", async () => {
    mount(makeApi().api);
    const group = await ribbon();
    const names = marks(group).map((m) => m.getAttribute("aria-label"));
    expect(names).toContain("Flow: Withdraw, decrease: 20,000.00 USDT, 17 Oct 09:14Z");
    expect(names).toContain("Flow: Allocate, increase: 50,000.00 USDT, 17 Oct 08:40Z");
    // The Unchanged rebalance moved nothing: it is not a flow, and the page says it is left out.
    expect(names.some((n) => n?.includes("Rebalance"))).toBe(false);
    expect(screen.getByText(/1 entry left the allocation unchanged and is not drawn as a flow/)).toBeTruthy();
    expect(marks(group).every((m) => lane(group, "flow").dataset.kind === "flow" && m.dataset.kind === "flow")).toBe(true);
  });

  it("keeps stage, decision, incident and recall as lanes that say Not published, not as empty lanes", async () => {
    mount(makeApi().api);
    const group = await ribbon();
    for (const kind of ["stage", "decision", "incident", "recall"]) {
      const l = lane(group, kind);
      expect(l.dataset.unpublished).toBe("true");
      expect(l.textContent).toContain(RIBBON_LANE_NP);
      expect(l.querySelector(".exec-ribbon-lane-axis")).toBeNull();
    }
    expect(RIBBON_LANE_NP).toBe("Not published");
    // The ids are on the one line under the chart, in its title.
    expect(screen.getByTestId("not-available-line").getAttribute("title")).toContain("Not published (FE-031)");
    expect(lane(group, "flow").dataset.unpublished).toBeUndefined();
    expect(lane(group, "flow").querySelector(".exec-ribbon-lane-axis")).not.toBeNull();
    // No mark can sit on a lane with no source.
    expect(marks(group).some((m) => ["stage", "decision", "incident", "recall"].includes(m.dataset.kind ?? ""))).toBe(false);
  });

  it("says the read is bounded, with the exact numbers, and that no older page exists", async () => {
    mount(makeApi().api);
    await ribbon();
    expect(screen.getByText("Bounded: Latest 5 of 12 entries, no older page")).toBeTruthy();
    expect(screen.getByTitle(/allocation ledger entries in Live, per currency, never added together/)).toBeTruthy();
  });

  it("counts entries outside the equity window instead of hiding them", async () => {
    mount(makeApi().api);
    const group = await ribbon();
    // The double's ledger holds entries from July and August; the equity is retained for days.
    expect(within(group).getByTestId("ribbon-outside").textContent).toMatch(/^\d+ events? outside this window not drawn$/);
  });

  it("offers the same entries as a table: named, newest first, one amount per row in its own currency", async () => {
    mount(makeApi().api);
    await ribbon();
    const summary = screen.getByText(/^Flow events as a table \(\d+\)$/);
    expect(summary.tagName).toBe("SUMMARY");
    fireEvent.click(summary);
    const table = screen.getByRole("table", { name: "Capital flow events in Live" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(4);
    const cell = (r: HTMLElement, label: string) => r.querySelector(`td[data-l='${label}']`)?.textContent ?? "";
    expect(cell(rows[0]!, "Event")).toBe("Withdraw");
    expect(cell(rows[0]!, "Direction")).toBe("Decrease");
    expect(cell(rows[0]!, "Amount")).toContain("20,000.00");
    expect(cell(rows[0]!, "Amount")).toContain("USDT");
    expect(rows.map((r) => cell(r, "Time · UTC"))).toEqual([...rows.map((r) => cell(r, "Time · UTC"))].sort().reverse());
    expect(within(table).queryByText(/total/i)).toBeNull();
  });

  it("reads only the selected environment's ledger on the Overview, and the others when Allocations opens", async () => {
    const { api, calls } = makeApi();
    mount(api);
    await ribbon();
    expect(calls.filter((c) => c.includes("capital-ledger"))).toEqual([`GET /portfolios/${PF.core}/capital-ledger?environment=live`]);
    fireEvent.click(screen.getByRole("tab", { name: "Allocations" }));
    await screen.findByRole("table", { name: "Capital ledger in Live" });
    const ledgers = calls.filter((c) => c.includes("capital-ledger"));
    expect([...new Set(ledgers)].sort()).toEqual([
      `GET /portfolios/${PF.core}/capital-ledger?environment=live`,
      `GET /portfolios/${PF.core}/capital-ledger?environment=paper`,
    ]);
    // The live ledger is the same read the Overview made: once, not twice.
    expect(ledgers.filter((c) => c.endsWith("environment=live"))).toHaveLength(1);
  });
});

describe("currencies are never mixed", () => {
  const two = withLedger([
    { currency: "USDT", gross_increase: "100.00", gross_decrease: "0", entry_count: 1, entries: [entry(1, "INCREASE", "100.00", "2026-10-16T09:00:00Z")] },
    { currency: "JPY", gross_increase: "5000", gross_decrease: "0", entry_count: 1, entries: [entry(2, "INCREASE", "5000", "2026-10-17T10:00:00Z")] },
  ], { total: 2, returned: 2, hasMore: false });

  it("labels each mark with its own amount and currency and prints no sum", async () => {
    mount(makeApi(two).api);
    const group = await ribbon();
    const names = marks(group).map((m) => m.getAttribute("aria-label"));
    expect(names).toContain("Flow: Allocate, increase: 100.00 USDT, 16 Oct 09:00Z");
    expect(names).toContain("Flow: Allocate, increase: 5,000.00 JPY, 17 Oct 10:00Z");
    const notes = document.querySelector(".exec-pf-ribbon-notes")!;
    expect(notes.textContent).not.toMatch(/5,100|5100/);
    fireEvent.click(screen.getByText(/^Flow events as a table/));
    const rows = within(screen.getByRole("table", { name: "Capital flow events in Live" })).getAllByRole("row").slice(1);
    expect(rows.map((r) => r.querySelector("td[data-l='Amount']")!.textContent?.replace(/\s+/g, " ").trim())).toEqual(["5,000.00 JPY", "100.00 USDT"]);
  });

  it("opens the hover card with each entry's own detail, still without a total", async () => {
    mount(makeApi(two).api);
    const group = await ribbon();
    fireEvent.focus(marks(group)[0]!);
    const card = within(group).getByTestId("ribbon-card");
    expect(card.textContent).toMatch(/Account Binance-02/);
    expect(card.textContent).not.toMatch(/5,100/);
  });
});

describe("absences stay absences", () => {
  it("an empty ledger is a fact: no marks, the lanes still say Not published, and the page says so", async () => {
    mount(makeApi(withLedger([], { total: 0, returned: 0, hasMore: false })).api);
    const group = await ribbon();
    await waitFor(() => expect(document.body.textContent).toContain("published no entry in Live"));
    expect(marks(group)).toHaveLength(0);
    expect(lane(group, "recall").textContent).toContain(RIBBON_LANE_NP);
    expect(document.body.textContent).toContain("not a zero balance");
  });

  it("a ledger the engine refused is its own typed state, and the equity chart stands", async () => {
    const refuse: Override = (_m, path) => (path.endsWith("/capital-ledger") ? { status: 503, body: { error: { code: "ANALYTICS_ARITHMETIC_UNAVAILABLE" } } } : undefined);
    mount(makeApi(refuse).api);
    expect(await screen.findByRole("img", { name: /Core equity/ })).toBeTruthy();
    expect(await screen.findAllByText("The engine could not complete this computation.")).not.toHaveLength(0);
    expect(screen.queryByRole("group", { name: "Capital flow events, Live" })).toBeNull();
  });

  it("entries the reader could not read are counted, not silently shorter", async () => {
    const bad = withLedger([{ currency: "USDT", gross_increase: "10.00", gross_decrease: "0", entry_count: 2, entries: [
      entry(1, "INCREASE", "10.00", "2026-10-17T09:00:00Z"),
      { ...entry(2, "INCREASE", "1e5", "2026-10-17T10:00:00Z") },
    ] }], { total: 2, returned: 2, hasMore: false });
    mount(makeApi(bad).api);
    await ribbon();
    expect(screen.getByText("1 returned entry could not be read and is not shown. The ribbon is incomplete.")).toBeTruthy();
  });

  it("an entry with no time cannot sit on an axis: it is counted, not placed", async () => {
    const undated = withLedger([{ currency: "USDT", gross_increase: "10.00", gross_decrease: "0", entry_count: 2, entries: [
      entry(1, "INCREASE", "10.00", "2026-10-17T09:00:00Z"),
      { ...entry(2, "INCREASE", "20.00", "x"), occurred_at: null },
    ] }], { total: 2, returned: 2, hasMore: false });
    mount(makeApi(undated).api);
    const group = await ribbon();
    expect(marks(group)).toHaveLength(1);
    expect(screen.getByText("1 entry has no readable time and is not on the ribbon.")).toBeTruthy();
  });
});

describe("a bounded ledger of 1,500 entries", () => {
  // Hourly from 1 Oct 2026, so most of it falls inside the equity window.
  const entries = Array.from({ length: 1500 }, (_, i) =>
    entry(i, i % 3 === 0 ? "DECREASE" : "INCREASE", `${i + 1}.00`, new Date(Date.UTC(2026, 9, 1) + i * 3_600_000).toISOString().replace(/\.\d{3}Z$/, "Z")));
  const big = withLedger([{ currency: "USDT", gross_increase: "9999999.00", gross_decrease: "1.00", entry_count: 4180, entries }], { total: 4180, returned: 1500, hasMore: true });

  it("says latest 1,500 of 4,180, keeps the marks bounded, and caps the table at 200 with the exact count", async () => {
    mount(makeApi(big).api, "?window=ALL");
    const group = await ribbon();
    expect(screen.getByText("Bounded: Latest 1,500 of 4,180 entries, no older page")).toBeTruthy();
    // Marks are clustered: at most one per time bucket, never 1,500 buttons.
    expect(marks(group).length).toBeGreaterThan(0);
    expect(marks(group).length).toBeLessThanOrEqual(160);
    fireEvent.click(screen.getByText("Flow events as a table (1,500)"));
    const table = screen.getByRole("table", { name: "Capital flow events in Live" });
    expect(within(table).getAllByRole("row").slice(1)).toHaveLength(200);
    expect(screen.getByText("Showing the first 200 of 1,500 flow events. The Allocations tab holds the ledger.")).toBeTruthy();
  });
});

describe("ledgerFlow (model)", () => {
  const read = (buckets: Draft[], bounded = { total: 3, returned: 3, hasMore: false }) => {
    const base = answerPortfolios("GET", `/portfolios/${PF.core}/capital-ledger`, new URLSearchParams({ environment: "live" }))!.body as Draft;
    const data = { ...base.analytics.data, entry_count: bounded.total, returned_entry_count: bounded.returned, has_more: bounded.hasMore, buckets };
    return readCapitalLedger({ ...base, analytics: { ...base.analytics, data } })!;
  };

  it("keeps INCREASE and DECREASE, leaves UNCHANGED out and counts it, and never sums", () => {
    const flow = ledgerFlow(read([{ currency: "USDT", gross_increase: "5.00", gross_decrease: "1.00", entry_count: 3, entries: [
      entry(1, "INCREASE", "5.00", "2026-10-17T09:00:00Z"),
      entry(2, "DECREASE", "1.00", "2026-10-17T10:00:00Z", "WITHDRAW"),
      entry(3, "UNCHANGED", "0", "2026-10-17T11:00:00Z", "REBALANCE"),
    ] }]));
    expect(flow.events.map((e) => e.title)).toEqual(["Withdraw, decrease: 1.00 USDT", "Allocate, increase: 5.00 USDT"]);
    expect(flow.unchanged).toBe(1);
    expect(flow.undated).toBe(0);
    expect(flow.read).toBe(3);
    expect(flow.events.every((e) => e.kind === "flow")).toBe(true);
  });

  it("refuses a time without a zone", () => {
    const flow = ledgerFlow(read([{ currency: "USDT", gross_increase: "5.00", gross_decrease: "0", entry_count: 1, entries: [
      entry(1, "INCREASE", "5.00", "2026-10-17T09:00:00"),
    ] }], { total: 1, returned: 1, hasMore: false }));
    expect(flow.events).toHaveLength(0);
    expect(flow.undated).toBe(1);
  });
});
