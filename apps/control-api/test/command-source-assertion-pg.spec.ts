/** Real disposable Core PostgreSQL + real AuthService/password sessions,
 * access evaluator, command writer/store and CurrentHumanCandidate. The source
 * correspondences, source signatures and loopback PKI are explicitly TEST_ONLY:
 * this proves Core persistence/current-requester/custody fences, NOT an installed
 * PM grant, an economic COMMIT, an authenticated external human or commissioning.
 * No trusted-command row, positive Core context or terminal lease is SQL-seeded.
 */
import { createHash, generateKeyPairSync, randomUUID, X509Certificate } from "node:crypto";
import { fork, type ChildProcess } from "node:child_process";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { createServer, request, type Server } from "node:https";
import { join } from "node:path";
import type { Duplex } from "node:stream";
import { decodeJwt, exportPKCS8, exportSPKI, generateKeyPair, jwtVerify, SignJWT } from "jose";
import { Client, Pool } from "pg";
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
import { CommandSourceAssertionAuthority, COMMAND_STATUS_PM_PATH, COMMAND_STATUS_EDGE_PATH, type CommandStatusInput,
  type CommandSourceAssertionRequest, type CommandSourceAssertionResponse } from "../src/execution-v2/command-source-assertion";
import { createCommandSourceAssertionTransport } from "../src/execution-v2/command-source-assertion-transport";
import { ExecutionCommandService, intentHash, previewHash } from "../src/execution-v2/command.service";
import { CommandStore } from "../src/execution-v2/command.store";
import type { CommandIntent } from "../src/execution-v2/command.contract";
import { commandAuthorization, type CommandTrust } from "../src/execution-v2/command-trust";
import { CurrentHumanCandidate, type CurrentHumanBinding, type CurrentHumanCandidateConfig } from "../src/execution-v2/current-human-candidate";
import { CurrentHumanMutations } from "../src/execution-v2/current-human-mutations";
import { pmHttpRequestDigest } from "../src/execution-v2/pm-http-request-binding";
import { PgCommandStatusOriginalFingerprints } from "../src/execution-v2/command-status-original-fingerprints";
import { EdgeCommandStatusTransport, COMMAND_STATUS_ORIGINAL_PATH,
  type EdgeCommandStatusTransportConfig } from "../src/execution-v2/edge-command-status-transport";
import { commonName, testCertificate, type TestAuthority } from "./fixtures/elp210-test-certificates";
import { migrateTestDatabase, setupApp, teardownApp } from "./harness";

const database = process.env.TEST_DATABASE_URL;
const next = (label: string) => `TEST_ONLY:${label}:${randomUUID()}`;
const workload = "TEST_ONLY:command-status-pg-edge", gateway = "TEST_ONLY:command-status-pg-gateway";
type Identity = { key: Buffer; cert: Buffer; ca: Buffer; pin: string };
type Issued = CommandSourceAssertionResponse;

/** Keep the Docker guard, or independently prove the explicitly named private
 * Unix-socket cell before running ANY migration or test writer. */
async function requireDisposableDatabase(connectionString:string):Promise<void> {
  const target=new URL(connectionString);
  if(!["postgres:","postgresql:"].includes(target.protocol) || target.hash)
    throw new Error("COMMAND_STATUS_DISPOSABLE_DATABASE_REQUIRED");
  if(/^control-api-test-postgres-[a-zA-Z0-9_-]+$/u.test(target.hostname) && target.pathname==="/portal_control_test" &&
    target.username==="portal" && (target.port==="" || target.port==="5432") && !target.search)return;
  const socket=process.env.PORTAL_TEST_UNIX_PG_CELL;
  if(!socket || !/^\/tmp\/portal-status-pg-[A-Za-z0-9]{8}$/u.test(socket) ||
    target.searchParams.getAll("host").length!==1 || target.searchParams.get("host")!==socket ||
    [...target.searchParams.keys()].some(key=>key!=="host" && key!=="port") ||
    target.searchParams.getAll("port").length>1 || target.pathname!=="/portal_status_disposable")
    throw new Error("COMMAND_STATUS_DISPOSABLE_DATABASE_REQUIRED");
  const st=await lstat(socket);
  if(!st.isDirectory() || st.isSymbolicLink() || (st.mode & 0o777)!==0o700 ||
    st.uid!==process.getuid?.() || await realpath(socket)!==socket)
    throw new Error("COMMAND_STATUS_DISPOSABLE_DATABASE_REQUIRED");
  const probe=new Client({connectionString});
  try {
    await probe.connect();
    const row=(await probe.query(`SELECT current_database() AS database_name,
      inet_server_addr() IS NULL AS unix_only, current_setting('data_directory') AS data_directory,
      current_setting('listen_addresses') AS listen_addresses`)).rows[0];
    if(row.database_name!=="portal_status_disposable" || row.unix_only!==true ||
      row.data_directory!==join(socket,"data") || row.listen_addresses!=="")
      throw new Error("COMMAND_STATUS_DISPOSABLE_DATABASE_REQUIRED");
  } finally {await probe.end();}
}

describe("STATUS PostgreSQL disposable target guard", () => {
  it("rejects network target overrides before connecting", async () => {
    await expect(requireDisposableDatabase("postgres://portal:test@control-api-test-postgres-1234abcd:5432/portal_control_test")).resolves.toBeUndefined();
    for(const url of ["postgres://portal:test@control-api-test-postgres-1234abcd:5432/portal_control_test?host=other",
      "postgres://portal:test@control-api-test-postgres-1234abcd:5432/portal_control_test?hostaddr=127.0.0.1",
      "postgres://portal:test@control-api-test-postgres-1234abcd:5433/portal_control_test",
      "postgres://other:test@control-api-test-postgres-1234abcd:5432/portal_control_test"])
      await expect(requireDisposableDatabase(url)).rejects.toThrow("COMMAND_STATUS_DISPOSABLE_DATABASE_REQUIRED");
  });
});

