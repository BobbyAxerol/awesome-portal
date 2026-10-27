/** TEST_ONLY actual TLS1.3 sockets with synthetic Edge/authority. No real
 * source outcome, PostgreSQL, PM approval or commissioning is claimed. */
import { createHash, generateKeyPairSync, X509Certificate } from "node:crypto";
import { createServer, type Server } from "node:https";
import type { Duplex } from "node:stream";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { accessDigest } from "../src/execution-v2/access-digest";
import { commandAuthorization } from "../src/execution-v2/command-trust";
import { commandIntent } from "../src/execution-v2/command.contract";
import { CommandSourceAssertionAuthority, COMMAND_STATUS_EDGE_PATH, type CommandStatusInput } from "../src/execution-v2/command-source-assertion";
import { EdgeCommandStatusTransport, COMMAND_STATUS_ORIGINAL_PATH, createAuthenticatedEdgeCurrentRequesterStatus,
  type EdgeCommandStatusTransportConfig } from "../src/execution-v2/edge-command-status-transport";
import { pmHttpRequestDigest } from "../src/execution-v2/pm-http-request-binding";
import { commonName,testCertificate,type TestAuthority } from "./fixtures/elp210-test-certificates";

const contractsDir=process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname,"../../../packages/contracts");
const fixture=JSON.parse(readFileSync(resolve(contractsDir,"fixtures/execution-trusted-commands.synthetic.valid.json"),"utf8"));
const actor={user_id:"TEST_ONLY:current-reviewer",session_id:"TEST_ONLY:session",session_generation:3};
const intent=commandIntent.parse(fixture.intent);
const authorization=commandAuthorization.parse({qualification:"OWNER_VERIFIED",reference:"TEST_ONLY:authorization",authority_ref:"TEST_ONLY:source",
  profile_ref:"TEST_ONLY:paper",audience:"pma.management.v1",actor_id:"TEST_ONLY:original-author",ts_user_id:"TEST_ONLY:original-ts",
  workload_ref:"TEST_ONLY:workload",delegation_ref:"TEST_ONLY:delegation",mapping_revision:"TEST_ONLY:mapping",membership_revision:"TEST_ONLY:membership",
  membership_receipt_ref:"TEST_ONLY:receipt",workspace_id:intent.workspace_id,environment:intent.environment,operation:intent.business_payload.operation,
  resource_kind:intent.resource.kind,resource_id:intent.resource.id,policy_revision:intent.expected_policy_revision,
  intent_hash:accessDigest({actor_user_id:"TEST_ONLY:original-author",intent}),source_intent_digest:accessDigest("TEST_ONLY:source").slice(7),
  expected_versions:intent.business_payload.expected_versions,issued_at_ms:1,expires_at_ms:1000,idempotency_retained_until_ms:8e12,
  approval_required:false,required_approval_gate:null,approval:null,r2_basis:null,
  commit_checks:{human:true,workload:true,membership:true,scope:true,versions:true,capacity:true,approval:true}});
const original={gateway_ref:"TEST_ONLY:gateway",reference:"TEST_ONLY:original",authorization_digest:accessDigest(authorization),intent_hash:authorization.intent_hash,
  request_digest:accessDigest("TEST_ONLY:request"),transport_payload_digest:accessDigest("TEST_ONLY:payload"),source_intent_digest:authorization.source_intent_digest,
  source_key:["TEST_ONLY:scope","TOP_UP","TEST_ONLY:key"] as [string,string,string],target_ref:"TEST_ONLY:resolved-target"};
const coreRequest={schema_version:"execution.core-pm-original.v1",action:"STATUS",operation:"TOP_UP",key:"TEST_ONLY:key",
  payload:{TEST_ONLY:"owning source mapping"},payload_digest:original.transport_payload_digest,request_digest:original.request_digest};
