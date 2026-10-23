/**
 * WP-F2 (FIXTURE_LAB, `e2e/bffSimulated.ts` blotter block): every order row of the populated lane carries the design's columns, derived by
 * integer arithmetic from the order's own published fills; absence stays typed (a fee is never defaulted to 0).
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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

  it("a traded order with an unpublished commission or two fee currencies has no fee at all", async () => {
    const page = await firstPage();
    const traded = page.orders.filter((o) => o.averageFillPrice.kind === "value");
    expect(traded.some((o) => o.fee.kind === "absent")).toBe(true);
    expect(traded.filter((o) => o.fee.kind === "absent").every((o) => o.feeCurrency === null)).toBe(true);
  });
});

describe("the screen", () => {
  it("prints deployment over venue, average price, fee with currency, and No fill for an idle order", async () => {
    render(<MemoryRouter initialEntries={["/execution/blotter"]}><BlotterScreen api={httpApi()} /></MemoryRouter>);
    const table = await screen.findByRole("table", { name: "Orders" });
    const rows = within(table).getAllByRole("row").slice(1).filter((r) => !r.classList.contains("exec-blt2-kid"));
    const cell = (row: HTMLElement, label: string) => row.querySelector(`td[data-l='${label}']`)?.textContent ?? "";
    expect(cell(rows[0]!, "Deployment")).toMatch(/^dep_btc_liveBINANCE$/);
    expect(cell(rows[0]!, "Avg price")).toMatch(/\d/);
    expect(cell(rows[0]!, "Fee")).toMatch(/USDT$/);
    const idle = rows.find((r) => /Accepted|Canceled|Submitted/.test(cell(r, "Status")))!;
    expect(cell(idle, "Avg price")).toBe("No fill");
    expect(cell(idle, "Fee")).toBe("No fill");
    // Nothing is abbreviated or ellipsised.
    expect(table.textContent).not.toMatch(/…|\.\.\./);
  });
});
