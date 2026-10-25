/** TEST_ONLY lifecycle/constructor coverage. No DB/source receipt, command,
 * accepted human, original or runtime commissioning is represented by doubles. */
import { EventEmitter } from "node:events";
import type { AddressInfo } from "node:net";
import type { Pool } from "pg";
import { generateKeyPair } from "jose";
import { afterEach,beforeAll,beforeEach,describe,expect,it,vi } from "vitest";
import type { ExecutionAccessService } from "../src/execution-v2/access.service";
import { CurrentHumanCandidate } from "../src/execution-v2/current-human-candidate";
import { CurrentHumanMutations } from "../src/execution-v2/current-human-mutations";
import { CommandSourceAssertionAuthority } from "../src/execution-v2/command-source-assertion";
import { CommandStatusComposition,type CommandStatusCompositionConfig } from "../src/execution-v2/command-status-composition";
import { unqualifiedCommandTrust,type CommandTrust } from "../src/execution-v2/command-trust";

const factories=vi.hoisted(()=>({assertion:vi.fn(),reverse:vi.fn(),edge:vi.fn()}));
vi.mock("../src/execution-v2/command-source-assertion-transport",()=>({createCommandSourceAssertionTransport:factories.assertion}));
vi.mock("../src/execution-v2/current-human-transport",()=>({createCurrentHumanTransport:factories.reverse}));
vi.mock("../src/execution-v2/edge-command-status-transport",async original=>({
  ...await original<typeof import("../src/execution-v2/edge-command-status-transport")>(),
  createAuthenticatedEdgeCurrentRequesterStatus:factories.edge,
}));

let nextPort=31000;
class TestServer extends EventEmitter {
  listening=false;fail=false;holdClose=false;
  private generation=0;private selected:AddressInfo|null=null;private callbacks:(()=>void)[]=[];
  listen(port:number,host:string,done:()=>void){const generation=this.generation;queueMicrotask(()=>{
    if(generation!==this.generation)return;if(this.fail){this.emit("error",new Error("TEST_ONLY_BIND_FAILURE"));return;}
    this.listening=true;this.selected={address:host,port:port||++nextPort,family:"IPv4"};done();});return this;}
  address(){return this.selected;}
  close(callback?:()=>void){this.generation++;this.listening=false;this.selected=null;
    const finish=()=>{this.emit("close");callback?.();};if(this.holdClose)this.callbacks.push(finish);else queueMicrotask(finish);return this;}
  finishClose(){this.holdClose=false;this.callbacks.splice(0).forEach(f=>f());}
}
type Counts={in_flight:number;accepted:number;denied:number;timed_out:number};
type Transport={server:TestServer;counts:Counts;snapshot():Counts};
const transports:Transport[]=[],compositions:CommandStatusComposition[]=[];
const targets={assertion:{host:"127.0.0.1",port:0},reverse:{host:"127.0.0.1",port:0}};
const deferred=<T>()=>{let resolve!:(value:T)=>void;return {promise:new Promise<T>(done=>{resolve=done;}),resolve};};
function transport(){const t={server:new TestServer(),counts:{in_flight:0,accepted:0,denied:0,timed_out:0},snapshot(){return {...this.counts};}};transports.push(t);return t;}

