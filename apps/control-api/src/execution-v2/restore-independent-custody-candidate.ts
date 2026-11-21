import { createHash, KeyObject } from "node:crypto";
import { decodeJwt, exportJWK, jwtVerify, type KeyLike } from "jose";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { accessDigest } from "./access-digest";
import { C2SourceProofVault, type SourceProofBinding } from "./restore-c2-source-proof-vault";
import { C2JournalAuthenticatorCandidate } from "./restore-c2-journal-authenticator-candidate";

/** UNMOUNTED research candidate. It validates the existing human assertion and
 * its durable original, but is not wired ahead of transport. It is not source
 * readback, recipient ACK, a transaction fence, independent failure-domain
 * proof, or permission for DR cutover. */
const id=z.string().min(1).max(128).regex(/^[^\u0000-\u001f\u007f]+$/).refine(v=>v===v.trim());
const num=z.number().int().nonnegative().safe();
const dig=z.string().regex(/^sha256:[a-f0-9]{64}$/);
const base={iss:id,aud:id,sub:id,jti:id,iat:num,nbf:num,exp:num};
const original=z.object({...base,purpose:z.literal("pma.identity.v1"),principal_kind:z.literal("human"),sid:id,
  workspace_id:id,environment:z.literal("paper"),workload_id:id,request_digest:dig,
  session_revision:num,authority_revision:num}).strict();
const terminal=z.object({...base,purpose:z.literal("pma.current-human-lease.v1"),lease_id:id,attempt_id:id,
  workspace_id:id,environment:z.literal("paper"),workload_id:id,request_digest:dig,
  phase:z.enum(["COMMITTED","ROLLED_BACK"]),source_receipt_id:id,source_receipt_digest:dig}).strict();
const unknown=z.object({...base,purpose:z.literal("pma.current-human-lease.v1"),lease_id:id,attempt_id:id,
  workspace_id:id,environment:z.literal("paper"),workload_id:id,request_digest:dig,
  phase:z.literal("UNKNOWN"),source_receipt_id:z.null(),source_receipt_digest:z.null()}).strict();
const entered=unknown.extend({phase:z.literal("ENTER")});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const decimal=/^(?:0|[1-9][0-9]{0,18})$/;
const hex=/^[0-9a-f]{64}$/;
const sha=(v:string)=>createHash("sha256").update(v,"utf8").digest("hex");
// These are fixed candidate function bodies, not caller-provided SQL. An
// enabled trigger with the expected OID is insufficient after CREATE OR
// REPLACE FUNCTION. The authoritative append separately holds and verifies a
// catalog lock; preflight is advisory and is not a substitute for that lock.
const guardBodies=["BEGIN RAISE EXCEPTION 'RESTORE_CUSTODY_EVENT_IMMUTABLE'; END",
  "BEGIN RAISE EXCEPTION 'RESTORE_CUSTODY_SOURCE_PROOF_IMMUTABLE'; END"," \t\n\r"];
const guardFunction=(expected:string,trim="$3")=>`EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_language l ON l.oid=p.prolang WHERE p.oid=t.tgfoid AND l.lanname='plpgsql'
  AND p.prokind='f' AND p.pronargs=0 AND p.prorettype='pg_catalog.trigger'::regtype
  AND NOT p.prosecdef AND NOT p.proleakproof AND p.provolatile='v' AND p.proconfig IS NULL
  AND pg_catalog.btrim(p.prosrc,${trim})=${expected})`;
/** A kid is not a key. Only public Ed25519 keys with exportable SPKI are
 * eligible for this internal selection check. Runtime/role qualification is
 * separate and existing persisted custody-digest bytes are not changed. */
function publicSpkiSha256(value:KeyLike):string|null {
  try {
    const key=value instanceof KeyObject?value:KeyObject.from(value as Parameters<typeof KeyObject.from>[0]);
    if(key.type!=="public"||key.asymmetricKeyType!=="ed25519")return null;
    return createHash("sha256").update(key.export({type:"spki",format:"der"})).digest("hex");
  } catch {return null;}
}
const stable=(v:Record<string,unknown>)=>JSON.stringify(Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0)));
// A source may renew an expired signed envelope for the SAME terminal after
// restart. Token ID and validity times are not terminal/receipt identity.
const terminalIdentity=(v:Record<string,unknown>)=>stable(Object.fromEntries(
  Object.entries(v).filter(([k])=>!["jti","iat","nbf","exp"].includes(k))));
type Pin={issuer:string;audience:string;key_id:string;public_key:KeyLike};
type Config={custody_id:string;source_system_identifier:string;authority_system_identifier:string;
  workspace_id:string;workload_id:string;protected_owner_subject:string;original:Pin;source:Pin;maximum_events:number;
  source_proof_vault?:C2SourceProofVault; journal_authenticator?:C2JournalAuthenticatorCandidate};
type Kind="ISSUED_HUMAN_ASSERTION"|"SIGNED_SOURCE_ENTER"|"SIGNED_SOURCE_UNKNOWN"|"SIGNED_SOURCE_TERMINAL";
type Event={operation_id:string;generation:string;kind:Kind;lease_id:string;body:Record<string,unknown>;
  proof_hash:string;predecessor_hash:string;event_hash:string};
type CustodyCensus={state:"OBSERVED_NOT_CUTOVER";observation_target:"ORIGINAL_SOURCE"|"RESTORED_CANDIDATE";
  observed_system_identifier:string;observed_database:string;custody_generation:string;custody_event_hash:string;
  originals:Array<{lease_id:string;state:"CORE_ORIGINAL_MISSING"|"CUSTODY_ORIGINAL_MISSING"|"CORE_BINDING_MISMATCH"|
    "CORE_ASSERTION_NOT_RECORDED"|
    "CUSTODY_TERMINAL_MISSING"|"CORE_TERMINAL_MISSING_OR_DIFFERENT"|"TERMINAL_TIED_ACK_UNVERIFIED"|
    "SOURCE_TERMINAL_NOT_RETAINED"}>};
const eventHash=(custody:string,e:Omit<Event,"event_hash">)=>sha(JSON.stringify(["portal.restore-original-custody.candidate.v1",
  custody,e.operation_id,e.generation,e.kind,e.lease_id,stable(e.body),e.proof_hash,e.predecessor_hash]));
const sealSourceProof=C2SourceProofVault.prototype.seal;
const openSourceProof=C2SourceProofVault.prototype.open;
const journalMac=C2JournalAuthenticatorCandidate.prototype.mac;
const verifyJournalMac=C2JournalAuthenticatorCandidate.prototype.verify;
const journalKeyId=C2JournalAuthenticatorCandidate.prototype.keyId;
const journalKeyCommitment=C2JournalAuthenticatorCandidate.prototype.keyCommitment;
/** Reserve space for all remaining original outcomes before a bearer can be
 * released. An unentered UNKNOWN cannot subsequently ENTER; a terminal ends
 * the obligation. This is bounded capacity, not an ACK/source census. */
function reservedOutcomeSlots(events:Event[]):number {
  const leases=new Map<string,Set<Kind>>();
  for(const event of events) {const kinds=leases.get(event.lease_id)??new Set<Kind>();kinds.add(event.kind);leases.set(event.lease_id,kinds);}
  let slots=0;
  for(const kinds of leases.values()) if(kinds.has("ISSUED_HUMAN_ASSERTION")&&!kinds.has("SIGNED_SOURCE_TERMINAL")) {
    slots+=kinds.has("SIGNED_SOURCE_UNKNOWN")?1:kinds.has("SIGNED_SOURCE_ENTER")?2:3;
  }
  return slots;
}

