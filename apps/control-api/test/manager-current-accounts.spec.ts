import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { ResourceReadPrincipal } from "../src/resource-read/resource-read.service";
import { scopedResourceResponseSchemas } from "../src/resource-read/scoped-resource.contract";
import { ManagerCurrentAccounts } from "../src/execution-v2/manager-current-accounts";
import { loadManagerCurrentCommissioning, managerCurrentMetadataDigest, type ManagerCurrentMetadata } from "../src/execution-v2/manager-current-publication";
import type { CurrentViewOperation, CurrentViewSelection } from "../src/execution-v2/current-view-authority";
import type { SelectedCurrentViewEdgeRead } from "../src/execution-v2/current-view-edge-client";
import type { ReadScopePrincipal } from "../src/execution-v2/read-scope";
import type { CurrentViewCoreComposition } from "../src/execution-v2/current-view-composition";

const hash = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const text = (value: string) => ({ kind: "TEXT", value });
const decimal = (value: string) => ({ kind: "DECIMAL", value });
const fixtureMetadata = (): ManagerCurrentMetadata => ({ schema_version: "portal.execution.manager-current-metadata.v1",
  scope: { workspace_id: "research", environment: "paper", profile_id: "test-paper" },
  binding: { dataset_id: "manager-current:ACCOUNT", source_revision: "test-cycle", projection_generation: "test-epoch", catalogue_revision: "test-catalogue", window: null },
  source_workspace_id: "physical-manager", adapter_revision: "test-v5", publication_revision: "test-publication", state: "ACTIVE",
  issued_at_ms: 1000, expires_at_ms: 9000, source_read_at_ms: 900, observed_at_ms: 1000,
  receipt_pins: { source_read: "test-source", transport_trust: "test-transport", privacy: "test-privacy", field_policy: "test-fields" },
  grains: [
    { grain: "manager.account", source_fields: ["account_id", "venue", "base_currency"], fields: ["account_id", "venue", "base_currency"],
      selections: [{ resource_ref: "accounts", resource: { kind: "ACCOUNT", id: "source-pin-account" }, entity_ids: ["account-source", "account-target"] }],
      entities: [{ entity_id: "account-source", account_id: "source-pin-account", payload_digest: hash("source") },
        { entity_id: "account-target", account_id: "target-account", payload_digest: hash("target") }] },
    { grain: "relation.account_balances", source_fields: ["account_id", "currency", "total", "free", "locked"],
      fields: ["account_id", "currency", "balance_total", "balance_free", "balance_locked"],
      selections: [{ resource_ref: "balances", resource: { kind: "ACCOUNT", id: "source-pin-account" }, entity_ids: ["balance-source", "balance-target"] }],
      entities: [{ entity_id: "balance-source", account_id: "source-pin-account", payload_digest: hash("source-balance") },
        { entity_id: "balance-target", account_id: "target-account", payload_digest: hash("target-balance") }] },
    { grain: "relation.account_policies", source_fields: ["account_id"], fields: ["account_id"], selections: [], entities: [] },
  ] });
const principal = (): ResourceReadPrincipal => ({ workspaceId: "research", viewerWorkspaceId: "research",
  user: { userId: "actual-user", username: "actual-manager", displayName: "Actual manager", role: "USER", status: "ACTIVE",
    mustChangePassword: false, failedLoginCount: 0, lockedUntil: null, sessionVersion: 3, createdAt: new Date(0), updatedAt: new Date(0),
    disabledAt: null, accountRevision: 2, archivedAt: null },
  session: { sessionId: "actual-session", userId: "actual-user", state: "ACTIVE", sessionVersion: 3,
    authenticationTime: new Date(500), idleExpiresAt: new Date(10000), absoluteExpiresAt: new Date(10000) } });