describe("private current-requester STATUS application composition",()=>{
  let keys:Awaited<ReturnType<typeof generateKeyPair>>;
  beforeAll(async()=>{keys=await generateKeyPair("EdDSA",{crv:"Ed25519",extractable:true});});
  beforeEach(()=>{
    factories.assertion.mockReset().mockImplementation(()=>transport());factories.reverse.mockReset().mockImplementation(()=>transport());
    factories.edge.mockReset().mockImplementation((_binding,base)=>({port:{snapshot:()=>({in_flight:0,originals:0,prepared:0})},
      trust:{prepare:base.prepare.bind(base),send:base.send.bind(base),lookup:base.lookup.bind(base),lookupCurrentRequester:vi.fn(async()=>null)}}));
    transports.length=0;
  });
  afterEach(async()=>{for(const t of transports)t.server.finishClose();for(const c of compositions.splice(0))await c.shutdown();vi.restoreAllMocks();});
  function config():CommandStatusCompositionConfig {
    const tls=()=>({key:Buffer.from("TEST_ONLY-key"),cert:Buffer.from("TEST_ONLY-cert"),ca:Buffer.from("TEST_ONLY-ca")});
    return {candidate:{issuer:"TEST_ONLY-core",audience:"TEST_ONLY-pm",key_id:"TEST_ONLY-human-key",private_key:keys.privateKey,
      source:{issuer:"TEST_ONLY-pm",audience:"TEST_ONLY-core",key_id:"TEST_ONLY-pm-key",public_key:keys.publicKey,workload_id:"TEST_ONLY-status-workload"},
      limits:{ttl_ms:30000,maximum_unresolved:2,maximum_retained:32},
      installation_scope:{workspace_id:"TEST_ONLY-workspace",environment:"paper",valid_until_ms:Date.now()+60000}},
      authority:{issuer:"TEST_ONLY-core-status",audience:"TEST_ONLY-edge-gateway",key_id:"TEST_ONLY-status-key",key:keys.privateKey,
        workload_id:"TEST_ONLY-status-workload",ttl_ms:30000,maximum_contexts:4,maximum_requests_per_context:4},
      assertion_transport:{tls:tls(),peer:{certificate_sha256:`sha256:${"a".repeat(64)}`,dns_name:"localhost",workload_id:"TEST_ONLY-status-workload"},
        limits:{maximum_in_flight:2,request_bytes:32768,response_bytes:32768,deadline_ms:1000}},
      current_human_transport:{tls:tls(),source_certificate_sha256:`sha256:${"b".repeat(64)}`,
        limits:{maximum_in_flight:2,request_bytes:32768,deadline_ms:1000}},
      gateway_binding:{selection:{gateway_ref:"TEST_ONLY-edge-gateway",qualification:"OWNER_VERIFIED",operations:["TOP_UP"],recovery:"UNCOMMISSIONED"},
        scope:{workspace_id:"TEST_ONLY-workspace",environment:"paper",authority_ref:"TEST_ONLY-pm",profile_ref:"TEST_ONLY-paper"},
        edge_contract:{reference:"TEST_ONLY-contract",sha256:"c".repeat(64),edge_source_revision:"TEST_ONLY-source"},requester_status:"FRESH_CURRENT_HUMAN"},
      edge_transport:{mode:"EXPLICIT_CURRENT_REQUESTER_STATUS_ONLY",origin:"https://127.0.0.1:31443",gateway_ref:"TEST_ONLY-edge-gateway",tls:tls(),
        peer:{certificate_sha256:`sha256:${"a".repeat(64)}`,dns_name:"localhost"},
        limits:{maximum_in_flight:2,deadline_ms:1000,request_bytes:32768,response_bytes:65536,maximum_originals:4}},shutdown_deadline_ms:30};
  }
  async function setup(input=config(),bind=true){
    const query=vi.fn(),end=vi.fn(),pool={options:{connectionTimeoutMillis:1000,query_timeout:3000},query,end} as unknown as Pool;
    const c=await CommandStatusComposition.create(pool,input);compositions.push(c);
    const access={usesPool:(p:unknown)=>p===pool} as ExecutionAccessService,recovery={recover:vi.fn(async()=>undefined)};
    const participant=c.reverseRecoveryParticipant(recovery),main=await CurrentHumanCandidate.create(pool,input.candidate);
    const coordinator=new CurrentHumanMutations(pool,main,recovery,{maximum_intents:8,maximum_recoveries_per_request:2},undefined,[participant]);
    const trust=bind?c.statusTrust(access,unqualifiedCommandTrust,coordinator):undefined;
    return {c,pool,query,end,access,recovery,participant,coordinator,trust,reverse:transports[0],assertion:transports[1]};
  }
  it("constructs OFF before AppModule with no DB/source/original, then binds exact shared access/coordinator/candidate",async()=>{
    const f=await setup();expect(f.c.snapshot()).toMatchObject({state:"CREATED",bound:true,recovery_registered:true,
      authority:{contexts:0,pending:0,stopped:false},listeners:{assertion:null,reverse:null}});
    expect(f.query).not.toHaveBeenCalled();expect(f.end).not.toHaveBeenCalled();
    expect(f.participant.candidate).toBe(factories.reverse.mock.calls[0][0]);
    expect(f.participant.candidate).toBeInstanceOf(CurrentHumanCandidate);
    expect(f.coordinator.hasReverseRecoveryParticipant(f.participant)).toBe(true);
    expect(factories.edge.mock.calls[0][2]).toBeInstanceOf(CommandSourceAssertionAuthority);
    await expect(f.trust!.lookupCurrentRequester!({} as never)).rejects.toMatchObject({code:"COMMAND_STATUS_COMPOSITION_NOT_RUNNING"});
  });
  it("uses the actual STATUS-only factory without issuing original or context during construction",async()=>{
    const actual=await vi.importActual<typeof import("../src/execution-v2/edge-command-status-transport")>("../src/execution-v2/edge-command-status-transport");
    factories.edge.mockImplementation(actual.createAuthenticatedEdgeCurrentRequesterStatus);
    const f=await setup();expect(f.c.snapshot()).toMatchObject({edge:{in_flight:0,originals:0,prepared:0},authority:{contexts:0}});
    expect(f.query).not.toHaveBeenCalled();expect(f.end).not.toHaveBeenCalled();
  });
  it("requires actual exact reverse participant registration and shared pool before admission",async()=>{
    const f=await setup(config(),false),other=await CurrentHumanCandidate.create(f.pool,config().candidate);
    const unregistered=new CurrentHumanMutations(f.pool,other,f.recovery,{maximum_intents:8,maximum_recoveries_per_request:2});
    expect(()=>f.c.statusTrust(f.access,unqualifiedCommandTrust,unregistered)).toThrowError(expect.objectContaining({code:"COMMAND_STATUS_COMPOSITION_RECOVERY_NOT_REGISTERED"}));
    expect(()=>f.c.statusTrust({usesPool:()=>false} as unknown as ExecutionAccessService,unqualifiedCommandTrust,f.coordinator))
      .toThrowError(expect.objectContaining({code:"COMMAND_STATUS_COMPOSITION_CONFIG_INVALID"}));
    expect(factories.edge).not.toHaveBeenCalled();expect(f.query).not.toHaveBeenCalled();
    await expect(f.c.start(targets)).rejects.toMatchObject({code:"COMMAND_STATUS_COMPOSITION_CONFIG_INVALID"});
  });
  it("starts two explicit private listeners and routes only explicit issue/completion to their shared authority",async()=>{
    const f=await setup(),authority=factories.edge.mock.calls[0][2] as CommandSourceAssertionAuthority;
    const issue=vi.spyOn(authority,"issue").mockRejectedValue(new Error("TEST_ONLY_ISSUE")),complete=vi.spyOn(authority,"complete").mockRejectedValue(new Error("TEST_ONLY_COMPLETE"));
    const callbacks=factories.assertion.mock.calls[0][0];
    await expect(callbacks.issue("TEST_ONLY",{})).rejects.toMatchObject({code:"COMMAND_STATUS_COMPOSITION_NOT_RUNNING"});
    const addresses=await f.c.start(targets);expect(addresses.assertion.port).not.toBe(addresses.reverse.port);
    await expect(callbacks.issue("TEST_ONLY",{})).rejects.toThrow("TEST_ONLY_ISSUE");expect(issue).toHaveBeenCalledOnce();
    expect(complete).not.toHaveBeenCalled();await expect(callbacks.complete("TEST_ONLY",{})).rejects.toThrow("TEST_ONLY_COMPLETE");
    expect(complete).toHaveBeenCalledOnce();await f.c.shutdown();expect(complete).toHaveBeenCalledOnce();
    expect(f.end).not.toHaveBeenCalled();expect(f.query).not.toHaveBeenCalled();
  });
  it("preserves original command methods but adds no submit/service recovery authority",async()=>{
    const f=await setup(config(),false),base:CommandTrust={prepare:vi.fn(async()=>null),send:vi.fn(async()=>{throw new Error("TEST_ONLY_SOURCE_OFF");}),lookup:vi.fn(async()=>null)};
    const trust=f.c.statusTrust(f.access,base,f.coordinator);await trust.prepare({} as never);await trust.lookup({} as never);
    await expect(trust.send({} as never)).rejects.toThrow("TEST_ONLY_SOURCE_OFF");
    expect(base.prepare).toHaveBeenCalledOnce();expect(base.lookup).toHaveBeenCalledOnce();expect(base.send).toHaveBeenCalledOnce();
    expect(f.query).not.toHaveBeenCalled();
  });
  it("holds pending requester STATUS through bounded shutdown and does not return late data or fake source ACK",async()=>{
    const f=await setup(),held=deferred<null>();await f.c.start(targets);
    const source=factories.edge.mock.results[0].value.trust.lookupCurrentRequester;source.mockReturnValue(held.promise);
    const input={actor:{user_id:"TEST_ONLY-caller",session_id:"TEST_ONLY-session",session_generation:1},authorization:{},intent:{},signal:new AbortController().signal};
    const pending=f.trust!.lookupCurrentRequester!(input as never).catch(e=>e);input.actor.user_id="TEST_ONLY-mutated";
    await vi.waitFor(()=>expect(source).toHaveBeenCalledOnce());expect(source.mock.calls[0][0].actor.user_id).toBe("TEST_ONLY-caller");
    await expect(f.c.shutdown()).rejects.toMatchObject({code:"COMMAND_STATUS_COMPOSITION_SHUTDOWN_PENDING"});
    expect(f.c.snapshot()).toMatchObject({state:"STOPPING",pending_uses:1});
    await expect(f.trust!.lookupCurrentRequester!({} as never)).rejects.toMatchObject({code:"COMMAND_STATUS_COMPOSITION_NOT_RUNNING"});
    held.resolve(null);expect(await pending).toMatchObject({code:"COMMAND_STATUS_COMPOSITION_NOT_RUNNING"});
    await f.c.shutdown();expect(f.c.snapshot()).toMatchObject({state:"STOPPED",pending_uses:0});expect(f.end).not.toHaveBeenCalled();
  });
  it("does not release pending assertion/reverse DB custody just because listeners close",async()=>{
    const f=await setup();await f.c.start(targets);f.assertion.counts.in_flight=1;f.reverse.counts.in_flight=1;
    await expect(f.c.shutdown()).rejects.toMatchObject({code:"COMMAND_STATUS_COMPOSITION_SHUTDOWN_PENDING"});
    f.assertion.counts.in_flight=0;await expect(f.c.shutdown()).rejects.toMatchObject({code:"COMMAND_STATUS_COMPOSITION_SHUTDOWN_PENDING"});
    f.reverse.counts.in_flight=0;await f.c.shutdown();expect(f.c.snapshot().state).toBe("STOPPED");expect(f.end).not.toHaveBeenCalled();
  });
  it("closes first listener if the second bind fails and waits physical close callbacks",async()=>{
    const f=await setup();f.reverse.server.fail=true;f.assertion.server.holdClose=true;
    await expect(f.c.start(targets)).rejects.toMatchObject({code:"COMMAND_STATUS_COMPOSITION_START_FAILED"});
    await expect(f.c.shutdown()).rejects.toMatchObject({code:"COMMAND_STATUS_COMPOSITION_SHUTDOWN_PENDING"});
    f.assertion.server.finishClose();await f.c.shutdown();expect(f.c.snapshot().state).toBe("STOPPED");
  });
  const invalid:[string,(c:CommandStatusCompositionConfig)=>void][]=[
    ["non-Paper candidate",c=>Reflect.set(c.candidate.installation_scope!,"environment","live")],
    ["wrong workspace",c=>{c.gateway_binding.scope.workspace_id="TEST_ONLY-other";}],
    ["wrong source workload",c=>{c.candidate.source.workload_id="TEST_ONLY-other";}],
    ["wrong assertion workload",c=>{c.assertion_transport.peer.workload_id="TEST_ONLY-other";}],
    ["wrong audience",c=>{c.authority.audience="TEST_ONLY-other";}],
    ["wrong Edge gateway",c=>{c.edge_transport.gateway_ref="TEST_ONLY-other";}],
    ["unqualified gateway",c=>{c.gateway_binding.selection.qualification="UNBOUND";}],
    ["missing Edge contract",c=>{c.gateway_binding.edge_contract=null;}],
    ["uncommissioned requester",c=>{c.gateway_binding.requester_status="UNCOMMISSIONED";}],
    ["empty admitted operations",c=>{c.gateway_binding.selection.operations=[];}],
    ["identity ttl above 30s",c=>{c.candidate.limits.ttl_ms=30001;}],
    ["authority ttl above 30s",c=>{c.authority.ttl_ms=30001;}],
    ["shutdown above 5s",c=>{c.shutdown_deadline_ms=5001;}],
  ];
  it.each(invalid)("rejects %s before candidate construction",async(_label,mutate)=>{
    const c=config();mutate(c);const factory=vi.spyOn(CurrentHumanCandidate,"create");
    await expect(CommandStatusComposition.create({} as Pool,c)).rejects.toMatchObject({code:"COMMAND_STATUS_COMPOSITION_CONFIG_INVALID"});
    expect(factory).not.toHaveBeenCalled();expect(factories.reverse).not.toHaveBeenCalled();
  });
  it.each(["0.0.0.0","::","8.8.8.8","localhost"])("rejects public/default/DNS listener %s",async host=>{
    const f=await setup();await expect(f.c.start({...targets,assertion:{host,port:0}})).rejects.toMatchObject({code:"COMMAND_STATUS_COMPOSITION_CONFIG_INVALID"});
    expect(f.c.snapshot().state).toBe("CREATED");expect(f.reverse.server.listening).toBe(false);
  });
  it("copies config, pins and TLS bytes before async candidate preparation settles",async()=>{
    const c=config(),pool={options:{connectionTimeoutMillis:1000,query_timeout:3000}} as Pool,
      real=await CurrentHumanCandidate.create(pool,c.candidate),held=deferred<CurrentHumanCandidate>();
    const create=vi.spyOn(CurrentHumanCandidate,"create").mockReturnValue(held.promise);
    const pending=CommandStatusComposition.create(pool,c);c.authority.workload_id="TEST_ONLY-changed";
    c.gateway_binding.selection.gateway_ref="TEST_ONLY-changed";(c.current_human_transport.tls.key as Buffer).fill(0);
    held.resolve(real);const composition=await pending;compositions.push(composition);
    expect(create.mock.calls[0][1].source.workload_id).toBe("TEST_ONLY-status-workload");
    expect(factories.reverse.mock.calls[0][1].tls.key).toEqual(Buffer.from("TEST_ONLY-key"));
  });
});
