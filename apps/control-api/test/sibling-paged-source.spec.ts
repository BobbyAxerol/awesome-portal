import { describe, expect, it } from "vitest";
import { SiblingPageCursorCodec, type SiblingPageBinding } from "../src/execution-v2/sibling-page-cursor";
import { SiblingPagedSource, type SiblingPageSource } from "../src/execution-v2/sibling-paged-source";
import type { SiblingScope } from "../src/execution-v2/sibling-source-seam";

const digest = `sha256:${"a".repeat(64)}`;
const scope: SiblingScope = { workspaceId: "ws", principalId: "user", sessionId: "session", sessionGeneration: 1, environment: "paper",
  kind: "obligations", targetType: "ACCOUNT", targetId: "acct" };
const binding: SiblingPageBinding = { workspace_id: "ws", principal_id: "user", session_id: "session", session_generation: 1, environment: "paper",
  kind: "obligations", target_type: "ACCOUNT", target_id: "acct", app_policy_revision: "a1", field_policy_revision: "f1",
  source_set_digest: digest, snapshot_id: "snap", query_digest: digest, page_size: 1 };
const item = (id: string) => ({ obligation_id: id, kind: "WORKING_ORDER", state: "OPEN", recovery_id: null,
  order_id: null, operation_id: null, opened_at_ms: 1 });
const body = (items: unknown[]) => ({ schema_version: "portal.execution.obligations.v1", workspace_id: "ws",
  record_authority: "PORTAL_PROJECTION", read_at_ms: 1, subject: { type: "ACCOUNT", id: "acct" }, items });
const codec = () => new SiblingPageCursorCodec("k", { k: "a".repeat(40) }, 1000, () => 100);
const allowed = { check: async () => true };

