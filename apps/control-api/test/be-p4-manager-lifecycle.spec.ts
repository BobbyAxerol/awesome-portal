/** BE-P4 / FE-027 + FE-012: `current_stage`, `entered_at_ms`, `days_in_stage` on a Manager row.
 * Pure component proofs over TEST_ONLY authority and rows: no PostgreSQL, no source, no runtime. */
import { describe, expect, it } from "vitest";
import { managerDatasetResponse } from "../src/execution-v2/manager-model.contract";
import type { ManagerFact, ManagerMember, ManagerMetric, ManagerModelDocument } from "../src/execution-v2/manager-model.contract";
import { queryManagerModel } from "../src/execution-v2/manager-model";
import { deriveManagerRowLifecycle, MS_PER_DAY } from "../src/execution-v2/manager-lifecycle";
import { accessDigest } from "../src/execution-v2/access-policy";
import { BUSINESS_READ_FIELDS } from "../src/execution-v2/read-fields";
import { EXECUTION_PUBLICATION_CATALOGUE } from "../src/execution-v2/publication-source.generated";
import { KeysetCursorCodec } from "../src/query/cursor";
import { productReadFixture, OWN, PEER, PRIVATE } from "./elp2-product-read.fixture";

const NOW = 1_800_000_000_000;
const partition = () => ({ economic_domain: "PAPER" as const, currency: "USDT", basis: "TEST_ONLY:net-ledger",
  native_profile_ref: "TEST_ONLY:paper-ledger", domain_proof_ref: "TEST_ONLY:domain-proof" });
const money = (value: string): ManagerMetric => ({ value, unit: "MONEY", currency: "USDT", basis: partition().basis, window: null,
  denominator: null, methodology_ref: "TEST_ONLY:method", availability: "AVAILABLE", reason_code: null,
  quality: { completeness: "COMPLETE", freshness: "FRESH", reasons: [] }, source_confidence: "VERIFIED",
  provenance_refs: ["TEST_ONLY:source-fact"], calculation_revision: "TEST_ONLY:calc", policy_revision: "TEST_ONLY:policy" });
const member = (tuple: ManagerMember["tuple"], name: string, patch: Partial<ManagerMember> = {}): ManagerMember => ({
  tuple: { ...tuple }, name, stage: "PAPER", owner_user_id: `TEST_ONLY:owner-${tuple.alpha_id}`, lifecycle: "ACTIVE", venue: "TEST_ONLY:venue",
  health: "HEALTHY", source_state: "FRESH", binding_ref: "TEST_ONLY:binding", assignment_revision: "TEST_ONLY:assignment",
  owner_revision: "TEST_ONLY:owner", binding_revision: "TEST_ONLY:binding-rev", valid_from_ms: NOW - 1000, valid_to_ms: null, ...patch });
const fact = (tuple: ManagerMember["tuple"], id: string, value: string): ManagerFact => ({ fact_id: id, revision: "TEST_ONLY:fact-r1",
  source_receipt_ref: "TEST_ONLY:not-economic-proof", tuple: { ...tuple }, partition: partition(),
  economic_account_ref: `TEST_ONLY:economic-${tuple.deployment_id}`, ownership_partition_ref: `TEST_ONLY:ownership-${tuple.deployment_id}`,
  kind: "net_pnl", metric: money(value), effective_at_ms: NOW - 100, recorded_at_ms: NOW - 50, classification: "ECONOMIC",
  transfer_pair_ref: null, counterpart_portfolio_id: null });
const codec = () => new KeysetCursorCodec({ activeKeyId: "test", keys: { test: "TEST_ONLY-manager-cursor-key-32bytes-not-prod" }, now: () => NOW / 1000 });

