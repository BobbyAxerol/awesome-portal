import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";
import { z } from "zod";
import { accessDigest } from "./access-policy";
import { exactDecimal, financialStage, utcMilliseconds } from "./foundation.contract";
import { publicationDigest } from "./publication.contract";
import { managerTuple, managerModelDocument, type ManagerModelDocument } from "./manager-model.contract";
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
  /** Exact accepted UTF-8 bytes, including JSON whitespace/BOM, never reserialized from the schema. */
  artifact_utf8: string;
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
type AllocationLoadInput = { artifact_bytes: Uint8Array | string | null;
  approval_pin: ManagerAllocationApprovalPin | null; scope: ManagerCompositionScope; as_of_ms: number };
/** Shared structural/pin/original-time validation. Does not mint an operational handle. */
function allocationRecordFromBytes(input: AllocationLoadInput): AllocationRecord {
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
  const artifact_utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  const record = freeze({ artifact, approval, artifact_utf8, groupingApproved, navApproved, navMatchesAllocation });
  fail(current(record, now), "ALLOCATION_NOT_CURRENT"); return record;
}
export function loadApprovedManagerAllocation(input: AllocationLoadInput): ManagerAllocationLoadResult {
  try {
    const record = allocationRecordFromBytes(input);
    const handle = Object.freeze({}) as ApprovedManagerAllocation; allocations.set(handle, record); return { status: "READY", handle };
  } catch (error) {
    const code = error instanceof Error && /^(?:ALLOCATION_|COMPOSITION_RUNTIME_)[A-Z_]+$/.test(error.message) ? error.message : "ALLOCATION_ARTIFACT_INVALID";
    return { status: "NOT_PUBLISHED", reason_codes: [code] };
  }
}
/** Private configuration refresh/revocation, never an exposed management endpoint. */
export const revokeApprovedManagerAllocation = (handle: ApprovedManagerAllocation): boolean => allocations.delete(handle);

/** Versioned PRIVATE custody only. No serialized record is an operational
 * allocation approval or a grant. Later v3 Score custody must bind this digest
 * to its immutable ORIGINAL pointer and the ACTUAL source135 bytes. */
const historyDigest = publicationDigest.refine(value => /^sha256:[a-f0-9]{64}$(?![\s\S])/.test(value));
const originalSourceSchema = z.object({ workspace_id: text, environment: managerCompositionScope.shape.environment,
  profile_id: text, catalogue_digest: historyDigest, revision: text, payload_digest: historyDigest,
  source_epoch: text, source_sequence: managerModelDocument.innerType().shape.source_sequence,
  projection_generation: text, source_set_digest: historyDigest, as_of_ms: utcMilliseconds }).strict();
const originalAllocationBaseSchema = z.object({
  schema_version: z.literal("portal.execution.manager-composition-original-allocation.v1"),
  purpose: z.literal("HISTORICAL_ANALYSIS_ONLY"), operational_current: z.literal(false),
  source: originalSourceSchema, binding: managerCompositionBinding,
  artifact_utf8: z.string().min(1).max(BYTE_CEILING), artifact_sha256: historyDigest,
  approval_pin: approvalSchema, original_publication_digest: historyDigest,
  original_computed_at_ms: utcMilliseconds, captured_at_ms: utcMilliseconds,
  population_census_digest: historyDigest,
}).strict();
const originalAllocationSchema = originalAllocationBaseSchema.extend({ custody_digest: historyDigest }).strict();
export type ManagerCompositionOriginalAllocationCustody = z.infer<typeof originalAllocationSchema>;
const custodyReason = z.enum(["COMPOSITION_ORIGINAL_CUSTODY_INVALID", "COMPOSITION_ORIGINAL_CUSTODY_BOUND",
  "COMPOSITION_ORIGINAL_CUSTODY_NOT_APPROVED", "COMPOSITION_ORIGINAL_CUSTODY_NOT_CURRENT",
  "COMPOSITION_ORIGINAL_CUSTODY_SOURCE_MISMATCH", "COMPOSITION_ORIGINAL_CUSTODY_PUBLICATION_MISMATCH",
  "COMPOSITION_ORIGINAL_CUSTODY_POPULATION_MISMATCH", "COMPOSITION_ORIGINAL_CUSTODY_DIGEST_MISMATCH",
  "COMPOSITION_ORIGINAL_CUSTODY_ORIGINAL_TIME_INVALID", "COMPOSITION_ORIGINAL_CUSTODY_ARTIFACT_INVALID"]);