describe("private paged sibling source", () => {
  it("reads every page of the same snapshot without exposing its source coordinate", async () => {
    const seen: Array<string | null> = [];
    const source: SiblingPageSource = { read: async (s, input) => {
      seen.push(input.position);
      return { scope: s, snapshot_id: "snap", body: body([item(input.position ? "second" : "first")]),
        complete: input.position !== null, next_source: input.position ? null : "private-position" };
    } };
    const reader = new SiblingPagedSource(allowed, source, codec());
    const first = await reader.read(scope, binding, null);
    expect(first.next_cursor).toBeTruthy();
    expect(first.next_cursor).not.toContain("private-position");
    const second = await reader.read(scope, binding, first.next_cursor);
    expect(second.next_cursor).toBeNull();
    expect(seen).toEqual([null, "private-position"]);
  });
  it("denies before source and after an in-flight revocation", async () => {
    let calls = 0, checks = 0;
    const source: SiblingPageSource = { read: async s => { calls++; return { scope: s, snapshot_id: "snap",
      body: body([]), complete: true, next_source: null }; } };
    await expect(new SiblingPagedSource({ check: async () => false }, source, codec()).read(scope, binding, null))
      .rejects.toMatchObject({ code: "SIBLING_ACCESS_DENIED" });
    expect(calls).toBe(0);
    await expect(new SiblingPagedSource({ check: async () => ++checks === 1 }, source, codec()).read(scope, binding, null))
      .rejects.toMatchObject({ code: "SIBLING_ACCESS_DENIED" });
    expect(calls).toBe(1);
  });
  it("does not reveal cursor validity after authority is revoked", async () => {
    let reads = 0;
    const source: SiblingPageSource = { read: async s => { reads++; return { scope: s, snapshot_id: "snap",
      body: body([]), complete: true, next_source: null }; } };
    const c = codec(), reader = new SiblingPagedSource({ check: async () => false }, source, c);
    for (const cursor of [c.encode(binding, "next"), "invalid"]) {
      await expect(reader.read(scope, binding, cursor)).rejects.toMatchObject({ code: "SIBLING_ACCESS_DENIED", status: 404 });
    }
    let checks = 0;
    const revokedDuringValidation = new SiblingPagedSource({ check: async () => ++checks === 1 }, source, c);
    await expect(revokedDuringValidation.read(scope, binding, "invalid"))
      .rejects.toMatchObject({ code: "SIBLING_ACCESS_DENIED", status: 404 });
    expect(reads).toBe(0);
  });
  it("refuses a prior session generation before querying the source", async () => {
    let calls = 0;
    const c = codec();
    const source: SiblingPageSource = { read: async s => { calls++; return { scope: s, snapshot_id: "snap",
      body: body([]), complete: true, next_source: null }; } };
    const reader = new SiblingPagedSource(allowed, source, c);
    const cursor = c.encode(binding, "next");
    await expect(reader.read({ ...scope, sessionGeneration: 2 }, binding, cursor))
      .rejects.toMatchObject({ code: "SIBLING_INPUT_INVALID" });
    await expect(reader.read({ ...scope, sessionGeneration: 2 }, { ...binding, session_generation: 2 }, cursor))
      .rejects.toMatchObject({ code: "SIBLING_CURSOR_INVALID_OR_EXPIRED" });
    await expect(reader.read({ ...scope, sessionGeneration: -1 }, { ...binding, session_generation: -1 }, null))
      .rejects.toMatchObject({ code: "SIBLING_INPUT_INVALID" });
    expect(calls).toBe(0);
  });
  it("rejects mismatched scope, snapshot, completeness and overlong pages", async () => {
    const page = { scope, snapshot_id: "snap", body: body([item("one")]), complete: true, next_source: null as string | null };
    for (const change of [{ snapshot_id: "other" }, { scope: { ...scope, workspaceId: "other" } },
      { complete: false }, { body: body([item("one"), item("two")]) }]) {
      const reader = new SiblingPagedSource(allowed, { read: async () => ({ ...page, ...change }) }, codec());
      await expect(reader.read(scope, binding, null)).rejects.toMatchObject({ code: expect.stringMatching(/^SIBLING_SOURCE_/) });
    }
    const reader = new SiblingPagedSource(allowed, { read: async () => page }, codec());
    await expect(reader.read(scope, { ...binding, workspace_id: "other" }, null)).rejects.toMatchObject({ code: "SIBLING_INPUT_INVALID" });
  });
  it("freezes the authorized binding during the awaited source read", async () => {
    const mutable = { ...binding };
    const reader = new SiblingPagedSource(allowed, { read: async s => {
      mutable.snapshot_id = "attacker";
      return { scope: s, snapshot_id: "snap", body: body([]), complete: false, next_source: "next" };
    } }, codec());
    const result = await reader.read(scope, mutable, null);
    expect(result.next_cursor).not.toBeNull();
    expect(codec().decode(result.next_cursor!, binding)).toBe("next");
  });
  it("detaches page rows before awaiting the final authority check", async () => {
    const first = item("first"), page = body([first]); let checks = 0;
    const reader = new SiblingPagedSource({ check: async () => {
      if (++checks === 2) first.obligation_id = "changed-after-source";
      return true;
    } }, { read: async s => ({ scope: s, snapshot_id: "snap", body: page, complete: false, next_source: "next" }) }, codec());
    const result = await reader.read(scope, binding, null);
    expect(result.body).toMatchObject({ items: [{ obligation_id: "first" }] });
    expect(result.next_cursor).not.toBeNull();
  });
  it("refuses a source continuation that does not advance", async () => {
    const c = codec();
    const reader = new SiblingPagedSource(allowed, { read: async s => ({ scope: s, snapshot_id: "snap",
      body: body([]), complete: false, next_source: "same" }) }, c);
    const cursor = c.encode(binding, "same");
    await expect(reader.read(scope, binding, cursor)).rejects.toMatchObject({ code: "SIBLING_SOURCE_INVALID" });
  });
  it("reports malformed source continuations as source failures, not bad client cursors", async () => {
    for (const next of ["", "has space", "trailing\n", "x".repeat(2049)]) {
      const reader = new SiblingPagedSource(allowed, { read: async s => ({ scope: s, snapshot_id: "snap",
        body: body([]), complete: false, next_source: next }) }, codec());
      await expect(reader.read(scope, binding, null)).rejects.toMatchObject({ code: "SIBLING_SOURCE_INVALID" });
    }
  });
  it("rejects duplicated source identities even within the allowed page size", async () => {
    const reader = new SiblingPagedSource(allowed, { read: async s => ({ scope: s, snapshot_id: "snap",
      body: body([item("one"), item("one")]), complete: true, next_source: null }) }, codec());
    await expect(reader.read(scope, { ...binding, page_size: 2 }, null)).rejects.toMatchObject({ code: "SIBLING_SOURCE_INVALID" });
  });
  it("refuses a source-provided public cursor instead of trusting it", async () => {
    const reader = new SiblingPagedSource(allowed, { read: async s => ({ scope: s, snapshot_id: "snap",
      body: { ...body([]), next_cursor: "source-coordinate" }, complete: true, next_source: null }) }, codec());
    await expect(reader.read(scope, binding, null)).rejects.toMatchObject({ code: "SIBLING_SOURCE_INVALID" });
  });
});
