/**
 * Volume for the e2e BFF doubles (the standalone fixture BFF's `FIXTURE_SCALE`).
 *
 * The doubles were written for specs: a handful of rows each. A person judging
 * how a screen looks needs realistic volume, so this module generates MORE rows
 * of the same wire shapes, deterministically (a fixed seed, no `Math.random`, no
 * clock), and the doubles append them to their own rows.
 *
 * ADDITIVE BY CONSTRUCTION. The default scale is `small`, whose universe is
 * EMPTY: every list a double builds is its own list plus nothing. Only a caller
 * that opts in (`setFixtureScale("medium")`, which the standalone server does at
 * start) sees more rows, so no Playwright spec and no unit test changes.
 *
 * HONESTY RULES kept at every size:
 *  - money is an exact decimal string; sums are exact decimal sums, per currency;
 *  - a portfolio books deployments in its own base currency only, and nothing here
 *    ever adds across currencies;
 *  - a missing fact stays `null` (a balance the source did not publish, an owner
 *    nobody holds) and a gap stays a gap;
 *  - states vary on purpose: stale, partial, expired, suspended, blocked, failed.
 *
 * Counts (alphas / deployments / portfolios / accounts / blotter orders /
 * operations / approvals), the sizes `small` reproduces from the doubles:
 *   small   5 / 5 / 6 / 5 / 137 / 12 / 5     (what the specs read)
 *   medium  40 / ~60 / 25 / 80 / 300 / 120 / 30
 *   large   120 / ~180 / 75 (60 shown, truncated) / 240 / 1500 / 400 / 90
 * Users stay at the 123 their double already publishes.
 */

export type ScaleName = "small" | "medium" | "large";
export type Env = "paper" | "sandbox" | "live";

export interface ScaleCounts {
  alphas: number;
  portfolios: number;
  portfoliosShown: number;
  accounts: { live: number; paper: number; sandbox: number };
  blotterOrders: number;
  operations: number;
  approvals: number;
}

export const SCALES: Record<ScaleName, ScaleCounts> = {
  small: { alphas: 5, portfolios: 6, portfoliosShown: 6, accounts: { live: 3, paper: 1, sandbox: 1 }, blotterOrders: 137, operations: 13, approvals: 5 }, // WP-B2-S3: 12 -> 13 (the dry-run reconcile of Carry A's Live deployment is a world operation)
  medium: { alphas: 40, portfolios: 25, portfoliosShown: 25, accounts: { live: 50, paper: 20, sandbox: 10 }, blotterOrders: 300, operations: 120, approvals: 30 },
  large: { alphas: 120, portfolios: 75, portfoliosShown: 60, accounts: { live: 150, paper: 60, sandbox: 30 }, blotterOrders: 1500, operations: 400, approvals: 90 },
};

/** Rows the doubles already hold on their own; the universe adds only what lies beyond them. */
const NATIVE = { alphas: 5, portfolios: 6, accounts: { live: 3, paper: 1, sandbox: 1 }, operations: 13, approvals: 5 };

export function isScaleName(value: unknown): value is ScaleName {
  return value === "small" || value === "medium" || value === "large";
}

let current: ScaleName = "small";
let nowMs = Date.parse("2026-08-22T13:00:00Z");

export function setFixtureScale(name: ScaleName): void {
  current = name;
}
export function fixtureScale(): ScaleName {
  return current;
}
export function scaleCounts(): ScaleCounts {
  return SCALES[current];
}
/** The instant generated operations are placed relative to (the server's FIXTURE_NOW_ISO). */
export function setFixtureNow(iso: string): void {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) throw new Error(`FIXTURE_NOW_ISO is not an instant: ${iso}`);
  nowMs = parsed;
}
export function fixtureNowMs(): number {
  return nowMs;
}

/* ── determinism ────────────────────────────────────────────────────────── */

