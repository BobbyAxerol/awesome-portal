/** PRIVATE PROPOSED focused component tests. NOT_RUN / NOT_APPLIED.
 * Intended destination: apps/control-api/test/elp206-regime-history-projector.spec.ts.
 * Real loaders/calculators/custody codecs + real server-minted read scopes;
 * all approval/source/publication receipts are explicitly SYNTHETIC TEST_ONLY.
 * No PostgreSQL, HTTP, current-source commissioning or runtime qualification. */
import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { managerScorePopulationDigest } from "../src/execution-v2/manager-score-publication";
import { projectManagerHistoricalRegime, type ManagerRegimePublicProjectionInput }
  from "../src/execution-v2/manager-regime-history";
import { managerHistoricalRegimeDetail, managerHistoricalRegimeEntry, managerHistoricalRegimeResult }
  from "../src/execution-v2/manager-regime-history.contract";
import { scopeReadPopulation } from "../src/execution-v2/read-scope";
import { productReadFixture, OWN, PEER, PRIVATE } from "./elp2-product-read.fixture";
import { calculate, clone, handles } from "./helpers/manager-regime";
import { FIELDS, MAX_OUTPUT, READ_AT, K, C, tupleKey, sourceFixture, seal, mint, refs, prepared, historicalRevision }
  from "./helpers/manager-regime-history";
function entries(input: ManagerRegimePublicProjectionInput) {
  const result = projectManagerHistoricalRegime(input);
  expect(result.availability).not.toBe("NOT_PUBLISHED");
  if (result.availability === "NOT_PUBLISHED") throw new Error("TEST_ONLY_EXPECTED_PUBLISHED_FACT");
  return result;
}
function failure(input: ManagerRegimePublicProjectionInput, code = "REGIME_PUBLIC_INPUT_INVALID") {
  let caught: unknown;
  try { projectManagerHistoricalRegime(input); } catch (error) { caught = error; }
  expect(caught).toMatchObject({ code, message: "The requested historical Regime projection is not available." });
}

