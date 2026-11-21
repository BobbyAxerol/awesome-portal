/** PRIVATE bounded historical Regime worker/codec. No source fetch, policy
 * installation, coordinator, store, scheduling, permission, execution or ACK. */
import { isProxy } from "node:util/types";
import { z } from "zod";
import { accessDigest } from "./access-policy";
import { calculateManagerRegimeFit, type ManagerRegimeInput } from "./manager-regime";
import { managerRegimeText, managerRegimeRef, managerRegimeSubjectBinding, managerRegimeResearchBinding,
  managerRegimeResult } from "./manager-regime-publication.contract";
import { managerRegimeRetainedInputs, managerRegimeHistoricalPolicyArchive,
  managerRegimeHistoricalPolicySnapshot, managerRegimeHistoricalPolicySnapshotCurrent,
  restoreManagerRegimeHistoricalPolicySnapshot,
  type ApprovedManagerRegimePolicy, type RetainedManagerRegimeInputs,
  type ManagerRegimeHistoricalPolicyArchive, type ManagerRegimeHistoricalPolicySnapshot,
  type ManagerRegimeRuntimeLimits } from "./manager-regime-runtime";

export const MANAGER_REGIME_HISTORICAL_WORKER_VERSION = "portal.execution.manager-regime-restatement-worker.v1" as const;
type Original = NonNullable<ReturnType<typeof managerRegimeRetainedInputs>>;
export interface ManagerHistoricalRegimeContext {
  original: RetainedManagerRegimeInputs;
  /** Independently selected immutable ORIGINAL138/139 pins, NOT wrapper echoes.
   * Caller must have strict full-v4+actual135+complete-census verification. */
  original_custody_key: string; original_inputs_digest: string;
  policy: ManagerRegimeHistoricalPolicyArchive;
  knowledge_cutoff_ms: number; computed_at_ms: number; calculation_revision: string;
}
export interface ManagerHistoricalRegimeTask extends Omit<ManagerHistoricalRegimeContext, "policy"> {
  policy: ApprovedManagerRegimePolicy | null;
}
const MAX_BYTES = 8 * 1024 * 1024;
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$(?![\s\S])/);
const ms = z.number().int().nonnegative().safe();
const metadata = z.object({ original_custody_key: digest, original_inputs_digest: digest,
  knowledge_cutoff_ms: ms, computed_at_ms: ms, calculation_revision: managerRegimeRef }).strict();
type Metadata = z.infer<typeof metadata>;
const source = z.object({ workspace_id: managerRegimeText, environment: z.enum(["paper", "sandbox", "live"]),
  profile_id: managerRegimeText, catalogue_digest: digest, revision: managerRegimeText, payload_digest: digest,
  source_epoch: managerRegimeText, source_sequence: z.string().regex(/^(?:0|[1-9]\d{0,18})$(?![\s\S])/),
  projection_generation: managerRegimeText, source_set_digest: digest, as_of_ms: ms }).strict();
const freshness = z.object({ status: z.enum(["WITHIN_CURRENT_FEED_FRESHNESS", "HISTORICAL_OUTSIDE_CURRENT_FEED_FRESHNESS"]),
  source_age_ms: ms, maximum_source_age_ms: ms, feature_age_ms: ms, maximum_feature_age_ms: ms }).strict();
const historical = z.object({ schema_version: z.literal(MANAGER_REGIME_HISTORICAL_WORKER_VERSION),
  revision_mode: z.literal("RESTATED_CURRENT_POLICY"), purpose: z.literal("HISTORICAL_ANALYSIS_ONLY"),
  operational_current: z.literal(false), source, binding: managerRegimeSubjectBinding, research_binding: managerRegimeResearchBinding,
  original_custody_key: digest, original_inputs_digest: digest, regime_custody_digest: digest,
  original_publication_digest: digest, original_input_digest: digest,
  original_policy_artifact_sha256: digest, evidence_artifact_sha256: digest,
  population_census_digest: digest, reference_census_digest: digest,
  original_computed_at_ms: ms, captured_at_ms: ms, economic_as_of_ms: ms, evaluation_at_ms: ms, feature_cutoff_ms: ms,
  policy: managerRegimeHistoricalPolicyArchive, policy_semantic_core_digest: digest,
  freeze_witness: z.enum(["SELECTED_APPROVAL_BEFORE_EVALUATION", "ORIGINAL_APPROVED_SEMANTIC_CORE"]),
  calculation_revision: managerRegimeRef, knowledge_cutoff_ms: ms, computed_at_ms: ms, checked_at_ms: ms,
  derived_input_digest: digest, derivation_context_digest: digest, feed_freshness: freshness,
  result: managerRegimeResult }).strict();
