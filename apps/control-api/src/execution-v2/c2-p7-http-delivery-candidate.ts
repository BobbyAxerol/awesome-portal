import {createHash,randomBytes} from "node:crypto";
import type {ServerResponse} from "node:http";
import type {Pool, PoolClient} from "pg";

/** TEST ONLY: the SQL procedure used here refuses non-disposable databases.
 * The caller must independently authenticate the owner and qualify the exact
 * original. This is neither an issuer route nor a source delivery ACK. */
export interface C2DeliveryTestBinding {
  lease_id:string; workspace_id:string; owner_user_id:string; workload_id:string;
  request_digest:string; original_digest:string; valid_until_ms:number;
  registration_key:string; registration_sha256:string;
}
const call="SELECT elp210_c2_delivery_candidate.apply_candidate($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) AS result";
const id=(value:unknown):value is string=>typeof value==="string" && value.length>0 &&
  Buffer.byteLength(value)<=128 && value.trim()===value && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
const digest=(value:unknown):value is string=>typeof value==="string" && /^sha256:[a-f0-9]{64}$/.test(value);

/** Reserve durably first; then hold the DB authority lock from SENDING until
 * Node has handed the bounded bytes to its transport. A finish event does NOT
 * prove peer receipt. Any ambiguous result requires same-original recovery;
 * there is deliberately no retry, ACK, mount, or new lease in this function.
 * Loss of the database connection destroys the response; network buffering and
 * failures across processes still require the recipient's ENTER fence. */
export async function deliverC2TestResponse(pool:Pool,response:ServerResponse,binding:C2DeliveryTestBinding,
  untrustedPayload:Buffer,deadlineMs:number,afterFinish?:()=>Promise<void>):Promise<"UNKNOWN_NOT_ACKNOWLEDGED"> {
  return deliver(pool,response,binding,untrustedPayload,deadlineMs,"application/octet-stream",afterFinish);
}

/** Same test-only fence, for the JSON assertion protocol. */
export async function deliverC2TestJsonResponse(pool:Pool,response:ServerResponse,binding:C2DeliveryTestBinding,
  untrustedPayload:Buffer,deadlineMs:number):Promise<"UNKNOWN_NOT_ACKNOWLEDGED"> {
  return deliver(pool,response,binding,untrustedPayload,deadlineMs,"application/json");
}

