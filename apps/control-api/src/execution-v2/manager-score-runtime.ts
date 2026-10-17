import { createHash } from "node:crypto";
import { z } from "zod";
import {
  calculateManagerQualityScore, calculateManagerScoreMetrics, MANAGER_SCORE_ATOMIC_WEIGHTS,
  MANAGER_SCORE_FORMULA, managerQualityBand, type ManagerQualityInput, type ManagerQualityResult,
  type ManagerScoreMetrics, type ManagerScorePathInput, type ManagerScorePathResult, type ManagerScorePolicy,
} from "./manager-score";

/** Private worker integration, not an HTTP input or an approval authority. */
const text = z.string().min(1).max(256).regex(/^[^\u0000-\u001f\u007f]+$(?![\s\S])/);
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$(?![\s\S])/);
const ms = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const decimal = z.string().max(512).regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$(?![\s\S])/);
const safeCount = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const scopeSchema = z.object({ workspace_id: text, environment: z.enum(["paper", "sandbox", "live"]),
  profile_id: text, catalogue_digest: digest }).strict();
const bindingSchema = z.object({
  subject_type: z.enum(["alpha", "deployment", "account", "portfolio", "manager_book"]), subject_id: text,
  tuple_population_digest: digest, partition_digest: digest,
  stage_filter: z.array(z.enum(["PAPER", "SANDBOX", "CANARY", "LIVE"])).min(1).max(4),
  window_start_ms: ms, window_end_ms: ms, comparable_basis_id: text, individual_evidence_binding_id: text,
}).strict().superRefine((v, c) => {
  if (v.window_end_ms <= v.window_start_ms || new Set(v.stage_filter).size !== v.stage_filter.length)
    c.addIssue({ code: z.ZodIssueCode.custom, message: "SCORE_BINDING_INVALID" });
});
const anchors = z.tuple([decimal, decimal]);
const policySchema = z.object({
  formula_id: z.literal(MANAGER_SCORE_FORMULA), qualification: z.enum(["RUNTIME_APPROVED", "TEST_ONLY"]),
  policy_id: text, policy_hash: digest, formula_hash: digest, calibration_snapshot_id: text,
  approved_policy_id: text.nullable(), comparable_basis_id: text, duration_key: text,
  observation_frequency: text, calendar: text, timezone: text, currency: text, cash_reference_id: text,
  cost_method: text, required_costs: z.array(text).max(32), block_manifest_id: text, stress_policy_id: text,
  stress_delta_bps: decimal, anchors: z.object({ twr: anchors, sharpe: anchors, mdd: anchors, add: anchors }).strict(),
  maturity: z.object({ minimum_samples: safeCount, minimum_complete_blocks: safeCount, minimum_duration_ms: ms }).strict(),
  canonical_decimal_places: z.number().int().min(0).max(15), issued_at_ms: ms, calibration_cutoff_ms: ms,
}).strict();
const configSchema = z.object({
  maximum_input_age_ms: ms, minimum_window_ms: ms, maximum_window_ms: ms,
  grid_method_ref: text, flow_adjustment_method_ref: text, ownership_method_ref: text, fx_method_ref: text,
}).strict();
const artifactSchema = z.object({ schema_version: z.literal("portal.execution.manager-score-policy-runtime.v1"),
  scope: scopeSchema, policy: policySchema, runtime_config: configSchema }).strict();
const approvalSchema = z.object({ artifact_sha256: digest, policy_id: text, policy_hash: digest, formula_hash: digest,
  approved_policy_id: text, policy_revision: text, approval_ref: text, approved_at_ms: ms, valid_until_ms: ms,
  scope: scopeSchema }).strict();
export type ManagerScoreRuntimeScope = z.infer<typeof scopeSchema>;
export type ManagerScoreSubjectBinding = z.infer<typeof bindingSchema>;
export type ManagerScoreRuntimePolicyArtifact = z.infer<typeof artifactSchema>;
/** Supplied from an independently reviewed private configuration, never read from artifact JSON. */
export type ManagerScorePolicyApprovalPin = z.infer<typeof approvalSchema>;
declare const approvedPolicyBrand: unique symbol;
export interface ApprovedManagerScorePolicy { readonly [approvedPolicyBrand]: true }
interface PolicyRecord { artifact: ManagerScoreRuntimePolicyArtifact; approval: ManagerScorePolicyApprovalPin; config_hash: string }
const approvedPolicies = new WeakMap<ApprovedManagerScorePolicy, PolicyRecord>();

