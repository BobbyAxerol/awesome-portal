import type { PoolClient } from "pg";
import { types } from "node:util";
import { AccessPolicyError, reviewedAccessPolicy, managerDomainReadInput, type ManagerDomainReadInput,
  type ManagerDomainReadDecision, type AccessActor } from "./access.contract";
import { accessDigest, managerDomainReadValidUntil, selectManagerDomainGrant, unqualifiedAccessRelations } from "./access-policy";
import { UsersRepository } from "../repos/users";
import { SessionsRepository } from "../repos/sessions";
import { AccessRepository } from "./access.repository";

/** DB-only capture shared by ordinary reads and the unmounted commit-lease
 * candidate. Its caller owns the short transaction; NEVER await transport here.
 * No identity, roles, grants or business entitlements are copied into a second
 * authority store. The fingerprint remains opaque, not an integer revision. */
export async function captureCurrentHumanSnapshot(db: PoolClient, actor: AccessActor, workspace: string) {
  const current = await db.query(`SELECT u.user_id,u.session_version,u.role,
    floor(extract(epoch FROM least(s.idle_expires_at,s.absolute_expires_at))*1000)::bigint AS lease_until_ms
    FROM portal_users u JOIN auth_sessions s ON s.user_id=u.user_id
    WHERE u.user_id=$1 AND u.status='ACTIVE' AND NOT u.must_change_password
      AND u.archived_at IS NULL AND u.session_version=$2 AND s.session_id=$3
      AND s.session_version=u.session_version AND s.state='ACTIVE'
      AND s.idle_expires_at>clock_timestamp() AND s.absolute_expires_at>clock_timestamp()`,
    [actor.user_id, actor.session_generation, actor.session_id]);
  if (current.rowCount !== 1) throw new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED");
  const anchor = (await db.query("SELECT user_id FROM portal_owner_anchor WHERE anchor_id='PORTAL_OWNER'")).rows[0]?.user_id;
  const member = await db.query("SELECT 1 FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [workspace, actor.user_id]);
  if (!member.rowCount && anchor !== actor.user_id) throw new AccessPolicyError("ACCESS_RESOURCE_NOT_FOUND", 404);
  if (!(await db.query("SELECT 1 FROM workspaces WHERE workspace_id=$1", [workspace])).rowCount)
    throw new AccessPolicyError("ACCESS_RESOURCE_NOT_FOUND", 404);
  const repo = new AccessRepository(db), rawPolicy = await repo.policy(workspace), stored = await repo.storedGrants(workspace);
  const policy = rawPolicy === null ? null : reviewedAccessPolicy.parse(rawPolicy);
  const grants = stored.flatMap(row=>row.kind==="LEGACY"?[row.fact]:[]);
  const manager_domain_grants = stored.flatMap(row=>row.kind==="MANAGER_DOMAIN"?[row.fact]:[]);
  if (policy && policy.protected_owner_user_id !== anchor) throw new AccessPolicyError("POLICY_PENDING", 503);
  const ids = [...new Set([actor.user_id, anchor, ...grants.flatMap(g => [g.subject_user_id, g.issued_by])]
    .filter((id): id is string => Boolean(id)))];
  const activeRows = await db.query(`SELECT u.user_id FROM portal_users u
    WHERE u.user_id=ANY($1::text[]) AND u.status='ACTIVE' AND NOT u.must_change_password
      AND u.archived_at IS NULL AND (u.user_id=$3 OR EXISTS(SELECT 1 FROM workspace_members m
        WHERE m.workspace_id=$2 AND m.user_id=u.user_id))`, [ids, workspace, anchor ?? null]);
  const active = activeRows.rows.map(r => String(r.user_id)).sort();
  const fact = { policy, grants, ids: ids.sort(), active, anchor, actor_role: current.rows[0].role as "ADMIN" | "USER",
    actor_member: Boolean(member.rowCount),
    // Preserve the historical zero-domain fingerprint and legacy principal IDs.
    ...(manager_domain_grants.length?{manager_domain_grants}:{}) };
  const now = Number((await db.query("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms")).rows[0].ms);
  const lease_until_ms = Number(current.rows[0].lease_until_ms);
  if (now >= lease_until_ms) throw new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED");
  return { ...fact, manager_domain_grants, now, lease_until_ms, authority_fingerprint: accessDigest(fact) };
}

/** Caller-owned short RC/writable transaction only. No transport or nested pool.
 * Same workspace/human/session/policy lock ordering as ExecutionAccessService.
 * The xid comparison refuses accidental autocommit; it is NOT a source fence. */
export async function lockCurrentHumanSnapshot(db:PoolClient,actor:AccessActor,workspace:string) {
  await db.query("SET LOCAL lock_timeout='1000ms'; SET LOCAL statement_timeout='3000ms'");
  const isolation=(await db.query("SHOW transaction_isolation")).rows[0]?.transaction_isolation;
  const readonly=(await db.query("SHOW transaction_read_only")).rows[0]?.transaction_read_only;
  if(isolation!=="read committed"||readonly!=="off")throw new AccessPolicyError("ACCESS_RETRY_REQUIRED",409);
  const xid=String((await db.query("SELECT txid_current()::text AS xid")).rows[0]?.xid??"");
  if(!/^[1-9][0-9]*$/.test(xid))throw new AccessPolicyError("ACCESS_RETRY_REQUIRED",409);
  const authority=await db.query("SELECT singleton FROM elp210_candidate.authority WHERE singleton FOR UPDATE");
  if(authority.rowCount!==1)throw new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED");
  const lock=await db.query("SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS acquired",[`portal-access-v2:${workspace}`]);
  if(!lock.rows[0]?.acquired)throw new AccessPolicyError("ACCESS_RETRY_REQUIRED",409);
  const user=await new UsersRepository(db).lockById(actor.user_id);
  if(!user||user.status!=="ACTIVE"||user.archivedAt||user.mustChangePassword||user.sessionVersion!==actor.session_generation||
    !await new SessionsRepository(db).lockActiveLease(actor.session_id,actor.user_id,actor.session_generation))
    throw new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED");
  await db.query("SELECT user_id FROM portal_owner_anchor WHERE anchor_id='PORTAL_OWNER' FOR SHARE");
  await db.query("SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND user_id=$2 FOR SHARE NOWAIT",[workspace,actor.user_id]);
  await db.query("SELECT 1 FROM workspaces WHERE workspace_id=$1 FOR SHARE NOWAIT",[workspace]);
  await new AccessRepository(db).policy(workspace,true);
  const snapshot=await captureCurrentHumanSnapshot(db,actor,workspace);
  await db.query("SELECT user_id FROM portal_users WHERE user_id=ANY($1::text[]) FOR SHARE NOWAIT",[snapshot.ids]);
  await db.query("SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND user_id=ANY($2::text[]) FOR SHARE NOWAIT",[workspace,snapshot.ids]);
  const current=await captureCurrentHumanSnapshot(db,actor,workspace);
  // The last awaited query obtains xid AND clock together. Earlier snapshot
  // clocks cannot authorize intervals that expired while this query waited.
  const final=(await db.query("SELECT txid_current()::text AS xid, floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms")).rows[0];
  const finalXid=String(final?.xid??""),now=Number(final?.ms);
  if(xid!==finalXid||!Number.isSafeInteger(now)||now<0||snapshot.authority_fingerprint!==current.authority_fingerprint)
    throw new AccessPolicyError("ACCESS_RETRY_REQUIRED",409);
  if(now>=current.lease_until_ms)throw new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED");
  return {...current,now};
}

/** New internal boundary only. Do not inspect a Proxy or invoke an accessor;
 * copy finite primitive input before Zod (which can otherwise inspect objects).
 * Legacy DB JSON parsing/ordinary reader byte grammar is unchanged. */
function captureManagerDomainReadInput(value:unknown):ManagerDomainReadInput {
  function fail():never { throw new AccessPolicyError("RECEIPT_BINDING_MISMATCH",409); }
  function fields(value:unknown,allowed:readonly string[]) {
    if(value===null||typeof value!=="object"||types.isProxy(value))fail();
    const proto=Object.getPrototypeOf(value);
    if(proto!==Object.prototype&&proto!==null)fail();
    const keys=Reflect.ownKeys(value);
    if(keys.length>allowed.length||keys.some(key=>typeof key!=="string"||!allowed.includes(key)))fail();
    const descriptors=Object.getOwnPropertyDescriptors(value);
    for(const key of keys) {
      const field=descriptors[key as string];
      if(!field||!field.enumerable||!("value" in field))fail();
    }
    return descriptors;
  }
  function string(value:unknown):string { if(typeof value!=="string")fail();return value; }
  const root=fields(value,["actor","workspace_id","environment","domain","expected_scope_digest"]);
  const actor=fields(root.actor?.value,["user_id","session_id","session_generation"]);
  const domain=fields(root.domain?.value,["profile_id","catalogue_sha256","profile_sha256","field_policy_sha256"]);
  const generation:unknown=actor.session_generation?.value;
  if(typeof generation!=="number")fail();
  const request={actor:{user_id:string(actor.user_id?.value),session_id:string(actor.session_id?.value),
    session_generation:generation},workspace_id:string(root.workspace_id?.value),
    environment:string(root.environment?.value),domain:{profile_id:string(domain.profile_id?.value),
      catalogue_sha256:string(domain.catalogue_sha256?.value),profile_sha256:string(domain.profile_sha256?.value),
      field_policy_sha256:string(domain.field_policy_sha256?.value)},
    ...(root.expected_scope_digest?.value===undefined?{}:{expected_scope_digest:string(root.expected_scope_digest.value)})};
  try{return managerDomainReadInput.parse(request);}catch{fail();}
}
/** PRIVATE DB-only app decision. The returned DTO is not a held native or
 * egress permit. Caller still intersects source authority and finite delivery. */
export async function evaluateManagerDomainRead(db:PoolClient,input:ManagerDomainReadInput):Promise<ManagerDomainReadDecision> {
  const request=captureManagerDomainReadInput(input);
  const current=await lockCurrentHumanSnapshot(db,request.actor,request.workspace_id);
  const context={principal_id:request.actor.user_id,workspace_id:request.workspace_id,
    now_ms:current.now,actor_current:true,policy:current.policy,grants:current.grants,
    active_principals:new Set(current.active),relationsFor:unqualifiedAccessRelations};
  const selected=selectManagerDomainGrant(context,current.manager_domain_grants,request.environment,request.domain);
  const valid_until_ms=managerDomainReadValidUntil(context,current.manager_domain_grants,selected,current.lease_until_ms);
  if(valid_until_ms<=current.now)throw new AccessPolicyError("ACCESS_DENIED");
  const scope_digest=accessDigest({schema_version:"portal.manager-domain-scope.v1",actor:request.actor,
    workspace_id:request.workspace_id,environment:request.environment,domain:request.domain,
    policy_revision:current.policy!.revision,grant_id:selected.grant.grant_id,grant_revision:selected.grant.revision,
    field_seal:selected.seal,valid_until_ms});
  if(request.expected_scope_digest!==undefined&&request.expected_scope_digest!==scope_digest)
    throw new AccessPolicyError("ACCESS_RETRY_REQUIRED",409);
  return {authority_fingerprint:current.authority_fingerprint,scope_digest,field_policy_sha256:request.domain.field_policy_sha256,
    field_policy_ref:selected.seal.field_policy_ref,valid_until_ms,now_ms:current.now,policy_revision:current.policy!.revision,grant_id:selected.grant.grant_id,
    grant_revision:selected.grant.revision,actor:{...request.actor}};
}
