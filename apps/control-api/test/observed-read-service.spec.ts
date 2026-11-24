import { describe, expect, it, vi } from "vitest";
import { ObservedReadController } from "../src/execution-v2/observed-read.controller";
import { ObservedReadService } from "../src/execution-v2/observed-read.service";
import { ObservedReadError, observedReadResponse } from "../src/execution-v2/observed-read.contract";
import { ExecutionReadScopeError } from "../src/execution-v2/read-scope";
import { loadConfig, type ControlApiConfig } from "../src/config";

const WS = "ws_projection";
const H = 3_600_000;
const NOW = Date.parse("2026-11-23T11:20:00Z");
const hourAgo = (hours: number) => new Date(NOW - hours * H - 20 * 60_000).toISOString();

function config(over: Record<string, string> = {}) {
  // Only the fields the observed lane reads; loadConfig has unrelated cross-validation (profile ids vs flags).
  return {
    FEATURE_EXECUTION_OBSERVED_READ: "true", EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: WS,
    EXECUTION_EDGE_PAPER_PROFILE_ID: "PAPER_BINANCE_USDM", EXECUTION_EDGE_SANDBOX_PROFILE_ID: "SANDBOX_BINANCE_USDM",
    EXECUTION_EDGE_LIVE_PROFILE_ID: "LIVE_BINANCE_USDM", ...over,
  } as unknown as ControlApiConfig;
}

const digest = `sha256:${"c".repeat(64)}`;
function snapshot(items: unknown[], over: Record<string, unknown> = {}) {
  return {
    document: {
      schema_version: "portal.execution.profile-projection.v1", workspace_id: WS, environment: "paper", profile_id: "PAPER_BINANCE_USDM",
      source_contract_revision: "r1", relations: {
        "manager.accounts:accounts": { source_id: "manager.accounts", relation: "accounts", availability: "AVAILABLE",
          reason_code: null, as_of: null, freshness: "FRESH", completeness: "COMPLETE",
          items: [{ fields: { account_id: "a", base_currency: "USDT", mode: "paper" } }] },
        "manager.performance:account_equity_snapshots": { source_id: "manager.performance", relation: "account_equity_snapshots",
          availability: "AVAILABLE", reason_code: null, as_of: null, freshness: "FRESH", completeness: "COMPLETE",
          window: { days: 30, max_rows: 2000, basis: "MERGED_SNAPSHOT_LADDER", truncated: false }, items },
      },
    },
    sourceEpoch: "se", sourceCursor: "sc", sourceAsOf: new Date(NOW - 60_000), receivedAt: new Date(NOW - 50_000),
    lastSuccessfulRefreshAt: new Date(NOW - 40_000), completeness: "COMPLETE", projectionEpoch: "epoch-1", projectionSequence: 11,
    payloadDigest: digest, sourceCatalogueSha256: digest, ...over,
  };
}
const equityRow = (id: number, account: string, hoursAgoValue: number, equity: string, netPnl: string) => ({
  fields: { id, account_id: account, ts: hourAgo(hoursAgoValue), mode: "paper", equity, net_pnl: netPnl, currency: "USDT" },
});

