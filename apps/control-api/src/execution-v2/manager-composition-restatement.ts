/** PRIVATE named historical worker/codec. No current publication/loader,
 * scheduler, source authority, permission, database or acknowledgement. */
import { isProxy } from "node:util/types";
import { z } from "zod";
import { accessDigest } from "./access-policy";
import { compareManagerDecimals } from "./manager-model";
import { sumExactDecimals } from "../research/exact-decimal";
import { aggregateManagerAlphaScores, type ManagerAllocationRow } from "./manager-score";
import { managerScorePublication, managerScoreBinding } from "./manager-score-publication.contract";
import { managerCompositionBinding, managerCompositionResult } from "./manager-composition-publication.contract";
import { managerCompositionRetainedAllocationInputs, type RetainedManagerAllocationInputs,
  type ManagerCompositionRuntimeLimits } from "./manager-composition-runtime";
import { managerScoreRestatementPolicy, type ApprovedManagerScorePolicy,
  type ManagerScoreHistoricalRestatement, type ManagerScoreRuntimeTask } from "./manager-score-runtime";

export const MANAGER_COMPOSITION_HISTORICAL_WORKER_VERSION = "portal.execution.manager-composition-restatement-worker.v1" as const;
export type ManagerHistoricalCompositionPolicy = NonNullable<ReturnType<typeof managerScoreRestatementPolicy>>;
export interface ManagerHistoricalCompositionRawEntry {
  slot: "RAW" | "DIRECT_NAV"; binding: ManagerScoreRuntimeTask["binding"]; original_input_digest: string;
  availability: "AVAILABLE" | "PARTIAL" | "NOT_PUBLISHED"; reason_codes: string[];
  historical: ManagerScoreHistoricalRestatement | null;
}
/** Identity/current-source proof supplied by the custody-owning coordinator.
 * A JSON flag, old numeric q, or current-publication checker is not this proof. */
export interface ManagerHistoricalCompositionRawFence { accepts(entry: ManagerHistoricalCompositionRawEntry): boolean }
export interface ManagerHistoricalCompositionContext {
  allocation: RetainedManagerAllocationInputs; original_custody_key: string; original_inputs_digest: string;
  policy: ManagerHistoricalCompositionPolicy; knowledge_cutoff_ms: number; computed_at_ms: number;
  calculation_revision: string; raw_entries: readonly ManagerHistoricalCompositionRawEntry[];
}
export interface ManagerHistoricalCompositionTask extends Omit<ManagerHistoricalCompositionContext, "policy"> {
  policy: ApprovedManagerScorePolicy | null;
}
type Allocation = NonNullable<ReturnType<typeof managerCompositionRetainedAllocationInputs>>;
const MAX_BYTES = 8 * 1024 * 1024;
const text = z.string().min(1).max(256).regex(/^[^\u0000-\u001f\u007f]+$(?![\s\S])/);
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$(?![\s\S])/);
const ms = z.number().int().nonnegative().safe();
const decimal = z.string().max(512).regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$(?![\s\S])/);
const policySchema = z.object({ identity_digest: digest, method_digest: digest, policy_revision: text,
  stress_delta_bps: decimal,
  approved_at_ms: ms, valid_until_ms: ms }).strict();
const sourceSchema = z.object({ workspace_id: text, environment: z.enum(["paper", "sandbox", "live"]),
  profile_id: text, catalogue_digest: digest, revision: text, payload_digest: digest,
  source_epoch: text, source_sequence: z.string().regex(/^(?:0|[1-9]\d{0,18})$(?![\s\S])/),
  projection_generation: text, source_set_digest: digest, as_of_ms: ms }).strict();
const rawInputSchema = z.object({ subject_id: text, original_input_digest: digest.nullable(),
  entry_digest: digest.nullable(), disposition: z.enum(["USED", "UNSCORED"]),
  reason_code: z.enum(["RAW_EXACT_BINDING_NOT_RETAINED", "RAW_RESULT_NOT_AVAILABLE", "RAW_RESULT_INCOMPATIBLE"]).nullable() }).strict();
