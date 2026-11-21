/** PRIVATE coupled NC01 frame settlement. No transport, human grant, or generic
 * release callback. Only actual selected-source ACK + SAME-row SQL COMMIT/
 * release/readback can mint a proof consumable by the exact bound Egress owner. */
import type { Pool } from "pg";
import { withTransaction } from "../db/pool";
import { accessDigest } from "./access-policy";
import { prepareNativeBusinessReadRequest, nativeBusinessReadTransportRequest,
  nativeBusinessReadUtcMicroseconds } from "./native-business-read-codec";
import { selectedNativeBusinessReadSelection, selectedNativeBusinessReadObservation,
  type SelectedNativeBusinessReadSource, type VerifiedSelectedNativeReadObservation } from "./native-business-read-selected-source";
import type { NativeReadEgressFrameReservation, NativeReadEgressFrameWitness,
  NativeReadFrameObservation } from "./native-read-egress";

declare const ownerBrand: unique symbol, targetBrand: unique symbol, proofBrand: unique symbol;
export type NativeFrameSettlementOwner = Readonly<{ readonly [ownerBrand]: true }>;
export type NativeFrameSettlementTarget = Readonly<{ readonly [targetBrand]: true }>;
export type NativeFrameSettlementProof = Readonly<{ readonly [proofBrand]: true }>;
type Phase = "SERVED" | "ABORTED" | "CANCELLED";
type State = { pool: Pool; source: SelectedNativeBusinessReadSource; sender: string; owner?: object };
type Target = { state: State; owner: object; reservation: NativeReadEgressFrameReservation;
  witness: NativeReadEgressFrameWitness; observation: NativeReadFrameObservation };
type Proof = { target: NativeFrameSettlementTarget; state: State; owner: object;
  phase: Phase; receipt: string | null; ack: string };
const states = new WeakMap<object, State>(), owners = new WeakMap<object, { state: State; owner: object }>(),
  targets = new WeakMap<object, Target>(), proofs = new WeakMap<object, Proof>();
const fail = (): never => { throw new Error("CURRENT_HUMAN_NATIVE_FRAME_SETTLEMENT_REFUSED"); };
const sha = (value: unknown): value is string => typeof value === "string" && /^sha256:[a-f0-9]{64}$(?![\s\S])/.test(value);
const stateOf = (value: unknown) => value && typeof value === "object" ? states.get(value) ?? fail() : fail();
type Row = { [key: string]: unknown; lease_id: string; attempt_id: string; lifecycle_kind: string;
  sender_id: string; base_body: string; binding_digest: string; stable_core_digest: string;
  source_identity_digest: string; subject_id: string; session_id: string; session_revision: string;
  workspace_id: string; environment: string; workload_id: string; request_digest: string; expires_at_ms: string;
  scope_digest: string; frame_domain_scope_digest: string; frame_notice_scope_digest: string;
  native_source_digest: string | null; body_digest: string | null; phase: Phase | "ADMITTED" | "SENDING" | "UNKNOWN";
  no_send_fenced: boolean; enter_response_digest: string | null; receipt_id: string | null;
  receipt_digest: string | null; source_reconciled: boolean; source_ack_action: string | null; source_ack_digest: string | null };
