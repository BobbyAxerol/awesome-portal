/**
 * S3-U3 (BE-P3): `GET /views/equity-chart` and `GET /deployments/{id}/query-analytics` for a DEPLOYMENT subject.
 * The real producers run against the same inputs as the canonical contract cases; their output must equal the
 * fixture and validate against the published schema. PostgreSQL is replaced by fakes of the two repositories.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExecutionFinancialChartService, FinancialChartError } from "../src/execution/financial-chart.service";
import { LocalQueryAnalyticsService } from "../src/execution/local-query-analytics.service";
import { testConfig } from "./harness";
import { FIELDS, productReadFixture } from "./elp2-product-read.fixture";

const contracts = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
const load = (path: string) => JSON.parse(readFileSync(resolve(contracts, path), "utf8"));
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
for (const name of ["execution-financial-chart.v1.schema.json", "execution-query-analytics.v1.schema.json"]) ajv.addSchema(load(`schemas/${name}`));
const chartSchema = ajv.getSchema("https://schemas.primusspark.com/portal/execution-financial-chart.v1.schema.json")!;

const T0 = 1790812800000, HOUR = 3600000;
const WRITE = process.env.BE_P3_WRITE_FIXTURES === "1";
const fixture = load("fixtures/execution-financial-chart.synthetic.valid.json");

const DIGEST = `sha256:${"a".repeat(64)}`;
const revision = { readModelRevision: "mirror-rev-41", projectionEpoch: "epoch-41", projectionSequence: 41, payloadDigest: DIGEST, sourceCatalogueSha256: null };
const observation = (asOf: number | null) => ({ availability: "AVAILABLE" as const, completeness: "COMPLETE" as const, freshness: "FRESH" as const,
  asOf: asOf === null ? null : new Date(asOf), receivedAt: new Date(T0 + 5 * HOUR + 1000) });
const points = (rows: readonly (readonly [number, string])[]) => rows.map(([at, value], index) => ({ rowId: `r${index}`, at: new Date(at), accountId: "acct_paper_1", currency: "USDT", value }));
const series = (overrides: Record<string, unknown>) => ({ state: "AVAILABLE", reasonCode: null, revision, observation: observation(T0 + 5 * HOUR), sourceRows: "6", numericRows: "6",
  rejectedRows: "0", seriesCount: "1", oldestAvailableAt: new Date(T0), newestAvailableAt: new Date(T0 + 5 * HOUR), points: [], downsample: null, ...overrides });

/** The read the durable repository would return for each canonical case. */
const READS: Record<string, Record<string, unknown> | null> = {
  deployment_equity_ready: series({ points: points(fixture.cases[0].value.panel.data.series[0].points) }),
  deployment_equity_downsampled: series({ sourceRows: "120000", numericRows: "120000", points: points(fixture.cases[1].value.panel.data.series[0].points),
    downsample: { algorithm: "MIN_MAX_LAST_BUCKET_V1", bucketSeconds: 900, targetPoints: 1920, sourceRows: "120000", returnedRows: 6 } }),
  deployment_exposure_long_ready: series({ sourceRows: "3", numericRows: "3", newestAvailableAt: new Date(T0 + 4 * HOUR), points: points(fixture.cases[2].value.panel.data.series[0].points) }),
  deployment_empty: series({ state: "EMPTY", observation: observation(null), sourceRows: "0", numericRows: "0", seriesCount: "0", oldestAvailableAt: null, newestAvailableAt: null }),
  deployment_metric_not_retained: null,
  deployment_mirror_reads_disabled: null,
  deployment_scoped_v2: series({ points: points(fixture.cases[6].value.panel.data.series[0].points) }),
};

const principal = { user: { userId: "u1", username: "u1", role: "ADMIN" }, session: {}, workspaceId: "workspace_TEST_ONLY" } as never;
const profiles = { EXECUTION_EDGE_PAPER_PROFILE_ID: "PAPER_BINANCE_USDM", EXECUTION_EDGE_LIVE_PROFILE_ID: "LIVE_BINANCE_USDM" };
const mirrorOn = { FEATURE_EXECUTION_DURABLE_MIRROR: "true", FEATURE_EXECUTION_DURABLE_MIRROR_READS: "true", ...profiles };
// loadConfig refuses a partial flag set; these services read only the fields below, so overlay a plain config.
const configWith = (overrides: Record<string, string>) => ({ ...testConfig(), ...overrides }) as ReturnType<typeof testConfig>;

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(T0 + 6 * HOUR); });
afterEach(() => vi.useRealTimers());

