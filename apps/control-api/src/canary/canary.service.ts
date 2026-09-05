import { createHash } from "crypto";
import { Inject, Injectable } from "@nestjs/common";
import { AuthSession, PortalUser } from "../domain";
import { GovernanceError } from "../governance/governance.service";
import { newUlid } from "../id";
import { ProfileReadService } from "../profile-read/profile-read.service";
import { browserSafeProfileRead } from "../execution/browser-safe-profile-read";
import {
  decimalAbsoluteSum,
  decimalSubtract,
  decimalSum,
  latest,
  openOrders,
  ProfileScreenSource,
} from "../execution/profile-screen-composer";
import { evaluateSandboxCertification } from "../sandbox/sandbox-certification.service";
import { CanaryEnvelopeCreateRequest } from "./contracts";
import { CanaryEnvelopeRow, CanaryLineage, CanaryRepository } from "./canary.repository";

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

function decimal(value: string): string {
  const [whole, fraction = ""] = value.split(".");
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed.length > 0 ? `${whole}.${trimmed}` : whole;
}

function compareDecimal(left: string, right: string): number {
  const [leftWhole, leftFraction = ""] = left.split(".");
  const [rightWhole, rightFraction = ""] = right.split(".");
  const scale = Math.max(leftFraction.length, rightFraction.length);
  const leftValue = BigInt(leftWhole + leftFraction.padEnd(scale, "0"));
  const rightValue = BigInt(rightWhole + rightFraction.padEnd(scale, "0"));
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
}

@Injectable()
export class CanaryService {
  constructor(
    @Inject(CanaryRepository) private readonly repository: CanaryRepository,
    @Inject(ProfileReadService) private readonly profileReads: ProfileReadService,
  ) {}

  async detail(user: PortalUser, session: AuthSession, workspaceId: string, deploymentId: string) {
    const envelope = await this.repository.latestByDeployment(workspaceId, deploymentId);
    const [lineage, currentSource] = await Promise.all([
      this.repository.lineageFor(envelope),
      this.profileReads.snapshot(
        { user, session, workspaceId },
        "canary",
        "EXECUTION_CANARY_CONTROL_ROOM_SCREEN",
        deploymentId,
      ),
    ]);
    return this.publicDetail(user, envelope, lineage, false, currentSource);
  }

  async create(user: PortalUser, input: CanaryEnvelopeCreateRequest, requestId: string) {
    this.assertAdmin(user);
    if (compareDecimal(input.limits.daily_loss_cap, input.limits.capital_cap) > 0) {
      throw new GovernanceError(
        "CANARY_DAILY_LOSS_CAP_EXCEEDS_CAPITAL",
        "Daily loss cap cannot exceed capital cap.",
        400,
      );
    }
    const result = await this.repository.create({
      envelopeId: newUlid("cenv"),
      workspaceId: input.workspace_id,
      actorUserId: user.userId,
      requestKey: input.request_key,
      requestDigest: digest(input),
      requestId,
      auditEventId: newUlid("aud"),
      deploymentId: input.deployment_id,
      certificationId: input.certification_id,
      promotionPlanId: input.promotion_plan_id,
      expectedCertificationVersion: input.expected_certification_workflow_version,
      expectedEvidenceSetHash: input.expected_evidence_set_hash,
      expectedLatestEnvelopeId: input.expected_latest_envelope_id,
      baseRiskProfileRevision: input.base_risk_profile_revision,
      currency: input.currency,
      capitalCap: input.limits.capital_cap,
      grossNotionalCap: input.limits.gross_notional_cap,
      dailyLossCap: input.limits.daily_loss_cap,
      maxOpenOrders: input.limits.max_open_orders,
      durationDays: input.limits.duration_days,
      reason: input.reason,
    }, (lineage) => this.authorizeDraft(input, lineage));
    return this.publicDetail(user, result.envelope, result.lineage, result.replayed);
  }

