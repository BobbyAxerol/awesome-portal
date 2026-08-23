import { Inject, Injectable } from "@nestjs/common";
import { Pool, PoolClient, QueryResult } from "pg";
import { GovernanceError } from "../governance/governance.service";
import { CONTROL_API_POOL } from "../tokens";

export type IncidentWorkflowState = "OPEN" | "MITIGATED" | "RESOLVED";
export type IncidentAction =
  | "CREATE"
  | "ACKNOWLEDGE"
  | "ASSIGN"
  | "ANNOTATE"
  | "ATTACH_EVIDENCE"
  | "CORRELATE_OPERATION"
  | "MITIGATE"
  | "RESOLVE";

export interface IncidentRow extends Record<string, unknown> {
  incident_id: string;
  workspace_id: string;
  title: string;
  summary: string;
  severity: "INFO" | "WARNING" | "ERROR" | "CRITICAL";
  environment: "PAPER" | "SANDBOX" | "LIVE";
  target_type: string;
  target_id: string;
  workflow_state: IncidentWorkflowState;
  workflow_version: number;
  assigned_to_user_id: string | null;
  acknowledged_at: Date | null;
  acknowledged_by_user_id: string | null;
  mitigated_at: Date | null;
  mitigated_by_user_id: string | null;
  mitigation_evidence_hash: string | null;
  resolved_at: Date | null;
  resolved_by_user_id: string | null;
  resolution_reason: string | null;
  clean_dry_run_evidence_hash: string | null;
  opened_by_user_id: string;
  source_integration_state: "UNAVAILABLE";
  source_side_effect_requested: false;
  deployment_resume_requested: false;
  created_at: Date;
  updated_at: Date;
}

export interface IncidentAnnotationRow extends Record<string, unknown> {
  annotation_id: string;
  author_user_id: string;
  body: string;
  redaction_state: "CLEAR";
  created_at: Date;
}

export interface IncidentEvidenceRow extends Record<string, unknown> {
  evidence_id: string;
  evidence_kind: string;
  sha256: string;
  schema_version: string;
  declared_source_authority: "PORTAL" | "EXECUTION" | "BROKER" | "DERIVED";
  source_verification_state: "UNAVAILABLE";
  summary: string;
  captured_at: Date;
  attached_by_user_id: string;
  created_at: Date;
}

export interface IncidentOperationRow extends Record<string, unknown> {
  operation_id: string;
  relationship: "TRIGGERED_BY" | "MITIGATES" | "RELATED";
  linked_by_user_id: string;
  linked_at: Date;
  command_key: string;
  severity: "INFO" | "WARNING" | "ERROR" | "CRITICAL";
  triage_state: "UNACKNOWLEDGED" | "ACKNOWLEDGED" | "RESOLVED";
  source_status: string;
  verification_result: string;
  workflow_version: number;
}

export interface IncidentEventRow extends Record<string, unknown> {
  event_id: string;
  actor_user_id: string;
  action: IncidentAction;
  workflow_version_before: number;
  workflow_version_after: number;
  metadata_json: Record<string, unknown>;
  created_at: Date;
}

export interface IncidentDetailRecord {
  incident: IncidentRow;
  annotations: IncidentAnnotationRow[];
  annotationsTotal: number;
  evidence: IncidentEvidenceRow[];
  evidenceTotal: number;
  operations: IncidentOperationRow[];
  operationsTotal: number;
  events: IncidentEventRow[];
  eventsTotal: number;
}

interface BaseWrite {
  incidentId: string;
  workspaceId: string;
  actorUserId: string;
  requestKey: string;
  requestDigest: string;
  requestId: string;
  eventId: string;
  auditEventId: string;
}

export interface CreateIncidentWrite extends BaseWrite {
  title: string;
  summary: string;
  severity: IncidentRow["severity"];
  environment: IncidentRow["environment"];
  targetType: string;
  targetId: string;
  correlatedOperationIds: string[];
}

export interface MutateIncidentWrite extends BaseWrite {
  action: Exclude<IncidentAction, "CREATE">;
  expectedVersion: number;
  assigneeUserId?: string;
  annotationId?: string;
  annotationBody?: string;
  evidenceId?: string;
  evidenceKind?: string;
  evidenceHash?: string;
  evidenceSchemaVersion?: string;
  declaredSourceAuthority?: IncidentEvidenceRow["declared_source_authority"];
  evidenceSummary?: string;
  evidenceCapturedAt?: Date;
  operationId?: string;
  relationship?: IncidentOperationRow["relationship"];
  resolutionReason?: string;
}

