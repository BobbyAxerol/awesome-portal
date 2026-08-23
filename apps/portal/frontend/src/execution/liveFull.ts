/**
 * Phase 12 — Live Full Operations (EX-BE-05b/F4).
 *
 * The highest-consequence screen in the cluster, and the only one whose reader
 * actively DESTROYS data rather than merely declining to render it.
 *
 * SUPPRESSED IS NOT UNAVAILABLE
 *
 * The broker panel arrives as `panel_state: "suppressed"`, which is a different
 * claim from `unavailable`: unavailable means the Portal has nothing, suppressed
 * means it has something and policy forbids showing it. Collapsing the two would
 * be safe on screen and wrong in the audit — an operator asking "why can't I see
 * broker equity" deserves "because a mismatch suppresses every broker-derived
 * value", not "because it is missing".
 *
 * WHY THE READER STRIPS RATHER THAN THE SCREEN
 *
 * The handoff requires that injected broker data be *rejected*, not hidden. A
 * screen that simply omits a field still holds it: it reaches the DOM through a
 * later edit, a debug panel, a serialised prop, an error message. So when
 * `broker_values_visible` is false, `readLiveFullOperations` returns `null` for
 * every broker-derived figure and records that it did. The value never enters
 * the component tree at all.
 *
 * `guard_semantics` here is
 * `BROKER_MISMATCH_SUPPRESSES_VALUES_AND_SOURCE_GAP_BLOCKS_R4`, two rules in one
 * token, and both are read from structured fields rather than from that string.
 */
import type { Authority, PanelStatus } from "./contracts";
import { readPanelEnvelope, type LineageItem, type PanelEnvelope } from "./certification";

function obj(raw: unknown): Record<string, unknown> | null {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}
function str(raw: unknown): string | null {
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}
function int(raw: unknown): number | null {
  return typeof raw === "number" && Number.isInteger(raw) ? raw : null;
}
function codes(raw: unknown): readonly string[] {
  return Array.isArray(raw) ? raw.filter((c): c is string => typeof c === "string") : [];
}

/**
 * A panel the Portal holds but refuses to show.
 *
 * Carried alongside `PanelStatus` rather than added to it, because the nine
 * states are a rendering vocabulary shared by seventeen screens and this is a
 * policy outcome specific to broker suppression.
 */
export interface LivePanel {
  envelope: PanelEnvelope;
  /** True when the server marked this panel `suppressed`. */
  suppressed: boolean;
  warningCodes: readonly string[];
}

function readLivePanel(raw: unknown, fallbackId = ""): LivePanel {
  const o = obj(raw) ?? {};
  const envelope = readPanelEnvelope(o, fallbackId);
  return {
    envelope,
    // Read from the shared envelope rather than re-derived here: two places
    // deciding the same thing is two places to get it wrong.
    suppressed: envelope.suppressed,
    warningCodes: (Array.isArray(o.warnings) ? o.warnings : []).flatMap((w) => {
      const code = str(obj(w)?.code);
      return code ? [code] : [];
    }),
  };
}

export interface LiveKpi {
  key: string;
  label: string;
  /** `null` when unavailable OR when broker suppression applies to it. */
  value: string | null;
  unit: string | null;
  authority: Authority | null;
  panelState: PanelStatus;
  /** True when this KPI's value was withheld by broker suppression. */
  suppressed: boolean;
}

export interface BrokerConsistency {
  state: string | null;
  /** `SUPPRESS_ALL_BROKER_VALUES`. Read, not assumed. */
  mismatchBehavior: string | null;
  /** The switch. `false` means no broker figure may reach the screen. */
  brokerValuesVisible: boolean;
  findingHref: string | null;
  dryRunReconcileHref: string | null;
  blockerCodes: readonly string[];
}

export interface ProjectionContinuity {
  state: string | null;
  epoch: string | null;
  sequence: number | null;
  /** `null` means the server could not tell — not that there is no gap. */
  gapDetected: boolean | null;
  affectedAuthorities: readonly string[];
  blockerCodes: readonly string[];
}

export interface LiveActionPolicy {
  riskTier: string | null;
  visible: boolean;
  enabled: boolean;
  /** A projection gap blocks R4 and not R3. Read per group. */
  sourceGapBlocks: boolean;
  blockerCodes: readonly string[];
}

export interface LiveCommandPolicy {
  productionCommandActive: boolean;
  guardSemantics: string | null;
  protective: LiveActionPolicy | null;
  riskIncreasing: LiveActionPolicy | null;
}