function hash(bytes: string | Uint8Array): string { return `sha256:${createHash("sha256").update(bytes).digest("hex")}`; }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { for (const item of Object.values(value)) freeze(item); Object.freeze(value); }
  return value;
}
function same(left: unknown, right: unknown): boolean { return canonical(left) === canonical(right); }

/** Config/policy digest excludes only its own self-referential digest field. */
export function managerScorePolicyHash(policy: Omit<ManagerScorePolicy, "policy_hash">): string {
  const { policy_hash: _ignored, ...payload } = policy as ManagerScorePolicy;
  return hash(canonical(payload));
}
export type ManagerScorePolicyLoadResult = { status: "READY"; handle: ApprovedManagerScorePolicy }
  | { status: "POLICY_PENDING"; reason_codes: string[] };

/** Checks exact bytes plus a separate approval pin. A self-declared RUNTIME_APPROVED string is never enough. */
export function loadApprovedManagerScorePolicy(input: {
  artifact_bytes: Uint8Array | string | null; approval_pin: ManagerScorePolicyApprovalPin | null;
  scope: ManagerScoreRuntimeScope; as_of_ms: number;
}): ManagerScorePolicyLoadResult {
  const pending = (...reasons: string[]): ManagerScorePolicyLoadResult => ({ status: "POLICY_PENDING", reason_codes: reasons });
  if (input.artifact_bytes === null || input.approval_pin === null) return pending("RUNTIME_CALIBRATION_NOT_APPROVED");
  try {
    const scope = scopeSchema.parse(input.scope); const asOf = ms.parse(input.as_of_ms);
    if (!(typeof input.artifact_bytes === "string" || input.artifact_bytes instanceof Uint8Array)) return pending("SCORE_POLICY_ARTIFACT_INVALID");
    const bytes = typeof input.artifact_bytes === "string" ? Buffer.from(input.artifact_bytes, "utf8") : Buffer.from(input.artifact_bytes);
    if (!bytes.length || bytes.length > 65_536) return pending("SCORE_POLICY_ARTIFACT_BYTE_LIMIT");
    const approval = approvalSchema.parse(input.approval_pin);
    if (hash(bytes) !== approval.artifact_sha256) return pending("SCORE_POLICY_ARTIFACT_HASH_MISMATCH");
    const artifact = artifactSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
    const policy = artifact.policy;
    if (policy.qualification !== "RUNTIME_APPROVED") return pending("TEST_ONLY_POLICY_NOT_RUNTIME_AUTHORITY");
    if (!same(scope, artifact.scope) || !same(scope, approval.scope)) return pending("SCORE_POLICY_SCOPE_MISMATCH");
    if (policy.policy_id !== approval.policy_id || policy.policy_hash !== approval.policy_hash
      || policy.formula_hash !== approval.formula_hash || policy.approved_policy_id !== approval.approved_policy_id
      || managerScorePolicyHash(policy) !== policy.policy_hash) return pending("SCORE_POLICY_APPROVAL_PIN_MISMATCH");
    if (policy.calibration_cutoff_ms > policy.issued_at_ms || policy.issued_at_ms > approval.approved_at_ms
      || approval.approved_at_ms > asOf || approval.valid_until_ms <= asOf)
      return pending("SCORE_POLICY_NOT_AVAILABLE_AS_OF");
    const config = artifact.runtime_config;
    if (config.maximum_window_ms <= 0 || config.minimum_window_ms <= 0 || config.minimum_window_ms > config.maximum_window_ms
      || new Set(policy.required_costs).size !== policy.required_costs.length || Number(policy.stress_delta_bps) <= 0)
      return pending("SCORE_POLICY_CONFIG_INVALID");
    // Delegate numeric policy/anchor validity to the one canonical calculator, never duplicate F(PRB).
    const validation = calculateManagerQualityScore({ policy, metrics: Object.fromEntries(Object.keys(MANAGER_SCORE_ATOMIC_WEIGHTS).map(key => [key, null])) as ManagerScoreMetrics,
      comparable_basis_id: policy.comparable_basis_id, individual_evidence_binding_id: "policy-validation",
      window_start_ms: 0, window_end_ms: 1, as_of_ms: asOf, sample_count: 0, complete_block_count: 0,
      observed_duration_ms: 0, currency: policy.currency, required_costs_complete: true, stale: false, data_valid: true });
    if (validation.status === "policy_pending") return pending(...validation.reason_codes);
    const handle = Object.freeze({}) as ApprovedManagerScorePolicy;
    approvedPolicies.set(handle, freeze({ artifact, approval, config_hash: approval.artifact_sha256 }));
    return { status: "READY", handle };
  } catch { return pending("SCORE_POLICY_ARTIFACT_INVALID"); }
}

