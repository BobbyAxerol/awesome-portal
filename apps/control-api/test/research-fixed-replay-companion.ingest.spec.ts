import { describe,expect,it,vi } from "vitest";
import { ResearchFixedReplayCompanionIngestService } from "../src/research/fixed-replay-companion.ingest";
import { replayAuthority,replayBatch,replayLease,replayRow,replaySeal } from "./research-fixed-replay-companion.fixture";
describe("fenced fixed OOS private ingress",()=>{
  it("requires exact workspace/job/attempt/lease and SEALED P05/profile/digests before write",async()=>{
    const input=replayBatch([replayRow(0)]),repo={append:vi.fn().mockResolvedValue({replayed:false}),seal:vi.fn().mockResolvedValue({replayed:true})};
    const authority=replayAuthority(input.manifest),source={ingestAuthority:vi.fn().mockResolvedValue(authority)};
    const service=new ResearchFixedReplayCompanionIngestService(repo as never,source as never);
    expect(await service.appendBatch(replayLease,input)).toMatchObject({state:"ACCEPTED",row_count:1,batch_ordinal:0});
    expect(await service.seal(replayLease,replaySeal([replayRow(0)]))).toMatchObject({state:"REPLAYED",companion_digest:input.companion_digest});
    repo.append.mockClear();repo.seal.mockClear();
    for(const lease of [{...replayLease,workspaceId:"foreign"},{...replayLease,jobId:"other"},{...replayLease,workerAttemptId:"stale"},{...replayLease,leaseEpoch:2}])
      await expect(service.appendBatch(lease,input)).rejects.toMatchObject({status:409});
    for(const field of ["requestedSpecDigest","effectiveSpecDigest","datasetBindingDigest","executionProfileDigest"])
    {source.ingestAuthority.mockResolvedValue({...authority,[field]:"0".repeat(64)});await expect(service.seal(replayLease,replaySeal([replayRow(0)]))).rejects.toMatchObject({status:409});}
    for(const field of ["manifestDigest","artifactRevision","state","workerAttemptId","leaseEpoch"])
    {source.ingestAuthority.mockResolvedValue({...authority,artifact:{...authority.artifact,[field]:"wrong"}});await expect(service.appendBatch(replayLease,input)).rejects.toMatchObject({status:409});}
    expect(repo.append).not.toHaveBeenCalled();expect(repo.seal).not.toHaveBeenCalled();
  });
  it("accepts manifest-bound fresh absence through seal only and rejects malformed ingress before authority reads",async()=>{
    const input=replaySeal([],true),repo={seal:vi.fn().mockResolvedValue({replayed:false})},source={ingestAuthority:vi.fn().mockResolvedValue(replayAuthority(input.manifest))};
    const service=new ResearchFixedReplayCompanionIngestService(repo as never,source as never);
    expect(await service.seal(replayLease,input)).toMatchObject({state:"SEALED"});
    source.ingestAuthority.mockClear();await expect(service.appendBatch(replayLease,{} as never)).rejects.toMatchObject({status:400});
    expect(source.ingestAuthority).not.toHaveBeenCalled();
  });
});
