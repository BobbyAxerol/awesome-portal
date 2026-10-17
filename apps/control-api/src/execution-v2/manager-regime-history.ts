/** Pure historical Regime projection for the named, current-authorized reader.
 * Internal caller supplies ACTUAL135 + immutable138 row and optional already
 * independently decoded worker outputs. This is NOT a browser parser, source
 * attestation, grant issuer, current-policy classifier or delivery fence. */
import { isProxy } from "node:util/types";
import { z } from "zod";
import { accessDigest } from "./access-policy";
import { financialStage } from "./foundation.contract";
import { managerModelDocument, managerPartition, type ManagerModelDocument, type ManagerMember } from "./manager-model.contract";
import { managerScorePopulationDigest } from "./manager-score-publication";
import { managerRegimePopulationCensusDigest } from "./manager-regime-publication";
import type { ManagerRegimePublication } from "./manager-regime-publication.contract";
import { decodeRetainedManagerScoreOriginal } from "./manager-score-original-custody";
import { restoreManagerRegimeOriginal, managerRegimeRetainedInputs } from "./manager-regime-runtime";
import { decodeRetainedManagerRegimeRestatement, type ManagerRegimeHistoricalRestatement } from "./manager-regime-restatement-worker";
import { assertExecutionReadScope, scopeAllowsField, scopeReadPopulation,
  type AuthorizedExecutionReadScope } from "./read-scope";
import { managerHistoricalRegimeDetail, type ManagerHistoricalRegimeDetail,
  type ManagerHistoricalRegimeEntry, type ManagerHistoricalRegimeResult } from "./manager-regime-history.contract";

const MAX_INPUT = 8 * 1024 * 1024, MAX_OUTPUT = 1024 * 1024;
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$(?![\s\S])/);
const text = z.string().min(1).max(256).regex(/^[^\u0000-\u001f\u007f]+$(?![\s\S])/);
const querySchema = z.object({ surface: z.enum(["ALPHA", "DEPLOYMENT"]), id: text,
  stage_filter: z.array(financialStage).max(4), economic_partition: managerPartition,
  revision_mode: z.enum(["ORIGINAL_AS_PUBLISHED", "RESTATED_CURRENT_POLICY"]),
}).strict().refine(q => new Set(q.stage_filter).size === q.stage_filter.length);
type Query = z.infer<typeof querySchema>;
type Original = NonNullable<ReturnType<typeof managerRegimeRetainedInputs>>;
type Result = ManagerRegimePublication["result"];
export type ManagerRegimePublicRefKind =
  "regime.basis" | "regime.evidence-binding" | "regime.input.original" | "regime.input.derived" |
  "regime.publication.original" | "regime.publication.derived" | "regime.window" | "regime.cost" |
  "regime.economic-domain" | "regime.account-mode" | "regime.calibration-snapshot" |
  "regime.research-binding" | "regime.run" | "regime.strategy-version" | "regime.params" | "regime.evidence-snapshot";
export interface ManagerRegimePublicProjectionInput {
  document: ManagerModelDocument;
  /** Caller verified this exact immutable DB row, including original head.
   * The pure codec rechecks all content/source/digest/census correlations. */
  originalRow: { calculation_key: string; payload_digest: string; payload: unknown } | null;
  /** ONE independently decoded immutable materialization, not caller JSON,
   * recomputed wrappers or entries concatenated across revisions. Null=absent.
   * Original-mode projection does not inspect an unrelated restatement. */
  restated: readonly ManagerRegimeHistoricalRestatement[] | null;
  scope: AuthorizedExecutionReadScope;
  query: Query;
  read_at_ms: number;
  maximum_output_bytes: number;
  /** Existing private HMAC key ring; caller binds scope/actor/workspace/env/
   * profile/target/source/generation/partition/family. No plain SHA helper. */
  ref(kind: ManagerRegimePublicRefKind, privateIdentity: string): string;
}
type ProjectionCode = "REGIME_PUBLIC_INPUT_INVALID" | "REGIME_PUBLIC_BOUND";
const projectionErrors = new WeakMap<object, ProjectionCode>();
export class ManagerRegimePublicProjectionError extends Error {
  readonly code: ProjectionCode;
  constructor(code: ProjectionCode) {
    super("The requested historical Regime projection is not available.");
    this.code = code === "REGIME_PUBLIC_BOUND" ? code : "REGIME_PUBLIC_INPUT_INVALID";
    projectionErrors.set(this, this.code);
  }
}
function fail(code: ManagerRegimePublicProjectionError["code"] = "REGIME_PUBLIC_INPUT_INVALID"): never {
  throw new ManagerRegimePublicProjectionError(code);
}
function ensure(value: unknown): asserts value { if (!value) fail(); }
function fields(value: unknown, names: readonly string[]): Record<string, PropertyDescriptor> {
  ensure(value !== null && typeof value === "object" && !isProxy(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)) && Object.getOwnPropertySymbols(value).length === 0);
  const f = Object.getOwnPropertyDescriptors(value);
  ensure(Object.keys(f).length === names.length && names.every(k => Object.hasOwn(f, k)) &&
    Object.values(f).every(d => d.enumerable && Object.hasOwn(d, "value")));
  return f;
}
/** Descriptor-first own-data JSON, no toJSON/getter/Proxy invocation. The actual
 * 8MiB supported history bound applies to exact JSON, not an estimated charge. */
