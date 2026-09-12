import { Inject, Injectable } from "@nestjs/common";
import { Pool, PoolClient } from "pg";
import { ControlApiConfig } from "../config";
import { withTransaction } from "../db/pool";
import { PortalUser } from "../domain";
import { ExecutionProfileProjectionRepository, projectionDigest, type ProjectionRow } from "../execution/profile-projection.repository";
import { newUlid } from "../id";
import { CONTROL_API_CONFIG, CONTROL_API_POOL } from "../tokens";
import { computeEvidenceManifestHash, GovernanceError } from "./governance.service";
import { type EvidenceRecord } from "./governance.repository";
import { PaperExitRepository } from "./paper-exit.repository";
import { computePaperExitSourceSnapshotHash } from "./paper-exit.service";
import type { PaperExitCreate, R2Capture, SandboxReviewNote } from "./review-capture.contracts";

const POLICY = "portal.review-capture.v1";
const EXIT_PANELS = ["OBSERVATION_COVERAGE", "DRIFT", "LIMITS_HEALTH", "PORTFOLIO_FIT"] as const;
const SANDBOX_STEPS = ["CONNECT", "SYNC", "ORDER_TYPES", "RECONCILIATION", "TIMEBOXED_RUN", "CLEANUP", "EXIT_REVIEW"];
const GAP = "ACCEPTED_EXIT_POLICY_EVALUATION_UNAVAILABLE";
function fail(code: string, status = 409): never { throw new GovernanceError(code, code, status); }

/**
 * Captures Portal reviews, never source verdicts. Public input contains only
 * references/revisions and a Portal-authored note, never an asserted PASS,
 * broker proof, source URL or arbitrary evidence hash to trust.
 */
@Injectable()
export class GovernanceReviewCaptureService {
  constructor(
    @Inject(CONTROL_API_POOL) private readonly pool: Pool,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    @Inject(ExecutionProfileProjectionRepository) private readonly projections: ExecutionProfileProjectionRepository,
    @Inject(PaperExitRepository) private readonly exits: PaperExitRepository,
  ) {}

  capabilities(user: PortalUser) {
    return { schema_version: "governance.review-capture-capabilities.v1", authority: "PORTAL",
      source_side_effect_requested: false,
      actions: [
        { id: "R2_CREATE", state: "AVAILABLE", inputs: "APPROVED_R1_AND_PINNED_PAPER_DEPLOYMENT_RISK_GRANT", path: "/api/v1/execution/governance/r2/capture" },
        { id: "PAPER_EXIT_CREATE", state: "AVAILABLE", inputs: "PINNED_R2_AND_PAPER_DEPLOYMENT", path: "/api/v1/execution/governance/paper-exit/create" },
        { id: "SANDBOX_NOTE", state: "AVAILABLE", inputs: "EXISTING_DRAFT_CERTIFICATION", path: "/api/v1/execution/governance/sandbox/capture-note" },
        { id: "R2_EXECUTION_GRANT", state: "UNAVAILABLE", reason_code: "R2_EXECUTION_DECISION_NOT_COMMISSIONED" },
        { id: "PAPER_EXIT_PROMOTE", state: "UNAVAILABLE", reason_code: GAP },
        { id: "SANDBOX_CERTIFY_SOURCE", state: "UNAVAILABLE", reason_code: "ACCEPTED_SANDBOX_STEP_EVIDENCE_UNAVAILABLE" },
      ].map(action => action.state === "AVAILABLE" && user.role !== "ADMIN"
        ? { ...action,state:"UNAVAILABLE",reason_code:"ADMIN_ROLE_REQUIRED" } : action) };
  }

