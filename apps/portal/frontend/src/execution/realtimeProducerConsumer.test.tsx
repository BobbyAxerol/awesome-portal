import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProfileRealtime } from "./profileRealtime";

// Execute the actual Nest producer, not a hand-written event-sequence mock.
// Only DI decorators, database IO and the screen catalogue are test doubles;
// the fresh-PG gate separately tests the real repository/catalogue and fan-out.
function producer(repository: object) {
  const source = readFileSync(resolve(__dirname,"../../../../control-api/src/execution/profile-realtime.service.ts"),"utf8");
  const code = ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,
    experimentalDecorators:true,emitDecoratorMetadata:false}}).outputText;
  const exports: Record<string, new (config: object, repo: object) => any> = {};
  const noop = () => () => undefined;
  runInNewContext(code,{exports,Date,Promise,Map,Set,Error,Buffer,
    setTimeout:(fn:()=>void,ms:number)=>({id:setTimeout(fn,ms),unref(){}}),
    clearTimeout:(timer:{id:ReturnType<typeof setTimeout>})=>clearTimeout(timer.id),
    setInterval:()=>({unref(){}}),clearInterval:()=>undefined,
    require:(id:string)=>{
      if(id==="@nestjs/common") return {Inject:noop,Injectable:noop};
      if(id==="../tokens") return {CONTROL_API_CONFIG:"test"};
      if(id==="./profile-projection.repository") return {ExecutionProfileProjectionRepository:class {}};
      if(id==="./profile-projection.catalog") return {
        PROFILE_OBSERVATION_OPERATION_ID:"EXECUTION_PROFILE_OBSERVATION_REVISION",
        profileObservationRevalidation:(ids:string[])=>({affected_screen_ids:ids}),
      };
      throw new Error(`Unexpected producer dependency ${id}`);
    },
  });
  return new exports.ExecutionProfileRealtimeService({FEATURE_EXECUTION_LOCAL_PROJECTION:"true",EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS:15000},repository);
}

class Stream {
  static all: Stream[] = [];
  listeners = new Map<string,EventListener>(); onerror: (()=>void)|null=null; closed=false;
  constructor(readonly url:string) { Stream.all.push(this); }
  addEventListener(kind:string,listener:EventListener) { this.listeners.set(kind,listener); }
  close() { this.closed=true; }
  emit(event:{event_type:string}) { this.listeners.get(event.event_type)?.({data:JSON.stringify(event)} as unknown as Event); }
}
function Probe({id="all",screenId}:{id?:string;screenId?:string}) {
  const value=useProfileRealtime("paper",screenId);
  return <output data-testid={id}>{JSON.stringify(value)}</output>;
}
const state=(id="all")=>JSON.parse(screen.getByTestId(id).textContent!);
const epoch="00000000-0000-0000-0000-000000000001";
const now=new Date();
const snapshot=(sequence=1)=>({projectionEpoch:epoch,projectionSequence:sequence,payloadDigest:"1".repeat(64),
  sourceAsOf:now,receivedAt:now,lastSuccessfulRefreshAt:now,completeness:"COMPLETE",sourceCatalogueSha256:null,
  document:{workspace_id:"test",environment:"paper",profile_id:"PAPER",source_contract_revision:"test.v1",relations:{}},
});
const health={state:"HEALTHY",reasonCode:null,retryNotBefore:null};
let service: ReturnType<typeof producer>;
let current = snapshot();
let sourceHealth: Record<string,unknown> = health;
let entries: object[]=[];
let unsubscribe=()=>{};
beforeEach(()=>{
  current=snapshot();sourceHealth={...health};entries=[];Stream.all=[];
  service=producer({snapshot:async()=>current,snapshotMetadata:async()=>current,refreshHealth:async()=>sourceHealth,
    journalAfter:async()=>entries});
  vi.stubGlobal("EventSource",Stream);
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify(await service.snapshot("test","paper","PAPER")))));
});
afterEach(()=>{cleanup();unsubscribe();service.onApplicationShutdown();vi.unstubAllGlobals();vi.useRealTimers();});

