/** CORE-04 synthetic proposal preparation only. No source acceptance, DB,
 * transport, runtime selection, real economic IDs or financial publication. */
import { describe, expect, it } from "vitest";
import { economicSourceReductionInput, type EconomicProvenRow }
  from "../src/execution-v2/manager-economic-source.contract";
import { buildManagerEconomicSourceInput, prepareManagerEconomicSourceFactory }
  from "../src/execution-v2/manager-economic-source-input";

const T = 1_800_000_000_000, NS = "TEST_ONLY:source-namespace", HASH = `sha256:${"a".repeat(64)}`;
const source = (id: string) => ({ namespace: NS, source_id: `TEST_ONLY:source-${id}` });
const selection = () => ({ expectation: { metric: "NET_PNL" as const, environment: "paper" as const,
  currency: "TEST_ONLY:USD", basis: "TEST_ONLY:net-all-time", cut: { effective_at_ms: T, recorded_through_ms: T + 1 },
  valuation_cutoff_ms: T, window: null,
  revisions: { economic: "TEST_ONLY:e1", cashflow: "TEST_ONLY:c1", valuation: "TEST_ONLY:v1", ownership: "TEST_ONLY:o1" },
  restatement_relation: "ORIGINAL" as const },
  trust_policy: { policy_ref: "TEST_ONLY:explicit-proposal", accepted_namespaces: [NS] },
  census: { census_ref: "TEST_ONLY:census", expected_sources: [source("a"), source("b")] } });
const row = (id: string, amount = "14"): EconomicProvenRow => ({ evidence: "PROVEN_SOURCE_ROW",
  portal_fact_id: `TEST_ONLY:fact-${id}`, physical_account_ref: "TEST_ONLY:shared-physical-hint",
  source_identity: source(id), leaves: [`TEST_ONLY:leaf-${id}`], metric: "NET_PNL", amount,
  environment: "paper", currency: "TEST_ONLY:USD", basis: "TEST_ONLY:net-all-time",
  cut: { effective_at_ms: T, recorded_through_ms: T + 1 }, window: null,
  economic_revision: "TEST_ONLY:e1", cashflow_revision: "TEST_ONLY:c1",
  valuation: { valuation_cutoff_ms: T, valuation_revision: "TEST_ONLY:v1" },
  ownership: { ownership_revision: "TEST_ONLY:o1", attribution_ref: `TEST_ONLY:attribution-${id}`,
    assignment_digest: HASH, owner_digest: HASH,
    economic_account_ref: { state: "ABSENT", reason_code: "NO_ACCEPTED_BRIDGE" },
    ownership_partition_ref: { state: "ABSENT", reason_code: "NOT_PUBLISHED_BY_SOURCE" } },
  cost_layers: { included: ["TEST_ONLY:fees"], missing: [] }, restatement: { relation: "ORIGINAL", original_ref: null } });
const factory = (input: unknown = selection()) => {
  const result = prepareManagerEconomicSourceFactory(input);
  if (result.state !== "PREPARED_PROPOSAL") throw Error("TEST_ONLY invalid selection fixture");
  return result;
};

