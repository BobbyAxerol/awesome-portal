/** Synthetic contract fixture only. Never a native/runtime receipt. */
import { createHash } from "node:crypto";
import { PinnedAuditResultSchema, VerifiedPinnedAuditSchema, pinnedAuditParametersDigest,
  pinnedAuditTargetDigest, type PinnedAuditTarget } from "../src/research/final-audit.contract";
import { sha256ResearchJson } from "../src/research/preflight.service";
const hash=(text:string)=>createHash("sha256").update(text,"utf8").digest("hex");
export const auditTarget: PinnedAuditTarget = {
  schema_version:"research.pinned-selection-audit-target.v1",parent_run_id:"rrun_parent",parent_artifact_id:"rart_parent",
  parent_artifact_revision:1,parent_manifest_digest:"a".repeat(64),dataset_binding_digest:"b".repeat(64),
  snapshot_id:`dss_${"c".repeat(32)}`,snapshot_content_hash:"d".repeat(64),engine_release_id:"er_quantbt_111",engine_version:"1.1.1",
  alpha_version_id:"av_original",execution_adapter_id:"p04.delta-rsi.v1",
  adapter_contract_digest:"9ade757b5c1cd87681a2efb49011c84a96211939710dcd32c9fd1c7777e95784",
  source_config_raw:'{"fixture_only":true}',source_config_digest:hash('{"fixture_only":true}'),
  source_selection_raw:'{"rvol":"1.20","slpercent":"2.3","window":"34"}',
  source_selection_digest:hash('{"rvol":"1.20","slpercent":"2.3","window":"34"}'),
  source_selection_kind:"P05_SELECTION_PARAMETERS_JSON",source_selection_part_digest:"e".repeat(64),
  source_selection_part_relative_path:"tables/selection/part-000001.parquet",
};
export const auditResult=PinnedAuditResultSchema.parse({schema_version:"research.pinned-selection-audit-result.v1",
  run_id:"rrun_audit_2",parent_run_id:auditTarget.parent_run_id,target_digest:pinnedAuditTargetDigest(auditTarget),
  parameters_digest:pinnedAuditParametersDigest(auditTarget.source_selection_raw),engine_release_id:"er_quantbt_111",engine_version:"1.1.1",
  snapshot_id:auditTarget.snapshot_id,snapshot_content_hash:auditTarget.snapshot_content_hash,
  source_selection_digest:auditTarget.source_selection_digest,source_selection_kind:auditTarget.source_selection_kind,
  source_selection_part_digest:auditTarget.source_selection_part_digest,source_config_digest:auditTarget.source_config_digest,
  audit_target_kind:"SINGLE_PARAMETER_SET",optimizer_reinvoked:false,optimizer_trials:0,n_folds:2,bars:500});
export const auditProof=VerifiedPinnedAuditSchema.parse({child_run_id:auditResult.run_id,child_attempt_id:"ratt_audit_2",
  artifact_id:"rart_audit_2",artifact_revision:1,manifest_digest:"f".repeat(64),
  result_digest:sha256ResearchJson(auditResult),verified_at_utc_ms:1791036000000,result:auditResult});
