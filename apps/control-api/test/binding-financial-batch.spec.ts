import { describe, expect, it, vi } from "vitest";
import type { BindingRow } from "../src/manager-lists/contracts";
import { ManagerListsService } from "../src/manager-lists/manager-lists.service";
import { bindingFinancialRequest, bindingFinancialRefreshRequest, createRetainedBindingFinancialBatchSource, mapBindingFinancialBatch,
  readBindingFinancialBatch, type BindingFinancialBatchRequest, type BindingFinancialRefreshRequest,
  type BindingFinancialRefreshSource } from "../src/manager-lists/binding-financial-batch";
import type { PostgresSnapshotReader } from "../src/query";
import type { BindingProjectionRecord, ProjectionSnapshot } from "../src/manager-lists/manager-lists.repository";

const at = "2026-10-25T12:00:00.000Z";
const projection = { sourceAsOf: new Date(at), refreshedAt: new Date(at), rowCount: 2,
  sourceCompleteness: "COMPLETE" as const, summary: {} };
const ids = [ { binding_id: "bind_a", account_id: "acc_a", venue: "BINANCE" },
  { binding_id: "bind_b", account_id: "acc_b", venue: "OKX" } ];
const request = () => bindingFinancialRequest({ workspaceId: "ws_a", environment: "paper", userId: "usr_a",
  sessionId: "ses_a", sessionGeneration: 1, snapshot: projection, rows: ids });
const amount = (value = "0", currency = "USDT") => ({ currency, value, observed_at: at, coverage: "COMPLETE" });
const response = (req = request()) => ({ schema_version: "portal.internal.binding-financial-batch.v1", authority: "TRADING_SYSTEM",
  request_digest: req.request_digest, source_snapshot_ref: req.source_snapshot_ref, source_ref: "edge://qualified/source-cut-12",
  coverage: "COMPLETE", rows: [ { ...ids[0], figures: { native_equity: [amount("100.25")],
    virtual_used: [amount("20")], virtual_headroom: [amount("-2")], sleeve_count: { count: 1, observed_at: at, coverage: "COMPLETE" } } },
  { ...ids[1], figures: { native_equity: null, virtual_used: [amount()], sleeve_count: { count: 0, observed_at: at, coverage: "COMPLETE" } } } ] });
const lent: PostgresSnapshotReader<BindingRow> = { rows: [], query: async () => [], groupedCounts: async () => new Map() };

