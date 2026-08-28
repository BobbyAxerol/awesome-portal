/**
 * Phase 4 — Paper Workbench (hi-fi 1c, WF 1c, ops dark).
 *
 * The screen a deployment lives on while it earns the right to leave. That
 * framing decides the layout: the observation gate sits **beside** the equity
 * chart rather than below it, because Paper exists to exit Paper and a reader
 * who has to scroll to find out how far along they are will read the chart
 * instead and guess.
 *
 * Three rules the wireframe is explicit about and this component enforces:
 *
 *   1. **The exit CTA states which condition is unmet.** "Blocked" without a
 *      reason is a support ticket; "blocked — 3 gate criteria unmet" with the
 *      three named is an instruction.
 *   2. **A stale projection says what it does not claim.** Not a spinner and
 *      not a red panel: the last good values stay on screen, marked, with the
 *      note that orders remain authoritative in the Execution cell. An operator
 *      can act on a number they know is old; they cannot act on a blank.
 *   3. **`operatorAdmin` false hides mutation controls entirely**, rather than
 *      disabling them. A button somebody may never press is a question they
 *      will keep asking.
 */
import { Fragment, useState, type ReactNode } from "react";
import { clockOf, corrSeries, paperCandles, paperSmoke, paperVariant, researchBand, untilVnOpen, usePaperTick, vnSessions, PAPER_SMOKE_WARNING } from "../paper.smoke";
import { CandlesChart, LinesChart } from "../components/marketChart";
import { CapGauges, HistogramChart, SparkTile } from "../components/visuals";
import type { StageVisuals } from "../stage.smoke";

import type {
  ChartEnvelope,
  Envelope,
  IdChip,
  KeysetPage,
  PanelStatus,
  Progress,
  PromotionStage,
  Readiness,
} from "../contracts";
import { AuthorityBadge, StatusChip } from "../components/badges";
import { LifecycleRail, ObservationProgress, stageRail } from "../components/lifecycle";
import { KeysetTable, type Column } from "../components/table";
import { PanelState } from "../components/states";
import { capNotice, capPreserving } from "../components/cap";
import { formatUntil, sessionState, type VenueCalendar } from "../vnCalendar";
import { ExecutionSurface } from "../ExecutionSurface";
import { ExecutionSectionTitle } from "../components/typography";
import { EquityChart, type EquitySeries } from "../components/EquityChart";
import { SessionTimeline } from "../components/sessionTimeline";
import {
  ExecutionContextRail,
  ExecutionDecisionStrip,
  ExecutionPageHeader,
  ExecutionProvenanceDrawer,
  ExecutionTabs,
  ExecutionWorkspace,
  shortDigest,
  type HeaderBadge,
  type RailBlocker,
} from "../components/workspace";

/** Session and drift rows are bounded per deployment; orders and fills are not. */
const SESSION_BUDGET = 20;
const DRIFT_BUDGET = 24;

export const WORKBENCH_TABS = ["Overview", "Positions", "Orders", "Fills", "Sessions", "Accounting", "Evidence"] as const;
export type WorkbenchTab = (typeof WORKBENCH_TABS)[number];

export interface WorkbenchOrder {
  orderId: string;
  at: string;
  symbol: string;
  orderType: string;
  side: string;
  quantity: string;
  /** Both sides of a partial. One figure would read as the order. */
  filledQuantity?: string | null;
  price: string | null;
  status: string;
  rejectReason?: string | null;
  fee: string | null;
  feeCurrency: string | null;
}

export interface WorkbenchFill {
  fillId: string;
  at: string;
  symbol: string;
  quantity: string;
  price: string;
  fee: string | null;
  /** MAKER / TAKER. The venue's word, not a derived one. */
  liquidity: string | null;
}

export interface WorkbenchPosition {
  symbol: string;
  side: "LONG" | "SHORT";
  quantity: string;
  entry: string | null;
  mark: string | null;
  unrealised: string | null;
}

export interface WorkbenchSession {
  sessionId: string;
  startedAt: string;
  state: string;
  orders: number | null;
  fills: number | null;
  /** `CLOSED · clean` — the qualifier the venue reported, not one inferred. */
  detail?: string | null;
}

/**
 * One drift row: what the research said, what paper did, and the verdict.
 *
 * `verdict` is the server's. A client comparing two numbers would decide what
 * "within band" means, and the band is a policy the approval was granted
 * against — not arithmetic.
 */
export interface DriftRow {
  label: string;
  expected: string | null;
  observed: string | null;
  verdict: "WITHIN_BAND" | "WATCH" | "FAIL" | "INSUFFICIENT_DATA";
  note?: string | null;
}