type CustodyAbsence = { status: "NOT_PUBLISHED"; reason_code: z.infer<typeof custodyReason> };
export type ManagerCompositionOriginalAllocationCapture =
  { status: "READY"; custody: ManagerCompositionOriginalAllocationCustody } | CustodyAbsence;
declare const retainedAllocationBrand: unique symbol;
/** Branded verified historical inputs ONLY. Cannot be passed to current calculate/load/read fences. */
export interface RetainedManagerAllocationInputs { readonly [retainedAllocationBrand]: true }
interface RetainedAllocationRecord { custody: ManagerCompositionOriginalAllocationCustody; record: AllocationRecord }
const retainedAllocations = new WeakMap<RetainedManagerAllocationInputs, RetainedAllocationRecord>();
// FIRST-WRITE evidence identity only. Restoring historical bytes NEVER registers
// here or creates a fresh original-capture identity/current allocation grant.
const capturedOriginalAllocations = new WeakMap<ManagerCompositionOriginalAllocationCustody, ManagerCompositionOriginalAllocationCustody>();
export type ManagerCompositionOriginalAllocationRestore =
  { status: "READY"; handle: RetainedManagerAllocationInputs } | CustodyAbsence;
function historyFail(condition: unknown, code: z.infer<typeof custodyReason>): asserts condition {
  if (!condition) throw new Error(code);
}
function historyAbsence(error: unknown): CustodyAbsence {
  const code = error instanceof Error ? custodyReason.safeParse(error.message) : null;
  return { status: "NOT_PUBLISHED", reason_code: code?.success ? code.data
    : error instanceof Error && ["COMPOSITION_RUNTIME_INPUT_BOUND", "ALLOCATION_ARTIFACT_BYTE_LIMIT"].includes(error.message)
      ? "COMPOSITION_ORIGINAL_CUSTODY_BOUND" : "COMPOSITION_ORIGINAL_CUSTODY_INVALID" };
}
/** Inspect descriptors BEFORE reading values: handles/fence are not JSON and
 * must not be cloned, while every serializable subtree is captured separately. */
function historyFields(value: unknown, keys: readonly string[]): Record<string, PropertyDescriptor> {
  historyFail(typeof value === "object" && value !== null &&
    !isProxy(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)) && Object.getOwnPropertySymbols(value).length === 0,
  "COMPOSITION_ORIGINAL_CUSTODY_INVALID");
  const fields = Object.getOwnPropertyDescriptors(value);
  historyFail(Object.keys(fields).length === keys.length && keys.every(key => Object.hasOwn(fields, key)) &&
    Object.values(fields).every(field => field.enumerable && Object.hasOwn(field, "value")),
  "COMPOSITION_ORIGINAL_CUSTODY_INVALID"); return fields;
}

/** New-history boundary only: reject Proxy before ANY reflection/serialization.
 * Legacy allocation loader capture/admission semantics remain unchanged. */
