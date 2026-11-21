import {createCipheriv,createDecipheriv,randomBytes} from "node:crypto";
import type {Pool} from "pg";
import {withTransaction} from "../db/pool";
import type {AccessActor} from "./access.contract";
import {accessDigest} from "./access-digest";
import {captureFinancialRegistration,type FinancialSourceAssertionSelection} from "./financial-source-assertion";

/** SOURCE/TEST ONLY. Stores an encrypted parent locator before ISSUE. The
 * caller remains responsible for authenticated principal, transaction order,
 * sole HTTP custody, retention/roles, anti-rollback and Edge ACK. A restored
 * parent is never a grant, completion or authorization to issue anew. */
const id=/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const contextPattern=/^[A-Za-z0-9_-]{43}$/u;
const sha=/^sha256:[a-f0-9]{64}$/u;
const fail=():never=>{throw new Error("C2_FINANCIAL_PARENT_UNAVAILABLE");};
type Row={parent_id:string;context_digest:string;identity_digest:string;expires_at_ms:string;key_id:string;
  nonce:string;ciphertext:string;tag:string};
const aad=(row:Pick<Row,"parent_id"|"context_digest"|"identity_digest"|"expires_at_ms"|"key_id">)=>
  Buffer.from(JSON.stringify(["portal.c2.financial-parent.v1",row.parent_id,row.context_digest,row.identity_digest,
    row.expires_at_ms,row.key_id]),"utf8");
const canonicalContext=(context:string):boolean=>typeof context==="string"&&contextPattern.test(context)&&
  Buffer.from(context,"base64url").length===32&&Buffer.from(context,"base64url").toString("base64url")===context;
const decode=(value:unknown,size:number):Buffer=>{
  if(typeof value!=="string"||!/^[A-Za-z0-9_-]+$/u.test(value))return fail();
  const b=Buffer.from(value,"base64url");
  if(b.length!==size||b.toString("base64url")!==value)return fail();
  return b;
};
export class C2FinancialParentCandidate {
  readonly #key:Buffer;
  constructor(private readonly pool:Pool,key:Uint8Array,private readonly keyId:string,private readonly maximum:number) {
    if(!pool||!(key instanceof Uint8Array)||key.length!==32||key.every(b=>b===0)||typeof keyId!=="string"||!id.test(keyId)||
      !Number.isSafeInteger(maximum)||maximum<1||maximum>128)throw new Error("C2_FINANCIAL_PARENT_UNAVAILABLE");
    this.#key=Buffer.from(key);
  }
  /** Called by the Core owner after registration and BEFORE any ISSUE. A
   * failed save must prevent the caller from sending or issuing a bearer. */
  async save(parentId:string,actor:AccessActor,selection:FinancialSourceAssertionSelection,context:string,expires:number):Promise<string> {
    const registration=captureFinancialRegistration(actor,selection);
    if(typeof parentId!=="string"||!uuid.test(parentId)||!canonicalContext(context)||!Number.isSafeInteger(expires)||expires<=0)return fail();
    const row={parent_id:parentId,context_digest:accessDigest(context),identity_digest:accessDigest(registration),
      expires_at_ms:String(expires),key_id:this.keyId};
    const nonce=randomBytes(12),cipher=createCipheriv("aes-256-gcm",this.#key,nonce);cipher.setAAD(aad(row));
    const ciphertext=Buffer.concat([cipher.update(context,"utf8"),cipher.final()]);
    try {
      const existed=await withTransaction(this.pool,async db=>{
        await db.query("SET LOCAL lock_timeout='1000ms'; SET LOCAL statement_timeout='3000ms'");
        const limit=await db.query(`SELECT maximum_retained FROM elp210_c2_financial_parent_candidate.limits
          WHERE singleton FOR UPDATE`);
        const clock=await db.query("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS now_ms");
        const now=Number(clock.rows[0]?.now_ms);
        if(limit.rowCount!==1||limit.rows[0].maximum_retained!==this.maximum||!Number.isSafeInteger(now)||
          expires<=now||expires>now+300000)return fail();
        // A caller supplies its stable operation ref before this write. After
        // an ambiguous commit it can retry the exact record without creating
        // another parent; a changed identity/context/expiry is never rebound.
        const previous=await db.query(`SELECT context_digest,identity_digest,expires_at_ms::text,key_id
          FROM elp210_c2_financial_parent_candidate.parents WHERE parent_id=$1`,[parentId]);
        if(previous.rowCount===1) {
          const old=previous.rows[0];
          if(old.context_digest!==row.context_digest||old.identity_digest!==row.identity_digest||
            old.expires_at_ms!==row.expires_at_ms||old.key_id!==row.key_id)return fail();
          return true;
        }
        if(previous.rowCount!==0)return fail();
        const count=await db.query("SELECT count(*)::int AS n FROM elp210_c2_financial_parent_candidate.parents");
        if(!Number.isSafeInteger(count.rows[0]?.n)||count.rows[0].n>=this.maximum)return fail();
        await db.query(`INSERT INTO elp210_c2_financial_parent_candidate.parents
          (parent_id,context_digest,identity_digest,expires_at_ms,key_id,nonce,ciphertext,tag)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[row.parent_id,row.context_digest,row.identity_digest,row.expires_at_ms,row.key_id,
          nonce.toString("base64url"),ciphertext.toString("base64url"),cipher.getAuthTag().toString("base64url")]);
        return false;
      });
      if(existed) {
        const retained=await this.load(parentId,registration.actor,registration.selection);
        if(retained.original_context!==context||retained.expires_at_ms!==expires)return fail();
      }
      return row.parent_id;
    } finally {ciphertext.fill(0);}
  }
  /** Locator only for trusted Core recovery, NEVER an authorization result.
   * The exact actor/selection must be independently revalidated after load. */
  async load(parentId:string,actor:AccessActor,selection:FinancialSourceAssertionSelection):Promise<{original_context:string;expires_at_ms:number}> {
    const registration=captureFinancialRegistration(actor,selection);
    if(typeof parentId!=="string"||!uuid.test(parentId))return fail();
    const result=await this.pool.query<Row>(`SELECT parent_id::text,context_digest,identity_digest,expires_at_ms::text,key_id,nonce,ciphertext,tag
      FROM elp210_c2_financial_parent_candidate.parents WHERE parent_id=$1 AND identity_digest=$2
        AND expires_at_ms>floor(extract(epoch FROM clock_timestamp())*1000) LIMIT 2`,[parentId,accessDigest(registration)]);
    if(result.rowCount!==1)return fail();
    const row=result.rows[0],expires=Number(row.expires_at_ms);
    if(row.parent_id!==parentId||row.key_id!==this.keyId||!sha.test(row.context_digest)||!sha.test(row.identity_digest)||
      row.identity_digest!==accessDigest(registration)||
      !Number.isSafeInteger(expires)||expires<=0)return fail();
    let plain:Buffer|undefined,partial:Buffer|undefined;
    try {
      const decipher=createDecipheriv("aes-256-gcm",this.#key,decode(row.nonce,12));decipher.setAAD(aad(row));
      decipher.setAuthTag(decode(row.tag,16));partial=decipher.update(decode(row.ciphertext,43));
      plain=Buffer.concat([partial,decipher.final()]);const context=plain.toString("utf8");
      if(!canonicalContext(context)||accessDigest(context)!==row.context_digest)return fail();
      return {original_context:context,expires_at_ms:expires};
    } catch {return fail();}
    finally {partial?.fill(0);plain?.fill(0);}
  }
}
