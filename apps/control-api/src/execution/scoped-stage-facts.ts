/**
 * BE-P12 - the stage facts a SCOPED_V2 Live read may state.
 *
 * Pure. It receives rows the caller already authorized and field-filtered
 * (`scopedLiveSource`); it reads nothing and widens nothing. It reuses the V1
 * fact vocabulary and refusal rules (`stage-facts.ts`) and adds the one rule a
 * scoped read needs and V1 does not: the rows are the viewer's AUTHORIZED
 * population, and a resource-bound scope (a deployment, an account) can never
 * prove it holds the whole findings population (`scopeAllowsFullAccountingPopulation`
 * is false for every such scope, including a business.read_all holder's). So
 *
 *   - "an open finding exists" is a true monotone statement and is published
 *     (OPEN_FINDINGS);
 *   - "no open finding exists" is NOT provable from a population that may omit a
 *     hidden peer's finding: it is a typed absence, never NO_OPEN_FINDINGS;
 *   - a count over an authorized subset is a lower bound, not the count: it is a
 *     typed absence too.
 *
 * Runtime/session inputs must already belong to the exact authorized deployment
 * and reviewed detail vocabulary. Their presence is observation, not activation.
 */
import {
  absentRelation, buildStageFacts, missing, type StageFacts, type RelationInput,
} from "./stage-facts";
import { recordDetailValue } from "../execution-v2/record-detail";

export const SCOPED_RUNTIME_REASON = "RUNTIME_STATE_FIELD_NOT_IN_READ_VOCABULARY";
export const SCOPED_SESSIONS_REASON = "SCOPED_SESSION_ROW_FIELDS_NOT_IN_READ_VOCABULARY";
export const SCOPED_AS_OF_REASON = "SOURCE_CLOCK_NOT_SCOPED";
export const AUTHORIZED_POPULATION_REASON = "AUTHORIZED_POPULATION_ONLY";
export const AUTHORIZED_COUNT_REASON = "AUTHORIZED_POPULATION_COUNT_NOT_EXACT";

export type ScopedReconciliationInput =
  /** The panel is a typed absence (not captured, grain not proven, status field hidden): say why, in the panel's own words. */
  | { readonly kind: "UNAVAILABLE"; readonly reason: string }
  /** Rows after row policy, tuple scoping and the finding-to-session join; only the `status` of each is read. */
  | { readonly kind: "ROWS"; readonly rows: readonly Record<string, unknown>[] };

export interface ScopedStageObservation {
  readonly deployment?: Readonly<Record<string, unknown>>;
  readonly sessions?: RelationInput;
}
export function scopedLiveStageFacts(input: ScopedReconciliationInput, observation?: ScopedStageObservation): StageFacts {
  const deployment = observation?.deployment ? Object.fromEntries(
    ["runtime_state", "runtime_state_since", "runtime_state_changed_at"].flatMap(field => {
      const value = recordDetailValue(field, observation.deployment![field]);
      return value === undefined ? [] : [[field, value]];
    })) : null;
  const sessions = observation?.sessions ? { ...observation.sessions, state: "PARTIAL" as const,
    rows: observation.sessions.rows.map(row => Object.fromEntries(
      ["execution_session_id", "started_at", "completed_at", "state"].flatMap(field => {
        const value = field === "state" ? row.state : recordDetailValue(field, row[field]);
        return value === undefined ? [] : [[field, value]];
      }))) } : absentRelation(SCOPED_SESSIONS_REASON);
  const runtime = observation?.deployment ? buildStageFacts({ deployment, sessions,
    reconciliation: absentRelation(SCOPED_AS_OF_REASON), reconciliationAsOf: null }).runtime :
    { runtime_state: missing<never>(SCOPED_RUNTIME_REASON), since: missing<string>(SCOPED_RUNTIME_REASON) };
  if (input.kind === "UNAVAILABLE") {
    return { ...buildStageFacts({ deployment: null, sessions, reconciliation: absentRelation(input.reason), reconciliationAsOf: null }), runtime };
  }
  const built = buildStageFacts({
    deployment: null,
    sessions,
    // PARTIAL on purpose: NO_OPEN_FINDINGS is refused for a partial window, with this reason.
    reconciliation: { present: true, state: "PARTIAL", reasonCode: AUTHORIZED_POPULATION_REASON, rows: input.rows,
      absentReason: "RECONCILIATION_RELATION_NOT_IN_PROFILE" },
    reconciliationAsOf: null,
  });
  const { reconciliation } = built;
  return {
    ...built,
    runtime,
    reconciliation: {
      ...reconciliation,
      as_of: missing<string>(SCOPED_AS_OF_REASON),
      open_finding_count: reconciliation.open_finding_count.availability === "AVAILABLE"
        ? missing<number>(AUTHORIZED_COUNT_REASON) : reconciliation.open_finding_count,
      unknown_order_count: reconciliation.unknown_order_count.availability === "AVAILABLE"
        ? missing<number>(AUTHORIZED_COUNT_REASON) : reconciliation.unknown_order_count,
    },
  };
}