export interface ManagerScoreRuntimeLimits {
  maximum_observations: number; maximum_blocks: number; maximum_stress_subperiods: number;
  maximum_input_bytes: number; maximum_in_flight: number;
}
export class ManagerScoreRuntimeError extends Error {
  constructor(readonly code: "SCORE_RUNTIME_LIMIT_INVALID" | "SCORE_RUNTIME_CAPACITY" | "SCORE_RUNTIME_INPUT_BOUND" | "SCORE_RUNTIME_INPUT_INVALID") { super(code); }
}
type QualityBase = Omit<ManagerQualityInput, "policy" | "metrics" | "allow_test_only">;
export interface ManagerScoreRuntimeTask {
  scope: ManagerScoreRuntimeScope; binding: ManagerScoreSubjectBinding;
  source_revision: string; source_set_digest: string; source_qualification: "SOURCE_VERIFIED" | "TEST_ONLY";
  calculation_revision: string; computed_at_ms: number; expected_policy_revision: string | null;
  policy: ApprovedManagerScorePolicy | null;
  /** Private original-task custody binding from the qualified metrics adapter.
   * Included in the existing exact worker input hash. Never synthesized here
   * from whichever normalization policy happens to be current. */
  metrics_dependency_digest?:string;
  input: { kind: "METRICS"; quality: QualityBase & { metrics: ManagerScoreMetrics } }
    | { kind: "PATH"; path: ManagerScorePathInput; quality: Omit<QualityBase, "sample_count" | "complete_block_count"> };
}
export interface ManagerScoreRuntimeResult {
  quality: ManagerQualityResult; raw_metrics: ManagerScoreMetrics | null;
  path_summary: Omit<ManagerScorePathResult, "metrics"> | null;
  provenance: {
    scope: ManagerScoreRuntimeScope; binding: ManagerScoreSubjectBinding; source_revision: string; source_set_digest: string;
    source_qualification: "SOURCE_VERIFIED" | "TEST_ONLY"; input_digest: string; calculation_revision: string; computed_at_ms: number;
    source_as_of_ms: number;
    policy_id: string | null; policy_hash: string | null; policy_revision: string | null; config_hash: string | null;
    formula_hash: string | null; approval_ref: string | null; approved_at_ms: number | null; policy_valid_until_ms: number | null;
  };
}
/** Read-time invalidation only, not a source/permission verifier or a score recalculation. */
export function managerScorePublicationPolicyCurrent(handle: ApprovedManagerScorePolicy | null,
  result: Pick<ManagerScoreRuntimeResult, "quality" | "provenance">, nowMs: number): boolean {
  try {
    const record = handle ? approvedPolicies.get(handle) : undefined;
    if (!record || !Number.isSafeInteger(nowMs) || nowMs < 0) return false;
    const { quality: q, provenance: p } = result; const { artifact: a, approval: pin } = record;
    return q.qualification === "RUNTIME_APPROVED" && q.preview === null &&
      (q.value === null ? q.band_code === null : (q.status === "available" || q.status === "provisional") && managerQualityBand(q.value) === q.band_code)
      && q.policy_id === a.policy.policy_id && q.policy_hash === a.policy.policy_hash
      && q.approved_policy_id === pin.approved_policy_id && q.comparable_basis_id === a.policy.comparable_basis_id
      && p.binding.comparable_basis_id === q.comparable_basis_id
      && p.binding.individual_evidence_binding_id === q.individual_evidence_binding_id
      && p.source_qualification === "SOURCE_VERIFIED" && same(p.scope, a.scope)
      && p.policy_id === a.policy.policy_id && p.policy_hash === a.policy.policy_hash
      && p.policy_revision === pin.policy_revision && p.config_hash === record.config_hash
      && p.formula_hash === a.policy.formula_hash && p.approval_ref === pin.approval_ref
      && p.approved_at_ms === pin.approved_at_ms && p.policy_valid_until_ms === pin.valid_until_ms
      && Number.isSafeInteger(p.source_as_of_ms) && Number.isSafeInteger(p.computed_at_ms)
      && p.source_as_of_ms >= pin.approved_at_ms && p.computed_at_ms >= p.source_as_of_ms
      && nowMs >= p.computed_at_ms && nowMs < pin.valid_until_ms
      && (q.value === null || nowMs - p.source_as_of_ms <= a.runtime_config.maximum_input_age_ms);
  } catch { return false; }
}
export function managerScorePublicationCurrent(handle: ApprovedManagerScorePolicy | null,
  result: Pick<ManagerScoreRuntimeResult,"quality"|"provenance">, nowMs:number): boolean {
  return result.quality.value!==null && managerScorePublicationPolicyCurrent(handle,result,nowMs);
}
/** Private retained-input compatibility, not approval by a JSON flag. A policy
 * introduced after the source cutoff cannot become original-as-published data.
 * Anchors/maturity/stress delta may change; observation/cost/block/flow/ownership
 * methods cannot be reconstructed from metrics and must remain identical. */
