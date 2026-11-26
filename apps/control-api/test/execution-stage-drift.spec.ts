/** TEST_ONLY adapter inputs. Real PostgreSQL latest-row semantics are covered
 * separately in profile-projection.spec.ts; no HK commissioning credit. */
import { describe, expect, it, vi } from "vitest";
import { LocalQueryAnalyticsService } from "../src/execution/local-query-analytics.service";
import { ExecutionProfileProjectionRepository } from "../src/execution/profile-projection.repository";
import { AnalyticsProxyError } from "../src/execution/analytics.proxy";
import { ExecutionReadScopeError } from "../src/execution-v2/read-scope";
import { ExecutionAnalyticsController } from "../src/execution/analytics.controller";
import { exactStageDrift, STAGE_DRIFT_MAX_ROWS } from "../src/execution/stage-drift.contract";
import { testConfig } from "./harness";

const row = (value: string | null, accountId = "a", day = "2026-01-01", currency: string | null = "USD") =>
  ({ strategyId: "alpha", accountId, day, value, currency });
function fixture(rows = [row("0")]) {
  const read = vi.fn(async () => rows);
  const repository = { stageEquityDailyCloses: read };
  const service = new LocalQueryAnalyticsService({ ...testConfig(), FEATURE_EXECUTION_LOCAL_PROJECTION: "true" },
    repository as unknown as ExecutionProfileProjectionRepository);
  const originalContext = async (env: unknown) => {
    if (env !== "paper") throw new AnalyticsProxyError("EXECUTION_PROFILE_READ_DISABLED", 404);
    return { workspaceId: "TEST_ONLY-workspace", environment: "paper", profileId: "TEST_ONLY-profile", scopes: [],
      snapshot: { document: { relations: { "manager.deployments:strategy_deployments": { items: [{ fields: { strategy_id: "alpha" } }] } } } } };
  };
  const context = vi.spyOn(service as any, "localContext").mockImplementation(originalContext);
  vi.spyOn(service as any, "historyScope").mockResolvedValue(undefined);
  const finish = vi.spyOn(service as any, "finish").mockImplementation(async (_context: unknown, result: unknown) => result);
  return { service, read, repository, context, originalContext, finish, run: () => service.stageDriftExact({ workspaceId: "TEST_ONLY-workspace" }, "alpha") };
}

