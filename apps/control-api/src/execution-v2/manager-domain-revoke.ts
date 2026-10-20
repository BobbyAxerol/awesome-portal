/** PRIVATE OWNER MAINTENANCE: the official Core-side revoke for NATIVE
 * manager-domain grants (`business.read_all` READ and `stream.subscribe`
 * STREAM). No controller, no URL, no session, no SQL. Same trust model as the
 * policy installer: a root-owned 0600 artifact whose SHA-256 and physical target
 * (database, system identifier, login, protected owner, workspace) are pinned
 * independently, valid only inside a finite operator window.
 *
 * A revoke can only REMOVE authority: it sets `revoked_at_ms` or shortens
 * `valid_until_ms` of ONE exact stored manager-domain grant, never touches a
 * legacy scoped grant, another workspace, the policy, a seal or any other field,
 * and is idempotent per `revocation_id`. This module holds the pure parts (file
 * boundary, plan, receipts); the single transactional writer is
 * `ExecutionAccessService.revokeReviewedManagerDomainGrants`. */
import { z } from "zod";
import type { Pool } from "pg";
import type { ExecutionAccessService } from "./access.service";
import { accessDigest } from "./access-digest";
import { managerDomainAction, managerDomainGrant, type ManagerDomainGrant, type ManagerDomainAction,
  type ScopedAccessGrant } from "./access.contract";
import { utcMilliseconds } from "./foundation.contract";
import { ownerTarget, type OwnerTarget } from "./owner-target";
import { OWNER_ARTIFACT_MAX_WINDOW_MS, parseCompactJson, readRootOwnedPinnedFile } from "./private-root-file";

export const MANAGER_REVOKE_SCHEMA = "portal.private-owner-manager-revoke.v1";
export const MANAGER_REVOKE_RECEIPT_SCHEMA = "portal.manager-domain-revoke-receipt.v1";
/** Source tag of the immutable audit event rows (UNIQUE with the per-grant receipt id). */
export const MANAGER_REVOKE_EVENT_SOURCE = "portal.private-owner-manager-revoke.v1";
/** The operator window of one artifact use is finite and short. */
export const MANAGER_REVOKE_MAX_WINDOW_MS = OWNER_ARTIFACT_MAX_WINDOW_MS;

export type ManagerRevokeCode =
  | "MANAGER_REVOKE_ARTIFACT_REFUSED" | "MANAGER_REVOKE_NOT_COMMISSIONED" | "MANAGER_REVOKE_TARGET_MISMATCH"
  | "MANAGER_REVOKE_GRANT_NOT_FOUND" | "MANAGER_REVOKE_GRANT_NOT_MANAGER_DOMAIN" | "MANAGER_REVOKE_ACTION_MISMATCH"
  | "MANAGER_REVOKE_REVISION_CONFLICT" | "MANAGER_REVOKE_NARROW_INVALID" | "MANAGER_REVOKE_NARROW_NOT_EARLIER"
  | "MANAGER_REVOKE_KEY_CONFLICT" | "MANAGER_REVOKE_RETRY_REQUIRED" | "MANAGER_REVOKE_DRAIN_PENDING";
/** Typed, secret-free refusal. The message is fixed; the code is the contract. */
export class ManagerRevokeError extends Error {
  constructor(readonly code: ManagerRevokeCode, readonly status: number = 409) {
    super("The requested access is not available.");
  }
}

const text = z.string().min(1).max(256).refine(v => !/[\u0000-\u001f\u007f]/u.test(v));
const reason = z.string().min(1).max(512).refine(v => !/[\u0000-\u001f\u007f]/u.test(v));
export const managerRevokeTarget = ownerTarget;
export type ManagerRevokeTarget = OwnerTarget;
const exact = { grant_id: text, action: managerDomainAction, expected_grant_revision: text };
const item = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("REVOKE"), ...exact }).strict(),
  /** Shorten ONE grant's validity to `valid_until_ms` (strictly earlier than now's
   * stored value and strictly after now); everything else stays. */
  z.object({ mode: z.literal("NARROW"), ...exact, valid_until_ms: utcMilliseconds }).strict(),
]);
export type ManagerRevokeItem = z.infer<typeof item>;
export const managerRevokeDocument = z.object({
  schema_version: z.literal(MANAGER_REVOKE_SCHEMA), target: managerRevokeTarget,
  /** Idempotency identity of THIS revoke decision. Same id + same bytes = replay. */
  revocation_id: text, approval_ref: text, reason, items: z.array(item).min(1).max(8), provenance_ref: text,
}).strict().refine(v => new Set(v.items.map(i => i.grant_id)).size === v.items.length, "DUPLICATE_GRANT");
export type ManagerRevokeDocument = z.infer<typeof managerRevokeDocument>;

