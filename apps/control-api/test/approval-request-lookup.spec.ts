/** FE-069 read-by-request_key. Fake repository/pool: proves the decision table, that the
 * lookup is keyed by the CALLER, the authorization order (session/membership fence before
 * any request read, and again after) and that nothing is written. PG is NOT exercised. */
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { GovernanceError, GovernanceService } from "../src/governance/governance.service";
import { approvalRequestLookup, approvalRequestLookupOutcome, approvalRequestLookupQuery } from "../src/governance/approval-request-lookup";
import type { ApprovalRecord } from "../src/governance/governance.repository";

const WORKSPACE = "ws_TEST_ONLY";
const user = { userId: "usr_a", username: "a", role: "USER", sessionVersion: 3 } as never;
const session = { sessionId: "ses_a", userId: "usr_a", sessionVersion: 3 } as never;
const payload = { alpha_id: "alpha_1", evidence_run_id: "run_1", methodology_claim_id: "claim_1", summary: "A reviewed summary" };
// Mirrors GovernanceService's private canonical digest of the create payload.
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` :
  value && typeof value === "object" ? `{${Object.keys(value as object).sort().map(k => `${JSON.stringify(k)}:${canonical((value as any)[k])}`).join(",")}}` : JSON.stringify(value);
const hashOf = (p: typeof payload) => `sha256:${createHash("sha256").update(canonical({ gate: "R1", ...p }), "utf8").digest("hex")}`;
const record: ApprovalRecord = { approvalId: "apr_1", workspaceId: WORKSPACE, gate: "R1", subjectType: "ALPHA_VERSION", subjectId: "alpha_1",
  subjectLabel: "alpha_1", releaseCandidate: null, environment: "RESEARCH", targetLabel: "R1", requesterUserId: "usr_a", requesterUsername: "a",
  artifactCreatorUserId: "usr_a", artifactCreatorUsername: "a", status: "PENDING", policyVersion: "approval.v3", quorumRequired: 1, quorumMet: 0,
  decisionActorIds: [], approvalVersion: 1, evidenceSetHash: `sha256:${"a".repeat(64)}`, evidenceComplete: true, blockerCount: 0, blockerSummary: null,
  slaDueAt: new Date("2099-01-01T00:00:00Z"), expiresAt: new Date("2099-01-03T00:00:00Z"), createdAt: new Date("2098-12-31T00:00:00Z"),
  updatedAt: new Date("2098-12-31T00:00:00Z"), decidedAt: null, decidedByUserId: null };

function service(options: { member?: boolean; sessionRows?: unknown[]; stored?: { approval: ApprovalRecord; payloadHash: string } | null } = {}) {
  const calls: string[] = [];
  const pool = { query: vi.fn(async () => { calls.push("fence"); return { rows: options.sessionRows ?? [{ member: true }] }; }) };
  const repository = { pool,
    isWorkspaceMember: vi.fn(async () => { calls.push("member"); return options.member ?? true; }),
    findCreatedApproval: vi.fn(async (...args: unknown[]) => { calls.push("find"); void args; return options.stored ?? null; }),
    createR1Approval: vi.fn(), approvalEvidenceRun: vi.fn() };
  const instance = Object.create(GovernanceService.prototype) as GovernanceService;
  (instance as any).repository = repository;
  return { instance, repository, calls };
}
const ask = (instance: GovernanceService, extra: Record<string, unknown> = {}) =>
  instance.lookupApprovalRequest(user, session, { workspace_id: WORKSPACE, request_key: "key-0001", ...extra } as never);

describe("FE-069 approval request lookup by request_key", () => {
  it("NONE: a replay would create; nothing is compared and nothing written", async () => {
    const { instance, repository } = service();
    const result = await ask(instance);
    expect(result).toEqual({ schema_version: "governance.approval-request-lookup.v1", workspace_id: WORKSPACE, request_key: "key-0001",
      state: "NONE", payload_check: "NOT_COMPARED", result: null });
    expect(repository.createR1Approval).not.toHaveBeenCalled(); expect(repository.approvalEvidenceRun).not.toHaveBeenCalled();
  });
  it("is keyed by the CALLER: another actor's request under the same key is indistinguishable from none", async () => {
    const { instance, repository } = service();
    await ask(instance);
    expect(repository.findCreatedApproval).toHaveBeenCalledWith(WORKSPACE, "usr_a", "key-0001");
  });
  it("FOUND without payload returns exactly the replay body and says the payload was not compared", async () => {
    const { instance } = service({ stored: { approval: record, payloadHash: hashOf(payload) } });
    const result = await ask(instance);
    expect(result).toMatchObject({ state: "FOUND", payload_check: "NOT_COMPARED" });
    expect(result.result).toMatchObject({ schema_version: "governance.approval-create.v1", replayed: true,
      approval: { approval_id: "apr_1", status: "PENDING", requester: { user_id: "usr_a", username: "a" } } });
    // parity: the body is exactly the one createApproval's replay branch builds
    expect(result.result!.approval).toEqual((instance as any).publicApproval(record));
  });
  it("FOUND + MATCH when the supplied payload hashes to the stored one; KEY_PAYLOAD_CONFLICT (no approval body) when it differs", async () => {
    const stored = { approval: record, payloadHash: hashOf(payload) };
    expect(await ask(service({ stored }).instance, payload)).toMatchObject({ state: "FOUND", payload_check: "MATCH" });
    const conflict = await ask(service({ stored }).instance, { ...payload, summary: "A different summary" });
    expect(conflict).toMatchObject({ state: "KEY_PAYLOAD_CONFLICT", payload_check: "MISMATCH", result: null });
    // NONE with a payload: nothing to compare against
    expect(await ask(service().instance, payload)).toMatchObject({ state: "NONE", payload_check: "NOT_COMPARED" });
  });
  it("authorizes before reading any request and again after the last read", async () => {
    const { instance, calls } = service({ stored: { approval: record, payloadHash: hashOf(payload) } });
    await ask(instance);
    expect(calls).toEqual(["fence", "member", "find", "fence"]);
  });
  it("refuses a dead session (401) and a non-member (403) before reading the request, and never answers 'none' for them", async () => {
    const dead = service({ sessionRows: [] });
    await expect(ask(dead.instance)).rejects.toMatchObject({ status: 401 });
    expect(dead.repository.findCreatedApproval).not.toHaveBeenCalled();
    const outsider = service({ sessionRows: [{ member: false }] });
    await expect(ask(outsider.instance)).rejects.toMatchObject({ status: 403 });
    expect(outsider.repository.findCreatedApproval).not.toHaveBeenCalled();
    const unmapped = service({ member: false });
    await expect(ask(unmapped.instance)).rejects.toBeInstanceOf(GovernanceError);
    expect(unmapped.repository.findCreatedApproval).not.toHaveBeenCalled();
  });
  it("a session revoked during the read refuses instead of publishing the stale answer", async () => {
    const { instance, repository } = service({ stored: { approval: record, payloadHash: hashOf(payload) } });
    let n = 0;
    (repository.pool.query as any).mockImplementation(async () => ({ rows: ++n === 1 ? [{ member: true }] : [] }));
    await expect(ask(instance)).rejects.toMatchObject({ status: 401 });
  });
  it("the decision table is closed and the schema refuses every inconsistent combination", () => {
    const base = { schema_version: "governance.approval-request-lookup.v1", workspace_id: WORKSPACE, request_key: "key-0001" };
    const found = { state: "FOUND", payload_check: "MATCH", result: { schema_version: "governance.approval-create.v1", replayed: true, approval: {} } };
    expect(approvalRequestLookup.safeParse({ ...base, ...found }).success).toBe(true);
    for (const bad of [{ ...found, payload_check: "MISMATCH" }, { ...found, result: null }, { ...found, result: { ...found.result, replayed: false } },
      { state: "NONE", payload_check: "MATCH", result: null }, { state: "NONE", payload_check: "NOT_COMPARED", result: found.result },
      { state: "KEY_PAYLOAD_CONFLICT", payload_check: "NOT_COMPARED", result: null }, { state: "KEY_PAYLOAD_CONFLICT", payload_check: "MISMATCH", result: found.result }])
      expect(approvalRequestLookup.safeParse({ ...base, ...bad }).success).toBe(false);
    expect(() => approvalRequestLookupOutcome({ workspace_id: WORKSPACE, request_key: "k", stored: null, payloadHash: null })).not.toThrow();
  });
  it("the query is exact: a well-formed key, workspace optional, payload all-or-none, nothing else", () => {
    expect(approvalRequestLookupQuery.safeParse({ request_key: "key-0001" }).success).toBe(true);
    expect(approvalRequestLookupQuery.safeParse({ request_key: "key-0001", workspace_id: WORKSPACE, ...payload }).success).toBe(true);
    for (const bad of [{}, { request_key: "" }, { request_key: "-bad" }, { request_key: "a".repeat(193) }, { request_key: "a b" }, { request_key: "k\n" },
      { request_key: "key-0001", alpha_id: "alpha_1" }, { request_key: "key-0001", alpha_id: "alpha_1", evidence_run_id: "r", methodology_claim_id: "c" },
      { request_key: "key-0001", ...payload, summary: "short" }, { request_key: "key-0001", user_id: "usr_b" }, { request_key: "key-0001", workspace_id: "ab" }])
      expect(approvalRequestLookupQuery.safeParse(bad).success).toBe(false);
  });
});
