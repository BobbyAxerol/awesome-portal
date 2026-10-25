/** Private Research-only CURRENT account composition. Default OFF. Loading
 * config is not a source registration, grant, policy, terminal or deployment. */
import {createPrivateKey,X509Certificate} from "node:crypto";
import {isAbsolute,normalize} from "node:path";
import {isIP} from "node:net";
import {createSecureContext} from "node:tls";
import {z} from "zod";
import type {Pool} from "pg";
import type {AuthService} from "../auth/auth.service";
import type {ControlApiConfig} from "../config";
import type {CorePoolProfile} from "../db/pool";
import type {AccessTrustProvider} from "./access-trust";
import {ExecutionAccessService} from "./access.service";
import {ExecutionReadScopes} from "./read-scope";
import {NativeReadEgress} from "./native-read-egress";
import {NativeCurrentRelationsProvider,nativeCurrentRelationsSettings,nativeCurrentRelationsTerminalSettings,
 type NativeCurrentRelationsProviderConfig} from "./native-current-relations-provider";
import {NativeCurrentRelationsSourceClient,type NativeCurrentRelationsSourceClientConfig} from "./native-current-relations-source-client";
import {nativeCoreSchemaTarget,assertRegisteredResearchCurrentHumanSchema,type NativeCoreSchemaTarget} from "./current-human-schema";
import {readNativeRuntimeReference} from "./native-core-runtime";
import {nativeCurrentRelationsDecode,nativeCurrentRelationsCanonical} from "./native-current-relations-codec";

const hash=z.string().regex(/^[a-f0-9]{64}$(?![\s\S])/u),positive=z.number().int().positive().safe();
const reference=z.object({path:z.string().min(1).max(4096).refine(s=>isAbsolute(s)&&normalize(s)===s&&!/[\u0000-\u001f\u007f]/u.test(s)),sha256:hash}).strict();
const text=z.string().min(1).max(512).regex(/^[^\u0000-\u001f\u007f]+$/u);
const privateOrigin=z.string().max(2048).refine(value=>{
 try{const url=new URL(value),host=url.hostname.replace(/^\[|\]$/gu,"");
  return /^https:\/\/[^/?#\\\s]+\/?$(?![\s\S])/u.test(value)&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==="/"&&
   (isIP(host)===4?/^(?:127\.|10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)/u.test(host):
    isIP(host)===6&&(host==="::1"||/^(?:fc|fd)/iu.test(host)));}catch{return false;}
});
const poolProfile=z.object({max:positive.max(10),connectionTimeoutMillis:positive.max(60000),statement_timeout:positive.max(60000),
 query_timeout:positive.max(60000),idle_in_transaction_session_timeout:positive.max(60000)}).strict().refine(p=>p.query_timeout>p.statement_timeout);
export const nativeCurrentRuntimeManifest=z.object({schema_version:z.literal("portal.execution.native-current-runtime.v1"),
 target:z.object({kind:z.literal("RESEARCH"),environment:z.literal("paper")}).strict(),schema_target:nativeCoreSchemaTarget,
 pool_profile:poolProfile,provider:nativeCurrentRelationsSettings,
 terminal:nativeCurrentRelationsTerminalSettings.extend({private_key_ref:reference}).strict(),
 transport:z.object({origin:privateOrigin,tls:z.object({key_ref:reference,cert_ref:reference,ca_ref:reference}).strict(),
  edge_leaf_sha256:z.string().regex(/^sha256:[a-f0-9]{64}$(?![\s\S])/u),workload_id:text,deadline_ms:positive.max(5000),
  request_bytes:positive.max(32768),response_bytes:positive.max(65536),max_inflight:positive.max(16)}).strict(),
 egress:z.object({maximum_response_bytes:positive.max(1048576),maximum_inflight:positive.max(16),
  send_timeout_ms:positive.max(30000),quiesce_timeout_ms:positive.max(5000)}).strict(),shutdown_deadline_ms:positive.max(10000),
}).strict().superRefine((v,c)=>{
 const target=v.schema_target,principal=target.principal_workspace_pins[0];
 if(!principal||target.principal_workspace_pins.length!==1||principal.user_id!==target.protected_owner_user_id||
  principal.workspace_id!==target.workspace_id||v.provider.bindings.some(b=>b.actor_id!==principal.user_id||b.principal_id!==principal.user_id||
  b.source.workspace_id!==target.workspace_id||b.source.workload_id!==v.transport.workload_id)||
  v.provider.maximum_unresolved>v.provider.maximum_retained||v.provider.maximum_principals>v.provider.maximum_unresolved)
  c.addIssue({code:z.ZodIssueCode.custom,message:"NATIVE_CURRENT_RUNTIME_TARGET_MISMATCH"});
});
export type NativeCurrentRuntimeReference=z.infer<typeof reference>;
export class NativeCurrentRuntimeError extends Error {
 readonly code="NATIVE_CURRENT_RUNTIME_CONFIG_INVALID";
 constructor(){super("The private current read composition is not available.");}
}
const fail=():never=>{throw new NativeCurrentRuntimeError();};
function certificates(bytes:Buffer):X509Certificate[]{
 const source=new TextDecoder("utf-8",{fatal:true}).decode(bytes),blocks=source.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/gu);
 if(!blocks?.length||blocks.length>16||blocks.join("").replace(/\s/gu,"")!==source.replace(/\s/gu,""))return fail();
 const now=Date.now();return blocks.map(block=>{const cert=new X509Certificate(block);
  if(now<Date.parse(cert.validFrom)||now>=Date.parse(cert.validTo))return fail();return cert;});
}
export interface PreparedNativeCurrentRuntime {
 readonly poolProfile:Readonly<CorePoolProfile>;readonly schemaTarget:Readonly<NativeCoreSchemaTarget>;
 readonly provider:NativeCurrentRelationsProviderConfig;readonly transport:NativeCurrentRelationsSourceClientConfig;
 readonly egress:z.infer<typeof nativeCurrentRuntimeManifest>["egress"];readonly shutdownDeadlineMs:number;
}
export function nativeCurrentRuntimeReference(env:NodeJS.ProcessEnv=process.env):NativeCurrentRuntimeReference|undefined {
 const path=env.CONTROL_API_NATIVE_CURRENT_CONFIG_FILE,sha256=env.CONTROL_API_NATIVE_CURRENT_CONFIG_SHA256;
 if(path===undefined&&sha256===undefined)return undefined;
 try{return reference.parse({path,sha256});}catch{return fail();}
}
/** Exact references, nofollow/owner/mode/hash checks use the shared reader.
 * Raw key/config buffers are wiped, no secret or source exception is logged. */
