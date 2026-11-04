import { describe, expect, it, vi } from "vitest";
import type { ServerResponse } from "node:http";
import type { ReadScopePrincipal } from "../src/execution-v2/read-scope";
import type { CurrentViewSelection } from "../src/execution-v2/current-view-authority";
import { SiblingNativeDelivery, type SiblingNativePlan } from "../src/execution-v2/sibling-native-delivery";
import { SiblingPageCursorCodec } from "../src/execution-v2/sibling-page-cursor";

// A synthetic native fence exercises the composition contract only; it is not
// a publication, source qualification, or proof of a real HTTP transaction.
const actor = { workspaceId: "ws", user: { userId: "user" }, session: { sessionId: "session", sessionVersion: 1 } } as ReadScopePrincipal;
const selection = { resource_ref: "resource", binding: { environment: "paper", profileId: "paper" },
  read_requirement: { action: "account.read", resource: { kind: "ACCOUNT", id: "account" },
    dataset: { dataset_id: "test", source_revision: "1", window: null } }, fields: ["state"],
  detail_fields: ["filled_quantity", "reconciliation_run_id", "obligation_id"] } as unknown as CurrentViewSelection;
const sourceRequest = { authority: selection, resource: "resource", query: { limit: 1, max_bytes: 1000 } } as const;
const sourceRead = async () => ({ status: 200 as const, body: Buffer.from("{}") });
const familyBody = (kind: "order-detail" | "reconciliation" | "obligations") => ({
  schema_version: `portal.execution.${kind}.v1`, workspace_id: "ws", record_authority: "PORTAL_PROJECTION", read_at_ms: 1,
  ...(kind === "order-detail" ? { order_id: "target", filled_quantity: "5" } :
    { subject: { type: "ACCOUNT", id: "target" }, ...(kind === "reconciliation" ? { runs: [] } : { items: [] }) }),
});

function cell(kind: "order-detail" | "reconciliation" | "obligations") {
  let body: unknown = familyBody(kind), allowed = true;
  let activePlan: SiblingNativePlan;
  const before = vi.fn();
  const qualifier = {
    prepare: vi.fn(async (scope: SiblingNativePlan["scope"]): Promise<SiblingNativePlan> => activePlan = { scope, selections: [selection],
      fieldProofs: { [kind === "order-detail" ? "filled_quantity" : kind === "reconciliation" ? "runs" : "items"]:
        { selection: 0, field: kind === "order-detail" ? "filled_quantity" : kind === "reconciliation" ? "reconciliation_run_id" : "obligation_id", detail: true } },
      read: async read => { await read(sourceRequest); return { scope, body, complete: true }; } }),
    revalidate: vi.fn(async () => { if (!allowed) throw Error("revoked"); }),
    revalidateBeforeDispatch: vi.fn(() => { if (!allowed) throw Error("revoked"); }),
  };
  let dispatched: Buffer | undefined;
  const core = { hasNativeCurrentRelations: () => true,
    deliverNative: vi.fn(async (_a: unknown, _s: unknown, _r: unknown, build: (read: never) => Promise<Buffer>,
      check: { validateAfterEnter: () => Promise<void>; validateBeforeDispatch: () => void }) => {
      await check.validateAfterEnter(); const bytes = await build(sourceRead as never); check.validateBeforeDispatch(); dispatched = bytes;
    }) };
  const service = new SiblingNativeDelivery(core as never, qualifier);
  const call = () => service.deliver(actor, kind, kind === "order-detail" ? "ORDER" : "ACCOUNT", "target", {} as ServerResponse, before);
  return { call, qualifier, core, before, result: () => dispatched, setBody: (v: unknown) => { body = v; },
    revoke: () => { allowed = false; }, plan: () => activePlan! };
}

