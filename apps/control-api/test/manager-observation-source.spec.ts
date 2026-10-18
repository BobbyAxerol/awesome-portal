/** Stub-repository adapter invariants only, NOT actual PG/physical delivery. */
import { describe,it,expect,vi } from "vitest";
import { ManagerObservationNoticeSource,managerObservationBaseline,managerObservationQueryDigest,
  MANAGER_OBSERVATION_STREAM_MODEL,type ManagerObservationHead,type ManagerObservationSelection } from "../src/execution-v2/manager-observation-source";
import { decodeManagerObservationCoordinate,encodeManagerObservationCoordinate } from "../src/execution-v2/manager-observation-coordinate";
import type { ScopedReplayBinding } from "../src/execution-v2/realtime.contract";
import type { ProfileProjectionSnapshot,ProfileProjectionJournalMetadata } from "../src/execution/profile-projection.repository";

const hash=(c:string)=>"sha256:"+c.repeat(64),epoch="12345678-1234-1234-1234-123456789abc";
const selection:ManagerObservationSelection={workspace_id:"TEST_ONLY-workspace",environment:"paper",profile_id:"PAPER_TEST_ONLY",
  source_identity_digest:hash("a"),source_contract_revision:"TEST_ONLY-manager-contract-r1",source_catalogue_sha256:hash("b")};
function fixture(maximum=200){
  const snapshot:ProfileProjectionSnapshot={document:{schema_version:"portal.execution.profile-projection.v1",
    workspace_id:selection.workspace_id,environment:selection.environment,profile_id:selection.profile_id,
    source_contract_revision:selection.source_contract_revision,source_catalogue_sha256:selection.source_catalogue_sha256,relations:{}},
    sourceEpoch:"TEST_ONLY-source-epoch",sourceCursor:"TEST_ONLY-private-source",sourceAsOf:null,receivedAt:new Date(1000),
    lastSuccessfulRefreshAt:new Date(1000),completeness:"UNKNOWN",projectionEpoch:epoch,projectionSequence:10,
    payloadDigest:hash("c"),sourceCatalogueSha256:selection.source_catalogue_sha256};
  const baseline=managerObservationBaseline(snapshot,selection);
  const binding:ScopedReplayBinding={workspace_id:selection.workspace_id,environment:selection.environment,profile_id:selection.profile_id,
    principal_scope_digest:hash("d"),app_policy_revision:"TEST_ONLY-policy",field_policy_revision:"TEST_ONLY-fields",
    model_revision:MANAGER_OBSERVATION_STREAM_MODEL,schema_revision:"portal.execution.scoped-realtime.v1",
    dataset:"execution_profile_observation",query_digest:managerObservationQueryDigest(selection),window:null,
    snapshot_id:baseline.snapshot_id,source_set_digest:baseline.source_set_digest,
    source_continuity_epoch:baseline.source_continuity_epoch,projection_generation:baseline.projection_generation};
  let head:ManagerObservationHead|null={...snapshot,sourceContractRevision:selection.source_contract_revision};
  let entries:ProfileProjectionJournalMetadata[]=[];
  const repository={snapshotMetadata:vi.fn(async()=>head),journalMetadataAfter:vi.fn(async(_w:string,_e:string,_p:string,_epoch:string,after:number,limit:number)=>
    entries.filter(r=>r.projectionSequence>after).slice(0,limit))};
  const row=(sequence:number):ProfileProjectionJournalMetadata=>({workspaceId:selection.workspace_id,environment:selection.environment,
    profileId:selection.profile_id,projectionEpoch:epoch,projectionSequence:sequence,sourceAsOf:null,receivedAt:new Date(2000),
    completeness:"PARTIAL",payloadDigest:hash("e"),observationAuthority:"PORTAL_OBSERVATION",observationSemantics:"BOUNDED_CURRENT_PAGE",
    sourceContractRevision:selection.source_contract_revision,sourceCatalogueSha256:selection.source_catalogue_sha256});
  return {snapshot,baseline,binding,repository,row,source:new ManagerObservationNoticeSource(repository,selection,maximum),
    getHead:()=>head!,setHead:(value:ManagerObservationHead|null)=>{head=value;},setRows:(rows:ProfileProjectionJournalMetadata[])=>{entries=rows;}};
}

