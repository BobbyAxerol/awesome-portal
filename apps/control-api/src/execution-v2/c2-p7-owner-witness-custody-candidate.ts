import {createCipheriv,createDecipheriv,createHash,createHmac,randomBytes,randomUUID,timingSafeEqual} from "node:crypto";
import type {Pool,PoolClient} from "pg";
import {C2P7OwnerConfirmationVerifier,type C2P7ConfirmationClaims} from "./c2-p7-owner-confirmation-proof";

/** Unmounted custody candidate. It retains an already-signed confirmation; it
 * cannot sign, authenticate an owner, grant access, fence an old writer, or
 * authorize a restore. The separate cluster, AES key and verifier pin still
 * require independent provisioning and role/ACL qualification. */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const hex=/^[a-f0-9]{64}$/;
const ident=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const sha=(v:Uint8Array)=>createHash("sha256").update(v).digest("hex");
const fail=():never=>{throw new Error("C2_P7_WITNESS_CUSTODY_INVALID");};
const verifierKey=C2P7OwnerConfirmationVerifier.prototype.keySha256;
const verify=C2P7OwnerConfirmationVerifier.prototype.verify;
type Selection={custody_id:string;source_system_identifier:string;authority_system_identifier:string;
  signer_spki_sha256:string;vault_key_id:string;maximum_witnesses:number};
type Envelope={version:"c2-p7-witness-v1";key_id:string;nonce:string;ciphertext:string;tag:string};
type Row={intent_id:string;signer_spki_sha256:string;proof_sha256:string;expires_at_ms:string;envelope:unknown};
type ReservationRow={intent_id:string;request_sha256:string;signer_spki_sha256:string;reservation_mac:string};
const aad=(c:Selection,cycle:string,intent:string,proofHash:string,expiry:number)=>Buffer.from(JSON.stringify([
  "portal.c2-p7-witness-custody.v1",c.custody_id,c.source_system_identifier,c.authority_system_identifier,
  c.signer_spki_sha256,c.vault_key_id,cycle,intent,proofHash,expiry]),"utf8");
function decode(value:unknown,length?:number):Buffer {
  if(typeof value!=="string"||!value.length||value.length>32768||!/^[A-Za-z0-9_-]+$/.test(value))return fail();
  const result=Buffer.from(value,"base64url");
  if(result.toString("base64url")!==value||(length!==undefined&&result.length!==length))return fail();
  return result;
}