export function managerScoreRecalculationPolicy(handle:ApprovedManagerScorePolicy|null,sourceAsOf:number,now:number) {
  const r=handle?approvedPolicies.get(handle):undefined;
  if(!r||!Number.isSafeInteger(sourceAsOf)||!Number.isSafeInteger(now)||sourceAsOf<0||sourceAsOf>now||
    r.approval.approved_at_ms>sourceAsOf||r.approval.valid_until_ms<=now)return null;
  const p=r.artifact.policy,c=r.artifact.runtime_config;
  return freeze({identity_digest:hash(canonical({artifact:r.artifact,approval:r.approval})),
    method_digest:hash(canonical({formula_hash:p.formula_hash,comparable_basis_id:p.comparable_basis_id,
      duration_key:p.duration_key,observation_frequency:p.observation_frequency,calendar:p.calendar,timezone:p.timezone,
      currency:p.currency,cash_reference_id:p.cash_reference_id,cost_method:p.cost_method,
      required_costs:[...p.required_costs].sort(),block_manifest_id:p.block_manifest_id,stress_policy_id:p.stress_policy_id,
      grid_method_ref:c.grid_method_ref,flow_adjustment_method_ref:c.flow_adjustment_method_ref,
      ownership_method_ref:c.ownership_method_ref,fx_method_ref:c.fx_method_ref})),
    policy_revision:r.approval.policy_revision,stress_delta_bps:p.stress_delta_bps,
    approved_at_ms:r.approval.approved_at_ms,valid_until_ms:r.approval.valid_until_ms});
}
const metricsSchema = z.object(Object.fromEntries(Object.keys(MANAGER_SCORE_ATOMIC_WEIGHTS).map(key => [key, decimal.nullable()])) as Record<keyof ManagerScoreMetrics, z.ZodNullable<typeof decimal>>).strict();
const qualityFields = { comparable_basis_id: text, individual_evidence_binding_id: text.nullable(),
  window_start_ms: ms, window_end_ms: ms, as_of_ms: ms, observed_duration_ms: ms, currency: text,
  required_costs_complete: z.boolean(), stale: z.boolean(), data_valid: z.boolean(), reason_codes: z.array(text).max(32).optional() };

