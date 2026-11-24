import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {captureLockedC2Inventory,RESTORE_C2_INVENTORY_TABLES} from "./restore-c2-inventory";
import {assertOrdinaryRestoreSourceBinding,captureLockedOrdinaryInventory,
  ordinaryRestoreCheckpointDigest} from "./ordinary-profile-restore";

/**
 * UNMOUNTED recovery preparation. A checkpoint is a durable observation, NOT
 * an authorization to activate a restored Portal. Different PostgreSQL system
 * identifiers prove distinct PG clusters only, not independent failure domains.
 * Existing V2 DR refusal stays in force until writer fencing, external source
 * reconciliation and independently controlled storage are qualified.
 */
const PG_MAX = 9_223_372_036_854_775_807n;
const GENESIS = "0".repeat(64);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const DRAIN = /^restore_v2:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const dec = (value: unknown): value is string => typeof value === "string" && /^(?:0|[1-9][0-9]{0,18})$/.test(value) && BigInt(value) <= PG_MAX;
const cluster = (value: unknown): value is string => typeof value === "string" && /^(?:0|[1-9][0-9]{0,19})$/.test(value);
const uuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
const hash = (value: unknown): value is string => typeof value === "string" && SHA256.test(value);
const invalid = (): never => { throw new Error("V2_CHECKPOINT_INVALID"); };
const drainedDigest=(pin:RestoreCheckpointPin,drainId:string,revision:string,digest:string)=>createHash("sha256")
  .update(JSON.stringify(["portal.restore-drained-checkpoint.v1",pin.checkpoint_id,pin.source_system_identifier,
    drainId,revision,digest]),"utf8").digest("hex");

export type RestoreCheckpointPin = Readonly<{ checkpoint_id: string; source_system_identifier: string;
  authority_system_identifier: string }>;
export type RestoreCheckpointWrite = Readonly<{ operation_id: string; expected_generation: string;
  source_revision: string; inventory_digest: string }>;
export type RestoreCheckpointCaptureKind = "CALLER_CLAIM" | "DRAIN_BOUND_CLAIM" | "LOCKED_SOURCE_CAPTURE" | "FROZEN_SOURCE_CAPTURE" |
  "FROZEN_NOLOGIN_SOURCE_OBSERVATION" | "FROZEN_CLOSED_DB_OBSERVATION" | "LOCKED_ORDINARY_SOURCE_CAPTURE";
export type RestoreCheckpointReceipt = Readonly<{ state: "STORED_NOT_CUTOVER"; generation: string;
  event_hash: string; replayed: boolean; storage: "DISTINCT_PG_CLUSTERS_ONLY";
  capture_kind: RestoreCheckpointCaptureKind }>;
type Identity = { system_identifier: string };
type Head = { source_system_identifier: string; authority_system_identifier: string; generation: string;
  source_revision: string; event_hash: string; event_count: string };
type Event = RestoreCheckpointWrite & { generation: string; predecessor_hash: string; event_hash: string;
  capture_kind: RestoreCheckpointCaptureKind };
const captureKind = (value:unknown):value is RestoreCheckpointCaptureKind =>
  value==="CALLER_CLAIM" || value==="DRAIN_BOUND_CLAIM" || value==="LOCKED_SOURCE_CAPTURE" ||
  value==="FROZEN_SOURCE_CAPTURE" || value==="FROZEN_NOLOGIN_SOURCE_OBSERVATION" || value==="FROZEN_CLOSED_DB_OBSERVATION" ||
  value==="LOCKED_ORDINARY_SOURCE_CAPTURE";

type ClosedDatabasePin=Readonly<{target_oid:string;observer_pid:number;observer_start:string;operator_role:string;application_name:string}>;

/** Deterministic digest, no secrets or source rows; the enclosing authority
 * cluster is still responsible for protecting the checkpoint writer/reader. */
export function restoreCheckpointEventHash(checkpointId: string, input: RestoreCheckpointWrite,
  generation: string, predecessorHash: string, kind:RestoreCheckpointCaptureKind="CALLER_CLAIM"): string {
  if (!uuid(checkpointId) || !uuid(input.operation_id) || !dec(input.expected_generation) || !dec(input.source_revision) ||
      !dec(generation) || !hash(input.inventory_digest) || !hash(predecessorHash) ||
      !captureKind(kind) || BigInt(generation) !== BigInt(input.expected_generation) + 1n) return invalid();
  return createHash("sha256").update(JSON.stringify(["portal.restore-checkpoint.v2", checkpointId, kind,
    input.operation_id, input.expected_generation, generation, input.source_revision,
    input.inventory_digest, predecessorHash]), "utf8").digest("hex");
}

async function identity(client: Pick<PoolClient, "query">): Promise<string> {
  const result = await client.query<Identity>("SELECT system_identifier::text AS system_identifier FROM pg_control_system()");
  const value = result.rows[0]?.system_identifier;
  if (result.rows.length !== 1 || !cluster(value)) throw new Error("V2_CHECKPOINT_CLUSTER_ID_UNAVAILABLE");
  return value;
}

/** Both clusters are rechecked on each write; a different pool or DSN alone
 * is not treated as independence. System IDs do not prove a failure domain. */