export type ManagerRegimeHistoricalRestatement = z.infer<typeof historical>;
export type ManagerHistoricalRegimeResult = { status: "READY"; publication: ManagerRegimeHistoricalRestatement } |
  { status: "NOT_PUBLISHED"; reason_codes: string[] };
export class ManagerRegimeHistoricalError extends Error { constructor(readonly code: string) { super(code); } }
const CODES = new Set(["REGIME_HISTORICAL_INPUT_INVALID", "REGIME_HISTORICAL_INPUT_BOUND", "REGIME_HISTORICAL_LIMIT_INVALID",
  "REGIME_HISTORICAL_TIME_INVALID", "REGIME_HISTORICAL_ORIGINAL_NOT_RETAINED", "REGIME_HISTORICAL_POLICY_NOT_CURRENT",
  "REGIME_HISTORICAL_POLICY_ARCHIVE_INVALID", "REGIME_HISTORICAL_METHOD_INCOMPATIBLE",
  "REGIME_HISTORICAL_CALIBRATION_AFTER_EVALUATION", "REGIME_HISTORICAL_FREEZE_WITNESS_NOT_RETAINED",
  "REGIME_HISTORICAL_CONTEXT_MISMATCH", "REGIME_HISTORICAL_RESULT_MISMATCH", "REGIME_HISTORICAL_CAPACITY",
  "REGIME_HISTORICAL_CANCELLED", "REGIME_HISTORICAL_OUTPUT_BOUND"]);
function fail(code: string): never { throw new ManagerRegimeHistoricalError(code); }
function ensure(value: unknown, code: string): asserts value { if (!value) fail(code); }
const same = (a: unknown, b: unknown): boolean => accessDigest(a) === accessDigest(b);
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { for (const item of Object.values(value)) freeze(item); Object.freeze(value); }
  return value;
}
function fields(value: unknown, expected: readonly string[]): Record<string, PropertyDescriptor> {
  ensure(value !== null && typeof value === "object" && !isProxy(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)) && !Object.getOwnPropertySymbols(value).length,
  "REGIME_HISTORICAL_INPUT_INVALID");
  const f = Object.getOwnPropertyDescriptors(value);
  ensure(Object.keys(f).length === expected.length && expected.every(k => Object.hasOwn(f, k)) &&
    Object.values(f).every(d => d.enumerable && Object.hasOwn(d, "value")), "REGIME_HISTORICAL_INPUT_INVALID"); return f;
}
/** Same structural bounds as ordinary Regime, with Proxy refusal BEFORE every
 * reflection. Nested getters, sparse arrays, symbols and nonfinite JSON refuse. */