function historyCapture(value: unknown, limit: number): unknown {
  let nodes = 0, textBytes = 0; const active = new Set<object>();
  const inspect = (item: unknown, depth: number): void => {
    historyFail(++nodes <= 250_000 && depth <= 32, "COMPOSITION_ORIGINAL_CUSTODY_BOUND");
    if (typeof item === "string") {
      textBytes += Buffer.byteLength(item, "utf8");
      historyFail(textBytes <= limit, "COMPOSITION_ORIGINAL_CUSTODY_BOUND"); return;
    }
    if (item === null || typeof item === "boolean" || typeof item === "number" && Number.isFinite(item)) return;
    historyFail(typeof item === "object" && item !== null && !isProxy(item),
      "COMPOSITION_ORIGINAL_CUSTODY_INVALID");
    const array = Array.isArray(item), prototype = Object.getPrototypeOf(item);
    historyFail(!active.has(item) && (array ? prototype === Array.prototype : [Object.prototype, null].includes(prototype)) &&
      Object.getOwnPropertySymbols(item).length === 0, "COMPOSITION_ORIGINAL_CUSTODY_INVALID");
    const fields = Object.getOwnPropertyDescriptors(item);
    const length = array ? fields.length?.value as unknown : undefined;
    historyFail(!array || Number.isSafeInteger(length) && (length as number) >= 0 && (length as number) <= 20_000 &&
      Object.keys(fields).length === (length as number) + 1, "COMPOSITION_ORIGINAL_CUSTODY_BOUND");
    active.add(item);
    for (const [key, field] of Object.entries(fields)) {
      if (array && key === "length") continue;
      historyFail(field.enumerable && Object.hasOwn(field, "value") &&
        (!array || /^(?:0|[1-9]\d*)$(?![\s\S])/.test(key) && Number(key) < (length as number)),
      "COMPOSITION_ORIGINAL_CUSTODY_INVALID");
      textBytes += Buffer.byteLength(key, "utf8");
      historyFail(textBytes <= limit, "COMPOSITION_ORIGINAL_CUSTODY_BOUND");
      inspect(field.value, depth + 1);
    }
    active.delete(item);
  };
  inspect(value, 0); return capture(value, limit);
}
function historyNow(now: () => number): number {
  historyFail(typeof now === "function" && !isProxy(now), "COMPOSITION_ORIGINAL_CUSTODY_INVALID");
  return utcMilliseconds.parse(now());
}
function historyRawFence(value: unknown): ManagerScoreReadFence {
  const fields = historyFields(value, ["accepts"]), accepts = fields.accepts.value as unknown;
  historyFail(typeof accepts === "function" && !isProxy(accepts), "COMPOSITION_ORIGINAL_CUSTODY_INVALID");
  // Keep a detached function reference; later property mutation cannot install
  // an accessor/Proxy between two RAW reference checks.
  return { accepts: score => Reflect.apply(accepts, value, [score]) === true };
}

