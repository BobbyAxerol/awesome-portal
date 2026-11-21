import { FollowingParentReads } from "../governance/following-parent.service";
import { createHash } from "crypto";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { ExecutionReadScopes, ExecutionReadScopeError } from "../execution-v2/read-scope";
import { AuthSession, PortalUser } from "../domain";
import { GovernanceError } from "../governance/governance.service";
import { newUlid } from "../id";
import { ProfileReadService } from "../profile-read/profile-read.service";
import { browserSafeProfileRead } from "../execution/browser-safe-profile-read";
import { deploymentIdentityOf, identityFields } from "../execution/deployment-identity";
import {
  decimalSubtract,
  latest,
  ProfileScreenSource,
} from "../execution/profile-screen-composer";
import { evaluateSandboxCertification } from "../sandbox/sandbox-certification.service";
import { CanaryEnvelopeCreateRequest } from "./contracts";
import { CanaryEnvelopeRow, CanaryLineage, CanaryRepository } from "./canary.repository";
import { profileStageFacts } from "../execution/stage-facts-profile";
import { gapRanges, sourceFigures, typedOrders, typedPositions } from "../execution/stage-rows";
import { complianceRows, rollbackItems, trialSchedule } from "../execution/canary-envelope-facts";
import { OwnerAccessService } from "../auth/owner-access.service";
import { attachFollowingIdentity, parseFollowingInclude } from "../governance/following-parent.identity";
import {
  GOVERNANCE_DENIAL_MESSAGE,
  governanceDenial,
} from "../auth/governance-access";

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
    @Inject(OwnerAccessService) private readonly ownerAccess: OwnerAccessService,
    @Optional() @Inject(ExecutionReadScopes) private readonly readScopes?: ExecutionReadScopes,
    @Optional() @Inject(FollowingParentReads) private readonly followingParents?: FollowingParentReads,
  ) {}

  /**
   * A4-3 · the Canary gate, decided from a capability rather than from a role.
   *
   * `role === "ADMIN"` said "every administrator may set canary limits on every
   * deployment". §20.2 rule 3 and the §20.3 namespace say something narrower:
   * the owner may, and anybody the owner has explicitly granted
   * `governance.canary.*` may, in the workspaces that grant reaches. The role
   * is untouched and still means what it meant — it simply no longer decides
   * this.
   */
  private async assertGovernance(
    user: PortalUser,
    mode: "read" | "decide",
    workspaceId: string | null,
  ): Promise<void> {
    const access = await this.ownerAccess.effectiveAccess(user.userId);
    const denial = governanceDenial({ access, gate: "canary", mode, workspaceId });
    if (denial) {
      throw new GovernanceError(denial, GOVERNANCE_DENIAL_MESSAGE[denial], 403);
    }
  }

  async detail(user: PortalUser, session: AuthSession, workspaceId: string, deploymentId: string, viewerWorkspaceId?: string,
    include?: unknown) {
    const principal = { user, session, workspaceId, viewerWorkspaceId };
    if(this.followingParents&&await this.followingParents.mode(principal)==="SCOPED_V2"){
      // BE-P12: opt-in only; the legacy body below already carries the identity.
      const wanted=parseFollowingInclude(include);
      const parent=await this.followingParents.detail(principal,"CANARY",deploymentId);
      return wanted.has("identity")?attachFollowingIdentity(parent,
        await this.profileReads.deploymentIdentity(principal,"canary",deploymentId)):parent;
    }
    await this.assertGovernance(user, "read", workspaceId);
    if (this.readScopes && await this.readScopes.coreSelectionMode(principal) === "SCOPED_V2")
      throw new GovernanceError("CANARY_SCOPED_PARENT_NOT_COMMISSIONED", "Canary parent evidence field authority is not commissioned.", 503);
    const envelope = await this.repository.latestByDeployment(workspaceId, deploymentId);
    const [lineage, currentSource] = await Promise.all([
      this.repository.lineageFor(envelope),
      this.profileReads.snapshot(
        principal,
        "canary",
        "EXECUTION_CANARY_CONTROL_ROOM_SCREEN",
        deploymentId,
      ),
    ]);
    const result = this.publicDetail(user, envelope, lineage, false, currentSource);
    await this.assertGovernance(user, "read", workspaceId);
    if (this.readScopes && await this.readScopes.coreSelectionMode(principal) !== "LEGACY_COMPATIBILITY")
      throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
    return result;
  }

  async create(user: PortalUser, input: CanaryEnvelopeCreateRequest, requestId: string) {
    await this.assertGovernance(user, "decide", input.workspace_id);
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
    const unavailablePanel = (panelId: string, authority: "EXECUTION" | "BROKER" | "DERIVED", reason?: string) => ({
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
      warnings: [{ code: reason ?? `CANARY_${panelId.toUpperCase()}_UNAVAILABLE` }],
    });
    const unavailableCollection = (panelId: string, authority: "EXECUTION" | "BROKER") => ({
      envelope: unavailablePanel(panelId, authority),
      exact_total: null,
      returned_count: 0,
      rows: [],
    });
    const unavailableKpi = (key: string, label: string, authority: "EXECUTION" | "BROKER" | "DERIVED", unit = envelope.currency, reason?: string) => ({
      key,
      label,
      value: null,
      unit,
      envelope: unavailablePanel(`kpi-${key}`, authority, reason),
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
    const broker = latest(brokerSync, "synced_at");
    // Buying power is not broker equity. Nor do position P&L fields establish
    // a daily window or a common currency. Do not publish either as a KPI.
    const dailyPnl = null;
    const brokerEquity = null;
    const valueKpi = (
      key: string,
      label: string,
      authority: "EXECUTION" | "BROKER" | "DERIVED",
      value: string | null,
      keys: readonly string[],
      unit = envelope.currency,
      reason?: string,
    ) => value === null ? unavailableKpi(key, label, authority, unit, reason)
      : ({ key, label, value, unit, envelope: source.panel(`kpi-${key}`, authority, keys, { value }) });
    const sourcePositions = source.collection("positions", "EXECUTION", "positions");
    const sourceBlotter = source.collection("blotter", "EXECUTION", "orders");
    const internalData = { positions, orders, fills, sessions, account_balances: balances, margin_balances: margins, account_sync: accountSync };
    const brokerData = { broker_sync: brokerSync };
    const differenceData = { reconciliation };
    const compliance = complianceRows({
      currency: envelope.currency,
      capital_cap: envelope.capital_cap,
      gross_notional_cap: envelope.gross_notional_cap,
      daily_loss_cap: envelope.daily_loss_cap,
      max_open_orders: envelope.max_open_orders,
      duration_days: envelope.duration_days,
    }, source);
    // The legacy summary and headroom must not bypass the qualified facts
    // used by the newer compliance rows. A partial/mixed-currency relation
    // must never look like a complete monetary total or zero.
    const fact = (cap: (typeof compliance.rows)[number]["cap"]) => compliance.rows.find(row => row.cap === cap)!.consumed;
    const capital = fact("capital"), gross = fact("gross_notional"), orderCount = fact("open_orders");
    const capitalConsumed = capital.value, grossNotional = gross.value;
    const openCount = orderCount.value === null ? null : Number(orderCount.value);
    const consumed = sourceConnected ? {
      capital: capitalConsumed,
      gross_notional: grossNotional,
      daily_pnl: dailyPnl,
      open_orders: openCount,
    } : null;
    const headroom = sourceConnected ? {
      capital: capitalConsumed === null ? null : decimalSubtract(decimal(envelope.capital_cap), capitalConsumed),
      gross_notional: grossNotional === null ? null : decimalSubtract(decimal(envelope.gross_notional_cap), grossNotional),
      daily_loss: null,
      open_orders: openCount === null ? null : envelope.max_open_orders - openCount,
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
        ...identityFields(deploymentIdentityOf(currentSource)),
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
        // FE-071: trial start and exit-review date, only from a source-stated activation; additive.
        trial: trialSchedule(source.rows("deployments")[0]?.activated_at, envelope.duration_days),
      },
      // FE-067: runtime / reconciliation / sessions as typed facts. Additive; the pinned-null
      // `runtime_state` above stays, the real value (when the source publishes one) is here.
      stage_facts: profileStageFacts(source, "LIVE_SOURCE_UNAVAILABLE"),
      // FE-072: Internal / Broker / Difference figures; every cell typed, broker side unpublished.
      source_figures: sourceFigures(source, "LIVE_SOURCE_UNAVAILABLE"),
      kpis: [
        ...(sourceConnected ? [
          valueKpi("capital_consumed", "Capital consumed", "EXECUTION", capitalConsumed, ["margin_balances"], envelope.currency, capital.reason_code ?? undefined),
          valueKpi("gross_notional", "Gross notional", "EXECUTION", grossNotional, ["positions"], envelope.currency, gross.reason_code ?? undefined),
          valueKpi("daily_pnl", "Daily P&L", "DERIVED", dailyPnl, ["positions"], envelope.currency, "DAILY_PNL_WINDOW_NOT_PUBLISHED"),
          valueKpi("open_orders", "Open orders", "EXECUTION", orderCount.value, ["orders"], "COUNT", orderCount.reason_code ?? undefined),
          valueKpi("broker_equity", "Broker equity", "BROKER", brokerEquity, ["broker_sync"], envelope.currency, "BROKER_EQUITY_NOT_PUBLISHED"),
        ] : [
          unavailableKpi("capital_consumed", "Capital consumed", "EXECUTION"),
          unavailableKpi("gross_notional", "Gross notional", "EXECUTION"),
          unavailableKpi("daily_pnl", "Daily P&L", "DERIVED"),
          unavailableKpi("open_orders", "Open orders", "EXECUTION", "COUNT"),
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
        // FE-071: one row per cap with the server's own ratio and a server verdict; additive.
        rows: compliance.rows,
        verdict: compliance.verdict,
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
      // FE-072: `typed` is the same relation as the free rows, typed; leverage / ack latency named as unpublished columns.
      positions: { ...(sourceConnected ? sourcePositions : unavailableCollection("positions", "EXECUTION")), typed: typedPositions(source, "LIVE_SOURCE_UNAVAILABLE") },
      blotter: { ...(sourceConnected ? sourceBlotter : unavailableCollection("blotter", "EXECUTION")), typed: typedOrders(source, "LIVE_SOURCE_UNAVAILABLE") },
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
        // FE-071: the four readiness checks with the date each was last checked; additive.
        items: rollbackItems(source),
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

}