describe("dark shared economic-source builder", () => {
  it("builds the existing strict proposal schema, retaining exact amounts and typed absent bridges", () => {
    const rows = [row("a", "14.000"), row("b")], original = JSON.stringify(rows);
    const built = buildManagerEconomicSourceInput(selection(), rows);
    expect(built.state).toBe("BUILT_PROPOSAL");
    if (built.state !== "BUILT_PROPOSAL") return;
    expect(economicSourceReductionInput.safeParse(built.input).success).toBe(true);
    expect(built.status).toBe("PROPOSAL_NOT_A_PRODUCER_MAPPING");
    expect(built.input.rows[0]).toEqual(rows[0]);
    expect(JSON.stringify(rows)).toBe(original);
    expect(Object.isFrozen(built.input.rows)).toBe(true);
    expect(Object.isFrozen(rows)).toBe(false);
  });

  it("uses the same actual builder/reducer for dataset and series, independent of row order", () => {
    const prepared = factory(), rows = [row("a"), row("b", "-1.25")];
    expect(prepared.dataset).toBe(prepared.series);
    const dataset = prepared.dataset(rows), series = prepared.series([...rows].reverse());
    expect(dataset).toEqual(series);
    expect(dataset).toMatchObject({ state: "COMPLETE", value: "12.75", status: "PROPOSAL_NOT_A_PRODUCER_MAPPING" });
    expect(dataset.economic_set_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("detaches selection and rows: later caller mutation cannot replace a cut, census or proof", () => {
    const input = selection(), prepared = factory(input), rows = [row("a"), row("b")];
    const before = prepared.dataset(rows), built = buildManagerEconomicSourceInput(selection(), rows);
    input.expectation.cut.effective_at_ms++;
    input.trust_policy.accepted_namespaces.length = 0;
    input.census.expected_sources.length = 0;
    rows[0].leaves[0] = "TEST_ONLY:changed";
    if (built.state !== "BUILT_PROPOSAL") throw Error("TEST_ONLY invalid build fixture");
    expect((built.input.rows[0] as EconomicProvenRow).leaves).toEqual(["TEST_ONLY:leaf-a"]);
    expect(prepared.series([row("a"), row("b")])).toEqual(before);
  });

  it.each([
    ["changed content", () => [row("a"), { ...row("a"), amount: "15" }, row("b")], "REPORT_SOURCE_CONFLICT"],
    ["overlapping leaves", () => [row("a"), { ...row("b"), leaves: row("a").leaves }], "REPORT_SOURCE_OVERLAP"],
    ["foreign cut", () => [row("a"), { ...row("b"), cut: { effective_at_ms: T + 1, recorded_through_ms: T + 1 } }], "ECONOMIC_COMPARABILITY_MISMATCH"],
    ["unaccepted namespace", () => [row("a"), { ...row("b"), source_identity: { namespace: "TEST_ONLY:unaccepted", source_id: "TEST_ONLY:b" } }], "ECONOMIC_SOURCE_ID_NOT_TRUSTED"],
    ["missing expected source", () => [row("a")], "ECONOMIC_SOURCE_MISSING"],
    ["missing valuation", () => [row("a"), { ...row("b"), valuation: null }], "ECONOMIC_VALUATION_MISSING"],
    ["missing ownership", () => [row("a"), { ...row("b"), ownership: null }], "ECONOMIC_OWNERSHIP_MISSING"],
    ["missing cost layer", () => [row("a"), { ...row("b"), cost_layers: { included: [], missing: ["TEST_ONLY:fees"] } }], "ECONOMIC_COST_LAYERS_MISSING"],
  ] as const)("dataset/series preserve %s as typed absence/refusal, never zero", (_name, rows, code) => {
    const prepared = factory(), dataset = prepared.dataset(rows()), series = prepared.series(rows());
    expect(dataset).toEqual(series); expect(dataset.value).toBeNull(); expect(dataset.reason_codes).toContain(code);
  });

  it("collapses only exact trusted identities, not equal physical/account amounts or Portal IDs", () => {
    const prepared = factory(), a = row("a"), b = row("b");
    b.portal_fact_id = a.portal_fact_id;
    const result = prepared.dataset([a, b, { ...a, portal_fact_id: "TEST_ONLY:resent" }]);
    expect(result).toMatchObject({ state: "COMPLETE", value: "28", collapsed_duplicate_count: 1 });
    expect(result.sources).toHaveLength(2);
  });

  it("does not promote legacy rows or a missing census into accepted financial evidence", () => {
    const prepared = factory();
    const legacy = { evidence: "LEGACY_UNPROVEN", portal_fact_id: "TEST_ONLY:old", physical_account_ref: "TEST_ONLY:physical",
      amount: "28", currency: "TEST_ONLY:USD", basis: "TEST_ONLY:net-all-time" };
    expect(prepared.dataset([legacy])).toMatchObject({ state: "UNAVAILABLE", value: null });
    expect(prepared.dataset([legacy]).reason_codes).toContain("ECONOMIC_SOURCE_LEGACY_UNPROVEN");
    const noCensus = factory({ ...selection(), census: null }).series([row("a"), row("b")]);
    expect(noCensus).toMatchObject({ state: "UNAVAILABLE", value: null });
    expect(noCensus.reason_codes).toContain("ECONOMIC_SOURCE_CENSUS_NOT_PUBLISHED");
  });

  it("refuses RETURN, invented accepted flags, unknown producer columns and malformed scalar amounts", () => {
    for (const input of [{ ...selection(), accepted: true }, { ...selection(), authority: "TS" },
      { ...selection(), expectation: { ...selection().expectation, metric: "RETURN" } }])
      expect(prepareManagerEconomicSourceFactory(input)).toMatchObject({ state: "REFUSED", reason_code: "ECONOMIC_SOURCE_INPUT_INVALID" });
    for (const rows of [[{ ...row("a"), account_id: "TEST_ONLY:never-an-economic-id" }],
      [{ ...row("a"), amount: 14 }], [{ ...row("a"), source_identity: undefined }]]) {
      expect(buildManagerEconomicSourceInput(selection(), rows)).toMatchObject({ state: "REFUSED" });
      expect(factory().dataset(rows)).toMatchObject({ state: "REFUSED", value: null, reason_codes: ["ECONOMIC_SOURCE_INPUT_INVALID"] });
    }
  });
});
