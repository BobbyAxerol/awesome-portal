import { Inject, Injectable } from "@nestjs/common";
import { Pool, PoolClient } from "pg";
import { PortalUser } from "../domain";
import { CONTROL_API_POOL } from "../tokens";
import {
  CommandCenterInputs,
  CommandCenterPin,
  ExactSourceSlice,
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
    delivery_profile: "fixture",
  };
}

@Injectable()
export class CommandCenterRepository {
  constructor(@Inject(CONTROL_API_POOL) private readonly pool: Pool) {}

  async read(workspaceId: string, actor: PortalUser, readAt: Date): Promise<CommandCenterInputs> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await client.query("SET LOCAL statement_timeout = '1000ms'");
      await client.query("SET LOCAL idle_in_transaction_session_timeout = '2000ms'");
      const governance = await this.governanceTriage(client, workspaceId, actor, readAt);
      const today = await this.governanceToday(client, workspaceId, readAt);
      const pins = await this.pins(client, workspaceId, actor.userId);
      await client.query("COMMIT");
      return {
        workspaceId,
        actor,
        readAt,
        triageSources: [
          governance,
          unavailableSource("EXECUTION_INCIDENTS", "EXECUTION", "INCIDENT_SOURCE_NOT_COMMISSIONED"),
          unavailableSource("EXECUTION_OPERATIONS", "EXECUTION", "OPERATION_SOURCE_NOT_COMMISSIONED"),
        ],
        fleet: unavailableSource(
          "EXECUTION_FLEET",
          "EXECUTION",
          "FLEET_SOURCE_NOT_COMMISSIONED",
        ),
        pins,
        todaySources: [
          today,
          unavailableSource("EXECUTION_OPERATIONS", "EXECUTION", "OPERATION_SOURCE_NOT_COMMISSIONED"),
        ],
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
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