function capture<T>(value: T, maximum: number): T {
  let nodes = 0, textBytes = 0; const active = new Set<object>();
  const visit = (v: unknown, depth: number): void => {
    if (++nodes > 1_000_000 || depth > 64) fail("REGIME_PUBLIC_BOUND");
    if (typeof v === "string") { textBytes += Buffer.byteLength(v); if (textBytes > maximum) fail("REGIME_PUBLIC_BOUND"); return; }
    if (v === null || typeof v === "boolean" || typeof v === "number" && Number.isFinite(v)) return;
    ensure(v !== null && typeof v === "object" && !isProxy(v));
    const array = Array.isArray(v), prototype = Object.getPrototypeOf(v);
    ensure(!active.has(v) && (array ? prototype === Array.prototype : [Object.prototype, null].includes(prototype)) &&
      Object.getOwnPropertySymbols(v).length === 0);
    const f = Object.getOwnPropertyDescriptors(v), length: unknown = array ? f.length?.value : undefined;
    if (array && (!Number.isSafeInteger(length) || (length as number) < 0 || (length as number) > 32768)) fail("REGIME_PUBLIC_BOUND");
    ensure(!array || Object.keys(f).length === (length as number) + 1); active.add(v);
    for (const [key, d] of Object.entries(f)) {
      if (array && key === "length") continue;
      ensure(d.enumerable && Object.hasOwn(d, "value") && (!array || /^(?:0|[1-9]\d*)$(?![\s\S])/.test(key) && Number(key) < (length as number)));
      textBytes += Buffer.byteLength(key); if (textBytes > maximum) fail("REGIME_PUBLIC_BOUND"); visit(d.value, depth + 1);
    }
    active.delete(v);
  };
  visit(value, 0); const json = JSON.stringify(value);
  if (Buffer.byteLength(json) > maximum) fail("REGIME_PUBLIC_BOUND"); return JSON.parse(json) as T;
}
const same = (a: unknown, b: unknown) => accessDigest(a) === accessDigest(b);
const tupleKey = (t: ManagerMember["tuple"]) => JSON.stringify([t.alpha_id, t.alpha_version_id, t.portfolio_id, t.deployment_id, t.account_id]);
const memberKey = (m: Pick<ManagerMember, "tuple" | "stage">) => JSON.stringify([tupleKey(m.tuple), m.stage]);
const bindingKey = (b: ManagerRegimePublication["provenance"]["binding"]) => accessDigest({ ...b, stage_filter: [...b.stage_filter].sort() });
const identity = ["alpha_id", "research_binding_id", "run_id", "strategy_version", "params_hash", "trade_params_hash",
  "param_mapping_version", "universe_id", "venue", "data_snapshot_id", "split_manifest_hash"] as const;
const absent = (reason_code: Extract<ManagerHistoricalRegimeDetail, { availability: "NOT_PUBLISHED" }>["reason_code"]): ManagerHistoricalRegimeDetail =>
  ({ availability: "NOT_PUBLISHED", reason_code });
function activeMembers(d: ManagerModelDocument, q: Query): ManagerMember[] {
  return d.members.filter(m => m.valid_from_ms <= d.as_of_ms && (m.valid_to_ms === null || d.as_of_ms < m.valid_to_ms) &&
    (q.surface === "ALPHA" ? m.tuple.alpha_id === q.id : m.tuple.deployment_id === q.id) &&
    (q.stage_filter.length === 0 || q.stage_filter.includes(m.stage)));
}
/** Entire candidate corpus, including rejected/non-neighbor references. A false
 * result is hidden == unknown; never trim references then retain full stats. */
