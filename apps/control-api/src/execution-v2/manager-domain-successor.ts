/** Private Research owner maintenance; not a browser/HTTP authority surface.
 * Appends finite successor grants, NEVER edits or resurrects their predecessors.
 * Physical target, source-expiry ceiling and root-owned artifact hash are pinned
 * independently. Native source eligibility is still checked on every real read. */
import { z } from "zod";
import { accessDigest } from "./access-digest";
import { accessText, managerDomainGrant, reviewedAccessPolicy, type ManagerDomainGrant,
  type ReviewedAccessPolicy, type StoredAccessGrant } from "./access.contract";
import { ownerTarget } from "./owner-target";
import { parseCompactJson, readRootOwnedPinnedFile } from "./private-root-file";

export const MANAGER_SUCCESSOR_SCHEMA = "portal.private-owner-manager-successor.v1";
export const MANAGER_SUCCESSOR_MAX_MS = 7_200_000;
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const epoch = z.number().int().nonnegative().safe();
export const managerSuccessorDocument = z.object({
  schema_version: z.literal(MANAGER_SUCCESSOR_SCHEMA), successor_id: accessText,
  target: ownerTarget, approval_ref: accessText, provenance_ref: accessText,
  expected_policy: z.object({ revision: accessText, digest }).strict(),
  policy: reviewedAccessPolicy,
  grants: z.array(z.object({ predecessor_grant_id: accessText,
    expected_revision: accessText, expected_digest: digest, grant: managerDomainGrant }).strict()).min(1).max(8),
}).strict().refine(v => new Set(v.grants.map(g => g.predecessor_grant_id)).size === v.grants.length &&
  new Set(v.grants.map(g => g.grant.grant_id)).size === v.grants.length, "DUPLICATE_GRANT");
export type ManagerSuccessorDocument = z.infer<typeof managerSuccessorDocument>;
export const managerSuccessorPin = z.object({ artifact_path: z.string().startsWith("/"),
  approved_sha256: z.string().regex(/^[a-f0-9]{64}$/), target: ownerTarget,
  not_before_ms: epoch, not_after_ms: epoch, source_expires_at_ms: epoch,
  maximum_grant_ms: z.number().int().positive().max(MANAGER_SUCCESSOR_MAX_MS),
}).strict().refine(v => v.not_after_ms > v.not_before_ms &&
  v.not_after_ms - v.not_before_ms <= MANAGER_SUCCESSOR_MAX_MS && v.not_after_ms <= v.source_expires_at_ms);
export type ManagerSuccessorPin = z.infer<typeof managerSuccessorPin>;
export type ManagerSuccessorCode = "MANAGER_SUCCESSOR_ARTIFACT_REFUSED" | "MANAGER_SUCCESSOR_TARGET_MISMATCH" |
  "MANAGER_SUCCESSOR_REVISION_CONFLICT" | "MANAGER_SUCCESSOR_SCOPE_REFUSED" |
  "MANAGER_SUCCESSOR_WINDOW_EXPIRED" | "MANAGER_SUCCESSOR_KEY_CONFLICT" | "MANAGER_SUCCESSOR_RETRY_REQUIRED";
export class ManagerSuccessorError extends Error {
  constructor(readonly code: ManagerSuccessorCode, readonly status = 409) { super("The requested access is not available."); }
}
export interface VerifiedManagerSuccessor { readonly kind: "VERIFIED_MANAGER_SUCCESSOR" }
const verified = new WeakMap<object, { document: ManagerSuccessorDocument; pin: ManagerSuccessorPin }>();
export function verifiedManagerSuccessor(token: unknown) {
  const value = token !== null && typeof token === "object" ? verified.get(token) : undefined;
  // Never expose mutable verifier-owned authority across an await.
  return value ? structuredClone(value) : null;
}
export function assertSuccessorWindow(pin: ManagerSuccessorPin, now: number): void {
  if (!Number.isSafeInteger(now) || now < pin.not_before_ms || now >= pin.not_after_ms || now >= pin.source_expires_at_ms)
    throw new ManagerSuccessorError("MANAGER_SUCCESSOR_WINDOW_EXPIRED");
}
export async function readPinnedManagerSuccessor(input: ManagerSuccessorPin, now: number): Promise<VerifiedManagerSuccessor> {
  try {
    const pin = managerSuccessorPin.parse(input);
    assertSuccessorWindow(pin, now);
    const raw = await readRootOwnedPinnedFile(pin.artifact_path, pin.approved_sha256);
    const document = managerSuccessorDocument.parse(parseCompactJson(raw));
    if (accessDigest(document.target) !== accessDigest(pin.target)) throw new Error("invalid");
    const token = Object.freeze({ kind: "VERIFIED_MANAGER_SUCCESSOR" as const });
    verified.set(token, { document, pin });
    return token;
  } catch { throw new ManagerSuccessorError("MANAGER_SUCCESSOR_ARTIFACT_REFUSED", 503); }
}
export const managerSuccessorKey = (workspace: string, id: string) => accessDigest([MANAGER_SUCCESSOR_SCHEMA, workspace, id]);
export const managerSuccessorDigest = (document: ManagerSuccessorDocument, fileSha256: string) =>
  accessDigest({ document, artifact_sha256: fileSha256 });