function fixture(metadata = fixtureMetadata(), readCap?: number) {
  let source = metadata, now = 2000, sourceCalls = 0, denied = false;
  const artifact = { schema_version: "portal.execution.manager-current-commissioning.v1", scope: source.scope, binding: source.binding,
    source_workspace_id: source.source_workspace_id, adapter_revision: source.adapter_revision,
    source_metadata_digest: managerCurrentMetadataDigest(source), receipt_pins: source.receipt_pins };
  const bytes = JSON.stringify(artifact), commissioning = loadManagerCurrentCommissioning(bytes, {
    artifact_sha256: hash(bytes), approval_ref: "test-owner-review", approved_at_ms: 1000, valid_until_ms: 8000,
  }, now);
  const payloads: Record<string, Record<string, unknown>> = {
    "account-target": { account_id: text("target-account"), venue: text("BINANCE"), base_currency: text("USDT") },
    "balance-target": { account_id: text("target-account"), currency: text("USDT"), total: decimal("100.500"),
      free: decimal("0"), locked: decimal("100.500") },
  };
  const sourceRead = vi.fn(async () => { sourceCalls++; return structuredClone(source); });
  const calls: { principal: ReadScopePrincipal; selection: SelectedCurrentViewEdgeRead; operation: CurrentViewOperation }[] = [];
  const outer: CurrentViewSelection[] = [];
  const core = {
    ...(readCap === undefined ? {} : { currentReadResponseLimit: () => readCap }),
    async read(actor: ReadScopePrincipal, selection: SelectedCurrentViewEdgeRead, operation: CurrentViewOperation) {
      calls.push({ principal: structuredClone(actor), selection: structuredClone(selection), operation });
      const entityId = selection.query.entity_id!, entity = source.grains.flatMap(grain => grain.entities).find(value => value.entity_id === entityId)!;
      return { status: 200 as const, body: Buffer.from(JSON.stringify({ schema_version: "portal.execution.manager-current.v1",
        projection_generation: "test-epoch", source_continuity_epoch: "test-cycle", source_read_at_ms: 900, produced_at_ms: now,
        availability: "AVAILABLE", source_basis: "MANAGER_COMMITTED_POLL_BOUNDED_SNAPSHOT", history_capability: "UNAVAILABLE",
        coverage: "CURRENT_PAGE_ONLY", count_status: "COMPLETE_AUTHORIZED_SELECTION",
        rows: [{ entity_id: entityId, revision: entity.payload_digest, payload: payloads[entityId] }], next_cursor: null, resume_cursor: null })) };
    },
    async deliver<T>(_actor: ReadScopePrincipal, selection: CurrentViewSelection, _operation: CurrentViewOperation, callback: () => Promise<T>): Promise<T> {
      outer.push(structuredClone(selection));
      if (denied) throw Object.assign(new Error("permission denied"), { code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
      const result = await callback();
      if (denied) throw Object.assign(new Error("revoked"), { code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
      return result;
    },
  };
  const service = new ManagerCurrentAccounts({ request: { ...source.scope, binding: structuredClone(source.binding) },
    commissioning, source: sourceRead, core, now: () => now });
  return { service, core, calls, outer, payloads, sourceRead, principal: principal(),
    setSource(value: ManagerCurrentMetadata) { source = value; }, getSource: () => source,
    setNow(value: number) { now = value; }, deny() { denied = true; }, sourceCalls: () => sourceCalls };
}

/** Adapter orchestration only; this fake port is NOT native custody, a source
 * terminal or physical HTTP acceptance. Primary separately tests that engine. */
function nativeFixture(readCap?: number) {
  const f = fixture(fixtureMetadata(), readCap), delivered: Buffer[] = [], supplied: CurrentViewSelection[][] = [];
  let afterBuild = () => {}, afterEnter = () => {};
  const native: Pick<CurrentViewCoreComposition, "hasNativeCurrentRelations" | "deliverNative"> = {
    hasNativeCurrentRelations: () => true,
    deliverNative: vi.fn(async (actor, selections, _response, build, validation) => {
      supplied.push(structuredClone([...selections]));
      const bytes = await build((input: SelectedCurrentViewEdgeRead) => f.core.read(actor, input, "CURRENT"));
      afterBuild();
      await validation?.validateAfterEnter?.();
      afterEnter();
      validation?.validateBeforeDispatch?.();
      delivered.push(bytes);
    }),
  };
  Object.assign(f.core, native);
  return { ...f, native, delivered, supplied,
    afterBuild(run: () => void) { afterBuild = run; }, afterEnter(run: () => void) { afterEnter = run; } };
}

describe("Manager CURRENT Account360 (synthetic source/real adapter; not connected acceptance)", () => {
  it("enforces a tighter configured Edge byte cap on the source response before dispatch", async () => {
    const f = nativeFixture(1), beforeDispatch = vi.fn();
    await expect(f.service.readNativeProfile(f.principal, "target-account", "paper", {} as never, beforeDispatch)).rejects.toThrow();
    expect(f.calls[0]!.selection.query.max_bytes).toBe(1);
    expect(f.delivered).toHaveLength(0); expect(beforeDispatch).not.toHaveBeenCalled();
  });
  it("delivers an identity-only account profile through native custody without inventing financial fields", async () => {
    const f = nativeFixture(), beforeDispatch = vi.fn();
    await f.service.readNativeProfile(f.principal, "target-account", "paper", {} as never, beforeDispatch);
    expect(f.delivered).toHaveLength(1);
    expect(JSON.parse(f.delivered[0]!.toString())).toEqual({
      schema_version: "portal.execution.account-profile.v1", workspace_id: "research",
      record_authority: "PORTAL_PROJECTION", read_at_ms: 2000, account_id: "target-account",
    });
    expect(f.supplied[0]!.some(selection => selection.read_requirement.resource.id === "target-account")).toBe(true);
    expect(f.calls.map(call => call.selection.query.entity_id)).toEqual(["account-target"]);
    expect(f.supplied[0]!.every(selection => selection.resource_ref === "accounts")).toBe(true);
    expect(beforeDispatch).toHaveBeenCalledOnce();
  });
  it("does not dispatch an account profile if source metadata changes during native delivery", async () => {
    const f = nativeFixture(), beforeDispatch = vi.fn();
    f.afterBuild(() => { const changed = f.getSource(); changed.state = "DRAINING"; f.setSource(changed); });
    await expect(f.service.readNativeProfile(f.principal, "target-account", "paper", {} as never, beforeDispatch)).rejects.toThrow();
    expect(f.delivered).toHaveLength(0); expect(beforeDispatch).not.toHaveBeenCalled();
  });
  it("does not dispatch a profile after the exact source approval expires before HTTP handoff", async () => {
    const f = nativeFixture(), beforeDispatch = vi.fn();
    f.afterEnter(() => f.setNow(8000));
    await expect(f.service.readNativeProfile(f.principal, "target-account", "paper", {} as never, beforeDispatch)).rejects.toThrow();
    expect(f.delivered).toHaveLength(0); expect(beforeDispatch).not.toHaveBeenCalled();
  });
  it("rejects a source decimal with a trailing line terminator before native dispatch", async () => {
    const f = nativeFixture();
    f.payloads["balance-target"]!.total = decimal("100.500\n");
    await expect(f.service.readNative(f.principal, "target-account", "paper", {} as never, vi.fn())).rejects.toThrow();
    expect(f.delivered).toHaveLength(0);
  });
  it("keeps the exact Account360 DTO while providing requested account plus every source pin to native delivery", async () => {
    const f = nativeFixture(), beforeDispatch = vi.fn(), detached = vi.spyOn(f.core, "deliver");
    await expect(f.service.readNative(f.principal, "target-account", "paper", {} as never, beforeDispatch)).resolves.toBeUndefined();
    expect(detached).not.toHaveBeenCalled();
    expect(f.supplied[0]).toHaveLength(3);
    expect(f.supplied[0]![0]!.read_requirement.resource).toEqual({ kind: "ACCOUNT", id: "target-account" });
    expect(f.supplied[0]!.slice(1).map(item => item.read_requirement.resource))
      .toEqual([{ kind: "ACCOUNT", id: "source-pin-account" }, { kind: "ACCOUNT", id: "source-pin-account" }]);
    expect(f.supplied[0]!.map(item => item.resource_ref)).toEqual(["accounts", "accounts", "balances"]);
    expect(f.native.deliverNative).toHaveBeenCalledWith(f.principal, expect.any(Array), expect.any(Object),
      expect.any(Function), expect.objectContaining({ validateAfterEnter: expect.any(Function), validateBeforeDispatch: expect.any(Function) }));
    expect(f.delivered).toHaveLength(1);
    const value = JSON.parse(f.delivered[0]!.toString("utf8"));
    expect(scopedResourceResponseSchemas.ACCOUNT.safeParse(value).success).toBe(true);
    expect(value.data.account_balances[0]).toMatchObject({ total: "100.500", free: "0" });
    expect(value.data.accounts[0].account_id).toBe("target-account");
    expect(value.panels.orders.state).toBe("UNAVAILABLE");
    expect(f.sourceCalls()).toBe(3); // initial, after all grains, after ENTER
    expect(beforeDispatch).toHaveBeenCalledTimes(1);
  });
  it("never exposes a detached native DTO or performs source reads on that forbidden path", async () => {
    const f = nativeFixture();
    await expect(f.service.read(f.principal, "target-account", "paper"))
      .rejects.toMatchObject({ code: "EXECUTION_READ_AUTHORITY_UNAVAILABLE", status: 503 });
    expect(f.sourceRead).not.toHaveBeenCalled(); expect(f.calls).toHaveLength(0);
  });
  it("refuses native delivery when no native composition is installed", async () => {
    const f = fixture();
    await expect(f.service.readNative(f.principal, "target-account", "paper", {} as never, vi.fn()))
      .rejects.toMatchObject({ code: "EXECUTION_READ_AUTHORITY_UNAVAILABLE", status: 503 });
    expect(f.sourceRead).not.toHaveBeenCalled();
  });
  it.each(["workspace", "environment"])("does not send native data for wrong %s", async variant => {
    const f = nativeFixture();
    await expect(f.service.readNative(variant === "workspace" ? { ...f.principal, workspaceId: "other" } : f.principal,
      "target-account", variant === "environment" ? "live" : "paper", {} as never, vi.fn()))
      .rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
    expect(f.native.deliverNative).not.toHaveBeenCalled(); expect(f.sourceRead).not.toHaveBeenCalled();
  });
  it.each(["revision", "approval-expiry", "draining"])("rechecks metadata after ENTER and refuses %s without dispatch", async variant => {
    const f = nativeFixture(), beforeDispatch = vi.fn();
    f.afterBuild(() => {
      if (variant === "approval-expiry") f.setNow(8000);
      else f.setSource({ ...f.getSource(), ...(variant === "revision" ? { publication_revision: "changed" } : { state: "DRAINING" as const }) });
    });
    await expect(f.service.readNative(f.principal, "target-account", "paper", {} as never, beforeDispatch)).rejects.toThrow();
    expect(f.delivered).toHaveLength(0); expect(beforeDispatch).not.toHaveBeenCalled();
  });
  it("rechecks commissioning expiry synchronously after final source validation, before native dispatch", async () => {
    const f = nativeFixture(), beforeDispatch = vi.fn(); f.afterEnter(() => f.setNow(8000));
    await expect(f.service.readNative(f.principal, "target-account", undefined, {} as never, beforeDispatch)).rejects.toThrow();
    expect(f.sourceCalls()).toBe(3);
    expect(f.delivered).toHaveLength(0); expect(beforeDispatch).not.toHaveBeenCalled();
  });
  it("propagates native response ownership refusal without a detached fallback", async () => {
    const f = nativeFixture(), detached = vi.spyOn(f.core, "deliver"), failure = new Error("TEST_ONLY_RESPONSE_ALREADY_OWNED");
    await expect(f.service.readNative(f.principal, "target-account", "paper", {} as never, () => { throw failure; })).rejects.toBe(failure);
    expect(f.delivered).toHaveLength(0); expect(detached).not.toHaveBeenCalled();
  });
  it("composes the existing closed Account360 DTO from exact account and balance rows", async () => {
    const f = fixture(), result = await f.service.read(f.principal, "target-account", "paper") as any;
    expect(scopedResourceResponseSchemas.ACCOUNT.safeParse(result).success).toBe(true);
    expect(result.schema_version).toBe("execution.account-resource.v2");
    expect(result.data.accounts).toEqual([{ profile_environment: "paper", account_id: "target-account", venue: "BINANCE", base_currency: "USDT" }]);
    expect(result.data.account_balances).toEqual([{ profile_environment: "paper", account_id: "target-account", currency: "USDT", total: "100.500", free: "0", locked: "100.500" }]);
    expect(result.data.account.financial_summary).toEqual({ state: "UNAVAILABLE", reason_code: "SCOPED_RAW_FACTS_ONLY_NO_IMPLIED_TOTALS" });
    expect(result.panels.orders.state).toBe("UNAVAILABLE"); expect(result.data.orders).toEqual([]);
    expect(result.panels.account_equity).toMatchObject({ state: "UNAVAILABLE", data: null,
      source_history_semantics: "RETAINED_RANGE_OR_CURRENT_WINDOW", coverage: { returned_count: 0 } });
    expect(result.state).toBe("partial"); expect(result.completeness).toBe("PARTIAL"); expect(result.as_of_ms).toBeNull();
    expect(result.actor).toEqual({ user_id: "actual-user", username: "actual-manager", roles: ["USER"] });
    expect(f.sourceCalls()).toBe(2);
    expect(JSON.stringify(result)).not.toMatch(/account-source|balance-source|source-pin-account|physical-manager|test-cycle|test-epoch/);
  });
  it("preserves the real principal and uses exact source pin resources only under current whole business authority", async () => {
    const f = fixture(); await f.service.read(f.principal, "target-account");
    expect(f.outer).toHaveLength(1);
    expect(f.outer[0]!.read_requirement).toMatchObject({ action: "business.read_all", resource: { kind: "ACCOUNT", id: "target-account" }, requireWholePopulation: true });
    expect(f.calls).toHaveLength(2);
    for (const call of f.calls) {
      expect(call.principal).toEqual(f.principal);
      expect(call.operation).toBe("CURRENT");
      expect(call.selection.authority.read_requirement).toMatchObject({ action: "business.read_all", resource: { kind: "ACCOUNT", id: "source-pin-account" }, requireWholePopulation: true });
      expect(call.selection.query).toMatchObject({ limit: 1, max_bytes: 65536 });
    }
    expect(f.calls.map(call => call.selection.query.entity_id)).toEqual(["account-target", "balance-target"]);
    expect(f.outer[0]!.fields).toEqual(["account_id", "balance_free", "balance_locked", "balance_total", "base_currency", "currency", "venue"]);
  });
  it("refuses missing identity, wrong workspace and non-Paper routes without legacy fallback", async () => {
    const f = fixture();
    await expect(f.service.read({ ...f.principal, workspaceId: "other" }, "target-account", "paper")).rejects.toMatchObject({ status: 404 });
    await expect(f.service.read(f.principal, "target-account", "live")).rejects.toMatchObject({ status: 404 });
    expect(f.sourceRead).not.toHaveBeenCalled();
    await expect(f.service.read(f.principal, "not-found", "paper")).rejects.toMatchObject({ status: 404 });
    expect(f.calls).toHaveLength(0);
  });
  it("never replaces ordinary permissions with ADMIN, source metadata or a native-domain grant", async () => {
    const f = fixture(); f.deny(); f.principal.user.role = "ADMIN";
    await expect(f.service.read(f.principal, "target-account", "paper")).rejects.toMatchObject({ status: 404 });
    expect(f.calls).toHaveLength(0);
  });
  it("uses the outer final-disclosure fence when permissions change between grain reads", async () => {
    const f = fixture(), original = f.core.read.bind(f.core);
    vi.spyOn(f.core, "read").mockImplementation(async (...args) => { const result = await original(...args); if (f.calls.length === 2) f.deny(); return result; });
    await expect(f.service.read(f.principal, "target-account", "paper")).rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED" });
  });
  it.each(["REVOKED", "DRAINING"] as const)("rechecks source metadata state %s after all grain I/O", async state => {
    const f = fixture(), original = f.core.read.bind(f.core);
    vi.spyOn(f.core, "read").mockImplementation(async (...args) => { const result = await original(...args); f.setSource({ ...f.getSource(), state }); return result; });
    await expect(f.service.read(f.principal, "target-account", "paper")).rejects.toMatchObject({ code: `PUBLICATION_${state}` });
  });
  it("rejects metadata cutover or approval expiry during composition", async () => {
    for (const expire of [false, true]) {
      const f = fixture(), original = f.core.read.bind(f.core);
      vi.spyOn(f.core, "read").mockImplementation(async (...args) => {
        const result = await original(...args);
        if (f.calls.length === 2) { if (expire) f.setNow(8000); else f.setSource({ ...f.getSource(), publication_revision: "new" }); }
        return result;
      });
      await expect(f.service.read(f.principal, "target-account", "paper")).rejects.toThrow();
    }
  });
  it.each(["projection_generation", "source_continuity_epoch", "source_read_at_ms", "next_cursor", "count_status", "history_capability"])("rejects inconsistent upstream page %s", async key => {
    const f = fixture(), original = f.core.read.bind(f.core);
    vi.spyOn(f.core, "read").mockImplementation(async (...args) => {
      const result = await original(...args), value = JSON.parse(result.body.toString()); value[key] = key === "source_read_at_ms" ? 901 : "different";
      return { ...result, body: Buffer.from(JSON.stringify(value)) };
    });
    await expect(f.service.read(f.principal, "target-account", "paper")).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED" });
  });
  it.each(["entity_id", "revision", "duplicate", "missing", "extra-field", "bad-tag", "number-money", "wrong-account"])("rejects malformed or inconsistent source row %s", async kind => {
    const f = fixture(), original = f.core.read.bind(f.core);
    vi.spyOn(f.core, "read").mockImplementation(async (...args) => {
      const result = await original(...args), value = JSON.parse(result.body.toString()), row = value.rows[0];
      if (kind === "entity_id") row.entity_id = "other";
      if (kind === "revision") row.revision = hash("wrong");
      if (kind === "duplicate") value.rows.push(row);
      if (kind === "missing") value.rows = [];
      if (kind === "extra-field") row.payload.trader_id = text("private");
      if (kind === "bad-tag") row.payload.account_id.kind = "text";
      if (kind === "number-money" && row.payload.total) row.payload.total.value = 0;
      if (kind === "wrong-account") row.payload.account_id.value = "source-pin-account";
      return { ...result, body: Buffer.from(JSON.stringify(value)) };
    });
    await expect(f.service.read(f.principal, "target-account", "paper")).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED" });
  });
  it("preserves exact zero decimals and typed nulls without inventing totals", async () => {
    const f = fixture(); f.payloads["balance-target"]!.locked = { kind: "NULL", value: null };
    const result = await f.service.read(f.principal, "target-account", "paper") as any;
    expect(result.data.account_balances[0]).toMatchObject({ free: "0", locked: null });
    expect(result.data.account).not.toHaveProperty("equity");
  });
  it.each(["2026-02-30T00:00:00Z", "2026-02-29T00:00:00Z", "2026-04-31T12:00:00Z", "2026-01-01T24:00:00Z"])(
    "rejects normalized source metadata timestamp %s", async value => {
      const metadata = fixtureMetadata(); metadata.grains[0]!.source_fields.push("created_at"); metadata.grains[0]!.fields.push("created_at");
      const f = fixture(metadata); f.payloads["account-target"]!.created_at = { kind: "TIMESTAMP", value };
      await expect(f.service.read(f.principal, "target-account", "paper")).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED" });
    });
  it.each(["2028-02-29T23:59:59Z", "2026-01-01T00:00:00.123456789Z"])(
    "preserves valid source metadata timestamp %s without rounding the DTO", async value => {
      const metadata = fixtureMetadata(); metadata.grains[0]!.source_fields.push("created_at"); metadata.grains[0]!.fields.push("created_at");
      const f = fixture(metadata); f.payloads["account-target"]!.created_at = { kind: "TIMESTAMP", value };
      const result = await f.service.read(f.principal, "target-account", "paper") as any;
      expect(result.data.accounts[0].created_at).toBe(value);
    });
  it("rejects duplicate JSON keys and raw text/objects even if another parser could accept them", async () => {
    const f = fixture(), original = f.core.read.bind(f.core);
    vi.spyOn(f.core, "read").mockImplementation(async (...args) => {
      const result = await original(...args); return { ...result, body: Buffer.from(result.body.toString().replace('"availability":"AVAILABLE"', '"availability":"DENIED","availability":"AVAILABLE"')) };
    });
    await expect(f.service.read(f.principal, "target-account", "paper")).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED" });
  });
});
