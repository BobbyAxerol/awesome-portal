/**
 * THE STAGE LINEAGE OF THE WORLD (UXM-07 step B, WP-B2-S). One answer to "which stage is this deployment in, and if it has left it, when and by whom".
 *
 * Rule: a deployment id has exactly ONE stage and ONE stage history. The history is the alpha's (bffWorld.lifecycleOf / stageRecord, the very one the Alpha 360
 * spine, Fleet days in stage and the stage rooms read). A deployment whose stage the alpha has LEFT is COMPLETED: it has an exit date (the day the next stage began),
 * an exit decider (a person of the roster), final figures and no open position, working order or running session. A deployment in the stage the alpha is IN is CURRENT.
 *
 * Nothing here is a source fact or a permission; nothing reaches the product bundle (e2e/ is kept out of it).
 */
import { createHash } from "node:crypto";

import type { AlphaSpec, DeploymentSpec } from "./bffScale";
import { blotterBookOf } from "./bffDoubleOverview";
import { DAY_MS, deploymentOf, fromCents, lifecycleOf, personByUsername, stageRecord, toCents, WORLD_ACTORS, WORLD_NOW_MS, worldAlphas, type StageName } from "./bffWorld";

const ORDER: readonly StageName[] = ["paper", "sandbox", "canary", "live"];
const rankOf = (stage: StageName): number => ORDER.indexOf(stage);
export const stageOfSpec = (d: DeploymentSpec): StageName => (d.stage === "LIVE" ? "live" : d.stage === "CANARY" ? "canary" : d.stage === "SANDBOX" ? "sandbox" : "paper");

/* ── who decided what: the same seeded roster pick the Alpha 360 lifecycle keys use ───────────────── */

const seedOf = (alphaId: string): number => parseInt(createHash("sha256").update(JSON.stringify([alphaId, "wpc-life"])).digest("hex").slice(0, 8), 16);
const actorOf = (alphaId: string, n: number): string => WORLD_ACTORS[(seedOf(alphaId) + n) % WORLD_ACTORS.length]!;
/** The roster offsets of the lifecycle keys: R1 and R2 approvals and the exit decision of each stage. Alpha 360 (review-manager wpcLifecycleKeys) reads these. */
export const GATE_ACTOR_OFFSET = { r1: 0, r2: 1, paper: 2, sandbox: 0, canary: 1 } as const;

export interface StageHistory {
  reached: StageName;
  r1: { atMs: number; by: string };
  r2: { atMs: number; by: string };
  stages: Record<StageName, { status: "completed" | "current" | "none"; fromMs: number; toMs: number | null; days: number; decidedBy: string | null }>;
}
/** The stage lineage of one alpha: R1 / R2 gates and, per stage, status, dates and the person who approved its exit. Approvals and Alpha 360 read this one record. */
export function stageHistoryOf(alphaId: string): StageHistory {
  const life = lifecycleOf(alphaId);
  const stages = Object.fromEntries(ORDER.map((stage) => {
    const record = stageRecord(alphaId, stage);
    const decidedBy = record.status === "completed" && stage !== "live" ? actorOf(alphaId, GATE_ACTOR_OFFSET[stage]) : null;
    return [stage, { ...record, decidedBy }];
  })) as StageHistory["stages"];
  return { reached: life.reached, r1: { atMs: life.r1Ms, by: actorOf(alphaId, GATE_ACTOR_OFFSET.r1) }, r2: { atMs: life.r2Ms, by: actorOf(alphaId, GATE_ACTOR_OFFSET.r2) }, stages };
}
export const userIdOf = (username: string): string => personByUsername(username)?.id ?? "usr_0001";

/* ── stage records the alpha left without a deployment of its own (nothing is booked on an account) ──── */

