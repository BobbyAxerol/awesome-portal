/**
 * THE GOVERNANCE FACTS OF THE WORLD (WP-B2-A, FIXTURE_LAB). New facts only; everything else is read from `bffWorld`.
 *
 * The world already holds, per alpha, ONE stage history (`lifecycleOf`): R1 and R2 were decided before Paper began, the Paper exit before Sandbox, the
 * Sandbox exit before the Canary, the Live gate before Live. This module turns that history into the approvals of the world, so a request is
 * APPROVED exactly when the alpha has left the stage it gates, and PENDING exactly when the alpha stands in front of that gate:
 *
 *   alpha -> gates (R1, R2, PAPER_EXIT, SANDBOX_EXIT, LIVE_GATE) -> one approval each, with an id, a requester, the decider (the alpha's own
 *            lifecycle actor, the person the alpha page prints beside the gate), the decision instant (the lifecycle's), a quorum and a capital step
 *   people -> ONE last-seen per person (a fixed distance before the world clock)
 *   fleet  -> ONE count of alphas / deployments / portfolios per stage (the Fleet header, the Overview cells and the Compare counts read this)
 *   overview -> the Needs attention / Today / Fleet by stage panels of the Command Centre, computed from the operations, incidents, approvals and fleet above
 *
 * Nothing here is a source fact or a permission. Money is exact decimal text, sums are BigInt cents, no float. Times are absolute instants against
 * WORLD_NOW; the operations and incidents of `bffWorld` live on the operations clock (OPS_READ_MS) and are carried into the Command Centre frame by
 * their distance from that read time, so a card and the page it opens print the same age after the preview rebases each body to its own read time.
 */
import { createHash } from "node:crypto";

import { matchesView } from "../src/execution/api/fixtureData";
import { approvalInboxEnvelope } from "./bffDoubleApprovalEnvelopes";
import { scaled, type DeploymentSpec } from "./bffScale";
import {
  DAY_MS, fromCents, incidentState, NATIVE_ALPHAS, OPS_READ_MS, PEOPLE, bindingOfAccount, personByUsername, toCents, 
  WORLD_INCIDENTS, WORLD_NOW_MS, WORLD_OPERATIONS, worldAlphas, type StageName, type WorldIncident, type WorldOperation,
} from "./bffWorld";
import { criteriaMetOf, gateMinimumDays, stageBookOf, stageHistoryOf, stageStateOf } from "./bffWorldStage"; // WP-B2-S3: gateMinimumDays
import { environmentFor, openIncidentsOfPortfolio } from "./bffWorldBooks"; // WP-B2-A3: the Overview labels an incident / operation with the environment its page prints
// ===== WP-B2-A3 begin: the generated universe's requests are derived from its alphas' stage (bffWorldGenerated), not drawn at random
import { generatedPlans, type GeneratedPlan } from "./bffWorldGenerated";
// ===== WP-B2-A3 end

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const isoOf = (ms: number): string => new Date(ms).toISOString();
const isoSeconds = (ms: number): string => isoOf(ms).replace(/\.000Z$/, "Z");
export const WORLD_NOW_ISO = isoOf(WORLD_NOW_MS);
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const sha = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const seedOf = (...parts: unknown[]): number => parseInt(sha(parts).slice(0, 8), 16);

/* ── names: every linked entity has a display name from the world ───────── */

const PORTFOLIO_NAMES: Readonly<Record<string, string>> = { pf_TEST_ONLY_core: "Core", pf_TEST_ONLY_satellite: "Satellite", pf_TEST_ONLY_canary: "Canary" };
/** The name a person reads for an id of the world's operations and incidents (never the raw id). */
export function displayNameOf(kind: string, id: string): string {
  if (kind === "PORTFOLIO") return PORTFOLIO_NAMES[id] ?? id.replace(/^pf_(TEST_ONLY_)?/, "").replace(/_/g, " ");
  if (kind === "ACCOUNT") { const n = /binance0*(\d+)$/.exec(id); return n !== null ? `Binance account ${n[1]!.padStart(2, "0")}` : id.replace(/^acc_(TEST_ONLY_)?/, "").replace(/_/g, " "); }
  if (kind === "DEPLOYMENT") { const symbol = id.replace(/^dep_(TEST_ONLY_)?/, ""); return `${symbol.toUpperCase()} deployment`; }
  return id;
}
const KIND_WORD: Readonly<Record<string, string>> = { PORTFOLIO: "portfolio", ACCOUNT: "account", DEPLOYMENT: "deployment" };
const SEVERITY_WORD: Readonly<Record<string, string>> = { CRITICAL: "Critical", ERROR: "Error", WARNING: "Warning", INFO: "Info" };
const ENV_WORD: Readonly<Record<string, string>> = { LIVE: "Live", PAPER: "Paper", SANDBOX: "Sandbox", live: "Live", paper: "Paper", sandbox: "Sandbox" };
const STAGE_WORD: Readonly<Record<StageName, string>> = { paper: "Paper", sandbox: "Sandbox", canary: "Canary", live: "Live" };

/* ── people: ONE last-seen per person ───────────────────────────────────── */

/** How long before the world clock each person was last seen (minutes). The Users list, the person's page and a filtered list read this one value. */
const LAST_SEEN_MINUTES_AGO: Readonly<Record<string, number>> = { bobby: 20, lan: 164, minh: 2_459, stan: 4_894, hoa: 7_614, tuan: 11_844 };
export function lastSeenMs(userId: string): number | null {
  const person = PEOPLE.find((p) => p.id === userId);
  const minutes = person === undefined ? undefined : LAST_SEEN_MINUTES_AGO[person.username];
  return minutes === undefined ? null : WORLD_NOW_MS - minutes * MINUTE_MS;
}
export const lastSeenIso = (userId: string): string | null => { const ms = lastSeenMs(userId); return ms === null ? null : isoSeconds(ms); };

/* ── the fleet: ONE count source ────────────────────────────────────────── */

export interface FleetCounts {
  alphas: number;
  deployments: number;
  portfolios: number;
  /** deployments per stage (LIVE, CANARY, SANDBOX, PAPER) */
  deploymentsByStage: Record<string, number>;
  /** alphas that have a deployment in the stage (an alpha in two stages is in both) */
  alphasByStage: Record<string, number>;
  /** unresolved incidents that target an account (a broker-sync class issue) */
  brokerSyncIssues: number;
  /** evidence findings on unresolved incidents */
  openFindings: number;
}
export function fleetCounts(): FleetCounts {
  const alphas = worldAlphas();
  const deployments = alphas.flatMap((a) => a.deployments);
  const by = (stage: string): number => deployments.filter((d) => d.stage === stage).length;
  const stages = [...new Set(alphas.flatMap((a) => a.stages))];
  const open = WORLD_INCIDENTS.filter((incident) => incidentState(incident) !== "RESOLVED");
  return {
    alphas: alphas.length, deployments: deployments.length, portfolios: new Set(deployments.map((d) => d.portfolioId)).size,
    deploymentsByStage: { LIVE: by("LIVE"), CANARY: by("CANARY"), SANDBOX: by("SANDBOX"), PAPER: by("PAPER") },
    alphasByStage: Object.fromEntries(stages.map((stage) => [stage, alphas.filter((a) => a.stages.includes(stage)).length])),
    brokerSyncIssues: open.filter((incident) => incident.target[0] === "ACCOUNT").length,
    openFindings: open.reduce((n, incident) => n + incident.evidence.filter((e) => e.source === "FINDING").length, 0),
  };
}

/* ── approvals: derived from the stage history ──────────────────────────── */

export type WorldGate = "R1" | "R2" | "PAPER_EXIT" | "SANDBOX_EXIT" | "LIVE_GATE";
const GATES: readonly WorldGate[] = ["R1", "R2", "PAPER_EXIT", "SANDBOX_EXIT", "LIVE_GATE"];
const GATE_STAGE: Readonly<Record<WorldGate, StageName | null>> = { R1: null, R2: null, PAPER_EXIT: "sandbox", SANDBOX_EXIT: "canary", LIVE_GATE: "live" };
const STAGE_RANK: Readonly<Record<StageName, number>> = { paper: 0, sandbox: 1, canary: 2, live: 3 };
const STAGES = ["paper", "sandbox", "canary", "live"] as const;

