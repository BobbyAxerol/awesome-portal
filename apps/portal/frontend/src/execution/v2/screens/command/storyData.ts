/**
 * The scripted bodies behind the UXM-09 fixture story. FIXTURE ONLY.
 *
 * Two kinds of body live here, and the file says which is which:
 *
 * - PUBLISHED: the F0 plan, the F0 operation and the relay denial are copies of the canonical files in `packages/contracts/fixtures`
 *   (`execution-command-plan`, `-operation`, `-relay-denied`). `storyData.test.ts` holds each equal to the file on disk, so a change
 *   to the published fixture fails a test here instead of drifting quietly.
 * - SYNTHETIC (TEST_ONLY): the capital preview, the capital statuses and the problem envelopes are built here from the published
 *   vocabulary (`portal.execution.command-preview.v1`, `portal.execution.command-status.v1`, `CommandProblem`). They are schema-valid
 *   (`storyData.test.ts` checks each against the published schema) and they are NOT product receipts: every capital status says
 *   `authority: TEST_ONLY`, and the screen says so. No body here proves that any command was ever accepted by anything.
 *
 * No `fetch`, no URL, no socket, no clock of its own: time comes from the story clock.
 */
import { readUtcEpochMs, type UtcEpochMs } from "../../../screenDataContract";
import type { CapitalIntentView } from "./model";
import type { Lane } from "./port";

/** The story clock: the instant the published F0 plan was made, plus one minute. Real time is never read by the story. */
const parsedNow = readUtcEpochMs(Date.parse("2026-08-22T12:01:00Z"));
if (parsedNow === null) throw new Error("the story clock is not a valid instant");
export const STORY_NOW_MS: UtcEpochMs = parsedNow;

/* ───────────────────────────── PUBLISHED (copies of the canonical files) ───────────────────────────── */

export const F0_PLAN_BODY = {
  schema_version: "execution.command-plan.v1",
  operation_id: "op_01K3COMMANDPLAN000000000000",
  command_type: "EXECUTION_COMMAND",
  command_version: 1,
  command_key: "account/sync",
  risk_tier: "R2_SANDBOX",
  payload_hash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
  plan_digest: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
  status: "BLOCKED",
  blockers: ["COMMAND_RELAY_DISABLED"],
  warnings: [],
  apply_token: null,
  expires_at: "2026-08-22T12:05:00Z",
  relay_capability: "DISABLED",
  source_side_effect_requested: false,
  payload_storage_policy: "HASH_ONLY_NO_RAW",
  replayed: false,
} as const;

export const F0_OPERATION_BODY = {
  schema_version: "execution.command-operation.v1",
  operation_id: "op_01K3COMMANDPLAN000000000000",
  command_type: "EXECUTION_COMMAND",
  command_key: "account/sync",
  status: "BLOCKED",
  verification_result: "NOT_STARTED",
  blockers: ["COMMAND_RELAY_DISABLED"],
  warnings: [],
  relay_receipt: null,
  source_side_effect_requested: false,
  created_at: "2026-08-22T12:00:00Z",
  updated_at: "2026-08-22T12:00:00Z",
} as const;

export const F0_DENIED_BODY = {
  schema_version: "execution.command-relay-decision.v1",
  operation_id: "op_01K3COMMANDPLAN000000000000",
  decision: "DENIED",
  reason: "COMMAND_RELAY_DISABLED",
  retry_allowed: false,
  source_request_sent: false,
} as const;

/* ───────────────────────────── SYNTHETIC (TEST_ONLY) ───────────────────────────── */

/** What the capital preview is a preview OF. Our request, not a server body. */
export const CAPITAL_INTENT: CapitalIntentView = {
  operation: "TOP_UP",
  resource: { kind: "PORTFOLIO", id: "TEST_ONLY:portfolio" },
  environment: "paper",
  currency: "USDT",
  amount: "100.000000000000000001",
  expectedVersions: { budget: "9007199254740993", source: "2", parent: "3" },
  policyRevision: "TEST_ONLY:policy1",
};

/** The id of the command every capital scenario creates. */
export const COMMAND_ID_LANDED = "ecm_00000000000000000000000000000001";
export const COMMAND_ID_APPLIED = "ecm_00000000000000000000000000000002";
export const COMMAND_ID_REVOKED = "ecm_00000000000000000000000000000003";
export const COMMAND_ID_UNVERIFIED = "ecm_00000000000000000000000000000004";
export const COMMAND_ID_DELIVERY_UNKNOWN = "ecm_00000000000000000000000000000005";
export const COMMAND_ID_REJECTED = "ecm_00000000000000000000000000000006";