async function deliver(pool:Pool,response:ServerResponse,binding:C2DeliveryTestBinding,
  untrustedPayload:Buffer,deadlineMs:number,contentType:"application/json"|"application/octet-stream",
  afterFinish?:()=>Promise<void>):Promise<"UNKNOWN_NOT_ACKNOWLEDGED"> {
  if (!binding) throw new Error("C2_TEST_DELIVERY_INVALID");
  const b={...binding};
  if (![b.lease_id,b.workspace_id,b.owner_user_id,b.workload_id,b.registration_key].every(id) ||
    !digest(b.request_digest) || !digest(b.original_digest) ||
    !/^[a-f0-9]{64}$/.test(b.registration_sha256) || !Number.isSafeInteger(b.valid_until_ms) ||
    b.valid_until_ms<=Date.now() || !Buffer.isBuffer(untrustedPayload) || untrustedPayload.length<1 ||
    untrustedPayload.length>32768 || !Number.isSafeInteger(deadlineMs) || deadlineMs<1 || deadlineMs>5000 ||
    response.headersSent || response.destroyed || response.writableEnded) throw new Error("C2_TEST_DELIVERY_INVALID");
  const payload=Buffer.from(untrustedPayload);
  const args=(action:string)=>[action,b.lease_id,b.workspace_id,b.owner_user_id,b.workload_id,b.request_digest,
    b.original_digest,`sha256:${createHash("sha256").update(payload).digest("hex")}`,payload.length,
    b.valid_until_ms,b.registration_key,b.registration_sha256];
  let client:PoolClient|undefined,transaction=false,broken=false,reserved=false;
  const lost=()=>{broken=true;response.destroy();};
  try {
    client=await pool.connect();
    client.on("error",lost);
    if(response.destroyed || response.writableEnded)throw new Error("C2_TEST_DELIVERY_INTERRUPTED");
    // Autocommit both reservation and exclusive backend-bound SENDING before
    // bytes can escape. A crash must never roll SENDING back to RESERVED.
    const reserve=await client.query(call,args("RESERVE"));
    if(reserve.rows[0]?.result!=="RESERVED_NOT_DELIVERED")throw new Error("C2_TEST_DELIVERY_FAILED");
    reserved=true;
    await client.query("SELECT set_config('portal.c2_send_token',$1,false)",[randomBytes(32).toString("hex")]);
    const sending=await client.query(call,args("SENDING"));
    if(sending.rows[0]?.result!=="SENDING_NOT_ACKNOWLEDGED")throw new Error("C2_TEST_DELIVERY_FAILED");
    await client.query("BEGIN");transaction=true;
    await client.query("SELECT set_config('idle_in_transaction_session_timeout',$1,true)",[`${deadlineMs+1000}ms`]);
    await client.query("SELECT set_config('statement_timeout',$1,true)",[`${deadlineMs+1000}ms`]);
    const held=await client.query(call,args("HOLD"));
    if(held.rows[0]?.result!=="SENDING_NOT_ACKNOWLEDGED" || broken || response.destroyed || response.writableEnded)
      throw new Error("C2_TEST_DELIVERY_FAILED");
    await new Promise<void>((resolve,reject)=>{
      let settled=false;
      const done=(error?:Error)=>{
        if(settled)return;settled=true;clearTimeout(timer);
        response.off("finish",finished);response.off("close",closed);response.off("error",failed);
        error?reject(error):resolve();
      };
      const finished=()=>done();
      const closed=()=>{if(!response.writableFinished)done(new Error("C2_TEST_DELIVERY_INTERRUPTED"));};
      const failed=()=>done(new Error("C2_TEST_DELIVERY_INTERRUPTED"));
      const timer=setTimeout(()=>{response.destroy();done(new Error("C2_TEST_DELIVERY_INTERRUPTED"));},deadlineMs);
      response.once("finish",finished);response.once("close",closed);response.once("error",failed);
      try {
        response.writeHead(200,{"content-type":contentType,"cache-control":"no-store",vary:"Authorization",
          "x-content-type-options":"nosniff","content-length":String(payload.length),"connection":"close"});
        response.end(payload);
      } catch {done(new Error("C2_TEST_DELIVERY_INTERRUPTED"));}
    });
    // Fault-injection hook for a disposable-process test only. Production has
    // no caller for this TEST_ONLY function. No success/ACK is inferred here.
    if(afterFinish)await afterFinish();
    if(broken)throw new Error("C2_TEST_DELIVERY_FAILED");
    const unknown=await client.query(call,args("UNKNOWN"));
    if(unknown.rows[0]?.result!=="UNKNOWN_NOT_ACKNOWLEDGED")throw new Error("C2_TEST_DELIVERY_FAILED");
    await client.query("COMMIT");transaction=false;
    return "UNKNOWN_NOT_ACKNOWLEDGED";
  } catch {
    response.destroy();
    if(client && transaction && !broken) await client.query("ROLLBACK").catch(()=>{broken=true;});
    // Even a successful UNKNOWN write is not proof of physical delivery. If
    // the connection failed, immutable RESERVE remains a recovery obligation.
    if(client && reserved && !broken) await client.query(call,args("UNKNOWN")).catch(()=>{});
    throw new Error("C2_TEST_DELIVERY_OUTCOME_UNCERTAIN");
  } finally {
    payload.fill(0);
    // Never return the backend-bound delivery connection to a pool for reuse.
    if(client){client.off("error",lost);client.release(broken||reserved);}
  }
}
