import { createHash } from "node:crypto";
import { z } from "zod";
import { accessDigest } from "./access-policy";
import { financialStage, utcMilliseconds } from "./foundation.contract";
import { publicationDigest } from "./publication.contract";
import { calculateManagerRegimeFit, MANAGER_REGIME_FORMULA, type ManagerRegimeInput,
  type ManagerRegimePolicy, type ManagerRegimeReference } from "./manager-regime";
import { managerRegimeDecimal as decimal, managerRegimeText as text, managerRegimeRef as ref,
  managerRegimeScope, managerRegimeSubjectBinding, managerRegimeResearchBinding, managerRegimeFeatures,
  managerRegimePopulationMember, managerRegimePublication,
  type ManagerRegimeScope, type ManagerRegimeSubjectBinding, type ManagerRegimePublication } from "./manager-regime-publication.contract";

// Private reviewed artifacts, NOT public JSON approval or source commissioning.
const positiveCount = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const receipt = z.object({ ref, available_at_ms: utcMilliseconds }).strict();
const policySchema = z.object({ formula_id: z.literal(MANAGER_REGIME_FORMULA), qualification: z.literal("RUNTIME_APPROVED"),
  policy_version: ref, policy_hash: publicationDigest, approved_policy_id: ref, source_locator: ref,
  feature_schema_version: ref, features: z.array(ref).min(1).max(3),
  calibration_snapshot_id: ref, calibration_hash: publicationDigest,
  calibration_cutoff_ms: utcMilliseconds, frozen_at_ms: utcMilliseconds,
  scaler: z.array(z.object({ feature: ref, median: decimal, mad: decimal, source_locator: ref }).strict()).min(1).max(3),
  horizon_ms: positiveCount, min_neighbors: positiveCount, min_effective_sample_size: decimal,
  min_distinct_episodes: positiveCount, max_distance: decimal, max_feature_age_ms: positiveCount,
  min_current_feature_coverage: decimal, kernel_bandwidth: decimal, overlap_policy_id: ref,
  empirical_quantiles: z.array(decimal).max(9), max_reference_windows: z.number().int().min(1).max(4096),
  canonical_decimal_places: z.number().int().min(6).max(15) }).strict();
const featureDefinition = z.object({ feature_schema_version: ref, universe_id: ref, venue: ref,
  benchmark_ref: ref, basket_construction_ref: ref, market_returns_ref: ref, grid_ref: ref,
  calendar_ref: ref, timezone_ref: ref, closed_bar_rule_ref: ref, missingness_ref: ref,
  overlap_policy_ref: ref, episode_policy_ref: ref,
  features: z.array(z.object({ feature: ref, unit: ref, lookback_bars: positiveCount, method_ref: ref }).strict()).min(1).max(3) }).strict();
const economicBasis = z.object({ economic_domain: z.enum(["ACTUAL", "PAPER", "SANDBOX"]),
  account_mode: ref, currency: ref, comparable_basis_id: ref }).strict();
const policyArtifact = z.object({ schema_version: z.literal("portal.execution.manager-regime-policy-runtime.v1"),
  scope: managerRegimeScope, policy: policySchema, feature_definition: featureDefinition, economic_basis: economicBasis,
  formula_hash: publicationDigest, calculation_revision: ref }).strict();
const policyApproval = z.object({ artifact_sha256: publicationDigest, scope: managerRegimeScope,
  policy_version: ref, policy_hash: publicationDigest, approved_policy_id: ref, policy_revision: ref,
  calibration_snapshot_id: ref, calibration_hash: publicationDigest, feature_definition_hash: publicationDigest,
  formula_hash: publicationDigest, calculation_revision: ref, approval_ref: ref,
  approved_at_ms: utcMilliseconds, available_at_ms: utcMilliseconds, valid_until_ms: utcMilliseconds }).strict();
const archiveBoundary = z.object({ alpha_id: text, archived_at_ms: utcMilliseconds,
  available_at_ms: utcMilliseconds, manifest_hash: publicationDigest, source_locator: ref }).strict();
const deployment = z.object({ deployment_id: text, created_at_ms: utcMilliseconds,
  effective_from_ms: utcMilliseconds, effective_to_ms: utcMilliseconds.nullable(),
  archive_monitoring: z.object({ approval_id: ref, archive_manifest_hash: publicationDigest, deployment_id: text,
    binding: managerRegimeResearchBinding, approved_at_ms: utcMilliseconds,
    available_at_ms: utcMilliseconds, source_locator: ref }).strict().nullable() }).strict();
const population = z.array(managerRegimePopulationMember).min(1).max(10_000);
const reference = z.object({ reference_window_id: ref, individual_evidence_binding_id: ref,
  manifest_hash: publicationDigest, source_locator: ref, population,
  binding: managerRegimeResearchBinding, source_kind: z.enum(["research", "deployment"]),
  economic_domain: ref, account_mode: ref,
  stage: z.enum(["ResearchIS", "ResearchOOS", "ResearchValidation", "Paper", "Sandbox", "Canary", "Live"]),
  evidence_kind: z.enum(["research_simulated", "forward_simulated", "actual"]), deployment: deployment.nullable(),
  features: managerRegimeFeatures, outcome_start_ms: utcMilliseconds, outcome_end_ms: utcMilliseconds,
  outcome_available_at_ms: utcMilliseconds, net_twr: decimal.nullable(), cost_assumptions_id: ref,
  split_proof: z.object({ manifest_hash: publicationDigest, outcome_crosses_split: z.boolean(),
    purged: z.boolean(), params_selected_after_outcome: z.boolean() }).strict(), episode_id: ref }).strict();
