import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ResearchChildAuditCompanionRepository } from "../src/research/child-audit-companion.repository";
import { ChildAuditCompanionQuerySchema } from "../src/research/child-audit-companion.contract";
import type { ChildAuditCompanionManifest } from "../src/research/child-audit-companion.contract";
import { sha256ResearchJson } from "../src/research/preflight.service";
import { auditBatch, auditLease, auditManifest, auditRow, auditScope, auditSeal, auditSourceRow } from "./research-child-audit-companion.fixture";

function fake(respond:(sql:string,params:readonly unknown[])=>object) {
  const calls:Array<{sql:string;params:readonly unknown[]}>=[];
  const client={query:vi.fn(async(sql:string,params:readonly unknown[]=[])=>{calls.push({sql,params});
    if(sql.includes("FROM workspace_members"))return {rowCount:1,rows:[{}]};
    if(sql.includes("FOR UPDATE OF producer, job, worker"))return {rowCount:1,rows:[{snapshot_content_hash:"a".repeat(64)}]};
    return {rowCount:0,rows:[],...respond(sql,params)};}),release:vi.fn()};
  return {repo:new ResearchChildAuditCompanionRepository({connect:vi.fn().mockResolvedValue(client)} as never),calls,client};
}
function writeAuthority(sql:string,input:{manifest:ChildAuditCompanionManifest}) {
  return sql.includes("SELECT seal.*") ? {rowCount:1,rows:[auditSourceRow(input.manifest)]} : {};
}
describe("append-only child audit companion custody",()=>{
  it("fences every batch and provides byte-equivalent idempotence without reinsert",async()=>{
    const input=auditBatch([auditRow(0)]),{repo,calls}=fake(sql=>({...writeAuthority(sql,input),
      ...(sql.includes("SELECT companion_digest,batch_digest,row_count") ? {rowCount:1,rows:[{companion_digest:input.companion_digest,batch_digest:input.batch_digest,row_count:1}]} : {})}));
    expect(await repo.append(auditScope,input)).toEqual({replayed:true});
    const auth=calls.find(c=>c.sql.includes("SELECT seal.*"))!;
    for(const binding of ["producer.worker_attempt_id=artifact.worker_attempt_id","producer.lease_epoch=artifact.lease_epoch",
      "producer.requested_spec_digest=seal.requested_spec_digest","producer.effective_spec_digest=seal.effective_spec_digest",
      "producer.dataset_binding_digest=seal.dataset_binding_digest","producer.job_id=$5","artifact.state='SEALED'"])
      expect(auth.sql).toContain(binding);
    expect(auth.params).toEqual([auditScope.workspaceId,"audit-run",1,"audit-artifact",auditLease.jobId]);
    expect(calls.some(c=>c.sql.includes("INSERT INTO"))).toBe(false);
    expect(calls.some(c=>c.sql.includes("job.state='RUNNING' AND worker.state='RUNNING'"))).toBe(true);
    expect(calls.some(c=>c.sql.startsWith("SET LOCAL ROLE"))).toBe(true);
    expect(calls.at(-1)!.sql).toBe("COMMIT");
  });
  it("rejects stale/ambiguous/mismatched P05 custody and rolls back",async()=>{
    const input=auditBatch([auditRow(0)]);
    for(const result of [{rowCount:0,rows:[]},{rowCount:2,rows:[auditSourceRow(input.manifest),auditSourceRow(input.manifest)]},
      {rowCount:1,rows:[{...auditSourceRow(input.manifest),execution_profile_digest:"0".repeat(64)}]}]) {
      const {repo,calls}=fake(sql=>sql.includes("SELECT seal.*") ? result : {});
      await expect(repo.append(auditScope,input)).rejects.toMatchObject({status:409});
      expect(calls.some(c=>c.sql.includes("INSERT INTO"))).toBe(false); expect(calls.at(-1)!.sql).toBe("ROLLBACK");
    }
  });
  it("seals only complete dense rows with all fixed chunk digests and unique source fingerprint",async()=>{
    const all=Array.from({length:201},(_,i)=>auditRow(i)),input=auditSeal(all);
    function sealRepository(records=all,changedBatch=false,mismatch=0) {
      return fake(sql=> sql.includes("SELECT seal.*") ? writeAuthority(sql,input) : sql.includes("SELECT payload FROM research.child_audit_companion_rows")
        ? {rows:records.map(payload=>({payload}))} : sql.includes("SELECT companion_digest,batch_ordinal")
          ? {rows:[0,1].map(i=>({companion_digest:input.companion_digest,batch_ordinal:i,row_count:all.slice(i*200,i*200+200).length,
            batch_digest:changedBatch ? "0".repeat(64) : sha256ResearchJson(all.slice(i*200,i*200+200))}))}
          : sql.includes("AS mismatch_count") ? {rows:[{mismatch_count:mismatch}]} : {});
    }
    const good=sealRepository(); expect(await good.repo.seal(auditScope,input)).toEqual({replayed:false});
    expect(good.calls.some(c=>c.sql.includes("INSERT INTO research.child_audit_companion_seals"))).toBe(true);
    expect(good.calls.find(c=>c.sql.includes("AS mismatch_count"))!.sql).toContain("audit.payload-'run_fingerprint' IS DISTINCT FROM witness");
    for(const bad of [sealRepository(all.slice(1)),sealRepository(all,true),sealRepository(all.map((r,i)=>i===200 ? {...r,audit_ordinal:199} : r)),
      sealRepository(all,false,1)]) {
      await expect(bad.repo.seal(auditScope,input)).rejects.toMatchObject({status:409});
      expect(bad.calls.some(c=>c.sql.includes("INSERT INTO research.child_audit_companion_seals"))).toBe(false);
    }
  });
  it("reads exact artifact-bound revision and <=201 rows in one tenant snapshot; never legacy records",async()=>{
    const rows=[auditRow(0),auditRow(1)], manifest=auditManifest(rows),revision=sha256ResearchJson(manifest);
    const {repo,calls}=fake(sql=>sql.includes("SELECT 1 FROM research.runs") ? {rowCount:1,rows:[{}]} : sql.includes("WITH original AS")
      ? {rowCount:1,rows:[{...auditSourceRow(manifest),manifest,companion_digest:revision}]} : sql.includes("AS sample_count") ? {rows:[{sample_count:64}]}
        : sql.includes("count(*) AS total") ? {rows:[{total:2,matching_fold:2,matching_filter:2}]} : sql.includes("SELECT payload FROM research.child_audit_companion_rows")
          ? {rows:rows.map(payload=>({payload}))} : {});
    const after=vi.fn().mockReturnValue(undefined);
    const result=await repo.page(auditScope,"audit-run",ChildAuditCompanionQuerySchema.parse({limit:1,fold_id:"fold_000"}),after);
    expect(result).toMatchObject({rows:[rows[0]],hasMore:true,legacy:{samples:64}}); expect(after).toHaveBeenCalledWith(revision);
    expect(calls[0].sql).toContain("REPEATABLE READ READ ONLY");
    const bound=calls.find(c=>c.sql.includes("WITH original AS"))!.sql;
    expect(bound).toContain("artifact.artifact_id=companion.manifest->>'artifact_id'");
    expect(bound).toContain("producer.worker_attempt_id=artifact.worker_attempt_id");
    const page=calls.find(c=>c.sql.includes("SELECT payload FROM research.child_audit_companion_rows"))!;
    expect(page.params).toEqual([auditScope.workspaceId,"audit-run",1,"fold_000",null,null,null,2]);
    expect(calls.at(-1)!.sql).toBe("COMMIT");
  });
  it("migration has append/finalization race locks, immutable rows, RLS and no original table mutation",()=>{
    const sql=readFileSync(join(__dirname,"../migrations/1723680000087_research-child-audit-companion.sql"),"utf8");
    expect(sql.match(/pg_advisory_xact_lock/g)).toHaveLength(2);
    for(const check of ["FORCE ROW LEVEL SECURITY","prevent_immutable_log_mutation","GRANT SELECT,INSERT","batch_ordinal=audit_ordinal/200",
      "m.workspace_id=%I.workspace_id","expected NOT BETWEEN 0 AND 20000","incomplete child audit finalization"])
      expect(sql).toContain(check);
    expect(sql).not.toMatch(/(?:UPDATE|DELETE FROM|ALTER TABLE) research\.current_source_/);
  });
});