export interface PredecessorEnvelope {
  envelopeId: string | null;
  revision: number | null;
  status: string | null;
  currency: string | null;
  capitalCap: string | null;
  grossNotionalCap: string | null;
  dailyLossCap: string | null;
  /** `false`: the canary envelope does not govern Live Full. */
  activeForLiveFull: boolean;
}

export interface LiveFullOperations {
  deploymentId: string | null;
  portfolioId: string | null;
  accountId: string | null;
  venue: string | null;
  declaredStage: string | null;
  /** `null`, and never HALTED. */
  runtimeState: string | null;
  activatedAt: string | null;
  lifecycleBlockers: readonly string[];
  deliveryProfile: string | null;
  sourceIntegrationState: string | null;
  productionCommandActive: boolean;
  realtimeActive: boolean;
  sourceSideEffectRequested: boolean;
  runtimeActivationRequested: boolean;
  promotionExecutionRequested: boolean;
  actorRoles: readonly string[];
  lineage: readonly LineageItem[];
  predecessorEnvelope: PredecessorEnvelope | null;
  kpis: readonly LiveKpi[];
  panels: Readonly<Record<string, LivePanel>>;
  brokerConsistency: BrokerConsistency | null;
  projectionContinuity: ProjectionContinuity | null;
  realtimeStreamUrl: string | null;
  realtimeBlockers: readonly string[];
  commandPolicy: LiveCommandPolicy | null;
  /**
   * Broker figures the reader refused to carry.
   *
   * Reported so the screen can say suppression happened rather than leaving a
   * gap the reader silently made. Counts only; the values themselves are gone.
   */
  suppressedBrokerFields: readonly string[];
}

/** Which authorities are broker-derived, and therefore suppressible. */
function isBrokerDerived(authority: Authority | null): boolean {
  return authority === "BROKER";
}

function actionPolicy(raw: unknown): LiveActionPolicy | null {
  const o = obj(raw);
  if (!o) return null;
  return {
    riskTier: str(o.risk_tier),
    // Deny-by-default: an unreadable flag never reveals a control.
    visible: o.visible === true,
    enabled: o.enabled === true,
    // Fail-closed the other way: an unreadable "does a source gap block this"
    // blocks, because permitting a risk-increasing command on evidence nobody
    // can vouch for is the expensive error.
    sourceGapBlocks: o.source_gap_blocks !== false,
    blockerCodes: codes(o.blocker_codes),
  };
}

