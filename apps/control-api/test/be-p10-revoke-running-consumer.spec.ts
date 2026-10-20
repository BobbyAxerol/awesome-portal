/** BE-P10 task 1, running-consumer half. TEST_ONLY, fakes only (scripted Core world + fake coordinator
 * + stubbed native Candidate methods); NOT PostgreSQL, NOT a socket, NOT a real SSE.
 *
 * What a RUNNING native manager STREAM consumer does when the official revoke commits (other process):
 *  1. No cross-process hint exists or is needed. The revoke is DB state under the SAME coordinator/drain.
 *  2. Every poll of every subscribed client first calls the trusted `current()` factory, which is
 *     `authorizeManagerNativeStream` -> `evaluateManagerDomainStream` in a fresh locked Core snapshot. A revoked
 *     READ or STREAM grant is ACCESS_DENIED (403), a contended lock is ACCESS_RETRY_REQUIRED (409), a narrowed
 *     window changes the scope identity: ALL of these terminate the client (`access_revoked`) and CLOSE the native
 *     stream (`closeNativeNoticeStream`). No frame is queued, acquired or sent after that check fails.
 *  3. Frame delivery re-runs `current()` again immediately before `acquire`, and the Candidate re-checks inside its
 *     own transaction (`assertNativeExecutionNoticeCurrent`), so a revoke committed between poll and send still
 *     refuses the frame. The in-process `ScopedReplayHub.revoke(predicate)` is only a fast purge hint.
 *  4. A new subscription after the revoke is refused before the stream is opened (no response ownership).
 * The current-human mutation coordinator side is covered in be-p10-manager-revoke.spec.ts: the revoke drains
 * (CURRENT_HUMAN_DRAINING for new native admissions), cannot commit while native custody is unresolved (typed
 * retry-required), and a replay writes nothing. */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { withTransaction } from "../src/db/pool";
import { AccessPolicyError } from "../src/execution-v2/access.contract";
import { accessDigest } from "../src/execution-v2/access-digest";
import { CurrentHumanCandidate } from "../src/execution-v2/current-human-candidate";
import { evaluateManagerDomainStream } from "../src/execution-v2/current-human-snapshot";
import { ExecutionAccessService } from "../src/execution-v2/access.service";
import { unqualifiedAccessTrust } from "../src/execution-v2/access-trust";
import { readPinnedManagerRevoke } from "../src/execution-v2/manager-domain-revoke";
import type { AuthService } from "../src/auth/auth.service";
import { NOW, OWNER_STREAM_TEMPLATE, prepared, sha256 } from "./fixtures/core009-templates";
import { FakeCoreWorld } from "./fixtures/fake-core-world";

vi.mock("node:fs/promises", async original => {
  const real = await original<typeof import("node:fs/promises")>();
  return { ...real, lstat: vi.fn(), open: vi.fn() };
});
vi.mock("../src/execution-v2/read-scope", async original => ({
  ...await original<typeof import("../src/execution-v2/read-scope")>(),
  scopeRealtimeIdentity: (scope: { identity: string }) => scope.identity,
}));

const reviewed = prepared(OWNER_STREAM_TEMPLATE);
const T = reviewed.ownerValue.target, [READ, STREAM] = reviewed.ownerValue.manager_domain_grants as any[];
const closeStream = vi.fn(), nativeFns = { acquire: vi.fn(), send: vi.fn(), cancel: vi.fn(), next: vi.fn() };
let Hub: typeof import("../src/execution-v2/realtime").ScopedReplayHub, Codec: typeof import("../src/execution-v2/realtime").ScopedReplayCursorCodec;
const proto = CurrentHumanCandidate.prototype as any;

beforeAll(async () => {
  // Must be installed BEFORE realtime.ts captures the intrinsic prototype methods at import time.
  vi.spyOn(proto, "openNativeNoticeStream").mockImplementation(() => ({ id: "TEST_ONLY-native-stream" }));
  vi.spyOn(proto, "closeNativeNoticeStream").mockImplementation(closeStream);
  vi.spyOn(proto, "nextNativeNoticeDelivery").mockImplementation(nativeFns.next);
  vi.spyOn(proto, "acquireNativeFrame").mockImplementation(nativeFns.acquire);
  vi.spyOn(proto, "sendNativeFrame").mockImplementation(nativeFns.send);
  vi.spyOn(proto, "cancelNativeFrame").mockImplementation(nativeFns.cancel);
  ({ ScopedReplayHub: Hub, ScopedReplayCursorCodec: Codec } = await import("../src/execution-v2/realtime"));
});
afterEach(() => { vi.clearAllMocks(); });