  async createR2(user: PortalUser, input: R2Capture, requestId: string) {
    return this.capture(user, input, "R2_CREATE", requestId, async client => {
      const r1 = await this.parent(client, input.workspace_id, input.r1_approval_id, "R1", input.expected_r1_version);
      if (!["APPROVED", "APPROVED_WITH_CONDITION"].includes(r1.status)) fail("R1_APPROVAL_REQUIRED", 422);
      const snapshot = await this.paperSnapshot(client, input.workspace_id, input.expected_projection_digest);
      const deployment = this.deployment(this.deploymentRows(snapshot),
        input.deployment_id, r1.subject_id, input.portfolio_id);
      const grant = snapshot.document.relations["manager.risk:risk_grants"];
      if (!grant || grant.availability !== "AVAILABLE") fail("R2_RISK_GRANT_SOURCE_UNAVAILABLE", 422);
      if (!grant.items.some(row => row.fields.risk_grant_id === input.risk_grant_id &&
        row.fields.strategy_id === r1.subject_id && row.fields.account_id === deployment.account_id)) fail("R2_RISK_GRANT_SCOPE_NOT_FOUND", 422);
      const portfolios = snapshot.document.relations["manager.portfolios:portfolios"];
      if (!portfolios || portfolios.availability !== "AVAILABLE" || !portfolios.items.some(row => row.fields.portfolio_id === input.portfolio_id)) fail("R2_PORTFOLIO_SCOPE_NOT_FOUND", 422);
      // Currency is the requested review scope, not an FX conversion or source balance.
      const id = newUlid("apr");
      const evidence = await this.copyEvidence(client, r1.approval_id, r1.evidence_set_hash);
      await this.insertApproval(client, user, input.workspace_id, id, "R2", input.deployment_id, r1,
        computeEvidenceManifestHash(evidence));
      await this.insertEvidence(client, evidence, id);
      await client.query(`INSERT INTO governance_approval_analytics_scopes (approval_id,workspace_id,portfolio_id,currency)
        VALUES ($1,$2,$3,$4)`, [id, input.workspace_id, input.portfolio_id, input.currency]);
      await client.query(`INSERT INTO governance_r2_lineage
        (r2_approval_id,workspace_id,r1_approval_id,grant_id,grant_name,approver_role,plan_author_user_id,plan_author_username)
        VALUES ($1,$2,$3,$4,'Observed risk grant reference; not a new execution grant','ADMIN',$5,$6)`,
      [id,input.workspace_id,r1.approval_id,input.risk_grant_id,user.userId,user.username]);
      await client.query(`INSERT INTO governance_approval_findings
        (finding_id,approval_id,ordinal,label,outcome,suggestion,blocking,policy_version,formula_version,basis_hashes,evaluated_at)
        VALUES ($1,$2,0,$3,'INSUFFICIENT','R2_EXECUTION_DECISION_NOT_COMMISSIONED',true,$4,$4,$5,now())`,
      [newUlid("find"),id,`Portal-authored review note: ${input.summary}`,POLICY,[snapshot.payloadDigest, r1.evidence_set_hash]]);
      return { aggregate_id: id, approval_id: id, workflow_version: 1,
        read_path: `/api/v1/execution/governance/approvals/${id}/r2`,
        captured_projection_digest: snapshot.payloadDigest, source_verdict: "NOT_ASSERTED",
        decision_reason_code: "R2_EXECUTION_DECISION_NOT_COMMISSIONED" };
    });
  }

