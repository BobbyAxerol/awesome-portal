/** Server-only adapter over EXISTING committed Portal observation rows.
 * No authority is minted here. Finite HTTP/SSE callers must use the genuine
 * selected native Candidate and current READ/STREAM checks before delivery. */
import { accessDigest } from "./access-policy";
import { edgeScopedNoticeBatch,type EdgeScopedNoticeBatch,type ScopedReplayBinding } from "./realtime.contract";
import { ScopedReplayError } from "./scoped-replay-cursor";
import { encodeManagerObservationCoordinate,decodeManagerObservationCoordinate } from "./manager-observation-coordinate";
import type { ProfileProjectionSnapshot,ProfileProjectionJournalMetadata,ProjectionEnvironment } from "../execution/profile-projection.repository";
import type { ScopedNoticeSource } from "./realtime";

export const MANAGER_OBSERVATION_BASELINE_MODEL="portal.manager-observation.baseline.v1";
export const MANAGER_OBSERVATION_STREAM_MODEL="portal.manager-observation.stream.v1";
export type ManagerObservationSelection=Readonly<{workspace_id:string;environment:ProjectionEnvironment;profile_id:string;
  source_identity_digest:string;source_contract_revision:string;source_catalogue_sha256:string}>;
export type ManagerObservationHead=Pick<ProfileProjectionSnapshot,"sourceEpoch"|"projectionEpoch"|"projectionSequence"|
  "payloadDigest"|"sourceCatalogueSha256"> & {sourceContractRevision:string};
export interface ManagerObservationRepository {
  snapshotMetadata(workspace:string,environment:ProjectionEnvironment,profile:string):Promise<ManagerObservationHead|null>;
  journalMetadataAfter(workspace:string,environment:ProjectionEnvironment,profile:string,epoch:string,after:number,limit:number):Promise<ProfileProjectionJournalMetadata[]>;
}
const invalid=(code:ConstructorParameters<typeof ScopedReplayError>[0]):never=>{throw new ScopedReplayError(code);};
function hash(value:string|null):string{
  if(typeof value!=="string"||!/^(?:sha256:)?[a-f0-9]{64}$(?![\s\S])/.test(value))return invalid("SOURCE_COVERAGE_UNPROVED");
  return value.startsWith("sha256:")?value:"sha256:"+value;
}
function sourceDigest(selection:ManagerObservationSelection,head:ManagerObservationHead):string{
  if(!head.sourceEpoch||head.sourceContractRevision!==selection.source_contract_revision||
    hash(head.sourceCatalogueSha256)!==hash(selection.source_catalogue_sha256))return invalid("SCOPE_CHANGED");
  return accessDigest({schema_version:"portal.manager-observation.source-set.v1",
    source_identity_digest:hash(selection.source_identity_digest),source_epoch:head.sourceEpoch,
    source_contract_revision:head.sourceContractRevision,source_catalogue_sha256:hash(head.sourceCatalogueSha256)});
}
export function managerObservationQueryDigest(selection:ManagerObservationSelection):string{
  return accessDigest({schema_version:"portal.manager-observation.query.v1",workspace_id:selection.workspace_id,
    environment:selection.environment,profile_id:selection.profile_id,dataset:"execution_profile_observation",
    source_identity_digest:hash(selection.source_identity_digest)});
}
/** Called only AFTER finite current READ selection; this pure capture is not
 * a grant. Never reread/rebaseline it when opening or resuming SSE. */
export function managerObservationBaseline(snapshot:ProfileProjectionSnapshot,selection:ManagerObservationSelection){
  const d=snapshot.document;
  if(d.workspace_id!==selection.workspace_id||d.environment!==selection.environment||d.profile_id!==selection.profile_id||
    hash(d.source_catalogue_sha256??null)!==hash(snapshot.sourceCatalogueSha256)||
    !Number.isSafeInteger(snapshot.projectionSequence)||snapshot.projectionSequence<1)return invalid("SOURCE_COVERAGE_UNPROVED");
  const head={...snapshot,sourceContractRevision:d.source_contract_revision},source_set_digest=sourceDigest(selection,head);
  const snapshot_id=accessDigest({schema_version:"portal.manager-observation.snapshot.v1",query_digest:managerObservationQueryDigest(selection),
    source_set_digest,projection_epoch:snapshot.projectionEpoch,sequence:snapshot.projectionSequence,payload_digest:hash(snapshot.payloadDigest)});
  return Object.freeze({snapshot_id,source_set_digest,projection_generation:snapshot.projectionEpoch,
    source_continuity_epoch:snapshot.projectionEpoch,
    source_cursor:encodeManagerObservationCoordinate({version:1,projection_epoch:snapshot.projectionEpoch,
      original_snapshot_id:snapshot_id,baseline_sequence:snapshot.projectionSequence,after_sequence:snapshot.projectionSequence})});
}
function dateMs(value:Date|null):number|null{
  if(value===null)return null;
  const n=value.valueOf();if(!Number.isSafeInteger(n)||n<0)return invalid("SOURCE_COVERAGE_UNPROVED");return n;
}

