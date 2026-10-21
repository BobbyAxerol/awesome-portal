/**
 * BE-P21 (ELP2-10 C5): the pure, strict, DARK economic-source reducer.
 *
 * STATUS: PROPOSAL_NOT_A_PRODUCER_MAPPING; NOT WIRED into any runtime (see manager-economic-source.contract.ts). It implements PM's
 * returned rule set (PM_OWNER_ACK_AND_NET_PNL_RETURN_2026-10-21, C5) and nothing else, over exact decimals (BigInt through
 * `sumExactDecimals`), with no float, no FX, no rebase, no interpolation and no carry-forward.
 *
 * One reduction = ONE comparability tuple (metric, environment, currency, basis, cut, valuation cutoff, window, revisions,
 * restatement relation) + ONE expected census. Verdict precedence is fixed and total:
 *
 *   1. PROOF GATE  -> UNAVAILABLE   any legacy / unproven row, any source id in a namespace the caller does not trust, or no
 *                                   published census. Nothing else is evaluated: an unproven set has no duplicate / overlap verdict,
 *                                   and "same physical account" is never a substitute for a source id.
 *   2. REFUSAL     -> REFUSED       a comparability key differs from the expectation (currency / basis / environment / cut / window /
 *                                   revision / metric / restatement relation); a source outside the census; the same source id with
 *                                   changed content (REPORT_SOURCE_CONFLICT); different ids whose leaves overlap (REPORT_SOURCE_OVERLAP).
 *   3. COVERAGE    -> PARTIAL       a census source with no row, a row with no valuation proof, a row with no ownership proof, a row
 *                                   stating missing cost layers. PARTIAL carries NO number (not a subtotal, never zero).
 *   4. otherwise   -> COMPLETE      the exact decimal sum of each trusted, immutable source counted once.
 *
 * Why a cumulative snapshot can never be summed across time: the expectation holds exactly one cut and every row must equal it, so a
 * row from another cut is a REFUSED mismatch. A caller needing a history calls once per cut and keeps the answers apart.
 *
 * HOW A DATASET AND A SERIES BOTH CALL IT (design only; neither is edited by this change):
 *   - dataset reader (`managerPartitionTotals`): per (subject population, economic partition, metric) build ONE input whose
 *     expectation is the document cut + the partition's currency/basis, whose rows are the SOURCE_VERIFIED facts of that population,
 *     and whose census is the producer's expected population for that cut; map the output onto the metric (`COMPLETE` -> AVAILABLE
 *     with `value`; `PARTIAL` -> PARTIAL; `UNAVAILABLE` / `REFUSED` -> UNAVAILABLE with `reason_codes[0]`; `value` is null otherwise).
 *   - series writer (`deriveSeriesObservations`): the same call with the same builder, once per observation instant, with that
 *     instant as `cut` / `valuation_cutoff_ms`; the observation's reason_code is the same `reason_codes[0]`, and its `input_digest`
 *     can fold `economic_set_digest`. Because both sides call this one function through one input builder, the economic set of a
 *     stored point and of the value the reader serves cannot diverge; `economic_set_digest` is the cheap parity check between them.
 *   - the output is never summed across calls, and never turned into a zero.
 * Integration needs (a) the accepted producer mapping, (b) one-writer scheduling for manager-model.ts / manager-series-*.ts, and
 * (c) a contract change only if the output is published (then the generators run). None exists yet.
 */
import { accessDigest } from "./access-digest";
import { sumExactDecimals } from "../research/exact-decimal";
import { economicSourceReduction, economicSourceReductionInput, MANAGER_ECONOMIC_SOURCE_REDUCER_REVISION,
  MANAGER_ECONOMIC_SOURCE_STATUS, MAX_ECONOMIC_FINDINGS, type EconomicComparabilityField, type EconomicExpectation,
  type EconomicFinding, type EconomicFindingCode, type EconomicProvenRow, type EconomicSourceReduction } from "./manager-economic-source.contract";

const cmp = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const idKey = (namespace: string, sourceId: string) => JSON.stringify([namespace, sourceId]);
const REFUSAL_CODES: ReadonlySet<EconomicFindingCode> = new Set(["REPORT_SOURCE_CONFLICT", "REPORT_SOURCE_OVERLAP",
  "ECONOMIC_COMPARABILITY_MISMATCH", "ECONOMIC_SOURCE_OUTSIDE_CENSUS", "ECONOMIC_SOURCE_INPUT_INVALID"]);

