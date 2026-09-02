import { Inject, Injectable } from "@nestjs/common";
import { Pool, PoolClient } from "pg";
import { ControlApiConfig } from "../config";
import { PortalUser } from "../domain";
import { CONTROL_API_CONFIG, CONTROL_API_POOL } from "../tokens";
import {
  CommandCenterInputs,
  CommandCenterPin,
  ExactSourceSlice,
  FleetSnapshot,
  SourceStatus,
  TodayCandidate,
  TriageCandidate,
  unavailableSource,
} from "./contracts";

interface GovernanceTriageRow {
  approval_id: string;
  gate: "R1" | "R2" | "PAPER_EXIT" | "SANDBOX_EXIT" | "LIVE_GATE";
  subject_label: string;
  target_label: string;
  created_at: Date;
  updated_at: Date;
  sla_due_at: Date;
  sla_state: "OVERDUE" | "DUE_SOON" | "ON_TRACK";
  total_count: string;
}
interface TodayRow {
  item_id: string;
  kind: "REVIEW_DUE" | "CONDITION_EXPIRY";
  label: string;
  scheduled_at: Date;
  href: string;
  updated_at: Date;
  total_count: string;
}

interface PinRow {
  slot: number;
  entity_type: "DEPLOYMENT";
  entity_id: string;
  label: string;
  href: string;
  created_at: Date;
}

interface IncidentTriageRow {
  incident_id: string;
  title: string;
  summary: string;
  severity: "INFO" | "WARNING" | "ERROR" | "CRITICAL";
  workflow_state: "OPEN" | "MITIGATED";
  created_at: Date;
  updated_at: Date;
  total_count: string;
}

interface OperationTriageRow {
  operation_id: string;
  command_key: string;
  target_type: string;
  target_id: string;
  severity: "INFO" | "WARNING" | "ERROR" | "CRITICAL";
  source_status: string;
  verification_result: string;
  created_at: Date;
  updated_at: Date;
  total_count: string;
}

interface ProjectionSnapshotRow {
  environment: "paper" | "sandbox" | "live";
  profile_id: string;
  source_cursor: string;
  source_as_of: Date | null;
  received_at: Date;
  last_successful_refresh_at: Date;
  completeness: "COMPLETE" | "PARTIAL" | "UNKNOWN";
  projection_epoch: string;
  projection_sequence: string;
  payload: {
    relations?: Record<string, {
      availability?: string;
      items?: Array<{ fields?: Record<string, unknown> }>;
    }>;
  };
}

function reviewHref(gate: GovernanceTriageRow["gate"], id: string): string {
  if (gate === "R1") return `/governance/approvals/${id}/r1`;
  if (gate === "R2" || gate === "LIVE_GATE") return `/governance/approvals/${id}/r2`;
  return `/governance/exit-reviews/${id}`;
}

function portalSourceStatus(asOf: Date | null, readAt: Date): SourceStatus {
  return {
    source: "PORTAL_GOVERNANCE",
    authority: "PORTAL",
    availability: "AVAILABLE",
    reason: null,
    as_of: asOf?.toISOString() ?? readAt.toISOString(),
    source_cursor: null,
    source_sequence: null,
    projection_epoch: null,
    projection_sequence: null,
    source_completeness: "EVENT_SOURCED",
    poll_interval_ms: null,
    freshness_state: "OK",
    age_seconds: asOf === null ? 0 : Math.max(0, Math.floor((readAt.valueOf() - asOf.valueOf()) / 1_000)),
    lag_ms: 0,
    capability_snapshot_id: null,
    delivery_profile: "portal_sgp_projection",
  };
}