  async createPaperExit(user: PortalUser, input: PaperExitCreate, requestId: string) {
    return this.capture(user, input, "PAPER_EXIT_CREATE", requestId, async client => {
      const r2 = await this.parent(client, input.workspace_id, input.r2_approval_id, "R2", input.expected_r2_version);
      if (!["PENDING", "APPROVED", "APPROVED_WITH_CONDITION"].includes(r2.status)) fail("R2_REVIEW_CLOSED", 422);
      const lineage = (await client.query(`SELECT l.*,s.portfolio_id FROM governance_r2_lineage l
        JOIN governance_approval_analytics_scopes s ON s.approval_id=l.r2_approval_id AND s.workspace_id=l.workspace_id
        WHERE l.workspace_id=$1 AND l.r2_approval_id=$2`, [input.workspace_id,input.r2_approval_id])).rows[0];
      if (!lineage) fail("R2_ACCEPTED_LINEAGE_UNAVAILABLE", 422);
      const r1 = await this.parent(client, input.workspace_id, lineage.r1_approval_id, "R1");
      if (!["APPROVED", "APPROVED_WITH_CONDITION"].includes(r1.status)) fail("R1_APPROVAL_REQUIRED", 422);
      const snapshot = await this.paperSnapshot(client, input.workspace_id, input.expected_projection_digest);
      const deployment = this.deployment(this.deploymentRows(snapshot),
        input.deployment_id,r1.subject_id,lineage.portfolio_id);
      if (r2.subject_id !== input.deployment_id) fail("R2_DEPLOYMENT_SCOPE_MISMATCH", 422);
      if (typeof deployment.venue !== "string" || !deployment.venue) fail("PAPER_VENUE_UNAVAILABLE", 422);
      const id = newUlid("pexit");
      const evidence = await this.copyEvidence(client, r2.approval_id, r2.evidence_set_hash);
      const manifest = computeEvidenceManifestHash(evidence);
      const artifact = evidence.find(item => item.kind === "ALPHA_ARTIFACT");
      if (!artifact) fail("ACCEPTED_ARTIFACT_UNAVAILABLE", 422);
      await this.insertApproval(client,user,input.workspace_id,id,"PAPER_EXIT",input.deployment_id,r1,manifest);
      await this.insertEvidence(client,evidence,id);
      // This explicit Portal policy says no source evaluation has been accepted.
      // Its digest is not a fabricated Trading System observation-policy digest.
      const policyHash = projectionDigest({ authority: "PORTAL", policy: POLICY, promote: false, reason: GAP });
      await client.query(`INSERT INTO governance_paper_exit_reviews
        (review_id,workspace_id,deployment_id,portfolio_id,venue,artifact_digest,r1_approval_id,r2_approval_id,
         observation_policy_id,observation_policy_version,observation_policy_digest,evidence_pack_id,evidence_pack_digest,
         evaluation_policy_version,evaluation_formula_version,source_snapshot_hash,observation_summary,recommendation)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$1,$11,$9,$9,$11,$12,$13)`,
      [id,input.workspace_id,input.deployment_id,lineage.portfolio_id,deployment.venue,artifact.sha256,
        r1.approval_id,r2.approval_id,POLICY,policyHash,manifest,input.summary,GAP]);
      const pins = [
        ["ARTIFACT",artifact.artifactId ?? artifact.evidenceId,artifact.sha256,"RESEARCH"],
        ["R1_APPROVAL",r1.approval_id,r1.evidence_set_hash,"PORTAL"],
        ["R2_APPROVAL",r2.approval_id,r2.evidence_set_hash,"PORTAL"],
        ["OBSERVATION_POLICY",POLICY,policyHash,"PORTAL"],
        ["EVIDENCE_PACK",id,manifest,"PORTAL"],
      ];
      for (const [ordinal, pin] of pins.entries()) await client.query(`INSERT INTO governance_paper_exit_lineage
        (lineage_id,review_id,ordinal,kind,label,value,digest,source_authority) VALUES ($1,$2,$3,$4,$4,$5,$6,$7)`,
      [newUlid("lineage"),id,ordinal,...pin]);
      for (const [ordinal, kind] of EXIT_PANELS.entries()) {
        const panelId = newUlid("panel");
        await client.query(`INSERT INTO governance_paper_exit_panels
          (panel_id,review_id,ordinal,panel_kind,title,source_authority,source_reference,panel_state,reason,
           freshness_state,source_completeness,formula_version)
          VALUES ($1,$2,$3,$4,$4,'DERIVED',$5,'UNAVAILABLE',$6,'UNKNOWN','UNKNOWN',$7)`,
        [panelId,id,ordinal,kind,snapshot.payloadDigest,GAP,POLICY]);
        await client.query(`INSERT INTO governance_paper_exit_findings
          (finding_id,review_id,panel_id,ordinal,metric_key,label,outcome,blocking,carries_to,source_label,formula_version)
          VALUES ($1,$2,$3,0,$4,$5,'INSUFFICIENT',true,'PAPER_EXIT_REVIEW','Portal-authored review note',$6)`,
        [newUlid("find"),id,panelId,kind,`Portal review: ${input.summary}`,POLICY]);
      }
      const captured = await this.exits.detail(input.workspace_id,id,client);
      if (!captured) fail("CAPTURE_READBACK_FAILED", 500);
      await client.query("UPDATE governance_paper_exit_reviews SET source_snapshot_hash=$2 WHERE review_id=$1",
        [id,computePaperExitSourceSnapshotHash(captured)]);
      return { aggregate_id: id, review_id: id, workflow_version: 1,
        read_path: `/api/v1/execution/governance/exit-reviews/${id}`,
        captured_projection_digest: snapshot.payloadDigest, source_verdict: "NOT_ASSERTED",
        decision_reason_code: GAP };
    });
  }