/** `live`: the OWN row also has a second deployment (same alpha/version/portfolio => same row), one of them Canary. */
async function fixture(options: { environment?: "paper" | "live"; secondStage?: "CANARY" | "LIVE" | null } = {}) {
  const environment = options.environment ?? "paper", profile = environment === "live" ? "LIVE_BINANCE_USDM" : "PAPER_BINANCE_USDM";
  const f = productReadFixture({ full: true, fields: [...BUSINESS_READ_FIELDS] });
  const second = { ...OWN, deployment_id: "TEST_ONLY:second-deployment", account_id: "TEST_ONLY:second-account" };
  if (options.secondStage) {
    const readPublication = f.access.readPublication.getMockImplementation()!;
    f.access.readPublication.mockImplementation(async request => {
      const value = await readPublication(request);
      return { ...value, tuples: [...value.tuples, second], resources: [...value.resources,
        { kind: "DEPLOYMENT" as const, id: second.deployment_id }, { kind: "ACCOUNT" as const, id: second.account_id }] };
    });
    const relationsFor = f.context.relationsFor;
    f.context.relationsFor = (...args) => { const value = relationsFor(...args); return { ...value,
      roots: { ...value.roots, root: [...value.roots.root, { kind: "DEPLOYMENT", id: second.deployment_id }, { kind: "ACCOUNT", id: second.account_id }] } }; };
  }
  if (environment === "live") f.context.grants.forEach(grant => { grant.environments = ["live"]; });
  const doc: ManagerModelDocument = { schema_version: "portal.execution.manager-model-input.v1", workspace_id: f.principal.workspaceId,
    environment, profile_id: profile, qualification: "TEST_ONLY", family_id: "alpha_fleet_overview", revision: "TEST_ONLY:model-r1",
    supersedes_revision: null, source_epoch: "TEST_ONLY:epoch", source_sequence: "1", projection_generation: "TEST_ONLY:g1",
    catalogue_digest: EXECUTION_PUBLICATION_CATALOGUE.source_catalogue_digest, source_set_digest: accessDigest([OWN, PEER, PRIVATE]),
    as_of_ms: NOW - 100, recorded_through_ms: NOW - 50, facts_through_ms: NOW - 100, observed_at_ms: NOW,
    source_quality: { completeness: "COMPLETE", freshness: "FRESH", reasons: [] },
    members: [member(OWN, "Zulu own"), member(PEER, "Alpha peer"), member(PRIVATE, "Middle own")],
    facts: [fact(OWN, "own-pnl", "1"), fact(PEER, "peer-pnl", "2"), fact(PRIVATE, "private-pnl", "3")] };
  if (environment === "live") {
    doc.members.forEach(m => { m.stage = "LIVE"; });
    doc.facts.forEach(value => { value.partition.economic_domain = "ACTUAL"; });
  }
  if (options.secondStage) doc.members.push(member(second, "Zulu own", { stage: options.secondStage }));
  const binding = { dataset_id: doc.family_id, source_revision: doc.revision, projection_generation: doc.projection_generation,
    catalogue_revision: doc.catalogue_digest, window: null };
  const scope = await f.scopes.authorize(f.principal, { environment, profileId: profile }, { action: "business.read_all", dataset: binding });
  const c = codec();
  const read = (query: Record<string, unknown> = {}) => queryManagerModel(scope, doc, { environment, ...query }, c, "FLEET");
  return { doc, read };
}