function capturedRow(state: State, row: Row | undefined) {
  if (!row || row.lifecycle_kind !== "MANAGER_SSE_FRAME") return fail();
  const selection = selectedNativeBusinessReadSelection(state.source);
  const prepared = prepareNativeBusinessReadRequest("status", Buffer.from(row.base_body, "utf8"),
    { request_bytes: 32768, response_bytes: 32768 });
  const wire = nativeBusinessReadTransportRequest(prepared), base = JSON.parse(wire.body);
  const b = base.binding, intent = base.manager_intent;
  if (wire.body !== row.base_body || prepared.binding_digest !== row.binding_digest ||
    prepared.stable_core_digest !== row.stable_core_digest || intent.schema_version !== "pma.manager-read-intent.v2" ||
    intent.action !== "scoped_notice" || row.source_identity_digest !== selection.source_identity_digest ||
    accessDigest(base.domain) !== accessDigest(selection.domain) || b.human_issuer !== selection.binding.human_issuer ||
    b.workload_id !== selection.binding.workload_id || b.workspace_id !== selection.binding.workspace_id ||
    b.environment !== selection.binding.environment || b.lease_id !== row.lease_id || b.attempt_id !== row.attempt_id ||
    b.subject !== row.subject_id || b.workspace_id !== row.workspace_id || b.environment !== row.environment ||
    b.workload_id !== row.workload_id || b.request_digest !== row.request_digest ||
    nativeBusinessReadUtcMicroseconds(base.deadline) / 1000n !== BigInt(row.expires_at_ms) ||
    !sha(row.frame_domain_scope_digest) || !sha(row.frame_notice_scope_digest) ||
    row.scope_digest !== accessDigest({ schema: "portal.native-frame-scope.v1",
      domain_scope_digest: row.frame_domain_scope_digest, notice_scope_digest: row.frame_notice_scope_digest }))
    return fail();
  return base;
}
function correlateTarget(target: Target, row: Row, base: ReturnType<typeof capturedRow>) {
  const observation = target.observation, b = observation.binding, d = observation.delivery;
  if (row.sender_id !== target.state.sender || b.lease_id !== row.lease_id || b.attempt_id !== row.attempt_id ||
    b.binding_digest !== row.binding_digest || b.source_digest !== row.native_source_digest ||
    b.scope_digest !== row.scope_digest || b.body_digest !== row.body_digest ||
    base.manager_intent.frame_sha256 !== b.body_digest.slice(7) ||
    d.stream_id !== base.manager_intent.stream_id || d.frame_ordinal !== base.manager_intent.frame_ordinal ||
    observation.outcome === "UNKNOWN" || row.phase === "SERVED" && observation.outcome !== "FINISHED" ||
    row.phase !== "SERVED" && observation.outcome !== "ABORTED") return fail();
}
/** Factory configuration authenticates only SAME helper/selected wrapper identity,
 * not an app/business/frame permission. Candidate never exposes this instance. */
export class NativeFrameSettlement {
  constructor(pool: Pool, source: SelectedNativeBusinessReadSource, sender: string) {
    selectedNativeBusinessReadSelection(source);
    if (typeof sender !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$(?![\s\S])/.test(sender)) fail();
    states.set(this, { pool, source, sender });
  }
  usesPool(pool: Pool): boolean { return stateOf(this).pool === pool; }

