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
  EnvironmentBadge,
  FreshnessIndicator,
  OperationStatusChip,
  OrderStatusChip,
  RuntimeStateChip,
  StatusChip,
} from "./components/badges";
import { ChartTile } from "./components/chart";
import { CommandPlanDrawer } from "./components/drawer";
import { EvidencePanel, SlaCell } from "./components/evidence";
import { GuardBand, LifecycleRail, ObservationProgress, stageRail } from "./components/lifecycle";
import { VenueIdentity, VenueScope } from "./components/scope";
import { CapNotice, CommissionedPanel, PanelState } from "./components/states";
import type {
  Envelope,
  FreshnessState,
  OperationStatus,
  OrderStatus,
  PanelStatus,
  PromotionStage,
  VenueCode,
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
      </div>
    </ExecutionSurface>
  );
}