/** Explicit finite worker envelope. No process, scheduler, network or synchronous BFF computation is installed here. */
export class ManagerScoreRuntime {
  private inFlight = 0;
  private readonly limits: Readonly<ManagerScoreRuntimeLimits>;
  constructor(limits: ManagerScoreRuntimeLimits) {
    const ceilings: ManagerScoreRuntimeLimits = { maximum_observations: 50_000, maximum_blocks: 10_000,
      maximum_stress_subperiods: 100_000, maximum_input_bytes: 8 * 1024 * 1024, maximum_in_flight: 4 };
    if (Object.keys(ceilings).some(key => { const k = key as keyof ManagerScoreRuntimeLimits;
      return !Number.isSafeInteger(limits[k]) || limits[k] < 1 || limits[k] > ceilings[k]; }))
      throw new ManagerScoreRuntimeError("SCORE_RUNTIME_LIMIT_INVALID");
    this.limits = Object.freeze({ ...limits });
  }

  /** No queue: overload rejects before retaining a source payload. Primary worker coordinates scheduling/lease. */
  async calculate(task: ManagerScoreRuntimeTask): Promise<ManagerScoreRuntimeResult> {
    if (this.inFlight >= this.limits.maximum_in_flight) throw new ManagerScoreRuntimeError("SCORE_RUNTIME_CAPACITY");
    this.inFlight += 1;
    try {
      if (!task || ![Object.prototype, null].includes(Object.getPrototypeOf(task))) throw new ManagerScoreRuntimeError("SCORE_RUNTIME_INPUT_INVALID");
      const fields = Object.getOwnPropertyDescriptors(task);
      if (Object.values(fields).some(field => !Object.prototype.hasOwnProperty.call(field, "value")))
        throw new ManagerScoreRuntimeError("SCORE_RUNTIME_INPUT_INVALID");
      const handle = fields.policy?.value as ApprovedManagerScorePolicy | null;
      const record = handle ? approvedPolicies.get(handle) : undefined;
      const payload = Object.fromEntries(Object.entries(fields).filter(([key]) => key !== "policy").map(([key, field]) => [key, field.value])) as Omit<ManagerScoreRuntimeTask, "policy">;
      this.assertBoundedPayload(payload);
      // Capture bytes and detached data before yielding; caller mutation cannot change a scheduled result.
      const serialized = JSON.stringify(payload);
      if (Buffer.byteLength(serialized, "utf8") > this.limits.maximum_input_bytes) throw new ManagerScoreRuntimeError("SCORE_RUNTIME_INPUT_BOUND");
      const captured = JSON.parse(serialized) as Omit<ManagerScoreRuntimeTask, "policy">;
      const scope = scopeSchema.parse(captured.scope); const binding = bindingSchema.parse(captured.binding);
      const stages = scope.environment === "paper" ? ["PAPER"] : scope.environment === "sandbox" ? ["SANDBOX"] : ["CANARY", "LIVE"];
      if (binding.stage_filter.some(stage => !stages.includes(stage))) throw new ManagerScoreRuntimeError("SCORE_RUNTIME_INPUT_INVALID");
      z.enum(["METRICS", "PATH"]).parse(captured.input.kind);
      if(Object.hasOwn(captured,"metrics_dependency_digest")&&
        (captured.input.kind!=="METRICS"||!digest.safeParse(captured.metrics_dependency_digest).success))
        throw new ManagerScoreRuntimeError("SCORE_RUNTIME_INPUT_INVALID");
      text.parse(captured.source_revision); digest.parse(captured.source_set_digest); text.parse(captured.calculation_revision);
      z.enum(["SOURCE_VERIFIED", "TEST_ONLY"]).parse(captured.source_qualification); ms.parse(captured.computed_at_ms);
      text.nullable().parse(captured.expected_policy_revision);
      const pendingReasons: string[] = [];
      if (!record) pendingReasons.push(handle ? "SCORE_POLICY_HANDLE_NOT_APPROVED" : "RUNTIME_CALIBRATION_NOT_APPROVED");
      else {
        if (!same(scope, record.artifact.scope)) pendingReasons.push("SCORE_POLICY_SCOPE_MISMATCH");
        if (captured.expected_policy_revision !== record.approval.policy_revision) pendingReasons.push("SCORE_POLICY_REVISION_CHANGED");
        if (record.approval.approved_at_ms > captured.input.quality.as_of_ms || record.approval.valid_until_ms <= captured.computed_at_ms)
          pendingReasons.push("SCORE_POLICY_NOT_AVAILABLE_AS_OF");
      }
      if (captured.source_qualification !== "SOURCE_VERIFIED") pendingReasons.push("SCORE_SOURCE_NOT_QUALIFIED");
      await Promise.resolve();
      const policy = pendingReasons.length ? null : record!.artifact.policy;
      const config = record?.artifact.runtime_config;
      const q = captured.input.quality;
      const base = z.object(qualityFields).strict().parse(captured.input.kind === "METRICS"
        ? Object.fromEntries(Object.entries(q).filter(([key]) => !["sample_count", "complete_block_count", "metrics"].includes(key))) : q);
      if (!same([binding.window_start_ms, binding.window_end_ms, binding.comparable_basis_id, binding.individual_evidence_binding_id],
        [base.window_start_ms, base.window_end_ms, base.comparable_basis_id, base.individual_evidence_binding_id]))
        throw new ManagerScoreRuntimeError("SCORE_RUNTIME_INPUT_INVALID");
      if (base.as_of_ms > captured.computed_at_ms) throw new ManagerScoreRuntimeError("SCORE_RUNTIME_INPUT_INVALID");
      const invalidWindow = !!config && (base.window_end_ms - base.window_start_ms < config.minimum_window_ms
        || base.window_end_ms - base.window_start_ms > config.maximum_window_ms);
      let rawMetrics: ManagerScoreMetrics | null = null;
      let pathResult: ManagerScorePathResult | null = null;
      let samples = 0; let blocks = 0;
      if (captured.input.kind === "METRICS") {
        rawMetrics = metricsSchema.parse(captured.input.quality.metrics);
        samples = safeCount.parse(captured.input.quality.sample_count); blocks = safeCount.parse(captured.input.quality.complete_block_count);
      } else {
        const path = this.parsePath(captured.input.path);
        if (path.window_start_ms !== base.window_start_ms || path.window_end_ms !== base.window_end_ms
          || path.currency !== base.currency || path.required_costs_complete !== base.required_costs_complete
          || policy && path.stress_delta_bps !== policy.stress_delta_bps) throw new ManagerScoreRuntimeError("SCORE_RUNTIME_INPUT_INVALID");
        if (policy) { pathResult = calculateManagerScoreMetrics(path); rawMetrics = pathResult.metrics;
          samples = pathResult.sample_count; blocks = pathResult.complete_block_count; }
      }
      const missing = Object.fromEntries(Object.keys(MANAGER_SCORE_ATOMIC_WEIGHTS).map(key => [key, null])) as ManagerScoreMetrics;
      const quality = calculateManagerQualityScore({ ...base, policy, metrics: rawMetrics ?? missing,
        sample_count: samples, complete_block_count: blocks,
        stale: base.stale || !!config && captured.computed_at_ms - base.as_of_ms > config.maximum_input_age_ms,
        data_valid: base.data_valid && !invalidWindow,
        reason_codes: [...new Set([...(base.reason_codes ?? []), ...pendingReasons, ...(invalidWindow ? ["SCORE_POLICY_WINDOW_NOT_SUPPORTED"] : []), ...(pathResult?.reason_codes ?? [])])],
      });
      return freeze({ quality, raw_metrics: rawMetrics,
        path_summary: pathResult ? { sample_count: pathResult.sample_count, complete_block_count: pathResult.complete_block_count,
          incomplete_tail_duration_ms: pathResult.incomplete_tail_duration_ms, reason_codes: pathResult.reason_codes } : null,
        provenance: { scope, binding: { ...binding, stage_filter: [...binding.stage_filter].sort() },
          source_revision: captured.source_revision, source_set_digest: captured.source_set_digest,
          source_qualification: captured.source_qualification, input_digest: hash(serialized), calculation_revision: captured.calculation_revision,
          computed_at_ms: captured.computed_at_ms, source_as_of_ms: base.as_of_ms, policy_id: record?.artifact.policy.policy_id ?? null,
          policy_hash: record?.artifact.policy.policy_hash ?? null, policy_revision: record?.approval.policy_revision ?? null,
          config_hash: record?.config_hash ?? null, formula_hash: record?.artifact.policy.formula_hash ?? null,
          approval_ref: record?.approval.approval_ref ?? null, approved_at_ms: record?.approval.approved_at_ms ?? null,
          policy_valid_until_ms: record?.approval.valid_until_ms ?? null } });
    } catch (error) {
      if (error instanceof ManagerScoreRuntimeError) throw error;
      throw new ManagerScoreRuntimeError("SCORE_RUNTIME_INPUT_INVALID");
    } finally { this.inFlight -= 1; }
  }

