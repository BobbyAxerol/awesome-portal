/** Real disposable Core PostgreSQL + real AuthService/password sessions,
 * access evaluator, command writer/store and CurrentHumanCandidate. The source
 * correspondences, source signatures and loopback PKI are explicitly TEST_ONLY:
 * this proves Core persistence/current-requester/custody fences, NOT an installed
 * PM grant, an economic COMMIT, an authenticated external human or commissioning.
 * No trusted-command row, positive Core context or terminal lease is SQL-seeded.
 */
import { createHash, generateKeyPairSync, randomUUID, X509Certificate } from "node:crypto";
import { readFile } from "node:fs/promises";
import { request, type Server } from "node:https";
import { join } from "node:path";
import type { Duplex } from "node:stream";
import { decodeJwt, generateKeyPair, jwtVerify, SignJWT } from "jose";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AdminService } from "../src/admin/admin.service";
import { AuthService } from "../src/auth/auth.service";
import { buildPool } from "../src/db/pool";
import { AccountLifecycleRepository } from "../src/repos/account-lifecycle";
import { OwnerAccessRepository } from "../src/repos/owner-access";
import { tsRootMembershipAcceptance, type AccessActor, type AccessAction,
  type ReviewedAccessPolicy, type ScopedAccessGrant } from "../src/execution-v2/access.contract";
import { accessDigest, canonicalSelector, type AccessRelations } from "../src/execution-v2/access-policy";
import { grantBindingDigest, type CurrentAccessRelations } from "../src/execution-v2/access-current-relations";
import { AccessRepository } from "../src/execution-v2/access.repository";
import { ExecutionAccessService } from "../src/execution-v2/access.service";
import type { AccessTrustProvider } from "../src/execution-v2/access-trust";
import { CommandSourceAssertionAuthority, COMMAND_STATUS_PM_PATH, type CommandStatusInput,
  type CommandSourceAssertionRequest, type CommandSourceAssertionResponse } from "../src/execution-v2/command-source-assertion";
import { createCommandSourceAssertionTransport } from "../src/execution-v2/command-source-assertion-transport";
import { ExecutionCommandService, intentHash, previewHash } from "../src/execution-v2/command.service";
import { CommandStore } from "../src/execution-v2/command.store";
import type { CommandIntent } from "../src/execution-v2/command.contract";
import { commandAuthorization, type CommandTrust } from "../src/execution-v2/command-trust";
import { CurrentHumanCandidate, type CurrentHumanBinding, type CurrentHumanCandidateConfig } from "../src/execution-v2/current-human-candidate";
import { CurrentHumanMutations } from "../src/execution-v2/current-human-mutations";
import { pmHttpRequestDigest } from "../src/execution-v2/pm-http-request-binding";
import { commonName, testCertificate, type TestAuthority } from "./fixtures/elp210-test-certificates";
import { migrateTestDatabase, setupApp, teardownApp } from "./harness";

const database = process.env.TEST_DATABASE_URL;
const next = (label: string) => `TEST_ONLY:${label}:${randomUUID()}`;
const workload = "TEST_ONLY:command-status-pg-edge", gateway = "TEST_ONLY:command-status-pg-gateway";
type Identity = { key: Buffer; cert: Buffer; ca: Buffer; pin: string };
type Issued = CommandSourceAssertionResponse;