/** Findings are deduplicated, ordered canonically and bounded; the bound is stated (`findings_truncated`), never silent. */
class Findings {
  private readonly items = new Map<string, EconomicFinding>();
  add(code: EconomicFindingCode, namespace: string | null = null, sourceId: string | null = null, detail: string | null = null) {
    const finding: EconomicFinding = { code, namespace, source_id: sourceId, detail: detail === null ? null : detail.slice(0, 512) };
    this.items.set(JSON.stringify([code, namespace, sourceId, finding.detail]), finding);
  }
  get size() { return this.items.size; }
  codes(): EconomicFindingCode[] { return [...new Set([...this.items.values()].map(f => f.code))].sort(cmp); }
  hasAny(codes: ReadonlySet<EconomicFindingCode>) { return [...this.items.values()].some(f => codes.has(f.code)); }
  list() {
    const all = [...this.items.values()].sort((a, b) => cmp(a.code, b.code) || cmp(a.namespace ?? "", b.namespace ?? "") ||
      cmp(a.source_id ?? "", b.source_id ?? "") || cmp(a.detail ?? "", b.detail ?? ""));
    return { findings: all.slice(0, MAX_ECONOMIC_FINDINGS), truncated: all.length > MAX_ECONOMIC_FINDINGS };
  }
}

/** The immutable CONTENT of a row: everything the source states, except the Portal-side fact id and the physical-account hint (neither
 * is evidence of anything). Leaves and cost layers are sets; the amount is its canonical exact decimal ("1.0" and "1" are equal). */
export function economicRowContentDigest(row: EconomicProvenRow): string {
  const { portal_fact_id: _fact, physical_account_ref: _hint, ...content } = row;
  return accessDigest({ ...content, amount: sumExactDecimals([row.amount]), leaves: [...row.leaves].sort(cmp),
    cost_layers: { included: [...row.cost_layers.included].sort(cmp), missing: [...row.cost_layers.missing].sort(cmp) } });
}

function mismatches(row: EconomicProvenRow, want: EconomicExpectation): EconomicComparabilityField[] {
  const out: EconomicComparabilityField[] = [];
  const check = (field: EconomicComparabilityField, equal: boolean) => { if (!equal) out.push(field); };
  check("metric", row.metric === want.metric); check("environment", row.environment === want.environment);
  check("currency", row.currency === want.currency); check("basis", row.basis === want.basis);
  check("cut.effective_at_ms", row.cut.effective_at_ms === want.cut.effective_at_ms);
  check("cut.recorded_through_ms", row.cut.recorded_through_ms === want.cut.recorded_through_ms);
  check("window", JSON.stringify(row.window) === JSON.stringify(want.window));
  check("economic_revision", row.economic_revision === want.revisions.economic);
  check("cashflow_revision", row.cashflow_revision === want.revisions.cashflow);
  check("restatement_relation", row.restatement.relation === want.restatement_relation);
  // An absent valuation / ownership proof is not a mismatch: it is missing evidence (PARTIAL below).
  if (row.valuation) {
    check("valuation_cutoff_ms", row.valuation.valuation_cutoff_ms === want.valuation_cutoff_ms);
    check("valuation_revision", row.valuation.valuation_revision === want.revisions.valuation);
  }
  if (row.ownership) check("ownership_revision", row.ownership.ownership_revision === want.revisions.ownership);
  return out;
}

type Result = Omit<EconomicSourceReduction, "schema_version" | "status" | "reducer_revision" | "reason_codes" | "findings" | "findings_truncated">;
function emit(result: Result, findings: Findings): EconomicSourceReduction {
  const { findings: list, truncated } = findings.list();
  return economicSourceReduction.parse({ schema_version: "portal.execution.manager-economic-source-reduction.proposal.v1",
    status: MANAGER_ECONOMIC_SOURCE_STATUS, reducer_revision: MANAGER_ECONOMIC_SOURCE_REDUCER_REVISION, ...result,
    reason_codes: findings.codes(), findings: list, findings_truncated: truncated });
}
const NONE: Pick<Result, "value" | "sources" | "collapsed_duplicate_count" | "economic_set_digest"> =
  { value: null, sources: [], collapsed_duplicate_count: 0, economic_set_digest: null };

/** Total and pure: it never throws on bad input (that is a REFUSED verdict) and never reads a clock, a database or the environment.
 * The same input in any row order yields a byte-identical output; repeating rows that are already present changes nothing but the
 * audit list of Portal fact ids. */
