/**
 * DEBT-UXM07-013: four consumer/data-boundary defects, each with the case that used to pass silently.
 * A value the source did not send exactly is unreadable, never coerced, never an empty list that looks like "nothing".
 */
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { accounts } from "../features/admin/accountApi";
import { readSubjectActivity } from "./api/subjectActivity";
import { decimalText, readReplayFills, readReplayOrders } from "./components/tradeReplayModel";
import { MoneyList } from "./v2/screens/portfolios/format";

afterEach(() => vi.unstubAllGlobals());

describe("trade replay prices are exact text, never a coerced number", () => {
  it("decimalText accepts a decimal string and refuses a JSON number", () => {
    expect(decimalText("0.1000000000000000055")).toBe("0.1000000000000000055");
    expect(decimalText("-12.50")).toBe("-12.50");
    expect(decimalText(0.1 + 0.2)).toBeNull();
    expect(decimalText(100)).toBeNull();
    expect(decimalText("abc")).toBeNull();
    expect(decimalText(null)).toBeNull();
  });
  it("an order with a numeric price carries no price; a fill with a numeric price is not drawn", () => {
    const orders = readReplayOrders([{ order_id: "o1", price: 0.30000000000000004, quantity: "1" }]);
    expect(orders[0]?.price).toBeNull();
    expect(orders[0]?.qty).toBe("1");
    const fills = readReplayFills([
      { fill_id: "f1", price: 101.5, trade_time: "2026-10-17T12:00:00Z" },
      { fill_id: "f2", price: "101.5", trade_time: "2026-10-17T12:00:00Z" },
    ]);
    expect(fills.map((f) => f.fillId)).toEqual(["f2"]);
    expect(fills[0]?.price).toBe("101.5");
  });
});

describe("subject activity: an unreadable records list is not an empty history", () => {
  const base = { schema_version: "execution.subject-activity.v1", state: "AVAILABLE" };
  it("records that is not a list reads as null", () => {
    expect(readSubjectActivity({ ...base, records: "nope" })).toBeNull();
    expect(readSubjectActivity({ ...base, records: { a: 1 } })).toBeNull();
    expect(readSubjectActivity({ ...base })).toBeNull();
  });
  it("one row with no record id makes the page unreadable instead of silently dropping the row", () => {
    expect(readSubjectActivity({ ...base, records: [{ record_id: "r1", values: {} }, { values: { x: 1 } }] })).toBeNull();
  });
  it("a genuinely empty list is still an empty page", () => {
    const page = readSubjectActivity({ ...base, records: [] });
    expect(page).not.toBeNull();
    expect(page?.records).toEqual([]);
  });
});

describe("portfolio money list keeps two lines for one currency", () => {
  it("renders both, with no duplicate-key warning", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { container } = render(<MoneyList entries={[{ currency: "USDT", value: "10.00" }, { currency: "USDT", value: "20.00" }]} />);
    expect(container.textContent).toContain("10.00");
    expect(container.textContent).toContain("20.00");
    expect(spy.mock.calls.filter((c) => String(c[0]).includes("same key"))).toEqual([]);
    spy.mockRestore();
  });
});

describe("V1 account roster: a malformed answer is an error, not an empty roster", () => {
  const answer = (body: unknown) => vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => body })));
  it("accounts that is not a list rejects", async () => {
    answer({ accounts: "nope" });
    await expect(accounts.roster()).rejects.toThrow(/not a list/);
    answer({});
    await expect(accounts.roster()).rejects.toThrow(/not a list/);
  });
  it("an empty list is an empty roster", async () => {
    answer({ accounts: [] });
    await expect(accounts.roster()).resolves.toEqual([]);
  });
});