/** The request ids of the world, one per alpha and gate (the ids the stage pages, the lineage and the Overview cards link). */
const IDS: Readonly<Record<string, Readonly<Record<WorldGate, string>>>> = {
  alpha_a: { R1: "AP-101", R2: "AP-352", PAPER_EXIT: "EX-701", SANDBOX_EXIT: "SX-701", LIVE_GATE: "AP-701" },
  alpha_b: { R1: "AP-118", R2: "AP-152", PAPER_EXIT: "EX-702", SANDBOX_EXIT: "SX-702", LIVE_GATE: "AP-311" },
  alpha_c: { R1: "AP-201", R2: "AP-202", PAPER_EXIT: "EX-703", SANDBOX_EXIT: "SX-703", LIVE_GATE: "AP-312" },
  alpha_d: { R1: "AP-203", R2: "AP-204", PAPER_EXIT: "EX-771", SANDBOX_EXIT: "SX-704", LIVE_GATE: "AP-704" },
  alpha_btc_trend: { R1: "AP-205", R2: "AP-206", PAPER_EXIT: "EX-705", SANDBOX_EXIT: "SX-705", LIVE_GATE: "AP-705" },
};
const RELEASE_CANDIDATE: Readonly<Record<string, string>> = { alpha_a: "RC-38", alpha_b: "RC-41", alpha_c: "RC-44", alpha_d: "RC-47", alpha_btc_trend: "RC-50" };
const BUDGET_MINUTES: Readonly<Record<WorldGate, number>> = { R1: 1440, R2: 1440, PAPER_EXIT: 2880, SANDBOX_EXIT: 2880, LIVE_GATE: 1440 };
const QUORUM: Readonly<Record<WorldGate, number>> = { R1: 2, R2: 2, PAPER_EXIT: 1, SANDBOX_EXIT: 1, LIVE_GATE: 2 };
/** Where a request that is waiting now was raised: this long before the world clock (minutes), by gate. */
const PENDING_AGE_MINUTES: Readonly<Record<WorldGate, number>> = { R1: 300, R2: 300, PAPER_EXIT: 1_560, SANDBOX_EXIT: 1_560, LIVE_GATE: 1_200 };

export interface WorldApproval {
  id: string;
  gate: WorldGate;
  alphaId: string;
  alphaLabel: string;
  releaseCandidate: string;
  /** the deployment the gate is about (null for R1 and R2, which are about the alpha) */
  deploymentId: string | null;
  portfolioId: string;
  portfolioName: string;
  /** the environment of the capital the request is about */
  environment: "paper" | "sandbox" | "live";
  status: "APPROVED" | "PENDING";
  requestedMs: number;
  decidedMs: number | null;
  /** username of the decider (the alpha's own lifecycle actor); null while pending */
  decidedBy: string | null;
  requestedBy: string;
  budgetMinutes: number;
  ageMinutes: number;
  dueMs: number;
  quorumRequired: number;
  quorumMet: number;
  subject: string;
  target: string;
  stageFrom: StageName | null;
  stageTo: StageName | null;
  // ===== WP-B2-A3 begin
  /** an R2 request of an alpha with no deployment states its own step (cents); a request of a booked alpha raises what the alpha holds */
  requestedCents?: bigint;
  /** a fact of the world that blocks the request (a halted deployment), else absent */
  blocker?: string;
  // ===== WP-B2-A3 end
}

/** The person who decided a gate of an alpha: the stage history's (B-S, `stageHistoryOf`), the same one the Alpha 360 gate rows and the stage rooms print. */
export const gateDecider = (alphaId: string, gate: WorldGate): string | null => {
  const h = stageHistoryOf(alphaId);
  return gate === "R1" ? h.r1.by : gate === "R2" ? h.r2.by : gate === "PAPER_EXIT" ? h.stages.paper.decidedBy : gate === "SANDBOX_EXIT" ? h.stages.sandbox.decidedBy : h.stages.canary.decidedBy;
};

const venueOf = (d: DeploymentSpec): string => d.venue;
const accountNameOf = (d: DeploymentSpec): string => (d.environment === "paper" ? "Paper simulator" : d.environment === "sandbox" ? "Binance testnet" : `${d.portfolioName} sleeve`);


// ===== WP-B2-A3 begin
/** How long a waiting request has been waiting: the gate's fixed age for the native alphas, a spread of 20% to 130% of the budget (by alpha) for the generated ones, so some are overdue. */
function pendingAgeMinutes(alphaId: string, gate: WorldGate): number {
  if (IDS[alphaId] !== undefined) return PENDING_AGE_MINUTES[gate];
  return Math.floor(BUDGET_MINUTES[gate] * (20 + (seedOf(alphaId, gate, "age") % 111)) / 100);
}

/** The requests of an alpha with no deployment: R1 pending, or R1 approved and R2 pending (its capital is a step in a Paper-only portfolio). */
function researchApprovals(plan: GeneratedPlan): WorldApproval[] {
  const alpha = worldAlphas().find((a) => a.id === plan.alphaId)!;
  const history = stageHistoryOf(alpha.id);
  const requesters = PEOPLE.filter((p) => p.username !== "bobby");
  const requester = (gate: WorldGate): string => requesters[seedOf(alpha.id, gate, "requester") % requesters.length]!.username;
  const rc = `RC-${40 + (seedOf(alpha.id, "rc") % 40)}`;
  const base = { alphaId: alpha.id, alphaLabel: alpha.label, releaseCandidate: rc, deploymentId: null, stageFrom: null, stageTo: null } as const;
  const out: WorldApproval[] = [];
  const r1Pending = plan.pending === "R1";
  const r1Requested = r1Pending ? WORLD_NOW_MS - pendingAgeMinutes(alpha.id, "R1") * MINUTE_MS : history.r1.atMs - 2 * DAY_MS;
  out.push({
    ...base, id: plan.ids.R1, gate: "R1", portfolioId: "", portfolioName: "", environment: "paper", status: r1Pending ? "PENDING" : "APPROVED",
    requestedMs: r1Requested, decidedMs: r1Pending ? null : history.r1.atMs, decidedBy: r1Pending ? null : history.r1.by, requestedBy: requester("R1"),
    budgetMinutes: BUDGET_MINUTES.R1, ageMinutes: r1Pending ? pendingAgeMinutes(alpha.id, "R1") : Math.round((history.r1.atMs - r1Requested) / MINUTE_MS), dueMs: r1Requested + BUDGET_MINUTES.R1 * MINUTE_MS,
    quorumRequired: QUORUM.R1, quorumMet: r1Pending ? seedOf(alpha.id, "q") % QUORUM.R1 : QUORUM.R1, subject: `${alpha.label} · ${rc}`, target: "research",
  });
  if (plan.r2 !== null) {
    const requested = WORLD_NOW_MS - pendingAgeMinutes(alpha.id, "R2") * MINUTE_MS;
    out.push({
      ...base, id: plan.ids.R2, gate: "R2", portfolioId: plan.r2.portfolioId, portfolioName: plan.r2.portfolioName, environment: "paper", status: "PENDING",
      requestedMs: requested, decidedMs: null, decidedBy: null, requestedBy: requester("R2"), budgetMinutes: BUDGET_MINUTES.R2, ageMinutes: pendingAgeMinutes(alpha.id, "R2"),
      dueMs: requested + BUDGET_MINUTES.R2 * MINUTE_MS, quorumRequired: QUORUM.R2, quorumMet: seedOf(alpha.id, "q2") % QUORUM.R2,
      subject: `${alpha.label} → ${plan.r2.portfolioName}`, target: "paper · Paper simulator", requestedCents: plan.r2.requestedCents,
    });
  }
  return out;
}
// ===== WP-B2-A3 end

