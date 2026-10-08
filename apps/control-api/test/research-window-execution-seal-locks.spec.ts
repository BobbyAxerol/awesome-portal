import {describe,it,expect,vi} from "vitest";
import {ResearchWindowExecutionRepository} from "../src/research/window-execution.repository";

/**
 * §48 addendum: the seal verifies the whole companion (O(rows)) and used to do it inside the authority transaction, holding an advisory lock and
 * FOR UPDATE on the producer/job/worker-attempt rows for seconds (heartbeat and terminal writes hit the 500 ms lock timeout; the worker's resend
 * of the same seal collided with the advisory lock and got 503 x3 although the first call committed). The verification now runs lock-free in a
 * read-only snapshot; the write transaction is short.
 */
const scope={workspaceId:"ws",actorUserId:"user"};
const input={run_id:"rrun_"+"a".repeat(32),companion_digest:"d".repeat(64),manifest:{artifact_revision:1,artifact_id:"art_1"}} as never;

function harness(summaries:{verify:any;write:any},sealed=false){
  const log:string[]=[];let tx=0,readOnly=false,inTx=false;
  const client={
    query:vi.fn(async(sql:string)=>{
      const s=sql.replace(/\s+/g," ").trim();
      if(s.startsWith("BEGIN")){tx++;inTx=true;readOnly=/READ ONLY/.test(s);log.push(`BEGIN#${tx}${readOnly?":RO":":RW"}`);return {rows:[],rowCount:0};}
      if(s==="COMMIT"||s==="ROLLBACK"){inTx=false;log.push(s);return {rows:[],rowCount:0};}
      if(s.includes("workspace_members"))return {rows:[{}],rowCount:1};
      if(s.includes("window_execution_seals_v1")&&s.startsWith("SELECT"))return sealed?{rows:[{companion_digest:"d".repeat(64)}],rowCount:1}:{rows:[],rowCount:0};
      if(s.startsWith("INSERT INTO research.window_execution_seals_v1")){log.push(`INSERT_SEAL#${tx}`);return {rows:[],rowCount:1};}
      return {rows:[],rowCount:0};
    }),release:vi.fn(),
  };
  const repo=new ResearchWindowExecutionRepository({connect:async()=>client} as never);
  vi.spyOn(repo as any,"verifyBatches").mockImplementation(async()=>{log.push(`VERIFY#${tx}${readOnly?":RO":":RW"}${inTx?"":":NO_TX"}`);return summaries.verify;});
  vi.spyOn(repo as any,"authority").mockImplementation(async()=>{log.push(`AUTHORITY#${tx}${readOnly?":RO":":RW"}`);});
  vi.spyOn(repo as any,"batchSummary").mockImplementation(async()=>{log.push(`SUMMARY#${tx}`);return summaries.write;});
  return {repo,log};
}
const same={batches:232,rows:46377,lastDigest:"e".repeat(64)};

describe("window-execution seal lock discipline",()=>{
  it("verifies every batch in a read-only snapshot BEFORE taking the authority locks, and the write transaction only checks and inserts",async()=>{
    const {repo,log}=harness({verify:same,write:same});
    await expect(repo.seal(scope as never,input)).resolves.toEqual({replayed:false});
    expect(log).toEqual(["BEGIN#1:RO","VERIFY#1:RO","COMMIT","BEGIN#2:RW","AUTHORITY#2:RW","SUMMARY#2","INSERT_SEAL#2","COMMIT"]);
  });

  it("a different batch set than the one verified is a retryable 503, not a seal over unverified rows",async()=>{
    const {repo,log}=harness({verify:same,write:{...same,rows:46378}});
    await expect(repo.seal(scope as never,input)).rejects.toMatchObject({status:503});
    expect(log).not.toContain("INSERT_SEAL#2");
    expect(log.at(-1)).toBe("ROLLBACK");
    const other=harness({verify:same,write:{...same,lastDigest:"f".repeat(64)}});
    await expect(other.repo.seal(scope as never,input)).rejects.toMatchObject({status:503});
    const fewer=harness({verify:same,write:{...same,batches:231}});
    await expect(fewer.repo.seal(scope as never,input)).rejects.toMatchObject({status:503});
  });

  it("a repeated seal of an already sealed companion replays without re-verifying and still checks the authority",async()=>{
    const {repo,log}=harness({verify:same,write:same},true);
    await expect(repo.seal(scope as never,input)).resolves.toEqual({replayed:true});
    expect(log.some((l)=>l.startsWith("VERIFY"))).toBe(false);
    expect(log).toContain("AUTHORITY#2:RW");
    expect(log).not.toContain("INSERT_SEAL#2");
  });

  it("the verification phase takes no lock-bearing statement of its own (the authority is the only locker)",async()=>{
    const source=(await import("node:fs")).readFileSync(new URL("../src/research/window-execution.repository.ts",import.meta.url),"utf8");
    const verify=source.slice(source.indexOf("private async verifyBatches"),source.indexOf("async page("));
    expect(verify).not.toMatch(/FOR UPDATE|FOR SHARE|pg_advisory|LOCK TABLE/);
    const seal=source.slice(source.indexOf("async seal("),source.indexOf("private async batchSummary"));
    expect(seal.indexOf("verifyBatches")).toBeLessThan(seal.indexOf("this.authority"));
  });
});