  private parsePath(path: ManagerScorePathInput): ManagerScorePathInput {
    return z.object({ observations: z.array(z.object({ from_ms: ms, to_ms: ms, net_return: decimal, cash_return: decimal,
      stress_subperiods: z.array(z.object({ net_return: decimal, opening_capital: decimal,
        gross_executed_notional: decimal.nullable(), turnover_verified: z.boolean() }).strict()).max(this.limits.maximum_stress_subperiods).nullable() }).strict()).max(this.limits.maximum_observations),
      window_start_ms: ms, window_end_ms: ms, expected_observations: safeCount, grid_verified: z.boolean(),
      required_costs_complete: z.boolean(), currency: text, cash_currency: text,
      blocks: z.array(z.object({ from_ms: ms, to_ms: ms, complete: z.boolean(), expected_observations: safeCount }).strict()).max(this.limits.maximum_blocks),
      block_manifest_registered_at_ms: ms, stress_delta_bps: decimal }).strict().parse(path);
  }

  private assertBoundedPayload(payload: Omit<ManagerScoreRuntimeTask, "policy">): void {
    // Bound before stringify/validation and reject accessors/cycles instead of executing source objects.
    let bytes = 0; let nodes = 0; const ancestors = new Set<object>();
    const visit = (value: unknown, depth: number): void => {
      if (++nodes > this.limits.maximum_input_bytes || depth > 16) throw new ManagerScoreRuntimeError("SCORE_RUNTIME_INPUT_BOUND");
      if (typeof value === "string") bytes += Buffer.byteLength(value, "utf8") + 2;
      else if (value === undefined || value === null || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)) bytes += 24;
      else if (typeof value === "object") {
        if (ancestors.has(value) || !Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
          throw new ManagerScoreRuntimeError("SCORE_RUNTIME_INPUT_INVALID");
        ancestors.add(value);
        for (const key of Object.keys(value)) { const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
          if (!Object.prototype.hasOwnProperty.call(descriptor, "value")) throw new ManagerScoreRuntimeError("SCORE_RUNTIME_INPUT_INVALID");
          bytes += Buffer.byteLength(key, "utf8") + 4; visit(descriptor.value, depth + 1); }
        ancestors.delete(value);
      } else throw new ManagerScoreRuntimeError("SCORE_RUNTIME_INPUT_INVALID");
      if (bytes > this.limits.maximum_input_bytes) throw new ManagerScoreRuntimeError("SCORE_RUNTIME_INPUT_BOUND");
    };
    visit(payload, 0);
    if (payload.input?.kind === "PATH") {
      const path = payload.input.path;
      if (!Array.isArray(path?.observations) || !Array.isArray(path?.blocks)) throw new ManagerScoreRuntimeError("SCORE_RUNTIME_INPUT_INVALID");
      if (path.observations.length > this.limits.maximum_observations || path.blocks.length > this.limits.maximum_blocks)
        throw new ManagerScoreRuntimeError("SCORE_RUNTIME_INPUT_BOUND");
      let stress = 0;
      for (const observation of path.observations) { stress += observation.stress_subperiods?.length ?? 0;
        if (stress > this.limits.maximum_stress_subperiods) throw new ManagerScoreRuntimeError("SCORE_RUNTIME_INPUT_BOUND"); }
    }
  }
}
