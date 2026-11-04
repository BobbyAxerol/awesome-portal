/**
 * DEBT-UXM07-047: bounded, synthetic history-depth measurement.
 *
 * Runs the real Paper producer, JSON wire, FE schema reader, workbench model
 * and chart reduction. The retained-history adapter is synthetic: these are
 * NOT live/DB/HTTP/browser measurements or a newly approved capacity/SLO.
 * In particular, 2,000 is a target, 200 bounds snapshots, and neither is a
 * published maximum for PaperHistoryRecords. No fixture or service is edited.
 *
 * Fast semantic regression (one sample/depth), from apps/control-api:
 * npx vitest run test/paper-history-depth.spec.ts --maxWorkers=1 --no-file-parallelism
 * Opt-in 11-sample measurement (not repeated by every normal hook):
 * PAPER_HISTORY_DEPTH_MEASURE=1 npx vitest run test/paper-history-depth.spec.ts --maxWorkers=1 --no-file-parallelism
 */
import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";
import type { AuthSession, PortalUser } from "../src/domain";
import type { ExecutionProductReadSource } from "../src/execution/product-read-source";
import { ExecutionProfileProjectionRepository } from "../src/execution/profile-projection.repository";
import { PaperReadService } from "../src/paper-read/paper-read.service";
import { paperHistoryTestScopes } from "./paper-history-authority.fixture";
import { readPaperWorkbenchProfile } from "../../portal/frontend/src/execution/v2/readers/paperRead";
import { buildWorkbench } from "../../portal/frontend/src/execution/v2/screens/workbench/model";
import { buildSeries, runsOf } from "../../portal/frontend/src/execution/v2/charts/model";
import { reduceRuns } from "../../portal/frontend/src/execution/v2/charts/downsample";

const DEPTHS = [720, 2_000, 8_000, 32_000] as const;
const MEASURE = process.env.PAPER_HISTORY_DEPTH_MEASURE === "1";
const WARMUP = MEASURE ? 2 : 0;
const SAMPLES = MEASURE ? 11 : 1;
const contractsRoot = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
const validate = ajv.compile(JSON.parse(readFileSync(
  resolve(contractsRoot, "schemas/execution-paper-read.v1.schema.json"), "utf8",
)));
const AS_OF = "2026-10-21T00:00:00.000Z";
const DEPLOYMENT = {
  deployment_id: "dep_depth", strategy_id: "str_depth", account_id: "acc_depth",
  portfolio_id: "pf_depth", mode: "paper", venue: "BINANCE",
};
const user: PortalUser = {
  userId: "usr_depth_fixture", username: "depth-fixture", displayName: "Depth fixture", role: "ADMIN", status: "ACTIVE",
  mustChangePassword: false, failedLoginCount: 0, lockedUntil: null, sessionVersion: 1,
  createdAt: new Date(AS_OF), updatedAt: new Date(AS_OF), disabledAt: null,
  accountRevision: 1, archivedAt: null,
};
const session: AuthSession = {
  sessionId: "ses_depth_fixture", userId: user.userId, state: "ACTIVE", sessionVersion: 1,
  authenticationTime: new Date(AS_OF), idleExpiresAt: new Date("2026-10-23T00:00:00Z"),
  absoluteExpiresAt: new Date("2026-10-24T00:00:00Z"),
};
const principal = { user, session, workspaceId: "ws_depth_fixture" };
type Row = Record<string, string | number | boolean | null>;
type HistoryRow = { rowId: string; ts: string; fields: Row };

function history(count: number): HistoryRow[] {
  return Array.from({ length: count }, (_, i) => {
    const ts = new Date(Date.UTC(2020, 0, 1) + i * 3_600_000).toISOString();
    return {
      rowId: `equity_${i}`, ts,
      fields: {
        ...DEPLOYMENT, id: i, ts, equity: `${20_000 + i % 733}.${String(i % 100).padStart(2, "0")}`,
        currency: "USD", net_pnl: `${i % 733}.00`, fee_total: null, funding_pnl: "0",
        cash_free: "18000.00", cash_locked: "2000.00", total_fills: String(i),
        state_digest: `sha256:${"a".repeat(64)}`, source: "SYNTHETIC_RETAINED_INPUT",
        snapshot_reason: "HISTORY_DEPTH_MEASUREMENT",
      },
    };
  });
}

function tagged(value: Row[string]) {
  if (value === null) return { kind: "NULL", value };
  if (typeof value === "boolean") return { kind: "BOOLEAN", value };
  if (typeof value === "number") return { kind: "INTEGER", value };
  return { kind: /^\d{4}-\d\d-\d\dT/.test(value) ? "TIMESTAMP" : "TEXT", value };
}

