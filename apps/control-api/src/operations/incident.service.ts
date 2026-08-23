import { createHash } from "crypto";
import { Inject, Injectable } from "@nestjs/common";
import { PortalUser } from "../domain";
import { GovernanceError } from "../governance/governance.service";
import { newUlid } from "../id";
import {
  IncidentAcknowledgeRequest,
  IncidentAnnotateRequest,
  IncidentAssignRequest,
  IncidentCorrelateOperationRequest,
  IncidentCreateRequest,
  IncidentEvidenceRequest,
  IncidentMitigateRequest,
  IncidentResolveRequest,
} from "./contracts";
import {
  IncidentDetailRecord,
  IncidentRepository,
  MutateIncidentWrite,
} from "./incident.repository";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonical(value), "utf8").digest("hex")}`;
}

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

const SOURCE_PANELS = [
  ["findings", "EXECUTION", "TRADING_SYSTEM_FINDINGS_ROUTE_UNPUBLISHED"],
  ["alerts", "EXECUTION", "TRADING_SYSTEM_ALERTS_ROUTE_UNPUBLISHED"],
  ["dead_letters", "EXECUTION", "TRADING_SYSTEM_DEAD_LETTERS_ROUTE_UNPUBLISHED"],
  ["trace_order", "EXECUTION", "TRADING_SYSTEM_TRACE_ORDER_ROUTE_UNPUBLISHED"],
] as const;

@Injectable()
export class IncidentService {
  constructor(@Inject(IncidentRepository) private readonly repository: IncidentRepository) {}

  async detail(user: PortalUser, workspaceId: string, incidentId: string) {
    this.assertAdmin(user);
    return this.publicDetail(await this.repository.detail(workspaceId, incidentId), user);
  }

  async create(user: PortalUser, input: IncidentCreateRequest, requestId: string) {
    this.assertAdmin(user);
    const result = await this.repository.create({
      incidentId: newUlid("inc"),
      workspaceId: input.workspace_id,
      actorUserId: user.userId,
      requestKey: input.request_key,
      requestDigest: digest(input),
      requestId,
      eventId: newUlid("ievt"),
      auditEventId: newUlid("aud"),
      title: input.title,
      summary: input.summary,
      severity: input.severity,
      environment: input.environment,
      targetType: input.target.type,
      targetId: input.target.id,
      correlatedOperationIds: input.correlated_operation_ids,
    });
    return this.mutationResponse(result.detail, user, result.replayed);
  }

  async acknowledge(
    user: PortalUser,
    incidentId: string,
    input: IncidentAcknowledgeRequest,
    requestId: string,
  ) {
    return this.mutate(user, incidentId, input, requestId, { action: "ACKNOWLEDGE" });
  }

  async assign(
    user: PortalUser,
    incidentId: string,
    input: IncidentAssignRequest,
    requestId: string,
  ) {
    return this.mutate(user, incidentId, input, requestId, {
      action: "ASSIGN",
      assigneeUserId: input.assignee_user_id,
    });
  }

  async annotate(
    user: PortalUser,
    incidentId: string,
    input: IncidentAnnotateRequest,
    requestId: string,
  ) {
    return this.mutate(user, incidentId, input, requestId, {
      action: "ANNOTATE",
      annotationId: newUlid("iann"),
      annotationBody: input.body,
    });
  }

  async attachEvidence(
    user: PortalUser,
    incidentId: string,
    input: IncidentEvidenceRequest,
    requestId: string,
  ) {
    return this.mutate(user, incidentId, input, requestId, {
      action: "ATTACH_EVIDENCE",
      evidenceId: newUlid("iev"),
      evidenceKind: input.evidence_kind,
      evidenceHash: input.sha256,
      evidenceSchemaVersion: input.evidence_schema_version,
      declaredSourceAuthority: input.declared_source_authority,
      evidenceSummary: input.summary,
      evidenceCapturedAt: new Date(input.captured_at),
    });
  }

  async correlateOperation(
    user: PortalUser,
    incidentId: string,
    input: IncidentCorrelateOperationRequest,
    requestId: string,
  ) {
    return this.mutate(user, incidentId, input, requestId, {
      action: "CORRELATE_OPERATION",
      operationId: input.operation_id,
      relationship: input.relationship,
    });
  }

  async mitigate(
    user: PortalUser,
    incidentId: string,
    input: IncidentMitigateRequest,
    requestId: string,
  ) {
    return this.mutate(user, incidentId, input, requestId, {
      action: "MITIGATE",
      evidenceHash: input.mitigation_evidence_hash,
    });
  }

  async resolve(
    user: PortalUser,
    incidentId: string,
    input: IncidentResolveRequest,
    requestId: string,
  ) {
    return this.mutate(user, incidentId, input, requestId, {
      action: "RESOLVE",
      evidenceHash: input.clean_dry_run_evidence_hash,
      resolutionReason: input.reason,
    });
  }

  private async mutate(
    user: PortalUser,
    incidentId: string,
    input: { workspace_id: string; request_key: string; expected_workflow_version: number },
    requestId: string,
    action: Pick<MutateIncidentWrite, "action"> & Partial<MutateIncidentWrite>,
  ) {
    this.assertAdmin(user);
    const result = await this.repository.mutate({
      incidentId,
      workspaceId: input.workspace_id,
      actorUserId: user.userId,
      requestKey: input.request_key,
      requestDigest: digest(input),
      expectedVersion: input.expected_workflow_version,
      requestId,
      eventId: newUlid("ievt"),
      auditEventId: newUlid("aud"),
      ...action,
    } as MutateIncidentWrite);
    return this.mutationResponse(result.detail, user, result.replayed);
  }

  private mutationResponse(detail: IncidentDetailRecord, user: PortalUser, replayed: boolean) {
    return {
      schema_version: "execution.incident-workflow.v1",
      record_authority: "PORTAL",
      delivery_profile: "fixture",
      source_integration_state: "UNAVAILABLE",
      source_side_effect_requested: false,
      deployment_resume_requested: false,
      replayed,
      detail: this.publicDetail(detail, user),
    };
  }

  private publicDetail(detail: IncidentDetailRecord, user: PortalUser) {
    const record = detail.incident;
    const readAt = new Date().toISOString();
    const hasCleanDryRun = detail.evidence.some((item) => item.evidence_kind === "CLEAN_DRY_RUN");
    const blockers: string[] = [];
    if (record.workflow_state === "RESOLVED") blockers.push("INCIDENT_ALREADY_RESOLVED");
    else {
      if (!record.acknowledged_at) blockers.push("INCIDENT_ACKNOWLEDGEMENT_REQUIRED");
      if (!record.assigned_to_user_id) blockers.push("INCIDENT_ASSIGNEE_REQUIRED");
      if (record.workflow_state !== "MITIGATED") blockers.push("INCIDENT_NOT_MITIGATED");
      if (!hasCleanDryRun) blockers.push("CLEAN_DRY_RUN_EVIDENCE_REQUIRED");
    }
    return {
      schema_version: "execution.incident-detail.v1",
      record_authority: "PORTAL",
      delivery_profile: "fixture",
      source_integration_state: "UNAVAILABLE",
      read_at: readAt,
      actor: { user_id: user.userId, username: user.username, roles: [user.role] },
      incident: {
        incident_id: record.incident_id,
        title: record.title,
        summary: record.summary,
        severity: record.severity,
        environment: record.environment,
        target: { type: record.target_type, id: record.target_id },
        workflow_state: record.workflow_state,
        workflow_version: record.workflow_version,
        assigned_to_user_id: record.assigned_to_user_id,
        acknowledged_at: iso(record.acknowledged_at),
        acknowledged_by_user_id: record.acknowledged_by_user_id,
        mitigated_at: iso(record.mitigated_at),
        mitigated_by_user_id: record.mitigated_by_user_id,
        mitigation_evidence_hash: record.mitigation_evidence_hash,
        resolved_at: iso(record.resolved_at),
        resolved_by_user_id: record.resolved_by_user_id,
        resolution_reason: record.resolution_reason,
        clean_dry_run_evidence_hash: record.clean_dry_run_evidence_hash,
        opened_by_user_id: record.opened_by_user_id,
        source_side_effect_requested: false,
        deployment_resume_requested: false,
        created_at: record.created_at.toISOString(),
        updated_at: record.updated_at.toISOString(),
      },
      source_panels: SOURCE_PANELS.map(([panelId, authority, warning]) => ({
        panel_id: panelId,
        source_authority: authority,
        as_of: null,
        read_at: readAt,
        source_cursor: null,
        source_sequence: null,
        projection_epoch: null,
        projection_sequence: null,
        source_completeness: "UNKNOWN",
        poll_interval_ms: null,
        panel_state: "unavailable",
        freshness_state: "UNKNOWN",
        age_seconds: null,
        lag_ms: null,
        formula_version: null,
        capability_snapshot_id: null,
        delivery_profile: "fixture",
        source_verification_state: "UNAVAILABLE",
        data: null,
        warnings: [{ code: warning }],
      })),
      correlated_operations: {
        total_count: detail.operationsTotal,
        returned_count: detail.operations.length,
        truncated: detail.operationsTotal > detail.operations.length,
        rows: detail.operations.map((item) => ({
          operation_id: item.operation_id,
          relationship: item.relationship,
          linked_by_user_id: item.linked_by_user_id,
          linked_at: item.linked_at.toISOString(),
          command_key: item.command_key,
          severity: item.severity,
          triage_state: item.triage_state,
          source_status: item.source_status,
          verification_result: item.verification_result,
          workflow_version: item.workflow_version,
        })),
      },
      evidence: {
        total_count: detail.evidenceTotal,
        returned_count: detail.evidence.length,
        truncated: detail.evidenceTotal > detail.evidence.length,
        rows: detail.evidence.map((item) => ({
          evidence_id: item.evidence_id,
          evidence_kind: item.evidence_kind,
          sha256: item.sha256,
          schema_version: item.schema_version,
          declared_source_authority: item.declared_source_authority,
          source_verification_state: item.source_verification_state,
          summary: item.summary,
          captured_at: item.captured_at.toISOString(),
          attached_by_user_id: item.attached_by_user_id,
          created_at: item.created_at.toISOString(),
        })),
      },
      annotations: {
        total_count: detail.annotationsTotal,
        returned_count: detail.annotations.length,
        truncated: detail.annotationsTotal > detail.annotations.length,
        rows: detail.annotations.map((item) => ({
          annotation_id: item.annotation_id,
          author_user_id: item.author_user_id,
          body: item.body,
          redaction_state: item.redaction_state,
          created_at: item.created_at.toISOString(),
        })),
      },
      timeline: {
        total_count: detail.eventsTotal,
        returned_count: detail.events.length,
        truncated: detail.eventsTotal > detail.events.length,
        rows: detail.events.map((item) => ({
          event_id: item.event_id,
          actor_user_id: item.actor_user_id,
          action: item.action,
          workflow_version_before: item.workflow_version_before,
          workflow_version_after: item.workflow_version_after,
          metadata: item.metadata_json,
          created_at: item.created_at.toISOString(),
        })),
      },
      resolution_gate: {
        eligible: blockers.length === 0,
        blocker_codes: blockers,
        clean_dry_run_evidence_present: hasCleanDryRun,
        reason_required: true,
        deployment_resume_requested: false,
      },
    };
  }

  private assertAdmin(user: PortalUser): void {
    if (user.role !== "ADMIN") {
      throw new GovernanceError("ADMIN_ROLE_REQUIRED", "Access denied.", 403);
    }
  }
}