/** Stateless across baselines/sessions. SAME Hub owns lifetime, queue and
 * physical delivery. Read only scalar head + <=200 journal rows; no payload
 * scan, duplicate cache/registry or independent polling loop. */
export class ManagerObservationNoticeSource implements ScopedNoticeSource {
  private readonly selection:ManagerObservationSelection;
  constructor(private readonly repository:ManagerObservationRepository,selection:ManagerObservationSelection,
    private readonly maximumNotices=200){
    if(!Number.isSafeInteger(maximumNotices)||maximumNotices<1||maximumNotices>200)throw Error("OBSERVATION_BOUND_INVALID");
    hash(selection.source_identity_digest);hash(selection.source_catalogue_sha256);
    this.selection=Object.freeze({...selection});
  }
  async read(binding:ScopedReplayBinding,after:string,requestedLimit=this.maximumNotices,signal?:AbortSignal):Promise<EdgeScopedNoticeBatch>{
    try{
      if(!Number.isSafeInteger(requestedLimit)||requestedLimit<1||requestedLimit>200)
        return invalid("SOURCE_COVERAGE_UNPROVED");
      if(signal?.aborted)return invalid("SOURCE_UNAVAILABLE");
      const c=decodeManagerObservationCoordinate(after),s=this.selection;
      if(binding.dataset!=="execution_profile_observation"||binding.window!==null||
        binding.model_revision!==MANAGER_OBSERVATION_STREAM_MODEL||binding.workspace_id!==s.workspace_id||
        binding.environment!==s.environment||binding.profile_id!==s.profile_id||
        binding.query_digest!==managerObservationQueryDigest(s)||binding.snapshot_id!==c.original_snapshot_id||
        binding.projection_generation!==c.projection_epoch||binding.source_continuity_epoch!==c.projection_epoch)
        return invalid("SCOPE_CHANGED");
      const head=await this.repository.snapshotMetadata(s.workspace_id,s.environment,s.profile_id);
      if(signal?.aborted)return invalid("SOURCE_UNAVAILABLE");
      if(!head)return invalid("SOURCE_UNAVAILABLE");
      if(head.projectionEpoch!==c.projection_epoch)return invalid("GENERATION_CHANGED");
      if(sourceDigest(s,head)!==binding.source_set_digest)return invalid("SCOPE_CHANGED");
      if(!Number.isSafeInteger(head.projectionSequence)||head.projectionSequence<c.after_sequence)
        return invalid("SOURCE_COVERAGE_UNPROVED");
      const count=Math.min(requestedLimit,this.maximumNotices,head.projectionSequence-c.after_sequence);
      if(count===0)return{notices:[],next_cursor:after,caught_up:true};
      const rows=await this.repository.journalMetadataAfter(s.workspace_id,s.environment,s.profile_id,c.projection_epoch,c.after_sequence,count);
      if(signal?.aborted)return invalid("SOURCE_UNAVAILABLE");
      // The captured head and journal writer commit atomically. A missing dense
      // prefix is retention/corruption, never permission to skip/rebaseline.
      if(rows.length!==count)return invalid("SOURCE_COVERAGE_UNPROVED");
      const notices=rows.map((row,index)=>{
        if(row.workspaceId!==s.workspace_id||row.environment!==s.environment||row.profileId!==s.profile_id||
          row.projectionEpoch!==c.projection_epoch||row.projectionSequence!==c.after_sequence+index+1||
          row.sourceContractRevision!==s.source_contract_revision||hash(row.sourceCatalogueSha256)!==hash(s.source_catalogue_sha256)||
          row.observationAuthority!=="PORTAL_OBSERVATION"||row.observationSemantics!=="BOUNDED_CURRENT_PAGE"||
          !["COMPLETE","PARTIAL","UNKNOWN"].includes(row.completeness))
          return invalid("SOURCE_COVERAGE_UNPROVED");
        const observed=dateMs(row.receivedAt);if(observed===null)return invalid("SOURCE_COVERAGE_UNPROVED");
        return{resume_cursor:encodeManagerObservationCoordinate({...c,after_sequence:row.projectionSequence}),
          projection_generation:c.projection_epoch,quality:{
            completeness:row.completeness==="UNKNOWN"?"UNRESOLVED" as const:"PARTIAL" as const,
            freshness:"UNKNOWN" as const,coverage:"CURRENT_PAGE_ONLY" as const,
            source_as_of_ms:dateMs(row.sourceAsOf),portal_observed_at_ms:observed,source_set_ref:binding.source_set_digest,
            confidence:row.completeness==="UNKNOWN"?"UNKNOWN" as const:"PROVISIONAL" as const,
            reasons:["PORTAL_OBSERVATION_NOT_TS_EVENT","CURRENT_PAGE_ONLY","SOURCE_FRESHNESS_NOT_ATTESTED"]}};
      });
      return edgeScopedNoticeBatch.parse({notices,next_cursor:notices[notices.length-1]!.resume_cursor,
        // Caught up to this captured Portal head, not global TS completeness.
        caught_up:rows[rows.length-1]!.projectionSequence===head.projectionSequence});
    }catch(error){if(error instanceof ScopedReplayError)throw error;return invalid("SOURCE_UNAVAILABLE");}
  }
}