function world() {
  return new FakeCoreWorld({ now: NOW, database: { db: T.database_name, system: T.database_system_identifier, login: T.role_name },
    owner: T.protected_owner_user_id, workspace: T.workspace_id, members: [T.protected_owner_user_id],
    policy: reviewed.ownerValue.policy, grants: [READ, STREAM] });
}
async function rig(w: FakeCoreWorld) {
  const identityOf = async () => {
    const d = await withTransaction(w.pool, db => evaluateManagerDomainStream(db, { actor: w.actor, workspace_id: T.workspace_id, environment: "paper", domain: READ.domain }));
    return accessDigest({ read: d.scope_digest, stream: d.stream_scope_digest });
  };
  const initial = await identityOf();
  // The same trusted-factory contract as authorizeManagerNativeStream: a fresh DB decision on EVERY call.
  const current = async () => ({ identity: await identityOf() }) as any;
  const binding = { workspace_id: T.workspace_id, environment: "paper" as const, profile_id: READ.domain.profile_id, principal_scope_digest: initial,
    app_policy_revision: reviewed.ownerValue.policy.revision, field_policy_revision: READ.field_policy_ref,
    model_revision: "TEST_ONLY-model", schema_revision: "portal.execution.scoped-realtime.v1" as const, dataset: "execution_profile_observation" as const,
    query_digest: "sha256:" + "4".repeat(64), source_set_digest: "sha256:" + "5".repeat(64), source_continuity_epoch: "TEST_ONLY-epoch",
    projection_generation: "TEST_ONLY-generation", snapshot_id: "TEST_ONLY-snapshot", window: null };
  const read = vi.fn(async () => ({ notices: [], next_cursor: "TEST_ONLY.c1", caught_up: true }));
  const hub = new Hub({ read } as any, new Codec("test", { test: "TEST_ONLY_RUNNING_CONSUMER_REPLAY_KEY_".repeat(2) }, 60_000),
    { maximumClients: 2, maximumEntriesPerClient: 4, maximumFrameBytes: 16384, maximumClientBytes: 65536, maximumTotalBytes: 131072,
      maximumNoticesPerRead: 2, readTimeoutMs: 2000 }, { candidate: Object.create(CurrentHumanCandidate.prototype), scopes: {} as any });
  const response = { write: vi.fn(), end: vi.fn(), destroy: vi.fn() } as any;
  await hub.subscribeNative({ kind: "MANAGER", binding, response, current, baselineCursor: "TEST_ONLY.c0" });
  return { hub, read, response, current, binding };
}
async function applyItems(w: FakeCoreWorld, revocationId: string, items: object[]) {
  const { lstat, open } = await import("node:fs/promises");
  const bytes = Buffer.from(JSON.stringify({ schema_version: "portal.private-owner-manager-revoke.v1", target: T, revocation_id: revocationId,
    approval_ref: "TEST_ONLY-NOT-REAL-APPROVAL", reason: "Window closed.", provenance_ref: "TEST_ONLY-review", items }));
  const st = { uid: 0, mode: 0o100600, ino: 1, dev: 1, size: bytes.length, isFile: () => true, isSymbolicLink: () => false };
  vi.mocked(lstat).mockResolvedValue(st as any);
  vi.mocked(open).mockResolvedValue({ stat: async () => st, close: async () => undefined,
    read: (() => { let done = false; return async (b: Buffer, start: number) => { if (done) return { bytesRead: 0, buffer: b }; done = true; bytes.copy(b, start); return { bytesRead: bytes.length, buffer: b }; }; })() } as any);
  const pin = { artifact_path: "/root/TEST_ONLY-running.json", approved_sha256: sha256(bytes), target: T, not_before_ms: NOW - 1000, not_after_ms: NOW + 3_600_000 };
  await new ExecutionAccessService(w.pool, {} as AuthService, unqualifiedAccessTrust, false, w.coordinator.asMutations())
    .revokeReviewedManagerDomainGrants(await readPinnedManagerRevoke(pin, NOW));
}
const revoke = (w: FakeCoreWorld, ...grants: any[]) => applyItems(w, "TEST_ONLY-running-revoke",
  grants.map(g => ({ mode: "REVOKE", grant_id: g.grant_id, action: g.action, expected_grant_revision: g.revision })));