export function readLiveFullOperations(raw: unknown): LiveFullOperations | null {
  const root = obj(raw);
  const dep = obj(root?.deployment);
  if (!root || !dep) return null;
  const life = obj(root.lifecycle);
  const consistency = obj(root.broker_consistency);
  const continuity = obj(root.projection_continuity);
  const realtime = obj(root.realtime);
  const policy = obj(root.command_policy);
  const actor = obj(root.actor);
  const pred = obj(root.predecessor_canary_envelope);
  const predLimits = obj(pred?.limits);

  // The switch, read once. Absent is NOT permission to show broker figures.
  const brokerValuesVisible = consistency?.broker_values_visible === true;
  const suppressed: string[] = [];

  const panelsRaw = obj(root.source_panels) ?? {};
  const panels: Record<string, LivePanel> = {};
  for (const [key, value] of Object.entries(panelsRaw)) {
    panels[key] = readLivePanel(value, key);
  }

  return {
    deploymentId: str(dep.deployment_id),
    portfolioId: str(dep.portfolio_id),
    accountId: str(dep.account_id),
    venue: str(dep.venue),
    declaredStage: str(life?.declared_stage) ?? str(dep.declared_environment),
    runtimeState: str(life?.runtime_state),
    activatedAt: str(life?.activated_at),
    lifecycleBlockers: codes(life?.blocker_codes),
    deliveryProfile: str(root.delivery_profile),
    sourceIntegrationState: str(root.source_integration_state),
    productionCommandActive: root.production_command_active === true,
    realtimeActive: root.realtime_active === true,
    sourceSideEffectRequested: root.source_side_effect_requested !== false,
    runtimeActivationRequested: root.runtime_activation_requested !== false,
    promotionExecutionRequested: root.promotion_execution_requested !== false,
    actorRoles: Array.isArray(actor?.roles)
      ? actor.roles.filter((r): r is string => typeof r === "string")
      : [],
    lineage: (Array.isArray(root.lineage) ? root.lineage : []).flatMap((entry) => {
      const o = obj(entry);
      const kind = str(o?.kind);
      const value = str(o?.value);
      return kind && value
        ? [{ kind, value, href: str(o!.href), authority: null as Authority | null }]
        : [];
    }),
    predecessorEnvelope: pred
      ? {
          envelopeId: str(pred.envelope_id),
          revision: int(pred.revision),
          status: str(pred.status),
          currency: str(pred.currency),
          capitalCap: str(predLimits?.capital_cap),
          grossNotionalCap: str(predLimits?.gross_notional_cap),
          dailyLossCap: str(predLimits?.daily_loss_cap),
          // Deny-by-default: the canary envelope does not govern Live Full
          // unless the server says it does.
          activeForLiveFull: pred.active_for_live_full === true,
        }
      : null,
    kpis: (Array.isArray(root.kpis) ? root.kpis : []).flatMap((k) => {
      const o = obj(k);
      const key = str(o?.key);
      if (!key) return [];
      const envelope = readPanelEnvelope(o!.envelope, `kpi-${key}`);
      const broker = isBrokerDerived(envelope.authority);
      const rawValue = str(o!.value);
      // THE STRIP. A broker figure never becomes a prop while suppression is on
      // — it is dropped here, where no later edit can put it back on screen.
      const withheld = broker && !brokerValuesVisible && rawValue !== null;
      if (withheld) suppressed.push(`kpi:${key}`);
      return [
        {
          key,
          label: str(o!.label) ?? key,
          value: broker && !brokerValuesVisible ? null : rawValue,
          unit: str(o!.unit),
          authority: envelope.authority,
          panelState: envelope.panelState,
          suppressed: broker && !brokerValuesVisible,
        },
      ];
    }),
    panels,
    brokerConsistency: consistency
      ? {
          state: str(consistency.state),
          mismatchBehavior: str(consistency.mismatch_behavior),
          brokerValuesVisible,
          findingHref: str(consistency.finding_href),
          dryRunReconcileHref: str(consistency.dry_run_reconcile_href),
          blockerCodes: codes(consistency.blocker_codes),
        }
      : null,
    projectionContinuity: continuity
      ? {
          state: str(continuity.state),
          epoch: str(continuity.epoch),
          sequence: int(continuity.sequence),
          // `null` stays null: "we could not tell" is not "there is no gap".
          gapDetected: typeof continuity.gap_detected === "boolean" ? continuity.gap_detected : null,
          affectedAuthorities: codes(continuity.affected_authorities),
          blockerCodes: codes(continuity.blocker_codes),
        }
      : null,
    realtimeStreamUrl: str(realtime?.stream_url),
    realtimeBlockers: codes(realtime?.blocker_codes),
    commandPolicy: policy
      ? {
          productionCommandActive: policy.production_command_active === true,
          guardSemantics: str(policy.guard_semantics),
          protective: actionPolicy(policy.protective),
          riskIncreasing: actionPolicy(policy.risk_increasing),
        }
      : null,
    suppressedBrokerFields: suppressed,
  };
}

/**
 * The two rules inside `BROKER_MISMATCH_SUPPRESSES_VALUES_AND_SOURCE_GAP_BLOCKS_R4`,
 * separated so each can be stated and tested on its own.
 *
 * Derived from structured fields, not from the token: the token is a summary
 * and the fields are what the server enforces.
 */
export function liveGuardRules(live: LiveFullOperations): {
  suppression: string;
  gapRule: string;
  r4Blocked: boolean;
} {
  const consistency = live.brokerConsistency;
  const r4 = live.commandPolicy?.riskIncreasing;
  const r3 = live.commandPolicy?.protective;
  const gap = live.projectionContinuity?.gapDetected;

  const suppression = !consistency
    ? "No broker consistency verdict was published, so no broker figure is shown."
    : consistency.brokerValuesVisible
      ? "Broker figures are shown; the source is consistent."
      : `Every broker-derived value is suppressed (${consistency.mismatchBehavior ?? "reason not stated"}). This is a policy decision, not a missing reading.`;

  const gapRule =
    r4?.sourceGapBlocks && r3 && !r3.sourceGapBlocks
      ? "A projection gap blocks risk-increasing actions and does not block protective ones."
      : r4?.sourceGapBlocks
        ? "A projection gap blocks risk-increasing actions."
        : "The gap rule for this deployment was not published in a form this screen can state.";

  return {
    suppression,
    gapRule,
    // `null` continuity counts as blocking: not knowing whether a gap exists is
    // not the same as knowing there is none, and R4 is the one place that
    // difference is worth real money.
    r4Blocked: (r4?.sourceGapBlocks ?? true) && gap !== false,
  };
}