describe("financial chart: the producer equals the published contract", () => {
  for (const item of fixture.cases.filter((entry: { scoped?: boolean }) => !entry.scoped)) {
    it(`${item.name}`, async () => {
      const read = READS[item.name];
      const financial = { series: vi.fn(async () => read), revision: vi.fn(async () => revision) };
      const config = configWith(item.name === "deployment_mirror_reads_disabled" ? profiles : mirrorOn);
      const service = new ExecutionFinancialChartService(config, financial as never, {} as never, {} as never);
      const q = item.query;
      const body = await service.chart(principal, { environment: q.environment, subject: { kind: q.subject_kind, id: q.subject_id }, metric: q.metric,
        fromMs: null, toMs: null, viewportPx: q.viewport_px ?? 960, includeBenchmark: false });
      expect(body).toEqual(item.value);
      expect(chartSchema(body), JSON.stringify(chartSchema.errors)).toBe(true);
      // A metric the subject does not retain, or a disabled mirror, never reaches the repository.
      expect(financial.series).toHaveBeenCalledTimes(read === null ? 0 : 1);
      if (read !== null) {
        const call = (financial.series.mock.calls as unknown as Array<[Record<string, unknown>]>)[0][0];
        expect(call).toMatchObject({ subject: { kind: "deployment", id: q.subject_id }, relationKey: "manager.performance:performance_snapshots", valueField: q.metric });
      }
    });
  }

  it("deployment_scoped_v2: the SCOPED_V2 read withholds the source clocks and names its read scope", async () => {
    const f = productReadFixture({ fields: [...FIELDS, "timestamp_ms"] });
    // The fixture's retained-review profile would label every drawn series STALE (a preview-only rule); the product profile does not.
    Object.assign(f.config, mirrorOn, { EXECUTION_READ_PROFILE: "product" });
    const financial = { series: vi.fn(async () => READS.deployment_scoped_v2), revision: vi.fn(async () => revision) };
    const service = new ExecutionFinancialChartService(f.config, financial as never, {} as never, {} as never, f.scopes);
    const body = await service.chart(f.principal as never, { environment: "paper", subject: { kind: "deployment", id: "dep-own" }, metric: "equity",
      fromMs: null, toMs: null, viewportPx: 960, includeBenchmark: false });
    const scoped = fixture.cases.find((entry: { scoped?: boolean }) => entry.scoped).value;
    expect(body).toEqual({ ...scoped, workspace_id: "TEST_ONLY-product-workspace", subject: { kind: "deployment", id: "dep-own" },
      read_scope: { visibility: "SCOPED", coverage: "AUTHORIZED_ONLY", policy_revision: "TEST_ONLY-policy-r1" } });
    expect(chartSchema(body), JSON.stringify(chartSchema.errors)).toBe(true);
    // A deployment outside the viewer's tuples is the same refusal as an unknown one, before any row is read.
    financial.series.mockClear();
    await expect(service.chart(f.principal as never, { environment: "paper", subject: { kind: "deployment", id: "dep-peer" }, metric: "equity",
      fromMs: null, toMs: null, viewportPx: 960, includeBenchmark: false })).rejects.toMatchObject({ status: 404, code: "EXECUTION_READ_NOT_AVAILABLE" });
    expect(financial.series).not.toHaveBeenCalled();
  });

  it("a metric only an account or portfolio retains is not served for a deployment (no zero series)", async () => {
    const financial = { series: vi.fn() };
    const service = new ExecutionFinancialChartService(configWith(mirrorOn), financial as never, {} as never, {} as never);
    for (const metric of ["margin_initial", "margin_maintenance", "drawdown", "allocated_capital"] as const) {
      const body = await service.chart(principal, { environment: "paper", subject: { kind: "deployment", id: "dep_paper_01" }, metric,
        fromMs: null, toMs: null, viewportPx: 960, includeBenchmark: false });
      expect(body.panel).toMatchObject({ state: "UNAVAILABLE", reason_code: "EDS07_METRIC_NOT_RETAINED_FOR_SUBJECT", data: null });
      expect(chartSchema(body), JSON.stringify(chartSchema.errors)).toBe(true);
    }
    expect(financial.series).not.toHaveBeenCalled();
  });

  it("a requested benchmark is a typed unavailable on a populated deployment chart", async () => {
    const financial = { series: vi.fn(async () => READS.deployment_equity_ready) };
    const service = new ExecutionFinancialChartService(configWith(mirrorOn), financial as never, {} as never, {} as never);
    const body = await service.chart(principal, { environment: "paper", subject: { kind: "deployment", id: "dep_paper_01" }, metric: "equity",
      fromMs: null, toMs: null, viewportPx: 960, includeBenchmark: true });
    expect((body.panel.data as { benchmark: unknown }).benchmark).toEqual({ requested: true, state: "UNAVAILABLE", reason_code: "EDS07_BENCHMARK_AUTHORITY_UNPUBLISHED", series: null });
    expect(chartSchema(body), JSON.stringify(chartSchema.errors)).toBe(true);
  });

  it("refuses a malformed query before any read", async () => {
    const financial = { series: vi.fn() };
    const service = new ExecutionFinancialChartService(configWith(mirrorOn), financial as never, {} as never, {} as never);
    await expect(service.chart(principal, { environment: "paper", subject: { kind: "deployment", id: "../x" }, metric: "equity",
      fromMs: null, toMs: null, viewportPx: 960, includeBenchmark: false })).rejects.toBeInstanceOf(FinancialChartError);
    expect(financial.series).not.toHaveBeenCalled();
  });

  it("the not-retained matrix in the contract note equals the producer's metric binding", async () => {
    const note: string = fixture.note;
    const retained = note.split(": ")[1].split(", ");
    const financial = { series: vi.fn(async () => READS.deployment_equity_ready) };
    const service = new ExecutionFinancialChartService(configWith(mirrorOn), financial as never, {} as never, {} as never);
    const all = load("schemas/execution-financial-chart.v1.schema.json").$defs.FinancialChartResponse.properties.metric.enum as string[];
    for (const metric of all) {
      const body = await service.chart(principal, { environment: "paper", subject: { kind: "deployment", id: "dep_paper_01" }, metric: metric as never,
        fromMs: null, toMs: null, viewportPx: 960, includeBenchmark: false });
      const served = body.panel.state !== "UNAVAILABLE";
      expect(served, metric).toBe(retained.includes(metric));
    }
  });
});