describe("same-authorized-snapshot binding financial batch", () => {
  it("preserves exact decimals, negative headroom, omission, source null and source zero without wallet inference", () => {
    const result = mapBindingFinancialBatch(request(), response());
    expect(result.get("bind_a")!.native_equity![0].value).toBe("100.25");
    expect(result.get("bind_a")!.virtual_headroom![0].value).toBe("-2");
    expect(result.get("bind_b")).toEqual({ native_equity: null, virtual_used: [amount()],
      sleeve_count: { count: 0, observed_at: at, coverage: "COMPLETE" } });
    expect(Object.hasOwn(result.get("bind_b")!, "virtual_headroom")).toBe(false);
  });
  it("separates currencies and rejects duplicate currency instead of adding or converting", () => {
    const raw = response(); raw.rows[0].figures.native_equity = [amount("1", "USDT"), amount("2", "USDC")];
    expect(mapBindingFinancialBatch(request(), raw).get("bind_a")!.native_equity!.map(value => value.currency)).toEqual(["USDC", "USDT"]);
    raw.rows[0].figures.native_equity = [amount("1"), amount("2")];
    expect(() => mapBindingFinancialBatch(request(), raw)).toThrow("not available");
  });
  it.each(["account", "binding", "venue", "snapshot", "request", "duplicate", "missing", "authority", "wallet", "decimal", "coverage"])("rejects mismatched or unsound %s", kind => {
    const raw = structuredClone(response());
    if (kind === "account") raw.rows[0].account_id = "hidden";
    if (kind === "binding") raw.rows[0].binding_id = "hidden";
    if (kind === "venue") raw.rows[0].venue = "OTHER";
    if (kind === "snapshot") raw.source_snapshot_ref = `sha256:${"a".repeat(64)}`;
    if (kind === "request") raw.request_digest = `sha256:${"b".repeat(64)}`;
    if (kind === "duplicate") raw.rows[1] = raw.rows[0];
    if (kind === "missing") raw.rows.pop();
    if (kind === "authority") raw.authority = "EDGE";
    if (kind === "wallet") Object.assign(raw.rows[0].figures, { wallet_balance: [amount("100")] });
    if (kind === "decimal") raw.rows[0].figures.native_equity![0].value = "1e3";
    if (kind === "coverage") raw.coverage = "FULL";
    expect(() => mapBindingFinancialBatch(request(), raw)).toThrow();
  });
  it("binds user/session/generation/workspace/environment and projection revision independently", () => {
    const base = { workspaceId: "ws_a", environment: "paper" as const, userId: "usr_a", sessionId: "ses_a",
      sessionGeneration: 1, snapshot: projection, rows: ids };
    for (const delta of [{ workspaceId: "ws_b" }, { userId: "usr_b" }, { sessionId: "ses_b" }, { sessionGeneration: 2 },
      { environment: "sandbox" as const }, { snapshot: { ...projection, refreshedAt: new Date("2026-10-25T12:01:00Z") } }]) {
      expect(bindingFinancialRequest({ ...base, ...delta }).request_digest).not.toBe(request().request_digest);
    }
  });
  it("reads once with the lent transaction; absence and empty pages make no artificial figures", async () => {
    const source = { read: vi.fn(async (req: BindingFinancialBatchRequest) => response(req)) };
    await readBindingFinancialBatch(source, request(), lent);
    expect(source.read).toHaveBeenCalledExactlyOnceWith(request(), lent);
    expect(await readBindingFinancialBatch(undefined, request(), lent)).toBeUndefined();
    expect(await readBindingFinancialBatch(source, { ...request(), bindings: [] }, lent)).toBeUndefined();
    expect(source.read).toHaveBeenCalledTimes(1);
  });
  it("concrete source reuses the original keyset batch with owning provenance, without extra SQL", async () => {
    const rows = response().rows.map(row => ({ ...row, scope_id: "ws_a:paper", source_as_of: new Date(at),
      projection_refreshed_at: new Date(at), list_figures: row.figures }));
    const query = vi.fn(async () => []);
    const actual = { ...lent, rows, query } as unknown as PostgresSnapshotReader<BindingRow>;
    const result = await readBindingFinancialBatch(createRetainedBindingFinancialBatchSource(), request(), actual);
    expect(query).not.toHaveBeenCalled();
    expect(result!.get("bind_b")!.native_equity).toBeNull();
  });
  it("retained source preserves missing owning figures and refuses a cut inconsistent with metadata", async () => {
    const rows = ids.map(row => ({ ...row, scope_id: "ws_a:paper", source_as_of: new Date(at), projection_refreshed_at: new Date(at), list_figures: null }));
    const actual = { ...lent, rows } as unknown as PostgresSnapshotReader<BindingRow>;
    const source = createRetainedBindingFinancialBatchSource();
    expect(await readBindingFinancialBatch(source, request(), actual)).toBeUndefined();
    rows[0].projection_refreshed_at = new Date("2026-10-25T12:01:00Z");
    await expect(readBindingFinancialBatch(source, request(), actual)).rejects.toThrow();
  });
  it("sanitizes source errors and does not silently fall back on a malformed answer", async () => {
    await expect(readBindingFinancialBatch({ read: async () => { throw new Error("private source detail"); } }, request(), lent))
      .rejects.toThrow("The authorized account figures are not available.");
    await expect(readBindingFinancialBatch({ read: async () => ({}) }, request(), lent)).rejects.toThrow();
    expect(await readBindingFinancialBatch({ read: async () => undefined }, request(), lent)).toBeUndefined();
  });
  it("wires one batch to the real list callback inside RR, without persisting principal-specific financial rows", async () => {
    const rows = ids.map(value => ({ ...value, scope_id: "ws_a:paper", state: "ACTIVE", credential_state: "SYNC_SYNCED", updated_at: new Date(at) }));
    const transaction = { ...lent, rows };
    const source = { read: vi.fn(async (req: BindingFinancialBatchRequest, actual: unknown) => {
      expect(actual).toBe(transaction); return response(req);
    }) };
    const metadata = vi.fn(async () => ({ snapshot: projection }));
    const listWithSnapshot = vi.fn(async (_resource: unknown, _actor: unknown, _query: unknown,
      read: (snapshot: PostgresSnapshotReader<BindingRow>) => Promise<unknown>) => ({ page: { rows: rows.map(row => ({ ...row,
      updated_at: at })), total_count: 2, filtered_count: 2 }, snapshot: await read(transaction) }));
    const service = Object.assign(Object.create(ManagerListsService.prototype) as ManagerListsService, {
      repository: { bindingListSnapshot: metadata }, query: { listWithSnapshot }, config: {}, bindingFinancialSource: source,
      ensureSnapshot: vi.fn(async () => projection),
    });
    const result = await service.bindings({ workspaceId: "ws_a", user: { userId: "usr_a", role: "ADMIN" },
      session: { sessionId: "ses_a", sessionVersion: 1 } } as never, { environment: "paper", limit: 50 } as never) as { page: { rows: Array<{ figures: unknown }> } };
    expect(source.read).toHaveBeenCalledTimes(1);
    expect(metadata).toHaveBeenCalledExactlyOnceWith(transaction, "ws_a", "paper");
    expect((result.page.rows as Array<{ figures: unknown }>)[0].figures).toEqual(mapBindingFinancialBatch(request(), response()).get("bind_a"));
  });
});