  private authorizeDraft(input: CanaryEnvelopeCreateRequest, lineage: CanaryLineage): void {
    const record = lineage.certification.certification;
    if (record.deployment_id !== input.deployment_id) {
      throw new GovernanceError("CANARY_DEPLOYMENT_LINEAGE_MISMATCH", "Deployment lineage mismatch.", 409);
    }
    if (
      record.workflow_state !== "APPROVED" ||
      record.workflow_version !== input.expected_certification_workflow_version
    ) {
      throw new GovernanceError("CANARY_CERTIFICATION_NOT_APPROVED", "Certification is not approved/current.", 409);
    }
    const evaluation = evaluateSandboxCertification(lineage.certification);
    if (
      input.expected_evidence_set_hash !== evaluation.evidenceSetHash ||
      record.decided_evidence_set_hash !== evaluation.evidenceSetHash ||
      !evaluation.eligible
    ) {
      throw new GovernanceError(
        "CANARY_CERTIFICATION_EVIDENCE_STALE",
        "Certification evidence is stale or ineligible.",
        409,
        { blockers: evaluation.blockerCodes, evidence_set_hash: evaluation.evidenceSetHash },
      );
    }
    const plan = lineage.promotionPlan;
    if (
      plan.plan_id !== input.promotion_plan_id ||
      plan.target_stage !== "CANARY" ||
      plan.status !== "BLOCKED" ||
      plan.evidence_set_hash !== evaluation.evidenceSetHash
    ) {
      throw new GovernanceError("CANARY_PROMOTION_PLAN_INVALID", "Promotion plan lineage is invalid.", 409);
    }
  }