describe.skipIf(!database).sequential("command STATUS concrete authority with real Core PG (TEST_ONLY source)", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>, auth: AuthService, coordinatedAuth: AuthService;
  let owner: AccessActor, reviewerId: string, candidate: CurrentHumanCandidate, config: CurrentHumanCandidateConfig;
  let humanKey: Awaited<ReturnType<typeof generateKeyPair>>, sourceKey: Awaited<ReturnType<typeof generateKeyPair>>;
  let core: Identity, edge: Identity, foreign: Identity;
  const fixtures: Awaited<ReturnType<typeof fixture>>[] = [];
  const authorities: CommandSourceAssertionAuthority[] = [];
  const listeners: { server: Server; sockets: Set<Duplex> }[] = [];
  const nowOnDb = async () => Number((await ctx.pool.query(
    "SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms")).rows[0].ms);
  const leases = async (workspace: string) => (await ctx.pool.query(
    "SELECT * FROM elp210_candidate.leases WHERE workspace_id=$1 ORDER BY issued_at_ms,lease_id", [workspace])).rows;
  const commandRows = async (workspace: string) => (await ctx.pool.query(`SELECT
    (SELECT count(*)::int FROM execution_trusted_commands WHERE workspace_id=$1) AS commands,
    (SELECT count(*)::int FROM execution_trusted_command_events e JOIN execution_trusted_commands c USING(command_id)
      WHERE c.workspace_id=$1) AS events,
    (SELECT count(*)::int FROM product_audit_events WHERE workspace_id=$1 AND aggregate_type='execution_command') AS audit`, [workspace])).rows[0];

  async function person(label: string) {
    const username = `status-pg-${label}-${randomUUID()}`;
    const admin = new AdminService(ctx.pool, ctx.config, auth);
    const made = await admin.createUser({ username, displayName: "TEST_ONLY command STATUS PG", role: "USER" });
    const activation = await admin.resetCredential(made.userId);
    const initial = await auth.login({ assertion: username, username, credential: activation.activationToken });
    const password = "TEST-only-command-STATUS-PG-correct-horse-private-2026";
    await auth.changePassword({ sessionToken: initial.token, csrfToken: initial.csrfToken,
      currentPassword: activation.activationToken, newPassword: password });
    const login = async () => {
      const session = await auth.login({ assertion: username, username, credential: password });
      const user = (await auth.users.findById(made.userId))!;
      return { token: session.token, actor: { user_id: made.userId, session_id: session.sessionId,
        session_generation: user.sessionVersion } satisfies AccessActor };
    };
    return { id: made.userId, login };
  }

  async function fixture(session: { token: string; actor: AccessActor }) {
    const workspace = next("workspace"), portfolio = next("portfolio"), now = await nowOnDb();
    // Only disposable relational fixture inputs. Real AuthService, policy/grant
    // repositories and CommandService own authentication/rights/original writes.
    await ctx.pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY STATUS PG',$2)", [workspace, owner.user_id]);
    await ctx.pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'OWNER'),($1,$3,'MEMBER')",
      [workspace, owner.user_id, reviewerId]);
    const policy: ReviewedAccessPolicy = { workspace_id: workspace, revision: next("policy"),
      artifact_digest: accessDigest(["TEST_ONLY policy", workspace]), approval_ref: next("not-owner-approval"),
      state: "REVIEWED", qualification: "TEST_ONLY", protected_owner_user_id: owner.user_id,
      researcher_fields: { state: "PENDING", policy_ref: null, fields: [] } };
    const sources = new Map<string, CurrentAccessRelations>();
    const repo = new AccessRepository(ctx.pool);
    await repo.putPolicy(policy);
    async function grant(subject: string, action: AccessAction) {
      const source: CurrentAccessRelations = { schema_version: "pma.core-current-relations.v1",
        subject_user_id: subject, workspace_id: workspace, ts_user_id: next("ts-user"), mapping_revision: next("mapping"),
        resources: [{ environment: "paper", revision: next("cut"), own_alpha_ids: [], member_portfolio_ids: [portfolio], roots: [] }], grants: [] };
      const g: ScopedAccessGrant = { grant_id: next("grant"), workspace_id: workspace, subject_user_id: subject,
        action, effect: "ALLOW", selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "PORTFOLIO", ids: [portfolio] },
        environments: ["paper"], valid_from_ms: now - 60_000, valid_until_ms: now + 300_000,
        delegable_actions: [], issued_by: owner.user_id, parent_grant_id: null, revision: next("grant-revision"),
        policy_revision: policy.revision, revoked_at_ms: null, requires_ts_acceptance: true, ts_receipt: null, field_policy_ref: null };
      const fact = tsRootMembershipAcceptance.parse({ context: "REVIEWED_POLICY_ROOT", source: "TEST_ONLY:PM",
        source_contract: "TEST_ONLY:normalized", trust_profile: "TEST_ONLY:uninstalled", receipt_id: next("receipt"),
        portal_user_id: subject, ts_user_id: source.ts_user_id, mapping_revision: source.mapping_revision,
        human_requester_user_id: owner.user_id, workspace_id: workspace, action,
        selector_digest: accessDigest(canonicalSelector(g.selector)), environments: ["paper"],
        previous_membership_revision: null, membership_revision: next("membership"), effective_at_ms: now - 30_000,
        expires_at_ms: now + 240_000, outcome: "ACCEPTED", payload_digest: accessDigest(["TEST_ONLY payload", g.grant_id]),
        provenance_ref: "TEST_ONLY:NOT_NATIVE_PM_ACCEPTANCE", policy_revision: policy.revision,
        policy_artifact_digest: policy.artifact_digest, policy_install_digest: accessDigest(["TEST_ONLY install", workspace]),
        approval_ref: policy.approval_ref, grant_id: g.grant_id, grant_digest: accessDigest(g), expected_grant_revision: g.revision });
      g.ts_receipt = { receipt_id: fact.receipt_id, membership_revision: fact.membership_revision,
        mapping_revision: fact.mapping_revision, effective_at_ms: fact.effective_at_ms, expires_at_ms: fact.expires_at_ms };
      g.ts_acceptance_digest = accessDigest(fact);
      source.grants.push({ grant_id: g.grant_id, binding_digest: grantBindingDigest(g), accepted: fact,
        targets: [{ environment: "paper", resource: { kind: "PORTFOLIO", id: portfolio }, revision: next("native-leg"),
          native_reference_digest: accessDigest(["TEST_ONLY native leg", g.grant_id]), valid_from_ms: now - 20_000, valid_until_ms: now + 180_000 }] });
      sources.set(subject, source); await repo.saveGrant(g, true);
      return { source, grant: g };
    }
    const author = await grant(owner.user_id, "capital.top_up"), reader = await grant(reviewerId, "audit.read");
    const relation = (id: string): AccessRelations => ({ qualified: true, revision: "TEST_ONLY:current-observation",
      own_alpha_ids: [], member_portfolio_ids: [portfolio], roots: {}, membership: null, current_authority: sources.get(id)! });
    const trust: AccessTrustProvider = { verifyPolicy: async () => null, verifyReceipt: async () => null,
      relations: async principalId => relation(principalId),
      verifiedHumanMapping: async principalId => {
        const source = sources.get(principalId)!;
        return { ts_user_id: source.ts_user_id, revision: source.mapping_revision };
      } };
    const access = new ExecutionAccessService(ctx.pool, auth, trust, true);
    const intent: CommandIntent = { schema_version: "execution.capital-intent.v2", workspace_id: workspace,
      resource: { kind: "PORTFOLIO", id: portfolio }, environment: "paper", expected_policy_revision: policy.revision,
      business_payload: { schema_version: "pma.capital-command.v1.1", operation: "TOP_UP", idempotency_key: next("key"),
        recipient_kind: "PORTFOLIO", currency: "USDT", reason: "TEST_ONLY real command writer (no source send)",
        amount: "10.000000000000000001", expected_versions: { budget: "9007199254740993", source: "2", parent: "3" } } };
    // OWNER_VERIFIED is the command DTO branch under test, not a claim that
    // this detached TEST_ONLY source/trust profile was actually commissioned.
    const authorization = commandAuthorization.parse({ qualification: "OWNER_VERIFIED", reference: next("authorization"),
      authority_ref: "TEST_ONLY:PM", profile_ref: "TEST_ONLY:uninstalled", audience: "pma.management.v1", actor_id: owner.user_id,
      ts_user_id: author.source.ts_user_id, workload_ref: "TEST_ONLY:old-command-workload", delegation_ref: next("native-reference"),
      mapping_revision: author.grant.ts_receipt!.mapping_revision, membership_revision: author.grant.ts_receipt!.membership_revision,
      membership_receipt_ref: author.grant.ts_receipt!.receipt_id, workspace_id: workspace, environment: "paper",
      operation: intent.business_payload.operation, resource_kind: intent.resource.kind, resource_id: portfolio,
      policy_revision: policy.revision, intent_hash: intentHash(owner, intent),
      source_intent_digest: accessDigest(["TEST_ONLY source-intent", intent]).slice(7), expected_versions: intent.business_payload.expected_versions,
      issued_at_ms: now - 1000, expires_at_ms: now + 50_000, idempotency_retained_until_ms: now + 240_000,
      approval_required: false, required_approval_gate: null, approval: null, r2_basis: null,
      commit_checks: { human: true, workload: true, membership: true, scope: true, versions: true, capacity: true, approval: true } });
    const send = vi.fn<CommandTrust["send"]>(async () => { throw new Error("TEST_ONLY source deliberately unavailable"); });
    const command = new ExecutionCommandService(ctx.pool, access,
      { prepare: async () => authorization, send, lookup: async () => null }, true);
    const submitted = await command.submit(owner, intent, previewHash(authorization));
    expect(submitted).toMatchObject({ delivery: "DELIVERY_UNKNOWN", business: { state: "UNKNOWN" } });
    expect(send).toHaveBeenCalledOnce();
    const stored = (await new CommandStore(ctx.pool).get(workspace, submitted.command_id))!;
    expect(stored.authorization).toEqual(authorization); expect(stored.intent).toEqual(intent);
    const original = { gateway_ref: gateway, reference: next("TEST_ONLY-edge-original"), authorization_digest: accessDigest(stored.authorization),
      intent_hash: stored.hash, request_digest: accessDigest(["TEST_ONLY Edge request", stored.id]),
      transport_payload_digest: accessDigest(["TEST_ONLY source payload", stored.id]), source_intent_digest: authorization.source_intent_digest,
      source_key: ["TEST_ONLY:scope", "TOP_UP", intent.business_payload.idempotency_key] as [string, string, string], target_ref: portfolio };
    const input: CommandStatusInput = { authorization: stored.authorization, intent: stored.intent, actor: session.actor, original,
      action: "STATUS", call_digest: accessDigest(["TEST_ONLY status call", stored.id]),
      contract: { reference: "TEST_ONLY:contract", sha256: "a".repeat(64), edge_source_revision: "TEST_ONLY:source" }, signal: new AbortController().signal };
    const pmBody = JSON.stringify({ schema_version: "pma.edge-command-transport.v1", reference: next("distinct-PM-reference"),
      payload: { TEST_ONLY: "owning source mapping" }, transport_payload_digest: original.transport_payload_digest });
    const requestDigest = pmHttpRequestDigest({ method: "POST", raw_path: Buffer.from(COMMAND_STATUS_PM_PATH),
      query_string: Buffer.alloc(0), body: Buffer.from(pmBody) }, { request_bytes: 1_048_576 });
    const body = JSON.stringify({ schema_version: "execution.core-command-status-request.v1", original, call_digest: input.call_digest,
      pm_status_request_digest: requestDigest, core_request: { schema_version: "execution.core-pm-original.v1", action: "STATUS",
        operation: "TOP_UP", key: intent.business_payload.idempotency_key, payload: { TEST_ONLY: "source mapping" },
        payload_digest: original.transport_payload_digest, request_digest: original.request_digest } });
    const issue: CommandSourceAssertionRequest = { schema_version: "portal.execution.command-source-assertion-request.v1",
      binding_digest: accessDigest({ original, call: input.call_digest }), receiver_id: gateway, workload_id: workload,
      method: "POST", path: COMMAND_STATUS_PM_PATH, body_utf8: pmBody, request_digest: requestDigest,
      delivery_sequence: 0, previous_lease_id: null };
    const binding: CurrentHumanBinding = { workspace_id: workspace, environment: "paper", workload_id: workload, request_digest: requestDigest };
    return { workspace, input, body, issue, binding, reader, stored, session, access, policy };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  const authority = (f: Fixture) => {
    const result = new CommandSourceAssertionAuthority(ctx.pool, f.access, candidate, {
      issuer: "TEST_ONLY:Core-STATUS", audience: gateway, key_id: "TEST_ONLY:status-key", key: humanKey.privateKey,
      workload_id: workload, ttl_ms: 30_000, maximum_contexts: 4, maximum_requests_per_context: 4 });
    authorities.push(result); return result;
  };
  const completion = (f: Fixture, issued: Issued) => ({ schema_version: "portal.execution.command-source-assertion-completion-request.v1",
    binding_digest: f.issue.binding_digest, receiver_id: gateway, workload_id: workload, delivery_sequence: issued.delivery_sequence,
    lease_id: issued.lease_id, request_digest: issued.request_digest, response_digest: accessDigest("TEST_ONLY exact PM response bytes") });
  const proof = async (f: Fixture, issued: Issued, attempt: string, phase: "ENTER" | "UNKNOWN" | "COMMITTED" | "ROLLED_BACK") => {
    const now = Math.floor(Date.now() / 1000), terminal = phase === "COMMITTED" || phase === "ROLLED_BACK";
    return new SignJWT({ iss: config.source.issuer, aud: config.source.audience, sub: workload, jti: randomUUID(),
      iat: now, nbf: now, exp: now + 60, purpose: "pma.current-human-lease.v1", ...f.binding,
      lease_id: issued.lease_id, attempt_id: attempt, phase,
      source_receipt_id: terminal ? "TEST_ONLY:terminal-" + issued.lease_id : null,
      source_receipt_digest: terminal ? accessDigest(["TEST_ONLY signed source terminal", issued.lease_id, phase]) : null,
    }).setProtectedHeader({ alg: "EdDSA", kid: config.source.key_id, typ: "JWT" }).sign(sourceKey.privateKey);
  };

  beforeAll(async () => {
    const target = new URL(database!);
    if (!/^control-api-test-postgres-[a-zA-Z0-9_-]+$/u.test(target.hostname) || target.pathname !== "/portal_control_test")
      throw new Error("COMMAND_STATUS_DISPOSABLE_DATABASE_REQUIRED");
    await migrateTestDatabase(database!);
    // setupApp reuses this bounded pool, rather than mutating a cached pool.
    buildPool(database!, { max: 3, connectionTimeoutMillis: 2000, statement_timeout: 5000,
      query_timeout: 6000, idle_in_transaction_session_timeout: 5000 });
    ctx = await setupApp({ DATABASE_URL: database! }); auth = ctx.app.get(AuthService);
    vi.spyOn(auth, "verifyAccessIdentity").mockImplementation(async assertion => ({
      iss: "https://test-only.cloudflareaccess.com", sub: `TEST_ONLY:${assertion}`, aud: "test-audience",
      email: `${assertion}@azdag.com`, normalizedEmail: `${assertion}@azdag.com`, authenticationTime: new Date(), tokenExpiresAt: new Date(Date.now() + 60_000),
    }));
    const author = await person("author"), reviewer = await person("reviewer");
    owner = (await author.login()).actor; reviewerId = reviewer.id;
    await new OwnerAccessRepository(ctx.pool).claimOwner({ userId: owner.user_id, claimedBy: "COMMAND_STATUS_PRIVATE_TEST_ONLY" });
    await new AccountLifecycleRepository(ctx.pool).grantStepUp({ stepUpId: next("step-up"), sessionId: owner.session_id,
      userId: owner.user_id, ttlSeconds: 600 });
    // Authentication and real original writers run before candidate authority
    // guards are installed. Later revocation uses the actual drain coordinator.
    for (let n = 0; n < 4; n++) fixtures.push(await fixture(await reviewer.login()));
    const bootstrap = await author.login();
    [humanKey, sourceKey] = await Promise.all([generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true }),
      generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true })]);
    await ctx.pool.query(await readFile(join(__dirname, "../src/execution-v2/current-human-candidate.sql"), "utf8"));
    config = { issuer: "TEST_ONLY:Core", audience: "TEST_ONLY:PM", key_id: "TEST_ONLY:human-key", private_key: humanKey.privateKey,
      source: { issuer: "TEST_ONLY:PM", audience: "TEST_ONLY:Core-authority", key_id: "TEST_ONLY:source-key",
        public_key: sourceKey.publicKey, workload_id: workload }, limits: { ttl_ms: 30_000, maximum_unresolved: 4, maximum_retained: 16 } };
    candidate = await CurrentHumanCandidate.create(ctx.pool, config);
    const mutations = new CurrentHumanMutations(ctx.pool, candidate,
      { recover: async () => { throw new Error("TEST_ONLY unexpected unresolved source attempt"); } },
      { maximum_intents: 8, maximum_recoveries_per_request: 4 });
    coordinatedAuth = new AuthService(ctx.pool, ctx.config, auth.argon2, mutations);
    // A genuine normal logout advances authority from its fresh zero revision;
    // no direct UPDATE of the authority singleton substitutes for a writer.
    await coordinatedAuth.logout(bootstrap.token);
    expect(Number((await ctx.pool.query("SELECT revision FROM elp210_candidate.authority WHERE singleton")).rows[0].revision)).toBeGreaterThan(0);
    const caKey = generateKeyPairSync("ec", { namedCurve: "prime256v1" }), name = commonName("TEST_ONLY:STATUS-PG-CA");
    const ca: TestAuthority = { key: caKey.privateKey, name, certificate: testCertificate(name, caKey, { name, key: caKey.privateKey }, true) };
    const identity = (label: string): Identity => {
      const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" }), cert = testCertificate(commonName(label), pair, ca, false);
      return { key: Buffer.from(pair.privateKey.export({ type: "pkcs8", format: "pem" })), cert, ca: ca.certificate,
        pin: `sha256:${createHash("sha256").update(new X509Certificate(cert).raw).digest("hex")}` };
    };
    core = identity("TEST_ONLY:STATUS-PG-Core"); edge = identity("TEST_ONLY:STATUS-PG-Edge"); foreign = identity("TEST_ONLY:STATUS-PG-other");
  }, 120_000);
  afterEach(async () => {
    for (const { server, sockets } of listeners.splice(0)) {
      for (const socket of sockets) socket.destroy();
      if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
  afterAll(async () => {
    authorities.forEach(value => value.shutdown()); vi.restoreAllMocks();
    if (ctx) { await ctx.pool.query("DROP SCHEMA IF EXISTS elp210_candidate CASCADE"); await teardownApp(ctx); }
  });

  async function listen(issuer: CommandSourceAssertionAuthority) {
    const t = createCommandSourceAssertionTransport(issuer, { tls: { key: core.key, cert: core.cert, ca: core.ca },
      peer: { certificate_sha256: edge.pin, dns_name: "localhost", workload_id: workload },
      limits: { maximum_in_flight: 2, request_bytes: 131_072, response_bytes: 65_536, deadline_ms: 5000 } });
    const sockets = new Set<Duplex>(); listeners.push({ server: t.server, sockets });
    for (const event of ["connection", "secureConnection"] as const) t.server.on(event, socket => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
    t.server.on("tlsClientError", () => undefined);
    await new Promise<void>((resolve, reject) => { t.server.once("error", reject); t.server.listen(0, "127.0.0.1", () => { t.server.off("error", reject); resolve(); }); });
    const address = t.server.address(); if (!address || typeof address === "string") throw new Error("TEST_ONLY ADDRESS REQUIRED");
    return `https://127.0.0.1:${address.port}`;
  }
  async function post(origin: string, token: string, body: unknown, client = edge, path = "/internal/elp210/command-source/assertion") {
    const bytes = JSON.stringify(body);
    return new Promise<{ status: number; json: Record<string, unknown> }>((resolve, reject) => {
      const req = request(new URL(path, origin), { key: client.key, cert: client.cert, ca: client.ca,
        agent: false, method: "POST", rejectUnauthorized: true,
        minVersion: "TLSv1.3", maxVersion: "TLSv1.3", headers: { authorization: `Bearer ${token}`,
          "content-type": "application/json", "content-length": Buffer.byteLength(bytes) } }, res => {
        const chunks: Buffer[] = []; res.on("data", chunk => chunks.push(Buffer.from(chunk)));
        res.on("end", () => { try { resolve({ status: res.statusCode ?? 0, json: JSON.parse(Buffer.concat(chunks).toString()) }); } catch (error) { reject(error); } }); res.on("error", reject);
      });
      req.on("error", reject); req.setTimeout(10_000, () => req.destroy(new Error("TEST_ONLY CLIENT DEADLINE"))); req.end(bytes);
    });
  }

  it("binds the real stored original to a different current password session through actual pinned mTLS", async () => {
    const f = fixtures[0], service = authority(f), before = await commandRows(f.workspace);
    const substituted = { ...f.input.authorization, reference: next("not-the-stored-authorization") };
    await expect(service.prepare({ ...f.input, authorization: substituted,
      original: { ...f.input.original, authorization_digest: accessDigest(substituted) } }, f.body))
      .rejects.toMatchObject({ code: "COMMAND_STATUS_ASSERTION_AUTHORITY_REQUIRED" });
    expect(await leases(f.workspace)).toHaveLength(0);
    const prepared = await service.prepare(f.input, f.body), origin = await listen(service);
    const signed = await jwtVerify(prepared.token, humanKey.publicKey, { issuer: "TEST_ONLY:Core-STATUS", audience: gateway });
    expect(signed.payload).toMatchObject({ purpose: "execution.command-status-authority.v1", action: "STATUS",
      sub: reviewerId, current_actor: reviewerId, sid: f.input.actor.session_id, session_generation: f.input.actor.session_generation,
      authorization_id: f.stored.authorization.reference, intent_id: f.stored.hash, original_sha256: accessDigest(f.input.original),
      policy_revision: f.policy.revision, scope_revision: expect.any(String), authority_revision: expect.any(String) });
    expect(reviewerId).not.toBe(f.stored.actor);
    await expect(post(origin, prepared.original_context, f.issue, foreign)).rejects.toThrow();
    expect(await leases(f.workspace)).toHaveLength(0); // Socket is refused before any HTTP/ISSUE.
    const first = await post(origin, prepared.original_context, f.issue), again = await post(origin, prepared.original_context, f.issue);
    expect(first.status).toBe(200); expect(again).toEqual(first);
    const issued = first.json as unknown as Issued;
    expect(decodeJwt(issued.assertion)).toMatchObject({ purpose: "pma.identity.v1", sub: reviewerId,
      sid: f.input.actor.session_id, session_revision: f.input.actor.session_generation, request_digest: f.binding.request_digest });
    const rows = await leases(f.workspace);
    expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ lease_id: issued.lease_id, subject_id: reviewerId,
      session_id: f.input.actor.session_id, phase: "ISSUED", attempt_id: null, terminal_receipt_digest: null });
    const attempt = randomUUID(); await candidate.enter(issued.assertion, await proof(f, issued, attempt, "ENTER"));
    await candidate.resolve(await proof(f, issued, attempt, "ROLLED_BACK"));
    const ack = await post(origin, prepared.original_context, completion(f, issued), edge, "/internal/elp210/command-source/complete");
    expect(ack.status).toBe(200); expect(ack.json).toMatchObject({ completed: true, lease_id: issued.lease_id });
    expect(await commandRows(f.workspace)).toEqual(before); // STATUS never SUBMITs or rewrites the original.
  }, 30_000);

  it("keeps UNKNOWN on the same PG attempt until signed original recovery and separate completion", async () => {
    const f = fixtures[1], service = authority(f), prepared = await service.prepare(f.input, f.body);
    const issued = await service.issue(prepared.original_context, f.issue), attempt = randomUUID();
    await candidate.enter(issued.assertion, await proof(f, issued, attempt, "ENTER"));
    await candidate.resolve(await proof(f, issued, attempt, "UNKNOWN"));
    const before = (await leases(f.workspace))[0];
    expect(before).toMatchObject({ phase: "UNKNOWN", attempt_id: attempt, terminal_receipt_digest: null });
    await expect(service.complete(prepared.original_context, completion(f, issued))).rejects.toMatchObject({ code: "CURRENT_HUMAN_ENTRY_NOT_AVAILABLE" });
    await expect(service.issue(prepared.original_context, { ...f.issue, delivery_sequence: 1, previous_lease_id: issued.lease_id }))
      .rejects.toMatchObject({ code: "COMMAND_STATUS_ASSERTION_DELIVERY_NOT_COMPLETED" });
    expect((await service.prepare(f.input, f.body)).original_context).toBe(prepared.original_context);
    expect(await leases(f.workspace)).toEqual([before]);
    const restarted = await CurrentHumanCandidate.create(ctx.pool, config);
    await restarted.resolve(await proof(f, issued, attempt, "COMMITTED"));
    const terminal = (await leases(f.workspace))[0];
    expect(terminal).toMatchObject({ phase: "COMMITTED", attempt_id: attempt, lease_id: before.lease_id,
      authority_fingerprint: before.authority_fingerprint, request_digest: before.request_digest,
      terminal_receipt_digest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u) });
    await expect(service.issue(prepared.original_context, { ...f.issue, delivery_sequence: 1, previous_lease_id: issued.lease_id }))
      .rejects.toMatchObject({ code: "COMMAND_STATUS_ASSERTION_DELIVERY_NOT_COMPLETED" });
    const ack = await service.complete(prepared.original_context, completion(f, issued));
    expect(await service.complete(prepared.original_context, completion(f, issued))).toEqual(ack);
    expect((await service.prepare(f.input, f.body)).original_context).not.toBe(prepared.original_context);
    expect(await leases(f.workspace)).toEqual([terminal]); // ACK/preparation do not issue replacement credentials.
  }, 30_000);

  it("rechecks current source scope after PG original preparation and refuses a cross-workspace original", async () => {
    const f = fixtures[2], service = authority(f), prepared = await service.prepare(f.input, f.body), before = await commandRows(f.workspace);
    const foreignInput = { ...f.input, intent: { ...f.input.intent, workspace_id: fixtures[1].workspace } };
    await expect(service.prepare(foreignInput, f.body)).rejects.toMatchObject({ code: "COMMAND_STATUS_ASSERTION_BINDING_MISMATCH" });
    // Fault only the explicitly TEST_ONLY upstream response, not the real Core
    // context/evaluator, stored grant, session or immutable command original.
    f.reader.source.grants[0].targets = [];
    await expect(service.issue(prepared.original_context, f.issue)).rejects.toMatchObject({ code: "COMMAND_STATUS_ASSERTION_AUTHORITY_REQUIRED" });
    expect(await leases(f.workspace)).toHaveLength(0); expect(await commandRows(f.workspace)).toEqual(before);
    expect((await new AccessRepository(ctx.pool).grants(f.workspace)).find(g => g.grant_id === f.reader.grant.grant_id)?.revoked_at_ms).toBeNull();
  }, 30_000);

  it("actual coordinated password-session logout fences the prepared requester before any ISSUE", async () => {
    const f = fixtures[3], service = authority(f), prepared = await service.prepare(f.input, f.body), before = await commandRows(f.workspace);
    await coordinatedAuth.logout(f.session.token);
    const row = (await ctx.pool.query("SELECT state,revoke_reason FROM auth_sessions WHERE session_id=$1", [f.input.actor.session_id])).rows[0];
    expect(row).toEqual({ state: "REVOKED", revoke_reason: "logout" });
    await expect(service.issue(prepared.original_context, f.issue)).rejects.toMatchObject({ code: "CURRENT_ACTOR_AUTHORITY_REQUIRED" });
    expect(await leases(f.workspace)).toHaveLength(0); expect(await commandRows(f.workspace)).toEqual(before);
    expect((await ctx.pool.query("SELECT count(*)::int n FROM elp210_candidate.mutations WHERE state='FINISHED'")).rows[0].n).toBe(2);
  }, 30_000);
});
