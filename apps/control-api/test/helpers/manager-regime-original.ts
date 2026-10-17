/** Test-only Regime original custody helper.
 * SYNTHETIC pins only; actual existing loaders, worker and capture identity.
 * No test-suite import, PG, installation, public authority or source receipt. */
import { accessDigest } from "../../src/execution-v2/access-policy";
import type { ManagerModelDocument } from "../../src/execution-v2/manager-model.contract";
import { captureManagerRegimeOriginal, type ManagerRegimeOriginalCustody }
  from "../../src/execution-v2/manager-regime-runtime";
import type { ManagerScoreOriginalCustodySnapshot }
  from "../../src/execution-v2/manager-score-original-custody";
import { calculate, clone, fixture } from "./manager-regime";

export const regimeOriginalLimits={maximum_bundle_bytes:1_048_576,
  maximum_revisions_per_source:4,maximum_retained_bytes_per_source:4_194_304};
export type CalculatedRegime=Awaited<ReturnType<typeof calculate>>;
export function regimeOriginalDocument(items:readonly CalculatedRegime[]):ManagerModelDocument {
  if(items.length<1)throw new Error("TEST_ONLY_REGIME_REQUIRED");
  const h=items[0],a=h.f.evidence;
  return {schema_version:"portal.execution.manager-model-input.v1",workspace_id:a.scope.workspace_id,
    environment:a.scope.environment,profile_id:a.scope.profile_id,qualification:"SOURCE_VERIFIED",
    family_id:"alpha_fleet_overview",revision:a.source_revision,supersedes_revision:null,
    source_epoch:"TEST_ONLY:original-epoch",source_sequence:"1",projection_generation:a.projection_generation,
    catalogue_digest:a.scope.catalogue_digest,source_set_digest:a.source_set_digest,as_of_ms:a.source_as_of_ms,
    recorded_through_ms:a.source_as_of_ms,facts_through_ms:a.source_as_of_ms,observed_at_ms:h.task.computed_at_ms,
    source_quality:{completeness:"COMPLETE",freshness:"FRESH",reasons:[]},facts:[],
    members:a.population.map(m=>({...clone(m),name:"TEST_ONLY:Alpha",owner_user_id:"TEST_ONLY:researcher",
      lifecycle:"ACTIVE",venue:null,health:null,source_state:null,binding_ref:null,
      assignment_revision:"TEST_ONLY:assignment",owner_revision:"TEST_ONLY:owner",binding_revision:"TEST_ONLY:binding",
      valid_from_ms:100,valid_to_ms:null})),precomputed_regimes:items.map(x=>clone(x.publication))};
}
export function captureRegimeOriginals(items:readonly CalculatedRegime[],document:ManagerModelDocument,
  maximum_bytes=regimeOriginalLimits.maximum_bundle_bytes,captured_at_ms=1002):ManagerRegimeOriginalCustody[] {
  return items.map(h=>{const result=captureManagerRegimeOriginal({policy:h.policy,evidence:h.evidence,
    document,publication:h.publication,maximum_bytes},()=>captured_at_ms);
    if(result.status!=="READY")throw new Error(JSON.stringify(result));return result.custody;});
}
export async function regimeOriginalFixture(count=1) {
  if(!Number.isSafeInteger(count)||count<1||count>2)throw new Error("TEST_ONLY_FINITE_FIXTURE_COUNT");
  const items:CalculatedRegime[]=[];
  for(let index=0;index<count;index++){
    const f=fixture();f.evidence.binding.individual_evidence_binding_id=`TEST_ONLY:individual-evidence${index}`;
    // Distinct legitimate subjects over the same accepted tuple census, not
    // two versions of one subject disguised by changing only an evidence ID.
    if(index===1){f.evidence.binding.subject_type="deployment";
      f.evidence.binding.subject_id=f.evidence.population[0].tuple.deployment_id;}
    items.push(await calculate(f));
  }
  const document=regimeOriginalDocument(items),custodies=captureRegimeOriginals(items,document);
  return {items,document,custodies};
}
/** Documented expected envelope, checked against genuine prepare's key/digest.
 * Not a persisted/authorized parent or substitute first-write identity. */
export function regimeV4ExpectedRow(document:ManagerModelDocument,custodies:readonly ManagerRegimeOriginalCustody[]) {
  const {workspace_id,environment,profile_id,revision,qualification,source_epoch,source_sequence,
    projection_generation,catalogue_digest,source_set_digest,as_of_ms}=document;
  const source={workspace_id,environment,profile_id,revision,payload_digest:accessDigest(document),qualification,
    source_epoch,source_sequence,projection_generation,catalogue_digest,source_set_digest,as_of_ms};
  const key=(c:ManagerRegimeOriginalCustody)=>accessDigest({...c.binding,stage_filter:[...c.binding.stage_filter].sort()});
  const sorted=[...custodies].sort((a,b)=>key(a)<key(b)?-1:key(a)>key(b)?1:0);
  const retained_regimes=sorted.map(c=>({custody_digest:c.custody_digest,custody:clone(c)}));
  const body={retained_tasks:[],retained_compositions:[],retained_regimes};
  const inputs_digest=accessDigest(body),calculation_key=accessDigest({mode:"ORIGINAL_INPUTS",source,inputs_digest});
  const payload:Extract<ManagerScoreOriginalCustodySnapshot,{schema_version:"portal.execution.manager-score-original-inputs.v4"}>=
    {schema_version:"portal.execution.manager-score-original-inputs.v4",source,...body,inputs_digest,calculation_key};
  return {payload,payload_digest:accessDigest(payload),calculation_key};
}
