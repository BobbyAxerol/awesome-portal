/**
 * V2 reader and request for the session step-up (FE-015/060, Claude BE-P7 `10149b66`):
 * `POST /api/admin/profile-access/v2/step-up`, operationId `portalScopedAccessStepUpPostV1`,
 * request `AccessStepUpRequest` (`workspace_id`, `password`, optional `family`), response `portal.access-step-up.v1` (`AccessStepUp`).
 *
 * What the answer is, and is not (kept true for a screen):
 * - 200 says THIS session re-entered its own password recently, for one proof FAMILY. It is never a capability and never a
 *   grant: every command re-evaluates its own authority when it is used. A screen therefore does not turn a 200 into an `ACTIVE`
 *   row; it re-reads the eligibility batch (`session_step_up`) and shows what that says.
 * - `family` is REQUIRED in the response (v1 of the answer had none). An answer for another family than the one asked is not an
 *   answer to this request: `accessStepUpAnswers` is the check the adapter makes.
 * - the password is an argument of `accessStepUpRequest` and appears in exactly one place: the JSON body that function returns.
 *   It is not a field of any type in this file, is never logged, and is not part of any key or URL.
 *
 * Boundary rules: closed keys, a readable body of another `schema_version` is `unsupported_shape`, never throws.
 */
import { closed, oneOf, rec, selectorText } from "./accessSelf";
import type { UnsupportedAccessShape } from "./accessEffective";
import { STEP_UP_FAMILIES, type StepUpFamily } from "./accessSelfBatch";

export const ACCESS_STEP_UP_SCHEMA = "portal.access-step-up.v1";
export const ACCESS_STEP_UP_PATH = "/api/admin/profile-access/v2/step-up";

/** The three refusals BE-P7 §6 names for this route; any other code is shown as the Portal's own words, never mapped to these. */
export const STEP_UP_REFUSAL_CODES = ["STEP_UP_REJECTED", "ACCESS_DENIED", "CURRENT_ACTOR_AUTHORITY_REQUIRED"] as const;
export type StepUpRefusalCode = (typeof STEP_UP_REFUSAL_CODES)[number];

export interface AccessStepUp {
  state: "ACTIVE";
  /** The family the proof was issued for. */
  family: StepUpFamily;
  /** UTC epoch ms at which this proof ends. */
  expiresAtMs: number;
}

export type AccessStepUpRead = { kind: "step_up"; stepUp: AccessStepUp } | UnsupportedAccessShape;

/** Body -> typed read. `null` is "malformed"; another `schema_version` is `unsupported_shape`. */
export function readAccessStepUp(raw: unknown): AccessStepUpRead | null {
  const root = rec(raw);
  if (root === null) return null;
  const version = typeof root.schema_version === "string" ? root.schema_version : null;
  if (version !== ACCESS_STEP_UP_SCHEMA) return { kind: "unsupported_shape", schemaVersion: version };
  const body = closed(root, ["schema_version", "state", "family", "expires_at_ms"]);
  if (body === null || body.state !== "ACTIVE") return null;
  const family = oneOf(body.family, STEP_UP_FAMILIES);
  const expires = body.expires_at_ms;
  if (family === null || typeof expires !== "number" || !Number.isSafeInteger(expires) || expires < 0) return null;
  return { kind: "step_up", stepUp: { state: "ACTIVE", family, expiresAtMs: expires } };
}

/** True when the body answers THIS request: the family that was asked for (a proof for the other family proves nothing here). */
export function accessStepUpAnswers(stepUp: AccessStepUp, family: StepUpFamily): boolean {
  return stepUp.family === family;
}

export interface AccessStepUpInput {
  workspaceId: string;
  family: StepUpFamily;
  /** The caller's own password. Used for the JSON body below and nowhere else. */
  password: string;
}

const MAX_PASSWORD_CODEPOINTS = 256;

/**
 * The request body, or `null` when the server's strict schema would refuse it (so nothing is sent). Key order is fixed:
 * `workspace_id`, `password`, `family`. The family is ALWAYS sent (never omitted): omitting it means ACCESS_ADMIN on the server.
 */
export function accessStepUpBody(input: AccessStepUpInput): string | null {
  const workspaceId = selectorText(input.workspaceId);
  if (workspaceId === null || oneOf(input.family, STEP_UP_FAMILIES) === null) return null;
  const password = input.password;
  if (typeof password !== "string" || password.length === 0) return null;
  let points = 0;
  for (const _ of password) points += 1;
  if (points > MAX_PASSWORD_CODEPOINTS) return null;
  return JSON.stringify({ workspace_id: workspaceId, password, family: input.family });
}
