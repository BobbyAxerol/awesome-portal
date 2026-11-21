/** Real disposable Core PostgreSQL + ephemeral TEST_ONLY Ed25519 trust. This
 * proves candidate ordering/guards, NOT installed PM/Portal authority or G2. */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { decodeJwt, generateKeyPair, SignJWT } from "jose";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CurrentHumanCandidate, CurrentHumanLeaseError, type CurrentHumanCandidateConfig, type CurrentHumanBinding } from "../src/execution-v2/current-human-candidate";
import { CurrentHumanMutations, type CurrentHumanMutationBinding } from "../src/execution-v2/current-human-mutations";
import { accessDigest } from "../src/execution-v2/access-policy";
import { captureCurrentHumanSnapshot } from "../src/execution-v2/current-human-snapshot";
import { withTransaction } from "../src/db/pool";
import type { AccessActor } from "../src/execution-v2/access.contract";
import { migrateTestDatabase } from "./harness";
import { FinancialSourceAssertionAuthority } from "../src/execution-v2/financial-source-assertion";
import { pmHttpRequestDigest } from "../src/execution-v2/pm-http-request-binding";
import { CoreRestoreQuiescence, newRestoreDrainId } from "../src/execution-v2/restore-core-quiescence";

const database = process.env.TEST_DATABASE_URL;
describe.skipIf(!database)("ELP2-10 unmounted authentic-human candidate, real Core DB", () => {
  let pool: Pool, candidate: CurrentHumanCandidate, config: CurrentHumanCandidateConfig;
  let sourceKey: Awaited<ReturnType<typeof generateKeyPair>>, humanKey: Awaited<ReturnType<typeof generateKeyPair>>;
  let actor: AccessActor, binding: CurrentHumanBinding, suffix: string;
  const proof = async (lease: string, phase: "ENTER" | "COMMITTED" | "ROLLED_BACK" | "UNKNOWN" = "ENTER",
    changes: Record<string, unknown> = {}, signer = sourceKey.privateKey) => {
    const now = Math.floor(Date.now() / 1000), terminal = phase === "COMMITTED" || phase === "ROLLED_BACK";
    return new SignJWT({ iss: config.source.issuer, aud: config.source.audience, sub: config.source.workload_id,
      jti: randomUUID(), iat: now, nbf: now, exp: now + 60, purpose: "pma.current-human-lease.v1",
      lease_id: lease, attempt_id: `test-only-attempt-${lease}`, ...binding, phase,
      source_receipt_id: terminal ? `test-only-terminal-${lease}` : null,
      source_receipt_digest: terminal ? `sha256:${"a".repeat(64)}` : null, ...changes,
    }).setProtectedHeader({ alg: "EdDSA", kid: config.source.key_id, typ: "JWT" }).sign(signer);
  };
  const state = async () => (await pool.query("SELECT * FROM elp210_candidate.authority WHERE singleton")).rows[0];
  const phase = async (lease: string) => (await pool.query("SELECT phase FROM elp210_candidate.leases WHERE lease_id=$1", [lease])).rows[0].phase;
  const enter = async () => {
    const lease = await candidate.issue(actor, binding);
    await candidate.enter(lease.token, await proof(lease.lease_id));
    return lease;
  };
  const mutation = (): CurrentHumanMutationBinding => ({ family: "AUTH_SESSION", operation: "REVOKE_SESSION",
    actor_id: actor.user_id, session_id: actor.session_id, session_revision: 7,
    key_digest: accessDigest(["TEST_ONLY", suffix]), request_digest: accessDigest({ target: `test-only-target-${suffix}` }),
    target_id: `test-only-target-${suffix}` });
  const mutationFixture = async (session = actor.session_id) => {
    await pool.query("CREATE TABLE IF NOT EXISTS elp210_candidate.test_receipts(receipt_id text PRIMARY KEY)");
    await pool.query(`INSERT INTO auth_sessions(session_id,session_token_hash,user_id,state,csrf_secret_hash,
      session_version,idle_expires_at,absolute_expires_at) VALUES($1,$1,$2,'ACTIVE','TEST_ONLY',7,
      clock_timestamp()+interval '10 minutes',clock_timestamp()+interval '20 minutes') ON CONFLICT DO NOTHING`,
    [`test-only-target-${suffix}`, actor.user_id]);
    return {
      authorize: async (db: import("pg").PoolClient) => {
        const result = await db.query(`SELECT s.session_id FROM auth_sessions s JOIN portal_users u ON u.user_id=s.user_id
          WHERE s.session_id=$1 AND u.user_id=$2 AND s.state='ACTIVE' AND u.status='ACTIVE'
          AND s.session_version=7 AND u.session_version=7
          AND s.idle_expires_at>clock_timestamp() AND s.absolute_expires_at>clock_timestamp()`, [session, actor.user_id]);
        if (!result.rowCount) throw new CurrentHumanLeaseError("CURRENT_ACTOR_AUTHORITY_REQUIRED");
      },
      apply: vi.fn(async (db: import("pg").PoolClient) => {
        if (!(await db.query("SELECT receipt_id FROM elp210_candidate.test_receipts WHERE receipt_id=$1", [suffix])).rowCount) {
          await db.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id=$1", [`test-only-target-${suffix}`]);
          await db.query("INSERT INTO elp210_candidate.test_receipts VALUES($1)", [suffix]);
        }
        return { receipt: suffix };
      }),
      terminal: (result: { receipt: string }) => ({ outcome: "APPLIED" as const, receipt_ref: result.receipt, reason_code: null }),
    };
  };
  const coordinator = (recover: (attempt: Awaited<ReturnType<CurrentHumanCandidate["recoverableAttempts"]>>[number]) => Promise<unknown>) =>
    new CurrentHumanMutations(pool, candidate, { recover }, { maximum_intents: 8, maximum_recoveries_per_request: 3 });

  beforeAll(async () => {
    await migrateTestDatabase(database!);
    pool = new Pool({ connectionString: database, max: 3, connectionTimeoutMillis: 2000, query_timeout: 6000 });
    [sourceKey, humanKey] = await Promise.all([generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true }),
      generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true })]);
  });
  beforeEach(async () => {
    suffix = randomUUID();
    actor = { user_id: `test-only-human-${suffix}`, session_id: `test-only-session-${suffix}`, session_generation: 7 };
    binding = { workspace_id: `test-only-workspace-${suffix}`, environment: "paper", workload_id: "test-only-pm-provider",
      request_digest: `sha256:${"b".repeat(64)}` };
    await pool.query(`INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password,session_version)
      VALUES($1,$1,'TEST_ONLY','USER','ACTIVE',false,7)`, [actor.user_id]);
    await pool.query(`INSERT INTO auth_sessions(session_id,session_token_hash,user_id,state,csrf_secret_hash,
      session_version,idle_expires_at,absolute_expires_at) VALUES($1,$1,$2,'ACTIVE','TEST_ONLY',7,
      clock_timestamp()+interval '10 minutes',clock_timestamp()+interval '20 minutes')`, [actor.session_id, actor.user_id]);
    await pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY',$2)", [binding.workspace_id, actor.user_id]);
    await pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'OWNER')", [binding.workspace_id, actor.user_id]);
    await pool.query(`INSERT INTO external_identity_bindings(binding_id,user_id,provider,issuer,subject,normalized_email)
      VALUES($1,$2,'cloudflare_access','TEST_ONLY',$1,$3)`, [suffix, actor.user_id, `${suffix}@example.invalid`]);
    await pool.query(await readFile(join(__dirname, "../src/execution-v2/current-human-candidate.sql"), "utf8"));
    config = { issuer: "test-only-portal", audience: "test-only-pm", key_id: "test-only-human-key", private_key: humanKey.privateKey,
      source: { issuer: "test-only-source", audience: "test-only-portal-authority", key_id: "test-only-source-key",
        public_key: sourceKey.publicKey, workload_id: binding.workload_id },
      limits: { ttl_ms: 30_000, maximum_unresolved: 3, maximum_retained: 10 } };
    candidate = await CurrentHumanCandidate.create(pool, config);
  });
  afterEach(async () => {
    // Exact isolated candidate schema; CASCADE removes only its own dependency
    // triggers, not the public identity tables or unrelated runtime records.
    await pool.query("DROP SCHEMA IF EXISTS elp210_candidate CASCADE");
    await pool.query("DELETE FROM workspaces WHERE workspace_id=$1", [binding.workspace_id]);
    await pool.query("DELETE FROM portal_users WHERE user_id=$1", [actor.user_id]);
  });
  afterAll(async () => { await pool?.end(); });

  it("issues genuine PM-purpose Ed25519 identity from current user/session, without role/business grants", async () => {
    const lease = await candidate.issue(actor, binding), body = decodeJwt(lease.token);
    expect(body).toMatchObject({ purpose: "pma.identity.v1", principal_kind: "human", sub: actor.user_id,
      sid: actor.session_id, session_revision: 7, authority_revision: 0, ...binding });
    expect(body).not.toHaveProperty("roles"); expect(body).not.toHaveProperty("scopes");
    expect(pool.idleCount).toBe(pool.totalCount);
    await candidate.enter(lease.token, await proof(lease.lease_id));
    expect(await phase(lease.lease_id)).toBe("ENTERED");
  });
  it("restore quiescence reconciles the same entered original on disposable PostgreSQL without authorizing cutover", async () => {
    const lease = await enter();
    const drain = newRestoreDrainId();
    const recovery = new CoreRestoreQuiescence(pool, candidate);
    const attempt = `test-only-attempt-${lease.lease_id}`;
    expect(await recovery.open(drain)).toMatchObject({ state: "CORE_ONLY_NO_CUTOVER", local_drain: "DRAIN_PENDING", unresolved_count: 1 });
    await expect(recovery.reconcileOriginal(drain, lease.lease_id, "test-only-wrong-attempt", await proof(lease.lease_id, "COMMITTED")))
      .rejects.toThrow("V2_RESTORE_TERMINAL_ROUTING_INVALID");
    await expect(recovery.reconcileOriginal(drain, lease.lease_id, attempt, await proof(lease.lease_id, "COMMITTED", {}, humanKey.privateKey)))
      .rejects.toThrow();
    expect(await phase(lease.lease_id)).toBe("ENTERED");
    expect(await recovery.reconcileOriginal(drain, lease.lease_id, attempt, await proof(lease.lease_id, "UNKNOWN")))
      .toMatchObject({ terminal: "UNKNOWN", progress: { local_drain: "DRAIN_UNKNOWN", unresolved_count: 1 } });
    const restarted = new CoreRestoreQuiescence(pool, await CurrentHumanCandidate.create(pool, config));
    expect(await restarted.status(drain)).toMatchObject({ local_drain: "DRAIN_UNKNOWN", unresolved_count: 1 });
    const terminal = await proof(lease.lease_id, "COMMITTED");
    expect(await restarted.reconcileOriginal(drain, lease.lease_id, attempt, terminal)).toMatchObject({ terminal: "CORE_RECORDED",
      progress: { state: "CORE_ONLY_NO_CUTOVER", local_drain: "DRAIN_READY", unresolved_count: 0, independent_checkpoint: "NOT_VERIFIED", old_holder_fence: "NOT_VERIFIED", post_snapshot_ack_coverage: "NOT_VERIFIED" } });
    expect(await recovery.reconcileOriginal(drain, lease.lease_id, attempt, terminal)).toMatchObject({ terminal: "CORE_REPLAYED" });
    await expect(candidate.issue(actor, binding)).rejects.toThrow();
  });
  it("fences same-lease financial identity delivery without allocating a second lease", async () => {
    const lease = await candidate.issue(actor, binding);
    await candidate.revalidateIssue(actor, binding, lease);
    await candidate.revalidateIssue(actor, binding, lease);
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_candidate.leases")).rows[0].n).toBe(1);
    await expect(candidate.revalidateIssue(actor, { ...binding, request_digest: `sha256:${"f".repeat(64)}` }, lease))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_ENTRY_NOT_AVAILABLE" });
    await candidate.enter(lease.token, await proof(lease.lease_id));
    await expect(candidate.revalidateIssue(actor, binding, lease)).rejects.toMatchObject({ code: "CURRENT_HUMAN_ENTRY_NOT_AVAILABLE" });
    expect(await phase(lease.lease_id)).toBe("ENTERED");
  });
  it("does not return a cached identity after real session revoke or authority drain", async () => {
    const lease = await candidate.issue(actor, binding);
    // Respect the actual authority writer: raw revoke is forbidden while an
    // issued lease exists. Drain retires the unused original before mutation.
    await expect(candidate.beginDrain("TEST_ONLY-financial-revoke")).resolves.toMatchObject({ status: "DRAIN_READY" });
    await expect(candidate.revalidateIssue(actor, binding, lease)).rejects.toMatchObject({ code: "CURRENT_HUMAN_ENTRY_NOT_AVAILABLE" });
    await pool.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id=$1", [actor.session_id]);
    await candidate.endDrain("TEST_ONLY-financial-revoke", 1);
    await expect(candidate.revalidateIssue(actor, binding, lease)).rejects.toThrow();
    await expect(candidate.issue(actor, binding)).rejects.toMatchObject({ code: "CURRENT_ACTOR_AUTHORITY_REQUIRED" });
    expect(await phase(lease.lease_id)).toBe("RETIRED");
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_candidate.leases")).rows[0].n).toBe(1);
  });
  it.each(["COMMITTED", "ROLLED_BACK"] as const)("proves original %s custody before a distinct financial read without changing the old lease", async terminal => {
    const lease = await candidate.issue(actor, binding);
    expect(await candidate.canReplaceResolvedIssue(actor, binding, lease)).toBe(false);
    await candidate.enter(lease.token, await proof(lease.lease_id));
    await expect(candidate.canReplaceResolvedIssue(actor, binding, lease))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_ENTRY_NOT_AVAILABLE" });
    await candidate.resolve(await proof(lease.lease_id, "UNKNOWN"));
    await expect(candidate.canReplaceResolvedIssue(actor, binding, lease))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_ENTRY_NOT_AVAILABLE" });
    await candidate.resolve(await proof(lease.lease_id, terminal));
    const before = (await pool.query("SELECT * FROM elp210_candidate.leases WHERE lease_id=$1", [lease.lease_id])).rows[0];
    expect(before).toMatchObject({ phase: terminal, attempt_id: `test-only-attempt-${lease.lease_id}` });
    expect(before.terminal_receipt_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(await candidate.canReplaceResolvedIssue(actor, binding, lease)).toBe(true);
    const replacement=await generateKeyPair("EdDSA",{crv:"Ed25519",extractable:true});
    const otherTrust=await CurrentHumanCandidate.create(pool,{...config,source:{...config.source,public_key:replacement.publicKey}});
    await expect(otherTrust.canReplaceResolvedIssue(actor,binding,lease))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_ENTRY_NOT_AVAILABLE"});
    await expect(candidate.canReplaceResolvedIssue(actor, { ...binding, request_digest: `sha256:${"f".repeat(64)}` }, lease))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_ENTRY_NOT_AVAILABLE" });
    expect((await pool.query("SELECT * FROM elp210_candidate.leases WHERE lease_id=$1", [lease.lease_id])).rows[0]).toEqual(before);
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_candidate.leases")).rows[0].n).toBe(1);
    await candidate.beginDrain("TEST_ONLY-terminal-financial-drain");
    await expect(candidate.canReplaceResolvedIssue(actor, binding, lease))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_ENTRY_NOT_AVAILABLE" });
    await pool.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id=$1", [actor.session_id]);
    await candidate.endDrain("TEST_ONLY-terminal-financial-drain", 1);
    await expect(candidate.canReplaceResolvedIssue(actor, binding, lease)).rejects.toThrow();
  });
  it("durably fences concurrent and restarted STATUS issues until exact terminal plus Edge ACK", async () => {
    const restarted=await CurrentHumanCandidate.create(pool,config);
    const link = { context_digest: accessDigest(`TEST_ONLY:context-${suffix}`), context_nonce:"a".repeat(43),
      original_digest: accessDigest("TEST_ONLY:original"), call_digest: accessDigest("TEST_ONLY:call"),
      binding_digest: accessDigest("TEST_ONLY:binding"), receiver_id: "TEST_ONLY:edge",
      authority_fingerprint: accessDigest("TEST_ONLY:authority"), delivery_sequence: 0, previous_lease_id: null,
      context_expires_at_ms: Date.now()+90000, status_token_digest:accessDigest("TEST_ONLY:status-token"),
      status_request_digest:accessDigest("TEST_ONLY:status-request"),status_issued_at_ms:Math.floor(Date.now()/1000)*1000 };
    await expect(candidate.issueCommandStatus(actor,binding,undefined as never))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_COMMAND_STATUS_LINK_INVALID"});
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_candidate.leases")).rows[0].n).toBe(0);
    const freshActor={...actor,session_id:`test-only-relogin-${suffix}`};
    await pool.query(`INSERT INTO auth_sessions(session_id,session_token_hash,user_id,state,csrf_secret_hash,
      session_version,idle_expires_at,absolute_expires_at) VALUES($1,$1,$2,'ACTIVE','TEST_ONLY',7,
      clock_timestamp()+interval '10 minutes',clock_timestamp()+interval '20 minutes')`,[freshActor.session_id,actor.user_id]);
    const attempts=await Promise.allSettled([
      candidate.issueCommandStatus(actor,binding,link),restarted.issueCommandStatus(actor,binding,link),
    ]);
    const accepted=attempts.find(value=>value.status==="fulfilled");
    const refused=attempts.find(value=>value.status==="rejected");
    expect(attempts.filter(value=>value.status==="fulfilled")).toHaveLength(1);
    expect(refused).toMatchObject({status:"rejected",reason:{code:"CURRENT_HUMAN_COMMAND_STATUS_RECOVERY_REQUIRED"}});
    if(!accepted || accepted.status!=="fulfilled")throw new Error("TEST_ONLY:no accepted status lease");
    const lease=accepted.value,reply=accessDigest("TEST_ONLY:verified exact Edge response");
    await expect(restarted.issueCommandStatus(freshActor,binding,link))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_COMMAND_STATUS_RECOVERY_REQUIRED"});
    await expect(restarted.acknowledgeCommandStatusIssue(actor,binding,lease,reply))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_ENTRY_NOT_AVAILABLE"});
    await candidate.enter(lease.token,await proof(lease.lease_id));
    await candidate.resolve(await proof(lease.lease_id,"UNKNOWN"));
    await expect(restarted.issueCommandStatus(actor,binding,link))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_COMMAND_STATUS_RECOVERY_REQUIRED"});
    await candidate.resolve(await proof(lease.lease_id,"COMMITTED"));
    const replacement=await generateKeyPair("EdDSA",{crv:"Ed25519",extractable:true});
    const otherTrust=await CurrentHumanCandidate.create(pool,{...config,source:{...config.source,public_key:replacement.publicKey}});
    await expect(otherTrust.acknowledgeCommandStatusIssue(actor,binding,lease,reply))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_ENTRY_NOT_AVAILABLE"});
    // Source terminal is not delivery acknowledgement.
    await expect(restarted.issueCommandStatus(actor,binding,link))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_COMMAND_STATUS_RECOVERY_REQUIRED"});
    expect(await restarted.acknowledgeCommandStatusIssue(actor,binding,lease,reply)).toBe(true);
    expect(await candidate.acknowledgeCommandStatusIssue(actor,binding,lease,reply)).toBe(true);
    await expect(candidate.acknowledgeCommandStatusIssue(actor,binding,lease,accessDigest("TEST_ONLY:other response")))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_COMMAND_STATUS_ACK_MISMATCH"});
    await expect(pool.query("UPDATE execution_command_status_delivery_acks SET response_digest=$2 WHERE lease_id=$1",
      [lease.lease_id,accessDigest("TEST_ONLY:other response")])).rejects.toThrow("COMMAND_STATUS_DELIVERY_ACK_IMMUTABLE");
    await expect(pool.query("DELETE FROM execution_command_status_delivery_acks WHERE lease_id=$1",[lease.lease_id]))
      .rejects.toThrow("COMMAND_STATUS_DELIVERY_ACK_IMMUTABLE");
    const next=await restarted.issueCommandStatus(actor,binding,{...link,
      context_digest:accessDigest(`TEST_ONLY:next-context-${suffix}`),context_nonce:"b".repeat(43)});
    expect(next.lease_id).not.toBe(lease.lease_id);
  });
  it("keeps a pre-existing unlinked lease fenced rather than replacing or rewriting it", async () => {
    // Simulate only the historical storage shape using the generic issuer;
    // the STATUS writer must no longer be able to create that shape itself.
    const legacy = await candidate.issue(actor, binding);
    const before = (await pool.query("SELECT * FROM elp210_candidate.leases WHERE lease_id=$1", [legacy.lease_id])).rows[0];
    const link = { context_digest: accessDigest(`TEST_ONLY:context-${suffix}`), context_nonce:"a".repeat(43),
      original_digest: accessDigest("TEST_ONLY:original"), call_digest: accessDigest("TEST_ONLY:call"),
      binding_digest: accessDigest("TEST_ONLY:binding"), receiver_id: "TEST_ONLY:edge",
      authority_fingerprint: accessDigest("TEST_ONLY:authority"), delivery_sequence: 0, previous_lease_id: null,
      context_expires_at_ms: Date.now()+90000, status_token_digest:accessDigest("TEST_ONLY:status-token"),
      status_request_digest:accessDigest("TEST_ONLY:status-request"),status_issued_at_ms:Math.floor(Date.now()/1000)*1000 };
    await expect(candidate.issueCommandStatus(actor, binding, link))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_COMMAND_STATUS_RECOVERY_REQUIRED"});
    expect((await pool.query("SELECT * FROM elp210_candidate.leases WHERE lease_id=$1", [legacy.lease_id])).rows[0]).toEqual(before);
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_candidate.leases")).rows[0].n).toBe(1);
    expect((await pool.query("SELECT count(*)::int AS n FROM execution_command_status_context_links WHERE lease_id=$1", [legacy.lease_id])).rows[0].n).toBe(0);
  });
  it("commits the original context/lease link atomically and fences invalid successors after restart", async () => {
    const link = { context_digest: accessDigest(`TEST_ONLY:context-${suffix}`), context_nonce:"a".repeat(43), original_digest: accessDigest("TEST_ONLY:original"),
      call_digest: accessDigest("TEST_ONLY:call"), binding_digest: accessDigest("TEST_ONLY:binding"),
      receiver_id: "TEST_ONLY:edge", authority_fingerprint: accessDigest("TEST_ONLY:authority"), delivery_sequence: 0,
      previous_lease_id: null, context_expires_at_ms: Date.now()+20000,
      status_token_digest:accessDigest("TEST_ONLY:status-token"),status_request_digest:accessDigest("TEST_ONLY:status-request"),
      status_issued_at_ms:Math.floor(Date.now()/1000)*1000 };
    const lease=await candidate.issueCommandStatus(actor,binding,link);
    expect(lease.expires_at_ms).toBeLessThanOrEqual(link.context_expires_at_ms);
    expect(decodeJwt(lease.token).exp! * 1000).toBe(lease.expires_at_ms);
    const stored=(await pool.query("SELECT * FROM execution_command_status_context_links WHERE lease_id=$1",[lease.lease_id])).rows[0];
    expect(stored).toMatchObject({context_digest:link.context_digest,original_digest:link.original_digest,
      binding_digest:link.binding_digest,request_digest:binding.request_digest,delivery_sequence:0,previous_lease_id:null,
      assertion_digest:accessDigest(lease.token)});
    expect(JSON.stringify(stored)).not.toContain(lease.token);
    const restarted=await CurrentHumanCandidate.create(pool,config);
    expect(await restarted.resumeCommandStatusIssue(actor,binding,lease.lease_id)).toEqual(lease);
    await expect(restarted.resumeCommandStatusIssue(actor,{...binding,request_digest:accessDigest("TEST_ONLY:wrong-request")},lease.lease_id))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_ENTRY_NOT_AVAILABLE"});
    const rotated=await generateKeyPair("EdDSA",{crv:"Ed25519",extractable:true});
    const otherKey=await CurrentHumanCandidate.create(pool,{...config,private_key:rotated.privateKey});
    await expect(otherKey.resumeCommandStatusIssue(actor,binding,lease.lease_id))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_ENTRY_NOT_AVAILABLE"});
    // The pinned signing-key digest rejects before re-signing or exposing a
    // more specific mismatch. It must not create a replacement original.
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_candidate.leases WHERE request_digest=$1",
      [binding.request_digest])).rows[0].n).toBe(1);
    await expect(pool.query("UPDATE execution_command_status_context_links SET receiver_id='changed' WHERE lease_id=$1",[lease.lease_id]))
      .rejects.toThrow("COMMAND_STATUS_CONTEXT_LINK_IMMUTABLE");
    await expect(pool.query("TRUNCATE execution_command_status_context_links"))
      .rejects.toThrow("COMMAND_STATUS_CONTEXT_LINK_IMMUTABLE");
    await candidate.enter(lease.token,await proof(lease.lease_id));
    await expect(restarted.resumeCommandStatusIssue(actor,binding,lease.lease_id))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_ENTRY_NOT_AVAILABLE"});
    await candidate.resolve(await proof(lease.lease_id,"COMMITTED"));
    // A different request/context after restart cannot evade the SAME
    // original's terminal-without-ACK fence. No second lease is inserted.
    await expect(restarted.issueCommandStatus(actor,{...binding,request_digest:accessDigest("TEST_ONLY:different-status-request")},
      {...link,context_digest:accessDigest("TEST_ONLY:different-context"),call_digest:accessDigest("TEST_ONLY:different-call")}))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_COMMAND_STATUS_RECOVERY_REQUIRED"});
    const successor={...link,delivery_sequence:1,previous_lease_id:lease.lease_id};
    await expect(restarted.issueCommandStatus(actor,binding,successor))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_COMMAND_STATUS_RECOVERY_REQUIRED"});
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_candidate.leases")).rows[0].n).toBe(1);
    await restarted.acknowledgeCommandStatusIssue(actor,binding,lease,accessDigest("TEST_ONLY:actual edge ack"));
    await expect(restarted.issueCommandStatus(actor,binding,{...successor,original_digest:accessDigest("TEST_ONLY:wrong-original")}))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_COMMAND_STATUS_LINK_PREVIOUS_REQUIRED"});
    await expect(restarted.issueCommandStatus(actor,binding,{...successor,context_expires_at_ms:link.context_expires_at_ms+1000}))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_COMMAND_STATUS_LINK_PREVIOUS_REQUIRED"});
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_candidate.leases")).rows[0].n).toBe(1);
    const next=await restarted.issueCommandStatus(actor,binding,successor);
    expect((await pool.query("SELECT previous_lease_id FROM execution_command_status_context_links WHERE lease_id=$1",[next.lease_id])).rows[0])
      .toEqual({previous_lease_id:lease.lease_id});
    expect((await pool.query("SELECT count(*)::int AS n FROM execution_command_status_delivery_acks WHERE lease_id=$1",[next.lease_id])).rows[0].n).toBe(0);
    const migration = await readFile(join(__dirname, "../migrations/1723680000157_execution-command-status-context-links.sql"), "utf8");
    const down = migration.split("-- Down Migration")[1];
    expect(down).toBeTruthy();
    await expect(pool.query(down!)).rejects.toThrow("COMMAND_STATUS_CONTEXT_DOWN_REQUIRES_APPROVED_ARCHIVE");
    expect((await pool.query("SELECT count(*)::int AS n FROM execution_command_status_context_links WHERE lease_id=$1", [lease.lease_id])).rows[0].n).toBe(1);
  });
  it("does not infer financial delivery from authenticated unentered rollback or an unused retired identity", async () => {
    const lease = await candidate.issue(actor, binding);
    await candidate.resolve(await proof(lease.lease_id, "ROLLED_BACK"));
    expect(await phase(lease.lease_id)).toBe("RETIRED");
    await expect(candidate.canReplaceResolvedIssue(actor, binding, lease))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_ENTRY_NOT_AVAILABLE" });
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_candidate.leases")).rows[0].n).toBe(1);
  });
  it("advances two identical financial Idle polls only after exact delivery completion and real source terminal proof", async () => {
    const path = "/internal/financial/delta", body = '{"cursor":"TEST_ONLY-unchanged-idle"}';
    binding.request_digest = pmHttpRequestDigest({ method: "POST", raw_path: Buffer.from(path),
      query_string: Buffer.alloc(0), body: Buffer.from(body) }, { request_bytes: 1_048_576 });
    const authority = new FinancialSourceAssertionAuthority(candidate,
      { ttl_ms: 60_000, maximum_contexts: 1, maximum_requests_per_context: 8 });
    const selection = { workspace_id: binding.workspace_id, environment: "paper" as const,
      workload_id: binding.workload_id, receiver_id: "TEST_ONLY-edge", binding_digest: `sha256:${"c".repeat(64)}`,
      paths: [path, "/internal/financial/page", "/internal/financial/snapshot", "/internal/financial/status",
        "/internal/financial/ack", "/internal/financial/renew"] };
    const context = authority.register(actor, selection).original_context;
    const request = { schema_version: "portal.execution.financial-source-assertion-request.v1",
      binding_digest: selection.binding_digest, receiver_id: selection.receiver_id, workload_id: binding.workload_id,
      method: "POST", path, body_utf8: body, request_digest: binding.request_digest,
      delivery_sequence: 0, previous_lease_id: null };
    const first = await authority.issue(context, request);
    expect((await authority.issue(context, request)).lease_id).toBe(first.lease_id);
    await candidate.enter(first.assertion, await proof(first.lease_id));
    await candidate.resolve(await proof(first.lease_id, "UNKNOWN"));
    const completion = { schema_version: "portal.execution.financial-source-assertion-completion-request.v1",
      binding_digest: selection.binding_digest, receiver_id: selection.receiver_id, workload_id: binding.workload_id,
      delivery_sequence: 0, lease_id: first.lease_id, request_digest: binding.request_digest,
      response_digest: `sha256:${"d".repeat(64)}` };
    await expect(authority.complete(context, completion)).rejects.toThrow();
    await candidate.resolve(await proof(first.lease_id, "COMMITTED"));
    // COMMIT alone does not mean Edge received its response: the original
    // sequence must not silently allocate a new human identity on retry.
    await expect(authority.issue(context, request)).rejects.toThrow();
    const nextRequest = { ...request, delivery_sequence: 1, previous_lease_id: first.lease_id };
    await expect(authority.issue(context, nextRequest)).rejects.toThrow();
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_candidate.leases")).rows[0].n).toBe(1);
    expect(await authority.complete(context, completion)).toMatchObject({ completed: true, lease_id: first.lease_id });
    // A lost completion ACK retries the SAME body; neither call mints a lease.
    expect(await authority.complete(context, completion)).toMatchObject({ completed: true });
    const second = await Promise.all(Array.from({ length: 8 }, () => authority.issue(context, nextRequest)));
    expect(new Set(second.map(item => item.lease_id)).size).toBe(1);
    expect(second[0]!.lease_id).not.toBe(first.lease_id);
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_candidate.leases")).rows[0].n).toBe(2);
    expect(await phase(first.lease_id)).toBe("COMMITTED");
    expect(await phase(second[0]!.lease_id)).toBe("ISSUED");
    authority.release(context);
  });
  it("clamps issuance to installation expiry and keeps signed terminal recovery possible after that expiry", async () => {
    const validUntil = Date.now() + 20_000;
    candidate = await CurrentHumanCandidate.create(pool, { ...config,
      installation_scope: { workspace_id: binding.workspace_id, environment: "paper", valid_until_ms: validUntil } });
    const lease = await enter();
    expect(decodeJwt(lease.token).exp).toBe(Math.floor(validUntil / 1000));
    expect(lease.expires_at_ms).toBeLessThanOrEqual(validUntil);
    expect(await candidate.beginDrain("test-only-installation-expiry")).toMatchObject({ status: "DRAIN_PENDING", pending: 1 });
    try {
      vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(validUntil + 1000);
      await expect(candidate.issue(actor, binding)).rejects.toMatchObject({ code: "CURRENT_HUMAN_INSTALLATION_SCOPE_INVALID" });
      // Expired candidate configuration is not a terminal source receipt and
      // must never clear an unresolved drain or prevent authentic resolution.
      expect(await candidate.drainStatus("test-only-installation-expiry")).toMatchObject({ status: "DRAIN_PENDING", pending: 1 });
      await candidate.resolve(await proof(lease.lease_id, "COMMITTED"));
      expect(await phase(lease.lease_id)).toBe("COMMITTED");
      expect(await candidate.drainStatus("test-only-installation-expiry")).toMatchObject({ status: "DRAIN_READY", pending: 0 });
    } finally { vi.useRealTimers(); }
  });
  it("rejects stale session generation and nonmember workspace instead of borrowing an owner identity", async () => {
    await expect(candidate.issue({ ...actor, session_generation: 6 }, binding)).rejects.toMatchObject({ code: "CURRENT_ACTOR_AUTHORITY_REQUIRED" });
    await expect(candidate.issue(actor, { ...binding, workspace_id: "test-only-other" })).rejects.toMatchObject({ code: "ACCESS_RESOURCE_NOT_FOUND" });
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_candidate.leases")).rows[0].n).toBe(0);
  });
  it("blocks legacy raw user disable/session revoke while a source transaction is unresolved", async () => {
    await enter();
    await expect(pool.query("UPDATE portal_users SET status='DISABLED' WHERE user_id=$1", [actor.user_id])).rejects.toThrow("CURRENT_HUMAN_DRAIN_REQUIRED");
    await expect(pool.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id=$1", [actor.session_id])).rejects.toThrow("CURRENT_HUMAN_DRAIN_REQUIRED");
    expect((await state()).revision).toBe("0");
  });
  it("persists drain despite a busy source, closes admission, then allows revoke only after terminal source proof", async () => {
    const lease = await enter();
    expect(await candidate.beginDrain("test-only-revoke")).toMatchObject({ status: "DRAIN_PENDING", pending: 1 });
    expect((await state()).drain_id).toBe("test-only-revoke");
    await expect(candidate.issue(actor, binding)).rejects.toMatchObject({ code: "CURRENT_HUMAN_DRAINING" });
    await expect(candidate.endDrain("test-only-revoke", 0)).rejects.toMatchObject({ code: "CURRENT_HUMAN_DRAIN_UNRESOLVED" });
    await candidate.resolve(await proof(lease.lease_id, "COMMITTED"));
    expect(await candidate.drainStatus("test-only-revoke")).toMatchObject({ status: "DRAIN_READY", pending: 0 });
    await pool.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id=$1", [actor.session_id]);
    expect((await state()).revision).toBe("1");
    await expect(candidate.endDrain("test-only-revoke", 0)).rejects.toMatchObject({ code: "CURRENT_HUMAN_DRAIN_CONFLICT" });
    await candidate.endDrain("test-only-revoke", 1);
    await expect(candidate.issue(actor, binding)).rejects.toMatchObject({ code: "CURRENT_ACTOR_AUTHORITY_REQUIRED" });
  });
  it("retires unused assertions on drain; a signed token is no permission to enter afterwards", async () => {
    const lease = await candidate.issue(actor, binding);
    expect(await candidate.beginDrain("test-only-drain")).toMatchObject({ status: "DRAIN_READY" });
    expect(await phase(lease.lease_id)).toBe("RETIRED");
    await expect(candidate.enter(lease.token, await proof(lease.lease_id))).rejects.toMatchObject({ code: "CURRENT_HUMAN_DRAINING" });
    await candidate.endDrain("test-only-drain", 0);
    await expect(candidate.enter(lease.token, await proof(lease.lease_id))).rejects.toMatchObject({ code: "CURRENT_HUMAN_ENTRY_NOT_AVAILABLE" });
  });
  it("never interprets UNKNOWN/release loss or expiry as rollback; same source readback resolves it", async () => {
    const lease = await enter();
    await candidate.resolve(await proof(lease.lease_id, "UNKNOWN"));
    expect(await candidate.beginDrain("test-only-partition")).toMatchObject({ status: "DRAIN_UNKNOWN", pending: 1 });
    await expect(pool.query("UPDATE portal_users SET session_version=session_version+1 WHERE user_id=$1", [actor.user_id]))
      .rejects.toThrow("CURRENT_HUMAN_DRAIN_REQUIRED");
    await candidate.resolve(await proof(lease.lease_id, "ROLLED_BACK"));
    expect(await candidate.drainStatus("test-only-partition")).toMatchObject({ status: "DRAIN_READY" });
  });
  it.each(["COMMITTED", "ROLLED_BACK"] as const)(
    "blocks fresh entry during revocation and only replays the exact %s terminal after revoke",
    async outcome => {
      const entered = await enter(), unused = await candidate.issue(actor, binding);
      const terminal = await proof(entered.lease_id, outcome);
      expect(await candidate.beginDrain("test-only-c2-revoke")).toMatchObject({ status: "DRAIN_PENDING", pending: 1 });
      await expect(candidate.issue(actor, binding)).rejects.toMatchObject({ code: "CURRENT_HUMAN_DRAINING" });
      await expect(candidate.enter(unused.token, await proof(unused.lease_id)))
        .rejects.toMatchObject({ code: "CURRENT_HUMAN_DRAINING" });
      await expect(candidate.resolve(await proof(entered.lease_id, outcome, { attempt_id: "test-only-other-attempt" })))
        .rejects.toMatchObject({ code: "CURRENT_HUMAN_BINDING_MISMATCH" });
      expect(await candidate.resolve(terminal)).toEqual({ phase: outcome, replayed: false });
      expect(await candidate.drainStatus("test-only-c2-revoke")).toMatchObject({ status: "DRAIN_READY", pending: 0 });
      // The existing DB fence permits the authority writer only after source
      // settlement. A replay following the real revoke records no new entry.
      await pool.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id=$1", [actor.session_id]);
      await candidate.endDrain("test-only-c2-revoke", Number((await state()).revision));
      expect(await candidate.resolve(terminal)).toEqual({ phase: outcome, replayed: true });
      await expect(candidate.issue(actor, binding)).rejects.toMatchObject({ code: "CURRENT_ACTOR_AUTHORITY_REQUIRED" });
      await expect(candidate.enter(unused.token, await proof(unused.lease_id)))
        .rejects.toMatchObject({ code: "CURRENT_HUMAN_ENTRY_NOT_AVAILABLE" });
      expect(await phase(entered.lease_id)).toBe(outcome);
      expect(await phase(unused.lease_id)).toBe("RETIRED");
    },
  );
  it("advances the conservative global revision for an unrelated user without changing the original actor", async () => {
    const first = await candidate.issue(actor, binding);
    await candidate.beginDrain("test-only-global-revision");
    const other = `test-only-other-${suffix}`;
    await pool.query(`INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password,session_version)
      VALUES($1,$1,'TEST_ONLY','USER','ACTIVE',false,7)`, [other]);
    const changed = Number((await state()).revision);
    expect(changed).toBeGreaterThan(first.authority_revision);
    await candidate.endDrain("test-only-global-revision", changed);
    const next = await candidate.issue(actor, binding);
    expect(decodeJwt(next.token)).toMatchObject({ sub: actor.user_id, authority_revision: changed });
    expect(await phase(first.lease_id)).toBe("RETIRED");
    await candidate.beginDrain("test-only-global-cleanup");
    await pool.query("DELETE FROM portal_users WHERE user_id=$1", [other]);
    await candidate.endDrain("test-only-global-cleanup", Number((await state()).revision));
  });
  it("keeps a used lease mutation-blocking after its actual token expiry", async () => {
    candidate = await CurrentHumanCandidate.create(pool, { ...config, limits: { ...config.limits, ttl_ms: 2000 } });
    const lease = await enter();
    // One bounded expiry fault, not a soak. The DB clock is authoritative.
    await pool.query("SELECT pg_sleep(2.05)");
    expect(await candidate.beginDrain("test-only-expiry")).toMatchObject({ status: "DRAIN_UNKNOWN", pending: 1 });
    expect(await phase(lease.lease_id)).toBe("ENTERED");
    await expect(pool.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id=$1", [actor.session_id]))
      .rejects.toThrow("CURRENT_HUMAN_DRAIN_REQUIRED");
    await candidate.resolve(await proof(lease.lease_id, "ROLLED_BACK"));
    expect(await candidate.drainStatus("test-only-expiry")).toMatchObject({ status: "DRAIN_READY" });
  });
  it("makes exact terminal readback idempotent but refuses conflicting outcome or receipt", async () => {
    const lease = await enter(), terminal = await proof(lease.lease_id, "COMMITTED");
    expect(await candidate.resolve(terminal)).toEqual({ phase: "COMMITTED", replayed: false });
    expect(await candidate.resolve(terminal)).toEqual({ phase: "COMMITTED", replayed: true });
    await expect(candidate.resolve(await proof(lease.lease_id, "ROLLED_BACK"))).rejects.toMatchObject({ code: "CURRENT_HUMAN_TERMINAL_CONFLICT" });
    await expect(candidate.resolve(await proof(lease.lease_id, "COMMITTED", { source_receipt_id: "different" })))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_TERMINAL_CONFLICT" });
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_candidate.events WHERE lease_id=$1", [lease.lease_id])).rows[0].n).toBe(3);
  });
  it("entry is one-use, including same-attempt retry; a second transaction cannot reuse its lease", async () => {
    const lease = await enter();
    await expect(candidate.enter(lease.token, await proof(lease.lease_id))).rejects.toMatchObject({ code: "CURRENT_HUMAN_ENTRY_NOT_AVAILABLE" });
  });
  it("persists exact source attempts for crash recovery without recreating a human token or admission", async () => {
    const lease = await enter();
    const restarted = await CurrentHumanCandidate.create(pool, config);
    const attempts = await restarted.recoverableAttempts();
    expect(attempts).toEqual([{ lease_id: lease.lease_id, attempt_id: `test-only-attempt-${lease.lease_id}`,
      ...binding, human_issuer: config.issuer, subject: actor.user_id, session_id: actor.session_id,
      session_revision: 7, authority_revision: 0, expires_at: lease.expires_at_ms / 1000 }]);
    expect(attempts[0]).not.toHaveProperty("token");
    await restarted.resolve(await proof(lease.lease_id, "COMMITTED"));
    expect(await restarted.recoverableAttempts()).toEqual([]);
  });
  it.each(["workspace_id", "environment", "workload_id", "request_digest", "attempt_id"])("rejects substituted %s in source proofs", async key => {
    const lease = await enter();
    const other = key === "request_digest" ? `sha256:${"c".repeat(64)}` : key === "environment" ? "live" : "different";
    await expect(candidate.resolve(await proof(lease.lease_id, "COMMITTED", { [key]: other })))
      .rejects.toMatchObject({ code: key === "workload_id" ? "CURRENT_HUMAN_SOURCE_PROOF_INVALID" : "CURRENT_HUMAN_BINDING_MISMATCH" });
    expect(await phase(lease.lease_id)).toBe("ENTERED");
  });
  it("requires authentic pinned source signing, not browser-shaped JSON or the human key", async () => {
    const lease = await candidate.issue(actor, binding);
    await expect(candidate.enter(lease.token, "{}")).rejects.toMatchObject({ code: "CURRENT_HUMAN_SOURCE_PROOF_INVALID" });
    await expect(candidate.enter(lease.token, await proof(lease.lease_id, "ENTER", {}, humanKey.privateKey)))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_SOURCE_PROOF_INVALID" });
    await expect(candidate.enter("x".repeat(8193), await proof(lease.lease_id)))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_TOKEN_INVALID" });
  });
  it("does not block harmless display/last-seen updates or session lifetime extension", async () => {
    await enter();
    await pool.query("UPDATE portal_users SET display_name='TEST_ONLY_RENAMED',failed_login_count=1 WHERE user_id=$1", [actor.user_id]);
    await pool.query("UPDATE auth_sessions SET last_seen_at=clock_timestamp(),idle_expires_at=idle_expires_at+interval '1 second' WHERE session_id=$1", [actor.session_id]);
    await pool.query("UPDATE external_identity_bindings SET last_seen_at=clock_timestamp() WHERE binding_id=$1", [suffix]);
    await pool.query("UPDATE workspaces SET name='TEST_ONLY_RENAMED' WHERE workspace_id=$1", [binding.workspace_id]);
    expect((await state()).revision).toBe("0");
    await expect(pool.query("UPDATE auth_sessions SET idle_expires_at=clock_timestamp() WHERE session_id=$1", [actor.session_id])).rejects.toThrow("CURRENT_HUMAN_DRAIN_REQUIRED");
  });
  it("fences authority across workspace/owner/policy/grant/binding deletion and TRUNCATE", async () => {
    await enter();
    await expect(pool.query("DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2", [binding.workspace_id, actor.user_id])).rejects.toThrow("CURRENT_HUMAN_DRAIN_REQUIRED");
    await expect(pool.query("DELETE FROM workspaces WHERE workspace_id=$1", [binding.workspace_id])).rejects.toThrow("CURRENT_HUMAN_DRAIN_REQUIRED");
    await expect(pool.query("INSERT INTO portal_owner_anchor(anchor_id,user_id) VALUES('PORTAL_OWNER',$1)", [actor.user_id]))
      .rejects.toThrow("CURRENT_HUMAN_DRAIN_REQUIRED");
    await expect(pool.query(`INSERT INTO external_identity_bindings(binding_id,user_id,provider,issuer,subject,normalized_email)
      VALUES($1,$2,'cloudflare_access','TEST_ONLY','TEST_ONLY','test-only@example.invalid')`, [suffix, actor.user_id]))
      .rejects.toThrow("CURRENT_HUMAN_DRAIN_REQUIRED");
    await expect(pool.query(`INSERT INTO portal_access_policy_state(workspace_id,revision,policy)
      VALUES($1,'TEST_ONLY','{}'::jsonb)`, [binding.workspace_id])).rejects.toThrow("CURRENT_HUMAN_DRAIN_REQUIRED");
    // Visit baselines now reference workspace_members. Exercise the actual
    // no-TRUNCATE authority trigger rather than stopping at PostgreSQL's FK
    // precheck; its rejection must roll back the whole cascade as well.
    const membersBefore = (await pool.query("SELECT count(*)::int AS n FROM workspace_members")).rows[0].n;
    await expect(pool.query("TRUNCATE workspace_members CASCADE")).rejects.toThrow("CURRENT_HUMAN_HISTORY_IMMUTABLE");
    expect((await pool.query("SELECT count(*)::int AS n FROM workspace_members")).rows[0].n).toBe(membersBefore);
    const guarded = await pool.query(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname='elp210_authority_guard'`);
    expect(guarded.rows[0].n).toBe(11);
  });
  it("refuses an unbounded candidate pool before installing or issuing any authority", async () => {
    const unbounded = new Pool({ connectionString: database });
    try { await expect(CurrentHumanCandidate.create(unbounded, config)).rejects.toMatchObject({ code: "CURRENT_HUMAN_POOL_TIMEOUT_REQUIRED" }); }
    finally { await unbounded.end(); }
  });
  it("serializes issuance against a real concurrent session revoke commit", async () => {
    const writer = await pool.connect();
    try {
      await writer.query("BEGIN");
      await writer.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id=$1", [actor.session_id]);
      let settled = false;
      const issuing = candidate.issue(actor, binding).then(value => ({ value }), error => ({ error })).finally(() => { settled = true; });
      await writer.query("SELECT pg_sleep(0.04)");
      expect(settled).toBe(false);
      await writer.query("COMMIT");
      expect(await issuing).toMatchObject({ error: { code: "CURRENT_ACTOR_AUTHORITY_REQUIRED" } });
    } finally { await writer.query("ROLLBACK"); writer.release(); }
  });
  it("rejects a stale REPEATABLE READ revoker whose snapshot predates issuance and source entry", async () => {
    const writer = await pool.connect();
    try {
      await writer.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
      expect((await writer.query("SELECT count(*)::int AS n FROM elp210_candidate.leases")).rows[0].n).toBe(0);
      const lease = await enter();
      await expect(writer.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id=$1", [actor.session_id]))
        .rejects.toMatchObject({ code: "40001" });
      expect(await phase(lease.lease_id)).toBe("ENTERED");
      expect((await state()).revision).toBe("0");
    } finally { await writer.query("ROLLBACK"); writer.release(); }
  });
  it("serializes source entry against a committed concurrent drain, without a second admission gap", async () => {
    const lease = await candidate.issue(actor, binding), signed = await proof(lease.lease_id), writer = await pool.connect();
    try {
      await writer.query("BEGIN");
      await writer.query("UPDATE elp210_candidate.authority SET drain_id='test-only-race' WHERE singleton");
      let settled = false;
      const entering = candidate.enter(lease.token, signed).then(() => ({}), error => ({ error })).finally(() => { settled = true; });
      await writer.query("SELECT pg_sleep(0.04)");
      expect(settled).toBe(false);
      await writer.query("COMMIT");
      expect(await entering).toMatchObject({ error: { code: "CURRENT_HUMAN_DRAINING" } });
      expect(await phase(lease.lease_id)).toBe("ISSUED");
    } finally { await writer.query("ROLLBACK"); writer.release(); }
  });
  it("uses bounded admission/retained storage and preserves immutable audit, never TTL deletion", async () => {
    candidate = await CurrentHumanCandidate.create(pool, { ...config, limits: { ...config.limits, maximum_unresolved: 1, maximum_retained: 1 } });
    const lease = await enter();
    await expect(candidate.issue(actor, binding)).rejects.toMatchObject({ code: "CURRENT_HUMAN_CAPACITY_EXHAUSTED" });
    await candidate.resolve(await proof(lease.lease_id, "COMMITTED"));
    await expect(candidate.issue(actor, binding)).rejects.toMatchObject({ code: "CURRENT_HUMAN_CAPACITY_EXHAUSTED" });
    await expect(pool.query("DELETE FROM elp210_candidate.leases WHERE lease_id=$1", [lease.lease_id])).rejects.toThrow("CURRENT_HUMAN_HISTORY_IMMUTABLE");
    await expect(pool.query("UPDATE elp210_candidate.events SET phase='RETIRED'")).rejects.toThrow("CURRENT_HUMAN_HISTORY_IMMUTABLE");
  });
  it("shares the real DB-only capture with existing AccessService without changing fingerprint semantics", async () => {
    const snapshot = await withTransaction(pool, db => captureCurrentHumanSnapshot(db, actor, binding.workspace_id));
    expect(snapshot).toMatchObject({ actor_role: "USER", actor_member: true, policy: null, grants: [] });
    // The protected owner is deliberately part of the original fingerprint;
    // migration fixtures may already have installed that independent user.
    expect(snapshot.ids).toContain(actor.user_id); expect(snapshot.active).toContain(actor.user_id);
    if (snapshot.anchor) expect(snapshot.ids).toContain(snapshot.anchor);
    expect(snapshot.authority_fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(snapshot.lease_until_ms).toBeGreaterThan(snapshot.now);
  });

  it("durably waits without holding Core connections and ignores fake recovery ACKs", async () => {
    const hooks = await mutationFixture(), lease = await enter();
    const service = coordinator(async attempt => {
      expect(pool.idleCount).toBe(pool.totalCount);
      expect(attempt.lease_id).toBe(lease.lease_id);
      return { phase: "COMMITTED", portal_acknowledged: true }; // Not a signed Core proof.
    });
    await expect(service.execute(mutation(), hooks)).rejects.toMatchObject({ code: "CURRENT_HUMAN_MUTATION_PENDING" });
    expect(hooks.apply).not.toHaveBeenCalled();
    expect((await state()).drain_id).toBeTruthy();
    expect(await phase(lease.lease_id)).toBe("ENTERED");
    expect((await pool.query("SELECT state FROM elp210_candidate.mutations")).rows[0].state).toBe("PENDING");
  });
  it("runs existing authority writer only after signed terminal proof, preserving one immutable receipt", async () => {
    const hooks = await mutationFixture(), lease = await enter();
    const service = coordinator(async () => candidate.resolve(await proof(lease.lease_id, "COMMITTED")));
    expect(await service.execute(mutation(), hooks)).toEqual({ receipt: suffix });
    expect((await state()).drain_id).toBeNull();
    expect((await pool.query("SELECT state FROM auth_sessions WHERE session_id=$1", [`test-only-target-${suffix}`])).rows[0].state).toBe("REVOKED");
    expect(await service.execute(mutation(), hooks)).toEqual({ receipt: suffix });
    expect((await pool.query("SELECT count(*)::int n FROM elp210_candidate.mutation_events")).rows[0].n).toBe(2);
    expect((await pool.query("SELECT count(*)::int n FROM elp210_candidate.test_receipts")).rows[0].n).toBe(1);
  });
  it("permits same-actor FINISHED receipt replay after legitimate relogin, never a changed payload", async () => {
    const hooks = await mutationFixture(), service = coordinator(async () => {});
    await service.execute(mutation(), hooks);
    const newSession = `test-only-relogin-${suffix}`;
    await pool.query(`INSERT INTO auth_sessions(session_id,session_token_hash,user_id,state,csrf_secret_hash,
      session_version,idle_expires_at,absolute_expires_at) SELECT $1,$1,user_id,'ACTIVE','TEST_ONLY',7,
      clock_timestamp()+interval '10 minutes',clock_timestamp()+interval '20 minutes' FROM portal_users WHERE user_id=$2`, [newSession, actor.user_id]);
    const replayHooks = await mutationFixture(newSession), rebound = { ...mutation(), session_id: newSession };
    expect(await service.execute(rebound, replayHooks)).toEqual({ receipt: suffix });
    await expect(service.execute({ ...rebound, request_digest: accessDigest("changed") }, replayHooks))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_MUTATION_KEY_CONFLICT" });
    expect((await pool.query("SELECT count(*)::int n FROM elp210_candidate.test_receipts")).rows[0].n).toBe(1);
  });
  it("never changes a PENDING session binding or cancels it from a substituted request", async () => {
    const hooks = await mutationFixture(); await enter();
    const service = coordinator(async () => {});
    await expect(service.execute(mutation(), hooks)).rejects.toMatchObject({ code: "CURRENT_HUMAN_MUTATION_PENDING" });
    await expect(service.execute({ ...mutation(), session_id: "different" }, hooks))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_MUTATION_KEY_CONFLICT" });
    expect((await pool.query("SELECT state FROM elp210_candidate.mutations")).rows[0].state).toBe("PENDING");
  });
  it("abort-only recovery survives restart/expired actor and never applies a forgotten payload", async () => {
    const hooks = await mutationFixture();
    await pool.query("UPDATE auth_sessions SET idle_expires_at=clock_timestamp()+interval '3 seconds' WHERE session_id=$1", [actor.session_id]);
    await enter();
    const service = coordinator(async () => {});
    await expect(service.execute(mutation(), hooks)).rejects.toMatchObject({ code: "CURRENT_HUMAN_MUTATION_PENDING" });
    const id = (await state()).drain_id;
    expect(await coordinator(async () => {}).recoverAbandoned(id)).toEqual({ state: "DRAIN_PENDING" });
    const attempts = await candidate.recoverableAttempts();
    // A real signed readback, not a fabricated rollback on timeout.
    await candidate.resolve(await proof(attempts[0].lease_id, "ROLLED_BACK"));
    await pool.query("SELECT pg_sleep(3.05)"); // Natural expiry, never bypass the writer fence.
    const restarted = coordinator(async () => {});
    await expect(restarted.execute(mutation(), hooks)).rejects.toMatchObject({ code: "CURRENT_ACTOR_AUTHORITY_REQUIRED" });
    expect((await state()).drain_id).toBeNull();
    expect((await pool.query("SELECT state FROM elp210_candidate.mutations")).rows[0].state).toBe("REFUSED");
    expect(await restarted.recoverAbandoned(id)).toEqual({ state: "ALREADY_TERMINAL" });
    expect(hooks.apply).not.toHaveBeenCalled();
  });
  it("keeps UNKNOWN quarantined through private abandoned recovery", async () => {
    const hooks = await mutationFixture(), lease = await enter();
    await candidate.resolve(await proof(lease.lease_id, "UNKNOWN"));
    const service = coordinator(async () => {});
    await expect(service.execute(mutation(), hooks)).rejects.toMatchObject({ code: "CURRENT_HUMAN_MUTATION_OUTCOME_UNCERTAIN" });
    const id = (await state()).drain_id;
    expect(await service.recoverAbandoned(id)).toEqual({ state: "DRAIN_UNKNOWN" });
    expect((await state()).drain_id).toBe(id); expect(hooks.apply).not.toHaveBeenCalled();
  });
  it("rolls back authority/receipt atomically on application failure and records a non-replayable refusal", async () => {
    const hooks = await mutationFixture(), service = coordinator(async () => {});
    const apply = hooks.apply;
    hooks.apply = vi.fn(async db => { await apply(db); throw new Error("TEST_ONLY application failed"); });
    await expect(service.execute(mutation(), hooks)).rejects.toThrow("TEST_ONLY application failed");
    expect((await state()).drain_id).toBeNull();
    expect((await pool.query("SELECT state FROM auth_sessions WHERE session_id=$1", [`test-only-target-${suffix}`])).rows[0].state).toBe("ACTIVE");
    expect((await pool.query("SELECT count(*)::int n FROM elp210_candidate.test_receipts")).rows[0].n).toBe(0);
    await expect(service.execute(mutation(), hooks)).rejects.toMatchObject({ code: "CURRENT_HUMAN_MUTATION_PREVIOUSLY_REFUSED" });
  });
  it("preserves FINISHED after an actual final Core COMMIT whose acknowledgement is lost", async () => {
    const hooks = await mutationFixture(), originalApply = hooks.apply, service = coordinator(async () => {});
    const lostAck = new Error("TEST_ONLY_FINAL_CORE_COMMIT_ACK_LOST");
    let commits = 0, applications = 0, restored = false, inject = true;
    hooks.apply = vi.fn(async (db: import("pg").PoolClient) => {
      const prior = await db.query("SELECT receipt_id FROM elp210_candidate.test_receipts WHERE receipt_id=$1", [suffix]);
      if (!prior.rowCount) applications++;
      const result = await originalApply(db);
      if (inject) {
        inject = false;
        // Wrap only this checked-out client, after the original DB writes.
        // Restore before throwing/returning so neither release nor a subsequent
        // borrower sees the fault. No pool/global query spy or source proof.
        const originalQuery = db.query, hadOwnQuery = Object.hasOwn(db, "query");
        const invoke = (...args: unknown[]) => (originalQuery as (...args: unknown[]) => Promise<unknown>).apply(db, args);
        const restore = () => {
          if (hadOwnQuery) db.query = originalQuery;
          else Reflect.deleteProperty(db, "query");
          restored = db.query === originalQuery;
        };
        db.query = (async (...args: unknown[]) => {
          const command = typeof args[0] === "string" ? args[0] : (args[0] as { text?: unknown })?.text;
          if (command === "COMMIT") {
            try {
              await invoke(...args); // PostgreSQL really commits first.
              commits++;
              throw lostAck;
            } finally { restore(); }
          }
          if (command === "ROLLBACK") {
            try { return await invoke(...args); }
            finally { restore(); }
          }
          return invoke(...args);
        }) as typeof db.query;
      }
      return result;
    });
    await expect(service.execute(mutation(), hooks)).rejects.toBe(lostAck);
    expect(commits).toBe(1); expect(restored).toBe(true);
    expect((await pool.query("SELECT state FROM elp210_candidate.mutations")).rows[0].state).toBe("FINISHED");
    expect((await pool.query("SELECT state FROM auth_sessions WHERE session_id=$1", [`test-only-target-${suffix}`])).rows[0].state).toBe("REVOKED");
    const revisionAfterCommit = (await state()).revision;
    expect((await state()).drain_id).toBeNull();
    expect(await service.execute(mutation(), hooks)).toEqual({ receipt: suffix });
    expect(applications).toBe(1); expect(originalApply).toHaveBeenCalledTimes(2);
    expect((await state()).revision).toBe(revisionAfterCommit);
    expect((await pool.query("SELECT count(*)::int n FROM elp210_candidate.test_receipts")).rows[0].n).toBe(1);
    expect((await pool.query("SELECT state FROM elp210_candidate.mutations")).rows[0].state).toBe("FINISHED");
    expect((await pool.query("SELECT count(*)::int n FROM elp210_candidate.mutation_events")).rows[0].n).toBe(2);
    expect((await state()).drain_id).toBeNull();
  });
  it("bounds durable mutation intents while permitting an existing FINISHED receipt replay", async () => {
    const hooks = await mutationFixture();
    const service = new CurrentHumanMutations(pool, candidate, { recover: async () => {} },
      { maximum_intents: 1, maximum_recoveries_per_request: 1 });
    expect(await service.execute(mutation(), hooks)).toEqual({ receipt: suffix });
    await expect(service.execute({ ...mutation(), key_digest: accessDigest(["TEST_ONLY-over-capacity", suffix]) }, hooks))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_MUTATION_CAPACITY_EXHAUSTED" });
    expect((await pool.query("SELECT count(*)::int n FROM elp210_candidate.mutations")).rows[0].n).toBe(1);
    expect((await state()).drain_id).toBeNull();
    expect(await service.execute(mutation(), hooks)).toEqual({ receipt: suffix });
    expect((await pool.query("SELECT count(*)::int n FROM elp210_candidate.test_receipts")).rows[0].n).toBe(1);
    expect((await pool.query("SELECT count(*)::int n FROM elp210_candidate.mutation_events")).rows[0].n).toBe(2);
  });
  it("preserves subsequent immutable refusal audit during a pending drain, without opening authority writes", async () => {
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      const event = `INSERT INTO portal_access_policy_events(event_id,workspace_id,actor_user_id,operation,request_digest,receipt)
        VALUES($1,$2,$3,'DENIED',$4,'{}'::jsonb)`;
      await db.query(event, [`test-only-first-${suffix}`, binding.workspace_id, actor.user_id, accessDigest("TEST_ONLY-first")]);
      await db.query(`INSERT INTO elp210_candidate.mutations(mutation_id,key_digest,binding_digest,replay_digest,family,actor_id,session_id,session_revision)
        VALUES($1,$2,$2,$2,'AUTH_SESSION',$3,$4,7)`, [suffix, accessDigest(suffix), actor.user_id, actor.session_id]);
      await db.query("UPDATE elp210_candidate.authority SET drain_id=$1 WHERE singleton", [suffix]);
      await db.query("SAVEPOINT refused_authority");
      await expect(db.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id=$1", [actor.session_id]))
        .rejects.toThrow("CURRENT_HUMAN_DRAIN_COORDINATOR_REQUIRED");
      await db.query("ROLLBACK TO SAVEPOINT refused_authority");
      await db.query(event, [`test-only-next-${suffix}`, binding.workspace_id, actor.user_id, accessDigest("TEST_ONLY-next")]);
      expect((await db.query("SELECT count(*)::int n FROM portal_access_policy_events WHERE workspace_id=$1", [binding.workspace_id])).rows[0].n).toBe(2);
    } finally { await db.query("ROLLBACK"); db.release(); }
  });
  it("refuses uncoordinated authority writes into a READY durable intent", async () => {
    const hooks = await mutationFixture(), lease = await enter(), service = coordinator(async () => {});
    await expect(service.execute(mutation(), hooks)).rejects.toMatchObject({ code: "CURRENT_HUMAN_MUTATION_PENDING" });
    await candidate.resolve(await proof(lease.lease_id, "COMMITTED"));
    await expect(pool.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id=$1", [actor.session_id]))
      .rejects.toThrow("CURRENT_HUMAN_DRAIN_COORDINATOR_REQUIRED");
    expect(await service.execute(mutation(), hooks)).toEqual({ receipt: suffix });
  });
  it("refuses a FINISHED replay callback that tries a second authority mutation", async () => {
    const hooks = await mutationFixture(), service = coordinator(async () => {});
    await service.execute(mutation(), hooks);
    await expect(service.execute(mutation(), { ...hooks, apply: async db => {
      await db.query("UPDATE auth_sessions SET state='REVOKED' WHERE session_id=$1", [actor.session_id]);
      return { receipt: suffix };
    } })).rejects.toThrow("CURRENT_HUMAN_MUTATION_REPLAY_WRITE_FORBIDDEN");
    expect((await pool.query("SELECT state FROM elp210_candidate.mutations")).rows[0].state).toBe("FINISHED");
  });
  it("serializes concurrent exact retries across recovery, without a drain-conflict false failure", async () => {
    const hooks = await mutationFixture(), lease = await enter();
    const service = coordinator(async () => candidate.resolve(await proof(lease.lease_id, "COMMITTED")));
    const outcomes = await Promise.all([service.execute(mutation(), hooks), service.execute(mutation(), hooks)]);
    expect(outcomes).toEqual([{ receipt: suffix }, { receipt: suffix }]);
    expect((await pool.query("SELECT count(*)::int n FROM elp210_candidate.test_receipts")).rows[0].n).toBe(1);
    expect((await state()).drain_id).toBeNull();
  });

  // Real disposable Core PG + TEST_ONLY signing keys; not a physical PM receipt
  // or genuine Research session/provider qualification by itself.
  it.each(["ISSUED", "RETIRED"])("acknowledges only genuine signed source rollback before ENTER from %s", async initial => {
    const lease = await candidate.issue(actor, binding);
    if (initial === "RETIRED") await candidate.beginDrain("test-only-unentered-drain");
    const terminal = await proof(lease.lease_id, "ROLLED_BACK");
    expect(await candidate.resolve(terminal)).toEqual({ phase: "ROLLED_BACK", replayed: false });
    const row = (await pool.query("SELECT phase,attempt_id,terminal_receipt_digest FROM elp210_candidate.leases WHERE lease_id=$1", [lease.lease_id])).rows[0];
    expect(row).toEqual({ phase: "RETIRED", attempt_id: null, terminal_receipt_digest: null });
    const events = (await pool.query("SELECT phase,attempt_id,terminal_receipt_digest FROM elp210_candidate.events WHERE lease_id=$1 ORDER BY event_id", [lease.lease_id])).rows;
    expect(events.map(e => e.phase)).toEqual(["ISSUED", "RETIRED", "SOURCE_ROLLED_BACK_UNENTERED"]);
    expect(events[2]).toMatchObject({ attempt_id: `test-only-attempt-${lease.lease_id}` });
    expect(events[2].terminal_receipt_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(events.some(e => e.phase === "ENTERED")).toBe(false);
    expect(await candidate.resolve(terminal)).toEqual({ phase: "ROLLED_BACK", replayed: true });
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_candidate.events WHERE lease_id=$1", [lease.lease_id])).rows[0].n).toBe(3);
    await expect(pool.query("UPDATE elp210_candidate.events SET phase='ROLLED_BACK' WHERE lease_id=$1", [lease.lease_id]))
      .rejects.toThrow("CURRENT_HUMAN_HISTORY_IMMUTABLE");
  });

  it.each([
    ["ISSUED", "COMMITTED"], ["RETIRED", "COMMITTED"],
  ] as const)("never accepts %s source %s as an unentered rollback", async (initial, terminal) => {
    const lease = await candidate.issue(actor, binding);
    if (initial === "RETIRED") await candidate.beginDrain("test-only-unentered-denial");
    await expect(candidate.resolve(await proof(lease.lease_id, terminal)))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_RESOLUTION_NOT_AVAILABLE" });
    expect(await phase(lease.lease_id)).toBe(initial);
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_candidate.events WHERE lease_id=$1 AND phase='SOURCE_ROLLED_BACK_UNENTERED'", [lease.lease_id])).rows[0].n).toBe(0);
  });

  it.each(["attempt_id", "source_receipt_id", "source_receipt_digest"])("refuses conflicting unentered terminal %s", async key => {
    const lease = await candidate.issue(actor, binding);
    await candidate.resolve(await proof(lease.lease_id, "ROLLED_BACK"));
    const value = key === "source_receipt_digest" ? `sha256:${"c".repeat(64)}` : "test-only-conflicting";
    await expect(candidate.resolve(await proof(lease.lease_id, "ROLLED_BACK", { [key]: value })))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_TERMINAL_CONFLICT" });
    expect(await phase(lease.lease_id)).toBe("RETIRED");
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_candidate.events WHERE lease_id=$1 AND phase='SOURCE_ROLLED_BACK_UNENTERED'", [lease.lease_id])).rows[0].n).toBe(1);
  });

  it.each(["workspace_id", "environment", "workload_id", "request_digest"])("binds unentered rollback to exact %s", async key => {
    const lease = await candidate.issue(actor, binding);
    const value = key === "request_digest" ? `sha256:${"c".repeat(64)}` : key === "environment" ? "live" : "test-only-other";
    await expect(candidate.resolve(await proof(lease.lease_id, "ROLLED_BACK", { [key]: value })))
      .rejects.toMatchObject({ code: key === "workload_id" ? "CURRENT_HUMAN_SOURCE_PROOF_INVALID" : "CURRENT_HUMAN_BINDING_MISMATCH" });
    expect(await phase(lease.lease_id)).toBe("ISSUED");
  });

  it("refuses human-key or malformed rollback proof without retiring the issued lease", async () => {
    const lease = await candidate.issue(actor, binding);
    await expect(candidate.resolve(await proof(lease.lease_id, "ROLLED_BACK", {}, humanKey.privateKey)))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_SOURCE_PROOF_INVALID" });
    await expect(candidate.resolve("{}"))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_SOURCE_PROOF_INVALID" });
    expect(await phase(lease.lease_id)).toBe("ISSUED");
  });

  it("does not authorize late ENTER or repeat source execution after an unentered terminal", async () => {
    const lease = await candidate.issue(actor, binding);
    await candidate.resolve(await proof(lease.lease_id, "ROLLED_BACK"));
    await expect(candidate.enter(lease.token, await proof(lease.lease_id)))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_ENTRY_NOT_AVAILABLE" });
    expect(await candidate.recoverableAttempts()).toEqual([]);
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_candidate.events WHERE lease_id=$1 AND phase='ENTERED'", [lease.lease_id])).rows[0].n).toBe(0);
  });

  it("serializes simultaneous identical unentered terminal deliveries into one immutable receipt", async () => {
    const lease = await candidate.issue(actor, binding), terminal = await proof(lease.lease_id, "ROLLED_BACK");
    const replies = await Promise.all([candidate.resolve(terminal), candidate.resolve(terminal)]);
    expect(replies.map(r => r.replayed).sort()).toEqual([false, true]);
    expect(replies.every(r => r.phase === "ROLLED_BACK")).toBe(true);
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_candidate.events WHERE lease_id=$1 AND phase='SOURCE_ROLLED_BACK_UNENTERED'", [lease.lease_id])).rows[0].n).toBe(1);
  });

  it("rolls back lease retirement if the immutable source receipt append fails", async () => {
    const lease = await candidate.issue(actor, binding);
    await pool.query(`CREATE FUNCTION elp210_candidate.test_only_abort_append_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.phase='SOURCE_ROLLED_BACK_UNENTERED' THEN RAISE EXCEPTION 'TEST_ONLY_ABORT_APPEND_FAILED'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER test_only_abort_append_failure BEFORE INSERT ON elp210_candidate.events
      FOR EACH ROW EXECUTE FUNCTION elp210_candidate.test_only_abort_append_failure()`);
    await expect(candidate.resolve(await proof(lease.lease_id, "ROLLED_BACK"))).rejects.toThrow("TEST_ONLY_ABORT_APPEND_FAILED");
    expect(await phase(lease.lease_id)).toBe("ISSUED");
    expect((await pool.query("SELECT phase FROM elp210_candidate.events WHERE lease_id=$1 ORDER BY event_id", [lease.lease_id])).rows.map(r => r.phase)).toEqual(["ISSUED"]);
  });

  it("replays exact unentered terminal after a response is lost following real Core COMMIT", async () => {
    const lease = await candidate.issue(actor, binding), terminal = await proof(lease.lease_id, "ROLLED_BACK");
    const lostReply = new Error("TEST_ONLY_TRANSPORT_REPLY_LOST_AFTER_COMMIT");
    const transport = async () => { await candidate.resolve(terminal); throw lostReply; };
    await expect(transport()).rejects.toBe(lostReply);
    expect(await phase(lease.lease_id)).toBe("RETIRED");
    expect(await candidate.resolve(terminal)).toEqual({ phase: "ROLLED_BACK", replayed: true });
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_candidate.events WHERE lease_id=$1 AND phase='SOURCE_ROLLED_BACK_UNENTERED'", [lease.lease_id])).rows[0].n).toBe(1);
  });
  // Same-key reconstruction may recover old attempts but cannot issue or
  // enter after installation expiry. No fake DB time or transport ACK.

  it.each(["COMMITTED", "ROLLED_BACK"] as const)(
    "recreates an expired same-key installation for %s recovery, never new issue or ENTER",
    async terminalPhase => {
      const validUntil = Date.now() + 20_000;
      const scoped: CurrentHumanCandidateConfig = { ...config,
        installation_scope: { workspace_id: binding.workspace_id, environment: "paper", valid_until_ms: validUntil } };
      candidate = await CurrentHumanCandidate.create(pool, scoped);
      const entered = await enter();
      const unused = await candidate.issue(actor, binding);
      const before = (await pool.query(`SELECT
        (SELECT count(*)::int FROM elp210_candidate.leases) AS leases,
        (SELECT count(*)::int FROM elp210_candidate.events) AS events,
        (SELECT row_to_json(s) FROM auth_sessions s WHERE session_id=$1) AS session`, [actor.session_id])).rows[0];

      try {
        // Only JS Date advances: pg/network timers and the actual database
        // remain real. The old human JWT expires, but source readback signs a
        // new short-lived proof for the SAME persisted source attempt.
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(validUntil + 1000);
        const restarted = await CurrentHumanCandidate.create(pool, scoped);
        expect((await pool.query(`SELECT
          (SELECT count(*)::int FROM elp210_candidate.leases) AS leases,
          (SELECT count(*)::int FROM elp210_candidate.events) AS events,
          (SELECT row_to_json(s) FROM auth_sessions s WHERE session_id=$1) AS session`, [actor.session_id])).rows[0])
          .toEqual(before);
        expect(await restarted.recoverableAttempts()).toEqual([
          { lease_id: entered.lease_id, attempt_id: `test-only-attempt-${entered.lease_id}`,
            ...binding, human_issuer: config.issuer, subject: actor.user_id,
            session_id: actor.session_id, session_revision: 7, authority_revision: 0,
            expires_at: entered.expires_at_ms / 1000 },
        ]);
        await expect(restarted.issue(actor, binding)).rejects.toMatchObject({
          code: "CURRENT_HUMAN_INSTALLATION_SCOPE_INVALID" });
        await expect(restarted.enter(unused.token, await proof(unused.lease_id))).rejects.toMatchObject({
          code: "CURRENT_HUMAN_INSTALLATION_SCOPE_INVALID" });
        expect(await phase(unused.lease_id)).toBe("ISSUED");
        expect(await phase(entered.lease_id)).toBe("ENTERED");

        // Construction did not relax trust or exact source-attempt bindings.
        await expect(restarted.resolve(await proof(entered.lease_id, terminalPhase, {}, humanKey.privateKey)))
          .rejects.toMatchObject({ code: "CURRENT_HUMAN_SOURCE_PROOF_INVALID" });
        await expect(restarted.resolve(await proof(entered.lease_id, terminalPhase,
          { attempt_id: "test-only-different-attempt" })))
          .rejects.toMatchObject({ code: "CURRENT_HUMAN_BINDING_MISMATCH" });
        await expect(restarted.resolve(await proof(entered.lease_id, terminalPhase,
          { workspace_id: "test-only-different-workspace" })))
          .rejects.toMatchObject({ code: "CURRENT_HUMAN_INSTALLATION_SCOPE_INVALID" });
        expect(await phase(entered.lease_id)).toBe("ENTERED");

        const terminal = await proof(entered.lease_id, terminalPhase);
        expect(await restarted.resolve(terminal)).toEqual({ phase: terminalPhase, replayed: false });
        expect(await restarted.resolve(terminal)).toEqual({ phase: terminalPhase, replayed: true });
        expect(await phase(entered.lease_id)).toBe(terminalPhase);
        expect(await restarted.recoverableAttempts()).toEqual([]);
        // Drain can retire the never-entered unused token, without expiry
        // pretending that the genuinely entered source attempt was terminal.
        expect(await restarted.beginDrain("test-only-expired-restart")).toMatchObject({
          status: "DRAIN_READY", pending: 0 });
        expect(await phase(unused.lease_id)).toBe("RETIRED");
        expect((await pool.query("SELECT row_to_json(s) AS session FROM auth_sessions s WHERE session_id=$1",
          [actor.session_id])).rows[0].session).toEqual(before.session);
      } finally { vi.useRealTimers(); }
    });

  // P1 unused identity finish: actual disposable Core PG and the SAME candidate
  // authority barrier. These are not installed IPC/provider/PM ACK receipts.
  const unusedOriginal = (lease: Awaited<ReturnType<CurrentHumanCandidate["issue"]>>) => ({
    lease_id: lease.lease_id, authority_revision: lease.authority_revision,
    actor: { ...actor }, binding: { ...binding },
  });

  it("finishes an unused identity after a lost issue response, without manufacturing any source terminal", async () => {
    const lease = await candidate.issue(actor, binding), original = unusedOriginal(lease);
    expect(lease.authority_revision).toBe(Number((await state()).revision));
    const beforeSession = (await pool.query("SELECT row_to_json(s) AS session FROM auth_sessions s WHERE session_id=$1",
      [actor.session_id])).rows[0].session;
    // The response is intentionally not handed to a source. The private owner
    // still has the original durable target and its exact session bearer.
    const drainId = "test-only-unused-finish", drain = await candidate.beginDrain(drainId), witness = vi.fn(() => {});
    expect(drain).toMatchObject({ status: "DRAIN_READY", pending: 0 });
    await candidate.finishUnusedIdentityDrain(drainId, drain.authority_revision, original, witness);
    expect(witness).toHaveBeenCalledTimes(1);
    expect((await state()).drain_id).toBeNull();
    expect((await pool.query("SELECT phase,attempt_id,terminal_receipt_digest FROM elp210_candidate.leases WHERE lease_id=$1",
      [lease.lease_id])).rows[0]).toEqual({ phase: "RETIRED", attempt_id: null, terminal_receipt_digest: null });
    expect((await pool.query("SELECT phase,attempt_id,terminal_receipt_digest FROM elp210_candidate.events WHERE lease_id=$1 ORDER BY event_id",
      [lease.lease_id])).rows).toEqual([
      { phase: "ISSUED", attempt_id: null, terminal_receipt_digest: null },
      { phase: "RETIRED", attempt_id: null, terminal_receipt_digest: null },
    ]);
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_candidate.mutations")).rows[0].n).toBe(0);
    expect((await pool.query("SELECT row_to_json(s) AS session FROM auth_sessions s WHERE session_id=$1",
      [actor.session_id])).rows[0].session).toEqual(beforeSession);
    await expect(candidate.enter(lease.token, await proof(lease.lease_id)))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_ENTRY_NOT_AVAILABLE" });
  });

  it("rechecks the same unused target after a lost finish ACK without appending history or issuing another identity", async () => {
    const lease = await candidate.issue(actor, binding), original = unusedOriginal(lease), drainId = "test-only-unused-ack";
    const first = await candidate.beginDrain(drainId);
    await candidate.finishUnusedIdentityDrain(drainId, first.authority_revision, original, () => {});
    // Treat the committed reply as lost; do not pretend a second clear is a
    // terminal receipt. A fresh exact drain can establish the same safe target.
    await expect(candidate.finishUnusedIdentityDrain(drainId, first.authority_revision, original, () => {}))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_DRAIN_CONFLICT" });
    const retry = await candidate.beginDrain(drainId);
    await candidate.finishUnusedIdentityDrain(drainId, retry.authority_revision, original, () => {});
    expect((await state()).drain_id).toBeNull();
    expect((await pool.query("SELECT count(*)::int AS n FROM elp210_candidate.leases")).rows[0].n).toBe(1);
    expect((await pool.query("SELECT phase FROM elp210_candidate.events ORDER BY event_id")).rows.map(row => row.phase))
      .toEqual(["ISSUED", "RETIRED"]);
  });

  it.each(["lease_id", "authority_revision", "user_id", "session_id", "session_generation",
    "workspace_id", "environment", "workload_id", "request_digest"] as const)(
    "refuses unused finish with a different original %s and preserves its committed drain", async field => {
      const lease = await candidate.issue(actor, binding), original = unusedOriginal(lease),
        drainId = "test-only-unused-binding", drain = await candidate.beginDrain(drainId);
      switch (field) {
        case "lease_id": original.lease_id = "test-only-different-lease"; break;
        case "authority_revision": original.authority_revision++; break;
        case "user_id": original.actor.user_id = "test-only-different-user"; break;
        case "session_id": original.actor.session_id = "test-only-different-session"; break;
        case "session_generation": original.actor.session_generation++; break;
        case "workspace_id": original.binding.workspace_id = "test-only-different-workspace"; break;
        case "environment": original.binding.environment = "sandbox"; break;
        case "workload_id": original.binding.workload_id = "test-only-different-workload"; break;
        case "request_digest": original.binding.request_digest = "sha256:" + "c".repeat(64); break;
      }
      const witness = vi.fn(() => {});
      await expect(candidate.finishUnusedIdentityDrain(drainId, drain.authority_revision, original, witness))
        .rejects.toMatchObject({ code: "CURRENT_HUMAN_BINDING_MISMATCH" });
      expect(witness).not.toHaveBeenCalled(); expect((await state()).drain_id).toBe(drainId);
    });

  it.each(["drain_id", "revision"] as const)("requires the committed original drain and its current %s", async field => {
    const lease = await candidate.issue(actor, binding), drainId = "test-only-unused-drain",
      drain = await candidate.beginDrain(drainId);
    await expect(candidate.finishUnusedIdentityDrain(field === "drain_id" ? "test-only-foreign-drain" : drainId,
      drain.authority_revision + (field === "revision" ? 1 : 0), unusedOriginal(lease), () => {}))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_DRAIN_CONFLICT" });
    expect((await state()).drain_id).toBe(drainId);
  });

  it.each(["in_flight", "accepted", "denied", "timed_out"] as const)(
    "preserves drain when the trusted local callback witness observes %s", async field => {
      const lease = await candidate.issue(actor, binding), drainId = "test-only-unused-callback",
        drain = await candidate.beginDrain(drainId), counters = { in_flight: 0, accepted: 0, denied: 0, timed_out: 0 };
      counters[field] = 1;
      await expect(candidate.finishUnusedIdentityDrain(drainId, drain.authority_revision, unusedOriginal(lease), () => {
        if (Object.values(counters).some(value => value !== 0))
          throw new CurrentHumanLeaseError("TEST_ONLY_CALLBACK_WITNESS_REFUSED");
      })).rejects.toMatchObject({ code: "TEST_ONLY_CALLBACK_WITNESS_REFUSED" });
      expect((await state()).drain_id).toBe(drainId); expect(await phase(lease.lease_id)).toBe("RETIRED");
    });

  it("refuses an async rejecting callback witness before it runs or creates a rejection", async () => {
    const lease = await candidate.issue(actor, binding), drainId = "test-only-unused-async",
      drain = await candidate.beginDrain(drainId);
    let invoked = false;
    const witness = async () => { invoked = true; throw new Error("TEST_ONLY_ASYNC_MUST_NOT_RUN"); };
    await expect(candidate.finishUnusedIdentityDrain(drainId, drain.authority_revision, unusedOriginal(lease), witness))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_UNUSED_IDENTITY_WITNESS_REQUIRED" });
    expect(invoked).toBe(false);
    expect((await state()).drain_id).toBe(drainId);
  });

  it("observes a sync witness's native rejected Promise without awaiting it or clearing custody", async () => {
    const lease = await candidate.issue(actor, binding), drainId = "test-only-unused-rejected-promise",
      drain = await candidate.beginDrain(drainId), fault = new Error("TEST_ONLY_PROMISE_MUST_BE_OBSERVED"),
      unhandled: unknown[] = [], onUnhandled = (reason: unknown) => { unhandled.push(reason); };
    process.on("unhandledRejection", onUnhandled);
    try {
      await expect(candidate.finishUnusedIdentityDrain(drainId, drain.authority_revision, unusedOriginal(lease),
        () => Promise.reject(fault))).rejects.toMatchObject({ code: "CURRENT_HUMAN_UNUSED_IDENTITY_WITNESS_REQUIRED" });
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(unhandled).toEqual([]);
      expect((await state()).drain_id).toBe(drainId);
      expect((await pool.query("SELECT phase FROM elp210_candidate.events WHERE lease_id=$1 ORDER BY event_id",
        [lease.lease_id])).rows.map(row => row.phase)).toEqual(["ISSUED", "RETIRED"]);
    } finally { process.off("unhandledRejection", onUnhandled); }
  });

  it("refuses a returned thenable without invoking its then method", async () => {
    const lease = await candidate.issue(actor, binding), drainId = "test-only-unused-thenable",
      drain = await candidate.beginDrain(drainId), then = vi.fn(() => { throw new Error("TEST_ONLY_THEN_MUST_NOT_RUN"); });
    await expect(candidate.finishUnusedIdentityDrain(drainId, drain.authority_revision, unusedOriginal(lease),
      () => ({ then }))).rejects.toMatchObject({ code: "CURRENT_HUMAN_UNUSED_IDENTITY_WITNESS_REQUIRED" });
    expect(then).not.toHaveBeenCalled();
    expect((await state()).drain_id).toBe(drainId);
  });

  it("refuses a missing immutable retirement event without clearing or repairing custody", async () => {
    const lease = await candidate.issue(actor, binding);
    // Disposable fixture fault: suppress only this event append, not any
    // production guard/trigger or lease transition; never edit old event bytes.
    await pool.query("CREATE FUNCTION elp210_candidate.test_only_skip_retired_event() RETURNS trigger LANGUAGE plpgsql AS $$ " +
      "BEGIN IF NEW.phase='RETIRED' THEN RETURN NULL; END IF; RETURN NEW; END $$; " +
      "CREATE TRIGGER test_only_skip_retired_event BEFORE INSERT ON elp210_candidate.events " +
      "FOR EACH ROW EXECUTE FUNCTION elp210_candidate.test_only_skip_retired_event()");
    const drainId = "test-only-unused-missing-event", drain = await candidate.beginDrain(drainId);
    await expect(candidate.finishUnusedIdentityDrain(drainId, drain.authority_revision, unusedOriginal(lease), () => {}))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_UNUSED_IDENTITY_NOT_ELIGIBLE" });
    expect((await state()).drain_id).toBe(drainId);
    expect((await pool.query("SELECT phase FROM elp210_candidate.events WHERE lease_id=$1 ORDER BY event_id",
      [lease.lease_id])).rows.map(row => row.phase)).toEqual(["ISSUED"]);
  });

  it.each(["ENTERED", "UNKNOWN", "COMMITTED", "ROLLED_BACK", "SOURCE_ROLLED_BACK_UNENTERED", "TEST_ONLY_UNEXPECTED"] as const)(
    "refuses extra %s history even if the lease row alone still looks RETIRED", async event => {
      const lease = await candidate.issue(actor, binding), drainId = "test-only-unused-extra-event",
        drain = await candidate.beginDrain(drainId);
      // Explicit inconsistent-history fixture, NOT a genuine source receipt.
      await pool.query("INSERT INTO elp210_candidate.events(lease_id,phase,attempt_id,terminal_receipt_digest) VALUES($1,$2,NULL,NULL)",
        [lease.lease_id, event]);
      await expect(candidate.finishUnusedIdentityDrain(drainId, drain.authority_revision, unusedOriginal(lease), () => {}))
        .rejects.toMatchObject({ code: "CURRENT_HUMAN_UNUSED_IDENTITY_NOT_ELIGIBLE" });
      expect((await state()).drain_id).toBe(drainId);
    });

  it.each(["ENTERED", "UNKNOWN", "COMMITTED", "ROLLED_BACK"] as const)(
    "never accepts a genuinely used %s lease through unused finish", async targetPhase => {
      const lease = await enter(), drainId = "test-only-used-not-unused";
      if (targetPhase !== "ENTERED") await candidate.resolve(await proof(lease.lease_id, targetPhase));
      const drain = await candidate.beginDrain(drainId);
      await expect(candidate.finishUnusedIdentityDrain(drainId, drain.authority_revision, unusedOriginal(lease), () => {}))
        .rejects.toMatchObject({ code: targetPhase === "ENTERED" || targetPhase === "UNKNOWN"
          ? "CURRENT_HUMAN_DRAIN_UNRESOLVED" : "CURRENT_HUMAN_UNUSED_IDENTITY_NOT_ELIGIBLE" });
      expect((await state()).drain_id).toBe(drainId); expect(await phase(lease.lease_id)).toBe(targetPhase);
    });

  it("leaves a genuine unentered source rollback on its existing terminal path", async () => {
    const lease = await candidate.issue(actor, binding);
    await candidate.resolve(await proof(lease.lease_id, "ROLLED_BACK"));
    const drainId = "test-only-source-rollback-not-unused", drain = await candidate.beginDrain(drainId);
    await expect(candidate.finishUnusedIdentityDrain(drainId, drain.authority_revision, unusedOriginal(lease), () => {}))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_UNUSED_IDENTITY_NOT_ELIGIBLE" });
    expect((await state()).drain_id).toBe(drainId);
    expect((await pool.query("SELECT phase FROM elp210_candidate.events WHERE lease_id=$1 ORDER BY event_id",
      [lease.lease_id])).rows.map(row => row.phase)).toEqual(["ISSUED", "RETIRED", "SOURCE_ROLLED_BACK_UNENTERED"]);
  });

  it("requires the global drain to be ready, not just the exact unused lease", async () => {
    const unused = await candidate.issue(actor, binding), used = await enter(),
      drainId = "test-only-unused-other-pending", drain = await candidate.beginDrain(drainId);
    expect(drain).toMatchObject({ status: "DRAIN_PENDING", pending: 1 });
    await expect(candidate.finishUnusedIdentityDrain(drainId, drain.authority_revision, unusedOriginal(unused), () => {}))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_DRAIN_UNRESOLVED" });
    expect(await phase(unused.lease_id)).toBe("RETIRED"); expect(await phase(used.lease_id)).toBe("ENTERED");
    expect((await state()).drain_id).toBe(drainId);
  });

  it("uses separate original and current drain revisions and does not require an expired session to regain authority", async () => {
    const lease = await candidate.issue(actor, binding), original = unusedOriginal(lease),
      drainId = "test-only-unused-expired-session";
    await candidate.beginDrain(drainId);
    await pool.query("UPDATE auth_sessions SET idle_expires_at=clock_timestamp()-interval '1 second' WHERE session_id=$1",
      [actor.session_id]);
    await pool.query("UPDATE portal_users SET status='DISABLED' WHERE user_id=$1", [actor.user_id]);
    const drain = await candidate.drainStatus(drainId);
    expect(drain.authority_revision).toBeGreaterThan(original.authority_revision);
    await candidate.finishUnusedIdentityDrain(drainId, drain.authority_revision, original, () => {});
    expect((await state()).drain_id).toBeNull(); expect(await phase(lease.lease_id)).toBe("RETIRED");
    expect((await pool.query("SELECT status FROM portal_users WHERE user_id=$1", [actor.user_id])).rows[0].status).toBe("DISABLED");
  });

  it("keeps the committed drain fence when unused finish and late ENTER race behind a real authority row lock", async () => {
    const lease = await candidate.issue(actor, binding), signed = await proof(lease.lease_id),
      drainId = "test-only-unused-enter-race", drain = await candidate.beginDrain(drainId), blocker = await pool.connect();
    try {
      await blocker.query("BEGIN"); await blocker.query("SELECT singleton FROM elp210_candidate.authority WHERE singleton FOR UPDATE");
      const entering = candidate.enter(lease.token, signed).then(() => null, error => error);
      const finishing = candidate.finishUnusedIdentityDrain(drainId, drain.authority_revision, unusedOriginal(lease), () => {});
      await blocker.query("COMMIT");
      const [entryError] = await Promise.all([entering, finishing]);
      expect(entryError).toBeInstanceOf(CurrentHumanLeaseError);
      expect(["CURRENT_HUMAN_DRAINING", "CURRENT_HUMAN_ENTRY_NOT_AVAILABLE"]).toContain(entryError.code);
      expect((await state()).drain_id).toBeNull(); expect(await phase(lease.lease_id)).toBe("RETIRED");
      expect((await pool.query("SELECT phase FROM elp210_candidate.events WHERE lease_id=$1 ORDER BY event_id",
        [lease.lease_id])).rows.map(row => row.phase)).toEqual(["ISSUED", "RETIRED"]);
    } finally { await blocker.query("ROLLBACK"); blocker.release(); }
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "still rejects malformed installation valid_until_ms %s at construction",
    async validUntil => {
      await expect(CurrentHumanCandidate.create(pool, { ...config,
        installation_scope: { workspace_id: binding.workspace_id, environment: "paper", valid_until_ms: validUntil } }))
        .rejects.toMatchObject({ code: "CURRENT_HUMAN_INSTALLATION_SCOPE_INVALID" });
      expect((await pool.query("SELECT count(*)::int AS n FROM elp210_candidate.leases")).rows[0].n).toBe(0);
    });
});
