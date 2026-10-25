/** Disposable PostgreSQL regression only; no Research/source authority. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { buildPool } from "../src/db/pool";
import { ExecutionProfileProjectionRepository } from "../src/execution/profile-projection.repository";
import { migrateTestDatabase, testConfig, truncateAll } from "./harness";

const config=testConfig(),workspace="TEST_ONLY:history-workspace",profile="TEST_ONLY:paper";
const relation="manager.performance:account_equity_snapshots",from="2026-10-01T00:00:00.000Z",to="2026-10-02T00:00:00.000Z";
let pool:Pool,repository:ExecutionProfileProjectionRepository;
beforeAll(async()=>{await migrateTestDatabase(config.DATABASE_URL);pool=buildPool(config.DATABASE_URL);
  repository=new ExecutionProfileProjectionRepository(pool);});
beforeEach(async()=>truncateAll(pool));
afterAll(async()=>pool?.end());
const query=(targetPoints:number)=>({from,to,entity:{field:"deployment_id",value:"TEST_ONLY:deployment"},
  seriesField:"account_id",valueField:"equity",targetPoints});

describe("Paper sparse history SQL population parity",()=>{
  it("counts/returns only the same numeric-eligible rows and never loses the later valid row",async()=>{
    const values=[null,"not-a-decimal","1e6","0","-2.50","100.125"];
    const rows=values.map((equity,index)=>({rowId:`TEST_ONLY:${index}`,ts:index===5?to:from,
      fields:{account_id:"TEST_ONLY:account",deployment_id:"TEST_ONLY:deployment",equity}}));
    await repository.appendTimeSeriesHistory(workspace,"paper",profile,relation,rows);
    await repository.appendTimeSeriesHistory("TEST_ONLY:peer", "paper",profile,relation,rows);
    await repository.appendTimeSeriesHistory(workspace,"paper",profile,relation,[
      {rowId:"TEST_ONLY:outside",ts:"2026-09-30T23:59:59.000Z",fields:{account_id:"TEST_ONLY:account",deployment_id:"TEST_ONLY:deployment",equity:"900"}},
      {rowId:"TEST_ONLY:other-deployment",ts:from,fields:{account_id:"TEST_ONLY:account",deployment_id:"TEST_ONLY:other",equity:"999"}},
    ]);
    // Old sparse branch counted 3, then its LIMIT returned null/bad rows instead.
    const exact=await repository.timeSeriesHistoryDownsampled(workspace,"paper",profile,relation,query(3));
    expect(exact.sourceRows).toBe(3);expect(exact.downsample).toBeNull();
    expect(exact.rows.map(row=>row.rowId)).toEqual(["TEST_ONLY:3","TEST_ONLY:4","TEST_ONLY:5"]);
    expect(exact.rows.map(row=>row.fields.equity)).toEqual(["0","-2.50","100.125"]);
    const dense=await repository.timeSeriesHistoryDownsampled(workspace,"paper",profile,relation,query(1));
    expect(dense.sourceRows).toBe(3);expect(dense.downsample?.input_rows).toBe(3);
    expect(dense.rows.every(row=>["TEST_ONLY:3","TEST_ONLY:4","TEST_ONLY:5"].includes(row.rowId))).toBe(true);
    const raw=await repository.timeSeriesHistory(workspace,"paper",profile,relation,{from,to,entity:query(3).entity,limit:10});
    expect(raw.rows).toHaveLength(6);expect(raw.rows[0].fields.equity).toBeNull();
  });

  it("enforces selected-row and full-response byte bounds without deleting or silently limiting sparse/dense history",async()=>{
    await repository.appendTimeSeriesHistory(workspace,"paper",profile,relation,[
      {rowId:"TEST_ONLY:bytes-1",ts:from,fields:{account_id:"TEST_ONLY:account",deployment_id:"TEST_ONLY:deployment",equity:"100",payload:"x".repeat(1024)}},
      {rowId:"TEST_ONLY:bytes-2",ts:to,fields:{account_id:"TEST_ONLY:account",deployment_id:"TEST_ONLY:deployment",equity:"100",payload:"x".repeat(1024)}},
    ]);
    for(const targetPoints of [1,2]){
      await expect(repository.timeSeriesHistoryDownsampled(workspace,"paper",profile,relation,
        {...query(targetPoints),byteBudget:{maximumBytes:4096,maximumRowBytes:64}}))
        .rejects.toThrow("N33_HISTORY_ROW_TOO_LARGE");
      await expect(repository.timeSeriesHistoryDownsampled(workspace,"paper",profile,relation,
        {...query(targetPoints),byteBudget:{maximumBytes:1500,maximumRowBytes:1500}}))
        .rejects.toThrow("N33_HISTORY_RESPONSE_TOO_LARGE");
      const accepted=await repository.timeSeriesHistoryDownsampled(workspace,"paper",profile,relation,
        {...query(targetPoints),byteBudget:{maximumBytes:4096,maximumRowBytes:1500}});
      expect(accepted.sourceRows).toBe(2);
      expect(accepted.rows.map(row=>row.rowId)).toEqual(["TEST_ONLY:bytes-1","TEST_ONLY:bytes-2"]);
    }
    const raw=await repository.timeSeriesHistory(workspace,"paper",profile,relation,
      {from,to,entity:query(2).entity,limit:10});
    expect(raw.rows).toHaveLength(2);
    expect(raw.hasMore).toBe(false);
  });

  it("measures the real SQL selected-history path over 12000 retained rows without changing a product SLO",async()=>{
    const start=Date.parse(from),population=12000;
    await repository.appendTimeSeriesHistory(workspace,"paper",profile,relation,
      Array.from({length:population},(_,index)=>({rowId:`TEST_ONLY:measure-${index.toString().padStart(5,"0")}`,
        ts:new Date(start+index*1000).toISOString(),fields:{account_id:"TEST_ONLY:account",
          deployment_id:"TEST_ONLY:deployment",equity:String(20000+index%137)}})));
    const measurements=[];
    for(const targetPoints of [100,200,400,2000]){
      const elapsed=[],bytes=[],returned=[];
      for(let attempt=0;attempt<3;attempt++){
        const started=performance.now();
        const result=await repository.timeSeriesHistoryDownsampled(workspace,"paper",profile,relation,
          {...query(targetPoints),byteBudget:{maximumBytes:8*1024*1024,maximumRowBytes:256*1024}});
        elapsed.push(Number((performance.now()-started).toFixed(3)));
        expect(result.sourceRows).toBe(population);
        expect(result.rows.length).toBeGreaterThan(0);
        returned.push(result.rows.length);bytes.push(Buffer.byteLength(JSON.stringify(result.rows),"utf8"));
        expect(bytes.at(-1)).toBeLessThan(8*1024*1024);
      }
      measurements.push({target_points:targetPoints,elapsed_ms:elapsed,returned_rows:returned,response_rows_bytes:bytes});
    }
    console.info("BACKEND_HISTORY_SQL_MEASUREMENT",JSON.stringify({lane:"DISPOSABLE_PG_NOT_PRODUCT_SLO",
      population,measurements}));
  });
});
