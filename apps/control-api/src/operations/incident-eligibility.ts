import { z } from "zod";
import { IdentifierSchema } from "./contracts";

/** Portal workflow vocabulary, NOT new grant actions or TS command permits. */
export const INCIDENT_ELIGIBILITY_ACTIONS = ["incident.acknowledge", "incident.mitigate", "incident.resolve"] as const;
export const INCIDENT_ELIGIBILITY_BLOCKERS = ["INCIDENT_ALREADY_RESOLVED", "INCIDENT_NOT_ACKNOWLEDGEABLE",
  "INCIDENT_NOT_MITIGATABLE", "INCIDENT_ACKNOWLEDGEMENT_REQUIRED", "INCIDENT_ASSIGNEE_REQUIRED",
  "MITIGATION_EVIDENCE_REQUIRED", "INCIDENT_NOT_MITIGATED", "CLEAN_DRY_RUN_EVIDENCE_REQUIRED"] as const;
export const incidentEligibilityQuery = z.object({ workspace_id: IdentifierSchema.refine(v => v.length <= 96).optional() }).strict();
export interface IncidentEligibilityFacts {
  incident_id: string; environment: "PAPER" | "SANDBOX" | "LIVE";
  workflow_state: "OPEN" | "MITIGATED" | "RESOLVED"; workflow_version: number;
  acknowledged_at: Date | null; assigned_to_user_id: string | null;
  has_mitigation_attestation: boolean; has_clean_dry_run: boolean;
}

export function projectIncidentEligibility(fact: IncidentEligibilityFacts, workspaceId: string, observedAtMs: number) {
  type Blocker = typeof INCIDENT_ELIGIBILITY_BLOCKERS[number];
  const acknowledge: Blocker[] = [], mitigate: Blocker[] = [], resolve: Blocker[] = [];
  if (fact.workflow_state === "RESOLVED") {
    acknowledge.push("INCIDENT_ALREADY_RESOLVED"); mitigate.push("INCIDENT_ALREADY_RESOLVED"); resolve.push("INCIDENT_ALREADY_RESOLVED");
  } else {
    if (fact.acknowledged_at !== null) acknowledge.push("INCIDENT_NOT_ACKNOWLEDGEABLE");
    if (fact.workflow_state !== "OPEN") mitigate.push("INCIDENT_NOT_MITIGATABLE");
    if (fact.acknowledged_at === null) mitigate.push("INCIDENT_ACKNOWLEDGEMENT_REQUIRED");
    if (fact.assigned_to_user_id === null) mitigate.push("INCIDENT_ASSIGNEE_REQUIRED");
    if (!fact.has_mitigation_attestation) mitigate.push("MITIGATION_EVIDENCE_REQUIRED");
    // Mirror the actual resolve writer, not a stronger UI-inferred state machine.
    if (fact.workflow_state !== "MITIGATED") resolve.push("INCIDENT_NOT_MITIGATED");
    if (!fact.has_clean_dry_run) resolve.push("CLEAN_DRY_RUN_EVIDENCE_REQUIRED");
  }
  const row = (action: typeof INCIDENT_ELIGIBILITY_ACTIONS[number], blocker_codes: Blocker[], required_inputs: string[]) =>
    ({ action, eligible: blocker_codes.length === 0, blocker_codes, required_inputs });
  return {
    schema_version: "portal.execution.incident-action-eligibility.v1" as const,
    workspace_id: workspaceId, incident_id: fact.incident_id, environment: fact.environment,
    workflow_version: fact.workflow_version, observed_at_ms: observedAtMs,
    current_only: true as const, advisory_only: true as const,
    authority_basis: "EXISTING_PORTAL_ADMIN_INCIDENT_WORKFLOW" as const,
    family_check: "PORTAL_INCIDENT_WORKFLOW_RECHECK_REQUIRED" as const,
    source_side_effect_requested: false as const, deployment_resume_requested: false as const,
    actions: [row("incident.acknowledge", acknowledge, []),
      row("incident.mitigate", mitigate, ["mitigation_evidence_hash"]),
      row("incident.resolve", resolve, ["clean_dry_run_evidence_hash", "reason"])],
  };
}
