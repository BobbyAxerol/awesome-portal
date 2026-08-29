/**
 * Execution Loop component fixtures — the Phase 0 exit gate.
 *
 * `IMPLEMENTATION_PHASES.md` Phase 0: "fixture page shows every component in
 * every state". This is that page. It is not a product screen: it renders no
 * live data, sits outside the feature registry, and never appears in
 * navigation.
 *
 * Every identifier on this page comes from `CANONICAL_CAST.md`. Inventing ids
 * here would put a second cast into circulation, which is exactly what that
 * document exists to prevent.
 */
import { useEffect, useState } from "react";

import { ExecutionSurface, type ExecutionSurfaceKind } from "./ExecutionSurface";
import { AuthorityBadge, BrokerSyncChip, CapabilityChip, EnvironmentBadge, FreshnessIndicator, OperationStatusChip, OrderStatusChip, ProfileBadge, RuntimeStateChip, StatusChip, VerificationChip } from "./components/badges";
import { ChartTile } from "./components/chart";
import { CommandPlanDrawer } from "./components/drawer";
import { EquityChart } from "./components/EquityChart";
import { evidenceEquitySeries } from "./equity.fixtures";
import { AnatomyDemo } from "./components/anatomyDemo";
import { AccountBroker360Preview, AlphaThreeSixtyPreview, FullBlotterPreview, PaperWorkbenchPreview, PortfolioThreeSixtyPreview } from "./previewControllers";
import { EvidencePanel, SlaCell } from "./components/evidence";
import { GuardBand, LifecycleRail, ObservationProgress, stageRail } from "./components/lifecycle";
import { VenueIdentity, VenueScope } from "./components/scope";
import { CapNotice, CommissionedPanel, PanelState } from "./components/states";
import { KeysetTable, type Column } from "./components/table";
import { CompletenessNote, SubscriptionBanner } from "./components/stream";
import { RangeTooWideNotice, RetentionNotice } from "./components/retention";
import { ZoomableChart, type ZoomRange } from "./components/zoom";
import { SubscriptionWalk } from "./components/streamDemo";
import { INITIAL_SUBSCRIPTION, type SubscriptionState } from "./subscription";
import { ApprovalInbox, type ApprovalRow, type DecidedRow } from "./screens/ApprovalInbox";
import { GateR1Review } from "./screens/GateR1Review";
import { GateR2Review } from "./screens/GateR2Review";
import { ApprovalInboxContainer, GateR1ReviewContainer, GateR2ReviewContainer, AdminCatalogueContainer, CanaryControlRoomContainer, LiveFullOperationsContainer, SandboxCertificationContainer, IncidentDetailContainer, OperationsQueueContainer, AlphaInsightContainer, CapitalLedgerContainer, CorrelationContainer, ExposureHeadroomContainer, FullBlotterFunnelContainer, PaperExitReviewContainer } from "./screens/containers";
import { createFixtureApi } from "./api/fixtureApi";
import { PaperExitReview } from "./screens/PaperExitReview";
import { OrderFunnelStrip } from "./screens/FullBlotter";
import { AdminActionDrawerScreen } from "./screens/AdminActionDrawer";

/** Every Paper Exit capability granted. Absence is refusal, so cases say so. */
/** Stable across renders: a fresh literal would re-fetch on every one. */
/** Frozen so the age column does not rewrite the visual baseline every run. */
const QUEUE_NOW = new Date("2026-08-23T09:05:00.000Z");

const ALPHA_BATCH_REQUEST = {
  portfolioId: "PF-1",
  items: [{ insightId: "insight-1", alphaId: "alpha-1" }],
} as const;

const EXIT_ELIGIBLE = {
  canApprove: true,
  canApproveWithCondition: true,
  canDeny: true,
  canRequestChanges: true,
  canExtendObservation: true,
  canReject: true,
  separationOfDuties: "OK" as const,
};
import { CommandCenterLive } from "./screens/containers";
import { CC_FIXTURES } from "./commandCenter.fixtures";
import { readCommandCenter } from "./commandCenter";

import { FUNNEL_BOUNDED, FUNNEL_MISSING_BROKER_ACK } from "./analytics.presentation.fixtures";
import { readOrderFunnel } from "./analytics";
import { alpha360AtScale } from "./alpha360.fixtures";
import { CORRELATION_CEILING } from "./portfolio360.fixtures";
import { HEADROOM_EXCEEDED, PARTIAL_EXPOSURE } from "./account360.fixtures";
import { GATE_MET, STALE, paperWorkbench } from "./paper.fixtures";
import { VNM_OPEN } from "./vnm.fixtures";
import { PROFILE_ORDER, profileNeedsLabel, reconcilePanelProfile, screenDeliveryPolicy } from "./profile";
import type { CapabilityState, DeliveryProfile, Envelope, FreshnessState, OperationStatus, OrderStatus, PanelStatus, PromotionStage, VenueCode, VerificationResult } from "./contracts";

/* -------------------------------------------------------------------------
 * Cast (CANONICAL_CAST.md)
 * ---------------------------------------------------------------------- */

const VENUES = [
  { code: "BINANCE" as VenueCode, label: "BINANCE" },
  { code: "OKX" as VenueCode, label: "OKX" },
  { code: "DERIBIT" as VenueCode, label: "DERIBIT" },
  { code: "VN_MARKET" as VenueCode, label: "VN MARKET" },
];

const EXECUTION_ENVELOPE: Envelope = {
  authority: "EXECUTION",
  asOf: "2026-08-21T10:42:01Z",
  sourceSequence: 884_120,
  freshness: "OK",
  ageSeconds: 1.4,
};

const BROKER_ENVELOPE: Envelope = {
  authority: "BROKER",
  asOf: "2026-08-21T10:42:00Z",
  freshness: "OK",
  ageSeconds: 0.9,
  digest: "sha256:41bb9c0e7d2a5f38a1",
};

const DERIVED_ENVELOPE: Envelope = {
  authority: "DERIVED",
  asOf: "2026-08-21T10:40:00Z",
  freshness: "AGING",
  ageSeconds: 121,
  formulaVersion: "diff.v1",
};

const DERIVED_NO_FORMULA: Envelope = {
  authority: "DERIVED",
  asOf: "2026-08-21T10:40:00Z",
  freshness: "OK",
  ageSeconds: 30,
};

const STAGES: PromotionStage[] = [
  "PAPER_OBSERVATION",
  "SANDBOX_VALIDATION",
  "LIVE_CANARY",
  "LIVE_FULL",
];

const FRESHNESS_STATES: FreshnessState[] = ["OK", "AGING", "STALE", "PAUSED", "UNKNOWN"];
// All twelve, not the five the hi-fi filter chips offer: the chips are a
// bucketing (BLOTTER_BUCKET), and every underlying status still has to render.
const ORDER_STATUSES: OrderStatus[] = [
  "INITIALIZED",
  "SUBMITTED",
  "ACCEPTED",
  "REJECTED",
  "DENIED",
  "PENDING_UPDATE",
  "PENDING_CANCEL",
  "PARTIALLY_FILLED",
  "FILLED",
  "CANCELED",
  "EXPIRED",
  "TRIGGERED",
];
const OPERATION_STATUSES: OperationStatus[] = [
  // Published by `execution.command-operation.v1`. This evidence surface is
  // meant to show every state a screen can render, so a status the contract
  // ships and this page omits is a gap in the evidence, not a tidier list.
  "BLOCKED",
  "PLANNED",
  "AWAITING_APPLY",
  "APPLIED_UNVERIFIED",
  "VERIFIED",
  "PARTIAL",
  "FAILED",
];

/** A plan with everything passing, so the only blockers on show are tier ones. */
const FIXTURE_PLAN = {
  id: "cmd_9f12",
  expiresInSeconds: 118,
  requestPreview: '{ "command": "halt", "target": "dep_94" }',
  equivalentCli: "portal exec halt --deployment dep_94",
  checks: [{ label: "Deployment is ACTIVE", outcome: "pass" as const }],
};

/** A hypothetical screen whose live command flags have been granted. */
const LIVE_POLICY = screenDeliveryPolicy({
  delivery_policy: {
    policy_revision: 9,
    live_protective_commands_enabled: true,
    live_risk_increasing_commands_enabled: true,
  },
});

/** What registry revision 4 actually ships today: every flag off. */
const REV4_SHIPPED_POLICY = screenDeliveryPolicy({
  delivery_policy: {
    policy_revision: 1,
    query_enabled: false,
    projection_ingestion_enabled: false,
    sse_enabled: false,
    paper_commands_enabled: false,
    sandbox_commands_enabled: false,
    live_protective_commands_enabled: false,
    live_risk_increasing_commands_enabled: false,
  },
});

/* Phase 1/2 screen fixtures. Cast from CANONICAL_CAST.md; the numbers are the
 * hi-fi's own, so a reviewer can hold the two side by side. */
/* The Approval Inbox hi-fi's five pending rows, which are also the canonical
 * cast's. An earlier fixture invented AP-341 and mis-attributed AP-259, AP-352
 * and AP-311; CANONICAL_CAST.md wins over a screen, and here the screen was
 * already right. */
const INBOX_ROWS: ApprovalRow[] = [
  {
    id: "AP-352",
    gate: "R2",
    subject: "Carry v3.2 → PF-MAIN",
    target: "sandbox · OKX TESTNET",
    blockerCount: 1,
    blockerSummary: "broker sync stale",
    sla: { ageMinutes: 26 * 60, budgetMinutes: 24 * 60 },
    quorumMet: 0,
    quorumRequired: 2,
    inert: null,
    needsYou: true,
  },
  {
    id: "AP-201",
    gate: "R1",
    subject: "RSI v1.7 · RC-41",
    target: "research",
    blockerCount: 0,
    blockerSummary: "none",
    sla: { ageMinutes: 2 * 60, budgetMinutes: 24 * 60 },
    quorumMet: 1,
    quorumRequired: 2,
    inert: null,
    needsYou: true,
  },
  {
    id: "EX-771",
    gate: "PAPER_EXIT",
    subject: "Grid v2.1 · dep_94",
    target: "→ sandbox · DERIBIT",
    blockerCount: 0,
    blockerSummary: "observation gate met",
    sla: { ageMinutes: 4 * 60, budgetMinutes: 48 * 60 },
    quorumMet: 0,
    quorumRequired: 1,
    inert: null,
    needsYou: true,
  },
  {
    id: "AP-360",
    gate: "R1",
    subject: "MeanRev v0.3 · RC-52",
    target: "research",
    blockerCount: 2,
    blockerSummary: "audit replay failed",
    sla: { ageMinutes: 6 * 60, budgetMinutes: 24 * 60 },
    quorumMet: 0,
    quorumRequired: 2,
    inert: "BLOCKED",
    needsYou: false,
  },
  {
    id: "AP-311",
    gate: "LIVE_GATE",
    subject: "Grid v2.1 → BINANCE",
    target: "live · dual approval",
    blockerCount: 0,
    blockerSummary: "none",
    sla: { ageMinutes: 24 * 60, budgetMinutes: 72 * 60 },
    quorumMet: 1,
    quorumRequired: 2,
    // The separation-of-duty row: dimmed, counted, never hidden.
    inert: "SELF",
    needsYou: false,
  },
];