describe("FE-054 opt-in exact stage equity", () => {
  it.each([
    [[row("0.1"), row("0.2", "b")], "0.3"],
    [[row("9007199254740993.01"), row("0.02", "b")], "9007199254740993.03"],
    [[row("1000.0100"), row("-1000.01", "b")], "0"],
    [[row("-0.001"), row("0.0001", "b")], "-0.0009"],
  ])("sums bounded decimal strings without binary64: %j", async (rows, expected) => {
    const f = fixture(rows as ReturnType<typeof row>[]);
    const value = await f.run();
    expect(value.stages.paper.series).toEqual([expected]);
    expect(value.stages.paper.currency).toBe("USD");
    expect(f.read).toHaveBeenCalledOnce();
    expect(f.finish).toHaveBeenCalledOnce();
    expect(exactStageDrift.safeParse(value).success).toBe(true);
    expect(value.qualification).toBe("RETAINED_OBSERVATIONS_NOT_FINANCIAL_CERTIFICATION");
    expect(value.research_binding.run_id).toBeNull();
  });
  it.each([null, "NaN", "Infinity", "1e3", "0\n", "01.2", "1".repeat(129)])("does not ignore malformed latest equity %j", async bad => {
    const value = await fixture([row("12", "a"), row(bad, "b")]).run();
    expect(value.stages.paper.series).toEqual([null]);
    expect(value.stages.paper.series_reason_codes).toEqual(["EQUITY_DECIMAL_INVALID"]);
  });
  it("preserves true zero and gaps on a shared calendar, never forward filling", async () => {
    const f = fixture([row("0"), row("2", "a", "2026-01-03")]);
    f.context.mockImplementation(async env => {
      const c = await f.originalContext("paper");
      if (env === "live") throw new AnalyticsProxyError("EXECUTION_PROFILE_READ_DISABLED", 404);
      return { ...c, environment: env };
    });
    f.read.mockImplementation(async (...args: unknown[]) => args[1] === "sandbox" ? [row("1", "b", "2026-01-02")] : [row("0"), row("2", "a", "2026-01-03")]);
    const value = await f.run();
    expect(value.calendar).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
    expect(value.stages.paper.series).toEqual(["0", null, "2"]);
    expect(value.stages.paper.series_reason_codes).toEqual([null, "NO_EQUITY_FOR_DAY", null]);
    expect(value.stages.sandbox.series).toEqual([null, "1", null]);
    expect(value.stages.live.reason_code).toBe("EXECUTION_PROFILE_READ_DISABLED");
  });
  it("does not add currencies or guess missing currency", async () => {
    const mixed = await fixture([row("1"), row("2", "b", "2026-01-01", "VND")]).run();
    expect(mixed.stages.paper).toMatchObject({ currency: null, reason_code: "MIXED_CURRENCIES_NOT_AGGREGATED", series: [null] });
    const missing = await fixture([row("1"), row("2", "b", "2026-01-01", null)]).run();
    expect(missing.stages.paper.series).toEqual([null]);
    expect(missing.stages.paper.series_reason_codes).toEqual(["EQUITY_CURRENCY_NOT_PUBLISHED"]);
  });
  it("distinguishes no deployment/history/observations and unconfigured profiles", async () => {
    const empty = fixture([]);
    expect((await empty.run()).stages.paper.reason_code).toBe("NO_EQUITY_IN_WINDOW");
    const notDeployed = fixture();
    notDeployed.context.mockImplementation(async env => {
      const c = await notDeployed.originalContext(env);
      c.snapshot.document.relations["manager.deployments:strategy_deployments"].items = [];
      return c;
    });
    expect((await notDeployed.run()).stages.paper.reason_code).toBe("NO_DEPLOYMENT_IN_STAGE");
    expect(notDeployed.read).not.toHaveBeenCalled();
    const unavailable = fixture();
    unavailable.repository.stageEquityDailyCloses = undefined as never;
    expect((await unavailable.run()).stages.paper.reason_code).toBe("HISTORY_MIRROR_NOT_AVAILABLE");
  });
  it("propagates authority refusal, including revoke before delivery, without a fallback", async () => {
    const denied = fixture();
    denied.context.mockRejectedValue(new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404));
    await expect(denied.run()).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE" });
    expect(denied.read).not.toHaveBeenCalled();
    const revoked = fixture();
    revoked.finish.mockRejectedValue(new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409));
    await expect(revoked.run()).rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED" });
  });
  it.each(["query", "row_overflow", "malformed_grain", "aggregate_overflow"])("rechecks authority before delivering %s refusal", async mode => {
    const f = fixture(mode === "row_overflow"
      ? Array.from({ length: STAGE_DRIFT_MAX_ROWS + 1 }, (_, i) => row("1", `a${i}`))
      : mode === "malformed_grain" ? [row("1"), row("2")]
      : mode === "aggregate_overflow" ? [row("9".repeat(128)), row("1", "b")] : [row("1")]);
    if (mode === "query") f.read.mockRejectedValue(new Error("TEST_ONLY private DB failure"));
    f.finish.mockRejectedValue(new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409));
    await expect(f.run()).rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED" });
    expect(f.finish).toHaveBeenCalledOnce();
  });
  it.each([
    { rows: [row("1"), row("2")] }, { rows: [{ ...row("1"), strategyId: "peer" }] },
    { rows: [row("1", "a", "2026-02-30")] }, { rows: [row("1", "")] },
  ])("refuses inconsistent source grains rather than plausible partial sums: %j", async ({ rows }) => {
    await expect(fixture(rows).run()).rejects.toMatchObject({ code: "ANALYTICS_HISTORY_INCONSISTENT" });
  });
  it("refuses row and exact aggregate overflow, never truncating", async () => {
    await expect(fixture(Array.from({ length: STAGE_DRIFT_MAX_ROWS + 1 }, (_, i) => row("1", `a${i}`))).run())
      .rejects.toMatchObject({ code: "ANALYTICS_RESPONSE_TOO_LARGE" });
    await expect(fixture([row("9".repeat(128)), row("1", "b")]).run())
      .rejects.toMatchObject({ code: "ANALYTICS_RESPONSE_TOO_LARGE" });
  });
  it("routes exact opt-in explicitly; absent format keeps legacy and bad query reads nothing", async () => {
    const local = { stageDrift: vi.fn(async () => "legacy"), stageDriftExact: vi.fn(async () => "exact") };
    const authority = { authorize: vi.fn(async () => ({ workspaceId: "authorized" })) };
    const controller = new ExecutionAnalyticsController({} as never, {} as never, local as never, authority as never);
    expect(await controller.stageDrift({} as never, "alpha", {})).toBe("legacy");
    expect(await controller.stageDrift({} as never, "alpha", { numeric_format: "DECIMAL_STRING", days: "30" })).toBe("exact");
    expect(local.stageDriftExact).toHaveBeenCalledWith({ workspaceId: "authorized" }, "alpha", 30);
    authority.authorize.mockClear();
    await expect(controller.stageDrift({} as never, "alpha", { numeric_format: "NUMBER" }))
      .rejects.toMatchObject({ code: "ANALYTICS_QUERY_INVALID" });
    expect(authority.authorize).not.toHaveBeenCalled();
  });
  it("refuses oversized serialized responses rather than truncating days", async () => {
    const rows = Array.from({ length: STAGE_DRIFT_MAX_ROWS }, (_, i) => row("9".repeat(128), "a",
      new Date(Date.UTC(1960, 0, i + 1)).toISOString().slice(0, 10)));
    await expect(fixture(rows).run()).rejects.toMatchObject({ code: "ANALYTICS_RESPONSE_TOO_LARGE" });
  });
  it.each([0, 1, 366, 1.5, Number.NaN])("rejects invalid days before protected reads: %j", async days => {
    const f = fixture();
    await expect(f.service.stageDriftExact({ workspaceId: "TEST_ONLY-workspace" }, "alpha", days))
      .rejects.toMatchObject({ code: "ANALYTICS_QUERY_INVALID" });
    expect(f.context).not.toHaveBeenCalled();
  });
});