const historicalSchema = z.object({ schema_version: z.literal(MANAGER_COMPOSITION_HISTORICAL_WORKER_VERSION),
  revision_mode: z.literal("RESTATED_CURRENT_POLICY"), purpose: z.literal("HISTORICAL_ANALYSIS_ONLY"),
  operational_current: z.literal(false), source: sourceSchema, binding: managerCompositionBinding,
  original_custody_key: digest, original_inputs_digest: digest, allocation_custody_digest: digest,
  original_publication_digest: digest, allocation_artifact_sha256: digest, allocation_revision: text,
  allocation_effective_at_ms: ms, original_computed_at_ms: ms, captured_at_ms: ms,
  policy: policySchema, calculation_revision: text, knowledge_cutoff_ms: ms, computed_at_ms: ms, checked_at_ms: ms,
  raw_inputs: z.array(rawInputSchema).max(10_000), derived_input_digest: digest, derivation_context_digest: digest,
  result: managerCompositionResult }).strict();
export type ManagerCompositionHistoricalRestatement = z.infer<typeof historicalSchema>;
type RawInput = z.infer<typeof rawInputSchema>;
const envelope = z.object({ original_custody_key: digest, original_inputs_digest: digest,
  policy: policySchema, knowledge_cutoff_ms: ms, computed_at_ms: ms, calculation_revision: text,
  raw_entries: z.array(z.object({ slot: z.enum(["RAW", "DIRECT_NAV"]), binding: managerScoreBinding,
    original_input_digest: digest, availability: z.enum(["AVAILABLE", "PARTIAL", "NOT_PUBLISHED"]),
    reason_codes: z.array(text).max(8), historical: z.unknown().nullable() }).strict()).max(128) }).strict();
type Envelope = Omit<ManagerHistoricalCompositionContext, "allocation">;
const taskKeys = ["allocation", "original_custody_key", "original_inputs_digest", "policy", "knowledge_cutoff_ms",
  "computed_at_ms", "calculation_revision", "raw_entries"] as const;
function fail(code: string): never { throw new ManagerCompositionHistoricalError(code); }
function ensure(value: unknown, code: string): asserts value { if (!value) fail(code); }
export class ManagerCompositionHistoricalError extends Error { constructor(readonly code: string) { super(code); } }
function same(a: unknown, b: unknown): boolean { return accessDigest(a) === accessDigest(b); }
function freeze<T>(v: T): T {
  if (v && typeof v === "object") { for (const value of Object.values(v)) freeze(value); Object.freeze(v); }
  return v;
}
/** Descriptor-first own-data only; exact JSON byte cap, not a per-number byte
 * estimate that could exclude an otherwise accepted worker task. */
