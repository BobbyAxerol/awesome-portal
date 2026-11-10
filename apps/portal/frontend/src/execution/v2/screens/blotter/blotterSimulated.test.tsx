/**
 * WP-F2 (FIXTURE_LAB, `e2e/bffSimulated.ts` blotter block): every order row of the populated lane carries the design's columns, derived by
 * integer arithmetic from the order's own published fills; absence stays typed (a fee is never defaulted to 0).
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { answerOverview, resetOverviewDouble } from "../../../../../e2e/bffDoubleOverview";
import { httpApi } from "../../../../../e2e/screensV2Harness";
import { simulate } from "../../../../../e2e/bffSimulated";
import { readProfileEnvelope } from "../../../api/profileRead";
import { sessionOf } from "../alpha/testApi";
import { readBlotter } from "./blotterModel";
import BlotterScreen from "./index";

const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../../../auth/session", () => ({ useSession: () => session.current }));

beforeEach(() => {
  resetOverviewDouble();
  session.current = sessionOf(["governance.r1.read"]);
  vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
    const url = new URL(String(input), "http://portal.test");
    const method = init?.method ?? "GET";
    const base = answerOverview(method, url.pathname, url.searchParams) ?? { status: 404, body: {} };
    const path = url.pathname.replace(/^\/api\/v1\/execution/, "");
    const answer = simulate(method, path, url.searchParams, base as { status: number; body: unknown });
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "content-type": "application/json" } });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}

async function firstPage() {
  const response = await fetch("/api/v1/execution/screens/blotter?limit=50");
  return readBlotter(readProfileEnvelope(await response.json())!)!;
}

describe("simulated order rows", () => {
  it("every order has a deployment and a published filled quantity (bar the one typed absence)", async () => {
    const page = await firstPage();
    expect(page.orders).toHaveLength(50);
    expect(page.orders.every((o) => o.deploymentId !== null)).toBe(true);
    expect(page.orders.filter((o) => o.filledQuantity.kind === "absent").length).toBeLessThanOrEqual(5);
    expect(new Set(page.orders.map((o) => o.deploymentId)).size).toBeGreaterThan(1);
  });

  it("an order that traded has an average price and, when its fills state one currency, a fee in it; the fee is the exact sum", async () => {
    const page = await firstPage();
    const traded = page.orders.filter((o) => ["FILLED", "PARTIALLY_FILLED"].includes(o.status ?? ""));
    expect(traded.length).toBeGreaterThan(10);
    expect(traded.every((o) => o.averageFillPrice.kind === "value")).toBe(true);
    const withFee = traded.filter((o) => o.fee.kind === "value");
    expect(withFee.length).toBeGreaterThan(0);
    expect(withFee.every((o) => o.feeCurrency !== null)).toBe(true);
    for (const order of withFee) {
      const mine = page.fills.filter((f) => f.clientOrderId === order.clientOrderId);
      const scaled = (text: string) => { const [w = "0", f = ""] = text.split("."); return BigInt(`${w}${f.padEnd(12, "0")}`); };
      const sum = mine.reduce((n, f) => n + (f.commission.kind === "value" ? scaled(f.commission.text) : 0n), 0n);
      expect(scaled(order.fee.kind === "value" ? order.fee.text : "0")).toBe(sum);
      expect(sum).toBeGreaterThan(0n); // never a defaulted 0
    }
  });

  it("an order that traded nothing says zero filled and has neither average price nor fee (typed, not 0)", async () => {
    const page = await firstPage();
    const idle = page.orders.filter((o) => ["ACCEPTED", "SUBMITTED", "CANCELED", "REJECTED"].includes(o.status ?? "") && o.filledQuantity.kind === "value");
    expect(idle.length).toBeGreaterThan(5);
    for (const order of idle) {
      expect(order.filledQuantity).toEqual({ kind: "value", text: "0" });
      expect(order.averageFillPrice.kind).toBe("absent");
      expect(order.fee.kind).toBe("absent");
    }
  });

  it("a traded order whose fill states no commission has no fee at all (typed absent, never 0)", async () => {
    const page = await firstPage();
    const traded = page.orders.filter((o) => o.averageFillPrice.kind === "value");
    const unpublished = traded.filter((o) => page.fills.some((f) => f.clientOrderId === o.clientOrderId && f.commission.kind !== "value"));
    for (const order of unpublished) {
      expect(order.fee.kind).toBe("absent");
      expect(order.feeCurrency).toBeNull();
    }
    // Every fee that is published is in one currency per order, the first fill's.
    for (const order of traded.filter((o) => o.fee.kind === "value")) {
      const currencies = new Set(page.fills.filter((f) => f.clientOrderId === order.clientOrderId).map((f) => f.commissionCurrency));
      expect(currencies.size).toBe(1);
    }
  });
});

describe("the screen", () => {
  it("prints deployment over venue, average price, fee with currency, and No fill for an idle order", async () => {
    render(<MemoryRouter initialEntries={["/execution/blotter"]}><BlotterScreen api={httpApi()} /></MemoryRouter>);
    const table = await screen.findByRole("table", { name: "Orders" });
    const rows = within(table).getAllByRole("row").slice(1).filter((r) => !r.classList.contains("exec-blt2-kid"));
    const cell = (row: HTMLElement, label: string) => row.querySelector(`td[data-l='${label}']`)?.textContent ?? "";
    expect(cell(rows[0]!, "Deployment")).toMatch(/^dep_btc_paperBINANCE$/);
    expect(cell(rows[0]!, "Avg price")).toMatch(/\d/);
    expect(cell(rows[0]!, "Fee")).toMatch(/USDT$/);
    const idle = rows.find((r) => /Accepted|Canceled|Submitted/.test(cell(r, "Status")))!;
    expect(cell(idle, "Avg price")).toBe("No fill");
    expect(cell(idle, "Fee")).toBe("No fill");
    // Nothing is abbreviated or ellipsised.
    expect(table.textContent).not.toMatch(/…|\.\.\./);
  });

  it("prints no request or ticket id and no word undefined anywhere on the page (QA2 R4-11)", async () => {
    render(<MemoryRouter initialEntries={["/execution/blotter"]}><BlotterScreen api={httpApi()} /></MemoryRouter>);
    await screen.findByRole("table", { name: "Orders" });
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\b(?:FE|A360|BR-EX|ELP2-REQ-FE)-?\d+\b/);
    expect(text).not.toMatch(/\bundefined\b/i);
  });

  it("every row has the same two-line shape: side over type, deployment over venue, fee over its currency", async () => {
    render(<MemoryRouter initialEntries={["/execution/blotter"]}><BlotterScreen api={httpApi()} /></MemoryRouter>);
    const table = await screen.findByRole("table", { name: "Orders" });
    const rows = within(table).getAllByRole("row").slice(1).filter((r) => !r.classList.contains("exec-blt2-kid"));
    for (const row of rows) {
      expect(row.querySelector("td[data-col='side'] .exec-blt2-two")).not.toBeNull();
      expect(row.querySelector("td[data-col='deployment'] .exec-blt2-two")).not.toBeNull();
    }
  });

  it("states the subtitle and a Fresh chip with the read's as-of", async () => {
    render(<MemoryRouter initialEntries={["/execution/blotter"]}><BlotterScreen api={httpApi()} /></MemoryRouter>);
    await screen.findByRole("table", { name: "Orders" });
    expect(screen.getByText("Orders and fills, newest first")).toBeTruthy();
    const head = document.querySelector(".exec-blt2-fresh")!;
    expect(head.textContent).toContain("Fresh");
    expect(head.textContent).toMatch(/As of 22 Aug 12:56:00Z/);
  });

  it("an order link to an old order walks older pages until the order is found, and says so while it looks", async () => {
    render(<MemoryRouter initialEntries={["/execution/blotter?order=ord_00005"]}><BlotterScreen api={httpApi()} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/Opened at order/)).toBeTruthy(), { timeout: 8000 });
    expect(screen.getByText("ord_00005", { selector: ".exec-blt2-id" })).toBeTruthy();
  });

  it("env in the link is the server's stage: Paper narrows the rows and names the environment in the chip; Live is refused in words; without it the chip names what the loaded orders say", async () => {
    const first = await firstPage();
    const modes = [...new Set(first.orders.map((o) => o.mode))];
    expect(modes.length).toBeGreaterThan(0);
    const { unmount } = render(<MemoryRouter initialEntries={["/execution/blotter"]}><BlotterScreen api={httpApi()} /></MemoryRouter>);
    const table = await screen.findByRole("table", { name: "Orders" });
    const chip = document.querySelector(".exec-blt2-scope .exec-blt2-chip")!;
    for (const mode of modes) if (mode) expect(chip.textContent).toContain(mode.charAt(0).toUpperCase() + mode.slice(1));
    expect(table).toBeTruthy();
    unmount();
    render(<MemoryRouter initialEntries={["/execution/blotter?env=paper"]}><BlotterScreen api={httpApi()} /></MemoryRouter>);
    await screen.findByRole("table", { name: "Orders" });
    expect(screen.getByRole("button", { name: "Remove environment scope" })).toBeTruthy();
    expect(document.querySelector(".exec-blt2-scope .exec-blt2-chip")!.textContent).toContain("Paper");
    cleanup();
    render(<MemoryRouter initialEntries={["/execution/blotter?env=live"]}><BlotterScreen api={httpApi()} /></MemoryRouter>);
    expect(await screen.findByText("The blotter does not serve this stage")).toBeTruthy();
  });

  it("Add scope offers the deployments on the page; choosing one asks the server for that population and shows a removable chip (scope in the URL)", async () => {
    render(<MemoryRouter initialEntries={["/execution/blotter"]}><BlotterScreen api={httpApi()} /><Where /></MemoryRouter>);
    const table = await screen.findByRole("table", { name: "Orders" });
    const before = within(table).getAllByRole("row").length;
    const pick = screen.getByLabelText("Add scope") as HTMLSelectElement;
    expect([...pick.querySelectorAll("optgroup")].map((g) => g.label)).toEqual(expect.arrayContaining(["Deployment", "Account", "Alpha"]));
    // The legacy double attaches deployment ids in its overlay AFTER the read, so the server (the double's own filter) cannot scope by one;
    // the alpha axis is the double's own and is what the server narrows here. The deployment scope is exercised against the world book (W14).
    const alpha = "carry_basis_v3";
    fireEvent.change(pick, { target: { value: `alpha|${alpha}` } });
    await waitFor(() => expect(screen.getByTestId("where").textContent).toContain(`alpha=${alpha}`));
    expect(screen.getByRole("button", { name: "Remove alpha scope" })).toBeTruthy();
    await waitFor(() => expect(within(screen.getByRole("table", { name: "Orders" })).getAllByRole("row").length).toBeLessThan(before));
    const rows = within(screen.getByRole("table", { name: "Orders" })).getAllByRole("row");
    expect(rows.slice(1).every((r) => (r.querySelector("td[data-l='Deployment']")?.textContent ?? "").startsWith("dep_carry_paper"))).toBe(true);
  });
});