function capture<T>(value: T, limit: number): T {
  let nodes = 0, text = 0; const active = new Set<object>();
  const visit = (v: unknown, depth: number): void => {
    ensure(++nodes <= 250_000 && depth <= 32, "REGIME_HISTORICAL_INPUT_BOUND");
    if (typeof v === "string") { text += Buffer.byteLength(v); ensure(text <= limit, "REGIME_HISTORICAL_INPUT_BOUND"); return; }
    if (v === null || typeof v === "boolean" || typeof v === "number" && Number.isFinite(v)) return;
    ensure(v !== null && typeof v === "object" && !isProxy(v), "REGIME_HISTORICAL_INPUT_INVALID");
    const array = Array.isArray(v), prototype = Object.getPrototypeOf(v);
    ensure(!active.has(v) && (array ? prototype === Array.prototype : [Object.prototype, null].includes(prototype)) &&
      !Object.getOwnPropertySymbols(v).length, "REGIME_HISTORICAL_INPUT_INVALID");
    const f = Object.getOwnPropertyDescriptors(v), length: unknown = array ? f.length?.value : undefined;
    ensure(!array || Number.isSafeInteger(length) && (length as number) >= 0 && (length as number) <= 32_768 &&
      Object.keys(f).length === (length as number) + 1, "REGIME_HISTORICAL_INPUT_BOUND");
    active.add(v);
    for (const [key, d] of Object.entries(f)) {
      if (array && key === "length") continue;
      ensure(d.enumerable && Object.hasOwn(d, "value") && (!array || /^(?:0|[1-9]\d*)$(?![\s\S])/.test(key) &&
        Number(key) < (length as number)), "REGIME_HISTORICAL_INPUT_INVALID");
      text += Buffer.byteLength(key); ensure(text <= limit, "REGIME_HISTORICAL_INPUT_BOUND"); visit(d.value, depth + 1);
    }
    active.delete(v);
  };
  visit(value, 0); const json = JSON.stringify(value);
  ensure(Buffer.byteLength(json) <= limit, "REGIME_HISTORICAL_INPUT_BOUND"); return JSON.parse(json) as T;
}
function clock(value: unknown): number {
  ensure(typeof value === "number" && Number.isSafeInteger(value) && value >= 0, "REGIME_HISTORICAL_TIME_INVALID"); return value;
}
function limit(value: unknown): number {
  ensure(typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= MAX_BYTES,
    "REGIME_HISTORICAL_LIMIT_INVALID"); return value;
}
const KEYS = ["original", "original_custody_key", "original_inputs_digest", "policy", "knowledge_cutoff_ms", "computed_at_ms", "calculation_revision"] as const;
function intake(value: unknown, bytes: number): { f: Record<string, PropertyDescriptor>; original: Original; meta: Metadata } {
  const f = fields(value, KEYS);
  // Primitive digest guard before Zod/any reflection on a supplied digest value.
  ensure(typeof f.original_custody_key.value === "string" && typeof f.original_inputs_digest.value === "string",
    "REGIME_HISTORICAL_INPUT_INVALID");
  const original = managerRegimeRetainedInputs(f.original.value as RetainedManagerRegimeInputs);
  ensure(original, "REGIME_HISTORICAL_ORIGINAL_NOT_RETAINED");
  const meta = metadata.parse(capture(Object.fromEntries(KEYS.filter(k => k !== "original" && k !== "policy")
    .map(k => [k, f[k].value])), bytes)); return { f, original, meta: freeze(meta) };
}
function archive(p: ManagerRegimeHistoricalPolicySnapshot): ManagerRegimeHistoricalPolicyArchive {
  return { artifact_utf8: p.artifact_utf8, approval_pin: p.approval };
}
function scope(o: Original) { return o.evidence_artifact.scope; }
/** Only these FOUR administrative policy fields are excluded. Every other
 * closed calculation/calibration/support field stays in the equality recipe. */