function historyLimit(value: unknown): number {
  historyFail(Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= BYTE_CEILING,
    "COMPOSITION_ORIGINAL_CUSTODY_BOUND"); return value as number;
}
function historyDocument(value: unknown): ManagerModelDocument {
  const document = managerModelDocument.parse(historyCapture(value, BYTE_CEILING));
  historyFail(document.qualification === "SOURCE_VERIFIED", "COMPOSITION_ORIGINAL_CUSTODY_SOURCE_MISMATCH");
  return document;
}
function originalSource(document: ManagerModelDocument): z.infer<typeof originalSourceSchema> {
  return { workspace_id: document.workspace_id, environment: document.environment, profile_id: document.profile_id,
    catalogue_digest: document.catalogue_digest, revision: document.revision, payload_digest: accessDigest(document),
    source_epoch: document.source_epoch, source_sequence: document.source_sequence,
    projection_generation: document.projection_generation, source_set_digest: document.source_set_digest, as_of_ms: document.as_of_ms };
}
function historySourceMatches(record: AllocationRecord, document: ManagerModelDocument,
  publication: ManagerCompositionPublication): void {
  const a = record.artifact, p = publication.provenance;
  historyFail(same(a.scope, { workspace_id: document.workspace_id, environment: document.environment,
    profile_id: document.profile_id, catalogue_digest: document.catalogue_digest }) &&
    a.source_revision === document.revision && a.source_set_digest === document.source_set_digest &&
    a.source_as_of_ms === document.as_of_ms, "COMPOSITION_ORIGINAL_CUSTODY_SOURCE_MISMATCH");
  historyFail(same(p.scope, a.scope) && same(p.binding, a.binding) && p.source_revision === a.source_revision &&
    p.source_set_digest === a.source_set_digest && p.source_as_of_ms === a.source_as_of_ms &&
    p.source_qualification === "SOURCE_VERIFIED" && p.allocation_artifact_sha256 === record.approval.artifact_sha256 &&
    p.allocation_revision === a.allocation_revision && p.ownership_manifest_ref === a.ownership_manifest_ref &&
    p.full_accounting_manifest_ref === a.full_accounting_manifest_ref && p.allocation_effective_at_ms === a.effective_at_ms &&
    p.approval_ref === record.approval.approval_ref && p.approved_at_ms === record.approval.approved_at_ms &&
    p.valid_until_ms === record.approval.valid_until_ms && publication.result.allocation_snapshot_id === a.allocation_snapshot_id &&
    p.input_digest === inputDigest(record, p.raw_score_refs), "COMPOSITION_ORIGINAL_CUSTODY_PUBLICATION_MISMATCH");
  const matches = (document.precomputed_compositions ?? []).filter(value => same(value.provenance.binding, a.binding) &&
    same(value.provenance.scope, a.scope));
  historyFail(matches.length === 1 && same(matches[0], publication), "COMPOSITION_ORIGINAL_CUSTODY_PUBLICATION_MISMATCH");
  const positive = a.rows.filter(row => compareManagerDecimals(row.allocated_economic_capital, "0") > 0).map(row => row.subject_id).sort();
  const refs = new Set(p.raw_score_refs.map(ref => ref.subject_id));
  historyFail(same(publication.result.contributions.map(row => row.subject_id).sort(), positive) &&
    publication.result.contributions.every(row => (row.value !== null) === refs.has(row.subject_id)),
    "COMPOSITION_ORIGINAL_CUSTODY_PUBLICATION_MISMATCH");
  // The independent allocation pin attests the COMPLETE accounting census.
  // Every correlated tuple/stage must also exist exactly once in this source;
  // unrelated document subjects/partitions are not silently added to its scope.
  const sourceKeys = new Map<string, number>();
  for (const value of document.members) { const key = censusKey(value); sourceKeys.set(key, (sourceKeys.get(key) ?? 0) + 1); }
  historyFail(a.population.every(value => sourceKeys.get(censusKey(value)) === 1),
    "COMPOSITION_ORIGINAL_CUSTODY_POPULATION_MISMATCH");
}
export function captureManagerCompositionOriginalAllocation(input: { allocation: ApprovedManagerAllocation | null;
  document: ManagerModelDocument; publication: ManagerCompositionPublication; raw_fence: ManagerScoreReadFence;
  maximum_bytes: number }, now: () => number = Date.now): ManagerCompositionOriginalAllocationCapture {
  try {
    const fields = historyFields(input, ["allocation", "document", "publication", "raw_fence", "maximum_bytes"]);
    const limit = historyLimit(fields.maximum_bytes.value);
    const handle = fields.allocation.value as ApprovedManagerAllocation | null, record = handle ? allocations.get(handle) : undefined;
    historyFail(record, "COMPOSITION_ORIGINAL_CUSTODY_NOT_APPROVED");
    const document = historyDocument(fields.document.value);
    const publication = managerCompositionPublication.parse(historyCapture(fields.publication.value, BYTE_CEILING));
    historySourceMatches(record, document, publication);
    const captured = historyNow(now), rawFence = historyRawFence(fields.raw_fence.value);
    historyFail(current(record, captured), "COMPOSITION_ORIGINAL_CUSTODY_NOT_CURRENT");
    historyFail(publication.provenance.computed_at_ms <= captured &&
      publicationReferencesCurrent(handle, publication, document.precomputed_scores ?? [],
        rawFence, captured), "COMPOSITION_ORIGINAL_CUSTODY_PUBLICATION_MISMATCH");
    const base = originalAllocationBaseSchema.parse({ schema_version: "portal.execution.manager-composition-original-allocation.v1",
      purpose: "HISTORICAL_ANALYSIS_ONLY", operational_current: false, source: originalSource(document), binding: record.artifact.binding,
      artifact_utf8: record.artifact_utf8, artifact_sha256: record.approval.artifact_sha256, approval_pin: record.approval,
      original_publication_digest: accessDigest(publication), original_computed_at_ms: publication.provenance.computed_at_ms,
      captured_at_ms: captured, population_census_digest: accessDigest(record.artifact.population.map(censusKey).sort()) });
    const custody = originalAllocationSchema.parse(historyCapture({ ...base, custody_digest: accessDigest(base) }, limit));
    historyFail(handle !== null && allocations.get(handle) === record && current(record, historyNow(now)),
      "COMPOSITION_ORIGINAL_CUSTODY_NOT_CURRENT");
    const original = freeze(custody);
    capturedOriginalAllocations.set(original, original);
    return { status: "READY", custody: original };
  } catch (error) { return historyAbsence(error); }
}
/** Private first-write intake for the immutable parent. Identity lookup ONLY:
 * clones, JSON records and restore handles return null without caller reflection.
 * Does not renew approval, compute a result or create an operational grant. */
