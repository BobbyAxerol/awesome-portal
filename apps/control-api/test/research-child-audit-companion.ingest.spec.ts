import { describe, expect, it, vi } from "vitest";
import { ResearchChildAuditCompanionIngestService } from "../src/research/child-audit-companion.ingest";
import { auditAuthority, auditBatch, auditLease, auditRow, auditSeal } from "./research-child-audit-companion.fixture";
describe("private full audit ingress",()=>{
  it("requires the same live job/attempt/epoch and exact admitted P05/profile before append or seal",async()=>{
    const input=auditBatch([auditRow(0)]), repository={append:vi.fn().mockResolvedValue({replayed:false}),seal:vi.fn().mockResolvedValue({replayed:false})};
    const authority=auditAuthority(input.manifest), source={ingestAuthority:vi.fn().mockResolvedValue(authority)};
    const service=new ResearchChildAuditCompanionIngestService(repository as never,source as never);
    expect(await service.appendBatch(auditLease,input)).toMatchObject({accepted:true,batch_ordinal:0,row_count:1});
    expect(await service.seal(auditLease,auditSeal(input.rows))).toMatchObject({sealed:true,companion_digest:input.companion_digest});
    repository.append.mockClear(); repository.seal.mockClear();
    for(const lease of [{...auditLease,jobId:"other"},{...auditLease,workerAttemptId:"stale"},{...auditLease,leaseEpoch:2},{...auditLease,workspaceId:"foreign"}])
      await expect(service.appendBatch(lease,input)).rejects.toMatchObject({status:409});
    source.ingestAuthority.mockResolvedValue({...authority,artifact:{...authority.artifact,manifestDigest:"0".repeat(64)}});
    await expect(service.seal(auditLease,auditSeal(input.rows))).rejects.toMatchObject({status:409});
    expect(repository.append).not.toHaveBeenCalled(); expect(repository.seal).not.toHaveBeenCalled();
  });
  it("malformed private payload is a typed refusal, never a write",async()=>{
    const source={ingestAuthority:vi.fn()},repo={append:vi.fn()};
    await expect(new ResearchChildAuditCompanionIngestService(repo as never,source as never).appendBatch(auditLease,{} as never)).rejects.toMatchObject({status:400});
    expect(source.ingestAuthority).not.toHaveBeenCalled();
  });
});