describe("sibling native custody composition (synthetic only)", () => {
  it.each(["order-detail", "reconciliation", "obligations"] as const)("delivers %s only inside native fence", async kind => {
    const c = cell(kind); await c.call();
    expect(JSON.parse(c.result()!.toString())).toEqual(familyBody(kind));
    expect(c.core.deliverNative).toHaveBeenCalledOnce(); expect(c.before).toHaveBeenCalledOnce();
  });
  it("rejects an output field without a matching native field proof", async () => {
    const c = cell("order-detail"); c.setBody({ ...familyBody("order-detail"), average_fill_price: "123" });
    await expect(c.call()).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED" });
    expect(c.before).not.toHaveBeenCalled(); expect(c.result()).toBeUndefined();
  });
  it("rejects a detached body when its claimed selected source was not read", async () => {
    const c = cell("order-detail");
    c.qualifier.prepare.mockImplementation(async scope => ({ scope, selections: [selection],
      fieldProofs: { filled_quantity: { selection: 0, field: "filled_quantity", detail: true } },
      read: async () => ({ scope, body: familyBody("order-detail"), complete: true }) }));
    await expect(c.call()).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED" });
    expect(c.before).not.toHaveBeenCalled(); expect(c.result()).toBeUndefined();
  });
  it("does not borrow an unrelated observed selection for a field proof", async () => {
    const c = cell("order-detail"), other = { ...selection, resource_ref: "other" };
    c.qualifier.prepare.mockImplementation(async scope => ({ scope, selections: [selection, other],
      fieldProofs: { filled_quantity: { selection: 0, field: "filled_quantity", detail: true } },
      read: async read => { await read({ ...sourceRequest, authority: other });
        return { scope, body: familyBody("order-detail"), complete: true }; } }));
    await expect(c.call()).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED" });
    expect(c.before).not.toHaveBeenCalled(); expect(c.result()).toBeUndefined();
  });
  it("rejects a source body from another workspace or order", async () => {
    for (const changed of [{ workspace_id: "other" }, { order_id: "other" }]) {
      const c = cell("order-detail"); c.setBody({ ...familyBody("order-detail"), ...changed });
      await expect(c.call()).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED" });
      expect(c.before).not.toHaveBeenCalled();
    }
  });
  it("does not dispatch when authority is revoked before send", async () => {
    const c = cell("obligations");
    c.qualifier.revalidateBeforeDispatch.mockImplementation(() => { c.revoke(); throw Error("revoked"); });
    await expect(c.call()).rejects.toThrow("revoked");
    expect(c.before).not.toHaveBeenCalled(); expect(c.result()).toBeUndefined();
  });
  it("rejects a plan changed during source read", async () => {
    const c = cell("order-detail");
    c.qualifier.revalidate.mockImplementation(async () => {
      if (c.qualifier.revalidate.mock.calls.length === 3) (c.plan().selections as CurrentViewSelection[])[0] = { ...selection, fields: [] };
    });
    await expect(c.call()).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED" });
    expect(c.before).not.toHaveBeenCalled();
  });
  it("rejects an async final qualifier, because the physical fence cannot await it", async () => {
    const c = cell("order-detail");
    c.qualifier.revalidateBeforeDispatch.mockImplementation(() => Promise.resolve() as never);
    await expect(c.call()).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED" });
    expect(c.before).not.toHaveBeenCalled(); expect(c.result()).toBeUndefined();
  });
  it("rejects proof for a field outside the selected authority", async () => {
    const c = cell("order-detail");
    c.qualifier.prepare.mockImplementation(async scope => ({ scope, selections: [selection],
      fieldProofs: { filled_quantity: { selection: 0, field: "ungranted", detail: false } },
      read: async read => { await read(sourceRequest); return { scope, body: familyBody("order-detail"), complete: true }; } }));
    await expect(c.call()).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED" });
    expect(c.before).not.toHaveBeenCalled();
  });
  it("does not let a provider relabel a sensitive field as a different granted field", async () => {
    const c = cell("order-detail");
    c.qualifier.prepare.mockImplementation(async scope => ({ scope, selections: [selection],
      fieldProofs: { filled_quantity: { selection: 0, field: "state", detail: false } },
      read: async read => { await read(sourceRequest); return { scope, body: familyBody("order-detail"), complete: true }; } }));
    await expect(c.call()).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED" });
    expect(c.before).not.toHaveBeenCalled();
  });
  it("keeps a source coordinate opaque and bound across pages inside native custody", async () => {
    const codec = new SiblingPageCursorCodec("key", { key: "x".repeat(40) }, 1000, () => 100);
    const digest = `sha256:${"a".repeat(64)}`, positions: (string | null)[] = [], responses: Buffer[] = [];
    const qualifier = { prepare: async (scope: SiblingNativePlan["scope"], pageSize?: number): Promise<SiblingNativePlan> => ({
      scope, selections: [selection], fieldProofs: { items: { selection: 0, field: "obligation_id", detail: true } },
      page: { codec, binding: { workspace_id: scope.workspaceId, principal_id: scope.principalId, session_id: scope.sessionId,
        session_generation: scope.sessionGeneration, environment: "paper", kind: "obligations", target_type: scope.targetType,
        target_id: scope.targetId, app_policy_revision: "a", field_policy_revision: "f", source_set_digest: digest,
        snapshot_id: "snapshot", query_digest: digest, page_size: pageSize! } },
      read: async (read, page) => { await read(sourceRequest); positions.push(page!.position); return { scope, snapshot_id: "snapshot",
        body: familyBody("obligations"), complete: page!.position !== null, next_source: page!.position ? null : "private-next" }; },
    }), revalidate: async () => {}, revalidateBeforeDispatch: () => {} };
    const core = { hasNativeCurrentRelations: () => true, deliverNative: async (_a: unknown, _s: unknown, _r: unknown,
      build: (read: never) => Promise<Buffer>, check: { validateAfterEnter: () => Promise<void>; validateBeforeDispatch: () => void }) => {
      await check.validateAfterEnter(); const bytes = await build(sourceRead as never); check.validateBeforeDispatch(); responses.push(bytes);
    } };
    const service = new SiblingNativeDelivery(core as never, qualifier);
    const run = (principal: ReadScopePrincipal, cursor: string | null) => service.deliver(principal, "obligations", "ACCOUNT", "target",
      {} as ServerResponse, () => {}, { cursor, pageSize: 1 });
    await run(actor, null);
    const cursor = JSON.parse(responses[0]!.toString()).next_cursor as string;
    expect(cursor).not.toContain("private-next");
    await expect(run({ ...actor, workspaceId: "other" }, cursor)).rejects.toMatchObject({ code: "EXECUTION_READ_CURSOR_INVALID" });
    await run(actor, cursor);
    expect(JSON.parse(responses[1]!.toString()).next_cursor).toBeNull();
    expect(positions).toEqual([null, "private-next"]);
  });
});
