/** TEST-ONLY integration apparatus. Explicit synthetic source/leaf/tuple mappings
 * below are NOT a producer wire, accepted bridge, installed financial grant or
 * PostgreSQL transaction proof. No product source may import this helper. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import { accessDigest } from "../../src/execution-v2/access-digest";
import type { EconomicProvenRow, EconomicSourceReduction } from "../../src/execution-v2/manager-economic-source.contract";
import { prepareManagerEconomicSourceFactory } from "../../src/execution-v2/manager-economic-source-input";
import { managerMetric, type ManagerModelDocument, type ManagerMetric } from "../../src/execution-v2/manager-model.contract";
import { prepareManagerProjection, type ManagerModelHead } from "../../src/execution-v2/manager-model.store";
import type { DatasetPublication } from "../../src/execution-v2/publication.contract";
import { EXECUTION_PUBLICATION_CATALOGUE } from "../../src/execution-v2/publication-source.generated";
import { queryManagerModel } from "../../src/execution-v2/manager-model";
import { BUSINESS_READ_FIELDS } from "../../src/execution-v2/read-fields";
import { readPublication } from "../../src/execution-v2/read-publication";
import { KeysetCursorCodec } from "../../src/query/cursor";
import { productReadFixture, OWN, PEER, PRIVATE } from "../elp2-product-read.fixture";

export const FINANCIAL_TEST_TIME = 1_800_000_000_000;
const NS = "TEST_ONLY:financial-source", T = FINANCIAL_TEST_TIME;
export const FINANCIAL_TEST_MAPPINGS = [
  { source: "TEST_ONLY:source-own", fact: "TEST_ONLY:mapped-own", tuple: OWN, amount: "10.1", leaf: "TEST_ONLY:leaf-own",
    economic: "TEST_ONLY:economic-own", ownership: "TEST_ONLY:ownership-own" },
  { source: "TEST_ONLY:source-peer", fact: "TEST_ONLY:mapped-peer", tuple: PEER, amount: "900001", leaf: "TEST_ONLY:leaf-peer",
    economic: "TEST_ONLY:economic-peer", ownership: "TEST_ONLY:ownership-peer" },
  { source: "TEST_ONLY:source-private", fact: "TEST_ONLY:mapped-private", tuple: PRIVATE, amount: "5.2", leaf: "TEST_ONLY:leaf-private",
    economic: "TEST_ONLY:economic-private", ownership: "TEST_ONLY:ownership-private" },
] as const;
export const financialTestSelection = (indices: readonly number[] = [0, 1, 2]) => ({
  expectation: { metric: "NET_PNL" as const, environment: "paper" as const, currency: "USDT", basis: "TEST_ONLY:all-time-net",
    cut: { effective_at_ms: T - 100, recorded_through_ms: T - 50 }, valuation_cutoff_ms: T - 100, window: null,
    revisions: { economic: "TEST_ONLY:e1", cashflow: "TEST_ONLY:c1", valuation: "TEST_ONLY:v1", ownership: "TEST_ONLY:o1" },
    restatement_relation: "ORIGINAL" as const },
  trust_policy: { policy_ref: "TEST_ONLY:explicit-source-policy", accepted_namespaces: [NS] },
  census: { census_ref: "TEST_ONLY:explicit-census", expected_sources: indices.map(i => ({ namespace: NS,
    source_id: FINANCIAL_TEST_MAPPINGS[i].source })) },
});
export function financialTestRows(): EconomicProvenRow[] {
  return FINANCIAL_TEST_MAPPINGS.map((m, i) => ({ evidence: "PROVEN_SOURCE_ROW", portal_fact_id: `TEST_ONLY:fact-${i}`,
    physical_account_ref: "TEST_ONLY:shared-physical-hint", source_identity: { namespace: NS, source_id: m.source }, leaves: [m.leaf],
    metric: "NET_PNL", amount: m.amount, environment: "paper", currency: "USDT", basis: "TEST_ONLY:all-time-net",
    cut: { effective_at_ms: T - 100, recorded_through_ms: T - 50 }, window: null,
    economic_revision: "TEST_ONLY:e1", cashflow_revision: "TEST_ONLY:c1",
    valuation: { valuation_cutoff_ms: T - 100, valuation_revision: "TEST_ONLY:v1" },
    ownership: { ownership_revision: "TEST_ONLY:o1", attribution_ref: `TEST_ONLY:attribution-${i}`,
      assignment_digest: accessDigest(["TEST_ONLY-assignment", i]), owner_digest: accessDigest(["TEST_ONLY-owner", i]),
      economic_account_ref: { state: "PROVIDED", ref: m.economic }, ownership_partition_ref: { state: "PROVIDED", ref: m.ownership } },
    cost_layers: { included: ["TEST_ONLY:fees"], missing: [] }, restatement: { relation: "ORIGINAL", original_ref: null } }));
}
export const sharedFinancialTestFactory = (selection: unknown = financialTestSelection()) => {
  const prepared = prepareManagerEconomicSourceFactory(selection);
  if (prepared.state !== "PREPARED_PROPOSAL") throw new Error("TEST_ONLY_SELECTION_INVALID");
  return prepared;
};
/** Proposed DTO compatibility only: PARTIAL is null, never the known subtotal.
 * PROVISIONAL explicitly avoids claiming accepted financial source confidence. */