function semanticCore(p: ManagerRegimeHistoricalPolicySnapshot | { artifact: Original["policy_artifact"] }) {
  const a = p.artifact, { policy_version: _version, policy_hash: _hash, approved_policy_id: _approved,
    source_locator: _locator, ...policy } = a.policy;
  return { policy, feature_definition: a.feature_definition, economic_basis: a.economic_basis,
    formula_hash: a.formula_hash, calculation_revision: a.calculation_revision };
}
function witness(o: Original, p: ManagerRegimeHistoricalPolicySnapshot): ManagerRegimeHistoricalRestatement["freeze_witness"] {
  const a = p.artifact, old = o.policy_artifact, e = o.evidence_artifact.evaluation_at_ms;
  ensure(same(a.scope, old.scope) && same(a.feature_definition, old.feature_definition) &&
    same(a.economic_basis, old.economic_basis) && a.formula_hash === old.formula_hash &&
    a.policy.feature_schema_version === old.policy.feature_schema_version && a.policy.horizon_ms === old.policy.horizon_ms,
  "REGIME_HISTORICAL_METHOD_INCOMPATIBLE");
  ensure(a.policy.calibration_cutoff_ms <= a.policy.frozen_at_ms && a.policy.frozen_at_ms < e,
    "REGIME_HISTORICAL_CALIBRATION_AFTER_EVALUATION");
  if (p.approval.approved_at_ms <= e && p.approval.available_at_ms <= e) return "SELECTED_APPROVAL_BEFORE_EVALUATION";
  ensure(o.policy_approval.approved_at_ms <= e && o.policy_approval.available_at_ms <= e && old.policy.frozen_at_ms < e &&
    same(semanticCore(p), semanticCore({ artifact: old })), "REGIME_HISTORICAL_FREEZE_WITNESS_NOT_RETAINED");
  return "ORIGINAL_APPROVED_SEMANTIC_CORE";
}
function assertContext(o: Original, p: ManagerRegimeHistoricalPolicySnapshot, m: Metadata, now: number): void {
  const c = o.custody, a = o.evidence_artifact, pin = p.approval;
  ensure(a.evaluation_at_ms <= c.source.as_of_ms && c.source.as_of_ms <= c.original_computed_at_ms &&
    c.original_computed_at_ms <= c.captured_at_ms && c.captured_at_ms <= m.knowledge_cutoff_ms &&
    m.knowledge_cutoff_ms <= m.computed_at_ms && m.computed_at_ms <= now &&
    pin.approved_at_ms <= pin.available_at_ms && pin.available_at_ms <= m.knowledge_cutoff_ms &&
    m.computed_at_ms < pin.valid_until_ms, "REGIME_HISTORICAL_TIME_INVALID");
  ensure(same(scope(o), p.artifact.scope) && same(c.binding, a.binding) &&
    o.input.as_of_ms === a.source_as_of_ms && a.source_as_of_ms === c.source.as_of_ms &&
    o.source_acceptance.population_census_digest === c.population_census_digest &&
    o.source_acceptance.reference_census_digest === c.reference_census_digest,
  "REGIME_HISTORICAL_CONTEXT_MISMATCH"); witness(o, p);
}
function bound(o: Original, p: ManagerRegimeHistoricalPolicySnapshot, m: Metadata, bytes: number): void {
  // Custody already includes the original exact corpus bytes/pins. Charge it
  // once, not the accessor's repeated parsed copies. No artifact cap is raised.
  ensure(Buffer.byteLength(JSON.stringify({ original: o.custody, policy: archive(p), context: m })) <= bytes,
    "REGIME_HISTORICAL_INPUT_BOUND");
}
function derivedInput(o: Original, p: ManagerRegimeHistoricalPolicySnapshot): ManagerRegimeInput {
  // A, E, F, original corpus and source-derived proof watermarks are unchanged.
  return { ...o.input, policy: p.artifact.policy };
}
function identity(o: Original, p: ManagerRegimeHistoricalPolicySnapshot, m: Metadata) {
  const c = o.custody, a = o.evidence_artifact;
  return { source: c.source, binding: c.binding, research_binding: a.research_binding,
    ...m, regime_custody_digest: c.custody_digest, original_publication_digest: c.original_publication_digest,
    original_input_digest: c.original_input_digest, original_policy_artifact_sha256: c.policy_artifact_sha256,
    evidence_artifact_sha256: c.evidence_artifact_sha256, population_census_digest: c.population_census_digest,
    reference_census_digest: c.reference_census_digest, original_computed_at_ms: c.original_computed_at_ms,
    captured_at_ms: c.captured_at_ms, economic_as_of_ms: c.source.as_of_ms,
    evaluation_at_ms: a.evaluation_at_ms, feature_cutoff_ms: a.current.feature_cutoff_ms,
    policy: archive(p), policy_semantic_core_digest: accessDigest(semanticCore(p)), freeze_witness: witness(o, p) };
}
function feed(o: Original, p: ManagerRegimeHistoricalPolicySnapshot, checked: number): z.infer<typeof freshness> {
  const sourceAge = checked - o.custody.source.as_of_ms, featureAge = checked - o.evidence_artifact.current.feature_cutoff_ms;
  const maximumSource = o.evidence_artifact.maximum_source_age_ms, maximumFeature = p.artifact.policy.max_feature_age_ms;
  return { status: sourceAge > maximumSource || featureAge > maximumFeature ? "HISTORICAL_OUTSIDE_CURRENT_FEED_FRESHNESS" :
    "WITHIN_CURRENT_FEED_FRESHNESS", source_age_ms: sourceAge, maximum_source_age_ms: maximumSource,
    feature_age_ms: featureAge, maximum_feature_age_ms: maximumFeature };
}
function contextDigest(id: ReturnType<typeof identity>, derived: string): string {
  return accessDigest({ schema_version: MANAGER_REGIME_HISTORICAL_WORKER_VERSION, revision_mode: "RESTATED_CURRENT_POLICY",
    purpose: "HISTORICAL_ANALYSIS_ONLY", operational_current: false, ...id, derived_input_digest: derived });
}
/** Identity/corpus/absence checks ONLY. Immutable worker/store intake owns the
 * descriptive numbers; a GET never recomputes distances, Gaussian weights or
 * matched outcome summaries to authenticate a stored result. */
