import { describe, expect, it, vi } from "vitest";
import { ResearchChildAuditCompanionIngestService } from "../src/research/child-audit-companion.ingest";
import { auditAuthority, auditBatch, auditLease, auditRow, auditSeal } from "./research-child-audit-companion.fixture";
import { DELTA_CAUSAL_INNER_PROFILE, DELTA_CAUSAL_INNER_PROFILE_ID, DELTA_CAUSAL_INNER_PROFILE_DIGEST } from "../src/research/delta-causal-inner.profile";
import { sha256ResearchJson } from "../src/research/preflight.service";
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
  it("accepts an exact causal execution/source pair and refuses cross-profile source aliases", async () => {
    const input = auditBatch([auditRow(0)]);
    Object.assign(input.manifest, { execution_profile_id: DELTA_CAUSAL_INNER_PROFILE_ID,
      execution_profile_digest: DELTA_CAUSAL_INNER_PROFILE_DIGEST, ...DELTA_CAUSAL_INNER_PROFILE.current_source });
    input.companion_digest = sha256ResearchJson(input.manifest);
    const source = { ingestAuthority: vi.fn().mockResolvedValue(auditAuthority(input.manifest)) };
    const repository = { append: vi.fn().mockResolvedValue({ replayed: false }) };
    const service = new ResearchChildAuditCompanionIngestService(repository as never, source as never);
    await expect(service.appendBatch(auditLease, input)).resolves.toMatchObject({ accepted: true });
    input.manifest.profile_id = "rs02.delta-signal-notional-wfo.v1";
    input.companion_digest = sha256ResearchJson(input.manifest);
    await expect(service.appendBatch(auditLease, input)).rejects.toMatchObject({ status: 409 });
    expect(repository.append).toHaveBeenCalledTimes(1);
  });
});