describe("BE-P4 FE-027 current_stage / entered_at_ms / days_in_stage", () => {
  it("derives the single active member stage and nothing else (pure rule)", () => {
    expect(deriveManagerRowLifecycle(["PAPER"])).toMatchObject({ current_stage: "PAPER", entered_at_ms: null, days_in_stage: null,
      stage_lifecycle_reasons: { current_stage: null, entered_at_ms: "STAGE_ENTRY_TIME_NOT_PUBLISHED", days_in_stage: "STAGE_ENTRY_TIME_NOT_PUBLISHED" } });
    expect(deriveManagerRowLifecycle(["LIVE", "CANARY"]).stage_lifecycle_reasons.current_stage).toBe("MULTIPLE_ACTIVE_STAGES");
    expect(deriveManagerRowLifecycle(["LIVE", "CANARY"]).current_stage).toBeNull();
    expect(deriveManagerRowLifecycle([]).stage_lifecycle_reasons.current_stage).toBe("STAGE_FIELD_NOT_PUBLISHED");
    expect(deriveManagerRowLifecycle(["LIVE", "LIVE"]).current_stage).toBe("LIVE");
  });

  it("publishes a single stage, the typed entry-time absence and the policy statement", async () => {
    const f = await fixture();
    const result = f.read();
    expect(result.stage_lifecycle).toEqual({ current_stage_rule: "SINGLE_ACTIVE_MEMBER_STAGE_IN_SELECTED_ENVIRONMENT",
      covers: "DEPLOYED_STAGES_OF_SELECTED_ENVIRONMENT_ONLY", entry_time: "STAGE_ENTRY_TIME_NOT_PUBLISHED" });
    expect(result.items.length).toBeGreaterThan(0);
    for (const row of result.items) expect(row).toMatchObject({ current_stage: "PAPER", entered_at_ms: null, days_in_stage: null,
      stage_lifecycle_reasons: { current_stage: null, entered_at_ms: "STAGE_ENTRY_TIME_NOT_PUBLISHED", days_in_stage: "STAGE_ENTRY_TIME_NOT_PUBLISHED" } });
    expect(result.query_options.unavailable_fields).toEqual([{ field: "days_in_stage", reason_code: "STAGE_ENTRY_TIME_NOT_PUBLISHED" },
      { field: "entered_at_ms", reason_code: "STAGE_ENTRY_TIME_NOT_PUBLISHED" }]);
    expect(result.query_options.sort_fields).toContain("current_stage");
    expect(result.query_options.group_fields).toContain("current_stage");
  });

  it("does not turn a revision interval start into a stage entry time", async () => {
    const early = await fixture(), late = await fixture();
    late.doc.members.forEach(m => { m.valid_from_ms = NOW - 400 * MS_PER_DAY; m.assignment_revision = "TEST_ONLY:assignment-r9"; });
    for (const row of [...early.read().items, ...late.read().items]) expect([row.entered_at_ms, row.days_in_stage]).toEqual([null, null]);
  });

  it("refuses to rank Canary against Live: two active stages publish no single stage", async () => {
    const f = await fixture({ environment: "live", secondStage: "CANARY" });
    const rows = f.read().items, multi = rows.find(r => r.stage_presence.length === 2)!;
    expect(multi.stage_presence).toEqual(["CANARY", "LIVE"]);
    expect(multi).toMatchObject({ current_stage: null, stage_lifecycle_reasons: { current_stage: "MULTIPLE_ACTIVE_STAGES" } });
    for (const row of rows.filter(r => r !== multi)) expect(row.current_stage).toBe("LIVE");
  });

  it("a stage filter narrows the table, not the lifecycle claim", async () => {
    const f = await fixture({ environment: "live", secondStage: "CANARY" });
    const filtered = f.read({ stage_filter: ["CANARY"] }).items;
    expect(filtered).toHaveLength(1);
    expect(filtered[0].stage_presence).toEqual(["CANARY"]);
    // Canary alone is visible, but the row also runs Live: Canary must not be crowned its only stage.
    expect(filtered[0]).toMatchObject({ current_stage: null, stage_lifecycle_reasons: { current_stage: "MULTIPLE_ACTIVE_STAGES" } });
    expect(managerDatasetResponse.safeParse({ ...f.read({ stage_filter: ["CANARY"] }) }).success).toBe(true);
  });

  it("sorts, filters and groups by current_stage over the full query with null last", async () => {
    const f = await fixture({ environment: "live", secondStage: "CANARY" });
    const asc = f.read({ sort: [{ field: "current_stage", direction: "asc" }] }).items.map(r => r.current_stage);
    const desc = f.read({ sort: [{ field: "current_stage", direction: "desc" }] }).items.map(r => r.current_stage);
    expect(asc.at(-1)).toBeNull(); expect(desc.at(-1)).toBeNull();
    expect(asc.filter(Boolean)).toEqual(Array(asc.filter(Boolean).length).fill("LIVE"));
    expect(f.read({ filters: [{ field: "current_stage", op: "EQ", value: "LIVE" }] }).page.authorized_filtered_count).toBe(asc.filter(Boolean).length);
    expect(f.read({ filters: [{ field: "current_stage", op: "IS_NULL" }] }).page.authorized_filtered_count).toBe(1);
    expect(f.read({ filters: [{ field: "current_stage", op: "IN", values: ["LIVE", "CANARY"] }] }).page.authorized_filtered_count).toBe(asc.filter(Boolean).length);
    const groups = f.read({ group_by: ["current_stage"] }).groups;
    // Lanes are disjoint: every row sits in exactly one group (stage_presence groups overlap).
    expect(groups.reduce((n, g) => n + g.unique_row_count, 0)).toBe(asc.length);
    expect(groups.map(g => g.key[0].value)).toHaveLength(2);
    expect(new Set(groups.map(g => g.key[0].value))).toEqual(new Set(["LIVE", null]));
  });

  it("binds the sort field into the cursor", async () => {
    const f = await fixture({ environment: "live", secondStage: "CANARY" });
    const first = f.read({ sort: [{ field: "current_stage", direction: "asc" }], limit: 1 });
    expect(first.page.next_cursor).not.toBeNull();
    expect(() => f.read({ sort: [{ field: "name", direction: "asc" }], limit: 1, after: first.page.next_cursor! })).toThrow();
  });

  describe("validator (a producer can not publish what the rule forbids)", () => {
    const sample = async () => (await fixture({ environment: "live", secondStage: "CANARY" })).read();
    const tamper = async (mutate: (v: Record<string, any>) => void) => {
      const v = structuredClone(await sample()) as Record<string, any>; mutate(v); return managerDatasetResponse.safeParse(v).success;
    };
    it("accepts the honest response and a populated entry pair that matches the cutoff", async () => {
      expect(await tamper(() => undefined)).toBe(true);
      expect(await tamper(v => { const r = v.items.find((x: any) => x.current_stage === "LIVE");
        r.entered_at_ms = v.as_of_ms - 3 * MS_PER_DAY - 5; r.days_in_stage = 3;
        r.stage_lifecycle_reasons.entered_at_ms = null; r.stage_lifecycle_reasons.days_in_stage = null; })).toBe(true);
    });
    it.each([
      ["two stages but a published current_stage", (v: any) => { const r = v.items.find((x: any) => x.current_stage === null); r.current_stage = "LIVE"; r.stage_lifecycle_reasons.current_stage = null; }],
      ["current_stage differs from the row's own stage", (v: any) => { const r = v.items.find((x: any) => x.current_stage === "LIVE"); r.current_stage = "CANARY"; }],
      ["null current_stage without a reason", (v: any) => { v.items.find((x: any) => x.current_stage === null).stage_lifecycle_reasons.current_stage = null; }],
      ["reason on a published value", (v: any) => { v.items.find((x: any) => x.current_stage === "LIVE").stage_lifecycle_reasons.current_stage = "MULTIPLE_ACTIVE_STAGES"; }],
      ["entry time without clearing its reason", (v: any) => { v.items[0].entered_at_ms = v.as_of_ms - 1; }],
      ["days without an entry time", (v: any) => { const r = v.items[0]; r.days_in_stage = 2; r.stage_lifecycle_reasons.days_in_stage = null; }],
      ["days that do not match the cutoff", (v: any) => { const r = v.items.find((x: any) => x.current_stage === "LIVE");
        r.entered_at_ms = v.as_of_ms - 3 * MS_PER_DAY; r.days_in_stage = 4; r.stage_lifecycle_reasons.entered_at_ms = null; r.stage_lifecycle_reasons.days_in_stage = null; }],
      ["entry time after the cutoff", (v: any) => { const r = v.items.find((x: any) => x.current_stage === "LIVE");
        r.entered_at_ms = v.as_of_ms + 1; r.days_in_stage = 0; r.stage_lifecycle_reasons.entered_at_ms = null; r.stage_lifecycle_reasons.days_in_stage = null; }],
      ["entry time on a row with no single stage", (v: any) => { const r = v.items.find((x: any) => x.current_stage === null);
        r.entered_at_ms = v.as_of_ms - 1; r.stage_lifecycle_reasons.entered_at_ms = null; }],
      ["unknown reason code", (v: any) => { v.items[0].stage_lifecycle_reasons.entered_at_ms = "BECAUSE"; }],
      ["negative days", (v: any) => { v.items[0].days_in_stage = -1; }],
    ])("rejects %s", async (_name, mutate) => { expect(await tamper(mutate)).toBe(false); });
  });
});