type Identity={key:Buffer;cert:Buffer;ca:Buffer;pin:string};
describe("concrete explicitly selected command STATUS Edge port",()=>{
  let core:Identity,edge:Identity,foreign:Identity;
  const allocated:{server:Server;sockets:Set<Duplex>}[]=[];
  beforeAll(()=>{
    const pair=generateKeyPairSync("ec",{namedCurve:"prime256v1"}),name=commonName("TEST_ONLY:command-ca");
    const ca:TestAuthority={key:pair.privateKey,name,certificate:testCertificate(name,pair,{name,key:pair.privateKey},true)};
    const identity=(label:string):Identity=>{const p=generateKeyPairSync("ec",{namedCurve:"prime256v1"}),cert=testCertificate(commonName(label),p,ca,false);
      return {key:Buffer.from(p.privateKey.export({format:"pem",type:"pkcs8"})),cert,ca:ca.certificate,
        pin:`sha256:${createHash("sha256").update(new X509Certificate(cert).raw).digest("hex")}`};};
    core=identity("TEST_ONLY:command-core");edge=identity("TEST_ONLY:command-edge");foreign=identity("TEST_ONLY:other-edge");
  });
  afterEach(async()=>{for(const a of allocated.splice(0)){for(const s of a.sockets)s.destroy();if(a.server.listening)await new Promise<void>(r=>a.server.close(()=>r()));}});
  async function setup(){
    const requests:{path:string;body:Record<string,unknown>;authorization?:string}[]=[];
    let responseMutation=(value:Record<string,unknown>)=>value;
    const server=createServer({...edge,requestCert:true,rejectUnauthorized:true,minVersion:"TLSv1.3",maxVersion:"TLSv1.3"},(req,res)=>{
      const chunks:Buffer[]=[];req.on("data",c=>chunks.push(Buffer.from(c)));req.on("end",()=>{
        const body=JSON.parse(Buffer.concat(chunks).toString());requests.push({path:req.url!,body,authorization:req.headers.authorization});
        const value=req.url===COMMAND_STATUS_ORIGINAL_PATH?{schema_version:"execution.core-command-original-response.v1",original,
          status_request_utf8:JSON.stringify(coreRequest),pm_status_request_digest:accessDigest("TEST_ONLY:actual-pm-http-bytes")}:
          {schema_version:"execution.core-command-status-response.v1",original_digest:accessDigest(original),call_digest:body.call_digest,
            delivered_request_digest:pmHttpRequestDigest({method:"POST",raw_path:Buffer.from(COMMAND_STATUS_EDGE_PATH),query_string:Buffer.alloc(0),body:Buffer.from(JSON.stringify(body))},
              {request_bytes:131072}),full_outcome_custody:{reference:"TEST_ONLY:durable-full-outcome",digest:accessDigest("TEST_ONLY:full-source-outcome")},
            result:{authority_ref:authorization.authority_ref,profile_ref:authorization.profile_ref,workspace_id:intent.workspace_id,environment:"paper",
              operation:intent.business_payload.operation,resource_kind:intent.resource.kind,resource_id:intent.resource.id,
              idempotency_key:intent.business_payload.idempotency_key,source_intent_digest:authorization.source_intent_digest,delivery:"ACKNOWLEDGED",
              projection:"UNAVAILABLE",venue:"NOT_APPLICABLE",business:{state:"APPLIED",receipt_ref:"TEST_ONLY:receipt",source_event_ref:"TEST_ONLY:event",
                revision:"9007199254740993",amounts:{requested:intent.business_payload.amount,applied:intent.business_payload.amount,pending:"0",cancelled:"0",rejected:"0"}}}};
        const raw=JSON.stringify(responseMutation(value));res.writeHead(200,{"content-type":"application/json","content-length":Buffer.byteLength(raw),connection:"close"});res.end(raw);
      });
    });
    const sockets=new Set<Duplex>();for(const event of ["connection","secureConnection"] as const)server.on(event,s=>{sockets.add(s);s.once("close",()=>sockets.delete(s));});
    allocated.push({server,sockets});server.on("tlsClientError",()=>undefined);
    await new Promise<void>((r,j)=>{server.once("error",j);server.listen(0,"127.0.0.1",r);});
    const address=server.address();if(!address||typeof address==="string")throw new Error("TEST_ONLY:address");
    const config:EdgeCommandStatusTransportConfig={mode:"EXPLICIT_CURRENT_REQUESTER_STATUS_ONLY",origin:`https://127.0.0.1:${address.port}`,gateway_ref:original.gateway_ref,
      tls:{key:core.key,cert:core.cert,ca:core.ca},peer:{certificate_sha256:edge.pin,dns_name:"localhost"},
      limits:{maximum_in_flight:2,deadline_ms:1000,request_bytes:131072,response_bytes:65536,maximum_originals:4}};
    let sequence=0;
    const authority={prepare:vi.fn(async(input:CommandStatusInput,body:string)=>{
      const context=`TEST_ONLY:context-${++sequence}`,now=Date.now();return {original_context:context,token:"TEST_ONLY.signed.status",
        prepared:{gateway_ref:original.gateway_ref,action:"STATUS" as const,call_digest:input.call_digest,assertion_ref:context,authority:"CURRENT_HUMAN" as const,
          actor_id:input.actor.user_id,issued_at_ms:now,expires_at_ms:now+30000,
          delivered_request_digest:pmHttpRequestDigest({method:"POST",raw_path:Buffer.from(COMMAND_STATUS_EDGE_PATH),query_string:Buffer.alloc(0),body:Buffer.from(body)},
            {request_bytes:131072})}};
    }),check:vi.fn(async()=>undefined),acknowledgeRetainedRead:vi.fn(async()=>undefined)};
    const port=new EdgeCommandStatusTransport(authority as unknown as CommandSourceAssertionAuthority,config);
    const input:CommandStatusInput={actor,authorization,intent,original,action:"STATUS",call_digest:accessDigest("TEST_ONLY:call"),
      contract:{reference:"TEST_ONLY:contract",sha256:"a".repeat(64),edge_source_revision:"TEST_ONLY:source"},signal:new AbortController().signal};
    return {port,authority,input,requests,config,mutate:(fn:typeof responseMutation)=>{responseMutation=fn;}};
  }
  it("sends only fixed original/status routes with current-purpose token and exact source codec",async()=>{
    const f=await setup();expect(await f.port.original(f.input)).toEqual(original);
    const p=await f.port.prepareStatus(f.input),r=await f.port.status({...f.input,prepared:p.prepared});
    expect(r.result.business.revision).toBe("9007199254740993");expect(r.result.business.amounts?.applied).toBe(intent.business_payload.amount);
    expect(f.requests.map(r=>r.path)).toEqual([COMMAND_STATUS_ORIGINAL_PATH,COMMAND_STATUS_EDGE_PATH]);
    expect(f.requests[0].authorization).toBeUndefined();expect(f.requests[0].body).not.toHaveProperty("actor");
    expect(f.requests[1].authorization).toBe("Bearer TEST_ONLY.signed.status");expect(f.requests[1].body.core_request).toEqual(coreRequest);
    expect(f.authority.check).toHaveBeenCalledTimes(2);expect(f.port.snapshot().in_flight).toBe(0);
  });
  it("never starts HTTP for an unpinned but CA-valid Edge peer",async()=>{
    const f=await setup(),port=new EdgeCommandStatusTransport(f.authority as unknown as CommandSourceAssertionAuthority,
      {...f.config,peer:{...f.config.peer,certificate_sha256:foreign.pin}});
    await expect(port.original(f.input)).rejects.toThrow();expect(f.requests).toEqual([]);expect(f.authority.prepare).not.toHaveBeenCalled();
  });
  it("requires source original readback before prepare and refuses substituted original correlation",async()=>{
    const f=await setup();await expect(f.port.prepareStatus(f.input)).rejects.toThrow();
    f.mutate(v=>({...v,original:{...original,authorization_digest:accessDigest("wrong")}}));
    await expect(f.port.original(f.input)).rejects.toThrow();expect(f.authority.prepare).not.toHaveBeenCalled();
  });
  it("rejoins same delivery and never repeats the Edge request or source issue",async()=>{
    const f=await setup();await f.port.original(f.input);const p=await f.port.prepareStatus(f.input);
    const replies=await Promise.all(Array.from({length:4},()=>f.port.status({...f.input,prepared:p.prepared})));
    expect(replies).toHaveLength(4);expect(f.requests.filter(r=>r.path===COMMAND_STATUS_EDGE_PATH)).toHaveLength(1);
  });
  it("refuses a new preparation at capacity before issuing its source assertion",async()=>{
    const f=await setup();await f.port.original(f.input);
    for(let i=0;i<4;i++)await f.port.prepareStatus({...f.input,call_digest:accessDigest(`TEST_ONLY:call-${i}`)});
    expect(f.authority.prepare).toHaveBeenCalledTimes(4);
    await expect(f.port.prepareStatus({...f.input,call_digest:accessDigest("TEST_ONLY:overflow")}))
      .rejects.toMatchObject({code:"COMMAND_STATUS_EDGE_CAPACITY"});
    expect(f.authority.prepare).toHaveBeenCalledTimes(4);
    expect(f.port.snapshot().prepared).toBe(4);
  });
  it("reserves capacity across concurrently pending distinct preparations",async()=>{
    const f=await setup();await f.port.original(f.input);
    const prepare=f.authority.prepare.getMockImplementation()!;
    let release!:()=>void;
    const barrier=new Promise<void>(resolve=>{release=resolve;});
    f.authority.prepare.mockImplementation(async(input,body)=>{await barrier;return prepare(input,body);});
    const pending=Array.from({length:4},(_,i)=>f.port.prepareStatus({...f.input,call_digest:accessDigest(`TEST_ONLY:concurrent-${i}`)}));
    await expect(f.port.prepareStatus({...f.input,call_digest:accessDigest("TEST_ONLY:overflow")}))
      .rejects.toMatchObject({code:"COMMAND_STATUS_EDGE_CAPACITY"});
    expect(f.authority.prepare).toHaveBeenCalledTimes(4);
    release();await Promise.all(pending);expect(f.port.snapshot().prepared).toBe(4);
  });
  it("releases a failed reservation, without evicting existing preparations",async()=>{
    const f=await setup();await f.port.original(f.input);
    f.authority.prepare.mockRejectedValueOnce(new Error("TEST_ONLY:authority refused"));
    await expect(f.port.prepareStatus(f.input)).rejects.toThrow("authority refused");
    for(let i=0;i<4;i++)await f.port.prepareStatus({...f.input,call_digest:accessDigest(`TEST_ONLY:retry-${i}`)});
    expect(f.port.snapshot().prepared).toBe(4);
  });
  it("allows an existing exact unresolved preparation to be retried at capacity",async()=>{
    const f=await setup();await f.port.original(f.input);
    const prepare=f.authority.prepare.getMockImplementation()!;
    const issued=new Map<string,Awaited<ReturnType<typeof prepare>>>();
    f.authority.prepare.mockImplementation(async(input,body)=>{
      const key=accessDigest({input:{...input,signal:undefined},body});
      const old=issued.get(key);if(old)return old;
      const next=await prepare(input,body);issued.set(key,next);return next;
    });
    const calls=Array.from({length:4},(_,i)=>({...f.input,call_digest:accessDigest(`TEST_ONLY:retry-same-${i}`)}));
    const first=await f.port.prepareStatus(calls[0]);
    for(const call of calls.slice(1))await f.port.prepareStatus(call);
    expect(await f.port.prepareStatus(calls[0])).toEqual(first);
    expect(f.port.snapshot().prepared).toBe(4);
  });
  it("coalesces capacity for identical concurrent preparations",async()=>{
    const f=await setup();await f.port.original(f.input);
    const prepare=f.authority.prepare.getMockImplementation()!;
    let release!:()=>void;
    const barrier=new Promise<void>(resolve=>{release=resolve;});
    let shared:ReturnType<typeof prepare>|undefined;
    f.authority.prepare.mockImplementation((input,body)=>{
      shared??=barrier.then(()=>prepare(input,body));return shared;
    });
    const identical=Array.from({length:8},()=>f.port.prepareStatus(f.input));
    release();
    const results=await Promise.all(identical);
    expect(results.every(result=>result.prepared.assertion_ref===results[0].prepared.assertion_ref)).toBe(true);
    expect(f.port.snapshot().prepared).toBe(1);
  });
  it("final current-authority revoke hides held full source result",async()=>{
    const f=await setup();await f.port.original(f.input);const p=await f.port.prepareStatus(f.input);
    f.authority.check.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("TEST_ONLY:revoked"));
    await expect(f.port.status({...f.input,prepared:p.prepared})).rejects.toThrow("revoked");
    expect(f.requests).toHaveLength(2);
  });
  it("rejects known result without full owning outcome custody",async()=>{
    const f=await setup();await f.port.original(f.input);const p=await f.port.prepareStatus(f.input);
    f.mutate(v=>({...v,full_outcome_custody:null}));await expect(f.port.status({...f.input,prepared:p.prepared})).rejects.toThrow();
  });
  it.each(["enable_live","pm_url","allow_submit"])("rejects extra configuration authority %s",async field=>{
    const f=await setup();expect(()=>new EdgeCommandStatusTransport(f.authority as unknown as CommandSourceAssertionAuthority,
      {...f.config,[field]:true})).toThrow();
  });
  it("actual factory refuses UNBOUND/Sandbox/Live before constructing a source port",async()=>{
    const f=await setup();const base={prepare:vi.fn(),send:vi.fn(),lookup:vi.fn()};
    expect(()=>createAuthenticatedEdgeCurrentRequesterStatus({requester_status:"UNCOMMISSIONED"} as never,base,
      f.authority as unknown as CommandSourceAssertionAuthority,f.config)).toThrow();expect(base.send).not.toHaveBeenCalled();
  });
});