export const PREVIEW_DIGEST = `sha256:${"a".repeat(64)}`;

export function capitalPreviewBody(options: { now: number; allowed?: boolean; expired?: boolean }): Record<string, unknown> {
  const allowed = options.allowed ?? true;
  return {
    schema_version: "portal.execution.command-preview.v1",
    allowed,
    reason_code: allowed ? null : "COMMAND_RELAY_NOT_QUALIFIED",
    preview_digest: allowed ? PREVIEW_DIGEST : null,
    expires_at_ms: allowed ? (options.expired === true ? options.now - 1_000 : options.now + 60_000) : null,
    profile_ref: allowed ? "TEST_ONLY:paper" : null,
    approval_required: allowed ? true : null,
    approval_gate: allowed ? "CAPITAL" : null,
    business_applied: false,
    reserved: false,
  };
}

const UNKNOWN_AMOUNTS = null;

interface StatusOverrides {
  command_id?: string;
  delivery?: string;
  business?: Record<string, unknown>;
  projection?: string;
  venue?: string;
  next_action?: string;
}

export function capitalStatusBody(overrides: StatusOverrides = {}): Record<string, unknown> {
  return {
    schema_version: "portal.execution.command-status.v1",
    command_id: overrides.command_id ?? COMMAND_ID_LANDED,
    operation: "TOP_UP",
    resource: { kind: "PORTFOLIO", id: "TEST_ONLY:portfolio" },
    environment: "paper",
    profile_ref: "TEST_ONLY:paper",
    delivery: overrides.delivery ?? "ACKNOWLEDGED",
    business: overrides.business ?? { state: "UNKNOWN", receipt_ref: null, source_event_ref: null, revision: null, amounts: UNKNOWN_AMOUNTS },
    projection: overrides.projection ?? "CATCHING_UP",
    venue: overrides.venue ?? "UNKNOWN",
    next_action: overrides.next_action ?? "QUERY_SAME_INTENT",
    created_at_ms: 1792100000000,
    updated_at_ms: 1792100000000,
    authority: "TEST_ONLY",
    currency: "USDT",
  };
}

/** Acknowledged, business UNKNOWN: the published `ack_only` shape. */
export const ackOnlyStatus = (): Record<string, unknown> => capitalStatusBody();

/** UX-F17: the source APPLIED it, the Portal view is still catching up and the venue has not settled. Three dimensions, three answers. */
export const appliedLaggingStatus = (): Record<string, unknown> =>
  capitalStatusBody({
    command_id: COMMAND_ID_APPLIED,
    business: {
      state: "APPLIED",
      receipt_ref: "TEST_ONLY:receipt-0002",
      source_event_ref: "TEST_ONLY:event-0002",
      revision: "9007199254740994",
      amounts: { requested: "100.000000000000000001", applied: "100.000000000000000001", pending: "0", cancelled: "0", rejected: "0" },
    },
    projection: "CATCHING_UP",
    venue: "PENDING",
    next_action: "REVIEW_RECEIPT",
  });

/** The source rejected the whole amount. The status publishes no reason. */
export const rejectedBusinessStatus = (): Record<string, unknown> =>
  capitalStatusBody({
    command_id: COMMAND_ID_REJECTED,
    business: {
      state: "REJECTED",
      receipt_ref: "TEST_ONLY:receipt-0006",
      source_event_ref: "TEST_ONLY:event-0006",
      revision: "4",
      amounts: { requested: "100.000000000000000001", applied: "0", pending: "0", cancelled: "0", rejected: "100.000000000000000001" },
    },
    projection: "CURRENT",
    venue: "NOT_APPLICABLE",
    next_action: "REVIEW_RECEIPT",
  });

/** Delivery is not confirmed, but a command id exists: the safe next step is to query it, never a second command. */
export const deliveryUnknownStatus = (): Record<string, unknown> =>
  capitalStatusBody({ command_id: COMMAND_ID_DELIVERY_UNKNOWN, delivery: "DELIVERY_UNKNOWN", projection: "UNKNOWN", venue: "UNKNOWN", next_action: "QUERY_SAME_INTENT" });

/** What a lookup of the delivery-unknown command finds once the transport settles: acknowledged, business still unknown. */
export const deliveryUnknownSettledStatus = (): Record<string, unknown> =>
  capitalStatusBody({ command_id: COMMAND_ID_DELIVERY_UNKNOWN, delivery: "ACKNOWLEDGED", projection: "CATCHING_UP", venue: "UNKNOWN", next_action: "QUERY_SAME_INTENT" });