/** mulberry32: small, fast, and the same sequence on every machine. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;
const pick = <T,>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)]!;
const weighted = <T,>(rng: Rng, items: readonly (readonly [T, number])[]): T => {
  const total = items.reduce((n, [, w]) => n + w, 0);
  let at = rng() * total;
  for (const [item, w] of items) {
    at -= w;
    if (at < 0) return item;
  }
  return items[items.length - 1]![0];
};
const pad = (n: number, width: number): string => String(n).padStart(width, "0");

/** Exact decimal addition on strings: the longest scale wins, nothing is rounded. */
export function addDecimal(a: string, b: string): string {
  const sa = (a.split(".")[1] ?? "").length;
  const sb = (b.split(".")[1] ?? "").length;
  const scale = Math.max(sa, sb);
  const toInt = (v: string, s: number) => BigInt(v.replace(".", "") + "0".repeat(scale - s));
  const total = toInt(a, sa) + toInt(b, sb);
  const negative = total < 0n;
  const text = (negative ? -total : total).toString().padStart(scale + 1, "0");
  const body = scale === 0 ? text : `${text.slice(0, -scale)}.${text.slice(-scale)}`;
  return negative ? `-${body}` : body;
}

/** Sum `values` per currency, keys in sorted order. Nothing is ever added across currencies. */
export function sumByCurrency(entries: readonly { currency: string; value: string }[]): { currency: string; value: string }[] {
  const totals = new Map<string, string>();
  for (const { currency, value } of entries) totals.set(currency, addDecimal(totals.get(currency) ?? "0", value));
  return [...totals.keys()].sort().map((currency) => ({ currency, value: totals.get(currency)! }));
}

/* ── the universe ───────────────────────────────────────────────────────── */

export interface PortfolioSpec {
  id: string;
  name: string;
  owner: string | null;
  base: string;
  state: string;
  environments: Env[];
  updatedAt: string;
  deploymentIds: string[];
  allocatedByCurrency: { currency: string; value: string }[];
}

export interface DeploymentSpec {
  id: string;
  alphaId: string;
  stage: "RESEARCH" | "PAPER" | "SANDBOX" | "CANARY" | "LIVE";
  environment: Env;
  venue: string;
  accountId: string;
  portfolioId: string;
  portfolioName: string;
  currency: string;
  allocation: string;
  exposure: string;
  realized: string;
  unrealized: string;
  health: "READY" | "ATTENTION" | "FINDING";
  state: "ACTIVE" | "HALTED";
  active: boolean;
  updatedAt: string;
}

export interface AlphaSpec {
  id: string;
  label: string;
  version: string;
  owner: string | null;
  stages: string[];
  health: "READY" | "ATTENTION" | "RESEARCH_ONLY";
  attention: string[];
  deployments: DeploymentSpec[];
  updatedAt: string;
}

export interface BindingSpec {
  bindingId: string;
  accountId: string;
  venue: string;
  state: string;
  credentialState: string;
  updatedAt: string;
  environment: Env;
}

export interface OperationSpec {
  id: string;
  at: string;
  command: string;
  target: [string, string];
  env: "PAPER" | "SANDBOX" | "LIVE";
  risk: string;
  severity: string;
  source: string;
  verify: string;
  triage: "UNACKNOWLEDGED" | "ACKNOWLEDGED" | "RESOLVED";
}

export interface Universe {
  alphas: AlphaSpec[];
  portfolios: PortfolioSpec[];
  portfoliosTotal: number;
  portfoliosTruncated: boolean;
  bindings: BindingSpec[];
  operations: OperationSpec[];
  approvals: Record<string, unknown>[];
}

const EMPTY: Universe = { alphas: [], portfolios: [], portfoliosTotal: NATIVE.portfolios, portfoliosTruncated: false, bindings: [], operations: [], approvals: [] };

