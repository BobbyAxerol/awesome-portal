import { isIP,type AddressInfo } from "node:net";
import type { Server,ServerOptions } from "node:https";
import type { Duplex } from "node:stream";
import { performance } from "node:perf_hooks";
import type { Pool } from "pg";
import { ExecutionAccessService } from "./access.service";
import type { CommandTrust } from "./command-trust";
import { CurrentHumanCandidate,type CurrentHumanCandidateConfig } from "./current-human-candidate";
import { CurrentHumanMutations,type CurrentHumanRecoveryPort,type CurrentHumanReverseRecoveryParticipant } from "./current-human-mutations";
import { createCurrentHumanTransport,type CurrentHumanTransportConfig } from "./current-human-transport";
import { CommandSourceAssertionAuthority,type CommandStatusAuthorityConfig } from "./command-source-assertion";
import { createCommandSourceAssertionTransport,type CommandSourceAssertionTransportConfig } from "./command-source-assertion-transport";
import { createAuthenticatedEdgeCurrentRequesterStatus,type EdgeCommandStatusTransportConfig } from "./edge-command-status-transport";
import { inspectEdgeCommandGatewayBinding,type EdgeCommandGatewayBinding } from "./edge-command-gateway-binding";
import { PgCommandStatusOriginalFingerprints } from "./command-status-original-fingerprints";

export interface CommandStatusCompositionConfig {
  candidate:CurrentHumanCandidateConfig;
  authority:CommandStatusAuthorityConfig;
  assertion_transport:CommandSourceAssertionTransportConfig;
  current_human_transport:CurrentHumanTransportConfig;
  gateway_binding:EdgeCommandGatewayBinding;
  edge_transport:EdgeCommandStatusTransportConfig;
  shutdown_deadline_ms:number;
}
export type CommandStatusListenerTarget={host:string;port:number};
export type CommandStatusListenerTargets={assertion:CommandStatusListenerTarget;reverse:CommandStatusListenerTarget};
type State="CREATED"|"STARTING"|"RUNNING"|"STOPPING"|"STOPPED"|"FAILED";
export class CommandStatusCompositionError extends Error {
  constructor(readonly code:"COMMAND_STATUS_COMPOSITION_CONFIG_INVALID"|"COMMAND_STATUS_COMPOSITION_NOT_RUNNING"|
    "COMMAND_STATUS_COMPOSITION_START_FAILED"|"COMMAND_STATUS_COMPOSITION_SHUTDOWN_PENDING"|
    "COMMAND_STATUS_COMPOSITION_RECOVERY_NOT_REGISTERED") {super("The private command STATUS composition is unavailable.");}
}
const failure=(code:CommandStatusCompositionError["code"])=>new CommandStatusCompositionError(code);
const bounded=(n:number,min:number,max:number)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const privateHost=(host:string)=>typeof host==="string"&&(isIP(host)===4?
  /^(?:127\.|10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)/u.test(host):
  isIP(host)===6&&(host==="::1"||/^(?:fc|fd)/iu.test(host)));
const validTarget=(t:CommandStatusListenerTarget)=>t&&privateHost(t.host)&&bounded(t.port,0,65535);
function copyTlsValue<T>(value:T):T {
  if(Buffer.isBuffer(value))return Buffer.from(value) as T;
  if(Array.isArray(value))return value.map(copyTlsValue) as T;
  if(value&&typeof value==="object"&&Object.getPrototypeOf(value)===Object.prototype)
    return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,copyTlsValue(v)])) as T;
  return value;
}
const copyTls=(tls:Pick<ServerOptions,"key"|"cert"|"ca">)=>({key:copyTlsValue(tls.key),cert:copyTlsValue(tls.cert),ca:copyTlsValue(tls.ca)});

/** Concrete STATUS-only application composition, initially OFF. Creation has
 * no original/context/lease, source I/O or listener. The application first
 * registers this EXACT reverse candidate with its shared mutation coordinator,
 * then supplies its actual shared AccessService to statusTrust(). Both private
 * listeners and assertion issuance use the SAME real candidate; no second
 * command identity authority or fabricated completion is introduced.
 *
 * prepare/send/service lookup remain owned by the original CommandTrust.
 * Only lookupCurrentRequester is added; it always asks for the current caller,
 * never the historic author's session. Completion still requires the existing
 * authenticated source terminal AND explicit Edge response acknowledgment.
 * Shutdown preserves all persisted custody and waits for actual pending work
 * before the application may finalize its shared pool.
 */
