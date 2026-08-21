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
import { useState } from "react";

import { ExecutionSurface } from "./ExecutionSurface";
import {
  AuthorityBadge,
  BrokerSyncChip,
  CapabilityChip,
  EnvironmentBadge,
  FreshnessIndicator,
  OperationStatusChip,
  OrderStatusChip,
  ProfileBadge,
  RuntimeStateChip,
  StatusChip,
  VerificationChip,
} from "./components/badges";
import { ChartTile } from "./components/chart";
import { CommandPlanDrawer } from "./components/drawer";
import { EvidencePanel, SlaCell } from "./components/evidence";
import { GuardBand, LifecycleRail, ObservationProgress, stageRail } from "./components/lifecycle";
import { VenueIdentity, VenueScope } from "./components/scope";
import { CapNotice, CommissionedPanel, PanelState } from "./components/states";
import { KeysetTable, type Column } from "./components/table";
import { ApprovalInbox, type ApprovalRow } from "./screens/ApprovalInbox";
import { GateR1Review } from "./screens/GateR1Review";
import {
  PROFILE_ORDER,
  profileNeedsLabel,
  reconcilePanelProfile,
  screenDeliveryPolicy,
} from "./profile";
import type {
  CapabilityState,
  DeliveryProfile,
  Envelope,
  FreshnessState,
  OperationStatus,
  OrderStatus,
  PanelStatus,
  PromotionStage,
  VenueCode,
  VerificationResult,
} from "./contracts";

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
const INBOX_ROWS: ApprovalRow[] = [
  {
    id: "AP-352",
    gate: "R2",
    subject: "Carry v3.2 → PF-MAIN",
    target: "paper · BINANCE",
    blockerCount: 1,
    blockerSummary: "broker sync stale",
    sla: { ageMinutes: 26 * 60, budgetMinutes: 24 * 60 },
    quorumMet: 0,
    quorumRequired: 2,
    inert: null,
    needsYou: true,
  },
  {
    id: "AP-341",
    gate: "R2",
    subject: "MM v1.1 → OKX sandbox",
    target: "sandbox · OKX",
    blockerCount: 0,
    blockerSummary: "none",
    sla: { ageMinutes: 6 * 60, budgetMinutes: 24 * 60 },
    quorumMet: 1,
    quorumRequired: 2,
    inert: "QUORUM",
    needsYou: false,
  },
  {
    id: "AP-259",
    gate: "R1",
    subject: "Grid v2.2 · RC-49",
    target: "research · R1",
    blockerCount: 0,
    blockerSummary: "none",
    sla: { ageMinutes: 4 * 60, budgetMinutes: 48 * 60 },
    quorumMet: 0,
    quorumRequired: 2,
    // You wrote it. It stays in the list, dimmed, because a queue that hides
    // its un-actionable rows lies about its own size.
    inert: "SELF",
    needsYou: false,
  },
  {
    id: "EX-771",
    gate: "PAPER_EXIT",
    subject: "Grid v2.1 · dep_94",
    target: "paper · BINANCE",
    blockerCount: 0,
    blockerSummary: "observation gate met",
    sla: { ageMinutes: 9 * 60, budgetMinutes: 48 * 60 },
    quorumMet: 0,
    quorumRequired: 2,
    inert: null,
    needsYou: true,
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

function Group({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="exec-fixtures-group">
      <h2 className="exec-fixtures-heading">{title}</h2>
      {note ? <p className="exec-fixtures-note">{note}</p> : null}
      {children}
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
  const [venues, setVenues] = useState<VenueCode[]>([]);

  return (
    <ExecutionSurface>
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
          title="LifecycleRail"
          note="Screen-level on workbenches only. On Alpha 360° and Portfolio 360° the lifecycle is per-deployment (DS §9 note 1), because the whole point of those screens is that one alpha is in several stages at once."
        >
          <Case caption="Carry v3.2 · dep_74 · paper, 12 of 30 days">
            <LifecycleRail
              steps={stageRail({
                stage: "PAPER_OBSERVATION",
                r1: { label: "AP-101", href: "#ap-101" },
                r2: { label: "AP-207", href: "#ap-207" },
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
          title="CommandPlanDrawer"
          note="The only path to a mutation. Apply reports every unmet condition rather than the first, because a button that says only `disabled` makes an operator guess which of four things to fix."
        >
          <div className="exec-fixtures-grid">
            <Case caption="no plan yet — apply blocked, reasons listed">
              <CommandPlanDrawer
                title="Allocate capital"
                meta="PF-MAIN → Carry v3.2 · dep_77 · OKX TESTNET"
                step="plan"
                plan={null}
              />
            </Case>
            <Case caption="planned — reason still required">
              <CommandPlanDrawer
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
              <CommandPlanDrawer
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
              <CommandPlanDrawer
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
          title="Phase 1 — Approval Inbox (states only)"
          note="Lane A: props and fixtures. Real integration waits on EX-BE-04a and EX-BE-05a, neither of which needs the Rust edge, AWS or the Trading System. AP-259 is dimmed because you wrote it — it stays in the list, because a queue that hides its un-actionable rows lies about its own size."
        >
          <div className="exec-fixtures-stack">
            <Case caption="populated — one overdue, one awaiting quorum, one blocked by separation of duty">
              <ApprovalInbox
                page={{ rows: INBOX_ROWS, totalCount: 5, filteredCount: 4 }}
                counts={{ pending: 5, overdue: 1, dueSoon: 1 }}
                filter="INBOX"
                policyVersion="approval.v3"
                actor="Lan"
                actorRoles={["Quant Reviewer", "Ops Approver"]}
                decided={{ rows: INBOX_ROWS.slice(2, 3), totalCount: 2 }}
              />
            </Case>
            <Case caption="inbox zero — an empty queue is a result, not a failure">
              <ApprovalInbox
                page={{ rows: [], totalCount: 0 }}
                counts={{ pending: 0, overdue: 0, dueSoon: 0 }}
                filter="INBOX"
                policyVersion="approval.v3"
                actor="Lan"
              />
            </Case>
            <Case caption="loading — no counts yet, and none invented">
              <ApprovalInbox page={{ rows: [], totalCount: 0 }} counts={null} filter="INBOX" status="loading" />
            </Case>
            <Case caption="partial — rows are real, the queue may be incomplete">
              <ApprovalInbox
                page={{ rows: INBOX_ROWS.slice(0, 2), totalCount: 5, filteredCount: 2 }}
                counts={{ pending: 5, overdue: 1, dueSoon: 1 }}
                filter="INBOX"
                status="partial"
                partialReason="Broker sync could not be read for 2 of 5 requests."
              />
            </Case>
            <Case caption="denied — the viewer lacks the scope, which is not an empty queue">
              <ApprovalInbox
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
          title="Phase 2 — Gate R1 Review (states only)"
          note="The screen exists to make one refusal impossible to work around. Separation of duty is derived from creator vs actor rather than trusted from a prop, and Deny is never locked: a reviewer who cannot approve can always refuse."
        >
          <div className="exec-fixtures-stack">
            <Case caption="separation of duty OK — one warning, no blockers, Approve available">
              <GateR1Review
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
              <GateR1Review
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
              <GateR1Review
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
              <GateR1Review
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
              <GateR1Review
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
          title="Risk tier and delivery policy — what Apply demands"
          note="R3 and R4 are two permissions, not two rungs. R3 protects a position and needs a step-up but no second person, because waiting for one is how a live position keeps bleeding. R4 enlarges a position and needs both. A step-up satisfied for an emergency halt never carries into a capital expansion."
        >
          <div className="exec-fixtures-stack">
            <Case caption="R3 protective — policy allows it; step-up outstanding">
              <CommandPlanDrawer
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
              <CommandPlanDrawer
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
              <CommandPlanDrawer
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
                  filteredCount: 412,
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
      </div>
    </ExecutionSurface>
  );
}