function buildApprovals(): WorldApproval[] {
  const out: WorldApproval[] = [];
  // ===== WP-B2-A3 begin
  const plans = new Map<string, GeneratedPlan>(generatedPlans().map((plan) => [plan.alphaId, plan]));
  const alphas = [...NATIVE_ALPHAS, ...worldAlphas().filter((a) => plans.has(a.id) && !plans.get(a.id)!.research)];
  for (const plan of plans.values()) if (plan.research) out.push(...researchApprovals(plan));
  // ===== WP-B2-A3 end
  for (const alpha of alphas) {
    const ids = IDS[alpha.id] ?? plans.get(alpha.id)?.ids;
    if (ids === undefined) continue;
    const history = stageHistoryOf(alpha.id);
    const rank = STAGE_RANK[history.reached];
    const stageOf = (name: StageName): DeploymentSpec | undefined => alpha.deployments.find((d) => d.stage.toLowerCase() === name);
    const furthest = alpha.deployments.filter((d) => d.stage.toLowerCase() === history.reached);
    const requesters = PEOPLE.filter((p) => p.username !== "bobby");
    const requester = (gate: WorldGate): string => requesters[seedOf(alpha.id, gate, "requester") % requesters.length]!.username;
    const decisionMs: Readonly<Record<WorldGate, number>> = {
      R1: history.r1.atMs, R2: history.r2.atMs, PAPER_EXIT: (history.stages.paper.toMs ?? 0) - DAY_MS / 2, SANDBOX_EXIT: (history.stages.sandbox.toMs ?? 0) - DAY_MS / 2, LIVE_GATE: (history.stages.canary.toMs ?? 0) - DAY_MS / 2,
    };
    for (const gate of GATES) {
      const to = GATE_STAGE[gate];
      // R1 and R2 gate Paper (everything reached passed them); an exit gate is passed when the alpha stands beyond the stage it leaves.
      const passed = to === null ? true : rank >= STAGE_RANK[to];
      // A gate is waiting when the alpha stands directly in front of it: in the stage the gate leaves (Live gate: in the Canary).
      const waiting = to !== null && !passed && rank === STAGE_RANK[to] - 1;
      if (!passed && !waiting) continue;
      if (plans.has(alpha.id) && waiting && plans.get(alpha.id)!.pending !== gate) continue; // WP-B2-A3: only the plan's gate waits
      const from: StageName | null = to === null ? null : STAGES[STAGE_RANK[to] - 1]!;
      // An exit gate is a review of a deployment in the stage it leaves: an alpha with no deployment in that stage has no such review.
      if (from !== null && stageOf(from) === undefined) continue;
      // The deployment the gate is about: the one in the stage it leaves, else the furthest.
      const about = gate === "R1" || gate === "R2" ? (furthest[0] ?? alpha.deployments[0]!) : stageOf(from!)!;
      // R2 reserves the capital the alpha holds in its furthest environment of the portfolio of its furthest deployment.
      const capital = gate === "R2" ? (furthest[0] ?? about) : about;
      const decidedMs = passed ? decisionMs[gate] : null;
      const requestedMs = decidedMs !== null ? decidedMs - (gate === "R1" ? 2 * DAY_MS : 18 * HOUR_MS) : WORLD_NOW_MS - pendingAgeMinutes(alpha.id, gate) * MINUTE_MS;
      const budget = BUDGET_MINUTES[gate];
      const age = decidedMs !== null ? Math.round((decidedMs - requestedMs) / MINUTE_MS) : pendingAgeMinutes(alpha.id, gate);
      const rc = RELEASE_CANDIDATE[alpha.id] ?? "RC-40";
      const subject = gate === "R1" ? `${alpha.label} · ${rc}` : gate === "R2" ? `${alpha.label} → ${capital.portfolioName}` : gate === "LIVE_GATE" ? `${alpha.label} → ${venueOf(about)}` : `${alpha.label} · ${about.id}`;
      const target = gate === "R1" ? "research" : gate === "R2" ? `${capital.environment} · ${accountNameOf(capital)}` : gate === "LIVE_GATE" ? "live · dual approval" : `→ ${to!} · ${venueOf(about)}`;
      const haltedAbout = waiting && stageStateOf(about) === "HALTED" ? `Deployment ${about.id} is halted` : undefined; // WP-B2-A3: a fact of the world blocks the request
      out.push({
        ...(haltedAbout !== undefined ? { blocker: haltedAbout } : {}),
        id: ids[gate], gate, alphaId: alpha.id, alphaLabel: alpha.label, releaseCandidate: rc, deploymentId: gate === "R1" || gate === "R2" ? null : about.id,
        portfolioId: capital.portfolioId, portfolioName: capital.portfolioName, environment: capital.environment,
        status: passed ? "APPROVED" : "PENDING", requestedMs, decidedMs, decidedBy: passed ? gateDecider(alpha.id, gate) : null, requestedBy: requester(gate),
        budgetMinutes: budget, ageMinutes: age, dueMs: requestedMs + budget * MINUTE_MS,
        quorumRequired: QUORUM[gate], quorumMet: passed ? QUORUM[gate] : gate === "LIVE_GATE" ? 1 : 0, subject, target, stageFrom: from, stageTo: to,
      });
    }
  }
  return out;
}

let cache: WorldApproval[] | null = null;
/** Every approval of the world, newest request first. */
export function worldApprovals(): readonly WorldApproval[] {
  cache ??= buildApprovals().sort((a, b) => b.requestedMs - a.requestedMs || (a.id < b.id ? -1 : 1));
  return cache;
}
// WP-B2-A3 (N10-B1): the Closed lens opens a decided request by its DECISION id (`dec_AP-311`, the history row id); it is the same request, so every page read answers its decided record
export const worldApproval = (id: string): WorldApproval | undefined => worldApprovals().find((a) => a.id === id || `dec_${a.id}` === id);
/**
 * F3b: the request as an inbox that still lists it as waiting shows it. The legacy inbox of the Playwright lane (`APPROVAL_ROWS`) keeps AP-352 and AP-201
 * waiting, while the world has decided them; its reviews, capital and evidence must then tell the waiting story from the row's own facts (quorum and age),
 * with the world's portfolio and capital rules: the books already hold what the world booked, so a waiting request raises it by the requested step.
 * The populated lane serves the world's inbox, where a decided request is not listed, and keeps the decided record (`worldApproval`).
 */
export function inboxViewOf(id: string, row: Obj | null): WorldApproval | undefined {
  const a = worldApproval(id);
  if (a === undefined || row === null) return a;
  const sla = (row.sla ?? {}) as Obj;
  const int = (value: unknown): number | undefined => (typeof value === "number" && Number.isInteger(value) ? value : undefined);
  // the subject the row prints names the alpha ("RSI v1.7 · RC-41", "Carry v3.2 → PF-MAIN"): the sentences of this request say that name, not the world alpha's
  const named = typeof row.subject === "string" ? row.subject.split(/ [·→] /)[0]?.trim() : undefined;
  return {
    ...a, alphaLabel: named !== undefined && named !== "" ? named : a.alphaLabel, status: "PENDING", decidedMs: null, decidedBy: null,
    quorumMet: int(row.quorum_met) ?? 0, quorumRequired: int(row.quorum_required) ?? a.quorumRequired,
    ageMinutes: int(sla.age_minutes) ?? a.ageMinutes, budgetMinutes: int(sla.budget_minutes) ?? a.budgetMinutes,
  };
}
export const pendingApprovals = (): WorldApproval[] => worldApprovals().filter((a) => a.status === "PENDING").sort((a, b) => a.dueMs - b.dueMs);
export const approvalOfAlpha = (alphaId: string, gate: WorldGate): WorldApproval | undefined => worldApprovals().find((a) => a.alphaId === alphaId && a.gate === gate);
/** The exit review (or gate request) of the stage a deployment is in or has left, for the "Open exit review" link on a stage page. */
export const approvalOfDeployment = (deploymentId: string): WorldApproval | undefined => worldApprovals().find((a) => a.deploymentId === deploymentId);
/** The in-app route of the review of one request. */
export function approvalHref(a: Pick<WorldApproval, "id" | "gate">): string {
  if (a.gate === "R1") return `/governance/approvals/${a.id}/r1`;
  if (a.gate === "R2") return `/governance/approvals/${a.id}/r2`;
  if (a.gate === "LIVE_GATE") return `/governance/approvals/${a.id}/live`;
  return `/governance/exit-reviews/${a.id}`;
}
export const GATE_WORD: Readonly<Record<WorldGate, string>> = { R1: "R1 review", R2: "R2 review", PAPER_EXIT: "Paper exit review", SANDBOX_EXIT: "Sandbox exit review", LIVE_GATE: "Live gate" };

/* ── capital of an R2 request: the portfolio statement of its environment ── */

/** The allocation the world books in one portfolio and environment (what the portfolio's capital statement prints as Allocated), in cents. */
export const partitionAllocationCents = (portfolioId: string, environment: string): bigint =>
  worldAlphas().flatMap((a) => a.deployments).filter((d) => d.portfolioId === portfolioId && d.environment === environment).reduce((n, d) => n + toCents(d.allocation), 0n); // WP-B2-A3: the generated portfolios are booked the same way

let budgetProvider: ((portfolioId: string, environment: string) => string | null) | null = null;
/** The fixture BFF registers how the capital statement states a partition's approved budget (a registry, so the doubles never import the BFF). */
export const setPortfolioBudgetProvider = (provider: ((portfolioId: string, environment: string) => string | null) | null): void => { budgetProvider = provider; };
// ===== WP-B2-A3 begin (N3-03): a generated portfolio's weight is allocation over the NAV its Portfolio page prints
let navProvider: ((portfolioId: string, environment: string, currency: string) => string | null) | null = null;
export const setPortfolioNavProvider = (provider: ((portfolioId: string, environment: string, currency: string) => string | null) | null): void => { navProvider = provider; };
// ===== WP-B2-A3 end
export const portfolioBudget = (portfolioId: string, environment: string): string | null => budgetProvider?.(portfolioId, environment) ?? null;

const percent = (part: bigint, whole: bigint): string => {
  if (whole <= 0n) return "0.0";
  const tenths = part * 1000n / whole;
  return `${tenths / 10n}.${tenths % 10n}`;
};

