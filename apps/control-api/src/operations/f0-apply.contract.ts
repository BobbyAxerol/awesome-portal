import { z } from "zod";

/**
 * BE-P13 (tasks 1 and 2) · what `POST /api/v1/execution/operations/{operation_id}/apply`
 * can answer for an F0 (`execution.command-apply-request.v1`) plan, and how a
 * client recovers an answer it lost.
 *
 * Pure leaf: no imports beyond zod, so the contracts workspace can parse the
 * published fixtures with the SAME parser the service validates its output with.
 *
 * THE TRUTH ABOUT F0 APPLY. `ExecutionOperationsService.apply` has the return
 * type `Promise<never>`: after the workspace/creator fence it records one audit
 * event and throws `COMMAND_RELAY_DISABLED` (409). Every F0 plan is stored
 * `BLOCKED` with `relay_capability: "DISABLED"`, an `apply_token` of null, and a
 * database CHECK that forbids any other status. There is no code path, flag or
 * stored state under which F0 apply reaches ACCEPTED, SUCCEEDED or a source
 * request. So the contract publishes NO success body: the route has no 2xx
 * response in OpenAPI, and `fixtures.spec`/`be-p13-f0-apply.spec` assert that no
 * success fixture exists. A success shape appears only when a family with its
 * own authority (a coordinator, a source outcome, held-COMMIT) is commissioned,
 * and then under a different request schema, never by widening this one.
 */

/** Same grammar as every neighbouring `request_key` (plan, acknowledge, resolve, incident). */
export const f0ApplyRequestKey = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/);
const operationId = z.string().regex(/^[A-Za-z0-9._:-]{1,191}$/);

export const f0ApplyRequest = z.object({
  schema_version: z.literal("execution.command-apply-request.v1"),
  workspace_id: z.string().min(3).max(96),
  request_key: f0ApplyRequestKey,
  command_type: z.literal("EXECUTION_COMMAND"),
}).strict();
export type F0ApplyRequest = z.infer<typeof f0ApplyRequest>;

/** The relay decision of `execution-command-relay-denied.valid.json` (six fields), unchanged. */
export const relayDenied = z.object({
  schema_version: z.literal("execution.command-relay-decision.v1"),
  operation_id: operationId,
  decision: z.literal("DENIED"),
  reason: z.literal("COMMAND_RELAY_DISABLED"),
  retry_allowed: z.literal(false),
  source_request_sent: z.literal(false),
}).strict();

/**
 * `details` of the 409. The six relay-decision fields are carried inside the
 * problem envelope (which is where the server has always put them), plus the key
 * and whether this answer is the stored one being repeated.
 */
export const f0ApplyDecision = relayDenied.extend({
  request_key: f0ApplyRequestKey,
  replayed: z.boolean(),
}).strict();
export type F0ApplyDecision = z.infer<typeof f0ApplyDecision>;

/** The exact body the shared error filter sends for the denial. */
export const f0ApplyDeniedProblem = z.object({
  error: z.object({ code: z.literal("COMMAND_RELAY_DISABLED"), message: z.string().min(1).max(512) }).strict(),
  request_id: z.string().min(1).max(128),
  details: f0ApplyDecision,
}).strict();

/** A key already bound to a different operation of the same actor. Nothing was recorded and nothing was sent. */
export const f0ApplyKeyConflictProblem = z.object({
  error: z.object({ code: z.literal("REQUEST_KEY_PAYLOAD_CONFLICT"), message: z.string().min(1).max(512) }).strict(),
  request_id: z.string().min(1).max(128),
  details: z.object({ request_key: f0ApplyRequestKey, source_request_sent: z.literal(false) }).strict(),
}).strict();

const lookupBase = {
  schema_version: z.literal("portal.execution.f0-apply-attempt.v1"),
  operation_id: operationId,
  request_key: f0ApplyRequestKey,
};
/**
 * Read-only lookup of "what did apply with this key answer", for a client that
 * lost the response. NONE: this actor never recorded that key (in this
 * workspace). FOUND: recorded for THIS operation; the stored decision is the one
 * a replay returns. CONFLICT: the key is bound to a different operation of the
 * same actor; that operation is deliberately not named.
 */
export const f0ApplyAttemptLookup = z.discriminatedUnion("state", [
  z.object({ ...lookupBase, state: z.literal("NONE"), relay_decision: z.null(), first_recorded_at: z.null() }).strict(),
  z.object({ ...lookupBase, state: z.literal("FOUND"), relay_decision: relayDenied,
    first_recorded_at: z.string().datetime() }).strict(),
  z.object({ ...lookupBase, state: z.literal("CONFLICT"), relay_decision: z.null(), first_recorded_at: z.null() }).strict(),
]);
export type F0ApplyAttemptLookup = z.infer<typeof f0ApplyAttemptLookup>;

export const f0ApplyLookupPath = z.object({ operation_id: operationId, request_key: f0ApplyRequestKey }).strict();
export const f0ApplyLookupQuery = z.object({ workspace_id: z.string().min(3).max(96) }).strict();