function build(opts: { mode?: string; scopeMode?: string; snap?: ReturnType<typeof snapshot> | null; cfg?: ReturnType<typeof config>;
  metadataOverride?: unknown; revisions?: Array<string | null>; mirrorRows?: unknown[]; snapshotFailure?: boolean;
  finalAuthorityFailure?: boolean; afterReadScopeMode?: string } = {}) {
  const snap = opts.snap === undefined ? snapshot([equityRow(1, "a", 2, "100", "0"), equityRow(2, "a", 1, "101", "1"), equityRow(3, "a", 0, "102", "2")]) : opts.snap;
  const rawMetadata = snap ? { payloadDigest: snap.payloadDigest, projectionEpoch: snap.projectionEpoch, projectionSequence: snap.projectionSequence,
      sourceCatalogueSha256: snap.sourceCatalogueSha256, sourceEpoch: snap.sourceEpoch, sourceContractRevision: snap.document.source_contract_revision,
      sourceAsOf: snap.sourceAsOf, receivedAt: snap.receivedAt, lastSuccessfulRefreshAt: snap.lastSuccessfulRefreshAt,
      completeness: snap.completeness } : null;
  const metadata = opts.metadataOverride !== undefined
    ? opts.metadataOverride === null ? null : { ...rawMetadata, ...(opts.metadataOverride as Record<string, unknown>) } : rawMetadata;
  const calls: string[] = [];
  const scopes = {
    selectionMode: vi.fn(async () => { calls.push("selectionMode"); return opts.mode ?? "LEGACY_COMPATIBILITY"; }),
    authorize: vi.fn(async (_principal: unknown, _binding: unknown, _requirement: unknown) => { calls.push("authorize"); return {
      mode: calls.includes("snapshot") && opts.afterReadScopeMode ? opts.afterReadScopeMode : opts.scopeMode ?? "LEGACY_COMPATIBILITY",
    }; }),
    deliver: vi.fn(async (_scope: unknown, read: () => Promise<unknown>) => {
      calls.push("deliver");
      try { return await read(); }
      finally { if (opts.finalAuthorityFailure) throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409); }
    }),
  };
  const revisions = [...(opts.revisions ?? [snap ? "retained-revision-1" : null])];
  const query = vi.fn(async (statement: string) => {
    if (statement.includes("AS retained_revision")) {
      const revision = revisions.length > 1 ? revisions.shift() : revisions[0];
      return { rows: revision === null ? [] : [{ retained_revision: revision }] };
    }
    if (statement.includes("SELECT e.relation_key,e.fields")) return { rows: opts.mirrorRows ?? [] };
    return { rows: [] };
  });
  const reader = { query, release: vi.fn() };
  const pool = { query, connect: vi.fn(async () => reader) };
  const repository = {
    pool,
    snapshotMetadata: vi.fn(async () => { calls.push("snapshotMetadata"); return metadata; }),
    snapshot: vi.fn(async (_workspace: string, _environment: string, _profile: string, _reader?: unknown) => {
      calls.push("snapshot"); if (opts.snapshotFailure) throw new Error("synthetic read failure"); return snap;
    }),
  };
  const service = new ObservedReadService(opts.cfg ?? config(), scopes as never, repository as never);
  service.clock = () => NOW;
  return { service, scopes, repository, calls, reader };
}
const principal = { user: { userId: "u1" } as never, session: { sessionId: "s1" } as never, workspaceId: WS };