export interface WorldCapital {
  portfolioId: string;
  portfolioName: string;
  environment: string;
  currency: string;
  /** what the request raises (the alpha's own booked allocation in that portfolio and environment) */
  requested: string;
  /** allocated before / after the request: an approved request is already in the books (after = the statement now), a pending one is not (before = the statement now) */
  before: string;
  after: string;
  weightBefore: string;
  weightAfter: string;
  budget: string | null;
}
/** The weights of a request: a native portfolio's are its share of the native allocation (as before); a generated portfolio's are allocation / the NAV its page prints (1 place, BigInt). */
function navWeights(a: WorldApproval, before: bigint, after: bigint, totalBefore: bigint, totalAfter: bigint, currency: string): { weightBefore: string; weightAfter: string } {
  const nav = PORTFOLIO_NAMES[a.portfolioId] === undefined ? navProvider?.(a.portfolioId, a.environment, currency) ?? null : null;
  if (nav === null || toCents(nav) <= 0n) return { weightBefore: percent(before, totalBefore), weightAfter: percent(after, totalAfter) };
  const whole = toCents(nav);
  const rounded = (part: bigint): string => { const tenths = (part * 2000n + whole) / (2n * whole); return `${tenths / 10n}.${tenths % 10n}`; }; // half-up, 1 place
  return { weightBefore: rounded(before), weightAfter: rounded(after) };
}
export function capitalOf(a: WorldApproval): WorldCapital {
  const alpha = worldAlphas().find((x) => x.id === a.alphaId)!; // WP-B2-A3
  const mine = alpha.deployments.filter((d) => d.portfolioId === a.portfolioId && d.environment === a.environment);
  const requested = a.requestedCents ?? mine.reduce((n, d) => n + toCents(d.allocation), 0n);
  const now = partitionAllocationCents(a.portfolioId, a.environment);
  const before = a.status === "APPROVED" ? now - requested : now;
  const after = a.status === "APPROVED" ? now : now + requested;
  const everyone = [...new Set([...Object.keys(PORTFOLIO_NAMES), ...scaled().portfolios.map((p) => p.id)])].reduce((n, id) => n + partitionAllocationCents(id, a.environment), 0n); // WP-B2-A3
  const totalNow = everyone;
  const totalBefore = a.status === "APPROVED" ? totalNow - requested : totalNow;
  const totalAfter = a.status === "APPROVED" ? totalNow : totalNow + requested;
  return {
    portfolioId: a.portfolioId, portfolioName: a.portfolioName, environment: a.environment, currency: mine[0]?.currency ?? scaled().portfolios.find((p) => p.id === a.portfolioId)?.base ?? "USDT",
    requested: fromCents(requested), before: fromCents(before), after: fromCents(after),
    ...navWeights(a, before, after, totalBefore, totalAfter, mine[0]?.currency ?? scaled().portfolios.find((p) => p.id === a.portfolioId)?.base ?? "USDT"), budget: portfolioBudget(a.portfolioId, a.environment),
  };
}

/* ── the inbox, the history ─────────────────────────────────────────────── */

/** A deployment of the generated universe for a generated request (stable by the request id): the fixture's own `dep_NN` ids belong to no alpha of the fleet. */
function generatedDeployment(id: string): { alpha: string; deployment: DeploymentSpec } | null {
  const pool = scaled().alphas.flatMap((a) => a.deployments.filter((d) => d.stage === "PAPER").map((d) => ({ alpha: a.label, deployment: d })));
  return pool.length === 0 ? null : pool[seedOf(id, "gen-dep") % pool.length]!;
}

/** A world request as the loose inbox row the double's inbox page and its envelope take. */
export function looseInboxRow(a: WorldApproval): Obj {
  return {
    approval_id: a.id, gate: a.gate, subject: a.subject, target: a.target, blocker_count: a.blocker === undefined ? 0 : 1, blocker_summary: a.blocker ?? "none",
    sla: { age_minutes: a.ageMinutes, budget_minutes: a.budgetMinutes, due_at: isoOf(a.dueMs) },
    quorum_met: a.quorumMet, quorum_required: a.quorumRequired, inert: a.blocker === undefined ? null : "BLOCKED", needs_you: a.blocker === undefined,
  };
}
const person = (username: string): { user_id: string; username: string } => ({ user_id: personByUsername(username)?.id ?? `usr_${username}`, username });

/**
 * `GET /governance/approvals` for the world: the pending requests of the world's alphas, then the generated universe's rows. Counts are COUNTED from those
 * rows; every deadline is restated against the world clock so the envelope (read at the world clock) and its rows share one frame.
 */
export function worldInboxAnswer(search: URLSearchParams): { status: number; body: unknown } {
  const rows: Obj[] = pendingApprovals().map(looseInboxRow); // WP-B2-A3: the generated universe's requests are world approvals now (bffWorldGenerated), one per subject's next gate
  const view = search.get("filter") ?? search.get("view") ?? "ALL";
  const inView = rows.filter((r) => matchesView(r, view));
  const limit = Number(search.get("limit") ?? 50);
  const after = search.get("after");
  const start = after ? inView.findIndex((r) => String(r.approval_id) === after) + 1 : 0;
  const slice = inView.slice(start, start + limit);
  const age = (r: Obj): number => Number(r.sla?.age_minutes);
  const budget = (r: Obj): number => Number(r.sla?.budget_minutes);
  const overdue = rows.filter((r) => age(r) > budget(r)).length;
  const dueSoon = rows.filter((r) => age(r) <= budget(r) && age(r) >= budget(r) * 0.75).length;
  const envelope = approvalInboxEnvelope({
    rows: slice, total_count: rows.length, filtered_count: inView.length,
    next_cursor: start + limit < inView.length && slice.length > 0 ? String(slice[slice.length - 1]!.approval_id) : null,
    prev_cursor: start > 0 && slice.length > 0 ? String(slice[0]!.approval_id) : null,
    has_more: start + limit < inView.length, has_previous: start > 0,
  }, { pending: rows.length, overdue, due_soon: dueSoon }, search.get("workspace_id") ?? "ws_fixture_governance");
  envelope.read_at = WORLD_NOW_ISO;
  for (const item of envelope.page.rows as Obj[]) {
    const mine = worldApproval(String(item.id));
    const ageMs = Number(item.sla.age_minutes) * MINUTE_MS;
    item.sla.due_at = isoOf(WORLD_NOW_MS + (Number(item.sla.budget_minutes) * MINUTE_MS - ageMs));
    item.sla.expires_at = isoOf(Date.parse(item.sla.due_at) + DAY_MS);
    item.updated_at = isoOf(WORLD_NOW_MS - ageMs);
    if (mine !== undefined) {
      item.requester = person(mine.requestedBy);
      item.creator = person(mine.requestedBy);
      item.portfolio_id = mine.gate === "R2" ? mine.portfolioId : null;
      item.environment = mine.gate === "R1" ? "RESEARCH" : mine.gate === "R2" ? mine.environment.toUpperCase() : mine.gate === "PAPER_EXIT" ? "PAPER" : mine.gate === "SANDBOX_EXIT" ? "SANDBOX" : "LIVE";
      item.release_candidate = mine.gate === "R1" || mine.gate === "R2" ? mine.releaseCandidate : null;
      item.subject_id = mine.deploymentId ?? mine.alphaId; // WP-B2-A3 (N3-08): the request names the entity it decides (the deployment of a stage gate, the alpha of R1/R2), so a screen can link it
    }
  }
  return { status: 200, body: envelope };
}

/** The decided requests of the world as history rows, newest first (an approved request is in the history under its own id, so any link to it resolves). */
export function worldHistoryRows(): Obj[] {
  return worldApprovals().filter((a) => a.status === "APPROVED" && a.decidedMs !== null && a.decidedBy !== null)
    .sort((a, b) => b.decidedMs! - a.decidedMs! || (a.id < b.id ? -1 : 1))
    .map((a) => ({
      id: `dec_${a.id}`, approval_id: a.id, gate: a.gate, subject_id: `subject_${a.id.toLowerCase()}`, subject: a.subject, outcome: "APPROVED",
      decided_by: person(a.decidedBy!), decided_at: isoOf(a.decidedMs!), policy_version: "approval.v3",
      evidence_digest: `sha256:${sha([a.id, "evidence"])}`, approval_version: 2,
    }));
}
export function worldHistoryAnswer(body: unknown): unknown {
  const out = clone(body) as Obj;
  const rows = worldHistoryRows();
  out.read_at = WORLD_NOW_ISO;
  out.page = { ...(out.page ?? {}), rows, total_count: rows.length, filtered_count: rows.length, next_cursor: null, prev_cursor: null, has_more: false, has_previous: false };
  return out;
}

/* ── the review pages ───────────────────────────────────────────────────── */

const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
/** Shift every instant of a body by `deltaMs` (distances kept), the way the preview does for a whole body. */
function shiftInstants(value: unknown, deltaMs: number, key = ""): unknown {
  if (typeof value === "string") {
    if (!INSTANT.test(value)) return value;
    const shifted = isoOf(Date.parse(value) + deltaMs);
    return /\.\d+Z$/.test(value) ? shifted : shifted.replace(/\.000Z$/, "Z");
  }
  if (typeof value === "number") return key.endsWith("_ms") && Number.isInteger(value) && value > 1.5e12 && value < 4e12 ? value + deltaMs : value;
  if (Array.isArray(value)) return value.map((item) => shiftInstants(item, deltaMs, key));
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shiftInstants(v, deltaMs, k)]));
  return value;
}
/** Carry a body that states its own read time into the world frame (read at the world clock), every distance kept. */
function intoWorldFrame(body: Obj): Obj {
  const read = typeof body.read_at === "string" ? Date.parse(body.read_at) : NaN;
  if (!Number.isFinite(read)) return body;
  const out = shiftInstants(body, WORLD_NOW_MS - read) as Obj;
  out.read_at = WORLD_NOW_ISO;
  return out;
}
/** A day text (`YYYY-MM-DD`) for an instant as the review pages print it: in the frame of a body with no read time (the operations clock). */
const dayInOpsFrame = (worldMs: number): string => isoOf(worldMs - WORLD_NOW_MS + OPS_READ_MS).slice(0, 10);

