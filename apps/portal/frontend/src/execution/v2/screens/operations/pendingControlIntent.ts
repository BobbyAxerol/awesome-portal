/**
 * The pending-control PREVIEW request, as pure rules (RV-10): what the request is built from, when it may be built, what it may carry.
 *
 * The five source CAS counters (`expected_versions`) are NEVER typed. They are copied, as the exact strings the Portal served, from the
 * discovered recall's last known receipt (`portal.execution.pending-recall-discovery.v1`), and the form has no field for them. A recall
 * whose outcome is unknown has no counters, so no request is built for it (a zero is not a counter). The workspace, resource, unit,
 * recall id and recipient come from the same served recall; the only free text is the reason.
 *
 * The opaque `expected_policy_revision` is a required member of the request. Its only source is `policy_revision` of the SAME discovery
 * read (`PUBLISHED` value, copied verbatim; the server compares it with the current reviewed access policy). The builder takes it as an
 * input that is `null` when the discovery served `NOT_PUBLISHED` / `POLICY_NOT_CURRENT` (or nothing) and then refuses with the typed gap
 * `POLICY_REVISION_NOT_PUBLISHED` instead of inventing one (the catalogue's revision is the catalogue's, not this control's).
 *
 * Nothing here sends. The preview is a rollback; a submit needs the digest of a current preview and a fresh step-up, and stays dark.
 */
import type { PendingOperation, CommandEnvironment } from "../../readers/commandCurrency";
import { PENDING_VERSION_KEYS, pm } from "../../readers/commandCurrency";
import type { DiscoveredRecall } from "../../readers/pendingRecallDiscovery";
import { unsafeText } from "../../../unsafeText";

export const POLICY_REVISION_GAP = "POLICY_REVISION_NOT_PUBLISHED";
export const RECALL_UNKNOWN_GAP = "RECALL_OUTCOME_UNKNOWN";
export const WORKSPACE_GAP = "WORKSPACE_NOT_PUBLISHED";

export const REASON_MAX = 512;

/** The visible label of the fixture-lab mount (DEBT-048 item 9): the preview is a rollback simulation, never a send. */
export const SIMULATION_COPY = "Simulation \u00b7 fixture lab, nothing is applied";

/**
 * The fixture-lab mount runs only in an explicit TEST_ONLY workspace (`ws_TEST_ONLY...`). Any other workspace, a missing one included,
 * is not a lab workspace, so the mount draws nothing there.
 */
export function isLabWorkspace(workspaceId: string | null | undefined): boolean {
  return typeof workspaceId === "string" && /^ws_TEST_ONLY(?:_[A-Za-z0-9._:-]*)?$/.test(workspaceId);
}
export const OPERATION_LABEL: Readonly<Record<PendingOperation, string>> = { APPLY_PENDING: "Apply pending", CANCEL_REMAINING: "Cancel remaining" };

/** The wire body of `PendingControlIntent`; every member is the schema's, in the schema's casing. */
export interface PendingControlIntentWire {
  schema_version: "portal.execution.pending-recall-intent.v1";
  workspace_id: string;
  resource: { kind: "PORTFOLIO" | "DEPLOYMENT"; id: string };
  environment: CommandEnvironment;
  expected_policy_revision: string;
  business_payload: {
    schema_version: "pma.operator-control.v1";
    operation: PendingOperation;
    idempotency_key: string;
    currency: string;
    reason: string;
    command_id: string;
    expected_versions: Readonly<Record<(typeof PENDING_VERSION_KEYS)[number], string>>;
    recipient_kind: "PORTFOLIO" | "DEPLOYMENT_ACCOUNT";
    recipient_account_id?: string;
    recipient_deployment_id?: string;
  };
}

export interface PendingControlTarget {
  workspaceId: string | null;
  resource: { kind: "PORTFOLIO" | "DEPLOYMENT"; id: string };
  environment: CommandEnvironment;
  recall: DiscoveredRecall;
  /** The opaque Portal policy revision, only if a read served it. `null` = none does. */
  policyRevision: string | null;
}

export type Gate = { open: true } | { open: false; code: string; reason: string };