  async sandboxNote(user: PortalUser, input: SandboxReviewNote, requestId: string) {
    return this.capture(user,input,"SANDBOX_NOTE",requestId,async client => {
      const row = (await client.query(`SELECT * FROM governance_sandbox_certifications
        WHERE workspace_id=$1 AND certification_id=$2 FOR UPDATE`,[input.workspace_id,input.certification_id])).rows[0];
      if (!row) fail("CERTIFICATION_NOT_FOUND",404);
      if (row.workflow_version !== input.expected_workflow_version) fail("WORKFLOW_VERSION_CONFLICT");
      if (row.workflow_state !== "DRAFT") fail("CERTIFICATION_NOT_DRAFT");
      await client.query(`INSERT INTO governance_sandbox_findings
        (finding_id,workspace_id,certification_id,severity,source_authority,finding_code,summary,blocking)
        VALUES ($1,$2,$3,'WARNING','PORTAL','PORTAL_REVIEW_NOTE',$4,false)`,
      [newUlid("sfind"),input.workspace_id,input.certification_id,input.summary]);
      for (const step of SANDBOX_STEPS) await client.query(`INSERT INTO governance_sandbox_step_evidence
        (evidence_id,workspace_id,certification_id,step_key,source_authority,evaluation_state,evidence_schema_version,
         source_verification_state,summary)
        SELECT $1,$2,$3,$4,'PORTAL','UNAVAILABLE',$5,'UNAVAILABLE','ACCEPTED_SANDBOX_STEP_EVIDENCE_UNAVAILABLE'
        WHERE NOT EXISTS (SELECT 1 FROM governance_sandbox_step_evidence WHERE workspace_id=$2 AND certification_id=$3 AND step_key=$4)`,
      [newUlid("sev"),input.workspace_id,input.certification_id,step,POLICY]);
      await client.query(`UPDATE governance_sandbox_certifications SET workflow_version=workflow_version+1,updated_at=now()
        WHERE workspace_id=$1 AND certification_id=$2`,[input.workspace_id,input.certification_id]);
      return { aggregate_id: input.certification_id, certification_id: input.certification_id,
        deployment_id: row.deployment_id,
        read_path: `/api/v1/execution/deployments/${row.deployment_id}/certification`,
        workflow_version: row.workflow_version+1, source_verdict: "NOT_ASSERTED",
        decision_reason_code: "ACCEPTED_SANDBOX_STEP_EVIDENCE_UNAVAILABLE" };
    });
  }