function decisionFields(a: WorldApproval, approval: Obj): void {
  approval.approval_id = a.id;
  approval.status = a.status;
  approval.quorum_met = a.quorumMet;
  approval.quorum_required = a.quorumRequired;
  approval.requester = person(a.requestedBy);
  approval.creator = person(a.requestedBy);
  approval.created_at = isoOf(a.requestedMs);
  approval.updated_at = isoOf(a.decidedMs ?? a.requestedMs);
  approval.sla_due_at = isoOf(a.dueMs);
  approval.expires_at = isoOf(a.dueMs + DAY_MS);
}
/**
 * A decided request offers no decision: every `can_*` is false. It carries NO lock. The published lock words are the reviewer's (self approval, blocking
 * findings, expiry, R1 lineage, capital breach); the server has no `REQUEST_ALREADY_DECIDED` lock (its word for a repeat decision is the plan blocker
 * `ACTOR_ALREADY_DECIDED`), so a lock the readers cannot name printed "Partial read: lock ... treated as NOT_ELIGIBLE" on a closed request (F3b).
 */
function closeEligibility(a: WorldApproval, eligibility: Obj | undefined): void {
  if (a.status === "PENDING" || eligibility === undefined) return;
  for (const key of Object.keys(eligibility)) if (key.startsWith("can_")) eligibility[key] = false;
  eligibility.locks = [];
}

/** `GET /governance/approvals/{id}/r1`. */
export function overlayWorldR1(body: unknown, id: string): unknown {
  const a = worldApproval(id);
  if (a === undefined || a.gate !== "R1") return body;
  const out = intoWorldFrame(clone(body) as Obj);
  const data = out.data as Obj | undefined;
  if (data?.approval === undefined) return out;
  decisionFields(a, data.approval);
  Object.assign(data.approval, { subject_label: a.alphaLabel, release_candidate: a.releaseCandidate, target_label: "R1 evidence review", environment: "RESEARCH", gate: "R1" });
  if (data.decision_context !== undefined) data.decision_context.approval_id = a.id;
  if (data.capture_context !== undefined) data.capture_context.parent_approval_id = a.id;
  if (data.evidence_manifest?.entries !== undefined) for (const entry of data.evidence_manifest.entries as Obj[]) entry.captured_at = isoSeconds(a.requestedMs - HOUR_MS);
  // ===== WP-B2-A3 begin: the evidence pack names this alpha's own version, run and digests (R3-09), not one pack for every R1
  const version = `av_${2000 + (seedOf(a.alphaId, "av") % 900)}`;
  const run = `run_${5000 + (seedOf(a.alphaId, "run") % 900)}`;
  data.approval.subject_id = version;
  if (data.evidence_manifest?.entries !== undefined) {
    for (const entry of data.evidence_manifest.entries as Obj[]) {
      entry.sha256 = `sha256:${sha([a.alphaId, entry.label])}`;
      if (entry.label === "alpha version") { entry.display_value = version; entry.note = null; }
      if (entry.label === "artifact digest") entry.display_value = `sha256:${sha([a.alphaId, "artifact"]).slice(0, 6)}…${sha([a.alphaId, "artifact"]).slice(-2)}`;
      if (entry.label === "entrypoint") entry.display_value = `${a.alphaLabel.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_pkg.strategy:Alpha`;
      if (entry.label === "final audit run") entry.display_value = run;
    }
  }
  // ===== WP-B2-A3 end
  // ===== F3b begin: the checklist counts the gate's 7 criteria (what the evidence read and the receipt say): a decided request met all 7 and says who decided it
  if (a.status === "APPROVED" && Array.isArray(data.checklist)) {
    data.checklist = (data.checklist as Obj[]).map((item) => item.outcome === "pass" ? item : { label: "capacity evidence covers the traded symbols (volume data)", outcome: "pass" });
    data.decisions = [{ outcome: "APPROVED", by: personByUsername(a.decidedBy ?? "")?.name ?? a.decidedBy, at: isoOf(a.decidedMs!) }];
  }
  // ===== F3b end
  closeEligibility(a, data.eligibility);
  return out;
}

/** `GET /governance/approvals/{id}/r2`: the capital rows, the candidate deployment and the R1 lineage are the world's. */
export function overlayWorldR2(body: unknown, id: string, view?: WorldApproval): unknown {
  const a = view ?? worldApproval(id); // F3b: `view` is the request as the lane's own inbox lists it (inboxViewOf)
  if (a === undefined || a.gate !== "R2") return body;
  const out = clone(body) as Obj;
  const capital = capitalOf(a);
  const r1 = approvalOfAlpha(a.alphaId, "R1");
  const alpha = worldAlphas().find((x) => x.id === a.alphaId)!; // WP-B2-A3
  if (out.approval !== undefined) {
    Object.assign(out.approval, {
      approval_id: a.id, portfolio_id: capital.portfolioId, currency: capital.currency, requested_amount: capital.requested,
      subject_label: `${a.alphaLabel} → ${a.portfolioName} · ${ENV_WORD[a.environment]}`, release_candidate: a.releaseCandidate,
      plan_author: personByUsername(a.requestedBy)?.name ?? a.requestedBy, quorum_met: a.quorumMet, quorum_required: a.quorumRequired,
      sla: { age_minutes: a.ageMinutes, budget_minutes: a.budgetMinutes },
    });
  }
  if (out.decision_context !== undefined) out.decision_context.approval_id = a.id;
  if (out.capture_context !== undefined) {
    out.capture_context.parent_approval_id = a.id;
    const papers = alpha.deployments.filter((d) => d.environment === "paper");
    out.capture_context.candidates = papers.map((d) => ({ deployment_id: d.id, portfolio_id: d.portfolioId, risk_grant_id: `risk_${d.id}`, currency: d.currency }));
  }
  if (out.r1_reference !== undefined && r1 !== undefined) {
    const href = String(out.r1_reference.href ?? "");
    Object.assign(out.r1_reference, {
      approval_id: r1.id, state: "APPROVED", href: `${approvalHref(r1)}${href.includes("?") ? href.slice(href.indexOf("?")) : ""}`,
      decided_by: personByUsername(r1.decidedBy ?? "")?.name ?? r1.decidedBy, decided_at: dayInOpsFrame(r1.decidedMs!), expiry: dayInOpsFrame(r1.decidedMs! + 180 * DAY_MS),
    });
  }
  if (Array.isArray(out.readiness)) {
    for (const group of out.readiness as Obj[]) for (const entry of (group.entries ?? []) as Obj[]) {
      const deployment = alpha.deployments.find((d) => d.environment === "paper") ?? alpha.deployments[0];
      // ===== WP-B2-A3 (N3-07): "(new)" only for an account the world does not hold; an existing one is named as it is and its capital check is stated (it may already be over-allocated)
      if (entry.label === "account (new)") {
        const accountId = deployment?.accountId ?? "acc_pap_sim";
        entry.value = accountId;
        const binding = bindingOfAccount(accountId);
        if (binding !== null) {
          entry.label = "account";
          if (a.status !== "PENDING" || view !== undefined) continue; // N8a-07: a decided request's capital check is its decided record, not a live check of the binding (F3b: the inbox view is only a first pass; the world's own pass decides)
          const over = binding.used > binding.equity;
          (group.entries as Obj[]).push({ label: "capital check", value: `${over ? "EXCEEDED" : "WITHIN"} · ${groupedMoney(fromCents(binding.used))} allocated on the binding, equity ${groupedMoney(fromCents(binding.equity))}`, revision: entry.revision });
        }
      }
      // ===== WP-B2-A3 end
    }
  }
  out.capital = [
    { label: "allocated capital", currency: capital.currency, before: groupedMoney(capital.before), after: groupedMoney(capital.after) },
    { label: "portfolio weight", currency: "%", before: capital.weightBefore, after: capital.weightAfter },
  ];
  closeEligibility(a, out.eligibility);
  return out;
}

