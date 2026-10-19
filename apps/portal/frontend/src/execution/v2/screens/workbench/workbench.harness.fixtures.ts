/**
 * Test harness for the Paper workbench suites (tests only: product code never
 * imports a `*.fixtures` file).
 *
 * The wire body is DERIVED from the canonical fixture Codex published
 * (`execution-paper-workbench.partial.valid.json`, loaded by the L0 loader),
 * then given rows by cloning a template row, so its shape stays the published
 * one and a conformance test can hold it to the schema. The ExecutionApi is a
 * fake of the port: only the two reads the screen makes, each answering through
 * the PRODUCT readers (`readProfileEnvelope`, `readDeploymentQuality`) so a
 * body that the readers refuse is refused here too.
 */
import { readDeploymentQuality, type DeploymentQuality } from "../../../api/derivations";
import type { ExecutionApi, Result } from "../../../api/ports";
import { readProfileEnvelope, type ProfileEnvelope } from "../../../api/profileRead";
import { loadCanonical } from "../../testkit/loadCanonical";
import { cloneRows, pad } from "../../testkit/scale";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Wire = any;

export const DEP = "dep_TEST_ONLY_paper";
export const STRATEGY = "alpha_TEST_ONLY";
export const PORTFOLIO = "pf_TEST_ONLY";
export const ACCOUNT = "acct_TEST_ONLY";

const CANONICAL = "execution-paper-workbench.partial.valid.json";

export interface WireOptions {
  orders?: number;
  fills?: number;
  positions?: number;
  /** Equity snapshots; 0 leaves the branch empty. */
  equity?: number;
  /** Adds `data.history_windows.account_equity` (not in the published `Data` schema, which the V1 reader still reads). */
  history?: boolean;
}

const ORDER_STATES = ["FILLED", "UNKNOWN", "REJECTED", "SUBMITTED"] as const;

/** One canonical profile body with deterministic, readable rows. */
export function paperWire(options: WireOptions = {}): Wire {
  const { orders = 2, fills = 1, positions = 1, equity = 6, history = false } = options;
  const wire: Wire = loadCanonical(CANONICAL);
  wire.state = "ready";
  wire.freshness = "FRESH";
  wire.completeness = "COMPLETE";
  wire.as_of = "2026-10-17T09:14:00Z";
  wire.read_at = "2026-10-17T09:14:02Z";
  wire.resource = { ...wire.resource, id: DEP };
  const deployment = {
    deployment_id: DEP,
    strategy_id: STRATEGY,
    portfolio_id: PORTFOLIO,
    account_id: ACCOUNT,
    venue: "binance",
    mode: "paper",
    active: true,
    updated_at: "2026-10-17T09:14:00Z",
  };
  const data = wire.data;
  data.deployment = deployment;
  data.deployments = [deployment];
  data.observation_gate = {
    state: "PARTIAL",
    observed_days: 3,
    policy_minimum_observed_days: 14,
    trade_count: 2,
    policy_minimum_trade_count: 20,
    session_count: 1,
    window_bounded: true,
    reason_code: "SOURCE_RETENTION_SHORT",
    policy_stage: "PAPER_OBSERVATION",
    policy_version: "paper.v1",
  };
  data.orders = cloneRows({ order_id: "", client_order_id: "", side: "BUY", status: "FILLED", quantity: "0.12", price: "67420.50", submitted_at: "" }, orders, (row, i) => {
    row.order_id = `ord_${pad(i)}`;
    row.client_order_id = `c-0044-${pad(i, 4)}`;
    row.side = i % 2 === 0 ? "BUY" : "SELL";
    row.status = ORDER_STATES[i % ORDER_STATES.length];
    row.submitted_at = new Date(Date.UTC(2026, 9, 16, 14, 0, 0) + i * 60_000).toISOString();
  });
  data.fills = cloneRows({ fill_id: "", client_order_id: "", quantity: "0.12", price: "67420.50", commission: "12.40", commission_currency: "USDT", trade_time: "" }, fills, (row, i) => {
    row.fill_id = `fill_${pad(i)}`;
    row.client_order_id = `c-0044-${pad(i, 4)}`;
    row.trade_time = new Date(Date.UTC(2026, 9, 16, 14, 2, 0) + i * 60_000).toISOString();
  });
  data.positions = cloneRows({ instrument_id: "BTCUSDT", side: "LONG", quantity: "0.12", avg_px_open: "67420.50", mark_price: "67500.00", unrealized_pnl: "9.54", updated_at: "2026-10-17T09:14:00Z" }, positions, (row, i) => {
    row.instrument_id = i === 0 ? "BTCUSDT" : `SYM${pad(i)}USDT`;
  });
  data.account_equity = cloneRows(
    {
      ts: "", currency: "USDT", equity: "100000.00", net_pnl: "0.00", fee_total: "12.40", funding_pnl: null, cash_free: "91200.00", cash_locked: "10600.00",
      total_fills: 2, state_digest: "9c1e04b7a2f1ffff", snapshot_reason: "PERIODIC", source: "paper-0044", drawdown: "0",
    },
    equity,
    (row, i) => {
      row.ts = new Date(Date.UTC(2026, 9, 11, 0, 0, 0) + i * 6 * 3_600_000).toISOString();
      row.equity = (100_000 + i * 360).toFixed(2);
      row.net_pnl = (i * 360).toFixed(2);
    },
  );
  if (history) {
    data.history_windows = { account_equity: { days: 90, source_rows: 1438, basis: "ACCOUNT_EQUITY_SNAPSHOTS", downsample: { method: "bucket_last", bucket_seconds: 3600 } } };
  }
  return wire;
}