function capture<T>(value: T, limit: number): T {
  let nodes = 0, characters = 0; const active = new Set<object>();
  const visit = (v: unknown, depth: number): void => {
    ensure(++nodes <= 1_000_000 && depth <= 64, "COMPOSITION_RESTATED_INPUT_BOUND");
    if (typeof v === "string") {
      ensure(!/[\u0000-\u001f\u007f]/.test(v), "COMPOSITION_RESTATED_INPUT_INVALID");
      characters += Buffer.byteLength(v); ensure(characters <= limit, "COMPOSITION_RESTATED_INPUT_BOUND"); return;
    }
    if (v === null || typeof v === "boolean" || typeof v === "number" && Number.isFinite(v)) return;
    ensure(typeof v === "object" && v !== null && !isProxy(v), "COMPOSITION_RESTATED_INPUT_INVALID");
    const array = Array.isArray(v), prototype = Object.getPrototypeOf(v);
    ensure(!active.has(v) && (array ? prototype === Array.prototype : prototype === Object.prototype || prototype === null)
      && Object.getOwnPropertySymbols(v).length === 0, "COMPOSITION_RESTATED_INPUT_INVALID");
    const fields = Object.getOwnPropertyDescriptors(v), length = array ? fields.length?.value as unknown : null;
    ensure(!array || Number.isSafeInteger(length) && (length as number) >= 0 && (length as number) <= 100_000
      && Object.keys(fields).length === (length as number) + 1, "COMPOSITION_RESTATED_INPUT_BOUND");
    active.add(v);
    for (const [key, field] of Object.entries(fields)) {
      if (array && key === "length") continue;
      ensure(field.enumerable && Object.hasOwn(field, "value") && (!array || /^(?:0|[1-9]\d*)$(?![\s\S])/.test(key)
        && Number(key) < (length as number)), "COMPOSITION_RESTATED_INPUT_INVALID");
      characters += Buffer.byteLength(key); ensure(characters <= limit, "COMPOSITION_RESTATED_INPUT_BOUND"); visit(field.value, depth + 1);
    }
    active.delete(v);
  };
  visit(value, 0); const json = JSON.stringify(value);
  ensure(Buffer.byteLength(json) <= limit, "COMPOSITION_RESTATED_INPUT_BOUND"); return JSON.parse(json) as T;
}
function fields(value: unknown, expected: readonly string[]): Record<string, PropertyDescriptor> {
  ensure(typeof value === "object" && value !== null && !isProxy(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value)) && Object.getOwnPropertySymbols(value).length === 0,
  "COMPOSITION_RESTATED_INPUT_INVALID");
  const result = Object.getOwnPropertyDescriptors(value);
  ensure(Object.keys(result).length === expected.length && expected.every(key => Object.hasOwn(result, key))
    && Object.values(result).every(d => d.enumerable && Object.hasOwn(d, "value")), "COMPOSITION_RESTATED_INPUT_INVALID");
  return result;
}
function limit(value: number): number {
  ensure(Number.isSafeInteger(value) && value >= 1 && value <= MAX_BYTES, "COMPOSITION_RESTATED_LIMIT_INVALID"); return value;
}
function boundCombined(a: Allocation, e: Envelope, bytes: number): void {
  // Custody already contains exact original artifact bytes and all approval pins;
  // do not silently charge a second materialized artifact copy against admission.
  ensure(Buffer.byteLength(JSON.stringify({ custody: a.custody, context: e })) <= bytes, "COMPOSITION_RESTATED_INPUT_BOUND");
}
function clock(now: () => number): number { return ms.parse(now()); }
const bindingDigest = (b: ManagerHistoricalCompositionRawEntry["binding"]) =>
  accessDigest({ ...b, stage_filter: [...b.stage_filter].sort() });
