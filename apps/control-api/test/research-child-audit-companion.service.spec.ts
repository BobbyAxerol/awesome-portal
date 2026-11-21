import { afterEach, describe, expect, it, vi } from "vitest";
import { ResearchChildAuditCompanionService } from "../src/research/child-audit-companion.service";
import type { ChildAuditCompanionQuery } from "../src/research/child-audit-companion.contract";
import { sha256ResearchJson } from "../src/research/preflight.service";
import { auditManifest, auditRow, auditScope } from "./research-child-audit-companion.fixture";
const config={FEATURE_RESEARCH_CURRENT_SOURCE:"true",QUERY_CURSOR_ACTIVE_KEY_ID:"audit-key",
  QUERY_CURSOR_KEYS_JSON:'{"audit-key":"synthetic-unit-audit-key-with-at-least-32-bytes"}',QUERY_CURSOR_TTL_SECONDS:30};
afterEach(()=>vi.useRealTimers());
function pagedService() {
  const all=Array.from({length:202},(_,i)=>auditRow(i)), manifest=auditManifest(all,2212);
  let revision:string|null=sha256ResearchJson(manifest);
  const page=vi.fn(async(_scope:unknown,_run:string,query:ChildAuditCompanionQuery,after:(revision:string|null)=>number|undefined)=>{
    const boundary=after(revision);
    const matching=all.filter(r=>(query.audit_ordinal===undefined || r.audit_ordinal===query.audit_ordinal) && (!query.fold_id || r.fold_id===query.fold_id)
      && (!query.context || r.context===query.context));
    const values=matching.filter(r=>boundary===undefined || r.audit_ordinal>boundary);
    return {manifest,revision,rows:values.slice(0,query.limit),hasMore:values.length>query.limit,
      matchingFold:all.filter(r=>!query.fold_id || r.fold_id===query.fold_id).length,matchingFilter:matching.length,
      legacy:{sourceCount:all.length,dropped:2212,samples:64}};
  });
  return {service:new ResearchChildAuditCompanionService({page} as never,config as never),page,
    moveRevision:()=>{revision="0".repeat(64);}};
}
describe("sealed full-source audit pages",()=>{
  it("pages beyond 64 original ordinals without claiming source-dropped history",async()=>{
    const {service}=pagedService();
    const first=await service.page(auditScope,"audit-run",{limit:200}),second=await service.page(auditScope,"audit-run",{limit:200,cursor:first.next_cursor});
    expect(first.rows).toHaveLength(200); expect(second.rows.map(r=>r.audit_ordinal)).toEqual([200,201]);
    expect(first.custody).toBe("FULL_SOURCE_RETAINED");
    expect(first.counts).toMatchObject({full_source_retained:202,records_dropped_by_source:2212,source_total_if_known:2414,legacy_sample_retained:64,returned:200});
    expect(first.scope).toBe("SOURCE_LIFECYCLE_OBSERVATIONS_NOT_GENERATION_CLOCK");
    const exact=await service.page(auditScope,"audit-run",{audit_ordinal:201});
    expect(exact.rows.map(r=>r.audit_ordinal)).toEqual([201]); expect(exact.next_cursor).toBeNull();
  });
  it("binds opaque cursors to revision, tenant, actor, run, complete filter and page size",async()=>{
    const {service,moveRevision}=pagedService(), first=await service.page(auditScope,"audit-run",{limit:1});
    for(const [scope,run,query] of [
      [{...auditScope,workspaceId:"foreign"},"audit-run",{limit:1}],
      [{...auditScope,actorUserId:"foreign-user"},"audit-run",{limit:1}],
      [auditScope,"foreign-run",{limit:1}], [auditScope,"audit-run",{limit:2}],
      [auditScope,"audit-run",{limit:1,fold_id:"fold_000"}],
      [auditScope,"audit-run",{limit:1,context:"in-sample scoring"}],
    ] as const) await expect(service.page(scope,run,{...query,cursor:first.next_cursor})).rejects.toMatchObject({status:400});
    await expect(service.page(auditScope,"audit-run",{limit:1,cursor:first.next_cursor!.slice(0,-1)+"x"})).rejects.toMatchObject({status:400});
    moveRevision();
    await expect(service.page(auditScope,"audit-run",{limit:1,cursor:first.next_cursor})).rejects.toMatchObject({status:400});
  });
  it("expires renewable tokens and does not execute a reader when feature/query is refused",async()=>{
    vi.useFakeTimers(); const {service,page}=pagedService(), first=await service.page(auditScope,"audit-run",{limit:1});
    vi.advanceTimersByTime(31_000);
    await expect(service.page(auditScope,"audit-run",{limit:1,cursor:first.next_cursor})).rejects.toMatchObject({code:"RESEARCH_CURRENT_SOURCE_CURSOR_EXPIRED"});
    page.mockClear();
    await expect(service.page(auditScope,"audit-run",{limit:201})).rejects.toMatchObject({status:400});
    await expect(new ResearchChildAuditCompanionService({page} as never,{...config,FEATURE_RESEARCH_CURRENT_SOURCE:"false"} as never).page(auditScope,"audit-run",{})).rejects.toMatchObject({status:503});
    expect(page).not.toHaveBeenCalled();
  });
  it("returns typed legacy absence, never a cursor over old 64-row samples",async()=>{
    const page=vi.fn(async(_s:unknown,_r:string,_q:unknown,after:(revision:string|null)=>number|undefined)=>{after(null);return {manifest:null,revision:null,rows:[],hasMore:false,
      matchingFold:null,matchingFilter:null,legacy:{sourceCount:2000,dropped:2212,samples:64}};});
    const result=await new ResearchChildAuditCompanionService({page} as never,config as never).page(auditScope,"audit-run",{});
    expect(result).toMatchObject({custody:"LEGACY_SAMPLE",availability:{state:"NOT_PUBLISHED",reason_code:"LEGACY_SAMPLE"},rows:[],next_cursor:null,
      counts:{full_source_retained:null,legacy_sample_retained:64,records_dropped_by_source:2212,source_total_if_known:4212}});
  });
});