/** Source/transaction seams are fake here; the REAL service drain, lineage,
 * owning refresh validation and retained-reader composition are exercised.
 * These are source-only unit receipts, not qualification of a TS/Edge family. */
describe("owning financial refresh → persistence → retained Accounts list", () => {
  const principal = () => ({ workspaceId: "ws_a", user: { userId: "usr_a", role: "ADMIN" },
    session: { sessionId: "ses_a", sessionVersion: 1 } });
  function sourcePage(relation: string, rows: Array<Record<string, string>>, nextCursor: string | null,
    cut: string | null = at) {
    const relationIdentity = { schema: "public", relation };
    return { schema_version: "portal.execution.current-source-bff.v2", source_environment: "paper", profile_id: "PAPER_BINANCE_USDM",
      projection: { epoch: "TEST_ONLY:epoch", sequence: 5, source_cursor: nextCursor,
        payload_digest: `sha256:${"c".repeat(64)}`, last_successful_refresh_at: at },
      source: { authority: "EXECUTION_CELL", profile_id: "PAPER_BINANCE_USDM", availability: "AVAILABLE", freshness: "FRESH",
        completeness: "COMPLETE", as_of: cut, data: { relation: relationIdentity, next_cursor: nextCursor,
          items: rows.map(row => ({ relation: relationIdentity, fields: Object.fromEntries(Object.entries(row)
            .map(([key, value]) => [key, { kind: "TEXT", value }])) })) } } };
  }
  function refreshResponse(req: BindingFinancialRefreshRequest) {
    return { ...response(), schema_version: "portal.internal.binding-financial-refresh.v1", request_digest: req.request_digest,
      source_snapshot_ref: req.source_snapshot_ref, qualification: "SOURCE_VERIFIED", population: "ORIGINAL_REFRESH_BINDINGS",
      workspace_id: req.workspace_id, environment: req.environment, principal: { ...req.principal }, source_as_of: req.source_as_of };
  }
  function fixture(transform?: (raw: ReturnType<typeof refreshResponse>, req: BindingFinancialRefreshRequest) => unknown,
    options: { noProvider?: boolean; missingCut?: boolean; oneMissingCut?: boolean; empty?: boolean; timeoutMs?: number } = {}) {
    let committed: ProjectionSnapshot | null = null, persisted: BindingProjectionRecord[] = [];
    const source = { relation: vi.fn(async (_principal: unknown, _env: string, _screen: string, _source: string,
      relation: string, query: { cursor?: string }) => {
      const next = relation === "accounts" && !query.cursor && !options.empty ? "TEST_ONLY:accounts-next" : null;
      const rows = options.empty ? [] : relation === "accounts"
        ? [{ account_id: query.cursor ? "acc_b" : "acc_a", mode: "paper", venue: query.cursor ? "OKX" : "BINANCE" }]
        : relation === "venue_accounts" ? ids.map(row => ({ ...row, mode: "paper" })) : [];
      return sourcePage(relation, rows, next, options.missingCut || options.oneMissingCut && relation === "venue_accounts" ? null : at);
    }) };
    const replaceBindings = vi.fn(async (input: { rows: BindingProjectionRecord[]; sourceAsOf: Date | null;
      completeness: ProjectionSnapshot["sourceCompleteness"] }) => {
      persisted = structuredClone(input.rows);
      committed = { ...projection, refreshedAt: new Date(), rowCount: persisted.length,
        sourceAsOf: input.sourceAsOf, sourceCompleteness: input.completeness };
    });
    const refreshSource: BindingFinancialRefreshSource = { read: vi.fn(async req => {
      expect(replaceBindings).not.toHaveBeenCalled();
      expect(source.relation).toHaveBeenCalledTimes(4);
      expect(Object.isFrozen(req.original_pages[0].page.items)).toBe(true);
      return transform ? transform(refreshResponse(req), req) : refreshResponse(req);
    }) };
    const repository = { snapshot: vi.fn(async () => committed), replaceBindings,
      bindingListSnapshot: vi.fn(async () => committed ? { snapshot: committed } : null) };
    const listWithSnapshot = vi.fn(async (_resource: unknown, _actor: unknown, _query: unknown,
      read: (reader: PostgresSnapshotReader<BindingRow>) => Promise<unknown>) => {
      expect(committed).not.toBeNull();
      const rows = persisted.map(row => ({ scope_id: "ws_a:paper", binding_id: row.bindingId, account_id: row.accountId,
        venue: row.venue, state: row.state, credential_state: row.credentialState, updated_at: row.updatedAt,
        source_as_of: committed!.sourceAsOf, projection_refreshed_at: committed!.refreshedAt, list_figures: row.listFigures ?? null }));
      const reader = { ...lent, rows } as PostgresSnapshotReader<BindingRow>;
      const retained = await read(reader);
      return { page: { rows: rows.map(row => ({ ...row, updated_at: row.updated_at.toISOString() })), total_count: rows.length,
        filtered_count: rows.length }, snapshot: retained };
    });
    const service = Object.assign(Object.create(ManagerListsService.prototype) as ManagerListsService, {
      repository, source, inFlight: new Map(), logger: { warn: vi.fn() },
      config: { EXECUTION_EDGE_CURRENT_SOURCE_REQUEST_TIMEOUT_MS: options.timeoutMs ?? 1000 }, query: { listWithSnapshot },
      bindingFinancialSource: createRetainedBindingFinancialBatchSource(),
      bindingFinancialRefreshSource: options.noProvider ? undefined : refreshSource,
    });
    const read = () => service.bindings(principal() as never, { environment: "paper", limit: 50 } as never) as Promise<{
      page: { rows: Array<{ binding_id: string; figures?: unknown }> } }>;
    return { read, source, refreshSource, replaceBindings, listWithSnapshot, persisted: () => persisted };
  }

  it("runs one qualified batch across every original page before persistence, then serves the retained figures without fan-out", async () => {
    const f = fixture(), result = await f.read();
    expect(f.refreshSource.read).toHaveBeenCalledTimes(1);
    const req = vi.mocked(f.refreshSource.read).mock.calls[0][0];
    expect(req).toMatchObject({ workspace_id: "ws_a", environment: "paper", source_as_of: at,
      principal: { user_id: "usr_a", session_id: "ses_a", session_generation: 1 }, bindings: ids });
    expect(req.original_pages.filter(page => page.relation === "accounts").map(page => [page.page_index, page.input_cursor]))
      .toEqual([[0, null], [1, "TEST_ONLY:accounts-next"]]);
    expect(req.original_pages[0].page.projection?.payloadDigest).toBe(`sha256:${"c".repeat(64)}`);
    expect(f.replaceBindings).toHaveBeenCalledTimes(1);
    expect(f.persisted()[0].listFigures!.native_equity![0].value).toBe("100.25");
    expect(result.page.rows[0].figures).toMatchObject({ native_equity: [amount("100.25")] });
    expect(result.page.rows[1].figures).toMatchObject({ native_equity: null, virtual_used: [amount()] });
    await f.read();
    expect(f.refreshSource.read).toHaveBeenCalledTimes(1);
    expect(f.source.relation).toHaveBeenCalledTimes(4);
  });

  it("preserves missing fields and source-null/zero on a PARTIAL owning batch", async () => {
    const f = fixture(raw => ({ ...raw, coverage: "PARTIAL", rows: [raw.rows[1]] })), result = await f.read();
    expect(f.persisted()[0].listFigures).toBeUndefined();
    expect(result.page.rows[0].figures).toBeUndefined();
    expect(result.page.rows[1].figures).toMatchObject({ native_equity: null, virtual_used: [amount()] });
    expect(Object.hasOwn(result.page.rows[1].figures!, "virtual_headroom")).toBe(false);
  });

  it.each(["source-cut", "source-as-of", "actor", "session", "generation", "workspace", "environment", "binding", "account", "venue",
    "qualification", "population", "incomplete-census", "duplicate", "future-figure", "decimal", "currency", "unknown-field"])(
    "rejects mismatched %s before the persistence transaction", async kind => {
      const f = fixture(raw => {
        if (kind === "source-cut") raw.source_snapshot_ref = `sha256:${"d".repeat(64)}`;
        if (kind === "source-as-of") raw.source_as_of = "2026-10-25T12:01:00.000Z";
        if (kind === "actor") raw.principal.user_id = "usr_other";
        if (kind === "session") raw.principal.session_id = "ses_other";
        if (kind === "generation") raw.principal.session_generation++;
        if (kind === "workspace") raw.workspace_id = "ws_other";
        if (kind === "environment") raw.environment = "sandbox";
        if (kind === "binding") raw.rows[0].binding_id = "bind_hidden";
        if (kind === "account") raw.rows[0].account_id = "acc_hidden";
        if (kind === "venue") raw.rows[0].venue = "HIDDEN";
        if (kind === "qualification") raw.qualification = "TEST_ONLY";
        if (kind === "population") raw.population = "VISIBLE_PAGE_ONLY";
        if (kind === "incomplete-census") raw.rows.pop();
        if (kind === "duplicate") raw.rows[1] = raw.rows[0];
        if (kind === "future-figure") raw.rows[0].figures.native_equity![0].observed_at = "2026-10-25T12:00:01.000Z";
        if (kind === "decimal") raw.rows[0].figures.native_equity![0].value = "100\n";
        if (kind === "currency") raw.rows[0].figures.native_equity = [amount("1"), amount("2")];
        if (kind === "unknown-field") Object.assign(raw.rows[0].figures, { wallet_equity: "100" });
        return raw;
      });
      await expect(f.read()).rejects.toMatchObject({ code: "BR72_BINDING_FINANCIAL_BATCH_INVALID", status: 503 });
      expect(f.replaceBindings).not.toHaveBeenCalled();
      expect(f.listWithSnapshot).not.toHaveBeenCalled();
    });

  it.each(["provider", "unknown-cut", "one-unknown-cut", "empty-population"])("keeps typed absence without a source call for %s", async kind => {
    const f = fixture(undefined, { noProvider: kind === "provider", missingCut: kind === "unknown-cut",
      oneMissingCut: kind === "one-unknown-cut", empty: kind === "empty-population" });
    const result = await f.read();
    expect(f.refreshSource.read).not.toHaveBeenCalled();
    expect(f.replaceBindings).toHaveBeenCalledTimes(1);
    expect(f.persisted().every(row => row.listFigures === undefined)).toBe(true);
    expect(result.page.rows.every(row => row.figures === undefined)).toBe(true);
  });

  it("changes request identity on original source page content/pins, even when the oldest timestamp is equal", () => {
    const pages = ["accounts", "venue_accounts", "broker_account_sync_effective"].map(relation => ({ relation,
      page_index: 0, input_cursor: null, page: { asOf: at, freshness: "FRESH", completeness: "COMPLETE", items: [], nextCursor: null,
        projection: { epoch: "TEST_ONLY:epoch", sequence: 5, sourceCursor: null, payloadDigest: `sha256:${"c".repeat(64)}`,
          lastSuccessfulRefreshAt: at } } })) as BindingFinancialRefreshRequest["original_pages"];
    const input = { workspaceId: "ws_a", environment: "paper" as const, userId: "usr_a", sessionId: "ses_a", sessionGeneration: 1,
      sourceAsOf: new Date(at), pages, rows: ids };
    const original = bindingFinancialRefreshRequest(input);
    const changed = structuredClone([...pages]); changed[0].page.projection!.payloadDigest = `sha256:${"d".repeat(64)}`;
    expect(bindingFinancialRefreshRequest({ ...input, pages: changed }).request_digest).not.toBe(original.request_digest);
    expect(bindingFinancialRefreshRequest({ ...input, pages: [...pages].reverse() }).request_digest).toBe(original.request_digest);
    const broken = [{ ...pages[0], input_cursor: "foreign" }, ...pages.slice(1)];
    expect(() => bindingFinancialRefreshRequest({ ...input, pages: broken })).toThrow();
  });

  it("cancels a late owning batch under the existing source timeout without persisting or accepting a late answer", async () => {
    let finish: ((result: unknown) => void) | undefined, late: unknown;
    const f = fixture(raw => { late = raw; return new Promise(resolve => { finish = resolve; }); }, { timeoutMs: 250 });
    await expect(f.read()).rejects.toMatchObject({ code: "BR72_BINDING_FINANCIAL_BATCH_INVALID", status: 503 });
    expect(vi.mocked(f.refreshSource.read).mock.calls[0][1].aborted).toBe(true);
    expect(f.replaceBindings).not.toHaveBeenCalled();
    finish?.(late); await Promise.resolve();
    expect(f.replaceBindings).not.toHaveBeenCalled();
  });
});
