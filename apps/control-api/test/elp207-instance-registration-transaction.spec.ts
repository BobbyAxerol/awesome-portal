/** Disposable PG + actual mounted session/HTTP registration regressions.
 * Synthetic TEST_ONLY registration provider, never PM/runtime authority. */
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import cookiePlugin from "@fastify/cookie";
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
import { CONTROL_API_CONFIG } from "../src/tokens";
import { AccessRepository } from "../src/execution-v2/access.repository";
import { ExecutionAccessService } from "../src/execution-v2/access.service";
import type { AccessTrustProvider } from "../src/execution-v2/access-trust";
import { tsRootMembershipAcceptance, type AccessActor, type ReviewedAccessPolicy,
  type ScopedAccessGrant } from "../src/execution-v2/access.contract";
import { accessDigest, canonicalSelector, type AccessRelations } from "../src/execution-v2/access-policy";
import { currentAccessRelations, grantBindingDigest,
  type CurrentAccessRelations } from "../src/execution-v2/access-current-relations";
import { InstanceRegistrationController } from "../src/execution-v2/instance-registration.controller";
import { InstanceRegistrationService } from "../src/execution-v2/instance-registration.service";
import { InstanceRegistrationStore } from "../src/execution-v2/instance-registration.store";
import type { InstanceRegistrationIntent } from "../src/execution-v2/instance-registration.contract";
import { instanceRegistrationAuthorization, registrationSourcePins, registrationIntentHash,
  registrationRequestDigests, registrationPreviewHash, type InstanceRegistrationAuthorization,
  type InstanceRegistrationTrust, type VerifiedRegistrationFrame } from "../src/execution-v2/instance-registration.trust";
import { migrateTestDatabase, setupApp, teardownApp } from "./harness";