export function managerCompositionCapturedOriginalAllocation(custody: ManagerCompositionOriginalAllocationCustody | null):
  ManagerCompositionOriginalAllocationCustody | null {
  return custody && typeof custody === "object" ? capturedOriginalAllocations.get(custody) ?? null : null;
}
export function restoreManagerCompositionOriginalAllocation(input: { custody: unknown; expected_custody_digest: string;
  document: ManagerModelDocument; maximum_bytes: number }, now: () => number = Date.now): ManagerCompositionOriginalAllocationRestore {
  try {
    const fields = historyFields(input, ["custody", "expected_custody_digest", "document", "maximum_bytes"]);
    const limit = historyLimit(fields.maximum_bytes.value);
    const custody = originalAllocationSchema.parse(historyCapture(fields.custody.value, limit));
    const expectedValue = fields.expected_custody_digest.value as unknown;
    historyFail(typeof expectedValue === "string", "COMPOSITION_ORIGINAL_CUSTODY_INVALID");
    const expected = historyDigest.parse(expectedValue);
    const { custody_digest, ...base } = custody;
    historyFail(custody_digest === expected && accessDigest(base) === custody_digest,
      "COMPOSITION_ORIGINAL_CUSTODY_DIGEST_MISMATCH");
    const document = historyDocument(fields.document.value);
    historyFail(same(custody.source, originalSource(document)), "COMPOSITION_ORIGINAL_CUSTODY_SOURCE_MISMATCH");
    let record: AllocationRecord;
    try {
      record = allocationRecordFromBytes({ artifact_bytes: custody.artifact_utf8, approval_pin: custody.approval_pin,
        scope: { workspace_id: document.workspace_id, environment: document.environment, profile_id: document.profile_id,
          catalogue_digest: document.catalogue_digest }, as_of_ms: custody.original_computed_at_ms });
    } catch { throw new Error("COMPOSITION_ORIGINAL_CUSTODY_ARTIFACT_INVALID"); }
    historyFail(custody.artifact_sha256 === record.approval.artifact_sha256 && same(custody.binding, record.artifact.binding) &&
      custody.population_census_digest === accessDigest(record.artifact.population.map(censusKey).sort()),
    "COMPOSITION_ORIGINAL_CUSTODY_DIGEST_MISMATCH");
    historyFail(custody.original_computed_at_ms <= custody.captured_at_ms && custody.captured_at_ms <= historyNow(now) &&
      current(record, custody.captured_at_ms),
      "COMPOSITION_ORIGINAL_CUSTODY_ORIGINAL_TIME_INVALID");
    const publication = (document.precomputed_compositions ?? []).find(value => accessDigest(value) === custody.original_publication_digest);
    historyFail(publication && publication.provenance.computed_at_ms === custody.original_computed_at_ms,
      "COMPOSITION_ORIGINAL_CUSTODY_PUBLICATION_MISMATCH");
    historySourceMatches(record, document, publication);
    // Exact source RAW references, never a current policy grant or calculation.
    const scores = new Map((document.precomputed_scores ?? []).map(score => [accessDigest(score), score]));
    const rows = new Map(record.artifact.rows.map(row => [row.subject_id, row]));
    for (const ref of publication.provenance.raw_score_refs) {
      const row = rows.get(ref.subject_id), score = scores.get(ref.publication_digest);
      historyFail(row && score && compareManagerDecimals(row.allocated_economic_capital, "0") > 0 &&
        exactRaw(score, record, row, custody.original_computed_at_ms), "COMPOSITION_ORIGINAL_CUSTODY_PUBLICATION_MISMATCH");
    }
    const handle = Object.freeze({}) as RetainedManagerAllocationInputs;
    retainedAllocations.set(handle, freeze({ custody, record })); return { status: "READY", handle };
  } catch (error) { return historyAbsence(error); }
}
/** Detached historical inputs for a later approved historical worker. No current
 * allocation/policy/permission claim; caller must still qualify source custody
 * and current named-resource/field authority. Cloned/JSON handles return null. */