export interface PaperWorkbenchProps {
  alphaLabel: string;
  deploymentId: string;
  accountId: string;
  venue: string;
  stage: PromotionStage;
  readiness: Readiness;
  envelope: Envelope;
  /** Every id a chip, as the lineage strip draws them. */
  lineage: readonly { label: string; chip: IdChip }[];
  r1?: IdChip;
  r2?: IdChip;
  /** `12/30 days · 184/300 trades` — the current stage's detail on the rail. */
  railDetail?: string;
  kpis: readonly { label: string; value: string | null; unit?: string | null }[];
  /** Stage visuals (smoke until BR-EX-41). Absent = honest states only. */
  visuals?: StageVisuals;
  equity: {
    envelope: ChartEnvelope;
    /** null/absent = contract publishes no series (BR-EX-34) → honest compact state */
    series?: EquitySeries | null;
    body?: ReactNode;
  } | null;
  /** The observation gate. Beside the chart, never below it. */
  observation: {
    items: readonly (Progress & { label: string })[];
    rule?: string;
    met: boolean;
  };
  /** Named, so "blocked" is an instruction rather than a refusal. */
  unmetCriteria: readonly string[];
  onRequestExit: () => void;
  drift: readonly DriftRow[];
  driftNote?: string | null;
  runtime: readonly { label: string; value: string | null; note?: string | null }[];
  accounting: readonly { label: string; value: string | null; note?: string | null }[];
  contribution: readonly { label: string; value: string | null; note?: string | null }[];
  tab: WorkbenchTab;
  onTabChange: (tab: WorkbenchTab) => void;
  /** Unbounded: orders and fills carry no retention policy. Paged, never capped. */
  orders?: KeysetPage<WorkbenchOrder> | null;
  fills?: KeysetPage<WorkbenchFill> | null;
  positions?: KeysetPage<WorkbenchPosition> | null;
  onLoadOlder: (tab: WorkbenchTab) => void;
  sessions: readonly WorkbenchSession[];
  /**
   * The venue's trading calendar, for venues that have one.
   *
   * Present turns this into the session-aware variant (phase 13): the header
   * carries a session chip beside the runtime chip, the banner explains a
   * closure in INFO tone rather than warning, and freshness reads `PAUSED`
   * rather than `STALE`. Absent leaves the 24/7 crypto screen exactly as it
   * was — the variant is a prop, not a fork.
   */
  calendar?: VenueCalendar | null;
  /** The venue's own local time. Never derived from the browser clock. */
  venueLocalTime?: string | null;
  /**
   * Credential status only. The Portal never renews anything.
   *
   * DNSE's OTP session is renewed Execution-side; this strip says whether it
   * is about to lapse so an operator is not surprised, and offers no control,
   * because offering one that does nothing is worse than offering none.
   */
  credential?: { alias: string; status: string; expiresAt?: string | null } | null;
  /** False hides every mutation control. Not disables — hides. */
  operatorAdmin?: boolean;
  onAdminActions: () => void;
  /** provenance drawer Copy — simulated control, goes through the ledger */
  onCopyProvenance: (full: string) => void;
  status?: PanelStatus;
  reason?: string;
}

function Num({ value, absent = "not published" }: { value: string | null; absent?: string }) {
  return value !== null ? (
    <span className="exec-num">{value}</span>
  ) : (
    <span className="exec-gate-unverified">{absent}</span>
  );
}

/** The hi-fi says the verdict in words beside the number, not as a chip. */
const DRIFT_WORD: Record<DriftRow["verdict"], string> = {
  WITHIN_BAND: "within band",
  WATCH: "watch",
  FAIL: "fail",
  INSUFFICIENT_DATA: "INSUFFICIENT_DATA",
};

type DriftHead = typeof import("../paper.smoke").PAPER_SMOKE_DATA.crypto.drift;

/** `Asia/Ho_Chi_Minh` → `ICT`. The venue's abbreviation, not an offset the
 *  reader has to convert. Unknown zones keep their IANA name rather than being
 *  guessed at. */
function venueZone(tz: string): string {
  return { "Asia/Ho_Chi_Minh": "ICT", "Asia/Bangkok": "ICT", "Asia/Tokyo": "JST", "Asia/Hong_Kong": "HKT", "Asia/Singapore": "SGT" }[tz] ?? tz;
}

const DRIFT_TONE: Record<DriftRow["verdict"], "good" | "warn" | "bad" | "mute"> = {
  WITHIN_BAND: "good",
  WATCH: "warn",
  FAIL: "bad",
  INSUFFICIENT_DATA: "mute",
};

