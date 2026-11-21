/** PRIVATE test helper proposal. Intended test/helpers/manager-regime-history.ts.
 * SYNTHETIC TEST_ONLY receipts; actual loaders/worker/custody/scope minting.
 * No imported spec, PG/HTTP, fake READY, runtime or source qualification. */
import { createHmac } from "node:crypto";
import { expect, vi } from "vitest";
import { accessDigest } from "../../src/execution-v2/access-policy";
import type { ManagerModelDocument } from "../../src/execution-v2/manager-model.contract";
import { managerScorePopulationDigest } from "../../src/execution-v2/manager-score-publication";
import { ManagerScoreOriginalCustody, decodeRetainedManagerScoreOriginal }
  from "../../src/execution-v2/manager-score-original-custody";
import { restoreManagerRegimeOriginal } from "../../src/execution-v2/manager-regime-runtime";
import { ManagerRegimeHistoricalRuntime, decodeRetainedManagerRegimeRestatement }
  from "../../src/execution-v2/manager-regime-restatement-worker";
import type { ManagerRegimePublicProjectionInput, ManagerRegimePublicRefKind }
  from "../../src/execution-v2/manager-regime-history";
import { productReadFixture, OWN } from "../elp2-product-read.fixture";
import { calculate, clone, fixture as regimeFixture, limits } from "./manager-regime";
import { captureRegimeOriginals, regimeOriginalDocument, regimeOriginalLimits,
  regimeV4ExpectedRow, type CalculatedRegime } from "./manager-regime-original";

export const FIELDS = ["regime", "binding_id", "provenance_ref", "revision", "source_as_of", "as_of",
  "stage", "alpha_id", "alpha_version_id", "deployment_id"];
export const MAX_OUTPUT = 1_048_576, READ_AT = 20_000, K = 2_000, C = 2_001;
export type Product = ReturnType<typeof productReadFixture>;
export type SourceFixture = ReturnType<typeof regimeFixture>;
export type Member = SourceFixture["evidence"]["population"][number];
export type Tuple = typeof OWN;
export function tupleKey(t: Tuple): string {
  return JSON.stringify([t.alpha_id, t.alpha_version_id, t.portfolio_id, t.deployment_id, t.account_id]);
}
/** Source adaptation precedes ACTUAL loader/worker invocation. */
export function sourceFixture(product: Product, tuple: Tuple = OWN, environment: "paper" | "live" = "paper"): SourceFixture {
  const f = regimeFixture(environment), e = f.evidence;
  const profile = environment === "paper" ? product.config.EXECUTION_EDGE_PAPER_PROFILE_ID : product.config.EXECUTION_EDGE_LIVE_PROFILE_ID;
  const scope = { ...e.scope, workspace_id: product.principal.workspaceId, profile_id: profile };
  f.policy.scope = clone(scope); e.scope = clone(scope); e.partition.native_profile_ref = profile;
  const member: Member = { tuple: clone(tuple), stage: environment === "paper" ? "PAPER" : "LIVE" };
  e.population = [member];
  Object.assign(e.binding, { subject_id: tuple.alpha_id, alpha_id: tuple.alpha_id,
    alpha_version_id: tuple.alpha_version_id, partition_digest: accessDigest(e.partition),
    tuple_population_digest: managerScorePopulationDigest(e.population) });
  e.research_binding.alpha_id = tuple.alpha_id;
  for (const r of e.references) {
    r.population = [clone(member)]; r.binding.alpha_id = tuple.alpha_id;
    if (r.deployment) r.deployment.deployment_id = tuple.deployment_id;
  }
  return f;
}
/** Genuine first-write prepare must agree with the documented expected v4
 * row. This row is NOT asserted physically persisted by this pure helper. */
