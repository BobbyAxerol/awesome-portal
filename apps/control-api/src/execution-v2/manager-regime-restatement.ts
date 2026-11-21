/** Independent historical Regime IDLE coordinator.
 * No installation, timer, new pool, initial ORIGINAL writer, public API or ACK. */
import { isProxy } from "node:util/types";
import { performance } from "node:perf_hooks";
import type { Pool } from "pg";
import { z } from "zod";
import { accessDigest } from "./access-policy";
import { managerModelDocument, type ManagerModelDocument } from "./manager-model.contract";
import { ManagerModelRepository, prepareManagerProjection } from "./manager-model.store";
import { ManagerProjectionLeases, fenceManagerProjection, type ManagerProjectionLease } from "./manager-lease";
import { ManagerScoreOriginalCustody, decodeRetainedManagerScoreOriginal,
  type ManagerScoreOriginalCustodySnapshot } from "./manager-score-original-custody";
import { managerRegimeText, managerRegimeRef, managerRegimeSubjectBinding } from "./manager-regime-publication.contract";
import { managerRegimeHistoricalPolicyArchive, managerRegimeHistoricalPolicySnapshot,
  managerRegimeHistoricalPolicySnapshotCurrent, restoreManagerRegimeHistoricalPolicySnapshot,
  restoreManagerRegimeOriginal, type ApprovedManagerRegimePolicy, type RetainedManagerRegimeInputs,
  type ManagerRegimeHistoricalPolicyArchive } from "./manager-regime-runtime";
import { MANAGER_REGIME_HISTORICAL_WORKER_VERSION, decodeRetainedManagerRegimeRestatement,
  type ManagerRegimeHistoricalRuntime, type ManagerRegimeHistoricalRestatement } from "./manager-regime-restatement-worker";
import type { ManagerProjectionSource } from "./manager-consumer";
import { datasetPublication } from "./publication.contract";
import { qualifyDatasetPublication, publicationCommissioningCurrent, publicationCommissioningDeadline,
  type PublicationCommissioning } from "./publication-adapter";
import type { ExecutionReadPublicationRequest } from "./read-publication";

export const MANAGER_REGIME_RESTATEMENT_VERSION = "portal.execution.manager-regime-restatement.v1" as const;
/** Requires a separate forward CHECK extension; this module never creates SQL/schema. */
export const MANAGER_REGIME_RESTATEMENT_HEAD = "REGIME_RESTATED_CURRENT_POLICY" as const;
export interface ManagerRegimeRestatementConfig {
  calculation_revision: string;
  maximum_bundle_bytes: number;
  maximum_revisions_per_source: number;
  maximum_retained_bytes_per_source: number;
}
type Original = ManagerScoreOriginalCustodySnapshot;
type RegimeOriginal = Extract<Original, { schema_version: "portal.execution.manager-score-original-inputs.v4" }>;
type Binding = ManagerRegimeHistoricalRestatement["binding"];
type StoredRow = { calculation_key: string; payload: unknown; payload_digest: string };
export interface ManagerRegimeRestatementSnapshot {
  schema_version: typeof MANAGER_REGIME_RESTATEMENT_VERSION;
  revision_mode: "RESTATED_CURRENT_POLICY"; purpose: "HISTORICAL_ANALYSIS_ONLY"; operational_current: false;
  source: Original["source"]; original_custody_key: string; original_inputs_digest: string;
  worker_schema_version: typeof MANAGER_REGIME_HISTORICAL_WORKER_VERSION;
  policy: ManagerRegimeHistoricalPolicyArchive; policy_identity_digest: string;
  calculation_revision: string; knowledge_cutoff_ms: number; computed_at_ms: number;
  entries: { binding: Binding; regime_custody_digest: string; historical: ManagerRegimeHistoricalRestatement }[];
  calculation_key: string; supersedes_calculation_key: string | null;
}
export interface ManagerRegimeRestatementRead { key: string | null; view: ManagerRegimeRestatementSnapshot | null }
export interface ManagerRegimeRestatementIdle {
  lease: ManagerProjectionLease; signal: AbortSignal; deadline_ms: number;
  transaction_timeout_ms: number; lease_ttl_ms: number;
}
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$(?![\s\S])/);
const ms = z.number().int().nonnegative().safe();
const originalSource = z.object({ workspace_id: managerRegimeText, environment: z.enum(["paper", "sandbox", "live"]),
  profile_id: managerRegimeText, revision: managerRegimeText, payload_digest: digest,
  qualification: z.literal("SOURCE_VERIFIED"), source_epoch: managerRegimeText,
  source_sequence: z.string().regex(/^(?:0|[1-9]\d{0,18})$(?![\s\S])/),
  projection_generation: managerRegimeText, catalogue_digest: digest, source_set_digest: digest, as_of_ms: ms }).strict();
