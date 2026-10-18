/** Isolated correctness implementation; runtime provider remains unqualified.
 * Real disposable Core PG + mounted session HTTP test definitions. All PM
 * acceptances, current relations and selected provider frames are TEST_ONLY
 * fixtures, not installed/source/financial/runtime authority. */
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import cookiePlugin from "@fastify/cookie";
import type { FastifyInstance } from "fastify";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AuthService } from "../src/auth/auth.service";
import { AdminService } from "../src/admin/admin.service";
import { CSRF_COOKIE, CSRF_HEADER, SESSION_COOKIE } from "../src/auth/cookies";
import { HttpErrorFilter } from "../src/http-error.filter";
import { SessionGuard } from "../src/facade/session.guard";
import { OwnerAccessRepository } from "../src/repos/owner-access";
import { AccountLifecycleRepository } from "../src/repos/account-lifecycle";
import { WorkspacesRepository } from "../src/repos/workspaces";
import { SessionsRepository } from "../src/repos/sessions";
import { CONTROL_API_CONFIG } from "../src/tokens";
import { AccessRepository } from "../src/execution-v2/access.repository";
import { ExecutionAccessService } from "../src/execution-v2/access.service";
import type { AccessTrustProvider } from "../src/execution-v2/access-trust";
import { tsRootMembershipAcceptance, type AccessActor, type ReviewedAccessPolicy,
  type ScopedAccessGrant } from "../src/execution-v2/access.contract";
import { accessDigest, canonicalSelector, type AccessRelations } from "../src/execution-v2/access-policy";
import { currentAccessRelations, grantBindingDigest,
  type CurrentAccessRelations } from "../src/execution-v2/access-current-relations";
import { PendingControlController } from "../src/execution-v2/pending-control.controller";
import { PendingControlService, pendingControlAction } from "../src/execution-v2/pending-control.service";
import { PendingControlStore, pendingRecord, pendingTarget, type PendingRecord } from "../src/execution-v2/pending-control.store";
import { pendingControlIntent, type PendingControlIntent, type PendingControlStatus } from "../src/execution-v2/pending-control.contract";
import { pendingControlAuthorization, pendingSourcePins, pendingIntentHash,
  pendingRequestDigests, pendingPreviewHash, type PendingControlAuthorization,
  type PendingControlTrust, type VerifiedPendingFrame } from "../src/execution-v2/pending-control.trust";
import { migrateTestDatabase, setupApp, teardownApp } from "./harness";

const next = () => `TEST_ONLY:${randomUUID()}`;
const password = "TEST-only-pending-correct-horse-battery-2026";
type Operation = PendingControlIntent["business_payload"]["operation"];
type Versions = PendingControlAuthorization["expected_versions"];
type Summary = Record<string, unknown>;
const advance = (v: Versions): Versions => ({ budget: String(BigInt(v.budget) + 1n), source: String(BigInt(v.source) + 1n),
  parent: v.parent, book: String(BigInt(v.book) + 1n), command: String(BigInt(v.command) + 1n) });
const amount = () => ({ requested: "100.000000000000000001", applied: "40.000000000000000001",
  pending: "60", cancelled: "0", rejected: "0" });
const unknownSummary = (): Summary => ({ state: "UNKNOWN", business_applied: null, next_action: "QUERY_SAME_INTENT", cli_exit_code: "3" });
function deferred() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; }