const evidenceArtifact = z.object({ schema_version: z.literal("portal.execution.manager-regime-source-evidence.v1"),
  scope: managerRegimeScope, binding: managerRegimeSubjectBinding, population,
  partition: z.object({ economic_domain: z.enum(["ACTUAL", "PAPER", "SANDBOX"]), currency: ref,
    basis: ref, native_profile_ref: ref, domain_proof_ref: ref }).strict(), account_mode: ref,
  source_revision: text, projection_generation: text, source_set_digest: publicationDigest,
  source_as_of_ms: utcMilliseconds, source_qualification: z.literal("SOURCE_VERIFIED"),
  maximum_source_age_ms: positiveCount, evidence_manifest_hash: publicationDigest,
  research_binding: managerRegimeResearchBinding, current: managerRegimeFeatures,
  strategy_lifecycle: z.enum(["active", "archived"]), archive_boundary: archiveBoundary.nullable(),
  evaluation_at_ms: utcMilliseconds, evidence_snapshot_id: ref,
  evidence_snapshot_available_at_ms: utcMilliseconds, revision: ref, supersedes_revision: ref.nullable(),
  references: z.array(reference).max(4096) }).strict();
/** Receipt inputs below come only from a separately accepted source/method manifest.
 * A null receipt produces typed ineligibility, never an invented positive attestation. */
const referencePin = z.object({ reference_window_id: ref, reference_digest: publicationDigest,
  population_digest: publicationDigest, binding_manifest: receipt, feature_manifest: receipt,
  outcome_manifest: receipt, episode_manifest: receipt,
  reconciliation: receipt.nullable(), complete_costs: receipt.nullable(),
  split_boundaries: receipt.nullable(), embargo: receipt.nullable(),
  untouched: receipt.nullable(), parameter_selection: receipt,
  archive_monitoring_approval: receipt.nullable() }).strict();
const evidenceAcceptance = z.object({ artifact_sha256: publicationDigest, scope: managerRegimeScope,
  binding_digest: publicationDigest, population_census_digest: publicationDigest, partition_digest: publicationDigest,
  source_revision: text, projection_generation: text, source_set_digest: publicationDigest,
  source_as_of_ms: utcMilliseconds, source_qualification: z.literal("SOURCE_VERIFIED"),
  evidence_snapshot_id: ref, evidence_manifest_hash: publicationDigest, research_binding_digest: publicationDigest,
  current_features_digest: publicationDigest, reference_census_digest: publicationDigest,
  feature_definition_hash: publicationDigest, source_method_ref: ref, acceptance_ref: ref,
  binding_manifest: receipt, current_features_manifest: receipt, archive_boundary_manifest: receipt.nullable(),
  references: z.array(referencePin).max(4096), accepted_at_ms: utcMilliseconds,
  available_at_ms: utcMilliseconds, valid_until_ms: utcMilliseconds }).strict();
export type ManagerRegimePolicyArtifact = z.infer<typeof policyArtifact>;
export type ManagerRegimePolicyApprovalPin = z.infer<typeof policyApproval>;
export type ManagerRegimeEvidenceArtifact = z.infer<typeof evidenceArtifact>;
export type ManagerRegimeSourceAcceptancePin = z.infer<typeof evidenceAcceptance>;
declare const approvedPolicy: unique symbol, verifiedEvidence: unique symbol;
export interface ApprovedManagerRegimePolicy { readonly [approvedPolicy]: true }
export interface VerifiedManagerRegimeEvidence { readonly [verifiedEvidence]: true }
interface PolicyRecord { artifact: ManagerRegimePolicyArtifact; approval: ManagerRegimePolicyApprovalPin }
interface EvidenceRecord { artifact: ManagerRegimeEvidenceArtifact; acceptance: ManagerRegimeSourceAcceptancePin;
  input: Omit<ManagerRegimeInput, "policy" | "allow_test_only"> }
