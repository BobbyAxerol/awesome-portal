/** Disposable PostgreSQL only; coordinator runs via focused control-api gate. No source/runtime authority. */
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { Pool } from "pg";
import { migrateTestDatabase, testConfig } from "./harness";
import { VisitDigestStore } from "../src/command-center/visit-digest.store";
import { VisitDigestService } from "../src/command-center/visit-digest.service";
import { digestSnapshot } from "../src/command-center/visit-digest";
const config=testConfig({FEATURE_EXECUTION_COMMAND_CENTER_SNAPSHOT:"true"});
const user="TEST_ONLY_visit_a",peer="TEST_ONLY_visit_b",ws="TEST_ONLY_visit_ws",other="TEST_ONLY_visit_other";
let pool:Pool,store:VisitDigestStore;
const inputs={workspaceId:ws,actor:{userId:user},readAt:new Date("2026-10-23T00:00:00Z"),triageSources:[],todaySources:[],
  fleet:{status:{source:"EXECUTION",availability:"UNAVAILABLE",freshness_state:"UNKNOWN",reason:"SOURCE_DARK",as_of:null},items:[]}} as any;
const principal={user:{userId:user},workspaceId:ws,session:{}} as any;
const request={snapshot_revision:digestSnapshot(inputs).revision,expected_baseline_version:0};
function service(fail=false){return new VisitDigestService({readAuthorized:async(_p:any,_date:any,fn:any)=>{const answer=await fn(inputs);if(fail)throw new Error("final fence rejected");return answer;}} as any,store,config);}
async function cleanup(){await pool.query("DELETE FROM workspaces WHERE workspace_id=ANY($1::text[])",[[ws,other]]);await pool.query("DELETE FROM portal_users WHERE user_id=ANY($1::text[])",[[user,peer]]);}
beforeAll(async()=>{await migrateTestDatabase(config.DATABASE_URL);pool=new Pool({connectionString:config.DATABASE_URL,max:6});store=new VisitDigestStore(pool);});
beforeEach(async()=>{
  await cleanup();
  for(const id of [user,peer])await pool.query("INSERT INTO portal_users(user_id,username,display_name,role,status) VALUES($1,$1,$1,'USER','ACTIVE')",[id]);
  for(const id of [ws,other]){await pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,$1,$2)",[id,user]);
    await pool.query("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'OWNER'),($1,$3,'MEMBER')",[id,user,peer]);}
});
afterAll(async()=>{if(pool){await cleanup();await pool.end();}});
describe("visit digest real PostgreSQL baseline",()=>{
  it("persists per-user/workspace, retries idempotently and keeps GET read-only",async()=>{
    const svc=service();expect((await svc.read(principal)).state).toBe("NO_BASELINE");expect(await store.read(user,ws)).toBeNull();
    const first=await svc.seen(principal,request),retry=await svc.seen(principal,request);
    expect(first.baseline).toEqual(retry.baseline);expect(first.baseline?.version).toBe(1);
    expect(await store.read(peer,ws)).toBeNull();expect(await store.read(user,other)).toBeNull();
    expect(Object.keys((await store.read(user,ws))!.fingerprints)).toHaveLength(1);
  });
  it("rolls back staged baseline if authorization fails after projection",async()=>{
    await expect(service(true).seen(principal,request)).rejects.toMatchObject({code:"VISIT_DIGEST_UNAVAILABLE"});
    expect(await store.read(user,ws)).toBeNull();
  });
  it("does not queue behind competing holder and recovers on next attempt",async()=>{
    const client=await pool.connect();try{
      await client.query("BEGIN");await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[JSON.stringify(["visit-digest",user,ws])]);
      await expect(service().seen(principal,request)).rejects.toMatchObject({code:"VISIT_DIGEST_BUSY",status:503});
      expect(await store.read(user,ws)).toBeNull();await client.query("ROLLBACK");
    }finally{client.release();}
    expect((await service().seen(principal,request)).baseline?.version).toBe(1);
  });
  it("deletes baseline on membership removal rather than resurrecting prior user visibility",async()=>{
    await service().seen(principal,request);await pool.query("DELETE FROM workspace_members WHERE user_id=$1 AND workspace_id=$2",[user,ws]);
    expect(await store.read(user,ws)).toBeNull();
  });
});
