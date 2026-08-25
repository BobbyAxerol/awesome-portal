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
import type { ReactNode } from "react";
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
    ...(credential
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
      Request Paper Exit Review
    </button>
  );
  const rail = (
    <ExecutionContextRail
      next={{
        title: "Next: Paper Exit Review",
        detail: (
          <>
            <ObservationProgress items={observation.items} rule={observation.rule} met={observation.met} />

          </>
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
    <ExecutionSurface kind="deployments" className="exec-paper">
      <ExecutionWorkspace layout="balanced" rail={rail}>
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
              {/* Hidden, not disabled: a control an actor may never use is a
                  question they will keep asking. */}
              {operatorAdmin ? (
                <button type="button" className="exec-btn-ghost" onClick={onAdminActions}>
                  Admin actions
                </button>
              ) : null}
            </>
          }
        />
        {calendar ? (
          <SessionTimeline calendar={calendar} venueLocalTime={venueLocalTime} phase={session?.phase ?? null} />
        ) : null}
        {closed && session ? (
          <div className="exec-paper-calendar exec-role-body" role="status">
            <strong>
              Market closed — reopens {calendar?.window ? "09:00" : "at open"}
              {session.reopensInMinutes !== null ? ` (in ${formatUntil(session.reopensInMinutes)})` : null}
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
        <LifecycleRail steps={stageRail({ stage, r1, r2, detail: railDetail })} />
        <ExecutionDecisionStrip
          metrics={kpis.map((kpi) => ({ label: kpi.label, value: kpi.value, unit: kpi.unit ?? null }))}
        />
        {equity ? (
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
          <div className="exec-visual-grid">
            <div className="exec-visual-row">
              <HistogramChart hist={visuals.latency} warning={visuals.warning} />
              {visuals.sparks.map((s) => <SparkTile key={s.label} spark={s} warning={visuals.warning} />)}
            </div>
            <CapGauges title="Observation policy · consumed" items={visuals.caps} warning={visuals.warning} />
          </div>
        ) : null}
        <ExecutionTabs tabs={tabs} active={tab} onChange={(key) => onTabChange(key as WorkbenchTab)} label="Deployment activity">
          {tab === "Overview" ? <FactPanel title="Runtime health" rows={runtime} /> : null}
          {tab === "Orders" ? <Orders orders={orders} onLoadOlder={onLoadOlder} /> : null}
          {tab === "Fills" ? <Fills fills={fills} onLoadOlder={onLoadOlder} /> : null}
          {tab === "Positions" ? <Positions positions={positions} onLoadOlder={onLoadOlder} /> : null}
          {tab === "Accounting" ? <FactPanel title="Accounting" rows={accounting} /> : null}
          {tab === "Evidence" ? (
            <div className="exec-fixtures-stack">
              <section className="exec-gate-panel">
                <ExecutionSectionTitle>Drift vs approved evidence</ExecutionSectionTitle>
                <div className="exec-scroll-x">
                  <table className="exec-360-sync">
                    <caption className="exec-blotter-note">
                      {/* `driftNote` carries the server's own sentence; absence
                          of it is absence of the statement, not confirmation. */}
                      {driftNote ?? "No linkage to the approved run is stated. Absence is not a match."}
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
                      {shownDrift.shown.map((row) => (
                        <tr key={row.label} data-verdict={row.verdict}>
                          <th scope="row">{row.label}</th>
                          <td>
                            <Num value={row.expected} />
                          </td>
                          <td>
                            <Num value={row.observed} />
                          </td>
                          <td>
                            {/* The server's verdict — "within band" is policy, not a browser comparison. */}
                            <StatusChip label={row.verdict} tone={DRIFT_TONE[row.verdict]} />
                            {row.note ? <span className="exec-blotter-note"> {row.note}</span> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {driftNotice ? <p className="exec-blotter-note">{driftNotice}</p> : null}
                <details>
                  <summary>How drift feeds Paper Exit Review</summary>
                  <p className="exec-evidence-caption">
                    A WATCH item blocks nothing; a FAIL item blocks the exit.
                  </p>
                </details>
              </section>
              <FactPanel title="Portfolio contribution · rolling correlation" rows={contribution} />
            </div>
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
      </ExecutionWorkspace>
    </ExecutionSurface>
  );
}

function FactPanel({
  title,
  rows,
}: {
  title: string;
  rows: readonly { label: string; value: string | null; note?: string | null }[];
}) {
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
