import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { Pool, PoolClient } from "pg";
import { withTransaction } from "../db/pool";
import { AuthService } from "../auth/auth.service";
import { randomId } from "../domain";
import { AccountLifecycleRepository, ACCESS_STEP_UP_PROOFS } from "../repos/account-lifecycle";
import { CredentialsRepository } from "../repos/credentials";
import { SessionsRepository } from "../repos/sessions";
import { accessDigest } from "./access-digest";
import { managerReadDomain, type AccessActor, type ManagerReadDomain } from "./access.contract";
import { ACCESS_PROFILE_MAXIMUM_VALIDITY_MS } from "./access-profile-artifact";
import { buildOrdinaryProfileLifecycle } from "./ordinary-profile-lifecycle";
import { lockCurrentHumanSnapshot } from "./current-human-snapshot";
import { CurrentHumanMutations, type CurrentHumanVerifiedMutationHooks } from "./current-human-mutations";
import { physicalTargetMatches, ownerAnchorMatches, type OwnerTarget } from "./owner-target";
import { parseCompactJson, readRootOwnedPinnedFile } from "./private-root-file";
import { ordinaryAuthorityInstallDocument, ordinaryAuthorityInstallPin, type OrdinaryAuthorityInstallPin }
  from "./ordinary-profile-authority-intake";
import {
  ORDINARY_AUTHORITY_BOUND, ORDINARY_AUTHORITY_SCHEMA, OrdinaryProfileAuthorityError,
  ordinaryAuthorityHead,
  ordinaryDelegateRequest, ordinaryEnvironment, ordinaryProfileGrant, ordinaryRevokeRequest,
  type OrdinaryAuthorityHead, type OrdinaryAuthorityReceipt,
  type OrdinaryDelegateRequest, type OrdinaryEnvironment, type OrdinaryProfileConfirmation,
  type OrdinaryProfileGrant, type OrdinaryProfileReadDecision, type OrdinaryProfileReadPort,
  type OrdinaryRevokeRequest,
} from "./ordinary-profile-authority.contract";

const refuse = (code: OrdinaryProfileAuthorityError["code"], status = 409): never => {
  throw new OrdinaryProfileAuthorityError(code, status);
};
const hash = (bytes: string) => createHash("sha256").update(bytes, "utf8").digest("hex");
function frozen<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(frozen); Object.freeze(value);
  }
  return value;
}
const same = (a: unknown, b: unknown) => accessDigest(a) === accessDigest(b);
const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const identity = (g: Pick<OrdinaryProfileGrant, "environment" | "domain" | "field_policy_ref">) =>
  accessDigest([g.environment, g.domain, g.field_policy_ref]);
type Revocation = { grant_id: string; revision: string; digest: string };
export interface OrdinaryAuthorityState {
  head: OrdinaryAuthorityHead; digest: string; grants: OrdinaryProfileGrant[]; revocations: Revocation[];
}
export function ordinaryAuthorityStateDigest(head: OrdinaryAuthorityHead,
  grants: readonly OrdinaryProfileGrant[], revocations: readonly Revocation[]): string {
  return accessDigest({ head, grants: [...grants].sort((a, b) => compareText(a.grant_id, b.grant_id)),
    revocations: [...revocations].sort((a, b) => compareText(a.grant_id, b.grant_id)) });
}

/** Transaction-scoped repository. A CAS failure MUST roll back the caller's
 * entire transaction (including appended facts/events); never retry its body. */