describe.skipIf(!database).sequential("command STATUS concrete authority with real Core PG (TEST_ONLY source)", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>, auth: AuthService, coordinatedAuth: AuthService;
  let owner: AccessActor, reviewerId: string, candidate: CurrentHumanCandidate, config: CurrentHumanCandidateConfig;
  let humanKey: Awaited<ReturnType<typeof generateKeyPair>>, sourceKey: Awaited<ReturnType<typeof generateKeyPair>>;
  let core: Identity, edge: Identity, foreign: Identity;
  const fixtures: Awaited<ReturnType<typeof fixture>>[] = [];
  const authorities: CommandSourceAssertionAuthority[] = [];
  const listeners: { server: Server; sockets: Set<Duplex> }[] = [];
  const children: ChildProcess[] = [];
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
    return { workspace, input, body, issue, binding, reader, author, stored, session, access, policy, trust };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  const authority = (f: Fixture, selectedCandidate = candidate) => {
    const result = new CommandSourceAssertionAuthority(ctx.pool, f.access, selectedCandidate, {
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
    await requireDisposableDatabase(database!);
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
    for (let n = 0; n < 7; n++) fixtures.push(await fixture(await reviewer.login()));
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
    for (const child of children.splice(0)) if (child.exitCode === null) child.kill();
    for (const { server, sockets } of listeners.splice(0)) {
      for (const socket of sockets) socket.destroy();
      if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
  afterAll(async () => {
    authorities.forEach(value => value.shutdown()); vi.restoreAllMocks();
    if (ctx) {
      // A separately guarded disposable-cell rehearsal can snapshot the exact
      // synthetic leases produced by this suite before the whole cell is
      // destroyed. The ordinary test path continues to remove its schema.
      if (process.env.PORTAL_TEST_KEEP_STATUS_CUSTODY !== "TEST_ONLY_DISPOSABLE_RESTORE")
        await ctx.pool.query("DROP SCHEMA IF EXISTS elp210_candidate CASCADE");
      await teardownApp(ctx);
    }
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

  it("recovers the same ISSUED assertion and terminal ACK through pinned mTLS in a new OS process", async () => {
    const f=fixtures[4], before=await commandRows(f.workspace);
    f.input.call_digest=accessDigest({action:"STATUS",authority:"CURRENT_REQUESTER",requester_digest:accessDigest(f.input.actor),
      original:f.input.original,authorization_digest:accessDigest(f.input.authorization),intent_hash:f.input.authorization.intent_hash});
    f.body=JSON.stringify({...JSON.parse(f.body),call_digest:f.input.call_digest});
    f.issue.binding_digest=accessDigest({original:f.input.original,call:f.input.call_digest});
    // The Edge endpoint below is a private, synthetic source, not a real Edge
    // terminal or economic outcome. Both directions use pinned test mTLS.
    const requests:string[]=[];
    const source=createServer({key:edge.key,cert:edge.cert,ca:edge.ca,requestCert:true,rejectUnauthorized:true,
      minVersion:"TLSv1.3",maxVersion:"TLSv1.3"},(req,res)=>{
      const chunks:Buffer[]=[];req.on("data",chunk=>chunks.push(Buffer.from(chunk)));req.on("end",()=>{
        const bytes=Buffer.concat(chunks),body=JSON.parse(bytes.toString("utf8"));requests.push(req.url!);
        const a=f.input.authorization,i=f.input.intent;
        const value=req.url===COMMAND_STATUS_ORIGINAL_PATH?{schema_version:"execution.core-command-original-response.v1",
          original:f.input.original,status_request_utf8:JSON.stringify(JSON.parse(f.body).core_request),
          pm_status_request_digest:f.issue.request_digest}:
          {schema_version:"execution.core-command-status-response.v1",original_digest:accessDigest(body.original),
            call_digest:body.call_digest,delivered_request_digest:pmHttpRequestDigest({method:"POST",
              raw_path:Buffer.from(COMMAND_STATUS_EDGE_PATH),query_string:Buffer.alloc(0),body:bytes},{request_bytes:131_072}),
            full_outcome_custody:{reference:"TEST_ONLY:retained-outcome",digest:accessDigest("TEST_ONLY:retained-outcome")},
            result:{authority_ref:a.authority_ref,profile_ref:a.profile_ref,workspace_id:i.workspace_id,environment:"paper",
              operation:i.business_payload.operation,resource_kind:i.resource.kind,resource_id:i.resource.id,
              idempotency_key:i.business_payload.idempotency_key,source_intent_digest:a.source_intent_digest,
              delivery:"ACKNOWLEDGED",projection:"UNAVAILABLE",venue:"NOT_APPLICABLE",
              business:{state:"APPLIED",receipt_ref:"TEST_ONLY:receipt",source_event_ref:"TEST_ONLY:event",revision:"1",
                amounts:{requested:i.business_payload.amount,applied:i.business_payload.amount,pending:"0",cancelled:"0",rejected:"0"}}}};
        const result=JSON.stringify(value);res.writeHead(200,{"content-type":"application/json",
          "content-length":Buffer.byteLength(result),connection:"close"});res.end(result);
      });
    });
    const sourceSockets=new Set<Duplex>();listeners.push({server:source,sockets:sourceSockets});
    for(const event of ["connection","secureConnection"] as const)source.on(event,socket=>{sourceSockets.add(socket);socket.once("close",()=>sourceSockets.delete(socket));});
    source.on("tlsClientError",()=>undefined);
    await new Promise<void>((resolve,reject)=>{source.once("error",reject);source.listen(0,"127.0.0.1",()=>{source.off("error",reject);resolve();});});
    const sourceAddress=source.address();if(!sourceAddress||typeof sourceAddress==="string")throw Error("TEST_ONLY ADDRESS REQUIRED");
    const edgeConfig:EdgeCommandStatusTransportConfig={mode:"EXPLICIT_CURRENT_REQUESTER_STATUS_ONLY",
      origin:`https://127.0.0.1:${sourceAddress.port}`,gateway_ref:gateway,tls:{key:core.key,cert:core.cert,ca:core.ca},
      peer:{certificate_sha256:edge.pin,dns_name:"localhost"},
      limits:{maximum_in_flight:2,deadline_ms:5000,request_bytes:131_072,response_bytes:65_536,maximum_originals:4}};
    const first=authority(f),port=new EdgeCommandStatusTransport(first,edgeConfig,new PgCommandStatusOriginalFingerprints(ctx.pool));
    first.bindRecoverySource(port,f.input.contract);
    expect(await port.original(f.input)).toEqual(f.input.original);
    const outbound=await port.prepareStatus(f.input),prepared=await first.prepare(f.input,f.body);
    expect(outbound.prepared.assertion_ref).toBe(prepared.original_context);
    const issued=await first.issue(prepared.original_context,f.issue);
    // The next authority runs in a distinct OS process with a fresh pool and
    // no parent in-memory contexts. Only TEST_ONLY pins, key material and
    // synthetic relations/original are passed privately over IPC.
    first.shutdown();
    const child=fork(join(__dirname,"fixtures/command-status-recovery-child.cjs"),[],{
      stdio:["ignore","ignore","ignore","ipc"],env:{...process.env,JITI_FS_CACHE:"false"}});
    children.push(child);
    const ready=new Promise<number>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error("TEST_ONLY_CHILD_START_TIMEOUT")),15000);
      child.once("error",error=>{clearTimeout(timer);reject(error);});
      child.once("exit",code=>{clearTimeout(timer);reject(new Error(`TEST_ONLY_CHILD_EXIT_${code}`));});
      child.on("message",(message:{type:string;port?:number;message?:string})=>{
        if(message.type==="READY"&&message.port){clearTimeout(timer);resolve(message.port);}
        else if(message.type==="ERROR"){clearTimeout(timer);reject(new Error(message.message));}
      });
    });
    const {private_key:_private,...candidateConfig}=config;
    const {public_key:_public,...candidateSource}=config.source;
    child.send({type:"START",database,portfolio:f.input.intent.resource.id,
      relations:[[owner.user_id,f.author.source],[reviewerId,f.reader.source]],original:f.input.original,contract:f.input.contract,
      candidate:{...candidateConfig,source:candidateSource},humanPrivate:await exportPKCS8(humanKey.privateKey),
      sourcePublic:await exportSPKI(sourceKey.publicKey),authority:{issuer:"TEST_ONLY:Core-STATUS",audience:gateway,
        key_id:"TEST_ONLY:status-key",workload_id:workload,ttl_ms:30000,maximum_contexts:4,maximum_requests_per_context:4},
      core:{key:core.key.toString("base64"),cert:core.cert.toString("base64"),ca:core.ca.toString("base64")},
      peer:{certificate_sha256:edge.pin,dns_name:"localhost",workload_id:workload},edgeTransport:{...edgeConfig,
        tls:{key:core.key.toString("base64"),cert:core.cert.toString("base64"),ca:core.ca.toString("base64")}}});
    const childOrigin=`https://127.0.0.1:${await ready}`;
    const beforeCallback=new Promise<unknown>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error("TEST_ONLY_CHILD_PREPARE_TIMEOUT")),5000);
      const onMessage=(message:{type:string;code?:string;result?:unknown})=>{
        if(message.type==="PREPARED"){clearTimeout(timer);child.off("message",onMessage);resolve(message.result);}
        if(message.type==="PREPARE_REFUSED"){clearTimeout(timer);child.off("message",onMessage);reject(new Error(message.code));}
      };
      child.on("message",onMessage);
    });
    const {signal:_signal,...retryInput}=f.input;
    child.send({type:"PREPARE",input:retryInput,body:f.body});
    expect(await beforeCallback).toEqual(prepared);
    await expect(post(childOrigin,prepared.original_context,f.issue,foreign)).rejects.toThrow();
    const replay=await post(childOrigin,prepared.original_context,f.issue,edge);
    expect(replay.status).toBe(200);expect(replay.json).toEqual(issued);
    const restored=new Promise<unknown>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error("TEST_ONLY_CHILD_PREPARE_TIMEOUT")),5000);
      const onMessage=(message:{type:string;result?:unknown})=>{
        if(message.type==="PREPARED"){clearTimeout(timer);child.off("message",onMessage);resolve(message.result);}
      };
      child.on("message",onMessage);
    });
    child.send({type:"PREPARE",input:retryInput,body:f.body});
    expect(await restored).toEqual(prepared); // Same context AND signed outbound token after restart.
    const changed=await post(childOrigin,prepared.original_context,{...f.issue,body_utf8:f.issue.body_utf8+" "},edge);
    expect(changed.status).not.toBe(200);
    expect(await leases(f.workspace)).toHaveLength(1);
    const attempt=randomUUID();await candidate.enter(issued.assertion,await proof(f,issued,attempt,"ENTER"));
    expect((await post(childOrigin,prepared.original_context,f.issue,edge)).status).not.toBe(200);
    // An unresolved attempt must not become an ACK during restart.
    await candidate.resolve(await proof(f,issued,attempt,"UNKNOWN"));
    const requestBody=completion(f,issued),path="/internal/elp210/command-source/complete";
    const unresolved=await post(childOrigin,prepared.original_context,requestBody,edge,path);
    expect(unresolved.status).not.toBe(200);
    expect((await ctx.pool.query("SELECT count(*)::int AS n FROM execution_command_status_delivery_acks WHERE lease_id=$1",[issued.lease_id])).rows[0].n).toBe(0);
    await candidate.resolve(await proof(f,issued,attempt,"COMMITTED"));
    const accepted=await post(childOrigin,prepared.original_context,requestBody,edge,path);
    expect(accepted.status).toBe(200);expect(accepted.json).toMatchObject({completed:true,lease_id:issued.lease_id});
    expect(await post(childOrigin,prepared.original_context,requestBody,edge,path)).toEqual(accepted);
    // A second authenticated callback in the new process is idempotent only
    // for the same exact response. Do not let a different digest replace the
    // durable acknowledgement or silently pass as the original source result.
    const changedAck=await post(childOrigin,prepared.original_context,
      {...requestBody,response_digest:accessDigest("TEST_ONLY different response")},edge,path);
    expect(changedAck.status).not.toBe(200);
    const acknowledgements=await ctx.pool.query("SELECT response_digest FROM execution_command_status_delivery_acks WHERE lease_id=$1",[issued.lease_id]);
    expect(acknowledgements.rows).toEqual([{response_digest:requestBody.response_digest}]);
    expect(await leases(f.workspace)).toHaveLength(1);expect(await commandRows(f.workspace)).toEqual(before);
    const edgePrepared=new Promise<{prepared:typeof outbound.prepared}>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error("TEST_ONLY_EDGE_PREPARE_TIMEOUT")),10_000);
      const onMessage=(message:{type:string;code?:string;result?:{prepared:typeof outbound.prepared}})=>{
        if(message.type==="EDGE_PREPARED"&&message.result){clearTimeout(timer);child.off("message",onMessage);resolve(message.result);}
        if(message.type==="EDGE_PREPARE_REFUSED"){clearTimeout(timer);child.off("message",onMessage);reject(Error(message.code));}
      };child.on("message",onMessage);
    });
    child.send({type:"EDGE_PREPARE",input:retryInput});
    const recoveredOutbound=await edgePrepared;
    expect(recoveredOutbound.prepared).toEqual(outbound.prepared);
    const edgeStatus=new Promise<{result:{business:{state:string}}}>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error("TEST_ONLY_EDGE_STATUS_TIMEOUT")),10_000);
      const onMessage=(message:{type:string;code?:string;result?:{result:{business:{state:string}}}})=>{
        if(message.type==="EDGE_STATUS_RESULT"&&message.result){clearTimeout(timer);child.off("message",onMessage);resolve(message.result);}
        if(message.type==="EDGE_STATUS_REFUSED"){clearTimeout(timer);child.off("message",onMessage);reject(Error(message.code));}
      };child.on("message",onMessage);
    });
    child.send({type:"EDGE_STATUS",input:retryInput,prepared:recoveredOutbound.prepared});
    expect((await edgeStatus).result.business.state).toBe("APPLIED");
    expect(requests.filter(path=>path===COMMAND_STATUS_EDGE_PATH)).toHaveLength(1);
    expect(await leases(f.workspace)).toHaveLength(1);expect(await commandRows(f.workspace)).toEqual(before);
    // Revoke through the real coordinated logout, not by editing a session or
    // policy row. The already-restored context in the other process must no
    // longer return success, and revocation must not rewrite custody or ACK.
    await coordinatedAuth.logout(f.session.token);
    const afterRevoke=await post(childOrigin,prepared.original_context,requestBody,edge,path);
    expect(afterRevoke.status).not.toBe(200);
    expect((await ctx.pool.query("SELECT response_digest FROM execution_command_status_delivery_acks WHERE lease_id=$1",[issued.lease_id])).rows)
      .toEqual([{response_digest:requestBody.response_digest}]);
    expect(await leases(f.workspace)).toHaveLength(1);expect(await commandRows(f.workspace)).toEqual(before);
    const stopped = new Promise<void>(resolve => child.once("exit", () => resolve()));
    child.send({type:"STOP"});
    await stopped;
  },60_000);

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

  it("rejoins the winning context after two authorities prepare before the first lease commits", async () => {
    const f=fixtures[5],winner=authority(f),loser=authority(f);
    f.input.call_digest=accessDigest({action:"STATUS",authority:"CURRENT_REQUESTER",requester_digest:accessDigest(f.input.actor),
      original:f.input.original,authorization_digest:accessDigest(f.input.authorization),intent_hash:f.input.authorization.intent_hash});
    f.body=JSON.stringify({...JSON.parse(f.body),call_digest:f.input.call_digest});
    f.issue.binding_digest=accessDigest({original:f.input.original,call:f.input.call_digest});
    await new PgCommandStatusOriginalFingerprints(ctx.pool).pin({
      binding_digest:accessDigest({gateway_ref:gateway,authorization_digest:f.input.original.authorization_digest,
        intent_hash:f.input.original.intent_hash,source_intent_digest:f.input.original.source_intent_digest}),
      original_digest:accessDigest(f.input.original),status_bytes_digest:accessDigest("TEST_ONLY:retained source wire"),
      pm_status_request_digest:f.issue.request_digest,workspace_id:f.workspace,
      key_hash:accessDigest(f.input.intent.business_payload.idempotency_key),intent_hash:f.stored.hash,
      intent_digest:accessDigest(f.input.intent),authorization_digest:accessDigest(f.input.authorization),actor_id:f.stored.actor,
    });
    winner.bindRecoverySource({original:async()=>structuredClone(f.input.original)},f.input.contract);
    loser.bindRecoverySource({original:async()=>structuredClone(f.input.original)},f.input.contract);
    const first=await winner.prepare(f.input,f.body),rival=await loser.prepare(f.input,f.body);
    expect(rival).toEqual(first);
    const issued=await winner.issue(first.original_context,f.issue);
    await expect(loser.issue(rival.original_context,f.issue))
      .rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_CUSTODY_RECOVERY_REQUIRED"});
    // The exact callback retry joins the already-issued winner directly; it
    // neither needs a new PREPARE nor creates a second lease or ACK.
    expect(await loser.issue(rival.original_context,f.issue)).toEqual(issued);
    expect(await loser.prepare(f.input,f.body)).toEqual(first);
    expect(await leases(f.workspace)).toHaveLength(1);
    const attempt=randomUUID();await candidate.enter(issued.assertion,await proof(f,issued,attempt,"ENTER"));
    await candidate.resolve(await proof(f,issued,attempt,"ROLLED_BACK"));
    await winner.complete(first.original_context,completion(f,issued));
    expect(await leases(f.workspace)).toHaveLength(1);
    expect(await winner.prepare(f.input,f.body)).toEqual(first);
    expect(await leases(f.workspace)).toHaveLength(1);
    // Simulate a fresh authority with no process-local context in the narrow
    // gap after the exact terminal/Edge ACK but before Core consumes the
    // retained response. It must restore the linked lease, never treat the
    // persisted preparation as an unissued reservation and mint a new lease.
    const afterRestart=authority(f);
    afterRestart.bindRecoverySource({original:async()=>structuredClone(f.input.original)},f.input.contract);
    expect(await afterRestart.prepare(f.input,f.body)).toEqual(first);
    await expect(afterRestart.issue(first.original_context,f.issue)).rejects.toThrow();
    expect(await leases(f.workspace)).toHaveLength(1);
    await afterRestart.acknowledgeRetainedRead(first.original_context,f.input);
    const next=await afterRestart.prepare(f.input,f.body);
    expect(next.original_context).not.toBe(first.original_context);
    // A stale process retaining the previous context cannot issue a successor
    // after the new local read was admitted, even though its old ACK remains.
    await expect(winner.issue(first.original_context,{...f.issue,delivery_sequence:1,previous_lease_id:issued.lease_id}))
      .rejects.toMatchObject({code:"CURRENT_HUMAN_COMMAND_STATUS_PREPARATION_RETIRED"});
    const second=await afterRestart.issue(next.original_context,f.issue);
    expect(second.lease_id).not.toBe(issued.lease_id);
    const secondAttempt=randomUUID();await candidate.enter(second.assertion,await proof(f,second,secondAttempt,"ENTER"));
    await candidate.resolve(await proof(f,second,secondAttempt,"ROLLED_BACK"));
    await afterRestart.complete(next.original_context,completion(f,second));
    expect(await leases(f.workspace)).toHaveLength(2);
  },30_000);

  it("recovers a persisted pre-lease context in a new OS process over pinned mTLS without inventing a source receipt", async () => {
    const f=fixtures[6];
    f.input.call_digest=accessDigest({action:"STATUS",authority:"CURRENT_REQUESTER",requester_digest:accessDigest(f.input.actor),
      original:f.input.original,authorization_digest:accessDigest(f.input.authorization),intent_hash:f.input.authorization.intent_hash});
    f.body=JSON.stringify({...JSON.parse(f.body),call_digest:f.input.call_digest});
    f.issue.binding_digest=accessDigest({original:f.input.original,call:f.input.call_digest});
    await new PgCommandStatusOriginalFingerprints(ctx.pool).pin({
      binding_digest:accessDigest({gateway_ref:gateway,authorization_digest:f.input.original.authorization_digest,
        intent_hash:f.input.original.intent_hash,source_intent_digest:f.input.original.source_intent_digest}),
      original_digest:accessDigest(f.input.original),status_bytes_digest:accessDigest("TEST_ONLY:retained source wire"),
      pm_status_request_digest:f.issue.request_digest,workspace_id:f.workspace,
      key_hash:accessDigest(f.input.intent.business_payload.idempotency_key),intent_hash:f.stored.hash,
      intent_digest:accessDigest(f.input.intent),authorization_digest:accessDigest(f.input.authorization),actor_id:f.stored.actor,
    });
    const original={original:async()=>structuredClone(f.input.original)};
    const first=authority(f);first.bindRecoverySource(original,f.input.contract);
    const prepared=await first.prepare(f.input,f.body);
    expect(await leases(f.workspace)).toHaveLength(0);
    const reserved=await ctx.pool.query("SELECT * FROM execution_command_status_preparations WHERE workspace_id=$1",[f.workspace]);
    expect(reserved.rowCount).toBe(1);
    expect(JSON.stringify(reserved.rows)).not.toContain(prepared.token);
    expect(JSON.stringify(reserved.rows)).not.toContain(prepared.original_context);
    first.shutdown();
    const child=fork(join(__dirname,"fixtures/command-status-recovery-child.cjs"),[],{
      stdio:["ignore","ignore","ignore","ipc"],env:{...process.env,JITI_FS_CACHE:"false"}});
    children.push(child);
    const ready=new Promise<number>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error("TEST_ONLY_CHILD_START_TIMEOUT")),15000);
      child.once("error",error=>{clearTimeout(timer);reject(error);});
      child.once("exit",code=>{clearTimeout(timer);reject(new Error(`TEST_ONLY_CHILD_EXIT_${code}`));});
      child.on("message",(message:{type:string;port?:number;message?:string})=>{
        if(message.type==="READY"&&message.port){clearTimeout(timer);resolve(message.port);}
        else if(message.type==="ERROR"){clearTimeout(timer);reject(new Error(message.message));}
      });
    });
    const {private_key:_private,...candidateConfig}=config;
    const {public_key:_public,...candidateSource}=config.source;
    const startMessage={type:"START",database,portfolio:f.input.intent.resource.id,
      relations:[[owner.user_id,f.author.source],[reviewerId,f.reader.source]],original:f.input.original,contract:f.input.contract,
      candidate:{...candidateConfig,source:candidateSource},humanPrivate:await exportPKCS8(humanKey.privateKey),
      sourcePublic:await exportSPKI(sourceKey.publicKey),authority:{issuer:"TEST_ONLY:Core-STATUS",audience:gateway,
        key_id:"TEST_ONLY:status-key",workload_id:workload,ttl_ms:30000,maximum_contexts:4,maximum_requests_per_context:4},
      core:{key:core.key.toString("base64"),cert:core.cert.toString("base64"),ca:core.ca.toString("base64")},
      peer:{certificate_sha256:edge.pin,dns_name:"localhost",workload_id:workload}};
    child.send(startMessage);
    const origin=`https://127.0.0.1:${await ready}`;
    await expect(post(origin,prepared.original_context,f.issue,foreign)).rejects.toThrow();
    expect((await post(origin,prepared.original_context,{...f.issue,body_utf8:f.issue.body_utf8+" "},edge)).status).not.toBe(200);
    expect(await leases(f.workspace)).toHaveLength(0);
    const response=await post(origin,prepared.original_context,f.issue,edge);
    expect(response.status).toBe(200);
    const result=response.json as unknown as Issued;
    expect(result.lease_id).toBeTruthy();
    expect(await leases(f.workspace)).toHaveLength(1);
    expect((await ctx.pool.query("SELECT count(*)::int AS n FROM execution_command_status_delivery_acks WHERE lease_id=$1",[result.lease_id])).rows[0].n).toBe(0);
    const retry=new Promise<unknown>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error("TEST_ONLY_CHILD_PREPARE_TIMEOUT")),5000);
      child.on("message",(message:{type:string;result?:unknown;code?:string})=>{
        if(message.type==="PREPARED"){clearTimeout(timer);resolve(message.result);}
        else if(message.type==="PREPARE_REFUSED"){clearTimeout(timer);reject(new Error(message.code));}
      });
    });
    const {signal:_signal,...retryInput}=f.input;
    child.send({type:"PREPARE",input:retryInput,body:f.body});
    expect(await retry).toEqual(prepared);
    // Resolve only the disposable TEST_ONLY attempt so it cannot consume the
    // shared test cell's capacity in later cases.
    const attempt=randomUUID();
    await candidate.enter(result.assertion,await proof(f,result,attempt,"ENTER"));
    const restoredTerminal = process.env.PORTAL_TEST_ACK_RESTORE === "TEST_ONLY_DISPOSABLE_RESTORE" &&
      process.env.PORTAL_TEST_ACK_PHASE === "COMMITTED" ? "COMMITTED" : "ROLLED_BACK";
    await candidate.resolve(await proof(f,result,attempt,restoredTerminal));
    const sourceTerminal=(await leases(f.workspace))[0];
    expect(sourceTerminal.terminal_receipt_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    const acknowledged=await post(origin,prepared.original_context,completion(f,result),edge,"/internal/elp210/command-source/complete");
    expect(acknowledged.status).toBe(200);
    const stopped=new Promise<void>(resolve=>child.once("exit",()=>resolve()));
    child.send({type:"STOP"});await stopped;
    if (process.env.PORTAL_TEST_ACK_RESTORE === "TEST_ONLY_DISPOSABLE_RESTORE") {
      // An external, internal-network-only runner takes a real pg_dump after
      // the writer's terminal+ACK and restores it into a NEW database while
      // this test is paused. No tokens, keys or fixture bodies enter /sync.
      const source=new URL(database!), match=/^control-api-test-postgres-([a-f0-9]{8})$/u.exec(source.hostname);
      if (!match || source.pathname!=="/portal_control_test" || source.username!=="portal" || source.search ||
          process.env.PORTAL_TEST_ACK_SYNC!=="/sync") throw Error("TEST_ONLY_ACK_RESTORE_CELL_REQUIRED");
      await writeFile("/sync/ready", "TEST_ONLY\n", {flag:"wx",mode:0o600});
      const deadline=Date.now()+15000;
      for (;;) {
        try { if ((await readFile("/sync/restored", "utf8"))==="TEST_ONLY\n") break; }
        catch (error) { if ((error as NodeJS.ErrnoException).code!=="ENOENT") throw error; }
        if (Date.now()>=deadline) throw Error("TEST_ONLY_ACK_RESTORE_TIMEOUT");
        await new Promise(resolve=>setTimeout(resolve,50));
      }
      source.pathname=`/portal_ack_restore_${match[1]}`;
      const restoredPool=new Pool({connectionString:source.toString(),max:3,connectionTimeoutMillis:2000,query_timeout:6000});
      let restoredIssuer:CommandSourceAssertionAuthority|undefined;
      try {
        const clone=(await restoredPool.query("SELECT current_database() AS name,current_user AS actor")).rows[0];
        expect(clone).toEqual({name:`portal_ack_restore_${match[1]}`,actor:"portal"});
        // The dump is now complete. Revoke the SAME disposable session through
        // the real coordinator on the original, then prove the restored copy
        // has stale authority even though its STATUS ACK still matches. This is
        // a restore diagnostic, not an operational cutover barrier: it neither
        // reconciles the revoke into the clone nor consults an external source.
        const sessionState=async(pool:Pool)=>(await pool.query(
          "SELECT state,revoke_reason FROM auth_sessions WHERE session_id=$1",[f.input.actor.session_id])).rows[0];
        const revision=async(pool:Pool)=>BigInt((await pool.query(
          "SELECT revision::text AS revision FROM elp210_candidate.authority WHERE singleton")).rows[0].revision);
        const ackRows=async(pool:Pool)=>(await pool.query(`SELECT lease_id,request_digest,response_digest,terminal_receipt_digest
          FROM execution_command_status_delivery_acks WHERE lease_id=$1`,[result.lease_id])).rows;
        expect((await sessionState(ctx.pool)).state).toBe("ACTIVE");
        expect(await sessionState(restoredPool)).toEqual(await sessionState(ctx.pool));
        const priorRevision=await revision(ctx.pool), priorAck=await ackRows(ctx.pool);
        expect(await revision(restoredPool)).toBe(priorRevision);
        expect(priorAck).toHaveLength(1);
        await coordinatedAuth.logout(f.session.token);
        expect(await sessionState(ctx.pool)).toEqual({state:"REVOKED",revoke_reason:"logout"});
        expect((await sessionState(restoredPool)).state).toBe("ACTIVE");
        expect(await revision(ctx.pool)).toBeGreaterThan(priorRevision);
        expect(await revision(restoredPool)).toBe(priorRevision);
        expect(await ackRows(ctx.pool)).toEqual(priorAck);
        expect(await ackRows(restoredPool)).toEqual(priorAck);
        const restoredAuth=new AuthService(restoredPool,ctx.config,auth.argon2);
        const restoredAccess=new ExecutionAccessService(restoredPool,restoredAuth,f.trust,true);
        const restoredCandidate=await CurrentHumanCandidate.create(restoredPool,config);
        restoredIssuer=new CommandSourceAssertionAuthority(restoredPool,restoredAccess,restoredCandidate,{
          issuer:"TEST_ONLY:Core-STATUS",audience:gateway,key_id:"TEST_ONLY:status-key",key:humanKey.privateKey,
          workload_id:workload,ttl_ms:30000,maximum_contexts:4,maximum_requests_per_context:4});
        restoredIssuer.bindRecoverySource(original,f.input.contract);
        const restoredOrigin=await listen(restoredIssuer), body=completion(f,result), path="/internal/elp210/command-source/complete";
        const rows=async()=> (await restoredPool.query(`SELECT lease_id,request_digest,response_digest,terminal_receipt_digest
          FROM execution_command_status_delivery_acks WHERE lease_id=$1`,[result.lease_id])).rows;
        const before=await rows();expect(before).toHaveLength(1);
        await expect(post(restoredOrigin,prepared.original_context,body,foreign,path)).rejects.toThrow();
        for (let retry=0;retry<2;retry++) {
          const repeated=await post(restoredOrigin,prepared.original_context,body,edge,path);
          expect(repeated.status).toBe(200);expect(repeated.json).toEqual(acknowledged.json);
        }
        const mismatch=await post(restoredOrigin,prepared.original_context,
          {...body,response_digest:accessDigest("TEST_ONLY changed ACK")},edge,path);
        expect(mismatch.status).not.toBe(200);expect(await rows()).toEqual(before);
        const cloneLeases=await restoredPool.query("SELECT lease_id,attempt_id,phase,terminal_receipt_digest FROM elp210_candidate.leases WHERE workspace_id=$1",[f.workspace]);
        expect(cloneLeases.rows).toHaveLength(1);expect(cloneLeases.rows[0]).toMatchObject({lease_id:result.lease_id,attempt_id:attempt,
          phase:restoredTerminal,terminal_receipt_digest:sourceTerminal.terminal_receipt_digest});
        // This is a separate OS process reading the restored database, not a
        // second authority instance in the parent process. It receives the
        // same synthetic original and source pins over private test IPC.
        const restoredChild=fork(join(__dirname,"fixtures/command-status-recovery-child.cjs"),[],{
          stdio:["ignore","ignore","ignore","ipc"],env:{...process.env,JITI_FS_CACHE:"false"}});
        children.push(restoredChild);
        const restoredReady=new Promise<number>((resolve,reject)=>{
          const timer=setTimeout(()=>reject(new Error("TEST_ONLY_RESTORED_CHILD_TIMEOUT")),15000);
          restoredChild.once("error",error=>{clearTimeout(timer);reject(error);});
          restoredChild.once("exit",code=>{clearTimeout(timer);reject(new Error(`TEST_ONLY_RESTORED_CHILD_EXIT_${code}`));});
          restoredChild.on("message",(message:{type:string;port?:number;message?:string})=>{
            if(message.type==="READY"&&message.port){clearTimeout(timer);resolve(message.port);}
            else if(message.type==="ERROR"){clearTimeout(timer);reject(new Error(message.message));}
          });
        });
        restoredChild.send({...startMessage,database:source.toString(),restoreTestOnly:"TEST_ONLY_DISPOSABLE_RESTORE"});
        const restoredChildOrigin=`https://127.0.0.1:${await restoredReady}`;
        const replay=await post(restoredChildOrigin,prepared.original_context,body,edge,path);
        expect(replay.status).toBe(200);expect(replay.json).toEqual(acknowledged.json);
        expect(await rows()).toEqual(before);
        const restoredStopped=new Promise<void>(resolve=>restoredChild.once("exit",()=>resolve()));
        restoredChild.send({type:"STOP"});await restoredStopped;
      } finally { restoredIssuer?.shutdown();await restoredPool.end(); }
      // The restore lane has already restarted against the cloned DB. The
      // separate original-DB restart below is covered by the normal test and
      // must not rely on a 30-second context surviving an additional dump,
      // restore and OS-process boot under load.
      return;
    }
    // Restart again after durable Edge ACK but before retained STATUS is
    // consumed. This exercises the recovery gap in an entirely new process.
    const afterAck=fork(join(__dirname,"fixtures/command-status-recovery-child.cjs"),[],{
      stdio:["ignore","ignore","ignore","ipc"],env:{...process.env,JITI_FS_CACHE:"false"}});
    children.push(afterAck);
    const readyAfterAck=new Promise<number>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error("TEST_ONLY_CHILD_RESTART_TIMEOUT")),15000);
      afterAck.once("error",error=>{clearTimeout(timer);reject(error);});
      afterAck.once("exit",code=>{clearTimeout(timer);reject(new Error(`TEST_ONLY_CHILD_EXIT_${code}`));});
      afterAck.on("message",(message:{type:string;port?:number;message?:string})=>{
        if(message.type==="READY"&&message.port){clearTimeout(timer);resolve(message.port);}
        else if(message.type==="ERROR"){clearTimeout(timer);reject(new Error(message.message));}
      });
    });
    afterAck.send(startMessage);
    const afterAckOrigin=`https://127.0.0.1:${await readyAfterAck}`;
    const preparedAfterAck=new Promise<unknown>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error("TEST_ONLY_CHILD_PREPARE_TIMEOUT")),5000);
      afterAck.on("message",(message:{type:string;result?:unknown;code?:string})=>{
        if(message.type==="PREPARED"){clearTimeout(timer);resolve(message.result);}
        else if(message.type==="PREPARE_REFUSED"){clearTimeout(timer);reject(new Error(message.code));}
      });
    });
    afterAck.send({type:"PREPARE",input:retryInput,body:f.body});
    // Compare exact values without dumping the short-lived assertion/context
    // into the test log when a timeout or other failure occurs.
    expect(accessDigest(await preparedAfterAck)).toBe(accessDigest(prepared));
    expect((await post(afterAckOrigin,prepared.original_context,f.issue,edge)).status).not.toBe(200);
    expect(await leases(f.workspace)).toHaveLength(1);
    expect((await ctx.pool.query("SELECT count(*)::int AS n FROM execution_command_status_delivery_acks WHERE lease_id=$1",[result.lease_id])).rows[0].n).toBe(1);
    const restartedStopped=new Promise<void>(resolve=>afterAck.once("exit",()=>resolve()));
    afterAck.send({type:"STOP"});await restartedStopped;
  },60_000);

  it("keeps UNKNOWN on the same PG attempt until signed original recovery and separate completion", async () => {
    const f = fixtures[1], service = authority(f), prepared = await service.prepare(f.input, f.body);
    const issued = await service.issue(prepared.original_context, f.issue), attempt = randomUUID();
    await candidate.enter(issued.assertion, await proof(f, issued, attempt, "ENTER"));
    await candidate.resolve(await proof(f, issued, attempt, "UNKNOWN"));
    const before = (await leases(f.workspace))[0];
    expect(before).toMatchObject({ phase: "UNKNOWN", attempt_id: attempt, terminal_receipt_digest: null });
    const capacityCandidate=await CurrentHumanCandidate.create(ctx.pool,{...config,
      limits:{...config.limits,maximum_unresolved:1}});
    const capacityProcess=authority(f,capacityCandidate), capacityContext=await capacityProcess.prepare(f.input,f.body);
    // These are real DB-counted capacity refusals, not mock errors; no INSERT
    // occurs while the original UNKNOWN occupies the sole unresolved slot.
    for(let attempt=0;attempt<6;attempt++)
      await expect(capacityProcess.issue(capacityContext.original_context,f.issue))
        .rejects.toMatchObject({code:"CURRENT_HUMAN_CAPACITY_EXHAUSTED"});
    const otherProcess=authority(f), otherContext=await otherProcess.prepare(f.input,f.body);
    // More definite pre-INSERT refusals than the context's issuance quota do
    // not allocate leases or prevent a same-context retry after the true ACK.
    for(let attempt=0;attempt<6;attempt++)
      await expect(otherProcess.issue(otherContext.original_context,f.issue))
        .rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_CUSTODY_RECOVERY_REQUIRED",status:409});
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
    // The capacity cleared, but terminal alone still cannot replace the
    // original: its exact Edge delivery ACK has not been recorded yet.
    await expect(capacityProcess.issue(capacityContext.original_context,f.issue))
      .rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_CUSTODY_RECOVERY_REQUIRED",status:409});
    await expect(service.issue(prepared.original_context, { ...f.issue, delivery_sequence: 1, previous_lease_id: issued.lease_id }))
      .rejects.toMatchObject({ code: "COMMAND_STATUS_ASSERTION_DELIVERY_NOT_COMPLETED" });
    const ack = await service.complete(prepared.original_context, completion(f, issued));
    expect(await service.complete(prepared.original_context, completion(f, issued))).toEqual(ack);
    const retainedAck=await ctx.pool.query("SELECT request_digest,response_digest,terminal_receipt_digest FROM execution_command_status_delivery_acks WHERE lease_id=$1",[issued.lease_id]);
    expect(retainedAck.rows).toEqual([{request_digest:issued.request_digest,response_digest:ack.response_digest,
      terminal_receipt_digest:terminal.terminal_receipt_digest}]);
    // Edge completion ACK precedes delivery of its retained STATUS response.
    // A caller racing in this gap must stay on the same context.
    expect((await service.prepare(f.input, f.body)).original_context).toBe(prepared.original_context);
    await service.acknowledgeRetainedRead(prepared.original_context,f.input);
    expect((await service.prepare(f.input, f.body)).original_context).not.toBe(prepared.original_context);
    expect(await leases(f.workspace)).toEqual([terminal]); // ACK/preparation do not issue replacement credentials.
    // The capacity-limited process may retry its same context only after the
    // first source terminal and authenticated delivery ACK are durable.
    const resumed=await capacityProcess.issue(capacityContext.original_context,f.issue);
    expect(resumed.lease_id).not.toBe(issued.lease_id);
    expect(await leases(f.workspace)).toHaveLength(2);
    // A third authority is still fenced by that new actual issue until its
    // independently signed terminal and explicit ACK, then may retry too.
    await expect(otherProcess.issue(otherContext.original_context,f.issue))
      .rejects.toMatchObject({code:"COMMAND_STATUS_ASSERTION_CUSTODY_RECOVERY_REQUIRED",status:409});
    const resumedAttempt=randomUUID();
    await candidate.enter(resumed.assertion,await proof(f,resumed,resumedAttempt,"ENTER"));
    await candidate.resolve(await proof(f,resumed,resumedAttempt,"COMMITTED"));
    await capacityProcess.complete(capacityContext.original_context,completion(f,resumed));
    const next=await otherProcess.issue(otherContext.original_context,f.issue);
    expect(next.lease_id).not.toBe(resumed.lease_id);
    expect(await leases(f.workspace)).toHaveLength(3);
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
    const finishedBefore = (await ctx.pool.query("SELECT count(*)::int n FROM elp210_candidate.mutations WHERE state='FINISHED'")).rows[0].n;
    await coordinatedAuth.logout(f.session.token);
    const row = (await ctx.pool.query("SELECT state,revoke_reason FROM auth_sessions WHERE session_id=$1", [f.input.actor.session_id])).rows[0];
    expect(row).toEqual({ state: "REVOKED", revoke_reason: "logout" });
    await expect(service.issue(prepared.original_context, f.issue)).rejects.toMatchObject({ code: "CURRENT_ACTOR_AUTHORITY_REQUIRED" });
    expect(await leases(f.workspace)).toHaveLength(0); expect(await commandRows(f.workspace)).toEqual(before);
    expect((await ctx.pool.query("SELECT count(*)::int n FROM elp210_candidate.mutations WHERE state='FINISHED'")).rows[0].n).toBe(finishedBefore + 1);
  }, 30_000);
});