const scopeOf = (a: Allocation) => a.artifact.scope;
function assertContext(a: Allocation, e: Envelope, now: number): void {
  const c = a.custody;
  ensure(c.source.as_of_ms <= c.original_computed_at_ms && c.original_computed_at_ms <= c.captured_at_ms
    && c.captured_at_ms <= e.knowledge_cutoff_ms && e.knowledge_cutoff_ms <= e.computed_at_ms && e.computed_at_ms <= now
    && e.policy.approved_at_ms <= e.knowledge_cutoff_ms && e.computed_at_ms < e.policy.valid_until_ms,
  "COMPOSITION_RESTATED_TIME_INVALID");
  ensure(same(c.binding, a.artifact.binding), "COMPOSITION_RESTATED_ORIGINAL_MISMATCH");
  const seen = new Set<string>();
  for (const entry of e.raw_entries) {
    const key = accessDigest({ slot: entry.slot, binding: bindingDigest(entry.binding) });
    ensure(!seen.has(key), "COMPOSITION_RESTATED_RAW_CONFLICT"); seen.add(key);
    if (entry.historical === null) {
      ensure(entry.availability === "NOT_PUBLISHED" && entry.reason_codes.length > 0, "COMPOSITION_RESTATED_RAW_INVALID"); continue;
    }
    validateRaw(entry, e, a, now);
  }
}
function validateRaw(entry: ManagerHistoricalCompositionRawEntry, e: Envelope, a: Allocation, now: number): void {
  const h = entry.historical!;
  const expected = ["schema_version", "revision_mode", "purpose", "source_method_compatibility", "knowledge_cutoff_ms", "economic_as_of_ms",
    "original_input_digest", "derived_input_digest", "policy_identity_digest", "derivation_context_digest", "checked_at_ms", "operational_current",
    "feed_freshness", "withheld_metric_reasons", "result"];
  fields(h, expected); fields(h.result, ["quality", "raw_metrics", "path_summary", "provenance"]);
  const qFields = Object.getOwnPropertyDescriptors(h.result.quality);
  ensure(qFields.preview?.value === null, "COMPOSITION_RESTATED_RAW_INVALID");
  const { preview: _preview, ...quality } = h.result.quality;
  const publication = managerScorePublication.parse({ slot: entry.slot, quality, raw_metrics: h.result.raw_metrics, provenance: h.result.provenance });
  const p = publication.provenance;
  ensure(h.schema_version === "portal.execution.manager-score-restatement-worker.v1" && h.revision_mode === "RESTATED_CURRENT_POLICY"
    && h.purpose === "HISTORICAL_ANALYSIS_ONLY" && h.source_method_compatibility === "CALLER_CUSTODY_REQUIRED" && h.operational_current === false
    && h.knowledge_cutoff_ms === e.knowledge_cutoff_ms && h.economic_as_of_ms === a.artifact.source_as_of_ms
    && h.original_input_digest === entry.original_input_digest && digest.safeParse(h.derived_input_digest).success
    && h.policy_identity_digest === e.policy.identity_digest && ms.safeParse(h.checked_at_ms).success
    && h.checked_at_ms >= e.computed_at_ms && h.checked_at_ms <= now && h.checked_at_ms < e.policy.valid_until_ms
    && same(p.scope, scopeOf(a)) && bindingDigest(p.binding) === bindingDigest(entry.binding) && p.source_revision === a.artifact.source_revision
    && p.source_set_digest === a.artifact.source_set_digest && p.source_as_of_ms === a.artifact.source_as_of_ms
    && p.source_qualification === "SOURCE_VERIFIED" && p.input_digest === h.derived_input_digest && p.computed_at_ms === e.computed_at_ms
    && p.policy_revision === e.policy.policy_revision && p.approved_at_ms === e.policy.approved_at_ms
    && p.policy_valid_until_ms === e.policy.valid_until_ms,
  "COMPOSITION_RESTATED_RAW_INVALID");
  const derived = { revision_mode: h.revision_mode, purpose: h.purpose, source_method_compatibility: h.source_method_compatibility,
    knowledge_cutoff_ms: h.knowledge_cutoff_ms, economic_as_of_ms: h.economic_as_of_ms, original_input_digest: h.original_input_digest,
    derived_input_digest: h.derived_input_digest, policy_identity_digest: h.policy_identity_digest, withheld_metric_reasons: h.withheld_metric_reasons };
  ensure(h.derivation_context_digest === accessDigest(derived), "COMPOSITION_RESTATED_RAW_INVALID");
  fields(h.feed_freshness, ["status", "source_age_ms", "maximum_input_age_ms"]);
  ensure(ms.safeParse(h.feed_freshness.maximum_input_age_ms).success && h.feed_freshness.maximum_input_age_ms >= 1
    && h.feed_freshness.source_age_ms === h.checked_at_ms - h.economic_as_of_ms
    && h.feed_freshness.status === (h.feed_freshness.source_age_ms > h.feed_freshness.maximum_input_age_ms
      ? "HISTORICAL_OUTSIDE_CURRENT_FEED_FRESHNESS" : "WITHIN_CURRENT_FEED_FRESHNESS"), "COMPOSITION_RESTATED_RAW_INVALID");
  ensure(entry.availability !== "NOT_PUBLISHED" && (entry.availability === "AVAILABLE") === (quality.value !== null && entry.reason_codes.length === 0),
    "COMPOSITION_RESTATED_RAW_INVALID");
}
function rawSelection(a: Allocation, e: Envelope): { inputs: RawInput[]; rows: ManagerAllocationRow[]; reasons: string[] } {
  const grouping = auxiliary(a, "GROUPING") ? new Map(a.artifact.grouping!.rows.map(r => [r.subject_id, r.concentration_group_id])) : new Map<string, string>();
  const byBinding = new Map(e.raw_entries.filter(entry => entry.slot === "RAW").map(entry => [bindingDigest(entry.binding), entry]));
  const inputs: RawInput[] = [], reasons: string[] = [];
  const rows = a.artifact.rows.map(row => {
    const positive = compareManagerDecimals(row.allocated_economic_capital, "0") > 0;
    const entry = byBinding.get(bindingDigest(row.raw_binding));
    const h = entry?.historical, q = h?.result.quality;
    const compatible = !!h && bindingDigest(h.result.provenance.binding) === bindingDigest(row.raw_binding)
      && q?.comparable_basis_id === a.artifact.binding.comparable_basis_id && q.individual_evidence_binding_id === row.raw_binding.individual_evidence_binding_id;
    const used = positive && !!entry && compatible && entry.availability === "AVAILABLE" && q?.value !== null
      && ["available", "provisional"].includes(q?.status ?? "") && q?.qualification === "RUNTIME_APPROVED";
    if (positive) {
      const reason = used ? null : !entry ? "RAW_EXACT_BINDING_NOT_RETAINED" : !h || q?.value === null ? "RAW_RESULT_NOT_AVAILABLE" : "RAW_RESULT_INCOMPATIBLE";
      inputs.push({ subject_id: row.subject_id, original_input_digest: entry?.original_input_digest ?? null,
        entry_digest: entry ? accessDigest(entry) : null, disposition: used ? "USED" : "UNSCORED", reason_code: reason });
      if (reason) reasons.push(reason);
    }
    return { subject_id: row.subject_id, allocated_economic_capital: row.allocated_economic_capital,
      concentration_group_id: grouping.get(row.subject_id) ?? null,
      score: { value: used ? q!.value : null, status: used ? q!.status : "unbound",
        qualification: used ? q!.qualification : "UNQUALIFIED", comparable_basis_id: row.raw_binding.comparable_basis_id,
        individual_evidence_binding_id: used ? row.raw_binding.individual_evidence_binding_id : null, fresh: used } } satisfies ManagerAllocationRow;
  });
  inputs.sort((x, y) => x.subject_id < y.subject_id ? -1 : x.subject_id > y.subject_id ? 1 : 0);
  return { inputs, rows, reasons: [...new Set(reasons)] };
}
/** Eligibility at the ORIGINAL publication/capture context, never a current K
 * refresh. An auxiliary absent/expired then cannot be revived by a later policy. */
