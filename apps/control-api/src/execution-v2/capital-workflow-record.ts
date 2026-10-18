/** One local, already-authorized stored command. No new-send authorization,
 * source I/O, authority installation or financial state inference. */
import { accessDigest } from "./access-policy";
import { commandIntent, commandStatus, publicCommandStatus, CommandError, type CommandIntent, type CommandStatus } from "./command.contract";
import { commandAuthorization } from "./command-trust";
import type { WorkflowCommandCandidate } from "./command.store";

export type WorkflowCommandTarget = Pick<CommandIntent, "resource" | "environment">;

/** Parse only the immutable authority tuple before checking its current report
 * grant. Invalid target has no safe disclosure scope: same404 as missing/hidden.
 * In particular do not eagerly decode the private status/authorization first. */
export function workflowCommandTarget(row: WorkflowCommandCandidate): WorkflowCommandTarget {
  const raw = row.intent !== null && typeof row.intent === "object" && !Array.isArray(row.intent)
    ? row.intent as Record<string, unknown> : {};
  const resource = commandStatus.shape.resource.safeParse(raw.resource);
  const environment = commandStatus.shape.environment.safeParse(raw.environment);
  if (!resource.success || !environment.success) throw new CommandError("COMMAND_RESOURCE_NOT_FOUND", 404);
  return { resource: resource.data, environment: environment.data };
}

/** Historical provenance remains bound to the original author/intent. Its old
 * send proof may expire; current audit permission is verified by the caller.
 * No raw validation issue/private source field crosses the public error seam. */
export function workflowCommandRecord(row: WorkflowCommandCandidate, workspace: string, id: string,
  target: WorkflowCommandTarget): { intent: CommandIntent; status: CommandStatus } {
  const bad = () => { throw new CommandError("COMMAND_STATUS_UNVERIFIED", 503); };
  const parsedIntent = commandIntent.safeParse(row.intent);
  const parsedStatus = commandStatus.safeParse(row.status);
  const parsedAuthorization = commandAuthorization.safeParse(row.authorization);
  if (!parsedIntent.success || !parsedStatus.success || !parsedAuthorization.success) return bad();
  const intent = parsedIntent.data, status = parsedStatus.data, authorization = parsedAuthorization.data;
  const sameResource = (value: { kind: string; id: string }) => value.kind === target.resource.kind && value.id === target.resource.id;
  if (row.workspace !== workspace || row.id !== id || intent.workspace_id !== workspace ||
    intent.environment !== target.environment || !sameResource(intent.resource) || status.command_id !== id ||
    status.operation !== intent.business_payload.operation || status.environment !== target.environment || !sameResource(status.resource) ||
    status.profile_ref !== authorization.profile_ref || status.authority !== authorization.qualification ||
    authorization.workspace_id !== workspace || authorization.environment !== target.environment ||
    authorization.operation !== intent.business_payload.operation || authorization.resource_kind !== target.resource.kind ||
    authorization.resource_id !== target.resource.id || authorization.actor_id !== row.actor ||
    authorization.intent_hash !== row.hash || row.hash !== accessDigest({ actor_user_id: row.actor, intent }) ||
    authorization.policy_revision !== intent.expected_policy_revision ||
    accessDigest(authorization.expected_versions) !== accessDigest(intent.business_payload.expected_versions) ||
    authorization.r2_basis !== null && authorization.r2_basis.currency !== intent.business_payload.currency ||
    status.updated_at_ms < status.created_at_ms || status.business.state !== "UNKNOWN" && status.delivery !== "ACKNOWLEDGED" ||
    authorization.expires_at_ms <= authorization.issued_at_ms || authorization.expires_at_ms - authorization.issued_at_ms > 60000 ||
    authorization.idempotency_retained_until_ms < authorization.expires_at_ms ||
    authorization.approval_required !== (authorization.required_approval_gate !== null) ||
    authorization.approval_required && (!authorization.approval || authorization.approval.gate !== authorization.required_approval_gate) ||
    authorization.approval !== null && (authorization.approval.intent_hash !== row.hash ||
      authorization.approval.policy_revision !== authorization.policy_revision ||
      authorization.approval.expires_at_ms <= authorization.issued_at_ms) ||
    authorization.approval?.gate === "R2" && authorization.r2_basis === null) return bad();
  // Fixed-amount receipts must still agree with their immutable requested amount;
  // differing decimal scale is harmless, numerical drift is not. RECALL_FULL and
  // target-setting wires have no fixed amount and keep the owning source fact.
  const requested = intent.business_payload.amount, amounts = status.business.amounts;
  if (requested !== undefined && amounts !== null) {
    const normalize = (value: string) => {
      const [whole, fraction = ""] = value.split(".");
      return `${whole.replace(/^0+(?=\d)/, "")}.${fraction.replace(/0+$/, "")}`;
    };
    if (normalize(requested) !== normalize(amounts.requested)) return bad();
  }
  return { intent, status };
}

/** Call only behind the same current exact-resource report/mutation fence as
 * workflowCommandRecord. No persisted row/event is mutated or rehashed. */
export function publicCommandRecord(row: WorkflowCommandCandidate, workspace: string, id: string,
  target: WorkflowCommandTarget) {
  const { intent, status } = workflowCommandRecord(row, workspace, id, target);
  return publicCommandStatus.parse({ ...status, currency: intent.business_payload.currency });
}
