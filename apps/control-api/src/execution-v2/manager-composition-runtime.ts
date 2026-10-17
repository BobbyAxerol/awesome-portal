import { createHash } from "node:crypto";
import { z } from "zod";
import { accessDigest } from "./access-policy";
import { exactDecimal, financialStage, utcMilliseconds } from "./foundation.contract";
import { publicationDigest } from "./publication.contract";
import { managerTuple } from "./manager-model.contract";
import { compareManagerDecimals } from "./manager-model";
import { sumExactDecimals } from "../research/exact-decimal";
import { aggregateManagerAlphaScores, type ManagerAllocationRow } from "./manager-score";
import { managerScoreBinding, managerScorePublication, type ManagerScorePublication } from "./manager-score-publication.contract";
import type { ManagerScoreReadFence } from "./manager-score-publication";
import { managerCompositionScope, managerCompositionBinding, managerCompositionPublication,
  type ManagerCompositionScope, type ManagerCompositionBinding, type ManagerCompositionPublication } from "./manager-composition-publication.contract";

// Private, reviewed worker configuration. None of these artifacts/handles is an HTTP approval authority.
const text = z.string().min(1).max(256).regex(/^[^\u0000-\u001f\u007f]+$(?![\s\S])/);
const money = exactDecimal.refine(value => compareManagerDecimals(value, "0") >= 0);
const count = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const member = z.object({ tuple: managerTuple, stage: financialStage }).strict();
const subPin = z.object({ artifact_digest: publicationDigest, approval_ref: text,
  approved_at_ms: utcMilliseconds, valid_until_ms: utcMilliseconds }).strict();
const artifactSchema = z.object({ schema_version: z.literal("portal.execution.manager-allocation-approved.v1"),
  scope: managerCompositionScope, binding: managerCompositionBinding,
  source_revision: text, source_set_digest: publicationDigest, source_as_of_ms: utcMilliseconds,
  source_qualification: z.literal("SOURCE_VERIFIED"), allocation_snapshot_id: text, allocation_revision: text,
  ownership_manifest_ref: text, full_accounting_manifest_ref: text, effective_at_ms: utcMilliseconds,
  currency: text, maximum_source_age_ms: count, population: z.array(member).max(10_000),
  rows: z.array(z.object({ subject_id: text, allocated_economic_capital: money,
    economic_ownership_ids: z.array(text).min(1).max(10_000), population: z.array(member).min(1).max(10_000),
    raw_binding: managerScoreBinding }).strict()).max(10_000),
  grouping: z.object({ revision: text, manifest_ref: text, effective_at_ms: utcMilliseconds,
    rows: z.array(z.object({ subject_id: text, concentration_group_id: text }).strict()).max(10_000) }).strict().nullable(),
  nav_partition: z.object({ revision: text, manifest_ref: text, as_of_ms: utcMilliseconds,
    currency: text, comparable_basis_id: text, nav: money, idle_cash: money, other_nav: money,
    rows: z.array(z.object({ subject_id: text, current_nav_allocated_capital: money }).strict()).max(10_000) }).strict().nullable(),
}).strict();
const approvalSchema = z.object({ artifact_sha256: publicationDigest, scope: managerCompositionScope,
  binding_digest: publicationDigest, source_revision: text, source_set_digest: publicationDigest,
  source_as_of_ms: utcMilliseconds, allocation_revision: text, ownership_manifest_ref: text,
  full_accounting_manifest_ref: text, approval_ref: text, approved_at_ms: utcMilliseconds,
  valid_until_ms: utcMilliseconds, grouping_pin: subPin.nullable(), nav_pin: subPin.nullable() }).strict();
export type ManagerAllocationArtifact = z.infer<typeof artifactSchema>;
/** Independently installed reviewed pin; never accepted from the source artifact or browser. */
export type ManagerAllocationApprovalPin = z.infer<typeof approvalSchema>;
declare const approvedAllocationBrand: unique symbol;
export interface ApprovedManagerAllocation { readonly [approvedAllocationBrand]: true }
interface AllocationRecord { artifact: ManagerAllocationArtifact; approval: ManagerAllocationApprovalPin;
  groupingApproved: boolean; navApproved: boolean; navMatchesAllocation: boolean }