export function managerCompositionRetainedAllocationInputs(handle: RetainedManagerAllocationInputs | null): {
  custody: ManagerCompositionOriginalAllocationCustody; artifact: ManagerAllocationArtifact; approval: ManagerAllocationApprovalPin;
  grouping_artifact_bound: boolean; nav_artifact_bound: boolean; nav_matches_allocation: boolean;
} | null {
  const value = handle ? retainedAllocations.get(handle) : undefined; if (!value) return null;
  try { return freeze(historyCapture({ custody: value.custody, artifact: value.record.artifact, approval: value.record.approval,
    grouping_artifact_bound: value.record.groupingApproved, nav_artifact_bound: value.record.navApproved,
    nav_matches_allocation: value.record.navMatchesAllocation }, 3 * BYTE_CEILING) as {
      custody: ManagerCompositionOriginalAllocationCustody; artifact: ManagerAllocationArtifact; approval: ManagerAllocationApprovalPin;
      grouping_artifact_bound: boolean; nav_artifact_bound: boolean; nav_matches_allocation: boolean;
    }); } catch { return null; }
}

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
/** Final delivery fence requires the already sanitized projection; no aggregate is computed in a read.
 * Product selectors also supply the exact authorized pre-filter/page tuple+stage census. */
export function managerCompositionPublicationCurrent(handle: ApprovedManagerAllocation | null, pub: unknown,
  raw_scores: readonly ManagerScorePublication[], rawFence: ManagerScoreReadFence, nowMs: number,
  expectedMembers?: readonly Population[number][]): boolean {
  try {
    if (expectedMembers !== undefined) {
      const record = handle ? allocations.get(handle) : undefined;
      if (!record) return false;
      // Capture before access: existing bounded input validation rejects getters/prototypes.
      // Full Manager members may carry other reviewed fields; compare only exact identity/stage.
      const expected = z.array(member.strip()).max(10_000).parse(capture(expectedMembers, BYTE_CEILING));
      if (!same(expected.map(censusKey).sort(), record.artifact.population.map(censusKey).sort())) return false;
    }
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