/** The execution-quality derivation body (`readDeploymentQuality` shape). */
export function qualityWire(overrides: Wire = {}): Wire {
  return {
    schema_version: "execution.derivation.deployment-quality.v1",
    logical_operation_id: "executionDeploymentQualityV1",
    environment: "paper",
    state: "PARTIAL",
    reason_code: null,
    freshness: "FRESH",
    completeness: "PARTIAL",
    data: {
      deployment_id: DEP,
      execution_session_population: "1",
      order_population: "2",
      fill_population: "1",
      submitted_count: "2",
      risk_rejected_count: "0",
      broker_rejected_count: "0",
      filled_count: "1",
      rejected_count: "0",
      reject_rate: { numerator: "0", denominator: "2" },
      latency_state: "UNAVAILABLE",
      latency_reason_code: "BROKER_TIMESTAMPS_NOT_PUBLISHED",
      current_observation_only: true,
    },
    ...overrides,
  };
}

export const envelopeOf = (wire: Wire): ProfileEnvelope => {
  const read = readProfileEnvelope(wire);
  if (read === null) throw new Error("the profile reader refused the harness body");
  return read;
};

export const qualityOf = (wire: Wire = qualityWire()): DeploymentQuality => {
  const read = readDeploymentQuality(wire);
  if (read === null) throw new Error("the quality reader refused the harness body");
  return read;
};

export type Answer<T> = Result<T> | Promise<Result<T>>;

export interface Fake {
  api: ExecutionApi;
  /** Reads made, in order: `profile:<id>:<variant>` and `quality:<id>`. */
  calls: string[];
  signals: AbortSignal[];
}

export interface FakeOptions {
  /** A body (or a typed failure) per call; the last one repeats. */
  profile?: Answer<ProfileEnvelope> | (() => Answer<ProfileEnvelope>);
  quality?: Answer<DeploymentQuality> | (() => Answer<DeploymentQuality>);
}

const ok = <T,>(value: T): Result<T> => ({ ok: true, value });

/** A fake ExecutionApi: the two reads the screen makes and `withReadSignal`. */
export function fakeApi(options: FakeOptions = {}): Fake {
  const calls: string[] = [];
  const signals: AbortSignal[] = [];
  const profile = options.profile ?? ok(envelopeOf(paperWire()));
  const quality = options.quality ?? ok(qualityOf());
  const make = (signal?: AbortSignal): ExecutionApi => {
    const api = {
      async getPaperWorkbenchProfile(id: string, variant: "paper" | "vnm" = "paper") {
        calls.push(`profile:${id}:${variant}`);
        if (signal) signals.push(signal);
        return typeof profile === "function" ? profile() : profile;
      },
      async getDeploymentQuality(id: string) {
        calls.push(`quality:${id}`);
        return typeof quality === "function" ? quality() : quality;
      },
      withReadSignal(next: AbortSignal) {
        return make(next);
      },
    } as unknown as ExecutionApi;
    return api;
  };
  return { api: make(), calls, signals };
}

export function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

/** A session standing in for `useSession`. */
export function sessionOf(capabilities: Iterable<string>, userId = "principal-test-only") {
  return {
    principal: { principalId: `p_${userId}`, username: "tester", role: "x", sessionId: "s", mustChangePassword: false, authnMethods: [], issuedAt: "", exp: 0 },
    access: { kind: "ready" as const, access: { userId, isOwner: false, ownerState: "NOT_OWNER", capabilities: [...capabilities] } },
  };
}

export const fail = <T,>(status: "denied" | "unavailable" | "stale" | "terminal" | "empty", reason: string): Result<T> => ({ ok: false, status, reason });
