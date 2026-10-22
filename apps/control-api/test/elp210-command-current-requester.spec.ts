/** TEST_ONLY pure service integration: real current-report evaluator and command
 * merger with synthetic access/store/source ports. No PostgreSQL, network,
 * issuer, command commissioning or source acceptance is claimed. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessActor, ScopedAccessGrant } from "../src/execution-v2/access.contract";
import type { AccessEvaluationContext } from "../src/execution-v2/access-policy";
import { accessDigest } from "../src/execution-v2/access-policy";
import type { ExecutionAccessService } from "../src/execution-v2/access.service";
import { commandIntent, commandStatus, type CommandStatus } from "../src/execution-v2/command.contract";
import { ExecutionCommandService, intentHash } from "../src/execution-v2/command.service";
import type { CommandRecord, CommandStore } from "../src/execution-v2/command.store";
import { commandAuthorization, type CommandTrust, type SourceCommandResult } from "../src/execution-v2/command-trust";

const fixture = JSON.parse(readFileSync(resolve(__dirname, "../../../packages/contracts/fixtures/execution-trusted-commands.synthetic.valid.json"), "utf8"));
const NOW = 1_792_100_000_000, OWNER = "TEST_ONLY:owner";
const author: AccessActor = { user_id: "TEST_ONLY:original-author", session_id: "TEST_ONLY:old-session", session_generation: 1 };
const requester: AccessActor = { user_id: "TEST_ONLY:reviewer", session_id: "TEST_ONLY:current-session", session_generation: 4 };

function setup(optional = true) {
  const intent = commandIntent.parse(fixture.intent), workspace = intent.workspace_id, history: string[] = [];
  const membership = { revision: "TEST_ONLY:membership", mapping_revision: "TEST_ONLY:mapping", receipt_id: "TEST_ONLY:membership-receipt" };
  const grant: ScopedAccessGrant = { grant_id: "TEST_ONLY:audit-grant", workspace_id: workspace, subject_user_id: requester.user_id,
    action: "audit.read", effect: "ALLOW", selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: intent.resource.kind, ids: [intent.resource.id] },
    environments: [intent.environment], valid_from_ms: NOW - 1000, valid_until_ms: NOW + 120_000, delegable_actions: [],
    issued_by: OWNER, parent_grant_id: null, revision: "TEST_ONLY:grant", policy_revision: intent.expected_policy_revision,
    revoked_at_ms: null, requires_ts_acceptance: true, field_policy_ref: null,
    ts_receipt: { receipt_id: membership.receipt_id, membership_revision: membership.revision, mapping_revision: membership.mapping_revision,
      effective_at_ms: NOW - 1000, expires_at_ms: NOW + 120_000 } };
  const state = { current: true, grants: [grant], core: "TEST_ONLY:current-core", lease: NOW + 120_000 };
  const context = (): AccessEvaluationContext => ({ principal_id: requester.user_id, workspace_id: workspace, now_ms: Date.now(),
    actor_current: state.current, actor_role: "USER", actor_lease_until_ms: state.lease, authority_fingerprint: state.core,
    allow_test_only: true, active_principals: new Set([requester.user_id, OWNER]), grants: state.grants,
    policy: { workspace_id: workspace, revision: intent.expected_policy_revision, artifact_digest: accessDigest("TEST_ONLY:policy"),
      approval_ref: "TEST_ONLY:not-real-approval", state: "REVIEWED", qualification: "TEST_ONLY", protected_owner_user_id: OWNER,
      researcher_fields: { state: "PENDING", policy_ref: null, fields: [] } },
    relationsFor: () => ({ qualified: true, revision: "TEST_ONLY:relations", own_alpha_ids: [], member_portfolio_ids: [], roots: {}, membership }) });
  const access = { readContext: vi.fn(async () => { history.push("read-context"); return context(); }),
    confirmReadContext: vi.fn(async () => { history.push("confirm-context"); return context(); }) };
  const authorization = commandAuthorization.parse({ qualification: "TEST_ONLY", reference: "TEST_ONLY:old-authorization",
    authority_ref: "TEST_ONLY:edge-authority", profile_ref: "TEST_ONLY:paper", audience: "pma.management.v1", actor_id: author.user_id,
    ts_user_id: "TEST_ONLY:original-ts-user", workload_ref: "TEST_ONLY:workload", delegation_ref: "TEST_ONLY:delegation",
    mapping_revision: membership.mapping_revision, membership_revision: membership.revision, membership_receipt_ref: membership.receipt_id,
    workspace_id: workspace, environment: intent.environment, operation: intent.business_payload.operation, resource_kind: intent.resource.kind,
    resource_id: intent.resource.id, policy_revision: intent.expected_policy_revision, intent_hash: intentHash(author, intent),
    source_intent_digest: accessDigest("TEST_ONLY:source-intent").slice(7), expected_versions: intent.business_payload.expected_versions,
    issued_at_ms: NOW - 120_000, expires_at_ms: NOW - 60_000, idempotency_retained_until_ms: NOW + 120_000,
    approval_required: false, required_approval_gate: null, approval: null, r2_basis: null,
    commit_checks: { human: true, workload: true, membership: true, scope: true, versions: true, capacity: true, approval: true } });
  let record: CommandRecord = { id: fixture.stored_ack_only.command_id, actor: author.user_id, hash: authorization.intent_hash, intent,
    authorization, attempt: "TEST_ONLY:original-attempt", status: commandStatus.parse({ ...fixture.stored_ack_only,
      delivery: "SENDING", profile_ref: authorization.profile_ref, authority: authorization.qualification }) };
  const source: SourceCommandResult = { authority_ref: authorization.authority_ref, profile_ref: authorization.profile_ref, workspace_id: workspace,
    environment: intent.environment, operation: intent.business_payload.operation, resource_kind: intent.resource.kind, resource_id: intent.resource.id,
    idempotency_key: intent.business_payload.idempotency_key, source_intent_digest: authorization.source_intent_digest, delivery: "ACKNOWLEDGED",
    business: { state: "APPLIED", receipt_ref: "TEST_ONLY:receipt", source_event_ref: "TEST_ONLY:event", revision: "9007199254740993",
      amounts: { requested: intent.business_payload.amount!, applied: intent.business_payload.amount!, pending: "0", cancelled: "0", rejected: "0" } },
    projection: "CATCHING_UP", venue: "NOT_APPLICABLE" };
  const store = { workflowCandidate: vi.fn(async (w: string, id: string) => {
    history.push("candidate"); return w === workspace && id === record.id ? structuredClone({ id: record.id, workspace,
      actor: record.actor, hash: record.hash, intent: record.intent, authorization: record.authorization, status: record.status }) : null;
  }), get: vi.fn(async () => structuredClone(record)), update: vi.fn(async (_w: string, _id: string, attempt: string | null,
    change: (old: CommandRecord) => CommandStatus) => {
    history.push("update"); expect(attempt).toBeNull();
    const status = change(structuredClone(record)); record = { ...record, status, attempt: null }; return structuredClone(record);
  }) };
  const lookupCurrentRequester = vi.fn(async (_input: Parameters<NonNullable<CommandTrust["lookupCurrentRequester"]>>[0]) => {
    history.push("human-status"); return structuredClone(source) as SourceCommandResult | null;
  });
  const trust: CommandTrust = { prepare: vi.fn(async () => null), send: vi.fn(async () => { throw new Error("TEST_ONLY:must-never-send"); }),
    lookup: vi.fn(async () => { history.push("service-status"); return structuredClone(source); }),
    ...(optional ? { lookupCurrentRequester } : {}) };
  const service = new ExecutionCommandService(null as unknown as Pool, access as unknown as ExecutionAccessService, trust, true);
  (service as unknown as { store: CommandStore }).store = store as unknown as CommandStore;
  return { service, workspace, intent, authorization, source, state, access, grant, store, trust, lookupCurrentRequester,
    history, record: () => record, reconcile: (actor = requester) => service.reconcile(actor, workspace, record.id) };
}

beforeEach(() => { vi.spyOn(Date, "now").mockReturnValue(NOW); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("ELP2-10 authenticated current-requester STATUS service seam", () => {
  it("dispatches actual current requester, preserves expired author/original, and never calls send/service lookup", async () => {
    const f = setup(), original = structuredClone(f.record());
    expect(original.authorization.expires_at_ms).toBeLessThan(NOW);
    const value = await f.reconcile();
    expect(value).toMatchObject({ delivery: "ACKNOWLEDGED", business: { state: "APPLIED" }, currency: f.intent.business_payload.currency });
    expect(f.lookupCurrentRequester).toHaveBeenCalledOnce();
    expect(f.lookupCurrentRequester.mock.calls[0][0]).toMatchObject({ actor: requester, authorization: original.authorization, intent: original.intent });
    expect(f.history.indexOf("confirm-context")).toBeLessThan(f.history.indexOf("human-status"));
    expect(f.history.slice(f.history.indexOf("human-status") + 1, f.history.indexOf("update"))).toContain("confirm-context");
    expect(f.history.at(-1)).toBe("confirm-context");
    expect(f.record().actor).toBe(author.user_id); expect(f.record().hash).toBe(original.hash);
    expect(f.record().authorization).toEqual(original.authorization); expect(f.record().intent).toEqual(original.intent);
    expect(f.trust.prepare).not.toHaveBeenCalled(); expect(f.trust.send).not.toHaveBeenCalled(); expect(f.trust.lookup).not.toHaveBeenCalled();
    expect(value).not.toHaveProperty("authorization"); expect(value).not.toHaveProperty("actor");
  });
  it("preserves the existing service lookup path when the optional seam is absent", async () => {
    const f = setup(false); expect((await f.reconcile()).business.state).toBe("APPLIED");
    expect(f.trust.lookup).toHaveBeenCalledOnce(); expect(f.lookupCurrentRequester).not.toHaveBeenCalled(); expect(f.trust.send).not.toHaveBeenCalled();
  });
  it("unattended recover remains service-only even when current-requester STATUS exists", async () => {
    const f = setup(); await f.service.recover(f.workspace, f.record().id);
    expect(f.trust.lookup).toHaveBeenCalledOnce(); expect(f.lookupCurrentRequester).not.toHaveBeenCalled(); expect(f.access.readContext).not.toHaveBeenCalled();
  });
  it.each(["missing-audit", "revoked-audit", "session", "lease", "wrong-requester", "wrong-workspace"])("refuses %s before source I/O", async fault => {
    const f = setup();
    if (fault === "missing-audit") f.state.grants = [];
    if (fault === "revoked-audit") f.grant.revoked_at_ms = NOW;
    if (fault === "session") f.state.current = false;
    if (fault === "lease") f.state.lease = NOW;
    const operation = fault === "wrong-workspace" ? f.service.reconcile(requester, "TEST_ONLY:other-workspace", f.record().id)
      : f.reconcile(fault === "wrong-requester" ? author : requester);
    await expect(operation).rejects.toThrow(); expect(f.lookupCurrentRequester).not.toHaveBeenCalled(); expect(f.store.update).not.toHaveBeenCalled();
    expect(f.trust.lookup).not.toHaveBeenCalled(); expect(f.trust.send).not.toHaveBeenCalled();
  });
  it.each(["revoke", "session", "lease", "scope"])("fences %s during source STATUS before update/disclosure", async fault => {
    const f = setup(); f.lookupCurrentRequester.mockImplementationOnce(async () => {
      if (fault === "revoke") f.grant.revoked_at_ms = NOW;
      if (fault === "session") f.state.current = false;
      if (fault === "lease") f.state.lease = NOW;
      if (fault === "scope") f.grant.selector = { kind: "EXPLICIT_RESOURCE_SET", resource_kind: f.intent.resource.kind, ids: ["TEST_ONLY:other"] };
      return f.source;
    });
    await expect(f.reconcile()).rejects.toThrow(); expect(f.store.update).not.toHaveBeenCalled(); expect(f.record().status.delivery).toBe("SENDING");
    expect(f.trust.lookup).not.toHaveBeenCalled(); expect(f.trust.send).not.toHaveBeenCalled();
  });
  it("fences final revocation after persisting a valid source receipt without deleting it", async () => {
    const f = setup(), original = f.store.update.getMockImplementation()!;
    f.store.update.mockImplementationOnce(async (...args) => { const result = await original(...args); f.grant.revoked_at_ms = NOW; return result; });
    await expect(f.reconcile()).rejects.toMatchObject({ code: "ACCESS_RESOURCE_NOT_FOUND", status: 404 });
    expect(f.record().status.business.state).toBe("APPLIED"); expect(f.trust.send).not.toHaveBeenCalled();
  });
  it.each(["intent-hash", "authorization"])("refuses replaced original %s after source I/O", async fault => {
    const f = setup(); f.lookupCurrentRequester.mockImplementationOnce(async () => {
      if (fault === "intent-hash") f.record().hash = accessDigest("TEST_ONLY:changed-hash");
      else f.record().authorization.reference = "TEST_ONLY:substituted-authorization";
      return f.source;
    });
    await expect(f.reconcile()).rejects.toMatchObject({ code: "COMMAND_STATUS_UNVERIFIED" }); expect(f.store.update).not.toHaveBeenCalled();
  });
  it("rechecks the original under update's lock instead of merging into a replaced row", async () => {
    const f = setup(), original = f.store.update.getMockImplementation()!;
    f.store.update.mockImplementation(async (...args) => { f.record().authorization.reference = "TEST_ONLY:changed-at-lock"; return original(...args); });
    await expect(f.reconcile()).rejects.toMatchObject({ code: "COMMAND_STATUS_UNVERIFIED" });
    expect(f.record().status.delivery).toBe("SENDING"); expect(f.record().status.business.state).toBe("UNKNOWN");
  });
  it.each(["PREPARED", "FAILED_BEFORE_SEND"] as const)("does not query or resend unentered %s", async delivery => {
    const f = setup(); f.record().status.delivery = delivery;
    expect((await f.reconcile()).delivery).toBe(delivery); expect(f.lookupCurrentRequester).not.toHaveBeenCalled(); expect(f.store.update).not.toHaveBeenCalled();
    expect(f.trust.lookup).not.toHaveBeenCalled(); expect(f.trust.send).not.toHaveBeenCalled();
  });
  it("expired same-original retention stays UNKNOWN without source query or resend", async () => {
    const f = setup(); f.record().authorization.idempotency_retained_until_ms = NOW - 1;
    expect(await f.reconcile()).toMatchObject({ delivery: "DELIVERY_UNKNOWN", business: { state: "UNKNOWN" } });
    expect(f.lookupCurrentRequester).not.toHaveBeenCalled(); expect(f.trust.lookup).not.toHaveBeenCalled(); expect(f.trust.send).not.toHaveBeenCalled();
  });
  it.each(["null", "throw"])("ambiguous requester %s never falls back to service authority or sends", async fault => {
    const f = setup(); f.lookupCurrentRequester.mockImplementationOnce(async () => {
      if (fault === "throw") throw new Error("TEST_ONLY:private-provider-copy-must-not-escape"); return null;
    });
    const value = await f.reconcile(); expect(value).toMatchObject({ delivery: "DELIVERY_UNKNOWN", business: { state: "UNKNOWN" } });
    expect(JSON.stringify(value)).not.toContain("private-provider"); expect(f.trust.lookup).not.toHaveBeenCalled(); expect(f.trust.send).not.toHaveBeenCalled();
  });
  it("rejects mismatched source result with the existing safe merge error, no retry", async () => {
    const f = setup(); f.lookupCurrentRequester.mockResolvedValueOnce({ ...f.source, idempotency_key: "TEST_ONLY:wrong-original" });
    await expect(f.reconcile()).rejects.toMatchObject({ code: "COMMAND_STATUS_UNVERIFIED", status: 502 });
    expect(f.record().status).toMatchObject({ delivery: "DELIVERY_UNKNOWN", business: { state: "UNKNOWN" } });
    expect(f.lookupCurrentRequester).toHaveBeenCalledOnce(); expect(f.trust.send).not.toHaveBeenCalled();
  });
  it("a reconstructed service resolves lost ACK through same original STATUS, never another send", async () => {
    const f = setup(); const restarted = new ExecutionCommandService(null as unknown as Pool, f.access as unknown as ExecutionAccessService, f.trust, true);
    (restarted as unknown as { store: CommandStore }).store = f.store as unknown as CommandStore;
    expect(await restarted.reconcile(requester, f.workspace, f.record().id)).toMatchObject({ delivery: "ACKNOWLEDGED", business: { state: "APPLIED" } });
    expect(f.lookupCurrentRequester.mock.calls[0][0].intent.business_payload.idempotency_key).toBe(f.intent.business_payload.idempotency_key);
    expect(f.trust.prepare).not.toHaveBeenCalled(); expect(f.trust.send).not.toHaveBeenCalled(); expect(f.trust.lookup).not.toHaveBeenCalled();
  });
  it("bounds requester I/O, aborts and leaves ambiguous STATUS UNKNOWN without fallback", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const f = setup(); let release: (() => void) | undefined, observed: AbortSignal | undefined;
    f.lookupCurrentRequester.mockImplementationOnce(input => new Promise(resolve => { observed = input.signal; release = () => resolve(f.source); }));
    const pending = f.reconcile(); await vi.advanceTimersByTimeAsync(10_001);
    expect(await pending).toMatchObject({ delivery: "DELIVERY_UNKNOWN", business: { state: "UNKNOWN" } });
    expect(observed?.aborted).toBe(true); expect(f.trust.lookup).not.toHaveBeenCalled(); expect(f.trust.send).not.toHaveBeenCalled(); release!();
    await Promise.resolve();
  });
});
