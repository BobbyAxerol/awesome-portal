import { describe, expect, it, vi } from "vitest";
import { Portfolio360LocalService } from "../src/execution/portfolio360-local.service";
import { ExecutionAnalyticsController } from "../src/execution/analytics.controller";
import { testConfig } from "./harness";
import { assertLocalPortfolioContract } from "./contract-validator";

const config = testConfig();
const principal = { workspaceId: "TEST_ONLY:ws", user: { userId: "TEST_ONLY:actor" },
  session: { sessionId: "TEST_ONLY:session", sessionVersion: 1 } } as never;
function row(i: number) {
  return { values: { capital_ledger_id: `l${String(i).padStart(5, "0")}`, portfolio_id: "p", account_id: "a",
    movement_type: "ALLOCATE", currency: "USD", amount: "0.000000000000000001",
    before_allocated: "9007199254740993", after_allocated: "9007199254740993.000000000000000001",
    created_at: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString() } };
}
function fixture(count = 450) {
  const all = Array.from({ length: count }, (_, i) => row(i));
  let version = "TEST_ONLY:1";
  const validateRead = vi.fn();
  const portfolioView = vi.fn(async () => ({ version, strategies: [], statistics: null,
    inputAsOf: "2026-01-01T00:00:00Z", inputFreshness: "STALE", inputCompleteness: "COMPLETE", validateRead }));
  const relationPage = vi.fn(async (_principal: unknown, _route: string, q: { limit: number; cursor?: string }) => {
    const offset = Number(q.cursor ?? 0), next = offset + q.limit;
    return { records: all.slice(offset, next), source_health: { freshness: "FRESH", completeness: "COMPLETE", as_of_ms: 1_800_000_000_000 },
      page: { has_more: next < all.length, next_cursor: next < all.length ? String(next) : null } };
  });
  const service = new Portfolio360LocalService({ enabled: () => true, portfolioView } as never,
    config, {} as never, { relationPage } as never);
  const read = (query = {}, actor = principal, portfolio = "p", environment: "paper" | "sandbox" = "paper") =>
    service.capitalLedger(actor, portfolio, environment, query);
  const data = (response: Record<string, unknown>) => (response.analytics as any).data;
  return { all, relationPage, portfolioView, validateRead, read, data, changeVersion: () => { version = "TEST_ONLY:new:2"; } };
}
describe("FE-046 bounded capital ledger continuation (synthetic, not source qualification)", () => {
  it("continues beyond 250 without losing precision, currency partitions or chunk totals", async () => {
    const f = fixture(), first = await f.read({ limit: 200 }), a = f.data(first);
    assertLocalPortfolioContract(first, "LocalCapitalLedgerResponse");
    expect(a).toMatchObject({ returned_entry_count: 200, entry_count: 450, has_more: true,
      totals_scope: "AUTHORIZED_VALIDATED_SOURCE_CHUNK", ordering: "CREATED_AT_DESC_WITHIN_SOURCE_CHUNK" });
    expect(a.buckets[0].gross_increase).toBe("0.000000000000000450");
    expect(a.buckets[0].entries[0]).toMatchObject({ seq: null, command_id: null, receipt_ref: null });
    const b = f.data(await f.read({ limit: 200, cursor: a.next_cursor }));
    const c = f.data(await f.read({ limit: 200, cursor: b.next_cursor }));
    expect([a, b, c].map(v => v.returned_entry_count)).toEqual([200, 200, 50]);
    expect(c).toMatchObject({ has_more: false, next_cursor: null });
    expect(new Set([a, b, c].flatMap(v => v.buckets.flatMap((g: any) => g.entries.map((e: any) => e.ledger_id)))).size).toBe(450);
    expect(f.validateRead).toHaveBeenCalledTimes(3);
  });
  it("walks the next bounded chunk, rather than treating 1600 source rows as the end of history", async () => {
    const f = fixture(1850); let cursor: string | null = null;
    const ids: string[] = [];
    for (let page = 0; page < 10; page++) {
      const before = f.relationPage.mock.calls.length;
      const data = f.data(await f.read({ limit: 250, ...(cursor ? { cursor } : {}) }));
      expect(f.relationPage.mock.calls.length - before).toBeLessThanOrEqual(8);
      ids.push(...data.buckets.flatMap((b: any) => b.entries.map((e: any) => e.ledger_id)));
      cursor = data.next_cursor;
      if (!cursor) break;
    }
    expect(ids).toHaveLength(1850); expect(new Set(ids).size).toBe(1850); expect(cursor).toBeNull();
  });
  it("publishes provenance only as bounded literal strings, without coercion or truncation", async () => {
    const f = fixture(1), source = f.all[0].values as Record<string, unknown>;
    for (const [value, expected] of [["x".repeat(256), "x".repeat(256)], ["x".repeat(257), null],
      ["", null], [123, null], [null, null], [{ id: "x" }, null]] as const) {
      source.command_id = value; source.receipt_ref = value;
      const response = await f.read(); assertLocalPortfolioContract(response, "LocalCapitalLedgerResponse");
      expect(f.data(response).buckets[0].entries[0]).toMatchObject({ command_id: expected, receipt_ref: expected });
    }
  });
  it("refuses a cursor for another actor, session, workspace, portfolio, environment, limit or source head", async () => {
    const f = fixture(), cursor = f.data(await f.read()).next_cursor;
    for (const patch of [{ user: { userId: "peer" } }, { session: { sessionId: "peer", sessionVersion: 1 } },
      { session: { sessionId: "TEST_ONLY:session", sessionVersion: 2 } }, { workspaceId: "other" }])
      await expect(f.read({ cursor }, { ...(principal as any), ...patch } as never)).rejects.toMatchObject({ code: "ANALYTICS_LEDGER_CURSOR_INVALID" });
    await expect(f.read({ cursor }, principal, "other")).rejects.toMatchObject({ status: 400 });
    await expect(f.read({ cursor }, principal, "p", "sandbox")).rejects.toMatchObject({ status: 400 });
    await expect(f.read({ cursor, limit: 100 })).rejects.toMatchObject({ status: 400 });
    f.changeVersion();
    await expect(f.read({ cursor })).rejects.toMatchObject({ status: 400 });
  });
  it("refuses changed authorized chunk bytes, tampering and invalid bounds; source revocation is not an empty page", async () => {
    const f = fixture(), cursor = f.data(await f.read()).next_cursor;
    f.all[0].values.amount = "999";
    await expect(f.read({ cursor })).rejects.toMatchObject({ code: "ANALYTICS_LEDGER_SOURCE_CHANGED", status: 409 });
    await expect(f.read({ cursor: cursor + "x" })).rejects.toMatchObject({ status: 400 });
    for (const limit of [0, -1, 251, 1.5, "100", Infinity])
      await expect(f.read({ limit })).rejects.toMatchObject({ status: 400 });
    f.portfolioView.mockRejectedValueOnce(Object.assign(new Error("revoked"), { status: 404 }));
    await expect(f.read()).rejects.toMatchObject({ status: 404 });
  });
  it("refuses conflicting ledger identities rather than inflating totals; exact replays count once", async () => {
    const f = fixture(300); f.all[0].values.capital_ledger_id = f.all[299].values.capital_ledger_id;
    await expect(f.read()).rejects.toMatchObject({ code: "ANALYTICS_LEDGER_IDENTITY_CONFLICT" });
    f.all[0] = f.all[299];
    const data = f.data(await f.read());
    expect(data.entry_count).toBe(299); expect(data.duplicate_row_count).toBe(1);
    expect(data.buckets[0].entries).toHaveLength(250);
  });
  it("rejects source cursor cycles and lets current revocation win over a contextual digest mismatch", async () => {
    const f = fixture(), cursor = f.data(await f.read()).next_cursor;
    f.all[0].values.amount = "999";
    f.validateRead.mockRejectedValueOnce(Object.assign(new Error("revoked"), { status: 404 }));
    await expect(f.read({ cursor })).rejects.toMatchObject({ status: 404 });
    f.relationPage.mockImplementation(async (_p, _r, q) => ({ records: [row(1)],
      source_health: { freshness: "FRESH", completeness: "COMPLETE", as_of_ms: 1_800_000_000_000 },
      page: { has_more: true, next_cursor: q.cursor === "a" ? "b" : "a" } }));
    await expect(f.read()).rejects.toMatchObject({ code: "ANALYTICS_LEDGER_CONTINUATION_LOOP" });
  });
  it("parses the mounted page query strictly and never silently ignores paging in proxy mode", async () => {
    const ledger = vi.fn().mockResolvedValue({}), authorize = vi.fn().mockResolvedValue(principal);
    const controller = new ExecutionAnalyticsController({} as never, {} as never, {} as never,
      { authorize } as never, { enabled: () => true, capitalLedger: ledger } as never);
    await controller.capitalLedger({} as never, "p", { environment: "sandbox", limit: "100" });
    expect(ledger).toHaveBeenCalledWith(principal, "p", "sandbox", { limit: 100 });
    for (const query of [{ limit: "0" }, { limit: "251" }, { limit: "1e2" }, { limit: "1.2" }, { unknown: "x" }])
      await expect(controller.capitalLedger({} as never, "p", query)).rejects.toMatchObject({ status: 400 });
    const fallback = new ExecutionAnalyticsController({} as never, {} as never, {} as never, {} as never);
    await expect(fallback.capitalLedger({} as never, "p", { limit: "100" })).rejects.toMatchObject({ code: "ANALYTICS_LEDGER_PAGINATION_UNAVAILABLE" });
  });
});
