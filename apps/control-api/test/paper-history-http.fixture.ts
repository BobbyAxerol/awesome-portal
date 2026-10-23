/**
 * Shared fixture for the Paper-history HTTP qualification (UXM-07 closeout 3.2).
 *
 * REAL_CODE under test: ExecutionProfileProjectionRepository.timeSeriesHistoryDownsampled
 * (branching, bucket maths, SQL text + bound parameters), PaperReadService,
 * PaperReadController, SessionGuard, HttpErrorFilter, Fastify serialisation.
 * SYNTHETIC: the Postgres engine. `emulatedPool` interprets the three SQL
 * shapes the repository sends (count, exact scan, bucket-extrema window) in
 * JS from the SAME bound parameters; it is not Postgres and proves nothing about
 * planner time, I/O or jsonb behaviour. Rows are generated, not retained data.
 */
import { loadConfig } from "../src/config";
import type { AuthSession, PortalUser } from "../src/domain";
import type { ExecutionProductReadSource } from "../src/execution/product-read-source";
import { ExecutionProfileProjectionRepository } from "../src/execution/profile-projection.repository";
import { PaperReadService } from "../src/paper-read/paper-read.service";

export const AS_OF = "2026-10-21T00:00:00.000Z";
export const PROFILE = "PAPER_BINANCE_USDM";
export const RELATION = "manager.performance:account_equity_snapshots";
export const WORKSPACE = "ws_depth_fixture";
export const DEPLOYMENT = {
  deployment_id: "dep_depth", strategy_id: "str_depth", account_id: "acc_depth",
  portfolio_id: "pf_depth", mode: "paper", venue: "BINANCE",
};
export const user: PortalUser = {
  userId: "usr_depth_fixture", username: "depth-fixture", displayName: "Depth fixture", role: "ADMIN", status: "ACTIVE",
  mustChangePassword: false, failedLoginCount: 0, lockedUntil: null, sessionVersion: 1,
  createdAt: new Date(AS_OF), updatedAt: new Date(AS_OF), disabledAt: null,
  accountRevision: 1, archivedAt: null,
};
export const session: AuthSession = {
  sessionId: "ses_depth_fixture", userId: user.userId, state: "ACTIVE", sessionVersion: 1,
  authenticationTime: new Date(AS_OF), idleExpiresAt: new Date("2026-10-23T00:00:00Z"),
  absoluteExpiresAt: new Date("2026-10-24T00:00:00Z"),
};
export const principal = { user, session, workspaceId: WORKSPACE };

export type Row = Record<string, string | number | boolean | null>;
export interface MirrorRow { rowId: string; ts: string; fields: Row }
export type Pattern = "hourly" | "minute" | "burst_same_second" | "thirty_days";

/** Deterministic LCG so min/max are not on a sawtooth. */
function lcg(seed: number) { let s = seed >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32; }

function stepMs(pattern: Pattern, count: number): number {
  switch (pattern) {
    case "hourly": return 3_600_000;
    case "minute": return 60_000;
    case "burst_same_second": return 0;
    case "thirty_days": return Math.max(1, Math.floor(30 * 86_400_000 / Math.max(1, count)));
  }
}

/** Mirror rows with the same field shape as the existing synthetic spec (about 535 B each as JSON). */
export function mirror(count: number, opts: { pattern?: Pattern; series?: number; fatBytes?: number } = {}): MirrorRow[] {
  const pattern = opts.pattern ?? "hourly", series = opts.series ?? 1, rnd = lcg(count * 31 + series);
  const step = stepMs(pattern, count), t0 = Date.UTC(2020, 0, 1);
  let level = 20_000;
  return Array.from({ length: count }, (_, i) => {
    level += (rnd() - 0.5) * 40;
    const ts = new Date(t0 + i * step).toISOString();
    const account = series === 1 ? DEPLOYMENT.account_id : `acc_${i % series}`;
    return {
      rowId: `equity_${i}`, ts,
      fields: {
        ...DEPLOYMENT, account_id: account, id: i, ts, equity: level.toFixed(2),
        currency: "USD", net_pnl: `${i % 733}.00`, fee_total: null, funding_pnl: "0",
        cash_free: "18000.00", cash_locked: "2000.00", total_fills: String(i),
        state_digest: `sha256:${"a".repeat(64)}`, source: "SYNTHETIC_RETAINED_INPUT",
        snapshot_reason: "HISTORY_DEPTH_MEASUREMENT",
        ...(opts.fatBytes ? { note: "x".repeat(opts.fatBytes) } : {}),
      },
    };
  });
}

const cmpRow = (a: MirrorRow, b: MirrorRow) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : a.rowId < b.rowId ? -1 : a.rowId > b.rowId ? 1 : 0);
const NUMERIC = /^-?[0-9]+(\.[0-9]+)?$/;

/**
 * Interprets the repository's three history statements. Parameter layout for the
 * unscoped path: $1-$4 key, $5 from, then (entity field, entity value), value
 * field, series field, [bucket seconds].
 */
