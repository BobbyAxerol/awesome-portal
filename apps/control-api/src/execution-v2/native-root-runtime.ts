/** Private Research/Paper ROOT preparation. OFF unless both references are
 * selected. A manifest is not a source registration, accepted root receipt,
 * grant or permission to install policy. CURRENT has its own original/port. */
import {createPrivateKey,createPublicKey,X509Certificate} from "node:crypto";
import {isAbsolute,normalize} from "node:path";
import {isIP} from "node:net";
import {createSecureContext} from "node:tls";
import {z} from "zod";
import type {Pool} from "pg";
import type {CorePoolProfile} from "../db/pool";
import type {AccessTrustProvider} from "./access-trust";
import {nativeCoreSchemaTarget,assertRegisteredResearchCurrentHumanSchema,type NativeCoreSchemaTarget} from "./current-human-schema";
import {readNativeRuntimeReference} from "./native-core-runtime";
import {nativeRootCanonical,nativeRootDecode,nativeRootOriginal,nativeRootRegistration} from "./native-root-codec";
import {NativeRootReceiptProvider,type NativeRootProviderConfig} from "./native-root-provider";
import {NativeRootSourceClient,type NativeRootSourceClientConfig} from "./native-root-source-client";

const hash=z.string().regex(/^[a-f0-9]{64}$(?![\s\S])/u),digest=z.string().regex(/^sha256:[a-f0-9]{64}$(?![\s\S])/u);
const positive=z.number().int().positive().safe();
const text=z.string().min(1).max(512).refine(s=>Buffer.byteLength(s,"utf8")<=512&&s.trim()===s&&
 !/[\u0000-\u001f\u007f\ud800-\udfff]/u.test(s));
const reference=z.object({path:z.string().min(1).max(4096).refine(s=>isAbsolute(s)&&normalize(s)===s&&
 !/[\u0000-\u001f\u007f]/u.test(s)),sha256:hash}).strict();
