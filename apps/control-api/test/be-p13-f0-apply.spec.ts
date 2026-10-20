/**
 * BE-P13 tasks 1 and 2 · F0 apply is DENIED-only, and its denial is replayable, conflict-detectable
 * and recoverable by key. Pure: an in-memory repository with the same observable contract as the
 * PostgreSQL one (first use of a key wins and is never updated; lookups carry the actor). The SQL in
 * migration 146 and the PG repository are NOT exercised here (no PostgreSQL in this lane): that is
 * NOT_RUN and stated as such in the ledger.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PortalUser } from "../src/domain";
import { GovernanceError } from "../src/governance/governance.service";
import { ExecutionOperationsService } from "../src/operations/operations.service";
import { ExecutionCommandApplyRequestSchema } from "../src/operations/contracts";
import { f0ApplyAttemptLookup, f0ApplyDeniedProblem, f0ApplyKeyConflictProblem } from "../src/operations/f0-apply.contract";
import type { ExecutionF0ApplyAttemptRecord, ExecutionCommandPlanRecord } from "../src/operations/operations.repository";

const contracts = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
const schema = JSON.parse(readFileSync(resolve(contracts, "schemas/execution-operations.v1.schema.json"), "utf8"));
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
ajv.addSchema(schema);
const def = (name: string) => ajv.getSchema(`${schema.$id}#/$defs/${name}`)!;
const fixture = (name: string) => JSON.parse(readFileSync(resolve(contracts, "fixtures", name), "utf8"));

const { order, denyNext } = vi.hoisted(() => ({ order: [] as string[], denyNext: { value: false } }));
vi.mock("../src/execution-v2/current-audit-read", () => ({
  requireCurrentTsAuditRead: vi.fn(() => { order.push("authorize"); if (denyNext.value) throw new Error("ACCESS_RESOURCE_NOT_FOUND"); return {}; }),
}));

const WS = "ws_be_p13";
const alice = { userId: "usr_alice", role: "ADMIN" } as PortalUser;
const bob = { userId: "usr_bob", role: "ADMIN" } as PortalUser;
const plan = (id: string, owner: string) => ({ operationId: id, workspaceId: WS, actorUserId: owner } as ExecutionCommandPlanRecord);

class MemoryRepository {
  plans = new Map<string, ExecutionCommandPlanRecord>();
  attempts = new Map<string, ExecutionF0ApplyAttemptRecord>();
  audit: Array<{ key: string; operationId: string; created: boolean }> = [];
  private k = (ws: string, actor: string, key: string) => `${ws}|${actor}|${key}`;
  async find(ws: string, actor: string, id: string) {
    const found = this.plans.get(id);
    return found && found.workspaceId === ws && found.actorUserId === actor ? found : null;
  }
  async findApplyAttempt(ws: string, actor: string, key: string) { return this.attempts.get(this.k(ws, actor, key)) ?? null; }
  async recordApplyAttempt(input: { workspaceId: string; actorUserId: string; requestKey: string; operationId: string; intentHash: string }) {
    const id = this.k(input.workspaceId, input.actorUserId, input.requestKey);
    const existing = this.attempts.get(id);
    if (existing) return { record: existing, created: false };
    const record = { workspaceId: input.workspaceId, actorUserId: input.actorUserId, requestKey: input.requestKey,
      operationId: input.operationId, intentHash: input.intentHash, createdAt: new Date("2026-08-22T12:00:05.000Z") };
    this.attempts.set(id, record);
    this.audit.push({ key: input.requestKey, operationId: input.operationId, created: true });
    return { record, created: true };
  }
}

let repository: MemoryRepository;
let audits: Array<Record<string, unknown>>;
let service: ExecutionOperationsService;
beforeEach(() => {
  repository = new MemoryRepository();
  repository.plans.set("op_a", plan("op_a", alice.userId));
  repository.plans.set("op_b", plan("op_b", alice.userId));
  repository.plans.set("op_bob", plan("op_bob", bob.userId));
  audits = [];
  const audit = { record: async (event: Record<string, unknown>) => { audits.push(event); } };
  service = new ExecutionOperationsService(repository as never, audit as never, null as never, {} as never);
});

async function refusal(promise: Promise<unknown>): Promise<GovernanceError> {
  try { await promise; } catch (error) { expect(error).toBeInstanceOf(GovernanceError); return error as GovernanceError; }
  throw new Error("F0 apply returned instead of refusing");
}
// The shared error filter sends exactly this for a GovernanceError.
const body = (error: GovernanceError) => ({ error: { code: error.code, message: error.message },
  request_id: "req_test", ...(error.details ? { details: error.details } : {}) });

describe("BE-P13 F0 apply: DENIED-only, with a replayable typed answer", () => {
  it("never succeeds: every reachable input refuses, and the first denial matches the published body", async () => {
    const first = await refusal(service.apply(alice, WS, "op_a", "key-0001", "req_1"));
    expect(first.status).toBe(409);
    expect(first.code).toBe("COMMAND_RELAY_DISABLED");
    expect(first.details).toMatchObject({ decision: "DENIED", retry_allowed: false, source_request_sent: false,
      request_key: "key-0001", replayed: false, operation_id: "op_a" });
    expect(def("F0ApplyDeniedProblem")(body(first)), JSON.stringify(def("F0ApplyDeniedProblem").errors)).toBe(true);
    expect(f0ApplyDeniedProblem.safeParse(body(first)).success).toBe(true);
    expect(repository.attempts.size).toBe(1);
    // Not found is a refusal too (404), and records nothing.
    const missing = await refusal(service.apply(alice, WS, "op_unknown", "key-0002", "req_2"));
    expect(missing.status).toBe(404);
    expect(repository.attempts.size).toBe(1);
  });

  it("same key, same operation: the same typed answer, replayed true, still one stored attempt", async () => {
    const first = await refusal(service.apply(alice, WS, "op_a", "key-0001", "req_1"));
    const again = await refusal(service.apply(alice, WS, "op_a", "key-0001", "req_2"));
    expect(again.code).toBe(first.code);
    expect(again.status).toBe(first.status);
    expect(again.details).toEqual({ ...(first.details as object), replayed: true });
    expect(def("F0ApplyDeniedProblem")(body(again)), JSON.stringify(def("F0ApplyDeniedProblem").errors)).toBe(true);
    expect(repository.attempts.size).toBe(1);
    expect(audits).toHaveLength(1); // the first audit is written by the repository transaction; the replay adds one
    expect(audits[0]).toMatchObject({ result: "DENIED", reasonCode: "COMMAND_RELAY_DISABLED", idempotencyKey: "key-0001",
      metadata: { replayed: true, source_request_sent: false } });
  });

  it("same key, a different operation: typed REQUEST_KEY_PAYLOAD_CONFLICT, nothing recorded or sent", async () => {
    await refusal(service.apply(alice, WS, "op_a", "key-0001", "req_1"));
    const conflict = await refusal(service.apply(alice, WS, "op_b", "key-0001", "req_2"));
    expect(conflict.status).toBe(409);
    expect(conflict.code).toBe("REQUEST_KEY_PAYLOAD_CONFLICT");
    expect(conflict.details).toEqual({ request_key: "key-0001", source_request_sent: false });
    expect(def("F0ApplyKeyConflictProblem")(body(conflict)), JSON.stringify(def("F0ApplyKeyConflictProblem").errors)).toBe(true);
    expect(f0ApplyKeyConflictProblem.safeParse(body(conflict)).success).toBe(true);
    expect(JSON.stringify(body(conflict))).not.toContain("op_a"); // the other operation is never named
    expect(repository.attempts.size).toBe(1);
    expect(audits.at(-1)).toMatchObject({ result: "CONFLICT", reasonCode: "REQUEST_KEY_PAYLOAD_CONFLICT" });
  });

  it("is keyed by the actor: another user's plan is a 404 and the same key text is independent", async () => {
    await refusal(service.apply(alice, WS, "op_a", "key-0001", "req_1"));
    expect((await refusal(service.apply(bob, WS, "op_a", "key-0001", "req_2"))).status).toBe(404);
    const bobs = await refusal(service.apply(bob, WS, "op_bob", "key-0001", "req_3"));
    expect(bobs.code).toBe("COMMAND_RELAY_DISABLED");
    expect((bobs.details as { replayed: boolean }).replayed).toBe(false);
    expect(repository.attempts.size).toBe(2);
  });

  it("requires the key in the request body (grammar shared with plan/acknowledge/resolve)", () => {
    const ok = { schema_version: "execution.command-apply-request.v1", workspace_id: WS, request_key: "key-0001", command_type: "EXECUTION_COMMAND" };
    expect(ExecutionCommandApplyRequestSchema.safeParse(ok).success).toBe(true);
    expect(def("ExecutionCommandApplyRequest")(ok)).toBe(true);
    const { request_key: _key, ...withoutKey } = ok;
    for (const bad of [withoutKey, { ...ok, request_key: "" }, { ...ok, request_key: "-leading" }, { ...ok, request_key: "a b" },
      { ...ok, request_key: "k".repeat(193) }, { ...ok, apply_token: "t" }, { ...ok, command_type: "OTHER" }]) {
      expect(ExecutionCommandApplyRequestSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
      expect(def("ExecutionCommandApplyRequest")(bad), JSON.stringify(bad)).toBe(false);
    }
    expect(ExecutionCommandApplyRequestSchema.safeParse({ ...ok, request_key: "k".repeat(192) }).success).toBe(true);
  });
});

describe("BE-P13 F0 apply: the published contract has no success", () => {
  const api = JSON.parse(readFileSync(resolve(contracts, "openapi/execution-operations.openapi.json"), "utf8"));
  it("the operation has only 4xx responses and names no success state", () => {
    const operation = api.paths["/api/v1/execution/operations/{operation_id}/apply"].post;
    expect(Object.keys(operation.responses).sort()).toEqual(["400", "401", "403", "404", "409"]);
    expect(Object.keys(operation.responses).some((status) => status.startsWith("2"))).toBe(false);
    const text = JSON.stringify(operation.responses);
    for (const token of ["ACCEPTED", "SUCCEEDED", "APPLIED", "apply_token"]) expect(text, token).not.toContain(token);
  });

  it("no fixture can pass for an F0 apply success", () => {
    const names = readdirSync(resolve(contracts, "fixtures")).filter((name) => /apply/i.test(name) && /command/i.test(name)).sort();
    expect(names).toEqual([
      "execution-command-apply-attempt.conflict.valid.json", "execution-command-apply-attempt.found.valid.json",
      "execution-command-apply-attempt.none.valid.json", "execution-command-apply-denied.replayed.valid.json",
      "execution-command-apply-denied.valid.json", "execution-command-apply-key-conflict.valid.json"]);
    for (const name of names) {
      const text = readFileSync(resolve(contracts, "fixtures", name), "utf8");
      for (const token of ["ACCEPTED", "SUCCEEDED", "\"APPLIED\"", "apply_token", "\"status\""]) expect(text, `${name} ${token}`).not.toContain(token);
    }
  });

  it("the denial schema cannot be widened into a retryable or sent state", () => {
    const denied = fixture("execution-command-apply-denied.valid.json");
    expect(def("F0ApplyDeniedProblem")(denied)).toBe(true);
    for (const patch of [{ retry_allowed: true }, { source_request_sent: true }, { decision: "ACCEPTED" }, { reason: "OTHER" }]) {
      const mutated = { ...denied, details: { ...denied.details, ...patch } };
      expect(def("F0ApplyDeniedProblem")(mutated), JSON.stringify(patch)).toBe(false);
      expect(f0ApplyDeniedProblem.safeParse(mutated).success, JSON.stringify(patch)).toBe(false);
    }
  });
});

describe("BE-P13 F0 apply: fixtures NONE / FOUND / CONFLICT / REPLAYED agree with schema and runtime parser", () => {
  const cases: Array<[string, string, (value: unknown) => { success: boolean }]> = [
    ["execution-command-apply-denied.valid.json", "F0ApplyDeniedProblem", (v) => f0ApplyDeniedProblem.safeParse(v)],
    ["execution-command-apply-denied.replayed.valid.json", "F0ApplyDeniedProblem", (v) => f0ApplyDeniedProblem.safeParse(v)],
    ["execution-command-apply-key-conflict.valid.json", "F0ApplyKeyConflictProblem", (v) => f0ApplyKeyConflictProblem.safeParse(v)],
    ["execution-command-apply-attempt.none.valid.json", "F0ApplyAttemptLookup", (v) => f0ApplyAttemptLookup.safeParse(v)],
    ["execution-command-apply-attempt.found.valid.json", "F0ApplyAttemptLookup", (v) => f0ApplyAttemptLookup.safeParse(v)],
    ["execution-command-apply-attempt.conflict.valid.json", "F0ApplyAttemptLookup", (v) => f0ApplyAttemptLookup.safeParse(v)],
  ];
  it.each(cases)("%s", (name, definition, parse) => {
    const value = fixture(name);
    expect(def(definition)(value), JSON.stringify(def(definition).errors)).toBe(true);
    expect(parse(value).success).toBe(true);
  });

  it("REPLAYED is the first denial with replayed true and nothing else changed", () => {
    const first = fixture("execution-command-apply-denied.valid.json");
    const replay = fixture("execution-command-apply-denied.replayed.valid.json");
    expect(first.details.replayed).toBe(false);
    expect(replay.details.replayed).toBe(true);
    expect({ ...replay.details, replayed: false }).toEqual(first.details);
    expect(replay.error).toEqual(first.error);
  });

  it("FOUND carries exactly the published RelayDenied for the same operation", () => {
    const found = fixture("execution-command-apply-attempt.found.valid.json");
    expect(found.relay_decision).toEqual(fixture("execution-command-relay-denied.valid.json"));
    expect(found.relay_decision.operation_id).toBe(found.operation_id);
  });

  it("NONE and CONFLICT disclose nothing about any stored attempt", () => {
    for (const name of ["execution-command-apply-attempt.none.valid.json", "execution-command-apply-attempt.conflict.valid.json"]) {
      const value = fixture(name);
      expect(value.relay_decision).toBeNull();
      expect(value.first_recorded_at).toBeNull();
    }
    // A FOUND without a timestamp, or a NONE carrying a decision, is not a lookup answer.
    const found = fixture("execution-command-apply-attempt.found.valid.json");
    expect(def("F0ApplyAttemptLookup")({ ...found, first_recorded_at: null })).toBe(false);
    expect(f0ApplyAttemptLookup.safeParse({ ...found, first_recorded_at: null }).success).toBe(false);
    const none = fixture("execution-command-apply-attempt.none.valid.json");
    expect(def("F0ApplyAttemptLookup")({ ...none, relay_decision: found.relay_decision })).toBe(false);
    expect(f0ApplyAttemptLookup.safeParse({ ...none, relay_decision: found.relay_decision }).success).toBe(false);
  });

  it("publishes the lookup as a read-only, strictly keyed GET", () => {
    const api = JSON.parse(readFileSync(resolve(contracts, "openapi/execution-operations.openapi.json"), "utf8"));
    const path = api.paths["/api/v1/execution/operations/f0/{operation_id}/apply-attempts/{request_key}"];
    expect(Object.keys(path)).toEqual(["get"]);
    expect(path.get["x-strict-query-keys"]).toEqual(["workspace_id"]);
    expect(path.get.parameters.map((parameter: { name: string }) => parameter.name)).toEqual(["operation_id", "request_key", "workspace_id"]);
    expect(path.get.responses["200"].headers["Cache-Control"].schema.const).toBe("private, no-store");
  });
});

describe("BE-P13 F0 apply lookup: authorize before data, keyed by the actor", () => {

  async function lookupService() {
    const { ExecutionF0ReadService } = await import("../src/operations/f0-read.service");
    const candidate = { operation_id: "op_a", workspace_id: WS, actor_user_id: alice.userId, target_type: "PORTFOLIO",
      target_id: "pf_1", environment: "PAPER", command_key: "account/sync", status: "BLOCKED", blocker_codes: ["COMMAND_RELAY_DISABLED"],
      warning_codes: [], created_at: new Date(), updated_at: new Date() };
    const repo = {
      findF0ReadCandidate: async (ws: string, actor: string, id: string) =>
        ws === WS && actor === alice.userId && id === "op_a" ? candidate : null,
      findApplyAttempt: async (ws: string, actor: string, key: string) => { order.push("read"); return repository.findApplyAttempt(ws, actor, key); },
    };
    const access = { readContext: async () => { order.push("context"); return { now_ms: Date.now() }; },
      confirmReadContext: async () => { order.push("confirm"); return { now_ms: Date.now() }; } };
    return new ExecutionF0ReadService(repo as never, access as never);
  }
  const actor = (user: PortalUser) => ({ user_id: user.userId, session_id: "s", session_generation: 1 });

  beforeEach(() => { order.length = 0; denyNext.value = false; });

  it("authorizes the named operation's target BEFORE reading the attempt, and re-fences after", async () => {
    const reader = await lookupService();
    const none = await reader.lookupApplyAttempt(actor(alice), WS, "op_a", "key-0001");
    expect(none).toMatchObject({ state: "NONE", relay_decision: null, first_recorded_at: null });
    expect(order).toEqual(["context", "authorize", "read", "confirm", "authorize"]);
  });

  it("a refused reader never reaches the attempt row (no NONE oracle)", async () => {
    const reader = await lookupService();
    denyNext.value = true;
    await expect(reader.lookupApplyAttempt(actor(alice), WS, "op_a", "key-0001")).rejects.toThrow("ACCESS_RESOURCE_NOT_FOUND");
    expect(order).toEqual(["context", "authorize"]);
  });

  it("FOUND after a denial, CONFLICT for a key bound elsewhere, NONE for another actor's key", async () => {
    const reader = await lookupService();
    await refusal(service.apply(alice, WS, "op_a", "key-0001", "req_1"));
    expect(await reader.lookupApplyAttempt(actor(alice), WS, "op_a", "key-0001")).toMatchObject({
      state: "FOUND", first_recorded_at: "2026-08-22T12:00:05.000Z",
      relay_decision: { decision: "DENIED", reason: "COMMAND_RELAY_DISABLED", retry_allowed: false, source_request_sent: false, operation_id: "op_a" } });
    await refusal(service.apply(alice, WS, "op_b", "key-0003", "req_2"));
    expect(await reader.lookupApplyAttempt(actor(alice), WS, "op_a", "key-0003")).toMatchObject({ state: "CONFLICT", relay_decision: null });
    expect(await reader.lookupApplyAttempt(actor(alice), WS, "op_a", "key-9999")).toMatchObject({ state: "NONE" });
  });

  it("an operation its actor did not plan is a 404 before any authorization or data", async () => {
    const reader = await lookupService();
    await expect(reader.lookupApplyAttempt(actor(bob), WS, "op_a", "key-0001")).rejects.toMatchObject({ status: 404 });
    expect(order).toEqual(["context"]);
  });
});