export function emulatedPool(all: MirrorRow[]) {
  const log: Array<{ kind: "count" | "exact" | "bucket"; text: string; values: unknown[]; returned: number }> = [];
  const eligible = (values: unknown[]) => {
    const from = Date.parse(String(values[4]));
    const [ef, ev, vf] = [String(values[5]), values[6], String(values[7])];
    return all.filter(r => Date.parse(r.ts) >= from && String(r.fields[ef]) === ev
      && NUMERIC.test(String(r.fields[vf] ?? "")));
  };
  return {
    log,
    async query(text: string, values: unknown[]) {
      const rows = eligible(values);
      if (/SELECT count\(\*\)/.test(text)) {
        const sf = String(values[8]);
        const stamps = rows.map(r => Date.parse(r.ts));
        log.push({ kind: "count", text, values, returned: 1 });
        return { rows: [{ n: String(rows.length), k: String(new Set(rows.map(r => String(r.fields[sf]))).size),
          t0: stamps.length ? new Date(Math.min(...stamps)).toISOString() : null,
          t1: stamps.length ? new Date(Math.max(...stamps)).toISOString() : null }] };
      }
      if (!/row_number\(\)/.test(text)) {
        const out = rows.slice().sort(cmpRow);
        log.push({ kind: "exact", text, values, returned: out.length });
        return { rows: out.map(r => ({ row_id: r.rowId, ts: r.ts, fields: r.fields })) };
      }
      const vf = String(values[7]), sf = String(values[8]), bucket = Number(values[9]);
      const groups = new Map<string, MirrorRow[]>();
      for (const r of rows) {
        const key = `${String(r.fields[sf])}|${Math.floor(Date.parse(r.ts) / 1000 / bucket)}`;
        (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
      }
      const value = (r: MirrorRow) => Number(r.fields[vf]);
      const picked = new Set<MirrorRow>();
      for (const g of groups.values()) {
        picked.add(g.slice().sort((a, b) => value(a) - value(b) || cmpRow(a, b))[0]);        // rn_min = 1
        picked.add(g.slice().sort((a, b) => value(b) - value(a) || cmpRow(a, b))[0]);        // rn_max = 1
        picked.add(g.slice().sort((a, b) => -cmpRow(a, b))[0]);                              // rn_last = 1
      }
      const out = [...picked].sort(cmpRow);
      log.push({ kind: "bucket", text, values, returned: out.length });
      return { rows: out.map(r => ({ row_id: r.rowId, ts: r.ts, fields: r.fields })) };
    },
  };
}

export function tagged(value: Row[string]) {
  if (value === null) return { kind: "NULL", value };
  if (typeof value === "boolean") return { kind: "BOOLEAN", value };
  if (typeof value === "number") return { kind: "INTEGER", value };
  return { kind: /^\d{4}-\d\d-\d\dT/.test(value) ? "TIMESTAMP" : "TEXT", value };
}

export function currentSource(snapshot: Row) {
  return {
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
    async relation(_p: unknown, _e: unknown, _s: unknown, _src: unknown, relation: string) {
      const rows = relation === "strategy_deployments" ? [DEPLOYMENT]
        : relation === "account_equity_snapshots" ? [snapshot] : [];
      return {
        schema_version: "portal.execution.current-source-bff.v2", source_environment: "paper",
        profile_id: PROFILE,
        source: {
          contract_version: "trading-system.portal-execution.manager-v2.runtime.v1", authority: "EXECUTION_CELL",
          profile_id: PROFILE, availability: "AVAILABLE", freshness: "STALE", completeness: "COMPLETE", as_of: AS_OF,
          data: {
            relation: { schema: "public", relation }, next_cursor: null,
            items: rows.map((fields, i) => ({
              relation: { schema: "public", relation }, record_key: `fixture-${relation}-${i}`,
              fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, tagged(v)])),
            })),
          },
        },
      };
    },
  };
}

export const config = () => loadConfig({
  DATABASE_URL: "postgres://unused:unused@localhost/unused", PORTAL_ENV: "local", AUTH_MODE: "dev",
  EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: WORKSPACE, EXECUTION_EDGE_PAPER_PROFILE_ID: PROFILE,
});

/** REAL repository over the emulated pool, REAL PaperReadService on top. */
export function realProducer(rows: MirrorRow[]) {
  const pool = emulatedPool(rows);
  const repository = new ExecutionProfileProjectionRepository(pool as never);
  const service = new PaperReadService(currentSource(rows.at(-1)!.fields) as unknown as ExecutionProductReadSource,
    config(), undefined, undefined, repository);
  return { pool, repository, service };
}

export const percentile = (samples: number[], p: number) => {
  const o = samples.slice().sort((a, b) => a - b);
  return o[Math.max(0, Math.ceil(o.length * p) - 1)];
};
export const ms = (n: number) => Math.round(n * 1_000) / 1_000;
export const MIB = 1024 * 1024;
export const BUDGET = 16 * MIB;