@Injectable()
export class CommandCenterRepository {
  constructor(
    @Inject(CONTROL_API_POOL) private readonly pool: Pool,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  async read(workspaceId: string, actor: PortalUser, readAt: Date): Promise<CommandCenterInputs> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await client.query("SET LOCAL statement_timeout = '1000ms'");
      await client.query("SET LOCAL idle_in_transaction_session_timeout = '2000ms'");
      const governance = await this.governanceTriage(client, workspaceId, actor, readAt);
      const today = await this.governanceToday(client, workspaceId, readAt);
      const pins = await this.pins(client, workspaceId, actor.userId);
      const incidents = await this.incidentTriage(client, workspaceId, readAt);
      const operations = await this.operationTriage(client, workspaceId, readAt);
      const verifiedOperations = await this.verifiedOperationsToday(client, workspaceId, readAt);
      const fleet = await this.projectionFleet(client, readAt);
      await client.query("COMMIT");
      return {
        workspaceId,
        actor,
        readAt,
        triageSources: [
          governance,
          incidents,
          operations,
        ],
        fleet,
        pins,
        todaySources: [
          today,
          verifiedOperations,
        ],
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async incidentTriage(
    client: PoolClient,
    workspaceId: string,
    readAt: Date,
  ): Promise<ExactSourceSlice<TriageCandidate>> {
    const result = await client.query<IncidentTriageRow>(
      `SELECT incident_id, title, summary, severity, workflow_state, created_at, updated_at,
              count(*) OVER() AS total_count
         FROM execution_incidents
        WHERE workspace_id=$1 AND workflow_state IN ('OPEN','MITIGATED')
        ORDER BY CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'ERROR' THEN 2
                               WHEN 'WARNING' THEN 3 ELSE 4 END,
                 updated_at, incident_id
        LIMIT 10`,
      [workspaceId],
    );
    const total = result.rows[0] ? Number(result.rows[0].total_count)
      : Number((await client.query<{ count: string }>(
        `SELECT count(*) FROM execution_incidents
          WHERE workspace_id=$1 AND workflow_state IN ('OPEN','MITIGATED')`,
        [workspaceId],
      )).rows[0]?.count ?? 0);
    const asOf = latestDate(result.rows.map((row) => row.updated_at));
    return {
      status: localExecutionStatus("EXECUTION_INCIDENTS", asOf, readAt),
      exact_total_count: total,
      items: result.rows.map((row) => ({
        id: row.incident_id,
        kind: "INCIDENT",
        title: row.title,
        summary: row.summary,
        severity: commandCenterSeverity(row.severity),
        sla_state: "NONE",
        sla_due_at: null,
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at.toISOString(),
        authority: "EXECUTION",
        as_of: row.updated_at.toISOString(),
        href: `/execution/operations/incidents/${encodeURIComponent(row.incident_id)}`,
        action_label: row.workflow_state === "OPEN" ? "Triage" : "Review mitigation",
      })),
    };
  }

  private async operationTriage(
    client: PoolClient,
    workspaceId: string,
    readAt: Date,
  ): Promise<ExactSourceSlice<TriageCandidate>> {
    const result = await client.query<OperationTriageRow>(
      `SELECT operation_id, command_key, target_type, target_id, severity, source_status,
              verification_result, created_at, updated_at, count(*) OVER() AS total_count
         FROM execution_operation_queue_items
        WHERE workspace_id=$1 AND triage_state <> 'RESOLVED'
        ORDER BY CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'ERROR' THEN 2
                               WHEN 'WARNING' THEN 3 ELSE 4 END,
                 updated_at, operation_id
        LIMIT 10`,
      [workspaceId],
    );
    const total = result.rows[0] ? Number(result.rows[0].total_count)
      : Number((await client.query<{ count: string }>(
        `SELECT count(*) FROM execution_operation_queue_items
          WHERE workspace_id=$1 AND triage_state <> 'RESOLVED'`,
        [workspaceId],
      )).rows[0]?.count ?? 0);
    const asOf = latestDate(result.rows.map((row) => row.updated_at));
    return {
      status: localExecutionStatus("EXECUTION_OPERATIONS", asOf, readAt),
      exact_total_count: total,
      items: result.rows.map((row) => ({
        id: row.operation_id,
        kind: "OPERATION",
        title: row.command_key,
        summary: `${row.target_type}:${row.target_id} · ${row.source_status}/${row.verification_result}`,
        severity: commandCenterSeverity(row.severity),
        sla_state: "NONE",
        sla_due_at: null,
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at.toISOString(),
        authority: "EXECUTION",
        as_of: row.updated_at.toISOString(),
        href: `/execution/operations?operation_id=${encodeURIComponent(row.operation_id)}`,
        action_label: "Inspect",
      })),
    };
  }

  private async verifiedOperationsToday(
    client: PoolClient,
    workspaceId: string,
    readAt: Date,
  ): Promise<ExactSourceSlice<TodayCandidate>> {
    const result = await client.query<OperationTriageRow>(
      `SELECT operation_id, command_key, target_type, target_id, severity, source_status,
              verification_result, created_at, updated_at, count(*) OVER() AS total_count
         FROM execution_operation_queue_items
        WHERE workspace_id=$1
          AND source_status='SUCCEEDED' AND verification_result='SUCCEEDED'
          AND updated_at BETWEEN $2::timestamptz - interval '24 hours' AND $2::timestamptz
        ORDER BY updated_at DESC, operation_id DESC
        LIMIT 12`,
      [workspaceId, readAt],
    );
    const total = result.rows[0] ? Number(result.rows[0].total_count) : 0;
    const asOf = latestDate(result.rows.map((row) => row.updated_at));
    return {
      status: localExecutionStatus("EXECUTION_OPERATIONS", asOf, readAt),
      exact_total_count: total,
      items: result.rows.map((row) => ({
        id: `verified:${row.operation_id}`,
        kind: "VERIFIED_OPERATION",
        label: `${row.command_key} verified · ${row.target_type}:${row.target_id}`,
        scheduled_at: row.updated_at.toISOString(),
        authority: "EXECUTION",
        as_of: row.updated_at.toISOString(),
        href: `/execution/operations?operation_id=${encodeURIComponent(row.operation_id)}`,
      })),
    };
  }

  private async projectionFleet(
    client: PoolClient,
    readAt: Date,
  ): Promise<ExactSourceSlice<FleetSnapshot>> {
    const projectionWorkspaceId = this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID;
    if (!projectionWorkspaceId || this.config.FEATURE_EXECUTION_LOCAL_PROJECTION !== "true") {
      return unavailableSource("EXECUTION_FLEET", "EXECUTION", "PHASE2_LOCAL_PROJECTION_DISABLED");
    }
    const result = await client.query<ProjectionSnapshotRow>(
      `SELECT environment, profile_id, source_cursor, source_as_of, received_at,
              last_successful_refresh_at, completeness, projection_epoch::text,
              projection_sequence::text, payload
         FROM execution_profile_projection_snapshots
        WHERE workspace_id=$1 AND environment IN ('paper','sandbox','live')
        ORDER BY environment`,
      [projectionWorkspaceId],
    );
    if (result.rows.length === 0) {
      return unavailableSource("EXECUTION_FLEET", "EXECUTION", "PHASE2_PROJECTION_NOT_READY");
    }
    const staleCeiling = this.config.EXECUTION_LOCAL_PROJECTION_STALE_CEILING_MS;
    const newestRefresh = latestDate(result.rows.map((row) => row.last_successful_refresh_at));
    const ageMs = newestRefresh ? Math.max(0, readAt.valueOf() - newestRefresh.valueOf()) : null;
    if (ageMs === null || ageMs > staleCeiling) {
      return unavailableSource("EXECUTION_FLEET", "EXECUTION", "PHASE2_PROJECTION_STALE_CEILING_EXCEEDED");
    }
    const deployments = new Map<string, { environment: string; state: string; label: string }>();
    let brokerSyncIssues = 0;
    let openFindings = 0;
    for (const snapshot of result.rows) {
      for (const row of projectionRows(snapshot, "manager.deployments:strategy_deployments")) {
        const id = String(row.deployment_id ?? "");
        if (!id) continue;
        deployments.set(`${snapshot.environment}:${id}`, {
          environment: snapshot.environment,
          state: String(row.state ?? "").toUpperCase(),
          label: String(row.strategy_id ?? id),
        });
      }
      brokerSyncIssues += projectionRows(snapshot, "manager.accounts:broker_account_sync_effective")
        .filter((row) => !["OK", "SYNCED", "CURRENT", "SUCCESS", "SUCCEEDED"].includes(String(row.status ?? "").toUpperCase())).length;
      openFindings += projectionRows(snapshot, "manager.reconciliation:reconciliation_findings")
        .filter((row) => !["CLOSED", "RESOLVED", "CLEARED"].includes(String(row.status ?? "").toUpperCase())).length;
    }
    const values = [...deployments.values()];
    const total = deployments.size;
    const status = projectionSourceStatus(result.rows, readAt, ageMs);
    return {
      status,
      exact_total_count: total,
      items: [{
        total_deployments: total,
        cells: [
          { code: "LIVE_FULL", label: "Live", value: values.filter((row) => row.environment === "live" && !row.state.includes("CANARY")).length, href: "/deployments/live" },
          { code: "LIVE_CANARY", label: "Canary", value: values.filter((row) => row.environment === "live" && row.state.includes("CANARY")).length, href: "/deployments/live?stage=canary" },
          { code: "SANDBOX", label: "Sandbox", value: values.filter((row) => row.environment === "sandbox").length, href: "/deployments/sandbox" },
          { code: "PAPER", label: "Paper", value: values.filter((row) => row.environment === "paper").length, href: "/deployments/paper" },
          { code: "BROKER_SYNC_ISSUES", label: "Broker sync", value: brokerSyncIssues, href: "/execution/operations?filter=broker_sync" },
          { code: "OPEN_FINDINGS", label: "Findings", value: openFindings, href: "/execution/operations?filter=findings" },
        ],
        deployment_labels: Object.fromEntries([...deployments.entries()].map(([key, row]) => [key.split(":", 2)[1], row.label])),
      }],
    };
  }

  private async governanceTriage(
    client: PoolClient,
    workspaceId: string,
    actor: PortalUser,
    readAt: Date,
  ): Promise<ExactSourceSlice<TriageCandidate>> {
    const result = await client.query<GovernanceTriageRow>(
      `WITH actionable AS (
         SELECT request.*,
                CASE
                  WHEN request.sla_due_at <= $3 THEN 'OVERDUE'
                  WHEN request.sla_due_at <= $3 + interval '8 hours' THEN 'DUE_SOON'
                  ELSE 'ON_TRACK'
                END AS sla_state,
                CASE
                  WHEN request.sla_due_at <= $3 THEN 1
                  WHEN request.sla_due_at <= $3 + interval '8 hours' THEN 2
                  ELSE 3
                END AS severity_rank
           FROM governance_approval_requests request
          WHERE request.workspace_id = $1
            AND request.status = 'PENDING'
            AND request.expires_at > $3
            AND request.requester_user_id <> $2
            AND request.artifact_creator_user_id <> $2
            AND NOT ($2 = ANY(request.decision_actor_ids))
            AND request.evidence_complete = true
            AND request.blocker_count = 0
       )
       SELECT approval_id, gate, subject_label, target_label, created_at,
              updated_at, sla_due_at, sla_state, count(*) OVER() AS total_count
         FROM actionable
        ORDER BY severity_rank, sla_due_at, created_at, approval_id
        LIMIT 10`,
      [workspaceId, actor.userId, readAt],
    );
    const total = result.rows[0] ? Number(result.rows[0].total_count) : await this.actionableCount(
      client,
      workspaceId,
      actor.userId,
      readAt,
    );
    const asOf = result.rows.reduce<Date | null>(
      (latest, row) => latest === null || row.updated_at > latest ? row.updated_at : latest,
      null,
    );
    return {
      status: portalSourceStatus(asOf, readAt),
      exact_total_count: total,
      items: result.rows.map((row) => ({
        id: row.approval_id,
        kind: "APPROVAL",
        title: row.subject_label,
        summary: `${row.gate} · ${row.target_label}`,
        severity: row.sla_state === "OVERDUE" ? "HIGH" : row.sla_state === "DUE_SOON" ? "MEDIUM" : "LOW",
        sla_state: row.sla_state,
        sla_due_at: row.sla_due_at.toISOString(),
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at.toISOString(),
        authority: "PORTAL",
        as_of: row.updated_at.toISOString(),
        href: reviewHref(row.gate, row.approval_id),
        action_label: "Review",
      })),
    };
  }

  private async actionableCount(
    client: PoolClient,
    workspaceId: string,
    actorId: string,
    readAt: Date,
  ): Promise<number> {
    const result = await client.query<{ total_count: string }>(
      `SELECT count(*) AS total_count
         FROM governance_approval_requests request
        WHERE request.workspace_id = $1
          AND request.status = 'PENDING'
          AND request.expires_at > $3
          AND request.requester_user_id <> $2
          AND request.artifact_creator_user_id <> $2
          AND NOT ($2 = ANY(request.decision_actor_ids))
          AND request.evidence_complete = true
          AND request.blocker_count = 0`,
      [workspaceId, actorId, readAt],
    );
    return Number(result.rows[0]?.total_count ?? 0);
  }

  private async governanceToday(
    client: PoolClient,
    workspaceId: string,
    readAt: Date,
  ): Promise<ExactSourceSlice<TodayCandidate>> {
    const result = await client.query<TodayRow>(
      `WITH upcoming AS (
         SELECT concat('review:', approval_id) AS item_id,
                'REVIEW_DUE'::text AS kind,
                concat(gate, ' review · ', subject_label) AS label,
                sla_due_at AS scheduled_at,
                CASE
                  WHEN gate = 'R1' THEN concat('/governance/approvals/', approval_id, '/r1')
                  WHEN gate IN ('R2', 'LIVE_GATE') THEN concat('/governance/approvals/', approval_id, '/r2')
                  ELSE concat('/governance/exit-reviews/', approval_id)
                END AS href,
                updated_at
           FROM governance_approval_requests
          WHERE workspace_id = $1
            AND status = 'PENDING'
            AND expires_at > $2
            AND sla_due_at <= $2 + interval '48 hours'
         UNION ALL
         SELECT concat('condition:', condition_id), 'CONDITION_EXPIRY',
                concat('Condition ', lower(condition_state), ' · ', label), due_at,
                '/governance/waivers', updated_at
           FROM governance_conditions_register
          WHERE workspace_id = $1
            AND condition_state IN ('EXPIRING', 'LAPSED')
            AND due_at IS NOT NULL
            AND due_at BETWEEN $2 - interval '30 days' AND $2 + interval '48 hours'
       )
       SELECT *, count(*) OVER() AS total_count
         FROM upcoming
        ORDER BY scheduled_at, kind, item_id
        LIMIT 12`,
      [workspaceId, readAt],
    );
    const total = result.rows[0]
      ? Number(result.rows[0].total_count)
      : Number((await client.query<{ total_count: string }>(
        `SELECT (
           (SELECT count(*) FROM governance_approval_requests
             WHERE workspace_id = $1 AND status = 'PENDING'
               AND expires_at > $2 AND sla_due_at <= $2 + interval '48 hours')
           +
           (SELECT count(*) FROM governance_conditions_register
             WHERE workspace_id = $1
               AND condition_state IN ('EXPIRING', 'LAPSED')
               AND due_at IS NOT NULL
               AND due_at BETWEEN $2 - interval '30 days' AND $2 + interval '48 hours')
         ) AS total_count`,
        [workspaceId, readAt],
      )).rows[0]?.total_count ?? 0);
    const asOf = result.rows.reduce<Date | null>(
      (latest, row) => latest === null || row.updated_at > latest ? row.updated_at : latest,
      null,
    );
    return {
      status: portalSourceStatus(asOf, readAt),
      exact_total_count: total,
      items: result.rows.map((row) => ({
        id: row.item_id,
        kind: row.kind,
        label: row.label,
        scheduled_at: row.scheduled_at.toISOString(),
        authority: "PORTAL",
        as_of: row.updated_at.toISOString(),
        href: row.href,
      })),
    };
  }

  private async pins(
    client: PoolClient,
    workspaceId: string,
    actorId: string,
  ): Promise<CommandCenterPin[]> {
    const result = await client.query<PinRow>(
      `SELECT slot, entity_type, entity_id, label, href, created_at
         FROM execution_command_center_pins
        WHERE workspace_id = $1 AND user_id = $2
        ORDER BY slot
        LIMIT 5`,
      [workspaceId, actorId],
    );
    return result.rows.map((row) => ({
      slot: row.slot,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      label: row.label,
      href: row.href,
      pinned_at: row.created_at.toISOString(),
    }));
  }
}

function localExecutionStatus(
  source: "EXECUTION_INCIDENTS" | "EXECUTION_OPERATIONS",
  asOf: Date | null,
  readAt: Date,
): SourceStatus {
  return {
    source,
    authority: "EXECUTION",
    availability: "AVAILABLE",
    reason: null,
    as_of: asOf?.toISOString() ?? readAt.toISOString(),
    source_cursor: null,
    source_sequence: null,
    projection_epoch: null,
    projection_sequence: null,
    source_completeness: "EVENT_SOURCED",
    poll_interval_ms: null,
    freshness_state: "OK",
    age_seconds: asOf ? Math.max(0, Math.floor((readAt.valueOf() - asOf.valueOf()) / 1000)) : 0,
    lag_ms: 0,
    capability_snapshot_id: null,
    delivery_profile: "portal_sgp_projection",
  };
}

function projectionSourceStatus(
  rows: ProjectionSnapshotRow[],
  readAt: Date,
  ageMs: number,
): SourceStatus {
  const oldest = [...rows].sort((left, right) =>
    left.last_successful_refresh_at.valueOf() - right.last_successful_refresh_at.valueOf())[0];
  const newestSequence = Math.max(...rows.map((row) => Number(row.projection_sequence)));
  return {
    source: "EXECUTION_FLEET",
    authority: "EXECUTION",
    availability: "AVAILABLE",
    reason: rows.some((row) => row.completeness !== "COMPLETE") ? "PHASE2_HOT_WINDOW_PARTIAL" : null,
    as_of: latestDate(rows.flatMap((row) => row.source_as_of ? [row.source_as_of] : []))?.toISOString() ?? null,
    source_cursor: oldest.source_cursor,
    source_sequence: null,
    projection_epoch: oldest.projection_epoch,
    projection_sequence: newestSequence,
    source_completeness: "POLL_BOUNDED",
    poll_interval_ms: null,
    freshness_state: ageMs > 120_000 ? "AGING" : "OK",
    age_seconds: Math.floor(ageMs / 1000),
    lag_ms: ageMs,
    capability_snapshot_id: null,
    delivery_profile: "portal_sgp_projection",
  };
}

function projectionRows(snapshot: ProjectionSnapshotRow, key: string): Array<Record<string, unknown>> {
  const relation = snapshot.payload.relations?.[key];
  if (!relation || relation.availability !== "AVAILABLE") return [];
  return (relation.items ?? []).flatMap((item) => item.fields ? [item.fields] : []);
}

function latestDate(values: Date[]): Date | null {
  return values.reduce<Date | null>((latest, value) => latest === null || value > latest ? value : latest, null);
}

function commandCenterSeverity(value: "INFO" | "WARNING" | "ERROR" | "CRITICAL"):
"INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  if (value === "CRITICAL") return "CRITICAL";
  if (value === "ERROR") return "HIGH";
  if (value === "WARNING") return "MEDIUM";
  return "INFO";
}