/** Why the preview control is shut for this recall, or `open`. One reason, the first that applies. */
export function previewGate(target: PendingControlTarget): Gate {
  if (target.workspaceId === null || target.workspaceId === "") return { open: false, code: WORKSPACE_GAP, reason: "No workspace is named for this recall." };
  if (target.recall.state !== "WAITING_ENCUMBRANCE") return { open: false, code: RECALL_UNKNOWN_GAP, reason: "Outcome unknown: the Portal holds no receipt for this recall, so there are no versions to preview against." };
  if (target.policyRevision === null) return { open: false, code: POLICY_REVISION_GAP, reason: "The access policy revision this preview must name is not published yet." };
  return { open: true };
}

/** Why the reason text blocks Preview, or `null` when it may be sent. */
export function reasonBlock(reason: string): string | null {
  const text = reason.trim();
  if (unsafeText(reason, { allowLayout: false })) return "The text has a control or direction character. Remove it.";
  if (text.length === 0) return "A reason is required.";
  if (pm(text) === null) return `The reason must be plain text of at most ${REASON_MAX} characters.`;
  return null;
}

const KEY_SHAPE = /^[A-Za-z0-9._:-]{8,128}$/;
export function newPendingKey(): string {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  const key = `pending_control:${random}`;
  return KEY_SHAPE.test(key) ? key : `pending_control:${Date.now().toString(16)}`;
}

export type Built = { ok: true; intent: PendingControlIntentWire } | { ok: false; code: string; reason: string };

/** Build the preview request. Refuses (never repairs) whatever the gate or the reason refuses. */
export function buildPendingControlIntent(input: { target: PendingControlTarget; operation: PendingOperation; reason: string; idempotencyKey: string }): Built {
  const { target, operation, idempotencyKey } = input;
  const gate = previewGate(target);
  if (!gate.open) return { ok: false, code: gate.code, reason: gate.reason };
  const problem = reasonBlock(input.reason);
  if (problem !== null) return { ok: false, code: "REASON_INVALID", reason: problem };
  if (!KEY_SHAPE.test(idempotencyKey)) return { ok: false, code: "IDEMPOTENCY_KEY_INVALID", reason: "The request reference is not one the server accepts." };
  const { recall, resource } = target;
  // Narrowed by the gate; stated again so the compiler and a reader both see where the counters come from.
  if (recall.state !== "WAITING_ENCUMBRANCE" || target.workspaceId === null || target.policyRevision === null) {
    return { ok: false, code: RECALL_UNKNOWN_GAP, reason: "Outcome unknown: the Portal holds no receipt for this recall, so there are no versions to preview against." };
  }
  const expected_versions = {} as PendingControlIntentWire["business_payload"]["expected_versions"];
  for (const key of PENDING_VERSION_KEYS) (expected_versions as Record<string, string>)[key] = recall.versions[key];

  const payload: PendingControlIntentWire["business_payload"] = {
    schema_version: "pma.operator-control.v1",
    operation,
    idempotency_key: idempotencyKey,
    currency: recall.currency,
    reason: input.reason.trim(),
    command_id: recall.originalRecallId,
    expected_versions,
    recipient_kind: resource.kind === "PORTFOLIO" ? "PORTFOLIO" : "DEPLOYMENT_ACCOUNT",
  };
  if (resource.kind === "DEPLOYMENT") {
    // A deployment recall always names its owning account (the discovery reader refuses one that does not).
    if (recall.recipientAccountId === null) return { ok: false, code: "RECIPIENT_ACCOUNT_MISSING", reason: "The recall names no owning account." };
    payload.recipient_account_id = recall.recipientAccountId;
    payload.recipient_deployment_id = resource.id;
  }
  return {
    ok: true,
    intent: {
      schema_version: "portal.execution.pending-recall-intent.v1",
      workspace_id: target.workspaceId,
      resource: { kind: resource.kind, id: resource.id },
      environment: target.environment,
      expected_policy_revision: target.policyRevision,
      business_payload: payload,
    },
  };
}

/** A retry of the same intent replays under the same key; a changed intent (operation, reason, versions, policy) is a new key. */
export function intentFingerprint(intent: PendingControlIntentWire): string {
  const { idempotency_key: _key, ...rest } = intent.business_payload;
  return JSON.stringify([intent.workspace_id, intent.resource, intent.environment, intent.expected_policy_revision, rest]);
}