export function reduceEconomicSource(raw: unknown): EconomicSourceReduction {
  const findings = new Findings();
  const parsed = economicSourceReductionInput.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    findings.add("ECONOMIC_SOURCE_INPUT_INVALID", null, null, `${issue.path.join(".")}:${issue.code}`);
    return emit({ state: "REFUSED", ...NONE, expectation: null, census_ref: null }, findings);
  }
  const { expectation, trust_policy: trust, census, rows } = parsed.data;
  const base = { expectation, census_ref: census?.census_ref ?? null };

  // 1. PROOF GATE.
  if (census === null) findings.add("ECONOMIC_SOURCE_CENSUS_NOT_PUBLISHED");
  const trusted = new Set(trust.accepted_namespaces), proven: EconomicProvenRow[] = [];
  for (const row of rows) {
    if (row.evidence === "LEGACY_UNPROVEN") { findings.add("ECONOMIC_SOURCE_LEGACY_UNPROVEN", null, null, row.portal_fact_id); continue; }
    if (!trusted.has(row.source_identity.namespace))
      findings.add("ECONOMIC_SOURCE_ID_NOT_TRUSTED", row.source_identity.namespace, row.source_identity.source_id);
    proven.push(row);
  }
  if (findings.size) return emit({ state: "UNAVAILABLE", ...NONE, ...base }, findings);

  // 2. REFUSAL. Group by trusted identity; content decides "the same row" versus "a conflict".
  const expected = new Set(census!.expected_sources.map(s => idKey(s.namespace, s.source_id)));
  const groups = new Map<string, { namespace: string; source_id: string; rows: EconomicProvenRow[]; digests: Set<string> }>();
  for (const row of proven) {
    const { namespace, source_id } = row.source_identity, key = idKey(namespace, source_id);
    const group = groups.get(key) ?? { namespace, source_id, rows: [], digests: new Set<string>() };
    group.rows.push(row); group.digests.add(economicRowContentDigest(row)); groups.set(key, group);
    if (!expected.has(key)) findings.add("ECONOMIC_SOURCE_OUTSIDE_CENSUS", namespace, source_id);
    for (const field of mismatches(row, expectation)) findings.add("ECONOMIC_COMPARABILITY_MISMATCH", namespace, source_id, field);
  }
  for (const g of groups.values()) if (g.digests.size > 1) findings.add("REPORT_SOURCE_CONFLICT", g.namespace, g.source_id);
  // Overlap is decided on leaves alone. Each leaf's sharers are ordered, and every later sharer is reported against the first one.
  const sharers = new Map<string, Set<string>>();
  for (const [key, g] of groups) for (const row of g.rows) for (const leaf of row.leaves) {
    const set = sharers.get(leaf) ?? new Set<string>(); set.add(key); sharers.set(leaf, set);
  }
  for (const keys of sharers.values()) {
    if (keys.size < 2) continue;
    const ordered = [...keys].sort(cmp), first = groups.get(ordered[0])!;
    for (const other of ordered.slice(1)) {
      const g = groups.get(other)!;
      findings.add("REPORT_SOURCE_OVERLAP", first.namespace, first.source_id, JSON.stringify([g.namespace, g.source_id]));
    }
  }
  if (findings.hasAny(REFUSAL_CODES)) return emit({ state: "REFUSED", ...NONE, ...base }, findings);

  // 3. COVERAGE. Every group is now one immutable content, so its first row speaks for all of them.
  const sources = [...groups.values()].sort((a, b) => cmp(idKey(a.namespace, a.source_id), idKey(b.namespace, b.source_id)))
    .map(g => ({ namespace: g.namespace, source_id: g.source_id, content_digest: [...g.digests][0], row: g.rows[0],
      portal_fact_ids: [...new Set(g.rows.map(r => r.portal_fact_id))].sort(cmp) }));
  const collapsed = proven.length - sources.length;
  for (const s of census!.expected_sources) if (!groups.has(idKey(s.namespace, s.source_id)))
    findings.add("ECONOMIC_SOURCE_MISSING", s.namespace, s.source_id);
  for (const s of sources) {
    if (s.row.valuation === null) findings.add("ECONOMIC_VALUATION_MISSING", s.namespace, s.source_id);
    if (s.row.ownership === null) findings.add("ECONOMIC_OWNERSHIP_MISSING", s.namespace, s.source_id);
    if (s.row.cost_layers.missing.length) findings.add("ECONOMIC_COST_LAYERS_MISSING", s.namespace, s.source_id, [...s.row.cost_layers.missing].sort(cmp).join(","));
  }
  const counted = sources.map(({ namespace, source_id, content_digest, portal_fact_ids }) => ({ namespace, source_id, content_digest, portal_fact_ids }));
  const economic_set_digest = accessDigest({ expectation, census_ref: census!.census_ref,
    sources: counted.map(s => [s.namespace, s.source_id, s.content_digest]) });
  if (findings.size) return emit({ state: "PARTIAL", value: null, sources: counted, collapsed_duplicate_count: collapsed, economic_set_digest, ...base }, findings);

  // 4. COMPLETE: the only place a number is produced. Exact BigInt decimal sum, one term per counted source.
  const value = sumExactDecimals(sources.map(s => s.row.amount));
  return emit({ state: "COMPLETE", value, sources: counted, collapsed_duplicate_count: collapsed, economic_set_digest, ...base }, findings);
}