function syntheticSource(snapshot: Row) {
  let relationReads = 0;
  return {
    count: () => relationReads,
    async resolveDeploymentScope() {
      return {
        state: "FOUND", reasonCode: null, deployment: DEPLOYMENT,
        scope: {
          deploymentId: DEPLOYMENT.deployment_id, strategyId: DEPLOYMENT.strategy_id,
          accountId: DEPLOYMENT.account_id, portfolioId: DEPLOYMENT.portfolio_id,
          mode: "paper", venue: DEPLOYMENT.venue, externalAccountRef: null, tupleUnique: true,
        },
      };
    },
    async relation(_principal: unknown, _environment: unknown, _screen: unknown,
      _source: unknown, relation: string) {
      relationReads += 1;
      const rows = relation === "strategy_deployments" ? [DEPLOYMENT]
        : relation === "account_equity_snapshots" ? [snapshot] : [];
      return {
        schema_version: "portal.execution.current-source-bff.v2", source_environment: "paper",
        profile_id: "PAPER_BINANCE_USDM",
        source: {
          contract_version: "trading-system.portal-execution.manager-v2.runtime.v1", authority: "EXECUTION_CELL",
          profile_id: "PAPER_BINANCE_USDM", availability: "AVAILABLE", freshness: "STALE",
          completeness: "COMPLETE", as_of: AS_OF,
          data: {
            relation: { schema: "public", relation }, next_cursor: null,
            items: rows.map((fields, i) => ({
              relation: { schema: "public", relation }, record_key: `fixture-${relation}-${i}`,
              fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, tagged(value)])),
            })),
          },
        },
      };
    },
  };
}

function producer(rows: HistoryRow[], sourceRows = rows.length,
  downsample: Record<string, unknown> | null = null) {
  const source = syntheticSource(rows.at(-1)!.fields);
  let historyReads = 0;
  const projection = {
    async snapshotMetadata() { return null; },
    async timeSeriesHistoryDownsampled(workspace: string, environment: string, profile: string,
      relation: string, query: Record<string, unknown>) {
      historyReads += 1;
      // Shape and query assertions, not assertions of genuine source authority.
      expect([workspace, environment, profile, relation]).toEqual([
        principal.workspaceId, "paper", "PAPER_BINANCE_USDM", "manager.performance:account_equity_snapshots",
      ]);
      expect(query).toMatchObject({ from: "1970-01-01T00:00:00.000Z", targetPoints: 2_000,
        seriesField: "account_id", valueField: "equity",
        entity: { field: "deployment_id", value: DEPLOYMENT.deployment_id } });
      return { rows, sourceRows, downsample };
    },
  };
  const config = loadConfig({
    DATABASE_URL: "postgres://unused:unused@localhost/unused", PORTAL_ENV: "local", AUTH_MODE: "dev",
    EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: principal.workspaceId,
    EXECUTION_EDGE_PAPER_PROFILE_ID: "PAPER_BINANCE_USDM",
  });
  const service = new PaperReadService(source as unknown as ExecutionProductReadSource, config,
    undefined, undefined, projection as never, {
    // This deliberately un-downsampled adapter measures 32k rows (~17MiB),
    // NOT the bounded real SQL response or the default candidate byte policy.
    // Keep that opt-in measurement distinct from default-policy refusal tests.
    maximum_history_bytes: 32 * 1024 * 1024, maximum_row_bytes: 256 * 1024,
    maximum_response_bytes: 64 * 1024 * 1024,
  }, paperHistoryTestScopes(config));
  return { service, source, historyReads: () => historyReads };
}

function readAndModel(json: string) {
  const envelope = readPaperWorkbenchProfile(JSON.parse(json));
  if (!envelope) throw new Error("Fixture was unreadable");
  if (envelope.schemaViolations?.length) throw new Error(envelope.schemaViolations.join("; "));
  return buildWorkbench(envelope, null);
}

function percentile(samples: number[], p: number): number {
  const ordered = samples.slice().sort((a, b) => a - b);
  return ordered[Math.max(0, Math.ceil(ordered.length * p) - 1)];
}
const rounded = (n: number) => Math.round(n * 1_000) / 1_000;
const stats = (samples: number[]) => ({ p50: rounded(percentile(samples, 0.5)), p95: rounded(percentile(samples, 0.95)) });

