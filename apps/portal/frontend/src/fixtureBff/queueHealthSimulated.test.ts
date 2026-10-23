// @vitest-environment node
/**
 * FE-CAT-2 on the fixture lane (FIXTURE_LAB, `e2e/bffDoubleV2.ts`, opt-in `simulated`): the operations queue serves health counts
 * and row axes with a counted zero, a typed null and (simulation off) an omitted block. Counts are over the filtered set, not the page.
 */
import { describe, expect, it } from "vitest";

import { answerExecutionBff, type BffDoubleOptions } from "../../e2e/bffDouble";
import { readOperationalQueueV2 } from "../execution/v2/readers/operationalQueue";

const OFF: BffDoubleOptions = { operationsV2: true, screensV2: true };
const ON: BffDoubleOptions = { operationsV2: true, screensV2: true, simulated: true };
const ask = (options: BffDoubleOptions, query: Record<string, string> = {}) =>
  answerExecutionBff("GET", "/api/v1/execution/operations", new URLSearchParams(query), options).body;
const queue = (options: BffDoubleOptions, query: Record<string, string> = {}) => {
  const read = readOperationalQueueV2(ask(options, query));
  if (read === null || read.kind !== "queue") throw new Error("unreadable queue");
  return read.queue.page;
};

describe("opt-in", () => {
  it("off: no health block and no row axes", () => {
    const body = ask(OFF) as { page: { health?: unknown; rows: Record<string, unknown>[] } };
    expect(body.page.health).toBeUndefined();
    expect(body.page.rows.every((row) => !("delivery_state" in row) && !("display_state" in row))).toBe(true);
    expect(queue(OFF).health).toBeUndefined();
  });
});

describe("on", () => {
  it("pending receipts are counted over the whole filtered set, not the loaded page", () => {
    const page = queue(ON, { limit: "5" });
    expect(page.rows).toHaveLength(5);
    const everything = queue(ON, { limit: "250" });
    const pending = everything.rows.filter((row) => row.deliveryState === "AWAITING_RECEIPT").length;
    expect(page.health!.pendingReceipt!.count).toBe(pending);
    expect(pending).toBeGreaterThan(page.rows.filter((row) => row.deliveryState === "AWAITING_RECEIPT").length - 1);
    expect(page.health!.pendingReceipt).toMatchObject({ coverage: "COMPLETE" });
  });

  it("a filter narrows the counts with the set (same snapshot, same filters)", () => {
    const succeeded = queue(ON, { limit: "250", source_status: "SUCCEEDED" });
    expect(succeeded.health!.pendingReceipt!.count).toBe(0);
    expect(succeeded.rows.every((row) => row.deliveryState === "RECEIPT_CONFIRMED")).toBe(true);
  });

  it("serves a counted zero (display lag), a floor and an exact zero, and a typed null (exceptions)", () => {
    const all = queue(ON, { limit: "250" });
    const hasBlocked = all.rows.some((row) => row.sourceStatus === "BLOCKED");
    expect(all.health!.displayLag!.count).toBe(0);
    expect(all.health!.displayLag!.coverage).toBe(hasBlocked ? "PARTIAL" : "COMPLETE");
    // No BLOCKED row in the set: every row reported its display, so the zero is exact.
    const exact = queue(ON, { limit: "250", source_status: "SUCCEEDED" });
    expect(exact.health!.displayLag).toMatchObject({ count: 0, coverage: "COMPLETE" });
    expect(all.health!.openException).toEqual({ count: null, observedAt: null, coverage: "UNKNOWN" });
  });

  it("a BLOCKED row's display axis is null (the source did not report it), the others are CURRENT", () => {
    const blocked = queue(ON, { limit: "250", source_status: "BLOCKED" });
    if (blocked.rows.length > 0) expect(blocked.rows.every((row) => row.displayState === null && row.deliveryState === "NOT_APPLICABLE")).toBe(true);
    const others = queue(ON, { limit: "250", source_status: "SUCCEEDED" });
    expect(others.rows.every((row) => row.displayState === "CURRENT")).toBe(true);
  });
});