describe("observed read service gate", () => {
  it("serves a LEGACY workspace with a contract-valid, never-qualified body", async () => {
    const { service, scopes, calls } = build();
    const body = await service.overview(principal, "paper");
    expect(observedReadResponse.safeParse(body).success).toBe(true);
    expect(body.trust).toMatchObject({ qualified: false, source_confidence: "UNKNOWN", not_ts_qualified: true });
    expect(body.figures.find(f => f.figure_id === "NAV")).toMatchObject({ value: "102", availability: "AVAILABLE", currency: "USDT" });
    expect(body.figures.find(f => f.figure_id === "RETURN")).toMatchObject({ value: null, reason_code: "NAV_GRID_COVERAGE_POLICY_PENDING" });
    expect(body.projection).toMatchObject({ profile_id: "PAPER_BINANCE_USDM", epoch_id: "epoch-1", sequence: 11 });
    expect(body.quality).toMatchObject({ completeness: "PARTIAL", freshness: "FRESH" });
    expect(calls.slice(0, 4)).toEqual(["selectionMode", "snapshotMetadata", "authorize", "authorize"]);
    expect(scopes.authorize).toHaveBeenCalledTimes(4);
    expect(scopes.deliver).toHaveBeenCalledTimes(4);
    expect(scopes.authorize).toHaveBeenCalledWith(principal, { environment: "paper", profileId: "PAPER_BINANCE_USDM" },
      expect.objectContaining({ action: "account.read" }));
  });

  it("refuses a SCOPED_V2 workspace with a typed 409 and ZERO repository or authorize calls", async () => {
    const { service, scopes, repository } = build({ mode: "SCOPED_V2" });
    await expect(service.overview(principal, "paper")).rejects.toMatchObject({
      code: "EXECUTION_OBSERVED_NOT_AVAILABLE_SCOPED_WORKSPACE", status: 409 });
    expect(repository.snapshotMetadata).not.toHaveBeenCalled();
    expect(repository.snapshot).not.toHaveBeenCalled();
    expect(scopes.authorize).not.toHaveBeenCalled();
    expect(scopes.deliver).not.toHaveBeenCalled();
  });

  it("refuses when a policy appears between the mode check and authorize (access changed, no read)", async () => {
    const { service, repository } = build({ scopeMode: "SCOPED_V2" });
    await expect(service.overview(principal, "paper")).rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
    expect(repository.snapshot).not.toHaveBeenCalled();
  });

  it("refuses when the snapshot identity changed between authorize and the read", async () => {
    const changed = { payloadDigest: `sha256:${"d".repeat(64)}`, projectionEpoch: "epoch-1", sourceCatalogueSha256: digest };
    const { service } = build({ metadataOverride: changed });
    await expect(service.overview(principal, "paper")).rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
  });

  it("is dark when the flag is off: typed 404, no scope or repository call", async () => {
    const { service, scopes, repository } = build({ cfg: config({ FEATURE_EXECUTION_OBSERVED_READ: "false" }) });
    expect(service.enabled()).toBe(false);
    await expect(service.overview(principal, "paper")).rejects.toMatchObject({ code: "EXECUTION_OBSERVED_READ_DISABLED", status: 404 });
    expect(scopes.selectionMode).not.toHaveBeenCalled();
    expect(repository.snapshotMetadata).not.toHaveBeenCalled();
  });

  it("defaults the flag to OFF", () => {
    const base = { PORTAL_ENV: "local", AUTH_MODE: "dev", DATABASE_URL: "postgres://portal:portal@postgres:5432/portal",
      PORTAL_PUBLIC_ORIGIN: "http://127.0.0.1:8080", INTERNAL_PRINCIPAL_SECRET: "independent-internal-principal-secret-0123456789" };
    expect(loadConfig(base as NodeJS.ProcessEnv).FEATURE_EXECUTION_OBSERVED_READ).toBe("false");
  });

  it("fails closed when the scope authority or repository is not composed", async () => {
    const service = new ObservedReadService(config());
    await expect(service.overview(principal, "paper")).rejects.toMatchObject({ code: "EXECUTION_READ_AUTHORITY_UNAVAILABLE", status: 503 });
  });

  it("states honestly that no snapshot is recorded (nothing is invented)", async () => {
    const { service } = build({ snap: null });
    const body = await service.overview(principal, "paper");
    expect(body.figures).toEqual([]);
    expect(body.quality).toMatchObject({ completeness: "UNRESOLVED", freshness: "UNKNOWN" });
    expect(body.quality.reasons).toContain("SNAPSHOT_NOT_RECORDED");
    expect(body.projection.payload_digest).toBeNull();
    expect(body.not_published.find(item => item.figure === "NAV")).toBeTruthy();
  });

  it("sandbox and live carry no equity relation: every figure is Not published with a reason", async () => {
    const snap = snapshot([]);
    (snap.document as { relations: Record<string, unknown> }).relations = {};
    (snap.document as { environment: string; profile_id: string }).environment = "sandbox";
    (snap.document as { environment: string; profile_id: string }).profile_id = "SANDBOX_BINANCE_USDM";
    const { service } = build({ snap });
    const body = await service.overview(principal, "sandbox");
    expect(body.figures).toEqual([]);
    expect(body.not_published.find(item => item.figure === "NAV")?.reason_code).toBe("EQUITY_RELATION_NOT_SERVED_FOR_PROFILE");
    expect(body.environment).toBe("sandbox");
  });

  it("flags a snapshot whose refresh is stale and never reports it complete", async () => {
    const snap = snapshot([equityRow(1, "a", 1, "100", "0"), equityRow(2, "a", 0, "101", "1")],
      { lastSuccessfulRefreshAt: new Date(NOW - 11 * 60_000) });
    const { service } = build({ snap });
    const body = await service.overview(principal, "paper");
    expect(body.quality).toMatchObject({ completeness: "PARTIAL", freshness: "STALE" });
    expect(body.quality.reasons).toContain("SNAPSHOT_REFRESH_STALE");
  });

  it("rejects a snapshot that belongs to another workspace or profile", async () => {
    const snap = snapshot([equityRow(1, "a", 0, "100", "0")]);
    (snap.document as { workspace_id: string }).workspace_id = "ws_other";
    const { service } = build({ snap });
    await expect(service.overview(principal, "paper")).rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
  });

  it("serves the exact retained representation without comparing its digest with raw metadata", async () => {
    const { service, scopes, reader, repository } = build({ cfg: config({ EXECUTION_READ_PROFILE: "retained_review_v1" }) });
    const body = await service.overview(principal, "paper");
    expect(body.projection.payload_digest).not.toBe(digest);
    expect(body.figures.find(f => f.figure_id === "NAV")).toMatchObject({ value: "102", availability: "PARTIAL",
      quality: { completeness: "PARTIAL", freshness: "STALE" } });
    expect(body.quality).toMatchObject({ completeness: "PARTIAL", freshness: "STALE" });
    expect(scopes.authorize.mock.calls[2]?.[2]).toMatchObject({ dataset: { source_revision: body.projection.payload_digest } });
    expect(repository.snapshot.mock.calls[0]?.[3]).toBe(reader);
    expect(reader.query.mock.calls.filter(([sql]) => sql.includes("SELECT e.relation_key,e.fields"))).toHaveLength(1);
    expect(reader.query).toHaveBeenCalledWith("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    expect(reader.release).toHaveBeenCalledTimes(1);
  });

  it("rejects a retained mirror revision change before the final authority fence", async () => {
    const { service, reader } = build({ cfg: config({ EXECUTION_READ_PROFILE: "retained_review_v1" }), revisions: ["before", "after"] });
    await expect(service.overview(principal, "paper")).rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
    expect(reader.release).toHaveBeenCalledTimes(1);
  });

  it("rejects an epoch replacement after capture and authorizes accounts independently", async () => {
    const { service, repository, scopes } = build();
    const metadata = await repository.snapshotMetadata();
    repository.snapshotMetadata.mockResolvedValueOnce(metadata).mockResolvedValueOnce(metadata)
      .mockResolvedValueOnce({ ...metadata, projectionEpoch: "replaced-epoch" });
    await expect(service.overview(principal, "paper")).rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
    expect(scopes.authorize.mock.calls.map(([, , requirement]) =>
      (requirement as { dataset: { dataset_id: string } }).dataset.dataset_id)).toEqual([
      "relation:manager.performance:account_equity_snapshots", "relation:manager.accounts:accounts",
      "relation:manager.performance:account_equity_snapshots", "relation:manager.accounts:accounts",
    ]);
  });

  it("labels actual retained mirror augmentation as stale partial observations", async () => {
    const snap = snapshot([]);
    const { service } = build({ snap, cfg: config({ EXECUTION_READ_PROFILE: "retained_review_v1" }), mirrorRows: [{
      relation_key: "manager.performance:account_equity_snapshots", fields: equityRow(1, "a", 0, "123", "23").fields,
      source_contract_revision: "r1", source_catalogue_sha256: digest, source_row_digest: digest,
    }] });
    const body = await service.overview(principal, "paper");
    expect(body.figures.find(f => f.figure_id === "NAV")).toMatchObject({ value: "123", availability: "PARTIAL",
      quality: { freshness: "STALE", completeness: "PARTIAL" } });
  });

  it("only applies confirmed cumulative PnL semantics to the evidenced OKX Paper profile", async () => {
    const snap = snapshot([equityRow(1, "a", 0, "101", "1")]);
    snap.document.profile_id = "PAPER_OKX_SWAP";
    const body = await build({ snap, cfg: config({ EXECUTION_EDGE_PAPER_PROFILE_ID: "PAPER_OKX_SWAP" }) }).service.overview(principal, "paper");
    expect(body.figures.find(f => f.figure_id === "NET_PNL")).toMatchObject({ value: "1", availability: "AVAILABLE" });
  });

  it("rolls back/releases its read transaction and preserves final authority failures", async () => {
    const failed = build({ snapshotFailure: true });
    await expect(failed.service.overview(principal, "paper")).rejects.toThrow("synthetic read failure");
    expect(failed.reader.query).toHaveBeenCalledWith("ROLLBACK");
    expect(failed.reader.release).toHaveBeenCalledTimes(1);
    const revoked = build({ snapshotFailure: true, finalAuthorityFailure: true });
    await expect(revoked.service.overview(principal, "paper")).rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
  });

  it("refuses a policy flip after the protected read rather than returning the captured numbers", async () => {
    const { service } = build({ afterReadScopeMode: "SCOPED_V2" });
    await expect(service.overview(principal, "paper")).rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
  });

  it("requires the same-snapshot accounts census and never generalizes cumulative PnL to an unconfirmed profile", async () => {
    const { service } = build();
    const body = await service.overview(principal, "paper");
    expect(body.figures.find(f => f.figure_id === "NET_PNL")).toMatchObject({ value: null,
      reason_code: "CUMULATIVE_NET_PNL_SEMANTICS_NOT_CONFIRMED" });
    const snap = snapshot([equityRow(1, "a", 0, "100", "0")]);
    delete (snap.document.relations as Record<string, unknown>)["manager.accounts:accounts"];
    const absent = await build({ snap }).service.overview(principal, "paper");
    expect(absent.figures).toEqual([]);
    expect(absent.not_published.find(f => f.figure === "NAV")?.reason_code).toBe("ACCOUNT_CENSUS_NOT_SERVED");
  });

  it("propagates snapshot refresh stale quality into every figure", async () => {
    const snap = snapshot([equityRow(1, "a", 1, "100", "0"), equityRow(2, "a", 0, "101", "1")],
      { lastSuccessfulRefreshAt: new Date(NOW - 11 * 60_000) });
    const body = await build({ snap }).service.overview(principal, "paper");
    expect(body.figures.every(f => f.quality.freshness === "STALE")).toBe(true);
  });
});

describe("observed read controller gate", () => {
  function controller(over: { member?: boolean; enabled?: boolean; projectionWorkspace?: string | undefined } = {}) {
    const service = { enabled: () => over.enabled ?? true, overview: vi.fn(async () => ({ ok: true })) };
    const workspaces = { canReadExecution: vi.fn(async () => over.member ?? true) };
    const cfg = { EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: "projectionWorkspace" in over ? over.projectionWorkspace : WS };
    const instance = new ObservedReadController(service as never, workspaces as never, cfg as never);
    return { instance, service, workspaces };
  }
  const request = (workspace = WS) => ({ portalUser: { userId: "u1" }, portalSession: { sessionId: "s1" }, portalWorkspaceId: workspace }) as never;

  it("serves a member of the projection workspace", async () => {
    const { instance, service, workspaces } = controller();
    await expect(instance.overview(request(), {})).resolves.toEqual({ ok: true });
    expect(workspaces.canReadExecution).toHaveBeenCalledWith(WS, "u1", "paper");
    expect(service.overview).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: WS }), "paper");
  });

  it("answers 404 for a non-member, for another workspace and when no projection workspace is configured", async () => {
    for (const [setup, workspace] of [[{ member: false }, WS], [{}, "ws_other"], [{ projectionWorkspace: undefined }, WS]] as const) {
      const { instance, service } = controller(setup);
      await expect(instance.overview(request(workspace), { workspace_id: workspace })).rejects.toMatchObject({
        code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
      expect(service.overview).not.toHaveBeenCalled();
    }
    expect(new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404)).toBeInstanceOf(Error);
  });

  it("answers a typed 400 for an unknown or invalid query and a typed 404 when the flag is off", async () => {
    const { instance } = controller();
    await expect(instance.overview(request(), { relation: "orders" })).rejects.toMatchObject({ code: "EXECUTION_OBSERVED_QUERY_INVALID", status: 400 });
    await expect(instance.overview(request(), { environment: "all" })).rejects.toBeInstanceOf(ObservedReadError);
    const off = controller({ enabled: false });
    await expect(off.instance.overview(request(), {})).rejects.toMatchObject({ code: "EXECUTION_OBSERVED_READ_DISABLED", status: 404 });
    expect(off.workspaces.canReadExecution).not.toHaveBeenCalled();
  });
});