export function seal(items: readonly CalculatedRegime[], partial: boolean | "UNRESOLVED" = false) {
  const document = regimeOriginalDocument(items), template = document.members[0]!;
  const members = new Map<string, Member>();
  for (const h of items) for (const m of h.f.evidence.population)
    members.set(JSON.stringify([tupleKey(m.tuple), m.stage]), m);
  document.members = [...members.values()].map(m => ({ ...clone(template), ...clone(m) }));
  if (partial) document.source_quality = { completeness: partial === "UNRESOLVED" ? "UNRESOLVED" : "PARTIAL",
    freshness: "STALE", reasons: ["TEST_ONLY:source-partial"] };
  const custodies = captureRegimeOriginals(items, document), row = regimeV4ExpectedRow(document, custodies);
  const prepared = new ManagerScoreOriginalCustody(regimeOriginalLimits).prepare(document, [], undefined, custodies);
  expect(prepared).toEqual({ calculation_key: row.calculation_key, payload_digest: row.payload_digest });
  expect(decodeRetainedManagerScoreOriginal(document, row, regimeOriginalLimits.maximum_bundle_bytes).schema_version)
    .toBe("portal.execution.manager-score-original-inputs.v4");
  return { document, custodies, row };
}
export async function mint(product: Product, d: ManagerModelDocument) {
  return product.scopes.authorize(product.principal, { environment: d.environment, profileId: d.profile_id }, {
    action: "alpha.read", resource: { kind: "ALPHA", id: OWN.alpha_id },
    dataset: { dataset_id: d.family_id, source_revision: d.revision, projection_generation: d.projection_generation,
      catalogue_revision: d.catalogue_digest, window: null },
  });
}
export function refs(d: ManagerModelDocument) {
  return vi.fn((kind: ManagerRegimePublicRefKind, identity: string) => "sha256:" + createHmac("sha256",
    "TEST_ONLY_REGIME_PROJECTOR_HMAC_KEY_NOT_A_PRODUCTION_SECRET").update(JSON.stringify([
      "TEST_ONLY:regime-public-v1", d.workspace_id, d.environment, d.profile_id, d.revision,
      d.projection_generation, OWN.alpha_id, kind, identity,
    ])).digest("hex"));
}
export interface RegimePublicHistoryFixtureOptions {
  fields?: string[]; environment?: "paper" | "live"; change?: (f: SourceFixture) => void; partial?: boolean;
}
export async function prepared(options: RegimePublicHistoryFixtureOptions = {}) {
  const product = productReadFixture({ fields: options.fields ?? FIELDS }), environment = options.environment ?? "paper";
  // Source env alone never grants read. Live uses an explicitly current
  // synthetic grant in Live, evaluated by the actual read-scope issuer.
  if (environment === "live") for (const grant of product.context.grants) grant.environments = ["live"];
  const f = sourceFixture(product, OWN, environment); options.change?.(f);
  const calculated = await calculate(f), sealed = seal([calculated], options.partial);
  const scope = await mint(product, sealed.document), ref = refs(sealed.document);
  const input: ManagerRegimePublicProjectionInput = { document: sealed.document, originalRow: sealed.row,
    restated: null, scope, query: { surface: "ALPHA", id: OWN.alpha_id,
      stage_filter: [environment === "paper" ? "PAPER" : "LIVE"], economic_partition: clone(f.evidence.partition),
      revision_mode: "ORIGINAL_AS_PUBLISHED" }, read_at_ms: READ_AT, maximum_output_bytes: MAX_OUTPUT, ref };
  return { product, f, calculated, ...sealed, input, ref };
}
export type RegimePublicHistoryFixture = Awaited<ReturnType<typeof prepared>>;
/** Real worker+strict decoder, independent original pins. Safe for a BFF test
 * to stub only post-decoder snapshot delivery, explicitly NOT store proof. */
export async function historicalRevision(f: RegimePublicHistoryFixture) {
  const custody = f.custodies[0]!;
  const original = restoreManagerRegimeOriginal({ custody, expected_custody_digest: custody.custody_digest,
    document: f.document, maximum_bytes: regimeOriginalLimits.maximum_bundle_bytes }, () => C);
  expect(original.status).toBe("READY"); if (original.status !== "READY") throw new Error("TEST_ONLY_ORIGINAL_UNAVAILABLE");
  const worker = new ManagerRegimeHistoricalRuntime(limits, () => C);
  const result = await worker.calculateHistoricalRegime({ original: original.handle,
    original_custody_key: f.row.calculation_key, original_inputs_digest: f.row.payload.inputs_digest,
    policy: f.calculated.policy, knowledge_cutoff_ms: K, computed_at_ms: C, calculation_revision: "TEST_ONLY:history-projector-v1" });
  expect(result.status).toBe("READY"); if (result.status !== "READY") throw new Error(JSON.stringify(result));
  const h = result.publication;
  const decoded = decodeRetainedManagerRegimeRestatement(h, { original: original.handle,
    original_custody_key: f.row.calculation_key, original_inputs_digest: f.row.payload.inputs_digest,
    policy: h.policy, knowledge_cutoff_ms: K, computed_at_ms: C, calculation_revision: h.calculation_revision },
    regimeOriginalLimits.maximum_bundle_bytes, READ_AT);
  return { original: original.handle, worker, decoded };
}