/** The id of the record of a stage an alpha has left. When the alpha has a deployment of its own in that stage, that is the id; otherwise a history record with a stable id. */
export const historyDeploymentId = (alphaId: string, stage: StageName): string => `dep_${alphaId.replace(/^alpha_/, "")}_${stage}_hist`;
const HISTORY_ID = /^dep_(.+)_(paper|sandbox|canary)_hist$/;
function historySpec(alpha: AlphaSpec, stage: StageName, id: string): DeploymentSpec {
  const anchor = [...alpha.deployments].sort((a, b) => Number(toCents(b.allocation) - toCents(a.allocation)))[0]!;
  const allocation = toCents(anchor.allocation) / 4n;
  const realized = allocation * BigInt((seedOf(`${alpha.id}:${stage}`) % 90) - 20) / 10_000n;
  return {
    id, alphaId: alpha.id, stage: stage === "paper" ? "PAPER" : stage === "sandbox" ? "SANDBOX" : "CANARY", environment: stage === "canary" ? "live" : stage,
    venue: anchor.venue, accountId: stage === "paper" ? "acc_pap_sim" : stage === "sandbox" ? "acc_tn_bnc" : anchor.accountId,
    portfolioId: anchor.portfolioId, portfolioName: anchor.portfolioName, currency: anchor.currency, allocation: fromCents(allocation), exposure: "0",
    realized: fromCents(realized), unrealized: "0", health: "READY", state: "ACTIVE", active: false, updatedAt: anchor.updatedAt,
  };
}

export interface DeploymentStanding {
  deploymentId: string;
  alphaId: string;
  stage: StageName;
  status: "current" | "completed";
  current: boolean;
  fromMs: number;
  /** the day the alpha's next stage began; null while the stage is current */
  exitMs: number | null;
  days: number;
  /** username of the person who approved the exit; null while current */
  decidedBy: string | null;
  /** true for a stage record the alpha left without a deployment on the books */
  history: boolean;
}
export interface ResolvedStageDeployment { alpha: AlphaSpec; deployment: DeploymentSpec; standing: DeploymentStanding }

/** The world's deployment behind a stage page id (a booked deployment or a history record) with its standing in the one stage history of its alpha. */
export function resolveStageDeployment(deploymentId: string): ResolvedStageDeployment | null {
  const booked = deploymentOf(deploymentId);
  const hist = booked === null ? HISTORY_ID.exec(deploymentId) : null;
  let alpha = booked?.alpha;
  let deployment = booked?.deployment;
  let history = false;
  if (booked === null && hist !== null) {
    alpha = worldAlphas().find((a) => a.id === `alpha_${hist[1]}`);
    const stage = hist[2] as StageName;
    // a history record exists only for a stage the alpha has left and holds no deployment of
    if (alpha === undefined || alpha.deployments.some((d) => stageOfSpec(d) === stage) || rankOf(stage) >= rankOf(stageHistoryOf(alpha.id).reached)) return null;
    deployment = historySpec(alpha, stage, deploymentId);
    history = true;
  }
  if (alpha === undefined || deployment === undefined) return null;
  const stage = stageOfSpec(deployment);
  const record = stageRecord(alpha.id, stage);
  const completed = rankOf(stage) < rankOf(stageHistoryOf(alpha.id).reached);
  const decidedBy = completed && stage !== "live" ? actorOf(alpha.id, GATE_ACTOR_OFFSET[stage]) : null;
  return { alpha, deployment, standing: { deploymentId, alphaId: alpha.id, stage, status: completed ? "completed" : "current", current: !completed, fromMs: record.fromMs, exitMs: completed ? record.toMs : null, days: record.days, decidedBy, history } };
}
export const standingOf = (deploymentId: string): DeploymentStanding | null => resolveStageDeployment(deploymentId)?.standing ?? null;
/** True for a deployment of the world whose stage its alpha has left: retired, no longer running. */
export const isRetired = (deploymentId: string): boolean => standingOf(deploymentId)?.status === "completed";

/** The Sandbox record an alpha's Canary / Live room links as its "sandbox exit": the alpha's own sandbox deployment, else the history record of that stage. null when the alpha never left Sandbox (it has not reached it). */
export function sandboxRecordIdOf(deploymentId: string): string | null {
  const found = resolveStageDeployment(deploymentId);
  if (found === null) return null;
  if (rankOf(found.standing.stage) <= rankOf("sandbox")) return found.standing.stage === "sandbox" ? deploymentId : null;
  const own = found.alpha.deployments.find((d) => stageOfSpec(d) === "sandbox");
  return own?.id ?? historyDeploymentId(found.alpha.id, "sandbox");
}