const allocations = new WeakMap<ApprovedManagerAllocation, AllocationRecord>();
const BYTE_CEILING = 8 * 1024 * 1024;
function fail(condition: unknown, code: string): asserts condition { if (!condition) throw new Error(code); }
function same(a: unknown, b: unknown): boolean { return accessDigest(a) === accessDigest(b); }
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { for (const item of Object.values(value)) freeze(item); Object.freeze(value); }
  return value;
}
function capture(value: unknown, byteLimit: number): unknown {
  let nodes = 0, textBytes = 0; const seen = new Set<object>();
  const walk = (item: unknown, depth: number): void => {
    fail(++nodes <= 250_000 && depth <= 32, "COMPOSITION_RUNTIME_INPUT_BOUND");
    if (typeof item === "string") { textBytes += Buffer.byteLength(item, "utf8");
      fail(textBytes <= byteLimit, "COMPOSITION_RUNTIME_INPUT_BOUND"); return; }
    if (item === null || typeof item === "boolean" || typeof item === "number" && Number.isFinite(item)) return;
    fail(typeof item === "object" && item !== null && !seen.has(item), "COMPOSITION_RUNTIME_INPUT_INVALID");
    const array = Array.isArray(item);
    fail(array || [Object.prototype, null].includes(Object.getPrototypeOf(item)), "COMPOSITION_RUNTIME_INPUT_INVALID");
    fail(Object.getOwnPropertySymbols(item).length === 0, "COMPOSITION_RUNTIME_INPUT_INVALID");
    if (array) fail(item.length <= 20_000 && Object.getPrototypeOf(item) === Array.prototype, "COMPOSITION_RUNTIME_INPUT_BOUND");
    seen.add(item);
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(item))) {
      if (array && key === "length") continue;
      fail(descriptor.enumerable && Object.prototype.hasOwnProperty.call(descriptor, "value"), "COMPOSITION_RUNTIME_INPUT_INVALID");
      if (array) fail(/^(?:0|[1-9]\d*)$/.test(key), "COMPOSITION_RUNTIME_INPUT_INVALID");
      textBytes += Buffer.byteLength(key, "utf8"); fail(textBytes <= byteLimit, "COMPOSITION_RUNTIME_INPUT_BOUND");
      walk(descriptor.value, depth + 1);
    }
    seen.delete(item);
  };
  walk(value, 0); const bytes = JSON.stringify(value);
  fail(Buffer.byteLength(bytes, "utf8") <= byteLimit, "COMPOSITION_RUNTIME_INPUT_BOUND");
  return JSON.parse(bytes);
}
type Population = ManagerAllocationArtifact["population"];
const tupleKey = (m: Population[number]) => JSON.stringify([m.tuple.alpha_id, m.tuple.alpha_version_id,
  m.tuple.portfolio_id, m.tuple.deployment_id, m.tuple.account_id]);
const censusKey = (m: Population[number]) => JSON.stringify([tupleKey(m), m.stage]);
const populationDigest = (items: Population) => accessDigest([...new Set(items.map(tupleKey))].sort());
function completeSubjects(rows: readonly { subject_id: string }[], subjects: readonly string[]): boolean {
  return new Set(rows.map(row => row.subject_id)).size === rows.length && same(rows.map(row => row.subject_id).sort(), [...subjects].sort());
}
function current(record: AllocationRecord, nowMs: number): boolean {
  return Number.isSafeInteger(nowMs) && nowMs >= record.artifact.source_as_of_ms && nowMs < record.approval.valid_until_ms
    && nowMs - record.artifact.source_as_of_ms <= record.artifact.maximum_source_age_ms;
}
export type ManagerAllocationLoadResult = { status: "READY"; handle: ApprovedManagerAllocation }
  | { status: "NOT_PUBLISHED"; reason_codes: string[] };
