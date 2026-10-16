import type { Pool, PoolClient } from "pg";
import { accessDigest } from "./access-policy";
import { managerModelDocument, type ManagerModelDocument } from "./manager-model.contract";
import { qualifyDatasetPublication, type PublicationContinuity, type PublicationCommissioning } from "./publication-adapter";
import { type DatasetPublication } from "./publication.contract";
import { dedupeManagerFacts } from "./manager-model";
import { fenceManagerProjection, type ManagerProjectionLease } from "./manager-lease";

const prepared = new WeakSet<object>();
export interface PreparedManagerProjection { readonly document: ManagerModelDocument; readonly digest: string;
  readonly rebuild: { expected_revision: string; receipt_ref: string } | null;
  readonly lease: ManagerProjectionLease | null; }
/** Source verification remains owned by the private trust adapter. This parser
 * cannot commission a source or turn fixture receipt strings into authority. */
export function prepareManagerProjection(input: unknown, publication: DatasetPublication,
  options: { nowMs: number; allowTestOnly?: boolean; expectedContinuity?: PublicationContinuity;
    commissioning?: PublicationCommissioning;
    lease?: ManagerProjectionLease;
    rebuild?: { expected_revision: string; receipt_ref: string } }): PreparedManagerProjection {
  const document = managerModelDocument.parse(input);
  const p = qualifyDatasetPublication(publication, { workspace_id: document.workspace_id, environment: document.environment,
    profile_id: document.profile_id, binding: { dataset_id: document.family_id, source_revision: document.revision,
      projection_generation: document.projection_generation, catalogue_revision: document.catalogue_digest, window: null } },
    { ...options, purpose: "BUSINESS" });
  if (document.qualification !== p.authority.qualification || document.observed_at_ms > options.nowMs ||
    document.source_set_digest !== accessDigest(p.authority.tuples)) throw new Error("MANAGER_SOURCE_BINDING_INVALID");
  const tuples = new Set(p.authority.tuples.map(t => JSON.stringify(t)));
  const membership = new Map<string, Array<{ from: number; to: number }>>();
  for (const member of document.members) {
    if (!tuples.has(JSON.stringify(member.tuple))) throw new Error("MANAGER_MEMBER_NOT_PUBLISHED");
    const key = JSON.stringify([member.tuple, member.stage]);
    const intervals = membership.get(key) ?? [], end = member.valid_to_ms ?? Infinity;
    if (intervals.some(i => member.valid_from_ms < i.to && i.from < end)) throw new Error("MANAGER_MEMBER_OVERLAP");
    intervals.push({ from: member.valid_from_ms, to: end }); membership.set(key, intervals);
    if (document.environment === "paper" && member.stage !== "PAPER" || document.environment === "sandbox" && member.stage !== "SANDBOX" ||
      document.environment === "live" && !["LIVE", "CANARY"].includes(member.stage)) throw new Error("MANAGER_STAGE_DOMAIN_INVALID");
  }
  const members = new Set(document.members.map(m => JSON.stringify(m.tuple)));
  for (const fact of document.facts) {
    if (!members.has(JSON.stringify(fact.tuple))) throw new Error("MANAGER_FACT_NOT_PUBLISHED");
    const domain = document.environment === "live" ? "ACTUAL" : document.environment.toUpperCase();
    if (fact.partition.economic_domain !== domain || fact.metric.unit === "MONEY" && fact.metric.currency !== fact.partition.currency ||
      fact.metric.basis !== fact.partition.basis) throw new Error("MANAGER_FACT_DOMAIN_INVALID");
    const budgetKinds = ["initial_budget", "current_budget", "topups_applied", "decreases_applied", "recall_applied",
      "pending_amount", "cancelled_amount", "locked_amount", "exposure_cap"];
    if (fact.classification !== "CUSTODY" && budgetKinds.includes(fact.kind) !== (fact.classification === "BUDGET"))
      throw new Error("MANAGER_BUDGET_NOT_ECONOMIC_CAPITAL");
    if (fact.classification === "INTERNAL_TRANSFER" &&
      (!["added_funds", "returned_capital", "net_economic_assignments"].includes(fact.kind) || !fact.transfer_pair_ref || !fact.counterpart_portfolio_id))
      throw new Error("MANAGER_TRANSFER_CLASSIFICATION_INVALID");
  }
  document.facts = dedupeManagerFacts(document.facts);
  if (Buffer.byteLength(JSON.stringify(document)) > 8 * 1024 * 1024) throw new Error("MANAGER_PROJECTION_LIMIT");
  // Freeze by detached private closure: caller mutation cannot rewrite the
  // qualified document between preparation and transaction commit.
  if (options.rebuild && (!options.rebuild.expected_revision || !options.rebuild.receipt_ref ||
    options.rebuild.expected_revision !== document.supersedes_revision)) throw new Error("MANAGER_REBUILD_BINDING_INVALID");
  const rebuild = options.rebuild ? Object.freeze({ ...options.rebuild }) : null;
  const lease = options.lease ? Object.freeze({ ...options.lease }) : null;
  const value = Object.freeze({ get document() { return structuredClone(document); }, digest: accessDigest(document), rebuild, lease });
  prepared.add(value); return value;
}