function auxiliary(a: Allocation, kind: "GROUPING" | "NAV"): boolean {
  const pin = kind === "GROUPING" ? a.approval.grouping_pin : a.approval.nav_pin;
  return pin !== null && a.custody.original_computed_at_ms < pin.valid_until_ms && a.custody.captured_at_ms < pin.valid_until_ms
    && (kind === "GROUPING" ? a.grouping_artifact_bound : a.nav_artifact_bound && a.nav_matches_allocation);
}
function contextIdentity(a: Allocation, e: Envelope, raw: RawInput[]) {
  return { source: a.custody.source, binding: a.artifact.binding, original_custody_key: e.original_custody_key,
    original_inputs_digest: e.original_inputs_digest, allocation_custody_digest: a.custody.custody_digest,
    original_publication_digest: a.custody.original_publication_digest,
    allocation_artifact_sha256: a.custody.artifact_sha256, allocation_revision: a.artifact.allocation_revision,
    allocation_effective_at_ms: a.artifact.effective_at_ms,
    original_computed_at_ms: a.custody.original_computed_at_ms,
    captured_at_ms: a.custody.captured_at_ms, policy: e.policy, calculation_revision: e.calculation_revision,
    knowledge_cutoff_ms: e.knowledge_cutoff_ms, computed_at_ms: e.computed_at_ms, raw_inputs: raw };
}
function inputDigest(a: Allocation, e: Envelope, raw: RawInput[]): string {
  return accessDigest({ worker: MANAGER_COMPOSITION_HISTORICAL_WORKER_VERSION, ...contextIdentity(a, e, raw) });
}
function checkedResult(a: Allocation, e: Envelope): { inputs: RawInput[]; result: z.infer<typeof managerCompositionResult> } {
  const selected = rawSelection(a, e), nav = auxiliary(a, "NAV") ? a.artifact.nav_partition : null;
  const result = aggregateManagerAlphaScores({ rows: selected.rows, comparable_basis_id: a.artifact.binding.comparable_basis_id,
    allocation_snapshot_id: a.artifact.allocation_snapshot_id, scope_complete: true, ownership_partition_verified: true,
    currency: a.artifact.currency, nav_partition: nav ? { verified: true, nav: nav.nav, idle_cash: nav.idle_cash, same_cutoff_and_basis: true } : null });
  result.reason_codes = [...new Set([...result.reason_codes, ...selected.reasons])];
  if (!auxiliary(a, "GROUPING")) {
    result.diagnostics.allocation_hhi = null; result.diagnostics.score_contribution_hhi = null;
    result.diagnostics.reason_codes = result.diagnostics.reason_codes.filter(r => !["GROUPING_NOT_PUBLISHED", "GROUPING_APPROVAL_NOT_CURRENT", "GROUPING_NOT_APPROVED"].includes(r));
    result.diagnostics.reason_codes.push("GROUPING_NOT_PUBLISHED");
    if (a.artifact.grouping !== null) result.diagnostics.reason_codes.push(a.grouping_artifact_bound ? "GROUPING_NOT_APPROVED_AT_ORIGINAL_CAPTURE" : "GROUPING_NOT_APPROVED");
  }
  if (!nav) { result.allocation_coverage_nav = null; result.scored_nav_weight = null; result.idle_cash_weight = null; result.nav_coverage_reason = "BASIS_MISMATCH"; }
  return { inputs: selected.inputs, result: managerCompositionResult.parse(result) };
}
function captureContext(value: unknown, bytes: number): { allocation: Allocation; envelope: Envelope } {
  const f = fields(value, taskKeys), allocation = managerCompositionRetainedAllocationInputs(f.allocation.value as RetainedManagerAllocationInputs);
  ensure(allocation, "COMPOSITION_RESTATED_ORIGINAL_NOT_RETAINED");
  const payload = Object.fromEntries(taskKeys.filter(k => k !== "allocation").map(k => [k, f[k].value]));
  const parsed = envelope.parse(capture(payload, bytes)) as Envelope;
  boundCombined(allocation, parsed, bytes); return { allocation, envelope: freeze(parsed) };
}
function checkDecodedResult(a: Allocation, e: Envelope, v: ManagerCompositionHistoricalRestatement): void {
  const selected = rawSelection(a, e);
  ensure(same(v.raw_inputs, selected.inputs), "COMPOSITION_RESTATED_RAW_MISMATCH");
  const positive = a.artifact.rows.filter(row => compareManagerDecimals(row.allocated_economic_capital, "0") > 0);
  const contribution = new Map(v.result.contributions.map(row => [row.subject_id, row]));
  ensure(same([...contribution.keys()].sort(), positive.map(row => row.subject_id).sort())
    && v.result.allocation_snapshot_id === a.artifact.allocation_snapshot_id
    && compareManagerDecimals(v.result.total_allocated_capital ?? "-1", sumExactDecimals(a.artifact.rows.map(row => row.allocated_economic_capital)) ?? "0") === 0
    && selected.inputs.every(input => (contribution.get(input.subject_id)!.value !== null) === (input.disposition === "USED")),
  "COMPOSITION_RESTATED_RESULT_MISMATCH");
  // Closed stored worker result and immutable intake establish the numbers. A
  // GET validates identity/census/absence; it does NOT recompute weights/F/A.
  if (!auxiliary(a, "GROUPING")) ensure(v.result.diagnostics.allocation_hhi === null && v.result.diagnostics.score_contribution_hhi === null,
    "COMPOSITION_RESTATED_RESULT_MISMATCH");
  if (!auxiliary(a, "NAV")) ensure(v.result.allocation_coverage_nav === null && v.result.scored_nav_weight === null
    && v.result.idle_cash_weight === null && v.result.nav_coverage_reason === "BASIS_MISMATCH", "COMPOSITION_RESTATED_RESULT_MISMATCH");
}
/** Strict historical restoration ONLY: no current-policy helper, current
 * allocation check, new worker execution or source/grant authority. */