export interface ManagerRevokePin {
  /** Root-owned 0600 regular file, no symlink, absolute private path only. */
  artifact_path: string;
  approved_sha256: string;
  /** Independent deployment pin (taken from the hash-pinned runtime manifest), NOT read back from the artifact. */
  target: ManagerRevokeTarget;
  /** Finite operator window for using THIS artifact (<= 24 h). */
  not_before_ms: number;
  not_after_ms: number;
}
export interface VerifiedManagerRevoke { readonly kind: "VERIFIED_MANAGER_REVOKE" }
const verified = new WeakMap<object, { document: ManagerRevokeDocument; sha256: string }>();
/** Only a token minted by readPinnedManagerRevoke resolves; a copied JSON object, a
 * hash or `reviewed=true` never authenticates a revoke. */
export function verifiedManagerRevoke(token: unknown): { document: ManagerRevokeDocument; sha256: string } | null {
  return token !== null && typeof token === "object" ? verified.get(token) ?? null : null;
}
const refused = (): never => { throw new ManagerRevokeError("MANAGER_REVOKE_ARTIFACT_REFUSED", 503); };

export async function readPinnedManagerRevoke(pin: ManagerRevokePin, nowMs: number): Promise<VerifiedManagerRevoke> {
  try {
    managerRevokeTarget.parse(pin.target);
    if (!Number.isSafeInteger(nowMs) || !Number.isSafeInteger(pin.not_before_ms) || !Number.isSafeInteger(pin.not_after_ms) ||
      pin.not_before_ms >= pin.not_after_ms || pin.not_after_ms - pin.not_before_ms > MANAGER_REVOKE_MAX_WINDOW_MS ||
      nowMs < pin.not_before_ms || nowMs >= pin.not_after_ms) return refused();
    const raw = await readRootOwnedPinnedFile(pin.artifact_path, pin.approved_sha256);
    const value = managerRevokeDocument.parse(parseCompactJson(raw));
    if (accessDigest(value.target) !== accessDigest(pin.target)) return refused();
    const token: VerifiedManagerRevoke = Object.freeze({ kind: "VERIFIED_MANAGER_REVOKE" as const });
    verified.set(token, { document: Object.freeze(structuredClone(value)) as ManagerRevokeDocument, sha256: pin.approved_sha256 });
    return token;
  } catch (error) {
    if (error instanceof ManagerRevokeError) throw error;
    return refused();
  }
}

/** Shape of AccessRepository.storedGrants rows (classifyStoredAccessGrant). */
export type StoredRow = { kind: "LEGACY"; fact: ScopedAccessGrant } | { kind: "MANAGER_DOMAIN"; fact: ManagerDomainGrant };
export type ManagerRevokeOutcome = "REVOKED" | "NARROWED" | "NOOP_ALREADY_REVOKED" | "NOOP_EXPIRED";
export interface PlannedManagerRevoke {
  item: ManagerRevokeItem; before: ManagerDomainGrant; after: ManagerDomainGrant | null; outcome: ManagerRevokeOutcome;
}
export interface ManagerRevokePlanContext {
  workspace_id: string; protected_owner_user_id: string; now_ms: number; newRevision: () => string;
}
/** A revoke only removes authority. Checked on the FINAL object, so a future edit of
 * the planner cannot silently widen: every field except `revision` and exactly one
 * of `revoked_at_ms` / `valid_until_ms` is identical, and validity never grows. */
export function assertManagerRevokeNeverWidens(before: ManagerDomainGrant, after: ManagerDomainGrant): void {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed = [...keys].filter(k => accessDigest((before as Record<string, unknown>)[k] ?? null) !==
    accessDigest((after as Record<string, unknown>)[k] ?? null)).sort();
  const revoked = changed.includes("revoked_at_ms"), narrowed = changed.includes("valid_until_ms");
  const ok = changed.length === 2 && changed.includes("revision") && revoked !== narrowed && before.revoked_at_ms === null &&
    (revoked ? after.revoked_at_ms !== null && after.valid_until_ms === before.valid_until_ms
      : after.revoked_at_ms === null && after.valid_until_ms < before.valid_until_ms) &&
    managerDomainGrant.safeParse(after).success;
  if (!ok) throw new ManagerRevokeError("MANAGER_REVOKE_ACTION_MISMATCH", 409);
}

