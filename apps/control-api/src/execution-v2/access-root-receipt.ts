import { z } from "zod";
import type { Pool, PoolClient } from "pg";
import { withTransaction } from "../db/pool";
import { randomId } from "../domain";
import { AccessPolicyError, accessText, reviewedAccessPolicy, scopedAccessGrant,
  tsBusinessAction, tsMembershipAcceptance } from "./access.contract";
import { accessDigest, canonicalSelector, type AccessRelations } from "./access-policy";
import { AccessRepository, type AccessEvent, type AccessReceipt } from "./access.repository";

const digest = z.string().regex(/^sha256:[0-9a-f]{64}$/);

/** Private normalized verifier output, NOT a declaration of an existing TS wire.
 * A policy artifact cannot qualify this fact or copy an ordinary proposal receipt. */
export const tsRootMembershipAcceptance = tsMembershipAcceptance.omit({ proposal_id: true, proposal_digest: true }).extend({
  context: z.literal("REVIEWED_POLICY_ROOT"), policy_revision: accessText,
  policy_artifact_digest: digest, policy_install_digest: digest, approval_ref: accessText,
  grant_id: accessText, grant_digest: digest, expected_grant_revision: accessText,
}).strict();
export type TsRootMembershipAcceptance = z.infer<typeof tsRootMembershipAcceptance>;

/** The provider resolves all I/O before returning, and holds the current human
 * mapping/membership fence through Core COMMIT. Guards inside Core are sync only.
 * release must settle in the provider's bounded lifetime, including on failures. */
export interface QualifiedRootMembershipReceipt {
  fact: TsRootMembershipAcceptance;
  mapping: { ts_user_id: string; revision: string };
  membership: AccessRelations["membership"];
  assertCurrent(): void;
  release(): Promise<void>;
}

const refusal = () => new AccessPolicyError("RECEIPT_BINDING_MISMATCH", 409);
const notQualified = () => new AccessPolicyError("RECEIPT_NOT_QUALIFIED", 503);
const dbNow = async (db: PoolClient): Promise<number> => Number((await db.query(
  "SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms")).rows[0].ms);
const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function guardNow(guard: () => void): void {
  let result: unknown;
  try { result = guard(); }
  catch { throw notQualified(); }
  if (result !== null && (typeof result === "object" || typeof result === "function") &&
    typeof (result as { then?: unknown }).then === "function") {
    // Do not await accidental async source work while Core locks are held.
    void Promise.resolve(result).catch(() => undefined);
    throw notQualified();
  }
}

function isRootReplay(prior: AccessEvent, fact: TsRootMembershipAcceptance, proofDigest: string): boolean {
  return prior.operation === "TS_RECEIPT" && prior.request_digest === proofDigest &&
    prior.workspace_id === fact.workspace_id && prior.grant_id === fact.grant_id && prior.proposal_id === null &&
    object(prior.after_fact) && object(prior.after_fact.root_context) &&
    prior.after_fact.root_context.context === "REVIEWED_POLICY_ROOT" && accessDigest(prior.after_fact.root_context) === proofDigest;
}

/** Initial-only root receipt intake. No HTTP route, owner recovery, grant seed,
 * ordinary proposal bypass, external calls inside transactions, or source enable. */
