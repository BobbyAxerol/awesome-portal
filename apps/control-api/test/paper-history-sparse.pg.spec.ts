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
});