function checkResult(o: Original, p: ManagerRegimeHistoricalPolicySnapshot, v: ManagerRegimeHistoricalRestatement): void {
  const r = v.result, a = o.evidence_artifact, b = a.research_binding, q = p.artifact.policy;
  ensure(r.formula_id === q.formula_id && r.policy_version === q.policy_version && r.policy_hash === q.policy_hash &&
    r.approved_policy_id === q.approved_policy_id && r.feature_schema_version === q.feature_schema_version &&
    r.calibration_snapshot_id === q.calibration_snapshot_id && r.calibration_hash === q.calibration_hash &&
    r.overlap_policy_id === q.overlap_policy_id && r.horizon_ms === q.horizon_ms &&
    r.research_binding_id === b.research_binding_id && r.bound_run_id === b.run_id && r.strategy_version === b.strategy_version &&
    r.params_hash === b.params_hash && r.evidence_snapshot_id === a.evidence_snapshot_id && r.as_of_ms === a.source_as_of_ms &&
    r.feature_cutoff_ms === a.current.feature_cutoff_ms && r.revision === a.revision && r.supersedes_revision === a.supersedes_revision &&
    r.eligible_reference_count <= a.references.length, "REGIME_HISTORICAL_RESULT_MISMATCH");
  const refs = new Map(o.input.references.map(ref => [ref.reference_window_id, ref]));
  ensure(r.reasons.every(reason => reason.reference_window_id === null || refs.has(reason.reference_window_id)) &&
    r.reference_window_ids.every(id => refs.has(id)) && (r.reference_cutoff_ms === null ||
      o.input.references.some(ref => ref.features.feature_cutoff_ms === r.reference_cutoff_ms)), "REGIME_HISTORICAL_RESULT_MISMATCH");
  for (const group of r.stage_breakdown) {
    const used = group.neighbors.map(n => refs.get(n.reference_window_id));
    ensure(used.every((ref, i) => ref && ref.stage === group.stage && ref.evidence_kind === group.evidence_kind &&
      ref.economic_domain === group.economic_domain && ref.account_mode === group.account_mode &&
      ref.manifest_hash === group.neighbors[i]!.manifest_hash && ref.source_locator === group.neighbors[i]!.source_locator &&
      (ref.source_proof_available_at_ms ?? 0) <= a.source_as_of_ms && ref.outcome_end_ms <= a.source_as_of_ms &&
      ref.outcome_available_at_ms <= a.source_as_of_ms && ref.features.available_at_ms <= a.source_as_of_ms) &&
      new Set(used.map(ref => ref!.episode_id)).size === group.distinct_episode_count,
    "REGIME_HISTORICAL_RESULT_MISMATCH");
  }
  ensure(new Set(r.reference_window_ids.map(id => refs.get(id)!.episode_id)).size === r.distinct_episode_count,
    "REGIME_HISTORICAL_RESULT_MISMATCH");
}
/** Strict archived decoder: expected parent pins and genuine child come from
 * independent immutable intake, never selected from the supplied wrapper. */