export async function prepareNativeCurrentRuntime(input:NativeCurrentRuntimeReference):Promise<PreparedNativeCurrentRuntime>{
 const raw:Buffer[]=[],outputs:Buffer[]=[];let complete=false;
 try{
  const read=async(pin:NativeCurrentRuntimeReference,maximum:number)=>{const value=await readNativeRuntimeReference(pin,maximum);raw.push(value);return value;};
  const bytes=await read(reference.parse(input),65536),value=nativeCurrentRelationsDecode(bytes,65536);
  if(nativeCurrentRelationsCanonical(value)!==bytes.toString("utf8"))return fail();
  const parsed=nativeCurrentRuntimeManifest.parse(value),pins=parsed.transport.tls;
  const pem=async(pin:NativeCurrentRuntimeReference)=>{const value=Buffer.from(await read(pin,32768));outputs.push(value);return value;};
  const key=await pem(pins.key_ref),cert=await pem(pins.cert_ref),ca=await pem(pins.ca_ref);
  const chain=certificates(cert),roots=certificates(ca),leaf=chain[0]!;
  if(leaf.ca||roots.some(root=>!root.ca)||!leaf.keyUsage?.includes("1.3.6.1.5.5.7.3.2"))return fail();
  for(let i=0;i<chain.length-1;i++){const child=chain[i]!,issuer=chain[i+1]!;
   if(!issuer.ca||!child.checkIssued(issuer)||!child.verify(issuer.publicKey))return fail();}
  const last=chain[chain.length-1]!;
  if(!roots.some(root=>last.checkIssued(root)&&last.verify(root.publicKey)))return fail();
  const privateKey=createPrivateKey(await read(parsed.terminal.private_key_ref,16384));
  if(privateKey.asymmetricKeyType!=="ed25519"||!leaf.checkPrivateKey(createPrivateKey(key)))return fail();
  createSecureContext({key,cert,ca,minVersion:"TLSv1.3",maxVersion:"TLSv1.3"});
  const {private_key_ref:_ref,...terminal}=parsed.terminal,{tls:_tls,...transport}=parsed.transport;
  complete=true;
  return Object.freeze({poolProfile:Object.freeze({...parsed.pool_profile}),schemaTarget:Object.freeze(parsed.schema_target),
   provider:{...parsed.provider,terminal:{...terminal,private_key:privateKey}},transport:{...transport,tls:{key,cert,ca}},
   egress:Object.freeze({...parsed.egress}),shutdownDeadlineMs:parsed.shutdown_deadline_ms});
 }catch{return fail();}finally{raw.forEach(b=>b.fill(0));if(!complete)outputs.forEach(b=>b.fill(0));}
}

/** Private injection is selected only for the named Paper Account360 route.
 * Normal readers/mutations retain their independent provider; no global switch
 * quietly disables them and no detached DTO is labelled native SERVED. */
export class NativeCurrentAccountScopes {
 constructor(readonly scopes:ExecutionReadScopes){}
}
export async function prepareNativeCurrentApplication(pool:Pool,runtime:PreparedNativeCurrentRuntime){
 try{
  await assertRegisteredResearchCurrentHumanSchema(pool,runtime.schemaTarget);
  const tables=await pool.query("SELECT to_regclass('public.portal_native_current_read_obligations') AS custody");
  if(!tables.rows[0]?.custody)return fail();
  const client=new NativeCurrentRelationsSourceClient(runtime.transport),egress=new NativeReadEgress(runtime.egress),
   provider=new NativeCurrentRelationsProvider(pool,client,egress,runtime.provider);
  return Object.freeze({provider,createScopes:(auth:AuthService,trust:AccessTrustProvider,config:ControlApiConfig)=>
   new NativeCurrentAccountScopes(new ExecutionReadScopes(pool,new ExecutionAccessService(pool,auth,provider.compose(trust)),config)),
   shutdown:()=>provider.shutdown(runtime.shutdownDeadlineMs)});
 }finally{for(const bytes of Object.values(runtime.transport.tls))if(Buffer.isBuffer(bytes))bytes.fill(0);}
}
export type PreparedNativeCurrentApplication=Awaited<ReturnType<typeof prepareNativeCurrentApplication>>;