const THEMES = ["Momentum", "Basis", "Carry", "Grid", "Trend", "Reversion", "StatArb", "Breakout", "Funding", "Skew", "Vol-Target", "Pairs", "Spread", "Gamma", "Delta-Neutral", "Liquidity"] as const;
const OWNERS = ["Lan-002", "Minh-003", "Bobby-001", "Hana-004", "Ivo-005", "Sora-006"] as const;
const PEOPLE = ["M. Tran", "L. Nguyen", "H. Pham", "I. Novak", "S. Mori"] as const;
const VENUES = ["BINANCE", "OKX", "BYBIT", "DERIBIT", "BITFLYER"] as const;
const STAGE_ENV: Record<DeploymentSpec["stage"], Env> = { RESEARCH: "paper", PAPER: "paper", SANDBOX: "sandbox", CANARY: "live", LIVE: "live" };
const STAGE_ORDER = ["LIVE", "CANARY", "SANDBOX", "PAPER", "RESEARCH"] as const;
const ALLOCATIONS = ["5000", "7500", "10000", "12500", "2500.50", "25000", "40000.25", "60000", "100000"] as const;
const DATA_BASE = Date.parse("2026-09-01T15:10:00Z");
/** Two decimals, never "-0.00" (a negative zero is not a published value). */
const money = (n: number): string => {
  const text = n.toFixed(2);
  return text === "-0.00" ? "0.00" : text;
};
const isoSeconds = (ms: number): string => new Date(ms).toISOString().replace(".000Z", "Z");

const memo = new Map<ScaleName, Universe>();

/** Everything generated for the current scale; `small` generates nothing. */
export function scaled(): Universe {
  if (current === "small") return EMPTY;
  const hit = memo.get(current);
  if (hit) return hit;
  const built = build(SCALES[current], current);
  memo.set(current, built);
  return built;
}