function authorizedCorpus(o: Original, publication: ManagerRegimePublication, members: readonly ManagerMember[],
  allowed: ReadonlySet<string>, q: Query): boolean {
  const a = o.evidence_artifact, b = publication.provenance.binding;
  const population = members.filter(m => m.tuple.alpha_id === b.alpha_id && m.tuple.alpha_version_id === b.alpha_version_id &&
    (b.subject_type !== "deployment" || m.tuple.deployment_id === b.subject_id));
  const stages = q.stage_filter.length ? [...q.stage_filter].sort() : [...new Set(population.map(m => m.stage))].sort();
  const keys = new Set(population.map(memberKey)), artifactKeys = new Set(a.population.map(memberKey));
  if (!population.length || keys.size !== population.length || artifactKeys.size !== a.population.length ||
    keys.size !== artifactKeys.size || [...keys].some(k => !artifactKeys.has(k)) ||
    population.some(m => !allowed.has(tupleKey(m.tuple))) ||
    !same(stages, [...b.stage_filter].sort()) || !same(a.partition, q.economic_partition) ||
    b.tuple_population_digest !== managerScorePopulationDigest(population) ||
    publication.provenance.population_census_digest !== managerRegimePopulationCensusDigest(population) ||
    !same(a.binding, b) || !same(o.custody.binding, b)) return false;
  for (const reference of a.references) {
    const referenceKeys = reference.population.map(memberKey);
    if (!referenceKeys.length || new Set(referenceKeys).size !== referenceKeys.length ||
      referenceKeys.some(k => !keys.has(k)) || reference.population.some(m => !allowed.has(tupleKey(m.tuple))) ||
      identity.some(k => reference.binding[k] !== a.research_binding[k]) ||
      reference.economic_domain !== a.partition.economic_domain || reference.account_mode !== a.account_mode) return false;
    if (reference.source_kind === "deployment") {
      const financial = ({ Paper: "PAPER", Sandbox: "SANDBOX", Canary: "CANARY", Live: "LIVE" } as const)[reference.stage as "Paper" | "Sandbox" | "Canary" | "Live"];
      if (!reference.deployment || !financial || reference.population.some(m =>
        m.tuple.deployment_id !== reference.deployment!.deployment_id || m.stage !== financial)) return false;
    }
  }
  return true;
}
function publicResult(r: Result, ref: ManagerRegimePublicProjectionInput["ref"]): ManagerHistoricalRegimeResult {
  const opaque = (kind: ManagerRegimePublicRefKind, value: string) => digest.parse(ref(kind, value));
  return {
    status: r.status, reason_codes: [...new Set(r.reason_codes)], nearest_distance: r.nearest_distance,
    eligible_reference_count: r.eligible_reference_count, neighbor_count: r.neighbor_count,
    distinct_episode_count: r.distinct_episode_count,
    stage_breakdown: r.stage_breakdown.map(s => ({ stage: s.stage, evidence_kind: s.evidence_kind,
      economic_domain_ref: opaque("regime.economic-domain", s.economic_domain), account_mode_ref: opaque("regime.account-mode", s.account_mode),
      status: s.status, reason_codes: [...new Set(s.reason_codes)], neighbor_count: s.neighbor_count,
      distinct_episode_count: s.distinct_episode_count, effective_sample_size: s.effective_sample_size, nearest_distance: s.nearest_distance,
      reference_window_refs: s.reference_window_ids.map(v => opaque("regime.window", v)),
      neighbors: s.neighbors.map(n => ({ reference_window_ref: opaque("regime.window", n.reference_window_id), distance: n.distance, weight: n.weight })),
      matched_outcome_summary: { mean: s.matched_outcome_summary.mean, median: s.matched_outcome_summary.median,
        min: s.matched_outcome_summary.min, max: s.matched_outcome_summary.max,
        quantiles: s.matched_outcome_summary.quantiles.map(q => ({ probability: q.probability, value: q.value })),
        method: s.matched_outcome_summary.method,
        cost_assumptions_refs: s.matched_outcome_summary.cost_assumptions_ids.map(v => opaque("regime.cost", v)),
        outcome_from_ms: s.matched_outcome_summary.outcome_from_ms, outcome_to_ms: s.matched_outcome_summary.outcome_to_ms } })),
    reference_window_refs: r.reference_window_ids.map(v => opaque("regime.window", v)),
    formula_id: r.formula_id, qualification: r.qualification, policy_version: r.policy_version,
    policy_hash: r.policy_hash, approved_policy_id: r.approved_policy_id, feature_schema_version: r.feature_schema_version,
    calibration_snapshot_ref: opaque("regime.calibration-snapshot", r.calibration_snapshot_id), calibration_hash: r.calibration_hash,
    overlap_policy_id: r.overlap_policy_id, horizon_ms: r.horizon_ms,
    research_binding_ref: opaque("regime.research-binding", r.research_binding_id), bound_run_ref: opaque("regime.run", r.bound_run_id),
    strategy_version_ref: opaque("regime.strategy-version", r.strategy_version), params_ref: opaque("regime.params", r.params_hash),
    evidence_snapshot_ref: opaque("regime.evidence-snapshot", r.evidence_snapshot_id),
    as_of_ms: r.as_of_ms, feature_cutoff_ms: r.feature_cutoff_ms, reference_cutoff_ms: r.reference_cutoff_ms,
  };
}
interface Prepared { publication: ManagerRegimePublication; custody: Original["custody"];
  evaluation_at_ms: number; feature_cutoff_ms: number; historical: ManagerRegimeHistoricalRestatement | null }

