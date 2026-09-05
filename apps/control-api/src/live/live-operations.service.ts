import { Inject, Injectable } from "@nestjs/common";
import { CanaryEnvelopeRow, CanaryLineage, CanaryRepository } from "../canary/canary.repository";
import { AuthSession, PortalUser } from "../domain";
import { ProfileReadService } from "../profile-read/profile-read.service";
import { ControlApiConfig } from "../config";
import { CONTROL_API_CONFIG } from "../tokens";
import { browserSafeProfileRead } from "../execution/browser-safe-profile-read";
import {
  exactCurrencySum,
  latest,
  openOrders,
  ProfileScreenSource,
} from "../execution/profile-screen-composer";
import { GovernanceError } from "../governance/governance.service";

function decimal(value: string): string {
  const [whole, fraction = ""] = value.split(".");
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed.length > 0 ? `${whole}.${trimmed}` : whole;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isReadableCurrentSource(source: Record<string, unknown>): boolean {
  return source.state === "ready" || source.state === "empty" ||
    source.state === "partial" || source.state === "stale";
}

@Injectable()
export class LiveOperationsService {
  constructor(
    @Inject(CanaryRepository) private readonly canaries: CanaryRepository,
    @Inject(ProfileReadService) private readonly profileReads: ProfileReadService,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  async detail(user: PortalUser, session: AuthSession, workspaceId: string, deploymentId: string) {
    let canary: CanaryEnvelopeRow;
    try {
      canary = await this.canaries.latestByDeployment(workspaceId, deploymentId);
    } catch (error) {
      // Live source truth is independent of Portal-owned canary governance.
      // A missing governance record must not hide a real, authorised Manager
      // read behind a generic unavailable page.
      if (error instanceof GovernanceError && error.code === "CANARY_ENVELOPE_NOT_FOUND") {
        const currentSource = await this.profileReads.snapshot(
          { user, session, workspaceId },
          "live",
          "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN",
          deploymentId,
        );
        // Replace an absent Portal governance record only with a readable
        // source envelope. A failed source read retains the typed 404.
        if (!isReadableCurrentSource(currentSource)) throw error;
        return this.sourceOnlyDetail(user, deploymentId, currentSource);
      }
      throw error;
    }
    const [lineage, currentSource] = await Promise.all([
      this.canaries.lineageFor(canary),
      this.profileReads.snapshot(
        { user, session, workspaceId },
        "live",
        "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN",
        deploymentId,
      ),
    ]);
    return this.composeDetail(user, canary, lineage, currentSource);
  }

  private sourceOnlyDetail(user: PortalUser, deploymentId: string, currentSource: Record<string, unknown>) {
    const readAt = new Date().toISOString();
    const source = new ProfileScreenSource(currentSource, readAt);
    const deployment = source.rows("deployments")[0] ?? null;
    const positions = source.rows("positions");
    const orders = source.rows("orders");
    const fills = source.rows("fills");
    const balances = source.rows("account_balances");
    const margins = source.rows("margin_balances");
    const brokerSync = source.rows("broker_sync");
    const reconciliation = source.rows("reconciliation");
    const activeFindings = reconciliation.filter((row) => !["RESOLVED", "CLOSED"].includes(String(row.status ?? "").toUpperCase()));
    const brokerRecord = latest(brokerSync, "synced_at");
    const brokerHealthy = brokerRecord !== null && ["SYNCED", "CURRENT", "OK", "HEALTHY"]
      .includes(String(brokerRecord.status ?? "").toUpperCase());
    const deploymentCurrency = text(deployment?.currency);
    const capitalAggregate = exactCurrencySum(balances, ["total"]);
    const capitalReason = capitalAggregate.reasonCode ??
      (deploymentCurrency && capitalAggregate.currency && deploymentCurrency !== capitalAggregate.currency
        ? "EDS03_DEPLOYMENT_BALANCE_CURRENCY_MISMATCH" : null);
    const currency = capitalAggregate.currency ?? deploymentCurrency ?? "UNIT";
    const open = openOrders(orders);
    const capital = capitalReason ? null : capitalAggregate.value;
    // The accepted Manager current-position page has neither explicit
    // currency nor mark lineage. Keep its rows visible, but do not turn them
    // into a monetary aggregate until the owner publishes both facts.
    const positionValueReason = positions.length > 0
      ? "E5_POSITION_CURRENCY_AND_MARK_LINEAGE_UNQUALIFIED" : null;
    const grossNotional = null;
    const dailyPnl = null;
    const brokerAggregate = brokerRecord ? exactCurrencySum([brokerRecord], ["buying_power"])
      : { value: null, currency: null, reasonCode: null };
    const brokerReason = brokerAggregate.reasonCode ??
      (brokerAggregate.currency && brokerAggregate.currency !== currency
        ? "EDS03_BROKER_CURRENCY_MISMATCH" : null);
    const brokerEquity = brokerReason ? null : brokerAggregate.value;
    const brokerVisible = source.connected && brokerHealthy && activeFindings.length === 0 && brokerReason === null;
    const realtimeActive = source.connected && source.projection !== null &&
      this.config.FEATURE_EXECUTION_REALTIME_SSE === "true";
    const sourceMissing = !source.connected || deployment === null;
    const blockers = [
      "PORTAL_CANARY_GOVERNANCE_NOT_COMMISSIONED",
      "PRODUCTION_COMMAND_INACTIVE",
      "LIVE_FULL_ACTIVATION_NOT_APPROVED",
      ...(sourceMissing ? ["LIVE_SOURCE_UNAVAILABLE"] : []),
      ...(!source.projection ? ["SOURCE_CONTINUITY_UNAVAILABLE"] : []),
      ...(!brokerVisible ? [activeFindings.length > 0 ? "BROKER_RECONCILIATION_MISMATCH"
        : brokerReason ?? "BROKER_STATE_UNAVAILABLE"] : []),
    ];
    const kpi = (
      key: string,
      label: string,
      authority: "EXECUTION" | "BROKER" | "DERIVED",
      unit: string,
      value: string | null,
      keys: readonly string[],
      suppress = false,
      qualificationReason: string | null = null,
    ) => {
      const panel = source.panel(`kpi-${key}`, authority, keys, value === null ? {} : { value }, suppress);
      const qualification = qualificationReason === null ? panel : {
        ...panel,
        panel_state: suppress ? panel.panel_state : "partial",
        source_verification_state: suppress ? panel.source_verification_state : "PARTIAL",
        data: null,
        warnings: [...panel.warnings, { code: qualificationReason }],
      };
      return {
        key, label, value: suppress || qualificationReason ? null : value, unit,
        qualification_reason_code: qualificationReason,
        envelope: qualification,
      };
    };
    return {
      schema_version: "execution.live-full-operations.v1",
      record_authority: "PORTAL",
      delivery_profile: source.deliveryProfile,
      source_integration_state: source.connected ? "SOURCE_BACKED" : "UNAVAILABLE",
      source_side_effect_requested: false,
      runtime_activation_requested: false,
      promotion_execution_requested: false,
      production_command_active: false,
      realtime_active: realtimeActive,
      read_at: readAt,
      actor: { user_id: user.userId, username: user.username, roles: [user.role] },
      current_source: browserSafeProfileRead(currentSource),
      deployment: {
        deployment_id: typeof deployment?.deployment_id === "string" ? deployment.deployment_id : deploymentId,
        portfolio_id: typeof deployment?.portfolio_id === "string" ? deployment.portfolio_id : null,
        account_id: typeof deployment?.account_id === "string" ? deployment.account_id : null,
        external_account_ref: null,
        venue: typeof deployment?.venue === "string" ? deployment.venue : null,
        declared_environment: "LIVE_FULL",
        runtime_state: typeof deployment?.state === "string" ? deployment.state : null,
        activated_at: null,
      },
      lineage: [],
      lifecycle: {
        declared_stage: "LIVE_FULL",
        runtime_state: typeof deployment?.state === "string" ? deployment.state : null,
        activated_at: null,
        blocker_codes: blockers,
      },
      predecessor_canary_envelope: null,
      kpis: [
        kpi("capital", "Capital", "EXECUTION", currency, capital, ["account_balances"], false, capitalReason),
        kpi("gross_notional", "Gross notional", "EXECUTION", currency, grossNotional, ["positions"], false, positionValueReason),
        kpi("daily_pnl", "Daily P&L", "DERIVED", currency, dailyPnl, ["positions"], false, positionValueReason),
        kpi("open_orders", "Open orders", "EXECUTION", "COUNT", String(open.length), ["orders"]),
        kpi("broker_equity", "Broker equity", "BROKER", currency, brokerEquity, ["broker_sync"], !brokerVisible, brokerReason),
      ],
      source_panels: {
        internal: source.panel("internal", "EXECUTION", ["positions", "orders", "fills", "account_balances", "margin_balances"], {
          positions, orders, fills, account_balances: balances, margin_balances: margins,
        }),
        broker: source.panel("broker", "BROKER", ["broker_sync"], { broker_sync: brokerSync }, !brokerVisible),
        difference: source.panel("difference", "DERIVED", ["reconciliation"], { reconciliation }),
      },
      broker_consistency: {
        state: !source.connected || !brokerHealthy ? "UNAVAILABLE" : activeFindings.length > 0 ? "MISMATCH" : "IN_SYNC",
        mismatch_behavior: "SUPPRESS_ALL_BROKER_VALUES",
        broker_values_visible: brokerVisible,
        finding_href: activeFindings.length > 0 ? `/operations/reconciliation/${String(activeFindings[0].finding_id ?? "current")}` : null,
        dry_run_reconcile_href: null,
        blocker_codes: brokerVisible ? [] : activeFindings.length > 0 ? ["BROKER_RECONCILIATION_MISMATCH"]
          : [brokerReason ?? "BROKER_STATE_UNAVAILABLE", ...(sourceMissing ? ["LIVE_SOURCE_UNAVAILABLE"] : [])],
      },
      projection_continuity: {
        state: source.projection ? "CONTIGUOUS" : "UNAVAILABLE",
        epoch: source.projection?.epoch ?? null,
        // The raw Manager checkpoint is a server-side drain/resume detail.
        // Browser continuity uses the local epoch/sequence only.
        cursor: null,
        sequence: source.projection?.sequence ?? null,
        gap_detected: source.projection ? false : null,
        affected_authorities: source.projection ? [] : ["EXECUTION", "BROKER", "DERIVED"],
        blocker_codes: source.projection ? [] : ["SOURCE_CONTINUITY_UNAVAILABLE"],
      },
      positions: source.collection("positions", "EXECUTION", "positions"),
      orders: source.collection("orders", "EXECUTION", "orders"),
      open_order_footer: {
        envelope: source.panel("open-order-footer", "EXECUTION", ["orders"], { exact_open_order_count: open.length }),
        exact_open_order_count: source.connected ? open.length : null,
      },
      incidents: { envelope: source.panel("incidents", "EXECUTION", ["reconciliation"], { findings: reconciliation }), exact_total: null, returned_count: 0, next_cursor: null, previous_cursor: null, rows: [] },
      series: { envelope: source.panel("series", "DERIVED", ["positions"], { points: [] }), resolution: null, points: [] },
      rollback_readiness: {
        envelope: source.panel("rollback-readiness", "EXECUTION", ["positions"], { ready: false }),
        ready: false, evidence_hash: null, blocker_codes: ["ROLLBACK_EVIDENCE_UNAVAILABLE"],
      },
      realtime: {
        active: realtimeActive,
        stream_url: realtimeActive ? "/api/v1/execution/realtime/stream" : null,
        subscription_id: realtimeActive ? `live:${deploymentId}` : null,
        blocker_codes: realtimeActive ? [] : ["REALTIME_INACTIVE", ...(source.projection ? [] : ["SOURCE_CONTINUITY_UNAVAILABLE"])],
      },
      command_policy: {
        production_command_active: false,
        guard_semantics: "BROKER_MISMATCH_SUPPRESSES_VALUES_AND_SOURCE_GAP_BLOCKS_R4",
        protective: { risk_tier: "R3_LIVE_PROTECTIVE", visible: false, enabled: false, source_gap_blocks: false, blocker_codes: ["PRODUCTION_COMMAND_INACTIVE"] },
        risk_increasing: { risk_tier: "R4_LIVE_RISK_INCREASING", visible: false, enabled: false, source_gap_blocks: true, blocker_codes: blockers },
      },
    };
  }

  private composeDetail(
    user: PortalUser,
    canary: CanaryEnvelopeRow,
    lineage: CanaryLineage,
    currentSource: Record<string, unknown>,
  ) {
    const readAt = new Date().toISOString();
    const certification = lineage.certification.certification;
    const source = new ProfileScreenSource(currentSource, readAt);
    const sourceUnavailable = !source.connected;
    const sourceConnected = source.connected;
    const positions = source.rows("positions");
    const orders = source.rows("orders");
    const fills = source.rows("fills");
    const balances = source.rows("account_balances");
    const margins = source.rows("margin_balances");
    const brokerSync = source.rows("broker_sync");
    const reconciliation = source.rows("reconciliation");
    const activeFindings = reconciliation.filter((row) => !["RESOLVED", "CLOSED"].includes(String(row.status ?? "").toUpperCase()));
    const brokerRecord = latest(brokerSync, "synced_at");
    const brokerHealthy = brokerRecord !== null && ["SYNCED", "CURRENT", "OK", "HEALTHY"]
      .includes(String(brokerRecord.status ?? "").toUpperCase());
    const capitalAggregate = exactCurrencySum(balances, ["total"]);
    const capitalReason = capitalAggregate.reasonCode ??
      (capitalAggregate.currency && capitalAggregate.currency !== canary.currency
        ? "EDS03_CANARY_BALANCE_CURRENCY_MISMATCH" : null);
    // `positions_v2` currently proves neither the currency nor the mark
    // lineage needed for an aggregate.  Keep the exact rows on the screen,
    // but never manufacture an aggregate in a Portal BFF.
    const positionValueReason = positions.length > 0
      ? "E5_POSITION_CURRENCY_AND_MARK_LINEAGE_UNQUALIFIED" : null;
    const brokerAggregate = brokerRecord ? exactCurrencySum([brokerRecord], ["buying_power"])
      : { value: null, currency: null, reasonCode: null };
    const brokerReason = brokerAggregate.reasonCode ??
      (brokerAggregate.currency && brokerAggregate.currency !== canary.currency
        ? "EDS03_CANARY_BROKER_CURRENCY_MISMATCH" : null);
    const brokerVisible = sourceConnected && brokerHealthy && activeFindings.length === 0 && brokerReason === null;
    const open = openOrders(orders);
    const capital = capitalReason ? null : capitalAggregate.value;
    const grossNotional = null;
    const dailyPnl = null;
    const brokerEquity = brokerReason ? null : brokerAggregate.value;
    const realtimeActive = sourceConnected && source.projection !== null &&
      this.config.FEATURE_EXECUTION_REALTIME_SSE === "true";
    const blockers = [
      "PRODUCTION_COMMAND_INACTIVE",
      "LIVE_FULL_ACTIVATION_NOT_APPROVED",
      "CANARY_EXIT_EVIDENCE_UNAVAILABLE",
      ...(sourceUnavailable ? ["LIVE_SOURCE_UNAVAILABLE"] : []),
      ...(!source.projection ? ["SOURCE_CONTINUITY_UNAVAILABLE"] : []),
      ...(!brokerVisible ? [activeFindings.length > 0 ? "BROKER_RECONCILIATION_MISMATCH"
        : brokerReason ?? "BROKER_STATE_UNAVAILABLE"] : []),
      "ROLLBACK_EVIDENCE_UNAVAILABLE",
      "EX_BE_08_PENDING",
    ];
    const unavailablePanel = (
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
    const unavailableCollection = (panelId: string, authority: "EXECUTION" | "BROKER") => ({
      envelope: unavailablePanel(panelId, authority),
      exact_total: null,
      returned_count: 0,
      next_cursor: null,
      previous_cursor: null,
      rows: [],
    });
    const unavailableKpi = (
      key: string,
      label: string,
      authority: "EXECUTION" | "BROKER" | "DERIVED",
      unit: string,
    ) => ({ key, label, value: null, unit, envelope: unavailablePanel(`kpi-${key}`, authority) });
    const valueKpi = (
      key: string,
      label: string,
      authority: "EXECUTION" | "BROKER" | "DERIVED",
      unit: string,
      value: string | null,
      keys: readonly string[],
      suppress = false,
      qualificationReason: string | null = null,
    ) => {
      const panel = source.panel(`kpi-${key}`, authority, keys, value === null ? {} : { value }, suppress);
      const qualification = qualificationReason === null ? panel : {
        ...panel,
        panel_state: suppress ? panel.panel_state : "partial",
        source_verification_state: suppress ? panel.source_verification_state : "PARTIAL",
        data: null,
        warnings: [...panel.warnings, { code: qualificationReason }],
      };
      return {
        key, label, value: suppress || qualificationReason ? null : value, unit,
        qualification_reason_code: qualificationReason,
        envelope: qualification,
      };
    };
    const sourcePositions = source.collection("positions", "EXECUTION", "positions");
    const sourceOrders = source.collection("orders", "EXECUTION", "orders");

    return {
      schema_version: "execution.live-full-operations.v1",
      record_authority: "PORTAL",
      delivery_profile: sourceConnected ? "LIVE_BINANCE_USDM" : "fixture",
      source_integration_state: sourceConnected ? "SOURCE_BACKED" : "UNAVAILABLE",
      source_side_effect_requested: false,
      runtime_activation_requested: false,
      promotion_execution_requested: false,
      production_command_active: false,
      realtime_active: realtimeActive,
      read_at: readAt,
      actor: { user_id: user.userId, username: user.username, roles: [user.role] },
      current_source: browserSafeProfileRead(currentSource),
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
        ...(sourceConnected ? [
          valueKpi("capital", "Capital", "EXECUTION", canary.currency, capital, ["account_balances"], false, capitalReason),
          valueKpi("gross_notional", "Gross notional", "EXECUTION", canary.currency, grossNotional, ["positions"], false, positionValueReason),
          valueKpi("daily_pnl", "Daily P&L", "DERIVED", canary.currency, dailyPnl, ["positions"], false, positionValueReason),
          valueKpi("open_orders", "Open orders", "EXECUTION", "COUNT", String(open.length), ["orders"]),
          valueKpi("broker_equity", "Broker equity", "BROKER", canary.currency, brokerEquity, ["broker_sync"], !brokerVisible, brokerReason),
        ] : [
          unavailableKpi("capital", "Capital", "EXECUTION", canary.currency),
          unavailableKpi("gross_notional", "Gross notional", "EXECUTION", canary.currency),
          unavailableKpi("daily_pnl", "Daily P&L", "DERIVED", canary.currency),
          unavailableKpi("open_orders", "Open orders", "EXECUTION", "COUNT"),
          unavailableKpi("broker_equity", "Broker equity", "BROKER", canary.currency),
        ]),
      ],
      source_panels: {
        internal: sourceConnected
          ? source.panel("internal", "EXECUTION", ["positions", "orders", "fills", "account_balances", "margin_balances"], { positions, orders, fills, account_balances: balances, margin_balances: margins })
          : unavailablePanel("internal", "EXECUTION"),
        broker: sourceConnected
          ? source.panel("broker", "BROKER", ["broker_sync"], { broker_sync: brokerSync }, !brokerVisible)
          : unavailablePanel("broker", "BROKER", "suppressed"),
        difference: sourceConnected
          ? source.panel("difference", "DERIVED", ["reconciliation"], { reconciliation })
          : unavailablePanel("difference", "DERIVED"),
      },
      broker_consistency: {
        state: !sourceConnected || !brokerHealthy ? "UNAVAILABLE" : activeFindings.length > 0 ? "MISMATCH" : "IN_SYNC",
        mismatch_behavior: "SUPPRESS_ALL_BROKER_VALUES",
        broker_values_visible: brokerVisible,
        finding_href: activeFindings.length > 0 ? `/operations/reconciliation/${String(activeFindings[0].finding_id ?? "current")}` : null,
        dry_run_reconcile_href: null,
        blocker_codes: brokerVisible ? [] : activeFindings.length > 0 ? ["BROKER_RECONCILIATION_MISMATCH"]
          : [brokerReason ?? "BROKER_STATE_UNAVAILABLE", ...(sourceUnavailable ? ["LIVE_SOURCE_UNAVAILABLE"] : [])],
      },
      projection_continuity: {
        state: source.projection ? "CONTIGUOUS" : "UNAVAILABLE",
        epoch: source.projection?.epoch ?? null,
        // See the full Live screen above: raw source checkpoints never leave
        // the SGP projection boundary.
        cursor: null,
        sequence: source.projection?.sequence ?? null,
        gap_detected: source.projection ? false : null,
        affected_authorities: source.projection ? [] : ["EXECUTION", "BROKER", "DERIVED"],
        blocker_codes: source.projection ? [] : ["SOURCE_CONTINUITY_UNAVAILABLE", "EX_BE_08_PENDING"],
      },
      positions: sourceConnected ? sourcePositions : unavailableCollection("positions", "EXECUTION"),
      orders: sourceConnected ? sourceOrders : unavailableCollection("orders", "EXECUTION"),
      open_order_footer: {
        envelope: sourceConnected ? source.panel("open-order-footer", "EXECUTION", ["orders"], { exact_open_order_count: open.length }) : unavailablePanel("open-order-footer", "EXECUTION"),
        exact_open_order_count: sourceConnected ? open.length : null,
      },
      incidents: unavailableCollection("incidents", "EXECUTION"),
      series: {
        envelope: unavailablePanel("series", "DERIVED"),
        resolution: null,
        points: [],
      },
      rollback_readiness: {
        envelope: unavailablePanel("rollback-readiness", "EXECUTION"),
        ready: false,
        evidence_hash: null,
        blocker_codes: ["ROLLBACK_EVIDENCE_UNAVAILABLE", "EX_BE_08_PENDING"],
      },
      realtime: {
        active: realtimeActive,
        stream_url: realtimeActive ? "/api/v1/execution/realtime/stream" : null,
        subscription_id: realtimeActive ? `live:${canary.deployment_id}` : null,
        blocker_codes: realtimeActive ? [] : ["REALTIME_INACTIVE", ...(source.projection ? [] : ["SOURCE_CONTINUITY_UNAVAILABLE"])],
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
