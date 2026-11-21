import {createHmac} from "node:crypto";
import type {ServerResponse} from "node:http";
import type {Pool} from "pg";
import type {AccessActor} from "./access.contract";
import {accessDigest} from "./access-digest";
import {captureFinancialRegistration,financialSourceAssertionRequest,financialSourceAssertionResponse,
  type FinancialSourceAssertionRequest,type FinancialSourceAssertionResponse,type FinancialSourceAssertionSelection} from "./financial-source-assertion";
import {deliverC2TestJsonResponse} from "./c2-p7-http-delivery-candidate";

/** Disposable test composition only: no production field/source authority,
 * ownership grant, runtime mount, recipient ACK or permission to create ISSUE. */
export function createC2TestFinancialDelivery(writer:Pool,reader:Pool,actor:AccessActor,selection:FinancialSourceAssertionSelection,
  scope:{registration_key:string;registration_sha256:string}) {
  const registration=captureFinancialRegistration(actor,selection),selected={...scope};
  if(!writer||!reader||typeof selected.registration_key!=="string"||selected.registration_key.length<1||
    selected.registration_key.length>128||!/^\S+$/u.test(selected.registration_key)||
    !/^[a-f0-9]{64}$/u.test(selected.registration_sha256))throw new Error("C2_TEST_FINANCIAL_DELIVERY_INVALID");
  return async(context:string,untrustedRequest:FinancialSourceAssertionRequest,untrustedOutput:FinancialSourceAssertionResponse,
    response:ServerResponse,remainingMs:number):Promise<void>=>{
    const request=financialSourceAssertionRequest.parse(untrustedRequest),output=financialSourceAssertionResponse.parse(untrustedOutput);
    const s=registration.selection,a=registration.actor;
    const secret=typeof context==="string"?Buffer.from(context,"base64url"):Buffer.alloc(0);
    let original:string;
    try {
      if(!/^[A-Za-z0-9_-]{43}$/u.test(context)||secret.length!==32||secret.toString("base64url")!==context||
        request.delivery_sequence!==0||request.previous_lease_id!==null||!s.paths.includes(request.path)||
        request.workload_id!==s.workload_id||request.receiver_id!==s.receiver_id||request.binding_digest!==s.binding_digest||
        output.workload_id!==request.workload_id||output.binding_digest!==request.binding_digest||
        output.receiver_id!==request.receiver_id||output.method!==request.method||output.path!==request.path||
        output.request_digest!==request.request_digest||output.delivery_sequence!==request.delivery_sequence||
        output.previous_lease_id!==request.previous_lease_id||!Number.isSafeInteger(remainingMs)||remainingMs<1||remainingMs>5000||
        response.destroyed||response.writableEnded||response.headersSent)throw new Error("C2_TEST_FINANCIAL_DELIVERY_INVALID");
      original=accessDigest(createHmac("sha256",secret).update("portal.c2.financial.delivery.v1\0","utf8")
        .update("0","utf8").digest("base64url"));
    } finally {secret.fill(0);}
    const endpointSql="SELECT current_database() AS db,inet_server_addr()::text AS address,inet_server_port() AS port";
    const [readIdentity,writeIdentity]=await Promise.all([reader.query(endpointSql),writer.query(endpointSql)]);
    const first=readIdentity.rows[0],second=writeIdentity.rows[0];
    const dedicated=typeof first?.db==="string"&&(/^portal_restore_rls_[a-f0-9]{8}$/.test(first.db)||
      (process.env.C2_P7_TEST_DISPOSABLE==="TEST_ONLY_C2_P7_DEDICATED_DATABASE"&&/^portal_c2_p7_[a-f0-9]{8}$/.test(first.db)));
    if(!first||!second||!dedicated||first.db!==second.db||typeof first.address!=="string"||
      first.address!==second.address||first.port!==second.port)throw new Error("C2_TEST_FINANCIAL_DELIVERY_DATABASE_REQUIRED");
    const result=await reader.query(`SELECT original_digest,expires_at_ms FROM
      elp210_c2_delivery_candidate.read_financial_candidate($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [original,output.lease_id,output.binding_digest,output.receiver_id,output.request_digest,accessDigest(output.assertion),
      output.issued_at_ms,output.expires_at_ms,output.authority_revision,s.workspace_id,a.user_id,a.session_id,a.session_generation,s.workload_id]);
    if(result.rowCount!==1||result.rows[0].original_digest!==original||Number(result.rows[0].expires_at_ms)!==output.expires_at_ms||
      response.destroyed||response.writableEnded)throw new Error("C2_TEST_FINANCIAL_DELIVERY_BINDING_INVALID");
    const bytes=Buffer.from(JSON.stringify(output),"utf8");
    try {
      await deliverC2TestJsonResponse(writer,response,{lease_id:output.lease_id,workspace_id:s.workspace_id,
        owner_user_id:a.user_id,workload_id:s.workload_id,request_digest:output.request_digest,original_digest:original,
        valid_until_ms:output.expires_at_ms,registration_key:selected.registration_key,
        registration_sha256:selected.registration_sha256},bytes,remainingMs);
    } finally {bytes.fill(0);}
  };
}