interface Queryable {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>>;
}

@Injectable()
export class IncidentRepository {
  constructor(@Inject(CONTROL_API_POOL) readonly pool: Pool) {}

  async detail(workspaceId: string, incidentId: string): Promise<IncidentDetailRecord> {
    return this.loadDetail(this.pool, workspaceId, incidentId);
  }

  async create(input: CreateIncidentWrite): Promise<{ detail: IncidentDetailRecord; replayed: boolean }> {
    const outcome = await this.withSerializable((client) => this.createAttempt(client, input));
    return {
      detail: await this.loadDetail(this.pool, input.workspaceId, outcome.incidentId),
      replayed: outcome.replayed,
    };
  }

  async mutate(input: MutateIncidentWrite): Promise<{ detail: IncidentDetailRecord; replayed: boolean }> {
    const outcome = await this.withSerializable((client) => this.mutateAttempt(client, input));
    return {
      detail: await this.loadDetail(this.pool, input.workspaceId, outcome.incidentId),
      replayed: outcome.replayed,
    };
  }

  private async withSerializable<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        const result = await work(client);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        const code = typeof error === "object" && error !== null && "code" in error
          ? String((error as { code?: unknown }).code ?? "")
          : "";
        const constraint = typeof error === "object" && error !== null && "constraint" in error
          ? String((error as { constraint?: unknown }).constraint ?? "")
          : "";
        const retryableIdempotencyRace =
          code === "23505" && constraint === "execution_incident_event_request_key_unique";
        if ((code === "40001" || code === "40P01" || retryableIdempotencyRace) && attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 10));
          continue;
        }
        throw error;
      } finally {
        client.release();
      }
    }
    throw new Error("incident workflow transaction retry budget exhausted");
  }

  private async createAttempt(
    client: PoolClient,
    input: CreateIncidentWrite,
  ): Promise<{ incidentId: string; replayed: boolean }> {
    const replay = await this.replay(client, input, "CREATE");
    if (replay) return replay;

    await client.query(
      `INSERT INTO execution_incidents
         (incident_id, workspace_id, title, summary, severity, environment,
          target_type, target_id, workflow_state, workflow_version, opened_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'OPEN', 1, $9)`,
      [
        input.incidentId, input.workspaceId, input.title, input.summary,
        input.severity, input.environment, input.targetType, input.targetId,
        input.actorUserId,
      ],
    );
    for (const operationId of input.correlatedOperationIds) {
      const linked = await client.query(
        `INSERT INTO execution_incident_operation_links
           (incident_id, workspace_id, operation_id, relationship, linked_by_user_id)
         SELECT $1, $2, operation_id, 'TRIGGERED_BY', $4
         FROM execution_operation_queue_items
         WHERE workspace_id = $2 AND operation_id = $3`,
        [input.incidentId, input.workspaceId, operationId, input.actorUserId],
      );
      if (linked.rowCount !== 1) {
        throw new GovernanceError("INCIDENT_OPERATION_NOT_FOUND", "Correlated operation not found.", 404);
      }
    }
    await this.writeEventAndAudit(client, input, "CREATE", 0, 1, {
      correlated_operation_count: input.correlatedOperationIds.length,
      source_side_effect_requested: false,
    });
    return { incidentId: input.incidentId, replayed: false };
  }

  private async mutateAttempt(
    client: PoolClient,
    input: MutateIncidentWrite,
  ): Promise<{ incidentId: string; replayed: boolean }> {
    const replay = await this.replay(client, input, input.action);
    if (replay) return replay;
    const current = await this.lockIncident(client, input.workspaceId, input.incidentId);
    if (current.workflow_version !== input.expectedVersion) {
      throw new GovernanceError(
        "INCIDENT_WORKFLOW_VERSION_CONFLICT",
        "Incident workflow version changed.",
        409,
        { current_workflow_version: current.workflow_version },
      );
    }
    if (current.workflow_state === "RESOLVED") {
      throw new GovernanceError("INCIDENT_ALREADY_RESOLVED", "Resolved incidents are immutable.", 409);
    }

    const versionAfter = current.workflow_version + 1;
    const metadata = await this.applyMutation(client, current, input, versionAfter);
    await this.writeEventAndAudit(
      client,
      input,
      input.action,
      current.workflow_version,
      versionAfter,
      metadata,
    );
    return { incidentId: input.incidentId, replayed: false };
  }

  private async applyMutation(
    client: PoolClient,
    current: IncidentRow,
    input: MutateIncidentWrite,
    versionAfter: number,
  ): Promise<Record<string, unknown>> {
    if (input.action === "ACKNOWLEDGE") {
      if (current.acknowledged_at !== null) {
        throw new GovernanceError("INCIDENT_NOT_ACKNOWLEDGEABLE", "Incident is already acknowledged.", 409);
      }
      await this.advance(client, input, versionAfter,
        "acknowledged_at = now(), acknowledged_by_user_id = $4", [input.actorUserId]);
      return { source_side_effect_requested: false };
    }
    if (input.action === "ASSIGN") {
      const member = await client.query(
        `SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
        [input.workspaceId, input.assigneeUserId],
      );
      if (member.rowCount !== 1) {
        throw new GovernanceError("INCIDENT_ASSIGNEE_NOT_FOUND", "Incident assignee not found.", 404);
      }
      await this.advance(client, input, versionAfter, "assigned_to_user_id = $4", [input.assigneeUserId]);
      return { assignee_user_id: input.assigneeUserId, source_side_effect_requested: false };
    }
    if (input.action === "ANNOTATE") {
      await client.query(
        `INSERT INTO execution_incident_annotations
           (annotation_id, incident_id, workspace_id, author_user_id, body, redaction_state)
         VALUES ($1, $2, $3, $4, $5, 'CLEAR')`,
        [input.annotationId, input.incidentId, input.workspaceId, input.actorUserId, input.annotationBody],
      );
      await this.advance(client, input, versionAfter);
      return { annotation_id: input.annotationId, redaction_state: "CLEAR" };
    }
    if (input.action === "ATTACH_EVIDENCE") {
      try {
        await client.query(
          `INSERT INTO execution_incident_evidence
             (evidence_id, incident_id, workspace_id, evidence_kind, sha256,
              schema_version, declared_source_authority, source_verification_state,
              summary, captured_at, attached_by_user_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'UNAVAILABLE', $8, $9, $10)`,
          [
            input.evidenceId, input.incidentId, input.workspaceId, input.evidenceKind,
            input.evidenceHash, input.evidenceSchemaVersion, input.declaredSourceAuthority,
            input.evidenceSummary, input.evidenceCapturedAt, input.actorUserId,
          ],
        );
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "23505") {
          throw new GovernanceError("INCIDENT_EVIDENCE_DUPLICATE", "Incident evidence already exists.", 409);
        }
        throw error;
      }
      await this.advance(client, input, versionAfter);
      return {
        evidence_id: input.evidenceId,
        evidence_kind: input.evidenceKind,
        evidence_hash: input.evidenceHash,
        source_verification_state: "UNAVAILABLE",
      };
    }
    if (input.action === "CORRELATE_OPERATION") {
      const linked = await client.query(
        `INSERT INTO execution_incident_operation_links
           (incident_id, workspace_id, operation_id, relationship, linked_by_user_id)
         SELECT $1, $2, operation_id, $4, $5
         FROM execution_operation_queue_items
         WHERE workspace_id = $2 AND operation_id = $3
         ON CONFLICT (incident_id, operation_id) DO NOTHING`,
        [input.incidentId, input.workspaceId, input.operationId, input.relationship, input.actorUserId],
      );
      if (linked.rowCount !== 1) {
        const operation = await client.query(
          `SELECT 1 FROM execution_operation_queue_items WHERE workspace_id = $1 AND operation_id = $2`,
          [input.workspaceId, input.operationId],
        );
        throw new GovernanceError(
          operation.rowCount === 1 ? "INCIDENT_OPERATION_ALREADY_LINKED" : "INCIDENT_OPERATION_NOT_FOUND",
          operation.rowCount === 1 ? "Operation is already linked." : "Correlated operation not found.",
          operation.rowCount === 1 ? 409 : 404,
        );
      }
      await this.advance(client, input, versionAfter);
      return { operation_id: input.operationId, relationship: input.relationship };
    }
    if (input.action === "MITIGATE") {
      if (current.workflow_state !== "OPEN") {
        throw new GovernanceError("INCIDENT_NOT_MITIGATABLE", "Incident cannot be mitigated.", 409);
      }
      const blockers: string[] = [];
      if (!current.acknowledged_at) blockers.push("INCIDENT_ACKNOWLEDGEMENT_REQUIRED");
      if (!current.assigned_to_user_id) blockers.push("INCIDENT_ASSIGNEE_REQUIRED");
      if (!(await this.hasEvidence(client, input, "MITIGATION_ATTESTATION", input.evidenceHash))) {
        blockers.push("MITIGATION_EVIDENCE_REQUIRED");
      }
      if (blockers.length) {
        throw new GovernanceError("INCIDENT_MITIGATION_BLOCKED", "Incident mitigation preconditions failed.", 409, { blockers });
      }
      await this.advance(
        client,
        input,
        versionAfter,
        "workflow_state = 'MITIGATED', mitigated_at = now(), mitigated_by_user_id = $4, mitigation_evidence_hash = $5",
        [input.actorUserId, input.evidenceHash],
      );
      return { mitigation_evidence_hash: input.evidenceHash, source_side_effect_requested: false };
    }

    if (current.workflow_state !== "MITIGATED") {
      throw new GovernanceError("INCIDENT_RESOLUTION_BLOCKED", "Incident must be mitigated before resolution.", 409, {
        blockers: ["INCIDENT_NOT_MITIGATED"],
      });
    }
    if (!(await this.hasEvidence(client, input, "CLEAN_DRY_RUN", input.evidenceHash))) {
      throw new GovernanceError("INCIDENT_RESOLUTION_BLOCKED", "Clean dry-run evidence is required.", 409, {
        blockers: ["CLEAN_DRY_RUN_EVIDENCE_REQUIRED"],
      });
    }
    await this.advance(
      client,
      input,
      versionAfter,
      `workflow_state = 'RESOLVED', resolved_at = now(), resolved_by_user_id = $4,
       resolution_reason = $5, clean_dry_run_evidence_hash = $6`,
      [input.actorUserId, input.resolutionReason, input.evidenceHash],
    );
    return {
      clean_dry_run_evidence_hash: input.evidenceHash,
      source_side_effect_requested: false,
      deployment_resume_requested: false,
    };
  }

  private async advance(
    client: PoolClient,
    input: MutateIncidentWrite,
    versionAfter: number,
    fragment = "updated_at = now()",
    values: unknown[] = [],
  ): Promise<void> {
    const assignment = fragment === "updated_at = now()" ? fragment : `${fragment}, updated_at = now()`;
    await client.query(
      `UPDATE execution_incidents
       SET workflow_version = $3, ${assignment}
       WHERE workspace_id = $1 AND incident_id = $2`,
      [input.workspaceId, input.incidentId, versionAfter, ...values],
    );
  }

  private async hasEvidence(
    client: PoolClient,
    input: MutateIncidentWrite,
    kind: string,
    hash: string | undefined,
  ): Promise<boolean> {
    if (!hash) return false;
    const result = await client.query(
      `SELECT 1 FROM execution_incident_evidence
       WHERE workspace_id = $1 AND incident_id = $2 AND evidence_kind = $3 AND sha256 = $4`,
      [input.workspaceId, input.incidentId, kind, hash],
    );
    return result.rowCount === 1;
  }

  private async replay(
    client: PoolClient,
    input: BaseWrite,
    action: IncidentAction,
  ): Promise<{ incidentId: string; replayed: boolean } | null> {
    const result = await client.query<{
      incident_id: string;
      action: IncidentAction;
      request_digest: string;
    }>(
      `SELECT incident_id, action, request_digest FROM execution_incident_events
       WHERE workspace_id = $1 AND actor_user_id = $2 AND request_key = $3`,
      [input.workspaceId, input.actorUserId, input.requestKey],
    );
    const prior = result.rows[0];
    if (!prior) return null;
    if (
      (action !== "CREATE" && prior.incident_id !== input.incidentId) ||
      prior.action !== action ||
      prior.request_digest !== input.requestDigest
    ) {
      throw new GovernanceError(
        "REQUEST_KEY_INCIDENT_CONFLICT",
        "Request key was already used for another incident action or payload.",
        409,
      );
    }
    return { incidentId: prior.incident_id, replayed: true };
  }

  private async lockIncident(client: PoolClient, workspaceId: string, incidentId: string): Promise<IncidentRow> {
    const result = await client.query<IncidentRow>(
      `SELECT * FROM execution_incidents WHERE workspace_id = $1 AND incident_id = $2 FOR UPDATE`,
      [workspaceId, incidentId],
    );
    if (!result.rows[0]) throw new GovernanceError("INCIDENT_NOT_FOUND", "Incident not found.", 404);
    return result.rows[0];
  }

  private async writeEventAndAudit(
    client: PoolClient,
    input: BaseWrite,
    action: IncidentAction,
    versionBefore: number,
    versionAfter: number,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await client.query(
      `INSERT INTO execution_incident_events
         (event_id, incident_id, workspace_id, actor_user_id, request_key,
          request_digest, action, workflow_version_before, workflow_version_after, metadata_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        input.eventId, input.incidentId, input.workspaceId, input.actorUserId,
        input.requestKey, input.requestDigest, action, versionBefore, versionAfter,
        JSON.stringify(metadata),
      ],
    );
    await client.query(
      `INSERT INTO product_audit_events
         (event_id, event_type, actor_user_id, workspace_id, request_id,
          idempotency_key, aggregate_type, aggregate_id, aggregate_version,
          result, reason_code, metadata_json)
       VALUES ($1, $2, $3, $4, $5, $6, 'execution_incident', $7, $8,
               'SUCCESS', $9, $10)`,
      [
        input.auditEventId, `execution.incident.${action.toLowerCase()}`,
        input.actorUserId, input.workspaceId, input.requestId, input.requestKey,
        input.incidentId, versionAfter, action,
        JSON.stringify({ ...metadata, request_digest: input.requestDigest, raw_source_payload_stored: false }),
      ],
    );
  }

  private async loadDetail(
    queryable: Queryable,
    workspaceId: string,
    incidentId: string,
  ): Promise<IncidentDetailRecord> {
    const incident = await queryable.query<IncidentRow>(
      `SELECT * FROM execution_incidents WHERE workspace_id = $1 AND incident_id = $2`,
      [workspaceId, incidentId],
    );
    if (!incident.rows[0]) throw new GovernanceError("INCIDENT_NOT_FOUND", "Incident not found.", 404);
    const [annotations, annotationCount, evidence, evidenceCount, operations, operationCount, events, eventCount] =
      await Promise.all([
        queryable.query<IncidentAnnotationRow>(
          `SELECT annotation_id, author_user_id, body, redaction_state, created_at
           FROM execution_incident_annotations
           WHERE workspace_id = $1 AND incident_id = $2
           ORDER BY created_at, annotation_id LIMIT 250`, [workspaceId, incidentId]),
        queryable.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM execution_incident_annotations
           WHERE workspace_id = $1 AND incident_id = $2`, [workspaceId, incidentId]),
        queryable.query<IncidentEvidenceRow>(
          `SELECT evidence_id, evidence_kind, sha256, schema_version,
                  declared_source_authority, source_verification_state, summary,
                  captured_at, attached_by_user_id, created_at
           FROM execution_incident_evidence
           WHERE workspace_id = $1 AND incident_id = $2
           ORDER BY captured_at, evidence_id LIMIT 250`, [workspaceId, incidentId]),
        queryable.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM execution_incident_evidence
           WHERE workspace_id = $1 AND incident_id = $2`, [workspaceId, incidentId]),
        queryable.query<IncidentOperationRow>(
          `SELECT l.operation_id, l.relationship, l.linked_by_user_id, l.created_at AS linked_at,
                  q.command_key, q.severity, q.triage_state, q.source_status,
                  q.verification_result, q.workflow_version
           FROM execution_incident_operation_links l
           JOIN execution_operation_queue_items q
             ON q.workspace_id = l.workspace_id AND q.operation_id = l.operation_id
           WHERE l.workspace_id = $1 AND l.incident_id = $2
           ORDER BY l.created_at, l.operation_id LIMIT 250`, [workspaceId, incidentId]),
        queryable.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM execution_incident_operation_links
           WHERE workspace_id = $1 AND incident_id = $2`, [workspaceId, incidentId]),
        queryable.query<IncidentEventRow>(
          `SELECT event_id, actor_user_id, action, workflow_version_before,
                  workflow_version_after, metadata_json, created_at
           FROM execution_incident_events
           WHERE workspace_id = $1 AND incident_id = $2
           ORDER BY created_at, event_id LIMIT 250`, [workspaceId, incidentId]),
        queryable.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM execution_incident_events
           WHERE workspace_id = $1 AND incident_id = $2`, [workspaceId, incidentId]),
      ]);
    return {
      incident: incident.rows[0],
      annotations: annotations.rows,
      annotationsTotal: Number(annotationCount.rows[0].count),
      evidence: evidence.rows,
      evidenceTotal: Number(evidenceCount.rows[0].count),
      operations: operations.rows,
      operationsTotal: Number(operationCount.rows[0].count),
      events: events.rows,
      eventsTotal: Number(eventCount.rows[0].count),
    };
  }
}