const header = z.object({ schema_version: z.literal(MANAGER_REGIME_RESTATEMENT_VERSION),
  revision_mode: z.literal("RESTATED_CURRENT_POLICY"), purpose: z.literal("HISTORICAL_ANALYSIS_ONLY"),
  operational_current: z.literal(false), source: originalSource, original_custody_key: digest,
  original_inputs_digest: digest, worker_schema_version: z.literal(MANAGER_REGIME_HISTORICAL_WORKER_VERSION),
  policy: managerRegimeHistoricalPolicyArchive, policy_identity_digest: digest, calculation_revision: managerRegimeRef,
  knowledge_cutoff_ms: ms, computed_at_ms: ms, entries: z.array(z.object({ binding: managerRegimeSubjectBinding,
    regime_custody_digest: digest, historical: z.unknown() }).strict()).min(1).max(128),
  calculation_key: digest, supersedes_calculation_key: digest.nullable() }).strict();
function fail(code: string): never { throw new Error(code); }
const same = (a: unknown, b: unknown) => accessDigest(a) === accessDigest(b);
const keys = (d: Pick<ManagerModelDocument, "workspace_id" | "environment" | "profile_id">) =>
  [d.workspace_id, d.environment, d.profile_id];
const rowParams = (d: ManagerModelDocument) => [...keys(d), d.revision];
const bindingKey = (binding: Binding) => accessDigest({ ...binding, stage_filter: [...binding.stage_filter].sort() });
const scopeOf = (d: Pick<ManagerModelDocument, "workspace_id" | "environment" | "profile_id" | "catalogue_digest">) => ({
  workspace_id: d.workspace_id, environment: d.environment, profile_id: d.profile_id, catalogue_digest: d.catalogue_digest });
const selectHead = "SELECT calculation_key FROM execution_manager_score_mode_heads WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND source_revision=$4 AND head_kind='REGIME_RESTATED_CURRENT_POLICY'";
const selectRevision = "SELECT calculation_key,payload,payload_digest FROM execution_manager_calculation_revisions WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND source_revision=$4 AND calculation_key=$5";

/** New own-data boundary only; reject Proxy BEFORE reflection and every getter.
 * Same original envelope ceilings, no expansion of ordinary source grammar. */
