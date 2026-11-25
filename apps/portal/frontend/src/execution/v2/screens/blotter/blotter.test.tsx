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
import { resolveBack } from "../../backTo";
import { loadCanonical } from "../../testkit/loadCanonical";
import { cloneRows, pad } from "../../testkit/scale";
import { useContextFactsValue } from "../../shell/contextFacts";
import { sessionOf } from "../alpha/testApi";
import BlotterScreen, { BLOTTER_SCREEN_KEY } from "./index";

const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../../../auth/session", () => ({ useSession: () => session.current }));

let calls: Call[] = [];
beforeEach(() => {
  resetOverviewDouble();
  calls = serveDoubles();
  session.current = sessionOf(["governance.r1.read"]);
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
      <FactsProbe />
    </MemoryRouter>,
  );

/** What the screen has told the context bar so far (`{}` when it has said nothing). */
function FactsProbe() {
  return <output data-testid="facts">{JSON.stringify(useContextFactsValue())}</output>;
}
const facts = (): Record<string, unknown> => JSON.parse(screen.getByTestId("facts").textContent ?? "{}");

const where = () => screen.getByTestId("where").textContent ?? "";
const search = () => new URLSearchParams(where().split("?")[1] ?? "");
const table = () => screen.getByRole("table", { name: "Orders" });
const bodyRows = () => within(table()).getAllByRole("row").slice(1).filter((r) => !r.classList.contains("exec-blt2-kid"));
const loaded = () => screen.findByRole("table", { name: "Orders" });
const cellOf = (row: HTMLElement, label: string) => row.querySelector(`td[data-l='${label}']`)?.textContent ?? "";
const idOf = (row: HTMLElement) => row.querySelector(".exec-blt2-ordercell :is(.exec-blt2-id, .exec-blt2-idlink)")?.textContent ?? "";
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

  it("says where the orders in no chip are, so the chips and that line add back up to the population", async () => {
    mount();
    await loaded();
    const rest = countOf("CANCELED", "EXPIRED");
    expect(rest).toBeGreaterThan(0);
    const line = screen.getByText(/^No chip:/);
    expect(line.textContent).toContain(`Canceled ${countOf("CANCELED")}`);
    const chips = ["FILLED", "PARTIALLY_FILLED", "REJECTED", "DENIED", "ACCEPTED", "SUBMITTED"].reduce((n, w) => n + countOf(w), 0);
    expect(chips + rest).toBe(137);
  });
});

