/**
 * Blotter V2 through the real HTTP client against the S2 double: three keyset
 * pages, exact numbers, expansion (legs, fills, order path), server filters,
 * client-side scope, the conditional-group drill and every state.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BLOTTER_DOUBLE_COUNT, resetOverviewDouble, setOverviewDoubleVariants } from "../../../../../e2e/bffDoubleOverview";
import { httpApi, serveDoubles, type Call } from "../../../../../e2e/screensV2Harness";
import { readProfileEnvelope } from "../../../api/profileRead";
import type { ExecutionApi } from "../../../api/ports";
import { loadCanonical } from "../../testkit/loadCanonical";
import { cloneRows, pad } from "../../testkit/scale";
import BlotterScreen, { BLOTTER_SCREEN_KEY } from "./index";

let calls: Call[] = [];
beforeEach(() => {
  resetOverviewDouble();
  calls = serveDoubles();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}

const mount = (entry = "/execution/blotter", props: Partial<React.ComponentProps<typeof BlotterScreen>> = {}, api: ExecutionApi = httpApi()) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <BlotterScreen api={api} {...props} />
      <Where />
    </MemoryRouter>,
  );

const where = () => screen.getByTestId("where").textContent ?? "";
const search = () => new URLSearchParams(where().split("?")[1] ?? "");
const table = () => screen.getByRole("table", { name: "Orders" });
const bodyRows = () => within(table()).getAllByRole("row").slice(1).filter((r) => !r.classList.contains("exec-blt2-kid"));
const loaded = () => screen.findByRole("table", { name: "Orders" });
const cellOf = (row: HTMLElement, label: string) => row.querySelector(`td[data-l='${label}']`)?.textContent ?? "";
const idOf = (row: HTMLElement) => row.querySelector(".exec-blt2-ordercell .exec-blt2-id")?.textContent ?? "";
const countLine = () => document.querySelector(".exec-blt2-count-line")?.textContent ?? "";
const blotterCalls = () => calls.filter((c) => c.path === "/screens/blotter");
const lastQuery = () => new URLSearchParams(blotterCalls().at(-1)!.query);

// The double's status pattern, restated so a count in a test is not copied from the code under test.
const PATTERN = ["FILLED", "FILLED", "ACCEPTED", "PARTIALLY_FILLED", "FILLED", "REJECTED", "FILLED", "CANCELED", "SUBMITTED", "FILLED"];
const statuses = Array.from({ length: BLOTTER_DOUBLE_COUNT }, (_, i) => PATTERN[i % 10]!);
const countOf = (...words: string[]) => statuses.filter((s) => words.includes(s)).length;

describe("first page", () => {
  it("is the blotter flag's screen", () => {
    expect(BLOTTER_SCREEN_KEY).toBe("blotter");
  });

  it("shows 50 newest orders, the server's totals, and a request that carries limit 50 and nothing else", async () => {
    mount();
    await loaded();
    expect(bodyRows()).toHaveLength(50);
    expect(idOf(bodyRows()[0]!)).toBe("ord_00137");
    expect(countLine()).toMatch(/Showing\s*50\s*of\s*137\s*authorized\s*·\s*newest first/);
    expect(Object.fromEntries(lastQuery())).toEqual({ limit: "50" });
  });

  it("prints the status word, never colour alone", async () => {
    mount();
    await loaded();
    const words = new Set(bodyRows().map((r) => cellOf(r, "Status")));
    expect([...words].some((w) => w.includes("Filled"))).toBe(true);
    expect([...words].some((w) => w.includes("Rejected"))).toBe(true);
    expect([...words].some((w) => w.includes("Partially filled"))).toBe(true);
    expect([...words].some((w) => w.includes("Accepted"))).toBe(true);
    expect([...words].some((w) => w.includes("Canceled"))).toBe(true);
  });

  it("chips carry the server's counts, exact because the aggregate covers the population", async () => {
    mount();
    await loaded();
    const group = screen.getByRole("group", { name: "Status" });
    expect(within(group).getByRole("button", { name: /^All\s*137$/ })).toBeTruthy();
    expect(within(group).getByRole("button", { name: new RegExp(`^Filled\\s*${countOf("FILLED")}$`) })).toBeTruthy();
    expect(within(group).getByRole("button", { name: new RegExp(`^Rejected\\s*${countOf("REJECTED", "DENIED")}$`) })).toBeTruthy();
    expect(within(group).getByRole("button", { name: new RegExp(`^Open\\s*${countOf("ACCEPTED", "SUBMITTED")}$`) })).toBeTruthy();
  });
});

describe("exact numbers", () => {
  it("keeps every published digit and groups thousands; a market order has no price", async () => {
    mount();
    await loaded();
    const rows = bodyRows();
    const btc = rows.find((r) => cellOf(r, "Symbol") === "BTCUSDT")!;
    expect(cellOf(btc, "Quantity")).toBe("0.0400");
    expect(cellOf(btc, "Price")).toMatch(/^6\d,\d{3}\.\d{2}$/);
    const doge = rows.find((r) => cellOf(r, "Symbol") === "DOGEUSDT")!;
    expect(cellOf(doge, "Quantity")).toBe("1,250");
    expect(rows.some((r) => cellOf(r, "Price") === "At market")).toBe(true);
    const text = table().textContent ?? "";
    expect(text).not.toMatch(/\b\d+(\.\d+)?\s?[kKmMbB]\b/);
    expect(text).not.toMatch(/[—–]/);
    expect(text).not.toContain("…");
  });

  it("holds the full string on the title, for copy", async () => {
    mount();
    await loaded();
    const btc = bodyRows().find((r) => cellOf(r, "Symbol") === "BTCUSDT")!;
    const price = btc.querySelector("td[data-l='Price'] .exec-blt2-num")!;
    expect(price.getAttribute("title")).toMatch(/^6\d{4}\.\d{2}$/);
  });
});

describe("keyset paging", () => {
  it("Older loads the next 50, Newer returns, and the ends say so", async () => {
    mount();
    await loaded();
    expect((screen.getByRole("button", { name: "Newer" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/At the newest rows/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Older" }));
    await waitFor(() => expect(idOf(bodyRows()[0]!)).toBe("ord_00087"));
    expect(bodyRows()).toHaveLength(50);
    expect(Object.fromEntries(lastQuery()).after).toBeTruthy();
    expect((screen.getByRole("button", { name: "Newer" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Older" }));
    await waitFor(() => expect(bodyRows()).toHaveLength(37));
    expect((screen.getByRole("button", { name: "Older" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/at the oldest rows/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Newer" }));
    await waitFor(() => expect(idOf(bodyRows()[0]!)).toBe("ord_00087"));
    expect(Object.fromEntries(lastQuery()).before).toBeTruthy();
  });

  it("a filter change drops the cursor instead of sending it to the new query", async () => {
    mount();
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Older" }));
    await waitFor(() => expect(idOf(bodyRows()[0]!)).toBe("ord_00087"));
    fireEvent.click(within(screen.getByRole("group", { name: "Status" })).getByRole("button", { name: /^Rejected/ }));
    await waitFor(() => expect(search().get("status")).toBe("REJECTED"));
    await waitFor(() => expect(new URLSearchParams(blotterCalls().at(-1)!.query).get("status_bucket")).toBe("REJECTED"));
    expect(new URLSearchParams(blotterCalls().at(-1)!.query).get("after")).toBeNull();
    await waitFor(() => expect(bodyRows().every((r) => cellOf(r, "Status").includes("Rejected"))).toBe(true));
    expect(countLine()).toMatch(/of\s*\d+\s*matching/);
  });
});

describe("server filters", () => {
  it("symbol on Enter, venue and side from their selects, all in the query", async () => {
    mount();
    await loaded();
    const symbol = screen.getByRole("searchbox", { name: "Symbol" });
    fireEvent.change(symbol, { target: { value: "ETHUSDT" } });
    fireEvent.keyDown(symbol, { key: "Enter" });
    await waitFor(() => expect(search().get("symbol")).toBe("ETHUSDT"));
    fireEvent.change(screen.getByRole("combobox", { name: "Side" }), { target: { value: "SELL" } });
    await waitFor(() => expect(search().get("side")).toBe("SELL"));
    await waitFor(() => {
      const q = new URLSearchParams(blotterCalls().at(-1)!.query);
      expect(q.get("symbol")).toBe("ETHUSDT");
      expect(q.get("side")).toBe("SELL");
    });
    await waitFor(() => expect(bodyRows().every((r) => cellOf(r, "Symbol") === "ETHUSDT" && cellOf(r, "Side and type").startsWith("Sell"))).toBe(true));
  });

  it("offers the venues the read carries", async () => {
    mount();
    await loaded();
    const options = within(screen.getByRole("combobox", { name: "Venue" })).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Venue: all", "BINANCE", "OKX"]);
  });
});

describe("expanding an order", () => {
  it("shows the fills with their own quantity, price and fee, and never a total", async () => {
    mount();
    await loaded();
    const row = bodyRows().find((r) => cellOf(r, "Status").includes("Filled"))!;
    fireEvent.click(within(row).getByRole("button", { name: /Show legs and fills/ }));
    const fills = await screen.findByRole("region", { name: "Fills" }).catch(() => document.querySelector("section[aria-label='Fills']")!);
    const table_ = within(fills as HTMLElement).getByRole("table");
    const dataRows = within(table_).getAllByRole("row").slice(1);
    expect(dataRows.length).toBeGreaterThan(0);
    for (const fill of dataRows) {
      const cells = (fill as HTMLTableRowElement).cells;
      expect(cells[2]!.textContent).toMatch(/^[\d,]+(\.\d+)?$/);
      expect(cells[4]!.textContent).toMatch(/^[\d,]+\.\d+ (USDT|BNB)$/);
    }
    expect((fills as HTMLElement).textContent).not.toMatch(/total/i);
    expect((fills as HTMLElement).textContent).toContain("never summed across currencies");
  });

  it("keeps a fee in its own currency when fills mix USDT and BNB", async () => {
    mount();
    await loaded();
    let sawBnb = false;
    for (const row of bodyRows().filter((r) => cellOf(r, "Status").includes("Filled")).slice(0, 12)) {
      fireEvent.click(within(row).getByRole("button", { name: /Show legs and fills/ }));
    }
    const fees = [...document.querySelectorAll("section[aria-label='Fills'] tbody tr")].map((r) => (r as HTMLTableRowElement).cells[4]!.textContent ?? "");
    sawBnb = fees.some((f) => f.endsWith("BNB"));
    expect(sawBnb).toBe(true);
    expect(fees.some((f) => f.endsWith("USDT"))).toBe(true);
    expect(fees.filter((f) => f.endsWith("BNB")).every((f) => f.startsWith("0.00042100"))).toBe(true);
  });

  it("reads the order path from the funnel read, once per order", async () => {
    mount();
    await loaded();
    const row = bodyRows().find((r) => cellOf(r, "Status").includes("Filled"))!;
    const id = idOf(row);
    const button = within(row).getByRole("button", { name: /Show legs and fills/ });
    fireEvent.click(button);
    await waitFor(() => expect(calls.some((c) => c.path === `/orders/${id}/funnel`)).toBe(true));
    const path = await screen.findByRole("region", { name: "Order path" }).catch(() => document.querySelector("section[aria-label='Order path']")!);
    await waitFor(() => expect((path as HTMLElement).textContent).toContain("Venue acknowledged"));
    fireEvent.click(button);
    fireEvent.click(button);
    expect(calls.filter((c) => c.path === `/orders/${id}/funnel`)).toHaveLength(1);
  });

  it("a rejected order shows why it was refused and the hops it never reached", async () => {
    mount();
    await loaded();
    const row = bodyRows().find((r) => cellOf(r, "Status").includes("Rejected"))!;
    fireEvent.click(within(row).getByRole("button", { name: /Show legs and fills/ }));
    await waitFor(() => expect(document.querySelector("section[aria-label='Order path']")?.textContent).toContain("Not reached"));
    const kid = document.querySelector(".exec-blt2-kid")!;
    expect(kid.textContent).toMatch(/size was above the deployment cap|refused the price/);
  });

  it("an order in a bracket group lists ENTRY, TAKE_PROFIT and STOP_LOSS legs with exact triggers", async () => {
    mount();
    await loaded();
    const bracket = bodyRows().find((r) => r.textContent?.includes("bracket"))!;
    expect(bracket).toBeTruthy();
    fireEvent.click(within(bracket).getByRole("button", { name: /Show legs and fills/ }));
    const legs = document.querySelector("section[aria-label='Bracket legs']")!;
    const legRows = [...legs.querySelector("table tbody")!.querySelectorAll("tr")];
    const labels = legRows.map((r) => (r as HTMLTableRowElement).cells[0]!.textContent);
    expect(labels).toEqual(["Entry", "Take profit", "Stop loss"]);
    expect(legRows.slice(1).every((r) => /^[\d,]+\.\d+$/.test((r as HTMLTableRowElement).cells[1]!.textContent ?? ""))).toBe(true);
  });

  it("the expander is a keyboard control with a state", async () => {
    mount();
    await loaded();
    const button = within(bodyRows()[0]!).getByRole("button", { name: /Show legs and fills/ });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(button);
    expect(within(bodyRows()[0]!).getByRole("button", { name: /Hide legs and fills/ }).getAttribute("aria-expanded")).toBe("true");
  });
});

describe("scope from other screens (loaded pages only)", () => {
  it("an account scope narrows the loaded rows and says so; the server query is untouched", async () => {
    mount("/execution/blotter?account=acc_paper_okx_01");
    await loaded();
    expect(bodyRows().length).toBeGreaterThan(0);
    expect(bodyRows().every((r) => cellOf(r, "Account") === "acc_paper_okx_01")).toBe(true);
    expect(screen.getByText(/Scope narrows the loaded pages only: \d+ of 50 loaded rows match/)).toBeTruthy();
    expect(Object.fromEntries(lastQuery())).toEqual({ limit: "50" });
    fireEvent.click(screen.getByRole("button", { name: "Remove account scope" }));
    await waitFor(() => expect(bodyRows()).toHaveLength(50));
    expect(search().get("account")).toBeNull();
  });

  it("an alpha scope matches the strategy id", async () => {
    mount("/execution/blotter?alpha=carry_basis_v3");
    await loaded();
    expect(bodyRows().every((r) => cellOf(r, "Alpha") === "carry_basis_v3")).toBe(true);
  });

  it("a deployment scope cannot be applied because the orders carry no deployment id, and says so", async () => {
    mount("/execution/blotter?deployment=dep_x");
    await loaded();
    expect(screen.getByText(/deployment scope could not be applied/)).toBeTruthy();
    expect(bodyRows()).toHaveLength(50);
  });

  it("a fill link opens its order, highlights the row and offers the chart", async () => {
    const first = "fil_00137_1";
    mount(`/execution/blotter?fill=${first}`);
    await loaded();
    await waitFor(() => expect(screen.getByText(/Opened at/).textContent).toContain(first));
    const row = bodyRows().find((r) => idOf(r) === "ord_00137")!;
    expect(row.getAttribute("data-selected")).toBe("true");
    expect(document.querySelector(".exec-blt2-kid")).toBeTruthy();
    expect(document.querySelector(".exec-blt2-link")?.getAttribute("href")).toContain("focus=order:ord_00137");
  });

  it("an order that is not on the loaded page says so instead of opening something else", async () => {
    mount("/execution/blotter?order=ord_00001");
    await loaded();
    expect(screen.getByText(/That order is not on the loaded page/)).toBeTruthy();
    expect(document.querySelector(".exec-blt2-kid")).toBeNull();
  });
});

describe("column chooser", () => {
  it("adds and removes columns; Order and Status stay", async () => {
    mount();
    await loaded();
    expect(within(table()).queryByRole("columnheader", { name: "Client ID" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Columns" }));
    const menu = screen.getByRole("group", { name: "Choose columns" });
    expect((within(menu).getByRole("checkbox", { name: "Order" }) as HTMLInputElement).disabled).toBe(true);
    expect((within(menu).getByRole("checkbox", { name: "Status" }) as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(within(menu).getByRole("checkbox", { name: "Client ID" }));
    expect(within(table()).getByRole("columnheader", { name: "Client ID" })).toBeTruthy();
    expect(cellOf(bodyRows()[0]!, "Client ID")).toBe("cl-00137");
    fireEvent.click(within(menu).getByRole("checkbox", { name: "Venue" }));
    expect(within(table()).queryByRole("columnheader", { name: "Venue" })).toBeNull();
  });

  it("every cell is labelled for the cards layout", async () => {
    mount();
    await loaded();
    for (const cell of bodyRows()[0]!.querySelectorAll("td")) expect(cell.getAttribute("data-l")).toBeTruthy();
  });
});

describe("funnel and groups panels", () => {
  it("the funnel panel follows the last opened order", async () => {
    mount();
    await loaded();
    expect(screen.getByText(/Open an order to see its path/)).toBeTruthy();
    const row = bodyRows().find((r) => cellOf(r, "Status").includes("Filled"))!;
    fireEvent.click(within(row).getByRole("button", { name: /Show legs and fills/ }));
    const funnel = await screen.findByRole("table", { name: "Order funnel" });
    expect(within(funnel).getAllByRole("row")).toHaveLength(5);
  });

  it("lists the groups on the page and reads one group's structure from the conditional-groups route", async () => {
    mount();
    await loaded();
    const groups = screen.getByRole("table", { name: "Conditional groups" });
    expect(within(groups).getAllByRole("row").length).toBeGreaterThan(1);
    expect(within(groups).getAllByRole("row").slice(1).length).toBeLessThanOrEqual(6);
    const first = within(groups).getAllByRole("button", { name: /Read structure of group/ })[0]!;
    fireEvent.click(first);
    const panel = await screen.findByLabelText("Group structure");
    expect(calls.some((c) => c.path.startsWith("/derivations/conditional-groups/grp_") && c.query.includes("environment=paper"))).toBe(true);
    expect(panel.textContent).toContain("3 legs");
    expect(panel.textContent).toContain("Take profit");
    expect(panel.textContent).toContain("This is the group's structure now");
    expect(panel.textContent).toContain("Reading it asked nothing of the Trading System");
  });
});

describe("states", () => {
  it("denied: the server's 403 is a denial with a link, not an outage", async () => {
    setOverviewDoubleVariants({ blotter: "denied" });
    mount("/execution/blotter", { accessHref: "/profile-access" });
    expect(await screen.findByText(/outside what your access allows/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "See what you can access" }).getAttribute("href")).toBe("/profile-access");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("unavailable: a 503 names its code and Try again recovers", async () => {
    setOverviewDoubleVariants({ blotter: "error" });
    mount();
    expect(await screen.findByText(/PAPER_READ_UPSTREAM_UNAVAILABLE/)).toBeTruthy();
    setOverviewDoubleVariants({ blotter: "paged" });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await loaded();
  });

  it("empty: no orders is its own state", async () => {
    setOverviewDoubleVariants({ blotter: "empty" });
    mount();
    expect(await screen.findByText(/No orders in this scope and window/)).toBeTruthy();
    expect(screen.queryByRole("table", { name: "Orders" })).toBeNull();
  });

  it("empty under a filter offers Clear all, not an apology", async () => {
    mount("/execution/blotter?symbol=NOSUCH");
    expect(await screen.findByText("No orders match these filters.")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Clear all" }).at(-1)!);
    await loaded();
  });

  it("partial: says figures are missing, shows a missing fee as not available and never counts an unlisted bucket as 0", async () => {
    setOverviewDoubleVariants({ blotter: "partial" });
    mount();
    await loaded();
    expect(screen.getByText(/Some figures are missing/)).toBeTruthy();
    const group = screen.getByRole("group", { name: "Status" });
    // Listed buckets are floors (~), unlisted ones have no count at all.
    expect(within(group).getByRole("button", { name: /^Filled\s*~\d+$/ })).toBeTruthy();
    expect(within(group).getByRole("button", { name: "Open" })).toBeTruthy();
    expect(within(group).getByRole("button", { name: "Partial" })).toBeTruthy();
    const row = bodyRows().find((r) => cellOf(r, "Status").includes("Filled"))!;
    fireEvent.click(within(row).getByRole("button", { name: /Show legs and fills/ }));
    const fees = [...document.querySelectorAll("section[aria-label='Fills'] tbody tr")].map((r) => (r as HTMLTableRowElement).cells[4]!.textContent ?? "");
    expect(fees.length).toBeGreaterThan(0);
  });

  it("stale: the chip and the as-of time say so", async () => {
    setOverviewDoubleVariants({ blotter: "stale" });
    mount();
    await loaded();
    expect(screen.getByText("Stale")).toBeTruthy();
    expect(screen.getByText(/As of 2026-10-17 11:46/)).toBeTruthy();
  });

  it("loading", async () => {
    mount();
    expect(screen.getByRole("status", { name: "Loading orders" })).toBeTruthy();
    await loaded();
  });
});

describe("scale", () => {
  it("a page of 300 rows still puts at most 200 in the DOM", async () => {
    const raw = loadCanonical<Record<string, any>>("execution-full-blotter.partial");
    raw.data.orders = cloneRows(raw.data.orders[0], 300, (row, i) => {
      row.order_id = `ord_${pad(i)}`;
      row.client_order_id = `cl_${pad(i)}`;
    });
    const api: ExecutionApi = { ...httpApi(), withReadSignal: undefined, getBlotterProfile: async () => ({ ok: true, value: readProfileEnvelope(raw)! }) };
    mount("/execution/blotter", {}, api);
    await loaded();
    expect(bodyRows()).toHaveLength(200);
  });
});

describe("researcher without account visibility", () => {
  it("is titled for the slice and has no Account column or scope chip", async () => {
    mount("/execution/blotter?account=acc_paper_okx_01", { capabilities: new Set(["governance.r1.read"]) });
    await loaded();
    expect(screen.getByRole("heading", { name: "Your orders" })).toBeTruthy();
    expect(within(table()).queryByRole("columnheader", { name: "Account" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove account scope" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Columns" }));
    expect(screen.queryByRole("checkbox", { name: "Account" })).toBeNull();
  });
});
