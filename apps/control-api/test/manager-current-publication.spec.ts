import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { accessDigest } from "../src/execution-v2/access-digest";
import { unqualifiedAccessTrust } from "../src/execution-v2/access-trust";
import { loadManagerCurrentCommissioning, managerCurrentBusinessFields, managerCurrentCommissioningDeadline,
  managerCurrentMetadataDigest, managerCurrentPublicationBase, managerCurrentSelectionCatalogue, parseManagerCurrentMetadata,
  qualifyManagerCurrentMetadata, withManagerCurrentPublications,
  type ManagerCurrentCommissioning, type ManagerCurrentMetadata } from "../src/execution-v2/manager-current-publication";

// Synthetic SOURCE_VERIFIED-shaped examples exercise private commissioning
// mechanics only. They are not source qualification or human access receipts.
const hash = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
function metadata(): ManagerCurrentMetadata {
  return { schema_version: "portal.execution.manager-current-metadata.v1",
    scope: { workspace_id: "research", environment: "paper", profile_id: "paper-test" },
    binding: { dataset_id: "manager-current:ACCOUNT", source_revision: "test-cycle", projection_generation: "test-epoch",
      catalogue_revision: "test-catalogue", window: null },
    source_workspace_id: "physical-manager", adapter_revision: "test-adapter-v5", publication_revision: "test-publication",
    state: "ACTIVE", issued_at_ms: 1000, expires_at_ms: 9000, source_read_at_ms: 900, observed_at_ms: 1000,
    receipt_pins: { source_read: "test-source-proof", transport_trust: "test-transport-proof",
      privacy: "test-privacy-proof", field_policy: "test-fields-proof" },
    grains: [
      { grain: "manager.account", source_fields: ["account_id", "venue", "base_currency"],
        fields: ["account_id", "venue", "base_currency"],
        selections: [{ resource_ref: "accounts-chunk-1", resource: { kind: "ACCOUNT", id: "actual-account-1" }, entity_ids: ["not-an-account-id"] }],
        entities: [{ entity_id: "not-an-account-id", account_id: "actual-account-1", payload_digest: hash("account1") }] },
      { grain: "relation.account_balances", source_fields: ["account_id", "currency", "total", "free", "locked"],
        fields: ["account_id", "currency", "balance_total", "balance_free", "balance_locked"],
        selections: [{ resource_ref: "balances-chunk-1", resource: { kind: "ACCOUNT", id: "actual-account-1" }, entity_ids: ["balance-row-1"] },
          { resource_ref: "balances-chunk-2", resource: { kind: "ACCOUNT", id: "balance-only-account" }, entity_ids: ["balance-row-2"] }],
        entities: [{ entity_id: "balance-row-1", account_id: "actual-account-1", payload_digest: hash("balance1") },
          { entity_id: "balance-row-2", account_id: "balance-only-account", payload_digest: hash("balance2") }] },
      { grain: "relation.account_policies", source_fields: ["account_id", "venue"], fields: ["account_id", "venue"],
        selections: [{ resource_ref: "policies-chunk-1", resource: { kind: "ACCOUNT", id: "actual-account-1" }, entity_ids: ["policy-row-1"] }],
        entities: [{ entity_id: "policy-row-1", account_id: "actual-account-1", payload_digest: hash("policy1") }] },
    ] };
}
const request = (m = metadata()) => ({ ...m.scope, binding: structuredClone(m.binding) });
function commission(m = metadata(), until = 8000) {
  const artifact = { schema_version: "portal.execution.manager-current-commissioning.v1", scope: m.scope, binding: m.binding,
    source_workspace_id: m.source_workspace_id, adapter_revision: m.adapter_revision,
    source_metadata_digest: managerCurrentMetadataDigest(m), receipt_pins: m.receipt_pins };
  const bytes = Buffer.from(JSON.stringify(artifact));
  const approval = { artifact_sha256: hash(bytes.toString()), approval_ref: "test-independent-owner-approval",
    approved_at_ms: 1000, valid_until_ms: until };
  return { artifact, bytes, approval, handle: loadManagerCurrentCommissioning(bytes, approval, 2000) };
}
const qualify = (m: unknown, handle = commission().handle, nowMs = 2000) =>
  qualifyManagerCurrentMetadata(m, request(), { commissioning: handle, nowMs });