/** `GET /governance/approvals/{id}/live` (the Live gate request). */
export function overlayWorldLive(body: unknown, id: string): unknown {
  const a = worldApproval(id);
  if (a === undefined || a.gate !== "LIVE_GATE") return body;
  const out = intoWorldFrame(clone(body) as Obj);
  out.approval_id = a.id;
  if (out.canary_ref !== undefined && a.deploymentId !== null) out.canary_ref.deployment_id = a.deploymentId;
  // ===== WP-B2-A3 begin (R3-11): the current-source read is taken at the world clock (it printed a read 24 h earlier), and evidence is not "complete" while a branch of it is unavailable
  const unavailable: boolean[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (node === null || typeof node !== "object") return;
    const rec = node as Obj;
    if (typeof rec.capability_id === "string" && rec.state === "UNAVAILABLE") unavailable.push(true);
    if (typeof rec.freshness === "string" && typeof rec.as_of === "string" && typeof rec.read_at === "string") { rec.read_at = isoSeconds(WORLD_NOW_MS); rec.as_of = isoSeconds(WORLD_NOW_MS - 1000); }
    Object.values(rec).forEach(visit);
  };
  visit(out);
  // ===== WP-B2-A3 end
  const data = out.governance_backbone?.data as Obj | undefined;
  if (data?.approval !== undefined) {
    if (unavailable.length > 0 && a.status === "PENDING") data.approval.evidence_complete = false; // WP-B2-A3 (N9b-02: a closed request's evidence is its decision record, complete)
    if (a.blocker !== undefined) { data.approval.blocker_count = 1; data.approval.blocker_summary = a.blocker; data.approval.evidence_complete = false; } // N8a-07: a halted subject is not "evidence ready"
    // WP-B2-A3 (R3-02 residual): two gates past R1 the Live request cites the decided R1 of its alpha (stage history), not "Missing"
    const r1 = approvalOfAlpha(a.alphaId, "R1");
    if (r1 !== undefined && r1.status === "APPROVED" && r1.decidedMs !== null) {
      data.r1_reference = { approval_id: r1.id, state: "APPROVED", href: approvalHref(r1), expiry: isoSeconds(r1.decidedMs + 180 * DAY_MS), digest: `sha256:${sha([a.alphaId, "r1"])}`, decided_by: r1.decidedBy, decided_at: isoSeconds(r1.decidedMs) };
      data.r1_state = "APPROVED";
      data.r1_id = r1.id;
    }
    decisionFields(a, data.approval);
    Object.assign(data.approval, {
      gate: "LIVE_GATE", subject_type: "DEPLOYMENT", subject_id: a.deploymentId, subject_label: a.alphaLabel, environment: "LIVE",
      target_label: `${a.alphaLabel} → ${a.target}`, portfolio_id: a.portfolioId,
    });
    closeEligibility(a, data.eligibility);
  }
  return out;
}

/** `GET /governance/exit-reviews/{id}` (Paper and Sandbox exit). */
export function overlayWorldExit(body: unknown, id: string): unknown {
  const a = worldApproval(id);
  if (a === undefined || (a.gate !== "PAPER_EXIT" && a.gate !== "SANDBOX_EXIT") || a.deploymentId === null) return body;
  const out = clone(body) as Obj;
  const d = worldAlphas().flatMap((x) => x.deployments).find((x) => x.id === a.deploymentId)!; // WP-B2-A3
  const days = stageHistoryOf(a.alphaId).stages[a.stageFrom ?? "paper"].days;
  const vocabulary = a.gate === "PAPER_EXIT" ? { stage: "PAPER_OBSERVATION", to: "SANDBOX_VALIDATION" } : { stage: "SANDBOX_VALIDATION", to: "LIVE_CANARY" };
  if (out.review !== undefined) {
    Object.assign(out.review, {
      review_id: a.id, stage: vocabulary.stage, promote_to: vocabulary.to, deployment_id: d.id, subject_label: `${a.alphaLabel} · ${d.id} · ${d.venue}`,
      quorum_met: a.quorumMet, quorum_required: a.quorumRequired, sla: { age_minutes: a.ageMinutes, budget_minutes: a.budgetMinutes },
    });
  }
  const minDays = gateMinimumDays(a.stageFrom ?? "paper"); // WP-B2-S3 (QA7 N4-05): the gate minimum is the stage policy's, the number the stage page prints
  out.gate_summary = `${days} days in ${a.stageFrom} · gate minimum ${minDays} days`;
  out.gate_met = days >= minDays;
  if (out.decision_context !== undefined) { out.decision_context.review_id = a.id; out.decision_context.gate = a.gate; }
  if (out.activation_plan !== undefined) out.activation_plan.target_stage = vocabulary.to;
  // ===== WP-B2-A3 begin: the lineage and the evidence panels are the subject's own (R3-09), not one cloned set: the alpha's R1 / R2 requests, its stage page, its portfolio, its net PnL in its own currency
  const r1 = approvalOfAlpha(a.alphaId, "R1");
  const r2 = approvalOfAlpha(a.alphaId, "R2");
  const run = `run_${5000 + (seedOf(a.alphaId, "run") % 900)}`;
  const policy = `${a.stageFrom}.v1`;
  const stagePath = `/deployments/${a.stageFrom}/${d.id}`;
  const fills = stageBookOf(d.id).fills.length;
  const net = fromCents(toCents(d.realized)); // WP-B2-A3 (N3-02): the published Net PnL of a deployment is its realized figure (the Alpha 360 / alpha resource definition), the same number
  out.policy_id = policy;
  if (Array.isArray(out.lineage)) {
    for (const item of out.lineage as Obj[]) {
      if (item.label === "artifact") { item.value = `sha256:${sha([a.alphaId, "artifact"]).slice(0, 6)}…${sha([a.alphaId, "artifact"]).slice(-2)}`; item.digest = `sha256:${sha([a.alphaId, "artifact"])}`; }
      if (item.label === "R1" && r1 !== undefined) { item.value = r1.id; item.href = approvalHref(r1); }
      if (item.label === "R2" && r2 !== undefined) { item.value = r2.id; item.href = approvalHref(r2); }
      if (item.label === "observation policy") item.value = policy;
      if (item.label === "evidence pack") { item.value = `ep_${4000 + (seedOf(a.alphaId, "ep") % 900)} · digest ${sha([a.alphaId, "pack"]).slice(0, 4)}…`; item.digest = `sha256:${sha([a.alphaId, "pack"])}`; }
    }
    out.lineage = (out.lineage as Obj[]).filter((item) => !((item.label === "R1" && r1 === undefined) || (item.label === "R2" && r2 === undefined)));
  }
  if (Array.isArray(out.panels)) {
    for (const panel of out.panels as Obj[]) {
      if (panel.title === "Observation coverage") {
        panel.source = policy;
        (panel.findings as Obj[]).splice(0, (panel.findings as Obj[]).length, { label: `${days} / ${minDays} days · ${fills} ${fills === 1 ? "fill" : "fills"}`, outcome: days >= minDays ? "pass" : "watch", href: stagePath, source_label: "sessions" });
        continue;
      }
      for (const finding of (panel.findings ?? []) as Obj[]) {
        if (typeof finding.href === "string") finding.href = finding.href.replace("/deployments/paper/dep_94", stagePath).replace("/deployments/blotter?deployment=dep_94", `/deployments/blotter?deployment=${d.id}`).replace("/operations?deployment=dep_94", `/operations?deployment=${d.id}`).replace("/deployments/portfolios/pf_main", `/deployments/portfolios/${d.portfolioId}`).replace(/runs\/run_\d+/, `runs/${run}`);
        if (typeof finding.label === "string") finding.label = finding.label.replace(/contribution [+-]?[\d,.]+ [A-Z]+/, `contribution ${groupedMoney(net)} ${d.currency}`);
      }
      if (typeof panel.source === "string" && /^run_\d+$/.test(panel.source)) panel.source = run;
    }
  }
  // ===== WP-B2-A3 end
  closeEligibility(a, out.eligibility);
  return out;
}

const groupedMoney = (decimal: string): string => {
  const [whole = "0", fraction] = decimal.split(".");
  const sign = whole.startsWith("-") ? "-" : "";
  return `${sign}${whole.replace("-", "").replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction === undefined ? "" : `.${fraction}`}`;
};

/** The evidence read's diff, preview sentence and criteria count of a world request (the same shape `evidenceFromRecord` has). */
export function worldEvidence(id: string, view?: WorldApproval): { portfolioId: string | null; environment: string; changes: Obj[]; whatChanges: (obligations: number) => string; countsAs: { met_after: number; required: number } } | null {
  const a = view ?? worldApproval(id);
  if (a === undefined) return null;
  // WP-B2-A3 (N8c-01): the criteria met NOW are the count Alpha 360 and the stage page print for the stage the gate leaves (one rule, criteriaMetOf); R1 / R2 have no stage record
  const record = a.stageFrom !== null ? stageHistoryOf(a.alphaId).stages[a.stageFrom] : null;
  const met = a.status === "APPROVED" ? 7 : record !== null ? criteriaMetOf(record.status, record.days) : 6;
  const stageChange = a.stageFrom !== null && a.stageTo !== null ? { label: "Stage", before: STAGE_WORD[a.stageFrom], after: STAGE_WORD[a.stageTo], unit: "TEXT" } : null;
  const capital = a.gate === "R2" ? capitalOf(a) : null;
  const changes: Obj[] = [
    ...(capital !== null ? [{ label: "Allocated capital", before: capital.before, after: capital.after, unit: "MONEY" }] : []),
    ...(stageChange !== null ? [stageChange] : []),
    // F3b: a diff row that changes nothing voids the whole evidence read (reader EV-3), so a decided request (7 of 7 at decision) has no "Criteria met" row
    ...(met !== 7 ? [{ label: "Criteria met", before: String(met), after: "7", unit: "COUNT" }] : []),
    { label: "Reviewer note", before: null, after: "Added", unit: "TEXT" },
  ];
  const sentence = capital !== null
    ? `Allocated capital of ${capital.portfolioName} moves from ${groupedMoney(capital.before)} to ${groupedMoney(capital.after)} ${capital.currency}`
    : stageChange !== null ? `${a.alphaLabel} moves from ${stageChange.before} to ${stageChange.after}` : `${a.alphaLabel} passes ${GATE_WORD[a.gate]}`;
  return {
    portfolioId: PORTFOLIO_NAMES[a.portfolioId] === undefined ? null : a.portfolioId, environment: a.environment, changes, // WP-B2-A3: only the world's own portfolios publish an economic history (the one NAV the Portfolio page prints); an R1 review has no capital and a generated portfolio publishes none
    // WP-B2-A3 (N9b-02): a closed request tells its decided record in the past tense (no "after approval", obligations carried, not "stay open")
    whatChanges: (obligations) => a.status === "APPROVED"
      ? `${sentence.replace(/ moves from /, " moved from ").replace(/ passes /, " passed ")}; the gate counted 7 of 7 criteria as met at decision. ${obligations === 0 ? "Nothing carried." : `${obligations} ${obligations === 1 ? "obligation" : "obligations"} carried.`}`
      : `${sentence}; the gate counts 7 of 7 criteria as met after approval. ${obligations === 0 ? "Nothing stays open." : `${obligations} ${obligations === 1 ? "obligation stays" : "obligations stay"} open.`}`,
    countsAs: { met_after: 7, required: 7 },
  };
}

