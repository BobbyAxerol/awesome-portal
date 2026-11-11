import type {ServerResponse} from "node:http";
import type {Pool} from "pg";
import {accessDigest} from "./access-digest";
import {commandSourceAssertionRequest,commandSourceAssertionResponse,
  type CommandSourceAssertionRequest,type CommandSourceAssertionResponse} from "./command-source-assertion";
import {deliverC2TestJsonResponse} from "./c2-p7-http-delivery-candidate";

/** Disposable test composition ONLY. Both reader and writer are admitted by
 * restricted test procedures; neither is qualified for runtime. The SQL
 * procedures themselves refuse installation outside a disposable database. */
export function createC2TestStatusDelivery(writer:Pool,reader:Pool,untrusted:{
  workspace_id:string;owner_user_id:string;workload_id:string;registration_key:string;registration_sha256:string;
}) {
  const selected={...untrusted};
  const id=(v:unknown):v is string=>typeof v==="string"&&Buffer.byteLength(v)>0&&Buffer.byteLength(v)<=128&&
    v.trim()===v&&!/[\u0000-\u001f\u007f-\u009f]/u.test(v);
  if(!writer||!reader||![selected.workspace_id,selected.owner_user_id,selected.workload_id,selected.registration_key].every(id)||
    !/^[a-f0-9]{64}$/.test(selected.registration_sha256))throw new Error("C2_TEST_STATUS_DELIVERY_INVALID");
  return async(context:string,untrustedRequest:CommandSourceAssertionRequest,untrustedOutput:CommandSourceAssertionResponse,
    response:ServerResponse,remainingMs:number):Promise<void>=>{
    if(!/^[A-Za-z0-9_-]{43}$/.test(context)||!Number.isSafeInteger(remainingMs)||remainingMs<1||remainingMs>5000||
      response.destroyed||response.writableEnded||response.headersSent)throw new Error("C2_TEST_STATUS_DELIVERY_INVALID");
    const request=commandSourceAssertionRequest.parse(untrustedRequest),output=commandSourceAssertionResponse.parse(untrustedOutput);
    if(request.workload_id!==selected.workload_id||output.workload_id!==request.workload_id||
      output.binding_digest!==request.binding_digest||output.receiver_id!==request.receiver_id||
      output.method!==request.method||output.path!==request.path||output.request_digest!==request.request_digest||
      output.delivery_sequence!==request.delivery_sequence||output.previous_lease_id!==request.previous_lease_id)
      throw new Error("C2_TEST_STATUS_DELIVERY_INVALID");
    // Test-only identity check; matching database/endpoint is not a
    // production pool qualification or an independently trusted source.
    const endpointSql="SELECT current_database() AS db,inet_server_addr()::text AS address,inet_server_port() AS port";
    const [readIdentity,writeIdentity]=await Promise.all([reader.query(endpointSql),writer.query(endpointSql)]);
    const a=readIdentity.rows[0],b=writeIdentity.rows[0];
    const dedicated=typeof a?.db==="string" && (/^portal_restore_rls_[a-f0-9]{8}$/.test(a.db)||
      (process.env.C2_P7_TEST_DISPOSABLE==="TEST_ONLY_C2_P7_DEDICATED_DATABASE" &&
       /^portal_c2_p7_[a-f0-9]{8}$/.test(a.db)));
    if(!a||!b||!dedicated||a.db!==b.db||
      typeof a.address!=="string"||a.address!==b.address||a.port!==b.port)
      throw new Error("C2_TEST_STATUS_DELIVERY_DATABASE_REQUIRED");
    const result=await reader.query(`SELECT original_digest,expires_at_ms FROM
      elp210_c2_delivery_candidate.read_status_candidate($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [accessDigest(context),output.delivery_sequence,output.lease_id,output.previous_lease_id,output.binding_digest,
      output.receiver_id,output.request_digest,accessDigest(output.assertion),output.issued_at_ms,output.expires_at_ms,
      output.authority_revision,selected.workspace_id,selected.owner_user_id,selected.workload_id]);
    if(result.rowCount!==1||!/^sha256:[a-f0-9]{64}$/.test(result.rows[0].original_digest)||
      Number(result.rows[0].expires_at_ms)!==output.expires_at_ms||response.destroyed||response.writableEnded)
      throw new Error("C2_TEST_STATUS_DELIVERY_BINDING_INVALID");
    const bytes=Buffer.from(JSON.stringify(output),"utf8");
    try {
      await deliverC2TestJsonResponse(writer,response,{lease_id:output.lease_id,workspace_id:selected.workspace_id,
        owner_user_id:selected.owner_user_id,workload_id:selected.workload_id,request_digest:output.request_digest,
        original_digest:result.rows[0].original_digest,valid_until_ms:output.expires_at_ms,
        registration_key:selected.registration_key,registration_sha256:selected.registration_sha256},bytes,remainingMs);
    } finally {bytes.fill(0);}
  };
}