const policies = new WeakMap<ApprovedManagerRegimePolicy, PolicyRecord>();
const evidenceRecords = new WeakMap<VerifiedManagerRegimeEvidence, EvidenceRecord>();
const ARTIFACT_CEILING = 8 * 1024 * 1024;
const POLICY_CEILING = 65_536;
function fail(condition: unknown, code: string): asserts condition { if (!condition) throw new Error(code); }
const same = (a: unknown, b: unknown) => accessDigest(a) === accessDigest(b);
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { for (const item of Object.values(value)) freeze(item); Object.freeze(value); }
  return value;
}
/** Bound detached plain data before schema work; disallow getters/functions/cycles/host objects. */
function capture(value: unknown, byteLimit: number): unknown {
  let nodes = 0, textBytes = 0; const seen = new Set<object>();
  const walk = (item: unknown, depth: number): void => {
    fail(++nodes <= 250_000 && depth <= 32, "REGIME_RUNTIME_INPUT_BOUND");
    if (typeof item === "string") { textBytes += Buffer.byteLength(item, "utf8");
      fail(textBytes <= byteLimit, "REGIME_RUNTIME_INPUT_BOUND"); return; }
    if (item === null || typeof item === "boolean" || typeof item === "number" && Number.isFinite(item)) return;
    fail(typeof item === "object" && item !== null && !seen.has(item), "REGIME_RUNTIME_INPUT_INVALID");
    const array = Array.isArray(item);
    fail(array || [Object.prototype, null].includes(Object.getPrototypeOf(item)), "REGIME_RUNTIME_INPUT_INVALID");
    fail(Object.getOwnPropertySymbols(item).length === 0, "REGIME_RUNTIME_INPUT_INVALID");
    if (array) fail(item.length <= 32_768 && Object.getPrototypeOf(item) === Array.prototype, "REGIME_RUNTIME_INPUT_BOUND");
    seen.add(item);
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(item))) {
      if (array && key === "length") continue;
      fail(descriptor.enumerable && Object.prototype.hasOwnProperty.call(descriptor, "value"), "REGIME_RUNTIME_INPUT_INVALID");
      if (array) fail(/^(?:0|[1-9]\d*)$/.test(key), "REGIME_RUNTIME_INPUT_INVALID");
      textBytes += Buffer.byteLength(key, "utf8"); fail(textBytes <= byteLimit, "REGIME_RUNTIME_INPUT_BOUND");
      walk(descriptor.value, depth + 1);
    }
    seen.delete(item);
  };
  walk(value, 0); const bytes = JSON.stringify(value);
  fail(Buffer.byteLength(bytes, "utf8") <= byteLimit, "REGIME_RUNTIME_INPUT_BOUND"); return JSON.parse(bytes);
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key =>
    `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function sha256(bytes: string | Uint8Array): string { return `sha256:${createHash("sha256").update(bytes).digest("hex")}`; }
function decode(bytes: string | Uint8Array | null, limit: number): { bytes: Buffer; value: unknown } {
  fail(typeof bytes === "string" || bytes instanceof Uint8Array, "REGIME_ARTIFACT_NOT_PUBLISHED");
  const length = typeof bytes === "string" ? Buffer.byteLength(bytes, "utf8") : bytes.byteLength;
  fail(length > 0 && length <= limit, "REGIME_ARTIFACT_BYTE_LIMIT");
  const detached = typeof bytes === "string" ? Buffer.from(bytes, "utf8") : Buffer.from(bytes);
  return { bytes: detached, value: capture(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(detached)), limit) };
}
export function managerRegimePolicyHash(policy: Omit<ManagerRegimePolicy, "policy_hash">): string {
  const { policy_hash: _ignored, ...payload } = policy as ManagerRegimePolicy; return sha256(canonical(payload));
}
type Absence = { status: "NOT_PUBLISHED"; reason_codes: string[] };
const absent = (error: unknown): Absence => ({ status: "NOT_PUBLISHED", reason_codes: [error instanceof Error &&
  /^REGIME_[A-Z_]+$/.test(error.message) ? error.message : "REGIME_ARTIFACT_INVALID"] });
const policyCurrent = (r: PolicyRecord, now: number) => Number.isSafeInteger(now) && now >= r.approval.available_at_ms && now < r.approval.valid_until_ms;
const evidenceCurrent = (r: EvidenceRecord, now: number) => Number.isSafeInteger(now) && now >= r.artifact.source_as_of_ms &&
  now >= r.acceptance.available_at_ms && now < r.acceptance.valid_until_ms && now - r.artifact.source_as_of_ms <= r.artifact.maximum_source_age_ms;
export function loadApprovedManagerRegimePolicy(input: { artifact_bytes: string | Uint8Array | null;
  approval_pin: ManagerRegimePolicyApprovalPin | null; scope: ManagerRegimeScope; as_of_ms: number }):
  { status: "READY"; handle: ApprovedManagerRegimePolicy } | Absence {
  try {
    fail(input.approval_pin !== null, "REGIME_POLICY_NOT_APPROVED");
    const decoded = decode(input.artifact_bytes, POLICY_CEILING);
    const pin = policyApproval.parse(capture(input.approval_pin, POLICY_CEILING));
    fail(sha256(decoded.bytes) === pin.artifact_sha256, "REGIME_POLICY_ARTIFACT_HASH_MISMATCH");
    const a = policyArtifact.parse(decoded.value), p = a.policy;
    const scope = managerRegimeScope.parse(capture(input.scope, 4096)), now = utcMilliseconds.parse(input.as_of_ms);
    fail(same(scope, a.scope) && same(scope, pin.scope), "REGIME_POLICY_SCOPE_MISMATCH");
    fail(p.policy_version === pin.policy_version && p.policy_hash === pin.policy_hash &&
      p.approved_policy_id === pin.approved_policy_id && managerRegimePolicyHash(p) === p.policy_hash &&
      p.calibration_snapshot_id === pin.calibration_snapshot_id && p.calibration_hash === pin.calibration_hash &&
      accessDigest(a.feature_definition) === pin.feature_definition_hash && a.formula_hash === pin.formula_hash &&
      a.calculation_revision === pin.calculation_revision, "REGIME_POLICY_APPROVAL_PIN_MISMATCH");
    fail(p.calibration_cutoff_ms <= p.frozen_at_ms && p.frozen_at_ms <= pin.approved_at_ms &&
      pin.approved_at_ms <= pin.available_at_ms && pin.available_at_ms <= now && pin.valid_until_ms > pin.available_at_ms,
    "REGIME_POLICY_NOT_AVAILABLE_AS_OF");
    const d = a.feature_definition;
    fail(d.feature_schema_version === p.feature_schema_version && d.overlap_policy_ref === p.overlap_policy_id &&
      new Set(p.features).size === p.features.length && same(d.features.map(f => f.feature), p.features) &&
      same(p.scaler.map(f => f.feature), p.features) && p.scaler.every(s => Number(s.mad) > 0 && Number.isFinite(Number(s.mad) * 1.4826)) &&
      p.min_neighbors <= p.max_reference_windows && p.min_distinct_episodes <= p.max_reference_windows &&
      Number(p.min_effective_sample_size) >= 1 && Number(p.min_effective_sample_size) <= p.max_reference_windows &&
      Number(p.max_distance) > 0 && Number(p.kernel_bandwidth) > 0 &&
      Number(p.min_current_feature_coverage) > 0 && Number(p.min_current_feature_coverage) <= 1 &&
      p.empirical_quantiles.every(q => Number(q) >= 0 && Number(q) <= 1) &&
      new Set(p.empirical_quantiles.map(Number)).size === p.empirical_quantiles.length, "REGIME_POLICY_CONFIG_INVALID");
    const record = freeze({ artifact: a, approval: pin }); fail(policyCurrent(record, now), "REGIME_POLICY_NOT_CURRENT");
    const handle = Object.freeze({}) as ApprovedManagerRegimePolicy; policies.set(handle, record); return { status: "READY", handle };
  } catch (error) { return absent(error); }
}
type Population = ManagerRegimeEvidenceArtifact["population"];
const tupleKey = (m: Population[number]) => JSON.stringify([m.tuple.alpha_id, m.tuple.alpha_version_id,
  m.tuple.portfolio_id, m.tuple.deployment_id, m.tuple.account_id]);
const censusKey = (m: Population[number]) => JSON.stringify([tupleKey(m), m.stage]);
const populationDigest = (p: Population) => accessDigest([...new Set(p.map(tupleKey))].sort());
const censusDigest = (p: Population) => accessDigest(p.map(censusKey).sort());
const referenceCensus = (a: ManagerRegimeEvidenceArtifact) => accessDigest(a.references.map(r => ({
  id: r.reference_window_id, digest: accessDigest(r), population_digest: censusDigest(r.population) })).sort((x, y) => x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
const IDENTITY = ["alpha_id", "research_binding_id", "run_id", "strategy_version", "params_hash", "trade_params_hash",
  "param_mapping_version", "universe_id", "venue", "data_snapshot_id", "split_manifest_hash"] as const;
function bindingKnown(b: z.infer<typeof managerRegimeResearchBinding>, cutoff: number): boolean {
  return b.binding_created_at_ms <= b.binding_effective_at_ms && b.run_completed_at_ms <= b.binding_effective_at_ms &&
    [b.binding_created_at_ms, b.binding_effective_at_ms, b.run_completed_at_ms, b.artifact_available_at_ms,
      b.evidence_available_at_ms].every(t => t <= cutoff);
}
const receiptKnown = (r: z.infer<typeof receipt> | null, cutoff: number) => r !== null && r.available_at_ms <= cutoff;
export function loadVerifiedManagerRegimeEvidence(input: { artifact_bytes: string | Uint8Array | null;
  source_pin: ManagerRegimeSourceAcceptancePin | null; scope: ManagerRegimeScope; as_of_ms: number }):
  { status: "READY"; handle: VerifiedManagerRegimeEvidence } | Absence {
  try {
    fail(input.source_pin !== null, "REGIME_SOURCE_NOT_ACCEPTED");
    const decoded = decode(input.artifact_bytes, ARTIFACT_CEILING);
    const pin = evidenceAcceptance.parse(capture(input.source_pin, ARTIFACT_CEILING));
    fail(sha256(decoded.bytes) === pin.artifact_sha256, "REGIME_EVIDENCE_ARTIFACT_HASH_MISMATCH");
    const a = evidenceArtifact.parse(decoded.value), b = a.binding, scope = managerRegimeScope.parse(capture(input.scope, 4096));
    const now = utcMilliseconds.parse(input.as_of_ms), cutoff = a.source_as_of_ms;
    fail(same(a.scope, scope) && same(pin.scope, scope), "REGIME_EVIDENCE_SCOPE_MISMATCH");
    fail(pin.binding_digest === accessDigest(b) && pin.population_census_digest === censusDigest(a.population) &&
      pin.partition_digest === accessDigest(a.partition) && b.partition_digest === pin.partition_digest &&
      pin.source_revision === a.source_revision && pin.projection_generation === a.projection_generation &&
      pin.source_set_digest === a.source_set_digest && pin.source_as_of_ms === cutoff &&
      pin.evidence_snapshot_id === a.evidence_snapshot_id && pin.evidence_manifest_hash === a.evidence_manifest_hash &&
      pin.research_binding_digest === accessDigest(a.research_binding) && pin.current_features_digest === accessDigest(a.current) &&
      pin.reference_census_digest === referenceCensus(a), "REGIME_EVIDENCE_ACCEPTANCE_PIN_MISMATCH");
    fail(pin.accepted_at_ms <= pin.available_at_ms && pin.available_at_ms <= cutoff && cutoff <= now &&
      pin.valid_until_ms > pin.available_at_ms && a.evaluation_at_ms <= cutoff &&
      a.evidence_snapshot_available_at_ms <= cutoff && receiptKnown(pin.binding_manifest, a.evaluation_at_ms) &&
      receiptKnown(pin.current_features_manifest, a.evaluation_at_ms), "REGIME_EVIDENCE_NOT_AVAILABLE_AS_OF");
    const allowedStages = scope.environment === "paper" ? ["PAPER"] : scope.environment === "sandbox" ? ["SANDBOX"] : ["CANARY", "LIVE"];
    const economicDomain = scope.environment === "paper" ? "PAPER" : scope.environment === "sandbox" ? "SANDBOX" : "ACTUAL";
    const keys = new Set(a.population.map(censusKey));
    fail(keys.size === a.population.length && populationDigest(a.population) === b.tuple_population_digest &&
      b.stage_filter.every(s => allowedStages.includes(s)) && a.partition.economic_domain === economicDomain &&
      a.partition.basis === b.comparable_basis_id && a.population.every(m => m.tuple.alpha_id === b.alpha_id &&
        m.tuple.alpha_version_id === b.alpha_version_id && b.stage_filter.includes(m.stage) &&
        (b.subject_type !== "deployment" || m.tuple.deployment_id === b.subject_id)), "REGIME_SUBJECT_POPULATION_MISMATCH");
    fail(a.research_binding.alpha_id === b.alpha_id && bindingKnown(a.research_binding, a.evaluation_at_ms), "REGIME_BINDING_UNVERIFIED_OR_BACKDATED");
    fail(a.current.available_at_ms <= a.evaluation_at_ms && a.current.feature_cutoff_ms <= a.current.closed_through_ms &&
      a.current.closed_through_ms <= a.evaluation_at_ms && a.current.feed_lag_ms <= a.evaluation_at_ms - a.current.feature_cutoff_ms,
    "REGIME_CURRENT_FEATURE_NOT_KNOWN");
    fail(a.strategy_lifecycle === "archived" ? a.archive_boundary !== null &&
      a.archive_boundary.alpha_id === b.alpha_id && a.archive_boundary.archived_at_ms <= a.archive_boundary.available_at_ms &&
      a.archive_boundary.available_at_ms <= cutoff && receiptKnown(pin.archive_boundary_manifest, cutoff) : a.archive_boundary === null,
    "REGIME_ARCHIVE_BOUNDARY_UNVERIFIED");
    const pins = new Map(pin.references.map(r => [r.reference_window_id, r]));
    fail(pins.size === pin.references.length && pins.size === a.references.length &&
      new Set(a.references.map(r => r.reference_window_id)).size === a.references.length, "REGIME_REFERENCE_CENSUS_MISMATCH");
    const materialized: ManagerRegimeReference[] = a.references.map(r => {
      const p = pins.get(r.reference_window_id);
      fail(p && p.reference_digest === accessDigest(r) && p.population_digest === censusDigest(r.population) &&
        new Set(r.population.map(censusKey)).size === r.population.length && r.population.every(m => keys.has(censusKey(m))) &&
        IDENTITY.every(k => r.binding[k] === a.research_binding[k]) &&
        r.economic_domain === a.partition.economic_domain && r.account_mode === a.account_mode,
      "REGIME_REFERENCE_POPULATION_OR_BINDING_MISMATCH");
      const research = r.source_kind === "research";
      const forwardStage = { Paper: "PAPER", Sandbox: "SANDBOX", Canary: "CANARY", Live: "LIVE" } as const;
      fail(research ? r.deployment === null && ["ResearchIS", "ResearchOOS", "ResearchValidation"].includes(r.stage) :
        r.deployment !== null && !["ResearchIS", "ResearchOOS", "ResearchValidation"].includes(r.stage) &&
        r.population.every(m => m.tuple.deployment_id === r.deployment!.deployment_id &&
          m.stage === forwardStage[r.stage as keyof typeof forwardStage]), "REGIME_REFERENCE_SOURCE_KIND_MISMATCH");
      const monitoring = r.deployment?.archive_monitoring ?? null;
      if (monitoring) fail(monitoring.deployment_id === r.deployment!.deployment_id &&
        IDENTITY.every(k => monitoring.binding[k] === r.binding[k]) &&
        (p.archive_monitoring_approval === null || p.archive_monitoring_approval.ref === monitoring.approval_id),
      "REGIME_MONITORING_APPROVAL_UNVERIFIED");
      const bindingTimes = (b: z.infer<typeof managerRegimeResearchBinding>) => [b.binding_created_at_ms,
        b.binding_effective_at_ms, b.run_completed_at_ms, b.artifact_available_at_ms, b.evidence_available_at_ms];
      const proofTimes = Object.values(p).flatMap(x => x !== null && typeof x === "object" &&
        "available_at_ms" in x ? [x.available_at_ms] : []);
      // Private known-at watermark only; original feature/outcome/binding timestamps are never overwritten.
      // Unknown references are excluded individually BEFORE the calculator's binding/backdate checks.
      const sourceProofAvailableAt = Math.max(...proofTimes, ...bindingTimes(r.binding), r.features.available_at_ms,
        r.outcome_end_ms, r.outcome_available_at_ms, ...(r.deployment ? [r.deployment.created_at_ms,
          r.deployment.effective_from_ms] : []), ...(monitoring ? [monitoring.approved_at_ms,
          monitoring.available_at_ms, ...bindingTimes(monitoring.binding)] : []));
      // No approval flags accepted from the artifact. These assertions derive from the independent acceptance pin.
      const { population: _population, binding, deployment: d, split_proof, ...facts } = r;
      return { ...facts, source_proof_available_at_ms: sourceProofAvailableAt, binding: { ...binding, verified: true },
        reconciled: p.reconciliation !== null, required_costs_complete: p.complete_costs !== null,
        deployment: d === null ? null : { ...d, monitoring_approved: monitoring !== null && p.archive_monitoring_approval !== null,
          archive_monitoring: monitoring === null ? null : { ...monitoring, binding: { ...monitoring.binding, verified: true } } },
        split_proof: { ...split_proof, boundaries_verified: p.split_boundaries !== null,
          embargo_verified: p.embargo !== null, untouched: p.untouched !== null } };
    });
    const calculationInput: EvidenceRecord["input"] = { binding: { ...a.research_binding, verified: true }, current: a.current,
      economic_domain: a.partition.economic_domain, account_mode: a.account_mode, strategy_lifecycle: a.strategy_lifecycle,
      archive_boundary: a.archive_boundary === null ? null : { ...a.archive_boundary, verified: true },
      as_of_ms: cutoff, evaluation_at_ms: a.evaluation_at_ms, evidence_snapshot_id: a.evidence_snapshot_id,
      evidence_snapshot_available_at_ms: a.evidence_snapshot_available_at_ms, revision: a.revision,
      supersedes_revision: a.supersedes_revision, references: materialized };
    const record = freeze({ artifact: a, acceptance: pin, input: calculationInput });
    fail(evidenceCurrent(record, now), "REGIME_EVIDENCE_NOT_CURRENT");
    const handle = Object.freeze({}) as VerifiedManagerRegimeEvidence; evidenceRecords.set(handle, record); return { status: "READY", handle };
  } catch (error) { return absent(error); }
}
/** Private installation refresh/revocation only; never HTTP management endpoints. */
export const revokeApprovedManagerRegimePolicy = (handle: ApprovedManagerRegimePolicy): boolean => policies.delete(handle);
export const revokeVerifiedManagerRegimeEvidence = (handle: VerifiedManagerRegimeEvidence): boolean => evidenceRecords.delete(handle);
export interface ManagerRegimeRuntimeLimits { maximum_references: number; maximum_input_bytes: number;
  maximum_output_bytes: number; maximum_in_flight: number }
export interface ManagerRegimeRuntimeTask { policy: ApprovedManagerRegimePolicy | null; evidence: VerifiedManagerRegimeEvidence | null;
  scope: ManagerRegimeScope; binding: ManagerRegimeSubjectBinding; source_revision: string; projection_generation: string;
  source_set_digest: string; source_as_of_ms: number; source_qualification: "SOURCE_VERIFIED";
  calculation_revision: string; computed_at_ms: number }
const taskSchema = z.object({ scope: managerRegimeScope, binding: managerRegimeSubjectBinding, source_revision: text,
  projection_generation: text, source_set_digest: publicationDigest, source_as_of_ms: utcMilliseconds,
  source_qualification: z.literal("SOURCE_VERIFIED"), calculation_revision: ref, computed_at_ms: utcMilliseconds }).strict();
type CapturedTask = z.infer<typeof taskSchema>;
export type ManagerRegimeRuntimeResult = { status: "READY"; publication: ManagerRegimePublication } | Absence;
function captureTask(task: unknown, byteLimit: number): { policy: ApprovedManagerRegimePolicy | null;
  evidence: VerifiedManagerRegimeEvidence | null; payload: CapturedTask } {
  fail(typeof task === "object" && task !== null && [Object.prototype, null].includes(Object.getPrototypeOf(task)) &&
    Object.getOwnPropertySymbols(task).length === 0, "REGIME_RUNTIME_INPUT_INVALID");
  const descriptors = Object.getOwnPropertyDescriptors(task);
  fail(Object.keys(descriptors).length <= 16 && Object.values(descriptors).every(d =>
    d.enumerable && Object.prototype.hasOwnProperty.call(d, "value")), "REGIME_RUNTIME_INPUT_INVALID");
  fail(Object.prototype.hasOwnProperty.call(descriptors, "policy") && Object.prototype.hasOwnProperty.call(descriptors, "evidence"),
    "REGIME_RUNTIME_INPUT_INVALID");
  const payload = Object.fromEntries(Object.entries(descriptors).filter(([k]) => k !== "policy" && k !== "evidence")
    .map(([k, d]) => [k, d.value]));
  return { policy: descriptors.policy.value, evidence: descriptors.evidence.value,
    payload: taskSchema.parse(capture(payload, byteLimit)) };
}
function coupled(p: PolicyRecord, e: EvidenceRecord): boolean {
  const a = p.artifact, d = a.feature_definition, b = a.economic_basis, x = e.artifact;
  return same(a.scope, x.scope) && p.approval.available_at_ms <= x.evaluation_at_ms &&
    a.policy.frozen_at_ms < x.evaluation_at_ms && e.acceptance.feature_definition_hash === p.approval.feature_definition_hash &&
    x.current.feature_schema_version === a.policy.feature_schema_version &&
    d.universe_id === x.research_binding.universe_id && d.venue === x.research_binding.venue &&
    b.economic_domain === x.partition.economic_domain && b.account_mode === x.account_mode &&
    b.currency === x.partition.currency && b.comparable_basis_id === x.binding.comparable_basis_id &&
    x.references.length <= a.policy.max_reference_windows;
}
function taskMatches(t: CapturedTask, p: PolicyRecord, e: EvidenceRecord, now: number): boolean {
  const a = e.artifact;
  return policyCurrent(p, now) && evidenceCurrent(e, now) && coupled(p, e) &&
    same(t.scope, a.scope) && same(t.binding, a.binding) && t.source_revision === a.source_revision &&
    t.projection_generation === a.projection_generation && t.source_set_digest === a.source_set_digest &&
    t.source_as_of_ms === a.source_as_of_ms && t.source_qualification === a.source_qualification &&
    t.calculation_revision === p.approval.calculation_revision && t.computed_at_ms >= a.source_as_of_ms && t.computed_at_ms <= now;
}
function inputDigest(p: PolicyRecord, e: EvidenceRecord): string {
  return accessDigest({ policy_artifact_sha256: p.approval.artifact_sha256, policy_revision: p.approval.policy_revision,
    evidence_artifact_sha256: e.acceptance.artifact_sha256, source_acceptance_ref: e.acceptance.acceptance_ref,
    scope: e.artifact.scope, binding: e.artifact.binding, source_revision: e.artifact.source_revision,
    projection_generation: e.artifact.projection_generation, source_set_digest: e.artifact.source_set_digest,
    source_as_of_ms: e.artifact.source_as_of_ms, reference_census_digest: e.acceptance.reference_census_digest });
}
function publicationMatches(p: PolicyRecord, e: EvidenceRecord, publication: ManagerRegimePublication, now: number): boolean {
  const s = publication.provenance, r = publication.result, a = e.artifact, policy = p.artifact.policy;
  const t = { scope: s.scope, binding: s.binding, source_revision: s.source_revision, projection_generation: s.projection_generation,
    source_set_digest: s.source_set_digest, source_as_of_ms: s.source_as_of_ms, source_qualification: s.source_qualification,
    calculation_revision: s.calculation_revision, computed_at_ms: s.computed_at_ms };
  if (!taskMatches(t, p, e, now) || !same(s.research_binding, a.research_binding) || s.input_digest !== inputDigest(p, e) ||
    s.policy_artifact_sha256 !== p.approval.artifact_sha256 || s.policy_revision !== p.approval.policy_revision ||
    s.formula_hash !== p.approval.formula_hash || s.feature_definition_hash !== p.approval.feature_definition_hash ||
    s.approval_ref !== p.approval.approval_ref || s.approved_at_ms !== p.approval.approved_at_ms ||
    s.policy_valid_until_ms !== p.approval.valid_until_ms || s.evidence_artifact_sha256 !== e.acceptance.artifact_sha256 ||
    s.evidence_manifest_hash !== a.evidence_manifest_hash || s.population_census_digest !== e.acceptance.population_census_digest ||
    s.reference_census_digest !== e.acceptance.reference_census_digest ||
    s.source_acceptance_ref !== e.acceptance.acceptance_ref || s.source_accepted_at_ms !== e.acceptance.accepted_at_ms ||
    s.evidence_valid_until_ms !== e.acceptance.valid_until_ms || s.evaluation_at_ms !== a.evaluation_at_ms ||
    r.policy_version !== policy.policy_version || r.policy_hash !== policy.policy_hash || r.approved_policy_id !== policy.approved_policy_id ||
    r.feature_schema_version !== policy.feature_schema_version || r.calibration_snapshot_id !== policy.calibration_snapshot_id ||
    r.calibration_hash !== policy.calibration_hash || r.overlap_policy_id !== policy.overlap_policy_id || r.horizon_ms !== policy.horizon_ms ||
    r.evidence_snapshot_id !== a.evidence_snapshot_id || r.revision !== a.revision || r.supersedes_revision !== a.supersedes_revision ||
    r.feature_cutoff_ms !== a.current.feature_cutoff_ms) return false;
  // A stale fact may remain a truthful stale result; a supported old result cannot survive feature expiry.
  if (r.status !== "stale" && now - a.current.feature_cutoff_ms > policy.max_feature_age_ms) return false;
  const refs = new Map(a.references.map(x => [x.reference_window_id, x]));
  if (r.reference_window_ids.some(id => !refs.has(id)) || r.reasons.some(x => x.reference_window_id !== null && !refs.has(x.reference_window_id))) return false;
  for (const group of r.stage_breakdown) for (const n of group.neighbors) {
    const x = refs.get(n.reference_window_id);
    if (!x || x.stage !== group.stage || x.evidence_kind !== group.evidence_kind || x.economic_domain !== group.economic_domain ||
      x.account_mode !== group.account_mode || n.manifest_hash !== x.manifest_hash || n.source_locator !== x.source_locator) return false;
  }
  const episodes = new Set(r.reference_window_ids.map(id => refs.get(id)!.episode_id));
  return episodes.size === r.distinct_episode_count && r.stage_breakdown.every(group =>
    new Set(group.reference_window_ids.map(id => refs.get(id)!.episode_id)).size === group.distinct_episode_count);
}
/** Current reference proof only. Result authenticity is the immutable trusted worker/store intake boundary;
 * this helper never recomputes Gaussian distances, weights, quantiles or any economic score in a BFF. */
export function managerRegimePublicationCurrent(policyHandle: ApprovedManagerRegimePolicy | null,
  evidenceHandle: VerifiedManagerRegimeEvidence | null, value: unknown, nowMs: number): boolean {
  try {
    const p = policyHandle && policies.get(policyHandle), e = evidenceHandle && evidenceRecords.get(evidenceHandle);
    if (!p || !e) return false;
    const publication = managerRegimePublication.parse(capture(value, ARTIFACT_CEILING));
    return publicationMatches(p, e, publication, utcMilliseconds.parse(nowMs));
  } catch { return false; }
}
export class ManagerRegimeRuntime {
  private inFlight = 0;
  constructor(private readonly limits: ManagerRegimeRuntimeLimits, private readonly now: () => number = Date.now) {
    fail(Object.values(limits).every(x => Number.isSafeInteger(x) && x > 0) && limits.maximum_references <= 4096 &&
      limits.maximum_input_bytes <= ARTIFACT_CEILING && limits.maximum_output_bytes <= ARTIFACT_CEILING &&
      limits.maximum_in_flight <= 128, "REGIME_RUNTIME_LIMIT_INVALID");
    this.limits = Object.freeze({ ...limits });
  }
  async calculate(task: ManagerRegimeRuntimeTask, signal?: AbortSignal): Promise<ManagerRegimeRuntimeResult> {
    if (signal?.aborted) return absent(new Error("REGIME_RUNTIME_CANCELLED"));
    if (this.inFlight >= this.limits.maximum_in_flight) return absent(new Error("REGIME_RUNTIME_CAPACITY"));
    this.inFlight++;
    try {
      const original = captureTask(task, this.limits.maximum_input_bytes);
      const policyHandle = original.policy, evidenceHandle = original.evidence;
      const p = policyHandle && policies.get(policyHandle), e = evidenceHandle && evidenceRecords.get(evidenceHandle);
      fail(p, "REGIME_POLICY_NOT_APPROVED"); fail(e, "REGIME_SOURCE_NOT_ACCEPTED");
      const captured = freeze(original.payload);
      fail(e.artifact.references.length <= this.limits.maximum_references, "REGIME_RUNTIME_INPUT_BOUND");
      fail(Buffer.byteLength(JSON.stringify(e.artifact), "utf8") + Buffer.byteLength(JSON.stringify(p.artifact), "utf8") +
        Buffer.byteLength(JSON.stringify(captured), "utf8") <= this.limits.maximum_input_bytes, "REGIME_RUNTIME_INPUT_BOUND");
      // Detach before yield; no caller-owned facts survive this point. The calculator is synchronous and structurally bounded.
      const input = freeze(capture({ ...e.input, policy: p.artifact.policy }, this.limits.maximum_input_bytes)) as unknown as ManagerRegimeInput;
      await Promise.resolve();
      fail(!signal?.aborted, "REGIME_RUNTIME_CANCELLED");
      fail(policyHandle && evidenceHandle && policies.get(policyHandle) === p && evidenceRecords.get(evidenceHandle) === e,
        "REGIME_APPROVAL_REVOKED");
      fail(taskMatches(captured, p, e, this.now()), "REGIME_POLICY_EVIDENCE_NOT_CURRENT_OR_INCOMPATIBLE");
      const result = calculateManagerRegimeFit(input);
      const publication = managerRegimePublication.parse({ slot: "REGIME", result, provenance: {
        ...captured, research_binding: e.artifact.research_binding, input_digest: inputDigest(p, e),
        policy_artifact_sha256: p.approval.artifact_sha256, policy_revision: p.approval.policy_revision,
        formula_hash: p.approval.formula_hash, feature_definition_hash: p.approval.feature_definition_hash,
        approval_ref: p.approval.approval_ref, approved_at_ms: p.approval.approved_at_ms,
        policy_valid_until_ms: p.approval.valid_until_ms, evidence_artifact_sha256: e.acceptance.artifact_sha256,
        evidence_manifest_hash: e.artifact.evidence_manifest_hash, population_census_digest: e.acceptance.population_census_digest,
        reference_census_digest: e.acceptance.reference_census_digest,
        source_acceptance_ref: e.acceptance.acceptance_ref, source_accepted_at_ms: e.acceptance.accepted_at_ms,
        evidence_valid_until_ms: e.acceptance.valid_until_ms, evaluation_at_ms: e.artifact.evaluation_at_ms } });
      fail(Buffer.byteLength(JSON.stringify(publication), "utf8") <= this.limits.maximum_output_bytes, "REGIME_RUNTIME_OUTPUT_BOUND");
      fail(!signal?.aborted && policies.get(policyHandle) === p && evidenceRecords.get(evidenceHandle) === e,
        "REGIME_APPROVAL_REVOKED_OR_CANCELLED");
      fail(publicationMatches(p, e, publication, this.now()), "REGIME_PUBLICATION_NOT_CURRENT");
      return { status: "READY", publication };
    } catch (error) { return absent(error); }
    finally { this.inFlight--; }
  }
}