export function loadApprovedManagerAllocation(input: { artifact_bytes: Uint8Array | string | null;
  approval_pin: ManagerAllocationApprovalPin | null; scope: ManagerCompositionScope; as_of_ms: number }): ManagerAllocationLoadResult {
  try {
    fail(input.artifact_bytes !== null && input.approval_pin !== null, "ALLOCATION_APPROVAL_NOT_PUBLISHED");
    fail(typeof input.artifact_bytes === "string" || input.artifact_bytes instanceof Uint8Array, "ALLOCATION_ARTIFACT_INVALID");
    // Bound bytes BEFORE hashing, decoding, parsing or running schemas.
    fail((typeof input.artifact_bytes === "string" ? Buffer.byteLength(input.artifact_bytes, "utf8") : input.artifact_bytes.byteLength) > 0
      && (typeof input.artifact_bytes === "string" ? Buffer.byteLength(input.artifact_bytes, "utf8") : input.artifact_bytes.byteLength) <= BYTE_CEILING,
    "ALLOCATION_ARTIFACT_BYTE_LIMIT");
    const bytes = typeof input.artifact_bytes === "string" ? Buffer.from(input.artifact_bytes, "utf8") : Buffer.from(input.artifact_bytes);
    const approval = approvalSchema.parse(capture(input.approval_pin, 65_536));
    fail(`sha256:${createHash("sha256").update(bytes).digest("hex")}` === approval.artifact_sha256, "ALLOCATION_ARTIFACT_HASH_MISMATCH");
    const artifact = artifactSchema.parse(capture(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)), BYTE_CEILING));
    const scope = managerCompositionScope.parse(capture(input.scope, 4096)); const now = utcMilliseconds.parse(input.as_of_ms);
    fail(same(scope, artifact.scope) && same(scope, approval.scope), "ALLOCATION_SCOPE_MISMATCH");
    const a = artifact, b = a.binding;
    fail(approval.binding_digest === accessDigest(b) && approval.source_revision === a.source_revision
      && approval.source_set_digest === a.source_set_digest && approval.source_as_of_ms === a.source_as_of_ms
      && approval.allocation_revision === a.allocation_revision && approval.ownership_manifest_ref === a.ownership_manifest_ref
      && approval.full_accounting_manifest_ref === a.full_accounting_manifest_ref, "ALLOCATION_APPROVAL_PIN_MISMATCH");
    fail(approval.approved_at_ms <= a.source_as_of_ms && a.effective_at_ms <= a.source_as_of_ms
      && b.window_end_ms <= a.source_as_of_ms, "ALLOCATION_NOT_AVAILABLE_AS_OF");
    const environmentStages = scope.environment === "paper" ? ["PAPER"] : scope.environment === "sandbox" ? ["SANDBOX"] : ["CANARY", "LIVE"];
    fail(b.stage_filter.every(stage => environmentStages.includes(stage))
      && a.population.every(m => b.stage_filter.includes(m.stage)) && populationDigest(a.population) === b.tuple_population_digest,
    "ALLOCATION_POPULATION_BINDING_MISMATCH");
    const fullKeys = a.population.map(censusKey), rowKeys = a.rows.flatMap(row => row.population.map(censusKey));
    fail(new Set(fullKeys).size === fullKeys.length && new Set(rowKeys).size === rowKeys.length
      && same([...fullKeys].sort(), rowKeys.sort()) && completeSubjects(a.rows, [...new Set(a.population.map(m => m.tuple.alpha_id))]),
    "ALLOCATION_FULL_CENSUS_MISMATCH");
    fail(b.subject_type !== "portfolio" || a.population.every(m => m.tuple.portfolio_id === b.subject_id), "ALLOCATION_SUBJECT_MISMATCH");
    const ownership = a.rows.flatMap(row => row.economic_ownership_ids);
    fail(ownership.length <= 10_000 && new Set(ownership).size === ownership.length, "ALLOCATION_OWNERSHIP_OVERLAP");
    for (const row of a.rows) {
      const r = row.raw_binding;
      fail(row.population.every(m => m.tuple.alpha_id === row.subject_id) && r.subject_type === "alpha" && r.subject_id === row.subject_id
        && r.tuple_population_digest === populationDigest(row.population) && new Set(r.stage_filter).size === r.stage_filter.length
        && r.stage_filter.every(stage => b.stage_filter.includes(stage)) && row.population.every(m => r.stage_filter.includes(m.stage))
        && r.partition_digest === b.partition_digest && r.window_start_ms === b.window_start_ms && r.window_end_ms === b.window_end_ms,
      "ALLOCATION_RAW_BINDING_MISMATCH");
    }
    const approvedSubPin = (part: unknown, pin: ManagerAllocationApprovalPin["grouping_pin"]): boolean => part !== null && pin !== null
      && pin.artifact_digest === accessDigest(part) && pin.approved_at_ms <= a.source_as_of_ms && pin.valid_until_ms > pin.approved_at_ms;
    // Missing, mismatched or expired auxiliary authority withholds that diagnostic, not the independent A.
    const groupingApproved = approvedSubPin(a.grouping, approval.grouping_pin) && a.grouping !== null
      && a.grouping.effective_at_ms <= a.source_as_of_ms && completeSubjects(a.grouping.rows, a.rows.map(r => r.subject_id));
    let navApproved = false;
    if (a.nav_partition && approvedSubPin(a.nav_partition, approval.nav_pin)) {
      const nav = a.nav_partition;
      const sum = sumExactDecimals([...nav.rows.map(row => row.current_nav_allocated_capital), nav.idle_cash, nav.other_nav]);
      navApproved = nav.as_of_ms === a.source_as_of_ms && nav.currency === a.currency && nav.comparable_basis_id === b.comparable_basis_id
        && completeSubjects(nav.rows, a.rows.map(row => row.subject_id)) && sum !== null
        && compareManagerDecimals(sum, nav.nav) === 0 && compareManagerDecimals(nav.nav, "0") > 0;
    }
    const navValues = new Map(a.nav_partition?.rows.map(row => [row.subject_id, row.current_nav_allocated_capital]) ?? []);
    const navMatchesAllocation = navApproved && a.rows.every(row => {
      const value = navValues.get(row.subject_id); return value !== undefined && compareManagerDecimals(value, row.allocated_economic_capital) === 0;
    });
    const record = freeze({ artifact, approval, groupingApproved, navApproved, navMatchesAllocation }); fail(current(record, now), "ALLOCATION_NOT_CURRENT");
    const handle = Object.freeze({}) as ApprovedManagerAllocation; allocations.set(handle, record); return { status: "READY", handle };
  } catch (error) {
    const code = error instanceof Error && /^(?:ALLOCATION_|COMPOSITION_RUNTIME_)[A-Z_]+$/.test(error.message) ? error.message : "ALLOCATION_ARTIFACT_INVALID";
    return { status: "NOT_PUBLISHED", reason_codes: [code] };
  }
}
/** Private configuration refresh/revocation, never an exposed management endpoint. */
export const revokeApprovedManagerAllocation = (handle: ApprovedManagerAllocation): boolean => allocations.delete(handle);
export interface ManagerCompositionRuntimeTask { allocation: ApprovedManagerAllocation | null;
  scope: ManagerCompositionScope; binding: ManagerCompositionBinding; source_revision: string; source_set_digest: string;
  source_as_of_ms: number; source_qualification: "SOURCE_VERIFIED"; calculation_revision: string; computed_at_ms: number;
  raw_scores: readonly ManagerScorePublication[] }