  private async capture(user: PortalUser,input: R2Capture|PaperExitCreate|SandboxReviewNote,action: string,requestId: string,
    write: (client: PoolClient) => Promise<Record<string, unknown>>) {
    if (user.role !== "ADMIN") fail("ADMIN_ROLE_REQUIRED",403);
    const hash = projectionDigest({ action,input });
    return withTransaction(this.pool,async client => {
      await client.query("SET LOCAL lock_timeout = '5s'");
      await client.query("SET LOCAL statement_timeout = '10s'");
      // DB-wide serialization of this retry identity, including multi-replica callers.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`${input.workspace_id}:${user.userId}:${input.request_key}`]);
      const prior = (await client.query(`SELECT * FROM governance_review_captures
        WHERE workspace_id=$1 AND actor_user_id=$2 AND request_key=$3`,[input.workspace_id,user.userId,input.request_key])).rows[0];
      if (prior) {
        if (prior.payload_hash !== hash) fail("REQUEST_KEY_CONFLICT");
        return { ...prior.response_json,replayed: true };
      }
      const result = await write(client);
      const response = { schema_version: "governance.review-capture.v1",authority: "PORTAL",workspace_id: input.workspace_id,
        action,replayed:false,source_side_effect_requested:false,...result };
      const captureId = newUlid("capture");
      await client.query(`INSERT INTO governance_review_captures
        (capture_id,workspace_id,actor_user_id,request_key,action,payload_hash,aggregate_id,response_json)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,[captureId,input.workspace_id,user.userId,input.request_key,action,hash,result.aggregate_id,JSON.stringify(response)]);
      await client.query(`INSERT INTO product_audit_events
        (event_id,event_type,actor_user_id,workspace_id,request_id,idempotency_key,aggregate_type,aggregate_id,aggregate_version,result,metadata_json)
        VALUES ($1,'governance.review.captured',$2,$3,$4,$5,'governance_review',$6,$7,'SUCCESS',$8)`,
      [newUlid("audit"),user.userId,input.workspace_id,requestId,input.request_key,result.aggregate_id,result.workflow_version,
        JSON.stringify({ capture_id:captureId,action,payload_hash:hash,authority:"PORTAL",source_side_effect_requested:false })]);
      return response;
    });
  }

  private async parent(client: PoolClient,workspace: string,id: string,gate: string,version?: number) {
    const row = (await client.query(`SELECT * FROM governance_approval_requests WHERE workspace_id=$1 AND approval_id=$2 AND gate=$3 FOR SHARE`,[workspace,id,gate])).rows[0];
    if (!row) fail("APPROVAL_NOT_FOUND",404);
    if (version !== undefined && row.approval_version !== version) fail("APPROVAL_VERSION_CONFLICT");
    if (row.expires_at <= new Date()) fail("APPROVAL_EXPIRED",422);
    return row;
  }

  private async paperSnapshot(client: PoolClient,workspace: string,digest: string) {
    if (this.config.FEATURE_EXECUTION_LOCAL_PROJECTION !== "true" || this.config.FEATURE_EXECUTION_CURRENT_SOURCE_PAPER !== "true" ||
      this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID !== workspace) fail("CAPTURE_PROJECTION_NOT_AUTHORIZED",404);
    const snapshot = await this.projections.snapshot(workspace,"paper",this.config.EXECUTION_EDGE_PAPER_PROFILE_ID!,client);
    if (!snapshot) fail("CAPTURE_PROJECTION_UNAVAILABLE",422);
    if (snapshot.document.workspace_id !== workspace || snapshot.document.environment !== "paper" ||
        snapshot.document.profile_id !== this.config.EXECUTION_EDGE_PAPER_PROFILE_ID) fail("CAPTURE_PROJECTION_SCOPE_MISMATCH",422);
    if (snapshot.payloadDigest !== digest) fail("CAPTURE_PROJECTION_VERSION_CONFLICT");
    if (Date.now()-snapshot.lastSuccessfulRefreshAt.valueOf() > this.config.EXECUTION_LOCAL_PROJECTION_STALE_CEILING_MS) fail("CAPTURE_PROJECTION_STALE",422);
    return snapshot;
  }

  private deployment(rows: readonly ProjectionRow[]|undefined,id: string,alpha: string,portfolio: string) {
    const row = rows?.find(row => row.fields.deployment_id===id && row.fields.strategy_id===alpha && row.fields.portfolio_id===portfolio);
    if (!row) fail("CAPTURE_DEPLOYMENT_SCOPE_NOT_FOUND",422);
    return row.fields;
  }

  private deploymentRows(snapshot: NonNullable<Awaited<ReturnType<ExecutionProfileProjectionRepository["snapshot"]>>>) {
    const relation = snapshot.document.relations["manager.deployments:strategy_deployments"];
    if (!relation || relation.availability !== "AVAILABLE" || relation.freshness === "STALE") {
      fail("CAPTURE_DEPLOYMENT_SOURCE_UNAVAILABLE",422);
    }
    return relation.items;
  }

  private async copyEvidence(client: PoolClient,parent: string,expectedHash: string): Promise<EvidenceRecord[]> {
    const rows = (await client.query("SELECT * FROM governance_approval_evidence WHERE approval_id=$1 ORDER BY ordinal LIMIT 257",[parent])).rows;
    if (!rows.length) fail("ACCEPTED_EVIDENCE_UNAVAILABLE",422);
    if (rows.length > 256) fail("CAPTURE_EVIDENCE_LIMIT_EXCEEDED",422);
    const accepted = rows.map(row => ({ evidenceId:row.evidence_id,ordinal:row.ordinal,kind:row.kind,label:row.label,
      displayValue:row.display_value,note:row.note,verification:row.verification,artifactId:row.artifact_id,
      sha256:row.sha256,sizeBytes:row.size_bytes,mediaType:row.media_type,schemaVersion:row.schema_version,
      sourceAuthority:row.source_authority,sourceReference:row.source_reference,required:row.required,
      capturedAt:row.captured_at,retentionClass:row.retention_class,accessPolicy:row.access_policy }));
    if (computeEvidenceManifestHash(accepted) !== expectedHash) fail("EVIDENCE_MANIFEST_INTEGRITY_FAILED");
    return accepted.map(item => ({ ...item,evidenceId:newUlid("ev") }));
  }

  private async insertApproval(client: PoolClient,user: PortalUser,workspace: string,id: string,gate: string,subject: string,parent: Record<string,unknown>,manifest: string) {
    await client.query(`INSERT INTO governance_approval_requests
      (approval_id,workspace_id,gate,subject_type,subject_id,subject_label,environment,target_label,requester_user_id,requester_username,
       artifact_creator_user_id,artifact_creator_username,status,policy_version,quorum_required,evidence_set_hash,evidence_complete,
       blocker_count,blocker_summary,sla_due_at,expires_at)
      VALUES ($1,$2,$3,'DEPLOYMENT',$4,$4,'PAPER',$3,$5,$6,$7,$8,'PENDING',$9,1,$10,false,1,$11,now()+interval '24 hours',now()+interval '72 hours')`,
    [id,workspace,gate,subject,user.userId,user.username,parent.artifact_creator_user_id,parent.artifact_creator_username,
      POLICY,manifest,gate==="R2"?"R2_EXECUTION_DECISION_NOT_COMMISSIONED":GAP]);
  }

  private async insertEvidence(client: PoolClient,items: EvidenceRecord[],id: string) {
    for (const e of items) await client.query(`INSERT INTO governance_approval_evidence
      (evidence_id,approval_id,ordinal,kind,label,display_value,note,verification,artifact_id,sha256,size_bytes,media_type,schema_version,
       source_authority,source_reference,required,captured_at,retention_class,access_policy)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
    [e.evidenceId,id,e.ordinal,e.kind,e.label,e.displayValue,e.note,e.verification,e.artifactId,e.sha256,e.sizeBytes,e.mediaType,
      e.schemaVersion,e.sourceAuthority,e.sourceReference,e.required,e.capturedAt,e.retentionClass,e.accessPolicy]);
  }
}