describe("Manager CURRENT exact source publication (synthetic private adapter mechanics)", () => {
  it("unwraps only a genuinely registered publication decorator without trusting lookalike markers", () => {
    const base = { ...unqualifiedAccessTrust }, decorated = withManagerCurrentPublications(base, async () => metadata(),
      { commissioning: commission().handle, now: () => 2000 });
    expect(managerCurrentPublicationBase(decorated)).toBe(base);
    expect(managerCurrentPublicationBase(base)).toBe(base);
    const lookalike = { ...decorated, base, isManagerCurrentPublication: true };
    expect(managerCurrentPublicationBase(lookalike)).toBe(lookalike);
    expect(managerCurrentPublicationBase(undefined)).toBeUndefined();
  });
  it("unions the complete three-grain census, deduplicating explicit account_id rather than parsing entity IDs", async () => {
    const m = metadata(), c = commission(m), source = vi.fn(async () => m);
    const trust = withManagerCurrentPublications(unqualifiedAccessTrust, source, { commissioning: c.handle, now: () => 2000 });
    const publication = await trust.readPublication!(request());
    expect(publication).toMatchObject({ qualification: "SOURCE_VERIFIED", population_coverage: "COMPLETE_FOR_DATASET_WINDOW",
      binding: m.binding, resources: [{ kind: "ACCOUNT", id: "actual-account-1" }, { kind: "ACCOUNT", id: "balance-only-account" }],
      tuples: [], current_linkage: null });
    expect(publication).not.toHaveProperty("binding_lineage");
    expect(publication).not.toHaveProperty("strategy_lineage");
    expect(publication).not.toHaveProperty("history_capability");
    expect(source).toHaveBeenCalledOnce();
  });
  it("publishes exact per-chunk source to account mappings and canonical fields without leaking references to stored input", () => {
    const m = qualify(metadata()), catalogue = managerCurrentSelectionCatalogue(m);
    expect(catalogue).toHaveLength(4);
    expect(catalogue[1]).toMatchObject({ grain: "relation.account_balances", resource_ref: "balances-chunk-1",
      fields: ["account_id", "balance_free", "balance_locked", "balance_total", "currency"],
      source_fields: ["account_id", "currency", "free", "locked", "total"],
      entities: [{ entity_id: "balance-row-1", account_id: "actual-account-1", payload_digest: hash("balance1") }] });
    catalogue[0]!.entities[0]!.account_id = "changed";
    expect(m.grains[0]!.entities[0]!.account_id).toBe("actual-account-1");
  });
  it("does not use base human or native-domain permissions as publication proof, and preserves all base trust operations", async () => {
    const base = { ...unqualifiedAccessTrust, verifyPolicy: vi.fn(async () => null),
      verifyReceipt: vi.fn(async () => null), verifyRootReceipt: vi.fn(async () => null),
      qualifyDelegatedReceipt: vi.fn(async () => null), relations: vi.fn(unqualifiedAccessTrust.relations),
      verifiedHumanMapping: vi.fn(async () => null) };
    const trust = withManagerCurrentPublications(base, async () => metadata(), { commissioning: commission().handle, now: () => 2000 });
    await trust.readPublication!(request());
    expect(base.verifyPolicy).not.toHaveBeenCalled();
    expect(base.relations).not.toHaveBeenCalled();
    expect(await trust.verifyPolicy({ a: 1 })).toBeNull();
    expect(await trust.verifyReceipt({ a: 2 })).toBeNull();
    expect(await trust.verifyRootReceipt!({ a: 3 })).toBeNull();
    expect(await trust.verifiedHumanMapping("real-user", "research")).toBeNull();
    expect(await trust.relations("real-user", "research")).toEqual(await unqualifiedAccessTrust.relations("real-user", "research"));
    expect(base.verifiedHumanMapping).toHaveBeenCalledWith("real-user", "research");
  });
  it.each(["REVOKED", "DRAINING"] as const)("refreshes independent source state %s without cached ACTIVE fallback", async state => {
    let source = metadata(), calls = 0;
    const trust = withManagerCurrentPublications(unqualifiedAccessTrust, async () => { calls++; return source; },
      { commissioning: commission().handle, now: () => 2000 });
    await trust.readPublication!(request());
    source = { ...source, state };
    await expect(trust.readPublication!(request())).rejects.toMatchObject({ code: `PUBLICATION_${state}` });
    expect(calls).toBe(2);
    expect(managerCurrentMetadataDigest(source)).toBe(managerCurrentMetadataDigest(metadata()));
  });
  it("rejects forged handles and a self-asserted SOURCE_VERIFIED label", () => {
    expect(() => qualify(metadata(), {} as ManagerCurrentCommissioning)).toThrow();
    expect(() => qualify({ ...metadata(), qualification: "SOURCE_VERIFIED" })).toThrow();
    expect(() => withManagerCurrentPublications(unqualifiedAccessTrust, async () => metadata(),
      { commissioning: {} as ManagerCurrentCommissioning })).toThrow("MANAGER_CURRENT_COMMISSIONING_INVALID");
  });
  it("checks exact independent artifact bytes and validates approval times and shape", () => {
    const c = commission();
    expect(managerCurrentCommissioningDeadline(c.handle)).toBe(8000);
    for (const patch of [{ artifact_sha256: hash("changed") }, { valid_until_ms: 2000 }, { approved_at_ms: 2001 },
      { valid_until_ms: 999 }, { approval_ref: "" }, { source: "unreviewed" }]) {
      expect(() => loadManagerCurrentCommissioning(c.bytes, { ...c.approval, ...patch }, 2000)).toThrow("MANAGER_CURRENT_COMMISSIONING_INVALID");
    }
    expect(() => loadManagerCurrentCommissioning(c.bytes, c.approval, NaN)).toThrow();
    expect(() => managerCurrentCommissioningDeadline({} as ManagerCurrentCommissioning)).toThrow();
  });
  it("copies approval/artifact input before use instead of trusting caller mutation", () => {
    const c = commission(); c.approval.valid_until_ms = 99999; c.artifact.scope.workspace_id = "other";
    expect(() => qualify(metadata(), c.handle, 8000)).toThrow();
    expect(qualify(metadata(), c.handle).scope.workspace_id).toBe("research");
  });
  it("holds the originally reviewed commissioning handle even if caller options change", async () => {
    const options = { commissioning: commission().handle, now: () => 2000 };
    const trust = withManagerCurrentPublications(unqualifiedAccessTrust, async () => metadata(), options);
    options.commissioning = {} as ManagerCurrentCommissioning;
    expect(await trust.readPublication!(request())).toMatchObject({ provenance_ref: "test-independent-owner-approval" });
  });
  it.each(["workspace_id", "environment", "profile_id"] as const)("rejects scope cutover at %s", key => {
    const r = request(); (r as Record<string, unknown>)[key] = "other";
    expect(() => qualifyManagerCurrentMetadata(metadata(), r, { commissioning: commission().handle, nowMs: 2000 })).toThrow();
  });
  it.each(["dataset_id", "source_revision", "projection_generation", "catalogue_revision", "window"] as const)("rejects exact binding mismatch at %s", key => {
    const r = request(); (r.binding as Record<string, unknown>)[key] = key === "window" ? { from_ms: 100, to_ms: 200 } : "other";
    expect(() => qualifyManagerCurrentMetadata(metadata(), r, { commissioning: commission().handle, nowMs: 2000 })).toThrow();
  });
  it.each(["source_workspace_id", "adapter_revision", "publication_revision"] as const)("pins source identity %s independently of the request", key => {
    expect(() => qualify({ ...metadata(), [key]: "changed" })).toThrow();
  });
  it("pins account mappings, payload hashes, fields and selection references rather than accepting a matching dataset name", () => {
    const mutations = [
      (m: ManagerCurrentMetadata) => { m.grains[0]!.entities[0]!.account_id = "different-account"; },
      (m: ManagerCurrentMetadata) => { m.grains[0]!.entities[0]!.payload_digest = hash("changed"); },
      (m: ManagerCurrentMetadata) => { m.grains[0]!.selections[0]!.resource_ref = "different-selection"; },
      (m: ManagerCurrentMetadata) => { m.grains[0]!.source_fields = ["account_id"]; m.grains[0]!.fields = ["account_id"]; },
      (m: ManagerCurrentMetadata) => { m.receipt_pins.source_read = "different-proof"; },
    ];
    for (const mutate of mutations) { const m = metadata(); mutate(m); expect(() => qualify(m)).toThrow(); }
  });
  it.each([0, 999, 8000, NaN, Infinity, 1.5])("rejects non-current approval clock %s", now => {
    expect(() => qualify(metadata(), commission().handle, now)).toThrow();
  });
  it("validates source interval/future clocks and checks actual time after awaiting source I/O", async () => {
    for (const patch of [{ issued_at_ms: 2001 }, { expires_at_ms: 2000 }, { issued_at_ms: 9000 },
      { source_read_at_ms: 1001 }, { observed_at_ms: 2001 }]) {
      expect(() => qualify({ ...metadata(), ...patch })).toThrow();
    }
    let now = 2000;
    const trust = withManagerCurrentPublications(unqualifiedAccessTrust, async () => { await Promise.resolve(); now = 8000; return metadata(); },
      { commissioning: commission().handle, now: () => now });
    await expect(trust.readPublication!(request())).rejects.toThrow();
  });
  it("cannot transform current source metadata into a history window or other environment", () => {
    const m = metadata(); m.binding.window = { from_ms: 100, to_ms: 200 };
    expect(() => managerCurrentMetadataDigest(m)).toThrow();
    expect(() => parseManagerCurrentMetadata(JSON.stringify({ ...metadata(), scope: { ...metadata().scope, environment: "live" } }))).toThrow();
  });
  it("keeps unrelated dataset readers intact, while missing or failed CURRENT source never falls back", async () => {
    const fallback = vi.fn(async () => null), source = vi.fn(async () => null);
    const trust = withManagerCurrentPublications({ ...unqualifiedAccessTrust, readPublication: fallback }, source,
      { commissioning: commission().handle, now: () => 2000 });
    const other = request(); other.binding.dataset_id = "existing-family";
    expect(await trust.readPublication!(other)).toBeNull(); expect(fallback).toHaveBeenCalledOnce(); expect(source).not.toHaveBeenCalled();
    expect(await trust.readPublication!(request())).toBeNull(); expect(fallback).toHaveBeenCalledOnce();
    const failing = withManagerCurrentPublications({ ...unqualifiedAccessTrust, readPublication: fallback }, async () => { throw new Error("private source details"); },
      { commissioning: commission().handle, now: () => 2000 });
    await expect(failing.readPublication!(request())).rejects.toMatchObject({ code: "PUBLICATION_NOT_QUALIFIED",
      message: "The requested source publication is not available." }); expect(fallback).toHaveBeenCalledOnce();
  });
  it("rejects wrong workspace/binding and expired commissioning before invoking independent source I/O", async () => {
    const source = vi.fn(async () => metadata()), c = commission();
    const trust = withManagerCurrentPublications(unqualifiedAccessTrust, source, { commissioning: c.handle, now: () => 2000 });
    const wrong = request(); wrong.workspace_id = "other";
    await expect(trust.readPublication!(wrong)).rejects.toMatchObject({ code: "PUBLICATION_SCOPE_MISMATCH" });
    const cutover = request(); cutover.binding.source_revision = "new-cycle";
    await expect(trust.readPublication!(cutover)).rejects.toMatchObject({ code: "PUBLICATION_SCOPE_MISMATCH" });
    const expired = withManagerCurrentPublications(unqualifiedAccessTrust, source, { commissioning: c.handle, now: () => 8000 });
    await expect(expired.readPublication!(request())).rejects.toMatchObject({ code: "PUBLICATION_NOT_QUALIFIED" });
    expect(source).not.toHaveBeenCalled();
  });
  it("freezes the original request before asynchronous source code can mutate it", async () => {
    const r = request();
    const trust = withManagerCurrentPublications(unqualifiedAccessTrust, async received => {
      received.workspace_id = "other"; r.workspace_id = "also-other"; return metadata();
    }, { commissioning: commission().handle, now: () => 2000 });
    expect(await trust.readPublication!(r)).toMatchObject({ workspace_id: "research" });
  });
  it("rejects duplicate grains, entities, references, memberships and ambiguous source account rows", () => {
    const mutations = [
      (m: ManagerCurrentMetadata) => { m.grains[1] = structuredClone(m.grains[0]!); },
      (m: ManagerCurrentMetadata) => { m.grains[0]!.entities.push(structuredClone(m.grains[0]!.entities[0]!)); },
      (m: ManagerCurrentMetadata) => { m.grains[1]!.selections[0]!.resource_ref = m.grains[0]!.selections[0]!.resource_ref; },
      (m: ManagerCurrentMetadata) => { m.grains[1]!.selections[1]!.entity_ids.push("balance-row-1"); },
      (m: ManagerCurrentMetadata) => { m.grains[0]!.entities.push({ ...m.grains[0]!.entities[0]!, entity_id: "other-entity" });
        m.grains[0]!.selections[0]!.entity_ids.push("other-entity"); },
      (m: ManagerCurrentMetadata) => { m.grains[0]!.source_fields.push("account_id"); },
      (m: ManagerCurrentMetadata) => { m.grains[0]!.fields.push("account_id"); },
    ];
    for (const mutate of mutations) { const m = metadata(); mutate(m); expect(() => managerCurrentMetadataDigest(m)).toThrow(); }
  });
  it("rejects incomplete or extra selections rather than declaring a partial grain complete", () => {
    for (const selection of [[], [{ resource_ref: "wrong", resource: { kind: "ACCOUNT" as const, id: "actual-account-1" }, entity_ids: ["missing"] }]]) {
      const m = metadata(); m.grains[0]!.selections = selection;
      expect(() => managerCurrentMetadataDigest(m)).toThrow();
    }
    const m = metadata(); m.grains.pop(); expect(() => managerCurrentMetadataDigest(m)).toThrow();
  });
  it("requires each selection's exact source ACCOUNT resource to exist in that selection's explicit account census", () => {
    const m = metadata(); m.grains[1]!.selections[0]!.resource.id = "balance-only-account";
    expect(() => managerCurrentMetadataDigest(m)).toThrow();
    expect(() => parseManagerCurrentMetadata(JSON.stringify(metadata()).replace('"kind":"ACCOUNT"', '"kind":"ROOT"'))).toThrow();
  });
  it("represents explicit source-qualified empty grains without inventing rows", async () => {
    const m = metadata(); for (const grain of m.grains) { grain.entities = []; grain.selections = []; }
    const trust = withManagerCurrentPublications(unqualifiedAccessTrust, async () => m,
      { commissioning: commission(m).handle, now: () => 2000 });
    expect(await trust.readPublication!(request(m))).toMatchObject({ resources: [], tuples: [], population_coverage: "COMPLETE_FOR_DATASET_WINDOW" });
  });
  it("rejects secret/technical/raw-name field escalation and only aliases the exact safe balance columns", () => {
    expect(managerCurrentBusinessFields("relation.account_balances", ["account_id", "total", "free", "locked"]))
      .toEqual(["account_id", "balance_free", "balance_locked", "balance_total"]);
    for (const field of ["password", "external_account_ref", "trader_id", "maker_fee_bps", "mode", "active", "__proto__", "constructor"])
      expect(() => managerCurrentBusinessFields("manager.account", ["account_id", field])).toThrow();
    const m = metadata(); m.grains[1]!.fields = ["account_id", "free", "total", "locked", "currency"];
    expect(() => managerCurrentMetadataDigest(m)).toThrow();
    expect(() => managerCurrentBusinessFields("manager.account", ["venue"])).toThrow();
  });
  it("bounds the full census and metadata bytes", () => {
    const m = metadata();
    m.grains[0]!.entities = Array.from({ length: 2000 }, (_, i) => ({ entity_id: `entity-${i}`, account_id: `account-${i}`, payload_digest: hash("row") }));
    m.grains[0]!.selections = [{ resource_ref: "large-selection", resource: { kind: "ACCOUNT", id: "account-0" },
      entity_ids: m.grains[0]!.entities.map(entity => entity.entity_id) }];
    expect(() => managerCurrentMetadataDigest(m)).toThrow();
    expect(() => parseManagerCurrentMetadata(" ".repeat(1_048_577))).toThrow();
  });
  it("rejects unknown members, duplicate JSON keys, noncanonical numbers and malformed UTF-8 before schema qualification", () => {
    const m = metadata(), valid = JSON.stringify(m);
    expect(parseManagerCurrentMetadata(valid)).toEqual(m);
    expect(() => parseManagerCurrentMetadata(valid.replace('"state":"ACTIVE"', '"state":"REVOKED","state":"ACTIVE"'))).toThrow();
    expect(() => parseManagerCurrentMetadata(valid.replace('"issued_at_ms":1000', '"issued_at_ms":1e3'))).toThrow();
    expect(() => parseManagerCurrentMetadata(Buffer.from([0xff]))).toThrow();
    expect(() => parseManagerCurrentMetadata(JSON.stringify({ ...m, authorization: "root" }))).toThrow();
    const c = commission(), duplicate = c.bytes.toString().replace('"source_workspace_id":"physical-manager"',
      '"source_workspace_id":"wrong","source_workspace_id":"physical-manager"');
    expect(() => loadManagerCurrentCommissioning(duplicate, { ...c.approval, artifact_sha256: hash(duplicate) }, 2000)).toThrow();
  });
  it("all immutable registry bytes participate in the metadata pin", () => {
    const m = metadata(), c = commission(m);
    expect(c.artifact.source_metadata_digest).toBe(managerCurrentMetadataDigest(m));
    expect(c.artifact.source_metadata_digest).not.toBe(accessDigest(m));
    const changed = { ...m, observed_at_ms: 1001 };
    expect(managerCurrentMetadataDigest(changed)).not.toBe(c.artifact.source_metadata_digest);
  });
});