export function financialTestMetric(reduction: EconomicSourceReduction): ManagerMetric {
  return managerMetric.parse({ value: reduction.value, unit: "MONEY", currency: "USDT", basis: "TEST_ONLY:all-time-net",
    window: null, denominator: null, methodology_ref: "TEST_ONLY:source-net-method",
    availability: reduction.state === "COMPLETE" ? "AVAILABLE" : reduction.state === "PARTIAL" ? "PARTIAL" : "UNAVAILABLE",
    reason_code: reduction.reason_codes[0] ?? null,
    quality: { completeness: reduction.state === "COMPLETE" ? "COMPLETE" : "PARTIAL", freshness: "FRESH", reasons: reduction.reason_codes },
    source_confidence: "PROVISIONAL", provenance_refs: [reduction.economic_set_digest ?? "TEST_ONLY:not-published"],
    calculation_revision: reduction.reducer_revision, policy_revision: "TEST_ONLY:explicit-source-policy" });
}

export async function financialIntegrationFixture(options: { full?: boolean; fields?: string[] } = {}) {
  const authority = productReadFixture({ full: options.full ?? true, fields: options.fields ?? [...BUSINESS_READ_FIELDS] });
  const tuples = FINANCIAL_TEST_MAPPINGS.map(m => ({ ...m.tuple }));
  const document = (rows: EconomicProvenRow[] = financialTestRows()): ManagerModelDocument => {
    const reduction = sharedFinancialTestFactory().dataset(rows);
    if (reduction.state !== "COMPLETE") throw new Error("TEST_ONLY_UNPROVEN_NUMERIC_MAPPING_REFUSED");
    // This lookup is an EXPLICIT synthetic mapping table. Do not copy it into
    // production or derive any of these economic refs from a tuple/account ID.
    const unique = new Map(rows.map(row => [JSON.stringify(row.source_identity), row]));
    return { schema_version: "portal.execution.manager-model-input.v1", workspace_id: authority.principal.workspaceId,
      environment: "paper", profile_id: authority.config.EXECUTION_EDGE_PAPER_PROFILE_ID, qualification: "TEST_ONLY",
      family_id: "alpha_fleet_overview", revision: "TEST_ONLY:financial-r1", supersedes_revision: null,
      source_epoch: "TEST_ONLY:financial-epoch", source_sequence: "1", projection_generation: "TEST_ONLY:financial-generation",
      catalogue_digest: EXECUTION_PUBLICATION_CATALOGUE.source_catalogue_digest, source_set_digest: accessDigest(tuples),
      as_of_ms: T - 100, recorded_through_ms: T - 50, facts_through_ms: T - 100, observed_at_ms: T,
      source_quality: { completeness: "COMPLETE", freshness: "FRESH", reasons: [] },
      members: FINANCIAL_TEST_MAPPINGS.map((m, i) => ({ tuple: { ...m.tuple }, stage: "PAPER", name: `TEST_ONLY:member-${i}`,
        owner_user_id: "TEST_ONLY:research-owner", lifecycle: "ACTIVE", venue: "TEST_ONLY:venue", health: "HEALTHY", source_state: "FRESH",
        binding_ref: null, assignment_revision: "TEST_ONLY:assignment", owner_revision: "TEST_ONLY:owner", binding_revision: "TEST_ONLY:binding",
        valid_from_ms: T - 1_000, valid_to_ms: null })),
      facts: FINANCIAL_TEST_MAPPINGS.map(explicit => {
        const row = unique.get(JSON.stringify({ namespace: NS, source_id: explicit.source }));
        if (!row) throw new Error("TEST_ONLY_MAPPING_MISSING");
        const one = sharedFinancialTestFactory(financialTestSelection([FINANCIAL_TEST_MAPPINGS.indexOf(explicit)])).dataset([row]);
        return { fact_id: explicit.fact, revision: "TEST_ONLY:fact-r1", source_receipt_ref: "TEST_ONLY:NOT_SOURCE_AUTHORITY",
          tuple: { ...explicit.tuple }, partition: { economic_domain: "PAPER", currency: "USDT", basis: row.basis,
            native_profile_ref: "TEST_ONLY:financial-ledger", domain_proof_ref: "TEST_ONLY:not-economic-authority" },
          economic_account_ref: explicit.economic, ownership_partition_ref: explicit.ownership, kind: "net_pnl", metric: financialTestMetric(one),
          effective_at_ms: row.cut.effective_at_ms, recorded_at_ms: row.cut.recorded_through_ms,
          classification: "ECONOMIC", transfer_pair_ref: null, counterpart_portfolio_id: null };
      }) };
  };
  const doc = document();
  const binding = { dataset_id: doc.family_id, source_revision: doc.revision, projection_generation: doc.projection_generation,
    catalogue_revision: doc.catalogue_digest, window: null };
  const scope = await authority.scopes.authorize(authority.principal, { environment: "paper", profileId: doc.profile_id },
    { action: options.full === false ? "alpha.read" : "business.read_all", dataset: binding });
  const codec = new KeysetCursorCodec({ activeKeyId: "TEST_ONLY", keys: { TEST_ONLY: "TEST_ONLY-32-byte-financial-cursor-key" }, now: () => T / 1_000 });
  const dataset = (input: ManagerModelDocument = doc) => queryManagerModel(scope, input,
    { environment: "paper", group_by: ["venue"] }, codec, "FLEET");
  const contractsRoot = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../../packages/contracts");
  const publication = JSON.parse(readFileSync(resolve(contractsRoot,
    "fixtures/execution-dataset-publication.synthetic.valid.json"), "utf8")).value as DatasetPublication;
  const publicationShape = readPublication.parse(await authority.access.readPublication({
    workspace_id: doc.workspace_id, environment: doc.environment, profile_id: doc.profile_id, binding }));
  const prepare = (input: ManagerModelDocument = doc) => prepareManagerProjection(input, { ...publication,
    family_id: doc.family_id, catalogue_digest: doc.catalogue_digest, environment: doc.environment, profile_id: doc.profile_id,
    issued_at_ms: T - 1_000, expires_at_ms: T + 1_000, source_as_of_ms: doc.as_of_ms, observed_at_ms: T,
    history_capability: "CURRENT_ONLY", barrier: null, authority: { ...publicationShape, binding: { ...binding, source_revision: input.revision } } },
  { nowMs: T, allowTestOnly: true });
  return { authority, doc, document, scope, dataset, prepare };
}

