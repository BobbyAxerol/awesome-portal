import type {PoolClient} from "pg";
import {describe,expect,it,vi} from "vitest";
import {currentHumanDrainCounts} from "../src/execution-v2/current-human-drain-counts";

function client(...results:unknown[]) {
  return {query:vi.fn().mockImplementation(async()=>{
    const next=results.shift();if(next instanceof Error)throw next;return next;
  })} as unknown as PoolClient;
}
const rows=(...values:unknown[])=>({rows:values});
describe("current human drain includes all retained C2 delivery obligations",()=>{
  it("preserves legacy counts only when the candidate table is absent",async()=>{
    const db=client(rows({pending:2,unknown:1}),rows({safe:2}),rows({namespace_present:false,present:false}));
    await expect(currentHumanDrainCounts(db)).resolves.toEqual({pending:2,unknown:1});
    expect(db.query).toHaveBeenCalledTimes(3);
  });
  it("treats every retained delivery as uncertain even when a lease is resolved",async()=>{
    await expect(currentHumanDrainCounts(client(rows({pending:0,unknown:0}),rows({safe:2}),rows({namespace_present:true,present:true}),rows({pending:2}),rows({kind:"r",rls:false}))))
      .resolves.toEqual({pending:2,unknown:2});
  });
  it("rejects an absent delivery schema when pinned by C2 configuration",async()=>{
    await expect(currentHumanDrainCounts(client(rows({pending:0,unknown:0}),rows({safe:2}),
      rows({namespace_present:false,present:false})),true)).rejects.toThrow("CURRENT_HUMAN_DRAIN_CENSUS_INVALID");
  });
  it("does not hide a failed installed-table read as an empty census",async()=>{
    await expect(currentHumanDrainCounts(client(rows({pending:0,unknown:0}),rows({safe:2}),rows({namespace_present:true,present:true}),new Error("permission denied"))))
      .rejects.toThrow("permission denied");
  });
  it.each([
    [rows({pending:0,unknown:1})],
    [rows({pending:0,unknown:0}),rows({safe:1})],
    [rows({pending:0,unknown:0}),rows({safe:2}),rows({namespace_present:true,present:false})],
    [rows({pending:0,unknown:0}),rows({safe:2}),rows({namespace_present:true,present:null})],
    [rows({pending:0,unknown:0}),rows({safe:2}),rows({namespace_present:true,present:true}),rows({pending:-1})],
    [rows({pending:0,unknown:0}),rows({safe:2}),rows({namespace_present:true,present:true}),rows()],
    [rows({pending:0,unknown:0}),rows({safe:2}),rows({namespace_present:true,present:true}),rows({pending:0}),rows({kind:"r",rls:true})],
    [rows({pending:0,unknown:0}),rows({safe:2}),rows({namespace_present:true,present:true}),rows({pending:0}),rows({kind:"v",rls:false})],
  ])("fails closed for malformed census %#",async(...input)=>{
    await expect(currentHumanDrainCounts(client(...input))).rejects.toThrow("CURRENT_HUMAN_DRAIN_CENSUS_INVALID");
  });
});
