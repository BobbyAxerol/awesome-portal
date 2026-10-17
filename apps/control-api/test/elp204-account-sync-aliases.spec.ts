/** Real scope minting and named reader, SYNTHETIC
 * TEST_ONLY authority and in-memory retained rows; NOT PG/source acceptance. */
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { productReadFixture, OWN, PRIVATE } from "./elp2-product-read.fixture";
import type { ProjectionScalar } from "../src/execution/profile-projection.repository";
import { namedRetainedBusinessFields } from "../src/execution/retained-business-aliases";

type Fixture = ReturnType<typeof productReadFixture>;
type Row = Record<string, ProjectionScalar>;
const TIME = "2026-10-17T00:00:00.000Z";
const aliases = [
  { relation: "account_sync_current_state", route: "account-sync-current-state", source: "manager.current.account-sync-current-state", clock: "updated_at", pk: "account_id" },
  { relation: "account_sync_snapshots", route: "account-sync-snapshots", source: "manager.current.account-sync-snapshots", clock: "created_at", pk: "sync_id" },
] as const;
type Alias = (typeof aliases)[number];
function row(alias: Alias, values: Row = {}): Row {
  return { account_id: PRIVATE.account_id, ...(alias.pk === "sync_id" ? { sync_id: "PRIVATE-sync" } : {}),
    currency: "USDT", mode: "paper", status: "READY", [alias.clock]: TIME, ...values };
}
function put(f: Fixture, alias: Alias, rows: Row[], source = alias.source as string) {
  f.snapshot.document.relations[source + ":" + alias.relation] = {
    source_id: source, relation: alias.relation, availability: "AVAILABLE", completeness: "COMPLETE", freshness: "FRESH",
    reason_code: null, as_of: TIME, items: rows.map(fields => ({ fields, lineage: {
      workspace_id: f.principal.workspaceId, profile_id: f.config.EXECUTION_EDGE_PAPER_PROFILE_ID!, source_contract_revision: "TEST_ONLY-contract" } })),
  };
}
function read(f: Fixture, alias: Alias, query: { limit?: number; cursor?: string } = {}) {
  return f.maximum.relationPage(f.principal, alias.route, { environment: "paper", limit: 20, ...query });
}