describe("a running native manager STREAM consumer when the official revoke commits", () => {
  it.each([
    ["STREAM only", (w: FakeCoreWorld) => revoke(w, STREAM)],
    ["READ only (STREAM needs a current READ)", (w: FakeCoreWorld) => revoke(w, READ)],
    ["both", (w: FakeCoreWorld) => revoke(w, READ, STREAM)],
  ])("%s: the next poll closes the native stream with NO source read, frame, acquire or byte", async (_name, doIt) => {
    const w = world(), h = await rig(w);
    expect(h.hub.diagnostics().clients).toBe(1);
    await doIt(w);
    await h.hub.poll();
    expect(h.hub.diagnostics().clients).toBe(0);
    expect(closeStream).toHaveBeenCalledTimes(1);
    expect(h.read).not.toHaveBeenCalled();
    expect(nativeFns.acquire).not.toHaveBeenCalled(); expect(nativeFns.send).not.toHaveBeenCalled();
    expect(h.response.write).not.toHaveBeenCalled(); // the Hub never appends a terminal write to a native owner's response
  });
  it("a still-allowed consumer keeps its client: the revoke of an UNRELATED grant id changes nothing here", async () => {
    const w = world(), h = await rig(w);
    const before = await h.current();
    expect(before.identity).toBe(h.binding.principal_scope_digest);
    expect(h.hub.diagnostics().clients).toBe(1); expect(closeStream).not.toHaveBeenCalled();
  });
  it("a contended Core lock (a revoke in flight) fails closed: the client is closed, never served", async () => {
    const w = world(), h = await rig(w);
    w.advisoryHeldElsewhere = true;
    await h.hub.poll();
    expect(h.hub.diagnostics().clients).toBe(0); expect(closeStream).toHaveBeenCalledTimes(1);
    expect(h.read).not.toHaveBeenCalled(); expect(nativeFns.send).not.toHaveBeenCalled();
  });
  it("a narrowed window changes the scope identity (SCOPE_CHANGED) and closes the client", async () => {
    const w = world(), h = await rig(w);
    await applyItems(w, "TEST_ONLY-narrow", [{ mode: "NARROW", grant_id: STREAM.grant_id, action: STREAM.action,
      expected_grant_revision: STREAM.revision, valid_until_ms: NOW + 10 * 60_000 }]);
    await h.hub.poll();
    expect(h.hub.diagnostics().clients).toBe(0); expect(closeStream).toHaveBeenCalledTimes(1); expect(nativeFns.send).not.toHaveBeenCalled();
  });
  it("after the revoke a NEW subscription is refused before any native stream is opened", async () => {
    const w = world(), h = await rig(w);
    await revoke(w, STREAM);
    await expect(h.hub.subscribeNative({ kind: "MANAGER", binding: h.binding, response: h.response, current: h.current, baselineCursor: "TEST_ONLY.c0" }))
      .rejects.toSatisfy((e: unknown) => e instanceof AccessPolicyError && e.code === "ACCESS_DENIED");
    expect(proto.openNativeNoticeStream).toHaveBeenCalledTimes(1); // only the original subscription's
  });
  it("the in-process fast purge hint closes a matching client at once, without any database call", async () => {
    const w = world(), h = await rig(w), queries = vi.mocked(w.client.query).mock.calls.length;
    h.hub.revoke(binding => binding.workspace_id === T.workspace_id);
    expect(h.hub.diagnostics().clients).toBe(0); expect(closeStream).toHaveBeenCalledTimes(1);
    expect(vi.mocked(w.client.query).mock.calls.length).toBe(queries);
  });
});