export function projectManagerHistoricalRegime(input: ManagerRegimePublicProjectionInput): ManagerHistoricalRegimeDetail {
  try {
    const f = fields(input, ["document", "originalRow", "restated", "scope", "query", "read_at_ms", "maximum_output_bytes", "ref"]);
    const scope = f.scope.value as AuthorizedExecutionReadScope;
    assertExecutionReadScope(scope);
    ensure(scope.mode === "SCOPED_V2" && typeof f.ref.value === "function" && !isProxy(f.ref.value));
    const rawRef = f.ref.value as ManagerRegimePublicProjectionInput["ref"], now: unknown = f.read_at_ms.value, cap: unknown = f.maximum_output_bytes.value;
    ensure(typeof now === "number" && Number.isSafeInteger(now) && now >= 0 && typeof cap === "number" && Number.isSafeInteger(cap) && cap >= 1 && cap <= MAX_OUTPUT);
    const finish = (value: ManagerHistoricalRegimeDetail): ManagerHistoricalRegimeDetail => {
      const parsed = managerHistoricalRegimeDetail.parse(value);
      if (Buffer.byteLength(JSON.stringify(parsed)) > cap) fail("REGIME_PUBLIC_BOUND"); return parsed;
    };
    const no = (reason: Parameters<typeof absent>[0]) => finish(absent(reason));
    const q = querySchema.parse(capture(f.query.value, 8192));
    const domain = scope.environment === "paper" ? ["PAPER"] : scope.environment === "sandbox" ? ["SANDBOX"] : ["CANARY", "LIVE"];
    ensure(q.stage_filter.every(s => domain.includes(s)));
    const required = ["regime", "binding_id", "provenance_ref", "revision", "source_as_of", "as_of", "stage", "alpha_id", "alpha_version_id"];
    if (q.surface === "DEPLOYMENT") required.push("deployment_id");
    if (required.some(field => !scopeAllowsField(scope, field))) return no("REGIME_TARGET_NOT_AVAILABLE");
    const d = managerModelDocument.parse(capture(f.document.value, MAX_INPUT)), population = scopeReadPopulation(scope), binding = population.binding;
    ensure(d.qualification === "SOURCE_VERIFIED" && d.workspace_id === scope.workspaceId && d.environment === scope.environment &&
      d.profile_id === scope.profileId && d.observed_at_ms <= now && binding && binding.dataset_id === d.family_id &&
      binding.source_revision === d.revision && binding.projection_generation === d.projection_generation &&
      binding.catalogue_revision === d.catalogue_digest && binding.window === null);
    const members = activeMembers(d, q), allowed = new Set(population.allowedTuples.map(tupleKey));
    if (!members.some(m => allowed.has(tupleKey(m.tuple)))) return no("REGIME_TARGET_NOT_AVAILABLE");
    if (f.originalRow.value === null) return no("REGIME_ORIGINAL_CORPUS_AUTHORITY_NOT_RETAINED");
    const rf = fields(f.originalRow.value, ["calculation_key", "payload_digest", "payload"]);
    ensure(typeof rf.calculation_key.value === "string" && typeof rf.payload_digest.value === "string");
    const row = { calculation_key: digest.parse(rf.calculation_key.value), payload_digest: digest.parse(rf.payload_digest.value),
      payload: capture(rf.payload.value, MAX_INPUT) };
    const original = decodeRetainedManagerScoreOriginal(d, row, MAX_INPUT);
    if (original.schema_version !== "portal.execution.manager-score-original-inputs.v4")
      return no("REGIME_ORIGINAL_CORPUS_AUTHORITY_NOT_RETAINED");
    const source = new Map((d.precomputed_regimes ?? []).map(p => [bindingKey(p.provenance.binding), p]));
    ensure(source.size === (d.precomputed_regimes ?? []).length);
    const restated = new Map<string, ManagerRegimeHistoricalRestatement>();
    const restatementMissing = f.restated.value === null;
    if (q.revision_mode === "RESTATED_CURRENT_POLICY" && !restatementMissing) {
      const detached = capture(f.restated.value, MAX_INPUT);
      ensure(Array.isArray(detached) && detached.length <= 128);
      for (const h of detached as ManagerRegimeHistoricalRestatement[]) {
        // These outputs have already been independently decoded by the caller.
        // This map is PRIVATE; no result statistics/refs/counts are selected here.
        const key = bindingKey(h.binding); ensure(!restated.has(key)); restated.set(key, h);
      }
    }
    const prepared: Prepared[] = [], partition = accessDigest(q.economic_partition);
    let authorizedCandidate = false;
    for (const child of original.retained_regimes) {
      const publication = source.get(bindingKey(child.custody.binding)); ensure(publication);
      const b = publication.provenance.binding;
      // Already-authorized named-target candidate selection; unrelated children
      // do not require the caller to acquire their resource/corpus permissions.
      if (b.subject_type !== (q.surface === "ALPHA" ? "alpha" : "deployment") || b.subject_id !== q.id || b.partition_digest !== partition) continue;
      const restored = restoreManagerRegimeOriginal({ custody: child.custody, expected_custody_digest: child.custody_digest,
        document: d, maximum_bytes: MAX_INPUT }, () => now);
      ensure(restored.status === "READY");
      const o = managerRegimeRetainedInputs(restored.handle); ensure(o);
      if (!authorizedCorpus(o, publication, members, allowed, q)) continue;
      authorizedCandidate = true;
      let historical: ManagerRegimeHistoricalRestatement | null = null;
      if (q.revision_mode === "RESTATED_CURRENT_POLICY") {
        const candidate = restated.get(bindingKey(b)); if (!candidate) continue;
        // Recheck strict decoder against actual135/genuine child and independently
        // selected original row pins, not candidate parent/custody echoes.
        historical = decodeRetainedManagerRegimeRestatement(candidate, { original: restored.handle,
          original_custody_key: original.calculation_key, original_inputs_digest: original.inputs_digest,
          policy: candidate.policy, knowledge_cutoff_ms: candidate.knowledge_cutoff_ms,
          computed_at_ms: candidate.computed_at_ms, calculation_revision: candidate.calculation_revision }, MAX_INPUT, now);
      }
      prepared.push({ publication, custody: o.custody, evaluation_at_ms: o.evidence_artifact.evaluation_at_ms,
        feature_cutoff_ms: o.evidence_artifact.current.feature_cutoff_ms, historical });
    }
    if (!prepared.length) {
      // A partial source and no authorized retained target corpus do not prove
      // complete zero history. Keep hidden and unknown targets indistinguishable
      // and preserve null counts in the service instead of fabricating AVAILABLE0.
      if (!authorizedCandidate && d.source_quality.completeness !== "COMPLETE")
        return no("REGIME_ORIGINAL_CORPUS_AUTHORITY_NOT_RETAINED");
      return no(authorizedCandidate && q.revision_mode === "RESTATED_CURRENT_POLICY" && restatementMissing ?
        "INDEPENDENT_REGIME_RESTATEMENT_NOT_PUBLISHED" : "SELECTED_REGIME_REVISION_NOT_PUBLISHED");
    }
    const first = prepared[0]!.historical;
    if (first) ensure(prepared.every(p => p.historical &&
      p.historical.knowledge_cutoff_ms === first.knowledge_cutoff_ms && p.historical.computed_at_ms === first.computed_at_ms &&
      p.historical.calculation_revision === first.calculation_revision && same(p.historical.policy, first.policy)));
    // Complete candidate corpus authorization above precedes every public ref
    // and projected statistic. No hidden-candidate count/reason is constructed.
    let referenceBytes = 0;
    const ref: ManagerRegimePublicProjectionInput["ref"] = (kind, identity) => {
      const value: unknown = rawRef(kind, identity);
      ensure(typeof value === "string"); const parsed = digest.parse(value);
      referenceBytes += Buffer.byteLength(parsed);
      // Every call contributes a ref string to the output; this is only an
      // early lower-bound guard. Exact envelope JSON admission follows below.
      if (referenceBytes > cap) fail("REGIME_PUBLIC_BOUND"); return parsed;
    };
    const opaque = (kind: ManagerRegimePublicRefKind, value: string) => digest.parse(ref(kind, value));
    const partial = d.source_quality.completeness !== "COMPLETE";
    const entries: ManagerHistoricalRegimeEntry[] = [];
    let outputBytes = Buffer.byteLength(JSON.stringify({ availability: partial ? "PARTIAL" : "AVAILABLE",
      reason_codes: partial ? ["SOURCE_PROJECTION_PARTIAL"] : [], entries: [] }));
    for (const p of prepared) {
      const b = p.publication.provenance.binding, h = p.historical, c = p.custody;
      const originalPublication = opaque("regime.publication.original", c.original_publication_digest);
      const entry: ManagerHistoricalRegimeEntry = { binding: { subject_type: b.subject_type, subject_id: b.subject_id, alpha_id: b.alpha_id,
        alpha_version_id: b.alpha_version_id, stage_filter: [...b.stage_filter].sort(),
        comparable_basis_ref: opaque("regime.basis", b.comparable_basis_id),
        individual_evidence_binding_ref: opaque("regime.evidence-binding", b.individual_evidence_binding_id) },
        original_input_ref: opaque("regime.input.original", c.original_input_digest),
        derived_input_ref: h ? opaque("regime.input.derived", h.derived_input_digest) : null,
        original_publication_ref: originalPublication,
        publication_ref: h ? opaque("regime.publication.derived", accessDigest(h)) : originalPublication,
        original: { economic_as_of_ms: c.source.as_of_ms, evaluation_at_ms: p.evaluation_at_ms,
          feature_cutoff_ms: p.feature_cutoff_ms, computed_at_ms: c.original_computed_at_ms, captured_at_ms: c.captured_at_ms },
        knowledge_cutoff_ms: h?.knowledge_cutoff_ms ?? null,
        computed_at_ms: h?.computed_at_ms ?? c.original_computed_at_ms,
        calculation_revision: h?.calculation_revision ?? p.publication.provenance.calculation_revision,
        feed_freshness: h ? { availability: "AVAILABLE", checked_at_ms: h.checked_at_ms,
          status: h.feed_freshness.status, source_age_ms: h.feed_freshness.source_age_ms,
          maximum_source_age_ms: h.feed_freshness.maximum_source_age_ms, feature_age_ms: h.feed_freshness.feature_age_ms,
          maximum_feature_age_ms: h.feed_freshness.maximum_feature_age_ms } :
          { availability: "NOT_PUBLISHED", reason_code: "ORIGINAL_FEED_FRESHNESS_NOT_RECORDED" },
        result: publicResult(h?.result ?? p.publication.result, ref) };
      outputBytes += Buffer.byteLength(JSON.stringify(entry)) + (entries.length ? 1 : 0);
      if (outputBytes > cap) fail("REGIME_PUBLIC_BOUND"); entries.push(entry);
    }
    entries.sort((a, b) => {
      const key = (e: ManagerHistoricalRegimeEntry) => JSON.stringify([e.binding.subject_type, e.binding.subject_id,
        e.binding.alpha_id, e.binding.alpha_version_id, e.binding.stage_filter, e.binding.comparable_basis_ref,
        e.binding.individual_evidence_binding_ref]);
      const x = key(a), y = key(b); return x < y ? -1 : x > y ? 1 : 0;
    });
    return finish({ availability: partial ? "PARTIAL" : "AVAILABLE",
      reason_codes: partial ? ["SOURCE_PROJECTION_PARTIAL"] : [], entries });
  } catch (error) {
    // Callback/codec/source failures must not disclose exception prose or invoke
    // arbitrary thrown-object traps while reporting a failed boundary.
    // WeakMap identity reads invoke no thrown-object/prototype/own-code traps.
    // Reissue a fresh sanitized error even if an external callback mutated one.
    const code = error && typeof error === "object" ? projectionErrors.get(error) : undefined;
    throw new ManagerRegimePublicProjectionError(code ?? "REGIME_PUBLIC_INPUT_INVALID");
  }
}