/** SQL-call-order apparatus only. It does not emulate PostgreSQL isolation,
 * deferred constraints, durability or real restore; those need the existing PG gate. */
export function financialSqlTrace(options: { head?: ManagerModelHead | null; old_digest?: string | null; series_digest?: string | null;
  fail_sql?: RegExp; before_commit?: () => void } = {}) {
  const statements: Array<{ sql: string; values: unknown[] }> = [];
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    statements.push({ sql, values: structuredClone(values) });
    if (options.fail_sql?.test(sql)) throw new Error("TEST_ONLY_SQL_FAILURE");
    if (sql === "COMMIT") options.before_commit?.();
    if (sql.includes("FROM execution_manager_model_heads")) return { rows: options.head ? [options.head] : [] };
    if (sql.includes("SELECT payload_digest FROM execution_manager_model_revisions"))
      return { rows: options.old_digest ? [{ payload_digest: options.old_digest }] : [] };
    if (sql.includes("SELECT observation_digest FROM execution_manager_series_revisions"))
      return { rows: options.series_digest ? [{ observation_digest: options.series_digest }] : [] };
    if (sql.includes("SELECT count(*)::text")) return { rows: [{ count: "0" }] };
    return { rows: [] };
  });
  const release = vi.fn(), client = { query, release } as unknown as PoolClient;
  const pool = { connect: vi.fn(async () => client) } as unknown as Pool;
  return { statements, query, release, client, pool };
}