export class RestoreCheckpointAuthority {
  readonly #source: Pool;
  readonly #authority: Pool;
  readonly #pin: RestoreCheckpointPin;
  readonly #maximumEvents: bigint;
  constructor(source: Pool, authority: Pool, pin: RestoreCheckpointPin, maximumEvents: number) {
    if (!source || !authority || source === authority || !pin || !uuid(pin.checkpoint_id) ||
      !cluster(pin.source_system_identifier) || !cluster(pin.authority_system_identifier) ||
      pin.source_system_identifier === pin.authority_system_identifier || !Number.isSafeInteger(maximumEvents) ||
      maximumEvents < 1 || maximumEvents > 10_000 ||
      [source, authority].some(pool => !pool.options || [pool.options.connectionTimeoutMillis, pool.options.query_timeout]
        .some(value => !Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 60_000)))
      throw new Error("V2_CHECKPOINT_INVALID");
    this.#source = source; this.#authority = authority;
    this.#pin = Object.freeze({ ...pin }); this.#maximumEvents = BigInt(maximumEvents);
  }

  /** Bind a checkpoint operation to the exact active local drain and revision,
   * holding the source authority row lock until the independent append has
   * completed. This serializes only writers which honor that row lock; it
   * does NOT prove inventory provenance, an external fence, ACK completeness,
   * a physical old-holder fence, or authorize restore/cutover. On *any*
   * ambiguous error retain and retry the exact operation and drain IDs. */
  async appendDrainedSource(input:RestoreCheckpointWrite, drainId:string):Promise<RestoreCheckpointReceipt> {
    if(!input || typeof drainId!=="string" || !DRAIN.test(drainId)) return invalid();
    const captured=Object.freeze({operation_id:input.operation_id,expected_generation:input.expected_generation,
      source_revision:input.source_revision,inventory_digest:input.inventory_digest});
    if(!uuid(captured.operation_id)||!dec(captured.expected_generation)||!dec(captured.source_revision)||
      !hash(captured.inventory_digest)||BigInt(captured.expected_generation)>=PG_MAX) return invalid();
    const source=await this.#source.connect();let discard=false;
    try {
      await source.query("BEGIN");
      await source.query("SET LOCAL lock_timeout='1000ms'; SET LOCAL statement_timeout='3000ms'");
      if(await identity(source)!==this.#pin.source_system_identifier)throw new Error("V2_CHECKPOINT_SOURCE_ID_MISMATCH");
      const selected=await source.query<{revision:string;drain_id:string|null}>(
        "SELECT revision::text,drain_id FROM elp210_candidate.authority WHERE singleton FOR UPDATE");
      if(selected.rows.length!==1||selected.rows[0]?.drain_id!==drainId||selected.rows[0]?.revision!==captured.source_revision)
        throw new Error("V2_CHECKPOINT_DRAIN_OR_REVISION_CHANGED");
      // Persist a domain-separated commitment to the drain as well as the
      // caller's digest. Reusing an operation on a later drain must conflict,
      // even when that drain happens to carry the same authority revision.
      // This commits to the claimed digest; it does not authenticate capture.
      const boundDigest=drainedDigest(this.#pin,drainId,captured.source_revision,captured.inventory_digest);
      const receipt=await this.#appendWithVerifiedSource({...captured,inventory_digest:boundDigest},"DRAIN_BOUND_CLAIM",this.#pin.source_system_identifier);
      await source.query("COMMIT");
      return receipt;
    } catch(error) {
      try {await source.query("ROLLBACK");} catch {discard=true;}
      throw error;
    } finally {source.release(discard);}
  }

  /** Capture the fixed C2 candidate table set from the actual source under
   * table locks, then commit its drain-bound digest to the independent store.
   * This does not accept a caller-supplied inventory digest. The profile and
   * source locks are local only: external source history, privileged writers,
   * old database copies, ACK coverage and cutover remain unproven. */
  async captureAndAppendDrainedSource(input:Omit<RestoreCheckpointWrite,"inventory_digest">,drainId:string,
    maximumRows:number):Promise<RestoreCheckpointReceipt> {
    if(!input||typeof input!=="object"||Array.isArray(input)||
      JSON.stringify(Object.keys(input).sort())!==JSON.stringify(["expected_generation","operation_id","source_revision"])||
      typeof drainId!=="string"||!DRAIN.test(drainId))return invalid();
    const captured=Object.freeze({operation_id:input.operation_id,expected_generation:input.expected_generation,
      source_revision:input.source_revision});
    if(!uuid(captured.operation_id)||!dec(captured.expected_generation)||!dec(captured.source_revision)||
      BigInt(captured.expected_generation)>=PG_MAX||!Number.isSafeInteger(maximumRows)||maximumRows<1||maximumRows>10000)return invalid();
    const source=await this.#source.connect();let discard=false;
    try {
      await source.query("BEGIN");
      await source.query("SET LOCAL lock_timeout='1000ms'; SET LOCAL statement_timeout='3000ms'");
      if(await identity(source)!==this.#pin.source_system_identifier)throw new Error("V2_CHECKPOINT_SOURCE_ID_MISMATCH");
      // READ COMMITTED is intentional: locks are acquired before inventory
      // SELECTs, avoiding a snapshot established before a contended lock.
      const digest=await captureLockedC2Inventory(source,maximumRows);
      const selected=await source.query<{revision:string;drain_id:string|null}>(
        "SELECT revision::text,drain_id FROM elp210_candidate.authority WHERE singleton FOR UPDATE");
      if(selected.rows.length!==1||selected.rows[0]?.drain_id!==drainId||selected.rows[0]?.revision!==captured.source_revision)
        throw new Error("V2_CHECKPOINT_DRAIN_OR_REVISION_CHANGED");
      const receipt=await this.#appendWithVerifiedSource({...captured,inventory_digest:
        drainedDigest(this.#pin,drainId,captured.source_revision,digest)},"LOCKED_SOURCE_CAPTURE",this.#pin.source_system_identifier);
      await source.query("COMMIT");return receipt;
    } catch(error) {try {await source.query("ROLLBACK");}catch {discard=true;}throw error;}
    finally {source.release(discard);}
  }

  /** Separate migration159 ordinary profile; never widens the frozen C2 hash.
   * Captures the actual locked source and exact physical ordinary binding,
   * then appends to the independently provisioned journal. This is a bounded
   * local observation, NOT a restore/cutover or old-holder/source/HTTP fence.
   * The independent journal requires its explicit ordinary-kind upgrade.
   * Source locks are time-bounded: disconnect/timeout can follow a durable
   * independent append. A receipt alone does not prove locks held through
   * that commit or current source state. Reconcile ambiguous completion using
   * the SAME operation/drain and a fresh capture; never use it to enable DR. */
  async captureOrdinaryAndAppend(input:Omit<RestoreCheckpointWrite,"inventory_digest">,drainId:string,
    maximumRows:number):Promise<RestoreCheckpointReceipt> {
    if(!input||typeof input!=="object"||Array.isArray(input)||
      JSON.stringify(Object.keys(input).sort())!==JSON.stringify(["expected_generation","operation_id","source_revision"])||
      typeof drainId!=="string"||!DRAIN.test(drainId))return invalid();
    const write=Object.freeze({operation_id:input.operation_id,expected_generation:input.expected_generation,
      source_revision:input.source_revision});
    if(!uuid(write.operation_id)||!dec(write.expected_generation)||!dec(write.source_revision)||
      BigInt(write.expected_generation)>=PG_MAX||!Number.isSafeInteger(maximumRows)||maximumRows<1||maximumRows>10000)return invalid();
    const source=await this.#source.connect();let discard=false;
    try {
      await source.query("BEGIN");
      await source.query("SET LOCAL lock_timeout='1000ms'; SET LOCAL statement_timeout='3000ms'; SET LOCAL idle_in_transaction_session_timeout='5000ms'");
      if(await identity(source)!==this.#pin.source_system_identifier)throw new Error("V2_CHECKPOINT_SOURCE_ID_MISMATCH");
      const digest=await captureLockedOrdinaryInventory(source,maximumRows);
      await assertOrdinaryRestoreSourceBinding(source);
      const selected=await source.query<{revision:string;drain_id:string|null}>(
        "SELECT revision::text,drain_id FROM elp210_candidate.authority WHERE singleton FOR UPDATE");
      if(selected.rows.length!==1||selected.rows[0]?.drain_id!==drainId||selected.rows[0]?.revision!==write.source_revision)
        throw new Error("V2_CHECKPOINT_DRAIN_OR_REVISION_CHANGED");
      const receipt=await this.#appendWithVerifiedSource({...write,inventory_digest:
        ordinaryRestoreCheckpointDigest(this.#pin,drainId,write.source_revision,digest)},
      "LOCKED_ORDINARY_SOURCE_CAPTURE",this.#pin.source_system_identifier);
      await source.query("COMMIT");return receipt;
    } catch(error) {try {await source.query("ROLLBACK");}catch {discard=true;}throw error;}
    finally {source.release(discard);}
  }

  /** Stronger local capture: require a committed stop-writes receipt and no
   * locally unresolved originals while the entire inventory and freeze head
   * remain table-locked through the independent append. Require the selected
   * public-table fence and safe previous writer too: the older local fence
   * alone does not stop a post-checkpoint session or grant mutation. The stop
   * operation is performed separately by a privileged operator, never here.
   * This still is NOT an external/old-clone/HTTP fence, complete source ACK
   * census, authorization to cut over, or proof of independent administration. */
  async captureFrozenAndAppend(input:Omit<RestoreCheckpointWrite,"inventory_digest">,drainId:string,
    freeze:{operation_id:string;prior_generation:string;prior_writer_oid:string},maximumRows:number):Promise<RestoreCheckpointReceipt> {
    return this.#captureFrozen(input,drainId,freeze,maximumRows,false);
  }

  /** Distinct local observation of a frozen writer that has NOLOGIN and no
   * visible sessions. This is NOT an authenticated quarantine receipt, an
   * independent old-holder fence or a permit to restore. Separate kind and
   * digest prevent replay as an older LOGIN-writer capture. */
  async captureFrozenNoLoginObservation(input:Omit<RestoreCheckpointWrite,"inventory_digest">,drainId:string,
    freeze:{operation_id:string;prior_generation:string;prior_writer_oid:string},maximumRows:number):Promise<RestoreCheckpointReceipt> {
    return this.#captureFrozen(input,drainId,freeze,maximumRows,true);
  }

  /** Local, operator-observed closed DB only. The source catalog lock keeps
   * local ALTER DATABASE from reopening it until the append finishes. This is
   * NOT independent owner authority, a privileged/clone/network/source or
   * HTTP fence, source ACK reconciliation, or permission to restore. */
  async captureClosedDatabaseObservation(input:Omit<RestoreCheckpointWrite,"inventory_digest">,drainId:string,
    freeze:{operation_id:string;prior_generation:string;prior_writer_oid:string},maximumRows:number,
    closedPin:ClosedDatabasePin):Promise<RestoreCheckpointReceipt> {
    if(!closedPin||typeof closedPin!=="object"||Array.isArray(closedPin)||
      JSON.stringify(Object.keys(closedPin).sort())!==JSON.stringify(["application_name","observer_pid","observer_start","operator_role","target_oid"]))return invalid();
    // Snapshot once, with a fixed field order, before validation or I/O.
    // Equivalent pins must yield the same committed digest on recovery retry.
    const selected=Object.freeze({target_oid:closedPin.target_oid,operator_role:closedPin.operator_role,
      observer_pid:closedPin.observer_pid,observer_start:closedPin.observer_start,application_name:closedPin.application_name});
    if(!dec(selected.target_oid)||BigInt(selected.target_oid)<1n||BigInt(selected.target_oid)>4294967295n||
      !Number.isSafeInteger(selected.observer_pid)||selected.observer_pid<1||typeof selected.observer_start!=="string"||
      selected.observer_start.length<10||selected.observer_start.length>80||typeof selected.operator_role!=="string"||
      !/^[a-z][a-z0-9_]{0,62}$/.test(selected.operator_role)||typeof selected.application_name!=="string"||
      !/^portal\.restore\.observer\.[a-f0-9]{32}$/.test(selected.application_name))return invalid();
    return this.#captureFrozen(input,drainId,freeze,maximumRows,true,selected);
  }

  async #captureFrozen(input:Omit<RestoreCheckpointWrite,"inventory_digest">,drainId:string,
    freeze:{operation_id:string;prior_generation:string;prior_writer_oid:string},maximumRows:number,
    observeNoLogin:boolean,closedPin?:ClosedDatabasePin):Promise<RestoreCheckpointReceipt> {
    if(!input||typeof input!=="object"||Array.isArray(input)||
      JSON.stringify(Object.keys(input).sort())!==JSON.stringify(["expected_generation","operation_id","source_revision"])||
      !freeze||typeof freeze!=="object"||Array.isArray(freeze)||
      JSON.stringify(Object.keys(freeze).sort())!==JSON.stringify(["operation_id","prior_generation","prior_writer_oid"])||
      typeof drainId!=="string"||!DRAIN.test(drainId))return invalid();
    const write=Object.freeze({operation_id:input.operation_id,expected_generation:input.expected_generation,source_revision:input.source_revision});
    const stopped=Object.freeze({operation_id:freeze.operation_id,prior_generation:freeze.prior_generation,prior_writer_oid:freeze.prior_writer_oid});
    if(!uuid(write.operation_id)||!dec(write.expected_generation)||BigInt(write.expected_generation)>=PG_MAX||
      !dec(write.source_revision)||!uuid(stopped.operation_id)||!dec(stopped.prior_generation)||
      BigInt(stopped.prior_generation)<1n||BigInt(stopped.prior_generation)>=PG_MAX||
      !dec(stopped.prior_writer_oid)||BigInt(stopped.prior_writer_oid)<1n||BigInt(stopped.prior_writer_oid)>4294967295n||
      !Number.isSafeInteger(maximumRows)||maximumRows<1||maximumRows>10000)return invalid();
    const source=await this.#source.connect();let discard=false;
    try {
      await source.query("BEGIN");
      await source.query("SET LOCAL lock_timeout='1000ms'; SET LOCAL statement_timeout='3000ms'");
      if(await identity(source)!==this.#pin.source_system_identifier)throw new Error("V2_CHECKPOINT_SOURCE_ID_MISMATCH");
      if(closedPin) {
        // PostgreSQL catalog-level lock is deliberately broad and only for
        // this unmounted candidate; a qualified deployment needs an approved
        // bounded operational window and independently enforced controls.
        await source.query("LOCK TABLE pg_catalog.pg_database IN SHARE MODE");
        const state=await source.query<{valid:boolean}>(`SELECT (d.oid=$1::oid AND NOT d.datallowconn AND NOT d.datistemplate AND
          d.datdba=(SELECT oid FROM pg_roles WHERE rolname=current_user) AND session_user=current_user AND
          current_user=$2 AND (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AND
          a.pid=$3::int AND a.backend_start::text=$4 AND a.application_name=$5 AND
          a.usename=current_user AND a.backend_type='client backend' AND
          NOT EXISTS(SELECT 1 FROM pg_stat_activity other WHERE other.datid=d.oid AND other.pid<>pg_backend_pid()) AND
          NOT EXISTS(SELECT 1 FROM pg_prepared_xacts p WHERE p.database=d.datname)) AS valid
          FROM pg_database d JOIN pg_stat_activity a ON a.pid=pg_backend_pid() WHERE d.datname=current_database()`,
          [closedPin.target_oid,closedPin.operator_role,closedPin.observer_pid,closedPin.observer_start,closedPin.application_name]);
        if(state.rows.length!==1||state.rows[0]?.valid!==true)throw new Error("V2_CHECKPOINT_CLOSED_DB_UNSAFE");
      }
      // captureLockedC2Inventory locks both freeze tables in SHARE mode first;
      // no rotate/unfreeze or guarded local mutation can commit before append.
      const inventory=await captureLockedC2Inventory(source,maximumRows);
      const selected=await source.query<{revision:string;drain_id:string|null}>(
        "SELECT revision::text,drain_id FROM elp210_candidate.authority WHERE singleton FOR UPDATE");
      if(selected.rows.length!==1||selected.rows[0]?.drain_id!==drainId||selected.rows[0]?.revision!==write.source_revision)
        throw new Error("V2_CHECKPOINT_DRAIN_OR_REVISION_CHANGED");
      const fence=await source.query<{generation:string;enabled:boolean;writer_oid:string|null;prior_generation:string;
        prior_writer:string;frozen_generation:string}>(`SELECT h.generation::text,h.enabled,h.writer_oid::text,
        f.prior_generation::text,f.prior_writer::text,f.frozen_generation::text
        FROM portal_local_write_fence.head h JOIN portal_local_write_fence.freeze_history f ON f.operation_id=$1
        WHERE h.singleton`,[stopped.operation_id]);
      const row=fence.rows[0],next=(BigInt(stopped.prior_generation)+1n).toString();
      if(fence.rows.length!==1||!row||row.enabled!==false||row.writer_oid!==null||row.generation!==next||
        row.prior_generation!==stopped.prior_generation||row.prior_writer!==stopped.prior_writer_oid||row.frozen_generation!==next)
        throw new Error("V2_CHECKPOINT_FREEZE_NOT_CURRENT");
      const support=await source.query<{available:boolean}>(`SELECT
        to_regprocedure('portal_local_write_fence.public_targets()') IS NOT NULL AND
        to_regprocedure('portal_local_write_fence.public_coverage_valid()') IS NOT NULL AND
        to_regprocedure('portal_local_write_fence.candidate_coverage_valid()') IS NOT NULL AND
        to_regprocedure('portal_local_write_fence.public_writer_is_safe(oid)') IS NOT NULL AS available`);
      if(support.rows.length!==1||support.rows[0]?.available!==true)
        throw new Error("V2_CHECKPOINT_PUBLIC_FENCE_UNAVAILABLE");
      const publicFence=await source.query<{coverage:boolean;candidate_coverage:boolean;writer_safe:boolean;targets:string[]}>(`SELECT
        portal_local_write_fence.public_coverage_valid() AS coverage,
        portal_local_write_fence.candidate_coverage_valid() AS candidate_coverage,
        portal_local_write_fence.public_targets() AS targets,
        portal_local_write_fence.public_writer_is_safe($1::oid) AS writer_safe`,[stopped.prior_writer_oid]);
      let writerSafe=publicFence.rows[0]?.writer_safe===true;
      if(observeNoLogin) {
        const supportNoLogin=await source.query<{available:boolean}>(`SELECT
          to_regprocedure('portal_local_write_fence.public_writer_role_is_safe(oid)') IS NOT NULL AS available`);
        if(supportNoLogin.rows.length!==1||supportNoLogin.rows[0]?.available!==true)
          throw new Error("V2_CHECKPOINT_NOLOGIN_OBSERVATION_UNAVAILABLE");
        // This catalog snapshot is an observation only. Privileged role/ACL
        // changes, older DB clones and already-sent HTTP are not fenced by it.
        const quarantine=await source.query<{safe:boolean}>(`SELECT (
          NOT r.rolcanlogin AND portal_local_write_fence.public_writer_role_is_safe(r.oid) AND
          NOT EXISTS(SELECT 1 FROM pg_stat_activity a WHERE a.usesysid=r.oid) AND
          NOT EXISTS(SELECT 1 FROM pg_prepared_xacts p WHERE p.owner=r.rolname OR p.database=current_database()) AND
          NOT EXISTS(SELECT 1 FROM pg_roles parent WHERE parent.oid<>r.oid AND pg_has_role(r.oid,parent.oid,'MEMBER')) AND
          NOT EXISTS(SELECT 1 FROM pg_roles other WHERE other.oid<>r.oid AND other.rolcanlogin AND NOT other.rolsuper
            AND pg_has_role(other.oid,r.oid,'MEMBER'))) AS safe FROM pg_roles r WHERE r.oid=$1::oid`,
          [stopped.prior_writer_oid]);
        writerSafe=quarantine.rows.length===1&&quarantine.rows[0]?.safe===true;
      }
      const publicTargets=RESTORE_C2_INVENTORY_TABLES.filter(name=>name.startsWith("public.")).map(name=>name.slice(7)).sort();
      const observedTargets=publicFence.rows[0]?.targets;
      if(publicFence.rows.length!==1||publicFence.rows[0]?.coverage!==true||publicFence.rows[0]?.candidate_coverage!==true||
        !writerSafe||!Array.isArray(observedTargets)||
        observedTargets.some(name=>typeof name!=="string")||JSON.stringify([...observedTargets].sort())!==JSON.stringify(publicTargets))
        throw new Error("V2_CHECKPOINT_PUBLIC_FENCE_UNSAFE");
      // Read the underlying locked tables, not a replaceable accounting view.
      // A delivery obligation has no completed state in this candidate, while
      // a reserved/unknown signer attempt might already have signed.
      const pending=await source.query<{unresolved:boolean}>(`SELECT
        EXISTS(SELECT 1 FROM elp210_candidate.leases WHERE phase IN ('ISSUED','ENTERED','UNKNOWN')) OR
        EXISTS(SELECT 1 FROM elp210_candidate.native_read_obligations WHERE NOT source_reconciled) OR
        EXISTS(SELECT 1 FROM elp210_c2_delivery_candidate.obligations) OR
        EXISTS(SELECT 1 FROM elp210_c2_preparation.b2_attempts WHERE state IN ('RESERVED','UNKNOWN')) AS unresolved`);
      if(pending.rows.length!==1||pending.rows[0]?.unresolved!==false)throw new Error("V2_CHECKPOINT_ORIGINALS_UNRESOLVED");
      const observation=JSON.stringify([closedPin?"portal.restore-frozen-closed-db-observation.v1":
        observeNoLogin?"portal.restore-frozen-nologin-observation.v1":"portal.restore-frozen-checkpoint.v1",this.#pin.checkpoint_id,
        this.#pin.source_system_identifier,drainId,write.source_revision,stopped.operation_id,stopped.prior_generation,
        stopped.prior_writer_oid,next,...(closedPin?[closedPin]:[]),inventory]);
      const bound=createHash("sha256").update(observation,"utf8").digest("hex");
      const receipt=await this.#appendWithVerifiedSource({...write,inventory_digest:bound},
        closedPin?"FROZEN_CLOSED_DB_OBSERVATION":observeNoLogin?"FROZEN_NOLOGIN_SOURCE_OBSERVATION":"FROZEN_SOURCE_CAPTURE",
        this.#pin.source_system_identifier,closedPin?observation:undefined);
      await source.query("COMMIT");return receipt;
    }catch(error){try{await source.query("ROLLBACK");}catch{discard=true;}throw error;}
    finally{source.release(discard);}
  }

  /** Write under serializable CAS. The independent database must be provisioned
   * explicitly with the pinned checkpoint genesis. No implicit bootstrap or
   * deletion occurs. Capture and source-proof provenance remain caller duties.
   * On any error, including an ambiguous COMMIT, retry ONLY the same operation. */
  async append(input: RestoreCheckpointWrite): Promise<RestoreCheckpointReceipt> {
    return this.#appendWithVerifiedSource(input,"CALLER_CLAIM");
  }

  // The kind is selected by the method that actually performs the capture,
  // never by an input object. A JS caller cannot invoke this helper to label a
  // caller-supplied digest as LOCKED_SOURCE_CAPTURE.
  async #appendWithVerifiedSource(input:RestoreCheckpointWrite,kind:RestoreCheckpointCaptureKind,
    lockedSourceId?:string,closedObservation?:string):Promise<RestoreCheckpointReceipt> {
    if (!input) return invalid();
    // A caller may retain and mutate its object while connection acquisition or
    // either transaction is awaiting I/O. Bind the validated facts, event hash,
    // and replay identity to the same four values before the first await.
    input = Object.freeze({ operation_id: input.operation_id, expected_generation: input.expected_generation,
      source_revision: input.source_revision, inventory_digest: input.inventory_digest });
    if (!uuid(input.operation_id) || !dec(input.expected_generation) || !dec(input.source_revision) ||
      !hash(input.inventory_digest) || BigInt(input.expected_generation) >= PG_MAX ||
      (kind==="FROZEN_CLOSED_DB_OBSERVATION" ? typeof closedObservation!=="string" ||
        Buffer.byteLength(closedObservation,"utf8")>8192 ||
        createHash("sha256").update(closedObservation,"utf8").digest("hex")!==input.inventory_digest : closedObservation!==undefined)) return invalid();
    let sourceId=lockedSourceId;
    if(sourceId===undefined) {
      const sourceClient = await this.#source.connect();
      try { sourceId = await identity(sourceClient); } finally { sourceClient.release(); }
    }
    if (sourceId !== this.#pin.source_system_identifier) throw new Error("V2_CHECKPOINT_SOURCE_ID_MISMATCH");
    const db = await this.#authority.connect();
    let committed = false, discard = false;
    try {
      await db.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      // A paused/lost client must not hold the catalog SHARE lock indefinitely
      // between statements. This is a client bound, not an independent fence
      // against an uncooperative database owner or a restore permit.
      await db.query("SET LOCAL lock_timeout='1000ms'; SET LOCAL statement_timeout='3000ms'; SET LOCAL idle_in_transaction_session_timeout='5000ms'");
      if (await identity(db) !== this.#pin.authority_system_identifier) throw new Error("V2_CHECKPOINT_AUTHORITY_ID_MISMATCH");
      // The journal table lock alone does not prevent replacement of a
      // trigger function with the same OID. Use the separately provisioned
      // fixed SECURITY DEFINER helper, and verify this transaction actually
      // holds the catalog lock before observing either guard. This blocks
      // function DDL in this authority DB until the short append commits.
      await db.query("SELECT portal_restore_authority.lock_guard_catalog_for_write()");
      const catalogLock=await db.query<{held:boolean}>(`SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_locks
        WHERE pid=pg_backend_pid() AND granted AND mode='ShareLock' AND relation=to_regclass('pg_catalog.pg_proc')) AS held`);
      if(catalogLock.rows.length!==1||catalogLock.rows[0]?.held!==true)throw new Error("V2_CHECKPOINT_JOURNAL_UNSAFE");
      // Hold a table lock through commit so a concurrent privileged DDL cannot
      // disable the immutable guard between observation and journal append.
      await db.query("LOCK TABLE portal_restore_authority.events IN ROW EXCLUSIVE MODE");
      const guard=await db.query<{guarded:boolean}>(`SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t
        WHERE t.tgrelid=to_regclass('portal_restore_authority.events') AND t.tgname='events_immutable'
        AND t.tgenabled='O' AND NOT t.tgisinternal AND t.tgtype=58 AND t.tgqual IS NULL
        AND t.tgfoid=to_regprocedure('portal_restore_authority.immutable_event()')
        AND EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid=p.prolang
          WHERE p.oid=t.tgfoid AND l.lanname='plpgsql' AND p.prokind='f' AND p.pronargs=0
            AND p.prorettype='pg_catalog.trigger'::regtype AND NOT p.prosecdef AND NOT p.proleakproof
            AND p.provolatile='v' AND p.proconfig IS NULL AND pg_catalog.btrim(p.prosrc,$2)=$1)) AS guarded`,
        ["BEGIN RAISE EXCEPTION 'V2_CHECKPOINT_EVENT_IMMUTABLE'; END"," \t\n\r"]);
      if(guard.rows.length!==1||guard.rows[0]?.guarded!==true)throw new Error("V2_CHECKPOINT_JOURNAL_UNSAFE");
      const heads = await db.query<Head>(`SELECT source_system_identifier,authority_system_identifier,
        generation::text,source_revision::text,event_hash,event_count::text
        FROM portal_restore_authority.checkpoints WHERE checkpoint_id=$1 FOR UPDATE`, [this.#pin.checkpoint_id]);
      const head = heads.rows[0];
      if (heads.rows.length !== 1 || !head || head.source_system_identifier !== sourceId ||
        head.authority_system_identifier !== this.#pin.authority_system_identifier ||
        !dec(head.generation) || !dec(head.source_revision) || !dec(head.event_count) || !hash(head.event_hash) ||
        head.event_count !== head.generation || (head.generation === "0" && head.event_hash !== GENESIS))
        throw new Error("V2_CHECKPOINT_HEAD_INVALID");
      if (BigInt(head.generation) > this.#maximumEvents) throw new Error("V2_CHECKPOINT_CAPACITY_EXHAUSTED");
      // Verify the entire bounded chain, not just its tail. This detects partial
      // alteration, gaps and inconsistent head/history; it is NOT protection
      // against a malicious administrator who can rewrite this whole database.
      const history = await db.query<Event>(`SELECT operation_id::text,expected_generation::text,generation::text,
        source_revision::text,inventory_digest,capture_kind,predecessor_hash,event_hash FROM portal_restore_authority.events e
        WHERE e.checkpoint_id=$1 ORDER BY e.generation LIMIT $2`, [this.#pin.checkpoint_id, Number(this.#maximumEvents) + 1]);
      if (BigInt(history.rows.length) !== BigInt(head.generation)) throw new Error("V2_CHECKPOINT_HISTORY_INVALID");
      let previous = GENESIS, priorRevision = 0n;
      const operations = new Set<string>();
      for (let index = 0; index < history.rows.length; index++) {
        const event = history.rows[index];
        if (!event || !uuid(event.operation_id) || operations.has(event.operation_id) ||
          event.expected_generation !== String(index) || event.generation !== String(index + 1) ||
          !dec(event.source_revision) || BigInt(event.source_revision) < priorRevision ||
          !hash(event.inventory_digest) || !captureKind(event.capture_kind) || event.predecessor_hash !== previous || !hash(event.event_hash) ||
          restoreCheckpointEventHash(this.#pin.checkpoint_id, event, event.generation, event.predecessor_hash,event.capture_kind) !== event.event_hash)
          throw new Error("V2_CHECKPOINT_HISTORY_INVALID");
        operations.add(event.operation_id); previous = event.event_hash; priorRevision = BigInt(event.source_revision);
      }
      if (previous !== head.event_hash || (history.rows.length > 0 && priorRevision !== BigInt(head.source_revision)))
        throw new Error("V2_CHECKPOINT_HISTORY_INVALID");
      const closedEvents=history.rows.filter(event=>event.capture_kind==="FROZEN_CLOSED_DB_OBSERVATION");
      if(closedEvents.length||kind==="FROZEN_CLOSED_DB_OBSERVATION") {
        // Lock the evidence guard across read/append, just as for the journal.
        // An older closed event without its preimage is NOT backfilled from a
        // caller or treated as verified; it requires independent reconciliation.
        await db.query("LOCK TABLE portal_restore_authority.closed_observations IN ROW EXCLUSIVE MODE");
        const protectedEvidence=await db.query<{guarded:boolean}>(`SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t
          WHERE t.tgrelid=to_regclass('portal_restore_authority.closed_observations')
          AND t.tgname='closed_observations_immutable' AND t.tgenabled='O' AND NOT t.tgisinternal
          AND t.tgtype=58 AND t.tgqual IS NULL AND t.tgfoid=to_regprocedure('portal_restore_authority.immutable_event()')
          AND EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid=p.prolang
            WHERE p.oid=t.tgfoid AND l.lanname='plpgsql' AND p.prokind='f' AND p.pronargs=0
              AND p.prorettype='pg_catalog.trigger'::regtype AND NOT p.prosecdef AND NOT p.proleakproof
              AND p.provolatile='v' AND p.proconfig IS NULL AND pg_catalog.btrim(p.prosrc,$2)=$1)) AS guarded`,
          ["BEGIN RAISE EXCEPTION 'V2_CHECKPOINT_EVENT_IMMUTABLE'; END"," \t\n\r"]);
        if(protectedEvidence.rows.length!==1||protectedEvidence.rows[0]?.guarded!==true)throw new Error("V2_CHECKPOINT_OBSERVATION_UNSAFE");
        const evidence=await db.query<{operation_id:string;observation:string}>(`SELECT operation_id::text,observation
          FROM portal_restore_authority.closed_observations WHERE checkpoint_id=$1 ORDER BY operation_id LIMIT $2`,
          [this.#pin.checkpoint_id,Number(this.#maximumEvents)+1]);
        if(evidence.rows.length!==closedEvents.length)throw new Error("V2_CHECKPOINT_OBSERVATION_HISTORY_INVALID");
        for(const row of evidence.rows) {
          const event=closedEvents.find(item=>item.operation_id===row.operation_id);
          if(!event||typeof row.observation!=="string"||Buffer.byteLength(row.observation,"utf8")>8192||
            createHash("sha256").update(row.observation,"utf8").digest("hex")!==event.inventory_digest)
            throw new Error("V2_CHECKPOINT_OBSERVATION_HISTORY_INVALID");
        }
      }
      const old = history.rows.find(event => event.operation_id === input.operation_id);
      if (old) {
        if (old.expected_generation !== input.expected_generation || old.source_revision !== input.source_revision ||
          old.inventory_digest !== input.inventory_digest || old.capture_kind!==kind)
          throw new Error("V2_CHECKPOINT_OPERATION_CONFLICT");
        await db.query("COMMIT"); committed = true;
        return Object.freeze({ state: "STORED_NOT_CUTOVER", generation: old.generation, event_hash: old.event_hash,
          replayed: true, storage: "DISTINCT_PG_CLUSTERS_ONLY",capture_kind:old.capture_kind });
      }
      if (head.generation !== input.expected_generation) throw new Error("V2_CHECKPOINT_GENERATION_CONFLICT");
      if (BigInt(input.source_revision) < BigInt(head.source_revision)) throw new Error("V2_CHECKPOINT_REVISION_REGRESSION");
      if (BigInt(head.event_count) >= this.#maximumEvents) throw new Error("V2_CHECKPOINT_CAPACITY_EXHAUSTED");
      const generation = (BigInt(head.generation) + 1n).toString();
      const eventHash = restoreCheckpointEventHash(this.#pin.checkpoint_id, input, generation, head.event_hash,kind);
      await db.query(`INSERT INTO portal_restore_authority.events(checkpoint_id,operation_id,expected_generation,
        generation,source_revision,inventory_digest,predecessor_hash,event_hash,capture_kind) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [this.#pin.checkpoint_id, input.operation_id, input.expected_generation, generation, input.source_revision,
        input.inventory_digest, head.event_hash, eventHash,kind]);
      if(closedObservation!==undefined)await db.query(`INSERT INTO portal_restore_authority.closed_observations
        (checkpoint_id,operation_id,observation) VALUES($1,$2,$3)`,[this.#pin.checkpoint_id,input.operation_id,closedObservation]);
      const updated = await db.query(`UPDATE portal_restore_authority.checkpoints SET generation=$2,source_revision=$3,
        event_hash=$4,event_count=event_count+1 WHERE checkpoint_id=$1 AND generation=$5 AND event_hash=$6`,
      [this.#pin.checkpoint_id, generation, input.source_revision, eventHash, input.expected_generation, head.event_hash]);
      if (updated.rowCount !== 1) throw new Error("V2_CHECKPOINT_GENERATION_CONFLICT");
      await db.query("COMMIT"); committed = true;
      return Object.freeze({ state: "STORED_NOT_CUTOVER", generation, event_hash: eventHash,
        replayed: false, storage: "DISTINCT_PG_CLUSTERS_ONLY",capture_kind:kind });
    } catch (error) {
      if (!committed) try { await db.query("ROLLBACK"); } catch { discard = true; }
      throw error;
    } finally { db.release(discard); }
  }
}