/** `POST /approvals/{id}/capital-preview` for a world R2 request: allocated before/after are the statement's, the ceiling is the statement's approved budget. */
export function worldCapitalPreview(body: unknown, id: string, view?: WorldApproval): unknown | null {
  const a = view ?? worldApproval(id);
  if (a === undefined || a.gate !== "R2") return null;
  const out = clone(body) as Obj;
  if (out.analytics?.data === undefined) return out;
  const c = capitalOf(a);
  const before = toCents(c.before);
  const after = toCents(c.after);
  const maximum = c.budget !== null ? toCents(c.budget) : after * 2n;
  const used = 10_000n;
  const reserved = 2_500n;
  Object.assign(out.analytics.data, {
    portfolio_id: c.portfolioId, currency: c.currency, requested_amount: c.requested, allocated_before: c.before, allocated_after: c.after,
    maximum_allocated: fromCents(maximum), used: fromCents(used), reserved: fromCents(reserved),
    available_before: fromCents(before - used - reserved), available_after: fromCents(after - used - reserved),
    allocation_headroom_before: fromCents(maximum - before), allocation_headroom_after: fromCents(maximum - after),
  });
  return out;
}

/* ── the Command Centre: Needs attention, Today, Fleet by stage ─────────── */

/** The operations clock to the Command Centre clock, by distance from each body's read time. */
const inCcFrame = (opsMs: number): number => opsMs - OPS_READ_MS + WORLD_NOW_MS;
const SEVERITY_OF: Readonly<Record<string, string>> = { CRITICAL: "CRITICAL", ERROR: "HIGH", WARNING: "MEDIUM", INFO: "INFO" };
const SEVERITY_RANK: Readonly<Record<string, number>> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, INFO: 1 };
const OPERATION_COMMAND_WORD: Readonly<Record<string, string>> = {
  "portfolio/adjust-target-budget": "Target budget change", "portfolio/recall": "Recall", "portfolio/return-capital": "Capital return", "account/sync": "Account sync",
  "account/top-up": "Account top-up", "deployment/archive": "Deployment archive", "deployment/resume": "Deployment resume", "deployment/reconcile": "Dry-run reconcile", // WP-B2-S3
};
const VERIFY_WORD: Readonly<Record<string, string>> = { PARTIAL: "partially verified", FAILED: "failed verification", UNCERTAIN: "outcome uncertain", EXPIRED: "verification expired", PENDING: "verification pending", DENIED: "verification denied", NOT_STARTED: "not yet verified", SUCCEEDED: "verified" };
const targetName = (target: readonly [string, string]): string => `${KIND_WORD[target[0]] ?? target[0].toLowerCase()} ${displayNameOf(target[0], target[1])}`;

export const operationTitle = (op: WorldOperation): string => `${OPERATION_COMMAND_WORD[op.command] ?? op.command} on ${targetName(op.target)}`;
export const operationHref = (op: Pick<WorldOperation, "id">): string => `/execution/operations?operation=${op.id}`;
export const incidentTitle = (incident: WorldIncident): string => `${SEVERITY_WORD[incident.severity] ?? incident.severity} incident on ${targetName(incident.target)}`;
export const incidentHref = (incident: Pick<WorldIncident, "id">): string => `/execution/operations/incidents/${incident.id}`;

const SLA_MINUTES: Readonly<Record<string, number>> = { CRITICAL: 30, ERROR: 60, WARNING: 120, INFO: 240 };
type SlaState = "OVERDUE" | "DUE_SOON" | "ON_TRACK";
const slaStateOf = (dueMs: number, nowMs: number, budgetMs: number): SlaState => (dueMs <= nowMs ? "OVERDUE" : dueMs - nowMs <= budgetMs / 4 ? "DUE_SOON" : "ON_TRACK");

interface Candidate { rank: number; kind: "INCIDENT" | "OPERATION" | "APPROVAL"; item: Obj }
function needsAttentionCandidates(): Candidate[] {
  const out: Candidate[] = [];
  const kindOrder = { INCIDENT: 0, OPERATION: 1, APPROVAL: 2 } as const;
  for (const incident of WORLD_INCIDENTS) {
    if (incidentState(incident) === "RESOLVED") continue;
    const budget = (SLA_MINUTES[incident.severity] ?? 120) * MINUTE_MS;
    const created = inCcFrame(incident.createdMs);
    const due = created + budget;
    const finding = incident.evidence[0]?.label;
    out.push({ rank: 0, kind: "INCIDENT", item: {
      id: incident.id, kind: "INCIDENT", title: incidentTitle(incident), summary: `${ENV_WORD[environmentFor(incident.target[0], incident.target[1], incident.env)]}${finding !== undefined ? ` · ${finding}` : ""}`,
      severity: SEVERITY_OF[incident.severity] ?? "MEDIUM", sla_state: slaStateOf(due, WORLD_NOW_MS, budget), sla_due_at: isoOf(due), created_at: isoOf(created),
      updated_at: isoOf(inCcFrame(Math.max(incident.createdMs, ...[incident.acknowledged, incident.assigned, incident.mitigated].map((e) => e?.atMs ?? 0)))),
      authority: "EXECUTION", href: incidentHref(incident), action_label: "Investigate", age_seconds: Math.round((WORLD_NOW_MS - created) / 1000),
    } });
  }
  for (const op of WORLD_OPERATIONS) {
    if (op.triage !== "UNACKNOWLEDGED" || !["PARTIAL", "FAILED", "UNCERTAIN", "EXPIRED", "DENIED"].includes(op.verify)) continue;
    const opMs = Date.parse(op.at);
    const budget = (SLA_MINUTES[op.severity] ?? 120) * MINUTE_MS;
    const created = inCcFrame(opMs);
    const due = created + budget;
    out.push({ rank: 0, kind: "OPERATION", item: {
      id: op.id, kind: "OPERATION", title: `${OPERATION_COMMAND_WORD[op.command] ?? op.command} ${VERIFY_WORD[op.verify] ?? op.verify.toLowerCase()}`, summary: `${targetName(op.target)} · ${ENV_WORD[environmentFor(op.target[0], op.target[1], op.env)]}`,
      severity: SEVERITY_OF[op.severity] ?? "MEDIUM", sla_state: slaStateOf(due, WORLD_NOW_MS, budget), sla_due_at: isoOf(due), created_at: isoOf(created), updated_at: isoOf(created),
      authority: "EXECUTION", href: operationHref(op), action_label: "Verify", age_seconds: Math.round((WORLD_NOW_MS - created) / 1000),
    } });
  }
  for (const a of pendingApprovals()) {
    out.push({ rank: 0, kind: "APPROVAL", item: {
      id: a.id, kind: "APPROVAL", title: a.alphaLabel, summary: `${GATE_WORD[a.gate]} · ${a.target}`, severity: "MEDIUM",
      sla_state: slaStateOf(a.dueMs, WORLD_NOW_MS, a.budgetMinutes * MINUTE_MS), sla_due_at: isoOf(a.dueMs), created_at: isoOf(a.requestedMs), updated_at: isoOf(a.requestedMs),
      authority: "PORTAL", href: approvalHref(a), action_label: "Review", age_seconds: Math.round((WORLD_NOW_MS - a.requestedMs) / 1000),
    } });
  }
  out.sort((x, y) => (SEVERITY_RANK[y.item.severity] ?? 0) - (SEVERITY_RANK[x.item.severity] ?? 0) || kindOrder[x.kind] - kindOrder[y.kind] || Date.parse(y.item.created_at) - Date.parse(x.item.created_at));
  out.forEach((c, i) => { c.rank = i + 1; c.item.rank = i + 1; });
  return out;
}

/** The newest operation of the world whose verification succeeded (Today's "Last verified" card). */
export const lastVerifiedOperation = (): WorldOperation | undefined =>
  [...WORLD_OPERATIONS].filter((op) => op.verify === "SUCCEEDED").sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];

const NEEDS_LIMIT = 5;
/**
 * The three panels of the busy Command Centre snapshot, computed from the world. Sources, formula and freshness metadata are the base snapshot's; the
 * cards, the totals and the cells are the world's. Every href resolves to the entity the card names.
 */
