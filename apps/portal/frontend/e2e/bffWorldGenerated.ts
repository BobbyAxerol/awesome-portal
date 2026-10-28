/**
 * THE GENERATED UNIVERSE'S GATE STANDING (WP-B2-A3, FIXTURE_LAB). The scale generator (`bffScale.approvals`) draws requests at random: a subject label, a
 * gate, a target. Nothing there knows which stage the subject is in, so QA6 found an R1 review for an alpha that is Live (R3-02), a Paper exit for an alpha that
 * is at Canary, a Paper exit whose gate the Paper page calls PARTIAL, two open exits for one deployment (R3-09), a Sandbox label over Real-funded capital (R3-03).
 *
 * Rule: a request exists only for the NEXT gate of its subject, and the subject, the gate, the days and the lineage are read from the one stage history
 * (`bffWorld.lifecycleOf`, `bffWorldStage.stageHistoryOf`). The generator's rows are kept as a pool of ids and nothing else:
 *
 *   an alpha with no deployment      stands in front of R1 or R2 (alternating, by the alpha's order): R1 pending, or R1 approved and R2 pending
 *   an alpha whose furthest stage is Sandbox   waits at the Sandbox exit of its first Sandbox deployment (R1, R2 and the Paper exit, when it has a Paper deployment, are decided)
 *   an alpha whose furthest stage is Canary    waits at the Live gate (Sandbox exit decided)
 *   an alpha in Paper                waits at the Paper exit, which the Paper page calls PARTIAL while the stage is current: no request can be raised yet
 *   an alpha in Live                 has nothing pending
 *
 * Gates already passed get an id of their own (`AP-41nn`, `AP-51nn`, `EX-81nn`, `SX-71nn`, `AP-61nn`; nn = the alpha's number), so the lineage of a pending
 * request names real, decided requests of the same alpha. The pending request takes the next free id of the generator's pool for its gate, so deep links to
 * `AP-400`, `EX-802` ... that still exist keep working. Money is exact decimal text, sums are BigInt cents; no float, no clock.
 */
import { createHash } from "node:crypto";

import { scaled } from "./bffScale";
import { furthestStage, worldAlphas } from "./bffWorld";

export type GeneratedGate = "R1" | "R2" | "PAPER_EXIT" | "SANDBOX_EXIT" | "LIVE_GATE";

export interface GeneratedPlan {
  alphaId: string;
  /** true for an alpha with no deployment: it stands in front of R1 or R2 */
  research: boolean;
  /** the gate that is waiting now (null when the alpha waits at none) */
  pending: GeneratedGate | null;
  /** one id per gate: the pool's id for the pending gate, a minted one for every other */
  ids: Record<GeneratedGate, string>;
  /** the Paper-only portfolio an R2 request reserves capital in, and the step it asks for (cents) */
  r2: { portfolioId: string; portfolioName: string; currency: string; requestedCents: bigint } | null;
}

const seedOf = (...parts: unknown[]): number => parseInt(createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 8), 16);
const STEPS: readonly bigint[] = [500_000n, 1_000_000n, 1_500_000n, 2_500_000n];
const numberOf = (alphaId: string): string => alphaId.replace(/^\D*0*/, "").padStart(2, "0").slice(-2);

let cache: GeneratedPlan[] | null = null;
export function generatedPlans(): readonly GeneratedPlan[] {
  if (cache !== null) return cache;
  const universe = scaled();
  const pool = (gate: string): string[] => universe.approvals.filter((row) => row.gate === gate).map((row) => String(row.approval_id));
  const pools = { R1: pool("R1"), R2: pool("R2"), PAPER_EXIT: pool("PAPER_EXIT"), LIVE_GATE: pool("LIVE_GATE") };
  // an R2 request reserves capital in a portfolio that holds a Paper book and nothing else (it has no Real-funded or Sandbox book to confuse the label)
  const paperOnly = universe.portfolios.find((p) => p.environments.length === 1 && p.environments[0] === "paper");
  const plans: GeneratedPlan[] = [];
  let researchIndex = 0;
  for (const alpha of universe.alphas) {
    const n = numberOf(alpha.id);
    const ids: Record<GeneratedGate, string> = { R1: `AP-41${n}`, R2: `AP-51${n}`, PAPER_EXIT: `EX-81${n}`, SANDBOX_EXIT: `SX-71${n}`, LIVE_GATE: `AP-61${n}` };
    const research = alpha.deployments.length === 0;
    const reached = furthestStage(alpha.id);
    if (research) {
      const wantsR2 = researchIndex % 2 === 1 && paperOnly !== undefined;
      researchIndex += 1;
      const gate: GeneratedGate = wantsR2 ? "R2" : "R1";
      ids[gate] = pools[gate].shift() ?? ids[gate];
      plans.push({
        alphaId: alpha.id, research, pending: gate, ids,
        r2: wantsR2 ? { portfolioId: paperOnly.id, portfolioName: paperOnly.name, currency: paperOnly.base, requestedCents: STEPS[seedOf(alpha.id, "r2-step") % STEPS.length]! } : null,
      });
    } else if (reached === "sandbox" || reached === "canary") {
      const gate: GeneratedGate = reached === "sandbox" ? "SANDBOX_EXIT" : "LIVE_GATE";
      // the generator's exit rows are the pool of the exit ids (its PAPER_EXIT rows): a Sandbox exit takes one of them
      ids[gate] = (gate === "SANDBOX_EXIT" ? pools.PAPER_EXIT : pools.LIVE_GATE).shift() ?? ids[gate];
      plans.push({ alphaId: alpha.id, research, pending: gate, ids, r2: null });
    }
  }
  // the alphas of the world that are in the plan are real alphas of the world
  const known = new Set(worldAlphas().map((a) => a.id));
  cache = plans.filter((plan) => known.has(plan.alphaId));
  return cache;
}
export const generatedPlanOf = (alphaId: string): GeneratedPlan | undefined => generatedPlans().find((plan) => plan.alphaId === alphaId);
/** Test hook: the plan is built once per scale; a test that changes the scale clears it. */
export const resetGeneratedPlans = (): void => { cache = null; };