export class CommandStatusComposition {
  private state:State="CREATED";
  private readonly reverse:ReturnType<typeof createCurrentHumanTransport>;
  private assertion?:ReturnType<typeof createCommandSourceAssertionTransport>;
  private authority?:CommandSourceAssertionAuthority;
  private status?:ReturnType<typeof createAuthenticatedEdgeCurrentRequesterStatus>;
  private participant?:CurrentHumanReverseRecoveryParticipant;
  private boundTrust?:CommandTrust;
  private readonly uses=new Set<Promise<unknown>>();
  private readonly sockets=new Set<Duplex>();
  private readonly closing=new Set<Server>();
  private startingPending=0;
  private stopping?:Promise<void>;

  private constructor(private readonly pool:Pool,private readonly candidate:CurrentHumanCandidate,
    private readonly config:CommandStatusCompositionConfig) {
    this.reverse=createCurrentHumanTransport(candidate,config.current_human_transport);
    this.track(this.reverse.server);
  }
  usesPool(pool:Pool):boolean{return this.pool===pool;}
  static async create(pool:Pool,input:CommandStatusCompositionConfig):Promise<CommandStatusComposition> {
    if(!input||!input.candidate?.installation_scope||input.candidate.installation_scope.environment!=="paper"||
      input.candidate.c2_delivery_schema_required!==undefined||
      !bounded(input.candidate.limits?.ttl_ms,1000,30000)||!bounded(input.shutdown_deadline_ms,1,5000)||
      inspectEdgeCommandGatewayBinding(input.gateway_binding).state==="REFUSED"||
      input.gateway_binding.requester_status!=="FRESH_CURRENT_HUMAN"||input.gateway_binding.scope.environment!=="paper"||
      input.gateway_binding.selection.qualification!=="OWNER_VERIFIED"||input.gateway_binding.edge_contract===null||
      input.gateway_binding.selection.operations.length===0||
      input.gateway_binding.scope.workspace_id!==input.candidate.installation_scope.workspace_id||
      input.candidate.source?.workload_id!==input.authority?.workload_id||
      input.authority.workload_id!==input.assertion_transport?.peer?.workload_id||
      input.authority.audience!==input.gateway_binding.selection.gateway_ref||
      input.edge_transport?.gateway_ref!==input.gateway_binding.selection.gateway_ref||
      input.edge_transport.mode!=="EXPLICIT_CURRENT_REQUESTER_STATUS_ONLY"||
      !bounded(input.authority.ttl_ms,1000,30000)||!bounded(input.authority.maximum_contexts,1,128)||
      !bounded(input.authority.maximum_requests_per_context,1,64))
      throw failure("COMMAND_STATUS_COMPOSITION_CONFIG_INVALID");
    const config:CommandStatusCompositionConfig={
      candidate:{...input.candidate,source:{...input.candidate.source},limits:{...input.candidate.limits},
        installation_scope:{...input.candidate.installation_scope},
        ...(input.candidate.native_read_custody?{native_read_custody:{...input.candidate.native_read_custody,
          domain:{...input.candidate.native_read_custody.domain}}}:{})},
      authority:{...input.authority},gateway_binding:structuredClone(input.gateway_binding),
      assertion_transport:{...input.assertion_transport,tls:copyTls(input.assertion_transport.tls),
        peer:{...input.assertion_transport.peer},limits:{...input.assertion_transport.limits}},
      current_human_transport:{...input.current_human_transport,tls:copyTls(input.current_human_transport.tls),
        limits:{...input.current_human_transport.limits}},
      edge_transport:{...input.edge_transport,tls:{key:copyTlsValue(input.edge_transport.tls.key),
        cert:copyTlsValue(input.edge_transport.tls.cert),ca:copyTlsValue(input.edge_transport.tls.ca)},
        peer:{...input.edge_transport.peer},limits:{...input.edge_transport.limits}},
      shutdown_deadline_ms:input.shutdown_deadline_ms,
    };
    const candidate=await CurrentHumanCandidate.create(pool,config.candidate);
    return new CommandStatusComposition(pool,candidate,config);
  }
  reverseRecoveryParticipant(recovery:CurrentHumanRecoveryPort):CurrentHumanReverseRecoveryParticipant {
    if(this.state!=="CREATED"||!recovery||typeof recovery.recover!=="function"||this.boundTrust||
      this.participant&&this.participant.recovery!==recovery)throw failure("COMMAND_STATUS_COMPOSITION_CONFIG_INVALID");
    return this.participant??=(Object.freeze({candidate:this.candidate,workload_id:this.config.candidate.source.workload_id,recovery}));
  }
  /** Invoke once while still OFF, after the real shared AccessService and its
   * coordinator exist. A similar workload name is not a registration proof. */
  statusTrust(access:ExecutionAccessService,base:CommandTrust,coordinator:CurrentHumanMutations):CommandTrust {
    if(this.state!=="CREATED"||this.boundTrust||!access.usesPool(this.pool)||!coordinator.usesPool(this.pool))
      throw failure("COMMAND_STATUS_COMPOSITION_CONFIG_INVALID");
    if(!this.participant||!coordinator.hasReverseRecoveryParticipant(this.participant))
      throw failure("COMMAND_STATUS_COMPOSITION_RECOVERY_NOT_REGISTERED");
    const authority=new CommandSourceAssertionAuthority(this.pool,access,this.candidate,this.config.authority);
    try {
      const status=createAuthenticatedEdgeCurrentRequesterStatus(this.config.gateway_binding,base,authority,this.config.edge_transport,
        new PgCommandStatusOriginalFingerprints(this.pool));
      if(!this.config.gateway_binding.edge_contract)throw failure("COMMAND_STATUS_COMPOSITION_CONFIG_INVALID");
      authority.bindRecoverySource(status.port,this.config.gateway_binding.edge_contract);
      const assertion=createCommandSourceAssertionTransport({issue:(context,input)=>{
        if(this.state!=="RUNNING")return Promise.reject(failure("COMMAND_STATUS_COMPOSITION_NOT_RUNNING"));
        return authority.issue(context,input);
      },complete:(context,input)=>{
        if(this.state!=="RUNNING")return Promise.reject(failure("COMMAND_STATUS_COMPOSITION_NOT_RUNNING"));
        return authority.complete(context,input);
      }},this.config.assertion_transport);
      this.authority=authority;this.status=status;this.assertion=assertion;this.track(assertion.server);
      const trust:CommandTrust=Object.freeze({...status.trust,lookupCurrentRequester:(input:Parameters<NonNullable<CommandTrust["lookupCurrentRequester"]>>[0])=>{
        if(this.state!=="RUNNING")return Promise.reject(failure("COMMAND_STATUS_COMPOSITION_NOT_RUNNING"));
        const captured={actor:structuredClone(input.actor),authorization:structuredClone(input.authorization),intent:structuredClone(input.intent),signal:input.signal};
        const pending=Promise.resolve().then(()=>{
          if(this.state!=="RUNNING")throw failure("COMMAND_STATUS_COMPOSITION_NOT_RUNNING");
          return status.trust.lookupCurrentRequester(captured);
        }).then(result=>{if(this.state!=="RUNNING")throw failure("COMMAND_STATUS_COMPOSITION_NOT_RUNNING");return result;})
          .finally(()=>this.uses.delete(pending));
        this.uses.add(pending);return pending;
      }});
      this.boundTrust=trust;return trust;
    } catch(error){authority.shutdown();throw error;}
  }
  async start(targets:CommandStatusListenerTargets):Promise<{assertion:AddressInfo;reverse:AddressInfo}> {
    if(this.state!=="CREATED"||!this.boundTrust||!this.assertion||!targets||!validTarget(targets.assertion)||!validTarget(targets.reverse)||
      targets.assertion.port!==0&&targets.assertion.host===targets.reverse.host&&targets.assertion.port===targets.reverse.port)
      throw failure("COMMAND_STATUS_COMPOSITION_CONFIG_INVALID");
    const selected={assertion:{...targets.assertion},reverse:{...targets.reverse}};this.state="STARTING";
    try {
      const assertion=await this.listen(this.assertion.server,selected.assertion);
      if(this.state!=="STARTING")throw failure("COMMAND_STATUS_COMPOSITION_NOT_RUNNING");
      const reverse=await this.listen(this.reverse.server,selected.reverse);
      if(this.state!=="STARTING")throw failure("COMMAND_STATUS_COMPOSITION_NOT_RUNNING");
      this.state="RUNNING";return {assertion,reverse};
    } catch(error){if(this.state==="STARTING")this.state="FAILED";this.stopAdmission();this.closeListeners();
      throw error instanceof CommandStatusCompositionError?error:failure("COMMAND_STATUS_COMPOSITION_START_FAILED");}
  }
  snapshot(){
    const listener=(server:Server|undefined)=>{const a=server?.address();return a&&typeof a!=="string"?{address:a.address,port:a.port}:null;};
    return Object.freeze({state:this.state,bound:!!this.boundTrust,recovery_registered:!!this.participant,
      pending_uses:this.uses.size,closing_listeners:this.closing.size,authority:this.authority?.snapshot()??null,
      assertion:this.assertion?.snapshot()??null,reverse:this.reverse.snapshot(),edge:this.status?.port.snapshot()??null,
      listeners:{assertion:listener(this.assertion?.server),reverse:listener(this.reverse.server)}});
  }
  shutdown():Promise<void> {
    if(this.state==="STOPPED")return Promise.resolve();if(this.stopping)return this.stopping;
    this.state="STOPPING";this.stopAdmission();this.closeListeners();
    this.stopping=this.drain().finally(()=>{this.stopping=undefined;});return this.stopping;
  }
  private track(server:Server):void {
    const socket=(s:Duplex)=>{this.sockets.add(s);s.once("close",()=>this.sockets.delete(s));};
    server.on("connection",socket);server.on("secureConnection",socket);
    server.on("error",()=>{if(this.state==="RUNNING"){this.state="FAILED";this.stopAdmission();this.closeListeners();}});
  }
  private listen(server:Server,target:CommandStatusListenerTarget):Promise<AddressInfo> {
    this.startingPending++;
    return new Promise((resolve,reject)=>{
      let done=false;const settled=()=>{if(done)return false;done=true;this.startingPending--;server.off("error",onError);server.off("close",onClose);return true;};
      const onError=()=>{if(settled())reject(failure("COMMAND_STATUS_COMPOSITION_START_FAILED"));};
      const onClose=()=>{if(settled())reject(failure("COMMAND_STATUS_COMPOSITION_NOT_RUNNING"));};
      server.once("error",onError);server.once("close",onClose);
      try{server.listen(target.port,target.host,()=>{if(!settled()){this.closeListeners();return;}
        const address=server.address();if(this.state!=="STARTING"||!address||typeof address==="string"){
          this.closeListeners();reject(failure("COMMAND_STATUS_COMPOSITION_NOT_RUNNING"));return;}resolve({...address});});}
      catch{onError();}
    });
  }
  private stopAdmission():void {this.authority?.shutdown();for(const socket of this.sockets)socket.destroy();}
  private closeListeners():void {
    for(const server of [this.assertion?.server,this.reverse.server]){if(!server||this.closing.has(server))continue;
      this.closing.add(server);server.close(()=>this.closing.delete(server));}
  }
  private async drain():Promise<void> {
    const until=performance.now()+this.config.shutdown_deadline_ms;
    while(this.uses.size||this.authority?.snapshot().pending||this.authority?.snapshot().preparing||
      this.authority?.snapshot().preparation_waiters||this.assertion?.snapshot().in_flight||
      this.reverse.snapshot().in_flight||this.status?.port.snapshot().in_flight||this.sockets.size||this.closing.size||
      this.startingPending||this.assertion?.server.listening||this.reverse.server.listening){
      if(performance.now()>=until)throw failure("COMMAND_STATUS_COMPOSITION_SHUTDOWN_PENDING");
      await new Promise<void>(resolve=>setTimeout(resolve,5));}
    this.state="STOPPED";
  }
}
