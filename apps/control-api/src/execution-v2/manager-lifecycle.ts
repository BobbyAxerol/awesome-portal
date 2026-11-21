/**
 * FE-027 / FE-012: the three lifecycle scalars of a Manager row, and the rule
 * that publishes them.
 *
 * What the Portal can say today, and what it cannot:
 *
 *  - `current_stage` is the ONE financial stage in which the row (alpha,
 *    version, portfolio) has an active member at the snapshot cutoff of the
 *    selected environment. That is a restatement of `stage_presence`, not a new
 *    fact, so it is published only when the set has exactly one member. A row
 *    present in two stages (Live+Canary) has no single stage: the contract
 *    already says stage membership is not a rank, so the value is null with
 *    `MULTIPLE_ACTIVE_STAGES` rather than a chosen winner.
 *  - It does NOT cover R1/R2 or any pre-Paper gate (those alphas have no
 *    member and therefore no row), and it does not look across environments.
 *    `stage_lifecycle.covers` says so in every response.
 *  - `entered_at_ms` / `days_in_stage` need a stage-transition fact. A member's
 *    `valid_from_ms` is the start of an assignment/owner/binding revision
 *    interval; it moves on an owner change that leaves the stage untouched, so
 *    it is a bound on nothing and is NOT used. Optional stage_transitions in
 *    the persisted projection must bind exact row/environment/source revision.
 *    Missing or ambiguous single-stage context stays explicitly absent; no
 *    live source is claimed merely because the synthetic fixture supplies it.
 */
import { z } from "zod";
import { financialStage } from "./foundation.contract";

export type ManagerStageName = z.infer<typeof financialStage>;
export const STAGE_ENTRY_ABSENCE = "STAGE_ENTRY_TIME_NOT_PUBLISHED" as const;
export const CURRENT_STAGE_ABSENCE = "MULTIPLE_ACTIVE_STAGES" as const;
/** No stage published for the row at all (field policy withholds `stage`). */
export const CURRENT_STAGE_UNPUBLISHED = "STAGE_FIELD_NOT_PUBLISHED" as const;
export const MS_PER_DAY = 86_400_000;

/** Closed reasons; value null <=> reason non-null, value present <=> reason null. */
export const managerStageLifecycleReasons = z.object({
  current_stage: z.enum([CURRENT_STAGE_ABSENCE, CURRENT_STAGE_UNPUBLISHED]).nullable(),
  entered_at_ms: z.literal(STAGE_ENTRY_ABSENCE).nullable(),
  days_in_stage: z.literal(STAGE_ENTRY_ABSENCE).nullable(),
}).strict();

/** Response-level statement of what `current_stage` means. A constant so a
 * consumer can print the limit instead of re-deriving it. */
export const managerStageLifecyclePolicy = z.object({
  current_stage_rule: z.literal("SINGLE_ACTIVE_MEMBER_STAGE_IN_SELECTED_ENVIRONMENT"),
  covers: z.literal("DEPLOYED_STAGES_OF_SELECTED_ENVIRONMENT_ONLY"),
  entry_time: z.enum([STAGE_ENTRY_ABSENCE, "EXACT_SNAPSHOT_TRANSITION_WHEN_PUBLISHED"]),
}).strict();
export const MANAGER_STAGE_LIFECYCLE_POLICY = {
  current_stage_rule: "SINGLE_ACTIVE_MEMBER_STAGE_IN_SELECTED_ENVIRONMENT",
  covers: "DEPLOYED_STAGES_OF_SELECTED_ENVIRONMENT_ONLY", entry_time: STAGE_ENTRY_ABSENCE,
} as const;

export interface ManagerRowLifecycle {
  current_stage: ManagerStageName | null;
  entered_at_ms: number | null;
  days_in_stage: number | null;
  stage_lifecycle_reasons: z.infer<typeof managerStageLifecycleReasons>;
}

/** Pure: `stages` is the row's published `stage_presence` (already field-policy filtered). */
export function deriveManagerRowLifecycle(stages: readonly ManagerStageName[]): ManagerRowLifecycle {
  const distinct = [...new Set(stages)];
  const single = distinct.length === 1 ? distinct[0] : null;
  return { current_stage: single, entered_at_ms: null, days_in_stage: null,
    stage_lifecycle_reasons: { current_stage: single !== null ? null : distinct.length === 0 ? CURRENT_STAGE_UNPUBLISHED : CURRENT_STAGE_ABSENCE,
      entered_at_ms: STAGE_ENTRY_ABSENCE, days_in_stage: STAGE_ENTRY_ABSENCE } };
}

/** Already-authorized transition facts from the same source snapshot as the row.
 * Never substitute membership valid_from, owner change, or observation time. */
