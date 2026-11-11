/** TEST_ONLY disposable PostgreSQL; not a source fence, ACK or cutover. */
import { createHash, generateKeyPairSync, randomUUID, X509Certificate } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:https";
import { join } from "node:path";
import { generateKeyPair, SignJWT } from "jose";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CurrentHumanCandidate, type CurrentHumanCandidateConfig } from "../src/execution-v2/current-human-candidate";
import { CoreRestoreQuiescence, newRestoreDrainId } from "../src/execution-v2/restore-core-quiescence";
import { CurrentHumanRecoveryClient } from "../src/execution-v2/current-human-recovery-client";
import { RestoreC2OriginalRecovery } from "../src/execution-v2/restore-c2-original-recovery";
import { commonName, testCertificate, type TestAuthority } from "./fixtures/elp210-test-certificates";
import { migrateTestDatabase } from "./harness";

const database = process.env.TEST_DATABASE_URL;
describe.skipIf(!database)("TEST_ONLY recovery exact-original PostgreSQL", () => {
  let pool: Pool;
  beforeAll(async () => {
    const parsed = new URL(database!);
    if (process.env.PORTAL_TEST_RESTORE_RLS !== "TEST_ONLY_DISPOSABLE_RLS" ||
      !["postgres:", "postgresql:"].includes(parsed.protocol) || !/^\/portal_restore_rls_[a-f0-9]{8}$/.test(parsed.pathname))
      throw new Error("TEST_ONLY_DISPOSABLE_DATABASE_REQUIRED");
    await migrateTestDatabase(database!);
    pool = new Pool({ connectionString: database, max: 4, connectionTimeoutMillis: 2000, query_timeout: 6000 });
  });
  beforeEach(async () => {
    await pool.query(await readFile(join(__dirname, "../src/execution-v2/current-human-candidate.sql"), "utf8"));
    await pool.query(await readFile(join(__dirname, "../src/execution-v2/current-human-c2-unentered-unknown-candidate.sql"), "utf8"));
  });
  afterEach(async () => { await pool.query("DROP SCHEMA IF EXISTS elp210_candidate CASCADE"); });
  afterAll(async () => { await pool?.end(); });
  it.each(["unentered-unknown", "entered", "unentered-rollback"] as const)("reconciles exact original (%s), never cuts over", async (variant) => {
    const entered = variant === "entered", directRetired = variant === "unentered-rollback";
    const suffix = randomUUID(), workspace = `test-only-ws-${suffix}`;
    const actor = { user_id: `test-only-user-${suffix}`, session_id: `test-only-session-${suffix}`, session_generation: 7 };
    await pool.query("INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password,session_version) VALUES($1,$1,'TEST_ONLY','USER','ACTIVE',false,7)", [actor.user_id]);
    await pool.query("INSERT INTO auth_sessions(session_id,session_token_hash,user_id,state,csrf_secret_hash,session_version,idle_expires_at,absolute_expires_at) VALUES($1,$1,$2,'ACTIVE','TEST_ONLY',7,clock_timestamp()+interval '10 minutes',clock_timestamp()+interval '20 minutes')", [actor.session_id, actor.user_id]);
    await pool.query("INSERT INTO portal_owner_anchor(anchor_id,user_id) VALUES('PORTAL_OWNER',$1)", [actor.user_id]);
    await pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY',$2)", [workspace, actor.user_id]);
    const [human, source] = await Promise.all([generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true }), generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true })]);
    const config: CurrentHumanCandidateConfig = { issuer: "test-human", audience: "test-pm", key_id: "human-key", private_key: human.privateKey,
      source: { issuer: "test-source", audience: "test-source-aud", key_id: "source-key", public_key: source.publicKey, workload_id: "test-workload" },
      installation_scope: { workspace_id: workspace, environment: "paper", valid_until_ms: Date.now() + 60000 },
      limits: { ttl_ms: 30000, maximum_unresolved: 10, maximum_retained: 20 } };
    const binding = { workspace_id: workspace, environment: "paper" as const, workload_id: "test-workload", request_digest: `sha256:${"a".repeat(64)}` };
    const candidate = await CurrentHumanCandidate.create(pool, config), lease = await candidate.issue(actor, binding);
    const attempt = `test-attempt-${suffix}`;
    const proof = async (phase: "ENTER" | "UNKNOWN" | "ROLLED_BACK" | "COMMITTED", sourceAttempt = attempt, signing = source.privateKey) => {
      const now = Math.floor(Date.now() / 1000), terminal = phase === "COMMITTED" || phase === "ROLLED_BACK";
      return new SignJWT({ iss: config.source.issuer, aud: config.source.audience, sub: config.source.workload_id,
        jti: randomUUID(), iat: now, nbf: now, exp: now + 60, purpose: "pma.current-human-lease.v1",
        lease_id: lease.lease_id, attempt_id: sourceAttempt, ...binding, phase,
        source_receipt_id: terminal ? "test-only-terminal" : null, source_receipt_digest: terminal ? `sha256:${"b".repeat(64)}` : null })
        .setProtectedHeader({ alg: "EdDSA", kid: config.source.key_id, typ: "JWT" }).sign(signing);
    };
    if (entered) await candidate.enter(lease.token, await proof("ENTER"));
    const drain = newRestoreDrainId(), restore = new CoreRestoreQuiescence(pool, candidate);
    await restore.open(drain);
    if (directRetired) {
      expect(await candidate.resolve(await proof("ROLLED_BACK"))).toMatchObject({phase:"ROLLED_BACK",replayed:false});
      expect((await pool.query("SELECT phase,attempt_id FROM elp210_candidate.leases WHERE lease_id=$1",[lease.lease_id])).rows[0])
        .toEqual({phase:"RETIRED",attempt_id:null});
    } else expect(await restore.reconcileOriginal(drain, lease.lease_id, attempt, await proof("UNKNOWN")))
      .toMatchObject({ terminal: "UNKNOWN", progress: { local_drain: "DRAIN_UNKNOWN", state: "CORE_ONLY_NO_CUTOVER" } });
    const restartedCandidate = await CurrentHumanCandidate.create(pool, config);
    const restarted = new CoreRestoreQuiescence(pool, restartedCandidate);
    if (!directRetired) await expect(restarted.reconcileOriginal(drain, lease.lease_id, `${attempt}-wrong`, await proof("ROLLED_BACK", `${attempt}-wrong`)))
      .rejects.toThrow("V2_RESTORE_ORIGINAL_NOT_AVAILABLE");
    else expect(await restartedCandidate.recoverableExactAttempt(lease.lease_id,`${attempt}-wrong`)).toBeNull();
    const foreign = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
    await expect(restarted.reconcileOriginal(drain, lease.lease_id, attempt, await proof("ROLLED_BACK", attempt, foreign.privateKey)))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_SOURCE_PROOF_INVALID" });
    if (!entered && !directRetired) await expect(restarted.reconcileOriginal(drain, lease.lease_id, attempt, await proof("COMMITTED")))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_RESOLUTION_NOT_AVAILABLE" });
    const terminal = await proof(entered ? "COMMITTED" : "ROLLED_BACK");
    // TEST_ONLY peer on loopback: real TLS pin and signed candidate.resolve;
    // neither the server nor its synthetic ACK represents a TS receipt.
    const caKey = generateKeyPairSync("ec", { namedCurve: "prime256v1" }), name = commonName("TEST_ONLY_CA");
    const ca: TestAuthority = { key: caKey.privateKey, name, certificate: testCertificate(name, caKey, { name, key: caKey.privateKey }, true) };
    const makeLeaf = (label: string) => {
      const key = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
      return { key: key.privateKey.export({ type: "pkcs8", format: "pem" }), cert: testCertificate(commonName(label), key, ca, false) };
    };
    const core = makeLeaf("TEST_ONLY_CORE"), peer = makeLeaf("TEST_ONLY_TS");
    let mode: "TIMEOUT" | "MISMATCH" | "DRAIN_CHANGED" | "LOST_RESPONSE" | "TERMINAL" | "CORRUPT_IN_FLIGHT" = "TIMEOUT", calls = 0;
    const server = createServer({ key: peer.key, cert: peer.cert, ca: ca.certificate, requestCert: true, rejectUnauthorized: true,
      minVersion: "TLSv1.3", maxVersion: "TLSv1.3" }, (req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", chunk => chunks.push(Buffer.from(chunk)));
      req.on("end", () => { void (async () => {
        calls++;
        const request = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        expect(request.schema_version).toBe("pma.current-human-recover.v1");
        expect(request.attempt.lease_id).toBe(lease.lease_id); expect(request.attempt.attempt_id).toBe(attempt);
        if (mode === "TIMEOUT") return;
        if (mode === "DRAIN_CHANGED") await pool.query("UPDATE elp210_candidate.authority SET drain_id=$1 WHERE singleton", [newRestoreDrainId()]);
        if (mode === "TERMINAL" || mode === "LOST_RESPONSE" || mode === "CORRUPT_IN_FLIGHT") await restartedCandidate.resolve(terminal);
        if (mode === "LOST_RESPONSE") { res.destroy(); return; }
        if (mode === "CORRUPT_IN_FLIGHT") await pool.query(`INSERT INTO elp210_candidate.events
          (lease_id,phase,attempt_id,terminal_receipt_digest) VALUES($1,$2,$3,$4)`, [lease.lease_id,
          directRetired ? "SOURCE_ROLLED_BACK_UNENTERED" : entered ? "COMMITTED" : "ROLLED_BACK",
          attempt, `sha256:${"c".repeat(64)}`]);
        const body = JSON.stringify({ schema_version: "pma.current-human-recover-ack.v1", lease_id: lease.lease_id,
          attempt_id: mode === "MISMATCH" ? `${attempt}-wrong` : attempt, phase: entered ? "COMMITTED" : "ROLLED_BACK", portal_acknowledged: true });
        res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(body) }); res.end(body);
      })().catch(() => res.destroy()); });
    });
    server.on("tlsClientError", () => {});
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    try {
      const address = server.address(); if (!address || typeof address === "string") throw new Error("TEST_ONLY_ADDRESS");
      const recovery = new CurrentHumanRecoveryClient({ origin: `https://127.0.0.1:${address.port}`,
        tls: { key: core.key, cert: core.cert, ca: ca.certificate },
        source_certificate_sha256: `sha256:${createHash("sha256").update(new X509Certificate(peer.cert).raw).digest("hex")}`,
        deadline_ms: 300, response_bytes: 4096 });
      const orchestrator = new RestoreC2OriginalRecovery(pool, restartedCandidate, recovery);
      await expect(orchestrator.reconcile(drain, lease.lease_id, attempt)).rejects.toMatchObject({ code: "CURRENT_HUMAN_RECOVERY_UNAVAILABLE" });
      expect((await restarted.status(drain)).local_drain).toBe(directRetired ? "DRAIN_READY" : "DRAIN_UNKNOWN");
      mode = "MISMATCH";
      await expect(orchestrator.reconcile(drain, lease.lease_id, attempt)).rejects.toMatchObject({ code: "CURRENT_HUMAN_RECOVERY_UNAVAILABLE" });
      expect((await restarted.status(drain)).local_drain).toBe(directRetired ? "DRAIN_READY" : "DRAIN_UNKNOWN");
      mode = "DRAIN_CHANGED";
      await expect(orchestrator.reconcile(drain, lease.lease_id, attempt)).rejects.toThrow("V2_RESTORE_RECOVERY_DRAIN_CHANGED");
      // TEST_ONLY privileged interleaving, in the disposable DB, not a runbook
      // for undoing a real drain. It lets this test exercise the later lane.
      await pool.query("UPDATE elp210_candidate.authority SET drain_id=$1 WHERE singleton", [drain]);
      expect((await restarted.status(drain)).local_drain).toBe(directRetired ? "DRAIN_READY" : "DRAIN_UNKNOWN");
      mode = "LOST_RESPONSE";
      await expect(orchestrator.reconcile(drain, lease.lease_id, attempt)).rejects.toMatchObject({ code:"CURRENT_HUMAN_RECOVERY_UNAVAILABLE" });
      // The source response is lost after Core recorded the exact terminal.
      // A new process must still recover the same original, never a new issue.
      mode = "TERMINAL";
      const afterRestart = new RestoreC2OriginalRecovery(pool, await CurrentHumanCandidate.create(pool,config), recovery);
      expect(await afterRestart.reconcile(drain, lease.lease_id, attempt)).toMatchObject({
        state: "PHASE_AND_BINDING_MATCH_RECEIPT_DIGEST_NOT_VERIFIED", progress: { state: "CORE_ONLY_NO_CUTOVER", independent_checkpoint: "NOT_VERIFIED",
          old_holder_fence: "NOT_VERIFIED", post_snapshot_ack_coverage: "NOT_VERIFIED" } });
      expect(await restarted.reconcileOriginal(drain, lease.lease_id, attempt, terminal)).toMatchObject({ terminal: "CORE_REPLAYED" });
      // Corrupt history after initial lookup, while the source response is in
      // flight. The final transaction must refuse the conflicting event too.
      mode = "CORRUPT_IN_FLIGHT";
      await expect(afterRestart.reconcile(drain, lease.lease_id, attempt)).rejects.toThrow("V2_RESTORE_RECOVERY_ORIGINAL_AMBIGUOUS");
      expect(await restartedCandidate.recoverableExactAttempt(lease.lease_id, attempt)).toBeNull();
      expect(calls).toBe(6);
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
    await pool.query("DELETE FROM workspaces WHERE workspace_id=$1", [workspace]);
    await pool.query("DELETE FROM portal_owner_anchor WHERE anchor_id='PORTAL_OWNER' AND user_id=$1", [actor.user_id]);
    await pool.query("DELETE FROM portal_users WHERE user_id=$1", [actor.user_id]);
  });
  it("looks up the known original beyond 128 without listing or crossing source/scope", async () => {
    const suffix = randomUUID(), workspace = `test-only-ws-${suffix}`;
    const actor = { user_id: `test-only-user-${suffix}`, session_id: `test-only-session-${suffix}`, session_generation: 7 };
    await pool.query("INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password,session_version) VALUES($1,$1,'TEST_ONLY','USER','ACTIVE',false,7)", [actor.user_id]);
    await pool.query("INSERT INTO auth_sessions(session_id,session_token_hash,user_id,state,csrf_secret_hash,session_version,idle_expires_at,absolute_expires_at) VALUES($1,$1,$2,'ACTIVE','TEST_ONLY',7,clock_timestamp()+interval '10 minutes',clock_timestamp()+interval '20 minutes')", [actor.session_id, actor.user_id]);
    await pool.query("INSERT INTO portal_owner_anchor(anchor_id,user_id) VALUES('PORTAL_OWNER',$1)", [actor.user_id]);
    await pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY',$2)", [workspace, actor.user_id]);
    const [human, source] = await Promise.all([generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true }), generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true })]);
    const config: CurrentHumanCandidateConfig = { issuer: "test-human", audience: "test-pm", key_id: "human-key", private_key: human.privateKey,
      source: { issuer: "test-source", audience: "test-source-aud", key_id: "source-key", public_key: source.publicKey, workload_id: "test-workload" },
      installation_scope: { workspace_id: workspace, environment: "paper", valid_until_ms: Date.now() + 60000 },
      limits: { ttl_ms: 30000, maximum_unresolved: 10, maximum_retained: 20 } };
    const binding = { workspace_id: workspace, environment: "paper" as const, workload_id: "test-workload", request_digest: `sha256:${"a".repeat(64)}` };
    const candidate = await CurrentHumanCandidate.create(pool, config), lease = await candidate.issue(actor, binding);
    const attempt = `test-attempt-${suffix}`, now = Math.floor(Date.now() / 1000);
    const enter = await new SignJWT({ iss: config.source.issuer, aud: config.source.audience, sub: config.source.workload_id,
      jti: randomUUID(), iat: now, nbf: now, exp: now + 60, purpose: "pma.current-human-lease.v1", lease_id: lease.lease_id,
      attempt_id: attempt, ...binding, phase: "ENTER", source_receipt_id: null, source_receipt_digest: null })
      .setProtectedHeader({ alg: "EdDSA", kid: config.source.key_id, typ: "JWT" }).sign(source.privateKey);
    await candidate.enter(lease.token, enter);
    // TEST_ONLY synthetic crowded history in the name-checked disposable DB.
    // This intentionally exceeds admission limits only to test lookup logic;
    // it is not evidence that a live producer may violate its quota.
    await pool.query(`INSERT INTO elp210_candidate.leases (lease_id,authority_revision,subject_id,session_id,session_revision,
      workspace_id,environment,workload_id,request_digest,authority_fingerprint,issued_at_ms,expires_at_ms,phase,attempt_id,human_issuer,source_trust_digest)
      SELECT 'TEST_ONLY-extra-'||n,authority_revision,subject_id,session_id,session_revision,workspace_id,environment,workload_id,
        request_digest,authority_fingerprint,issued_at_ms-2,expires_at_ms-2,'UNKNOWN','TEST_ONLY-attempt-'||n,human_issuer,source_trust_digest
      FROM elp210_candidate.leases CROSS JOIN generate_series(1,128) n WHERE lease_id=$1`, [lease.lease_id]);
    const first = await candidate.recoverableAttempts();
    expect(first).toHaveLength(128); expect(first.some(item => item.lease_id === lease.lease_id)).toBe(false);
    expect(await candidate.recoverableExactAttempt(lease.lease_id, attempt)).toMatchObject({ lease_id: lease.lease_id, attempt_id: attempt, workspace_id: workspace, human_issuer: config.issuer });
    const rotatedIssuer = await CurrentHumanCandidate.create(pool, { ...config, issuer: "test-different-human" });
    await expect(rotatedIssuer.recoverableExactAttempt(lease.lease_id, attempt)).rejects.toMatchObject({ code: "CURRENT_HUMAN_RECOVERY_ISSUER_UNAVAILABLE" });
    await expect(rotatedIssuer.recoverableAttempts()).rejects.toMatchObject({ code: "CURRENT_HUMAN_RECOVERY_ISSUER_UNAVAILABLE" });
    const replacementKey = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
    const rotatedSource = await CurrentHumanCandidate.create(pool, { ...config,
      source: { ...config.source, public_key: replacementKey.publicKey } });
    await expect(rotatedSource.recoverableExactAttempt(lease.lease_id, attempt))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_RECOVERY_SOURCE_TRUST_UNAVAILABLE" });
    const replacementTerminal=await new SignJWT({iss:config.source.issuer,aud:config.source.audience,sub:config.source.workload_id,
      jti:randomUUID(),iat:now,nbf:now,exp:now+60,purpose:"pma.current-human-lease.v1",lease_id:lease.lease_id,
      attempt_id:attempt,...binding,phase:"ROLLED_BACK",source_receipt_id:"TEST_ONLY-replacement",
      source_receipt_digest:`sha256:${"b".repeat(64)}`})
      .setProtectedHeader({alg:"EdDSA",kid:config.source.key_id,typ:"JWT"}).sign(replacementKey.privateKey);
    await expect(rotatedSource.resolve(replacementTerminal))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_RECOVERY_SOURCE_TRUST_UNAVAILABLE" });
    expect((await pool.query("SELECT phase FROM elp210_candidate.leases WHERE lease_id=$1",[lease.lease_id])).rows[0].phase).toBe("ENTERED");
    const changedKid = await CurrentHumanCandidate.create(pool, { ...config,
      source: { ...config.source, key_id: "test-other-source-key" } });
    await expect(changedKid.recoverableExactAttempt(lease.lease_id, attempt))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_RECOVERY_SOURCE_TRUST_UNAVAILABLE" });
    await expect(pool.query("UPDATE elp210_candidate.leases SET human_issuer='test-mutated',phase='UNKNOWN' WHERE lease_id=$1", [lease.lease_id]))
      .rejects.toThrow("CURRENT_HUMAN_TRANSITION_INVALID");
    expect(await candidate.recoverableExactAttempt(lease.lease_id, `${attempt}-wrong`)).toBeNull();
    const otherSource = await CurrentHumanCandidate.create(pool, { ...config, source: { ...config.source, workload_id: "other-workload" } });
    expect(await otherSource.recoverableExactAttempt(lease.lease_id, attempt)).toBeNull();
    const missingScope = await CurrentHumanCandidate.create(pool, { ...config, installation_scope: undefined });
    await expect(missingScope.recoverableExactAttempt(lease.lease_id, attempt)).rejects.toMatchObject({ code: "CURRENT_HUMAN_INSTALLATION_SCOPE_INVALID" });
    for (const environment of ["sandbox", "live"] as const) {
      await expect(CurrentHumanCandidate.create(pool, { ...config,
        installation_scope: { workspace_id: workspace, environment, valid_until_ms: Date.now() + 60000 } as never }))
        .rejects.toMatchObject({ code: "CURRENT_HUMAN_INSTALLATION_SCOPE_INVALID" });
    }
    const otherScope = await CurrentHumanCandidate.create(pool, { ...config,
      installation_scope: { workspace_id: "wrong-workspace", environment: "paper", valid_until_ms: Date.now() + 60000 } });
    await expect(otherScope.recoverableExactAttempt(lease.lease_id, attempt)).rejects.toMatchObject({ code: "CURRENT_HUMAN_INSTALLATION_SCOPE_INVALID" });
    // A historical row with no stored issuer cannot borrow today's config.
    await pool.query(`INSERT INTO elp210_candidate.leases (lease_id,authority_revision,subject_id,session_id,session_revision,
      workspace_id,environment,workload_id,request_digest,authority_fingerprint,issued_at_ms,expires_at_ms,phase,attempt_id)
      SELECT 'TEST_ONLY-legacy-issuer',authority_revision,subject_id,session_id,session_revision,workspace_id,environment,workload_id,
        request_digest,authority_fingerprint,issued_at_ms-3,expires_at_ms-3,'UNKNOWN','TEST_ONLY-legacy-attempt'
      FROM elp210_candidate.leases WHERE lease_id=$1`, [lease.lease_id]);
    await expect(candidate.recoverableExactAttempt('TEST_ONLY-legacy-issuer', 'TEST_ONLY-legacy-attempt'))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_RECOVERY_ISSUER_UNAVAILABLE" });
    await expect(candidate.recoverableAttempts()).rejects.toMatchObject({ code: "CURRENT_HUMAN_RECOVERY_ISSUER_UNAVAILABLE" });
    await pool.query(`INSERT INTO elp210_candidate.leases (lease_id,authority_revision,subject_id,session_id,session_revision,
      workspace_id,environment,workload_id,request_digest,authority_fingerprint,issued_at_ms,expires_at_ms,phase,attempt_id,human_issuer)
      SELECT 'TEST_ONLY-legacy-source',authority_revision,subject_id,session_id,session_revision,workspace_id,environment,workload_id,
        request_digest,authority_fingerprint,issued_at_ms-4,expires_at_ms-4,'UNKNOWN','TEST_ONLY-legacy-source-attempt',human_issuer
      FROM elp210_candidate.leases WHERE lease_id=$1`, [lease.lease_id]);
    await expect(candidate.recoverableExactAttempt('TEST_ONLY-legacy-source', 'TEST_ONLY-legacy-source-attempt'))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_RECOVERY_SOURCE_TRUST_UNAVAILABLE" });
  });
});