function build(counts: ScaleCounts, name: ScaleName): Universe {
  const rng = seeded(name === "medium" ? 20261019 : 20261020);

  /* accounts first: deployments book against them */
  const bindings: BindingSpec[] = [];
  const perEnv: Record<Env, BindingSpec[]> = { live: [], paper: [], sandbox: [] };
  for (const environment of ["live", "paper", "sandbox"] as const) {
    const extra = counts.accounts[environment] - NATIVE.accounts[environment];
    for (let i = 0; i < extra; i += 1) {
      const number = pad(bindings.length + 1, 3);
      const venue = environment === "live" ? weighted(rng, [["BINANCE", 5], ["OKX", 3], ["BYBIT", 2]] as const) : environment === "paper" ? "BINANCE" : weighted(rng, [["BINANCE", 2], ["OKX", 1], ["DERIBIT", 1]] as const);
      const credentialState = weighted(rng, [["SYNC_SYNCED", 62], ["SYNC_STALE", 20], ["EXPIRED", 10], ["NOT_PUBLISHED", 8]] as const);
      const spec: BindingSpec = {
        bindingId: `bnd_${number}@${venue}`,
        accountId: `acc_scale_${number}`,
        venue,
        state: credentialState === "NOT_PUBLISHED" ? weighted(rng, [["SUSPENDED", 3], ["ACTIVE", 1]] as const) : weighted(rng, [["ACTIVE", 9], ["SUSPENDED", 1]] as const),
        credentialState,
        updatedAt: new Date(DATA_BASE - Math.floor(rng() * 9 * 24 * 3_600_000)).toISOString().replace(/\.\d{3}Z$/, ".000Z"),
        environment,
      };
      bindings.push(spec);
      perEnv[environment].push(spec);
    }
  }

  /* portfolios: names and base currencies are fixed up front, books are filled by the deployments */
  const extraPortfolios = counts.portfolios - NATIVE.portfolios;
  const portfolios: PortfolioSpec[] = [];
  for (let i = 0; i < extraPortfolios; i += 1) {
    // UI adjustment WP-4 (Bobby, 2026-11-10): the review/scale world publishes USDT only. The draw is kept (one rng call) so the
    // seeded sequence after it is unchanged; multi-currency honesty is exercised by the TEST_ONLY doubles (bffDoublePortfolios).
    const base = weighted(rng, [["USDT", 1]] as const);
    portfolios.push({
      id: `pf_scale_${pad(i + 1, 3)}`,
      name: `${pick(rng, THEMES)} Book ${pad(i + 1, 2)}`,
      owner: rng() < 0.12 ? null : pick(rng, PEOPLE),
      base,
      state: "ACTIVE",
      environments: [],
      updatedAt: isoSeconds(DATA_BASE - Math.floor(rng() * 20 * 24 * 3_600_000)),
      deploymentIds: [],
      allocatedByCurrency: [],
    });
  }

  /* alphas and their deployments */
  const alphas: AlphaSpec[] = [];
  let depCount = 0;
  const extraAlphas = counts.alphas - NATIVE.alphas;
  for (let i = 0; i < extraAlphas; i += 1) {
    const k = portfolios.length === 0 ? 0 : weighted(rng, [[0, 15], [1, 40], [2, 25], [3, 12], [4, 8]] as const);
    const baseStage = weighted(rng, [["PAPER", 20], ["SANDBOX", 15], ["CANARY", 15], ["LIVE", 50]] as const);
    const deployments: DeploymentSpec[] = [];
    for (let d = 0; d < k; d += 1) {
      const stage = d === 0 ? baseStage : weighted(rng, [[baseStage, 3], ["CANARY", 1], ["PAPER", 1], ["SANDBOX", 1]] as const);
      const environment = STAGE_ENV[stage];
      const pool = perEnv[environment];
      const portfolio = pick(rng, portfolios);
      const account = pool.length > 0 ? pick(rng, pool) : null;
      const health = weighted(rng, [["READY", 75], ["ATTENTION", 15], ["FINDING", 10]] as const);
      const allocation = pick(rng, ALLOCATIONS);
      const state = health === "ATTENTION" && rng() < 0.5 ? "HALTED" : "ACTIVE";
      depCount += 1;
      const deployment: DeploymentSpec = {
        id: `dep_scale_${pad(depCount, 3)}`,
        alphaId: `alpha_scale_${pad(i + 1, 3)}`,
        stage,
        environment,
        venue: account?.venue ?? pick(rng, VENUES),
        accountId: account?.accountId ?? `acc_scale_unbound_${pad(depCount, 3)}`,
        portfolioId: portfolio.id,
        portfolioName: portfolio.name,
        currency: portfolio.base,
        allocation,
        exposure: health === "READY" && rng() < 0.2 ? "0" : money(Number(allocation) * rng() * 0.9),
        realized: money((rng() - 0.4) * Number(allocation) * 0.05),
        unrealized: money((rng() - 0.5) * Number(allocation) * 0.03),
        health,
        state,
        active: state === "ACTIVE",
        updatedAt: isoSeconds(DATA_BASE - Math.floor(rng() * 14 * 24 * 3_600_000)),
      };
      deployments.push(deployment);
      portfolio.deploymentIds.push(deployment.id);
      if (!portfolio.environments.includes(environment)) portfolio.environments.push(environment);
    }
    const stages = [...new Set(deployments.map((dep) => dep.stage))].sort((a, b) => STAGE_ORDER.indexOf(a as never) - STAGE_ORDER.indexOf(b as never));
    const attention = deployments.some((dep) => dep.health === "ATTENTION")
      ? ["DEPLOYMENT_ATTENTION", ...(rng() < 0.4 ? ["RECONCILIATION_OPEN"] : [])]
      : [];
    alphas.push({
      id: `alpha_scale_${pad(i + 1, 3)}`,
      label: `${pick(rng, THEMES)} ${pad(i + 6, 2)}`,
      version: `${Math.floor(rng() * 3)}.${Math.floor(rng() * 10)}`,
      owner: k === 0 && rng() < 0.5 ? null : pick(rng, OWNERS),
      stages: k === 0 ? ["RESEARCH"] : stages,
      health: k === 0 ? "RESEARCH_ONLY" : attention.length > 0 ? "ATTENTION" : "READY",
      attention,
      deployments,
      updatedAt: deployments.length > 0 ? deployments.map((dep) => dep.updatedAt).sort().reverse()[0]! : isoSeconds(DATA_BASE - Math.floor(rng() * 30 * 24 * 3_600_000)),
    });
  }
  for (const portfolio of portfolios) {
    if (portfolio.environments.length === 0) portfolio.environments.push("paper");
    const books = alphas.flatMap((alpha) => alpha.deployments).filter((dep) => dep.portfolioId === portfolio.id);
    portfolio.allocatedByCurrency = sumByCurrency(books.map((dep) => ({ currency: dep.currency, value: dep.allocation })));
  }

  return {
    alphas,
    portfolios,
    portfoliosTotal: counts.portfolios,
    portfoliosTruncated: counts.portfoliosShown < counts.portfolios,
    bindings,
    operations: operations(rng, counts.operations - NATIVE.operations, portfolios, bindings, alphas),
    approvals: approvals(rng, counts.approvals - NATIVE.approvals),
  };
}