function custodyBindingDigest(c:Config):string {return accessDigest({domain:c.journal_authenticator?
  "portal.c2-independent-custody-binding.v2":"portal.c2-independent-custody-binding.v1",
  custody_id:c.custody_id,source_system_identifier:c.source_system_identifier,
  authority_system_identifier:c.authority_system_identifier,workspace_id:c.workspace_id,
  workload_id:c.workload_id,protected_owner_subject:c.protected_owner_subject,
  original:{issuer:c.original.issuer,audience:c.original.audience,key_id:c.original.key_id},
  source:{issuer:c.source.issuer,audience:c.source.audience,key_id:c.source.key_id},
  ...(c.journal_authenticator?{journal_authentication:{key_id:journalKeyId.call(c.journal_authenticator),
    key_commitment:journalKeyCommitment.call(c.journal_authenticator)}}:{})});}

export class RestoreIndependentCustodyCandidate {
  readonly #c:Config;
  readonly #source:Pool;
  readonly #authority:Pool;
  readonly #vault?:C2SourceProofVault;
  readonly #journalAuth?:C2JournalAuthenticatorCandidate;
  constructor(source:Pool,authority:Pool,c:Config) {
    if (!source||!authority||source===authority||!c||!uuid.test(c.custody_id)||
      !/^[0-9]{1,20}$/.test(c.source_system_identifier)||!/^[0-9]{1,20}$/.test(c.authority_system_identifier)||
      c.source_system_identifier===c.authority_system_identifier||!id.safeParse(c.workspace_id).success||!id.safeParse(c.workload_id).success||!id.safeParse(c.protected_owner_subject).success||
      !Number.isSafeInteger(c.maximum_events)||c.maximum_events<1||c.maximum_events>10000||
      [c.original,c.source].some(p=>!p||!id.safeParse(p.issuer).success||!id.safeParse(p.audience).success||!id.safeParse(p.key_id).success||!p.public_key)||
      [source,authority].some(p=>!p.options||[p.options.connectionTimeoutMillis,p.options.query_timeout].some(n=>!Number.isSafeInteger(n)||Number(n)<1||Number(n)>10000))||
      (c.source_proof_vault!==undefined&&Object.getPrototypeOf(c.source_proof_vault)!==C2SourceProofVault.prototype)||
      (c.journal_authenticator!==undefined&&Object.getPrototypeOf(c.journal_authenticator)!==C2JournalAuthenticatorCandidate.prototype))
      throw new Error("RESTORE_CUSTODY_CONFIG_INVALID");
    this.#source=source;
    this.#authority=authority;
    this.#vault=c.source_proof_vault;
    this.#journalAuth=c.journal_authenticator;
    this.#c=Object.freeze({...c,original:Object.freeze({...c.original}),source:Object.freeze({...c.source})});
  }
  /** Composition must use exactly the Core pool whose original is checked. */
  usesSourcePool(pool:Pool):boolean { return this.#source===pool; }
  hasSourceProofVault():boolean { return this.#vault!==undefined; }
  /** Stable non-secret identity, deliberately excludes adjustable capacity. */
  bindingDigest():string {return custodyBindingDigest(this.#c);}
  /** This flag reports candidate configuration, not independent key custody,
   * anti-rollback, a qualified writer, or permission to restore. */
  hasAuthenticatedJournal():boolean {return this.#journalAuth!==undefined;}
  async #checkJournalAuthentication(db:PoolClient,events:Event[]):Promise<void> {
    if(!this.#journalAuth)return;
    const guard=await db.query(`SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t
      WHERE t.tgrelid=to_regclass('portal_restore_original_custody.event_authentication')
      AND t.tgname='event_authentication_immutable' AND t.tgenabled='O' AND NOT t.tgisinternal
      AND t.tgtype=58 AND t.tgqual IS NULL
      AND t.tgfoid=to_regprocedure('portal_restore_original_custody.immutable_event_authentication()')
      AND ${guardFunction("$1","$2")}) AS guarded`,["BEGIN RAISE EXCEPTION 'RESTORE_CUSTODY_EVENT_AUTH_IMMUTABLE'; END"," \t\n\r"]);
    if(guard.rows.length!==1||guard.rows[0]?.guarded!==true)throw new Error("RESTORE_CUSTODY_EVENT_AUTH_STORE_NOT_READY");
    const rows=await db.query<{operation_id:string;key_id:string;event_mac:string}>(`SELECT operation_id::text,key_id,event_mac
      FROM portal_restore_original_custody.event_authentication WHERE custody_id=$1 LIMIT $2`,[this.#c.custody_id,this.#c.maximum_events+1]);
    if(rows.rows.length!==events.length)throw new Error("RESTORE_CUSTODY_EVENT_AUTH_INVALID");
    const byOperation=new Map(rows.rows.map(row=>[row.operation_id,row]));
    if(byOperation.size!==events.length)throw new Error("RESTORE_CUSTODY_EVENT_AUTH_INVALID");
    for(const e of events) {
      const row=byOperation.get(e.operation_id);
      if(!row)throw new Error("RESTORE_CUSTODY_EVENT_AUTH_INVALID");
      verifyJournalMac.call(this.#journalAuth,{custody_id:this.#c.custody_id,source_system_identifier:this.#c.source_system_identifier,
        authority_system_identifier:this.#c.authority_system_identifier,operation_id:e.operation_id,generation:e.generation,event_hash:e.event_hash},
      row.key_id,row.event_mac);
    }
  }
  /** Configuration match only. Key provenance and cluster independence are
   * still checked at use/commissioning; this does not grant authority. */
  matchesSelection(s:{workspace_id:string;workload_id:string;owner:string;
    original:{issuer:string;audience:string;key_id:string;spki_sha256:string};
    source:{issuer:string;audience:string;key_id:string;spki_sha256:string}}):boolean {
    return !!s&&this.#c.workspace_id===s.workspace_id&&this.#c.workload_id===s.workload_id&&
      this.#c.protected_owner_subject===s.owner&&!!s.original&&!!s.source&&
      this.#c.original.issuer===s.original.issuer&&this.#c.original.audience===s.original.audience&&this.#c.original.key_id===s.original.key_id&&
      hex.test(s.original.spki_sha256)&&publicSpkiSha256(this.#c.original.public_key)===s.original.spki_sha256&&
      this.#c.source.issuer===s.source.issuer&&this.#c.source.audience===s.source.audience&&this.#c.source.key_id===s.source.key_id&&
      hex.test(s.source.spki_sha256)&&publicSpkiSha256(this.#c.source.public_key)===s.source.spki_sha256;
  }
  /** Diagnostic read of the independent chain without opening the source DB.
   * A valid chain is not an authenticated source census, source ACK, fence,
   * immutable external checkpoint, or permission to restore/cut over. */
  async inventory():Promise<{state:"INVENTORY_NOT_CUTOVER";generation:string;event_hash:string;events:Event[]}> {
    const db=await this.#authority.connect(); let discard=false;
    try {
      await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await db.query("SET LOCAL statement_timeout='3000ms'");
      const cluster=await db.query("SELECT system_identifier::text AS id FROM pg_control_system()");
      if(cluster.rows.length!==1||cluster.rows[0].id!==this.#c.authority_system_identifier)throw new Error("RESTORE_CUSTODY_AUTHORITY_MISMATCH");
      const head=(await db.query("SELECT source_system_identifier,authority_system_identifier,generation::text,event_hash FROM portal_restore_original_custody.head WHERE custody_id=$1",[this.#c.custody_id])).rows;
      if(head.length!==1||head[0].source_system_identifier!==this.#c.source_system_identifier||head[0].authority_system_identifier!==this.#c.authority_system_identifier||
        !decimal.test(head[0].generation)||!hex.test(head[0].event_hash)||BigInt(head[0].generation)>BigInt(this.#c.maximum_events))throw new Error("RESTORE_CUSTODY_HEAD_INVALID");
      const events=(await db.query<Event>(`SELECT operation_id::text,generation::text,kind,lease_id,body,proof_hash,predecessor_hash,event_hash
        FROM portal_restore_original_custody.events e WHERE e.custody_id=$1 ORDER BY e.generation LIMIT $2`,[this.#c.custody_id,this.#c.maximum_events+1])).rows;
      if(BigInt(events.length)!==BigInt(head[0].generation))throw new Error("RESTORE_CUSTODY_HISTORY_INVALID");
      let prev="0".repeat(64);
      for(let i=0;i<events.length;i++) {const e=events[i];
        if(e.generation!==String(i+1)||e.predecessor_hash!==prev||!hex.test(e.proof_hash)||!hex.test(e.event_hash)||
          e.event_hash!==eventHash(this.#c.custody_id,e))throw new Error("RESTORE_CUSTODY_HISTORY_INVALID");prev=e.event_hash;}
      if(prev!==head[0].event_hash)throw new Error("RESTORE_CUSTODY_HISTORY_INVALID");
      await this.#checkJournalAuthentication(db,events);
      await db.query("COMMIT");
      return {state:"INVENTORY_NOT_CUTOVER",generation:head[0].generation,event_hash:head[0].event_hash,events};
    } catch(error) {try {await db.query("ROLLBACK");}catch {discard=true;}throw error;}
    finally {db.release(discard);}
  }
  /** Authenticate a retained source proof for an existing chain event, without
   * returning the proof to a caller. This is an offline integrity check only:
   * it is not source readback, an ACK census, a fencing barrier, or cutover. */
  async verifyRetainedSourceProof(operationId:string):Promise<{state:"VERIFIED_NOT_CUTOVER";generation:string;event_hash:string;
    lease_id:string;attempt_id:string;phase:"ENTER"|"UNKNOWN"|"COMMITTED"|"ROLLED_BACK";terminal_receipt_digest:string|null;
    source_trust_digest:string}> {
    if(!this.#vault||!uuid.test(operationId))throw new Error("RESTORE_CUSTODY_RETAINED_PROOF_INVALID");
    const snapshot=await this.inventory();
    const event=snapshot.events.find(e=>e.operation_id===operationId);
    if(!event||event.kind==="ISSUED_HUMAN_ASSERTION")throw new Error("RESTORE_CUSTODY_RETAINED_PROOF_INVALID");
    const db=await this.#authority.connect();let discard=false;let proofBytes:Buffer|undefined;
    try {
      await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await db.query("SET LOCAL statement_timeout='3000ms'");
      const cluster=await db.query("SELECT system_identifier::text AS id FROM pg_control_system()");
      if(cluster.rows.length!==1||cluster.rows[0].id!==this.#c.authority_system_identifier)throw new Error();
      const result=await db.query(`SELECT p.envelope FROM portal_restore_original_custody.source_proofs p
        JOIN portal_restore_original_custody.events e USING(custody_id,operation_id)
        WHERE e.custody_id=$1 AND e.operation_id=$2 AND e.generation=$3 AND e.event_hash=$4`,
        [this.#c.custody_id,operationId,event.generation,event.event_hash]);
      if(result.rows.length!==1)throw new Error();
      proofBytes=openSourceProof.call(this.#vault,{custody_id:this.#c.custody_id,operation_id:operationId,
        generation:event.generation,kind:event.kind,lease_id:event.lease_id,proof_hash:event.proof_hash},result.rows[0].envelope);
      const proof=proofBytes.toString("utf8"), untrusted=decodeJwt(proof);
      if(!num.safeParse(untrusted.iat).success)throw new Error();
      // Verify at the signed issuance time, not at the current time: the
      // event was admitted while live, whereas this is a historical check.
      const verified=await jwtVerify(proof,this.#c.source.public_key,{algorithms:["EdDSA"],issuer:this.#c.source.issuer,
        audience:this.#c.source.audience,currentDate:new Date(Number(untrusted.iat)*1000)});
      if(verified.protectedHeader.kid!==this.#c.source.key_id||verified.protectedHeader.typ!=="JWT")throw new Error();
      const body=event.kind==="SIGNED_SOURCE_ENTER"?entered.parse(verified.payload):
        event.kind==="SIGNED_SOURCE_UNKNOWN"?unknown.parse(verified.payload):terminal.parse(verified.payload);
      if(body.nbf!==body.iat||body.exp<=body.iat||body.exp-body.iat>60||body.workspace_id!==this.#c.workspace_id||
        body.workload_id!==this.#c.workload_id||body.sub!==this.#c.workload_id||body.lease_id!==event.lease_id||
        stable({...body,lease_id:body.lease_id})!==stable(event.body))throw new Error();
      // Use the exact digest domain used by Core's original terminal row;
      // this permits an exact receipt comparison without disclosing the JWT.
      const receiptDigest=body.phase==="COMMITTED"||body.phase==="ROLLED_BACK"?accessDigest({lease_id:body.lease_id,
        attempt_id:body.attempt_id,phase:body.phase,source_receipt_id:body.source_receipt_id,
        source_receipt_digest:body.source_receipt_digest,workspace_id:body.workspace_id,environment:body.environment,
        workload_id:body.workload_id,request_digest:body.request_digest}):null;
      const jwk=await exportJWK(this.#c.source.public_key);
      if(jwk.kty!=="OKP"||jwk.crv!=="Ed25519"||typeof jwk.x!=="string"||jwk.d)throw new Error();
      const trust=accessDigest({domain:"portal.c2-reverse-source-trust.v1",issuer:this.#c.source.issuer,
        audience:this.#c.source.audience,key_id:this.#c.source.key_id,workload_id:this.#c.workload_id,
        public_key:{kty:jwk.kty,crv:jwk.crv,x:jwk.x}});
      await db.query("COMMIT");
      return {state:"VERIFIED_NOT_CUTOVER",generation:event.generation,event_hash:event.event_hash,
        lease_id:body.lease_id,attempt_id:body.attempt_id,phase:body.phase,terminal_receipt_digest:receiptDigest,
        source_trust_digest:trust};
    } catch {try {await db.query("ROLLBACK");}catch {discard=true;}
      throw new Error("RESTORE_CUSTODY_RETAINED_PROOF_INVALID");
    } finally {proofBytes?.fill(0);db.release(discard);}
  }
  /** Compare every retained original in a bounded custody chain with the
   * selected Core database, including originals missing from a restored copy,
   * and report Core leases bound to this custody but absent from its chain.
   * The custody head is checked again after all source reads; an advance is
   * a retry, never a complete census. This is diagnostic ONLY: a quiet chain
   * does not prove external source/recipient ACK completeness, independent
   * control of this store, old-holder fencing, or permission to cut over. */
  async compareRetainedToCore(maximumOriginals:number):Promise<CustodyCensus> {
    return this.#compareRetained(maximumOriginals,this.#source,this.#c.source_system_identifier,null,"ORIGINAL_SOURCE");
  }
  /** Observe a separately selected restore candidate, never use it to issue,
   * settle, assert independence, or authorize restore. The caller must pin the
   * observed PostgreSQL system identifier; a physical restore may legitimately
   * carry the original identifier. Database identity is not authority proof. */
  async compareRetainedToRestoredCore(maximumOriginals:number,target:Pool,expectedSystemIdentifier:string,expectedDatabase:string):Promise<CustodyCensus> {
    if(!target||target===this.#source||target===this.#authority||!target.options||
      [target.options.connectionTimeoutMillis,target.options.query_timeout].some(n=>!Number.isSafeInteger(n)||Number(n)<1||Number(n)>10000)||
      typeof expectedSystemIdentifier!=="string"||!/^[0-9]{1,20}$/.test(expectedSystemIdentifier)||
      !id.safeParse(expectedDatabase).success||Buffer.byteLength(expectedDatabase,"utf8")>63)
      throw new Error("RESTORE_CUSTODY_OBSERVATION_TARGET_INVALID");
    return this.#compareRetained(maximumOriginals,target,expectedSystemIdentifier,expectedDatabase,"RESTORED_CANDIDATE");
  }
  async #compareRetained(maximumOriginals:number,target:Pool,expectedSystemIdentifier:string,expectedDatabase:string|null,
    observationTarget:"ORIGINAL_SOURCE"|"RESTORED_CANDIDATE"):Promise<CustodyCensus> {
    if(!this.#vault||!Number.isSafeInteger(maximumOriginals)||maximumOriginals<1||maximumOriginals>100)
      throw new Error("RESTORE_CUSTODY_CENSUS_INPUT_INVALID");
    const snapshot=await this.inventory(),originals=snapshot.events.filter(e=>e.kind==="ISSUED_HUMAN_ASSERTION");
    if(originals.length>maximumOriginals)throw new Error("RESTORE_CUSTODY_CENSUS_LIMIT_EXCEEDED");
    const seen=new Set<string>();
    for(const event of originals) {
      const {lease_id:storedLease,human_assertion_digest:assertionDigest,...claims}=event.body;
      const body=original.safeParse(claims);
      if(storedLease!==event.lease_id||!body.success||body.data.jti!==event.lease_id||body.data.sub!==this.#c.protected_owner_subject||
        body.data.workspace_id!==this.#c.workspace_id||body.data.workload_id!==this.#c.workload_id||
        body.data.iss!==this.#c.original.issuer||body.data.aud!==this.#c.original.audience||seen.has(event.lease_id)||
        (assertionDigest!==undefined&&!dig.safeParse(assertionDigest).success))
        throw new Error("RESTORE_CUSTODY_CENSUS_HISTORY_INVALID");
      seen.add(event.lease_id);
    }
    // Authenticate each retained terminal against its original event and
    // pinned source key; verifyRetainedSourceProof never returns the bearer.
    const verified=new Map<string,Awaited<ReturnType<RestoreIndependentCustodyCandidate["verifyRetainedSourceProof"]>>>();
    const kinds=new Map<string,Set<Kind>>();
    for(const event of snapshot.events) {
      if(!seen.has(event.lease_id))throw new Error("RESTORE_CUSTODY_CENSUS_HISTORY_INVALID");
      const leaseKinds=kinds.get(event.lease_id)??new Set<Kind>();
      if(!["ISSUED_HUMAN_ASSERTION","SIGNED_SOURCE_ENTER","SIGNED_SOURCE_UNKNOWN","SIGNED_SOURCE_TERMINAL"].includes(event.kind)||
        leaseKinds.has(event.kind)||(event.kind!=="ISSUED_HUMAN_ASSERTION"&&!leaseKinds.has("ISSUED_HUMAN_ASSERTION")))
        throw new Error("RESTORE_CUSTODY_CENSUS_HISTORY_INVALID");
      leaseKinds.add(event.kind);kinds.set(event.lease_id,leaseKinds);
      if(event.kind==="SIGNED_SOURCE_TERMINAL") {
        if(verified.has(event.lease_id))throw new Error("RESTORE_CUSTODY_CENSUS_HISTORY_INVALID");
        const proof=await this.verifyRetainedSourceProof(event.operation_id);
        if(proof.event_hash!==event.event_hash||proof.generation!==event.generation||proof.lease_id!==event.lease_id)
          throw new Error("RESTORE_CUSTODY_CENSUS_HISTORY_INVALID");
        verified.set(event.lease_id,proof);
      }
    }
    const originalKey=await exportJWK(this.#c.original.public_key);
    if(originalKey.kty!=="OKP"||originalKey.crv!=="Ed25519"||typeof originalKey.x!=="string"||originalKey.d)
      throw new Error("RESTORE_CUSTODY_ORIGINAL_KEY_INVALID");
    const originalKeyDigest=accessDigest({domain:"portal.c2-human-signing-key.v1",issuer:this.#c.original.issuer,
      audience:this.#c.original.audience,key_id:this.#c.original.key_id,
      public_key:{kty:originalKey.kty,crv:originalKey.crv,x:originalKey.x}});
    const db=await target.connect();let discard=false;
    try {
      await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await db.query("SET LOCAL statement_timeout='3000ms'; SET LOCAL row_security=off");
      const cluster=await db.query("SELECT system_identifier::text AS id,current_database() AS database_name FROM pg_control_system()");
      if(cluster.rows.length!==1||cluster.rows[0].id!==expectedSystemIdentifier||
        (expectedDatabase!==null&&cluster.rows[0].database_name!==expectedDatabase))
        throw new Error("RESTORE_CUSTODY_SOURCE_MISMATCH");
      const rows=await db.query(`SELECT lease_id,human_issuer,human_signing_key_digest,human_assertion_digest,issued_at_ms::text,subject_id,session_id,session_revision::text,
        authority_revision::text,workspace_id,environment,workload_id,request_digest,expires_at_ms::text,
        c2_custody_binding_digest,source_trust_digest,phase,attempt_id,terminal_receipt_digest
        FROM elp210_candidate.leases WHERE lease_id=ANY($1::text[]) OR c2_custody_binding_digest=$2
        ORDER BY lease_id LIMIT $3`,[originals.map(e=>e.lease_id),custodyBindingDigest(this.#c),maximumOriginals+1]);
      if(rows.rows.length>maximumOriginals)throw new Error("RESTORE_CUSTODY_CENSUS_LIMIT_EXCEEDED");
      if(new Set(rows.rows.map(r=>r.lease_id)).size!==rows.rows.length)
        throw new Error("RESTORE_CUSTODY_CENSUS_SOURCE_INVALID");
      // An unentered source rollback is durably recorded as an event while
      // the lease is RETIRED; the lease deliberately has no attempt or receipt.
      // Read both event kinds in the SAME source snapshot and keep the query
      // bounded. Duplicate or contradictory history is never collapsed.
      const terminalHistory=await db.query<{lease_id:string;phase:string;attempt_id:string|null;terminal_receipt_digest:string|null}>(
        `SELECT lease_id,phase,attempt_id,terminal_receipt_digest FROM elp210_candidate.events
         WHERE lease_id=ANY($1::text[]) AND phase IN ('ENTERED','SOURCE_ROLLED_BACK_UNENTERED') LIMIT $2`,
        [originals.map(e=>e.lease_id),originals.length*2+1]);
      if(terminalHistory.rows.length>originals.length*2)throw new Error("RESTORE_CUSTODY_CENSUS_SOURCE_INVALID");
      const result:CustodyCensus["originals"]=originals.map(event=>{
        const {lease_id:_lease,human_assertion_digest:assertionDigest,...claims}=event.body;
        const body=original.parse(claims),row=rows.rows.find(r=>r.lease_id===event.lease_id),proof=verified.get(event.lease_id);
        const terminalEvent=snapshot.events.find(e=>e.lease_id===event.lease_id&&e.kind==="SIGNED_SOURCE_TERMINAL");
        const localHistory=terminalHistory.rows.filter(e=>e.lease_id===event.lease_id);
        const unentered=localHistory.filter(e=>e.phase==="SOURCE_ROLLED_BACK_UNENTERED");
        const exactUnentered=!!row&&!!proof&&row.phase==="RETIRED"&&row.attempt_id===null&&row.terminal_receipt_digest===null&&
          proof.phase==="ROLLED_BACK"&&unentered.length===1&&!localHistory.some(e=>e.phase==="ENTERED")&&
          unentered[0].attempt_id===proof.attempt_id&&unentered[0].terminal_receipt_digest===proof.terminal_receipt_digest;
        let state:"CORE_ORIGINAL_MISSING"|"CORE_BINDING_MISMATCH"|"CORE_ASSERTION_NOT_RECORDED"|"CUSTODY_TERMINAL_MISSING"|
          "CORE_TERMINAL_MISSING_OR_DIFFERENT"|"TERMINAL_TIED_ACK_UNVERIFIED"|"SOURCE_TERMINAL_NOT_RETAINED";
        if(!row) state="CORE_ORIGINAL_MISSING";
        else if(row.human_issuer!==body.iss||row.subject_id!==body.sub||row.session_id!==body.sid||
          row.session_revision!==String(body.session_revision)||row.authority_revision!==String(body.authority_revision)||
          row.workspace_id!==body.workspace_id||row.environment!==body.environment||row.workload_id!==body.workload_id||
          row.request_digest!==body.request_digest||row.issued_at_ms!==String(BigInt(body.iat)*1000n)||
          row.expires_at_ms!==String(BigInt(body.exp)*1000n)||row.human_signing_key_digest!==originalKeyDigest||
          (assertionDigest!==undefined&&row.human_assertion_digest!==assertionDigest)||
          row.c2_custody_binding_digest!==custodyBindingDigest(this.#c)) state="CORE_BINDING_MISMATCH";
        else if(assertionDigest===undefined) state="CORE_ASSERTION_NOT_RECORDED";
        else if(!proof) state=["COMMITTED","ROLLED_BACK"].includes(row.phase)||unentered.length>0?
          "CUSTODY_TERMINAL_MISSING":"SOURCE_TERMINAL_NOT_RETAINED";
        else if(!terminalEvent||terminalEvent.body.workspace_id!==body.workspace_id||terminalEvent.body.environment!==body.environment||
          terminalEvent.body.workload_id!==body.workload_id||terminalEvent.body.request_digest!==body.request_digest||
          (!exactUnentered&&(row.phase!==proof.phase||row.attempt_id!==proof.attempt_id||
            row.terminal_receipt_digest!==proof.terminal_receipt_digest))||row.source_trust_digest!==proof.source_trust_digest)
          state="CORE_TERMINAL_MISSING_OR_DIFFERENT";
        else state="TERMINAL_TIED_ACK_UNVERIFIED";
        return {lease_id:event.lease_id,state};
      });
      // A crash can leave a committed Core lease before its independent
      // original is appended. An empty custody chain is not evidence that no
      // original exists. Never synthesize its assertion or infer settlement.
      for(const row of rows.rows) if(!seen.has(row.lease_id)) {
        if(row.c2_custody_binding_digest!==custodyBindingDigest(this.#c)||typeof row.lease_id!=="string"||!id.safeParse(row.lease_id).success)
          throw new Error("RESTORE_CUSTODY_CENSUS_SOURCE_INVALID");
        result.push({lease_id:row.lease_id,state:"CUSTODY_ORIGINAL_MISSING"});
      }
      const end=await this.inventory();
      if(end.generation!==snapshot.generation||end.event_hash!==snapshot.event_hash)
        throw new Error("RESTORE_CUSTODY_CENSUS_CHANGED");
      await db.query("COMMIT");
      return {state:"OBSERVED_NOT_CUTOVER",observation_target:observationTarget,observed_system_identifier:expectedSystemIdentifier,
        observed_database:cluster.rows[0].database_name,
        custody_generation:snapshot.generation,custody_event_hash:snapshot.event_hash,originals:result};
    } catch(error) {try {await db.query("ROLLBACK");}catch {discard=true;}throw error;}
    finally {db.release(discard);}
  }
  /** Advisory early refusal only: another issuer may consume capacity after
   * this read. append() still serializes and enforces the authoritative check. */
  async preflightOriginal():Promise<void> {
    if(!this.#vault)throw new Error("RESTORE_CUSTODY_SOURCE_PROOF_VAULT_REQUIRED");
    const snapshot=await this.inventory();
    if(snapshot.events.length+reservedOutcomeSlots(snapshot.events)+4>this.#c.maximum_events)
      throw new Error("RESTORE_CUSTODY_CAPACITY_RESERVATION_REQUIRED");
    // A configured in-memory key is insufficient if the authority schema is
    // old, unwritable, or its append-only guard was disabled. Check before
    // issuing an original; the later insert remains the authoritative test.
    const db=await this.#authority.connect();
    try {
      const result=await db.query(`SELECT to_regclass('portal_restore_original_custody.source_proofs') IS NOT NULL AS present,
        CASE WHEN to_regprocedure('portal_restore_original_custody.lock_guard_catalog_for_write()') IS NULL THEN false
          ELSE has_function_privilege(current_user,'portal_restore_original_custody.lock_guard_catalog_for_write()','EXECUTE') END AS catalog_lock_allowed,
        CASE WHEN to_regclass('portal_restore_original_custody.source_proofs') IS NULL THEN false
          ELSE has_table_privilege(current_user,'portal_restore_original_custody.source_proofs','SELECT')
            AND has_table_privilege(current_user,'portal_restore_original_custody.source_proofs','INSERT') END AS allowed,
        CASE WHEN to_regclass('portal_restore_original_custody.head') IS NULL
            OR to_regclass('portal_restore_original_custody.events') IS NULL THEN false
          ELSE has_table_privilege(current_user,'portal_restore_original_custody.head','SELECT')
            AND has_column_privilege(current_user,'portal_restore_original_custody.head','generation','UPDATE')
            AND has_column_privilege(current_user,'portal_restore_original_custody.head','event_hash','UPDATE')
            AND has_table_privilege(current_user,'portal_restore_original_custody.events','SELECT')
            AND has_table_privilege(current_user,'portal_restore_original_custody.events','INSERT') END AS writer_allowed,
        EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t WHERE t.tgrelid=to_regclass('portal_restore_original_custody.source_proofs')
          AND t.tgname='source_proof_immutable' AND t.tgenabled='O' AND NOT t.tgisinternal
          AND t.tgtype=58 AND t.tgqual IS NULL
          AND t.tgfoid=to_regprocedure('portal_restore_original_custody.immutable_source_proof()')
          AND ${guardFunction("$2")}) AS guarded,
        EXISTS(SELECT 1 FROM pg_catalog.pg_trigger t WHERE t.tgrelid=to_regclass('portal_restore_original_custody.events')
          AND t.tgname='events_immutable' AND t.tgenabled='O' AND NOT t.tgisinternal
          AND t.tgtype=58 AND t.tgqual IS NULL
          AND t.tgfoid=to_regprocedure('portal_restore_original_custody.immutable_event()')
          AND ${guardFunction("$1")}) AS events_guarded`,guardBodies);
      if(result.rows.length!==1||result.rows[0]?.present!==true||result.rows[0]?.catalog_lock_allowed!==true||result.rows[0]?.allowed!==true||result.rows[0]?.writer_allowed!==true||result.rows[0]?.guarded!==true||
          result.rows[0]?.events_guarded!==true)
        throw new Error("RESTORE_CUSTODY_SOURCE_PROOF_STORE_NOT_READY");
      if(this.#journalAuth) {
        const access=await db.query(`SELECT CASE WHEN to_regclass('portal_restore_original_custody.event_authentication') IS NULL THEN false
          ELSE has_table_privilege(current_user,'portal_restore_original_custody.event_authentication','SELECT')
            AND has_table_privilege(current_user,'portal_restore_original_custody.event_authentication','INSERT') END AS allowed`);
        if(access.rows.length!==1||access.rows[0]?.allowed!==true)throw new Error("RESTORE_CUSTODY_EVENT_AUTH_STORE_NOT_READY");
      }
    } finally {db.release();}
  }
  /** Same operation ID is retained after an ambiguous commit. Exact proof may
   * replay after expiry; a freshly signed terminal envelope may differ only
   * in token ID/validity and must preserve every original/receipt field. */
  async append(kind:Kind,operationId:string,expected:string,proof:string):Promise<{state:"STORED_NOT_CUTOVER";generation:string;replayed:boolean}> {
    if (!uuid.test(operationId)||!decimal.test(expected)||BigInt(expected)>=9223372036854775807n||
      !["ISSUED_HUMAN_ASSERTION","SIGNED_SOURCE_ENTER","SIGNED_SOURCE_UNKNOWN","SIGNED_SOURCE_TERMINAL"].includes(kind)||typeof proof!=="string"||Buffer.byteLength(proof)>8192)
      throw new Error("RESTORE_CUSTODY_INPUT_INVALID");
    const pin=kind==="ISSUED_HUMAN_ASSERTION"?this.#c.original:this.#c.source;
    let body:z.infer<typeof original>|z.infer<typeof terminal>|z.infer<typeof unknown>|z.infer<typeof entered>;
    try {
      const untrusted=decodeJwt(proof);
      if(!num.safeParse(untrusted.iat).success)throw new Error();
      const verified=await jwtVerify(proof,pin.public_key,{algorithms:["EdDSA"],issuer:pin.issuer,audience:pin.audience,
        currentDate:new Date(Number(untrusted.iat)*1000)});
      if(verified.protectedHeader.kid!==pin.key_id||verified.protectedHeader.typ!=="JWT")throw new Error();
      body=kind==="ISSUED_HUMAN_ASSERTION"?original.parse(verified.payload):
        kind==="SIGNED_SOURCE_ENTER"?entered.parse(verified.payload):
        kind==="SIGNED_SOURCE_UNKNOWN"?unknown.parse(verified.payload):terminal.parse(verified.payload);
      if(body.nbf!==body.iat||body.exp<=body.iat||body.exp-body.iat>60||body.workspace_id!==this.#c.workspace_id||
        body.workload_id!==this.#c.workload_id||(kind!=="ISSUED_HUMAN_ASSERTION"&&body.sub!==this.#c.workload_id)||
        (kind==="ISSUED_HUMAN_ASSERTION"&&body.sub!==this.#c.protected_owner_subject))throw new Error();
    } catch {throw new Error("RESTORE_CUSTODY_PROOF_INVALID");}
    const leaseId=kind==="ISSUED_HUMAN_ASSERTION"?body.jti:(body as z.infer<typeof terminal>|z.infer<typeof unknown>|z.infer<typeof entered>).lease_id;
    const proofHash=sha(proof), payload={...body,lease_id:leaseId,
      ...(kind==="ISSUED_HUMAN_ASSERTION"?{human_assertion_digest:accessDigest(proof)}:{})} as unknown as Record<string,unknown>;
    const sc=await this.#source.connect();
    let sourceCommitted=false,sourceDiscard=false;
    try {
      // Keep the source authority/lease lock until the independent commit.
      // Losing either connection before confirmation is a failure, not
      // permission for a caller to release the assertion to transport.
      await sc.query("BEGIN");
      await sc.query("SET LOCAL lock_timeout='1000ms'; SET LOCAL statement_timeout='3000ms'");
      const r=await sc.query("SELECT system_identifier::text AS id FROM pg_control_system()");
      if(r.rows.length!==1||r.rows[0].id!==this.#c.source_system_identifier)throw new Error("RESTORE_CUSTODY_SOURCE_MISMATCH");
      let originalPhase:string|undefined,sourceRevision:string|undefined,sourceDrain:string|null|undefined;
      if(kind==="ISSUED_HUMAN_ASSERTION") {
        const authority=(await sc.query("SELECT revision::text,drain_id FROM elp210_candidate.authority WHERE singleton FOR SHARE")).rows;
        if(authority.length!==1||!decimal.test(authority[0].revision))throw new Error("RESTORE_CUSTODY_SOURCE_AUTHORITY_INVALID");
        sourceRevision=authority[0].revision; sourceDrain=authority[0].drain_id;
        const human=body as z.infer<typeof original>,jwk=await exportJWK(this.#c.original.public_key);
        if(jwk.kty!=="OKP"||jwk.crv!=="Ed25519"||typeof jwk.x!=="string"||jwk.d)throw new Error("RESTORE_CUSTODY_SOURCE_ORIGINAL_MISMATCH");
        const keyDigest=accessDigest({domain:"portal.c2-human-signing-key.v1",issuer:pin.issuer,audience:pin.audience,
          key_id:pin.key_id,public_key:{kty:jwk.kty,crv:jwk.crv,x:jwk.x}});
        const rows=(await sc.query(`SELECT subject_id,session_id,session_revision::text,authority_revision::text,workspace_id,
          environment,workload_id,request_digest,human_issuer,human_signing_key_digest,human_assertion_digest,c2_custody_binding_digest,issued_at_ms::text,expires_at_ms::text,phase
          FROM elp210_candidate.leases WHERE lease_id=$1 FOR SHARE`,[leaseId])).rows;
        const row=rows[0];
        if(rows.length!==1||row.subject_id!==human.sub||row.session_id!==human.sid||row.session_revision!==String(human.session_revision)||
          row.authority_revision!==String(human.authority_revision)||row.workspace_id!==human.workspace_id||row.environment!==human.environment||
          row.workload_id!==human.workload_id||row.request_digest!==human.request_digest||row.human_issuer!==human.iss||
          row.human_signing_key_digest!==keyDigest||row.human_assertion_digest!==accessDigest(proof)||row.c2_custody_binding_digest!==custodyBindingDigest(this.#c)||
          row.issued_at_ms!==String(human.iat*1000)||row.expires_at_ms!==String(human.exp*1000))
          throw new Error("RESTORE_CUSTODY_SOURCE_ORIGINAL_MISMATCH");
        originalPhase=row.phase;
      }
      // A valid source signature by itself does not prove that a terminal is
      // for the attempt Core actually admitted. Hold the original row until
      // independent custody commits; do not require current human permission
      // here because an already-entered attempt must settle after revocation.
      const terminalRow=kind!=="ISSUED_HUMAN_ASSERTION"?(await sc.query(`SELECT workspace_id,environment,workload_id,
        request_digest,phase,attempt_id,terminal_receipt_digest,source_trust_digest,c2_custody_binding_digest
        FROM elp210_candidate.leases WHERE lease_id=$1 FOR SHARE`,[leaseId])).rows:undefined;
      const checkTerminalOriginal=async()=>{
        const t=body as z.infer<typeof terminal>|z.infer<typeof unknown>|z.infer<typeof entered>,row=terminalRow?.[0];
        const jwk=await exportJWK(this.#c.source.public_key);
        if(jwk.kty!=="OKP"||jwk.crv!=="Ed25519"||typeof jwk.x!=="string"||jwk.d)
          throw new Error("RESTORE_CUSTODY_TERMINAL_ORIGINAL_MISMATCH");
        const trust=accessDigest({domain:"portal.c2-reverse-source-trust.v1",issuer:this.#c.source.issuer,
          audience:this.#c.source.audience,key_id:this.#c.source.key_id,workload_id:this.#c.workload_id,
          public_key:{kty:jwk.kty,crv:jwk.crv,x:jwk.x}});
        if(terminalRow?.length!==1||!row||row.c2_custody_binding_digest!==custodyBindingDigest(this.#c)||row.source_trust_digest!==trust||row.workspace_id!==t.workspace_id||
          row.environment!==t.environment||row.workload_id!==t.workload_id||row.request_digest!==t.request_digest||
          (row.attempt_id!==null&&row.attempt_id!==t.attempt_id))
          throw new Error("RESTORE_CUSTODY_TERMINAL_ORIGINAL_MISMATCH");
        const digest=accessDigest({lease_id:t.lease_id,attempt_id:t.attempt_id,phase:t.phase,
          source_receipt_id:t.source_receipt_id,source_receipt_digest:t.source_receipt_digest,
          workspace_id:t.workspace_id,environment:t.environment,workload_id:t.workload_id,request_digest:t.request_digest});
        if(t.phase==="ENTER") {
          if(row.phase!=="ENTERED"||row.attempt_id!==t.attempt_id)
            throw new Error("RESTORE_CUSTODY_TERMINAL_ORIGINAL_MISMATCH");
        } else if(t.phase==="UNKNOWN") {
          if(!["ISSUED","RETIRED","ENTERED","UNKNOWN"].includes(row.phase))
            throw new Error("RESTORE_CUSTODY_TERMINAL_ORIGINAL_MISMATCH");
          if(["ISSUED","RETIRED"].includes(row.phase)) {
            const prior=await sc.query("SELECT 1 FROM elp210_candidate.events WHERE lease_id=$1 AND phase='SOURCE_ROLLED_BACK_UNENTERED' LIMIT 1",[leaseId]);
            if(prior.rowCount!==0)throw new Error("RESTORE_CUSTODY_TERMINAL_ORIGINAL_MISMATCH");
          } else if(row.attempt_id!==t.attempt_id)throw new Error("RESTORE_CUSTODY_TERMINAL_ORIGINAL_MISMATCH");
        } else if(["ISSUED","RETIRED"].includes(row.phase)) {
          if(t.phase!=="ROLLED_BACK")throw new Error("RESTORE_CUSTODY_TERMINAL_ORIGINAL_MISMATCH");
          const prior=(await sc.query(`SELECT attempt_id,terminal_receipt_digest FROM elp210_candidate.events
            WHERE lease_id=$1 AND phase='SOURCE_ROLLED_BACK_UNENTERED' LIMIT 2`,[leaseId])).rows;
          if(prior.length>1||(prior.length===1&&(prior[0].attempt_id!==t.attempt_id||prior[0].terminal_receipt_digest!==digest)))
            throw new Error("RESTORE_CUSTODY_TERMINAL_ORIGINAL_MISMATCH");
        } else if(["ENTERED","UNKNOWN","COMMITTED","ROLLED_BACK"].includes(row.phase)) {
          if(row.attempt_id!==t.attempt_id||(["COMMITTED","ROLLED_BACK"].includes(row.phase)&&
            (row.phase!==t.phase||row.terminal_receipt_digest!==digest)))
            throw new Error("RESTORE_CUSTODY_TERMINAL_ORIGINAL_MISMATCH");
          if(row.phase==="UNKNOWN"&&t.phase==="COMMITTED") {
            const entered=await sc.query("SELECT 1 FROM elp210_candidate.events WHERE lease_id=$1 AND phase='ENTERED' AND attempt_id=$2 LIMIT 1",[leaseId,t.attempt_id]);
            if(entered.rowCount!==1)throw new Error("RESTORE_CUSTODY_TERMINAL_ORIGINAL_MISMATCH");
          }
        } else throw new Error("RESTORE_CUSTODY_TERMINAL_ORIGINAL_MISMATCH");
      };
    const db=await this.#authority.connect(); let discard=false;
    try {
      await db.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      await db.query("SET LOCAL lock_timeout='1000ms'; SET LOCAL statement_timeout='3000ms'; SET LOCAL idle_in_transaction_session_timeout='5000ms'");
      const cluster=await db.query("SELECT system_identifier::text AS id FROM pg_control_system()");
      if(cluster.rows.length!==1||cluster.rows[0].id!==this.#c.authority_system_identifier)throw new Error("RESTORE_CUSTODY_AUTHORITY_MISMATCH");
      // A table lock does not prevent CREATE OR REPLACE FUNCTION from changing
      // a guard without changing its OID. Never trust the helper's return alone:
      // a stale or replaced no-op helper must fail before guard observation.
      await db.query("SELECT portal_restore_original_custody.lock_guard_catalog_for_write()");
      const catalogLock=await db.query<{held:boolean}>(`SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_locks
        WHERE pid=pg_backend_pid() AND granted AND mode='ShareLock' AND relation=to_regclass('pg_catalog.pg_proc')) AS held`);
      if(catalogLock.rows.length!==1||catalogLock.rows[0]?.held!==true)throw new Error("RESTORE_CUSTODY_JOURNAL_UNSAFE");
      // Lock before observing guards: they must stay enabled through the
      // independent append and its commit, including same-original replay.
      await db.query("LOCK TABLE portal_restore_original_custody.events, portal_restore_original_custody.source_proofs IN ROW EXCLUSIVE MODE");
      if(this.#journalAuth)await db.query("LOCK TABLE portal_restore_original_custody.event_authentication IN ROW EXCLUSIVE MODE");
      const guards=await db.query<{guarded:boolean}>(`SELECT NOT EXISTS (SELECT 1 FROM (VALUES
        ('events','events_immutable','portal_restore_original_custody.immutable_event()',$1::text),
        ('source_proofs','source_proof_immutable','portal_restore_original_custody.immutable_source_proof()',$2::text)
        ) AS expected(table_name,trigger_name,function_name,function_body) WHERE NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_trigger t WHERE t.tgrelid=to_regclass('portal_restore_original_custody.'||expected.table_name)
        AND t.tgname=expected.trigger_name AND t.tgenabled='O' AND NOT t.tgisinternal
        AND t.tgtype=58 AND t.tgqual IS NULL AND t.tgfoid=to_regprocedure(expected.function_name)
        AND ${guardFunction("expected.function_body")})) AS guarded`,guardBodies);
      if(guards.rows.length!==1||guards.rows[0]?.guarded!==true)throw new Error("RESTORE_CUSTODY_JOURNAL_UNSAFE");
      const head=(await db.query("SELECT source_system_identifier,authority_system_identifier,generation::text,event_hash FROM portal_restore_original_custody.head WHERE custody_id=$1 FOR UPDATE",[this.#c.custody_id])).rows;
      if(head.length!==1||head[0].source_system_identifier!==this.#c.source_system_identifier||head[0].authority_system_identifier!==this.#c.authority_system_identifier||
        !decimal.test(head[0].generation)||!hex.test(head[0].event_hash)||BigInt(head[0].generation)>BigInt(this.#c.maximum_events))throw new Error("RESTORE_CUSTODY_HEAD_INVALID");
      const events=(await db.query<Event>(`SELECT operation_id::text,generation::text,kind,lease_id,body,proof_hash,predecessor_hash,event_hash
        FROM portal_restore_original_custody.events e WHERE e.custody_id=$1 ORDER BY e.generation LIMIT $2`,[this.#c.custody_id,this.#c.maximum_events+1])).rows;
      if(BigInt(events.length)!==BigInt(head[0].generation))throw new Error("RESTORE_CUSTODY_HISTORY_INVALID");
      let prev="0".repeat(64);
      for(let i=0;i<events.length;i++) {const e=events[i];
        if(e.generation!==String(i+1)||e.predecessor_hash!==prev||!hex.test(e.proof_hash)||!hex.test(e.event_hash)||
          e.event_hash!==eventHash(this.#c.custody_id,e))throw new Error("RESTORE_CUSTODY_HISTORY_INVALID"); prev=e.event_hash;}
      if(prev!==head[0].event_hash)throw new Error("RESTORE_CUSTODY_HISTORY_INVALID");
      await this.#checkJournalAuthentication(db,events);
      const prior=events.find(e=>e.operation_id===operationId);
      if(prior) {
        // Prior source-only records did not retain the canonical assertion
        // digest. Their exact proof can still replay, but census must report
        // it as not recorded instead of fabricating the missing commitment.
        const legacyPayload={...payload};delete legacyPayload.human_assertion_digest;
        const exact=prior.proof_hash===proofHash&&(stable(prior.body)===stable(payload)||
          (kind==="ISSUED_HUMAN_ASSERTION"&&stable(prior.body)===stable(legacyPayload)));
        const now=Math.floor(Date.now()/1000);
        const renewed=kind!=="ISSUED_HUMAN_ASSERTION"&&prior.kind===kind&&
          terminalIdentity(prior.body)===terminalIdentity(payload)&&body.iat<=now&&body.exp>now;
        if(prior.generation!==(BigInt(expected)+1n).toString()||prior.kind!==kind||(!exact&&!renewed))
          throw new Error("RESTORE_CUSTODY_OPERATION_CONFLICT");
        if(kind!=="ISSUED_HUMAN_ASSERTION"&&this.#vault) {
          const saved=await db.query("SELECT envelope FROM portal_restore_original_custody.source_proofs WHERE custody_id=$1 AND operation_id=$2",
            [this.#c.custody_id,operationId]);
          if(saved.rowCount!==1)throw new Error("RESTORE_CUSTODY_SOURCE_PROOF_MISSING");
          const binding:SourceProofBinding={custody_id:this.#c.custody_id,operation_id:prior.operation_id,
            generation:prior.generation,kind:kind as SourceProofBinding["kind"],lease_id:prior.lease_id,proof_hash:prior.proof_hash};
          const plaintext=openSourceProof.call(this.#vault,binding,saved.rows[0].envelope);
          plaintext.fill(0);
        }
        if(kind!=="ISSUED_HUMAN_ASSERTION")await checkTerminalOriginal();
        await db.query("COMMIT"); await sc.query("COMMIT"); sourceCommitted=true;
        return {state:"STORED_NOT_CUTOVER",generation:prior.generation,replayed:true};
      }
      const now=Math.floor(Date.now()/1000);
      if(body.iat>now||body.exp<=now)throw new Error("RESTORE_CUSTODY_PROOF_EXPIRED");
      if(kind==="ISSUED_HUMAN_ASSERTION"&&originalPhase!=="ISSUED")throw new Error("RESTORE_CUSTODY_SOURCE_ORIGINAL_NOT_ISSUED");
      if(kind==="ISSUED_HUMAN_ASSERTION"&&(sourceDrain!==null||sourceRevision!==String((body as z.infer<typeof original>).authority_revision)))
        throw new Error("RESTORE_CUSTODY_SOURCE_AUTHORITY_CHANGED");
      if(head[0].generation!==expected)throw new Error("RESTORE_CUSTODY_GENERATION_CONFLICT");
      if(events.length>=this.#c.maximum_events)throw new Error("RESTORE_CUSTODY_CAPACITY_EXHAUSTED");
      if(kind==="ISSUED_HUMAN_ASSERTION"&&events.length+reservedOutcomeSlots(events)+4>this.#c.maximum_events)
        throw new Error("RESTORE_CUSTODY_CAPACITY_RESERVATION_REQUIRED");
      const previous=events.find(e=>e.lease_id===leaseId&&e.kind==="ISSUED_HUMAN_ASSERTION");
      if(kind!=="ISSUED_HUMAN_ASSERTION"&&(!previous||["workspace_id","environment","workload_id","request_digest"].some(k=>previous.body[k]!==payload[k])))
        throw new Error("RESTORE_CUSTODY_ORIGINAL_MISMATCH");
      if(kind!=="ISSUED_HUMAN_ASSERTION")await checkTerminalOriginal();
      if(events.some(e=>e.lease_id===leaseId&&e.kind===kind))throw new Error("RESTORE_CUSTODY_ORIGINAL_CONFLICT");
      const e:Omit<Event,"event_hash">={operation_id:operationId,generation:(BigInt(expected)+1n).toString(),kind,
        lease_id:leaseId,body:payload,proof_hash:proofHash,predecessor_hash:prev};
      const hash=eventHash(this.#c.custody_id,e);
      await db.query(`INSERT INTO portal_restore_original_custody.events(custody_id,operation_id,generation,kind,lease_id,body,proof_hash,predecessor_hash,event_hash)
        VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)`,[this.#c.custody_id,operationId,e.generation,kind,e.lease_id,JSON.stringify(payload),proofHash,prev,hash]);
      if(this.#journalAuth) {
        const mac=journalMac.call(this.#journalAuth,{custody_id:this.#c.custody_id,source_system_identifier:this.#c.source_system_identifier,
          authority_system_identifier:this.#c.authority_system_identifier,operation_id:operationId,generation:e.generation,event_hash:hash});
        await db.query(`INSERT INTO portal_restore_original_custody.event_authentication(custody_id,operation_id,key_id,event_mac)
          VALUES($1,$2,$3,$4)`,[this.#c.custody_id,operationId,journalKeyId.call(this.#journalAuth),mac]);
      }
      if(kind!=="ISSUED_HUMAN_ASSERTION"&&this.#vault) {
        const binding:SourceProofBinding={custody_id:this.#c.custody_id,operation_id:operationId,generation:e.generation,
          kind:kind as SourceProofBinding["kind"],lease_id:leaseId,proof_hash:proofHash};
        const envelope=sealSourceProof.call(this.#vault,binding,proof);
        await db.query("INSERT INTO portal_restore_original_custody.source_proofs(custody_id,operation_id,envelope) VALUES($1,$2,$3::jsonb)",
          [this.#c.custody_id,operationId,JSON.stringify(envelope)]);
      }
      const updated=await db.query("UPDATE portal_restore_original_custody.head SET generation=$2,event_hash=$3 WHERE custody_id=$1 AND generation=$4 AND event_hash=$5",[this.#c.custody_id,e.generation,hash,expected,prev]);
      if(updated.rowCount!==1)throw new Error("RESTORE_CUSTODY_GENERATION_CONFLICT");
      await db.query("COMMIT"); await sc.query("COMMIT"); sourceCommitted=true;
      return {state:"STORED_NOT_CUTOVER",generation:e.generation,replayed:false};
    } catch(error) {try {await db.query("ROLLBACK");}catch {discard=true;}throw error;}
    finally {db.release(discard);}
    } finally {
      if(!sourceCommitted)try {await sc.query("ROLLBACK");}catch {sourceDiscard=true;}
      sc.release(sourceDiscard);
    }
  }
}