export function problemBody(code: string, message = "Refused."): Record<string, unknown> {
  return { error: { code, message }, request_id: "req_01J2K3M4N5P6Q7R8S9T0A1B2C3", safe_next_action: "REVIEW_BLOCKER" };
}

/* ───────────────────────────── scenarios ───────────────────────────── */

export const SCENARIO_IDS = [
  "f0-denied",
  "f0-timeout-then-denied",
  "f0-plan-replayed",
  "f0-plan-expired",
  "f0-unverified",
  "f0-unreadable",
  "f0-revoked",
  "accepted",
  "applied-lagging",
  "rejected-preview-changed",
  "rejected-by-source",
  "delivery-unknown",
  "timeout-then-landed",
  "unverified",
  "unreadable",
  "revoked",
] as const;
export type ScenarioId = (typeof SCENARIO_IDS)[number];

export interface Scenario {
  id: ScenarioId;
  lane: Lane;
  label: string;
  /** What the reader should see, in one sentence. */
  summary: string;
  /** How the plan read behaves. */
  plan: "normal" | "replayed" | "expired";
}

export const SCENARIOS: readonly Scenario[] = [
  { id: "f0-denied", lane: "F0", plan: "normal", label: "Relay denied", summary: "Apply is answered 409 with the published denial: nothing was sent and a retry is never invited." },
  { id: "f0-timeout-then-denied", lane: "F0", plan: "normal", label: "No answer, then denied", summary: "The first send gets no answer (unknown). A retry under the same key is answered with the denial." },
  { id: "f0-plan-replayed", lane: "F0", plan: "replayed", label: "Plan already existed (replayed)", summary: "The plan comes back for a request key the server already knew. Nothing new was recorded." },
  { id: "f0-plan-expired", lane: "F0", plan: "expired", label: "Plan expired", summary: "The plan's published expiry has passed on the story clock: Confirm stays closed." },
  { id: "f0-unverified", lane: "F0", plan: "normal", label: "Receipt could not be verified", summary: "503 COMMAND_STATUS_UNVERIFIED: not proof that nothing happened." },
  { id: "f0-unreadable", lane: "F0", plan: "normal", label: "Unreadable answer", summary: "A 200 whose body is not a body the readers accept: unknown, never ok." },
  { id: "f0-revoked", lane: "F0", plan: "normal", label: "Access revoked during the send", summary: "403: the screen stops disclosing the plan and the earlier receipt." },
  { id: "accepted", lane: "CAPITAL", plan: "normal", label: "Accepted (acknowledged, outcome unknown)", summary: "Delivery acknowledged, business unknown, projection catching up. Not applied." },
  { id: "applied-lagging", lane: "CAPITAL", plan: "normal", label: "Applied, projection lagging, venue pending", summary: "UX-F17: three answers at once, and no resubmit." },
  { id: "rejected-preview-changed", lane: "CAPITAL", plan: "normal", label: "Rejected: preview changed (typed)", summary: "409 COMMAND_PREVIEW_CHANGED: a definite refusal with a typed reason." },
  { id: "rejected-by-source", lane: "CAPITAL", plan: "normal", label: "Rejected by the source", summary: "A status whose business state is REJECTED; the source's reason is not published." },
  { id: "delivery-unknown", lane: "CAPITAL", plan: "normal", label: "Delivery unknown, then replayed", summary: "A command id exists but delivery is unknown. Query it, or retry under the same key: the server answers with the same command." },
  { id: "timeout-then-landed", lane: "CAPITAL", plan: "normal", label: "No answer, then it had landed", summary: "No answer (unknown, no id). A retry under the same key is answered with the one command that exists." },
  { id: "unverified", lane: "CAPITAL", plan: "normal", label: "Receipt could not be verified", summary: "503 COMMAND_STATUS_UNVERIFIED: unknown, and it stays unknown on a retry." },
  { id: "unreadable", lane: "CAPITAL", plan: "normal", label: "Unreadable answer", summary: "A 200 whose body is not a body the readers accept." },
  { id: "revoked", lane: "CAPITAL", plan: "normal", label: "Access revoked during the send", summary: "403: the screen stops disclosing anything it showed." },
];

export const scenarioById = (id: ScenarioId): Scenario => SCENARIOS.find((s) => s.id === id)!;