export class OrdinaryProfileAuthorityRepository {
  constructor(private readonly db: PoolClient) {}
  async load(workspace: string): Promise<OrdinaryAuthorityState | null> {
    const row = (await this.db.query(`SELECT revision,head_digest,head_fact FROM portal_ordinary_profile_authority
      WHERE workspace_id=$1 FOR SHARE`, [workspace])).rows[0];
    if (!row) return null;
    const head = ordinaryAuthorityHead.parse(row.head_fact);
    if (head.workspace_id !== workspace || head.target.workspace_id !== workspace || head.revision !== row.revision)
      return refuse("ORDINARY_AUTHORITY_INVALID", 503);
    const rows = await this.db.query(`SELECT grant_fact FROM portal_ordinary_profile_grants
      WHERE workspace_id=$1 ORDER BY grant_id LIMIT 10001`, [workspace]);
    const revoked = await this.db.query(`SELECT after_fact FROM portal_ordinary_profile_events
      WHERE workspace_id=$1 AND operation='REVOKE' ORDER BY event_id LIMIT 10001`, [workspace]);
    if (rows.rows.length > ORDINARY_AUTHORITY_BOUND || revoked.rows.length > ORDINARY_AUTHORITY_BOUND)
      return refuse("ORDINARY_AUTHORITY_BOUND_EXCEEDED", 503);
    const grants = rows.rows.map(r => ordinaryProfileGrant.parse(r.grant_fact));
    const revocations: Revocation[] = revoked.rows.map(r => {
      const v = r.after_fact?.revocation;
      if (!v || typeof v.grant_id !== "string" || typeof v.revision !== "string" || typeof v.digest !== "string" ||
          Object.keys(v).sort().join() !== "digest,grant_id,revision") return refuse("ORDINARY_AUTHORITY_INVALID", 503);
      const grant = grants.find(g => g.grant_id === v.grant_id);
      if (!grant || grant.revision !== v.revision || accessDigest(grant) !== v.digest)
        return refuse("ORDINARY_AUTHORITY_INVALID", 503);
      return v;
    });
    if (grants.some(g => g.workspace_id !== workspace) || new Set(grants.map(g => g.grant_id)).size !== grants.length ||
        new Set(revocations.map(g => g.grant_id)).size !== revocations.length ||
        ordinaryAuthorityStateDigest(head, grants, revocations) !== row.head_digest)
      return refuse("ORDINARY_AUTHORITY_INVALID", 503);
    return { head, digest: row.head_digest, grants, revocations };
  }
  async prior(workspace: string, key: string, requestDigest: string): Promise<OrdinaryAuthorityReceipt | null> {
    const row = (await this.db.query(`SELECT request_digest,receipt FROM portal_ordinary_profile_events
      WHERE workspace_id=$1 AND key_digest=$2`, [workspace, key])).rows[0];
    if (!row) return null;
    if (row.request_digest !== requestDigest) return refuse("ORDINARY_AUTHORITY_KEY_CONFLICT");
    return frozen(structuredClone(row.receipt)) as OrdinaryAuthorityReceipt;
  }
  async append(grant: OrdinaryProfileGrant): Promise<void> {
    await this.db.query(`INSERT INTO portal_ordinary_profile_grants
      (grant_id,workspace_id,subject_user_id,issued_by,parent_grant_id,revision,grant_fact)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`, [grant.grant_id, grant.workspace_id, grant.subject_user_id,
      grant.issued_by, grant.parent_grant_id, grant.revision, JSON.stringify(grant)]);
  }
  async cas(before: OrdinaryAuthorityState | null, head: OrdinaryAuthorityHead, digest: string): Promise<void> {
    const result = before === null
      ? await this.db.query(`INSERT INTO portal_ordinary_profile_authority(workspace_id,revision,head_digest,head_fact)
          VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(workspace_id) DO NOTHING`,
        [head.workspace_id, head.revision, digest, JSON.stringify(head)])
      : await this.db.query(`UPDATE portal_ordinary_profile_authority SET revision=$2,head_digest=$3,head_fact=$4::jsonb,
          updated_at=clock_timestamp() WHERE workspace_id=$1 AND revision=$5 AND head_digest=$6`,
        [head.workspace_id, head.revision, digest, JSON.stringify(head), before.head.revision, before.digest]);
    if (result.rowCount !== 1) return refuse("ORDINARY_AUTHORITY_REVISION_CONFLICT");
  }
  async event(input: { key: string; requestDigest: string; actor: string; subject: string | null;
    before: unknown; after: unknown; receipt: OrdinaryAuthorityReceipt }): Promise<void> {
    const r = input.receipt;
    await this.db.query(`INSERT INTO portal_ordinary_profile_events
      (event_id,workspace_id,actor_user_id,subject_user_id,operation,key_digest,request_digest,before_fact,after_fact,receipt)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb)`, [r.operation_id, r.workspace_id,
      input.actor, input.subject, r.operation, input.key, input.requestDigest, JSON.stringify(input.before),
      JSON.stringify(input.after), JSON.stringify(r)]);
  }
}

type PreparedInstall = { pin: OrdinaryAuthorityInstallPin;
  document: ReturnType<typeof ordinaryAuthorityInstallDocument.parse>;
  built: ReturnType<typeof buildOrdinaryProfileLifecycle> };
export interface VerifiedOrdinaryProfileInstall { readonly kind: "VERIFIED_ORDINARY_PROFILE_INSTALL" }
const verifiedInstalls = new WeakMap<object, PreparedInstall>();
function assertWindow(pin: OrdinaryAuthorityInstallPin, now: number): void {
  if (!Number.isSafeInteger(now) || now < pin.not_before_ms || now >= pin.not_after_ms)
    refuse("ORDINARY_AUTHORITY_WINDOW_EXPIRED");
}
/** Only this root-owned, bounded, independently pinned file boundary can mint
 * an install token. JSON/casts and G2 build results cannot reconstruct it. */