const R1_PASSPORT = [
  { label: "alpha version", value: "av_2041", note: "· supersedes av_1988", verification: "✓ verified" },
  { label: "artifact digest", value: "sha256:9f3c1a…e2", verification: "✓ verified" },
  { label: "entrypoint", value: "rsi_pkg.strategy:RsiAlpha", verification: null },
  { label: "selected params", value: "param_118", note: "· sha256:aa41…9d", verification: "✓ verified" },
  { label: "final audit run", value: "run_5512", note: "/ attempt 2 · replay", verification: "✓ reproduced" },
  { label: "engine", value: "quantbt 1.0.8 · image sha256:77bd…a1", verification: "✓ verified" },
  { label: "datasets", value: "3 snapshots · universe univ_88", verification: "PASS" },
  { label: "methodology claim", value: "clm_31 — WFO 12 folds + 90d holdout", verification: null },
];

/* One instance each, created outside render so a re-render does not restart
 * every request the containers have in flight. */
const WIRED_API = createFixtureApi();
const UNWIRED_API = createFixtureApi({ unavailableEndpoints: ["listApprovals"] });
const UNCERTAIN_API = createFixtureApi({ uncertain: true });

/** Recently decided — the hi-fi/cast trio, in `governance.approval-history.v1` shape. */
const DECIDED_FIXTURE_ROWS: DecidedRow[] = [
  { id: "AP-341", gate: "R1", subject: "Grid v2.2 · RC-49", outcome: "CHANGES_REQUESTED", decidedBy: "Minh", decidedAt: "2026-08-14T09:00:00Z", policyVersion: "approval.v3" },
  { id: "AP-259", gate: "R2", subject: "MM v1.1 → OKX sandbox", outcome: "APPROVED_WITH_CONDITION", decidedBy: "Lan", decidedAt: "2026-07-18T14:30:00Z", policyVersion: "approval.v3" },
  { id: "PX-31", gate: "PAPER_EXIT", subject: "MM v1.1", outcome: "APPROVED", decidedBy: "Lan", decidedAt: "2026-07-15T10:00:00Z", policyVersion: "approval.v3" },
];

/* One instance of each unhappy state, so they can be read side by side. */
/** Ranges spanning three rungs, so the demo shows all three verdicts. */
const ZOOM_RANGES: ZoomRange[] = [
  { label: "1d", seconds: 86_400 },
  { label: "3d", seconds: 3 * 86_400 },
  { label: "10d", seconds: 10 * 86_400 },
  { label: "40d", seconds: 40 * 86_400 },
  { label: "180d", seconds: 180 * 86_400 },
];

/**
 * Drives the real `zoomVerdict`, and re-serves the envelope the way the server
 * would: the interval in the caption is always the one that came back.
 */
function ZoomDemo() {
  const [range, setRange] = useState<ZoomRange>(ZOOM_RANGES[4]);
  const [served, setServed] = useState({ window: "180d", interval: "1h" });

  return (
    <ZoomableChart
      title="Equity"
      envelope={{
        window: served.window,
        interval: served.interval,
        currency: "USDT",
        asOf: "2026-08-21T10:42:01Z",
        authority: "DERIVED",
        formulaVersion: "equity.v3",
        downsampleMethod: served.interval === "1m" ? "none" : "canonical_preaggregated",
      }}
      ranges={ZOOM_RANGES}
      activeRange={range}
      onRangeChange={(next, verdict) => {
        setRange(next);
        // Only a `requery` verdict changes what is served. The other two leave
        // the envelope alone, which is what makes "this zoom changed nothing"
        // visible rather than merely true.
        if (verdict.kind === "requery") {
          setServed({ window: next.label, interval: verdict.to });
        }
      }}
    >
      <div className="exec-fixtures-note" style={{ padding: "12px" }}>
        plot area — ECharts arrives at phase 18 and must keep this caption verbatim
      </div>
    </ZoomableChart>
  );
}

const LIVE_BASE: SubscriptionState = {
  ...INITIAL_SUBSCRIPTION,
  phase: "live",
  epoch: "ep_7f21",
  sequence: 8810,
  resumeToken: "ep_7f21:8810",
  lastGoodAsOf: "2026-08-21T10:42:01Z",
  freshness: "OK",
};

const STREAM_STATES: { caption: string; state: SubscriptionState }[] = [
  { caption: "live — renders nothing, deliberately", state: LIVE_BASE },
  {
    caption: "gap — three events not delivered; resume token voided",
    state: {
      ...LIVE_BASE,
      phase: "gap",
      freshness: "STALE",
      resumeToken: null,
      note: "Events 8811–8813 were not delivered. Re-snapshotting.",
    },
  },
  {
    caption: "projection rebuilt — waiting for the server's window",
    state: {
      ...LIVE_BASE,
      phase: "epoch_changed",
      freshness: "STALE",
      resumeToken: null,
      resnapshotNotBefore: "2026-08-21T10:45:00Z",
      note: "The projection was rebuilt. Showing the previous epoch, ageing.",
    },
  },
  {
    caption: "reconnecting — last good values kept, token kept",
    state: {
      ...LIVE_BASE,
      phase: "reconnecting",
      freshness: "STALE",
      note: "Disconnected. The values below are the last good ones.",
    },
  },
  {
    caption: "failed — nothing to show and nothing pending",
    state: {
      ...INITIAL_SUBSCRIPTION,
      phase: "failed",
      freshness: "UNKNOWN",
      note: "The governance edge is unreachable.",
    },
  },
];

const R2_READINESS = [
  {
    title: "Account & risk plan",
    entries: [
      { label: "account (new)", value: "paper-binance-carry-v32", revision: "account policy rev 7" },
      { label: "margin", value: "MARGIN · CROSS · 2x · settle USDT", revision: "account policy rev 7" },
      { label: "risk profile", value: "max order 5,000 · max position 25,000 · DD 8% · daily loss 3%", revision: "rev 12" },
      { label: "matcher config", value: "taker 4.0bp · slippage model v2 · latency 120ms · partial fills on", revision: "rev 3" },
      // No revision on purpose: the screen states the gap rather than hiding it.
      { label: "order types", value: "MARKET · LIMIT · STOP · GTC/IOC" },
    ],
  },
  {
    title: "Portfolio fit",
    entries: [
      { label: "target capital weight", value: "12.0%", revision: "corr.v1 · 90d backtest window" },
      { label: "corr vs Crypto Core", value: "0.18 (research est.)", revision: "corr.v1" },
      { label: "symbol overlap", value: "none with live alphas", revision: "corr.v1" },
    ],
  },
];

/* Currency is its own column, not baked into the value. Two rows in different
 * currencies stacked as bare numbers read as though they add up. */
const R2_CAPITAL = [
  { label: "allocated capital", currency: "USDT", before: "0.00", after: "50,000.00" },
  { label: "max capital", currency: "USDT", before: "0.00", after: "100,000.00" },
  { label: "portfolio weight", currency: "%", before: "0.0", after: "12.0" },
  { label: "concentration top-3", currency: "%", before: "44.0", after: "46.0", note: "within policy ceiling 55%" },
];

const R2_CAPITAL_ENVELOPE: Envelope = {
  authority: "DERIVED",
  asOf: "2026-08-21T10:41:07Z",
  freshness: "OK",
  ageSeconds: 44,
  formulaVersion: "capital.v2",
};

const EXIT_RAIL = [
  { name: "R1", state: "done" as const, link: { label: "AP-118", href: "/governance/approvals/AP-118/r1" } },
  { name: "R2", state: "done" as const, link: { label: "AP-152", href: "/governance/approvals/AP-152/r2" } },
  { name: "PAPER", state: "current" as const, detail: "30/30 gate met — this review" },
  { name: "SANDBOX", state: "pending" as const },
  { name: "CANARY", state: "pending" as const },
  { name: "LIVE", state: "pending" as const },
];

const EXIT_CONDITIONS = [
  {
    text: "capacity cap 50,000.00 until evidence extended",
    owner: "Lan",
    expiry: "2026-11-01",
    blocking: false,
    carried: true,
  },
];