/* ── operations ─────────────────────────────────────────────────────────── */

const COMMANDS = [
  ["portfolio/adjust-target-budget", "PORTFOLIO", 3],
  ["portfolio/recall", "PORTFOLIO", 2],
  ["portfolio/return-capital", "PORTFOLIO", 1],
  ["account/sync", "ACCOUNT", 4],
  ["account/top-up", "ACCOUNT", 1],
  ["deployment/resume", "DEPLOYMENT", 2],
  ["deployment/archive", "DEPLOYMENT", 1],
] as const;

function operations(rng: Rng, count: number, portfolios: PortfolioSpec[], bindings: BindingSpec[], alphas: AlphaSpec[]): OperationSpec[] {
  const rows: OperationSpec[] = [];
  const deployments = alphas.flatMap((alpha) => alpha.deployments);
  const base = nowMs - 5 * 60_000;
  let at = base;
  for (let i = 0; i < count; i += 1) {
    // Irregular gaps, a minute to forty: roughly two days of history at medium.
    at -= Math.floor(60_000 + rng() * 40 * 60_000 * (i % 7 === 0 ? 2 : 1));
    const [command, kind] = weighted(rng, COMMANDS.map((c) => [[c[0], c[1]] as const, c[2]] as const));
    const env = weighted(rng, [["LIVE", 4], ["SANDBOX", 2], ["PAPER", 3]] as const);
    const risk = env === "PAPER" ? "R1_PAPER_MUTATION" : env === "SANDBOX" ? "R2_SANDBOX" : command === "portfolio/adjust-target-budget" || command === "account/top-up" ? "R4_LIVE_RISK_INCREASING" : "R3_LIVE_PROTECTIVE";
    const source = weighted(rng, [["SUCCEEDED", 52], ["FAILED", 10], ["PENDING", 8], ["RUNNING", 6], ["BLOCKED", 8], ["EXPIRED", 6], ["UNCERTAIN", 10]] as const);
    const verify = source === "SUCCEEDED" ? weighted(rng, [["SUCCEEDED", 6], ["PARTIAL", 2], ["NOT_STARTED", 1], ["DENIED", 1]] as const)
      : source === "FAILED" ? "FAILED" : source === "UNCERTAIN" ? "UNCERTAIN" : source === "EXPIRED" ? "EXPIRED" : source === "BLOCKED" ? "NOT_STARTED" : "PENDING";
    const severity = source === "FAILED" ? "ERROR" : source === "UNCERTAIN" ? weighted(rng, [["CRITICAL", 1], ["WARNING", 1]] as const) : source === "SUCCEEDED" ? weighted(rng, [["INFO", 4], ["WARNING", 1]] as const) : "WARNING";
    const triage = source === "FAILED" || source === "UNCERTAIN"
      ? weighted(rng, [["UNACKNOWLEDGED", 6], ["ACKNOWLEDGED", 3], ["RESOLVED", 1]] as const)
      : weighted(rng, [["UNACKNOWLEDGED", 5], ["ACKNOWLEDGED", 2], ["RESOLVED", 3]] as const);
    const targetId = kind === "PORTFOLIO"
      ? (portfolios.length > 0 ? pick(rng, portfolios).id : "pf_TEST_ONLY_core")
      : kind === "ACCOUNT"
        ? (bindings.length > 0 ? pick(rng, bindings).accountId : "acc_TEST_ONLY_binance01")
        : (deployments.length > 0 ? pick(rng, deployments).id : "dep_sandbox_01");
    // Microsecond instants on purpose: the SQL keyset boundary is six digits wide.
    const micro = String(Math.floor(rng() * 1_000_000)).padStart(6, "0");
    rows.push({
      id: `op_SCALE_${pad(i + 1, 4)}`,
      at: `${new Date(at).toISOString().replace(/\.\d{3}Z$/, "")}.${micro}Z`,
      command,
      target: [kind, targetId],
      env,
      risk,
      severity,
      source,
      verify,
      triage,
    });
  }
  return rows;
}