function capture<T>(value: T, maximumBytes: number): T {
  let nodes = 0, textBytes = 0; const active = new Set<object>();
  const visit = (v: unknown, depth: number): void => {
    if (++nodes > 1_000_000 || depth > 64) fail("REGIME_RESTATED_INPUT_BOUND");
    if (typeof v === "string") { textBytes += Buffer.byteLength(v); }
    else if (v === null || typeof v === "boolean" || typeof v === "number" && Number.isFinite(v)) { /* primitive */ }
    else {
      if (!v || typeof v !== "object" || isProxy(v)) fail("REGIME_RESTATED_INPUT_INVALID");
      const array = Array.isArray(v), prototype = Object.getPrototypeOf(v);
      if (active.has(v) || (array ? prototype !== Array.prototype : ![Object.prototype, null].includes(prototype)) ||
        Object.getOwnPropertySymbols(v).length) fail("REGIME_RESTATED_INPUT_INVALID");
      const fields = Object.getOwnPropertyDescriptors(v), length: unknown = array ? fields.length?.value : undefined;
      if (array && (!Number.isSafeInteger(length) || (length as number) < 0 ||
        (length as number) > 1_000_000 ||
        Object.keys(fields).length !== (length as number) + 1)) fail("REGIME_RESTATED_INPUT_INVALID");
      active.add(v);
      for (const [key, field] of Object.entries(fields)) {
        if (array && key === "length") continue;
        if (!field.enumerable || !Object.hasOwn(field, "value") || array &&
          (!/^(?:0|[1-9]\d*)$(?![\s\S])/.test(key) || Number(key) >= (length as number)))
          fail("REGIME_RESTATED_INPUT_INVALID");
        textBytes += Buffer.byteLength(key); if (textBytes > maximumBytes) fail("REGIME_RESTATED_INPUT_BOUND");
        visit(field.value, depth + 1);
      }
      active.delete(v);
    }
    if (textBytes > maximumBytes) fail("REGIME_RESTATED_INPUT_BOUND");
  };
  visit(value, 0); const json = JSON.stringify(value);
  if (Buffer.byteLength(json) > maximumBytes) fail("REGIME_RESTATED_INPUT_BOUND");
  return JSON.parse(json) as T;
}
function primitiveClock(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) fail("REGIME_RESTATED_TIME_INVALID");
  return value;
}
function finiteDigest(value: unknown): string {
  if (typeof value !== "string") fail("REGIME_RESTATED_INPUT_INVALID");
  return digest.parse(value);
}
function ownFields(value: unknown, expected: readonly string[]): Record<string, PropertyDescriptor> {
  if (!value || typeof value !== "object" || isProxy(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Object.getOwnPropertySymbols(value).length)
    fail("REGIME_RESTATED_INPUT_INVALID");
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Object.keys(fields).length !== expected.length || !expected.every(key => Object.hasOwn(fields, key)) ||
    Object.values(fields).some(field => !field.enumerable || !Object.hasOwn(field, "value")))
    fail("REGIME_RESTATED_INPUT_INVALID");
  return fields;
}
function fullOriginal(original: Original, document: ManagerModelDocument, maximumBytes: number): RegimeOriginal {
  // The actual immutable ORIGINAL138/139 selector is the caller's independent
  // trust boundary. This repeat codec validates ALL three family censuses and
  // original method/source/child digests against ACTUAL135, not wrapper echoes.
  const detached = capture(original, maximumBytes);
  const verified = decodeRetainedManagerScoreOriginal(document, { calculation_key: detached.calculation_key,
    payload: detached, payload_digest: accessDigest(detached) }, maximumBytes);
  if (verified.schema_version !== "portal.execution.manager-score-original-inputs.v4" || !verified.retained_regimes.length)
    fail("REGIME_RESTATED_ORIGINAL_NOT_RETAINED");
  return verified;
}
function availableAt(o: RegimeOriginal, d: ManagerModelDocument): number {
  return Math.max(o.source.as_of_ms, d.observed_at_ms, d.recorded_through_ms,
    ...o.retained_tasks.map(item => item.task.computed_at_ms),
    ...o.retained_compositions.flatMap(item => [item.custody.original_computed_at_ms, item.custody.captured_at_ms]),
    ...o.retained_regimes.flatMap(item => [item.custody.original_computed_at_ms, item.custody.captured_at_ms]));
}
function semanticKey(o: RegimeOriginal, policy: ManagerRegimeHistoricalPolicyArchive, calculationRevision: string): string {
  return accessDigest({ domain: MANAGER_REGIME_RESTATEMENT_VERSION, head_kind: MANAGER_REGIME_RESTATEMENT_HEAD,
    worker_schema_version: MANAGER_REGIME_HISTORICAL_WORKER_VERSION, source: o.source,
    original_custody_key: o.calculation_key, original_inputs_digest: o.inputs_digest,
    original_regime_custody_digests: o.retained_regimes.map(item => item.custody_digest),
    policy_identity_digest: accessDigest(policy), calculation_revision: calculationRevision });
}
function restoredInputs(o: RegimeOriginal, d: ManagerModelDocument, maximumBytes: number):
  { binding: Binding; custody_digest: string; handle: RetainedManagerRegimeInputs }[] {
  return o.retained_regimes.map(item => {
    const result = restoreManagerRegimeOriginal({ custody: item.custody, expected_custody_digest: item.custody_digest,
      document: d, maximum_bytes: maximumBytes });
    if (result.status !== "READY") fail("REGIME_RESTATED_ORIGINAL_MISMATCH");
    return { binding: item.custody.binding, custody_digest: item.custody_digest, handle: result.handle };
  });
}
/** Pure archived codec: no current head/policy lookup, calculation, I/O or ACK.
 * Caller must independently obtain ORIGINAL row/head and ACTUAL135 and apply
 * current named source/resource/corpus/field authorization before public use. */
