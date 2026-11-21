/** TEST_ONLY. A scripted in-memory stand-in for the few Core tables the Core009
 * owner tools touch, with a fake current-human coordinator. It is NOT PostgreSQL:
 * it models the contract the real tables enforce (immutable audit rows, unique
 * keys, write guard = "inside the coordinator's drain, outside a replay") so the
 * revoke / session-issuer logic and the READ/STREAM evaluators can be checked
 * against ONE shared state with no database. Real-PG behaviour stays in the
 * PostgreSQL-gated specs (NOT_RUN without TEST_DATABASE_URL). */
import { vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import { CurrentHumanLeaseError } from "../../src/execution-v2/current-human-candidate";
import { CurrentHumanMutationPending, type CurrentHumanMutations } from "../../src/execution-v2/current-human-mutations";
import { accessDigest } from "../../src/execution-v2/access-digest";

export interface FakeUser { user_id: string; username: string; status: "ACTIVE" | "DISABLED"; must_change_password: boolean; session_version: number; role: "ADMIN" | "USER"; archived_at: Date | null }
export interface FakeSession { session_id: string; session_token_hash: string; user_id: string; access_subject: string | null; state: "ACTIVE" | "REVOKED" | "EXPIRED";
  session_version: number; idle_expires_at: Date; absolute_expires_at: Date; revoke_reason: string | null; revoked_at: Date | null }
export interface WorldInput {
  now: number; database: { db: string; system: string; login: string }; owner: string; workspace: string;
  members: string[]; policy: unknown | null; grants: unknown[]; extraWorkspaces?: Record<string, unknown[]>;
  users?: FakeUser[]; sessions?: FakeSession[];
}
export class FakeCoreWorld {
  now: number;
  readonly database: { db: string; system: string; login: string; role: string };
  readonly owner: string; readonly workspace: string; readonly members: Set<string>;
  policy: unknown | null;
  /** All stored grants of ALL workspaces, grant_id -> fact (workspace is inside the fact). */
  grants = new Map<string, any>();
  events: Record<string, any>[] = [];
  audit: Record<string, any>[] = [];
  users = new Map<string, FakeUser>();
  sessions = new Map<string, FakeSession>();
  /** A reader (or another revoke) currently holds the workspace advisory lock. */
  advisoryHeldElsewhere = false;
  unresolvedObligations = 0;
  drain: string | null = null;
  mutationOpen = false; replayOnly = false;
  readonly writes: string[] = []; readonly advisoryKeys: string[] = [];
  readonly actorSession = { id: "TEST_ONLY-reader-session", version: 3 };
  private snapshot: null | { grants: string; events: string; audit: string; sessions: string } = null;
  readonly client: PoolClient; readonly pool: Pool;
  readonly coordinator: FakeCoordinator;

  constructor(input: WorldInput) {
    this.now = input.now; this.database = { ...input.database, role: input.database.login };
    this.owner = input.owner; this.workspace = input.workspace; this.members = new Set(input.members);
    this.policy = input.policy;
    for (const g of input.grants) this.grants.set((g as any).grant_id, structuredClone(g));
    for (const list of Object.values(input.extraWorkspaces ?? {})) for (const g of list) this.grants.set((g as any).grant_id, structuredClone(g));
    for (const u of input.users ?? [{ user_id: input.owner, username: "owner", status: "ACTIVE", must_change_password: false, session_version: 3, role: "ADMIN", archived_at: null }])
      this.users.set(u.user_id, u);
    this.sessions.set(this.actorSession.id, { session_id: this.actorSession.id, session_token_hash: "h", user_id: input.owner, access_subject: "dev-x",
      state: "ACTIVE", session_version: 3, idle_expires_at: new Date(this.now + 3_600_000), absolute_expires_at: new Date(this.now + 7_200_000), revoke_reason: null, revoked_at: null });
    for (const s of input.sessions ?? []) this.sessions.set(s.session_id, s);
    const query = async (sql: string, params?: unknown[]) => this.dispatch(sql.replace(/\s+/g, " ").trim(), params ?? []);
    this.client = { query: vi.fn(query), release: vi.fn() } as unknown as PoolClient;
    this.pool = { connect: vi.fn(async () => this.client), query: vi.fn(query) } as unknown as Pool;
    this.coordinator = new FakeCoordinator(this);
  }

  /** Grants visible to one workspace, as the repository returns them. */
  grantsOf(workspace: string): any[] { return [...this.grants.values()].filter(g => g.workspace_id === workspace).sort((a, b) => a.grant_id < b.grant_id ? -1 : 1); }
  get actor() { return { user_id: this.owner, session_id: this.actorSession.id, session_generation: this.actorSession.version }; }

  private guard(what: string): void {
    this.writes.push(what);
    if (this.replayOnly) throw new Error("CURRENT_HUMAN_MUTATION_REPLAY_WRITE_FORBIDDEN");
    if (!this.mutationOpen) throw new Error("CURRENT_HUMAN_DRAIN_COORDINATOR_REQUIRED");
    if (this.unresolvedObligations > 0) throw new Error("CURRENT_HUMAN_DRAIN_REQUIRED");
  }
  private lockHeld(): never { throw Object.assign(new Error("canceling statement due to lock timeout"), { code: "55P03" }); }

  private dispatch(sql: string, p: unknown[]): any {
    const rows = (r: any[]) => ({ rows: r, rowCount: r.length });
    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) {
      if (sql.startsWith("BEGIN")) this.snapshot = { grants: JSON.stringify([...this.grants]), events: JSON.stringify(this.events),
        audit: JSON.stringify(this.audit), sessions: JSON.stringify([...this.sessions]) };
      if (sql.startsWith("ROLLBACK") && this.snapshot) {
        this.grants = new Map(JSON.parse(this.snapshot.grants)); this.events = JSON.parse(this.snapshot.events);
        this.audit = JSON.parse(this.snapshot.audit);
        this.sessions = new Map((JSON.parse(this.snapshot.sessions) as [string, any][]).map(([k, v]) => [k, { ...v, idle_expires_at: new Date(v.idle_expires_at), absolute_expires_at: new Date(v.absolute_expires_at) }]));
      }
      if (!sql.startsWith("BEGIN")) this.snapshot = null;
      return rows([]);
    }
    if (/^SET /.test(sql)) return rows([]);
    if (/SHOW transaction_isolation/.test(sql)) return rows([{ transaction_isolation: "read committed" }]);
    if (/SHOW transaction_read_only/.test(sql)) return rows([{ transaction_read_only: "off" }]);
    if (/txid_current\(\)::text AS xid, floor/.test(sql)) return rows([{ xid: "7", ms: String(this.now) }]);
    if (/txid_current\(\)::text AS xid/.test(sql)) return rows([{ xid: "7" }]);
    if (/FROM elp210_candidate\.authority WHERE singleton FOR UPDATE/.test(sql)) return rows([{ singleton: true }]);
    if (/pg_try_advisory_xact_lock/.test(sql)) { this.advisoryKeys.push(String(p[0])); return rows([{ acquired: !this.advisoryHeldElsewhere }]); }
    if (/pg_advisory_xact_lock\(/.test(sql)) { this.advisoryKeys.push(String(p[0])); if (this.advisoryHeldElsewhere) this.lockHeld(); return rows([]); }
    if (/current_database\(\)/.test(sql)) return rows([{ db: this.database.db, login: this.database.login, role: this.database.role, system_identifier: this.database.system }]);
    if (/FROM portal_owner_anchor/.test(sql)) return rows([{ user_id: this.owner }]);
    if (/FROM portal_users u WHERE u\.user_id=ANY|FROM portal_users u\s*WHERE u\.user_id=ANY/.test(sql)) return rows((p[0] as string[]).filter(id => this.users.get(id)?.status === "ACTIVE").map(user_id => ({ user_id })));
    if (/^SELECT workspace_id FROM workspaces/.test(sql) || /^SELECT 1 FROM workspaces/.test(sql)) return rows([{ workspace_id: p[0] }]);
    if (/FROM workspace_members WHERE workspace_id=\$1 AND user_id=\$2/.test(sql)) return this.members.has(String(p[1])) ? rows([{ user_id: p[1] }]) : rows([]);
    if (/SELECT 1 FROM workspace_members/.test(sql)) return this.members.has(String(p[1])) ? rows([{ "?column?": 1 }]) : rows([]);
    if (/FROM workspace_members WHERE workspace_id=\$1 AND user_id=ANY/.test(sql)) return rows((p[1] as string[]).filter(id => this.members.has(id)).map(user_id => ({ user_id })));
    if (/FROM portal_access_policy_state WHERE workspace_id=\$1/.test(sql)) return rows(this.policy && p[0] === this.workspace ? [{ policy: this.policy }] : []);
    if (/FROM portal_access_grants_v2 WHERE workspace_id=\$1/.test(sql)) return rows(this.grantsOf(String(p[0])).map(grant_fact => ({ grant_fact })));
    if (/^UPDATE portal_access_grants_v2 SET revision=\$2,grant_fact=\$3::jsonb WHERE grant_id=\$1/.test(sql)) {
      this.guard("UPDATE portal_access_grants_v2");
      if (!this.grants.has(String(p[0]))) return rows([]);
      this.grants.set(String(p[0]), JSON.parse(String(p[2])));
      return { rows: [], rowCount: 1 };
    }
    if (/FROM portal_access_policy_events WHERE workspace_id=\$1 AND key_digest=\$2/.test(sql))
      return rows(this.events.filter(e => e.workspace_id === p[0] && e.key_digest === p[1]));
    if (/FROM portal_access_policy_events WHERE workspace_id=\$1 AND policy_revision=\$2 AND operation='POLICY_INSTALL'/.test(sql))
      return rows(this.events.filter(e => e.workspace_id === p[0] && e.policy_revision === p[1] && e.operation === "POLICY_INSTALL"));
    if (/^INSERT INTO portal_access_policy_events/.test(sql)) {
      this.guard("INSERT portal_access_policy_events");
      const [event_id, workspace_id, actor_user_id, subject_user_id, operation, key_digest, request_digest, policy_revision, grant_id, proposal_id,
        source, source_receipt_id, before, after, receipt] = p as string[];
      if (this.events.some(e => e.workspace_id === workspace_id && e.key_digest !== null && e.key_digest === key_digest) ||
        this.events.some(e => e.source !== null && e.source === source && e.source_receipt_id === source_receipt_id))
        throw Object.assign(new Error("duplicate key"), { code: "23505" });
      this.events.push({ event_id, workspace_id, actor_user_id, subject_user_id, operation, key_digest, request_digest, policy_revision, grant_id, proposal_id,
        source, source_receipt_id, before_fact: JSON.parse(before ?? "null"), after_fact: JSON.parse(after ?? "null"), receipt: JSON.parse(receipt!), occurred_at: new Date(this.now) });
      return { rows: [], rowCount: 1 };
    }
    // ---- installer (fresh-policy-only) statements
    if (/^SELECT user_id,status,must_change_password,archived_at FROM portal_users WHERE user_id=ANY/.test(sql))
      return rows((p[0] as string[]).map(id => this.users.get(id)).filter(Boolean).map(u => ({ user_id: u!.user_id, status: u!.status,
        must_change_password: u!.must_change_password, archived_at: u!.archived_at })));
    if (/^INSERT INTO portal_access_policy_state/.test(sql)) { this.guard("INSERT portal_access_policy_state"); this.policy = JSON.parse(String(p[2])); return { rows: [], rowCount: 1 }; }
    if (/^INSERT INTO portal_access_grants_v2/.test(sql)) {
      this.guard("INSERT portal_access_grants_v2");
      if (this.grants.has(String(p[0]))) throw Object.assign(new Error("duplicate key"), { code: "23505" });
      this.grants.set(String(p[0]), JSON.parse(String(p[6]))); return { rows: [], rowCount: 1 };
    }
    if (/^UPDATE portal_access_events|^DELETE FROM portal_access_policy_events/.test(sql)) throw new Error("Portal access audit receipts are immutable");
    // ---- auth tables (snapshot + acceptance session)
    if (/FROM portal_users u JOIN auth_sessions s ON s\.user_id=u\.user_id/.test(sql)) {
      const [user, version, session] = p as [string, number, string];
      const u = this.users.get(user), s = this.sessions.get(session);
      if (!u || !s || u.status !== "ACTIVE" || u.session_version !== version || s.state !== "ACTIVE" || s.session_version !== version) return rows([]);
      return rows([{ user_id: u.user_id, session_version: u.session_version, role: u.role,
        lease_until_ms: String(Math.min(s.idle_expires_at.getTime(), s.absolute_expires_at.getTime())) }]);
    }
    if (/FROM portal_users WHERE user_id = \$1 FOR UPDATE/.test(sql) || /^SELECT \* FROM portal_users WHERE user_id = \$1/.test(sql)) {
      const u = this.users.get(String(p[0]));
      return rows(u ? [{ ...u, display_name: u.username, failed_login_count: 0, locked_until: null, created_at: new Date(0), updated_at: new Date(0), disabled_at: null, account_revision: 1 }] : []);
    }
    if (/FROM auth_sessions WHERE session_id=\$1 AND user_id=\$2 AND session_version=\$3 AND state='ACTIVE'/.test(sql)) {
      const s = this.sessions.get(String(p[0]));
      return s && s.user_id === p[1] && s.session_version === p[2] && s.state === "ACTIVE" && s.absolute_expires_at.getTime() > this.now && s.idle_expires_at.getTime() > this.now ? rows([{ session_id: s.session_id }]) : rows([]);
    }
    if (/FROM portal_users WHERE user_id=ANY\(\$1::text\[\]\) FOR SHARE NOWAIT/.test(sql)) return rows((p[0] as string[]).map(user_id => ({ user_id })));
    if (/floor\(extract\(epoch FROM clock_timestamp\(\)\)\*1000\)::bigint AS ms/.test(sql)) return rows([{ ms: String(this.now) }]);
    if (/^SELECT clock_timestamp\(\) AS now/.test(sql)) return rows([{ now: new Date(this.now) }]);
    if (/FROM auth_sessions WHERE user_id=\$1 AND access_subject=\$2 AND state='ACTIVE'/.test(sql))
      return rows([...this.sessions.values()].filter(s => s.user_id === p[0] && s.access_subject === p[1] && s.state === "ACTIVE" && s.absolute_expires_at.getTime() > this.now));
    if (/FROM auth_sessions WHERE session_id=\$1 FOR UPDATE/.test(sql)) { const s = this.sessions.get(String(p[0])); return rows(s ? [{ ...s }] : []); }
    if (/^INSERT INTO auth_sessions/.test(sql)) {
      this.guard("INSERT auth_sessions");
      const [session_id, session_token_hash, user_id, access_subject, , , , session_version, idle, absolute] = p as any[];
      this.sessions.set(session_id, { session_id, session_token_hash, user_id, access_subject, state: "ACTIVE", session_version, idle_expires_at: idle, absolute_expires_at: absolute, revoke_reason: null, revoked_at: null });
      return rows([{ session_id }]);
    }
    if (/^UPDATE auth_sessions SET state = 'REVOKED'/.test(sql) && /WHERE session_id = \$1/.test(sql)) {
      this.guard("UPDATE auth_sessions");
      const s = this.sessions.get(String(p[0]));
      if (s) { s.state = "REVOKED"; s.revoked_at = new Date(this.now); s.revoke_reason = String(p[1]); }
      return { rows: [], rowCount: s ? 1 : 0 };
    }
    if (/^INSERT INTO auth_audit_events/.test(sql)) {
      this.audit.push({ event_type: p[1], actor_user_id: p[2], target_user_id: p[3], access_subject: p[4], result: p[8], reason_code: p[9], metadata: p[10] ? JSON.parse(String(p[10])) : null });
      return { rows: [], rowCount: 1 };
    }
    throw new Error("FAKE_WORLD_UNSCRIPTED_QUERY: " + sql.slice(0, 160));
  }

  /** Seed a second readable actor session (e.g. an unrelated normal session of the same user). */
  addSession(s: Partial<FakeSession> & { session_id: string; user_id: string }): FakeSession {
    const full: FakeSession = { session_token_hash: "x", access_subject: "dev-x", state: "ACTIVE", session_version: 3,
      idle_expires_at: new Date(this.now + 3_600_000), absolute_expires_at: new Date(this.now + 7_200_000), revoke_reason: null, revoked_at: null, ...s };
    this.sessions.set(full.session_id, full);
    return full;
  }
}

/** Mirrors CurrentHumanMutations.executeVerified for what these tools depend on: authorize BEFORE
 * any intent exists (so a predictable refusal never strands a drain), a durable intent per key,
 * the write guard open only for apply, exact replay in replay-only mode, key conflicts, and a
 * pending-custody gate. Not the real coordinator (real PG: elp210-current-human-candidate). */
export class FakeCoordinator {
  readonly calls: { family: string; operation: string; key: string }[] = [];
  readonly intents = new Map<string, { request: string; state: "PENDING" | "FINISHED"; terminal: string | null }>();
  constructor(private readonly world: FakeCoreWorld) {}
  usesPool(pool: Pool): boolean { return pool === this.world.pool; }
  asMutations(): CurrentHumanMutations { return this as unknown as CurrentHumanMutations; }
  async executeVerified<T>(binding: any, hooks: any): Promise<T> {
    const w = this.world, client = w.client;
    this.calls.push({ family: binding.family, operation: binding.operation, key: binding.key_digest });
    const prior = this.intents.get(binding.key_digest);
    if (prior && prior.request !== binding.request_digest) throw new CurrentHumanLeaseError("CURRENT_HUMAN_MUTATION_KEY_CONFLICT");
    await client.query("BEGIN");
    try {
      if (binding.family !== "VERIFIED_AUTH_ISSUANCE" || !prior) await hooks.authorize(client);
      if (!prior) {
        if (w.drain) throw new CurrentHumanLeaseError("CURRENT_HUMAN_DRAIN_CONFLICT");
        if (w.unresolvedObligations > 0) throw new CurrentHumanMutationPending("m-fake", "DRAIN_PENDING");
        this.intents.set(binding.key_digest, { request: binding.request_digest, state: "PENDING", terminal: null });
        w.drain = binding.key_digest;
      }
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    await client.query("BEGIN");
    try {
      const intent = this.intents.get(binding.key_digest)!;
      const replay = intent.state === "FINISHED";
      if (replay) w.replayOnly = true; else w.mutationOpen = true;
      await hooks.authorize(client); // the real coordinator re-authorizes in the applying transaction
      const result = await hooks.apply(client);
      const terminal = accessDigest(hooks.terminal(result));
      if (replay && intent.terminal !== terminal) throw new CurrentHumanLeaseError("CURRENT_HUMAN_MUTATION_RECEIPT_MISMATCH");
      if (!replay) { intent.state = "FINISHED"; intent.terminal = terminal; w.drain = null; }
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { w.mutationOpen = false; w.replayOnly = false; }
  }
}