  async #transaction<T>(fn: (db: import("pg").PoolClient) => Promise<T>): Promise<T> {
    const state = stateOf(this);
    // withTransaction resolves only AFTER actual COMMIT ACK and finally release.
    return withTransaction(state.pool, async db => {
      await db.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
      await db.query("SET LOCAL lock_timeout='1000ms'; SET LOCAL statement_timeout='3000ms'");
      const authority = (await db.query("SELECT revision FROM elp210_candidate.authority WHERE singleton FOR UPDATE")).rows[0];
      if (!authority) return fail();
      return fn(db);
    });
  }

  /** Genuine observation is authenticated again INSIDE this narrow helper before
   * its SQL. No caller-supplied 'committed' boolean/closure manufactures proof. */
  async recordACK(leaseId: string, observation: VerifiedSelectedNativeReadObservation,
    target?: NativeFrameSettlementTarget): Promise<NativeFrameSettlementProof | null> {
    const state = stateOf(this), proof = selectedNativeBusinessReadObservation(state.source, observation);
    if (!["resolve", "cancel-unentered"].includes(proof.action)) return fail();
    const physical=target?targets.get(target):undefined;
    if(target&&(!physical||physical.state!==state||physical.owner!==state.owner))return fail();
    const durable=await this.#transaction(async db => {
      const row = (await db.query<Row>("SELECT * FROM elp210_candidate.native_read_obligations WHERE lease_id=$1 FOR UPDATE", [leaseId])).rows[0];
      const base=capturedRow(state, row);
      if(physical&&proof.action==="resolve")correlateTarget(physical,row,base);
      if (proof.source_identity_digest !== row.source_identity_digest || proof.base_body !== row.base_body ||
        proof.binding_digest !== row.binding_digest || proof.stable_core_digest !== row.stable_core_digest) return fail();
      let phase = row.phase;
      if (proof.action === "resolve") {
        if (proof.result.state !== "SETTLED" || !["SERVED", "ABORTED"].includes(row.phase) ||
          proof.result.recovery.phase !== row.phase || !row.receipt_id || !sha(row.receipt_digest) ||
          !row.enter_response_digest || !row.native_source_digest || !row.body_digest) return fail();
      } else {
        if (!["CANCELLED", "RETIRED"].includes(proof.result.state) || row.body_digest !== null ||
          !row.no_send_fenced || !["ADMITTED", "UNKNOWN", "ABORTED", "CANCELLED"].includes(row.phase)) return fail();
        phase = row.phase === "ABORTED" ? "ABORTED" : "CANCELLED";
      }
      if (row.source_reconciled) {
        if (row.source_ack_action !== proof.action || !sha(row.source_ack_digest)) return fail();
        return {phase:row.phase as Phase,receipt:row.receipt_digest,ack:row.source_ack_digest};
      }
      const updated = await db.query(
        "UPDATE elp210_candidate.native_read_obligations SET phase=$2,source_reconciled=true,source_ack_action=$3,source_ack_digest=$4 " +
        "WHERE lease_id=$1 AND attempt_id=$5 AND lifecycle_kind='MANAGER_SSE_FRAME' AND binding_digest=$6 " +
        "AND stable_core_digest=$7 AND source_identity_digest=$8 AND NOT source_reconciled",
        [leaseId, phase, proof.action, proof.response_sha256, row.attempt_id, row.binding_digest,
          row.stable_core_digest, row.source_identity_digest]);
      if (updated.rowCount !== 1) return fail();
      return {phase:phase as Phase,receipt:row.receipt_digest,ack:proof.response_sha256};
    });
    // Normal path needs no second query: actual withTransaction has completed
    // COMMIT ACK and finally release. A lost ACK mints NOTHING; readback below
    // is used only for an already-reconciled retry.
    if(!target||!physical||proof.action!=="resolve")return null;
    const token=Object.freeze({}) as NativeFrameSettlementProof;
    proofs.set(token,{target,state,owner:physical.owner,...durable});return token;
  }

  async readback(target: NativeFrameSettlementTarget): Promise<NativeFrameSettlementProof> {
    const state = stateOf(this), actual = targets.get(target);
    if (!actual || actual.state !== state || actual.owner !== state.owner) return fail();
    const durable = await this.#transaction(async db => {
      const row = (await db.query<Row>("SELECT * FROM elp210_candidate.native_read_obligations WHERE lease_id=$1 FOR UPDATE",
        [actual.observation.binding.lease_id])).rows[0], base = capturedRow(state, row);
      correlateTarget(actual, row, base);
      if (!row.source_reconciled || !["SERVED", "ABORTED"].includes(row.phase) ||
        row.source_ack_action !== "resolve" || !sha(row.source_ack_digest) || !row.receipt_id ||
        !sha(row.receipt_digest) || !row.enter_response_digest) return fail();
      return { phase: row.phase as Phase, receipt: row.receipt_digest, ack: row.source_ack_digest };
    });
    const token = Object.freeze({}) as NativeFrameSettlementProof;
    proofs.set(token, { target, state, owner: actual.owner, ...durable }); return token;
  }
}

/** One-time exact-owner registration, never a release factory. Egress captures
 * this opaque issuer in an ECMAScript #private slot and never returns it. */
export function bindNativeFrameSettlementOwner(helper: NativeFrameSettlement, owner: object): NativeFrameSettlementOwner {
  const state = stateOf(helper);
  if (state.owner || !owner || typeof owner !== "object") return fail();
  state.owner = owner;
  const token = Object.freeze({}) as NativeFrameSettlementOwner;
  owners.set(token, { state, owner }); return token;
}
/** Only the actual Egress owner holds its issuer; caller-shaped observations
 * without that exact instance-private key cannot register physical targets. */
export function captureNativeFrameSettlementTarget(issuer: NativeFrameSettlementOwner,
  reservation: NativeReadEgressFrameReservation, witness: NativeReadEgressFrameWitness,
  observation: NativeReadFrameObservation): NativeFrameSettlementTarget {
  const owner = owners.get(issuer);
  if (!owner || owner.state.owner !== owner.owner) return fail();
  const token = Object.freeze({}) as NativeFrameSettlementTarget;
  targets.set(token, { ...owner, reservation, witness, observation }); return token;
}
/** Verifier runs synchronously at SAME Egress retirement. Tokens from a different
 * helper/pool/source/sender/owner or physical target cannot advance this stream. */
export function consumeNativeFrameSettlementProof(issuer: NativeFrameSettlementOwner,
  target: NativeFrameSettlementTarget, proof: NativeFrameSettlementProof): Phase {
  const owner = owners.get(issuer), actual = targets.get(target), verified = proofs.get(proof);
  if (!owner || !actual || !verified || actual.state !== owner.state || actual.owner !== owner.owner ||
    verified.state !== owner.state || verified.owner !== owner.owner || verified.target !== target) return fail();
  proofs.delete(proof); return verified.phase;
}