export function decodeRetainedManagerRegimeRestatementBundle(row: StoredRow, original: Original,
  document: ManagerModelDocument, maximumBytes: number, readNowMs: number = Date.now()): ManagerRegimeRestatementSnapshot {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || maximumBytes > 8 * 1024 * 1024)
    fail("REGIME_RESTATED_LIMIT_INVALID");
  const now = primitiveClock(readNowMs), d = managerModelDocument.parse(capture(document, maximumBytes));
  const fields = ownFields(row, ["calculation_key", "payload", "payload_digest"]);
  const key = finiteDigest(fields.calculation_key.value), payloadDigest = finiteDigest(fields.payload_digest.value);
  const o = fullOriginal(original, d, maximumBytes), b = header.parse(capture(fields.payload.value, maximumBytes));
  if (key !== b.calculation_key || accessDigest(b) !== payloadDigest ||
    !same(b.source, o.source) || b.original_custody_key !== o.calculation_key || b.original_inputs_digest !== o.inputs_digest ||
    b.policy_identity_digest !== accessDigest(b.policy) || b.calculation_key !== semanticKey(o, b.policy, b.calculation_revision) ||
    b.knowledge_cutoff_ms < availableAt(o, d) || b.computed_at_ms < b.knowledge_cutoff_ms || b.computed_at_ms > now ||
    b.supersedes_calculation_key === b.calculation_key || b.entries.length !== o.retained_regimes.length)
    fail("REGIME_RESTATED_DIGEST_MISMATCH");
  const selected = restoreManagerRegimeHistoricalPolicySnapshot({ archive: b.policy, scope: scopeOf(d),
    knowledge_cutoff_ms: b.knowledge_cutoff_ms, computed_at_ms: b.computed_at_ms }, now);
  if (!selected) fail("REGIME_RESTATED_POLICY_ARCHIVE_INVALID");
  const inputs = restoredInputs(o, d, maximumBytes), seen = new Set<string>();
  const entries: ManagerRegimeRestatementSnapshot["entries"] = [];
  for (const entry of b.entries) {
    const key = bindingKey(entry.binding), input = inputs.find(item => bindingKey(item.binding) === key);
    if (!input || seen.has(key) || entry.regime_custody_digest !== input.custody_digest)
      fail("REGIME_RESTATED_CENSUS_MISMATCH");
    seen.add(key);
    const historical = decodeRetainedManagerRegimeRestatement(entry.historical, { original: input.handle,
      original_custody_key: o.calculation_key, original_inputs_digest: o.inputs_digest, policy: b.policy,
      knowledge_cutoff_ms: b.knowledge_cutoff_ms, computed_at_ms: b.computed_at_ms,
      calculation_revision: b.calculation_revision }, maximumBytes, now);
    entries.push({ binding: entry.binding, regime_custody_digest: input.custody_digest, historical });
  }
  // Original codec sorts child keys. Require that exact deterministic order,
  // not an alternate rehashed entry order with the same population.
  if (!same(entries.map(entry => bindingKey(entry.binding)), inputs.map(item => bindingKey(item.binding))))
    fail("REGIME_RESTATED_CENSUS_MISMATCH");
  return structuredClone({ ...b, entries });
}

/** Existing consumer owns cadence/lease/deadline; this object owns no initial
 * writer and must be installed ONLY as a serial lifecycle IDLE delegate. */
