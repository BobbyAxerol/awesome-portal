import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExecutionApi } from "./api/ports";
import { readSubjectActivity } from "./api/subjectActivity";
import { useSubjectActivityFacts } from "./useSubjectActivityFacts";
vi.mock("./useExecutionRuntime",()=>({loadExecutionRuntime:()=>Promise.resolve(null)}));
afterEach(cleanup);
const fills=()=>readSubjectActivity({
  schema_version:"portal.execution.subject-records.v1",environment:"paper",profile_id:"PAPER",state:"AVAILABLE",
  logical_operation_id:"executionAlphaFillsV1",authority:"PORTAL_SGP_RETAINED_CURRENT_WINDOW",source_authority:"TRADING_SYSTEM_CURRENT_SOURCE",
  history_semantics:"RETAINED_PORTAL_CURRENT_WINDOW_NOT_AUTHORITATIVE_REPLAY",resource:{kind:"alpha",id:"a"},
  source_health:{availability:"AVAILABLE",freshness:"FRESH",completeness:"COMPLETE",as_of_ms:1},coverage:{},projection:{},
  page:{limit:500,returned_count:1,has_more:false,next_cursor:null},records:[{record_id:"fill1",values:{fill_id:"fill1",price:"1.000000000000000001"}}],
})!;
describe("BE-R2-9 subject read recovery",()=>{
  it("does not relabel fills when orders fails",async()=>{
    const api={getSubjectActivity:vi.fn(async({relation}:{relation:string})=>relation==="orders"
      ? {ok:false,status:"unavailable",reason:"503"}:{ok:true,value:fills()})} as unknown as ExecutionApi;
    const view=renderHook(()=>useSubjectActivityFacts(api,"paper",{kind:"alpha",id:"a"}));
    await waitFor(()=>expect(view.result.current.value?.state).toBe("PARTIAL"));
    expect(view.result.current.value?.facts.orders).toBeUndefined();
    expect(view.result.current.value?.facts.fills[0]).toMatchObject({fill_id:"fill1",price:"1.000000000000000001"});
  });
  it("clears old subject immediately and aborts its obsolete HTTP reads",async()=>{
    const signals:AbortSignal[]=[];
    let finish!:()=>void;
    const pending=new Promise<void>(done=>{finish=done;});
    const api={withReadSignal:(signal:AbortSignal)=>{
      signals.push(signal);return {getSubjectActivity:async({subjectId}:{subjectId:string})=>{
        if(subjectId==="b") await pending;
        return {ok:true,value:fills()};
      }};
    }} as unknown as ExecutionApi;
    const view=renderHook(({id})=>useSubjectActivityFacts(api,"paper",{kind:"alpha",id}),{initialProps:{id:"a"}});
    await waitFor(()=>expect(view.result.current.value).not.toBeNull());
    view.rerender({id:"b"});expect(view.result.current.value).toBeNull();expect(signals[0].aborted).toBe(true);
    view.unmount();expect(signals[1].aborted).toBe(true);
    await act(async()=>finish());
  });
});