export async function acceptRootMembershipReceipt(pool: Pool,
  verify: ((input: unknown) => Promise<QualifiedRootMembershipReceipt | null>) | undefined,
  input: unknown, allowTestOnly = false): Promise<{ receipt: AccessReceipt; replayed: boolean }> {
  if (!verify) throw notQualified();
  let lease: QualifiedRootMembershipReceipt | null;
  try { lease = await verify(input); } catch { throw notQualified(); }
  if (!lease || typeof lease.release !== "function") throw notQualified();
  const release = lease.release.bind(lease);
  try {
    if (typeof lease.assertCurrent !== "function") throw notQualified();
    const guard = lease.assertCurrent.bind(lease);
    const parsed = tsRootMembershipAcceptance.safeParse(lease.fact);
    if (!parsed.success) throw refusal();
    const fact = parsed.data, proofDigest = accessDigest(fact);
    // Detach mutable verifier fields before the first await; the held guard
    // independently attests their continued authority, not their JS references.
    const mapping = structuredClone(lease.mapping), membership = structuredClone(lease.membership);
    if (!mapping || mapping.ts_user_id !== fact.ts_user_id || mapping.revision !== fact.mapping_revision ||
      fact.previous_membership_revision !== null || fact.membership_revision === fact.previous_membership_revision)
      throw refusal();
    if (fact.outcome === "ACCEPTED" && (!membership || membership.revision !== fact.membership_revision ||
      membership.receipt_id !== fact.receipt_id || membership.mapping_revision !== fact.mapping_revision))
      throw new AccessPolicyError("TS_MEMBERSHIP_REVISION_CONFLICT", 409);
    guardNow(guard);
    const result = await withTransaction(pool, async db => {
      await db.query("SET LOCAL lock_timeout='1500ms'");
      await db.query("SET LOCAL statement_timeout='5000ms'");
      const lock = await db.query("SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS acquired", [`portal-access-v2:${fact.workspace_id}`]);
      if (!lock.rows[0].acquired) throw new AccessPolicyError("ACCESS_RETRY_REQUIRED", 409);
      const repo = new AccessRepository(db), prior = await repo.sourceEvent(fact.source, fact.receipt_id);
      if (prior) {
        if (!isRootReplay(prior, fact, proofDigest)) throw new AccessPolicyError("RECEIPT_PAYLOAD_CONFLICT", 409);
        guardNow(guard);
        // Historical outcome only. Never restore a revoked grant or old policy.
        return { receipt: prior.receipt, replayed: true };
      }
      const rawPolicy = await repo.policy(fact.workspace_id, true), policy = reviewedAccessPolicy.safeParse(rawPolicy);
      if (!policy.success || policy.data.state !== "REVIEWED" || !(policy.data.qualification === "OWNER_VERIFIED" ||
        allowTestOnly && policy.data.qualification === "TEST_ONLY")) throw notQualified();
      const p = policy.data, anchor = (await db.query(
        "SELECT user_id FROM portal_owner_anchor WHERE anchor_id='PORTAL_OWNER' FOR SHARE NOWAIT")).rows[0]?.user_id;
      if (!anchor || p.protected_owner_user_id !== anchor || p.revision !== fact.policy_revision ||
        p.artifact_digest !== fact.policy_artifact_digest || p.approval_ref !== fact.approval_ref ||
        fact.human_requester_user_id !== anchor) throw refusal();
      const install = await repo.policyInstall(fact.workspace_id, p.revision);
      const installFact = install?.after_fact;
      const roots = object(installFact) ? installFact.root_grant_digests : null;
      if (!install || !object(installFact) || !object(installFact.policy) || accessDigest(installFact.policy) !== accessDigest(p) ||
        install.request_digest !== fact.policy_install_digest || !Array.isArray(roots) ||
        roots.length > 10000 || roots.filter(item => object(item) && item.grant_id === fact.grant_id &&
          item.grant_digest === fact.grant_digest).length !== 1) throw refusal();
      const rawGrant = (await db.query("SELECT grant_fact FROM portal_access_grants_v2 WHERE workspace_id=$1 AND grant_id=$2 FOR UPDATE NOWAIT",
        [fact.workspace_id, fact.grant_id])).rows[0]?.grant_fact;
      const parsedGrant = scopedAccessGrant.safeParse(rawGrant);
      if (!parsedGrant.success) throw refusal();
      const grant = parsedGrant.data;
      if (grant.parent_grant_id !== null || grant.issued_by !== anchor || grant.workspace_id !== fact.workspace_id ||
        grant.policy_revision !== p.revision || grant.subject_user_id !== fact.portal_user_id || grant.effect !== "ALLOW" ||
        !tsBusinessAction(grant.action) || !grant.requires_ts_acceptance || grant.action !== fact.action ||
        accessDigest(canonicalSelector(grant.selector)) !== fact.selector_digest ||
        accessDigest([...grant.environments].sort()) !== accessDigest([...fact.environments].sort()) ||
        accessDigest(grant) !== fact.grant_digest || grant.revision !== fact.expected_grant_revision) throw refusal();
      if (grant.revoked_at_ms !== null || grant.ts_receipt !== null) throw new AccessPolicyError("RECEIPT_REVISION_CONFLICT", 409);
      if (grant.action === "portfolio.read_restricted" && (p.researcher_fields.state !== "QUALIFIED" ||
          !p.researcher_fields.policy_ref || grant.field_policy_ref !== p.researcher_fields.policy_ref)) throw refusal();
      const ids = [...new Set([anchor, grant.subject_user_id])];
      const principals = await db.query("SELECT user_id,status,must_change_password,archived_at FROM portal_users WHERE user_id=ANY($1::text[]) FOR SHARE NOWAIT", [ids]);
      const members = await db.query("SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND user_id=ANY($2::text[]) FOR SHARE NOWAIT", [fact.workspace_id, ids]);
      if (!(await db.query("SELECT 1 FROM workspaces WHERE workspace_id=$1 FOR SHARE NOWAIT", [fact.workspace_id])).rowCount ||
        ids.some(id => !principals.rows.some(u => u.user_id === id && u.status === "ACTIVE" && !u.must_change_password && !u.archived_at)) ||
        grant.subject_user_id !== anchor && !members.rows.some(m => m.user_id === grant.subject_user_id))
        throw new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED");
      const assertCurrent = (now: number) => {
        if (grant.valid_from_ms > now || grant.valid_until_ms !== null && grant.valid_until_ms <= now ||
          fact.effective_at_ms < grant.valid_from_ms || fact.effective_at_ms > now ||
          fact.expires_at_ms !== null && (fact.expires_at_ms <= now || fact.expires_at_ms <= fact.effective_at_ms) ||
          grant.valid_until_ms !== null && (fact.expires_at_ms === null || fact.expires_at_ms > grant.valid_until_ms))
          throw new AccessPolicyError("RECEIPT_REVISION_CONFLICT", 409);
        guardNow(guard);
      };
      const now = await dbNow(db); assertCurrent(now);
      const updated = fact.outcome === "ACCEPTED" ? { ...grant, revision: randomId("acr"), ts_receipt: {
        receipt_id: fact.receipt_id, membership_revision: fact.membership_revision, mapping_revision: fact.mapping_revision,
        effective_at_ms: fact.effective_at_ms, expires_at_ms: fact.expires_at_ms,
      } } : grant;
      const receipt: AccessReceipt = { schema_version: "portal.access-operation.v1", operation_id: randomId("ace"),
        proposal_id: null, grant_id: grant.grant_id,
        outcome: fact.outcome === "ACCEPTED" ? "TS_APPLIED" : fact.outcome === "REJECTED" ? "TS_REJECTED" : "TS_UNKNOWN",
        http_status: 200, reason_code: null, policy_revision: p.revision, grant_revision: updated.revision,
        decided_at_ms: now, ts_authority: fact.outcome };
      if (fact.outcome === "ACCEPTED") await repo.saveGrant(updated);
      await repo.event({ event_id: receipt.operation_id, workspace_id: fact.workspace_id, actor_user_id: anchor,
        subject_user_id: grant.subject_user_id, operation: "TS_RECEIPT", key_digest: null, request_digest: proofDigest,
        policy_revision: p.revision, grant_id: grant.grant_id, proposal_id: null, source: fact.source,
        source_receipt_id: fact.receipt_id, before_fact: grant, after_fact: { root_context: fact, grant: updated }, receipt });
      // Last DB await precedes the sync provider fence; no external I/O here.
      assertCurrent(await dbNow(db));
      return { receipt, replayed: false };
    });
    try { guardNow(guard); } catch { throw new AccessPolicyError("ACCESS_RETRY_REQUIRED", 503); }
    return result;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && String(error.code) === "23505")
      throw new AccessPolicyError("RECEIPT_PAYLOAD_CONFLICT", 409);
    if (error && typeof error === "object" && "code" in error && ["55P03", "40P01", "57014"].includes(String(error.code)))
      throw new AccessPolicyError("ACCESS_RETRY_REQUIRED", 409);
    throw error;
  } finally {
    // Core's COMMIT/ROLLBACK and connection release have both completed.
    // A failure is an uncertain acknowledgement; source-id replay is safe.
    try { await release(); } catch { throw new AccessPolicyError("ACCESS_RETRY_REQUIRED", 503); }
  }
}