/* ── approvals ──────────────────────────────────────────────────────────── */

function approvals(rng: Rng, count: number): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < count; i += 1) {
    const gate = weighted(rng, [["R1", 4], ["R2", 3], ["PAPER_EXIT", 2], ["LIVE_GATE", 2]] as const);
    const budget = gate === "PAPER_EXIT" ? 2880 : gate === "LIVE_GATE" ? 4320 : 1440;
    const age = Math.floor(rng() * budget * 1.4);
    const blocked = gate !== "LIVE_GATE" && rng() < 0.2;
    const self = gate === "LIVE_GATE" && rng() < 0.3;
    const subject = `${pick(rng, THEMES)} v${Math.floor(rng() * 3)}.${Math.floor(rng() * 10)}`;
    const target = gate === "R1" ? "research" : gate === "R2" ? `sandbox · ${pick(rng, ["OKX TESTNET", "BINANCE TESTNET", "BYBIT TESTNET"] as const)}` : gate === "PAPER_EXIT" ? `→ sandbox · ${pick(rng, ["DERIBIT", "OKX", "BINANCE"] as const)}` : "live · dual approval";
    const required = gate === "PAPER_EXIT" ? 1 : 2;
    const prefix = gate === "PAPER_EXIT" ? "EX" : "AP";
    const number = (gate === "R1" ? 400 : gate === "R2" ? 500 : gate === "PAPER_EXIT" ? 800 : 600) + i;
    rows.push({
      approval_id: `${prefix}-${number}`,
      gate,
      subject: gate === "R1" ? `${subject} · RC-${40 + i}` : gate === "PAPER_EXIT" ? `${subject} · dep_${60 + i}` : gate === "LIVE_GATE" ? `${subject} → ${pick(rng, ["BINANCE", "OKX"] as const)}` : `${subject} → PF-MAIN`,
      target,
      blocker_count: blocked ? 1 + (i % 2) : 0,
      blocker_summary: blocked ? pick(rng, ["broker sync stale", "audit replay failed", "capital preview unavailable"] as const) : "none",
      sla: { age_minutes: age, budget_minutes: budget },
      quorum_met: Math.min(required, Math.floor(rng() * (required + 1))),
      quorum_required: required,
      inert: blocked ? "BLOCKED" : self ? "SELF" : null,
      needs_you: !blocked && !self && rng() < 0.6,
    });
  }
  return rows;
}