export async function readPinnedOrdinaryProfileInstall(rawPin: OrdinaryAuthorityInstallPin,
  now = Date.now()): Promise<VerifiedOrdinaryProfileInstall> {
  try {
    const pin = ordinaryAuthorityInstallPin.parse(rawPin); assertWindow(pin, now);
    const bytes = await readRootOwnedPinnedFile(pin.artifact_path, pin.approved_sha256);
    const document = ordinaryAuthorityInstallDocument.parse(parseCompactJson(bytes));
    const built = buildOrdinaryProfileLifecycle(document.lifecycle, document.current_artifact_bytes ?? undefined);
    if (!same(built.artifact.document.target, pin.target) ||
        (document.expected_head === null) !== (document.lifecycle.operation === "BOOTSTRAP") ||
        document.administrator_user_ids.some(id => id === pin.target.protected_owner_user_id ||
          !document.lifecycle.next.users.some(u => u.user_id === id && u.role === "ADMIN_READER")))
      return refuse("ORDINARY_AUTHORITY_INVALID");
    const token = Object.freeze({ kind: "VERIFIED_ORDINARY_PROFILE_INSTALL" as const });
    verifiedInstalls.set(token, { pin: structuredClone(pin), document, built }); return token;
  } catch { return refuse("ORDINARY_AUTHORITY_INVALID", 503); }
}

const READ_DENIES = new Set(["business.read_all", "alpha.read", "portfolio.read", "portfolio.read_restricted",
  "portfolio.discover_linked", "account.read", "binding.read"]);
type Current = Awaited<ReturnType<typeof lockCurrentHumanSnapshot>>;
type Capture = { state: OrdinaryAuthorityState; current: Current; active: Set<string>; now: number; fingerprint: string };
/** Conservative intersection: an entity DENY cannot be proved disjoint from a
 * whole profile without source ownership evidence. Never discard it. */
export function ordinaryProfileHasDeny(current: Pick<Current, "policy" | "grants" | "manager_domain_grants">,
  subject: string, environment: OrdinaryEnvironment, domain: ManagerReadDomain, active: ReadonlySet<string>, now: number): boolean {
  const eligible = (g: { subject_user_id: string; issued_by: string; policy_revision: string; effect: string;
    revoked_at_ms: number | null; valid_from_ms: number; valid_until_ms: number | null }) =>
    g.subject_user_id === subject && g.policy_revision === current.policy?.revision && g.effect === "DENY" &&
    g.revoked_at_ms === null && g.valid_from_ms <= now && (g.valid_until_ms === null || now < g.valid_until_ms) &&
    active.has(g.subject_user_id) && active.has(g.issued_by);
  return current.grants.some(g => eligible(g) && READ_DENIES.has(g.action) && g.environments.includes(environment)) ||
    current.manager_domain_grants.some(g => eligible(g) && g.action === "business.read_all" &&
      g.environment === environment && same(g.domain, domain));
}
function currentGrant(c: Capture, grant: OrdinaryProfileGrant, visited = new Set<string>()): boolean {
  if (visited.has(grant.grant_id) || visited.size > 1 || !c.active.has(grant.subject_user_id) || !c.active.has(grant.issued_by) ||
      grant.workspace_id !== c.state.head.workspace_id || grant.valid_from_ms > c.now || grant.valid_until_ms <= c.now ||
      c.state.revocations.some(r => r.grant_id === grant.grant_id) ||
      ordinaryProfileHasDeny(c.current, grant.subject_user_id, grant.environment, grant.domain, c.active, c.now) ||
      !c.state.head.profile_seals.some(s => identity(s) === identity(grant) && s.valid_from_ms <= grant.valid_from_ms &&
        s.valid_until_ms >= grant.valid_until_ms)) return false;
  const owner = c.state.head.target.protected_owner_user_id;
  if (grant.parent_grant_id === null) return grant.issued_by === owner;
  const parent = c.state.grants.find(g => g.grant_id === grant.parent_grant_id);
  if (!parent || parent.parent_grant_id !== null || parent.subject_user_id !== grant.issued_by ||
      !parent.delegable_actions.includes("business.read_all") || identity(parent) !== identity(grant) ||
      parent.valid_from_ms > grant.valid_from_ms || parent.valid_until_ms < grant.valid_until_ms) return false;
  visited.add(grant.grant_id); return currentGrant(c, parent, visited);
}
function ownerCovers(c: Capture, grant: OrdinaryProfileGrant): boolean {
  return c.state.grants.some(g => g.subject_user_id === c.state.head.target.protected_owner_user_id &&
    g.parent_grant_id === null && identity(g) === identity(grant) && g.valid_from_ms <= grant.valid_from_ms &&
    g.valid_until_ms >= grant.valid_until_ms && currentGrant(c, g));
}
function temporalCeiling(c: Capture, grant: OrdinaryProfileGrant): number {
  let until = Math.min(c.current.lease_until_ms, grant.valid_until_ms);
  const transition = (value: number | null) => { if (value !== null && value > c.now) until = Math.min(until, value); };
  for (const g of [...c.state.grants, ...c.current.grants, ...c.current.manager_domain_grants]) {
    transition(g.valid_from_ms); transition(g.valid_until_ms);
    if ("revoked_at_ms" in g) transition(g.revoked_at_ms);
    if ("ts_receipt" in g && g.ts_receipt) { transition(g.ts_receipt.effective_at_ms); transition(g.ts_receipt.expires_at_ms); }
  }
  for (const seal of c.state.head.profile_seals) { transition(seal.valid_from_ms); transition(seal.valid_until_ms); }
  return until;
}
/** Pure seam for adversarial vector tests. Not a public authority constructor. */
export function selectOrdinaryProfileGrant(c: Capture, subject: string, environment: OrdinaryEnvironment,
  selector: ManagerReadDomain | string): OrdinaryProfileGrant | null {
  const candidates = c.state.head.profile_seals.filter(s => s.environment === environment && s.valid_from_ms <= c.now &&
    s.valid_until_ms > c.now && (typeof selector === "string" ? s.domain.profile_id === selector : same(s.domain, selector)));
  if (new Set(candidates.map(identity)).size !== 1) return null;
  return [...c.state.grants].sort((a, b) => compareText(a.grant_id, b.grant_id)).find(g =>
    g.subject_user_id === subject && identity(g) === identity(candidates[0]!) && currentGrant(c, g) && ownerCovers(c, g)) ?? null;
}