describe("published alpha ids carry `@` (alpha@v1@name)", () => {
  const ID = "alpha@v1@crossec-ema-pfl-v1";
  const principal = { workspaceId: "TEST_ONLY-workspace" } as never;
  it("stage-drift reads the id, exact and legacy, instead of answering ANALYTICS_IDENTIFIER_INVALID", async () => {
    const f = fixture();
    const exact = await f.service.stageDriftExact(principal, ID).catch((e: unknown) => e);
    expect(exact).not.toMatchObject({ code: "ANALYTICS_IDENTIFIER_INVALID" });
    const legacy = await f.service.stageDrift(principal, ID).catch((e: unknown) => e);
    expect(legacy).not.toMatchObject({ code: "ANALYTICS_IDENTIFIER_INVALID" });
  });
  it("still refuses a path-like or whitespace id", async () => {
    const f = fixture();
    for (const bad of ["alpha/../x", "alpha v1", "alpha%40v1", "a".repeat(193)]) {
      await expect(f.service.stageDriftExact(principal, bad)).rejects.toMatchObject({ code: "ANALYTICS_IDENTIFIER_INVALID" });
    }
  });
  it("only an alpha may carry `@` on the observed timeline read", async () => {
    const svc = fixture().service as any;
    await expect(svc.observedTimeline(principal, { environment: "paper", subjectKind: "deployment", subjectId: "dep@x" }))
      .rejects.toMatchObject({ code: "ANALYTICS_IDENTIFIER_INVALID" });
    const alpha = await svc.observedTimeline(principal, { environment: "paper", subjectKind: "alpha", subjectId: ID }).catch((e: unknown) => e);
    expect(alpha).not.toMatchObject({ code: "ANALYTICS_IDENTIFIER_INVALID" });
  });
});