describe("deployment query-analytics: the producer output is the published envelope", () => {
  it("serves a DEPLOYMENT subject from the local projection and validates against execution-query-analytics.v1", async () => {
    const cfg = { ...testConfig(), FEATURE_EXECUTION_LOCAL_PROJECTION: "true", FEATURE_EXECUTION_CURRENT_SOURCE_PAPER: "true",
      EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: "ws", EXECUTION_EDGE_PAPER_PROFILE_ID: "paper-profile" };
    const group = (items: Record<string, string>[]) => ({ availability: "AVAILABLE", freshness: "FRESH", completeness: "COMPLETE", as_of: "2026-10-01T05:00:00Z", items: items.map(fields => ({ fields })) });
    const snapshot = vi.fn(async (_w: string, env: string, profile: string) => ({
      projectionEpoch: "3b2d15c5-e36f-4a2f-91bf-18bb58ba76f4", projectionSequence: 7, payloadDigest: `sha256:${"2".repeat(64)}`, completeness: "COMPLETE",
      sourceAsOf: new Date("2026-10-01T05:00:00Z"), receivedAt: new Date(T0), lastSuccessfulRefreshAt: new Date(), sourceCatalogueSha256: null,
      document: { workspace_id: "ws", environment: env, profile_id: profile, source_contract_revision: "manager-v2", relations: {
        "manager.strategies:strategies": group([{ strategy_id: "alpha-a" }]),
        "manager.deployments:strategy_deployments": group([{ deployment_id: "dep_paper_01", strategy_id: "alpha-a", account_id: "acct_paper_1", portfolio_id: "pf", mode: "paper", currency: "USDT" }]),
        "manager.accounts:accounts": group([{ account_id: "acct_paper_1" }]),
        "manager.orders:orders": group([{ order_id: "o1", strategy_id: "alpha-a", deployment_id: "dep_paper_01", account_id: "acct_paper_1", status: "FILLED", quantity: "1", submitted_at: "2026-10-01T04:00:00Z" }]),
      } } }));
    const service = new LocalQueryAnalyticsService(cfg as never, { snapshot } as never);
    const body: any = await service.query({ workspaceId: "ws" } as never, "deployment", "dep_paper_01", { environment: "paper" });
    expect(body.analytics.subject_kind).toBe("DEPLOYMENT");
    expect(body.analytics.subject_id).toBe("dep_paper_01");
    expect(body.analytics.source_facts.orders.map((r: { order_id: string }) => r.order_id)).toEqual(["o1"]);
    const validate = ajv.getSchema("https://schemas.primusspark.com/portal/execution-query-analytics.v1.schema.json")!;
    expect(validate(body), JSON.stringify(validate.errors?.slice(0, 5))).toBe(true);
  });
});
