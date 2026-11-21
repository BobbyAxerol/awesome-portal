// @vitest-environment node
/**
 * QA4 R4-10: an account's activity lists the recent orders and fills of the deployments booked on it, from the blotter's own book
 * (same ids), not only its working orders.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { answerAccount } from "../../../../../e2e/bffDoubleAccount";
import { blotterBookOf } from "../../../../../e2e/bffDoubleOverview";
import { setPositiveMode } from "../../../../../e2e/bffPositiveMode";
import { accountFact } from "../../../../../e2e/bffWorld";

beforeAll(() => setPositiveMode(true));
afterAll(() => setPositiveMode(false));

type Rec = { record_id: string; values: Record<string, unknown> };
const records = (relation: "orders" | "fills"): Rec[] =>
  (answerAccount("GET", `/api/v1/execution/resources/accounts/acc_bnc_core/${relation}`, new URLSearchParams({ environment: "live", limit: "500" }))!.body as { records: Rec[] }).records;

describe("account activity from the blotter's book", () => {
  const deployments = accountFact("acc_bnc_core")!.deployments.map((d) => d.id);

  it("every order of the blotter for this account's deployments is in its activity, with the blotter's own id and time", () => {
    const book = deployments.flatMap((id) => blotterBookOf(id).orders);
    expect(book.length).toBeGreaterThan(0);
    const mine = new Map(records("orders").map((r) => [r.record_id, r.values] as const));
    for (const order of book) {
      expect(mine.has(String(order.order_id)), String(order.order_id)).toBe(true);
      expect(mine.get(String(order.order_id))!.submitted_at).toBe(order.submitted_at);
    }
  });

  it("the fills are the blotter's fills of those deployments", () => {
    const book = deployments.flatMap((id) => blotterBookOf(id).fills);
    const ids = new Set(records("fills").map((r) => r.record_id));
    for (const fill of book) expect(ids.has(String(fill.fill_id)), String(fill.fill_id)).toBe(true);
  });
});