export class C2P7OwnerWitnessCustodyCandidate {
  readonly #source:Pool;readonly #authority:Pool;readonly #selection:Readonly<Selection>;readonly #vaultKey:Buffer;
  readonly #verifier:C2P7OwnerConfirmationVerifier;
  constructor(source:Pool,authority:Pool,selection:Selection,vaultKey:Uint8Array,verifier:C2P7OwnerConfirmationVerifier) {
    if(!source||!authority||source===authority||!selection||!uuid.test(selection.custody_id)||
      !/^[0-9]{1,20}$/.test(selection.source_system_identifier)||
      !/^[0-9]{1,20}$/.test(selection.authority_system_identifier)||
      selection.source_system_identifier===selection.authority_system_identifier||
      !hex.test(selection.signer_spki_sha256)||!ident.test(selection.vault_key_id)||
      !Number.isSafeInteger(selection.maximum_witnesses)||selection.maximum_witnesses<1||selection.maximum_witnesses>10000||
      !(vaultKey instanceof Uint8Array)||vaultKey.byteLength!==32||vaultKey.every(v=>v===0)||
      !verifier||Object.getPrototypeOf(verifier)!==C2P7OwnerConfirmationVerifier.prototype||
      verifier.keySha256!==verifierKey||verifier.verify!==verify||
      verifierKey.call(verifier)!==selection.signer_spki_sha256||
      [source,authority].some(p=>!p.options||[p.options.connectionTimeoutMillis,p.options.query_timeout]
        .some(n=>!Number.isSafeInteger(n)||Number(n)<1||Number(n)>10000)))
      throw new Error("C2_P7_WITNESS_CUSTODY_INVALID");
    this.#source=source;this.#authority=authority;this.#selection=Object.freeze({...selection});
    this.#vaultKey=Buffer.from(vaultKey);this.#verifier=verifier;
  }
  /** Composition pins only, never a claim that the cluster or key is
   * independently operated or the signer is authenticated. */
  matchesSourceAndSigner(source:Pool,signerSpkiSha256:string):boolean {
    return this.#source===source&&this.#selection.signer_spki_sha256===signerSpkiSha256;
  }
  #checkVerifier(){if(this.#verifier.verify!==verify||this.#verifier.keySha256!==verifierKey||
    verifierKey.call(this.#verifier)!==this.#selection.signer_spki_sha256)return fail();}
  async #transaction<T>(fn:(db:PoolClient,now:number)=>Promise<T>,sourceClient?:PoolClient):Promise<T> {
    const source=await (sourceClient??this.#source).query("SELECT system_identifier::text AS id FROM pg_control_system()");
    if(source.rowCount!==1||source.rows[0]?.id!==this.#selection.source_system_identifier)return fail();
    const db=await this.#authority.connect();let discard=false;
    let out:T|undefined;
    try {
      await db.query("BEGIN");await db.query("SET LOCAL lock_timeout='1000ms'; SET LOCAL statement_timeout='3000ms'");
      const observed=await db.query(`SELECT system_identifier::text AS id,
        floor(extract(epoch FROM clock_timestamp())*1000)::bigint::text AS now_ms FROM pg_control_system()`);
      const now=Number(observed.rows[0]?.now_ms);
      if(observed.rowCount!==1||observed.rows[0].id!==this.#selection.authority_system_identifier||
        !Number.isSafeInteger(now)||now<0)return fail();
      this.#checkVerifier();out=await fn(db,now);await db.query("COMMIT");return out;
    } catch(error) {if(Buffer.isBuffer(out))out.fill(0);try{await db.query("ROLLBACK");}catch{discard=true;}throw error;}
    finally {db.release(discard);}
  }
  /** Internal composition: custody owns the checkout, so its retained-proof
   * callback can verify the exact same source connection held by the signer.
   * This avoids borrowing another source connection while authority is locked.
   * The callback expires with the checkout and is single-use. This internal
   * API exposes a source client and must only be given to trusted composition;
   * it is not an HTTP or untrusted plugin boundary. */
  async withVerifiedSource<T>(run:(db:PoolClient,retain:(claims:C2P7ConfirmationClaims,proof:Uint8Array)=>Promise<{state:"RETAINED_NOT_AUTHORIZED";proof_sha256:string}>)=>Promise<T>):Promise<T> {
    if(typeof run!=="function")return fail();
    const db=await this.#source.connect();let active=true,used=false,discard=false;
    // An idle-transaction timeout can terminate this checked-out connection
    // while independent custody is still in flight. Do not let that async
    // client error crash the process or return the broken client to the pool.
    const onSourceError=()=>{discard=true;};db.on("error",onSourceError);
    let pending:Promise<{state:"RETAINED_NOT_AUTHORIZED";proof_sha256:string}>|undefined;
    try {
      const retain=async(claims:C2P7ConfirmationClaims,proof:Uint8Array)=>{
        if(!active||used)return fail();used=true;
        pending=this.#retain(claims,proof,db);return await pending;
      };
      return await run(db,retain);
    } catch(error) {discard=true;throw error;}
    finally {active=false;if(pending)await pending.catch(()=>{discard=true;});db.removeListener("error",onSourceError);db.release(discard);}
  }
  #seal(cycle:string,intent:string,proof:Buffer,expiry:number):Envelope {
    const proofHash=sha(proof),nonce=randomBytes(12),cipher=createCipheriv("aes-256-gcm",this.#vaultKey,nonce);
    cipher.setAAD(aad(this.#selection,cycle,intent,proofHash,expiry));
    const encrypted=Buffer.concat([cipher.update(proof),cipher.final()]);
    return {version:"c2-p7-witness-v1",key_id:this.#selection.vault_key_id,nonce:nonce.toString("base64url"),
      ciphertext:encrypted.toString("base64url"),tag:cipher.getAuthTag().toString("base64url")};
  }
  #reservationMac(cycle:string,intent:string,request:string):string {
    const macKey=createHmac("sha256",this.#vaultKey).update("portal.c2-p7-reservation-mac-key.v1","utf8").digest();
    try {return createHmac("sha256",macKey).update(JSON.stringify([
      "portal.c2-p7-reservation-auth.v1",this.#selection.custody_id,this.#selection.source_system_identifier,
      this.#selection.authority_system_identifier,this.#selection.vault_key_id,this.#selection.signer_spki_sha256,
      cycle,intent,request]),"utf8").digest("hex");} finally {macKey.fill(0);}
  }
  #checkReservation(cycle:string,row:ReservationRow):void {
    if(!row||!uuid.test(row.intent_id)||!hex.test(row.request_sha256)||!hex.test(row.reservation_mac)||
      row.signer_spki_sha256!==this.#selection.signer_spki_sha256||
      !timingSafeEqual(Buffer.from(row.reservation_mac,"hex"),
        Buffer.from(this.#reservationMac(cycle,row.intent_id,row.request_sha256),"hex")))return fail();
  }
  async #requireReservation(db:PoolClient,cycle:string,intent:string):Promise<void> {
    const result=await db.query<ReservationRow>(`SELECT intent_id::text,request_sha256,signer_spki_sha256,reservation_mac
      FROM elp210_c2_p7_witness_candidate.reservations WHERE custody_id=$1 AND cycle_sha256=$2 FOR SHARE`,
    [this.#selection.custody_id,cycle]);
    if(result.rowCount!==1)return fail();
    this.#checkReservation(cycle,result.rows[0]);
    if(result.rows[0].intent_id!==intent)return fail();
  }
  #open(cycle:string,intent:string,row:Row):Buffer {
    let first:Buffer|undefined,last:Buffer|undefined,result:Buffer|undefined;
    try {
      if(!row||row.intent_id!==intent||row.signer_spki_sha256!==this.#selection.signer_spki_sha256||
        !hex.test(row.proof_sha256)||!/^\d{1,16}$/.test(row.expires_at_ms)||
        !row.envelope||typeof row.envelope!=="object"||Array.isArray(row.envelope))return fail();
      const envelope=row.envelope as Envelope,expiry=Number(row.expires_at_ms);
      if(!Number.isSafeInteger(expiry)||expiry<1||
        JSON.stringify(Object.keys(envelope).sort())!==JSON.stringify(["ciphertext","key_id","nonce","tag","version"])||
        envelope.version!=="c2-p7-witness-v1"||envelope.key_id!==this.#selection.vault_key_id)return fail();
      const nonce=decode(envelope.nonce,12),tag=decode(envelope.tag,16),ciphertext=decode(envelope.ciphertext);
      if(ciphertext.length>24576)return fail();
      const decipher=createDecipheriv("aes-256-gcm",this.#vaultKey,nonce);
      decipher.setAAD(aad(this.#selection,cycle,intent,row.proof_sha256,expiry));decipher.setAuthTag(tag);
      first=decipher.update(ciphertext);last=decipher.final();result=Buffer.concat([first,last]);first.fill(0);last.fill(0);
      if(!timingSafeEqual(Buffer.from(row.proof_sha256,"hex"),Buffer.from(sha(result),"hex")))return fail();
      return result;
    } catch {result?.fill(0);return fail();} finally {first?.fill(0);last?.fill(0);}
  }
  /** Commit before dispatch. Existing reservation is an ambiguous attempt,
   * never permission to create another intent. No credential is stored. */
  async reserveIntent(cycle:string,requestSha256:string):Promise<{intent_id:string;created:boolean}> {
    if(!hex.test(cycle)||!hex.test(requestSha256))return fail();
    return this.#transaction(async db=>{
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended('portal.c2-p7-witness.v1:' || $1::text,0))",[this.#selection.custody_id]);
      const witnesses=await db.query<Row>(`SELECT intent_id::text,signer_spki_sha256,proof_sha256,expires_at_ms::text,envelope
        FROM elp210_c2_p7_witness_candidate.witnesses WHERE custody_id=$1 AND cycle_sha256=$2 FOR SHARE`,[this.#selection.custody_id,cycle]);
      const found=await db.query<ReservationRow>(`SELECT intent_id::text,request_sha256,signer_spki_sha256,reservation_mac
        FROM elp210_c2_p7_witness_candidate.reservations WHERE custody_id=$1 AND cycle_sha256=$2 FOR SHARE`,[this.#selection.custody_id,cycle]);
      if(found.rowCount===1) {
        this.#checkReservation(cycle,found.rows[0]);
        if(found.rows[0].request_sha256!==requestSha256)return fail();
      } else if(found.rowCount!==0)return fail();
      if(witnesses.rowCount===1) {
        const row=witnesses.rows[0],proof=this.#open(cycle,row.intent_id,row);proof.fill(0);
        // A witness authenticates its intent, not the request that reserved
        // it. A legacy witness with no reservation cannot establish that
        // binding; reconcile it independently rather than guessing or retrying.
        if(found.rowCount!==1||found.rows[0].intent_id!==row.intent_id)return fail();
        return {intent_id:row.intent_id,created:false};
      }
      if(witnesses.rowCount!==0)return fail();
      if(found.rowCount===1) {
        return {intent_id:found.rows[0].intent_id,created:false};
      }
      const count=await db.query(`SELECT count(*)::int AS n FROM (
        SELECT cycle_sha256 FROM elp210_c2_p7_witness_candidate.witnesses WHERE custody_id=$1
        UNION SELECT cycle_sha256 FROM elp210_c2_p7_witness_candidate.reservations WHERE custody_id=$1) cycles`,[this.#selection.custody_id]);
      if(count.rows[0]?.n>=this.#selection.maximum_witnesses)throw new Error("C2_P7_WITNESS_CAPACITY_EXHAUSTED");
      const intent=randomUUID();
      await db.query(`INSERT INTO elp210_c2_p7_witness_candidate.reservations
        (custody_id,cycle_sha256,intent_id,request_sha256,signer_spki_sha256,reservation_mac) VALUES($1,$2,$3,$4,$5,$6)`,
      [this.#selection.custody_id,cycle,intent,requestSha256,this.#selection.signer_spki_sha256,
        this.#reservationMac(cycle,intent,requestSha256)]);
      return {intent_id:intent,created:true};
    });
  }
  /** Store only an already independently signed proof. A retry must name the
   * same cycle, intent and exact bytes; never replace a lost or ambiguous one. */
  async retain(untrusted:C2P7ConfirmationClaims,untrustedProof:Uint8Array):Promise<{state:"RETAINED_NOT_AUTHORIZED";proof_sha256:string}> {
    return this.#retain(untrusted,untrustedProof);
  }
  async #retain(untrusted:C2P7ConfirmationClaims,untrustedProof:Uint8Array,sourceClient?:PoolClient):Promise<{state:"RETAINED_NOT_AUTHORIZED";proof_sha256:string}> {
    if(!(untrustedProof instanceof Uint8Array)||untrustedProof.byteLength<1||untrustedProof.byteLength>24576)return fail();
    const expected=structuredClone(untrusted),proof=Buffer.from(untrustedProof);
    try {return await this.#transaction(async(db,now)=>{
      const claims=verify.call(this.#verifier,proof,expected,now);
      const proofHash=sha(proof),envelope=this.#seal(claims.cycle_sha256,claims.intent_id,proof,claims.expires_at_ms);
      // Serialize capacity across service instances, not merely within one JS
      // process. Expired witnesses stay retained; expiry is not deletion or
      // authority to replace an original. Independently restrict DB writers.
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended('portal.c2-p7-witness.v1:' || $1::text,0))",
        [this.#selection.custody_id]);
      // Capacity is reserved before dispatch. A valid signature alone does
      // not bind the witness to the authenticated request: requiring the
      // keyed reservation here prevents creating new orphan witnesses as
      // well as rejecting wrong-intent or tampered reservations on retry.
      await this.#requireReservation(db,claims.cycle_sha256,claims.intent_id);
      await db.query(`INSERT INTO elp210_c2_p7_witness_candidate.witnesses
        (custody_id,cycle_sha256,intent_id,signer_spki_sha256,proof_sha256,expires_at_ms,envelope)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT DO NOTHING`,
      [this.#selection.custody_id,claims.cycle_sha256,claims.intent_id,this.#selection.signer_spki_sha256,
        proofHash,claims.expires_at_ms,JSON.stringify(envelope)]);
      const rows=await db.query<Row>(`SELECT intent_id::text,signer_spki_sha256,proof_sha256,expires_at_ms::text,envelope
        FROM elp210_c2_p7_witness_candidate.witnesses WHERE custody_id=$1 AND cycle_sha256=$2 FOR SHARE`,
      [this.#selection.custody_id,claims.cycle_sha256]);
      if(rows.rowCount!==1||rows.rows[0].proof_sha256!==proofHash||Number(rows.rows[0].expires_at_ms)!==claims.expires_at_ms)return fail();
      const stored=this.#open(claims.cycle_sha256,claims.intent_id,rows.rows[0]);
      try {if(!stored.equals(proof))return fail();verify.call(this.#verifier,stored,claims,now);}
      finally {stored.fill(0);}
      return {state:"RETAINED_NOT_AUTHORIZED" as const,proof_sha256:proofHash};
    },sourceClient);} finally {proof.fill(0);}
  }
  /** Return a copied proof to trusted issuer composition only. The issuer must
   * still lock and revalidate current owner, scope, source and revocation. */
  async recover(untrusted:C2P7ConfirmationClaims):Promise<Buffer> {
    const expected=structuredClone(untrusted);
    if(!expected||!hex.test(expected.cycle_sha256)||!uuid.test(expected.intent_id))return fail();
    return this.#transaction(async(db,now)=>{
      const rows=await db.query<Row>(`SELECT intent_id::text,signer_spki_sha256,proof_sha256,expires_at_ms::text,envelope
        FROM elp210_c2_p7_witness_candidate.witnesses WHERE custody_id=$1 AND cycle_sha256=$2 FOR SHARE`,
      [this.#selection.custody_id,expected.cycle_sha256]);
      if(rows.rowCount!==1||Number(rows.rows[0].expires_at_ms)!==expected.expires_at_ms)return fail();
      // A valid encrypted witness alone is not proof that this was the
      // independently reserved request. Do not let a recovery caller bypass
      // reserveIntent's MAC and same-intent check on a legacy/rolled-back DB.
      await this.#requireReservation(db,expected.cycle_sha256,expected.intent_id);
      const proof=this.#open(expected.cycle_sha256,expected.intent_id,rows.rows[0]);
      try {verify.call(this.#verifier,proof,expected,now);return proof;}catch(error){proof.fill(0);throw error;}
    });
  }

  /** Observe whether this cycle already has an authenticated retained witness.
   * It is a locator/fence only, not proof of current owner or a restore permit.
   * Never turn an unreadable or tampered row into an absent cycle. */
  async retainedIntent(cycle:string):Promise<string|null> {
    if(typeof cycle!=="string"||!hex.test(cycle))return fail();
    return this.#transaction(async db=>{
      const rows=await db.query<Row>(`SELECT intent_id::text,signer_spki_sha256,proof_sha256,expires_at_ms::text,envelope
        FROM elp210_c2_p7_witness_candidate.witnesses WHERE custody_id=$1 AND cycle_sha256=$2 FOR SHARE`,
      [this.#selection.custody_id,cycle]);
      if(rows.rowCount===0)return null;
      if(rows.rowCount!==1||!uuid.test(rows.rows[0]?.intent_id))return fail();
      await this.#requireReservation(db,cycle,rows.rows[0].intent_id);
      const proof=this.#open(cycle,rows.rows[0].intent_id,rows.rows[0]);
      proof.fill(0);
      return rows.rows[0].intent_id;
    });
  }
}