export function decodeRetainedManagerRegimeRestatement(value: unknown, context: ManagerHistoricalRegimeContext,
  maximumBytes: number, readNowMs: number = Date.now()): ManagerRegimeHistoricalRestatement {
  try {
    const bytes = limit(maximumBytes), now = clock(readNowMs), { f, original: o, meta: m } = intake(context, bytes);
    const selected = managerRegimeHistoricalPolicyArchive.parse(capture(f.policy.value, bytes));
    const p = restoreManagerRegimeHistoricalPolicySnapshot({ archive: selected, scope: scope(o),
      knowledge_cutoff_ms: m.knowledge_cutoff_ms, computed_at_ms: m.computed_at_ms }, now);
    ensure(p, "REGIME_HISTORICAL_POLICY_ARCHIVE_INVALID"); bound(o, p, m, bytes); assertContext(o, p, m, now);
    const v = historical.parse(capture(value, bytes)), id = identity(o, p, m);
    ensure(same(id, Object.fromEntries(Object.keys(id).map(k => [k, v[k as keyof typeof v]]))) &&
      v.checked_at_ms >= v.computed_at_ms && v.checked_at_ms <= now && v.checked_at_ms < p.approval.valid_until_ms &&
      v.derived_input_digest === accessDigest(derivedInput(o, p)) && v.derivation_context_digest === contextDigest(id, v.derived_input_digest) &&
      same(v.feed_freshness, feed(o, p, v.checked_at_ms)), "REGIME_HISTORICAL_CONTEXT_MISMATCH");
    checkResult(o, p, v); return freeze(v);
  } catch (error) { throw new ManagerRegimeHistoricalError(code(error)); }
}
function code(error: unknown): string {
  if (error !== null && typeof error === "object" && !isProxy(error)) {
    const d = Object.getOwnPropertyDescriptor(error, "code");
    if (d && Object.hasOwn(d, "value") && typeof d.value === "string" && CODES.has(d.value)) return d.value;
  }
  return "REGIME_HISTORICAL_INPUT_INVALID";
}
export class ManagerRegimeHistoricalRuntime {
  private inFlight = 0; private readonly limits: Readonly<ManagerRegimeRuntimeLimits>;
  constructor(limits: ManagerRegimeRuntimeLimits, private readonly now: () => number = Date.now) {
    const ceilings = { maximum_references: 4096, maximum_input_bytes: MAX_BYTES, maximum_output_bytes: MAX_BYTES, maximum_in_flight: 128 };
    let f: Record<string, PropertyDescriptor>; try { f = fields(limits, Object.keys(ceilings)); }
    catch { fail("REGIME_HISTORICAL_LIMIT_INVALID"); }
    ensure(typeof now === "function" && !isProxy(now) && Object.entries(ceilings).every(([key, maximum]) => {
      const value: unknown = f[key]!.value; return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= maximum;
    }), "REGIME_HISTORICAL_LIMIT_INVALID");
    this.limits = Object.freeze(Object.fromEntries(Object.entries(f).map(([k, d]) => [k, d.value]))) as Readonly<ManagerRegimeRuntimeLimits>;
  }
  async calculateHistoricalRegime(task: ManagerHistoricalRegimeTask, signal?: AbortSignal): Promise<ManagerHistoricalRegimeResult> {
    if (this.inFlight >= this.limits.maximum_in_flight) return { status: "NOT_PUBLISHED", reason_codes: ["REGIME_HISTORICAL_CAPACITY"] };
    this.inFlight++;
    try {
      ensure(!signal?.aborted, "REGIME_HISTORICAL_CANCELLED");
      const initial = clock(this.now()), { f, original: o, meta: m } = intake(task, this.limits.maximum_input_bytes);
      const handle = f.policy.value as ApprovedManagerRegimePolicy | null;
      const p = managerRegimeHistoricalPolicySnapshot(handle, scope(o), m.knowledge_cutoff_ms, initial);
      ensure(p, "REGIME_HISTORICAL_POLICY_NOT_CURRENT");
      ensure(o.input.references.length <= this.limits.maximum_references, "REGIME_HISTORICAL_INPUT_BOUND");
      bound(o, p, m, this.limits.maximum_input_bytes); assertContext(o, p, m, initial);
      const input = freeze(capture(derivedInput(o, p), this.limits.maximum_input_bytes));
      const id = freeze(identity(o, p, m)), derived = accessDigest(input);
      // All caller-owned data is detached before yield. The ONLY calculation
      // uses original A/E/F/corpus/proof watermarks, never retrospective K.
      await Promise.resolve();
      const checked = clock(this.now());
      ensure(!signal?.aborted, "REGIME_HISTORICAL_CANCELLED");
      ensure(checked >= initial && managerRegimeHistoricalPolicySnapshotCurrent(handle, p, checked), "REGIME_HISTORICAL_POLICY_NOT_CURRENT");
      assertContext(o, p, m, checked);
      const result = managerRegimeResult.parse(calculateManagerRegimeFit(input));
      const publication = historical.parse({ schema_version: MANAGER_REGIME_HISTORICAL_WORKER_VERSION,
        revision_mode: "RESTATED_CURRENT_POLICY", purpose: "HISTORICAL_ANALYSIS_ONLY", operational_current: false,
        ...id, checked_at_ms: checked, derived_input_digest: derived, derivation_context_digest: contextDigest(id, derived),
        feed_freshness: feed(o, p, checked), result });
      ensure(Buffer.byteLength(JSON.stringify(publication)) <= this.limits.maximum_output_bytes, "REGIME_HISTORICAL_OUTPUT_BOUND");
      checkResult(o, p, publication);
      const finished = clock(this.now());
      ensure(finished >= checked, "REGIME_HISTORICAL_TIME_INVALID");
      ensure(!signal?.aborted, "REGIME_HISTORICAL_CANCELLED");
      ensure(managerRegimeHistoricalPolicySnapshotCurrent(handle, p, finished), "REGIME_HISTORICAL_POLICY_NOT_CURRENT");
      assertContext(o, p, m, finished); return { status: "READY", publication: freeze(publication) };
    } catch (error) { return { status: "NOT_PUBLISHED", reason_codes: [code(error)] }; }
    finally { this.inFlight--; }
  }
}