const next = () => `TEST_ONLY:${randomUUID()}`;
describe.skipIf(!process.env.TEST_DATABASE_URL)("ELP2-07 isolated registry family real PG/session HTTP", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>, auth: AuthService;
  let user: NonNullable<Awaited<ReturnType<AuthService["users"]["findById"]>>>;
  let session: Awaited<ReturnType<AuthService["login"]>>, actor: AccessActor;
  beforeAll(async () => {
    await migrateTestDatabase(process.env.TEST_DATABASE_URL!);
    ctx = await setupApp({ DATABASE_URL: process.env.TEST_DATABASE_URL! }); auth = ctx.app.get(AuthService);
    vi.spyOn(auth, "verifyAccessIdentity").mockImplementation(async assertion => ({
      iss: "https://test-only.cloudflareaccess.com", sub: `TEST_ONLY:${assertion}`, aud: "test-audience",
      email: `${assertion}@azdag.com`, normalizedEmail: `${assertion}@azdag.com`,
      authenticationTime: new Date(), tokenExpiresAt: new Date(Date.now() + 60_000),
    }));
    const admin = new AdminService(ctx.pool, ctx.config, auth), name = `registry-${randomUUID()}`;
    const made = await admin.createUser({ username: name, displayName: name, role: "USER" });
    const activation = await admin.resetCredential(made.userId);
    const first = await auth.login({ assertion: name, username: name, credential: activation.activationToken });
    const password = "TEST-only-registry-correct-horse-battery-2026";
    await auth.changePassword({ sessionToken: first.token, csrfToken: first.csrfToken,
      currentPassword: activation.activationToken, newPassword: password });
    session = await auth.login({ assertion: name, username: name, credential: password });
    user = (await auth.users.findById(made.userId))!;
    actor = { user_id: user.userId, session_id: session.sessionId, session_generation: user.sessionVersion };
    await new OwnerAccessRepository(ctx.pool).claimOwner({ userId: user.userId, claimedBy: "REGISTRY_TEST_ONLY" });
    await new AccountLifecycleRepository(ctx.pool).grantStepUp({ stepUpId: next(), sessionId: session.sessionId,
      userId: user.userId, ttlSeconds: 600 });
  });
  afterAll(async () => { vi.restoreAllMocks(); if (ctx) await teardownApp(ctx); });
  async function fixture() {
    const workspace = next(), now = Date.now(), resource = { kind: "PORTFOLIO" as const, id: next() };
    await ctx.pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'TEST_ONLY registry',$2)", [workspace, user.userId]);
    await ctx.pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'OWNER')", [workspace, user.userId]);
    const policy: ReviewedAccessPolicy = { workspace_id: workspace, revision: next(), artifact_digest: accessDigest(next()),
      approval_ref: next(), state: "REVIEWED", qualification: "TEST_ONLY", protected_owner_user_id: user.userId,
      researcher_fields: { state: "PENDING", policy_ref: null, fields: [] } };
    const mappingRevision = next(), repo = new AccessRepository(ctx.pool);
    const source: CurrentAccessRelations = { schema_version: "pma.core-current-relations.v1",
      subject_user_id: user.userId, workspace_id: workspace, ts_user_id: `TEST_ONLY:ts:${user.userId}`,
      mapping_revision: mappingRevision, resources: [{ environment: "paper", revision: next(),
        own_alpha_ids: [], member_portfolio_ids: [resource.id], roots: [] }], grants: [] };
    const grants: ScopedAccessGrant[] = (["deployment.register", "audit.read"] as const).map(action => ({
      grant_id: next(), workspace_id: workspace, subject_user_id: user.userId, action, effect: "ALLOW",
      selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "PORTFOLIO", ids: [resource.id] }, environments: ["paper"],
      valid_from_ms: now - 1000, valid_until_ms: now + 60_000, delegable_actions: [], issued_by: user.userId,
      parent_grant_id: null, revision: next(), policy_revision: policy.revision, revoked_at_ms: null, requires_ts_acceptance: true,
      ts_receipt: null, field_policy_ref: null,
    }));
    for (const grant of grants) {
      // Separate original accepted meaning + exact native target per action,
      // not one legacy receipt silently granting both register and audit.
      const fact = tsRootMembershipAcceptance.parse({ context: "REVIEWED_POLICY_ROOT", source: "TEST_ONLY:PM",
        source_contract: "TEST_ONLY:normalized", trust_profile: "TEST_ONLY:uninstalled", receipt_id: next(),
        portal_user_id: user.userId, ts_user_id: source.ts_user_id, mapping_revision: mappingRevision,
        human_requester_user_id: user.userId, workspace_id: workspace, action: grant.action,
        selector_digest: accessDigest(canonicalSelector(grant.selector)), environments: [...grant.environments],
        previous_membership_revision: null, membership_revision: next(), effective_at_ms: now - 500,
        expires_at_ms: now + 55_000, outcome: "ACCEPTED", payload_digest: accessDigest(["TEST_ONLY:payload", grant.grant_id]),
        provenance_ref: "TEST_ONLY:NOT_REAL_SOURCE_ACCEPTANCE", policy_revision: policy.revision,
        policy_artifact_digest: policy.artifact_digest, policy_install_digest: accessDigest(["TEST_ONLY:install", workspace]),
        approval_ref: policy.approval_ref, grant_id: grant.grant_id, grant_digest: accessDigest(grant),
        expected_grant_revision: grant.revision });
      grant.ts_receipt = { receipt_id: fact.receipt_id, membership_revision: fact.membership_revision,
        mapping_revision: fact.mapping_revision, effective_at_ms: fact.effective_at_ms, expires_at_ms: fact.expires_at_ms };
      grant.ts_acceptance_digest = accessDigest(fact);
      source.grants.push({ grant_id: grant.grant_id, binding_digest: grantBindingDigest(grant), accepted: fact,
        targets: [{ environment: "paper", resource, revision: next(),
          native_reference_digest: accessDigest(["TEST_ONLY:leg", grant.grant_id]),
          valid_from_ms: now - 500, valid_until_ms: now + 50_000 }] });
    }
    currentAccessRelations.parse(source);
    await repo.putPolicy(policy); for (const grant of grants) await repo.saveGrant(grant, true);
    const relations: AccessRelations = { qualified: true, revision: next(), own_alpha_ids: [],
      member_portfolio_ids: [resource.id], roots: {}, membership: null, current_authority: source };
    const accessTrust: AccessTrustProvider = { verifyPolicy: async () => null, verifyReceipt: async () => null,
      relations: async () => relations,
      verifiedHumanMapping: async () => ({ ts_user_id: source.ts_user_id, revision: mappingRevision }) };
    const access = new ExecutionAccessService(ctx.pool, auth, accessTrust, true);
    const intent: InstanceRegistrationIntent = { schema_version: "portal.execution.instance-registration-intent.v1",
      workspace_id: workspace, resource, environment: "paper", expected_policy_revision: policy.revision,
      business_payload: { schema_version: "pma.management-command.v1", operation: "REGISTER_INSTANCE", idempotency_key: next(),
        reason: "TEST_ONLY registry transaction", expected_version: "0", expected_policy_revision: "9007199254740993",
        parameters: { alpha_slug: "TEST_ONLY:alpha", venue: "TEST_ONLY:venue", account_type: "MARGIN", currency: "USDT" } } };
    const pins = Object.fromEntries(Object.entries(registrationSourcePins.shape).map(([key, value]) => [key, value.value]));
    let selectedReceipt = grants[0];
    const makeAuthorization = (i = intent) => instanceRegistrationAuthorization.parse({
      qualification: "TEST_ONLY", reference: next(), authority_ref: "TEST_ONLY:pm", profile_ref: "TEST_ONLY:paper",
      audience: "pma.management.v1", source_selection_ref: "TEST_ONLY:selected-registration", source_pins: pins,
      actor_id: user.userId, ts_user_id: `TEST_ONLY:ts:${user.userId}`, workload_ref: "TEST_ONLY:workload",
      delegation_ref: "TEST_ONLY:held-current-human", mapping_revision: mappingRevision,
      membership_revision: selectedReceipt.ts_receipt!.membership_revision,
      membership_receipt_ref: selectedReceipt.ts_receipt!.receipt_id,
      workspace_id: workspace, environment: i.environment, operation: "REGISTER_INSTANCE", resource_kind: "PORTFOLIO",
      resource_id: i.resource.id, source_registration_ref: "TEST_ONLY:registration-target", alpha_slug: i.business_payload.parameters.alpha_slug,
      policy_revision: policy.revision, expected_source_policy_revision: i.business_payload.expected_policy_revision,
      intent_hash: registrationIntentHash(actor, i), request_digests: registrationRequestDigests(i, "TEST_ONLY:registration-target"),
      issued_at_ms: now - 1000, expires_at_ms: now + 30_000, idempotency_retained_until_ms: now + 60_000,
      commit_checks: { human: true, workload: true, membership: true, scope: true, versions: true, registration_rules: true },
    });
    const flags = { native_dispatch_performed: false, activation_performed: false,
      execution_authorized: false, physical_transfer_performed: false, economic_cash_changed: false };
    const previewSummary = (i: InstanceRegistrationIntent) => ({ ...flags, operation: "REGISTER_INSTANCE", idempotency_key: i.business_payload.idempotency_key,
      command_version: "1", state: "PREVIEW_ONLY", predicted_state: "APPLIED", business_applied: false,
      reserved: false, next_action: "REVIEW_PREVIEW", cli_exit_code: "0" });
    const appliedSummary = (i: InstanceRegistrationIntent) => ({ ...flags, operation: "REGISTER_INSTANCE", idempotency_key: i.business_payload.idempotency_key,
      command_version: "1", state: "APPLIED", target_id: "TEST_ONLY:opaque-instance-token", business_applied: true,
      next_action: "REVIEW_RECEIPT", cli_exit_code: "0", receipt_ref: { store: "pm_registry.receipts", operation: "REGISTER_INSTANCE",
        key: "TEST_ONLY:SOURCE-NAMESPACED-KEY", version: "1" } });
    const frame = (authorization: InstanceRegistrationAuthorization, stage: VerifiedRegistrationFrame["stage"],
      summary: unknown, terminal: VerifiedRegistrationFrame["terminal"]): VerifiedRegistrationFrame => {
      const response_json = JSON.stringify(summary);
      return { authorization_digest: accessDigest(authorization), source_selection_ref: authorization.source_selection_ref,
        intent_hash: authorization.intent_hash, stage,
        request_digest: authorization.request_digests[stage.toLowerCase() as "preview" | "apply" | "status"],
        response_sha256: createHash("sha256").update(response_json).digest("hex"), response_json, terminal };
    };
    let sends = 0, lookups = 0;
    const effects = new Map<string, unknown>();
    const trust: InstanceRegistrationTrust = {
      prepare: async ({ intent: i }) => {
        const authorization = makeAuthorization(i);
        return { authorization, preview: frame(authorization, "PREVIEW", previewSummary(i), "PREVIEW_ROLLED_BACK") };
      },
      send: async ({ authorization, intent: i }) => {
        sends++; const summary = appliedSummary(i); effects.set(i.business_payload.idempotency_key, summary);
        return frame(authorization, "APPLY", summary, "REGISTRY_COMMIT_VERIFIED");
      },
      lookup: async ({ authorization, intent: i }) => {
        lookups++; const summary = effects.get(i.business_payload.idempotency_key);
        return summary ? frame(authorization, "STATUS", summary, "SERVICE_LOOKUP_VERIFIED") : null;
      },
    };
    const service = new InstanceRegistrationService(ctx.pool, access, trust, true);
    const submit = async () => service.submit(actor, intent, (await service.preview(actor, intent)).preview_digest!);
    return { workspace, resource, policy, grants, repo, source, relations, access, accessTrust, intent, trust, service, submit,
      makeAuthorization, frame, appliedSummary, effects, counts: () => ({ sends, lookups, effects: effects.size }),
      chooseGrant(grant: ScopedAccessGrant) { selectedReceipt = grant; } };
  }
  it("default provider is dark and TEST_ONLY is refused outside isolated authorization", async () => {
    const f = await fixture();
    expect(await new InstanceRegistrationService(ctx.pool, f.access).preview(actor, f.intent))
      .toMatchObject({ allowed: false, reason_code: "REGISTRATION_NOT_QUALIFIED", reserved: false });
    expect(await new InstanceRegistrationService(ctx.pool, f.access, f.trust, false).preview(actor, f.intent))
      .toMatchObject({ allowed: false });
    expect(f.counts().sends).toBe(0);
  });
  it("a separately valid audit correspondence cannot substitute for the selected registration grant", async () => {
    const f = await fixture(); f.chooseGrant(f.grants[1]);
    expect(f.grants[0].ts_receipt!.receipt_id).not.toBe(f.grants[1].ts_receipt!.receipt_id);
    expect(await f.service.preview(actor, f.intent))
      .toMatchObject({ allowed: false, reason_code: "REGISTRATION_CONTEXT_INVALID" });
    await expect(f.submit()).rejects.toMatchObject({ code: "REGISTRATION_CONTEXT_INVALID", status: 403 });
    expect((await ctx.pool.query("SELECT count(*)::int AS n FROM execution_instance_registration_commands WHERE workspace_id=$1", [f.workspace])).rows[0].n).toBe(0);
    expect(f.counts()).toEqual({ sends: 0, lookups: 0, effects: 0 });
  });
  it("persists exactly one registration attempt under concurrent submit; no capital rows/economic effect", async () => {
    const f = await fixture(), preview = await f.service.preview(actor, f.intent);
    const outcomes = await Promise.allSettled(Array.from({ length: 4 }, () => f.service.submit(actor, f.intent, preview.preview_digest!)));
    expect(outcomes.some(value => value.status === "fulfilled")).toBe(true);
    for (const value of outcomes) if (value.status === "rejected") expect(value.reason.code).toBe("ACCESS_RETRY_REQUIRED");
    const status = await f.submit(); expect(f.counts()).toEqual({ sends: 1, lookups: 0, effects: 1 });
    expect(status).toMatchObject({ family: "INSTANCE_REGISTRATION", business: { state: "APPLIED", business_applied: true },
      canonical_identity: { availability: "NOT_PUBLISHED", account_id: null, deployment_id: null }, venue: "NOT_APPLICABLE" });
    expect((await ctx.pool.query("SELECT count(*)::int AS n FROM execution_trusted_commands WHERE workspace_id=$1", [f.workspace])).rows[0].n).toBe(0);
    const count = (await ctx.pool.query("SELECT count(*)::int AS n FROM execution_instance_registration_events WHERE command_id=$1", [status.command_id])).rows[0].n;
    expect(count).toBe(3);
    expect((await ctx.pool.query("SELECT count(*)::int AS n FROM product_audit_events WHERE aggregate_id=$1", [status.command_id])).rows[0].n).toBe(count);
    await expect(ctx.pool.query("UPDATE execution_instance_registration_commands SET intent='{}' WHERE command_id=$1", [status.command_id]))
      .rejects.toThrow("REGISTRATION_INTENT_IMMUTABLE");
    await expect(ctx.pool.query("DELETE FROM execution_instance_registration_events WHERE command_id=$1", [status.command_id]))
      .rejects.toThrow("REGISTRATION_HISTORY_IMMUTABLE");
  });
  it("same key with changed Alpha never creates another source attempt", async () => {
    const f = await fixture(); await f.submit();
    const changed = { ...f.intent, business_payload: { ...f.intent.business_payload,
      parameters: { ...f.intent.business_payload.parameters, alpha_slug: "TEST_ONLY:different-alpha" } } };
    await expect(f.service.submit(actor, changed, accessDigest("ignored"))).rejects.toMatchObject({ code: "REGISTRATION_IDEMPOTENCY_CONFLICT" });
    expect(f.counts().sends).toBe(1);
  });
  it("pending-intake capacity stops new keys without evicting accepted original identities", async () => {
    const f = await fixture(), store = new InstanceRegistrationStore(ctx.pool);
    const context = await f.access.readContext(actor, f.workspace);
    // Actual Core fence and actual SQL store; no source calls or fake DB counts.
    const records = await f.access.commandBoundary(actor, f.workspace, context,
      "deployment.register", f.resource, "paper", () => {}, async db => {
        const entries = [];
        for (let index = 0; index < 100; index++) {
          const intent = { ...f.intent, business_payload: { ...f.intent.business_payload,
            idempotency_key: `TEST_ONLY:capacity-${index}` } };
          entries.push(await store.insert(db, actor.user_id, intent,
            registrationIntentHash(actor, intent), f.makeAuthorization(intent)));
        }
        return entries;
      });
    const extra = { ...f.intent, business_payload: { ...f.intent.business_payload,
      idempotency_key: "TEST_ONLY:capacity-exhausted" } };
    const current = await f.access.readContext(actor, f.workspace);
    await expect(f.access.commandBoundary(actor, f.workspace, current,
      "deployment.register", f.resource, "paper", () => {}, db => store.insert(db, actor.user_id,
        extra, registrationIntentHash(actor, extra), f.makeAuthorization(extra))))
      .rejects.toMatchObject({ code: "REGISTRATION_CAPACITY_EXCEEDED", status: 503 });
    const original = records[0];
    const replay = await f.access.commandBoundary(actor, f.workspace, current,
      "deployment.register", f.resource, "paper", () => {}, db => store.insert(db, actor.user_id,
        original.intent, original.hash, original.authorization));
    expect(replay).toEqual(original);
    expect((await ctx.pool.query("SELECT count(*)::int AS n FROM execution_instance_registration_commands WHERE workspace_id=$1", [f.workspace])).rows[0].n).toBe(100);
    expect((await ctx.pool.query("SELECT count(*)::int AS n FROM execution_instance_registration_events WHERE command_id=ANY($1::text[])",
      [records.map(record => record.id)])).rows[0].n).toBe(100);
    expect(f.counts()).toEqual({ sends: 0, lookups: 0, effects: 0 });
  });
  it("ten-second timeout never frees one of four abort-ignoring provider slots early", async () => {
    const f = await fixture(), prepare = f.trust.prepare;
    let entered!: () => void, release!: () => void, starts = 0;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const held = new Promise<void>(resolve => { release = resolve; });
    const sourceWork: ReturnType<InstanceRegistrationTrust["prepare"]>[] = [];
    f.trust.prepare = input => {
      const pending = (async () => {
        if (++starts === 4) entered();
        // Deliberately ignore AbortSignal to prove the underlying slot bound.
        await held; return prepare(input);
      })();
      sourceWork.push(pending); return pending;
    };
    const reads = Array.from({ length: 4 }, () => f.service.preview(actor, f.intent));
    void Promise.allSettled(reads);
    try {
      await started;
      expect(await f.service.preview(actor, f.intent))
        .toMatchObject({ allowed: false, reason_code: "REGISTRATION_CAPACITY_EXCEEDED" });
      const timedOut = await Promise.all(reads);
      expect(timedOut).toHaveLength(4);
      for (const item of timedOut) expect(item)
        .toMatchObject({ allowed: false, reason_code: "REGISTRATION_UNAVAILABLE" });
      expect(await f.service.preview(actor, f.intent))
        .toMatchObject({ allowed: false, reason_code: "REGISTRATION_CAPACITY_EXCEEDED" });
      expect(starts).toBe(4);
    } finally {
      f.trust.prepare = prepare; release(); await Promise.allSettled(sourceWork);
      await Promise.allSettled(reads);
    }
    expect((await f.service.preview(actor, f.intent)).allowed).toBe(true);
    expect(f.counts()).toEqual({ sends: 0, lookups: 0, effects: 0 });
  }, 30_000);
  it("source committed but response lost: restart uses same key lookup, never resend", async () => {
    const f = await fixture(), send = f.trust.send;
    f.trust.send = async input => { await send(input); throw new Error("TEST_ONLY lost response"); };
    const first = await f.submit(); expect(first).toMatchObject({ delivery: "DELIVERY_UNKNOWN", business: { state: "UNKNOWN" } });
    const restarted = new InstanceRegistrationService(ctx.pool, f.access, f.trust, true);
    expect(await restarted.submit(actor, f.intent, registrationPreviewHash(f.makeAuthorization()))).toEqual(first);
    const late = await restarted.reconcile(actor, f.workspace, first.command_id);
    expect(late).toMatchObject({ delivery: "ACKNOWLEDGED", business: { state: "APPLIED" } });
    expect(late.business.receipt?.key).not.toBe(f.intent.business_payload.idempotency_key);
    expect(f.counts()).toEqual({ sends: 1, lookups: 1, effects: 1 });
  });
  it("lost local claim COMMIT acknowledgement never sends and retains the exact unknown obligation", async () => {
    const f = await fixture(), preview = await f.service.preview(actor, f.intent);
    const boundary = f.access.commandBoundary.bind(f.access);
    let calls = 0;
    const spy = vi.spyOn(f.access, "commandBoundary").mockImplementation(async (...args) => {
      const result = await boundary(...args);
      if (++calls === 2) throw new Error("TEST_ONLY local COMMIT acknowledgement lost");
      return result;
    });
    try {
      await expect(f.service.submit(actor, f.intent, preview.preview_digest!))
        .rejects.toMatchObject({ code: "REGISTRATION_UNAVAILABLE", status: 503 });
    } finally { spy.mockRestore(); }
    const rows = (await ctx.pool.query("SELECT command_id,attempt_id,status FROM execution_instance_registration_commands WHERE workspace_id=$1", [f.workspace])).rows;
    expect(rows).toHaveLength(1); expect(rows[0].attempt_id).toBeNull();
    expect(rows[0].status).toMatchObject({ delivery: "DELIVERY_UNKNOWN", business: { state: "UNKNOWN" } });
    expect(await f.service.submit(actor, f.intent, preview.preview_digest!)).toEqual(rows[0].status);
    await f.service.reconcile(actor, f.workspace, rows[0].command_id);
    expect(f.counts()).toEqual({ sends: 0, lookups: 1, effects: 0 });
  });
  it("a failed duplicate intake cannot clear another sender's already committed attempt", async () => {
    const f = await fixture(), preview = await f.service.preview(actor, f.intent), send = f.trust.send;
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    f.trust.send = async input => { entered(); await gate; return send(input); };
    const first = f.service.submit(actor, f.intent, preview.preview_digest!);
    // Attach before any assertion can reject so a cleanup failure cannot leave
    // an unhandled promise or a synthetic provider running past this case.
    void first.catch(() => {});
    await started;
    const before = (await ctx.pool.query("SELECT attempt_id,status FROM execution_instance_registration_commands WHERE workspace_id=$1", [f.workspace])).rows[0];
    expect(before.status.delivery).toBe("SENDING"); expect(before.attempt_id).not.toBeNull();
    const boundary = f.access.commandBoundary.bind(f.access);
    const spy = vi.spyOn(f.access, "commandBoundary").mockImplementation(async (...args) => {
      await boundary(...args); throw new Error("TEST_ONLY duplicate read COMMIT acknowledgement lost");
    });
    try {
      await expect(f.service.submit(actor, f.intent, preview.preview_digest!))
        .rejects.toMatchObject({ code: "REGISTRATION_UNAVAILABLE" });
      const held = (await ctx.pool.query("SELECT attempt_id,status FROM execution_instance_registration_commands WHERE workspace_id=$1", [f.workspace])).rows[0];
      expect(held.attempt_id).toBe(before.attempt_id); expect(held.status).toEqual(before.status);
    } finally { spy.mockRestore(); release(); }
    expect((await first).business.state).toBe("APPLIED");
    expect(f.counts()).toEqual({ sends: 1, lookups: 0, effects: 1 });
  });
  it("unverified source outcome is UNKNOWN, not a false before-send failure or second attempt", async () => {
    const f = await fixture(), send = f.trust.send;
    f.trust.send = async input => ({ ...await send(input), response_sha256: "0".repeat(64) });
    await expect(f.submit()).rejects.toMatchObject({ code: "REGISTRATION_RECEIPT_UNVERIFIED", status: 503 });
    const row = (await ctx.pool.query("SELECT command_id,status FROM execution_instance_registration_commands WHERE workspace_id=$1", [f.workspace])).rows[0];
    expect(row.status.delivery).toBe("DELIVERY_UNKNOWN");
    expect((await f.service.reconcile(actor, f.workspace, row.command_id)).business.state).toBe("APPLIED");
    expect((await f.submit()).business.state).toBe("APPLIED");
    expect(f.counts()).toEqual({ sends: 1, lookups: 1, effects: 1 });
  });
  it("submit replay needs mutation only; current audit is an independent disclosure boundary", async () => {
    const f = await fixture(), first = await f.submit();
    await f.repo.saveGrant({ ...f.grants[1], revoked_at_ms: Date.now(), revision: next() });
    expect(await f.submit()).toEqual(first);
    await expect(f.service.status(actor, f.workspace, first.command_id)).rejects.toMatchObject({ status: 404 });
    expect(f.counts().sends).toBe(1);
  });
  it("status rechecks the audit native leg after raw row load without borrowing current register authority", async () => {
    const f = await fixture(), first = await f.submit(), load = InstanceRegistrationStore.prototype.candidate;
    let changed = false;
    const spy = vi.spyOn(InstanceRegistrationStore.prototype, "candidate").mockImplementation(async function (this: InstanceRegistrationStore, ...args) {
      const raw = await load.apply(this, args);
      if (args[0] === f.workspace && !changed) {
        changed = true; f.source.grants.find(grant => grant.grant_id === f.grants[1].grant_id)!.targets = [];
      }
      return raw;
    });
    try {
      await expect(f.service.status(actor, f.workspace, first.command_id)).rejects.toMatchObject({ status: 404 });
      expect(changed).toBe(true);
      // Mutation's distinct current native leg remains valid; this does not
      // disclose the protected audit result or resend the existing intent.
      expect((await f.service.preview(actor, f.intent)).allowed).toBe(true);
      expect(f.counts()).toEqual({ sends: 1, lookups: 0, effects: 1 });
    } finally { spy.mockRestore(); }
  });
  it("revoke while source prepare awaits leaves no durable attempt and zero sends", async () => {
    const f = await fixture(), prepared = f.trust.prepare;
    f.trust.prepare = async input => {
      const result = await prepared(input);
      await f.repo.saveGrant({ ...f.grants[0], revoked_at_ms: Date.now(), revision: next() }); return result;
    };
    await expect(f.service.submit(actor, f.intent, registrationPreviewHash(f.makeAuthorization())))
      // The new current graph has no register grant: this is a definite
      // denial, not a transient retry that might invite another send.
      .rejects.toMatchObject({ code: "ACCESS_DENIED", status: 403 });
    expect(f.counts().sends).toBe(0);
    expect((await ctx.pool.query("SELECT count(*)::int AS n FROM execution_instance_registration_commands WHERE workspace_id=$1", [f.workspace])).rows[0].n).toBe(0);
  });
  it("accepted registry outcome survives revoked caller; service recovery is lookup-only", async () => {
    const f = await fixture(), send = f.trust.send;
    f.trust.send = async input => { await send(input); throw new Error("TEST_ONLY response loss"); };
    const first = await f.submit();
    await f.repo.saveGrant({ ...f.grants[1], revoked_at_ms: Date.now(), revision: next() });
    await expect(f.service.reconcile(actor, f.workspace, first.command_id)).rejects.toMatchObject({ status: 404 });
    await f.service.recover(f.workspace, first.command_id);
    const stored = (await ctx.pool.query("SELECT status FROM execution_instance_registration_commands WHERE command_id=$1", [first.command_id])).rows[0].status;
    expect(stored.business.state).toBe("APPLIED"); expect(f.counts()).toEqual({ sends: 1, lookups: 1, effects: 1 });
    await expect(f.service.status(actor, f.workspace, first.command_id)).rejects.toMatchObject({ status: 404 });
  });
  it("retained profile reads the original Core status workspace and still refuses every mutation", async () => {
    const f = await fixture(), saved = await f.submit();
    const config = { ...ctx.config, EXECUTION_READ_PROFILE: "retained_review_v1" as const,
      EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: "TEST_ONLY:other-source-workspace" };
    const workspaces = new WorkspacesRepository(ctx.pool, config);
    const sourceAccess = vi.spyOn(workspaces, "canReadExecution").mockImplementation(async () => {
      throw new Error("TEST_ONLY Core registry GET must not use retained source workspace authority");
    });
    @Module({ controllers: [InstanceRegistrationController], providers: [SessionGuard,
      { provide: InstanceRegistrationService, useValue: f.service }, { provide: AuthService, useValue: auth },
      { provide: WorkspacesRepository, useValue: workspaces },
      { provide: CONTROL_API_CONFIG, useValue: config }] }) class RetainedRegistryModule {}
    const mounted = await NestFactory.create<NestFastifyApplication>(RetainedRegistryModule,
      new FastifyAdapter(), { logger: false, abortOnError: false });
    try {
      await mounted.register(cookiePlugin); mounted.useGlobalFilters(new HttpErrorFilter()); await mounted.init();
      const http = mounted.getHttpAdapter().getInstance(), base = "/api/v1/execution/instance-registrations";
      const headers = { cookie: `${SESSION_COOKIE}=${session.token}; ${CSRF_COOKIE}=${session.csrfToken}`,
        [CSRF_HEADER]: session.csrfToken, origin: ctx.config.PORTAL_PUBLIC_ORIGIN,
        "x-portal-idempotency-key": f.intent.business_payload.idempotency_key };
      const read = await http.inject({ method: "GET", url: `${base}/${saved.command_id}?workspace_id=${encodeURIComponent(f.workspace)}`, headers });
      expect(read.statusCode).toBe(200); expect(read.json()).toEqual(saved);
      expect(read.headers["cache-control"]).toBe("private, no-store"); expect(sourceAccess).not.toHaveBeenCalled();
      for (const [path, payload] of [[base + "/preview", f.intent],
        [base, { intent: f.intent, preview_digest: "sha256:" + "a".repeat(64) }],
        [`${base}/${saved.command_id}/reconcile`, { workspace_id: f.workspace }]] as const) {
        const denied = await http.inject({ method: "POST", url: path, headers, payload });
        expect(denied.statusCode).toBe(403); expect(denied.headers["cache-control"]).toBe("private, no-store");
      }
      expect(f.counts()).toEqual({ sends: 1, lookups: 0, effects: 1 });
    } finally { sourceAccess.mockRestore(); await mounted.close(); }
  });
  it("actual session controller enforces strict inputs, Origin/CSRF/key and hidden404", async () => {
    const f = await fixture();
    // Same real service/controller/session boundary as AppModule; fixture trust
    // enters only through this explicit disposable TEST_ONLY composition.
    @Module({ controllers: [InstanceRegistrationController], providers: [SessionGuard,
      { provide: InstanceRegistrationService, useValue: f.service }, { provide: AuthService, useValue: auth },
      { provide: WorkspacesRepository, useValue: new WorkspacesRepository(ctx.pool, ctx.config) },
      { provide: CONTROL_API_CONFIG, useValue: ctx.config }] }) class MountedRegistryModule {}
    const mounted = await NestFactory.create<NestFastifyApplication>(MountedRegistryModule, new FastifyAdapter(), { logger: false, abortOnError: false });
    try {
      await mounted.register(cookiePlugin); mounted.useGlobalFilters(new HttpErrorFilter()); await mounted.init();
      const http = mounted.getHttpAdapter().getInstance();
      const headers = { cookie: `${SESSION_COOKIE}=${session.token}; ${CSRF_COOKIE}=${session.csrfToken}`,
        [CSRF_HEADER]: session.csrfToken, origin: ctx.config.PORTAL_PUBLIC_ORIGIN,
        "x-portal-idempotency-key": f.intent.business_payload.idempotency_key };
      const base = "/api/v1/execution/instance-registrations";
      const unauthenticated = await http.inject({ method: "POST", url: base + "/preview", payload: f.intent });
      expect(unauthenticated.statusCode).toBe(401);
      expect(unauthenticated.headers["cache-control"]).toBe("private, no-store");
      expect((await http.inject({ method: "POST", url: base + "/preview", headers, payload: { ...f.intent, actor_id: "spoof" } })).statusCode).toBe(400);
      expect((await http.inject({ method: "POST", url: base + "/preview", headers: { ...headers, origin: "https://other.invalid" }, payload: f.intent })).statusCode).toBe(403);
      const missingCsrf = await http.inject({ method: "POST", url: base + "/preview",
        headers: { ...headers, [CSRF_HEADER]: "" }, payload: f.intent });
      expect(missingCsrf.statusCode).toBe(403);
      expect(missingCsrf.json().error.code).toBe("CSRF_MISSING");
      const invalidCsrf = await http.inject({ method: "POST", url: base + "/preview",
        headers: { ...headers, [CSRF_HEADER]: "TEST_ONLY:wrong-csrf" }, payload: f.intent });
      expect(invalidCsrf.statusCode).toBe(403);
      expect(invalidCsrf.json().error.code).toBe("CSRF_INVALID");
      expect((await http.inject({ method: "POST", url: base + "/preview", headers: { ...headers, "x-portal-idempotency-key": "TEST_ONLY:different-key" }, payload: f.intent })).statusCode).toBe(400);
      const preview = await http.inject({ method: "POST", url: base + "/preview", headers, payload: f.intent });
      expect(preview.statusCode).toBe(200); expect(preview.json().allowed).toBe(true);
      const submitted = await http.inject({ method: "POST", url: base, headers,
        payload: { intent: f.intent, preview_digest: preview.json().preview_digest } });
      expect(submitted.statusCode).toBe(200); expect(submitted.headers["cache-control"]).toBe("private, no-store");
      const id = submitted.json().command_id;
      const read = await http.inject({ method: "GET", url: `${base}/${id}?workspace_id=${encodeURIComponent(f.workspace)}`, headers });
      expect(read.statusCode).toBe(200); expect(read.json().business.state).toBe("APPLIED");
      const wrong = await http.inject({ method: "GET", url: `${base}/${id}?workspace_id=TEST_ONLY:missing`, headers });
      const unknown = await http.inject({ method: "GET", url: `${base}/ecm_00000000000000000000000000000000?workspace_id=${encodeURIComponent(f.workspace)}`, headers });
      expect(wrong.statusCode).toBe(404); expect(unknown.statusCode).toBe(404);
      expect(wrong.json().error).toEqual(unknown.json().error);
      expect((await http.inject({ method: "GET", url: `${base}/${id}?workspace_id=${encodeURIComponent(f.workspace)}&source_url=spoof`, headers })).statusCode).toBe(400);
      expect(f.counts()).toEqual({ sends: 1, lookups: 0, effects: 1 });
    } finally { await mounted.close(); }
  });
});