describe("Existing Portal observation source, not TS Events",()=>{
  it("GET seq10 then commit11 before SSE reads11 without recapturing the baseline",async()=>{
    const f=fixture();f.setHead({...f.getHead(),projectionSequence:11});f.setRows([f.row(11)]);
    const result=await f.source.read(f.binding,f.baseline.source_cursor),coordinate=decodeManagerObservationCoordinate(result.next_cursor!);
    expect(result.notices).toHaveLength(1);expect(coordinate).toMatchObject({baseline_sequence:10,after_sequence:11,original_snapshot_id:f.baseline.snapshot_id});
    expect(f.repository.journalMetadataAfter).toHaveBeenCalledWith(selection.workspace_id,"paper",selection.profile_id,epoch,10,1);
  });
  it("resumes from original ID after multiple head changes",async()=>{
    const f=fixture();f.setHead({...f.getHead(),projectionSequence:13});f.setRows([f.row(12),f.row(13)]);
    const after=encodeManagerObservationCoordinate({...decodeManagerObservationCoordinate(f.baseline.source_cursor),after_sequence:11});
    const result=await f.source.read(f.binding,after);
    expect(result.notices.map(n=>decodeManagerObservationCoordinate(n.resume_cursor).after_sequence)).toEqual([12,13]);
    expect(decodeManagerObservationCoordinate(result.next_cursor!).original_snapshot_id).toBe(f.baseline.snapshot_id);
  });
  it("uses caller's bounded Hub batch size and drains dense pages without skipping",async()=>{
    const f=fixture();f.setHead({...f.getHead(),projectionSequence:12});f.setRows([f.row(11),f.row(12)]);
    const first=await f.source.read(f.binding,f.baseline.source_cursor,1);expect(first.caught_up).toBe(false);
    expect(f.repository.journalMetadataAfter).toHaveBeenLastCalledWith(selection.workspace_id,"paper",selection.profile_id,epoch,10,1);
    const second=await f.source.read(f.binding,first.next_cursor!,1);expect(second.caught_up).toBe(true);
    expect(decodeManagerObservationCoordinate(second.next_cursor!).after_sequence).toBe(12);
  });
  it("retains the adapter's smaller cap when Hub permits a larger batch",async()=>{
    const f=fixture(1);f.setHead({...f.getHead(),projectionSequence:12});f.setRows([f.row(11),f.row(12)]);
    const result=await f.source.read(f.binding,f.baseline.source_cursor,200);
    expect(result.notices).toHaveLength(1);expect(result.caught_up).toBe(false);
    expect(f.repository.journalMetadataAfter).toHaveBeenLastCalledWith(selection.workspace_id,"paper",selection.profile_id,epoch,10,1);
  });
  it.each([0,201,1.5,NaN])("rejects an invalid requested limit %s before repository I/O",async limit=>{
    const f=fixture();await expect(f.source.read(f.binding,f.baseline.source_cursor,limit)).rejects.toMatchObject({code:"SOURCE_COVERAGE_UNPROVED"});
    expect(f.repository.snapshotMetadata).not.toHaveBeenCalled();expect(f.repository.journalMetadataAfter).not.toHaveBeenCalled();
  });
  it("separates genuine source identities even for the same profile and repository",async()=>{
    const f=fixture(),otherSelection={...selection,source_identity_digest:hash("f")};
    expect(managerObservationQueryDigest(otherSelection)).not.toBe(f.binding.query_digest);
    const other=new ManagerObservationNoticeSource(f.repository,otherSelection);
    await expect(other.read(f.binding,f.baseline.source_cursor)).rejects.toMatchObject({code:"SCOPE_CHANGED"});
    expect(f.repository.snapshotMetadata).not.toHaveBeenCalled();
  });
  it("normalizes raw/prefixed selected-source identity without creating two dispatch keys",()=>{
    expect(managerObservationQueryDigest({...selection,source_identity_digest:selection.source_identity_digest.slice(7)}))
      .toBe(managerObservationQueryDigest(selection));
  });
  it("pre-cancelled source flight never starts repository I/O",async()=>{
    const f=fixture(),controller=new AbortController();controller.abort();
    await expect(f.source.read(f.binding,f.baseline.source_cursor,1,controller.signal)).rejects.toMatchObject({code:"SOURCE_UNAVAILABLE"});
    expect(f.repository.snapshotMetadata).not.toHaveBeenCalled();
  });
  it("cancellation after scalar head prevents journal I/O",async()=>{
    const f=fixture(),controller=new AbortController();f.repository.snapshotMetadata.mockImplementationOnce(async()=>{
      controller.abort();return {...f.getHead(),projectionSequence:11};});
    await expect(f.source.read(f.binding,f.baseline.source_cursor,1,controller.signal)).rejects.toMatchObject({code:"SOURCE_UNAVAILABLE"});
    expect(f.repository.journalMetadataAfter).not.toHaveBeenCalled();
  });
  it("cancellation during journal I/O discards returned notices instead of publishing them",async()=>{
    const f=fixture(),controller=new AbortController();f.setHead({...f.getHead(),projectionSequence:11});
    f.repository.journalMetadataAfter.mockImplementationOnce(async()=>{controller.abort();return [f.row(11)];});
    await expect(f.source.read(f.binding,f.baseline.source_cursor,1,controller.signal)).rejects.toMatchObject({code:"SOURCE_UNAVAILABLE"});
  });
  it("unchanged scalar head avoids reading journal or inventing a new cursor",async()=>{
    const f=fixture(),result=await f.source.read(f.binding,f.baseline.source_cursor);
    expect(result).toEqual({notices:[],next_cursor:f.baseline.source_cursor,caught_up:true});expect(f.repository.journalMetadataAfter).not.toHaveBeenCalled();
  });
  it("retention missing first dense row requires resync, never skip",async()=>{
    const f=fixture();f.setHead({...f.getHead(),projectionSequence:12});f.setRows([f.row(12)]);
    await expect(f.source.read(f.binding,f.baseline.source_cursor)).rejects.toMatchObject({code:"SOURCE_COVERAGE_UNPROVED"});
  });
  it("a shortened prefix before captured head is refused",async()=>{
    const f=fixture();f.setHead({...f.getHead(),projectionSequence:12});f.setRows([f.row(11)]);
    await expect(f.source.read(f.binding,f.baseline.source_cursor)).rejects.toMatchObject({code:"SOURCE_COVERAGE_UNPROVED"});
  });
  it("epoch reset never silently remints a new baseline",async()=>{
    const f=fixture();f.setHead({...f.getHead(),projectionEpoch:"22345678-1234-1234-1234-123456789abc"});
    await expect(f.source.read(f.binding,f.baseline.source_cursor)).rejects.toMatchObject({code:"GENERATION_CHANGED"});
  });
  it.each([{sourceContractRevision:"OTHER-contract"},{sourceCatalogueSha256:hash("f")},{sourceEpoch:"OTHER-source-epoch"}])("refuses source provenance drift %j",async changed=>{
    const f=fixture();f.setHead({...f.getHead(),...changed});
    await expect(f.source.read(f.binding,f.baseline.source_cursor)).rejects.toMatchObject({code:"SCOPE_CHANGED"});
  });
  it.each([{workspace_id:"OTHER-workspace"},{environment:"live" as const},{profile_id:"OTHER-profile"},
    {model_revision:"portal.manager-observation.baseline.v1"},{query_digest:hash("f")}])("refuses wrong bound source scope %j",async changed=>{
    const f=fixture();await expect(f.source.read({...f.binding,...changed},f.baseline.source_cursor)).rejects.toMatchObject({code:"SCOPE_CHANGED"});
    expect(f.repository.snapshotMetadata).not.toHaveBeenCalled();
  });
  it("original snapshot coordinate cannot be relabeled",async()=>{
    const f=fixture(),after=encodeManagerObservationCoordinate({...decodeManagerObservationCoordinate(f.baseline.source_cursor),original_snapshot_id:hash("0")});
    await expect(f.source.read(f.binding,after)).rejects.toMatchObject({code:"SCOPE_CHANGED"});
  });
  it.each([{workspaceId:"OTHER-workspace"},{projectionEpoch:"OTHER-epoch"},{observationAuthority:"OTHER-authority"},
    {sourceContractRevision:"OTHER-contract"}])("refuses a journal row outside exact publication scope %j",async changed=>{
    const f=fixture();f.setHead({...f.getHead(),projectionSequence:11});f.setRows([{...f.row(11),...changed} as ProfileProjectionJournalMetadata]);
    await expect(f.source.read(f.binding,f.baseline.source_cursor)).rejects.toMatchObject({code:"SOURCE_COVERAGE_UNPROVED"});
  });
  it.each(["PARTIAL","UNKNOWN"] as const)("keeps %s bounded quality honest and emits no source payload",async completeness=>{
    const f=fixture();f.setHead({...f.getHead(),projectionSequence:11});f.setRows([{...f.row(11),completeness}]);
    const result=await f.source.read(f.binding,f.baseline.source_cursor);
    expect(result.notices[0]!.quality).toMatchObject({coverage:"CURRENT_PAGE_ONLY",freshness:"UNKNOWN"});
    expect(result.notices[0]!.quality.confidence).not.toBe("VERIFIED");expect(JSON.stringify(result)).not.toContain("TEST_ONLY_MUST_NOT_LEAK");
  });
  it("uses only the scalar journal port and never reads an extra private payload",async()=>{
    const f=fixture(),row=f.row(11),legacy=vi.fn(()=>{throw Error("TEST_ONLY_LEGACY_PAYLOAD_READER");});
    Object.defineProperty(f.repository,"journalAfter",{value:legacy});
    Object.defineProperty(row,"payload",{get(){throw Error("TEST_ONLY_PRIVATE_PAYLOAD_ACCESSED");}});
    f.setHead({...f.getHead(),projectionSequence:11});f.setRows([row]);
    const result=await f.source.read(f.binding,f.baseline.source_cursor);
    expect(result.notices).toHaveLength(1);expect(f.repository.journalMetadataAfter).toHaveBeenCalledOnce();
    expect(legacy).not.toHaveBeenCalled();
  });
  it("DB exceptions retain only safe unavailable reason",async()=>{
    const f=fixture();f.repository.snapshotMetadata.mockRejectedValueOnce(Error("TEST_ONLY_SQL_OR_SECRET"));
    await expect(f.source.read(f.binding,f.baseline.source_cursor)).rejects.toMatchObject({code:"SOURCE_UNAVAILABLE",message:"Execution updates require a current authorized snapshot."});
  });
  it("unsafe projection counters fail closed",async()=>{
    const f=fixture();f.setHead({...f.getHead(),projectionSequence:NaN});
    await expect(f.source.read(f.binding,f.baseline.source_cursor)).rejects.toMatchObject({code:"SOURCE_COVERAGE_UNPROVED"});
  });
  it("missing head is unavailable rather than an empty successful stream",async()=>{
    const f=fixture();f.setHead(null);await expect(f.source.read(f.binding,f.baseline.source_cursor)).rejects.toMatchObject({code:"SOURCE_UNAVAILABLE"});
  });
  it.each([0,201,1.5])("refuses unbounded/invalid batch %s",limit=>{
    const f=fixture();expect(()=>new ManagerObservationNoticeSource(f.repository,selection,limit)).toThrow("OBSERVATION_BOUND_INVALID");
  });
  it("baseline source document must match selected scope",()=>{
    const f=fixture();expect(()=>managerObservationBaseline({...f.snapshot,document:{...f.snapshot.document,profile_id:"OTHER-profile"}},selection)).toThrow();
  });
  it("baseline document/column catalogue mismatch fails closed",()=>{
    const f=fixture();expect(()=>managerObservationBaseline({...f.snapshot,document:{...f.snapshot.document,source_catalogue_sha256:hash("f")}},selection)).toThrow();
  });
});