/** Pure. `stored` is the WORKSPACE-scoped row set (the repository never returns another
 * workspace). Unknown/other-workspace ids and legacy ids are typed refusals; a
 * stale expectation is a typed conflict; an already revoked or expired grant is a
 * typed NO-OP (it already denies; nothing is written to the grant). */
export function planManagerRevoke(stored: readonly StoredRow[], document: ManagerRevokeDocument, context: ManagerRevokePlanContext): PlannedManagerRevoke[] {
  const plan: PlannedManagerRevoke[] = [];
  for (const entry of document.items) {
    const row = stored.find(r => r.fact.grant_id === entry.grant_id);
    if (!row || row.fact.workspace_id !== context.workspace_id)
      throw new ManagerRevokeError("MANAGER_REVOKE_GRANT_NOT_FOUND", 404);
    if (row.kind !== "MANAGER_DOMAIN") throw new ManagerRevokeError("MANAGER_REVOKE_GRANT_NOT_MANAGER_DOMAIN", 409);
    const grant = row.fact;
    if (grant.action !== entry.action || grant.issued_by !== context.protected_owner_user_id)
      throw new ManagerRevokeError("MANAGER_REVOKE_ACTION_MISMATCH", 409);
    if (grant.revoked_at_ms !== null) { plan.push({ item: entry, before: grant, after: null, outcome: "NOOP_ALREADY_REVOKED" }); continue; }
    if (grant.revision !== entry.expected_grant_revision) throw new ManagerRevokeError("MANAGER_REVOKE_REVISION_CONFLICT", 409);
    if (grant.valid_until_ms <= context.now_ms) { plan.push({ item: entry, before: grant, after: null, outcome: "NOOP_EXPIRED" }); continue; }
    let after: ManagerDomainGrant;
    if (entry.mode === "REVOKE") after = { ...grant, revision: context.newRevision(), revoked_at_ms: context.now_ms };
    else {
      if (entry.valid_until_ms <= context.now_ms || entry.valid_until_ms <= grant.valid_from_ms)
        throw new ManagerRevokeError("MANAGER_REVOKE_NARROW_INVALID", 409);
      if (entry.valid_until_ms >= grant.valid_until_ms) throw new ManagerRevokeError("MANAGER_REVOKE_NARROW_NOT_EARLIER", 409);
      after = { ...grant, revision: context.newRevision(), valid_until_ms: entry.valid_until_ms };
    }
    assertManagerRevokeNeverWidens(grant, after);
    plan.push({ item: entry, before: grant, after, outcome: entry.mode === "REVOKE" ? "REVOKED" : "NARROWED" });
  }
  return plan;
}

/** Secret-free per-grant receipt. Reconstructible from the immutable audit event. */
export interface ManagerRevokeReceipt {
  schema_version: typeof MANAGER_REVOKE_RECEIPT_SCHEMA;
  revocation_id: string; receipt_id: string; grant_id: string; action: ManagerDomainAction;
  mode: "REVOKE" | "NARROW"; outcome: ManagerRevokeOutcome;
  grant_revision_before: string; grant_revision_after: string;
  valid_until_ms_before: number; valid_until_ms_after: number; revoked_at_ms: number | null;
  policy_revision: string; decided_at_ms: number; replayed: boolean;
}

/** Exact per-grant idempotency keys (UNIQUE(workspace_id,key_digest) on the audit table). */
export const managerRevokeItemKey = (workspaceId: string, revocationId: string, grantId: string): string =>
  accessDigest(["MANAGER_DOMAIN_REVOKE_ITEM", workspaceId, revocationId, grantId]);
/** The coordinator intent key and the full-request digest of one artifact. */
export const managerRevokeIntentKey = (workspaceId: string, revocationId: string): string =>
  accessDigest(["MANAGER_DOMAIN_REVOKE", workspaceId, revocationId]);
export const managerRevokeRequestDigest = (document: ManagerRevokeDocument): string =>
  accessDigest({ schema: MANAGER_REVOKE_SCHEMA, document });

/** Offline composition seam used by the CLI: the reviewed artifact is read through
 * the root-owned boundary here, then handed to the ONE transactional writer. */
export function privateOwnerRevocation(_pool: Pool, pin: ManagerRevokePin, clock: () => number = Date.now) {
  const detached = structuredClone(pin);
  return Object.freeze({
    /** Parses and verifies the artifact only; touches no database. */
    verify: () => readPinnedManagerRevoke(detached, clock()),
    revoke: async (access: ExecutionAccessService): Promise<readonly ManagerRevokeReceipt[]> =>
      access.revokeReviewedManagerDomainGrants(await readPinnedManagerRevoke(detached, clock())),
  });
}
