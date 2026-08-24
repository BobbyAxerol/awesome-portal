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
import { useId } from "react";
import type { ReactNode } from "react";

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
import { AuthorityBadge, EnvironmentBadge, StatusChip } from "../components/badges";
import { ChartTile } from "../components/chart";
import { LifecycleRail, ObservationProgress, stageRail } from "../components/lifecycle";
import { KeysetTable, type Column } from "../components/table";
import { PanelState } from "../components/states";
import { capNotice, capPreserving } from "../components/cap";
import { formatUntil, sessionState, type VenueCalendar } from "../vnCalendar";
import { ExecutionSurface } from "../ExecutionSurface";

/** Session and drift rows are bounded per deployment; orders and fills are not. */
const SESSION_BUDGET = 20;
const DRIFT_BUDGET = 24;

export const WORKBENCH_TABS = ["Orders", "Fills", "Positions", "Sessions"] as const;
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
  equity: { envelope: ChartEnvelope; body?: ReactNode } | null;
  /** The observation gate. Beside the chart, never below it. */
  observation: {
    items: readonly (Progress & { label: string })[];
    rule?: string;
    met: boolean;
  };
  /** Named, so "blocked" is an instruction rather than a refusal. */
  unmetCriteria: readonly string[];
  onRequestExit?: () => void;
  drift: readonly DriftRow[];
  driftNote?: string | null;
  runtime: readonly { label: string; value: string | null; note?: string | null }[];
  accounting: readonly { label: string; value: string | null; note?: string | null }[];
  contribution: readonly { label: string; value: string | null; note?: string | null }[];
  tab: WorkbenchTab;
  onTabChange?: (tab: WorkbenchTab) => void;
  /** Unbounded: orders and fills carry no retention policy. Paged, never capped. */
  orders?: KeysetPage<WorkbenchOrder> | null;
  fills?: KeysetPage<WorkbenchFill> | null;
  positions?: KeysetPage<WorkbenchPosition> | null;
  onLoadOlder?: (tab: WorkbenchTab) => void;
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
  onAdminActions?: () => void;
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

  // A venue calendar changes what "not moving" means. Outside the session the
  // data is exactly as fresh as the market allows, and calling that STALE
  // sends an operator hunting a fault in a system working correctly.
  const session = calendar && venueLocalTime ? sessionState(venueLocalTime, calendar) : null;
  const closed = session?.phase === "CLOSED_BY_CALENDAR";
  const stale = envelope.freshness === "STALE" && !closed;
  const exitBlocked = !observation.met || unmetCriteria.length > 0;
  const shownSessions = capPreserving(
    sessions,
    SESSION_BUDGET,
    // A session that did not close cleanly is the row worth keeping.
    (row) => row.state !== "CLOSED" || Boolean(row.detail && !row.detail.includes("clean")),
  );
  const sessionNotice = capNotice(shownSessions, "sessions");
  const shownDrift = capPreserving(drift, DRIFT_BUDGET, (row) => row.verdict !== "WITHIN_BAND");
  const driftNotice = capNotice(shownDrift, "drift rows");

  // `useId`, not a literal. The tab ids and the panel id were hardcoded, so any
  // page holding two of this screen emits duplicate DOM ids — and an
  // `aria-controls` that resolves to the first match means the second screen's
  // tabs point at the FIRST screen's panel. The fixtures surface renders five
  // of one of these, so this was live on a real page, not hypothetical.
  const uid = useId();

  return (
    <ExecutionSurface kind="deployments" className="exec-paper">
      <header className="exec-inbox-head">
        <div className="exec-tile-title">
          {alphaLabel} · {deploymentId}
        </div>
        <div className="exec-blotter-note">
          {accountId} · {venue}
        </div>
        <div className="exec-alpha-identity">
          <EnvironmentBadge stage={stage} />
          {/* Two chips, deliberately together. Session state is not runtime
              state: the venue is shut and the deployment is still ACTIVE, and
              collapsing them would report a healthy deployment as stopped. */}
          {closed ? <StatusChip label="SUSPENDED_BY_CALENDAR" tone="mute" /> : null}
          <StatusChip
            label={readiness}
            tone={readiness === "READY" ? "good" : readiness === "BLOCKED" ? "bad" : "warn"}
          />
          <AuthorityBadge envelope={envelope} />
          {/* Hidden, not disabled: a control an actor may never use is a
              question they will keep asking. */}
          {operatorAdmin ? (
            <button type="button" className="exec-btn-ghost" onClick={onAdminActions}>
              Admin actions
            </button>
          ) : null}
        </div>
      </header>

      {/* Every id a chip, because each is a thing a reviewer may need to open.
          A lineage printed as prose is a lineage nobody follows. */}
      <div className="exec-paper-lineage">
        {lineage.map((entry) => (
          <span key={entry.label} className="exec-paper-lineageitem">
            <span className="exec-blotter-note">{entry.label}</span>
            {entry.chip.href ? (
              <a className="exec-evidence-link" href={entry.chip.href} title={entry.chip.title}>
                {entry.chip.label}
              </a>
            ) : (
              <span className="exec-num" title={entry.chip.title}>
                {entry.chip.label}
              </span>
            )}
          </span>
        ))}
      </div>

      {credential ? (
        <div className="exec-paper-credential">
          <span className="exec-blotter-note">credential</span>
          <span className="exec-num">{credential.alias}</span>
          <StatusChip
            label={credential.status}
            tone={credential.status === "VALID" ? "good" : "warn"}
          />
          {credential.expiresAt ? (
            <span className="exec-blotter-note">
              session expires {credential.expiresAt} · renewal is Execution-side, this is status
              only
            </span>
          ) : null}
        </div>
      ) : null}

      {closed && session ? (
        // INFO, not warning. Nothing is wrong: the market is shut.
        <div className="exec-paper-calendar" role="status">
          <strong>
            Market closed — reopens {calendar?.window ? "09:00" : "at open"}
            {session.reopensInMinutes !== null
              ? ` (in ${formatUntil(session.reopensInMinutes)})`
              : null}
            .
          </strong>{" "}
          Data is shown as of the last close and freshness ageing is{" "}
          <strong>paused against the venue calendar</strong> — this is not STALE. Signals
          generated off-hours queue as at-open intents and are re-validated by risk at session
          open. Session state is not runtime state: the deployment stays active.
        </div>
      ) : null}

      {stale ? (
        // The last good values stay, marked. A blank would be worse: an
        // operator can act on a number they know is old.
        <div className="exec-paper-stale" role="status">
          <strong>Projection stale.</strong> Values below are the last good ones
          {envelope.asOf ? ` as of ${envelope.asOf}` : null} — no continuity is assumed across the
          gap. Orders remain authoritative in the Execution cell, and risk fails closed there.
        </div>
      ) : null}

      <LifecycleRail steps={stageRail({ stage, r1, r2, detail: railDetail })} />

      <div className="exec-alpha-kpis">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="exec-alpha-kpi">
            <div className="exec-blotter-note">{kpi.label}</div>
            <div>
              <Num value={kpi.value} />
              {kpi.value !== null && kpi.unit ? (
                <span className="exec-blotter-note"> {kpi.unit}</span>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {/* Chart and gate side by side. The wireframe puts the gate beside the
          equity curve and not under it, and the reason is in the screen's
          purpose: Paper exists to exit Paper. */}
      <div className="exec-grid-2" data-ratio="1.35">
        {equity ? (
          <ChartTile title="Equity vs approved research evidence" envelope={equity.envelope}>
            {equity.body}
          </ChartTile>
        ) : (
          <PanelState status="unavailable" reason="No equity series was published for this window." />
        )}

        <section className="exec-gate-panel">
          <div className="exec-tile-title">Observation gate → Paper Exit</div>
          <ObservationProgress
            items={observation.items}
            rule={observation.rule}
            met={observation.met}
          />
          <div className="exec-paper-exit">
            <button
              type="button"
              className="exec-btn-apply"
              disabled={exitBlocked}
              onClick={onRequestExit}
            >
              Request Paper Exit Review
            </button>
            {exitBlocked ? (
              // Named, not counted. "3 criteria unmet" tells a reader how much
              // is wrong; the list tells them what to do about it.
              <div className="exec-disabled-reason">
                Blocked — {unmetCriteria.length}{" "}
                {unmetCriteria.length === 1 ? "criterion is" : "criteria are"} unmet:
                <ul>
                  {unmetCriteria.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <div className="exec-grid-2">
        <FactPanel title="Runtime health" rows={runtime} />
        <FactPanel title="Accounting" rows={accounting} />
      </div>

      <div className="exec-grid-2">
        <FactPanel title="Portfolio contribution · rolling correlation" rows={contribution} />

        <section className="exec-gate-panel">
          <div className="exec-tile-title">Drift vs approved evidence</div>
          <div className="exec-scroll-x">
          <table className="exec-360-sync">
            <caption className="exec-blotter-note">
              {/* The fallback used to assert the linkage: with no note
                  published the caption read "Linked to the approved run by
                  artifact digest," which is a provenance claim invented out of
                  silence — on the one panel whose job is to report divergence.
                  `driftNote` carries the server's own sentence; absence of it
                  is absence of the statement, not confirmation. */}
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
                    {/* The server's verdict. What "within band" means is a
                        policy the approval was granted against, not a
                        comparison the browser is entitled to make. */}
                    <StatusChip label={row.verdict} tone={DRIFT_TONE[row.verdict]} />
                    {row.note ? <span className="exec-blotter-note"> {row.note}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {driftNotice ? <p className="exec-blotter-note">{driftNotice}</p> : null}
          <p className="exec-blotter-note">
            These gates feed Paper Exit Review — a WATCH item blocks nothing, a FAIL item blocks
            the exit.
          </p>
        </section>
      </div>

      <div className="exec-alpha-tabs" role="tablist" aria-label="Deployment activity">
        {WORKBENCH_TABS.map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            id={`${uid}-tab-${option}`}
            aria-controls={`${uid}-tabpanel`}
            className="exec-inbox-filter"
            data-active={tab === option ? "true" : undefined}
            aria-selected={tab === option}
            onClick={() => onTabChange?.(option)}
          >
            {option}
          </button>
        ))}
      </div>

      <div
        className="exec-alpha-body"
        role="tabpanel"
        id={`${uid}-tabpanel`}
        aria-labelledby={`${uid}-tab-${tab}`}
      >
        {tab === "Orders" ? <Orders orders={orders} onLoadOlder={onLoadOlder} /> : null}
        {tab === "Fills" ? <Fills fills={fills} onLoadOlder={onLoadOlder} /> : null}
        {tab === "Positions" ? <Positions positions={positions} onLoadOlder={onLoadOlder} /> : null}
        {tab === "Sessions" ? (
          <section className="exec-gate-panel">
            <div className="exec-tile-title">Sessions</div>
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
            {sessionNotice ? <p className="exec-blotter-note">{sessionNotice}</p> : null}
          </section>
        ) : null}
      </div>
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
      onLoadOlder={() => onLoadOlder?.("Orders")}
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
      onLoadOlder={() => onLoadOlder?.("Fills")}
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
      onLoadOlder={() => onLoadOlder?.("Positions")}
    />
  ) : (
    <PanelState status="loading" reason="Loading positions." />
  );
}