export class ManagerRegimeRestatement {
  private readonly config: Readonly<ManagerRegimeRestatementConfig>;
  private readonly models: ManagerModelRepository;
  private readonly leases: ManagerProjectionLeases;
  private readonly custody: ManagerScoreOriginalCustody;
  private readonly now: () => number;
  private running = false;
  private disposition: { state: string; reason_codes?: string[] } = { state: "NOT_RUN" };
  constructor(private readonly options: { pool: Pool; runtime: ManagerRegimeHistoricalRuntime;
    currentPolicy(): ApprovedManagerRegimePolicy | null; source: ManagerProjectionSource;
    commissioning: PublicationCommissioning;
    publication(request: ExecutionReadPublicationRequest, signal: AbortSignal): Promise<unknown | null>;
    config: ManagerRegimeRestatementConfig; now?: () => number }) {
    const c = options.config;
    if (!c || typeof c !== "object" || isProxy(c) || ![Object.prototype, null].includes(Object.getPrototypeOf(c)) ||
      Object.getOwnPropertySymbols(c).length) fail("REGIME_RESTATED_LIMIT_INVALID");
    const f = Object.getOwnPropertyDescriptors(c);
    if (Object.keys(f).sort().join(",") !== "calculation_revision,maximum_bundle_bytes,maximum_retained_bytes_per_source,maximum_revisions_per_source" ||
      Object.values(f).some(field => !field.enumerable || !Object.hasOwn(field, "value"))) fail("REGIME_RESTATED_LIMIT_INVALID");
    if (typeof f.calculation_revision.value !== "string" ||
      ["maximum_bundle_bytes", "maximum_revisions_per_source", "maximum_retained_bytes_per_source"].some(key =>
        typeof f[key].value !== "number")) fail("REGIME_RESTATED_LIMIT_INVALID");
    const parsed = z.object({ calculation_revision: managerRegimeRef, maximum_bundle_bytes: ms,
      maximum_revisions_per_source: ms, maximum_retained_bytes_per_source: ms }).strict().parse(c);
    this.custody = new ManagerScoreOriginalCustody(parsed); // validates unchanged shared32/64MiB/8MiB caps
    this.config = Object.freeze(parsed);
    this.now = options.now ?? Date.now;
    if (typeof this.now !== "function" || isProxy(this.now) || typeof options.runtime?.calculateHistoricalRegime !== "function")
      fail("REGIME_RESTATED_LIMIT_INVALID");
    this.models = new ManagerModelRepository(options.pool); this.leases = new ManagerProjectionLeases(options.pool);
    this.options = Object.freeze({ ...options, config: this.config });
  }
  private time(): number { return primitiveClock(this.now()); }
  status(): { state: string; reason_codes?: string[] } { return structuredClone(this.disposition); }
  custodyCaps() { return { maximum_bundle_bytes: this.config.maximum_bundle_bytes,
    maximum_revisions_per_source: this.config.maximum_revisions_per_source,
    maximum_retained_bytes_per_source: this.config.maximum_retained_bytes_per_source }; }
  private async original(d: ManagerModelDocument): Promise<Original | null> {
    // Independent reads here are not claimed to be one repeatable snapshot.
    // The write path re-restores the actual immutable source+ORIGINAL inside
    // its final locked transaction before appending any result/head.
    const client = await this.options.pool.connect();
    try { return await this.custody.restore(client, d); } finally { client.release(); }
  }
  private async head(d: ManagerModelDocument): Promise<string | null> {
    return (await this.options.pool.query<{ calculation_key: string }>(selectHead, rowParams(d))).rows[0]?.calculation_key ?? null;
  }
  /** Label only, never permission/source authority or a reason to erase the
   * immutable historical fact. No current handle means no revocation claim. */
  classifyPolicy(view: ManagerRegimeRestatementSnapshot): "CURRENT" | "NOT_CURRENT" | "UNKNOWN" {
    try {
      const now = this.time();
      if (now >= view.policy.approval_pin.valid_until_ms) return "NOT_CURRENT";
      const handle = this.options.currentPolicy(); if (!handle) return "UNKNOWN";
      if (view.calculation_revision !== this.config.calculation_revision ||
        view.worker_schema_version !== MANAGER_REGIME_HISTORICAL_WORKER_VERSION) return "NOT_CURRENT";
      const p = managerRegimeHistoricalPolicySnapshot(handle, scopeOf(view.source), view.knowledge_cutoff_ms, now);
      return now >= view.computed_at_ms && p && managerRegimeHistoricalPolicySnapshotCurrent(handle, p, now) &&
        accessDigest({ artifact_utf8: p.artifact_utf8, approval_pin: p.approval }) === view.policy_identity_digest &&
        accessDigest(view.policy) === view.policy_identity_digest ? "CURRENT" : "NOT_CURRENT";
    } catch { return "UNKNOWN"; }
  }
  /** Current selected POLICY ONLY; never asserts current economic data/access. */
  assertCurrent(view: ManagerRegimeRestatementSnapshot): void {
    if (view.calculation_revision !== this.config.calculation_revision ||
      view.worker_schema_version !== MANAGER_REGIME_HISTORICAL_WORKER_VERSION)
      fail("REGIME_RESTATED_IMPLEMENTATION_NOT_CURRENT");
    const now = this.time();
    if (now < view.computed_at_ms) fail("REGIME_RESTATED_TIME_INVALID");
    const handle = this.options.currentPolicy(), p = managerRegimeHistoricalPolicySnapshot(handle, scopeOf(view.source),
      view.knowledge_cutoff_ms, now);
    if (!p || accessDigest({ artifact_utf8: p.artifact_utf8, approval_pin: p.approval }) !== view.policy_identity_digest ||
      accessDigest(view.policy) !== view.policy_identity_digest ||
      !managerRegimeHistoricalPolicySnapshotCurrent(handle, p, now)) fail("REGIME_RESTATED_POLICY_CHANGED");
  }
  async restoreRetained(document: ManagerModelDocument, exactKey: string): Promise<ManagerRegimeRestatementSnapshot | null> {
    finiteDigest(exactKey);
    const d = managerModelDocument.parse(capture(document, this.config.maximum_bundle_bytes)), o = await this.original(d);
    if (!o) fail("REGIME_RESTATED_ORIGINAL_NOT_RETAINED");
    const row = (await this.options.pool.query<StoredRow>(selectRevision, [...rowParams(d), exactKey])).rows[0];
    return row ? decodeRetainedManagerRegimeRestatementBundle(row, o, d, this.config.maximum_bundle_bytes, this.time()) : null;
  }
  async snapshot(document: ManagerModelDocument): Promise<ManagerRegimeRestatementRead> {
    const d = managerModelDocument.parse(capture(document, this.config.maximum_bundle_bytes)), key = await this.head(d);
    if (key === null) return { key: null, view: null };
    const view = await this.restoreRetained(d, key); if (!view) fail("REGIME_RESTATED_HEAD_CORRUPT");
    this.assertCurrent(view); return { key, view };
  }
  async unchanged(d: ManagerModelDocument, expected: string | null): Promise<boolean> { return await this.head(d) === expected; }
  async idle(input: ManagerRegimeRestatementIdle): Promise<void> {
    if (this.running) fail("REGIME_RESTATED_BUSY");
    this.running = true; try { await this.runIdle(input); } finally { this.running = false; }
  }
  private async runIdle(input: ManagerRegimeRestatementIdle): Promise<void> {
    if (!Number.isFinite(input.deadline_ms) || !Number.isSafeInteger(input.transaction_timeout_ms) ||
      input.transaction_timeout_ms < 1 || input.transaction_timeout_ms > 60_000 || !Number.isSafeInteger(input.lease_ttl_ms) ||
      input.lease_ttl_ms < 1 || input.lease_ttl_ms > 300_000) fail("REGIME_RESTATED_LIMIT_INVALID");
    const check = () => { if (input.signal.aborted) throw input.signal.reason ?? new Error("REGIME_RESTATED_CANCELLED");
      if (performance.now() >= input.deadline_ms) fail("REGIME_RESTATED_TIME_LIMIT"); };
    check(); const scope = { workspace_id: input.lease.workspace_id, environment: input.lease.environment, profile_id: input.lease.profile_id };
    const head = await this.models.head(scope.workspace_id, scope.environment, scope.profile_id); check();
    if (!head) { this.disposition = { state: "REGIME_RESTATED_ORIGINAL_NOT_RETAINED" }; return; }
    const d = await this.models.document(scope.workspace_id, scope.environment, scope.profile_id, head.revision); check();
    if (!d || d.qualification !== "SOURCE_VERIFIED" || accessDigest(d) !== head.payload_digest)
      fail("REGIME_RESTATED_SOURCE_NOT_QUALIFIED");
    const original = await this.original(d); check();
    if (!original || original.schema_version !== "portal.execution.manager-score-original-inputs.v4" ||
      !original.retained_regimes.length) { this.disposition = { state: "REGIME_RESTATED_ORIGINAL_NOT_RETAINED" }; return; }
    const o = fullOriginal(original, d, this.config.maximum_bundle_bytes), candidateK = this.time();
    if (candidateK < availableAt(o, d)) fail("REGIME_RESTATED_ORIGINAL_NOT_AVAILABLE_AS_OF");
    const handle = this.options.currentPolicy(), selected = managerRegimeHistoricalPolicySnapshot(handle, scopeOf(d), candidateK, this.time());
    if (!selected) { this.disposition = { state: "REGIME_RESTATED_POLICY_NOT_ELIGIBLE" }; return; }
    const policy = { artifact_utf8: selected.artifact_utf8, approval_pin: selected.approval };
    const desired = semanticKey(o, policy, this.config.calculation_revision), previous = await this.head(d); check();
    const existing = (await this.options.pool.query<StoredRow>(selectRevision, [...rowParams(d), desired])).rows[0]; check();
    const request: ExecutionReadPublicationRequest = { ...scope, binding: { dataset_id: d.family_id, source_revision: d.revision,
      projection_generation: d.projection_generation, catalogue_revision: d.catalogue_digest, window: null } };
    const raw = await this.options.publication(request, input.signal); check();
    if (raw === null) fail("REGIME_RESTATED_PUBLICATION_UNAVAILABLE");
    const publication = datasetPublication.parse(capture(raw, this.config.maximum_bundle_bytes));
    qualifyDatasetPublication(publication, request, { purpose: "BUSINESS", commissioning: this.options.commissioning, nowMs: this.time() });
    prepareManagerProjection(d, publication, { commissioning: this.options.commissioning, nowMs: this.time(), lease: input.lease });
    const assertSelection = () => {
      const now = this.time(); check();
      if (this.options.currentPolicy() !== handle || !managerRegimeHistoricalPolicySnapshotCurrent(handle, selected, now))
        fail("REGIME_RESTATED_POLICY_CHANGED");
    };
    assertSelection();
    let bundle: ManagerRegimeRestatementSnapshot;
    if (existing) {
      bundle = decodeRetainedManagerRegimeRestatementBundle(existing, o, d, this.config.maximum_bundle_bytes, this.time());
      this.assertCurrent(bundle);
      if (previous !== desired) fail("REGIME_RESTATED_HISTORICAL_NOT_CURRENT");
    } else {
      const computed = this.time(), entries: ManagerRegimeRestatementSnapshot["entries"] = [];
      for (const originalInput of restoredInputs(o, d, this.config.maximum_bundle_bytes)) {
        assertSelection();
        const result = await this.options.runtime.calculateHistoricalRegime({ original: originalInput.handle,
          original_custody_key: o.calculation_key, original_inputs_digest: o.inputs_digest, policy: handle,
          knowledge_cutoff_ms: candidateK, computed_at_ms: computed, calculation_revision: this.config.calculation_revision }, input.signal);
        assertSelection();
        if (result.status !== "READY") {
          const reasons = z.array(managerRegimeRef).min(1).max(8).parse(result.reason_codes);
          this.disposition = { state: "REGIME_RESTATED_WORKER_NOT_PUBLISHED", reason_codes: reasons };
          return; // NO permanent transient absence and NO incomplete derived census.
        }
        entries.push({ binding: originalInput.binding, regime_custody_digest: originalInput.custody_digest, historical: result.publication });
      }
      bundle = capture({ schema_version: MANAGER_REGIME_RESTATEMENT_VERSION, revision_mode: "RESTATED_CURRENT_POLICY" as const,
        purpose: "HISTORICAL_ANALYSIS_ONLY" as const, operational_current: false as const, source: o.source,
        original_custody_key: o.calculation_key, original_inputs_digest: o.inputs_digest,
        worker_schema_version: MANAGER_REGIME_HISTORICAL_WORKER_VERSION, policy, policy_identity_digest: accessDigest(policy),
        calculation_revision: this.config.calculation_revision, knowledge_cutoff_ms: candidateK, computed_at_ms: computed, entries,
        calculation_key: desired, supersedes_calculation_key: previous }, this.config.maximum_bundle_bytes);
      bundle = decodeRetainedManagerRegimeRestatementBundle({ calculation_key: desired, payload: bundle,
        payload_digest: accessDigest(bundle) }, o, d, this.config.maximum_bundle_bytes, this.time());
      this.assertCurrent(bundle);
    }
    const source = await this.options.source.recheck({ scope, document: structuredClone(d), publication: structuredClone(publication),
      signal: input.signal }); check();
    if (typeof source.assertCurrent !== "function") fail("REGIME_RESTATED_SOURCE_FENCE_REQUIRED");
    const assertCurrent = () => {
      assertSelection();
      if (!publicationCommissioningCurrent(this.options.commissioning, scope, this.time())) fail("MANAGER_COMMISSIONING_EXPIRED");
      if (this.time() >= publication.expires_at_ms) fail("REGIME_RESTATED_PUBLICATION_EXPIRED");
      this.assertCurrent(bundle);
      const value: unknown = source.assertCurrent!();
      if (value !== undefined) { if (value instanceof Promise) void value.catch(() => undefined);
        fail("MANAGER_SOURCE_FENCE_MUST_BE_SYNCHRONOUS"); }
    };
    assertCurrent();
    const notAfter = Math.min(publication.expires_at_ms, publicationCommissioningDeadline(this.options.commissioning), selected.approval.valid_until_ms);
    if (!await this.leases.renew(input.lease, input.lease_ttl_ms, notAfter)) fail("MANAGER_LEASE_LOST"); check();
    const client = await this.options.pool.connect(); let committed = false, usedExisting = false;
    try {
      check(); const timeout = Math.min(input.transaction_timeout_ms, Math.floor(input.deadline_ms - performance.now()));
      if (timeout < 1) fail("REGIME_RESTATED_TIME_LIMIT");
      const transactionDeadline = performance.now() + timeout;
      assertCurrent(); await client.query("BEGIN");
      await client.query("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$1,true)", [String(timeout) + "ms"]);
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [JSON.stringify(["manager-model", ...keys(d)])]);
      await fenceManagerProjection(client, input.lease, scope);
      const actualSource = (await client.query<{ revision: string; payload_digest: string }>("SELECT revision,payload_digest FROM execution_manager_model_heads WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 FOR UPDATE", keys(d))).rows[0];
      if (actualSource?.revision !== head.revision || actualSource.payload_digest !== head.payload_digest) fail("REGIME_RESTATED_SOURCE_CHANGED");
      const restored = await this.custody.restore(client, d);
      if (!restored || !same(restored, o)) fail("REGIME_RESTATED_ORIGINAL_CHANGED");
      const actualHead = (await client.query<{ calculation_key: string }>(selectHead + " FOR UPDATE", rowParams(d))).rows[0]?.calculation_key ?? null;
      if (actualHead !== previous) fail("REGIME_RESTATED_HEAD_CHANGED");
      const duplicate = (await client.query<StoredRow>(selectRevision, [...rowParams(d), desired])).rows[0];
      if (duplicate) {
        const prior = decodeRetainedManagerRegimeRestatementBundle(duplicate, restored, d, this.config.maximum_bundle_bytes, this.time());
        if (actualHead !== desired || duplicate.payload_digest !== accessDigest(bundle) || !same(prior, bundle))
          fail("REGIME_RESTATED_REVISION_CONFLICT");
        usedExisting = true;
      } else {
        const params = rowParams(d), payload = JSON.stringify(bundle);
        const usage = (await client.query<{ count: string; bytes: string }>("SELECT count(*)::text AS count,COALESCE(sum(octet_length(payload::text)),0)::text AS bytes FROM execution_manager_calculation_revisions WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND source_revision=$4", params)).rows[0];
        const storage = (await client.query<{ bytes: string }>("SELECT octet_length($1::jsonb::text)::text AS bytes", [payload])).rows[0];
        if (BigInt(usage.count) >= BigInt(this.config.maximum_revisions_per_source) ||
          BigInt(usage.bytes) + BigInt(storage.bytes) > BigInt(this.config.maximum_retained_bytes_per_source))
          fail("MANAGER_DERIVED_RETENTION_CAP_REACHED");
        await client.query("INSERT INTO execution_manager_calculation_revisions (workspace_id,environment,profile_id,source_revision,calculation_key,payload_digest,payload) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)",
          [...params, desired, accessDigest(bundle), payload]);
        if (actualHead === null) await client.query("INSERT INTO execution_manager_score_mode_heads (workspace_id,environment,profile_id,source_revision,head_kind,calculation_key) VALUES($1,$2,$3,$4,'REGIME_RESTATED_CURRENT_POLICY',$5)", [...params, desired]);
        else if ((await client.query("UPDATE execution_manager_score_mode_heads SET calculation_key=$5 WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND source_revision=$4 AND head_kind='REGIME_RESTATED_CURRENT_POLICY' AND calculation_key=$6", [...params, desired, previous])).rowCount !== 1)
          fail("REGIME_RESTATED_HEAD_CHANGED");
      }
      assertCurrent(); if (performance.now() >= transactionDeadline) fail("MANAGER_TRANSACTION_TIMEOUT");
      await client.query("COMMIT"); committed = true;
      this.disposition = { state: usedExisting ? "CURRENT_REGIME_RESTATED_REUSED" : "REGIME_RESTATED_COMMITTED" };
    } catch (error) { if (!committed) await client.query("ROLLBACK").catch(() => undefined); throw error; }
    finally { client.release(); }
  }
}