const EXIT_PANELS_FIXTURE = [
  {
    title: "Observation coverage",
    source: "obs_29",
    findings: [
      { label: "30 / 30 days · 312 / 300 trades · 2 / 2 restart cycles", outcome: "pass" as const, href: "/deployments/paper/dep_94#sessions", sourceLabel: "sessions" },
      { label: "data freshness violations: 0 · coverage 99.6%", outcome: "pass" as const, href: "/deployments/paper/dep_94#sessions", sourceLabel: "sessions" },
      { label: "restart recovery evidenced twice (exs_2208, exs_2196)", outcome: "pass" as const, href: "/deployments/paper/dep_94#sessions", sourceLabel: "sessions" },
    ],
  },
  {
    title: "Drift vs approved evidence",
    source: "run_5498",
    findings: [
      { label: "hit rate −1.1pt · avg trade net −0.04pt — within band", outcome: "pass" as const, href: "/research/quantbt/runs/run_5498", sourceLabel: "run 5498" },
      { label: "fee drag +0.006pt · signal→fill +70ms — non-blocking", outcome: "watch" as const, href: "/deployments/blotter?deployment=dep_94", sourceLabel: "blotter" },
      { label: "slippage", outcome: "insufficient" as const, carriesTo: "sandbox certification", href: "/deployments/blotter?deployment=dep_94", sourceLabel: "blotter" },
    ],
  },
  {
    title: "Limits & operational health",
    findings: [
      { label: "max DD −1.4% / 6% · worst daily loss −0.6% / 3%", outcome: "pass" as const, href: "/deployments/paper/dep_94", sourceLabel: "workbench" },
      { label: "rejects 0.2% / 0.5% · dead letters 0", outcome: "pass" as const, href: "/execution/operations?deployment=dep_94", sourceLabel: "operations" },
      { label: "accounting clean · no stale reservations · recon N/A (paper)", outcome: "pass" as const, href: "/deployments/paper/dep_94", sourceLabel: "workbench" },
    ],
  },
  {
    title: "Portfolio fit — observed vs expected",
    source: "720 samples · corr.v1",
    findings: [
      { label: "ρ vs benchmark: expected 0.18 → observed 0.21 — within band", outcome: "pass" as const, href: "/deployments/portfolios/PF-CRYPTO", sourceLabel: "portfolio" },
      { label: "contribution +1,842.00 USDC · concentration unchanged", outcome: "pass" as const, href: "/deployments/portfolios/PF-CRYPTO", sourceLabel: "portfolio" },
    ],
  },
];

const R1_CHECKLIST = [
  { label: "exact engine / data / version pinned by digest", outcome: "pass" as const },
  { label: "final audit replay reproducible (checksum match)", outcome: "pass" as const },
  { label: "outer OOS policy satisfied — holdout untouched by selection", outcome: "pass" as const },
  { label: "parameter stability ≥ threshold across folds", outcome: "pass" as const },
  { label: "execution assumptions declared (fee/slippage/latency)", outcome: "pass" as const },
  {
    label: "capacity evidence limited — volume data covers top-3 symbols only",
    outcome: "watch" as const,
    suggestion: "suggested condition below",
  },
];

const VERIFICATION_RESULTS: VerificationResult[] = [
  // Published by `execution.command-operation.v1` as the starting state of
  // every operation, and absent from this strip while it was absent from the
  // type. Same reasoning as BLOCKED above: a state the contract ships and this
  // evidence surface omits is a gap in the evidence.
  "NOT_STARTED",
  "PENDING",
  "ACKNOWLEDGED",
  "SUCCEEDED",
  "PARTIAL",
  "UNCERTAIN",
  "FAILED",
  "DENIED",
  "EXPIRED",
];

const CAPABILITY_STATES: CapabilityState[] = [
  "SUPPORTED",
  "READ_ONLY",
  "SHADOW_ONLY",
  "DISABLED",
  "INCOMPATIBLE",
];

/** The four reconciliation cases, one row each (profile.ts). */
const PROFILE_CASES: {
  screen: DeliveryProfile | null;
  panel: DeliveryProfile | null;
  caption: string;
}[] = [
  { screen: "live_full", panel: "shadow", caption: "panel stricter than screen — legal" },
  { screen: "live_canary", panel: "live_canary", caption: "panel matches screen — legal" },
  { screen: "shadow", panel: "live_full", caption: "panel claims MORE than screen — refused" },
  { screen: "live_canary", panel: null, caption: "panel stated nothing — refused" },
];

/* Blotter columns, transcribed from the Full Blotter hi-fi thead:
 * time (UTC) · deployment · venue · symbol · type / side · qty · price · status
 * · fee · order_id. Numeric columns are the ones a truncation would corrupt. */
interface FixtureOrder {
  id: string;
  ts: string;
  deployment: string;
  symbol: string;
  side: string;
  qty: string;
  price: string;
  status: OrderStatus;
  fee: string;
}

const BLOTTER_COLUMNS: readonly Column<FixtureOrder>[] = [
  { key: "ts", header: "time (UTC)", numeric: true, render: (r) => r.ts },
  { key: "dep", header: "deployment · venue", truncate: true, title: (r) => r.deployment, render: (r) => r.deployment },
  { key: "sym", header: "symbol", render: (r) => r.symbol },
  { key: "side", header: "type / side", render: (r) => r.side },
  { key: "qty", header: "qty", numeric: true, render: (r) => r.qty },
  { key: "price", header: "price", numeric: true, render: (r) => r.price },
  { key: "status", header: "status", render: (r) => <OrderStatusChip status={r.status} /> },
  { key: "fee", header: "fee", numeric: true, render: (r) => r.fee },
  { key: "id", header: "order_id", render: (r) => r.id },
];

/* 600 rows: past the 200-row virtualization threshold, so the fixture page
 * exercises the windowing rather than only the styling. */
const FIXTURE_ORDERS: FixtureOrder[] = Array.from({ length: 600 }, (_, i) => {
  const status: OrderStatus =
    i % 37 === 0 ? "PARTIALLY_FILLED" : i % 53 === 0 ? "REJECTED" : "FILLED";
  return {
    id: `ord_${(88_240 - i).toString(16)}`,
    ts: `10:${String(41 - (i % 42)).padStart(2, "0")}:58.114`,
    deployment: `dep_${94 - (i % 9)} · ${VENUES[i % VENUES.length].label}`,
    symbol: i % 3 === 0 ? "BTC-PERP" : i % 3 === 1 ? "ETH-PERP" : "SOL-PERP",
    side: i % 2 === 0 ? "LIMIT BUY" : "LIMIT SELL",
    qty: (0.04 + (i % 11) / 1000).toFixed(4),
    price: (60_890 + (i % 97) * 1.25).toFixed(2),
    status,
    fee: (0.4899 + (i % 13) / 10_000).toFixed(4),
  };
});

const PANEL_STATES: Exclude<PanelStatus, "ok">[] = [
  "loading",
  "empty",
  "partial",
  "stale",
  "denied",
  "unavailable",
  "insufficient_data",
  "terminal",
];

const PANEL_REASON: Partial<Record<PanelStatus, string>> = {
  partial: "3 of 5 venues answered within the deadline; OKX and DERIBIT timed out.",
  stale: "Broker snapshot is 4m old against a 60s policy for BINANCE. Risk fails closed.",
  denied: "Requires role RISK_APPROVER. Amounts are withheld, not zeroed.",
  unavailable: "Execution Query API unreachable. Request ID req_8812fa.",
  insufficient_data: "42 overlapping hourly samples; the correlation threshold is 200.",
  terminal: "Projection rebuild failed after a sequence gap. Request ID req_8813aa.",
};

/**
 * A section of the fixture page.
 *
 * `surface` exists because the Execution Loop is two surfaces and this page has
 * to show both: the governance screens on Carbon light, the shared operations
 * components on Carbon dark. Nesting a surface inside a surface works exactly
 * as the isolation mechanism intends — the inner element's custom properties
 * win for its own subtree — so the page ends up demonstrating the boundary
 * rather than describing it.
 */
function Group({
  id,
  title,
  note,
  surface,
  children,
}: {
  /**
   * Stable address for this group, used by the visual baseline to shoot one
   * section at a time rather than one 116-case page nobody can review.
   *
   * Written out rather than derived from `title`, because three groups share a
   * heading: a slug would collide and two different groups would silently
   * overwrite each other's baseline image — coverage that reads as present and
   * is not. It must also stay put when a title is reworded, or every reworded
   * heading would orphan its baseline.
   */
  id: string;
  title: string;
  note?: string;
  surface?: ExecutionSurfaceKind;
  children: React.ReactNode;
}) {
  const body = (
    <>
      <h2 className="exec-fixtures-heading">{title}</h2>
      {note ? <p className="exec-fixtures-note">{note}</p> : null}
      {children}
    </>
  );
  return (
    <section className="exec-fixtures-group" data-group={id} id={`group-${id}`}>
      {surface ? <ExecutionSurface kind={surface}>{body}</ExecutionSurface> : body}
    </section>
  );
}

function Case({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <div className="exec-fixtures-case">
      <div>{children}</div>
      <span className="exec-fixtures-caption">{caption}</span>
    </div>
  );
}

