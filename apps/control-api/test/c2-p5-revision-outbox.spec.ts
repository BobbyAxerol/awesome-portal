import { describe,expect,it,vi } from "vitest";
import { C2P5RevisionOutbox } from "../src/execution-v2/c2-p5-revision-outbox";

function fixture(overflow=false) {
  const events=[1,2,3].map(n=>({revision:String(n),previous_revision:String(n-1),authority_scope:"GLOBAL",
    reason_availability:"NOT_RECORDED",occurred_at:"2026-11-05T00:00:00.000000Z"}));
  const query=vi.fn(async(sql:string,args?:unknown[])=>{
    if(sql.includes("FROM elp210_c2_revision_candidate.baseline"))return {rowCount:1,rows:[{baseline:"0",head:"3",
      history_availability:"PREINSTALL_HISTORY_NOT_RECORDED",disposition:overflow?"REVISION_DETAIL_OVERFLOW_NOT_DELIVERED":null,
      ...(overflow?{first_previous_revision:"1",first_revision:"2",last_revision:"3",change_count:"2",count_saturated:false,
        continuity_unknown:false}:{})}]};
    if(sql.includes("FROM elp210_c2_revision_candidate.events"))return {rows:events
      .filter(e=>BigInt(e.revision)>BigInt(args![0] as string) && (!overflow || e.revision==="1")).slice(0,args![1] as number)};
    return {rowCount:null,rows:[]};
  });
  const release=vi.fn(),client={query,release},connect=vi.fn(async()=>client);
  const pool={connect,options:{connectionTimeoutMillis:1000,query_timeout:1000}} as unknown as ConstructorParameters<typeof C2P5RevisionOutbox>[0];
  return {outbox:new C2P5RevisionOutbox(pool),query,connect,release};
}
describe("P5 source-only outbox reader",()=>{
  it("returns ordered immutable local intents and a cursor, never delivery or source acceptance",async()=>{
    const f=fixture(),result=await f.outbox.read("0",2);
    expect(result.state).toBe("LOCAL_INTENT_NOT_DELIVERED");
    expect(result.history_availability).toBe("PREINSTALL_HISTORY_NOT_RECORDED");
    expect(result.events.map(e=>e.revision)).toEqual(["1","2"]);expect(result.next_cursor).toBe("2");
    expect(result.events[0]?.reason_availability).toBe("NOT_RECORDED");
    expect(f.query).toHaveBeenCalledWith("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(f.query).toHaveBeenCalledWith("COMMIT");expect(f.release).toHaveBeenCalledWith(false);
  });
  it("reports overflow as unreconciled rather than inventing notices",async()=>{
    const result=await fixture(true).outbox.read("0",10);
    expect(result.overflow).toMatchObject({first_revision:"2",last_revision:"3",disposition:"REVISION_DETAIL_OVERFLOW_NOT_DELIVERED"});
  });
  it("fails closed for a missing row, a detached next row, or a head without recorded coverage",async()=>{
    const rows=[{revision:"1",previous_revision:"0",authority_scope:"GLOBAL",reason_availability:"NOT_RECORDED",occurred_at:"2026-11-05T00:00:00.000000Z"},
      {revision:"3",previous_revision:"2",authority_scope:"GLOBAL",reason_availability:"NOT_RECORDED",occurred_at:"2026-11-05T00:00:00.000000Z"}];
    for(const invalid of [rows,[rows[1]],[]]){
      const f=fixture(),base=f.query.getMockImplementation()!;
      f.query.mockImplementation(async(sql,args)=>sql.includes("FROM elp210_c2_revision_candidate.events")?
        {rows:invalid}:base(sql,args));
      await expect(f.outbox.read("0",10)).rejects.toThrow("C2_P5_HISTORY_DISCONTINUITY");
      expect(f.query).toHaveBeenCalledWith("ROLLBACK");
    }
  });
  it("refuses an event that overlaps an overflow range",async()=>{
    const f=fixture(true),base=f.query.getMockImplementation()!;
    f.query.mockImplementation(async(sql,args)=>sql.includes("FROM elp210_c2_revision_candidate.events")?
      {rows:[{revision:"2",previous_revision:"0",authority_scope:"GLOBAL",reason_availability:"NOT_RECORDED",occurred_at:"2026-11-05T00:00:00.000000Z"}]}:base(sql,args));
    await expect(f.outbox.read("0",10)).rejects.toThrow("C2_P5_HISTORY_DISCONTINUITY");
  });
  it("rejects malformed, unsafe or future cursors and unbounded reads",async()=>{
    const f=fixture();
    for(const cursor of ["-1","01","9007199254740992","0 OR TRUE","Infinity"])
      await expect(f.outbox.read(cursor,1)).rejects.toThrow("C2_P5_INVALID_CURSOR");
    for(const limit of [0,201,1.5])await expect(f.outbox.read("0",limit)).rejects.toThrow("C2_P5_INVALID_LIMIT");
    expect(f.connect).not.toHaveBeenCalled();
    await expect(f.outbox.read("4",1)).rejects.toThrow("C2_P5_FUTURE_CURSOR");
    expect(f.query).toHaveBeenCalledWith("ROLLBACK");
  });
  it("requires finite pool timeouts",()=>{
    expect(()=>new C2P5RevisionOutbox({options:{}} as ConstructorParameters<typeof C2P5RevisionOutbox>[0]))
      .toThrow("C2_P5_POOL_TIMEOUTS_REQUIRED");
  });
});
