/**
 * UXM-07 closeout 3.2: Paper-history HTTP / byte qualification (in-process).
 *
 * REAL_CODE: repository downsample branch + bucket maths, PaperReadService,
 * PaperReadController, SessionGuard, HttpErrorFilter, Nest + Fastify inject.
 * SYNTHETIC: Postgres (a JS interpreter of the three SQL shapes, see the
 * fixture) and every generated row. NOT a live/DB/network measurement, NOT a
 * production SLO. The 16 MiB figure is RETAINED_DATA_VIEW_CACHE_MAXIMUM_SERIALIZED_BYTES,
 * a cache budget; the Paper workbench response itself is never put in that cache.
 *
 * Fast pinning regression (default), from apps/control-api:
 *   npx vitest run test/paper-history-http.spec.ts --maxWorkers=1 --no-file-parallelism
 * Opt-in measurement (samples + optional body dump for the FE lanes):
 *   PAPER_HISTORY_HTTP_MEASURE=1 [PAPER_HISTORY_BODY_DIR=/abs/dir] npx vitest run test/paper-history-http.spec.ts --maxWorkers=1 --no-file-parallelism
 */
import "reflect-metadata";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import fastifyCookie from "@fastify/cookie";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, describe, expect, it } from "vitest";
import { AuthService } from "../src/auth/auth.service";
import { SESSION_COOKIE } from "../src/auth/cookies";
import { SessionGuard } from "../src/facade/session.guard";
import { HttpErrorFilter } from "../src/http-error.filter";
import { PaperReadController } from "../src/paper-read/paper-read.controller";
import { PaperReadService } from "../src/paper-read/paper-read.service";
import { screenEnvelopeV2From } from "../src/execution/screen-envelope-v2";
import { WorkspacesRepository } from "../src/repos/workspaces";
import { normaliseScreenBody } from "../../portal/frontend/src/execution/api/screenV2";
import { readPaperWorkbenchProfile } from "../../portal/frontend/src/execution/v2/readers/paperRead";
import { buildWorkbench } from "../../portal/frontend/src/execution/v2/screens/workbench/model";
import { CONTROL_API_CONFIG } from "../src/tokens";
import {
  BUDGET, DEPLOYMENT, MIB, WORKSPACE, config, mirror, ms, percentile, principal, realProducer, session, user,
  type MirrorRow, type Pattern,
} from "./paper-history-http.fixture";

const MEASURE = process.env.PAPER_HISTORY_HTTP_MEASURE === "1";
const BODY_DIR = process.env.PAPER_HISTORY_BODY_DIR;
const WARMUP = MEASURE ? 2 : 0, SAMPLES = MEASURE ? 7 : 1;
const TARGET = 2_000;
const DEPTHS = [720, 2_000, 8_000, 32_000, 100_000] as const;
/** Vitest may swallow console output; PAPER_HISTORY_OUT=/abs/file appends the lines instead. */
const emit = (line: string) => { if (process.env.PAPER_HISTORY_OUT) appendFileSync(process.env.PAPER_HISTORY_OUT, line + "\n"); else console.info(line); };
const V2 = "application/vnd.portal.execution.screen.v2+json";

const contractsRoot = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
const validate = ajv.compile(JSON.parse(readFileSync(resolve(contractsRoot, "schemas/execution-paper-read.v1.schema.json"), "utf8")));

/** Upper bound the repository maths implies: bucketsPerSeries = max(1, floor(target/3k)); floor-alignment can touch one more bucket; three rows per bucket. */
const bound = (k: number) => 3 * k * (Math.max(1, Math.floor(TARGET / (3 * k))) + 1);

const apps: NestFastifyApplication[] = [];
afterAll(async () => { for (const app of apps) await app.close(); });

async function httpApp(service: PaperReadService) {
  const auth = { sessionFromToken: async () => session, users: { findById: async () => user } };
  const workspaces = { canReadExecution: async () => true, ensurePersonal: async () => WORKSPACE };
  @Module({
    controllers: [PaperReadController],
    providers: [
      { provide: PaperReadService, useValue: service },
      { provide: WorkspacesRepository, useValue: workspaces },
      { provide: AuthService, useValue: auth },
      { provide: CONTROL_API_CONFIG, useValue: config() },
      SessionGuard,
    ],
  })
  class HarnessModule {}
  const app = await NestFactory.create<NestFastifyApplication>(HarnessModule, new FastifyAdapter({ trustProxy: true }), { logger: false });
  app.useGlobalFilters(new HttpErrorFilter());
  await app.register(fastifyCookie as never);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  apps.push(app);
  const server = app.getHttpAdapter().getInstance();
  return (accept?: string) => server.inject({
    method: "GET", url: `/api/v1/execution/screens/paper/${DEPLOYMENT.deployment_id}`,
    headers: { cookie: `${SESSION_COOKIE}=tok`, ...(accept ? { accept } : {}) },
  });
}