describe("BE-R2-9 actual producer → hook → visible panel",()=>{
  it("delivers a revision before recovery status; heartbeats do not erase source health",async()=>{
    render(<Probe/>); await waitFor(()=>expect(Stream.all).toHaveLength(1));
    unsubscribe=await service.subscribe("test","paper","PAPER",`${epoch}:1`,(event:{event_type:string})=>{Stream.all[0].emit(event);return true;});
    const start=performance.now();
    current=snapshot(2); sourceHealth={state:"RECOVERING",reasonCode:"SOURCE_BACKOFF",retryNotBefore:new Date(Date.now()+30000)};
    entries=[{workspaceId:"test",environment:"paper",profileId:"PAPER",projectionEpoch:epoch,projectionSequence:2,
      payloadDigest:current.payloadDigest,sourceAsOf:now,receivedAt:now,completeness:"COMPLETE",
      observationAuthority:"PORTAL_OBSERVATION",observationSemantics:"BOUNDED_CURRENT_PAGE",
      sourceContractRevision:"test.v1",sourceCatalogueSha256:null,payload:{affected_screen_ids:["EXECUTION_ALPHA_360_SCREEN"]}}];
    for(const group of service.groups.values()) group.nextHealthCheckAt=0;
    await act(async()=>{await service.tick();});
    expect(state()).toMatchObject({phase:"live",refreshKey:1,source:{state:"RECOVERING"}});
    expect(performance.now()-start).toBeLessThan(2000);
    act(()=>Stream.all[0].emit(service.heartbeat("test","paper","PAPER")));
    expect(state()).toMatchObject({phase:"live",refreshKey:1,source:{state:"RECOVERING",freshness:"STALE"}});
    expect(Stream.all).toHaveLength(1);
  });
  it("shares a single bootstrap/stream, targets affected screens and tears down on final unmount",async()=>{
    const first=render(<Probe id="alpha" screenId="EXECUTION_ALPHA_360_SCREEN"/>);
    const second=render(<Probe id="portfolio" screenId="EXECUTION_PORTFOLIO_360_SCREEN"/>);
    await waitFor(()=>expect(Stream.all).toHaveLength(1));
    expect(fetch).toHaveBeenCalledTimes(1);
    act(()=>Stream.all[0].emit({...service.heartbeat("test","paper","PAPER"),event_type:"delta",cursor:`${epoch}:2`,
      projection_epoch:epoch,projection_sequence:2,payload:{affected_screen_ids:["EXECUTION_ALPHA_360_SCREEN"]}}));
    expect(state("alpha").refreshKey).toBe(1);expect(state("portfolio").refreshKey).toBe(0);
    first.unmount();expect(Stream.all[0].closed).toBe(false);
    second.unmount();expect(Stream.all[0].closed).toBe(true);
  });
  it("never opens a stream after delayed JSON resolves beyond unmount",async()=>{
    let deliver!:(v:unknown)=>void;
    let signal!:AbortSignal;
    const json=new Promise(done=>{deliver=done;});
    vi.stubGlobal("fetch",vi.fn(async(_url,options)=>{signal=options.signal;return {ok:true,status:200,json:()=>json};}));
    const view=render(<Probe/>);await act(async()=>{await Promise.resolve();});
    view.unmount();expect(signal.aborted).toBe(true);
    await act(async()=>{deliver(await service.snapshot("test","paper","PAPER"));});
    expect(Stream.all).toHaveLength(0);
  });
  it("does not advance the data cursor on an ahead STATUS_ONLY frame or duplicate delta",async()=>{
    render(<Probe/>);await waitFor(()=>expect(Stream.all).toHaveLength(1));
    const initial=await service.snapshot("test","paper","PAPER");
    act(()=>Stream.all[0].emit({...initial,projection_sequence:2,cursor:`${epoch}:2`,payload:{snapshot_mode:"STATUS_ONLY"}}));
    const delta={...initial,event_type:"delta",projection_sequence:2,cursor:`${epoch}:2`};
    act(()=>Stream.all[0].emit(delta));act(()=>Stream.all[0].emit(delta));
    expect(state()).toMatchObject({phase:"live",refreshKey:1});expect(Stream.all[0].closed).toBe(false);
  });
  it("keeps hidden-tab invalidations bounded and refreshes once on visibility",async()=>{
    render(<Probe/>);await waitFor(()=>expect(Stream.all).toHaveLength(1));
    const initial=await service.snapshot("test","paper","PAPER");
    const visibility=vi.spyOn(document,"visibilityState","get").mockReturnValue("hidden");
    act(()=>{for(let sequence=2;sequence<20;sequence++) Stream.all[0].emit({...initial,event_type:"delta",projection_sequence:sequence});});
    expect(state().refreshKey).toBe(0);
    visibility.mockReturnValue("visible");act(()=>document.dispatchEvent(new Event("visibilitychange")));
    expect(state().refreshKey).toBe(1);visibility.mockRestore();
  });
});
