import { accessDigest } from "../execution-v2/access-policy";
import { managerTimestamp } from "./manager-timestamp";
import type { ProfileProjectionSnapshot, ProjectionCompleteness, ProjectionEnvironment,
  ProjectionFreshness } from "./profile-projection.repository";

/** Pure projection only: neither a grant nor a SOURCE_VERIFIED publication. */
export const RETAINED_HEARTBEAT_MAXIMUM_ROWS = 2_000;
const SOURCE = "manager.current.service-heartbeats";
const RELATION = "service_heartbeats";
const RELATION_KEY = `${SOURCE}:${RELATION}`;
const STATUS_ABSENT = "SOURCE_STATUS_SEMANTICS_NOT_PUBLISHED" as const;
const digestPattern = /^sha256:[0-9a-f]{64}$(?![\s\S])/;
const recordPattern = /^por1_[0-9a-f]{64}$(?![\s\S])/;

export type RetainedHeartbeatClockReason = "SOURCE_CLOCK_NOT_PUBLISHED" |
  "SOURCE_CLOCK_INVALID" | "SOURCE_CLOCK_AHEAD_OF_READ" | null;
export type RetainedHeartbeatCaptureState = "SNAPSHOT_NOT_CAPTURED" |
  "RELATION_NOT_CAPTURED" | "RELATION_UNAVAILABLE" | "EMPTY_COMPLETE" |
  "EMPTY_INCOMPLETE" | "OBSERVATIONS";

export interface RetainedHeartbeatExactBinding {
  workspaceId: string;
  environment: ProjectionEnvironment;
  profileId: string;
  /** Identity read BEFORE authorization by the caller; null means no snapshot.
   * A rawSnapshot()/snapshotMetadata() pair, NOT an augmented retained view. */
  snapshot: { payloadDigest: string; projectionEpoch: string;
    sourceCatalogueSha256: string | null } | null;
}
export interface RetainedHeartbeatObservation {
  record_id: string;
  component: "SERVICE_HEARTBEAT";
  source_last_seen_at_ms: number | null;
  source_last_seen_reason_code: RetainedHeartbeatClockReason;
  source_status: null;
  health: null;
  status_reason_code: typeof STATUS_ABSENT;
}
export interface RetainedHeartbeatView {
  environment: ProjectionEnvironment;
  profile_id: string;
  record_basis: "PORTAL_RETAINED_OBSERVATION";
  capture_state: RetainedHeartbeatCaptureState;
  availability: "AVAILABLE" | "UNAVAILABLE";
  /** Flags captured in that relation, NOT a current-service health verdict. */
  captured_source_freshness: ProjectionFreshness | null;
  captured_source_completeness: ProjectionCompleteness | null;
  source_as_of_ms: number | null;
  source_as_of_reason_code: RetainedHeartbeatClockReason;
  /** Whole-profile reception only; no per-service receipt clock is retained. */
  snapshot_received_at_ms: number | null;
  observations: RetainedHeartbeatObservation[];
  /** Only served finite facts; not raw status/name/global source digest. */
  continuity_digest: string;
}
export interface RetainedHeartbeatProjection {
  view: RetainedHeartbeatView;
  /** PRIVATE service fence only. NEVER serialize into an HTTP response/cursor.
   * Exact clock identities preserve ns distinctions without publishing them. */
  private_clock_fence: { source_as_of_identity: string | null;
    observation_clocks: { record_id: string; identity: string | null }[] };
}
export class RetainedHeartbeatProjectionError extends Error {
  readonly code = "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED";
  readonly status = 503;
  constructor() { super("The retained technical observation is not available."); }
}
const invalid = (): never => { throw new RetainedHeartbeatProjectionError(); };
type Data = Record<string, unknown>;
function data(value: unknown): Data {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return invalid();
  if (Object.getOwnPropertySymbols(value).length ||
      Object.values(Object.getOwnPropertyDescriptors(value)).some(property => !("value" in property))) return invalid();
  return value as Data;
}
function own(value: Data, key: string): unknown {
  const property = Object.getOwnPropertyDescriptor(value, key);
  if (property && !("value" in property)) return invalid();
  return property?.value;
}
function text(value: unknown, maximumBytes = 256): string {
  if (typeof value !== "string" || !value || Buffer.byteLength(value, "utf8") > maximumBytes ||
      /[\u0000-\u001f\u007f]/u.test(value)) return invalid();
  return value;
}
function utc(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return invalid();
  return value;
}
function date(value: unknown, readAt: number, source = false): number {
  let stamp: number;
  try { stamp = Date.prototype.getTime.call(value); } catch { return invalid(); }
  utc(stamp);
  if (!source && stamp > readAt) return invalid();
  return stamp;
}
function catalogue(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !digestPattern.test(value)) return invalid();
  return value;
}
function catalogueEquals(value: unknown, expected: string | null): boolean {
  return expected === null ? value === undefined || value === null : value === expected;
}
type Clock = { value: number | null; reason: RetainedHeartbeatClockReason; identity: string | null };
function clock(value: unknown, readAt: number): Clock {
  if (value === null || value === undefined) return { value: null, reason: "SOURCE_CLOCK_NOT_PUBLISHED", identity: null };
  const parsed = typeof value === "string" && Buffer.byteLength(value, "utf8") <= 128
    ? managerTimestamp(value) : null;
  if (!parsed) return { value: null, reason: "SOURCE_CLOCK_INVALID", identity: null };
  const suffix = parsed.identity.includes(":") ? parsed.identity.slice(parsed.identity.indexOf(":") + 1) : "000000";
  // readAt is an exact millisecond instant: a positive sub-ms suffix at the
  // same millisecond is still ahead. Never clamp a future source clock to now.
  const future = parsed.milliseconds > readAt || parsed.milliseconds === readAt && suffix !== "000000";
  return { value: future ? null : parsed.milliseconds,
    reason: future ? "SOURCE_CLOCK_AHEAD_OF_READ" : null, identity: parsed.identity };
}
function freshness(value: unknown): ProjectionFreshness {
  if (value !== "FRESH" && value !== "AGING" && value !== "STALE" && value !== "UNKNOWN") return invalid();
  return value;
}
function completeness(value: unknown): ProjectionCompleteness {
  if (value !== "COMPLETE" && value !== "PARTIAL" && value !== "UNKNOWN") return invalid();
  return value;
}
function rows(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > RETAINED_HEARTBEAT_MAXIMUM_ROWS) return invalid();
  const detached: unknown[] = [];
  for (let index = 0; index < value.length; index++) {
    const property = Object.getOwnPropertyDescriptor(value, String(index));
    if (!property || !("value" in property)) return invalid();
    detached.push(property.value);
  }
  return detached;
}