export function worldCommandCenter(base: Obj): Obj {
  const out = clone(base);
  const candidates = needsAttentionCandidates();
  const shown = candidates.slice(0, NEEDS_LIMIT);
  out.read_at = WORLD_NOW_ISO;
  const panels = out.panels as Obj;
  for (const panel of Object.values(panels) as Obj[]) if (typeof panel.as_of === "string") panel.as_of = isoOf(WORLD_NOW_MS - 1000);
  for (const panel of Object.values(panels) as Obj[]) for (const source of (panel.sources ?? []) as Obj[]) if (typeof source.as_of === "string") source.as_of = isoOf(WORLD_NOW_MS - 1000);
  if (panels.needs_you !== undefined) {
    Object.assign(panels.needs_you, {
      total_count: candidates.length, observed_total_count: candidates.length, returned_count: shown.length, limit: 10, truncated: candidates.length > shown.length,
      items: shown.map((c) => ({ ...c.item, as_of: isoOf(WORLD_NOW_MS - 1000) })),
    });
  }
  const counts = fleetCounts();
  if (panels.fleet_health !== undefined) {
    const value: Readonly<Record<string, number>> = {
      LIVE_FULL: counts.deploymentsByStage.LIVE!, LIVE_CANARY: counts.deploymentsByStage.CANARY!, SANDBOX: counts.deploymentsByStage.SANDBOX!, PAPER: counts.deploymentsByStage.PAPER!,
      BROKER_SYNC_ISSUES: counts.brokerSyncIssues, OPEN_FINDINGS: counts.openFindings,
    };
    for (const cell of panels.fleet_health.cells as Obj[]) if (typeof cell.code === "string" && value[cell.code] !== undefined) cell.value = value[cell.code];
    panels.fleet_health.total_deployments = counts.deployments;
    panels.fleet_health.exact_total = true;
  }
  if (panels.pinned_watchlist !== undefined) {
    const pins = ["dep_live_01", "dep_c1"].flatMap((id) => {
      const found = NATIVE_ALPHAS.flatMap((a) => a.deployments.map((d) => ({ a, d }))).find((x) => x.d.id === id);
      return found === undefined ? [] : [found];
    });
    panels.pinned_watchlist.total_count = pins.length;
    panels.pinned_watchlist.items = pins.map(({ a, d }, i) => ({
      slot: i + 1, entity_type: "DEPLOYMENT", entity_id: d.id, label: a.label, href: d.stage === "CANARY" ? `/deployments/live/${d.id}/canary` : `/deployments/${d.stage.toLowerCase()}/${d.id}`,
      pinned_at: isoOf(WORLD_NOW_MS - (10 - i) * HOUR_MS), target_label: a.label, target_state: "available", target_authority: "EXECUTION",
      target_as_of: isoOf(WORLD_NOW_MS - 1000), target_freshness_state: "OK",
    }));
  }
  if (panels.today !== undefined) {
    const items: Obj[] = pendingApprovals().map((a) => ({
      id: `review:${a.id}`, kind: "REVIEW_DUE", label: `${GATE_WORD[a.gate]} · ${a.alphaLabel}`, scheduled_at: isoOf(a.dueMs), authority: "PORTAL", as_of: isoOf(WORLD_NOW_MS - 1000), href: approvalHref(a),
    }));
    const verified = lastVerifiedOperation();
    if (verified !== undefined) {
      items.push({ id: `verified:${verified.id}`, kind: "VERIFIED_OPERATION", label: `Last verified: ${OPERATION_COMMAND_WORD[verified.command] ?? verified.command} on ${targetName(verified.target)}`,
        scheduled_at: isoOf(inCcFrame(Date.parse(verified.at))), authority: "EXECUTION", as_of: isoOf(WORLD_NOW_MS - 1000), href: operationHref(verified) });
    }
    Object.assign(panels.today, { total_count: items.length, observed_total_count: items.length, returned_count: items.length, limit: 12, truncated: false, items });
  }
  return out;
}

/** Stage counts for the Fleet summary (`stage_counts`): the same alphas-per-stage the Overview prints. */
export const fleetStageCounts = (): Record<string, number> => fleetCounts().alphasByStage;

/* ── Since your last visit ──────────────────────────────────────────────── */

export interface DigestFactSeed { id: string; kind: "STAGE" | "OPERATION"; label: string; value: string; previous: string | null; href: string; asOfMs: number }
/** The facts the visit digest observes: where each native alpha stands now (and where it stood at the last visit), and the newest operations. */
export function worldDigestFacts(lastVisitMs: number = WORLD_NOW_MS - 7 * DAY_MS): DigestFactSeed[] {
  const out: DigestFactSeed[] = [];
  for (const alpha of NATIVE_ALPHAS) {
    const reached = stageHistoryOf(alpha.id).reached;
    const entered = stageHistoryOf(alpha.id).stages[reached].fromMs;
    const rank = STAGE_RANK[reached];
    const deployment = alpha.deployments.find((d) => d.stage.toLowerCase() === reached) ?? alpha.deployments[0]!;
    const before = entered > lastVisitMs ? STAGES[Math.max(0, rank - 1)]! : reached;
    out.push({
      id: `stage:${deployment.id}`, kind: "STAGE", label: `${alpha.label} · ${reached.toUpperCase()}`, value: reached.toUpperCase(), previous: before.toUpperCase(),
      href: `/deployments/alphas/${encodeURIComponent(alpha.id)}?deployment_id=${encodeURIComponent(deployment.id)}`, asOfMs: entered,
    });
  }
  return out;
}
export function worldDigestOperations(): { op: WorldOperation; seenAtLastVisit: boolean }[] {
  const visit = OPS_READ_MS - 2 * HOUR_MS - 5 * MINUTE_MS;
  return WORLD_OPERATIONS.slice(0, 4).map((op) => ({ op, seenAtLastVisit: Date.parse(op.at) <= visit }));
}

/* ── the funnel: every governance page of the positive world ────────────── */

/** The served body of a governance read in the positive world: the inbox, the history and the four review pages are the world's approvals; anything else passes. */
export function governanceBody(path: string, search: URLSearchParams, body: unknown): unknown {
  const p = path.replace(/^\/api\/v1\/execution/, "");
  if (p === "/governance/approvals") return worldInboxAnswer(search).body;
  if (p === "/governance/approvals/history") return worldHistoryAnswer(body);
  // the Portfolios register is one list: its total is the number of rows it holds, and the Fleet header counts the same portfolios
  if (p === "/portfolios" && Array.isArray((body as Obj)?.items) && (body as Obj).truncated === false) {
    // ===== WP-B2-A3 (N8c-02): the register's health is the worst of its deployments AND its open incidents (a portfolio with an open Critical incident is not HEALTHY)
    const items = ((body as Obj).items as Obj[]).map((item) => {
      const open = typeof item.portfolio_id === "string" ? openIncidentsOfPortfolio(item.portfolio_id) : [];
      if (open.length === 0 || item.health?.state !== "PUBLISHED") return item;
      const rank: Record<string, number> = { HEALTHY: 0, ATTENTION: 1, DEGRADED: 2, HALTED: 3 };
      const incident = open.some((i) => i.severity === "CRITICAL") ? "DEGRADED" : "ATTENTION";
      // The published health vocabulary is closed (basis WORST_OF_DEPLOYMENT_HEALTH, value = the worst class with a deployment in it): an open incident reaches the register only through the counts, as one deployment of the portfolio counted in the incident's class
      const counts = { ...item.health.deployments_by_health } as Record<string, number>;
      if ((rank[item.health.value] ?? 0) >= rank[incident]! || (counts.HEALTHY ?? 0) < 1) return item;
      counts.HEALTHY = counts.HEALTHY! - 1;
      counts[incident] = (counts[incident] ?? 0) + 1;
      return { ...item, health: { ...item.health, value: incident, deployments_by_health: counts } };
    });
    // ===== WP-B2-A3 end
    return { ...(body as Obj), items, total_portfolios: items.length };
  }
  const review = /^\/governance\/approvals\/([A-Za-z0-9._:-]+)\/(r1|r2|live)$/.exec(p);
  if (review !== null && review[2] === "r2" && worldApproval(review[1]!) === undefined) {
    // a generated R2: its exit candidate is a deployment of the generated fleet
    const out = clone(body) as Obj;
    const pick = generatedDeployment(review[1]!);
    if (pick !== null && Array.isArray(out.capture_context?.candidates)) {
      out.capture_context.candidates = (out.capture_context.candidates as Obj[]).map((c) => ({ ...c, deployment_id: pick.deployment.id, portfolio_id: pick.deployment.portfolioId, currency: pick.deployment.currency }));
    }
    return out;
  }
  if (review !== null) {
    const id = review[1]!;
    return review[2] === "r1" ? overlayWorldR1(body, id) : review[2] === "r2" ? overlayWorldR2(body, id) : overlayWorldLive(body, id);
  }
  const exit = /^\/governance\/exit-reviews\/([A-Za-z0-9._:-]+)$/.exec(p);
  if (exit !== null) return overlayWorldExit(body, exit[1]!);
  return body;
}