describe("exact numbers", () => {
  it("keeps every published digit and groups thousands; a market order has no price", async () => {
    mount();
    await loaded();
    const rows = bodyRows();
    const btc = rows.find((r) => cellOf(r, "Symbol") === "BTCUSDT")!;
    expect(cellOf(btc, "Filled / Qty")).toMatch(/\/ 0\.04$/);
    expect(cellOf(btc, "Price")).toMatch(/^6\d,\d{3}(\.\d+)?$/);
    const doge = rows.find((r) => cellOf(r, "Symbol") === "DOGEUSDT")!;
    expect(cellOf(doge, "Filled / Qty")).toMatch(/\/ 1,250$/);
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

  it("at 660px and narrower the single pager sits before the table in DOM order, and still pages", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(max-width: 660px)", media: query, addEventListener: () => {}, removeEventListener: () => {},
    }));
    mount();
    await loaded();
    expect(screen.getAllByRole("button", { name: "Newer" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Older" })).toHaveLength(1);
    const pager = document.querySelector(".exec-blt2-pager")!;
    expect(document.querySelectorAll(".exec-blt2-pager")).toHaveLength(1);
    expect(pager.compareDocumentPosition(table()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.querySelector(".exec-blt2-count-line")!.compareDocumentPosition(pager) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // A phone page is ten rows, not fifty stacked cards (UXM-07 audit B #22); the keyset cursor reaches the rest.
    expect(Object.fromEntries(lastQuery()).limit).toBe("10");
    expect(bodyRows()).toHaveLength(10);
    fireEvent.click(screen.getByRole("button", { name: "Older" }));
    await waitFor(() => expect(idOf(bodyRows()[0]!)).toBe("ord_00127"));
    expect(bodyRows()).toHaveLength(10);
    fireEvent.click(screen.getByRole("button", { name: "Newer" }));
    await waitFor(() => expect(idOf(bodyRows()[0]!)).toBe("ord_00137"));
  });

  it("wide, the pager stays after the table", async () => {
    mount();
    await loaded();
    const pager = document.querySelector(".exec-blt2-pager")!;
    expect(table().compareDocumentPosition(pager) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

describe("V1 filter alias and router links (M10, M7)", () => {
  it.each(["FILLED", "PARTIAL", "REJECTED", "OPEN"])("?filter=%s is the status bucket: rewritten once to status, asked of the server, no notice", async (word) => {
    mount(`/execution/blotter?filter=${word}&env=paper`);
    await loaded();
    await waitFor(() => expect(search().get("status")).toBe(word));
    expect(search().has("filter")).toBe(false);
    expect(search().get("env")).toBe("paper");
    await waitFor(() => expect(lastQuery().get("status_bucket")).toBe(word));
    expect(screen.queryByText(/Ignored|The link asked/)).toBeNull();
  });

  it("?filter=ALL is the default and leaves nothing in the URL", async () => {
    mount("/execution/blotter?filter=ALL");
    await loaded();
    await waitFor(() => expect(where()).toBe("/execution/blotter"));
    expect(lastQuery().has("status_bucket")).toBe(false);
  });

  it("a status written in lower case is the same bucket", async () => {
    mount("/execution/blotter?status=filled");
    await loaded();
    await waitFor(() => expect(lastQuery().get("status_bucket")).toBe("FILLED"));
    expect(screen.queryByText(/Ignored/)).toBeNull();
  });

  it("an unknown filter is said and dropped, and the list is not narrowed", async () => {
    mount("/execution/blotter?filter=findings&symbol=ETHUSDT");
    await loaded();
    expect(await screen.findByText(/The link asked for filter “findings”/)).toBeTruthy();
    await waitFor(() => expect(search().has("filter")).toBe(false));
    expect(search().get("symbol")).toBe("ETHUSDT");
    expect(lastQuery().has("status_bucket")).toBe(false);
  });

  it("an unknown status is said and dropped instead of being read as All in silence", async () => {
    mount("/execution/blotter?status=Cancelled");
    await loaded();
    expect(await screen.findByText(/Ignored status “Cancelled”/)).toBeTruthy();
    await waitFor(() => expect(search().has("status")).toBe(false));
  });

  it("when status and filter disagree, status wins and the link's other word is said", async () => {
    mount("/execution/blotter?status=OPEN&filter=FILLED");
    await loaded();
    expect(await screen.findByText(/also asked for filter FILLED; status OPEN is used/)).toBeTruthy();
    expect(search().get("status")).toBe("OPEN");
    expect(search().has("filter")).toBe(false);
  });

  it("the order id and Open on chart are router links to Trade replay: context kept, from=blotter, no page reload", async () => {
    mount("/execution/blotter?env=paper&workspace_id=ws_1&order=ord_00137");
    await loaded();
    await waitFor(() => expect(document.querySelector("a.exec-blt2-link")).not.toBeNull());
    const row = bodyRows().find((r) => idOf(r) === "ord_00137")!;
    const links = [row.querySelector("a.exec-blt2-idlink")!, document.querySelector("a.exec-blt2-link")!];
    expect(links.every((l) => l !== null)).toBe(true);
    for (const link of links) {
      const url = new URL(link.getAttribute("href")!, "http://x");
      expect(url.pathname).toMatch(/^\/deployments\/alphas\//);
      expect(url.searchParams.get("tab")).toBe("Trade Replay");
      expect(url.searchParams.get("focus")).toBe("order:ord_00137");
      expect(url.searchParams.get("from")).toBe("blotter");
      expect(url.searchParams.get("env")).toBe("paper");
      expect(url.searchParams.get("workspace_id")).toBe("ws_1");
      expect(link.hasAttribute("data-discover") || link.getAttribute("href")!.startsWith("/")).toBe(true);
    }
    // A router link is handled in the page: the click is cancelled (a plain anchor would be left to the browser).
    expect(fireEvent.click(links[0]!)).toBe(false);
    await waitFor(() => expect(where()).toMatch(/^\/deployments\/alphas\//));
  });

  it("Open on chart carries the Blotter's own filters as `back`, only the allow-listed keys, so Replay's Back restores them", async () => {
    mount("/execution/blotter?env=paper&status=ALL&q=carry&sort=-ts&order=ord_00137&evil=1");
    await loaded();
    await waitFor(() => expect(document.querySelector("a.exec-blt2-link")).not.toBeNull());
    const url = new URL(document.querySelector("a.exec-blt2-link")!.getAttribute("href")!, "http://x");
    expect(url.searchParams.get("from")).toBe("blotter");
    const back = new URLSearchParams(url.searchParams.get("back") ?? "");
    expect(Object.fromEntries(back)).toEqual({ q: "carry", status: "ALL", sort: "-ts" });
    expect(resolveBack(url.searchParams, { kind: "fleet" }).to).toBe("/deployments/blotter?q=carry&status=ALL&sort=-ts");
  });

  it("with no filters on the Blotter there is no `back`, only `from=blotter`", async () => {
    mount("/execution/blotter?env=paper&order=ord_00137");
    await loaded();
    await waitFor(() => expect(document.querySelector("a.exec-blt2-link")).not.toBeNull());
    const url = new URL(document.querySelector("a.exec-blt2-link")!.getAttribute("href")!, "http://x");
    expect(url.searchParams.get("from")).toBe("blotter");
    expect(url.searchParams.has("back")).toBe(false);
  });

  it("the denied state's link is a router link that keeps the context", async () => {
    setOverviewDoubleVariants({ blotter: "denied" });
    mount("/execution/blotter?env=paper&workspace_id=ws_1", { accessHref: "/profile-access" });
    const link = await screen.findByRole("link", { name: "See what you can access" });
    expect(link.getAttribute("href")).toBe("/profile-access?env=paper&workspace_id=ws_1");
    expect(fireEvent.click(link)).toBe(false);
    await waitFor(() => expect(where()).toBe("/profile-access?env=paper&workspace_id=ws_1"));
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
    expect(fees.filter((f) => f.endsWith("BNB")).every((f) => f.startsWith("0.000421"))).toBe(true);
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
    expect(legRows.slice(1).every((r) => /^[\d,]+(\.\d+)?$/.test((r as HTMLTableRowElement).cells[1]!.textContent ?? ""))).toBe(true);
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

/** Alpha, Account and Venue are off by default (BLT-B1); a test that reads them turns them on like a user would. */
function enableColumn(name: string) {
  fireEvent.click(screen.getByRole("button", { name: "Columns" }));
  fireEvent.click(within(screen.getByRole("group", { name: "Choose columns" })).getByRole("checkbox", { name }));
}

/** Every order of the double's one book, read unscoped, so a scope's population is counted from the rows and not copied from the code under test. */
async function wholeBook() {
  const body = await (await fetch("/api/v1/execution/screens/blotter?limit=200")).json();
  return body.data.orders as Record<string, unknown>[];
}

describe("columns at mid width (QA7 N2-05)", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("at 1180px and below Time, Deployment and Avg price wait in the chooser, said on the page, and the chooser brings one back", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("min-width: 661px"), media: query, addEventListener() {}, removeEventListener() {} }));
    mount();
    await loaded();
    const heads = [...table().querySelectorAll("th")].map((th) => th.textContent ?? "");
    for (const gone of ["Time (UTC)", "Deployment", "Avg price"]) expect(heads.some((h) => h.startsWith(gone)), gone).toBe(false);
    for (const kept of ["Price", "Filled / Qty", "Fee", "Status"]) expect(heads.some((h) => h.startsWith(kept)), kept).toBe(true);
    expect(screen.getByTestId("columns-hidden").textContent).toMatch(/Time \(UTC\), Deployment, Avg price are hidden/);
    enableColumn("Avg price");
    expect([...table().querySelectorAll("th")].some((th) => (th.textContent ?? "").startsWith("Avg price"))).toBe(true);
    expect(screen.queryByTestId("columns-hidden")).toBeNull();
  });
});

describe("scope from other screens (the server narrows before paging)", () => {
  it("an account scope is sent to the server; the page, count and chips are that account's own population", async () => {
    const population = (await wholeBook()).filter((o) => o.account_id === "acc_paper_okx_01");
    expect(population.length).toBeGreaterThan(0);
    expect(population.length).toBeLessThan(137);
    mount("/execution/blotter?account=acc_paper_okx_01");
    await loaded();
    enableColumn("Account");
    expect(bodyRows()).toHaveLength(Math.min(50, population.length));
    expect(bodyRows().every((r) => cellOf(r, "Account") === "acc_paper_okx_01")).toBe(true);
    expect(countLine()).toMatch(new RegExp(`Showing\\s*${Math.min(50, population.length)}\\s*of\\s*${population.length}\\s*in this scope`));
    expect(countLine()).not.toMatch(/137/);
    const group = screen.getByRole("group", { name: "Status" });
    expect(within(group).getByRole("button", { name: new RegExp(`^All\\s*${population.length}$`) })).toBeTruthy();
    const filled = population.filter((o) => o.status === "FILLED").length;
    expect(within(group).getByRole("button", { name: new RegExp(`^Filled\\s*${filled}$`) })).toBeTruthy();
    expect(screen.getByText(/The server narrowed the blotter to this scope before paging/)).toBeTruthy();
    expect(Object.fromEntries(lastQuery())).toEqual({ limit: "50", account_id: "acc_paper_okx_01" });
    fireEvent.click(screen.getByRole("button", { name: "Remove account scope" }));
    await waitFor(() => expect(bodyRows()).toHaveLength(50));
    expect(search().get("account")).toBeNull();
    expect(Object.fromEntries(lastQuery())).toEqual({ limit: "50" });
  });

  it("an alpha scope is sent as alpha_id and lists the alpha's whole population, not the newest 50 filtered", async () => {
    const population = (await wholeBook()).filter((o) => o.strategy_id === "carry_basis_v3");
    mount("/execution/blotter?alpha=carry_basis_v3");
    await loaded();
    enableColumn("Alpha");
    expect(bodyRows().every((r) => cellOf(r, "Alpha") === "carry_basis_v3")).toBe(true);
    expect(countLine()).toMatch(new RegExp(`of\\s*${population.length}\\s*in this scope`));
    expect(lastQuery().get("alpha_id")).toBe("carry_basis_v3");
  });

  it("a deployment the book does not hold is an empty scope that says so, never the global count", async () => {
    mount("/execution/blotter?deployment=dep_x");
    await screen.findByText("This scope has no orders in the blotter.");
    expect(lastQuery().get("deployment_id")).toBe("dep_x");
    expect(document.body.textContent).not.toMatch(/Showing\s*50/);
    expect(document.body.textContent).not.toMatch(/deployment scope could not be applied/);
  });

  it("changing the scope returns to the newest page of the new population (the cursor is dropped)", async () => {
    mount("/execution/blotter");
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Older" }));
    await waitFor(() => expect(lastQuery().get("after")).not.toBeNull());
    fireEvent.change(screen.getByLabelText("Add scope"), { target: { value: "account|acc_paper_okx_01" } });
    await waitFor(() => expect(lastQuery().get("account_id")).toBe("acc_paper_okx_01"));
    expect(lastQuery().get("after")).toBeNull();
    expect(lastQuery().get("before")).toBeNull();
  });

  it("a stage the server refuses (N22_BLOTTER_STAGE_NOT_AVAILABLE) is said in words, with the way back", async () => {
    mount("/execution/blotter?env=live");
    await screen.findByText("The blotter does not serve this stage");
    expect(lastQuery().get("stage")).toBe("LIVE");
    expect(screen.getByText(/lists Paper orders only/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove the environment" }));
    await loaded();
    expect(search().get("env")).toBeNull();
  });

  it("a fill link opens its order, highlights the row and offers the chart", async () => {
    const first = "fil_00137_1";
    mount(`/execution/blotter?fill=${first}`);
    await loaded();
    await waitFor(() => expect(screen.getByText(/Opened at/).textContent).toContain(first));
    const row = bodyRows().find((r) => idOf(r) === "ord_00137")!;
    expect(row.getAttribute("data-selected")).toBe("true");
    expect(document.querySelector(".exec-blt2-kid")).toBeTruthy();
    // The link is re-serialised by withContext (a colon is %3A, a space is +); read it as a URL, not as text.
    const link = new URL(document.querySelector(".exec-blt2-link")!.getAttribute("href")!, "http://x");
    expect(link.searchParams.get("focus")).toBe("order:ord_00137");
    expect(link.searchParams.get("tab")).toBe("Trade Replay");
  });

  it("an order that no page holds says so instead of opening something else", async () => {
    mount("/execution/blotter?order=ord_99999");
    await loaded();
    await waitFor(() => expect(screen.getByText(/That order is not on the loaded page/)).toBeTruthy(), { timeout: 8000 });
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
    expect(within(table()).queryByRole("columnheader", { name: "Venue" })).toBeNull();
    fireEvent.click(within(menu).getByRole("checkbox", { name: "Venue" }));
    expect(within(table()).getByRole("columnheader", { name: "Venue" })).toBeTruthy();
    fireEvent.click(within(menu).getByRole("checkbox", { name: "Venue" }));
    expect(within(table()).queryByRole("columnheader", { name: "Venue" })).toBeNull();
  });

  it("opens with the hi-fi columns, Time as 'DD Mon HH:MM:SSZ', and Status last (BLT-B1)", async () => {
    mount();
    await loaded();
    const heads = within(table()).getAllByRole("columnheader").map((h) => h.textContent);
    expect(heads).toEqual(["Time (UTC)", "Order", "Deployment", "Symbol", "Side and type", "Price", "Filled / Qty", "Avg price", "Fee", "Status"]);
    expect(cellOf(bodyRows()[0]!, "Time (UTC)")).toMatch(/^\d{2} [A-Z][a-z]{2} \d{2}:\d{2}:\d{2}Z$/);
  });

  it("states that environment and window come from this read, and says in words what the read lacks, with no ticket id (BLT-A5, BLT-B5)", async () => {
    mount();
    await loaded();
    expect(screen.getByText(/Environment and window come from this read, not from the context bar/)).toBeTruthy();
    const body = document.body.textContent ?? "";
    expect(body).toContain("(the source does not publish them yet)");
    expect(body).not.toMatch(/FE-0\d+/);
    expect(body).not.toMatch(/no request id/i);
  });

  it("Conditional groups is a cards table, so it stacks at 390px (BLT-B2)", async () => {
    mount();
    await loaded();
    const groups = screen.getByRole("table", { name: "Conditional groups" });
    expect(groups.classList.contains("exec-cards")).toBe(true);
    expect(groups.querySelector("tbody td")?.getAttribute("data-l")).toBe("Group");
  });

  it("every cell is labelled for the cards layout", async () => {
    mount();
    await loaded();
    for (const cell of bodyRows()[0]!.querySelectorAll("td")) expect(cell.getAttribute("data-l")).toBeTruthy();
  });
});

describe("Export (the HiFi control, on served data)", () => {
  /** Captures the one file the click saves: its name and its text. No server call is made. */
  function captureDownload() {
    const blobs: Blob[] = [];
    const names: string[] = [];
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: (b: Blob) => (blobs.push(b), "blob:test"), revokeObjectURL: () => undefined }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { names.push(this.download); });
    return { names, text: () => new Promise<string>((resolve) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.readAsText(blobs[0]!); }), restore: () => click.mockRestore() };
  }

  it("saves the loaded rows as CSV: visible column labels, exact strings, UTC as shown, environment and as-of in the name, no request", async () => {
    mount();
    await loaded();
    const before = calls.length;
    const saved = captureDownload();
    const button = screen.getByRole("button", { name: "Export" });
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(document.getElementById(button.getAttribute("aria-describedby")!)!.textContent).toBe("Exports the 50 loaded rows");
    fireEvent.click(button);
    const lines = (await saved.text()).split("\r\n");
    saved.restore();
    expect(lines[0]).toBe("Time (UTC),Order,Deployment,Symbol,Side and type,Price,Filled / Qty,Avg price,Fee,Status");
    expect(lines).toHaveLength(52);
    const btc = lines.find((l) => l.includes(",BTCUSDT,"))!;
    expect(btc).toMatch(/^\d{2} [A-Z][a-z]{2} \d{2}:\d{2}:\d{2}Z,ord_\d+,,BTCUSDT,[A-Za-z]+ [A-Za-z ]+,6\d{4}\.\d{2},[0-9.,A-Za-z]* \/ 0\.0400,/);
    expect(saved.names[0]).toMatch(/^blotter-paper-\d{8}T\d{6}Z\.csv$/);
    expect(calls.length).toBe(before);
  });

  it("is not drawn when there is nothing to export", async () => {
    setOverviewDoubleVariants({ blotter: "empty" });
    mount();
    await screen.findByText(/No orders in this scope and window/);
    expect(screen.queryByRole("button", { name: "Export" })).toBeNull();
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

describe("small UX receipts (UXM-07 audit B)", () => {
  it("a three-letter contingency code is written as the code, not as a word (OUO, never Ouo)", async () => {
    mount();
    await loaded();
    const groups = screen.getByRole("table", { name: "Conditional groups" });
    expect(groups.textContent).toContain("OUO");
    expect(groups.textContent).not.toContain("Ouo");
  });

  it("Escape closes the Columns menu from its button as well as from inside it", async () => {
    mount();
    await loaded();
    const trigger = screen.getByRole("button", { name: "Columns" });
    fireEvent.click(trigger);
    expect(screen.getByRole("group", { name: "Choose columns" })).toBeTruthy();
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(screen.queryByRole("group", { name: "Choose columns" })).toBeNull();
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
    expect(screen.getByText(/As of 22 Aug 12:42:\d\dZ/)).toBeTruthy();
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

// RK-1 (DEBT-UXM07-005): the screen reads no session capability. This session holds no menu token at all; if the screen
// ever narrows from it again, the Account column, the heading and the scope chips below change and these tests fail.
describe("a session without any menu token narrows nothing", () => {
  it("states no scope to the context bar, with or without the account scope in the address", async () => {
    mount();
    await loaded();
    expect(facts()).toEqual({});
  });

  it("keeps the title, the Account column, its chooser entry and the account scope chip the server's scope asks for", async () => {
    mount("/execution/blotter?account=acc_paper_okx_01");
    await loaded();
    expect(screen.getByRole("heading", { name: "Blotter" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Your orders" })).toBeNull();
    expect(screen.queryByText("Your slice only")).toBeNull();
    expect(screen.getByRole("button", { name: "Remove account scope" })).toBeTruthy();
    // Account is an optional column: the chooser offers it and choosing it adds the column.
    expect(within(table()).queryByRole("columnheader", { name: "Account" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Columns" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Account" }));
    expect(within(table()).getByRole("columnheader", { name: "Account" })).toBeTruthy();
  });

  it("a server refusal still shows its reason and the access link", async () => {
    setOverviewDoubleVariants({ blotter: "denied" });
    mount("/execution/blotter", { accessHref: "/administration/profile-access" });
    expect(await screen.findByText("The blotter is outside what your access allows.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "See what you can access" })).toBeTruthy();
  });
});