export interface ManagerCompositionRuntimeLimits { maximum_rows: number; maximum_input_bytes: number; maximum_in_flight: number }
export class ManagerCompositionRuntimeError extends Error { constructor(readonly code: string) { super(code); } }
type CapturedTask = Omit<ManagerCompositionRuntimeTask, "allocation">;
const taskSchema = z.object({ scope: managerCompositionScope, binding: managerCompositionBinding,
  source_revision: text, source_set_digest: publicationDigest, source_as_of_ms: utcMilliseconds,
  source_qualification: z.literal("SOURCE_VERIFIED"), calculation_revision: text, computed_at_ms: utcMilliseconds,
  raw_scores: z.array(managerScorePublication).max(128) }).strict();
function approvedRaw(fence: ManagerScoreReadFence, score: ManagerScorePublication): boolean {
  try { return fence.accepts(score) === true; } catch { return false; }
}
function exactRaw(score: ManagerScorePublication, record: AllocationRecord, row: ManagerAllocationArtifact["rows"][number], computedAt: number): boolean {
  const a = record.artifact, p = score.provenance;
  return score.slot === "RAW" && same(p.binding, row.raw_binding) && same(p.scope, a.scope)
    && p.source_revision === a.source_revision && p.source_set_digest === a.source_set_digest && p.source_as_of_ms === a.source_as_of_ms
    && p.source_qualification === "SOURCE_VERIFIED" && p.computed_at_ms >= a.source_as_of_ms && p.computed_at_ms <= computedAt
    && score.quality.value !== null && ["available", "provisional"].includes(score.quality.status)
    && score.quality.qualification === "RUNTIME_APPROVED" && score.quality.comparable_basis_id === row.raw_binding.comparable_basis_id
    && score.quality.comparable_basis_id === a.binding.comparable_basis_id
    && score.quality.individual_evidence_binding_id === row.raw_binding.individual_evidence_binding_id;
}
function inputDigest(record: AllocationRecord, refs: ManagerCompositionPublication["provenance"]["raw_score_refs"]): string {
  const a = record.artifact;
  return accessDigest({ allocation_artifact_sha256: record.approval.artifact_sha256, scope: a.scope, binding: a.binding,
    source_revision: a.source_revision, source_set_digest: a.source_set_digest, raw_score_refs: refs });
}
function auxiliaryCurrent(record: AllocationRecord, kind: "GROUPING" | "NAV", nowMs: number): boolean {
  const pin = kind === "GROUPING" ? record.approval.grouping_pin : record.approval.nav_pin;
  return pin !== null && nowMs < pin.valid_until_ms && (kind === "GROUPING" ? record.groupingApproved : record.navMatchesAllocation);
}
function sanitizeAuxiliary(record: AllocationRecord, result: ManagerCompositionPublication["result"], nowMs: number): void {
  if (!auxiliaryCurrent(record, "GROUPING", nowMs)) {
    result.diagnostics.allocation_hhi = null; result.diagnostics.score_contribution_hhi = null;
    result.diagnostics.reason_codes = result.diagnostics.reason_codes.filter(reason => !["GROUPING_NOT_PUBLISHED", "GROUPING_NOT_APPROVED",
      "GROUPING_APPROVAL_NOT_CURRENT", "NO_POSITIVE_SCORE_CREDIT", "SCORE_COVERAGE_INCOMPLETE"].includes(reason));
    result.diagnostics.reason_codes.push("GROUPING_NOT_PUBLISHED");
    if (record.artifact.grouping !== null) result.diagnostics.reason_codes.push(record.groupingApproved ? "GROUPING_APPROVAL_NOT_CURRENT" : "GROUPING_NOT_APPROVED");
  }
  if (!auxiliaryCurrent(record, "NAV", nowMs)) {
    result.allocation_coverage_nav = null; result.scored_nav_weight = null; result.idle_cash_weight = null;
    result.nav_coverage_reason = "BASIS_MISMATCH";
  }
}
function build(record: AllocationRecord, task: CapturedTask, rawFence: ManagerScoreReadFence, nowMs: number): ManagerCompositionPublication {
  const a = record.artifact, p = record.approval;
  fail(current(record, nowMs) && task.computed_at_ms >= a.source_as_of_ms && task.computed_at_ms <= nowMs
    && task.computed_at_ms < p.valid_until_ms, "COMPOSITION_ALLOCATION_NOT_CURRENT");
  fail(same(task.scope, a.scope) && same(task.binding, a.binding) && task.source_revision === a.source_revision
    && task.source_set_digest === a.source_set_digest && task.source_as_of_ms === a.source_as_of_ms
    && task.source_qualification === "SOURCE_VERIFIED", "COMPOSITION_SOURCE_BINDING_MISMATCH");
  // Auxiliary diagnostic expiry never invalidates the assigned-capital A approval.
  const groupingCurrent = auxiliaryCurrent(record, "GROUPING", nowMs);
  const grouping = new Map((groupingCurrent ? a.grouping?.rows : null)?.map(row => [row.subject_id, row.concentration_group_id]) ?? []);
  const refs: { subject_id: string; publication_digest: string }[] = [], reasons: string[] = [];
  const rows: ManagerAllocationRow[] = a.rows.map(row => {
    const candidates = task.raw_scores.filter(score => score.slot === "RAW" && same(score.provenance.binding, row.raw_binding)
      && same(score.provenance.scope, a.scope) && score.provenance.source_revision === a.source_revision
      && score.provenance.source_set_digest === a.source_set_digest && score.provenance.source_as_of_ms === a.source_as_of_ms);
    const unique = [...new Map(candidates.map(score => [accessDigest(score), score])).values()];
    const score = unique.length === 1 ? unique[0] : undefined;
    const used = compareManagerDecimals(row.allocated_economic_capital, "0") > 0 && score !== undefined
      && exactRaw(score, record, row, task.computed_at_ms) && approvedRaw(rawFence, score);
    if (used && score) refs.push({ subject_id: row.subject_id, publication_digest: accessDigest(score) });
    else if (compareManagerDecimals(row.allocated_economic_capital, "0") > 0) reasons.push(unique.length > 1 ? "RAW_SCORE_PUBLICATION_CONFLICT" : score ? "RAW_SCORE_NOT_CURRENT_OR_INCOMPATIBLE" : "RAW_SCORE_EXACT_BINDING_NOT_PUBLISHED");
    return { subject_id: row.subject_id, allocated_economic_capital: row.allocated_economic_capital,
      concentration_group_id: grouping.get(row.subject_id) ?? null,
      score: { value: used && score ? score.quality.value : null, status: used && score ? score.quality.status : "unbound",
        qualification: used && score ? score.quality.qualification : "UNQUALIFIED", comparable_basis_id: row.raw_binding.comparable_basis_id,
        individual_evidence_binding_id: used ? row.raw_binding.individual_evidence_binding_id : null, fresh: used } };
  });
  const nav = a.nav_partition;
  // Assigned capital can exceed current NAV after losses. A remains valid; NAV ratios require the SAME a_i.
  const navMatches = auxiliaryCurrent(record, "NAV", nowMs);
  const result = aggregateManagerAlphaScores({ rows, comparable_basis_id: a.binding.comparable_basis_id,
    allocation_snapshot_id: a.allocation_snapshot_id, scope_complete: true, ownership_partition_verified: true, currency: a.currency,
    nav_partition: navMatches && nav ? { verified: true, nav: nav.nav, idle_cash: nav.idle_cash, same_cutoff_and_basis: true } : null });
  sanitizeAuxiliary(record, result, nowMs);
  result.reason_codes = [...new Set([...result.reason_codes, ...reasons])]; refs.sort((left, right) => left.subject_id < right.subject_id ? -1 : left.subject_id > right.subject_id ? 1 : 0);
  return freeze(managerCompositionPublication.parse({ slot: "COMPOSITION", result, provenance: { scope: task.scope, binding: task.binding,
    source_revision: a.source_revision, source_set_digest: a.source_set_digest, source_as_of_ms: a.source_as_of_ms,
    source_qualification: "SOURCE_VERIFIED", calculation_revision: task.calculation_revision, computed_at_ms: task.computed_at_ms,
    input_digest: inputDigest(record, refs),
    allocation_artifact_sha256: p.artifact_sha256, allocation_revision: a.allocation_revision,
    ownership_manifest_ref: a.ownership_manifest_ref, full_accounting_manifest_ref: a.full_accounting_manifest_ref,
    allocation_effective_at_ms: a.effective_at_ms, approval_ref: p.approval_ref, approved_at_ms: p.approved_at_ms,
    valid_until_ms: p.valid_until_ms, raw_score_refs: refs } }));
}
/** Private current proof only: immutable worker/store intake establishes calculation provenance. */
function publicationReferencesCurrent(handle: ApprovedManagerAllocation | null, parsed: ManagerCompositionPublication,
  raw_scores: readonly ManagerScorePublication[], rawFence: ManagerScoreReadFence, nowMs: number): boolean {
  try {
    const record = handle ? allocations.get(handle) : undefined; if (!record || !current(record, nowMs)) return false;
    const p = parsed.provenance, a = record.artifact, pin = record.approval;
    if (!same(p.scope, a.scope) || !same(p.binding, a.binding) || p.source_revision !== a.source_revision
      || p.source_set_digest !== a.source_set_digest || p.source_as_of_ms !== a.source_as_of_ms || p.source_qualification !== "SOURCE_VERIFIED"
      || p.computed_at_ms > nowMs || p.allocation_artifact_sha256 !== pin.artifact_sha256 || p.allocation_revision !== a.allocation_revision
      || p.ownership_manifest_ref !== a.ownership_manifest_ref || p.full_accounting_manifest_ref !== a.full_accounting_manifest_ref
      || p.allocation_effective_at_ms !== a.effective_at_ms || p.approval_ref !== pin.approval_ref || p.approved_at_ms !== pin.approved_at_ms
      || p.valid_until_ms !== pin.valid_until_ms || parsed.result.allocation_snapshot_id !== a.allocation_snapshot_id
      || p.input_digest !== inputDigest(record, p.raw_score_refs)) return false;
    // Current proof only: the immutable worker/store establishes calculation provenance. Never recalculate A in a BFF.
    const scores = z.array(managerScorePublication).max(128).parse(capture(raw_scores, BYTE_CEILING));
    const byDigest = new Map(scores.map(score => [accessDigest(score), freeze(score)]));
    const rows = new Map(a.rows.map(row => [row.subject_id, row]));
    const refs = new Map(p.raw_score_refs.map(ref => [ref.subject_id, ref]));
    const positiveSubjects = a.rows.filter(row => compareManagerDecimals(row.allocated_economic_capital, "0") > 0).map(row => row.subject_id).sort();
    if (!same(parsed.result.contributions.map(row => row.subject_id).sort(), positiveSubjects)) return false;
    for (const contribution of parsed.result.contributions) if ((contribution.value !== null) !== refs.has(contribution.subject_id)) return false;
    for (const ref of p.raw_score_refs) {
      const row = rows.get(ref.subject_id), score = byDigest.get(ref.publication_digest);
      if (!row || !score || compareManagerDecimals(row.allocated_economic_capital, "0") <= 0
        || !exactRaw(score, record, row, p.computed_at_ms) || !approvedRaw(rawFence, score)) return false;
    }
    return handle !== null && allocations.get(handle) === record && current(record, nowMs);
  } catch { return false; }
}
/** Idempotent read projection: optional diagnostic expiry never removes an otherwise current assigned A. */
export function managerCompositionPublicationForRead(handle: ApprovedManagerAllocation | null, pub: unknown,
  raw_scores: readonly ManagerScorePublication[], rawFence: ManagerScoreReadFence, nowMs: number): ManagerCompositionPublication | null {
  try {
    const record = handle ? allocations.get(handle) : undefined;
    if (!record) return null;
    const parsed = managerCompositionPublication.parse(capture(pub, BYTE_CEILING));
    if (!publicationReferencesCurrent(handle, parsed, raw_scores, rawFence, nowMs)) return null;
    sanitizeAuxiliary(record, parsed.result, nowMs);
    return freeze(managerCompositionPublication.parse(parsed));
  } catch { return null; }
}
/** Final delivery fence requires the already sanitized projection; no aggregate is computed in a read. */
export function managerCompositionPublicationCurrent(handle: ApprovedManagerAllocation | null, pub: unknown,
  raw_scores: readonly ManagerScorePublication[], rawFence: ManagerScoreReadFence, nowMs: number): boolean {
  try {
    const captured = capture(pub, BYTE_CEILING);
    const projected = managerCompositionPublicationForRead(handle, captured, raw_scores, rawFence, nowMs);
    return projected !== null && same(captured, projected);
  } catch { return false; }
}
/** No queue, scheduler, network, database, request-time computation or implicit resource defaults. */
export class ManagerCompositionRuntime {
  private inFlight = 0; private readonly limits: Readonly<ManagerCompositionRuntimeLimits>;
  constructor(limits: ManagerCompositionRuntimeLimits, private readonly now: () => number = () => Date.now()) {
    const ceilings: ManagerCompositionRuntimeLimits = { maximum_rows: 10_000, maximum_input_bytes: BYTE_CEILING, maximum_in_flight: 4 };
    if (!limits || typeof now !== "function" || Object.keys(ceilings).some(key => { const k = key as keyof ManagerCompositionRuntimeLimits;
      return !Number.isSafeInteger(limits[k]) || limits[k] < 1 || limits[k] > ceilings[k]; }))
      throw new ManagerCompositionRuntimeError("COMPOSITION_RUNTIME_LIMIT_INVALID");
    this.limits = Object.freeze({ ...limits });
  }
  async calculate(task: ManagerCompositionRuntimeTask, rawFence: ManagerScoreReadFence, signal?: AbortSignal): Promise<ManagerCompositionPublication> {
    if (this.inFlight >= this.limits.maximum_in_flight) throw new ManagerCompositionRuntimeError("COMPOSITION_RUNTIME_CAPACITY");
    this.inFlight += 1;
    try {
      fail(!signal?.aborted, "COMPOSITION_RUNTIME_CANCELLED");
      fail(task && [Object.prototype, null].includes(Object.getPrototypeOf(task)) && Object.getOwnPropertySymbols(task).length === 0, "COMPOSITION_RUNTIME_INPUT_INVALID");
      const fields = Object.getOwnPropertyDescriptors(task);
      fail(Object.values(fields).every(field => field.enumerable && Object.prototype.hasOwnProperty.call(field, "value")), "COMPOSITION_RUNTIME_INPUT_INVALID");
      const handle = fields.allocation?.value as ApprovedManagerAllocation | null;
      const record = handle ? allocations.get(handle) : undefined;
      fail(record, "COMPOSITION_ALLOCATION_NOT_APPROVED");
      fail(record.artifact.rows.length <= this.limits.maximum_rows, "COMPOSITION_RUNTIME_INPUT_BOUND");
      const payload = Object.fromEntries(Object.entries(fields).filter(([key]) => key !== "allocation").map(([key, field]) => [key, field.value]));
      // Detach all caller data before yielding. Approved handle remains identity-bound in the private map.
      const captured = freeze(taskSchema.parse(capture(payload, this.limits.maximum_input_bytes)));
      await Promise.resolve();
      fail(!signal?.aborted, "COMPOSITION_RUNTIME_CANCELLED");
      fail(handle !== null && allocations.get(handle) === record, "COMPOSITION_ALLOCATION_NOT_APPROVED");
      const result = build(record, captured, rawFence, this.now());
      fail(!signal?.aborted, "COMPOSITION_RUNTIME_CANCELLED");
      fail(handle !== null && allocations.get(handle) === record && current(record, this.now()), "COMPOSITION_ALLOCATION_NOT_APPROVED");
      return result;
    } catch (error) {
      throw new ManagerCompositionRuntimeError(error instanceof Error && /^COMPOSITION_[A-Z_]+$/.test(error.message) ? error.message : "COMPOSITION_RUNTIME_INPUT_INVALID");
    } finally { this.inFlight -= 1; }
  }
}