const privateOrigin=z.string().max(2048).refine(value=>{
 try{const url=new URL(value),host=url.hostname.replace(/^\[|\]$/gu,"");
  return /^https:\/\/[^/?#\\\s]+\/?$(?![\s\S])/u.test(value)&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==="/"&&
   (isIP(host)===4?/^(?:127\.|10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)/u.test(host):
    isIP(host)===6&&(host==="::1"||/^(?:fc|fd)/iu.test(host)));}catch{return false;}
});
const poolProfile=z.object({max:positive.max(10),connectionTimeoutMillis:positive.max(60000),statement_timeout:positive.max(60000),
 query_timeout:positive.max(60000),idle_in_transaction_session_timeout:positive.max(60000)}).strict().refine(p=>p.query_timeout>p.statement_timeout);
export const nativeRootRuntimeManifest=z.object({schema_version:z.literal("portal.execution.native-root-runtime.v1"),
 target:z.object({kind:z.literal("RESEARCH"),environment:z.literal("paper")}).strict(),schema_target:nativeCoreSchemaTarget,
 pool_profile:poolProfile,purpose:z.literal("QUALIFIED_ROOT_RECEIPT"),
 provider:z.object({source:z.object({human_issuer:text,subject:text,workspace_id:text,environment:z.literal("paper"),
  workload_id:text.refine(s=>[...s].length<=128)}).strict(),registration:nativeRootRegistration,original:nativeRootOriginal,
  correspondence:z.object({registry_revision:digest,payload_sha256:hash,approval_ref:text}).strict(),
  maximum_retained:positive.max(4096),maximum_unresolved:positive.max(64),maximum_recoveries:positive.max(16),attempt_ms:positive.max(60000)}).strict(),
 terminal:z.object({issuer:text,audience:text,key_id:text,private_key_ref:reference,ttl_seconds:positive.max(60)}).strict(),
 transport:z.object({origin:privateOrigin,tls:z.object({key_ref:reference,cert_ref:reference,ca_ref:reference}).strict(),
  edge_leaf_sha256:digest,workload_id:text,deadline_ms:positive.max(5000),request_bytes:positive.max(32768),
  response_bytes:positive.max(65536),max_inflight:positive.max(16)}).strict(),
}).strict().superRefine((v,c)=>{
 const target=v.schema_target,principal=target.principal_workspace_pins[0],source=v.provider.source;
 if([target.database_name,target.role_name,target.protected_owner_user_id,target.workspace_id,
   principal?.user_id,principal?.workspace_id].some(id=>!text.safeParse(id).success)||
  !principal||principal.user_id!==target.protected_owner_user_id||principal.workspace_id!==target.workspace_id||
  source.subject!==principal.user_id||source.workspace_id!==target.workspace_id||source.workload_id!==v.transport.workload_id||
  v.provider.maximum_unresolved>v.provider.maximum_retained)
  c.addIssue({code:z.ZodIssueCode.custom,message:"NATIVE_ROOT_RUNTIME_TARGET_MISMATCH"});
});
export type NativeRootRuntimeReference=z.infer<typeof reference>;
export class NativeRootRuntimeError extends Error {
 readonly code="NATIVE_ROOT_RUNTIME_CONFIG_INVALID";
 constructor(){super("The private root receipt composition is not available.");}
}
const fail=():never=>{throw new NativeRootRuntimeError();};
export interface PreparedNativeRootRuntime {
 readonly poolProfile:Readonly<CorePoolProfile>;readonly schemaTarget:Readonly<NativeCoreSchemaTarget>;
 readonly provider:NativeRootProviderConfig;readonly transport:NativeRootSourceClientConfig;
}
export interface PreparedNativeRootApplication {
 readonly provider:NativeRootReceiptProvider;
 composeTrust(base:AccessTrustProvider):AccessTrustProvider;
 recover():Promise<{remaining:number}>;
 shutdown():Promise<void>;
}
/** Environment selection does not read files or enable another native surface. */
export function nativeRootRuntimeReference(env:NodeJS.ProcessEnv=process.env):NativeRootRuntimeReference|undefined {
 const path=env.CONTROL_API_NATIVE_ROOT_CONFIG_FILE,sha256=env.CONTROL_API_NATIVE_ROOT_CONFIG_SHA256;
 if(path===undefined&&sha256===undefined)return undefined;
 try{return reference.parse({path,sha256});}catch{return fail();}
}
function certificates(bytes:Buffer):X509Certificate[]{
 const source=new TextDecoder("utf-8",{fatal:true}).decode(bytes),blocks=source.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/gu);
 if(!blocks?.length||blocks.length>16||blocks.join("").replace(/\s/gu,"")!==source.replace(/\s/gu,""))return fail();
 const now=Date.now();return blocks.map(block=>{const cert=new X509Certificate(block);
  if(now<Date.parse(cert.validFrom)||now>=Date.parse(cert.validTo))return fail();return cert;});
}
export async function prepareNativeRootRuntime(input:NativeRootRuntimeReference):Promise<PreparedNativeRootRuntime>{
 const raw:Buffer[]=[],outputs:Buffer[]=[];let complete=false;
 try{
  const read=async(pin:NativeRootRuntimeReference,maximum:number)=>{const bytes=await readNativeRuntimeReference(pin,maximum);raw.push(bytes);return bytes;};
  const bytes=await read(reference.parse(input),65536),value=nativeRootDecode(bytes,65536);
  if(nativeRootCanonical(value)!==bytes.toString("utf8"))return fail();
  const parsed=nativeRootRuntimeManifest.parse(value),pins=parsed.transport.tls;
  const pem=async(pin:NativeRootRuntimeReference)=>{const bytes=Buffer.from(await read(pin,32768));outputs.push(bytes);return bytes;};
  const key=await pem(pins.key_ref),cert=await pem(pins.cert_ref),ca=await pem(pins.ca_ref),chain=certificates(cert),roots=certificates(ca),leaf=chain[0]!;
  if(leaf.ca||roots.some(root=>!root.ca)||!leaf.keyUsage?.includes("1.3.6.1.5.5.7.3.2"))return fail();
  for(let i=0;i<chain.length-1;i++){const child=chain[i]!,issuer=chain[i+1]!;
   if(!issuer.ca||!child.checkIssued(issuer)||!child.verify(issuer.publicKey))return fail();}
  // `ca` authenticates the REMOTE peer, not our local issuing root. Core and
  // Edge may use independent CAs; the local bundle still must be ordered and
  // cryptographically linked above. Actual peer trust/pin is checked per TLS.
  const privateKey=createPrivateKey(await read(parsed.terminal.private_key_ref,16384)),tlsKey=createPrivateKey(key);
  if(privateKey.asymmetricKeyType!=="ed25519"||!leaf.checkPrivateKey(tlsKey)||
   createPublicKey(privateKey).export({type:"spki",format:"der"}).equals(leaf.publicKey.export({type:"spki",format:"der"})))return fail();
  createSecureContext({key,cert,ca,minVersion:"TLSv1.3",maxVersion:"TLSv1.3"});
  const {private_key_ref:_ref,...terminal}=parsed.terminal,{tls:_tls,...transport}=parsed.transport;
  complete=true;
  return Object.freeze({poolProfile:Object.freeze({...parsed.pool_profile}),schemaTarget:Object.freeze(parsed.schema_target),
   provider:{...parsed.provider,terminal:{...terminal,private_key:privateKey}},transport:{...transport,tls:{key,cert,ca}}});
 }catch{return fail();}finally{raw.forEach(bytes=>bytes.fill(0));if(!complete)outputs.forEach(bytes=>bytes.fill(0));}
}

/** Existing schema/migration only; no automatic DDL, source ISSUE, acceptance
 * or listener. The parent application MUST register this exact provider with
 * its shared mutation recovery/drain before exposing composeTrust. */
export async function prepareNativeRootApplication(pool:Pool,runtime:PreparedNativeRootRuntime):Promise<PreparedNativeRootApplication>{
 try{
  await assertRegisteredResearchCurrentHumanSchema(pool,runtime.schemaTarget);
  const schema=await pool.query(`SELECT to_regclass('public.portal_native_root_obligations') AS custody,
   to_regclass('public.pgmigrations') AS ledger,to_regprocedure('public.portal_guard_native_root_original()') AS guard,
   EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.portal_native_root_obligations')
    AND tgname='guard_native_root_original' AND tgenabled IN ('O','A') AND tgtype=27
    AND tgfoid=to_regprocedure('public.portal_guard_native_root_original()') AND NOT tgisinternal) AS guarded`);
  const row=schema.rows[0];
  if(schema.rows.length!==1||!row?.custody||!row.ledger||!row.guard||row.guarded!==true)return fail();
  const migration=await pool.query("SELECT name FROM public.pgmigrations WHERE name=$1",["1723680000152_execution-native-root-custody"]);
  if(migration.rows.length!==1)return fail();
  const client=new NativeRootSourceClient(runtime.transport),provider=new NativeRootReceiptProvider(pool,client,runtime.provider);
  return Object.freeze({provider,composeTrust:(base:AccessTrustProvider)=>provider.compose(base),
   recover:()=>provider.recover(),shutdown:()=>provider.shutdown()});
 }catch{return fail();}finally{for(const bytes of Object.values(runtime.transport.tls))if(Buffer.isBuffer(bytes))bytes.fill(0);}
}
