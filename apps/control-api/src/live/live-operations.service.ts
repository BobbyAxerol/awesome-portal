import { Inject, Injectable } from "@nestjs/common";
import { CanaryEnvelopeRow, CanaryLineage, CanaryRepository } from "../canary/canary.repository";
import { PortalUser } from "../domain";

function decimal(value: string): string {
  const [whole, fraction = ""] = value.split(".");
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed.length > 0 ? `${whole}.${trimmed}` : whole;
}

@Injectable()
export class LiveOperationsService {
  constructor(@Inject(CanaryRepository) private readonly canaries: CanaryRepository) {}

  async detail(user: PortalUser, workspaceId: string, deploymentId: string) {
    const canary = await this.canaries.latestByDeployment(workspaceId, deploymentId);
    const lineage = await this.canaries.lineageFor(canary);
    return this.sourceDarkDetail(user, canary, lineage);
  }

  private sourceDarkDetail(user: PortalUser, canary: CanaryEnvelopeRow, lineage: CanaryLineage) {
    const readAt = new Date().toISOString();
    const certification = lineage.certification.certification;
    const blockers = [
      "PRODUCTION_COMMAND_INACTIVE",
      "LIVE_FULL_ACTIVATION_NOT_APPROVED",
      "CANARY_EXIT_EVIDENCE_UNAVAILABLE",
      "LIVE_SOURCE_UNAVAILABLE",
      "SOURCE_CONTINUITY_UNAVAILABLE",
      "BROKER_STATE_UNAVAILABLE",
      "ROLLBACK_EVIDENCE_UNAVAILABLE",
      "EX_BE_08_PENDING",
    ];
    const panel = (
      panelId: string,
      authority: "EXECUTION" | "BROKER" | "DERIVED",
      state: "unavailable" | "suppressed" = "unavailable",
    ) => ({
      panel_id: panelId,
      source_authority: authority,
      panel_state: state,
      freshness_state: "UNKNOWN",
      delivery_profile: "fixture",
      source_verification_state: "UNAVAILABLE",
      as_of: null,
      read_at: readAt,
      age_seconds: null,
      lag_ms: null,
      source_cursor: null,
      projection_epoch: null,
      projection_sequence: null,
      capability_snapshot_id: null,
      data: null,
      warnings: [{ code: `LIVE_FULL_${panelId.toUpperCase().replaceAll("-", "_")}_UNAVAILABLE` }],
    });
    const collection = (panelId: string, authority: "EXECUTION" | "BROKER") => ({
      envelope: panel(panelId, authority),
      exact_total: null,
      returned_count: 0,
      next_cursor: null,
      previous_cursor: null,
      rows: [],
    });
    const kpi = (
      key: string,
      label: string,
      authority: "EXECUTION" | "BROKER" | "DERIVED",
      unit: string,
    ) => ({ key, label, value: null, unit, envelope: panel(`kpi-${key}`, authority) });

    return {
      schema_version: "execution.live-full-operations.v1",
      record_authority: "PORTAL",
      delivery_profile: "fixture",
      source_integration_state: "UNAVAILABLE",
      source_side_effect_requested: false,
      runtime_activation_requested: false,
      promotion_execution_requested: false,
      production_command_active: false,
      realtime_active: false,
      read_at: readAt,
      actor: { user_id: user.userId, username: user.username, roles: [user.role] },
      deployment: {
        deployment_id: canary.deployment_id,
        portfolio_id: certification.portfolio_id,
        account_id: certification.account_id,
        external_account_ref: certification.external_account_ref,
        venue: certification.venue,
        declared_environment: "LIVE_FULL",
        runtime_state: null,
        activated_at: null,
      },
      lineage: [
        { kind: "ARTIFACT", state: "AVAILABLE", value: certification.artifact_digest, href: null },
        { kind: "R1_APPROVAL", state: "AVAILABLE", value: certification.r1_approval_id, href: `/governance/approvals/${certification.r1_approval_id}/r1` },
        { kind: "R2_APPROVAL", state: "AVAILABLE", value: certification.r2_approval_id, href: `/governance/approvals/${certification.r2_approval_id}/r2` },
        { kind: "SANDBOX_EXIT", state: "AVAILABLE", value: certification.certification_id, href: `/deployments/sandbox/${canary.deployment_id}` },
        { kind: "CANARY_ENVELOPE", state: "AVAILABLE", value: canary.envelope_id, href: `/deployments/live/${canary.deployment_id}/canary` },
        { kind: "CANARY_EXIT", state: "UNAVAILABLE", value: null, href: null },
        { kind: "LIVE_DUAL_APPROVAL", state: "UNAVAILABLE", value: null, href: null },
      ],
      lifecycle: {
        declared_stage: "LIVE_FULL",
        runtime_state: null,
        activated_at: null,
        blocker_codes: blockers,
      },
      predecessor_canary_envelope: {
        envelope_id: canary.envelope_id,
        revision: canary.revision,
        status: canary.status,
        currency: canary.currency,
        limits: {
          capital_cap: decimal(canary.capital_cap),
          gross_notional_cap: decimal(canary.gross_notional_cap),
          daily_loss_cap: decimal(canary.daily_loss_cap),
          max_open_orders: canary.max_open_orders,
        },
        evidence_set_hash: canary.evidence_set_hash,
        active_for_live_full: false,
      },
      kpis: [
        kpi("capital", "Capital", "EXECUTION", canary.currency),
        kpi("gross_notional", "Gross notional", "EXECUTION", canary.currency),
        kpi("daily_pnl", "Daily P&L", "DERIVED", canary.currency),
        kpi("open_orders", "Open orders", "EXECUTION", "COUNT"),
        kpi("broker_equity", "Broker equity", "BROKER", canary.currency),
      ],
      source_panels: {
        internal: panel("internal", "EXECUTION"),
        broker: panel("broker", "BROKER", "suppressed"),
        difference: panel("difference", "DERIVED"),
      },
      broker_consistency: {
        state: "UNAVAILABLE",
        mismatch_behavior: "SUPPRESS_ALL_BROKER_VALUES",
        broker_values_visible: false,
        finding_href: null,
        dry_run_reconcile_href: null,
        blocker_codes: ["BROKER_STATE_UNAVAILABLE", "LIVE_SOURCE_UNAVAILABLE"],
      },
      projection_continuity: {
        state: "UNAVAILABLE",
        epoch: null,
        cursor: null,
        sequence: null,
        gap_detected: null,
        affected_authorities: ["EXECUTION", "BROKER", "DERIVED"],
        blocker_codes: ["SOURCE_CONTINUITY_UNAVAILABLE", "EX_BE_08_PENDING"],
      },
      positions: collection("positions", "EXECUTION"),
      orders: collection("orders", "EXECUTION"),
      open_order_footer: {
        envelope: panel("open-order-footer", "EXECUTION"),
        exact_open_order_count: null,
      },
      incidents: collection("incidents", "EXECUTION"),
      series: {
        envelope: panel("series", "DERIVED"),
        resolution: null,
        points: [],
      },
      rollback_readiness: {
        envelope: panel("rollback-readiness", "EXECUTION"),
        ready: false,
        evidence_hash: null,
        blocker_codes: ["ROLLBACK_EVIDENCE_UNAVAILABLE", "EX_BE_08_PENDING"],
      },
      realtime: {
        active: false,
        stream_url: null,
        subscription_id: null,
        blocker_codes: ["REALTIME_INACTIVE", "SOURCE_CONTINUITY_UNAVAILABLE"],
      },
      command_policy: {
        production_command_active: false,
        guard_semantics: "BROKER_MISMATCH_SUPPRESSES_VALUES_AND_SOURCE_GAP_BLOCKS_R4",
        protective: {
          risk_tier: "R3_LIVE_PROTECTIVE",
          visible: false,
          enabled: false,
          source_gap_blocks: false,
          blocker_codes: ["PRODUCTION_COMMAND_INACTIVE", "PROTECTIVE_CAPABILITY_UNAVAILABLE"],
        },
        risk_increasing: {
          risk_tier: "R4_LIVE_RISK_INCREASING",
          visible: false,
          enabled: false,
          source_gap_blocks: true,
          blocker_codes: blockers,
        },
      },
    };
  }
}