export function PaperWorkbench({
  visuals,
  alphaLabel,
  deploymentId,
  accountId,
  venue,
  stage,
  readiness,
  envelope,
  lineage,
  r1,
  r2,
  railDetail,
  kpis,
  equity,
  observation,
  unmetCriteria,
  onRequestExit,
  drift,
  driftNote,
  runtime,
  accounting,
  contribution,
  tab,
  onTabChange,
  orders,
  fills,
  positions,
  onLoadOlder,
  sessions,
  calendar = null,
  venueLocalTime = null,
  credential = null,
  operatorAdmin = false,
  onAdminActions,
  onCopyProvenance,
  status = "ok",
  reason,
}: PaperWorkbenchProps) {
  const smoke = paperSmoke();
  const hifi = paperVariant(Boolean(calendar));
  const { now, age } = usePaperTick();
  const [report, setReport] = useState(false);
  if (status !== "ok" && status !== "partial") {
    return (
      <ExecutionSurface kind="deployments" className="exec-paper">
        <PanelState status={status} reason={reason ?? "This deployment could not be read."} />
      </ExecutionSurface>
    );
  }
  const session = calendar && venueLocalTime ? sessionState(venueLocalTime, calendar) : null;
  const closed = session?.phase === "CLOSED_BY_CALENDAR";
  const stale = envelope.freshness === "STALE" && !closed;
  const exitBlocked = !observation.met || unmetCriteria.length > 0;
  const shownSessions = capPreserving(
    sessions,
    SESSION_BUDGET,
    (row) => row.state !== "CLOSED" || Boolean(row.detail && !row.detail.includes("clean")),
  );
  const sessionNotice = capNotice(shownSessions, "sessions");
  const shownDrift = capPreserving(drift, DRIFT_BUDGET, (row) => row.verdict !== "WITHIN_BAND");
  const driftNotice = capNotice(shownDrift, "drift rows");

  // Masthead badges on separate axes (§6.1): session state is not runtime
  // state — the venue is shut and the deployment is still ACTIVE.
  const badges: HeaderBadge[] = [
    { label: stage, axis: "stage" },
    ...(closed ? [{ label: "SUSPENDED_BY_CALENDAR", axis: "runtime", tone: "mute" } as HeaderBadge] : []),
    {
      label: readiness,
      axis: "readiness",
      tone: readiness === "READY" ? "good" : readiness === "BLOCKED" ? "bad" : "warn",
    },
    {
      label: `${envelope.authority} · ${closed ? "PAUSED" : envelope.freshness}`,
      axis: "broker-sync",
      tone: closed ? "mute" : envelope.freshness === "OK" ? "good" : envelope.freshness === "STALE" ? "bad" : "warn",
    },
  ];
  const blockers: RailBlocker[] = [
    ...unmetCriteria.map((c) => ({ label: c, detail: "observation gate", severity: "blocking" as const })),
    ...drift
      .filter((row) => row.verdict !== "WITHIN_BAND")
      .map((row) => ({
        label: `${row.label} ${row.verdict}`,
        detail: row.note ?? "drift vs approved evidence",
        severity: row.verdict === "FAIL" ? ("blocking" as const) : ("watch" as const),
      })),
  ];
  const provenanceItems = [
    ...lineage.map((entry) => {
      const isDigest = entry.chip.label.startsWith("sha256:");
      return {
        label: entry.label,
        short: isDigest ? shortDigest(entry.chip.label) : entry.chip.label,
        full: isDigest ? entry.chip.label : entry.chip.title ?? null,
        href: entry.chip.href ?? null,
      };
    }),
    ...(credential && !hifi
      ? [
          {
            label: "credential",
            short: `${credential.alias} · ${credential.status}${credential.expiresAt ? ` · session expires ${credential.expiresAt}` : ""}`,
            full: null,
          },
        ]
      : []),
  ];
  const exitTitle = exitBlocked
    ? `Blocked — ${unmetCriteria.length} ${unmetCriteria.length === 1 ? "criterion" : "criteria"} unmet: ${unmetCriteria.join("; ") || "observation gate not met"}`
    : undefined;
  const exitCta = (
    <button
      type="button"
      className="exec-role-control exec-btn-apply"
      disabled={exitBlocked}
      title={exitTitle}
      onClick={onRequestExit}
    >
      {/* The hi-fi's blocked control carries its count in the label — a grey
          button with the reason only in a tooltip is a support ticket. */}
      {exitBlocked && hifi
        ? `Request Paper Exit Review — blocked: ${unmetCriteria.length || 1} gate criteria unmet`
        : "Request Paper Exit Review"}
    </button>
  );
  const rail = (
    <ExecutionContextRail
      next={{
        title: "Next: Paper Exit Review",
        detail: hifi ? (
          // The hi-fi puts the gate beside the chart, where the reader is
          // already looking; repeating its bars here would be two answers to
          // one question. The rail keeps the sentence and the blockers.
          <span className="exec-role-body">The observation gate is beside the equity chart, where the evidence it judges is.</span>
        ) : (
          <ObservationProgress items={observation.items} rule={observation.rule} met={observation.met} />
        ),
      }}
      blockers={blockers}
      freshness={
        <span className="exec-role-meta">
          {envelope.authority} · as_of {envelope.asOf ?? "—"} ·{" "}
          {closed ? "PAUSED (venue calendar)" : envelope.freshness}
        </span>
      }
      provenance={<ExecutionProvenanceDrawer items={provenanceItems} onCopy={onCopyProvenance} />}
    />
  );
  const tabs = WORKBENCH_TABS.map((key) => ({ key, label: key }));
  return (
    <ExecutionSurface
      kind="deployments"
      className={hifi ? "exec-paper exec-a3 exec-pw" : "exec-paper"}
      data-hifi-exact={hifi ? "paper-workbench" : undefined}
    >
      <ExecutionWorkspace layout="balanced" rail={rail}>
        {smoke ? (
          <>
            {/* In paper (3) — the switcher the hi-fi opens with. Needs a list
                endpoint the workbench contract does not have (BR-EX-62). */}
            <nav className="exec-pw-switch" aria-label="Deployments in paper">
              <span className="exec-pw-switchlabel">In paper ({smoke.peers.length})</span>
              {smoke.peers.map((peer) => {
                const here = peer.dep === deploymentId;
                return (
                  <a key={peer.dep} className="exec-pw-tab" href={peer.href} data-active={here ? "true" : undefined} aria-current={here ? "page" : undefined}>
                    {peer.head} —{" "}
                    {/* On the deployment being read, the progress is the
                        contract's; a smoke tail here would contradict the rail
                        four lines below it. */}
                    {here ? <b>{railDetail ?? "in observation"}</b> : peer.met ? <b className="exec-pw-met">{peer.tail}</b> : peer.tail}
                  </a>
                );
              })}
            </nav>
            <header className="exec-masthead exec-a3-masthead exec-pw-masthead">
              <div className="exec-a3-h1" role="heading" aria-level={1}>
                <a href={hifi!.alpha360Href}>{alphaLabel}</a>{" "}
                <span className="exec-a3-id">— Paper Operations{calendar ? " · VN MARKET" : ""}</span>
              </div>
              <a className="exec-pw-360" href={hifi!.alpha360Href}>Alpha 360° — all deployments →</a>
              <span className="exec-a3-kind exec-pw-stage">{stage}</span>
              {closed ? <span className="exec-pw-chip" data-tone="calendar"><span aria-hidden="true">⛔ </span>SUSPENDED_BY_CALENDAR</span> : null}
              <span className="exec-pw-chip" data-tone={readiness === "READY" ? "good" : readiness === "BLOCKED" ? "bad" : "warn"}>{readiness}</span>
              <span className="exec-a3-wf">WF {hifi!.wf}</span>
              <span className="exec-a3-spacer" />
              {/* The right-hand cluster wraps as one unit. Loose, the freshness
                  chip took the whole free line and pushed the two controls onto
                  a second row on their own. */}
              <span className="exec-pw-right">
                {/* One string carries the axis the matrix tests and the clock the
                    hi-fi ticks: authority · freshness · as_of · age. */}
                <span className="exec-a3-source exec-pw-source" data-tone={closed ? "calendar" : envelope.freshness === "STALE" ? "warn" : "good"}>
                  <b>{`${envelope.authority} · ${closed ? "PAUSED" : envelope.freshness}`}</b> · as_of {clockOf(envelope.asOf)}
                {/* A venue-local time without its zone is a time in the wrong
                    place: 14:45 ICT is not 14:45 anywhere the reader sits. */}
                {calendar ? ` ${venueZone(calendar.timezone)} close` : ""}
                  {closed ? <span className="exec-pw-paused"> · aging paused</span> : <span className="exec-pw-age"> · age {age}</span>}
                </span>
                <a className="exec-a3-btn" href="/governance/approvals">View approvals</a>
                <button type="button" className="exec-a3-btn" aria-expanded={report} onClick={() => setReport((v) => !v)}>Report</button>
                {operatorAdmin ? (
                  <button type="button" className="exec-pw-primary" onClick={onAdminActions}>Admin actions<span aria-hidden="true"> ⌄</span></button>
                ) : null}
              </span>
            </header>
            {report ? (
              <section className="exec-pw-report" aria-label="Observation report — preview">
                <header className="exec-pw-reporthead">
                  <span className="exec-pw-reporttitle">Observation report — preview</span>
                  <span className="exec-a3-spacer" />
                  <button type="button" className="exec-a3-btn" onClick={() => setReport(false)}>Close</button>
                </header>
                <p className="exec-pw-reportbody">
                  The pack would carry: the observation gate and its policy, drift vs the approved run,
                  runtime health, accounting, portfolio contribution, and the lineage above — the same
                  evidence the Paper Exit Review reads, at the digest it was read at.
                </p>
                <footer className="exec-pw-reportfoot">
                  <button type="button" className="exec-pw-primary" disabled title="Report generation lands with BR-EX-62; nothing is produced here.">Generate</button>
                  <span>preview only — the report route ships with BR-EX-62</span>
                </footer>
              </section>
            ) : null}
            <div className="exec-a3-meta exec-pw-meta">
              {lineage.map((entry) => (
                <span key={entry.label}>
                  {entry.label}{" "}
                  {entry.chip.href ? <a href={entry.chip.href}>{entry.chip.label}</a> : <b>{entry.chip.label}</b>}
                </span>
              ))}
              {credential ? (
                // One text node: an operator reads "DNSE-01 · EXPIRING · session
                // expires 08:55 ICT" as one fact, and so does a screen reader.
                <span>
                  credential{" "}
                  <b data-tone={credential.status === "VALID" ? "good" : "warn"}>
                    {`${credential.alias} · ${credential.status}${credential.expiresAt ? ` · session expires ${credential.expiresAt}` : ""}`}
                  </b>
                </span>
              ) : null}
            </div>
          </>
        ) : (
          <ExecutionPageHeader
            title={alphaLabel}
            id={deploymentId}
            badges={badges}
            purpose="Is this deployment tracking approved evidence, and is it ready to leave Paper?"
            primaryAction={exitCta}
            secondary={
              <>
                <span className="exec-role-meta">
                  {accountId} · {venue}
                </span>
                <AuthorityBadge envelope={envelope} />
                {operatorAdmin ? (
                  <button type="button" className="exec-btn-ghost" onClick={onAdminActions}>
                    Admin actions
                  </button>
                ) : null}
              </>
            }
          />
        )}
        {calendar ? (
          <SessionTimeline calendar={calendar} venueLocalTime={venueLocalTime} phase={session?.phase ?? null} />
        ) : null}
        {closed && session ? (
          <div className="exec-paper-calendar exec-role-body" role="status">
            <strong>
              Market closed — reopens {calendar?.window ? "09:00 ICT" : "at open"}
              {session.reopensInMinutes !== null ? ` (in ${smoke ? untilVnOpen(now) : formatUntil(session.reopensInMinutes)})` : null}
              .
            </strong>{" "}
            Shown as of last close; freshness ageing is{" "}
            <strong>paused against the venue calendar</strong> — this is not STALE.
            <details>
              <summary>Why the deployment stays active</summary>
              <p className="exec-evidence-caption">
                Signals generated off-hours queue as at-open intents and are re-validated by risk at
                session open. Session state is not runtime state.
              </p>
            </details>
          </div>
        ) : null}
        {stale ? (
          <div className="exec-paper-stale exec-role-body" role="status">
            <strong>Projection stale.</strong> Values are the last good ones
            {envelope.asOf ? ` as of ${envelope.asOf}` : null} — no continuity is assumed across
            the gap.
            <details>
              <summary>Where authority sits while stale</summary>
              <p className="exec-evidence-caption">
                Orders remain authoritative in the Execution cell, and risk fails closed there.
              </p>
            </details>
          </div>
        ) : null}
        {hifi ? (
          <div className="exec-pw-life">
            <LifecycleRail steps={stageRail({ stage, r1, r2, detail: railDetail })} />
            <span className="exec-pw-lifelegend">lifecycle · ✓ links its decision · ● current stage</span>
          </div>
        ) : (
          <LifecycleRail steps={stageRail({ stage, r1, r2, detail: railDetail })} />
        )}
        <ExecutionDecisionStrip
          metrics={kpis.map((kpi, i) => ({
            label: kpi.label,
            // The hi-fi's projection-age cell ticks (0.8–4.8s); a frozen 1.2s
            // beside a ticking as_of is two clocks disagreeing. Only while the
            // projection is OK — a STALE age is the contract's own figure.
            value: hifi && kpi.label === "Projection age" && envelope.freshness === "OK" && !closed ? age : kpi.value,
            unit: kpi.unit ?? null,
            // The VN hi-fi qualifies each figure with one line; the crypto one
            // does not, and inventing five lines for it would be noise.
            note: hifi?.kind === "vnm" ? (hifi.kpiNotes[i] ?? null)?.replace("{untilOpen}", untilVnOpen(now)) ?? null : null,
          }))}
        />
        {hifi ? (
          <>
            <div className="exec-pw-grid" data-ratio="1.55">
              <section className="exec-pw-panel" aria-label="Equity vs approved research evidence">
                <header className="exec-pw-head">
                  <span className="exec-pw-title">Equity vs approved research evidence</span>
                  <span className="exec-a3-spacer" />
                  <span className="exec-pw-note">{calendar ? hifi.chart.legend : hifi.chart.legend}</span>
                </header>
                <div className="exec-pw-plot exec-pw-chartplot">{hifi.kind === "vnm" ? <VnEquity asOf={envelope.asOf} /> : <CryptoEquity asOf={envelope.asOf} />}</div>
                <footer className="exec-pw-foot">
                  {hifi.kind === "vnm" ? hifi.chart.foot : `${hifi.chartFoot} · as_of ${clockOf(envelope.asOf)}`}
                </footer>
              </section>
              <section className="exec-pw-panel" aria-label="Observation gate">
                <header className="exec-pw-head">
                  <span className="exec-pw-title">Observation gate → Paper Exit</span>
                </header>
                <div className="exec-pw-gate">
                  <ObservationProgress items={observation.items} rule={observation.rule} met={observation.met} />
                  <div className="exec-pw-cta">{exitCta}</div>
                  {exitBlocked ? (
                    <ul className="exec-pw-unmet">
                      {unmetCriteria.length > 0
                        ? unmetCriteria.map((c) => <li key={c}>{c}</li>)
                        : <li>the observation gate is not met, and no criterion was named</li>}
                    </ul>
                  ) : null}
                </div>
              </section>
            </div>
            <div className="exec-pw-grid" data-ratio={hifi.kind === "crypto" ? "1.55" : "1"}>
              {hifi.kind === "crypto" ? (
                <section className="exec-pw-panel" aria-label="Orders and fills overlay">
                  <header className="exec-pw-head">
                    <span className="exec-pw-title">{hifi.overlay.title}</span>
                    <span className="exec-a3-spacer" />
                    <span className="exec-pw-note">{hifi.overlay.legend}</span>
                  </header>
                  <div className="exec-pw-plot exec-pw-chartplot"><Overlay asOf={envelope.asOf} /></div>
                  <footer className="exec-pw-foot">{hifi.overlay.foot}</footer>
                </section>
              ) : null}
              {hifi.kind === "crypto" ? (
                <div className="exec-pw-stack">
                  <FactPanel title="Runtime health" rows={runtime} hifi />
                  <FactPanel title="Accounting" rows={accounting} hifi />
                </div>
              ) : (
                <>
                  <FactPanel title="Runtime health" rows={runtime} hifi />
                  <FactPanel title="Accounting" rows={accounting} hifi />
                </>
              )}
            </div>
            <div className="exec-pw-grid" data-ratio="1">
              {hifi.kind === "crypto" ? (
                <section className="exec-pw-panel" aria-label="Portfolio contribution and rolling correlation">
                  <header className="exec-pw-head">
                    <span className="exec-pw-title">{hifi.correlation.title}</span>
                    <span className="exec-a3-spacer" />
                    <span className="exec-pw-note">{hifi.correlation.head}</span>
                  </header>
                  <div className="exec-pw-plot exec-pw-chartplot"><Correlation asOf={envelope.asOf} /></div>
                  <footer className="exec-pw-foot exec-pw-corrfoot">
                    {/* ρ is already on the chart's own labels; repeating it here
                        is the same number twice in one panel. */}
                    {contribution.filter((row) => !row.label.startsWith("ρ")).map((row) => (
                      <span key={row.label}>{row.label} <b>{row.value ?? "not published"}</b></span>
                    ))}
                    <span className="exec-pw-dim">{hifi.correlation.foot}</span>
                  </footer>
                </section>
              ) : (
                <FactPanel title="Portfolio contribution · rolling correlation" rows={contribution} hifi />
              )}
              <Drift drift={shownDrift.shown} note={driftNote} notice={driftNotice} head={hifi.drift} />
            </div>
            {equity ? (
              <details className="exec-pw-contract">
                <summary>published equity series · equity_projection.v1 — the band above is smoke until BR-EX-62</summary>
                <EquityChart title="Equity series · published" envelope={equity.envelope} series={equity.series ?? null} height={220} />
              </details>
            ) : (
              <PanelState status="unavailable" reason="No equity series was published for this window." />
            )}
          </>
        ) : equity ? (
          <EquityChart
            title="Equity vs approved research evidence"
            envelope={equity.envelope}
            series={equity.series ?? null}
            height={220}
          />
        ) : (
          <PanelState status="unavailable" reason="No equity series was published for this window." />
        )}
        {visuals ? (
          hifi ? (
            // The hi-fi has no telemetry block; BR-EX-41's tiles fold away so
            // they cannot be mistaken for part of the reviewed screen.
            <details className="exec-pw-telemetry">
              <summary>stage telemetry · smoke until BR-EX-41 (ACK latency, slippage, reject rate, observation gauges)</summary>
              <div className="exec-visual-grid">
                <div className="exec-visual-row">
                  <HistogramChart hist={visuals.latency} warning={visuals.warning} />
                  {visuals.sparks.map((s) => <SparkTile key={s.label} spark={s} warning={visuals.warning} />)}
                </div>
                <CapGauges title="Observation policy · consumed" items={visuals.caps} warning={visuals.warning} />
              </div>
            </details>
          ) : (
          <div className="exec-visual-grid">
            <div className="exec-visual-row">
              <HistogramChart hist={visuals.latency} warning={visuals.warning} />
              {visuals.sparks.map((s) => <SparkTile key={s.label} spark={s} warning={visuals.warning} />)}
            </div>
            <CapGauges title="Observation policy · consumed" items={visuals.caps} warning={visuals.warning} />
          </div>
          )
        ) : null}
        <ExecutionTabs
          tabs={tabs}
          active={tab}
          onChange={(key) => onTabChange(key as WorkbenchTab)}
          label="Deployment activity"
          trailing={hifi ? (
            <>
              {hifi.kind === "vnm" ? hifi.ordersFoot : "cursor pagination · virtualized · exact values, never abbreviated"} ·{" "}
              <a href="/deployments/blotter">full blotter →</a>
            </>
          ) : undefined}
        >
          {tab === "Overview" ? (hifi ? <PanelPointer what="Runtime health" /> : <FactPanel title="Runtime health" rows={runtime} />) : null}
          {tab === "Orders" ? <Orders orders={orders} onLoadOlder={onLoadOlder} /> : null}
          {tab === "Fills" ? <Fills fills={fills} onLoadOlder={onLoadOlder} /> : null}
          {tab === "Positions" ? <Positions positions={positions} onLoadOlder={onLoadOlder} /> : null}
          {tab === "Accounting" ? (hifi ? <PanelPointer what="Accounting" /> : <FactPanel title="Accounting" rows={accounting} />) : null}
          {tab === "Evidence" ? (
            hifi ? (
              <PanelPointer what="Drift vs approved evidence and portfolio contribution" />
            ) : (
            <div className="exec-fixtures-stack">
              <Drift drift={shownDrift.shown} note={driftNote} notice={driftNotice} head={null} />
              <FactPanel title="Portfolio contribution · rolling correlation" rows={contribution} />
            </div>
            )
          ) : null}
          {tab === "Sessions" ? (
            <section className="exec-gate-panel">
              <ExecutionSectionTitle>Sessions</ExecutionSectionTitle>
              <div className="exec-scroll-x">
                <table className="exec-360-sync">
                  <caption className="exec-blotter-note">Runtime sessions and their recovery</caption>
                  <thead>
                    <tr>
                      <th scope="col">session</th>
                      <th scope="col">started (UTC)</th>
                      <th scope="col">state</th>
                      <th scope="col">orders</th>
                      <th scope="col">fills</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownSessions.shown.map((row) => (
                      <tr key={row.sessionId}>
                        <th scope="row">{row.sessionId}</th>
                        <td>
                          <span className="exec-num">{row.startedAt}</span>
                        </td>
                        <td>
                          {row.state}
                          {row.detail ? <span className="exec-blotter-note"> · {row.detail}</span> : null}
                        </td>
                        <td>
                          <Num value={row.orders !== null ? String(row.orders) : null} absent="not counted" />
                        </td>
                        <td>
                          <Num value={row.fills !== null ? String(row.fills) : null} absent="not counted" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {sessionNotice ? <p className="exec-blotter-note">{sessionNotice}</p> : null}
            </section>
          ) : null}
        </ExecutionTabs>
        {smoke ? <p className="exec-af-smoke">! {PAPER_SMOKE_WARNING}</p> : null}
      </ExecutionWorkspace>
    </ExecutionSurface>
  );
}


/**
 * The hi-fi puts runtime health, accounting, drift and contribution on the
 * page itself. The tab that used to hold one of them says where it went rather
 * than rendering it twice — two copies of a figure is two things to keep in
 * agreement.
 */
function PanelPointer({ what }: { what: string }) {
  return <p className="exec-pw-pointer">{what} is on the workbench above — it is not repeated here.</p>;
}


/** Drift vs the backtest expectation: dashed expected, solid paper, ±1σ band. */
function DriftChart() {
  const rows = researchBand(12, "2026-08-22", 0.02);
  return (
    <LinesChart
      height={150}
      series={[
        { name: "backtest expected", tone: "mute", dashed: true, width: 1.4, points: rows.map((r) => [r.t, r.bt] as const) },
        { name: "paper", tone: "good", width: 2, points: rows.map((r) => [r.t, r.pp] as const) },
      ]}
      band={{ points: rows.map((r) => [r.t, r.lo, r.hi] as const) }}
      yFormatter={(v) => `${v.toFixed(1)}pt`}
      provenance={{ authority: "DERIVED", asOf: "2026-08-22", formula: "drift.v1 · run_5512" }}
      ariaLabel="Paper against the backtest expectation, inside a one-sigma band"
    />
  );
}

/** Equity vs the approved run: expected band, backtest dashed, paper solid. */
function CryptoEquity({ asOf }: { asOf: string | null }) {
  const rows = researchBand(30, "2026-08-22", 0.012);
  // The projection's own annotation — the KPI strip's −2.14% max drawdown,
  // placed on the day it happened. The chart repeats, it never recomputes.
  const dd = rows.reduce((min, r) => (r.pp < min.pp ? r : min), rows[0]);
  return (
    <LinesChart
      height={230}
      series={[
        { name: "backtest", tone: "mute", dashed: true, width: 1.4, points: rows.map((r) => [r.t, r.bt] as const) },
        { name: "paper", tone: "accent", width: 2, points: rows.map((r) => [r.t, r.pp] as const) },
      ]}
      band={{ points: rows.map((r) => [r.t, r.lo, r.hi] as const) }}
      annotation={{ t: dd.t, v: dd.pp, label: "DD −2.14% · Aug 12", tone: "bad" }}
      yFormatter={(v) => `${v.toFixed(1)}%`}
      provenance={{ authority: "EXECUTION", asOf: asOf ?? "—", formula: "equity_projection.v1" }}
      ariaLabel="Paper equity against the backtest line and the expected band"
    />
  );
}

/** VN equity: the line exists only inside a session; the closed windows are the venue's calendar, drawn as areas. */
function VnEquity({ asOf }: { asOf: string | null }) {
  const vn = vnSessions();
  return (
    <LinesChart
      height={230}
      series={[{ name: "equity", tone: "accent", width: 2, points: vn.points }]}
      closedWindows={vn.closed}
      annotation={{ t: vn.frozen.t, v: vn.frozen.v, label: "frozen at close", tone: "accent" }}
      yFormatter={(v) => `${(v / 1_000_000).toFixed(0)}M`}
      provenance={{ authority: "EXECUTION", asOf: asOf ?? "—", formula: "equity_projection.v1" }}
      ariaLabel="Equity by session, shaded where the market is closed"
    />
  );
}

/** Real candles with the order journal on them — a marker answers the hover with its order. */
function Overlay({ asOf }: { asOf: string | null }) {
  const { candles, markers } = paperCandles();
  return (
    <CandlesChart
      height={210}
      candles={candles}
      markers={markers}
      provenance={{ authority: "EXECUTION", asOf: asOf ?? "—", formula: "BINANCE data_layer snapshot ds_5512" }}
      ariaLabel="Candles with order and fill markers"
    />
  );
}

/** Rolling correlation vs portfolio and benchmark, around rho = 0. */
function Correlation({ asOf }: { asOf: string | null }) {
  const rows = corrSeries("2026-08-22");
  return (
    <LinesChart
      height={170}
      series={[
        { name: "ρ vs portfolio", tone: "accent", width: 2, points: rows.map((r) => [r.t, r.pf] as const) },
        { name: "ρ vs benchmark", tone: "paper", dashed: true, width: 1.4, points: rows.map((r) => [r.t, r.bm] as const) },
      ]}
      zeroLine={{ label: "ρ = 0" }}
      yFormatter={(v) => v.toFixed(2)}
      provenance={{ authority: "DERIVED", asOf: asOf ?? "—", formula: "corr.v1 · cov_30d_v2" }}
      ariaLabel="Rolling correlation vs portfolio and benchmark"
    />
  );
}

/**
 * Drift vs the approved run. The verdict column is the server's — "within
 * band" is the policy the approval was granted against, not arithmetic the
 * browser can redo — and the caption never manufactures a linkage from silence.
 */
function Drift({
  drift,
  note,
  notice,
  head,
}: {
  drift: readonly DriftRow[];
  note?: string | null;
  notice: string | null;
  head: DriftHead | null;
}) {
  const table = (
    <div className="exec-scroll-x">
      <table className="exec-360-sync">
        <caption className="exec-blotter-note">
          {/* `driftNote` carries the server's own sentence; absence of it is
              absence of the statement, not confirmation. */}
          {note ?? "No linkage to the approved run is stated. Absence is not a match."}
        </caption>
        <thead>
          <tr>
            <th scope="col">measure</th>
            <th scope="col">approved</th>
            <th scope="col">observed</th>
            <th scope="col">verdict</th>
          </tr>
        </thead>
        <tbody>
          {drift.map((row) => (
            <tr key={row.label} data-verdict={row.verdict}>
              <th scope="row">{row.label}</th>
              <td><Num value={row.expected} /></td>
              <td><Num value={row.observed} /></td>
              <td>
                <StatusChip label={row.verdict} tone={DRIFT_TONE[row.verdict]} />
                {row.note ? <span className="exec-blotter-note"> {row.note}</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  if (!head) {
    return (
      <section className="exec-gate-panel" aria-label="Drift vs approved evidence">
        <ExecutionSectionTitle>Drift vs approved evidence</ExecutionSectionTitle>
        {table}
        {notice ? <p className="exec-blotter-note">{notice}</p> : null}
        <details>
          <summary>How drift feeds Paper Exit Review</summary>
          <p className="exec-evidence-caption">A WATCH item blocks nothing; a FAIL item blocks the exit.</p>
        </details>
      </section>
    );
  }
  return (
    <section className="exec-pw-panel" aria-label="Drift vs approved evidence">
      <header className="exec-pw-head">
        <span className="exec-pw-title">Drift vs backtest</span>
        <span className="exec-pw-note">{head.legend}</span>
        <span className="exec-a3-spacer" />
        <span className="exec-pw-driftnow" data-tone={head.tone}>{head.now}</span>
        <span className="exec-pw-note">{head.run}</span>
      </header>
      <div className="exec-pw-plot exec-pw-driftplot exec-pw-chartplot">
        <DriftChart />
      </div>
      <p className="exec-pw-driftwindow">{head.window}</p>
      {/* Three columns, as the hi-fi draws them: what was approved, what paper
          did, and the server's verdict said in words beside the observation —
          not a chip in a fourth column that a half-width panel then clips. */}
      <div className="exec-pw-drift">
        <span className="exec-pw-driftk" />
        <span className="exec-pw-driftk">{head.columns[0]}</span>
        <span className="exec-pw-driftk">{head.columns[1]}</span>
        {drift.map((row) => (
          <Fragment key={row.label}>
            <span className="exec-pw-driftk">{row.label}</span>
            <span className="exec-pw-driftv">{row.expected ?? <span className="exec-pw-driftabsent">not published</span>}</span>
            <span className="exec-pw-driftv">
              {row.observed ?? <span className="exec-pw-driftabsent">not published</span>}{" "}
              <span data-tone={DRIFT_TONE[row.verdict]}>{DRIFT_WORD[row.verdict]}</span>
              {row.note ? <span className="exec-pw-driftabsent"> ({row.note})</span> : null}
            </span>
          </Fragment>
        ))}
      </div>
      {notice ? <p className="exec-pw-driftwindow">{notice}</p> : null}
      <footer className="exec-pw-foot">{head.rule}</footer>
      <details className="exec-pw-driftcontract">
        <summary>the published rows · drift.v1 — and how they feed Paper Exit Review</summary>
        <p className="exec-evidence-caption">A WATCH item blocks nothing; a FAIL item blocks the exit.</p>
        {table}
      </details>
    </section>
  );
}

function FactPanel({
  title,
  rows,
  hifi,
}: {
  title: string;
  rows: readonly { label: string; value: string | null; note?: string | null }[];
  /** The hi-fi's own grammar: mono 10px label, mono 12px value, one 5px/12px grid. */
  hifi?: boolean;
}) {
  if (hifi) {
    return (
      <section className="exec-pw-panel" aria-label={title}>
        <header className="exec-pw-head">
          <span className="exec-pw-title">{title}</span>
        </header>
        <div className="exec-pw-facts">
          {rows.map((row) => (
            <Fragment key={row.label}>
              <span className="exec-pw-factk">{row.label}</span>
              <span className="exec-pw-factv">
                {row.value ?? <span className="exec-pw-factabsent">not published</span>}
                {row.note ? <span className="exec-pw-factnote"> {row.note}</span> : null}
              </span>
            </Fragment>
          ))}
        </div>
      </section>
    );
  }
  return (
    <section className="exec-gate-panel">
      <div className="exec-tile-title">{title}</div>
      <dl className="exec-360-facts">
        {rows.map((row) => (
          <div key={row.label} className="exec-alpha-contrib">
            <dt>{row.label}</dt>
            <dd>
              <Num value={row.value} />
              {row.note ? <span className="exec-blotter-note"> {row.note}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Unbounded — `orders` has no retention policy, so this pages and never caps. */
function Orders({
  orders,
  onLoadOlder,
}: Pick<PaperWorkbenchProps, "orders" | "onLoadOlder">) {
  const columns: readonly Column<WorkbenchOrder>[] = [
    { key: "at", header: "time (UTC)", width: "10rem", render: (r) => <span className="exec-num">{r.at}</span> },
    { key: "symbol", header: "symbol", width: "8rem", render: (r) => r.symbol },
    { key: "type", header: "type / side", width: "9rem", render: (r) => `${r.orderType} ${r.side}` },
    {
      key: "qty",
      header: "qty",
      width: "9rem",
      render: (r) => (
        <span className="exec-num">
          {r.filledQuantity ? `${r.filledQuantity}/${r.quantity}` : r.quantity}
        </span>
      ),
    },
    { key: "price", header: "price", width: "9rem", render: (r) => <Num value={r.price} absent="no limit price" /> },
    {
      key: "status",
      header: "status",
      width: "14rem",
      render: (r) => (
        <>
          {r.status}
          {r.rejectReason ? <span className="exec-blotter-reason"> {r.rejectReason}</span> : null}
        </>
      ),
    },
    {
      key: "fee",
      header: "fee",
      width: "8rem",
      render: (r) => (
        <>
          <Num value={r.fee} />
          {r.fee && r.feeCurrency ? <span className="exec-blotter-ccy"> {r.feeCurrency}</span> : null}
        </>
      ),
    },
  ];
  return orders ? (
    <KeysetTable
      label="Orders for this deployment"
      columns={columns}
      page={orders}
      rowKey={(r) => r.orderId}
      minWidth={980}
      onLoadOlder={() => onLoadOlder("Orders")}
    />
  ) : (
    <PanelState status="loading" reason="Loading orders." />
  );
}

function Fills({ fills, onLoadOlder }: Pick<PaperWorkbenchProps, "fills" | "onLoadOlder">) {
  const columns: readonly Column<WorkbenchFill>[] = [
    { key: "at", header: "time (UTC)", width: "10rem", render: (r) => <span className="exec-num">{r.at}</span> },
    { key: "symbol", header: "symbol", width: "8rem", render: (r) => r.symbol },
    { key: "qty", header: "qty", width: "9rem", render: (r) => <span className="exec-num">{r.quantity}</span> },
    { key: "price", header: "price", width: "9rem", render: (r) => <span className="exec-num">{r.price}</span> },
    { key: "fee", header: "fee", width: "8rem", render: (r) => <Num value={r.fee} /> },
    { key: "liq", header: "liquidity", width: "8rem", render: (r) => <Num value={r.liquidity} absent="not stated" /> },
  ];
  return fills ? (
    <KeysetTable
      label="Fills for this deployment"
      columns={columns}
      page={fills}
      rowKey={(r) => r.fillId}
      minWidth={860}
      onLoadOlder={() => onLoadOlder("Fills")}
    />
  ) : (
    <PanelState status="loading" reason="Loading fills." />
  );
}

function Positions({
  positions,
  onLoadOlder,
}: Pick<PaperWorkbenchProps, "positions" | "onLoadOlder">) {
  const columns: readonly Column<WorkbenchPosition>[] = [
    { key: "symbol", header: "symbol", width: "9rem", render: (r) => r.symbol },
    { key: "side", header: "side", width: "6rem", render: (r) => r.side },
    { key: "qty", header: "qty", width: "9rem", render: (r) => <span className="exec-num">{r.quantity}</span> },
    { key: "entry", header: "entry", width: "9rem", render: (r) => <Num value={r.entry} /> },
    { key: "mark", header: "mark", width: "9rem", render: (r) => <Num value={r.mark} absent="not marked" /> },
    { key: "upnl", header: "uPnL", width: "9rem", render: (r) => <Num value={r.unrealised} /> },
  ];
  return positions ? (
    <KeysetTable
      label="Open positions"
      columns={columns}
      page={positions}
      rowKey={(r) => `${r.symbol}-${r.side}`}
      minWidth={820}
      onLoadOlder={() => onLoadOlder("Positions")}
    />
  ) : (
    <PanelState status="loading" reason="Loading positions." />
  );
}
