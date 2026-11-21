/**
 * Adapter from an already authenticated profile read to the pure stage facts.
 * Used by the Sandbox, Canary and Live screens; the Paper workbench has its
 * own relation set and adapts in `paper-read.service.ts`.
 */
import { ProfileScreenSource } from "./profile-screen-composer";
import {
  buildStageFacts,
  darkStageFacts,
  RelationAvailability,
  RelationInput,
  StageFacts,
} from "./stage-facts";

const STATES = new Set<string>(["AVAILABLE", "EMPTY", "PARTIAL", "UNAVAILABLE"]);

function relation(source: ProfileScreenSource, key: string): RelationInput {
  const { state, reasonCode } = source.relationState(key);
  return {
    present: true,
    state: (STATES.has(state) ? state : "UNAVAILABLE") as RelationAvailability,
    reasonCode,
    rows: source.rows(key),
    absentReason: `${key.toUpperCase()}_RELATION_NOT_IN_PROFILE`,
  };
}

export function profileStageFacts(source: ProfileScreenSource, darkReason: string): StageFacts {
  if (!source.connected) return darkStageFacts(darkReason);
  return buildStageFacts({
    deployment: source.rows("deployments")[0] ?? null,
    sessions: relation(source, "sessions"),
    reconciliation: relation(source, "reconciliation"),
    reconciliationAsOf: source.asOf,
  });
}