  private publicDetail(
    user: PortalUser,
    envelope: CanaryEnvelopeRow,
    lineage: CanaryLineage,
    replayed: boolean,
    currentSource?: Record<string, unknown>,
  ) {
    const certification = lineage.certification.certification;
    const readAt = new Date().toISOString();
    const source = new ProfileScreenSource(currentSource ?? {}, readAt);
    const sourceConnected = source.connected;
    const unavailablePanel = (panelId: string, authority: "EXECUTION" | "BROKER" | "DERIVED") => ({
      panel_id: panelId,
      source_authority: authority,
      panel_state: "unavailable",
      freshness_state: "UNKNOWN",
      delivery_profile: envelope.delivery_profile,
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
      warnings: [{ code: `CANARY_${panelId.toUpperCase()}_UNAVAILABLE` }],
    });
    const unavailableCollection = (panelId: string, authority: "EXECUTION" | "BROKER") => ({
      envelope: unavailablePanel(panelId, authority),
      exact_total: null,
      returned_count: 0,
      rows: [],
    });
    const unavailableKpi = (key: string, label: string, authority: "EXECUTION" | "BROKER" | "DERIVED") => ({
      key,
      label,
      value: null,
      unit: envelope.currency,
      envelope: unavailablePanel(`kpi-${key}`, authority),
    });
    const positions = source.rows("positions");
    const orders = source.rows("orders");
    const fills = source.rows("fills");
    const sessions = source.rows("sessions");
    const balances = source.rows("account_balances");
    const margins = source.rows("margin_balances");
    const accountSync = source.rows("account_sync");
    const brokerSync = source.rows("broker_sync");
    const reconciliation = source.rows("reconciliation");
    const open = openOrders(orders);
    const capitalConsumed = decimalSum(margins, ["initial"]);
    const grossNotional = decimalAbsoluteSum(positions, "notional");
    const dailyPnl = decimalSum(positions, ["realized_pnl", "unrealized_pnl"]);
    const broker = latest(brokerSync, "synced_at");
    const brokerEquity = typeof broker?.buying_power === "string" ? broker.buying_power : null;
    const valueKpi = (
      key: string,
      label: string,
      authority: "EXECUTION" | "BROKER" | "DERIVED",
      value: string | null,
      keys: readonly string[],
      unit = envelope.currency,
    ) => ({ key, label, value, unit, envelope: source.panel(`kpi-${key}`, authority, keys, value === null ? {} : { value }) });
    const sourcePositions = source.collection("positions", "EXECUTION", "positions");
    const sourceBlotter = source.collection("blotter", "EXECUTION", "orders");
    const internalData = { positions, orders, fills, sessions, account_balances: balances, margin_balances: margins, account_sync: accountSync };
    const brokerData = { broker_sync: brokerSync };
    const differenceData = { reconciliation };
    const consumed = sourceConnected ? {
      capital: capitalConsumed,
      gross_notional: grossNotional,
      daily_pnl: dailyPnl,
      open_orders: open.length,
    } : null;
    const headroom = sourceConnected ? {
      capital: capitalConsumed === null ? null : decimalSubtract(decimal(envelope.capital_cap), capitalConsumed),
      gross_notional: grossNotional === null ? null : decimalSubtract(decimal(envelope.gross_notional_cap), grossNotional),
      daily_loss: dailyPnl === null ? null : decimalSubtract(decimal(envelope.daily_loss_cap), dailyPnl.startsWith("-") ? dailyPnl.slice(1) : "0"),
      open_orders: envelope.max_open_orders - open.length,
    } : null;
    return {
      schema_version: "execution.canary-control-room.v1",
      record_authority: "PORTAL",
      delivery_profile: sourceConnected ? "LIVE_BINANCE_USDM" : envelope.delivery_profile,
      source_integration_state: sourceConnected ? "SOURCE_BACKED" : envelope.source_integration_state,
      source_side_effect_requested: false,
      runtime_activation_requested: false,
      promotion_execution_requested: false,
      production_command_active: false,
      replayed,
      read_at: readAt,
      actor: { user_id: user.userId, username: user.username, roles: [user.role] },
      ...(currentSource ? { current_source: browserSafeProfileRead(currentSource) } : {}),
      deployment: {
        deployment_id: envelope.deployment_id,
        portfolio_id: certification.portfolio_id,
        account_id: certification.account_id,
        external_account_ref: certification.external_account_ref,
        venue: certification.venue,
        declared_environment: "LIVE_CANARY",
        runtime_state: null,
      },
      lineage: [
        { kind: "ARTIFACT", value: certification.artifact_digest, href: null },
        { kind: "R1_APPROVAL", value: certification.r1_approval_id, href: `/governance/approvals/${certification.r1_approval_id}/r1` },
        { kind: "R2_APPROVAL", value: certification.r2_approval_id, href: `/governance/approvals/${certification.r2_approval_id}/r2` },
        { kind: "SANDBOX_EXIT", value: certification.certification_id, href: `/deployments/sandbox/${envelope.deployment_id}` },
        { kind: "CANARY_PROMOTION_PLAN", value: lineage.promotionPlan.plan_id, href: null },
      ],
      envelope: {
        envelope_id: envelope.envelope_id,
        revision: envelope.revision,
        previous_envelope_id: envelope.previous_envelope_id,
        status: envelope.status,
        base_risk_profile_revision: envelope.base_risk_profile_revision,
        currency: envelope.currency,
        limits: {
          capital_cap: decimal(envelope.capital_cap),
          gross_notional_cap: decimal(envelope.gross_notional_cap),
          daily_loss_cap: decimal(envelope.daily_loss_cap),
          max_open_orders: envelope.max_open_orders,
          duration_days: envelope.duration_days,
        },
        evidence_set_hash: envelope.evidence_set_hash,
        blocker_codes: envelope.blocker_codes,
        created_by_user_id: envelope.actor_user_id,
        reason: envelope.reason,
        created_at: envelope.created_at.toISOString(),
      },
      lifecycle: {
        declared_stage: "LIVE_CANARY",
        runtime_state: null,
        day_index: null,
        duration_days: envelope.duration_days,
        blocker_codes: envelope.blocker_codes,
      },
      kpis: [
        ...(sourceConnected ? [
          valueKpi("capital_consumed", "Capital consumed", "EXECUTION", capitalConsumed, ["margin_balances"]),
          valueKpi("gross_notional", "Gross notional", "EXECUTION", grossNotional, ["positions"]),
          valueKpi("daily_pnl", "Daily P&L", "DERIVED", dailyPnl, ["positions"]),
          valueKpi("open_orders", "Open orders", "EXECUTION", String(open.length), ["orders"], "COUNT"),
          valueKpi("broker_equity", "Broker equity", "BROKER", brokerEquity, ["broker_sync"]),
        ] : [
          unavailableKpi("capital_consumed", "Capital consumed", "EXECUTION"),
          unavailableKpi("gross_notional", "Gross notional", "EXECUTION"),
          unavailableKpi("daily_pnl", "Daily P&L", "DERIVED"),
          unavailableKpi("open_orders", "Open orders", "EXECUTION"),
          unavailableKpi("broker_equity", "Broker equity", "BROKER"),
        ]),
      ],
      envelope_compliance: {
        envelope: sourceConnected
          ? source.panel("envelope-compliance", "DERIVED", ["positions", "orders", "margin_balances"], { consumed, headroom })
          : unavailablePanel("envelope-compliance", "DERIVED"),
        limits: {
          capital_cap: decimal(envelope.capital_cap),
          gross_notional_cap: decimal(envelope.gross_notional_cap),
          daily_loss_cap: decimal(envelope.daily_loss_cap),
          max_open_orders: envelope.max_open_orders,
        },
        consumed,
        headroom,
        base_risk_profile_verified: false,
      },
      source_panels: [
        ...(sourceConnected ? [
          source.panel("internal", "EXECUTION", ["positions", "orders", "fills", "sessions", "account_balances", "margin_balances", "account_sync"], internalData),
          source.panel("broker", "BROKER", ["broker_sync"], brokerData),
          source.panel("difference", "DERIVED", ["reconciliation"], differenceData),
        ] : [
          unavailablePanel("internal", "EXECUTION"),
          unavailablePanel("broker", "BROKER"),
          unavailablePanel("difference", "DERIVED"),
        ]),
      ],
      positions: sourceConnected ? sourcePositions : unavailableCollection("positions", "EXECUTION"),
      blotter: sourceConnected ? sourceBlotter : unavailableCollection("blotter", "EXECUTION"),
      series: {
        envelope: unavailablePanel("series", "DERIVED"),
        resolution: null,
        points: [],
      },
      rollback_readiness: {
        envelope: unavailablePanel("rollback-readiness", "EXECUTION"),
        ready: false,
        evidence_hash: null,
        blocker_codes: ["ROLLBACK_EVIDENCE_UNAVAILABLE"],
      },
      command_policy: {
        production_command_active: false,
        guard_semantics: "BROKER_STALE_BLOCKS_SCALE_ONLY",
        protective: {
          risk_tier: "R3_LIVE_PROTECTIVE",
          visible: false,
          enabled: false,
          broker_sync_blocks: false,
          blocker_codes: ["PRODUCTION_COMMAND_INACTIVE", "PROTECTIVE_CAPABILITY_UNAVAILABLE"],
        },
        scale_up: {
          risk_tier: "R4_LIVE_RISK_INCREASING",
          visible: false,
          enabled: false,
          broker_sync_blocks: true,
          blocker_codes: [
            "PRODUCTION_COMMAND_INACTIVE",
            "CANARY_OWNER_GATE_REQUIRED",
            ...(broker ? [] : ["BROKER_SYNC_UNAVAILABLE"]),
            ...(sourceConnected ? [] : ["LIVE_SOURCE_UNAVAILABLE"]),
          ],
        },
      },
    };
  }

  private assertAdmin(user: PortalUser): void {
    if (user.role !== "ADMIN") throw new GovernanceError("ADMIN_ROLE_REQUIRED", "Access denied.", 403);
  }
}