export default function ExecutionFixtures() {
  // The evidence page grows as groups mount; the vertical scrollbar appearing
  // mid-mount shrank every chart initialised before it by 15px and made the
  // baselines bimodal. Reserve the gutter for this route only.
  useEffect(() => {
    const root = document.documentElement;
    const prev = root.style.scrollbarGutter;
    root.style.scrollbarGutter = "stable";
    return () => {
      root.style.scrollbarGutter = prev;
    };
  }, []);
  const [venues, setVenues] = useState<VenueCode[]>([]);

  return (
    <ExecutionSurface kind="deployments">
      <div className="exec-fixtures">
        <header>
          <h1 className="exec-fixtures-title">Execution Loop — component fixtures</h1>
          <p className="exec-fixtures-lede">
            Phase 0 evidence surface. Every shared component in every state, on the Carbon surface,
            with identifiers from the canonical cast. No live data, no registry entry, no navigation
            link.
          </p>
        </header>

        <Group
          id="authoritybadge"
          title="AuthorityBadge"
          note="One tone for all four authorities: the hi-fi differentiates them by the word, and a hue-coded authority is invisible to a reader who cannot separate the hues."
        >
          <div className="exec-fixtures-grid">
            <Case caption="EXECUTION — our own books">
              <AuthorityBadge envelope={EXECUTION_ENVELOPE} />
            </Case>
            <Case caption="BROKER — carries the snapshot digest">
              <AuthorityBadge envelope={BROKER_ENVELOPE} />
            </Case>
            <Case caption="DERIVED — carries the formula version">
              <AuthorityBadge envelope={DERIVED_ENVELOPE} />
            </Case>
            <Case caption="DERIVED with no formula version — stated, not hidden">
              <AuthorityBadge envelope={DERIVED_NO_FORMULA} />
            </Case>
          </div>
        </Group>

        <Group
          id="freshnessindicator"
          title="FreshnessIndicator"
          note="PAUSED is a venue calendar fact, not a fault. Rendering it as STALE would raise a false alarm every night VN MARKET is shut."
        >
          <div className="exec-fixtures-row">
            {FRESHNESS_STATES.map((state) => (
              <Case caption={state} key={state}>
                <FreshnessIndicator
                  state={state}
                  ageSeconds={state === "PAUSED" ? null : 0.9}
                  reason={
                    state === "PAUSED" ? "VN MARKET closed, reopens 09:00 ICT" : undefined
                  }
                />
              </Case>
            ))}
          </div>
        </Group>

        <Group
          id="statuschip-four-vocabularies-never-one-field"
          title="StatusChip — four vocabularies, never one field"
          note="Runtime state, promotion stage, readiness and broker sync are separate by contract (spec §5.2). PARTIAL never renders green in either vocabulary that has one."
        >
          <div className="exec-fixtures-row">
            {ORDER_STATUSES.map((status) => (
              <Case caption={`order ${status}`} key={status}>
                <OrderStatusChip status={status} />
              </Case>
            ))}
          </div>
          <div className="exec-fixtures-row">
            {OPERATION_STATUSES.map((status) => (
              <Case caption={`operation ${status}`} key={status}>
                <OperationStatusChip status={status} />
              </Case>
            ))}
          </div>
          <div className="exec-fixtures-row">
            <Case caption="runtime ACTIVE">
              <RuntimeStateChip state="ACTIVE" />
            </Case>
            <Case caption="runtime REDUCING">
              <RuntimeStateChip state="REDUCING" />
            </Case>
            <Case caption="runtime HALTED">
              <RuntimeStateChip state="HALTED" />
            </Case>
            <Case caption="broker sync OK">
              <BrokerSyncChip sync="OK" />
            </Case>
            <Case caption="broker sync STALE">
              <BrokerSyncChip sync="STALE" />
            </Case>
            <Case caption="broker sync MISMATCH">
              <BrokerSyncChip sync="MISMATCH" />
            </Case>
            <Case caption="readiness — a fourth, separate field">
              <StatusChip label="READY" tone="good" />
            </Case>
            <Case caption="commissioned — dashed, deliberately absent">
              <StatusChip label="COMMISSIONED" tone="commissioned" />
            </Case>
          </div>
        </Group>

        <Group
          id="environmentbadge-and-guardband"
          title="EnvironmentBadge and GuardBand"
          note="Decision D2: canary and live share one red. Canary draws a double border and reads LIVE · CANARY; live draws a solid border. The treatment carries the difference so it survives a print-out."
        >
          <div className="exec-fixtures-row">
            {STAGES.map((stage) => (
              <Case caption={stage} key={stage}>
                <EnvironmentBadge stage={stage} />
              </Case>
            ))}
          </div>
          <Case caption="LIVE_CANARY — double border + shield">
            <GuardBand stage="LIVE_CANARY" note="capital 5,000 / 5,000 at cap · envelope rev 3" />
          </Case>
          <Case caption="LIVE_FULL — solid border">
            <GuardBand stage="LIVE_FULL" note="acct-live-grid-v21 · since 2026-08-01" />
          </Case>
        </Group>

        <Group
          id="lifecyclerail"
          title="LifecycleRail"
          note="Screen-level on workbenches only. On Alpha 360° and Portfolio 360° the lifecycle is per-deployment (DS §9 note 1), because the whole point of those screens is that one alpha is in several stages at once."
        >
          <Case caption="Carry v3.2 · dep_74 · paper, 12 of 30 days">
            <LifecycleRail
              steps={stageRail({
                stage: "PAPER_OBSERVATION",
                r1: { label: "AP-101", href: "/governance/approvals/AP-101/r1" },
                r2: { label: "AP-207", href: "/governance/approvals/AP-207/r2" },
                detail: "12/30 days · 184/300 trades",
              })}
            />
          </Case>
          <Case caption="Grid v2.1 · dep_88 · canary, day 9 of 14">
            <LifecycleRail
              steps={stageRail({
                stage: "LIVE_CANARY",
                r1: { label: "AP-118", href: "#ap-118" },
                r2: { label: "AP-152", href: "#ap-152" },
                detail: "day 9/14",
              })}
            />
          </Case>
        </Group>

        <Group
          id="observationprogress"
          title="ObservationProgress"
          note="`met` is passed in, never inferred from current ≥ target: the gate rule is evaluated server-side (spec §10.5), and a client that recomputed it would eventually disagree with the server while the button said otherwise."
        >
          <div className="exec-fixtures-grid">
            <Case caption="gate not met — exit CTA stays disabled">
              <ObservationProgress
                met={false}
                rule="30 days AND 300 trades, both required"
                items={[
                  { label: "Observation days", current: 12, target: 30, unit: "days" },
                  { label: "Trades", current: 184, target: 300, unit: "trades" },
                ]}
              />
            </Case>
            <Case caption="gate met — dep_94, 30/30 and 312/300">
              <ObservationProgress
                met
                rule="30 days AND 300 trades, both required"
                items={[
                  { label: "Observation days", current: 30, target: 30, unit: "days" },
                  { label: "Trades", current: 312, target: 300, unit: "trades" },
                ]}
              />
            </Case>
          </div>
        </Group>

        <Group
          id="evidencepanel-and-sla"
          title="EvidencePanel and SLA"
          note="A row that states a verdict without linking what produced it is an opinion. Watch items are visible and non-blocking; missing evidence reads `insufficient`, never a silent pass."
        >
          <EvidencePanel
            rows={[
              {
                label: "Observation coverage",
                mark: "pass",
                detail: "30/30 days · 312/300 trades · restarts 2/2",
                evidence: { label: "sessions →", href: "#sessions" },
              },
              {
                label: "Drift vs approved evidence",
                mark: "watch",
                detail: "Sharpe −0.12 against the R1 pack — within tolerance",
                evidence: { label: "evidence pack →", href: "#pack" },
              },
              {
                label: "Slippage vs model",
                mark: "insufficient",
                detail: "18 fills against a 100-fill threshold",
                evidence: { label: "blotter →", href: "#blotter" },
              },
              {
                label: "Audit replay",
                mark: "fail",
                detail: "Replay diverged at fill 41",
                evidence: { label: "replay →", href: "#replay" },
              },
            ]}
          />
          <div className="exec-fixtures-row">
            <Case caption="within budget">
              <SlaCell sla={{ ageMinutes: 240, budgetMinutes: 1440 }} />
            </Case>
            <Case caption="overdue — stated in words, not only in red">
              <SlaCell sla={{ ageMinutes: 1560, budgetMinutes: 1440 }} />
            </Case>
          </div>
        </Group>

        <Group
          id="venuescope"
          title="VenueScope"
          note="Venue is data (decision D5): this row is fed by the registry and a sixth venue appears without a frontend release. Five chips fit as drawn, so the documented multiselect fallback above eight is deliberately not built."
        >
          <Case caption="multi-select — aggregate screens">
            <VenueScope venues={VENUES} selected={venues} onChange={setVenues} />
          </Case>
          <Case caption="single identity — a workbench cannot show another venue">
            <VenueIdentity venue={VENUES[0]} />
          </Case>
        </Group>

        <Group
          id="charttile"
          title="ChartTile"
          note="The caption is the contract, not decoration. `43,800 → 4,368 samples` is what tells a reader they are looking at hourly buckets over six months; no other field on the tile says it."
        >
          <div className="exec-fixtures-grid">
            <Case caption="complete series — source and returned agree">
              <ChartTile
                title="Equity"
                envelope={{
                  window: "30d",
                  interval: "15m",
                  currency: "USDT",
                  asOf: "2026-08-21T10:42:01Z",
                  authority: "EXECUTION",
                  sourceRows: 2880,
                  returnedRows: 2880,
                  coverage: 1,
                }}
              >
                <span className="exec-fixtures-caption">plot arrives at Phase 18</span>
              </ChartTile>
            </Case>
            <Case caption="aggregated series — the arrow is the aggregation">
              <ChartTile
                title="Equity"
                envelope={{
                  window: "6mo",
                  interval: "1h",
                  currency: "USDT",
                  asOf: "2026-08-21T10:42:01Z",
                  authority: "EXECUTION",
                  sourceRows: 43_800,
                  returnedRows: 4368,
                  coverage: 0.97,
                  warnings: ["3% of the window has no data; gaps are rendered as gaps"],
                }}
              >
                <span className="exec-fixtures-caption">plot arrives at Phase 18</span>
              </ChartTile>
            </Case>
          </div>
        </Group>

        <Group
          id="panel-states"
          title="Panel states"
          note="Each of these is a different claim about the world. `empty` says the query matched nothing; `unavailable` says we could not ask; `denied` says you may not see it; `insufficient_data` says we have rows but too few to compute honestly."
        >
          <div className="exec-fixtures-grid">
            {PANEL_STATES.map((status) => (
              <Case caption={status} key={status}>
                <PanelState
                  status={status}
                  reason={PANEL_REASON[status]}
                  lastGood={
                    status === "stale" || status === "unavailable" ? (
                      <span>last good 18,412.55 USDT · as_of 10:38:00Z</span>
                    ) : undefined
                  }
                />
              </Case>
            ))}
            <Case caption="commissioned — designed, not in this slice">
              <CommissionedPanel what="Promotion Timeline" slice="linked on purpose, HANDOFF §4b" />
            </Case>
          </div>
          <Case caption="honest capping (M5) — the denominator is exact">
            <CapNotice shown={10} total={214} href="#queue" noun="open items" />
          </Case>
        </Group>

        <Group
          id="commandplandrawer"
          title="CommandPlanDrawer"
          note="The only path to a mutation. Apply reports every unmet condition rather than the first, because a button that says only `disabled` makes an operator guess which of four things to fix."
        >
          <div className="exec-fixtures-grid">
            <Case caption="no plan yet — apply blocked, reasons listed">
              <CommandPlanDrawer requestKey="rk_fixture_01"
                title="Allocate capital"
                meta="PF-MAIN → Carry v3.2 · dep_77 · OKX TESTNET"
                step="plan"
                plan={null}
              />
            </Case>
            <Case caption="planned — reason still required">
              <CommandPlanDrawer requestKey="rk_fixture_02"
                title="Allocate capital"
                meta="PF-MAIN → Carry v3.2 · dep_77 · OKX TESTNET"
                step="apply"
                plan={{
                  id: "cmd_9f12",
                  expiresInSeconds: 60,
                  requestPreview:
                    "POST /portfolios/PF-MAIN/allocations\n{ deployment_id: dep_77, amount: 5000, currency: USDT }",
                  equivalentCli: "primus portfolio allocate PF-MAIN dep_77 --amount 5000 --ccy USDT",
                  checks: [
                    { label: "Portfolio has uncommitted capital", outcome: "pass" },
                    { label: "Concentration above 20% of NAV", outcome: "warning" },
                  ],
                }}
              />
            </Case>
            <Case caption="verify — 202 first, PARTIAL never green">
              <CommandPlanDrawer requestKey="rk_fixture_03"
                title="Allocate capital"
                step="verify"
                plan={{
                  id: "cmd_9f12",
                  expiresInSeconds: 0,
                  requestPreview: "POST /portfolios/PF-MAIN/allocations",
                  equivalentCli: "primus portfolio allocate PF-MAIN dep_77 --amount 5000 --ccy USDT",
                  checks: [{ label: "Portfolio has uncommitted capital", outcome: "pass" }],
                }}
                verifyEntries={[
                  { label: "Allocation row written", status: "VERIFIED" },
                  { label: "Risk grant refreshed", status: "PARTIAL" },
                ]}
                outcome="PARTIAL"
              />
            </Case>
            <Case caption="destructive — typed confirmation, danger styling">
              <CommandPlanDrawer requestKey="rk_fixture_04"
                title="Emergency close all positions"
                meta="acct-live-grid-v21 · BINANCE"
                step="plan"
                plan={null}
                danger
                confirmWord="CLOSE"
              />
            </Case>
          </div>
        </Group>

        <Group
          id="cold-retention-six-answers-to-why-are-there-no-rows"
          title="Cold retention — six answers to “why are there no rows?”"
          note="EX-BE-04b §3: COLD_REQUESTABLE, PURGED and UNKNOWN “may have no points, but are not semantically an ordinary empty hot series.” Nothing matched, older than we keep, deleted under policy, no policy published, and the question was too big are five different answers, and only the first is an empty result."
        >
          <div className="exec-fixtures-stack">
            <Case caption="PARTIAL_HOT — rows kept, and the shortfall stated above them">
              <RetentionNotice retention={{ outcome: "PARTIAL_HOT", hotFrom: "2026-02-21T00:00:00Z", policyVersion: "ret.v4" }} />
            </Case>
            <Case caption="COLD_REQUESTABLE — a restore is an administrative request, not a wider query">
              <RetentionNotice
                retention={{ outcome: "COLD_REQUESTABLE", hotFrom: "2026-02-21T00:00:00Z", policyVersion: "ret.v4" }}
                onRequestRestore={() => {}}
              />
            </Case>
            <Case caption="PURGED — terminal, so no restore is offered; offering one would be a lie">
              <RetentionNotice retention={{ outcome: "PURGED", policyVersion: "ret.v4" }} onRequestRestore={() => {}} />
            </Case>
            <Case caption="UNKNOWN — no policy published, so nothing can be claimed either way">
              <RetentionNotice retention={{ outcome: "UNKNOWN" }} />
            </Case>
            <Case caption="range too wide — not a retention problem; the data may be entirely present">
              <RangeTooWideNotice requestedDays={7300} />
            </Case>
            <Case caption="in a table: cold reads as unavailable, never as “no rows match”">
              <KeysetTable
                label="Orders"
                columns={BLOTTER_COLUMNS}
                rowKey={(r) => r.id}
                page={{
                  rows: [],
                  totalCount: 182_431,
                  retention: { outcome: "COLD_REQUESTABLE", hotFrom: "2026-02-21T00:00:00Z" },
                }}
              />
            </Case>
          </div>
        </Group>

        <Group
          id="mechanism-m2-zoom-re-queries-it-does-not-magnify"
          title="Mechanism M2 — zoom re-queries, it does not magnify"
          note="Zooming into an already-aggregated array renders a shape the data does not have: four hourly buckets stretched across a screen look like four measurements when they are 440 averaged, and the peak that mattered is inside one of them. So a zoom that earns a finer rung asks the server again — and a zoom that does not is told so, because silently doing nothing reads as a broken control."
        >
          <div className="exec-fixtures-stack">
            <Case caption="pick a range — the caption always shows the interval the SERVER served">
              <ZoomDemo />
            </Case>
          </div>
        </Group>

        <Group
          id="mechanism-m3-a-subscription-through-its-whole-lifecycle"
          title="Mechanism M3 — a subscription through its whole lifecycle"
          note="The states worth getting right are the unhappy ones, which are exactly what a screenshot of a working system never shows. This drives the real reducer, not a copy of it: subscribe, snapshot, deltas, three dropped events, a rebuild with the server's wait window, then a disconnect."
        >
          <div className="exec-fixtures-stack">
            <Case caption="walk it — each step is a real reducer transition">
              <SubscriptionWalk />
            </Case>
          </div>
        </Group>

        <Group
          id="subscription-states-side-by-side"
          title="Subscription states, side by side"
          note="Live renders no banner at all — a banner that is always there is a banner nobody reads. Everything else carries what happened, how old the values below are, and what is being done."
        >
          <div className="exec-fixtures-stack">
            {STREAM_STATES.map(({ caption, state }) => (
              <Case caption={caption} key={caption}>
                <SubscriptionBanner state={state} now="2026-08-21T10:44:00Z" />
              </Case>
            ))}
          </div>
        </Group>

        <Group
          id="source-completeness-not-the-same-question-as-freshness"
          title="Source completeness — not the same question as freshness"
          note="Freshness answers how old this is; completeness answers whether it is all of it. A panel can be one second old and still be missing every transition that happened between two polls. At the current runtime only ORDER_STATUS is event-sourced, so POLL_BOUNDED is the normal case."
        >
          <div className="exec-fixtures-row">
            <Case caption="EVENT_SOURCED">
              <CompletenessNote completeness="EVENT_SOURCED" />
            </Case>
            <Case caption="POLL_BOUNDED — states its interval">
              <CompletenessNote completeness="POLL_BOUNDED" pollIntervalMs={5000} />
            </Case>
            <Case caption="UNKNOWN — blocks continuity claims">
              <CompletenessNote completeness="UNKNOWN" />
            </Case>
          </div>
        </Group>

        <Group
          id="phase-1-approval-inbox-states-only"
          title="Phase 1 — Approval Inbox (states only)"
          surface="governance"
          note="Lane A: props and fixtures. Real integration waits on EX-BE-04a and EX-BE-05a, neither of which needs the Rust edge, AWS or the Trading System. AP-259 is dimmed because you wrote it — it stays in the list, because a queue that hides its un-actionable rows lies about its own size."
        >
          <div className="exec-fixtures-stack">
            <Case caption="populated — one overdue, one awaiting quorum, one blocked by separation of duty">
              <ApprovalInbox onCopyProvenance={() => undefined}
                page={{ rows: INBOX_ROWS, totalCount: 5, filteredCount: 4 }}
                counts={{ pending: 5, overdue: 1, dueSoon: 1 }}
                filter="INBOX"
                policyVersion="approval.v3"
                actor="Lan"
                actorRoles={["Quant Reviewer", "Ops Approver"]}
                inertCount={2}
                decided={{ rows: DECIDED_FIXTURE_ROWS, totalCount: 3 }}
              />
            </Case>
            <Case caption="inbox zero — an empty queue is a result, not a failure">
              <ApprovalInbox onCopyProvenance={() => undefined}
                page={{ rows: [], totalCount: 0 }}
                counts={{ pending: 0, overdue: 0, dueSoon: 0 }}
                filter="INBOX"
                policyVersion="approval.v3"
                actor="Lan"
              />
            </Case>
            <Case caption="loading — no counts yet, and none invented">
              <ApprovalInbox onCopyProvenance={() => undefined} page={{ rows: [], totalCount: 0 }} counts={null} filter="INBOX" status="loading" />
            </Case>
            <Case caption="partial — rows are real, the queue may be incomplete">
              <ApprovalInbox onCopyProvenance={() => undefined}
                page={{ rows: INBOX_ROWS.slice(0, 2), totalCount: 5, filteredCount: 2 }}
                counts={{ pending: 5, overdue: 1, dueSoon: 1 }}
                filter="INBOX"
                status="partial"
                partialReason="Broker sync could not be read for 2 of 5 requests."
              />
            </Case>
            <Case caption="denied — the viewer lacks the scope, which is not an empty queue">
              <ApprovalInbox onCopyProvenance={() => undefined}
                page={{ rows: [], totalCount: 0 }}
                counts={null}
                filter="INBOX"
                status="denied"
                reason="portal.governance.approvals.read"
              />
            </Case>
          </div>
        </Group>

        <Group
          id="phase-2-gate-r1-review-states-only"
          title="Phase 2 — Gate R1 Review (states only)"
          surface="governance"
          note="The screen exists to make one refusal impossible to work around. Separation of duty is derived from creator vs actor rather than trusted from a prop, and Deny is never locked: a reviewer who cannot approve can always refuse."
        >
          <div className="exec-fixtures-stack">
            <Case caption="separation of duty OK — one warning, no blockers, Approve available, condition composable">
              <GateR1Review onCopyProvenance={() => undefined} onRequestCondition={() => undefined}
                onAttachCondition={() => {}}
                limitations={[
                  { kind: "lineage", label: "param lineage", value: "study st_77 → trial 141 → frozen" },
                  { kind: "warning", label: "fee model", value: "assumes taker-only" },
                  { kind: "restriction", label: "scope", value: "crypto perp · BINANCE · paper first" },
                  { kind: "waiver", label: "capacity", value: "capacity evidence limited", expires: "2026-11-01" },
                ]}
                approvalId="AP-201"
                alphaLabel="RSI v1.7"
                releaseCandidate="RC-41"
                quorumMet={1}
                quorumRequired={2}
                policyVersion="approval.v3"
                creator="Minh"
                actor="Lan"
                sla={{ ageMinutes: 2 * 60, budgetMinutes: 24 * 60 }}
                passport={R1_PASSPORT}
                checklist={R1_CHECKLIST}
              />
            </Case>
            <Case caption="you wrote it — Approve locked, Deny still available">
              <GateR1Review onCopyProvenance={() => undefined} onRequestCondition={() => undefined}
                approvalId="AP-201"
                alphaLabel="RSI v1.7"
                releaseCandidate="RC-41"
                quorumMet={0}
                quorumRequired={2}
                policyVersion="approval.v3"
                creator="Lan"
                actor="Lan"
                passport={R1_PASSPORT}
                checklist={R1_CHECKLIST}
              />
            </Case>
            <Case caption="blocking finding plus an expired request — every lock reported, not just the first">
              <GateR1Review onCopyProvenance={() => undefined} onRequestCondition={() => undefined}
                approvalId="AP-201"
                alphaLabel="RSI v1.7"
                quorumMet={0}
                quorumRequired={2}
                policyVersion="approval.v3"
                creator="Minh"
                actor="Lan"
                passport={R1_PASSPORT}
                checklist={[
                  ...R1_CHECKLIST.slice(0, 5),
                  { label: "holdout untouched by selection", outcome: "fail" as const },
                  { label: "capacity evidence", outcome: "insufficient" as const },
                ]}
                locks={["BLOCKING_FINDINGS", "EXPIRED"]}
              />
            </Case>
            <Case caption="already decided — a record, not a form; the controls are gone">
              <GateR1Review onCopyProvenance={() => undefined} onRequestCondition={() => undefined}
                approvalId="AP-201"
                alphaLabel="RSI v1.7"
                quorumMet={2}
                quorumRequired={2}
                policyVersion="approval.v3"
                creator="Minh"
                actor="Lan"
                passport={R1_PASSPORT}
                checklist={R1_CHECKLIST}
                decided={{ outcome: "APPROVED_WITH_CONDITION", by: "Lan", at: "2026-08-21T09:12Z" }}
              />
            </Case>
            <Case caption="unavailable — still says which gate failed to load">
              <GateR1Review onCopyProvenance={() => undefined} onRequestCondition={() => undefined}
                approvalId="AP-201"
                alphaLabel="RSI v1.7"
                quorumMet={0}
                quorumRequired={2}
                policyVersion="approval.v3"
                creator="Minh"
                actor="Lan"
                passport={[]}
                checklist={[]}
                status="unavailable"
                reason="Governance edge unreachable."
              />
            </Case>
          </div>
        </Group>

        <Group
          id="wired-flow-list-detail-plan-apply-poll"
          title="Wired flow — list · detail · plan · apply · poll"
          surface="governance"
          note="The same components, driven through the ExecutionApi port instead of literal props. The data source is still fixtures and every endpoint the registry has not enabled answers unavailable — but the mapping, the failure handling and the 202 discipline are the real ones. Swapping createFixtureApi for createHttpApi is the only change EX-BE-05a needs."
        >
          <div className="exec-fixtures-stack">
            <Case caption="inbox through the port — rows go through readApprovalRow, counts come from the server">
              <ApprovalInboxContainer api={WIRED_API} />
            </Case>
            <Case caption="gate R1 through the port — Approve runs plan → apply → poll and stops at 202">
              <GateR1ReviewContainer api={WIRED_API} approvalId="AP-201" />
            </Case>
            <Case caption="an endpoint the registry has not enabled — unavailable, with the reason">
              <ApprovalInboxContainer api={UNWIRED_API} />
            </Case>
            <Case caption="an operation that ends UNCERTAIN — the trail stays, because the question does">
              <GateR1ReviewContainer api={UNCERTAIN_API} approvalId="AP-201" />
            </Case>
            <Case caption="gate R2 through the port — every capital row names its currency">
              <GateR2ReviewContainer api={WIRED_API} approvalId="AP-352" />
            </Case>
            <Case caption="paper exit through the port — every evidence number links its source">
              <PaperExitReviewContainer api={WIRED_API} reviewId="EX-771" />
            </Case>
          </div>
        </Group>

        <Group
          id="phase-3-gate-r2-review-states-only"
          title="Phase 3 — Gate R2 Review (states only)"
          surface="governance"
          note="R2 rests on R1. An expired R1 locks the decision bar no matter how good the operational evidence is, and the capital preview refuses to render without an authority envelope — an unattributed before/after table about money looks exactly like a record of something that happened."
        >
          <div className="exec-fixtures-stack">
            <Case caption="R1 approved — preview marked derived, not applied">
              <GateR2Review onCopyProvenance={() => undefined} onRequestCondition={() => undefined}
                approvalId="AP-352"
                subject="Carry v3.2 → PF-MAIN · Sandbox · OKX TESTNET"
                r1Id="AP-101"
                r1State="APPROVED"
                r1Href="/governance/approvals/AP-101/r1"
                r1Expiry="2026-11-01"
                r1Digest="sha256:c81f2d4a…7e"
                r1DecidedBy="Minh"
                r1DecidedAt="2026-07-30"
                deploymentCandidate="DC-91"
                releaseCandidate="RC-41"
                artifactDigest="sha256:9f3c1a…e2"
                policyVersion="approval.v3"
                planAuthor="Stan"
                actor="Lan"
                quorumMet={0}
                quorumRequired={2}
                sla={{ ageMinutes: 16 * 60, budgetMinutes: 24 * 60 }}
                readiness={R2_READINESS}
                capital={R2_CAPITAL}
                capitalEnvelope={R2_CAPITAL_ENVELOPE}
                grantName="paper_activation_authorization"
                conditions={[
                  {
                    text: "capacity cap 50,000.00 USDT until slippage evidence extends past 30 fills",
                    owner: "Lan",
                    deadline: "2026-09-15",
                    expiry: "2026-11-01",
                    blocking: true,
                  },
                ]}
              />
            </Case>
            <Case caption="R1 expired — every operational panel still readable, Approve locked">
              <GateR2Review onCopyProvenance={() => undefined} onRequestCondition={() => undefined}
                approvalId="AP-352"
                subject="Carry v3.2 → PF-MAIN · Sandbox · OKX TESTNET"
                r1Id="AP-101"
                r1State="EXPIRED"
                r1Expiry="2026-08-18"
                r1Digest="sha256:c81f2d4a…7e"
                policyVersion="approval.v3"
                planAuthor="Stan"
                actor="Lan"
                quorumMet={0}
                quorumRequired={2}
                readiness={R2_READINESS}
                capital={R2_CAPITAL}
                capitalEnvelope={R2_CAPITAL_ENVELOPE}
                grantName="paper_activation_authorization"
              />
            </Case>
            <Case caption="preview without an authority envelope — refused rather than rendered bare">
              <GateR2Review onCopyProvenance={() => undefined} onRequestCondition={() => undefined}
                approvalId="AP-352"
                subject="Carry v3.2 → PF-MAIN"
                r1Id="AP-101"
                r1State="APPROVED"
                policyVersion="approval.v3"
                planAuthor="Stan"
                actor="Lan"
                quorumMet={0}
                quorumRequired={2}
                readiness={[]}
                capital={R2_CAPITAL}
              />
            </Case>
          </div>
        </Group>

        <Group
          id="phase-5-paper-exit-review-states-only"
          title="Phase 5 — Paper Exit Review (states only)"
          surface="governance"
          note="GATE MET comes from the server and is never computed from the coverage numbers beside it — the policy can require more than they show. INSUFFICIENT_DATA is a third outcome: not a pass, not a failure, a question that follows the deployment into sandbox certification."
        >
          <div className="exec-fixtures-stack">
            <Case caption="gate met — one watch item, one unanswered question carried forward">
              <PaperExitReview
        onCopyProvenance={() => undefined}
                reviewId="EX-771"
                deploymentId="dep_94"
                subject="Grid v2.1 · dep_94 · DERIBIT"
                promoteTo="SANDBOX_VALIDATION"
                gateMet
                gateSummary="30 / 30 days · 312 / 300 trades · 2 / 2 restart cycles"
                policyId="obs_29"
                quorumMet={0}
                quorumRequired={1}
                approverRole="Ops Approver"
                sla={{ ageMinutes: 4 * 60, budgetMinutes: 48 * 60 }}
                panels={EXIT_PANELS_FIXTURE}
                rail={EXIT_RAIL}
                conditions={EXIT_CONDITIONS}
                eligibility={EXIT_ELIGIBLE}
                recommendation="Approve promotion with the carried capacity condition."
              />
            </Case>
            <Case caption="gate unmet — promotion locked, extend and reject still available">
              <PaperExitReview
        onCopyProvenance={() => undefined}
                reviewId="EX-772"
                deploymentId="dep_88"
                subject="MeanRev v0.3 · dep_88 · BINANCE"
                promoteTo="SANDBOX_VALIDATION"
                gateMet={false}
                gateSummary="22 / 30 days · 241 / 300 trades · 2 / 2 restart cycles"
                policyId="obs_29"
                quorumMet={0}
                quorumRequired={1}
                panels={EXIT_PANELS_FIXTURE}
                eligibility={EXIT_ELIGIBLE}
                recommendation="Extend observation by 8 days."
              />
            </Case>
            <Case caption="one evidence panel down — promotion stops, because an unread panel produces no findings and no findings reads as nothing blocking">
              <PaperExitReview
        onCopyProvenance={() => undefined}
                reviewId="EX-771"
                deploymentId="dep_94"
                subject="Grid v2.1 · dep_94 · DERIBIT"
                promoteTo="SANDBOX_VALIDATION"
                gateMet
                quorumMet={0}
                quorumRequired={1}
                status="partial"
                partialReason="Portfolio analytics could not be read."
                panels={[
                  EXIT_PANELS_FIXTURE[0],
                  { title: "Portfolio fit — observed vs expected", findings: [], status: "unavailable", reason: "Analytics edge unreachable." },
                ]}
              />
            </Case>
            <Case caption="separation of duties — the requester may not decide their own review, and all three branches say so once">
              <PaperExitReview
        onCopyProvenance={() => undefined}
                reviewId="EX-773"
                deploymentId="dep_94"
                subject="Grid v2.1 · dep_94 · DERIBIT"
                promoteTo="SANDBOX_VALIDATION"
                gateMet
                quorumMet={0}
                quorumRequired={1}
                panels={EXIT_PANELS_FIXTURE}
                eligibility={{
                  canApprove: false,
                  canApproveWithCondition: false,
                  canDeny: false,
                  canRequestChanges: false,
                  canExtendObservation: false,
                  canReject: false,
                  separationOfDuties: "VIOLATION",
                }}
              />
            </Case>
            <Case caption="authority withheld for one branch only — extending is refused, rejecting is not">
              <PaperExitReview
        onCopyProvenance={() => undefined}
                reviewId="EX-774"
                deploymentId="dep_88"
                subject="MeanRev v0.3 · dep_88 · BINANCE"
                promoteTo="SANDBOX_VALIDATION"
                gateMet
                quorumMet={0}
                quorumRequired={1}
                panels={EXIT_PANELS_FIXTURE}
                eligibility={{ ...EXIT_ELIGIBLE, canExtendObservation: false }}
              />
            </Case>
          </div>
        </Group>

        <Group
          id="risk-tier-and-delivery-policy-what-apply-demands"
          title="Risk tier and delivery policy — what Apply demands"
          note="R3 and R4 are two permissions, not two rungs. R3 protects a position and needs a step-up but no second person, because waiting for one is how a live position keeps bleeding. R4 enlarges a position and needs both. A step-up satisfied for an emergency halt never carries into a capital expansion."
        >
          <div className="exec-fixtures-stack">
            <Case caption="R3 protective — policy allows it; step-up outstanding">
              <CommandPlanDrawer requestKey="rk_fixture_05"
                title="Halt deployment"
                meta="dep_94 · BINANCE · live"
                step="apply"
                plan={FIXTURE_PLAN}
                riskTier="R3"
                policy={LIVE_POLICY}
                freshAuthSatisfied={false}
              />
            </Case>
            <Case caption="R4 risk-increasing — security key and a second person">
              <CommandPlanDrawer requestKey="rk_fixture_06"
                title="Expand capital envelope"
                meta="pf_alpha_core · +40% notional"
                step="apply"
                plan={FIXTURE_PLAN}
                riskTier="R4"
                policy={LIVE_POLICY}
                freshAuthSatisfied={false}
                secondApproverSatisfied={false}
                danger
                confirmWord="EXPAND"
              />
            </Case>
            <Case caption="R1 on a fixture screen — the registry has it switched off">
              <CommandPlanDrawer requestKey="rk_fixture_07"
                title="Flatten paper position"
                meta="dep_88 · paper"
                step="apply"
                plan={FIXTURE_PLAN}
                riskTier="R1"
                policy={REV4_SHIPPED_POLICY}
              />
            </Case>
          </div>
        </Group>

        <Group
          id="verificationchip-what-verify-observed-a-second-axis"
          title="VerificationChip — what verify observed, a second axis"
          note="UNCERTAIN is toned bad rather than warn. Nothing has been proven to have failed, but an amber chip beside a grey PENDING invites waiting, and waiting is the wrong response to not knowing whether a halt took effect."
        >
          <div className="exec-fixtures-row">
            {VERIFICATION_RESULTS.map((result) => (
              <Case caption={result} key={result}>
                <VerificationChip result={result} />
              </Case>
            ))}
          </div>
        </Group>

        <Group
          id="capabilitychip-per-capability-never-rolled-up"
          title="CapabilityChip — per capability, never rolled up"
          note="Master plan §6.2 forbids a global green flag. Reads stay supported while the matching command path is disabled, and one badge cannot say that."
        >
          <div className="exec-fixtures-row">
            {CAPABILITY_STATES.map((state) => (
              <Case caption={state} key={state}>
                <CapabilityChip name="orders" state={state} />
              </Case>
            ))}
          </div>
        </Group>

        <Group
          id="profilebadge-registry-revision-4"
          title="ProfileBadge — registry revision 4"
          note="Renders for fixture and shadow only. The other four profiles are already carried by the environment badge and the guard band; shadow has no other tell at all, because shadow reads are real values from the real system on the real screen."
        >
          <div className="exec-fixtures-row">
            {PROFILE_ORDER.map((profile) => (
              <Case caption={profileNeedsLabel(profile) ? profile : `${profile} — silent`} key={profile}>
                <ProfileBadge profile={profile} />
              </Case>
            ))}
          </div>
        </Group>

        <Group
          id="profile-reconciliation-fail-closed"
          title="Profile reconciliation — fail-closed"
          note="A panel may claim less authority than its screen was commissioned for. It may never claim more: that is a routing error or a bug, and both are reasons to render nothing."
        >
          <div className="exec-fixtures-grid">
            {PROFILE_CASES.map(({ screen, panel, caption }) => {
              const r = reconcilePanelProfile(screen, panel);
              return (
                <Case caption={caption} key={caption}>
                  {r.ok ? (
                    <span className="exec-fixtures-note">
                      renders as <strong>{r.effective}</strong>
                      {r.stricterThanScreen ? " (stricter than the screen)" : ""}
                    </span>
                  ) : (
                    <PanelState status={r.panelStatus} reason={r.reason} />
                  )}
                </Case>
              );
            })}
          </div>
        </Group>

        <Group
          id="keysettable-mechanism-m1"
          title="KeysetTable — mechanism M1"
          note="No page numbers, because keyset cannot seek to page n. Counts come from the server over the full population, never from the rows the browser is holding. Numerics are mono, tabular and never ellipsised."
        >
          <div className="exec-fixtures-stack">
            <Case caption="182k rows, virtualized, both directions available">
              <KeysetTable
                label="Orders"
                columns={BLOTTER_COLUMNS}
                rowKey={(r) => r.id}
                viewportRows={12}
                page={{
                  rows: FIXTURE_ORDERS,
                  totalCount: 182_431,
                  // At least as many as are resident. A page holding more rows
                  // than its own filtered count says the selection is smaller
                  // than what it is showing, which is not a state the server
                  // can produce and not one a reader can make sense of.
                  filteredCount: Math.max(412, FIXTURE_ORDERS.length),
                  hasMore: true,
                  hasPrevious: true,
                  nextCursor: "c_ab34e91f0055deadbeef",
                  appliedFilters: [{ field: "status", op: "in", value: "FILLED,PARTIALLY_FILLED" }],
                  appliedSort: [{ field: "event_ts", direction: "desc" }],
                }}
              />
            </Case>
            <Case caption="empty under a filter — a named state, not a blank table">
              <KeysetTable
                label="Orders"
                columns={BLOTTER_COLUMNS}
                rowKey={(r) => r.id}
                page={{ rows: [], totalCount: 182_431, filteredCount: 0 }}
                reason="No order matched REJECTED in this window."
              />
            </Case>
            <Case caption="denied — the viewer lacks the scope, which is not emptiness">
              <KeysetTable
                label="Orders"
                columns={BLOTTER_COLUMNS}
                rowKey={(r) => r.id}
                status="denied"
                reason="portal.execution.blotter.read"
                page={{ rows: [], totalCount: 0 }}
              />
            </Case>
          </div>
        </Group>

        {/*
          The five screens built after Phase 0 and never added here.

          They existed only inside test files, which meant nobody could look at
          one: not at a product route — correctly, since fixture data at a
          product route is what the Lane A boundary forbids — and not here
          either. A screen nobody can see is a screen nobody has reviewed, and
          the Phase 0 exit gate is "every shared Execution component in every
          state" precisely so that cannot happen.
        */}
        <Group
          id="v2-anatomy-paper-demo"
          title="V2 anatomy — the shared page skeleton on Paper data"
          note="EL-V2-02 reference: workspace · masthead · decision strip · tabs · context rail · provenance · bounded terminal. Sparse/balanced/dense are layouts, not font sizes — the type ramp is identical in all three."
        >
          <AnatomyDemo />
        </Group>

        <Group
          id="v2-equity-chart-demo"
          title="V2 equity chart — evidence fixture (not a published projection)"
          note="EL-V2-04: no contract publishes an equity series yet (BR-EX-34). This group proves the chart machinery — axes, tooltip with envelope, approved band, gaps as gaps, drag zoom + double-click reset, expand, table view — on a deterministic evidence-only series. Product routes render the honest compact state until the series is published."
        >
          <div className="exec-fixtures-stack">
            <EquityChart
              id="equity-evidence"
              title="Equity vs approved research evidence"
              envelope={paperWorkbench().equity!.envelope}
              series={evidenceEquitySeries()}
            />
            <EquityChart
              title="Equity vs approved research evidence"
              envelope={paperWorkbench().equity!.envelope}
              series={null}
            />
          </div>
        </Group>

        <Group
          id="v2-guard-asymmetry"
          title="V2 guard asymmetry — Canary (broker STALE) beside Live"
          note="EL-V2-06: one solid guard band per page; protective actions sit in the rail (heavier), scale-up / risk-increasing sit under the guard rule (lighter). A stale broker snapshot or a projection gap blocks only the risk-increasing side."
          surface="deployments"
        >
          <div className="exec-guard-pair">
            <CanaryControlRoomContainer api={WIRED_API} deploymentId="dep_88" brokerStale />
            <LiveFullOperationsContainer api={WIRED_API} deploymentId="dep_88" />
          </div>
        </Group>

        <Group
          id="live-full-operations-1f"
          title="Live Full Operations (1f)"
          note="No broker figure reaches this screen while consistency is unverified — the reader drops them, so they never become props. Suppressed is rendered apart from unavailable, and R4 is blocked because nobody can say whether a projection gap exists."
          surface="deployments"
        >
          <Case caption="fixture · production inactive — broker panel suppressed, and it says the Portal is withholding rather than failing to read">
            <LiveFullOperationsContainer api={WIRED_API} deploymentId="dep_88" />
          </Case>
          <Case caption="the port refuses — a guard band over nothing would read as a live deployment">
            <LiveFullOperationsContainer
              api={createFixtureApi({ unavailableEndpoints: ["getLiveFullOperations"] })}
              deploymentId="dep_88"
            />
          </Case>
        </Group>

        <Group
          id="sandbox-certification-1d"
          title="Sandbox Certification (1d)"
          note="Seven ordered steps from the server, three independently degradable panels, and nothing computed here — not progress, not the current step, not evidence expiry. runtime_state stays null rather than becoming HALTED."
          surface="deployments"
        >
          <Case caption="0/7 unavailable — seven blocker codes named, and no source panel claims a clean result">
            <SandboxCertificationContainer api={WIRED_API} deploymentId="dep_77" />
          </Case>
          <Case caption="the port refuses — an empty strip would read as a certification with no steps">
            <SandboxCertificationContainer
              api={createFixtureApi({ unavailableEndpoints: ["getSandboxCertification"] })}
              deploymentId="dep_77"
            />
          </Case>
        </Group>

        <Group
          id="canary-control-room-1e"
          title="Canary Control Room (1e)"
          note="The guard is words and a shield, not a colour. Production command is inactive, so both action groups are absent rather than disabled — and the broker-stale asymmetry is stated as two separate sentences."
          surface="deployments"
        >
          <Case caption="fixture · production inactive — five KPI slots unavailable, never zero">
            <CanaryControlRoomContainer api={WIRED_API} deploymentId="dep_88" />
          </Case>
          <Case caption="broker stale — the asymmetry holds: it would block scale-up and not protective actions">
            <CanaryControlRoomContainer api={WIRED_API} deploymentId="dep_88" brokerStale />
          </Case>
        </Group>

        <Group
          id="operations-queue-4e"
          title="Operations Queue (4e)"
          note="Three states per row and never merged: what the Trading System is doing, what verify observed, and what a person in the Portal has done. Acknowledging or resolving changes only the third."
          surface="deployments"
        >
          <Case caption="the queue through the port — alert rail unavailable, because the Trading System publishes no alerts route">
            <OperationsQueueContainer api={WIRED_API} now={QUEUE_NOW} />
          </Case>
          <Case caption="the port refuses — an empty table would read as an empty queue">
            <OperationsQueueContainer
              api={createFixtureApi({ unavailableEndpoints: ["listOperations"] })}
              now={QUEUE_NOW}
            />
          </Case>
        </Group>

        <Group
          id="incident-detail-4d"
          title="Incident Detail (4d)"
          note="Forward-only OPEN → MITIGATED → RESOLVED. Four source panels unavailable, one frame each. Resolving closes the Portal record and never resumes a deployment — there is no Resume control anywhere on this screen."
          surface="deployments"
        >
          <Case caption="open — four blockers named, not one greyed button">
            <IncidentDetailContainer api={WIRED_API} incidentId="inc_fixture_44" />
          </Case>
          <Case caption="resolved — and the deployment is still halted, said out loud">
            <IncidentDetailContainer
              api={createFixtureApi({ resolvedIncident: true })}
              incidentId="inc_fixture_44"
            />
          </Case>
        </Group>

        <Group
          id="analytics-containers-port-screen"
          title="Analytics containers — port → screen"
          note="Every one of these fetches through the port rather than taking props. That join is where a route typo or a mismapped state actually shows up, and four of them were built and never mounted."
          surface="deployments"
        >
          <Case caption="correlation — the panel degrades to the leader lens at the packed limit, and says why">
            <CorrelationContainer api={WIRED_API} portfolioId="PF-1" />
          </Case>
          <Case caption="aggregate headroom — unavailable, because the source publishes no verdict yet (BR-EX-26)">
            <ExposureHeadroomContainer api={WIRED_API} bindingId="binding-1" />
          </Case>
          <Case caption="capital ledger — bounded window and per-currency gross totals, read from the port">
            <CapitalLedgerContainer
              api={WIRED_API}
              portfolioId="PF-1"
              render={({ ledger, status }) => (
                <p className="exec-blotter-note">
                  {status === "ok"
                    ? `${ledger?.buckets.length ?? 0} currency bucket(s) · window ${ledger?.window ?? "not stated"} · ${ledger?.bounded.returned ?? 0} of ${ledger?.bounded.total ?? "—"} entries`
                    : `ledger ${status}`}
                </p>
              )}
            />
          </Case>
          <Case caption="alpha insight batch — the three counts the server owns, never derived from the item list">
            <AlphaInsightContainer
              api={WIRED_API}
              alphaId="alpha-1"
              request={ALPHA_BATCH_REQUEST}
              render={({ batch, status }) => (
                <p className="exec-blotter-note">
                  {status === "ok"
                    ? `requested ${batch?.requestedCount ?? "—"} · ready ${batch?.readyCount ?? "—"} · error ${batch?.errorCount ?? "—"}`
                    : `batch ${status}`}
                </p>
              )}
            />
          </Case>
        </Group>

        <Group
          id="command-center-5a"
          title="Command Center (5a)"
          note="Backend dark: the snapshot is real, the incident/operation/fleet sources behind it are not claimed. Four panels carry four verdicts — there is no page-level health badge to be wrong."
          surface="deployments"
        >
          {(["busy", "empty", "partial", "stale", "unavailable"] as const).map((name) => {
            const parsed = readCommandCenter(CC_FIXTURES[name]);
            return parsed ? (
              <Case key={name} caption={`${name} — panel states read from the contract, never merged`}>
                <CommandCenterLive snapshot={parsed} />
              </Case>
            ) : null;
          })}
        </Group>

        <Group
          id="admin-action-drawer-1i"
          title="Admin Action Drawer (1i)"
          note="Sixty-four canonical actions, grouped by the server. Revision 2 marks the relay DISABLED and every entry unreachable, so the screen lists what exists and says why each is out of reach — it offers nothing to press."
          surface="deployments"
        >
          <Case caption="the catalogue as published — every action visible, every one explained">
            <AdminCatalogueContainer api={WIRED_API} />
          </Case>
          <Case caption="a non-Admin actor — denied, and the catalogue does not leak through the message">
            <AdminActionDrawerScreen
              catalogue={null}
              status="denied"
              reason="The command catalogue is available to Admin operators only."
              selected={null}
              onSelect={() => {}}
            />
          </Case>
        </Group>

        <Group
          id="full-blotter-4c"
          title="Full Blotter (4c)"
          note="Ten to the seventh rows. The chips re-query rather than filtering what is loaded, and both counts come from the server."
          surface="deployments"
        >
          <Case caption="a page, with a chart cross-filter narrowing it">
            <FullBlotterPreview initialFilter="FILLED" />
          </Case>
          <Case caption="the funnel with a broker acknowledgement nobody observed — MISSING, never inferred from the fills that followed">
            <OrderFunnelStrip funnel={readOrderFunnel(FUNNEL_MISSING_BROKER_ACK)} status="ok" />
          </Case>
          <Case caption="a bounded window — 4 of 4,180 events, and the screen says so instead of reading as a complete history">
            <OrderFunnelStrip funnel={readOrderFunnel(FUNNEL_BOUNDED)} status="ok" />
          </Case>
          <Case caption="the same funnel fetched THROUGH the port — the join the props above skip">
            <FullBlotterFunnelContainer api={WIRED_API} orderId="order-1" />
          </Case>
        </Group>

        <Group
          id="paper-workbench-1c-and-its-vn-variant-4h"
          title="Paper Workbench (1c) and its VN variant (4h)"
          note="One component. The VN screen is the same code with a calendar attached."
          surface="deployments"
        >
          <Case caption="gate unmet — the CTA names each missing criterion rather than counting them">
            <PaperWorkbenchPreview deploymentId="dep_74" />
          </Case>
          <Case caption="gate met — the exit is reachable">
            <PaperWorkbenchPreview deploymentId="dep_74" initial={GATE_MET} />
          </Case>
          <Case caption="stale projection — last good values kept and marked, orders still authoritative in the Execution cell">
            <PaperWorkbenchPreview deploymentId="dep_74" initial={STALE} />
          </Case>
          <Case caption="VN market closed — PAUSED, not STALE, and the banner is INFO because a shut market is not a fault">
            <PaperWorkbenchPreview deploymentId="dep_102" variant="vnm" />
          </Case>
          <Case caption="VN market open — the same screen with the calendar banner gone">
            <PaperWorkbenchPreview deploymentId="dep_102" variant="vnm" initial={VNM_OPEN} />
          </Case>
        </Group>

        <Group
          id="alpha-360-2a-2b"
          title="Alpha 360° (2a+2b)"
          note="Nine tabs under one scope. Bounded panels cap; unbounded ones page."
          surface="deployments"
        >
          <Case caption="the wireframe's cast — four venues, three deployments, three of twelve tiles unable to draw">
            <AlphaThreeSixtyPreview alphaId="av_2041" initial={{ tab: "Insight Charts" }} />
          </Case>
          <Case caption="the runtime's cast — 22 venues, 60 deployments, and the shard that stopped publishing survives the cap">
            <AlphaThreeSixtyPreview alphaId="av_2041" initial={alpha360AtScale()} />
          </Case>
        </Group>

        <Group
          id="portfolio-360-1h-3a"
          title="Portfolio 360° (1h→3a)"
          note="150 is a transport limit, not a rendering one: past the cell budget the leader lens becomes the primary view."
          surface="deployments"
        >
          <Case caption="the drawn cast — a full matrix, with MM's whole row dashed because nine days is not enough history">
            <PortfolioThreeSixtyPreview portfolioId="PF-CRYPTO" initial={{ tab: "Structure & Correlation" }} />
          </Case>
          <Case caption="150 entities — 22,500 cells nobody can lay out, so one alpha's row at a time">
            <PortfolioThreeSixtyPreview
              portfolioId="PF-CRYPTO"
              initial={{ tab: "Structure & Correlation", correlation: CORRELATION_CEILING }}
            />
          </Case>
          <Case caption="the capital ledger, bucketed by currency with the server's own direction on every entry">
            <PortfolioThreeSixtyPreview portfolioId="PF-CRYPTO" initial={{ tab: "Capital Ledger" }} />
          </Case>
        </Group>

        <Group
          id="account-broker-360-1g"
          title="Account / Broker 360° (1g)"
          note="Three authorities side by side, and an aggregate the screen shows but never computes."
          surface="deployments"
        >
          <Case caption="within headroom, full population">
            <AccountBroker360Preview accountId="acct-live-grid-v21" />
          </Case>
          <Case caption="breached — every linked account fails closed until it clears">
            <AccountBroker360Preview accountId="acct-live-grid-v21" initial={{ aggregate: HEADROOM_EXCEEDED }} />
          </Case>
          <Case caption="21 of 24 accounts reported — a sum, and the screen refuses to call it the total">
            <AccountBroker360Preview accountId="acct-live-grid-v21" initial={{ exposure: PARTIAL_EXPOSURE }} />
          </Case>
          <Case caption="no aggregate published — unavailable with the reason, never a silent green">
            <AccountBroker360Preview accountId="acct-live-grid-v21" initial={{ aggregate: null }} />
          </Case>
        </Group>
      </div>
    </ExecutionSurface>
  );
}