export interface ManagerStageTransitionFact {
  alpha_id: string;
  alpha_version_id: string;
  portfolio_id: string;
  environment: string;
  stage: ManagerStageName;
  entered_at_ms: number;
  exited_at_ms: number | null;
  source_revision: string;
}

export function deriveManagerRowLifecycleFromFacts(input: {
  stages: readonly ManagerStageName[];
  alpha_id: string;
  alpha_version_id: string;
  portfolio_id: string;
  environment: string;
  as_of_ms: number;
  source_revision: string;
  facts: readonly ManagerStageTransitionFact[];
}): ManagerRowLifecycle {
  const absent = deriveManagerRowLifecycle(input.stages);
  if (absent.current_stage === null) return absent;
  if (!Number.isSafeInteger(input.as_of_ms) || input.as_of_ms < 0 || !input.source_revision)
    throw new Error("MANAGER_STAGE_SNAPSHOT_INVALID");
  const facts = input.facts.filter(f => f.alpha_id === input.alpha_id &&
    f.alpha_version_id === input.alpha_version_id && f.portfolio_id === input.portfolio_id &&
    f.environment === input.environment && f.stage === absent.current_stage &&
    f.source_revision === input.source_revision);
  for (const f of facts) {
    if (!Number.isSafeInteger(f.entered_at_ms) || f.entered_at_ms < 0 ||
      (f.exited_at_ms !== null && (!Number.isSafeInteger(f.exited_at_ms) || f.exited_at_ms <= f.entered_at_ms)))
      throw new Error("MANAGER_STAGE_TRANSITION_INVALID");
  }
  const current = facts.filter(f => f.entered_at_ms <= input.as_of_ms &&
    (f.exited_at_ms === null || input.as_of_ms < f.exited_at_ms));
  const times = [...new Set(current.map(f => f.entered_at_ms))];
  if (times.length > 1) throw new Error("MANAGER_STAGE_TRANSITION_AMBIGUOUS");
  if (times.length === 0) return absent;
  return { current_stage: absent.current_stage, entered_at_ms: times[0],
    days_in_stage: Math.floor((input.as_of_ms - times[0]) / MS_PER_DAY),
    stage_lifecycle_reasons: { current_stage: null, entered_at_ms: null, days_in_stage: null } };
}

type RowShape = ManagerRowLifecycle & { stage_presence: string[]; environment?: string };
/** Cross-field rules a row-by-row schema cannot say. Run as a response refinement. */
export function validateManagerLifecycle(v: { as_of_ms: number; items: RowShape[];
  environment?: string; environment_coverage?: Array<{ environment: string; as_of_ms: number | null }> }, c: z.RefinementCtx): void {
  const bad = (i: number, message: string) => c.addIssue({ code: z.ZodIssueCode.custom, path: ["items", i], message });
  v.items.forEach((row, i) => {
    const cutoff = v.environment === "ALL" ? v.environment_coverage?.find(entry => entry.environment === row.environment)?.as_of_ms : v.as_of_ms;
    const r = row.stage_lifecycle_reasons;
    if ((row.current_stage === null) !== (r.current_stage !== null)) bad(i, "MANAGER_CURRENT_STAGE_REASON_MISMATCH");
    // The published stage must be the row's own single stage, never a different one.
    if (row.current_stage !== null && (row.stage_presence.length !== 1 || row.stage_presence[0] !== row.current_stage))
      bad(i, "MANAGER_CURRENT_STAGE_NOT_SINGLE_PRESENCE");
    // A stage filter may leave ONE visible stage on a row that has more, so one visible stage with a
    // withheld current_stage is legal; a published stage must still be the row's only visible stage.
    if (row.current_stage === null && r.current_stage !== (row.stage_presence.length === 0 ? CURRENT_STAGE_UNPUBLISHED : CURRENT_STAGE_ABSENCE))
      bad(i, "MANAGER_CURRENT_STAGE_REASON_WRONG");
    if ((row.entered_at_ms === null) !== (r.entered_at_ms !== null) || (row.days_in_stage === null) !== (r.days_in_stage !== null))
      bad(i, "MANAGER_STAGE_ENTRY_REASON_MISMATCH");
    // Days exist only with an entry time, never ahead of the cutoff, and equal the whole elapsed days.
    if (row.days_in_stage !== null) {
      if (row.entered_at_ms === null || row.current_stage === null) bad(i, "MANAGER_DAYS_WITHOUT_ENTRY");
      else if (cutoff == null || row.entered_at_ms > cutoff || row.days_in_stage !== Math.floor((cutoff - row.entered_at_ms) / MS_PER_DAY))
        bad(i, "MANAGER_DAYS_IN_STAGE_INVALID");
    }
    if (row.entered_at_ms !== null && row.current_stage === null) bad(i, "MANAGER_ENTRY_WITHOUT_CURRENT_STAGE");
  });
}