describe("ELP2-04 two additional finite account-sync aliases (synthetic boundary cases)", () => {
  it("keeps both NEW legacy aliases finite while preserving the original unkeyed legacy identity algorithm", async () => {
    // Prerequisite: primary's ASR-01 fix, additional to the frozen four-file
    // source candidate. This does NOT tighten any pre-existing legacy alias.
    const f = productReadFixture({ legacy: true });
    for (const alias of aliases) {
      put(f, alias, [row(alias, { sync_id: "PRIVATE-sync", buying_power: "999999999999999999.01",
        source: "PRIVATE-source", venue: "PRIVATE-venue", raw_checksum: "PRIVATE-checksum", archive_state: "PRIVATE-archive" })]);
      const value = await read(f, alias);
      expect(value.records).toHaveLength(1);
      expect(value.records[0].values).toEqual({ account_id: PRIVATE.account_id, currency: "USDT", mode: "paper",
        status: "READY", [alias.clock]: Date.parse(TIME) });
      expect(JSON.stringify(value.records)).not.toMatch(/PRIVATE-sync|PRIVATE-source|PRIVATE-venue|PRIVATE-checksum|PRIVATE-archive|999999999999999999|sync_id|buying_power/);
      const sourceIdentity = `${alias.pk}\u0000${alias.pk === "sync_id" ? "PRIVATE-sync" : PRIVATE.account_id}`;
      expect(value.records[0].resource_id).toBe("por1_" + createHash("sha256")
        .update(`${value.logical_operation_id}\u0000${sourceIdentity}`).digest("hex"));
    }
  });

  it("keeps exact per-alias finite whitelists; account.read is required even for Alpha owners", async () => {
    const f = productReadFixture(); f.context.grants = f.context.grants.filter(grant => grant.action !== "account.read");
    for (const alias of aliases) {
      expect(namedRetainedBusinessFields(alias.relation)).toEqual(["account_id", "currency", "mode", "status", alias.clock]);
      put(f, alias, [row(alias)]);
      await expect(read(f, alias)).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
    }
    expect(f.upstream.relationForCataloguedOperation).not.toHaveBeenCalled();
  });

  it("refuses duplicate visible declared identities in either alias rather than choosing a retained row", async () => {
    const f = productReadFixture();
    for (const alias of aliases) {
      put(f, alias, [row(alias), row(alias, { status: "DIFFERENT-status" })]);
      await expect(read(f, alias)).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503 });
    }
  });

  it.each(["missing", "null", "empty", "control"] as const)("rejects %s visible snapshot identity without a raw value in its diagnostic", async fault => {
    const f = productReadFixture(), alias = aliases[1], source = row(alias);
    if (fault === "missing") delete source.sync_id;
    else source.sync_id = fault === "null" ? null : fault === "empty" ? "" : "PRIVATE\u0000sync";
    put(f, alias, [source]);
    const pending = read(f, alias);
    await expect(pending).rejects.toMatchObject({ status: 503 });
    await expect(pending).rejects.not.toThrow(/PRIVATE|sync_id/);
  });

  it("does not use malformed hidden snapshot identities as an existence/error oracle", async () => {
    const f = productReadFixture(), alias = aliases[1];
    put(f, alias, [row(alias, { account_id: OWN.account_id, sync_id: null }), row(alias, { account_id: OWN.account_id, sync_id: "" })]);
    const hidden = await read(f, alias); put(f, alias, []);
    expect(hidden).toEqual(await read(f, alias));
  });

  it("withholds source rows without an account anchor instead of inferring it from sync ID/name/venue", async () => {
    const f = productReadFixture({ full: true });
    for (const alias of aliases) {
      put(f, alias, [row(alias, { account_id: null, name: PRIVATE.account_id, venue: PRIVATE.account_id })]);
      expect((await read(f, alias)).records).toEqual([]);
    }
  });

  it.each(aliases)("refuses malformed visible source clock for $route, never substituting observation time", async alias => {
    const f = productReadFixture(); put(f, alias, [row(alias, { [alias.clock]: "2026-10-17T00:00:00" })]);
    await expect(read(f, alias)).rejects.toMatchObject({ code: "UDB_RETAINED_SCALAR_CONTRACT_REJECTED", status: 503 });
  });

  it.each(aliases)("does not accept a same-named $relation from a legacy/unregistered source", async alias => {
    const f = productReadFixture(); put(f, alias, [row(alias)], "manager.accounts");
    await expect(read(f, alias)).rejects.toMatchObject({ code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status: 503 });
  });

  it("requires the selected source revision/generation to remain current after the raw read", async () => {
    const f = productReadFixture(), alias = aliases[0]; put(f, alias, [row(alias)]);
    f.repository.rawSnapshot.mockImplementationOnce(async () => ({ ...f.snapshot, projectionEpoch: "TEST_ONLY-foreign-generation" }));
    await expect(read(f, alias)).rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
    expect(f.upstream.relationForCataloguedOperation).not.toHaveBeenCalled();
  });

  it.each(["workspace", "profile", "environment"] as const)("rejects a snapshot whose %s differs from the authorized binding", async axis => {
    const f = productReadFixture(), alias = aliases[0]; put(f, alias, [row(alias)]);
    if (axis === "workspace") f.snapshot.document.workspace_id = "TEST_ONLY-foreign-workspace";
    if (axis === "profile") f.snapshot.document.profile_id = "TEST_ONLY-foreign-profile";
    if (axis === "environment") f.snapshot.document.environment = "live";
    await expect(read(f, alias)).rejects.toMatchObject({ code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 });
  });

  it("does not treat the snapshot cursor as authority for the current-state operation", async () => {
    const f = productReadFixture(); put(f, aliases[1], [row(aliases[1]), row(aliases[1], { sync_id: "PRIVATE-second" })]);
    put(f, aliases[0], [row(aliases[0])]);
    const first = await read(f, aliases[1], { limit: 1 }); expect(first.page.next_cursor).toEqual(expect.any(String));
    await expect(read(f, aliases[0], { limit: 1, cursor: first.page.next_cursor! }))
      .rejects.toMatchObject({ code: "UDB_RETAINED_CURSOR_INVALID_OR_STALE", status: 400 });
  });
});