describe("real repository downsample: output is bounded near the target, never clipped to 200", () => {
  const cases: Array<[Pattern, number]> = [];
  for (const pattern of ["hourly", "minute", "burst_same_second", "thirty_days"] as Pattern[])
    for (const n of DEPTHS) cases.push([pattern, n]);

  it.each(cases)("%s N=%i", async (pattern, n) => {
    const rows = mirror(n, { pattern });
    const { repository, pool } = realProducer(rows);
    const result = await repository.timeSeriesHistoryDownsampled(WORKSPACE, "paper", "PAPER_BINANCE_USDM",
      "manager.performance:account_equity_snapshots", {
        from: "1970-01-01T00:00:00.000Z", seriesField: "account_id", valueField: "equity", targetPoints: TARGET,
        entity: { field: "deployment_id", value: DEPLOYMENT.deployment_id },
      });
    expect(result.sourceRows).toBe(n);
    if (n <= TARGET) {
      expect(result.downsample).toBeNull();
      expect(result.rows).toHaveLength(n);                       // exact, not clipped to 200 or to the target
      expect(pool.log.map(entry => entry.kind)).toEqual(["count", "exact"]);
    } else {
      expect(pool.log.map(entry => entry.kind)).toEqual(["count", "bucket"]);
      // A same-second burst is ONE bucket: 3 rows is correct and disclosed; any spread-out history exceeds the 200-row snapshot cap.
      if (pattern !== "burst_same_second") expect(result.rows.length).toBeGreaterThan(200);
      expect(result.rows.length).toBeLessThanOrEqual(bound(1));
      expect(result.downsample).toMatchObject({ method: "PER_SERIES_BUCKET_EXTREMA", series_count: 1, input_rows: n, output_rows: result.rows.length });
      const eq = (r: MirrorRow | { fields: Record<string, unknown> }) => Number(r.fields.equity);
      // Extrema of the WHOLE range survive, and the newest row closes the series.
      expect(Math.max(...result.rows.map(eq))).toBe(Math.max(...rows.map(eq)));
      expect(Math.min(...result.rows.map(eq))).toBe(Math.min(...rows.map(eq)));
      expect(result.rows.at(-1)!.rowId).toBe(burstOrLast(rows, pattern));
    }
    if (MEASURE) emit(`PAPER_HISTORY_REPO ${JSON.stringify({ scope: "REAL_CODE_SYNTHETIC_SQL", pattern, source_rows: n, returned_rows: result.rows.length, downsample: result.downsample })}`);
    // Every returned row is a real source row (no interpolation) and order is by time.
    const ids = new Set(rows.map(r => r.rowId));
    expect(result.rows.every(r => ids.has(r.rowId))).toBe(true);
    for (let i = 1; i < result.rows.length; i += 1) expect(result.rows[i - 1].ts <= result.rows[i].ts).toBe(true);
  }, 120_000);

  it.each([4, 50, 1_000])("N=32,000 across %i series stays within 3k(max(1,floor(2000/3k))+1)", async k => {
    const rows = mirror(32_000, { pattern: "minute", series: k });
    // Entity filter is the deployment, series split is the account: k accounts under one deployment.
    const { repository } = realProducer(rows);
    const result = await repository.timeSeriesHistoryDownsampled(WORKSPACE, "paper", "PAPER_BINANCE_USDM",
      "manager.performance:account_equity_snapshots", {
        from: "1970-01-01T00:00:00.000Z", seriesField: "account_id", valueField: "equity", targetPoints: TARGET,
        entity: { field: "deployment_id", value: DEPLOYMENT.deployment_id },
      });
    expect(result.downsample?.series_count).toBe(k);
    if (MEASURE) emit(`PAPER_HISTORY_REPO ${JSON.stringify({ scope: "REAL_CODE_SYNTHETIC_SQL", pattern: "minute", series: k, source_rows: 32_000, returned_rows: result.rows.length, bound: bound(k) })}`);
    expect(result.rows.length).toBeLessThanOrEqual(bound(k));
    // Above ~667 series the target stops being a ceiling (it floors to 1 bucket/series): disclosed by the metadata.
    if (k <= 666) expect(result.rows.length).toBeLessThanOrEqual(TARGET + 3 * k);
  }, 120_000);
});

// With identical timestamps the "newest" row is decided by row_id DESC, i.e. lexicographic.
const burstOrLast = (rows: MirrorRow[], pattern: Pattern) => pattern === "burst_same_second"
  ? rows.map(r => r.rowId).sort().at(-1)! : rows.at(-1)!.rowId;