export interface ManagerModelHead { revision: string; source_epoch: string; source_sequence: string;
  projection_generation: string; payload_digest: string; catalogue_digest: string; }
/** One transaction client, reused by the existing profile projection commit.
 * No source network, connection creation, ACK, notify or automatic recompute. */
export async function persistManagerProjection(client: PoolClient, input: PreparedManagerProjection) {
  if (!prepared.has(input)) throw new Error("MANAGER_QUALIFIED_INPUT_REQUIRED");
  const d = input.document, key = [d.workspace_id, d.environment, d.profile_id];
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [JSON.stringify(["manager-model", ...key])]);
  if (input.lease) await fenceManagerProjection(client, input.lease,
    { workspace_id: d.workspace_id, environment: d.environment, profile_id: d.profile_id });
  else if (d.qualification === "SOURCE_VERIFIED") throw new Error("MANAGER_CONSUMER_LEASE_REQUIRED");
  const head = (await client.query<ManagerModelHead>(`SELECT revision,source_epoch,source_sequence::text,projection_generation,payload_digest,catalogue_digest
    FROM execution_manager_model_heads WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 FOR UPDATE`, key)).rows[0];
  const old = (await client.query<{ payload_digest: string }>(`SELECT payload_digest FROM execution_manager_model_revisions
    WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND revision=$4`, [...key, d.revision])).rows[0];
  if (old) {
    if (old.payload_digest !== input.digest) throw new Error("MANAGER_REVISION_CONFLICT");
    // A→B→A is not an idempotent successful current-state apply of A.
    if (head?.revision !== d.revision) throw new Error("MANAGER_HISTORICAL_REVISION_NOT_CURRENT");
    return { state: "DUPLICATE_CURRENT" as const, revision: d.revision, digest: input.digest };
  }
  if (head) {
    const newGeneration = head.source_epoch !== d.source_epoch || head.projection_generation !== d.projection_generation;
    if (newGeneration && (!input.rebuild || input.rebuild.expected_revision !== head.revision)) throw new Error("MANAGER_RESNAPSHOT_REQUIRED");
    if (!newGeneration && input.rebuild) throw new Error("MANAGER_REBUILD_REQUIRES_NEW_GENERATION");
    if ((!newGeneration && BigInt(d.source_sequence) !== BigInt(head.source_sequence) + 1n) || d.supersedes_revision !== head.revision)
      throw new Error("MANAGER_CHECKPOINT_GAP");
  } else if (d.supersedes_revision !== null) throw new Error("MANAGER_INITIAL_REVISION_INVALID");
  const count = await client.query<{ count: string }>(`SELECT count(*)::text FROM execution_manager_model_revisions
    WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3`, key);
  // Explicit bounded stop until an approved retention/rebuild policy exists.
  // Never silently erase as-published/restated revisions to keep a writer green.
  if (Number(count.rows[0].count) >= 1024) throw new Error("MANAGER_RETENTION_CAP_REACHED");
  await client.query(`INSERT INTO execution_manager_model_revisions
    (workspace_id,environment,profile_id,revision,source_epoch,source_sequence,projection_generation,payload_digest,payload,rebuild_receipt_ref)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`, [...key, d.revision, d.source_epoch, d.source_sequence, d.projection_generation, input.digest, JSON.stringify(d),input.rebuild?.receipt_ref ?? null]);
  await client.query(`INSERT INTO execution_manager_model_heads
    (workspace_id,environment,profile_id,revision,source_epoch,source_sequence,projection_generation,payload_digest,catalogue_digest)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(workspace_id,environment,profile_id) DO UPDATE SET
    revision=EXCLUDED.revision,source_epoch=EXCLUDED.source_epoch,source_sequence=EXCLUDED.source_sequence,
    projection_generation=EXCLUDED.projection_generation,payload_digest=EXCLUDED.payload_digest,catalogue_digest=EXCLUDED.catalogue_digest`,
    [...key, d.revision, d.source_epoch, d.source_sequence, d.projection_generation, input.digest,d.catalogue_digest]);
  return { state: "APPLIED_IN_TRANSACTION" as const, revision: d.revision, digest: input.digest };
}