describe.skipIf(!process.env.TEST_DATABASE_URL)("ELP2-07 pending recall real Core PG/session HTTP — TEST_ONLY source", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>, auth: AuthService, username: string;
  let user: NonNullable<Awaited<ReturnType<AuthService["users"]["findById"]>>>;
  let session: Awaited<ReturnType<AuthService["login"]>>, actor: AccessActor;
  beforeAll(async () => {
    await migrateTestDatabase(process.env.TEST_DATABASE_URL!);
    ctx = await setupApp({ DATABASE_URL: process.env.TEST_DATABASE_URL! }); auth = ctx.app.get(AuthService);
    vi.spyOn(auth, "verifyAccessIdentity").mockImplementation(async assertion => ({
      iss: "https://test-only.cloudflareaccess.com", sub: `TEST_ONLY:${assertion}`, aud: "test-audience",
      email: `${assertion}@azdag.com`, normalizedEmail: `${assertion}@azdag.com`, authenticationTime: new Date(),
      tokenExpiresAt: new Date(Date.now() + 60_000),
    }));
    username = `pending-${randomUUID()}`;
    const admin = new AdminService(ctx.pool, ctx.config, auth);
    const made = await admin.createUser({ username, displayName: username, role: "USER" });
    const activation = await admin.resetCredential(made.userId);
    const first = await auth.login({ assertion: username, username, credential: activation.activationToken });
    await auth.changePassword({ sessionToken: first.token, csrfToken: first.csrfToken,
      currentPassword: activation.activationToken, newPassword: password });
    session = await auth.login({ assertion: username, username, credential: password });
    user = (await auth.users.findById(made.userId))!;
    actor = { user_id: user.userId, session_id: session.sessionId, session_generation: user.sessionVersion };
    await new OwnerAccessRepository(ctx.pool).claimOwner({ userId: user.userId, claimedBy: "PENDING_TEST_ONLY" });
    await new AccountLifecycleRepository(ctx.pool).grantStepUp({ stepUpId: next(), sessionId: session.sessionId,
      userId: user.userId, ttlSeconds: 600 });
  });
  afterAll(async () => { vi.restoreAllMocks(); if (ctx) await teardownApp(ctx); });

  async function fixture(operation: Operation = "APPLY_PENDING", kind: "PORTFOLIO" | "DEPLOYMENT" = "PORTFOLIO") {
    const workspace = next(), now = Date.now(), resource = { kind, id: next() };
    await ctx.pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY pending',$2)", [workspace, user.userId]);
    await ctx.pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'OWNER')", [workspace, user.userId]);
    const policy: ReviewedAccessPolicy = { workspace_id: workspace, revision: next(), artifact_digest: accessDigest(next()),
      approval_ref: next(), state: "REVIEWED", qualification: "TEST_ONLY", protected_owner_user_id: user.userId,
      researcher_fields: { state: "PENDING", policy_ref: null, fields: [] } };
    const mappingRevision = next(), repo = new AccessRepository(ctx.pool);
    const source: CurrentAccessRelations = { schema_version: "pma.core-current-relations.v1", subject_user_id: user.userId,
      workspace_id: workspace, ts_user_id: `TEST_ONLY:ts:${user.userId}`, mapping_revision: mappingRevision,
      resources: [{ environment: "paper", revision: next(), own_alpha_ids: [],
        member_portfolio_ids: kind === "PORTFOLIO" ? [resource.id] : [], roots: [] }], grants: [] };
    const grants: ScopedAccessGrant[] = (["capital.apply_pending", "capital.cancel_remaining", "audit.read"] as const).map(action => ({
      grant_id: next(), workspace_id: workspace, subject_user_id: user.userId, action, effect: "ALLOW",
      selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: kind, ids: [resource.id] }, environments: ["paper"],
      valid_from_ms: now - 1000, valid_until_ms: now + 120_000, delegable_actions: [], issued_by: user.userId,
      parent_grant_id: null, revision: next(), policy_revision: policy.revision, revoked_at_ms: null,
      requires_ts_acceptance: true, ts_receipt: null, field_policy_ref: null,
    }));
    for (const grant of grants) {
      const fact = tsRootMembershipAcceptance.parse({ context: "REVIEWED_POLICY_ROOT", source: "TEST_ONLY:PM",
        source_contract: "TEST_ONLY:normalized", trust_profile: "TEST_ONLY:uninstalled", receipt_id: next(),
        portal_user_id: user.userId, ts_user_id: source.ts_user_id, mapping_revision: mappingRevision,
        human_requester_user_id: user.userId, workspace_id: workspace, action: grant.action,
        selector_digest: accessDigest(canonicalSelector(grant.selector)), environments: [...grant.environments],
        previous_membership_revision: null, membership_revision: next(), effective_at_ms: now - 500,
        expires_at_ms: now + 115_000, outcome: "ACCEPTED", payload_digest: accessDigest(["TEST_ONLY:payload", grant.grant_id]),
        provenance_ref: "TEST_ONLY:NOT_REAL_SOURCE_ACCEPTANCE", policy_revision: policy.revision,
        policy_artifact_digest: policy.artifact_digest, policy_install_digest: accessDigest(["TEST_ONLY:install", workspace]),
        approval_ref: policy.approval_ref, grant_id: grant.grant_id, grant_digest: accessDigest(grant), expected_grant_revision: grant.revision });
      grant.ts_receipt = { receipt_id: fact.receipt_id, membership_revision: fact.membership_revision,
        mapping_revision: fact.mapping_revision, effective_at_ms: fact.effective_at_ms, expires_at_ms: fact.expires_at_ms };
      grant.ts_acceptance_digest = accessDigest(fact);
      source.grants.push({ grant_id: grant.grant_id, binding_digest: grantBindingDigest(grant), accepted: fact,
        targets: [{ environment: "paper", resource, revision: next(), native_reference_digest: accessDigest(["TEST_ONLY:leg", grant.grant_id]),
          valid_from_ms: now - 500, valid_until_ms: now + 110_000 }] });
    }
    currentAccessRelations.parse(source); await repo.putPolicy(policy);
    for (const grant of grants) await repo.saveGrant(grant, true);
    const relations: AccessRelations = { qualified: true, revision: next(), own_alpha_ids: [],
      member_portfolio_ids: kind === "PORTFOLIO" ? [resource.id] : [], roots: {}, membership: null, current_authority: source };
    const accessTrust: AccessTrustProvider = { verifyPolicy: async () => null, verifyReceipt: async () => null,
      relations: async () => relations, verifiedHumanMapping: async () => ({ ts_user_id: source.ts_user_id, revision: mappingRevision }) };
    const access = new ExecutionAccessService(ctx.pool, auth, accessTrust, true);
    const intent = pendingControlIntent.parse({ schema_version: "portal.execution.pending-recall-intent.v1", workspace_id: workspace,
      resource, environment: "paper", expected_policy_revision: policy.revision,
      business_payload: { schema_version: "pma.operator-control.v1", operation, idempotency_key: next(),
        recipient_kind: kind === "PORTFOLIO" ? "PORTFOLIO" : "DEPLOYMENT_ACCOUNT",
        ...(kind === "DEPLOYMENT" ? { recipient_account_id: next(), recipient_deployment_id: resource.id } : {}),
        currency: "USDT", reason: "TEST_ONLY original recall remainder", command_id: next(),
        expected_versions: { budget: "9007199254740993", source: "2", parent: "3", book: "4", command: "5" } } });
    const pins = Object.fromEntries(Object.entries(pendingSourcePins.shape).map(([key, value]) => [key, value.value]));
    const prediction = (i = intent) => ({ state: i.business_payload.operation === "APPLY_PENDING" ? "WAITING_ENCUMBRANCE" : "PARTIALLY_APPLIED_CANCELLED",
      amounts: i.business_payload.operation === "APPLY_PENDING" ? amount() : { ...amount(), pending: "0", cancelled: "60" }, delta: "0",
      versions: advance(i.business_payload.expected_versions), blockers: i.business_payload.operation === "APPLY_PENDING" ? ["TEST_ONLY:encumbrance"] : [] });
    // Opaque TEST_ONLY owning-source normalized digest, NOT a Portal semantic
    // hash/request byte digest and NOT an implementation of PM normalization.
    const sourcePayloadDigest = (i: PendingControlIntent) => createHash("sha256")
      .update(`TEST_ONLY:owning-normalized-control:${i.business_payload.idempotency_key}`).digest("hex");
    let selected: ScopedAccessGrant | undefined;
    const makeAuthorization = (i = intent, issued = Date.now() - 1000) => {
      const b = i.business_payload, grant = selected ?? grants.find(g => g.action === pendingControlAction(i))!;
      return pendingControlAuthorization.parse({ qualification: "TEST_ONLY", reference: next(), authority_ref: "TEST_ONLY:held-source",
        profile_ref: "TEST_ONLY:pending-paper", audience: "pma.management.v1", source_selection_ref: "TEST_ONLY:selected-pending", source_pins: pins,
        actor_id: user.userId, ts_user_id: source.ts_user_id, workload_ref: "TEST_ONLY:workload", delegation_ref: "TEST_ONLY:held-current-human",
        mapping_revision: mappingRevision, membership_revision: grant.ts_receipt!.membership_revision,
        membership_receipt_ref: grant.ts_receipt!.receipt_id, workspace_id: workspace, environment: i.environment,
        operation: b.operation, resource_kind: i.resource.kind, resource_id: i.resource.id,
        source_target_ref: "TEST_ONLY:route-ref", source_recipient_ref: "TEST_ONLY:owning-recipient", original_recall_id: b.command_id,
        recipient: { recipient_kind: b.recipient_kind, currency: b.currency,
          ...(b.recipient_kind === "DEPLOYMENT_ACCOUNT" ? { recipient_account_id: b.recipient_account_id, recipient_deployment_id: b.recipient_deployment_id } : {}) },
        policy_revision: i.expected_policy_revision, expected_versions: b.expected_versions, original_payload_sha256: sourcePayloadDigest(i),
        preview_prediction_digest: accessDigest(prediction(i)), intent_hash: pendingIntentHash(actor, i),
        request_digests: pendingRequestDigests(i, "TEST_ONLY:route-ref"), issued_at_ms: issued, expires_at_ms: issued + 45_000,
        idempotency_retained_until_ms: issued + 86_400_000,
        commit_checks: { human: true, workload: true, membership: true, scope: true, versions: true, original_recall: true, remainder: true } });
    };
    const summary = (i: PendingControlIntent, a: PendingControlAuthorization): Summary => {
      const p = prediction(i);
      return { state: p.state, business_applied: false, next_action: p.state === "WAITING_ENCUMBRANCE" ? "QUERY_SAME_INTENT" : "REVIEW_RECEIPT",
        cli_exit_code: p.state === "WAITING_ENCUMBRANCE" ? "3" : "2", physical_transfer_performed: false, economic_cash_changed: false,
        operation: i.business_payload.operation, command_id: a.original_recall_id, target: a.source_recipient_ref,
        ...p.amounts, delta: p.delta, blockers: p.blockers, budget_version: p.versions.budget, source_version: p.versions.source,
        parent_version: p.versions.parent, book_version: p.versions.book, command_version: p.versions.command,
        receipt_id: `TEST_ONLY:control:${i.business_payload.idempotency_key}`, source_event_id: `TEST_ONLY:event:${i.business_payload.idempotency_key}`,
        payload_digest: a.original_payload_sha256 };
    };
    const frame = (a: PendingControlAuthorization, stage: VerifiedPendingFrame["stage"], body: unknown,
      terminal: VerifiedPendingFrame["terminal"]): VerifiedPendingFrame => {
      const response_json = JSON.stringify(body);
      return { authorization_digest: accessDigest(a), source_selection_ref: a.source_selection_ref, intent_hash: a.intent_hash, stage,
        request_digest: a.request_digests[stage.toLowerCase() as "preview" | "apply" | "status"], response_json,
        response_sha256: createHash("sha256").update(Buffer.from(response_json, "utf8")).digest("hex"), terminal };
    };
    let sends = 0, lookups = 0;
    const effects = new Map<string, Summary>();
    const trust: PendingControlTrust = {
      prepare: async ({ intent: i }) => {
        const authorization = makeAuthorization(i), { receipt_id: _r, source_event_id: _e, ...base } = summary(i, authorization);
        return { authorization, preview: frame(authorization, "PREVIEW", { ...base, state: "PREVIEW_ONLY", predicted_state: prediction(i).state,
          reserved: false, next_action: "REVIEW_PREVIEW", cli_exit_code: "0" }, "PREVIEW_ROLLED_BACK") };
      },
      send: async ({ authorization, intent: i }) => {
        // Source work observes DURABLY COMMITTED Core custody, never a fake DB.
        const rows = (await ctx.pool.query("SELECT command_id,attempt_id,status FROM execution_pending_recall_commands WHERE workspace_id=$1 AND key_hash=$2",
          [workspace, accessDigest(i.business_payload.idempotency_key)])).rows;
        expect(rows).toHaveLength(1); expect(rows[0].status.delivery).toBe("SENDING");
        expect(rows[0].attempt_id).toMatch(/^[a-f0-9-]{36}$/);
        const events = (await ctx.pool.query("SELECT attempt_id,status FROM execution_pending_recall_events WHERE command_id=$1", [rows[0].command_id])).rows;
        expect(events).toHaveLength(2); expect(events.find(e => e.status.delivery === "SENDING")?.attempt_id).toBe(rows[0].attempt_id);
        expect((await ctx.pool.query("SELECT count(*)::int AS n FROM product_audit_events WHERE aggregate_id=$1", [rows[0].command_id])).rows[0].n).toBe(2);
        sends++; const body = summary(i, authorization); effects.set(i.business_payload.idempotency_key, body);
        return frame(authorization, "APPLY", body, "RECALL_CONTROL_COMMIT_VERIFIED");
      },
      lookup: async ({ authorization, intent: i }) => {
        lookups++; const body = effects.get(i.business_payload.idempotency_key);
        return body ? frame(authorization, "STATUS", body, "SERVICE_LOOKUP_VERIFIED") : null;
      },
    };
    const service = new PendingControlService(ctx.pool, access, trust, true), store = new PendingControlStore(ctx.pool);
    const submit = async () => service.submit(actor, intent, (await service.preview(actor, intent)).preview_digest!);
    const record = async (id: string): Promise<PendingRecord> => {
      const raw = (await store.candidate(workspace, id))!; return pendingRecord(raw, workspace, id, pendingTarget(raw));
    };
    const boundary = async <T,>(run: (db: Parameters<PendingControlStore["keyed"]>[0]) => Promise<T>, i = intent) =>
      access.commandBoundary(actor, workspace, await access.readContext(actor, workspace), pendingControlAction(i),
        i.resource, i.environment, () => {}, run);
    return { workspace, resource, policy, grants, repo, source, relations, access, accessTrust, intent, trust, service, store,
      submit, record, boundary, makeAuthorization, prediction, summary, frame, effects,
      counts: () => ({ sends, lookups, effects: effects.size }), chooseGrant(grant: ScopedAccessGrant) { selected = grant; } };
  }
  async function mounted(f: Awaited<ReturnType<typeof fixture>>,
    run: (http: FastifyInstance, headers: Record<string, string>, base: string) => Promise<void>, retained = false) {
    const config = retained ? { ...ctx.config, EXECUTION_READ_PROFILE: "retained_review_v1" as const,
      EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: "TEST_ONLY:unrelated-retained-workspace" } : ctx.config;
    const workspaces = new WorkspacesRepository(ctx.pool, config);
    const sourceAccess = retained ? vi.spyOn(workspaces, "canReadExecution").mockImplementation(async () => {
      throw new Error("TEST_ONLY Core status must not borrow retained source authority"); }) : undefined;
    @Module({ controllers: [PendingControlController], providers: [SessionGuard,
      { provide: PendingControlService, useValue: f.service }, { provide: AuthService, useValue: auth },
      { provide: WorkspacesRepository, useValue: workspaces }, { provide: CONTROL_API_CONFIG, useValue: config }] })
    class MountedPendingModule {}
    const app = await NestFactory.create<NestFastifyApplication>(MountedPendingModule, new FastifyAdapter(),
      { logger: false, abortOnError: false });
    try {
      await app.register(cookiePlugin); app.useGlobalFilters(new HttpErrorFilter()); await app.init();
      const headers = { cookie: `${SESSION_COOKIE}=${session.token}; ${CSRF_COOKIE}=${session.csrfToken}`,
        [CSRF_HEADER]: session.csrfToken, origin: ctx.config.PORTAL_PUBLIC_ORIGIN,
        "x-portal-idempotency-key": f.intent.business_payload.idempotency_key };
      await run(app.getHttpAdapter().getInstance(), headers, "/api/v1/execution/pending-recalls");
      expect(sourceAccess?.mock.calls.length ?? 0).toBe(0);
    } finally { sourceAccess?.mockRestore(); await app.close(); }
  }

  it("default provider stays dark; TEST_ONLY cannot escape isolated DI", async () => {
    const f = await fixture();
    expect(await new PendingControlService(ctx.pool, f.access).preview(actor, f.intent))
      .toMatchObject({ allowed: false, reason_code: "PENDING_CONTROL_NOT_QUALIFIED", prediction: null, reserved: false });
    expect(await new PendingControlService(ctx.pool, f.access, f.trust, false).preview(actor, f.intent)).toMatchObject({ allowed: false });
    expect(f.counts()).toEqual({ sends: 0, lookups: 0, effects: 0 });
    expect((await ctx.pool.query("SELECT count(*)::int AS n FROM execution_pending_recall_commands WHERE workspace_id=$1", [f.workspace])).rows[0].n).toBe(0);
  });
  it.each(["APPLY_PENDING", "CANCEL_REMAINING"] as const)("%s cannot borrow an independently valid audit acceptance", async operation => {
    const f = await fixture(operation); f.chooseGrant(f.grants[2]);
    expect(new Set(f.grants.map(g => g.ts_receipt!.receipt_id)).size).toBe(3);
    expect(await f.service.preview(actor, f.intent)).toMatchObject({ allowed: false, reason_code: "PENDING_CONTROL_CONTEXT_INVALID" });
    await expect(f.submit()).rejects.toMatchObject({ code: "PENDING_CONTROL_CONTEXT_INVALID", status: 403 });
    expect(f.counts()).toEqual({ sends: 0, lookups: 0, effects: 0 });
  });
  it.each([
    ["APPLY_PENDING", "PORTFOLIO"], ["CANCEL_REMAINING", "PORTFOLIO"],
    ["APPLY_PENDING", "DEPLOYMENT"], ["CANCEL_REMAINING", "DEPLOYMENT"],
  ] as const)("%s %s preserves source-derived preview, exact original pair and separate receipt axes", async (operation, kind) => {
    const f = await fixture(operation, kind), preview = await f.service.preview(actor, f.intent);
    expect(preview).toMatchObject({ allowed: true, prediction: f.prediction(), business_applied: false, reserved: false });
    expect(f.counts().sends).toBe(0);
    const status = await f.service.submit(actor, f.intent, preview.preview_digest!);
    expect(status).toMatchObject({ family: "PENDING_RECALL_CONTROL", operation, resource: f.resource,
      delivery: "ACKNOWLEDGED", business: { state: f.prediction().state, amounts: f.prediction().amounts, business_applied: false },
      economic_cash_changed: false, physical_transfer_performed: false, projection: "UNKNOWN", venue: "NOT_APPLICABLE" });
    expect(status.business.receipt?.versions.budget).toBe("9007199254740994");
    const saved = await f.record(status.command_id);
    expect(status.business.receipt?.original_payload_sha256).toBe(saved.authorization.original_payload_sha256);
    expect(`sha256:${saved.authorization.original_payload_sha256}`).not.toBe(saved.authorization.request_digests.apply);
    expect(saved.intent.business_payload).toEqual(f.intent.business_payload); expect(saved.attempt).toBeNull();
    const events = (await ctx.pool.query("SELECT status,attempt_id FROM execution_pending_recall_events WHERE command_id=$1", [status.command_id])).rows;
    expect(events).toHaveLength(3); expect(events.find(e => e.status.delivery === "SENDING")!.attempt_id).toMatch(/^[a-f0-9-]{36}$/);
    expect((await ctx.pool.query("SELECT count(*)::int AS n FROM product_audit_events WHERE aggregate_id=$1", [status.command_id])).rows[0].n).toBe(3);
    expect((await ctx.pool.query("SELECT count(*)::int AS n FROM execution_trusted_commands WHERE workspace_id=$1", [f.workspace])).rows[0].n).toBe(0);
  });
  it("concurrent exact-key submits commit at most one sender and preserve all original receipt identity", async () => {
    const f = await fixture(), preview = await f.service.preview(actor, f.intent);
    const attempts = await Promise.allSettled(Array.from({ length: 4 }, () => f.service.submit(actor, f.intent, preview.preview_digest!)));
    expect(attempts.some(value => value.status === "fulfilled")).toBe(true);
    for (const value of attempts) if (value.status === "rejected")
      expect(["ACCESS_RETRY_REQUIRED", "PENDING_CONTROL_UNAVAILABLE"]).toContain(value.reason.code);
    const row = (await ctx.pool.query("SELECT command_id FROM execution_pending_recall_commands WHERE workspace_id=$1", [f.workspace])).rows;
    expect(row).toHaveLength(1);
    const status = await f.service.reconcile(actor, f.workspace, row[0].command_id);
    expect(status.business.state).toBe("WAITING_ENCUMBRANCE"); expect(f.counts().sends).toBe(1); expect(f.counts().effects).toBe(1);
    expect((await f.submit()).command_id).toBe(status.command_id);
    const changed = pendingControlIntent.parse({ ...f.intent, business_payload: { ...f.intent.business_payload, command_id: next() } });
    await expect(f.service.submit(actor, changed, accessDigest("TEST_ONLY:ignored")))
      .rejects.toMatchObject({ code: "PENDING_CONTROL_IDEMPOTENCY_CONFLICT" });
    expect(f.counts().sends).toBe(1);
  });
  it("current action revoke during prepare leaves no correlation/attempt and zero source sends", async () => {
    const f = await fixture(), prepare = f.trust.prepare;
    f.trust.prepare = async input => { const result = await prepare(input);
      await f.repo.saveGrant({ ...f.grants[0], revoked_at_ms: Date.now(), revision: next() }); return result; };
    await expect(f.service.submit(actor, f.intent, pendingPreviewHash(f.makeAuthorization())))
      .rejects.toMatchObject({ code: "ACCESS_DENIED", status: 403 });
    expect((await ctx.pool.query("SELECT count(*)::int AS n FROM execution_pending_recall_commands WHERE workspace_id=$1", [f.workspace])).rows[0].n).toBe(0);
    expect(f.counts().sends).toBe(0);
  });
  it("atomic rollback leaves neither intent, custody event nor product audit", async () => {
    const f = await fixture(); let id: string | undefined;
    await expect(f.boundary(async db => { const row = await f.store.insert(db, actor.user_id, f.intent,
      pendingIntentHash(actor, f.intent), f.makeAuthorization()); id = row.id;
      await f.store.claim(db, row); throw new Error("TEST_ONLY:rollback-before-source"); })).rejects.toThrow("TEST_ONLY:rollback-before-source");
    expect(id).toBeDefined();
    expect((await ctx.pool.query("SELECT count(*)::int AS n FROM execution_pending_recall_commands WHERE workspace_id=$1", [f.workspace])).rows[0].n).toBe(0);
    expect((await ctx.pool.query("SELECT count(*)::int AS n FROM execution_pending_recall_events WHERE command_id=$1", [id])).rows[0].n).toBe(0);
    expect((await ctx.pool.query("SELECT count(*)::int AS n FROM product_audit_events WHERE aggregate_id=$1", [id])).rows[0].n).toBe(0);
    expect(f.counts().sends).toBe(0);
  });
  it("100 local pending stops new keys but not replay; ACK WAITING is not counted as unsent", async () => {
    const f = await fixture(), waiting = await f.submit();
    const records = await f.boundary(async db => {
      const records: PendingRecord[] = [];
      for (let index = 0; index < 100; index++) {
        const intent = pendingControlIntent.parse({ ...f.intent, business_payload: { ...f.intent.business_payload,
          idempotency_key: `TEST_ONLY:pending-cap-${index}` } });
        records.push(await f.store.insert(db, actor.user_id, intent, pendingIntentHash(actor, intent), f.makeAuthorization(intent)));
      }
      return records;
    });
    const extra = pendingControlIntent.parse({ ...f.intent, business_payload: { ...f.intent.business_payload, idempotency_key: next() } });
    await expect(f.boundary(db => f.store.insert(db, actor.user_id, extra, pendingIntentHash(actor, extra), f.makeAuthorization(extra))))
      .rejects.toMatchObject({ code: "PENDING_CONTROL_CAPACITY_EXCEEDED", status: 503 });
    const first = records[0];
    expect(await f.boundary(db => f.store.insert(db, actor.user_id, first.intent, first.hash, first.authorization))).toEqual(first);
    expect((await f.submit()).command_id).toBe(waiting.command_id);
    const actual = (await ctx.pool.query(`SELECT count(*)::int AS total,
      count(*) FILTER(WHERE status->>'delivery' IN('PREPARED','SENDING','DELIVERY_UNKNOWN'))::int AS pending
      FROM execution_pending_recall_commands WHERE workspace_id=$1`, [f.workspace])).rows[0];
    expect(actual).toEqual({ total: 101, pending: 100 }); expect(f.counts().sends).toBe(1);
  });
  it("source commit/response loss then restart is same-key lookup, never stale resend", async () => {
    const f = await fixture(), send = f.trust.send;
    f.trust.send = async input => { await send(input); throw new Error("TEST_ONLY:source-response-lost"); };
    const first = await f.submit(); expect(first).toMatchObject({ delivery: "DELIVERY_UNKNOWN", business: { state: "UNKNOWN" } });
    const restarted = new PendingControlService(ctx.pool, f.access, f.trust, true);
    expect(await restarted.submit(actor, f.intent, accessDigest("TEST_ONLY:ignored-replay-preview"))).toEqual(first);
    const known = await restarted.reconcile(actor, f.workspace, first.command_id);
    expect(known).toMatchObject({ delivery: "ACKNOWLEDGED", business: { state: "WAITING_ENCUMBRANCE", amounts: amount() } });
    f.effects.clear(); expect(await restarted.reconcile(actor, f.workspace, first.command_id)).toEqual(known);
    expect(f.counts()).toEqual({ sends: 1, lookups: 2, effects: 0 });
  });
  it("actual ten-second timeout retains four abort-ignoring source slots and recovers without second APPLY", async () => {
    const f = await fixture(), started = deferred(), held = deferred(), send = f.trust.send;
    const sourceWork: Array<Promise<unknown>> = [];
    f.trust.send = input => { const pending = (async () => {
      // Observe the genuine committed SENDING claim BEFORE the local timeout.
      // Only the source response is held, not a fictitious post-timeout send.
      const result = await send(input); started.release(); await held.promise; return result;
    })();
      sourceWork.push(pending); return pending; }; // Deliberately ignores abort.
    const submitted = f.submit(); void submitted.catch(() => {});
    const competitors: Array<ReturnType<PendingControlService["preview"]>> = [];
    try {
      await started.promise;
      const prepare = f.trust.prepare, prepared = deferred(); let entered = 0;
      f.trust.prepare = input => {
        const work = (async () => { const result = await prepare(input);
          if (++entered === 3) prepared.release(); await held.promise; return result; })();
        sourceWork.push(work); return work;
      };
      for (let index = 0; index < 3; index++) {
        const promise = f.service.preview(actor, f.intent); void promise.catch(() => {}); competitors.push(promise);
      }
      await prepared.promise;
      expect(await f.service.preview(actor, f.intent)).toMatchObject({ allowed: false, reason_code: "PENDING_CONTROL_CAPACITY_EXCEEDED" });
      const uncertain = await submitted;
      expect(uncertain).toMatchObject({ delivery: "DELIVERY_UNKNOWN", business: { state: "UNKNOWN" } });
      for (const result of await Promise.all(competitors)) expect(result).toMatchObject({ allowed: false, reason_code: "PENDING_CONTROL_UNAVAILABLE" });
      // The timed-out provider promises still own all four source slots.
      expect(await f.service.preview(actor, f.intent)).toMatchObject({ allowed: false, reason_code: "PENDING_CONTROL_CAPACITY_EXCEEDED" });
      expect(f.counts()).toEqual({ sends: 1, lookups: 0, effects: 1 });
    } finally { held.release(); await Promise.allSettled(sourceWork); await Promise.allSettled([submitted, ...competitors]); }
    expect((await f.service.preview(actor, f.intent)).allowed).toBe(true);
    const row = (await ctx.pool.query("SELECT command_id FROM execution_pending_recall_commands WHERE workspace_id=$1", [f.workspace])).rows[0];
    expect((await f.service.reconcile(actor, f.workspace, row.command_id)).business.state).toBe("WAITING_ENCUMBRANCE");
    expect(f.counts().sends).toBe(1); expect(f.counts().effects).toBe(1);
  }, 30_000);
  it("missing/verified-UNKNOWN/stale-null lookup cannot clear an active genuine sender UUID", async () => {
    const f = await fixture(), started = deferred(), held = deferred(), send = f.trust.send;
    f.trust.send = async input => { started.release(); await held.promise; return send(input); };
    const submitted = f.submit(); void submitted.catch(() => {});
    try {
      await started.promise;
      const before = (await ctx.pool.query("SELECT command_id,status,attempt_id FROM execution_pending_recall_commands WHERE workspace_id=$1", [f.workspace])).rows[0];
      expect(before.status.delivery).toBe("SENDING"); expect(before.attempt_id).not.toBeNull();
      await f.service.recover(f.workspace, before.command_id); // actual provider returns null
      f.trust.lookup = async ({ authorization }) => f.frame(authorization, "STATUS", unknownSummary(), "SERVICE_LOOKUP_VERIFIED");
      await f.service.recover(f.workspace, before.command_id);
      expect((await f.store.update(f.workspace, before.command_id, null, () => { throw new Error("TEST_ONLY:stale transform executed"); })).attempt).toBe(before.attempt_id);
      expect((await f.store.update(f.workspace, before.command_id, randomUUID(), () => { throw new Error("TEST_ONLY:wrong transform executed"); })).attempt).toBe(before.attempt_id);
      const after = await f.record(before.command_id);
      expect(after.status).toEqual(before.status); expect(after.attempt).toBe(before.attempt_id);
      expect((await ctx.pool.query("SELECT count(*)::int AS n FROM execution_pending_recall_events WHERE command_id=$1", [before.command_id])).rows[0].n).toBe(2);
    } finally { held.release(); }
    expect((await submitted).business.state).toBe("WAITING_ENCUMBRANCE"); expect(f.counts().sends).toBe(1);
  });
  it("publishes immutable intent currency on submit/read/reconcile but never rewrites historical status bytes", async () => {
    const f=await fixture(),submitted=await f.submit();
    expect(submitted.currency).toBe(f.intent.business_payload.currency);
    const snapshot=async()=>({row:(await ctx.pool.query("SELECT intent,status,authorization_fact,intent_hash FROM execution_pending_recall_commands WHERE command_id=$1",[submitted.command_id])).rows[0],
      events:(await ctx.pool.query("SELECT count(*)::int AS n FROM execution_pending_recall_events WHERE command_id=$1",[submitted.command_id])).rows[0].n});
    const before=await snapshot();expect(before.row.status).not.toHaveProperty("currency");
    expect((await f.service.status(actor,f.workspace,submitted.command_id)).currency).toBe(f.intent.business_payload.currency);
    expect(await snapshot()).toEqual(before);
    expect((await f.service.reconcile(actor,f.workspace,submitted.command_id)).currency).toBe(f.intent.business_payload.currency);
    expect((await f.record(submitted.command_id)).status).not.toHaveProperty("currency");
    const original=PendingControlStore.prototype.candidate;
    const fault=vi.spyOn(PendingControlStore.prototype,"candidate").mockImplementation(async function(this:PendingControlStore,...args){
      const row=await original.apply(this,args);
      if(!row||row.id!==submitted.command_id)return row;
      return {...row,intent:{...f.intent,
        business_payload:{...f.intent.business_payload,currency:"EUR"}}};
    });
    try {await expect(f.service.status(actor,f.workspace,submitted.command_id))
      .rejects.toMatchObject({code:"PENDING_CONTROL_RECEIPT_UNVERIFIED",status:503});}
    finally {fault.mockRestore();}
    expect(f.counts().sends).toBe(1);
  });
  it("lost local COMMIT acknowledgement never sends or clears another attempt", async () => {
    const f = await fixture(), preview = await f.service.preview(actor, f.intent), boundary = f.access.commandBoundary.bind(f.access);
    let calls = 0;
    const spy = vi.spyOn(f.access, "commandBoundary").mockImplementation(async (...args) => {
      const result = await boundary(...args); if (++calls === 2) throw new Error("TEST_ONLY:local-COMMIT-ACK-loss"); return result;
    });
    try { await expect(f.service.submit(actor, f.intent, preview.preview_digest!))
      .rejects.toMatchObject({ code: "PENDING_CONTROL_UNAVAILABLE", status: 503 }); } finally { spy.mockRestore(); }
    const row = (await ctx.pool.query("SELECT command_id,status,attempt_id FROM execution_pending_recall_commands WHERE workspace_id=$1", [f.workspace])).rows[0];
    expect(row.status.delivery).toBe("DELIVERY_UNKNOWN"); expect(row.attempt_id).toBeNull();
    expect(await f.service.submit(actor, f.intent, preview.preview_digest!)).toEqual({...row.status,currency:f.intent.business_payload.currency});
    expect(f.counts().sends).toBe(0);
  });
  it("an authenticated owning lookup settles an in-flight sender, whose late response cannot overwrite it", async () => {
    const f = await fixture(), started = deferred(), held = deferred(), send = f.trust.send;
    f.trust.send = async input => { const frame = await send(input); started.release(); await held.promise; return frame; };
    const submitted = f.submit(); void submitted.catch(() => {});
    let settled: PendingControlStatus | undefined;
    try {
      await started.promise;
      const before = (await ctx.pool.query("SELECT command_id,attempt_id FROM execution_pending_recall_commands WHERE workspace_id=$1", [f.workspace])).rows[0];
      expect(before.attempt_id).not.toBeNull();
      settled = await f.service.reconcile(actor, f.workspace, before.command_id);
      expect(settled.delivery).toBe("ACKNOWLEDGED"); expect((await f.record(before.command_id)).attempt).toBeNull();
    } finally { held.release(); }
    expect(await submitted).toEqual(settled);
    expect(f.counts()).toEqual({ sends: 1, lookups: 1, effects: 1 });
    expect((await ctx.pool.query("SELECT count(*)::int AS n FROM execution_pending_recall_events WHERE command_id=$1", [settled!.command_id])).rows[0].n).toBe(3);
  });
  it("linked WAITING then terminal receipt preserves original control and publishes absent latest operation honestly", async () => {
    const f = await fixture(), first = await f.submit(), original = first.business.receipt!, key = f.intent.business_payload.idempotency_key;
    const { operation: _operation, ...withoutOperation } = f.effects.get(key)!;
    const middle: Summary = { ...withoutOperation, original_receipt_id: original.control_receipt_id,
      queried_operation: f.intent.business_payload.operation, receipt_id: next(), source_event_id: next(),
      applied: "70.000000000000000001", pending: "30", ...Object.fromEntries(Object.entries(advance(original.versions)).map(([k, v]) => [`${k}_version`, v])) };
    f.effects.set(key, middle);
    const advanced = await f.service.reconcile(actor, f.workspace, first.command_id);
    expect(advanced.business).toMatchObject({ state: "WAITING_ENCUMBRANCE", business_applied: false,
      amounts: { requested: amount().requested, applied: "70.000000000000000001", pending: "30" },
      receipt: { control_receipt_id: original.control_receipt_id, latest_receipt_id: middle.receipt_id,
        original_payload_sha256: original.original_payload_sha256, latest_operation: null,
        latest_operation_availability: "NOT_PUBLISHED", latest_operation_reason: "SOURCE_OPERATION_NOT_PUBLISHED" } });
    f.effects.set(key, { ...middle, state: "PARTIALLY_APPLIED_CANCELLED", next_action: "REVIEW_RECEIPT", cli_exit_code: "2",
      pending: "0", cancelled: "30", blockers: [], receipt_id: next(), source_event_id: next(),
      ...Object.fromEntries(Object.entries(advance(advanced.business.receipt!.versions)).map(([k, v]) => [`${k}_version`, v])) });
    const terminal = await f.service.reconcile(actor, f.workspace, first.command_id);
    expect(terminal).toMatchObject({ delivery: "ACKNOWLEDGED", next_action: "REVIEW_RECEIPT", business: {
      state: "PARTIALLY_APPLIED_CANCELLED", business_applied: false, amounts: { pending: "0", cancelled: "30" },
      receipt: { control_receipt_id: original.control_receipt_id, latest_operation: null } } });
    const terminalSource = f.effects.get(key)!;
    f.effects.set(key, { ...terminalSource, receipt_id: next(), source_event_id: next(), blockers: ["TEST_ONLY:illegal-later-terminal"],
      ...Object.fromEntries(Object.entries(advance(terminal.business.receipt!.versions)).map(([k, v]) => [`${k}_version`, v])) });
    await expect(f.service.reconcile(actor, f.workspace, first.command_id))
      .rejects.toMatchObject({ code: "PENDING_CONTROL_RECEIPT_UNVERIFIED", status: 503 });
    f.trust.lookup = async ({ authorization }) => f.frame(authorization, "STATUS", unknownSummary(), "SERVICE_LOOKUP_VERIFIED");
    expect(await f.service.reconcile(actor, f.workspace, first.command_id)).toEqual(terminal);
    expect(f.counts().sends).toBe(1);
    const history = (await ctx.pool.query("SELECT status FROM execution_pending_recall_events WHERE command_id=$1 ORDER BY recorded_at_ms,event_id", [first.command_id])).rows;
    expect(history).toHaveLength(5); expect(history.filter(r => r.status.business.state !== "UNKNOWN")
      .map(r => r.status.business.receipt.control_receipt_id)).toEqual([original.control_receipt_id, original.control_receipt_id, original.control_receipt_id]);
    expect((await f.record(first.command_id)).authorization.original_payload_sha256).toBe(original.original_payload_sha256);
  });
  it.each(["bad-byte-hash", "same-revision-change", "mixed-cas", "changed-original-digest"] as const)(
    "%s cannot erase an accepted WAITING partition or add history", async variant => {
      const f = await fixture(), first = await f.submit(), key = f.intent.business_payload.idempotency_key;
      const saved = await f.record(first.command_id), base = f.effects.get(key)!, lookup = f.trust.lookup;
      if (variant === "bad-byte-hash") f.trust.lookup = async input => ({ ...(await lookup(input))!, response_sha256: "0".repeat(64) });
      else f.effects.set(key, variant === "changed-original-digest" ? { ...base, payload_digest: "0".repeat(64) } :
        variant === "same-revision-change" ? { ...base, blockers: ["TEST_ONLY:changed-without-revision"] } :
        { ...base, receipt_id: next(), source_event_id: next(),
          original_receipt_id: first.business.receipt!.control_receipt_id, queried_operation: f.intent.business_payload.operation,
          command_version: String(BigInt(saved.status.business.receipt!.versions.command) + 1n),
          budget_version: saved.authorization.expected_versions.budget });
      await expect(f.service.reconcile(actor, f.workspace, first.command_id))
        .rejects.toMatchObject({ code: "PENDING_CONTROL_RECEIPT_UNVERIFIED", status: 503 });
      expect(await f.service.status(actor, f.workspace, first.command_id)).toEqual(first);
      expect((await ctx.pool.query("SELECT count(*)::int AS n FROM execution_pending_recall_events WHERE command_id=$1", [first.command_id])).rows[0].n).toBe(3);
      expect(f.counts().sends).toBe(1);
    });
  it("SQL guards reject incomplete known facts, changed immutable identity/history and oversized JSON without rewriting", async () => {
    const f = await fixture(), first = await f.submit();
    const replace = (path: string[], value: unknown) => {
      const next = structuredClone(first) as any; let at = next;
      for (const part of path.slice(0, -1)) at = at[part]; at[path.at(-1)!] = value; return next;
    };
    const statuses = [replace(["business", "amounts"], null), replace(["business", "receipt", "versions", "budget"], null),
      replace(["business", "receipt", "versions", "source"], "9223372036854775808"),
      replace(["business", "amounts", "pending"], "60.000000000000000001"),
      replace(["business", "receipt", "control_receipt_id"], next()),
      { ...first, private_diagnostic: "x".repeat(33_000) }];
    for (const status of statuses) await expect(ctx.pool.query(
      "UPDATE execution_pending_recall_commands SET status=$2 WHERE command_id=$1", [first.command_id, status])).rejects.toThrow();
    // Only next_action changes: the BEFORE trigger sees identical business,
    // so this specifically reaches the table CHECK, not same-revision guard.
    await expect(ctx.pool.query("UPDATE execution_pending_recall_commands SET status=$2 WHERE command_id=$1",
      [first.command_id, { ...first, next_action: "REVIEW_RECEIPT" }])).rejects.toMatchObject({ code: "23514" });
    const revisedReceipt = { ...first.business.receipt!, versions: advance(first.business.receipt!.versions),
      latest_receipt_id: next(), source_event_id: next() };
    // Every amount vector retains the exact requested partition. Identity,
    // clocks, five-CAS and new receipt/event IDs are otherwise valid. In
    // particular WAITING -> APPLIED still has pending=60: no earlier generic
    // partition/immutable/same-revision error may satisfy this regression.
    for (const [state, amounts] of [
      ["APPLIED", amount()], ["REJECTED", amount()],
      ["CANCELLED", { ...amount(), pending: "0", cancelled: "60" }],
      ["PARTIALLY_APPLIED_CANCELLED", { ...amount(), applied: "0", pending: "0", cancelled: amount().requested }],
      ["WAITING_ENCUMBRANCE", { ...amount(), pending: "59", cancelled: "1" }],
    ] as const) {
      const status = { ...first, next_action: state === "WAITING_ENCUMBRANCE" ? "QUERY_SAME_INTENT" : "REVIEW_RECEIPT",
        business: { ...first.business, state, business_applied: state === "APPLIED", amounts, receipt: revisedReceipt } };
      await expect(ctx.pool.query("UPDATE execution_pending_recall_commands SET status=$2 WHERE command_id=$1",
        [first.command_id, status])).rejects.toThrow("PENDING_CONTROL_STATE_PARTITION_INVALID");
    }
    // A valid forward WAITING partition and strictly newer command revision
    // must identify BOTH a new receipt and a new event. All immutable original
    // metadata, exact requested value and monotonic cumulative amounts survive.
    for (const changed of ["neither", "receipt-only", "event-only"] as const) {
      const status = { ...first, business: { ...first.business,
        amounts: { ...amount(), applied: "70.000000000000000001", pending: "30" },
        receipt: { ...revisedReceipt,
          latest_receipt_id: changed === "receipt-only" ? next() : first.business.receipt!.latest_receipt_id,
          source_event_id: changed === "event-only" ? next() : first.business.receipt!.source_event_id } } };
      await expect(ctx.pool.query("UPDATE execution_pending_recall_commands SET status=$2 WHERE command_id=$1",
        [first.command_id, status])).rejects.toThrow("PENDING_CONTROL_NEW_REVISION_RECEIPT_REQUIRED");
    }
    await expect(ctx.pool.query("UPDATE execution_pending_recall_commands SET intent=intent||$2::jsonb WHERE command_id=$1",
      [first.command_id, { expected_policy_revision: next() }])).rejects.toThrow("PENDING_CONTROL_INTENT_IMMUTABLE");
    await expect(ctx.pool.query("DELETE FROM execution_pending_recall_events WHERE command_id=$1", [first.command_id]))
      .rejects.toThrow("PENDING_CONTROL_HISTORY_IMMUTABLE");
    await expect(ctx.pool.query("UPDATE execution_pending_recall_events SET recorded_at_ms=recorded_at_ms+1 WHERE command_id=$1", [first.command_id]))
      .rejects.toThrow("PENDING_CONTROL_HISTORY_IMMUTABLE");
    expect(await f.service.status(actor, f.workspace, first.command_id)).toEqual(first);
    const product = (await ctx.pool.query("SELECT metadata_json FROM product_audit_events WHERE aggregate_id=$1", [first.command_id])).rows;
    expect(product).toHaveLength(3);
    for (const row of product) {
      expect(Object.keys(row.metadata_json).sort()).toEqual(["authority", "business", "delivery", "intent_hash", "operation"]);
      expect(JSON.stringify(row.metadata_json)).not.toMatch(/original_payload_sha256|membership_receipt_ref|reason|source_target_ref/);
    }
  });
  it("mutation replay does not borrow audit rights; revoked reader cannot trigger service lookup", async () => {
    const f = await fixture(), first = await f.submit();
    await f.repo.saveGrant({ ...f.grants[2], revoked_at_ms: Date.now(), revision: next() });
    expect(await f.submit()).toEqual(first);
    await expect(f.service.status(actor, f.workspace, first.command_id)).rejects.toMatchObject({ status: 404 });
    await expect(f.service.reconcile(actor, f.workspace, first.command_id)).rejects.toMatchObject({ status: 404 });
    expect(f.counts()).toEqual({ sends: 1, lookups: 0, effects: 1 });
  });
  it("raw row load cannot retain audit rights after the independently accepted native leg disappears", async () => {
    const f = await fixture(), first = await f.submit(), load = PendingControlStore.prototype.candidate; let changed = false;
    const spy = vi.spyOn(PendingControlStore.prototype, "candidate").mockImplementation(async function (this: PendingControlStore, ...args) {
      const row = await load.apply(this, args);
      if (args[0] === f.workspace && !changed) { changed = true;
        f.source.grants.find(g => g.grant_id === f.grants[2].grant_id)!.targets = []; }
      return row;
    });
    try {
      await expect(f.service.status(actor, f.workspace, first.command_id)).rejects.toMatchObject({ status: 404 });
      expect(changed).toBe(true); expect((await f.service.preview(actor, f.intent)).allowed).toBe(true);
      expect(f.counts()).toEqual({ sends: 1, lookups: 0, effects: 1 });
    } finally { spy.mockRestore(); }
  });
  it("authorized corrupt private status is fixed503, hidden/wrong-workspace status is404 before full decoder", async () => {
    const f = await fixture(), first = await f.submit();
    // Valid DB transport metadata, invalid strict public payload. No immutable
    // original intent/proof mutation and no SQL constraint/trigger bypass.
    await ctx.pool.query("UPDATE execution_pending_recall_commands SET status=status||$2::jsonb WHERE command_id=$1",
      [first.command_id, { private_diagnostic: "TEST_ONLY:DO_NOT_DISCLOSE" }]);
    await expect(f.service.status(actor, f.workspace, first.command_id))
      .rejects.toMatchObject({ code: "PENDING_CONTROL_RECEIPT_UNVERIFIED", status: 503 });
    await f.repo.saveGrant({ ...f.grants[2], revoked_at_ms: Date.now(), revision: next() });
    await expect(f.service.status(actor, f.workspace, first.command_id)).rejects.toMatchObject({ status: 404 });
    await expect(f.service.status(actor, next(), first.command_id)).rejects.toMatchObject({ status: 404 });
    expect(f.counts()).toEqual({ sends: 1, lookups: 0, effects: 1 });
  });
  it("historical original human expiry does not replace current audit authority or cause resend", async () => {
    const f = await fixture(), now = Date.now(), a = pendingControlAuthorization.parse({ ...f.makeAuthorization(),
      issued_at_ms: now, expires_at_ms: now + 1000, idempotency_retained_until_ms: now + 1500 });
    const old = await f.boundary(db => f.store.insert(db, actor.user_id, f.intent, pendingIntentHash(actor, f.intent), a));
    await f.store.update(f.workspace, old.id, null, row => ({ ...row.status, delivery: "DELIVERY_UNKNOWN" }));
    // The originally inserted immutable proof actually becomes historical;
    // never edit its expiry or backdate a different original user/receipt.
    const delay = a.idempotency_retained_until_ms - Date.now() + 10;
    expect(delay).toBeGreaterThan(0); expect(delay).toBeLessThan(2000);
    await new Promise(resolve => setTimeout(resolve, delay));
    expect(a.expires_at_ms).toBeLessThan(Date.now()); expect(a.idempotency_retained_until_ms).toBeLessThan(Date.now());
    expect((await f.service.status(actor, f.workspace, old.id)).delivery).toBe("DELIVERY_UNKNOWN");
    expect((await f.service.reconcile(actor, f.workspace, old.id)).delivery).toBe("DELIVERY_UNKNOWN");
    expect(f.counts()).toEqual({ sends: 0, lookups: 0, effects: 0 });
  }, 10_000);
  it("full current DENY and environment still win over an accepted action, owner and another allowed action", async () => {
    const f = await fixture();
    const { ts_acceptance_digest: _digest, ...base } = f.grants[0];
    await f.repo.saveGrant({ ...base, grant_id: next(), revision: next(), effect: "DENY",
      requires_ts_acceptance: false, ts_receipt: null }, true);
    await expect(f.service.preview(actor, f.intent)).rejects.toMatchObject({ code: "ACCESS_DENIED", status: 403 });
    const cancel = pendingControlIntent.parse({ ...f.intent, business_payload: {
      ...f.intent.business_payload, operation: "CANCEL_REMAINING", idempotency_key: next() } });
    expect((await f.service.preview(actor, cancel)).allowed).toBe(true);
    await expect(f.service.preview(actor, pendingControlIntent.parse({ ...cancel, environment: "live" })))
      .rejects.toMatchObject({ code: "ACCESS_DENIED", status: 403 });
    expect(f.counts()).toEqual({ sends: 0, lookups: 0, effects: 0 });
  });
  it("a qualified legacy singleton is neither a new pending action nor independent audit correspondence", async () => {
    const f = await fixture(), first = await f.submit();
    delete f.relations.current_authority;
    const mutation = f.grants[0].ts_receipt!, audit = f.grants[2].ts_receipt!;
    f.relations.membership = { receipt_id: mutation.receipt_id, revision: mutation.membership_revision,
      mapping_revision: mutation.mapping_revision };
    await expect(f.service.preview(actor, f.intent)).rejects.toMatchObject({ code: "ACCESS_DENIED", status: 403 });
    f.relations.membership = { receipt_id: audit.receipt_id, revision: audit.membership_revision,
      mapping_revision: audit.mapping_revision };
    await expect(f.service.status(actor, f.workspace, first.command_id))
      .rejects.toMatchObject({ code: "ACCESS_RESOURCE_NOT_FOUND", status: 404 });
    expect(f.counts()).toEqual({ sends: 1, lookups: 0, effects: 1 });
  });
  it("service-only same-key recovery preserves accepted source fact after original human loses current audit", async () => {
    const f = await fixture(), send = f.trust.send;
    f.trust.send = async input => { await send(input); throw new Error("TEST_ONLY response loss"); };
    const uncertain = await f.submit();
    await f.repo.saveGrant({ ...f.grants[2], revoked_at_ms: Date.now(), revision: next() });
    await expect(f.service.reconcile(actor, f.workspace, uncertain.command_id)).rejects.toMatchObject({ status: 404 });
    expect(f.counts().lookups).toBe(0);
    await f.service.recover(f.workspace, uncertain.command_id);
    expect((await f.record(uncertain.command_id)).status.business.state).toBe("WAITING_ENCUMBRANCE");
    await expect(f.service.status(actor, f.workspace, uncertain.command_id)).rejects.toMatchObject({ status: 404 });
    expect(f.counts()).toEqual({ sends: 1, lookups: 1, effects: 1 });
  });
  it("actual session revocation after released row load wins over both valid and corrupt private bodies", async () => {
    for (const corrupt of [false, true]) {
      const f = await fixture(), first = await f.submit();
      const second = await auth.login({ assertion: username, username, credential: password });
      const secondActor = { ...actor, session_id: second.sessionId };
      if (corrupt) await ctx.pool.query("UPDATE execution_pending_recall_commands SET status=status||$2::jsonb WHERE command_id=$1",
        [first.command_id, { private_diagnostic: "TEST_ONLY:DO_NOT_DISCLOSE" }]);
      const load = PendingControlStore.prototype.candidate; let revoked = false;
      const spy = vi.spyOn(PendingControlStore.prototype, "candidate").mockImplementation(async function (this: PendingControlStore, ...args) {
        const row = await load.apply(this, args);
        if (args[0] === f.workspace && !revoked) {
          await new SessionsRepository(ctx.pool).revokeSession(second.sessionId, "TEST_ONLY pending released-row revoke"); revoked = true;
        }
        return row;
      });
      try {
        await expect(f.service.status(secondActor, f.workspace, first.command_id))
          .rejects.toMatchObject({ code: "CURRENT_ACTOR_AUTHORITY_REQUIRED", status: 403 });
        expect(revoked).toBe(true); expect(f.counts().lookups).toBe(0);
      } finally { spy.mockRestore(); }
    }
  });
  it("actual final captured idle lease expires naturally, suppressing even a held strict-decoder error", async () => {
    const f = await fixture(), first = await f.submit();
    await ctx.pool.query("UPDATE execution_pending_recall_commands SET status=status||$2::jsonb WHERE command_id=$1",
      [first.command_id, { private_diagnostic: "TEST_ONLY:DO_NOT_DISCLOSE" }]);
    const second = await auth.login({ assertion: username, username, credential: password });
    const secondActor = { ...actor, session_id: second.sessionId }, confirm = f.access.confirmReadContext.bind(f.access);
    let deadline = 0, waited = false;
    const spy = vi.spyOn(f.access, "confirmReadContext").mockImplementation(async (...args) => {
      expect(args[0].session_id).toBe(second.sessionId);
      const row = await ctx.pool.query(`UPDATE auth_sessions SET idle_expires_at=clock_timestamp()+interval '1500 milliseconds'
        WHERE session_id=$1 AND state='ACTIVE'
        RETURNING floor(extract(epoch FROM least(idle_expires_at,absolute_expires_at))*1000)::bigint AS ms`, [second.sessionId]);
      expect(row.rowCount).toBe(1); deadline = Number(row.rows[0].ms);
      const current = await confirm(...args);
      expect(current.actor_lease_until_ms).toBe(deadline); expect(current.now_ms).toBeLessThan(deadline);
      const delay = deadline - Date.now() + 10; expect(delay).toBeGreaterThan(0); expect(delay).toBeLessThan(2600);
      await new Promise(resolve => setTimeout(resolve, delay)); waited = true;
      return current; // The genuine DB capture is not mutated/extended.
    });
    try {
      await expect(f.service.status(secondActor, f.workspace, first.command_id))
        .rejects.toMatchObject({ code: "CURRENT_ACTOR_AUTHORITY_REQUIRED", status: 403 });
      expect(waited).toBe(true); expect(Date.now()).toBeGreaterThanOrEqual(deadline);
      expect(spy).toHaveBeenCalledTimes(1); expect(f.counts().lookups).toBe(0);
    } finally { spy.mockRestore(); }
  }, 10_000);
  it("genuine session renewal is accepted when released row work outlives the original captured lease", async () => {
    const f = await fixture(), first = await f.submit(), second = await auth.login({ assertion: username, username, credential: password });
    const secondActor = { ...actor, session_id: second.sessionId }, read = f.access.readContext.bind(f.access);
    let initialDeadline = 0, captures = 0, renewed = false;
    const capture = vi.spyOn(f.access, "readContext").mockImplementation(async (...args) => {
      if (++captures === 1) {
        const row = await ctx.pool.query(`UPDATE auth_sessions SET idle_expires_at=clock_timestamp()+interval '1500 milliseconds'
          WHERE session_id=$1 AND state='ACTIVE'
          RETURNING floor(extract(epoch FROM least(idle_expires_at,absolute_expires_at))*1000)::bigint AS ms`, [second.sessionId]);
        expect(row.rowCount).toBe(1); initialDeadline = Number(row.rows[0].ms);
      }
      const current = await read(...args);
      if (captures === 1) expect(current.actor_lease_until_ms).toBe(initialDeadline);
      else expect(current.actor_lease_until_ms).toBeGreaterThan(initialDeadline);
      return current;
    });
    const load = PendingControlStore.prototype.candidate;
    const held = vi.spyOn(PendingControlStore.prototype, "candidate").mockImplementation(async function (this: PendingControlStore, ...args) {
      const row = await load.apply(this, args);
      expect(Date.now()).toBeLessThan(initialDeadline);
      expect((await auth.sessionFromToken(second.token))?.state).toBe("ACTIVE");
      await new SessionsRepository(ctx.pool).markSeen(second.sessionId); renewed = true;
      const delay = initialDeadline - Date.now() + 10; expect(delay).toBeGreaterThan(0); expect(delay).toBeLessThan(2600);
      await new Promise(resolve => setTimeout(resolve, delay)); return row;
    });
    try {
      expect(await f.service.status(secondActor, f.workspace, first.command_id)).toEqual(first);
      expect(renewed).toBe(true); expect(captures).toBe(3); expect(held).toHaveBeenCalledTimes(1);
      expect(Date.now()).toBeGreaterThanOrEqual(initialDeadline); expect(f.counts().lookups).toBe(0);
    } finally { capture.mockRestore(); held.mockRestore(); }
  }, 10_000);
  it("mounted session HTTP enforces Origin/CSRF/exact key, strict bodies, current disclosure and sanitized errors", async () => {
    const f = await fixture();
    await mounted(f, async (http, headers, base) => {
      const noSession = await http.inject({ method: "POST", url: base + "/preview", payload: f.intent });
      expect(noSession.statusCode).toBe(401); expect(noSession.headers["cache-control"]).toBe("private, no-store");
      for (const [changedHeaders, code] of [
        [{ ...headers, origin: "https://other.invalid" }, 403], [{ ...headers, [CSRF_HEADER]: "" }, 403],
        [{ ...headers, [CSRF_HEADER]: "TEST_ONLY:invalid" }, 403],
        [{ ...headers, "x-portal-idempotency-key": "TEST_ONLY:wrong" }, 400],
      ] as const) {
        const denied = await http.inject({ method: "POST", url: base + "/preview", headers: changedHeaders, payload: f.intent });
        expect(denied.statusCode).toBe(code); expect(denied.headers["cache-control"]).toBe("private, no-store");
      }
      for (const payload of [{ ...f.intent, actor_id: "TEST_ONLY:spoof" },
        { ...f.intent, business_payload: { ...f.intent.business_payload, amount: "1" } },
        { ...f.intent, business_payload: { ...f.intent.business_payload, expected_versions: { ...f.intent.business_payload.expected_versions, budget: 1 } } }])
        expect((await http.inject({ method: "POST", url: base + "/preview", headers, payload })).statusCode).toBe(400);
      const preview = await http.inject({ method: "POST", url: base + "/preview", headers, payload: f.intent });
      expect(preview.statusCode).toBe(200); expect(preview.json()).toMatchObject({ allowed: true, reserved: false, prediction: f.prediction() });
      const submit = await http.inject({ method: "POST", url: base, headers,
        payload: { intent: f.intent, preview_digest: preview.json().preview_digest } });
      expect(submit.statusCode).toBe(200); const first = submit.json<PendingControlStatus>(), id = first.command_id;
      const get = () => http.inject({ method: "GET", url: `${base}/${id}?workspace_id=${encodeURIComponent(f.workspace)}`, headers });
      const read = await get(); expect(read.statusCode).toBe(200); expect(read.json()).toEqual(first);
      expect(read.headers["cache-control"]).toBe("private, no-store");
      expect((await http.inject({ method: "GET", url: `${base}/${id}?workspace_id=${encodeURIComponent(f.workspace)}&source_url=spoof`, headers })).statusCode).toBe(400);
      expect((await http.inject({ method: "POST", url: `${base}/${id}/reconcile`, headers: { ...headers, [CSRF_HEADER]: "" },
        payload: { workspace_id: f.workspace } })).statusCode).toBe(403);
      const reconciled = await http.inject({ method: "POST", url: `${base}/${id}/reconcile`, headers, payload: { workspace_id: f.workspace } });
      expect(reconciled.statusCode).toBe(200); expect(reconciled.json()).toEqual(first);
      await ctx.pool.query("UPDATE execution_pending_recall_commands SET status=status||$2::jsonb WHERE command_id=$1", [id,
        { private_diagnostic: "TEST_ONLY:DO_NOT_DISCLOSE" }]);
      const corrupt = await get(); expect(corrupt.statusCode).toBe(503);
      expect(corrupt.json().error.code).toBe("PENDING_CONTROL_RECEIPT_UNVERIFIED");
      expect(corrupt.body).not.toMatch(/DO_NOT_DISCLOSE|authorization|sql|stack|source_target_ref|mapping_revision/i);
      await f.repo.saveGrant({ ...f.grants[2], revoked_at_ms: Date.now(), revision: next() });
      const hidden = await get(), missing = await http.inject({ method: "GET",
        url: `${base}/ecm_00000000000000000000000000000000?workspace_id=${encodeURIComponent(f.workspace)}`, headers });
      const foreign = await http.inject({ method: "GET", url: `${base}/${id}?workspace_id=TEST_ONLY:missing`, headers });
      expect(hidden.statusCode).toBe(404); expect(missing.statusCode).toBe(404); expect(foreign.statusCode).toBe(404);
      expect(hidden.json().error).toEqual(missing.json().error); expect(foreign.json().error).toEqual(missing.json().error);
      for (const response of [hidden, missing, foreign]) {
        expect(response.headers["cache-control"]).toBe("private, no-store");
        expect(response.body).not.toMatch(/DO_NOT_DISCLOSE|authorization|source_target_ref|mapping_revision/);
      }
      expect(f.counts()).toEqual({ sends: 1, lookups: 1, effects: 1 });
    });
  });
  it("retained review reads original Core workspace but every control mutation remains disabled", async () => {
    const f = await fixture(), first = await f.submit();
    await mounted(f, async (http, headers, base) => {
      const read = await http.inject({ method: "GET", url: `${base}/${first.command_id}?workspace_id=${encodeURIComponent(f.workspace)}`, headers });
      expect(read.statusCode).toBe(200); expect(read.json()).toEqual(first); expect(read.headers["cache-control"]).toBe("private, no-store");
      for (const [path, payload] of [[base + "/preview", f.intent],
        [base, { intent: f.intent, preview_digest: accessDigest("TEST_ONLY:not-used") }],
        [`${base}/${first.command_id}/reconcile`, { workspace_id: f.workspace }]] as const) {
        const denied = await http.inject({ method: "POST", url: path, headers, payload });
        expect(denied.statusCode).toBe(403); expect(denied.headers["cache-control"]).toBe("private, no-store");
      }
      expect(f.counts()).toEqual({ sends: 1, lookups: 0, effects: 1 });
    }, true);
  });
});