describe("real HTTP path: bytes against the approved 16 MiB budget", () => {
  const measured: Record<string, unknown>[] = [];
  it.each(DEPTHS)("N=%i through Nest/Fastify", async n => {
    const rows = mirror(n, { pattern: "hourly" });
    const { service, repository } = realProducer(rows);
    const call = await httpApp(service);
    const v1Bytes: number[] = [], v2Bytes: number[] = [], ms1: number[] = [];
    let last: any;
    for (let i = -WARMUP; i < SAMPLES; i += 1) {
      const t0 = performance.now();
      const response = await call();
      const t1 = performance.now();
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("private, no-store");
      if (i >= 0) { ms1.push(t1 - t0); v1Bytes.push(Buffer.byteLength(response.body)); }
      last = response;
    }
    // The browser asks for V2 (httpApi.rawGet). The workbench must still answer the published V1 body.
    const v2 = await call(V2);
    expect(v2.statusCode).toBe(200);
    v2Bytes.push(Buffer.byteLength(v2.body));
    expect(v2.json().schema_version).toBe("execution.paper-workbench.v1");
    const body = last.json();
    // Exact browser composition: V2-negotiated body -> adapter -> strict reader -> workbench model.
    const envelope = readPaperWorkbenchProfile(normaliseScreenBody(v2.json()));
    expect(envelope?.schemaViolations ?? []).toEqual([]);
    const model = buildWorkbench(envelope!, null);
    expect(model.equity.points).toHaveLength(body.data.account_equity.length);
    expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
    const window = body.data.history_windows.account_equity;
    const returned = body.data.account_equity.length;
    expect(window.returned_rows).toBe(returned);
    expect(window.source_rows).toBe(n);
    expect(window.truncated).toBe(false);
    expect(returned).toBeGreaterThan(200);
    expect(returned).toBeLessThanOrEqual(bound(1));
    if (n > 2_000) expect(window.downsample).toMatchObject({ input_rows: n, output_rows: returned });
    else expect(window.downsample).toBeUndefined();
    const bytes = Buffer.byteLength(last.body);
    expect(bytes).toBeLessThan(BUDGET);
    expect(v2Bytes[0]).toBeLessThan(BUDGET);
    // The workbench response is not a retained cache entry: nothing is stored under the 16 MiB budget by this path.
    expect(repository.retainedResourceTemplate("workbench")).toBeUndefined();
    if (BODY_DIR) { mkdirSync(BODY_DIR, { recursive: true }); writeFileSync(resolve(BODY_DIR, `workbench-${n}.json`), last.body); }
    if (MEASURE) {
      measured.push({
        scope: "REAL_CODE_HTTP_SYNTHETIC_SQL_NOT_DB_OR_NETWORK", source_rows: n, returned_rows: returned,
        v1_bytes: bytes, v2_bytes: v2Bytes[0], v1_fraction_of_16MiB: Number((bytes / BUDGET).toFixed(4)),
        retained_resource_template_cap_1MiB_exceeded: bytes > MIB, samples: SAMPLES,
        inject_ms: { p50: ms(percentile(ms1, 0.5)), p95: ms(percentile(ms1, 0.95)), all: ms1.map(ms) },
      });
    }
  }, 180_000);

  it("pins why: the generic V2 projection would turn the retained history into ONE point and break the strict reader", async () => {
    const { service } = realProducer(mirror(8_000, { pattern: "hourly" }));
    const v1: any = await service.workbench(principal, DEPLOYMENT.deployment_id, false);
    expect(v1.data.account_equity.length).toBeGreaterThan(1_000);
    const projected = screenEnvelopeV2From(JSON.parse(JSON.stringify(v1)));
    const envelope = readPaperWorkbenchProfile(normaliseScreenBody(projected));
    expect(envelope?.data.account_equity).toHaveLength(1);                 // history rows gone
    expect(envelope?.schemaViolations?.some(v => v.startsWith("history_windows"))).toBe(true);
  }, 60_000);

  it("prints the opt-in table", () => {
    if (MEASURE) emit(`PAPER_HISTORY_HTTP ${JSON.stringify(measured)}`);
  });

  it("fat rows: 2,001-row ceiling x 4 KiB/row still fits; the per-row breakeven is disclosed", async () => {
    const rows = mirror(8_000, { pattern: "hourly", fatBytes: 4_096 });
    const { service } = realProducer(rows);
    const response = await (await httpApp(service))();
    const bytes = Buffer.byteLength(response.body);
    const returned = response.json().data.account_equity.length;
    expect(returned).toBeLessThanOrEqual(bound(1));
    expect(bytes).toBeLessThan(BUDGET);
    // Row size that would reach 16 MiB at the single-series ceiling (informational pin).
    expect(Math.floor(BUDGET / bound(1))).toBe(8_384);
  }, 120_000);
});
