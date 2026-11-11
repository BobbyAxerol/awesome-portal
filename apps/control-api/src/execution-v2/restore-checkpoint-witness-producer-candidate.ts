import {createHash,createPublicKey,sign,type KeyObject} from "node:crypto";
import type {Pool,PoolClient} from "pg";
import {z} from "zod";
import {RestoreCheckpointSignedAnchor} from "./restore-checkpoint-signed-anchor";
import type {RestoreCheckpointPin} from "./restore-checkpoint-authority";

/** UNMOUNTED producer candidate. Stores only a verified signed closed head on
 * a third PG system and signs a challenge with the stored head, never caller
 * selected head fields. A DB admin/old backup can still roll back this store;
 * a separate qualified monotonic authority, TLS, access, clock and signer
 * custody are prerequisites, not properties of this class. NOT a cutover. */
const uuid=z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const cluster=z.string().regex(/^(?:0|[1-9][0-9]{0,19})$/);
const label=z.string().min(1).max(128).refine(v=>v.trim()===v&&!/[\u0000-\u001f\u007f]/u.test(v));
const challenge=z.object({checkpoint_id:uuid,source_system_identifier:cluster,authority_system_identifier:cluster,nonce:hash}).strict();
const fail=():never=>{throw new Error("V2_CHECKPOINT_WITNESS_PRODUCER_INVALID");};
const matches=RestoreCheckpointSignedAnchor.prototype.matchesTrust;
const readAnchor=RestoreCheckpointSignedAnchor.prototype.readSignedClosed;
type Trust=Readonly<{pin:RestoreCheckpointPin;anchor_key_sha256:string;witness_system_identifier:string;
  issuer:string;audience:string;public_key_sha256:string;ttl_ms:number}>;
type Head={source_system_identifier:string;authority_system_identifier:string;witness_system_identifier:string;
  generation:string;event_hash:string;operation_id:string};

