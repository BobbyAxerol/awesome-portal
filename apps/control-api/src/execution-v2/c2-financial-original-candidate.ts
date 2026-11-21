import {randomBytes} from "node:crypto";
import type {Pool} from "pg";
import {z} from "zod";
import {withTransaction} from "../db/pool";
import {accessDigest} from "./access-digest";

/** Unmounted durable correlation, not an authenticated owner, source proof,
 * issuance permission or HTTP custody. The caller must bind the exact row in
 * the same transaction as ISSUE and recheck current authority on recovery. */
const text=z.string().min(1).max(128).regex(/^[^\u0000-\u0020\u007f]+$/u);
const digest=z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const inputSchema=z.object({subject_id:text,session_id:text,session_revision:z.number().int().nonnegative().safe(),
  workspace_id:text,workload_id:text,receiver_id:text,binding_digest:digest,request_digest:digest,
  expires_at_ms:z.number().int().positive().safe()}).strict();
export type C2FinancialOriginalInput=z.infer<typeof inputSchema>;
const bad=():never=>{throw new Error("C2_FINANCIAL_ORIGINAL_UNAVAILABLE");};

export class C2FinancialOriginalCandidate {
  constructor(private readonly pool:Pool,private readonly maximum:number) {
    if(!pool||!Number.isSafeInteger(maximum)||maximum<1||maximum>128)throw new Error("C2_FINANCIAL_ORIGINAL_UNAVAILABLE");
  }
  async prepare(untrusted:C2FinancialOriginalInput):Promise<{context:string;expires_at_ms:number}> {
    const input=inputSchema.parse(untrusted),context=randomBytes(32).toString("base64url");
    await this.#reserve(context,input);
    return {context,expires_at_ms:input.expires_at_ms};
  }
  /** Idempotent reservation for a caller that already holds the same private
   * delivery context after a lost response. A context is a locator, NOT an
   * authorization: ISSUE/resume must still pass P7 and current authority.
   * This primitive neither authenticates completion nor permits a successor. */
  async reserve(context:string,untrusted:C2FinancialOriginalInput):Promise<{lease_id:string|null}> {
    return this.#reserve(context,untrusted);
  }
  async #reserve(context:string,untrusted:C2FinancialOriginalInput):Promise<{lease_id:string|null}> {
    if(typeof context!=="string"||!/^[A-Za-z0-9_-]{43}$/u.test(context))return bad();
    const input=inputSchema.parse(untrusted),contextDigest=accessDigest(context);
    return withTransaction(this.pool,async db=>{
      await db.query("SET LOCAL lock_timeout='1000ms'; SET LOCAL statement_timeout='3000ms'");
      const authority=await db.query("SELECT revision,drain_id FROM elp210_candidate.authority WHERE singleton FOR UPDATE");
      if(authority.rowCount!==1||authority.rows[0].drain_id)return bad();
      const time=await db.query("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS now_ms");
      const now=Number(time.rows[0]?.now_ms);
      if(!Number.isSafeInteger(now)||input.expires_at_ms<=now||input.expires_at_ms>now+300000)return bad();
      // A retry, including after ISSUE committed but its response was lost,
      // must locate the existing row before capacity is applied. The same
      // opaque context cannot be rebound to altered identity or request.
      const existing=await db.query(`SELECT lease_id,
        (subject_id=$2 AND session_id=$3 AND session_revision=$4 AND workspace_id=$5 AND workload_id=$6
         AND receiver_id=$7 AND binding_digest=$8 AND request_digest=$9 AND expires_at_ms=$10) AS same_original
        FROM elp210_c2_financial_candidate.originals WHERE context_digest=$1 FOR UPDATE`,
      [contextDigest,input.subject_id,input.session_id,input.session_revision,input.workspace_id,input.workload_id,
        input.receiver_id,input.binding_digest,input.request_digest,input.expires_at_ms]);
      if(existing.rowCount===1) {
        const row=existing.rows[0];
        if(row.same_original!==true||(row.lease_id!==null&&typeof row.lease_id!=="string"))return bad();
        return {lease_id:row.lease_id as string|null};
      }
      if(existing.rowCount!==0)return bad();
      // ISSUE uses the same authority lock and must bind before commit. Only
      // expired preparations with no lease can be removed; linked originals
      // and all unresolved custody remain untouched.
      await db.query(`DELETE FROM elp210_c2_financial_candidate.originals
        WHERE lease_id IS NULL AND expires_at_ms<=floor(extract(epoch FROM clock_timestamp())*1000)`);
      const count=await db.query("SELECT count(*)::int AS n FROM elp210_c2_financial_candidate.originals");
      if(!Number.isSafeInteger(count.rows[0]?.n)||count.rows[0].n>=this.maximum)return bad();
      await db.query(`INSERT INTO elp210_c2_financial_candidate.originals
        (context_digest,subject_id,session_id,session_revision,workspace_id,workload_id,receiver_id,binding_digest,request_digest,expires_at_ms)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[contextDigest,input.subject_id,input.session_id,input.session_revision,
        input.workspace_id,input.workload_id,input.receiver_id,input.binding_digest,input.request_digest,input.expires_at_ms]);
      return {lease_id:null};
    });
  }
  /** Returns a locator only after exact input matches. The caller must still
   * resume through the issuer's current session/P7/custody checks; possession
   * of this context alone is never authorization to deliver any assertion. */
  async locate(context:string,untrusted:C2FinancialOriginalInput):Promise<string> {
    if(typeof context!=="string"||!/^[A-Za-z0-9_-]{43}$/u.test(context))return bad();
    const input=inputSchema.parse(untrusted);
    const result=await this.pool.query(`SELECT lease_id FROM elp210_c2_financial_candidate.originals
      WHERE context_digest=$1 AND subject_id=$2 AND session_id=$3 AND session_revision=$4 AND workspace_id=$5
        AND workload_id=$6 AND receiver_id=$7 AND binding_digest=$8 AND request_digest=$9 AND expires_at_ms=$10
        AND expires_at_ms>floor(extract(epoch FROM clock_timestamp())*1000) AND lease_id IS NOT NULL LIMIT 2`,
    [accessDigest(context),input.subject_id,input.session_id,input.session_revision,input.workspace_id,input.workload_id,
      input.receiver_id,input.binding_digest,input.request_digest,input.expires_at_ms]);
    if(result.rowCount!==1||typeof result.rows[0]?.lease_id!=="string")return bad();
    return result.rows[0].lease_id;
  }
}