export function decodeRetainedManagerCompositionRestatement(value: unknown, context: ManagerHistoricalCompositionContext,
  maximumBytes: number, nowMs: number = Date.now()): ManagerCompositionHistoricalRestatement {
  try {
    const bytes = limit(maximumBytes), captured = captureContext(context, bytes), now = ms.parse(nowMs);
    assertContext(captured.allocation, captured.envelope, now);
    const v = historicalSchema.parse(capture(value, bytes)), e = captured.envelope, a = captured.allocation;
    const identity = contextIdentity(a, e, rawSelection(a, e).inputs);
    ensure(same(identity, Object.fromEntries(Object.keys(identity).map(k => [k, v[k as keyof typeof v]])))
      && v.checked_at_ms >= v.computed_at_ms && v.checked_at_ms <= now && v.checked_at_ms < v.policy.valid_until_ms
      && v.derived_input_digest === inputDigest(a, e, v.raw_inputs)
      && v.derivation_context_digest === accessDigest({ schema_version: v.schema_version, revision_mode: v.revision_mode,
        purpose: v.purpose, operational_current: false, ...identity, derived_input_digest: v.derived_input_digest }),
    "COMPOSITION_RESTATED_CONTEXT_MISMATCH");
    ensure(e.raw_entries.every(entry => !entry.historical || entry.historical.checked_at_ms <= v.checked_at_ms), "COMPOSITION_RESTATED_TIME_INVALID");
    checkDecodedResult(a, e, v); return freeze(v);
  } catch (error) { throw new ManagerCompositionHistoricalError(error instanceof ManagerCompositionHistoricalError ? error.code : "COMPOSITION_RESTATED_INPUT_INVALID"); }
}
export class ManagerCompositionHistoricalRuntime {
  private inFlight = 0; private readonly limits: Readonly<ManagerCompositionRuntimeLimits>;
  constructor(limits: ManagerCompositionRuntimeLimits, private readonly now: () => number = () => Date.now()) {
    const ceiling = { maximum_rows: 10_000, maximum_input_bytes: MAX_BYTES, maximum_in_flight: 4 };
    let config: Record<string, PropertyDescriptor>;
    try { config = fields(limits, Object.keys(ceiling)); }
    catch { fail("COMPOSITION_RESTATED_LIMIT_INVALID"); }
    ensure(typeof now === "function" && !isProxy(now) && Object.keys(ceiling).every(key => {
      const k = key as keyof ManagerCompositionRuntimeLimits;
      const value = config[key].value as unknown;
      return Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= ceiling[k];
    }), "COMPOSITION_RESTATED_LIMIT_INVALID"); this.limits = Object.freeze(Object.fromEntries(Object.entries(config).map(([k, v]) => [k, v.value]))) as Readonly<ManagerCompositionRuntimeLimits>;
  }
  async calculateHistoricalComposition(task: ManagerHistoricalCompositionTask, rawFence: ManagerHistoricalCompositionRawFence,
    signal?: AbortSignal): Promise<ManagerCompositionHistoricalRestatement> {
    ensure(this.inFlight < this.limits.maximum_in_flight, "COMPOSITION_RESTATED_CAPACITY"); this.inFlight += 1;
    try {
      ensure(!signal?.aborted, "COMPOSITION_RESTATED_CANCELLED");
      const f = fields(task, taskKeys), handle = f.policy.value as ApprovedManagerScorePolicy | null;
      const allocation = managerCompositionRetainedAllocationInputs(f.allocation.value as RetainedManagerAllocationInputs);
      ensure(allocation, "COMPOSITION_RESTATED_ORIGINAL_NOT_RETAINED");
      ensure(allocation.artifact.rows.length <= this.limits.maximum_rows, "COMPOSITION_RESTATED_INPUT_BOUND");
      const initial = clock(this.now), k = ms.parse(f.knowledge_cutoff_ms.value);
      const policy = managerScoreRestatementPolicy(handle, scopeOf(allocation), k, initial);
      ensure(policy, "COMPOSITION_RESTATED_POLICY_NOT_ELIGIBLE");
      const rawFields = fields(rawFence, ["accepts"]), accepts = rawFields.accepts.value as unknown;
      ensure(typeof accepts === "function" && !isProxy(accepts), "COMPOSITION_RESTATED_RAW_NOT_VERIFIED");
      // Validate/capture before inspecting original array entries. No caller
      // getter/proxy is invoked to construct the identity proof list.
      const payload = Object.fromEntries(taskKeys.filter(key => key !== "allocation").map(key => [key, key === "policy" ? policy : f[key].value]));
      const e = freeze(envelope.parse(capture(payload, this.limits.maximum_input_bytes)) as Envelope);
      boundCombined(allocation, e, this.limits.maximum_input_bytes); assertContext(allocation, e, initial);
      const originals = [...f.raw_entries.value as readonly ManagerHistoricalCompositionRawEntry[]];
      const rawCurrent = () => originals.every(entry => Reflect.apply(accepts, rawFence, [entry]) === true);
      ensure(rawCurrent(), "COMPOSITION_RESTATED_RAW_NOT_VERIFIED");
      await Promise.resolve();
      const checked = clock(this.now);
      ensure(!signal?.aborted, "COMPOSITION_RESTATED_CANCELLED");
      ensure(same(policy, managerScoreRestatementPolicy(handle, scopeOf(allocation), k, checked)), "COMPOSITION_RESTATED_POLICY_NOT_ELIGIBLE");
      ensure(rawCurrent(), "COMPOSITION_RESTATED_RAW_NOT_VERIFIED"); assertContext(allocation, e, checked);
      const calculated = checkedResult(allocation, e), identity = contextIdentity(allocation, e, calculated.inputs);
      const derived = inputDigest(allocation, e, calculated.inputs);
      const result = historicalSchema.parse({ schema_version: MANAGER_COMPOSITION_HISTORICAL_WORKER_VERSION,
        revision_mode: "RESTATED_CURRENT_POLICY", purpose: "HISTORICAL_ANALYSIS_ONLY", operational_current: false,
        ...identity, checked_at_ms: checked, derived_input_digest: derived,
        derivation_context_digest: accessDigest({ schema_version: MANAGER_COMPOSITION_HISTORICAL_WORKER_VERSION,
          revision_mode: "RESTATED_CURRENT_POLICY", purpose: "HISTORICAL_ANALYSIS_ONLY", operational_current: false,
          ...identity, derived_input_digest: derived }), result: calculated.result });
      ensure(Buffer.byteLength(JSON.stringify(result)) <= this.limits.maximum_input_bytes, "COMPOSITION_RESTATED_INPUT_BOUND");
      ensure(!signal?.aborted && rawCurrent(), "COMPOSITION_RESTATED_RAW_NOT_VERIFIED");
      const finalNow = clock(this.now);
      ensure(finalNow >= checked, "COMPOSITION_RESTATED_TIME_INVALID"); assertContext(allocation, e, finalNow);
      ensure(same(policy, managerScoreRestatementPolicy(handle, scopeOf(allocation), k, finalNow)), "COMPOSITION_RESTATED_POLICY_NOT_ELIGIBLE");
      return freeze(result);
    } catch (error) { throw new ManagerCompositionHistoricalError(error instanceof ManagerCompositionHistoricalError ? error.code : "COMPOSITION_RESTATED_INPUT_INVALID"); }
    finally { this.inFlight -= 1; }
  }
}