export class RestoreCheckpointWitnessProducerCandidate {
  readonly #pool:Pool;readonly #anchor:RestoreCheckpointSignedAnchor;readonly #pin:Readonly<RestoreCheckpointPin>;
  readonly #witnessId:string;readonly #issuer:string;readonly #audience:string;readonly #key:KeyObject;readonly #ttl:number;
  constructor(pool:Pool,anchor:RestoreCheckpointSignedAnchor,trust:Trust,privateKey:KeyObject) {
    if(!pool?.options||[pool.options.connectionTimeoutMillis,pool.options.query_timeout]
      .some(v=>!Number.isSafeInteger(v)||Number(v)<1||Number(v)>10000)||!anchor||
      Object.getPrototypeOf(anchor)!==RestoreCheckpointSignedAnchor.prototype||!trust||!trust.pin||
      !uuid.safeParse(trust.pin.checkpoint_id).success||!cluster.safeParse(trust.pin.source_system_identifier).success||
      !cluster.safeParse(trust.pin.authority_system_identifier).success||!cluster.safeParse(trust.witness_system_identifier).success||
      new Set([trust.pin.source_system_identifier,trust.pin.authority_system_identifier,trust.witness_system_identifier]).size!==3||
      !hash.safeParse(trust.anchor_key_sha256).success||!hash.safeParse(trust.public_key_sha256).success||
      trust.anchor_key_sha256===trust.public_key_sha256||!matches.call(anchor,trust.pin,trust.anchor_key_sha256)||
      !label.safeParse(trust.issuer).success||!label.safeParse(trust.audience).success||
      !Number.isSafeInteger(trust.ttl_ms)||trust.ttl_ms<100||trust.ttl_ms>10000||
      !privateKey||privateKey.type!=="private"||privateKey.asymmetricKeyType!=="ed25519")throw new Error("V2_CHECKPOINT_WITNESS_PRODUCER_INVALID");
    const actual=createHash("sha256").update(createPublicKey(privateKey).export({type:"spki",format:"der"})).digest("hex");
    if(actual!==trust.public_key_sha256)throw new Error("V2_CHECKPOINT_WITNESS_PRODUCER_INVALID");
    this.#pool=pool;this.#anchor=anchor;this.#pin=Object.freeze({...trust.pin});this.#witnessId=trust.witness_system_identifier;
    this.#issuer=trust.issuer;this.#audience=trust.audience;this.#key=privateKey;this.#ttl=trust.ttl_ms;
  }
  async #tx<T>(fn:(db:PoolClient)=>Promise<T>):Promise<T> {
    const db=await this.#pool.connect();let discard=false;
    try {
      await db.query("BEGIN");await db.query("SET LOCAL lock_timeout='1000ms'; SET LOCAL statement_timeout='3000ms'");
      const id=await db.query<{id:string}>("SELECT system_identifier::text AS id FROM pg_control_system()");
      if(id.rowCount!==1||id.rows[0]?.id!==this.#witnessId)return fail();
      const result=await fn(db);await db.query("COMMIT");return result;
    }catch(error){try{await db.query("ROLLBACK");}catch{discard=true;}throw error;}finally{db.release(discard);}
  }
  #check(head:Head):void {
    if(!head||head.source_system_identifier!==this.#pin.source_system_identifier||
      head.authority_system_identifier!==this.#pin.authority_system_identifier||head.witness_system_identifier!==this.#witnessId||
      !/^[1-9][0-9]{0,18}$/.test(head.generation)||BigInt(head.generation)>9_223_372_036_854_775_807n||
      !hash.safeParse(head.event_hash).success||!uuid.safeParse(head.operation_id).success)return fail();
  }
  /** Accept only the latest independently read signed closed observation.
   * A lost response retries the same head; equal-generation forks and lower
   * heads are rejected while this exact store remains durable. */
  async admit(anchorProof:Uint8Array):Promise<{state:"STORED_NOT_CUTOVER";generation:string}> {
    if(!(anchorProof instanceof Uint8Array)||anchorProof.byteLength<1||anchorProof.byteLength>24576)return fail();
    const proof=Buffer.from(anchorProof);
    try {
      // Read our old head first and demand it in the signed authority's
      // verified history. A higher generation on a fork must not advance us.
      const previous=await this.#tx(async db=>{
        const rows=await db.query<Head>(`SELECT source_system_identifier,authority_system_identifier,witness_system_identifier,
          generation::text,event_hash,operation_id::text FROM portal_restore_witness_candidate.heads WHERE checkpoint_id=$1`,[this.#pin.checkpoint_id]);
        if(rows.rowCount===0)return undefined;
        if(rows.rowCount!==1)return fail();this.#check(rows.rows[0]);return Object.freeze({...rows.rows[0]});
      });
      const observed=await readAnchor.call(this.#anchor,proof,previous&&{generation:previous.generation,
        event_hash:previous.event_hash,operation_id:previous.operation_id});
      return await this.#tx(async db=>{
        await db.query("SELECT pg_advisory_xact_lock(hashtextextended('portal.restore.witness.v1:' || $1::text,0))",[this.#pin.checkpoint_id]);
        if(Date.now()>=observed.anchor_expires_at_ms)return fail();
        const existing=await db.query<Head>(`SELECT source_system_identifier,authority_system_identifier,witness_system_identifier,
          generation::text,event_hash,operation_id::text FROM portal_restore_witness_candidate.heads WHERE checkpoint_id=$1 FOR UPDATE`,[this.#pin.checkpoint_id]);
        if((existing.rowCount===0)!==(previous===undefined))return fail();
        if(previous&&(existing.rowCount!==1||existing.rows[0].generation!==previous.generation||
          existing.rows[0].event_hash!==previous.event_hash||existing.rows[0].operation_id!==previous.operation_id))return fail();
        if(existing.rowCount===0) await db.query(`INSERT INTO portal_restore_witness_candidate.heads
          (checkpoint_id,source_system_identifier,authority_system_identifier,witness_system_identifier,generation,event_hash,operation_id)
          VALUES($1,$2,$3,$4,$5,$6,$7)`,[this.#pin.checkpoint_id,this.#pin.source_system_identifier,
          this.#pin.authority_system_identifier,this.#witnessId,observed.generation,observed.event_hash,observed.operation_id]);
        else {
          if(existing.rowCount!==1)return fail();const old=existing.rows[0];this.#check(old);
          if(BigInt(observed.generation)<BigInt(old.generation)||
            (observed.generation===old.generation&&(observed.event_hash!==old.event_hash||observed.operation_id!==old.operation_id)))return fail();
          if(BigInt(observed.generation)>BigInt(old.generation)) await db.query(`UPDATE portal_restore_witness_candidate.heads
            SET generation=$2,event_hash=$3,operation_id=$4 WHERE checkpoint_id=$1`,
          [this.#pin.checkpoint_id,observed.generation,observed.event_hash,observed.operation_id]);
        }
        if(Date.now()>=observed.anchor_expires_at_ms)return fail();
        return Object.freeze({state:"STORED_NOT_CUTOVER" as const,generation:observed.generation});
      });
    }finally{proof.fill(0);}
  }
  /** No generic signing API: response fields other than the fresh nonce come
   * only from the selected durable row. This observation is NOT a fence. */
  async respond(untrusted:unknown):Promise<Buffer> {
    const selected=challenge.safeParse(untrusted);if(!selected.success)return fail();
    const c=selected.data;
    if(c.checkpoint_id!==this.#pin.checkpoint_id||c.source_system_identifier!==this.#pin.source_system_identifier||
      c.authority_system_identifier!==this.#pin.authority_system_identifier)return fail();
    return this.#tx(async db=>{
      const rows=await db.query<Head>(`SELECT source_system_identifier,authority_system_identifier,witness_system_identifier,
        generation::text,event_hash,operation_id::text FROM portal_restore_witness_candidate.heads WHERE checkpoint_id=$1 FOR SHARE`,[c.checkpoint_id]);
      if(rows.rowCount!==1)return fail();const head=rows.rows[0];this.#check(head);
      const now=Date.now();if(!Number.isSafeInteger(now)||now<0||!Number.isSafeInteger(now+this.#ttl))return fail();
      const body=Buffer.from(JSON.stringify({schema:"portal.restore-checkpoint-fresh-witness.candidate.v1",issuer:this.#issuer,
        audience:this.#audience,...c,generation:head.generation,event_hash:head.event_hash,operation_id:head.operation_id,
        issued_at_ms:now,expires_at_ms:now+this.#ttl}));
      try{return Buffer.from(JSON.stringify({payload:body.toString("base64url"),signature:sign(null,body,this.#key).toString("base64url")}));}
      finally{body.fill(0);}
    });
  }
}