/** Caller must supply a detached persisted rawSnapshot plus the identity for
 * which it minted the exact ROOT dataset scope. This method does NOT authorize
 * any row/resource, choose a workspace/profile or validate source trust.
 * recordIdFor is trusted, synchronous, context/key-bound HMAC, never a plain
 * hash. Only a validated private service PK reaches it, after all input checks.
 * No input object is read after the first callback, so it cannot retarget us. */
export function projectRetainedServiceHeartbeats(input: {
  snapshot: ProfileProjectionSnapshot | null;
  binding: RetainedHeartbeatExactBinding;
  readAtMs: number;
  recordIdFor: (validatedServiceName: string) => string;
}): RetainedHeartbeatProjection {
  const args = data(input), readAt = utc(own(args, "readAtMs"));
  const binding = data(own(args, "binding"));
  const workspace = text(own(binding, "workspaceId")), profile = text(own(binding, "profileId"));
  const environment = own(binding, "environment");
  if (environment !== "paper" && environment !== "sandbox" && environment !== "live") return invalid();
  const expected = own(binding, "snapshot"), supplied = own(args, "snapshot");
  const recordIdFor = own(args, "recordIdFor");
  if (typeof recordIdFor !== "function") return invalid();
  const base: Pick<RetainedHeartbeatView, "environment" | "profile_id" | "record_basis"> = { environment, profile_id: profile,
    record_basis: "PORTAL_RETAINED_OBSERVATION" as const };
  const finish = (capture: Omit<RetainedHeartbeatView, keyof typeof base | "continuity_digest">,
    sourceIdentity: string | null = null,
    observationClocks: { record_id: string; identity: string | null }[] = []): RetainedHeartbeatProjection => {
    // Profile-wide receive time may change because another relation refreshed.
    // Only actually served finite facts control public observation continuity.
    const { snapshot_received_at_ms: _received, ...continuity } = capture;
    return { view: { ...base, ...capture, continuity_digest: accessDigest({
      domain: "portal.execution.retained-service-heartbeat-continuity.v1", ...base, ...continuity,
    }) }, private_clock_fence: { source_as_of_identity: sourceIdentity, observation_clocks: observationClocks } };
  };
  const absent = (state: "SNAPSHOT_NOT_CAPTURED" | "RELATION_NOT_CAPTURED", received: number | null) => finish({
    capture_state: state, availability: "UNAVAILABLE", captured_source_freshness: null,
    captured_source_completeness: null, source_as_of_ms: null,
    source_as_of_reason_code: "SOURCE_CLOCK_NOT_PUBLISHED", snapshot_received_at_ms: received, observations: [],
  });
  if (supplied === null) {
    if (expected !== null) return invalid();
    return absent("SNAPSHOT_NOT_CAPTURED", null);
  }
  if (expected === null || expected === undefined) return invalid();
  const metadata = data(expected), snapshot = data(supplied), document = data(own(snapshot, "document"));
  const payloadDigest = text(own(metadata, "payloadDigest")), epoch = text(own(metadata, "projectionEpoch"));
  if (!digestPattern.test(payloadDigest)) return invalid();
  const sourceCatalogue = catalogue(own(metadata, "sourceCatalogueSha256"));
  if (own(snapshot, "payloadDigest") !== payloadDigest || own(snapshot, "projectionEpoch") !== epoch ||
      own(snapshot, "sourceCatalogueSha256") !== sourceCatalogue) return invalid();
  utc(own(snapshot, "projectionSequence")); completeness(own(snapshot, "completeness"));
  const received = date(own(snapshot, "receivedAt"), readAt);
  date(own(snapshot, "lastSuccessfulRefreshAt"), readAt);
  const sourceAsOf = own(snapshot, "sourceAsOf");
  if (sourceAsOf !== null) date(sourceAsOf, readAt, true);
  if (own(document, "schema_version") !== "portal.execution.profile-projection.v1" ||
      own(document, "workspace_id") !== workspace || own(document, "environment") !== environment ||
      own(document, "profile_id") !== profile ||
      !catalogueEquals(own(document, "source_catalogue_sha256"), sourceCatalogue)) return invalid();
  const contract = text(own(document, "source_contract_revision"));
  const relations = data(own(document, "relations"));
  let relation: Data | undefined;
  for (const key of Object.keys(relations)) {
    const candidate = data(own(relations, key));
    const isRelation = own(candidate, "relation") === RELATION, isSource = own(candidate, "source_id") === SOURCE;
    if (!isRelation && !isSource && key !== RELATION_KEY) continue;
    if (relation || !isRelation || !isSource || key !== RELATION_KEY) return invalid();
    relation = candidate;
  }
  if (!relation) return absent("RELATION_NOT_CAPTURED", received);
  if (!catalogueEquals(own(relation, "source_catalogue_sha256"), sourceCatalogue)) return invalid();
  const available = own(relation, "availability");
  if (available !== "AVAILABLE" && available !== "UNAVAILABLE") return invalid();
  const capturedFreshness = freshness(own(relation, "freshness"));
  const capturedCompleteness = completeness(own(relation, "completeness"));
  const asOf = clock(own(relation, "as_of"), readAt), capturedRows = rows(own(relation, "items"));
  if (available === "UNAVAILABLE" && capturedRows.length) return invalid();
  const prepared: { name: string; lastSeen: Clock }[] = [], names = new Set<string>();
  for (const row of capturedRows) {
    const item = data(row), lineage = data(own(item, "lineage")), fields = data(own(item, "fields"));
    if (own(lineage, "workspace_id") !== workspace || own(lineage, "profile_id") !== profile ||
        own(lineage, "source_contract_revision") !== contract ||
        !catalogueEquals(own(lineage, "source_catalogue_sha256"), sourceCatalogue)) return invalid();
    const name = text(own(fields, "service_name"), 4_096);
    if (names.has(name)) return invalid();
    names.add(name);
    prepared.push({ name, lastSeen: clock(own(fields, "last_seen_at"), readAt) });
    // status, instance_id and all unknown fields are neither interpreted nor
    // copied, hashed or supplied to the callback. No raw name escapes below.
  }
  const observations: RetainedHeartbeatObservation[] = [], identities = new Set<string>();
  const privateClocks: { record_id: string; identity: string | null }[] = [];
  for (const row of prepared) {
    let id: unknown;
    try { id = recordIdFor(row.name); } catch { return invalid(); }
    if (typeof id !== "string" || !recordPattern.test(id) || identities.has(id)) return invalid();
    identities.add(id);
    observations.push({ record_id: id, component: "SERVICE_HEARTBEAT", source_last_seen_at_ms: row.lastSeen.value,
      source_last_seen_reason_code: row.lastSeen.reason, source_status: null, health: null, status_reason_code: STATUS_ABSENT });
    privateClocks.push({ record_id: id, identity: row.lastSeen.identity });
  }
  const compare = (a: {record_id: string}, b: {record_id: string}) => a.record_id < b.record_id ? -1 : a.record_id > b.record_id ? 1 : 0;
  observations.sort(compare); privateClocks.sort(compare);
  return finish({ capture_state: available === "UNAVAILABLE" ? "RELATION_UNAVAILABLE"
    : observations.length ? "OBSERVATIONS" : capturedCompleteness === "COMPLETE" ? "EMPTY_COMPLETE" : "EMPTY_INCOMPLETE",
    availability: available, captured_source_freshness: capturedFreshness, captured_source_completeness: capturedCompleteness,
    source_as_of_ms: asOf.value, source_as_of_reason_code: asOf.reason,
    snapshot_received_at_ms: received, observations }, asOf.identity, privateClocks);
}