describe("DEBT-UXM07-047 · synthetic producer / same FE reader and model", () => {
  it.each(DEPTHS)("measures %i retained returned rows without inventing a history cap", async depth => {
    const rows = history(depth);
    const { service, source, historyReads } = producer(rows);
    const producerWireMs: number[] = [];
    const parseModelMs: number[] = [];
    const chartMs: number[] = [];
    const bytes: number[] = [];
    let lastJson = "";
    let drawn = 0;
    for (let sample = -WARMUP; sample < SAMPLES; sample += 1) {
      const start = performance.now();
      const wire = await service.workbench(principal, DEPLOYMENT.deployment_id, false);
      const json = JSON.stringify(wire);
      const produced = performance.now();
      const model = readAndModel(json);
      const modeled = performance.now();
      const series = buildSeries(model.equity.points, "money");
      const reduced = reduceRuns(runsOf(series), 1_280);
      const charted = performance.now();
      if (sample >= 0) {
        producerWireMs.push(produced - start); parseModelMs.push(modeled - produced);
        chartMs.push(charted - modeled); bytes.push(Buffer.byteLength(json));
      }
      expect(model.page.replace).toBeNull();
      expect(model.equity.rows).toBe(depth);
      expect(model.equity.points).toHaveLength(depth);
      expect(model.equity.accounting.fees.kind).toBe("absent");
      expect(model.equity.accounting.funding).toMatchObject({ kind: "value", decimal: { full: "0" } });
      expect(series.drawable).toBe(depth);
      drawn = reduced.envelope.shownCount;
      lastJson = json;
    }
    const body = JSON.parse(lastJson);
    expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
    expect(body.data.history_windows.account_equity).toMatchObject({
      source_rows: depth, returned_rows: depth, truncated: false, basis: "PORTAL_SGP_HISTORY_MIRROR",
    });
    expect(body.data.history_windows.account_equity.downsample).toBeUndefined();
    expect(body.panels.account_equity.coverage.returned_count).toBe(1);
    expect(source.count()).toBe((WARMUP + SAMPLES) * 7);
    expect(historyReads()).toBe(WARMUP + SAMPLES);
    // A malformed tail must not disappear behind a supposed 200/2,000 cap.
    body.data.account_equity[depth - 1].raw_secret = "fixture-negative";
    expect(validate(body)).toBe(false);
    expect(readPaperWorkbenchProfile(body)?.schemaViolations?.length).toBeGreaterThan(0);
    if (MEASURE) console.info(`PAPER_HISTORY_DEPTH ${JSON.stringify({
      scope: "SYNTHETIC_ADAPTER_REAL_PRODUCER_READER_MODEL_NOT_DB_OR_BROWSER", source_rows: depth,
      returned_rows: depth, snapshot_panel_rows: 1, chart_shown_rows: drawn,
      samples: SAMPLES, warmup: WARMUP, bytes: stats(bytes),
      producer_and_serialize_ms: stats(producerWireMs), json_parse_reader_model_ms: stats(parseModelMs),
      chart_series_and_reduce_ms: stats(chartMs),
    })}`);
  }, 45_000);

  it("preserves a disclosed reduction instead of calling shown rows the full source population", async () => {
    const rows = history(720);
    const downsample = { method: "PER_SERIES_BUCKET_EXTREMA", bucket_seconds: 3_600,
      series_count: 1, input_rows: 8_000, output_rows: rows.length };
    const { service } = producer(rows, 8_000, downsample);
    const body = await service.workbench(principal, DEPLOYMENT.deployment_id, false);
    expect(validate(body), JSON.stringify(validate.errors)).toBe(true);
    const model = readAndModel(JSON.stringify(body));
    expect(model.equity.serverEnvelope).toEqual({
      sourceCount: 8_000, shownCount: 720, method: "PER_SERIES_BUCKET_EXTREMA", keepsExtrema: true,
    });
  });

  it("pins real repository query construction: target is not a SQL output LIMIT", async () => {
    const queries: Array<{ text: string; values: unknown[] }> = [];
    const rows = history(3);
    const pool = {
      async query(text: string, values: unknown[]) {
        queries.push({ text, values: [...values] });
        // SQL execution is NOT simulated/measured: only the real branch and
        // query construction run. The DB results here are supplied fixtures.
        if (queries.length === 1) return { rows: [{ n: "8000", k: "1",
          t0: rows[0].ts, t1: rows[2].ts }] };
        return { rows: rows.map(row => ({ row_id: row.rowId, ts: row.ts, fields: row.fields })) };
      },
    };
    const repository = new ExecutionProfileProjectionRepository(pool as never);
    const result = await repository.timeSeriesHistoryDownsampled(principal.workspaceId, "paper",
      "PAPER_BINANCE_USDM", "manager.performance:account_equity_snapshots", {
        from: "1970-01-01T00:00:00.000Z", seriesField: "account_id", valueField: "equity", targetPoints: 2_000,
        entity: { field: "deployment_id", value: DEPLOYMENT.deployment_id },
      });
    expect(queries).toHaveLength(2);
    expect(queries[1].text).toMatch(/rn_min = 1 OR rn_max = 1 OR rn_last = 1/);
    expect(queries[1].text).not.toMatch(/\bLIMIT\b/);
    expect(queries[1].text).toContain("execution_timeseries_history");
    expect(result.sourceRows).toBe(8_000);
    expect(result.downsample).toMatchObject({ method: "PER_SERIES_BUCKET_EXTREMA", input_rows: 8_000, output_rows: 3 });
  });
});