/** The window in which the deployment has activity: from its stage start to its exit (completed) or to the world's now (current). Nothing a stage page prints is outside it. */
export function stageWindowOf(deploymentId: string): { fromMs: number; toMs: number } | null {
  const standing = standingOf(deploymentId);
  return standing === null ? null : { fromMs: standing.fromMs, toMs: standing.exitMs ?? WORLD_NOW_MS };
}

/* ── the book of a stage: orders and fills inside the window, one list for the tabs, the counts and the gate ──────────────── */

type Row = Record<string, unknown>;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const shifted = (row: Row, deltaMs: number): Row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === "string" && ISO.test(value) ? new Date(Date.parse(value) + deltaMs).toISOString() : value]));
const TERMINAL = new Set(["FILLED", "REJECTED", "CANCELED", "CANCELLED", "EXPIRED"]);
export interface StageBook { orders: Row[]; fills: Row[] }

/**
 * The orders and fills of a deployment as its stage page lists them. A CURRENT deployment lists the blotter's own rows. A COMPLETED one lists the same rows moved to END at
 * its exit (nothing after the session closed), working orders cancelled at the exit, and, when a gate counts at least `minFills` trades, the earlier trades of the stage
 * (one filled order each, spread over the stage) so the count the gate prints IS the number of fills listed.
 */
/** The Paper observation gate's published minimum trade count (policy paper.v1); a test pins it to the page's `policy_minimum_trade_count`. */
export const PAPER_POLICY_MIN_TRADES = 60;
export function stageBookOf(deploymentId: string, minFillsAsked?: number): StageBook {
  const base = blotterBookOf(deploymentId);
  const standing = standingOf(deploymentId);
  if (standing === null || standing.exitMs === null) return base;
  const minFills = minFillsAsked ?? (standing.stage === "paper" ? PAPER_POLICY_MIN_TRADES : 0);
  const delta = standing.exitMs - WORLD_NOW_MS;
  const orders = base.orders.map((order) => {
    const moved = shifted(order, delta);
    return TERMINAL.has(String(moved.status).toUpperCase()) ? moved : { ...moved, status: "CANCELED" };
  });
  const fills = base.fills.map((fill) => shifted(fill, delta));
  const template = orders.find((order) => String(order.status).toUpperCase() === "FILLED");
  const templateFills = template === undefined ? [] : fills.filter((fill) => fill.client_order_id === template.client_order_id);
  if (template !== undefined && templateFills.length > 0 && fills.length < minFills) {
    const earliest = Math.min(...orders.map((order) => Date.parse(String(order.submitted_at))), standing.exitMs);
    const missing = Math.ceil((minFills - fills.length) / templateFills.length);
    const submitted = Date.parse(String(template.submitted_at));
    const gap = Math.max(60_000, Math.floor((earliest - standing.fromMs - DAY_MS / 2) / missing));
    for (let n = 1; n <= missing; n += 1) {
      const at = earliest - n * gap;
      const id = String(900_000 + n + (seedOf(deploymentId) % 1000) * 100).padStart(6, "0");
      const clientId = `cl-${id}`;
      orders.push({ ...template, order_id: `ord_${id}`, client_order_id: clientId, venue_order_id: null, submitted_at: new Date(at).toISOString() });
      for (const [i, fill] of templateFills.entries()) fills.push({ ...fill, fill_id: `fil_${id}_${i + 1}`, client_order_id: clientId, order_id: `ord_${id}`, trade_time: new Date(at + (Date.parse(String(fill.trade_time)) - submitted)).toISOString() });
    }
  }
  const byTime = (field: string) => (a: Row, b: Row): number => String(b[field]).localeCompare(String(a[field]));
  return { orders: orders.sort(byTime("submitted_at")), fills: fills.sort(byTime("trade_time")) };
}