/** Pure CAS/scope check, repeated while locked in both authorize and apply.
 * New seals may only renew the SAME identities; no new subject/domain/action,
 * field policy or environment can hide inside this narrowly approved writer. */
export function planManagerSuccessor(document: ManagerSuccessorDocument, current: ReviewedAccessPolicy | null,
  stored: readonly StoredAccessGrant[], now: number, pin: ManagerSuccessorPin): { policyChanged: boolean; grants: ManagerDomainGrant[] } {
  assertSuccessorWindow(pin, now);
  const conflict = (): never => { throw new ManagerSuccessorError("MANAGER_SUCCESSOR_REVISION_CONFLICT"); };
  const scope = (): never => { throw new ManagerSuccessorError("MANAGER_SUCCESSOR_SCOPE_REFUSED"); };
  if (!current || current.revision !== document.expected_policy.revision || accessDigest(current) !== document.expected_policy.digest) return conflict();
  const next = document.policy, t = document.target;
  if (next.workspace_id !== t.workspace_id || current.workspace_id !== t.workspace_id ||
    next.protected_owner_user_id !== t.protected_owner_user_id || current.protected_owner_user_id !== t.protected_owner_user_id ||
    next.state !== "REVIEWED" || next.qualification !== "OWNER_VERIFIED" ||
    current.state !== "REVIEWED" || current.qualification !== "OWNER_VERIFIED" ||
    new Set(t.principal_workspace_pins.map(p => p.user_id)).size !== t.principal_workspace_pins.length ||
    t.principal_workspace_pins.some(p => p.workspace_id !== t.workspace_id)) return scope();
  const policyChanged = next.revision !== current.revision;
  if (!policyChanged && accessDigest(next) !== accessDigest(current)) return conflict();
  const shape = (p: ReviewedAccessPolicy) => {
    const { revision: _r, artifact_digest: _d, approval_ref: _a, manager_read_domains, ...rest } = p;
    return { ...rest, manager_read_domains: (manager_read_domains ?? []).map(s => {
      const { valid_from_ms: _f, valid_until_ms: _u, ...identity } = s; return identity;
    }).sort((a, b) => accessDigest(a).localeCompare(accessDigest(b))) };
  };
  if (accessDigest(shape(next)) !== accessDigest(shape(current))) return scope();
  // Advancing the workspace revision must not silently invalidate any legacy
  // fact or another still-active native grant (including DENY constraints).
  if (policyChanged && stored.some(g => !("schema_version" in g) ||
    g.policy_revision === current.revision && g.revoked_at_ms === null && g.valid_until_ms > now)) return scope();
  for (const entry of document.grants) {
    const before = stored.find(g => g.grant_id === entry.predecessor_grant_id);
    if (!before || !("schema_version" in before) || before.revision !== entry.expected_revision ||
      accessDigest(before) !== entry.expected_digest) return conflict();
    const g = entry.grant;
    if (stored.some(old => old.grant_id === g.grant_id) || g.revision === before.revision) return conflict();
    // The predecessor is historical CAS evidence, not today's authority. A
    // READ-only policy advance must not strand a separately renewed STREAM.
    // Its exact domain/field identity must still be sealed by CURRENT policy;
    // the NEW grant remains strictly bound to next.revision and its window.
    if (before.workspace_id !== t.workspace_id ||
      !current.manager_read_domains?.some(s => s.environment === before.environment &&
        accessDigest(s.domain) === accessDigest(before.domain) && s.field_policy_ref === before.field_policy_ref) ||
      before.effect !== "ALLOW" || before.revoked_at_ms === null && before.valid_until_ms > now ||
      g.workspace_id !== t.workspace_id || g.subject_user_id !== before.subject_user_id ||
      g.issued_by !== t.protected_owner_user_id || before.issued_by !== t.protected_owner_user_id ||
      g.action !== before.action || g.effect !== "ALLOW" || g.environment !== "paper" || g.environment !== before.environment ||
      accessDigest(g.domain) !== accessDigest(before.domain) || g.field_policy_ref !== before.field_policy_ref ||
      g.policy_revision !== next.revision || g.revoked_at_ms !== null ||
      !t.principal_workspace_pins.some(p => p.user_id === g.subject_user_id) ||
      g.valid_from_ms < pin.not_before_ms || g.valid_until_ms > pin.not_after_ms || g.valid_until_ms <= now ||
      g.valid_until_ms - g.valid_from_ms > pin.maximum_grant_ms ||
      !next.manager_read_domains?.some(s => s.environment === g.environment && accessDigest(s.domain) === accessDigest(g.domain) &&
        s.field_policy_ref === g.field_policy_ref && s.valid_from_ms <= g.valid_from_ms && s.valid_until_ms >= g.valid_until_ms)) return scope();
  }
  return { policyChanged, grants: document.grants.map(e => structuredClone(e.grant)) };
}