export class ManagerModelRepository {
  private readonly flights = new Map<string, Promise<ManagerModelDocument | null>>();
  private readonly maximumFlights: number;
  private waitingReaders = 0;
  constructor(readonly pool: Pool, options: { maximumFlights: number } = { maximumFlights: 4 }) {
    if (!Number.isSafeInteger(options.maximumFlights) || options.maximumFlights < 1 || options.maximumFlights > 16)
      throw new Error("MANAGER_READ_LIMIT_INVALID");
    this.maximumFlights = options.maximumFlights;
  }
  async head(workspace: string, environment: string, profile: string) {
    return (await this.pool.query<ManagerModelHead>(`SELECT revision,source_epoch,source_sequence::text,projection_generation,payload_digest,catalogue_digest
      FROM execution_manager_model_heads WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3`, [workspace, environment, profile])).rows[0] ?? null;
  }
  async document(workspace: string, environment: string, profile: string, revision: string) {
    // Bound followers as well as unique flights. Each detached 8MiB maximum
    // document still costs per-caller memory; coalescing is not free fanout.
    if (this.waitingReaders >= 32) throw new Error("MANAGER_READ_CAPACITY_EXCEEDED");
    const key = JSON.stringify([workspace, environment, profile, revision]);
    let flight = this.flights.get(key);
    if (!flight) {
      if (this.flights.size >= this.maximumFlights) throw new Error("MANAGER_READ_CAPACITY_EXCEEDED");
      // Reserve before I/O starts. No TTL/auth cache: a settled flight is removed,
      // including errors. Service still authorizes each caller and current head.
      flight = Promise.resolve().then(() => this.loadDocument(workspace, environment, profile, revision));
      this.flights.set(key, flight);
      void flight.finally(() => { if (this.flights.get(key) === flight) this.flights.delete(key); }).catch(() => undefined);
    }
    this.waitingReaders++;
    try { const document = await flight; return document === null ? null : structuredClone(document); }
    finally { this.waitingReaders--; }
  }
  private async loadDocument(workspace: string, environment: string, profile: string, revision: string) {
    const row = (await this.pool.query<{ payload: unknown; payload_digest: string }>(`SELECT payload,payload_digest
      FROM execution_manager_model_revisions WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND revision=$4`,
    [workspace, environment, profile, revision])).rows[0];
    if (!row) return null;
    if (Buffer.byteLength(JSON.stringify(row.payload)) > 8 * 1024 * 1024) throw new Error("MANAGER_PROJECTION_LIMIT");
    const doc = managerModelDocument.parse(row.payload);
    if (accessDigest(doc) !== row.payload_digest) throw new Error("MANAGER_PROJECTION_DIGEST_MISMATCH");
    return doc;
  }
}