describe("historical Regime pure public projector — SYNTHETIC actual-component proof, NOT runtime", () => {
  it("publishes a genuine original-v4 fact with exact clocks, closed wire and keyed refs", async () => {
    const f = await prepared(), view = entries(f.input), entry = view.entries[0]!;
    expect(managerHistoricalRegimeDetail.safeParse(view).success).toBe(true);
    expect(entry).toMatchObject({ binding: { subject_type: "alpha", subject_id: OWN.alpha_id },
      original: { economic_as_of_ms: 1000, evaluation_at_ms: 1000, feature_cutoff_ms: 1000,
        computed_at_ms: 1001, captured_at_ms: 1002 }, knowledge_cutoff_ms: null, computed_at_ms: 1001,
      derived_input_ref: null, feed_freshness: { availability: "NOT_PUBLISHED", reason_code: "ORIGINAL_FEED_FRESHNESS_NOT_RECORDED" },
      result: { status: "weak_support", qualification: "RUNTIME_APPROVED" } });
    expect(entry.publication_ref).toBe(entry.original_publication_ref);
    expect(entry.original_input_ref).not.toBe(f.custodies[0]!.original_input_digest);
    expect(f.ref).toHaveBeenCalled();
    const text = JSON.stringify(view);
    for (const privateValue of [f.row.calculation_key, f.row.payload.inputs_digest, f.custodies[0]!.custody_digest,
      f.document.source_set_digest, f.f.evidence.research_binding.run_id, f.f.evidence.research_binding.params_hash,
      f.f.evidence.references[0]!.source_locator, f.f.evidence.references[0]!.reference_window_id,
      f.f.evidence.references[0]!.manifest_hash, f.f.evidence.evidence_snapshot_id]) expect(text).not.toContain(privateValue);
    // FINAL9.8 deliberately public policy/method provenance is NOT over-redacted.
    expect(entry.result.policy_hash).toBe(f.calculated.publication.result.policy_hash);
    expect(entry.result.calibration_hash).toBe(f.calculated.publication.result.calibration_hash);
    expect(entries(f.input)).toEqual(view);
  });
  it.each(["supported", "weak_support", "stale", "unbound", "out_of_support", "insufficient_data"] as const)
    ("keeps intrinsic %s separate from publication availability", async status => {
      const f = await prepared({ environment: status === "supported" ? "live" : "paper", change: input => {
        if (status === "stale") Object.assign(input.evidence.current, { feature_cutoff_ms: 800, closed_through_ms: 800, available_at_ms: 800 });
        if (status === "unbound") input.evidence.references[0]!.deployment!.effective_from_ms = 50;
        if (status === "out_of_support") input.evidence.current.values[0]!.value = "1000";
        if (status === "insufficient_data") input.evidence.references = [];
      } });
      const view = entries(f.input);
      expect(f.calculated.publication.result.status).toBe(status);
      expect(view.availability).toBe("AVAILABLE"); expect(view.entries[0]!.result.status).toBe(status);
      expect(view.entries[0]!.result.neighbor_count).toBe(f.calculated.publication.result.neighbor_count);
    });
  it("only marks source incompleteness PARTIAL, not stale feed or weak support", async () => {
    const f = await prepared({ partial: true }), view = entries(f.input);
    expect(view.availability).toBe("PARTIAL"); expect(view.reason_codes).toEqual(["SOURCE_PROJECTION_PARTIAL"]);
    expect(view.entries[0]!.result.status).toBe("weak_support");
    expect(f.document.source_quality.freshness).toBe("STALE");
  });
  it.each(["regime", "binding_id", "provenance_ref", "revision", "source_as_of", "as_of", "stage", "alpha_id", "alpha_version_id"])
    ("requires exact current %s field authority before private decode/ref", async omitted => {
      const f = await prepared({ fields: FIELDS.filter(x => x !== omitted) });
      expect(projectManagerHistoricalRegime(f.input)).toEqual({ availability: "NOT_PUBLISHED", reason_code: "REGIME_TARGET_NOT_AVAILABLE" });
      expect(f.ref).not.toHaveBeenCalled();
    });
  it("does not inherit Regime authority from Score-only field access", async () => {
    const f = await prepared({ fields: [...FIELDS.filter(x => x !== "regime"), "score"] });
    expect(projectManagerHistoricalRegime(f.input)).toEqual({ availability: "NOT_PUBLISHED", reason_code: "REGIME_TARGET_NOT_AVAILABLE" });
    expect(f.ref).not.toHaveBeenCalled();
  });
  it("returns exactly the same bounded absence for hidden and unknown targets", async () => {
    const product = productReadFixture({ fields: FIELDS });
    const own = await calculate(sourceFixture(product)), peer = await calculate(sourceFixture(product, PEER));
    const sealed = seal([own, peer]), scope = await mint(product, sealed.document), ref = refs(sealed.document);
    const input: ManagerRegimePublicProjectionInput = { document: sealed.document, originalRow: sealed.row,
      restated: null, scope, query: { surface: "ALPHA", id: OWN.alpha_id, stage_filter: ["PAPER"],
        economic_partition: clone(own.f.evidence.partition), revision_mode: "ORIGINAL_AS_PUBLISHED" },
      read_at_ms: READ_AT, maximum_output_bytes: MAX_OUTPUT, ref };
    expect(sealed.document.members.some(m => m.tuple.alpha_id === PEER.alpha_id)).toBe(true);
    expect(scopeReadPopulation(scope).allowedTuples.some(t => t.alpha_id === PEER.alpha_id)).toBe(false);
    const hidden = projectManagerHistoricalRegime({ ...input, query: { ...input.query, id: PEER.alpha_id } });
    const unknown = projectManagerHistoricalRegime({ ...input, query: { ...input.query, id: "TEST_ONLY:unknown-alpha" } });
    expect(hidden).toEqual(unknown); expect(hidden).toEqual({ availability: "NOT_PUBLISHED", reason_code: "REGIME_TARGET_NOT_AVAILABLE" });
    expect(ref).not.toHaveBeenCalled();
  });
  it.each(["rejected", "non-neighbor"] as const)
    ("requires the whole target corpus even when its hidden reference is %s", async kind => {
      const product = productReadFixture({ fields: FIELDS }), source = sourceFixture(product), e = source.evidence;
      e.population = [{ tuple: clone(OWN), stage: "PAPER" }, { tuple: clone(PRIVATE), stage: "PAPER" }];
      e.binding.tuple_population_digest = managerScorePopulationDigest(e.population);
      e.references[0]!.population = [{ tuple: clone(PRIVATE), stage: "PAPER" }];
      e.references[0]!.deployment!.deployment_id = PRIVATE.deployment_id;
      if (kind === "non-neighbor") e.references[0]!.features.values[0]!.value = "1000";
      const h = await calculate(source, kind === "rejected" ? pin => {
        pin.references[0]!.reconciliation!.available_at_ms = 1002;
      } : undefined);
      expect(h.publication.result.neighbor_count).toBe(2);
      expect(h.publication.result.reference_window_ids).not.toContain(e.references[0]!.reference_window_id);
      const sealed = seal([h]);
      const allow = product.context.grants.find(g => g.action === "account.read")!;
      product.context.grants = [...product.context.grants,
        { ...clone(allow), grant_id: "TEST_ONLY-deny-private-corpus-account", effect: "DENY" }];
      const scope = await mint(product, sealed.document), ref = refs(sealed.document);
      expect(scopeReadPopulation(scope).allowedTuples.map(tupleKey)).toContain(tupleKey(OWN));
      expect(scopeReadPopulation(scope).allowedTuples.map(tupleKey)).not.toContain(tupleKey(PRIVATE));
      const input: ManagerRegimePublicProjectionInput = { document: sealed.document, originalRow: sealed.row,
        restated: null, scope, query: { surface: "ALPHA", id: OWN.alpha_id, stage_filter: ["PAPER"],
          economic_partition: clone(e.partition), revision_mode: "ORIGINAL_AS_PUBLISHED" }, read_at_ms: READ_AT,
        maximum_output_bytes: MAX_OUTPUT, ref };
      expect(projectManagerHistoricalRegime(input)).toEqual({ availability: "NOT_PUBLISHED", reason_code: "SELECTED_REGIME_REVISION_NOT_PUBLISHED" });
      // Missing RESTATED state is not disclosed before that same corpus gate.
      expect(projectManagerHistoricalRegime({ ...input, query: { ...input.query, revision_mode: "RESTATED_CURRENT_POLICY" } }))
        .toEqual({ availability: "NOT_PUBLISHED", reason_code: "SELECTED_REGIME_REVISION_NOT_PUBLISHED" });
      expect(ref).not.toHaveBeenCalled();
    });
  it.each(["PARTIAL", "UNRESOLVED"] as const)
    ("does not infer missing history from %s when complete candidate corpus is not authorized", async completeness => {
      const product = productReadFixture({ fields: FIELDS }), source = sourceFixture(product), e = source.evidence;
      e.population.push({ tuple: clone(PRIVATE), stage: "PAPER" });
      e.binding.tuple_population_digest = managerScorePopulationDigest(e.population);
      const h = await calculate(source), sealed = seal([h], completeness === "PARTIAL" ? true : "UNRESOLVED");
      const allow = product.context.grants.find(g => g.action === "account.read")!;
      product.context.grants = [...product.context.grants,
        { ...clone(allow), grant_id: "TEST_ONLY-deny-private-corpus-account", effect: "DENY" }];
      const scope = await mint(product, sealed.document), ref = refs(sealed.document);
      const input: ManagerRegimePublicProjectionInput = { document: sealed.document, originalRow: sealed.row,
        restated: null, scope, query: { surface: "ALPHA", id: OWN.alpha_id, stage_filter: ["PAPER"],
          economic_partition: clone(e.partition), revision_mode: "ORIGINAL_AS_PUBLISHED" },
        read_at_ms: READ_AT, maximum_output_bytes: MAX_OUTPUT, ref };
      for (const revision_mode of ["ORIGINAL_AS_PUBLISHED", "RESTATED_CURRENT_POLICY"] as const)
        expect(projectManagerHistoricalRegime({ ...input, query: { ...input.query, revision_mode } }))
          .toEqual({ availability: "NOT_PUBLISHED", reason_code: "REGIME_ORIGINAL_CORPUS_AUTHORITY_NOT_RETAINED" });
      expect(ref).not.toHaveBeenCalled();
    });
  it("rejects foreign reference population in the actual source loader, never by inventing a READY fixture", () => {
    const product = productReadFixture({ fields: FIELDS }), f = sourceFixture(product);
    f.evidence.references[0]!.population = [{ tuple: clone(PEER), stage: "PAPER" }];
    expect(() => handles(f)).toThrow(/REGIME_REFERENCE_POPULATION_OR_BINDING_MISMATCH/);
  });
  it("does not require unrelated target permissions to disclose an authorized candidate", async () => {
    const product = productReadFixture({ fields: FIELDS });
    const own = await calculate(sourceFixture(product)), peer = await calculate(sourceFixture(product, PEER));
    const sealed = seal([own, peer]), scope = await mint(product, sealed.document), ref = refs(sealed.document);
    const view = entries({ document: sealed.document, originalRow: sealed.row, restated: null, scope,
      query: { surface: "ALPHA", id: OWN.alpha_id, stage_filter: ["PAPER"], economic_partition: clone(own.f.evidence.partition),
        revision_mode: "ORIGINAL_AS_PUBLISHED" }, read_at_ms: READ_AT, maximum_output_bytes: MAX_OUTPUT, ref });
    expect(view.entries).toHaveLength(1); expect(view.entries[0]!.binding.subject_id).toBe(OWN.alpha_id);
    expect(JSON.stringify(view)).not.toContain(PEER.alpha_id);
    const usedIdentities = ref.mock.calls.map(([, identity]) => identity);
    expect(usedIdentities).not.toContain(sealed.custodies[1]!.original_input_digest);
    expect(usedIdentities).not.toContain(sealed.custodies[1]!.original_publication_digest);
  });
  it("describes genuinely missing legacy corpus without numeric/count/ref inventions", async () => {
    const f = await prepared();
    expect(projectManagerHistoricalRegime({ ...f.input, originalRow: null })).toEqual({ availability: "NOT_PUBLISHED",
      reason_code: "REGIME_ORIGINAL_CORPUS_AUTHORITY_NOT_RETAINED" });
    expect(f.ref).not.toHaveBeenCalled();
  });
  it("reports missing independent RESTATED only after complete target corpus authorization", async () => {
    const f = await prepared();
    expect(projectManagerHistoricalRegime({ ...f.input, query: { ...f.input.query, revision_mode: "RESTATED_CURRENT_POLICY" } }))
      .toEqual({ availability: "NOT_PUBLISHED", reason_code: "INDEPENDENT_REGIME_RESTATEMENT_NOT_PUBLISHED" });
    expect(f.ref).not.toHaveBeenCalled();
  });
  it("reads a real decoded historical worker result after policy expiry without re-compute/current resurrection", async () => {
    const f = await prepared(), { worker, decoded } = await historicalRevision(f);
    const calculateAgain = vi.spyOn(worker, "calculateHistoricalRegime");
    const view = entries({ ...f.input, restated: [decoded], query: { ...f.input.query, revision_mode: "RESTATED_CURRENT_POLICY" } });
    expect(view.entries[0]).toMatchObject({ knowledge_cutoff_ms: K, computed_at_ms: C,
      original: { economic_as_of_ms: 1000, evaluation_at_ms: 1000, feature_cutoff_ms: 1000, computed_at_ms: 1001, captured_at_ms: 1002 },
      feed_freshness: { availability: "AVAILABLE", checked_at_ms: C, status: "HISTORICAL_OUTSIDE_CURRENT_FEED_FRESHNESS",
        source_age_ms: C - 1000, feature_age_ms: C - 1000 }, result: { status: "weak_support" } });
    expect(view.entries[0]!.derived_input_ref).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(view.entries[0]!.publication_ref).not.toBe(view.entries[0]!.original_publication_ref);
    expect(calculateAgain).not.toHaveBeenCalled();
  });
  it("keeps exact source-generation/dataset/environment and trusted read-clock fences", async () => {
    const f = await prepared();
    for (const document of [{ ...clone(f.document), projection_generation: "TEST_ONLY:wrong-generation" },
      { ...clone(f.document), workspace_id: "TEST_ONLY:foreign-workspace" },
      { ...clone(f.document), profile_id: "TEST_ONLY:other-profile" }]) failure({ ...f.input, document });
    failure({ ...f.input, read_at_ms: 1000 });
    failure({ ...f.input, query: { ...f.input.query, stage_filter: ["LIVE"] } });
    expect(f.ref).not.toHaveBeenCalled();
  });
  it("cannot treat a forged scoped-looking plain object as current authority", async () => {
    const f = await prepared(); failure({ ...f.input, scope: { ...f.input.scope } }); expect(f.ref).not.toHaveBeenCalled();
  });
  it("requires deployment-specific field authority for a genuine deployment candidate", async () => {
    const f = await prepared({ fields: FIELDS.filter(x => x !== "deployment_id"), change: source => {
      source.evidence.binding.subject_type = "deployment"; source.evidence.binding.subject_id = OWN.deployment_id;
    } });
    expect(projectManagerHistoricalRegime({ ...f.input, query: { ...f.input.query, surface: "DEPLOYMENT", id: OWN.deployment_id } }))
      .toEqual({ availability: "NOT_PUBLISHED", reason_code: "REGIME_TARGET_NOT_AVAILABLE" });
    expect(f.ref).not.toHaveBeenCalled();
  });
  it("rejects root/custody own-data accessors, Proxies, cycles and sparse data without invoking traps", async () => {
    const f = await prepared(); let calls = 0;
    const getter = Object.defineProperty({ ...f.input }, "read_at_ms", { enumerable: true, get() { calls++; return READ_AT; } });
    failure(getter); expect(calls).toBe(0);
    const proxy = new Proxy(f.input, { getPrototypeOf() { calls++; throw new Error("PRIVATE_PROXY"); }, get() { calls++; throw new Error("PRIVATE_PROXY"); } });
    failure(proxy); expect(calls).toBe(0);
    const revoked = Proxy.revocable(f.input, {}); revoked.revoke(); failure(revoked.proxy); expect(calls).toBe(0);
    const row = { ...f.row, payload: Object.defineProperty({}, "private", { enumerable: true, get() { calls++; return "PRIVATE"; } }) };
    failure({ ...f.input, originalRow: row }); expect(calls).toBe(0);
    const cycle: Record<string, unknown> = {}; cycle.self = cycle;
    failure({ ...f.input, originalRow: { ...f.row, payload: cycle } });
    failure({ ...f.input, originalRow: { ...f.row, payload: { invalid: Number.NaN } } });
    failure({ ...f.input, originalRow: { ...f.row, payload: new Array(1) } });
    expect(f.ref).not.toHaveBeenCalled();
  });
  it("enforces exact input/output caps without silent truncation, including absence envelopes", async () => {
    const f = await prepared();
    failure({ ...f.input, originalRow: { ...f.row, payload: { too_large: "x".repeat(8 * 1024 * 1024 + 1) } } }, "REGIME_PUBLIC_BOUND");
    failure({ ...f.input, maximum_output_bytes: 1 }, "REGIME_PUBLIC_BOUND");
    failure({ ...f.input, originalRow: null, maximum_output_bytes: 1 }, "REGIME_PUBLIC_BOUND");
    for (const invalid of [0, MAX_OUTPUT + 1, Number.NaN, 1.5]) failure({ ...f.input, maximum_output_bytes: invalid });
  });
  it("sanitizes ref failures, rejects proxy-valued refs without traps, and never follows thrown Proxy prototypes", async () => {
    const f = await prepared(); let calls = 0;
    const proxy = new Proxy({}, { getPrototypeOf() { calls++; throw new Error("PRIVATE_PROTO"); }, get() { calls++; throw new Error("PRIVATE_GET"); } });
    failure({ ...f.input, ref: () => proxy as unknown as string }); expect(calls).toBe(0);
    failure({ ...f.input, ref: () => { throw new Error("PRIVATE_LOCATOR_OR_TOKEN"); } });
    // Regression for independently reported catch-boundary defect. Requires
    // parent's descriptor-safe correction; not a green claim for frozen draft.
    failure({ ...f.input, ref: () => { throw Object.create(proxy); } }); expect(calls).toBe(0);
    const forged = Object.defineProperty({}, "code", { enumerable: true,
      get() { calls++; return "REGIME_PUBLIC_BOUND"; } });
    failure({ ...f.input, ref: () => { throw forged; } }); expect(calls).toBe(0);
    failure({ ...f.input, ref: () => "sha256:" + "a".repeat(64) + "\n" });
  });
  it("enforces closed public schemas and causal clock relationships without raw private fallbacks", async () => {
    const f = await prepared(), view = entries(f.input), entry = view.entries[0]!;
    expect(managerHistoricalRegimeDetail.safeParse({ ...view, hidden_total: 1 }).success).toBe(false);
    expect(managerHistoricalRegimeEntry.safeParse({ ...entry, source_locator: "PRIVATE" }).success).toBe(false);
    expect(managerHistoricalRegimeResult.safeParse({ ...entry.result, reasons: [{ source_locator: "PRIVATE" }] }).success).toBe(false);
    expect(managerHistoricalRegimeEntry.safeParse({ ...entry, original: { ...entry.original, evaluation_at_ms: 1001 } }).success).toBe(false);
    expect(managerHistoricalRegimeEntry.safeParse({ ...entry, knowledge_cutoff_ms: K }).success).toBe(false);
    expect(managerHistoricalRegimeResult.safeParse({ ...entry.result, nearest_distance: "0\n" }).success).toBe(false);
  });
});