/** Required real coordinator. No test/local/legacy fallback can write authority.
 * The read decision is app permission only, never publication qualification or
 * a held source/physical-send permit. Confirm at the final ordinary HTTP cut. */
const authorityBindings = new WeakMap<object, { pool: Pool; coordinator: CurrentHumanMutations }>();
export class OrdinaryProfileAuthority implements OrdinaryProfileReadPort {
  private readonly decisions = new WeakSet<object>();
  constructor(private readonly pool: Pool, private readonly mutations: CurrentHumanMutations) {
    if (!(mutations instanceof CurrentHumanMutations) || !mutations.usesPool(pool))
      refuse("ORDINARY_AUTHORITY_INVALID", 503);
    authorityBindings.set(this, { pool, coordinator: mutations });
  }
  usesPool(pool: unknown): boolean {
    const original = authorityBindings.get(this);
    return !!original && original.pool === pool && original.pool === this.pool && original.coordinator === this.mutations;
  }
  usesCoordinator(coordinator: unknown): boolean {
    const original = authorityBindings.get(this);
    return !!original && original.coordinator === coordinator && original.coordinator === this.mutations && original.pool === this.pool;
  }
  private assertBinding(): void {
    const original = authorityBindings.get(this);
    if (!original || original.pool !== this.pool || original.coordinator !== this.mutations)
      refuse("ORDINARY_AUTHORITY_INVALID", 503);
  }
  private async lock(db: PoolClient, workspace: string): Promise<void> {
    await db.query("SET LOCAL lock_timeout='1000ms'; SET LOCAL statement_timeout='5000ms'");
    const authority = await db.query("SELECT singleton FROM elp210_candidate.authority WHERE singleton FOR UPDATE");
    if (authority.rowCount !== 1) refuse("ORDINARY_AUTHORITY_RETRY_REQUIRED", 503);
    const r = await db.query("SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS acquired", [`portal-access-v2:${workspace}`]);
    if (!r.rows[0]?.acquired) refuse("ORDINARY_AUTHORITY_RETRY_REQUIRED");
  }
  private async now(db: PoolClient): Promise<number> {
    const now = Number((await db.query("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms")).rows[0]?.ms);
    if (!Number.isSafeInteger(now) || now < 0) return refuse("ORDINARY_AUTHORITY_INVALID", 503);
    return now;
  }
  private async principals(db: PoolClient, workspace: string, ids: readonly string[]): Promise<Set<string>> {
    const unique = [...new Set(ids)].sort();
    const users = await db.query(`SELECT user_id,status,must_change_password,archived_at FROM portal_users
      WHERE user_id=ANY($1::text[]) ORDER BY user_id FOR SHARE NOWAIT`, [unique]);
    const members = await db.query(`SELECT user_id FROM workspace_members WHERE workspace_id=$1
      AND user_id=ANY($2::text[]) ORDER BY user_id FOR SHARE NOWAIT`, [workspace, unique]);
    const memberIds = new Set(members.rows.map(r => r.user_id));
    return new Set(users.rows.filter(u => u.status === "ACTIVE" && !u.must_change_password && !u.archived_at &&
      memberIds.has(u.user_id)).map(u => String(u.user_id)));
  }
  private async capture(db: PoolClient, actor: AccessActor, workspace: string): Promise<Capture | null> {
    const current = await lockCurrentHumanSnapshot(db, actor, workspace);
    const state = await new OrdinaryProfileAuthorityRepository(db).load(workspace);
    if (!state) return null;
    // A copied/restored head must not become authority on a different physical
    // database or connection role merely because its owner IDs still match.
    if (current.anchor !== state.head.target.protected_owner_user_id ||
        !await physicalTargetMatches(db, state.head.target)) return refuse("ORDINARY_AUTHORITY_TARGET_MISMATCH");
    const ids = [...current.ids, ...state.grants.flatMap(g => [g.subject_user_id, g.issued_by]),
      ...current.manager_domain_grants.flatMap(g => [g.subject_user_id, g.issued_by])];
    const active = await this.principals(db, workspace, ids);
    if (!active.has(actor.user_id) || !active.has(current.anchor)) return null;
    const now = await this.now(db);
    if (now >= current.lease_until_ms) return null;
    return { state, current, active, now, fingerprint: accessDigest({ actor, workspace, legacy: current.authority_fingerprint,
      ordinary: state.digest, active: [...active].sort(), session_until_ms: current.lease_until_ms }) };
  }
  private decision(c: Capture, actor: AccessActor, environment: OrdinaryEnvironment,
    selector: ManagerReadDomain | string): OrdinaryProfileReadDecision | null {
    const grant = selectOrdinaryProfileGrant(c, actor.user_id, environment, selector);
    if (!grant) return null;
    const value: OrdinaryProfileReadDecision = frozen({ schema_version: "portal.ordinary-profile-read-decision.v1",
      actor: { ...actor }, workspace_id: c.state.head.workspace_id, environment, domain: { ...grant.domain },
      field_policy_ref: grant.field_policy_ref, fingerprint: c.fingerprint, valid_until_ms: temporalCeiling(c, grant),
      head_revision: c.state.head.revision, grant_id: grant.grant_id, grant_revision: grant.revision });
    this.decisions.add(value); return value;
  }
  async read(actor: AccessActor, workspace: string, environment: OrdinaryEnvironment,
    domainOrProfileId: ManagerReadDomain | string): Promise<OrdinaryProfileReadDecision | null> {
    this.assertBinding();
    ordinaryEnvironment.parse(environment);
    if (typeof domainOrProfileId !== "string") managerReadDomain.parse(domainOrProfileId);
    return withTransaction(this.pool, async db => {
      const c = await this.capture(db, actor, workspace); return c ? this.decision(c, actor, environment, domainOrProfileId) : null;
    });
  }
  async confirm(decision: OrdinaryProfileReadDecision): Promise<boolean> { return (await this.confirmMany([decision])) !== null; }
  async confirmMany(decisions: readonly OrdinaryProfileReadDecision[]): Promise<OrdinaryProfileConfirmation | null> {
    this.assertBinding();
    if (!decisions.length || decisions.length > 64 || decisions.some(d => !this.decisions.has(d))) return null;
    const started = performance.now();
    const confirmed = await withTransaction(this.pool, async db => {
      // The same global authority lock serializes all captures against actual
      // current-human mutation commits; every profile shares this one cut.
      await db.query("SELECT singleton FROM elp210_candidate.authority WHERE singleton FOR UPDATE");
      let until = Number.MAX_SAFE_INTEGER;
      const captures = new Map<string, Capture | null>();
      for (const d of [...decisions].sort((a, b) => compareText(a.workspace_id, b.workspace_id))) {
        const key = accessDigest([d.actor, d.workspace_id]);
        if (!captures.has(key)) captures.set(key, await this.capture(db, d.actor, d.workspace_id));
        const c = captures.get(key);
        if (!c || c.now >= d.valid_until_ms) return null;
        const selected = this.decision(c, d.actor, d.environment, d.domain);
        if (!selected || !same(selected, d)) return null;
        until = Math.min(until, d.valid_until_ms);
      }
      const now = await this.now(db);
      return now < until ? { remaining: until - now, until } : null;
    });
    if (!confirmed) return null;
    // Conservative: charge the entire transaction/COMMIT duration, not only
    // the time since the last DB clock. No asynchronous work in this fence.
    const deadline = started + confirmed.remaining;
    const result = Object.freeze({ assertCurrent: () => {
      if (performance.now() >= deadline || Date.now() >= confirmed.until) refuse("ORDINARY_AUTHORITY_WINDOW_EXPIRED");
    } });
    result.assertCurrent(); return result;
  }
  private async target(db: PoolClient, target: OwnerTarget): Promise<void> {
    if (!await physicalTargetMatches(db, target) || !await ownerAnchorMatches(db, target))
      return refuse("ORDINARY_AUTHORITY_TARGET_MISMATCH");
    const ids = target.principal_workspace_pins.map(p => p.user_id);
    if (target.principal_workspace_pins.some(p => p.workspace_id !== target.workspace_id) ||
        new Set(ids).size !== ids.length || !ids.includes(target.protected_owner_user_id))
      return refuse("ORDINARY_AUTHORITY_TARGET_MISMATCH");
    const active = await this.principals(db, target.workspace_id, ids);
    if (active.size !== ids.length) return refuse("ORDINARY_AUTHORITY_TARGET_MISMATCH");
  }
  private receipt(operation: OrdinaryAuthorityReceipt["operation"], id: string, head: OrdinaryAuthorityHead,
    digest: string, now: number, grantId: string | null): OrdinaryAuthorityReceipt {
    return frozen({ schema_version: "portal.ordinary-profile-operation.v1", operation_id: id, operation,
      workspace_id: head.workspace_id, head_revision: head.revision, head_digest: digest, grant_id: grantId,
      outcome: "APP_APPLIED", decided_at_ms: now, source_qualified: false, stream_commissioned: false, command_commissioned: false });
  }
  async install(input: VerifiedOrdinaryProfileInstall): Promise<OrdinaryAuthorityReceipt> {
    this.assertBinding();
    const prepared = verifiedInstalls.get(input);
    if (!prepared) return refuse("ORDINARY_AUTHORITY_INVALID", 503);
    const p = structuredClone(prepared), doc = p.document;
    const workspace = p.pin.target.workspace_id, requestDigest = accessDigest([doc, p.pin.approved_sha256]);
    const key = accessDigest([ORDINARY_AUTHORITY_SCHEMA, "INSTALL", workspace, doc.operation_id]);
    return this.mutations.executeVerified({ family: "REVIEWED_POLICY", operation: "INSTALL_POLICY",
      key_digest: key, request_digest: requestDigest, target_id: workspace }, {
      retain_after_application_rollback: true,
      acquire_fence: async () => ({ assertCurrent: () => assertWindow(p.pin, Date.now()), release: async () => undefined }),
      authorize: async db => { await this.installOn(db, p, key, requestDigest, false); },
      apply: async db => (await this.installOn(db, p, key, requestDigest, true))!,
      terminal: receipt => ({ outcome: "APPLIED", receipt_ref: receipt.operation_id, reason_code: null }),
    });
  }
  private async installOn(db: PoolClient, p: PreparedInstall, key: string, requestDigest: string,
    write: boolean): Promise<OrdinaryAuthorityReceipt | null> {
    const { document: doc, built, pin } = p, t = pin.target;
    await this.lock(db, t.workspace_id); await this.target(db, t);
    const repo = new OrdinaryProfileAuthorityRepository(db), prior = await repo.prior(t.workspace_id, key, requestDigest);
    if (prior) return prior; // historical ACK, never restore revoked grants
    const before = await repo.load(t.workspace_id), expected = doc.expected_head, now = await this.now(db);
    assertWindow(pin, now);
    if (before ? !expected || expected.revision !== before.head.revision || expected.digest !== before.digest ||
        doc.lifecycle.expected_current_sha256 !== before.head.artifact_sha256 || !same(before.head.target, t)
      : expected !== null || doc.lifecycle.operation !== "BOOTSTRAP") return refuse("ORDINARY_AUTHORITY_REVISION_CONFLICT");
    const artifact = built.artifact.document;
    const seals = [...(before?.head.profile_seals ?? []), ...(artifact.policy.manager_read_domains ?? [])];
    const uniqueSeals = [...new Map(seals.map(s => [accessDigest(s), s])).values()];
    const head = ordinaryAuthorityHead.parse({ schema_version: ORDINARY_AUTHORITY_SCHEMA, workspace_id: t.workspace_id,
      revision: `opa-${hash(key).slice(0, 48)}`, artifact_sha256: built.artifact.sha256,
      artifact_policy_revision: artifact.policy.revision, target: t, profile_seals: uniqueSeals });
    const added = artifact.manager_domain_grants.map(g => ordinaryProfileGrant.parse({
      schema_version: "portal.ordinary-profile-grant.v1", grant_id: g.grant_id, workspace_id: g.workspace_id,
      subject_user_id: g.subject_user_id, issued_by: g.issued_by, parent_grant_id: null, revision: g.revision,
      action: "business.read_all", delegable_actions: g.subject_user_id === t.protected_owner_user_id ||
        doc.administrator_user_ids.includes(g.subject_user_id) ? ["business.read_all"] : [],
      environment: g.environment, domain: g.domain, field_policy_ref: g.field_policy_ref,
      valid_from_ms: g.valid_from_ms, valid_until_ms: g.valid_until_ms,
    }));
    const grants = [...(before?.grants ?? []), ...added], revocations = before?.revocations ?? [];
    if (grants.length > ORDINARY_AUTHORITY_BOUND || new Set(grants.map(g => g.grant_id)).size !== grants.length)
      return refuse("ORDINARY_AUTHORITY_REVISION_CONFLICT");
    const digest = ordinaryAuthorityStateDigest(head, grants, revocations);
    if (!write) return null;
    for (const g of added) await repo.append(g);
    await repo.cas(before, head, digest);
    const receipt = this.receipt("INSTALL", `ope-${hash(key).slice(0, 48)}`, head, digest, now, null);
    await repo.event({ key, requestDigest, actor: t.protected_owner_user_id, subject: null,
      before: before && { revision: before.head.revision, digest: before.digest },
      after: { head, grants: added.map(g => ({ grant_id: g.grant_id, digest: accessDigest(g) })) }, receipt });
    assertWindow(pin, await this.now(db)); return receipt;
  }
  async delegate(actor: AccessActor, raw: OrdinaryDelegateRequest): Promise<OrdinaryAuthorityReceipt> {
    this.assertBinding();
    const request = ordinaryDelegateRequest.parse(raw);
    return this.authenticatedMutation(actor, "DELEGATE", request);
  }
  async revoke(actor: AccessActor, raw: OrdinaryRevokeRequest): Promise<OrdinaryAuthorityReceipt> {
    this.assertBinding();
    const request = ordinaryRevokeRequest.parse(raw);
    return this.authenticatedMutation(actor, "REVOKE", request);
  }
  /** Password proof only, not an authority grant. This uses the actor's own
   * real AuthService and current credential; no secret enters a digest/event.
   * Keeping it outside legacy AccessService avoids legacy policy_seen changes. */
  async stepUp(actor: AccessActor, workspace: string, password: string, auth: AuthService) {
    this.assertBinding();
    if (!(auth instanceof AuthService) || auth.pool !== this.pool || typeof password !== "string" ||
        password.length < 1 || password.length > 1024) return refuse("ORDINARY_AUTHORITY_DENIED", 403);
    const credential = await auth.credentials.findPassword(actor.user_id);
    const valid = credential ? await auth.argon2.verify(credential.passwordHash, password) : false;
    if (!credential) await auth.argon2.verifyAgainstDecoy();
    if (!valid) return refuse("ORDINARY_AUTHORITY_DENIED", 403);
    return withTransaction(this.pool, async db => {
      const c = await this.capture(db, actor, workspace);
      if (!c) return refuse("ORDINARY_AUTHORITY_DENIED", 403);
      const current = await new CredentialsRepository(db).findPassword(actor.user_id, true);
      if (!current || current.passwordHash !== credential!.passwordHash) return refuse("ORDINARY_AUTHORITY_DENIED", 403);
      c.now = await this.now(db);
      const administrator = c.state.grants.some(g => g.subject_user_id === actor.user_id && g.parent_grant_id === null &&
        g.delegable_actions.includes("business.read_all") && currentGrant(c, g) && ownerCovers(c, g));
      if (!administrator || c.now >= c.current.lease_until_ms) return refuse("ORDINARY_AUTHORITY_DENIED", 403);
      const expiry = await new AccountLifecycleRepository(db).grantStepUp({ stepUpId: randomId("stp"),
        sessionId: actor.session_id, userId: actor.user_id, ttlSeconds: auth.config.OWNER_STEP_UP_TTL_SECONDS, family: "ACCESS_ADMIN" });
      return frozen({ schema_version: "portal.access-step-up.v1" as const, state: "ACTIVE" as const,
        family: "ACCESS_ADMIN" as const, expires_at_ms: expiry.getTime() });
    });
  }
  private async authenticatedMutation(actor: AccessActor, operation: "DELEGATE" | "REVOKE",
    request: OrdinaryDelegateRequest | OrdinaryRevokeRequest): Promise<OrdinaryAuthorityReceipt> {
    const key = accessDigest([ORDINARY_AUTHORITY_SCHEMA, operation, request.workspace_id, actor.user_id, request.operation_id]);
    const digest = accessDigest([actor.user_id, operation, request]);
    let commitCheck = () => undefined;
    // execute() forwards the SAME hook object to the genuine coordinator.
    // This synchronous local time ceiling is not a fabricated source fence.
    const hooks: CurrentHumanVerifiedMutationHooks<OrdinaryAuthorityReceipt> = {
      retain_after_application_rollback: true,
      acquire_fence: async () => ({ assertCurrent: () => commitCheck(), release: async () => undefined }),
      authorize: async db => { await this.mutateOn(db, actor, operation, request, key, digest, false, check => { commitCheck = check; }); },
      apply: async db => (await this.mutateOn(db, actor, operation, request, key, digest, true, check => { commitCheck = check; }))!,
      terminal: receipt => ({ outcome: "APPLIED", receipt_ref: receipt.operation_id, reason_code: null }),
    };
    return this.mutations.execute({ family: "EXECUTION_ACCESS", operation: operation === "DELEGATE" ? "PROPOSE_GRANT" : "REVOKE_GRANT",
      actor_id: actor.user_id, session_id: actor.session_id, session_revision: actor.session_generation,
      key_digest: key, request_digest: digest, target_id: request.workspace_id }, hooks);
  }
  private async mutateOn(db: PoolClient, actor: AccessActor, operation: "DELEGATE" | "REVOKE",
    request: OrdinaryDelegateRequest | OrdinaryRevokeRequest, key: string, requestDigest: string,
    write: boolean, setCommitCheck: (check: () => undefined) => void): Promise<OrdinaryAuthorityReceipt | null> {
    const started = performance.now();
    const c = await this.capture(db, actor, request.workspace_id);
    if (!c) return refuse("ORDINARY_AUTHORITY_DENIED", 403);
    const step = await new AccountLifecycleRepository(db).lockActiveStepUpExpiry(actor.session_id, actor.user_id, ACCESS_STEP_UP_PROOFS);
    if (!step) return refuse("ORDINARY_AUTHORITY_DENIED", 403);
    const repo = new OrdinaryProfileAuthorityRepository(db), prior = await repo.prior(request.workspace_id, key, requestDigest);
    if (prior) return prior;
    if (request.expected_head.revision !== c.state.head.revision || request.expected_head.digest !== c.state.digest)
      return refuse("ORDINARY_AUTHORITY_REVISION_CONFLICT");
    let added: OrdinaryProfileGrant | null = null, revocation: Revocation | null = null;
    if (operation === "DELEGATE") {
      const r = request as OrdinaryDelegateRequest, parent = c.state.grants.find(g => g.grant_id === r.parent_grant_id);
      if (!parent || parent.revision !== r.expected_parent_revision) return refuse("ORDINARY_AUTHORITY_REVISION_CONFLICT");
      if (parent.subject_user_id !== actor.user_id || parent.parent_grant_id !== null || !currentGrant(c, parent) ||
          !ownerCovers(c, parent) || !parent.delegable_actions.includes("business.read_all") ||
          r.subject_user_id === actor.user_id || r.subject_user_id === c.state.head.target.protected_owner_user_id ||
          r.valid_from_ms < parent.valid_from_ms || r.valid_until_ms > parent.valid_until_ms || r.valid_until_ms <= c.now ||
          r.valid_until_ms - r.valid_from_ms > ACCESS_PROFILE_MAXIMUM_VALIDITY_MS ||
          !(await this.principals(db, r.workspace_id, [r.subject_user_id])).has(r.subject_user_id))
        return refuse("ORDINARY_AUTHORITY_DENIED", 403);
      added = ordinaryProfileGrant.parse({ ...parent, grant_id: `opg-${hash(key).slice(0, 48)}`,
        subject_user_id: r.subject_user_id, issued_by: actor.user_id, parent_grant_id: parent.grant_id,
        revision: `opgr-${hash(requestDigest).slice(0, 48)}`, delegable_actions: [],
        valid_from_ms: r.valid_from_ms, valid_until_ms: r.valid_until_ms });
      if (c.state.grants.length >= ORDINARY_AUTHORITY_BOUND) return refuse("ORDINARY_AUTHORITY_BOUND_EXCEEDED", 503);
    } else {
      const r = request as OrdinaryRevokeRequest, grant = c.state.grants.find(g => g.grant_id === r.grant_id);
      if (!grant || grant.revision !== r.expected_grant_revision) return refuse("ORDINARY_AUTHORITY_REVISION_CONFLICT");
      if (grant.subject_user_id === c.state.head.target.protected_owner_user_id ||
          actor.user_id !== c.state.head.target.protected_owner_user_id && (grant.issued_by !== actor.user_id ||
            !grant.parent_grant_id || !c.state.grants.some(p => p.grant_id === grant.parent_grant_id &&
              p.subject_user_id === actor.user_id && currentGrant(c, p) && p.delegable_actions.includes("business.read_all"))) ||
          c.state.revocations.some(v => v.grant_id === grant.grant_id)) return refuse("ORDINARY_AUTHORITY_DENIED", 403);
      revocation = { grant_id: grant.grant_id, revision: grant.revision, digest: accessDigest(grant) };
    }
    // Final clock after subject/step-up awaits; ancestors/session/proof must
    // still be current when this callback hands control back to COMMIT.
    c.now = await this.now(db);
    if (c.now >= step.getTime() || !await new SessionsRepository(db).lockActiveLease(actor.session_id, actor.user_id, actor.session_generation))
      return refuse("ORDINARY_AUTHORITY_DENIED", 403);
    if (added) {
      const parent = c.state.grants.find(g => g.grant_id === added!.parent_grant_id)!;
      if (!currentGrant(c, parent) || !ownerCovers(c, parent)) return refuse("ORDINARY_AUTHORITY_DENIED", 403);
    }
    const head = { ...c.state.head, revision: `opa-${hash(key).slice(0, 48)}` };
    const grants = added ? [...c.state.grants, added] : c.state.grants;
    const revocations = revocation ? [...c.state.revocations, revocation] : c.state.revocations;
    const digest = ordinaryAuthorityStateDigest(head, grants, revocations);
    const until = Math.min(step.getTime(), c.current.lease_until_ms,
      ...(added ? [temporalCeiling(c, added)] : []));
    const deadline = started + until - c.now;
    setCommitCheck(() => {
      if (performance.now() >= deadline || Date.now() >= until) refuse("ORDINARY_AUTHORITY_WINDOW_EXPIRED");
      return undefined;
    });
    if (!write) return null;
    if (added) await repo.append(added);
    await repo.cas(c.state, head, digest);
    const receipt = this.receipt(operation, `ope-${hash(key).slice(0, 48)}`, head, digest, c.now, added?.grant_id ?? revocation!.grant_id);
    await repo.event({ key, requestDigest, actor: actor.user_id, subject: added?.subject_user_id ??
      c.state.grants.find(g => g.grant_id === revocation!.grant_id)!.subject_user_id,
      before: { revision: c.state.head.revision, digest: c.state.digest },
      after: { ...(added ? { grant: added } : { revocation }), reason: request.reason, head_revision: head.revision }, receipt });
    const final = await this.now(db);
    if (final >= step.getTime() || final >= c.current.lease_until_ms || added && final >= temporalCeiling(c, added))
      return refuse("ORDINARY_AUTHORITY_WINDOW_EXPIRED");
    return receipt;
  }
}
