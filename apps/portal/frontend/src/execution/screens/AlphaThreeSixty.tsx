/**
 * Phase 15 — Alpha 360° (hi-fi 2a + 2b, WF 2a/2b, ops dark).
 *
 * One alpha, everything known about it, under one scope. The scope bar is the
 * screen's spine: `IMPLEMENTATION_PHASES` §15 closes this phase on *"one scope
 * change provably re-filters all 9 tabs"*, so scope is a single controlled
 * value reported upward, never nine tabs each holding their own idea of what is
 * being shown.
 *
 * Sized against the runtime, not the drawing (`workload-profile.md`):
 *
 *   - `orders`, `fills` and `domain_events` carry **no retention policy**, so
 *     Orders & Fills and Audit are unbounded and page by cursor. They are never
 *     capped, because a cap implies a population you could have seen all of.
 *   - 85 accounts and 82 DNSE symbols make Positions and Accounting hundreds of
 *     rows on a normal day, not the four the wireframe draws.
 *   - The data layer is currently missing 734 of 1,468 feeds with 21 stale.
 *     `PARTIAL` and `INSUFFICIENT_DATA` are what this screen opens in, so they
 *     are laid out as first-class states rather than as error styling.
 *
 * Venues come from the registry (hi-fi: *"venue list from registry, never
 * hardcoded"*), so a new venue appears here without a frontend release.
 */
import { useId } from "react";
import type { ReactNode } from "react";

import type {
  BrokerSync,
  ChartEnvelope,
  Envelope,
  KeysetPage,
  PanelStatus,
  PromotionStage,
  Readiness,
} from "../contracts";
import { AuthorityBadge, BrokerSyncChip, EnvironmentBadge, StatusChip } from "../components/badges";
import { ChartTile } from "../components/chart";
import { KeysetTable, type Column } from "../components/table";
import { PanelState } from "../components/states";
import { capNotice, capPreserving } from "../components/cap";
import { ExecutionSurface } from "../ExecutionSurface";

/**
 * Row budgets for the bounded panels.
 *
 * Sized so the wireframe's cast renders exactly as drawn — four venues, three
 * deployments — while a fleet-sized alpha degrades instead of growing. The
 * unbounded tabs are absent from this list on purpose: they page.
 */
const VENUE_BUDGET = 16;
const DEPLOYMENT_BUDGET = 24;
const ACCOUNTING_BUDGET = 40;
const SESSION_BUDGET = 20;

export const ALPHA_TABS = [
  "Overview",
  "Insight Charts",
  "Positions",
  "Orders & Fills",
  "Risk",
  "Sessions",
  "Accounting",
  "Reconciliation",
  "Audit",
] as const;
export type AlphaTab = (typeof ALPHA_TABS)[number];

/** The scope every panel obeys. One value, reported up, never nine copies. */
export interface AlphaScope {
  portfolio: string;
  mode: string;
  venue: string;
  window: string;
}

export interface VenueRow {
  venue: string;
  /** Stage this alpha occupies at this venue, or null for none. */
  stages: Partial<Record<PromotionStage, string>>;
  /** `planned`, `HALTED`, and anything else the registry says. */
  note?: string | null;
  brokerSync: BrokerSync;
  /** `OK 41s / policy 60s` — the lateness against its own policy. */
  syncDetail?: string | null;
}

export interface DeploymentRow {
  deploymentId: string;
  venue: string;
  mode: string;
  stage: PromotionStage;
  accountId: string;
  allocation: string | null;
  pnl: string | null;
  drawdown: string | null;
  readiness: Readiness;
  currency: string | null;
}

/** A KPI that may not be knowable. `null` renders as absent, never as zero. */
export interface Kpi {
  label: string;
  value: string | null;
  unit?: string | null;
  /** Why it is absent, when it is. */
  absentReason?: string | null;
}

export interface VenueContribution {
  venue: string;
  value: string | null;
  currency: string;
  note?: string | null;
}

/**
 * One of the twelve insight tiles.
 *
 * `INSUFFICIENT_DATA` is a state, not an error: tile 5 in the wireframe shows
 * DERIBIT with too few fills to judge execution quality, beside BINANCE with
 * enough. A tile that hid the first would imply the venue was fine.
 */
export interface InsightTile {
  index: number;
  title: string;
  envelope: ChartEnvelope;
  state: "ok" | "insufficient_data" | "unavailable";
  /** Why there is not enough, in the server's words. */
  reason?: string | null;
  body?: ReactNode;
}

export interface AlphaThreeSixtyProps {
  alphaId: string;
  alphaName: string;
  artifactDigest: string;
  owner: string;
  r1Id?: string | null;
  r2Id?: string | null;
  passportHref?: string | null;
  envelope: Envelope;
  /** Registry-supplied. The screen never hardcodes a venue list. */
  venueOptions: readonly string[];
  portfolioOptions: readonly string[];
  modeOptions: readonly string[];
  windowOptions: readonly string[];
  scope: AlphaScope;
  onScopeChange: (scope: AlphaScope) => void;
  tab: AlphaTab;
  onTabChange: (tab: AlphaTab) => void;
  venues: readonly VenueRow[];
  kpis: readonly Kpi[];
  contributions: readonly VenueContribution[];
  /**
   * Equity by stage, joined across deployments by artifact digest.
   *
   * The join is the whole point: two stages of one alpha are comparable
   * because they run the same artifact, and two alphas are not comparable at
   * all. `null` renders as unavailable rather than an empty frame.
   */
  equity?: { envelope: ChartEnvelope; body?: ReactNode } | null;
  deployments: readonly DeploymentRow[];
  tiles: readonly InsightTile[];
  /** Unbounded. Paged by cursor, never capped. */
  positions?: KeysetPage<PositionRow> | null;
  orders?: KeysetPage<OrderRow> | null;
  audit?: KeysetPage<AuditRow> | null;
  onLoadOlder: (tab: AlphaTab) => void;
  /** Row → the stage workbench that owns the deployment (HiFi 2a: "row → stage workbench"). */
  onOpenDeployment: (row: DeploymentRow) => void;
  /** Account cell → Account/Broker 360° (HiFi 2a: "account → Account 360°"). */
  onOpenAccount: (accountId: string) => void;
  accounting?: readonly AccountingRow[];
  sessions?: readonly SessionRow[];
  reconciliation?: readonly ReconciliationRow[];
  risk?: readonly RiskRow[];
  status?: PanelStatus;
  reason?: string;
}

export interface PositionRow {
  deploymentId: string;
  venue: string;
  symbol: string;
  side: "LONG" | "SHORT";
  quantity: string;
  entry: string | null;
  mark: string | null;
  unrealised: string | null;
  currency: string;
}

export interface OrderRow {
  orderId: string;
  at: string;
  deploymentId: string;
  venue: string;
  symbol: string;
  status: string;
  quantity: string;
  price: string | null;
}

export interface AuditRow {
  at: string;
  actor: string;
  command: string;
  target: string;
  outcome: string;
}

export interface AccountingRow {
  accountId: string;
  currency: string;
  allocated: string | null;
  used: string | null;
  realised: string | null;
  fees: string | null;
}

export interface SessionRow {
  at: string;
  deploymentId: string;
  event: string;
  /** Restart-recovery evidence — what was recovered, and whether it completed. */
  recovered: string | null;
  complete: boolean;
}

export interface ReconciliationRow {
  venue: string;
  policy: string;
  lastRun: string | null;
  freshness: string;
  findings: number | null;
}

export interface RiskRow {
  label: string;
  value: string | null;
  limit: string | null;
  /** Marked when this row is the canary envelope, per §15. */
  canaryEnvelope?: boolean;
}

function Num({ value, absent = "not available" }: { value: string | null; absent?: string }) {
  return value !== null ? (
    <span className="exec-num">{value}</span>
  ) : (
    // Never a zero. On a screen of performance figures a zero is a claim of
    // flat performance, which is the opposite of not knowing.
    <span className="exec-gate-unverified">{absent}</span>
  );
}

function ScopeBar({
  scope,
  onScopeChange,
  portfolioOptions,
  modeOptions,
  venueOptions,
  windowOptions,
}: Pick<
  AlphaThreeSixtyProps,
  "scope" | "onScopeChange" | "portfolioOptions" | "modeOptions" | "venueOptions" | "windowOptions"
>) {
  const set = (patch: Partial<AlphaScope>) => onScopeChange({ ...scope, ...patch });
  return (
    <div className="exec-alpha-scope">
      <span className="exec-tile-title">Scope</span>
      <Select label="Portfolio" value={scope.portfolio} options={portfolioOptions} onChange={(v) => set({ portfolio: v })} />
      <Select label="Mode" value={scope.mode} options={modeOptions} onChange={(v) => set({ mode: v })} />
      {/* Registry-driven. A hardcoded venue list is a release every time the
          desk adds an exchange. */}
      <Select label="Venue" value={scope.venue} options={venueOptions} onChange={(v) => set({ venue: v })} />
      <Select label="Window" value={scope.window} options={windowOptions} onChange={(v) => set({ window: v })} />
      <span className="exec-blotter-note">
        every panel below obeys this scope · venue list from registry, never hardcoded
      </span>
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="exec-alpha-select">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

const MAP_STAGES: readonly PromotionStage[] = [
  "PAPER_OBSERVATION",
  "SANDBOX_VALIDATION",
  "LIVE_CANARY",
  "LIVE_FULL",
];

const STAGE_HEADER: Record<PromotionStage, string> = {
  PAPER_OBSERVATION: "paper",
  SANDBOX_VALIDATION: "sandbox",
  LIVE_CANARY: "canary",
  LIVE_FULL: "live",
};

/**
 * Venue × stage. One deployment is one venue account; multi-venue is parallel
 * deployments, never one deployment spanning venues.
 *
 * Capped keeping any venue that is not syncing cleanly — at sixteen Binance
 * shards plus DNSE the list outgrows the wireframe's four, and the venue worth
 * seeing is the one that stopped.
 */
function DeploymentMap({ venues }: { venues: readonly VenueRow[] }) {
  const shown = capPreserving(
    venues,
    VENUE_BUDGET,
    (row) => row.brokerSync !== "OK" || Boolean(row.note),
  );
  const notice = capNotice(shown, "venues");
  return (
    <section className="exec-gate-panel">
      <div className="exec-tile-title">Deployment map — venue × stage</div>
      <div className="exec-blotter-note">
        one deployment = one venue account · multi-venue = parallel deployments
      </div>
      <div className="exec-scroll-x">
      <table className="exec-alpha-map">
        <caption className="exec-blotter-note">Venue by stage</caption>
        <thead>
          <tr>
            <th scope="col">venue</th>
            {MAP_STAGES.map((stage) => (
              <th key={stage} scope="col">
                {STAGE_HEADER[stage]}
              </th>
            ))}
            <th scope="col">broker sync</th>
          </tr>
        </thead>
        <tbody>
          {shown.shown.map((row) => (
            <tr key={row.venue}>
              <th scope="row">{row.venue}</th>
              {MAP_STAGES.map((stage) => (
                <td key={stage}>
                  {row.stages[stage] ? (
                    <EnvironmentBadge stage={stage} />
                  ) : (
                    // An em dash, because this venue genuinely has no
                    // deployment at this stage. Distinct from one we could not
                    // read, which would say so.
                    <span className="exec-alpha-empty">—</span>
                  )}
                </td>
              ))}
              <td>
                <BrokerSyncChip sync={row.brokerSync} />
                {row.syncDetail ? (
                  <span className="exec-blotter-note"> {row.syncDetail}</span>
                ) : null}
                {row.note ? <span className="exec-blotter-note"> {row.note}</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {notice ? <p className="exec-blotter-note">{notice}</p> : null}
    </section>
  );
}

export function AlphaThreeSixty(props: AlphaThreeSixtyProps) {
  const {
    alphaId,
    alphaName,
    artifactDigest,
    owner,
    r1Id,
    r2Id,
    passportHref,
    envelope,
    scope,
    tab,
    onTabChange,
    onOpenDeployment,
    onOpenAccount,
    venues,
    kpis,
    contributions,
    equity = null,
    deployments,
    tiles,
    status = "ok",
    reason,
  } = props;

  if (status !== "ok" && status !== "partial") {
    return (
      <ExecutionSurface kind="deployments" className="exec-alpha">
        <PanelState status={status} reason={reason ?? "This alpha could not be read."} />
      </ExecutionSurface>
    );
  }

  // `useId`, not a literal. The tab ids and the panel id were hardcoded, so any
  // page holding two of this screen emits duplicate DOM ids — and an
  // `aria-controls` that resolves to the first match means the second screen's
  // tabs point at the FIRST screen's panel. The fixtures surface renders five
  // of one of these, so this was live on a real page, not hypothetical.
  const uid = useId();

  return (
    <ExecutionSurface kind="deployments" className="exec-alpha">
      <header className="exec-inbox-head">
        <div className="exec-tile-title">
          {alphaName} · {alphaId}
        </div>
        <div className="exec-alpha-identity">
          <AuthorityBadge envelope={envelope} />
          <span className="exec-num">artifact {artifactDigest}</span>
          <span className="exec-blotter-note">owner {owner}</span>
          {r1Id ? <StatusChip label={`R1 ${r1Id}`} tone="mute" /> : null}
          {r2Id ? <StatusChip label={`R2 ${r2Id}`} tone="mute" /> : null}
          {passportHref ? (
            <a className="exec-evidence-link" href={passportHref}>
              Artifact passport →
            </a>
          ) : null}
        </div>
      </header>

      <ScopeBar {...props} />

      {/* Horizontally scrollable. The wireframe is explicit that the tab row
          scrolls and the page does not — nine tabs at a narrow width would
          otherwise push the whole screen sideways. */}
      <div className="exec-alpha-tabs" role="tablist" aria-label="Alpha detail">
        {ALPHA_TABS.map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            id={`${uid}-tab-${option.replace(/\W+/g, "-")}`}
            aria-controls={`${uid}-tabpanel`}
            className="exec-inbox-filter"
            data-active={tab === option ? "true" : undefined}
            aria-selected={tab === option}
            onClick={() => onTabChange(option)}
          >
            {option}
          </button>
        ))}
      </div>

      <div
        className="exec-alpha-body"
        role="tabpanel"
        id={`${uid}-tabpanel`}
        // Named by its tab rather than by a duplicate label: a screen reader
        // reading "Positions, tab panel, Positions" twice is the label doing
        // the tab's job.
        aria-labelledby={`${uid}-tab-${tab.replace(/\W+/g, "-")}`}
      >
        {tab === "Overview" ? (
          <>
            <DeploymentMap venues={venues} />
            <div className="exec-alpha-kpis">
              {kpis.map((kpi) => (
                <div key={kpi.label} className="exec-alpha-kpi">
                  <div className="exec-blotter-note">{kpi.label}</div>
                  <div>
                    <Num value={kpi.value} absent={kpi.absentReason ?? "not available"} />
                    {kpi.value !== null && kpi.unit ? (
                      <span className="exec-blotter-note"> {kpi.unit}</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            {/* The drawn overlay, and the reason it belongs on Overview: an
                alpha in three stages at once is the premise of this screen,
                and a reader comparing paper against canary should not have to
                open a tab to do it. Series are joined by artifact digest, so
                two stages of the same alpha are comparable and two alphas are
                not. */}
            <div className="exec-grid-2" data-ratio="1.35">
              {equity ? (
                <ChartTile title="Equity by stage" envelope={equity.envelope}>
                  {equity.body}
                </ChartTile>
              ) : (
                <PanelState
                  status="unavailable"
                  reason="No equity series was published for this alpha and window."
                />
              )}
              <Contribution rows={contributions} />
            </div>
            <Deployments onOpenDeployment={onOpenDeployment} onOpenAccount={onOpenAccount} rows={deployments} scope={scope} />
          </>
        ) : null}

        {tab === "Insight Charts" ? <Tiles tiles={tiles} /> : null}
        {tab === "Positions" ? <Positions {...props} /> : null}
        {tab === "Orders & Fills" ? <Orders {...props} /> : null}
        {tab === "Risk" ? <Risk rows={props.risk ?? []} /> : null}
        {tab === "Sessions" ? <Sessions rows={props.sessions ?? []} /> : null}
        {tab === "Accounting" ? <Accounting rows={props.accounting ?? []} /> : null}
        {tab === "Reconciliation" ? <Reconciliation rows={props.reconciliation ?? []} /> : null}
        {tab === "Audit" ? <Audit {...props} /> : null}
      </div>
    </ExecutionSurface>
  );
}

/**
 * Per-venue contribution.
 *
 * Each venue keeps its own currency and there is no total. The wireframe says
 * it outright — *"USDC converted only in portfolio totals via fx_usdc_usdt.v1
 * — never silently summed here"* — and a single figure over three currencies is
 * a number with no unit pretending to have one.
 */
function Contribution({ rows }: { rows: readonly VenueContribution[] }) {
  return (
    <section className="exec-gate-panel">
      <div className="exec-tile-title">Per-venue contribution</div>
      <dl className="exec-360-facts">
        {rows.map((row) => (
          <div key={row.venue} className="exec-alpha-contrib">
            <dt>{row.venue}</dt>
            <dd>
              <Num value={row.value} />
              {row.value !== null ? (
                <span className="exec-blotter-note"> {row.currency}</span>
              ) : null}
              {row.note ? <span className="exec-blotter-note"> {row.note}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
      <p className="exec-blotter-note">
        per-venue currency · converted only in portfolio totals via a named rate, never silently
        summed here
      </p>
    </section>
  );
}

function Deployments({ onOpenDeployment, onOpenAccount, rows, scope }: { rows: readonly DeploymentRow[]; scope: AlphaScope; onOpenDeployment: (row: DeploymentRow) => void; onOpenAccount: (accountId: string) => void; }) {
  // Anything not READY survives the cap: a halted deployment buried at row 40
  // is the row somebody opened this screen to find.
  const shown = capPreserving(rows, DEPLOYMENT_BUDGET, (row) => row.readiness !== "READY");
  const notice = capNotice(shown, "deployments");
  return (
    <section className="exec-gate-panel">
      <div className="exec-tile-title">Deployments in scope — {scope.venue}</div>
      <div className="exec-scroll-x">
      <table className="exec-alpha-deployments">
        <caption className="exec-blotter-note">Deployments in scope</caption>
        <thead>
          <tr>
            <th scope="col">deployment</th>
            <th scope="col">venue · mode</th>
            <th scope="col">stage</th>
            <th scope="col">account</th>
            <th scope="col">alloc</th>
            <th scope="col">pnl</th>
            <th scope="col">dd</th>
            <th scope="col">health</th>
          </tr>
        </thead>
        <tbody>
          {shown.shown.map((row) => (
            <tr key={row.deploymentId} data-emphasis={row.readiness !== "READY" ? "warn" : undefined}>
              <th scope="row">
                <button type="button" className="exec-link" onClick={() => onOpenDeployment(row)}>
                  {row.deploymentId}
                </button>
              </th>
              <td>
                {row.venue} · {row.mode}
              </td>
              <td>
                <EnvironmentBadge stage={row.stage} />
              </td>
              <td>
                <button type="button" className="exec-link" onClick={() => onOpenAccount(row.accountId)}>
                  {row.accountId}
                </button>
              </td>
              <td>
                <Num value={row.allocation} absent="not published" />
                {row.allocation && row.currency ? (
                  <span className="exec-blotter-note"> {row.currency}</span>
                ) : null}
              </td>
              <td>
                <Num value={row.pnl} absent="not published" />
              </td>
              <td>
                <Num value={row.drawdown} absent="not published" />
              </td>
              <td>
                <StatusChip
                  label={row.readiness}
                  tone={row.readiness === "READY" ? "good" : row.readiness === "BLOCKED" ? "bad" : "warn"}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {notice ? <p className="exec-blotter-note">{notice}</p> : null}
    </section>
  );
}

function Tiles({ tiles }: { tiles: readonly InsightTile[] }) {
  return (
    <div className="exec-alpha-tiles">
      {tiles.map((tile) => (
        <ChartTile key={tile.index} title={`${tile.index} · ${tile.title}`} envelope={tile.envelope}>
          {tile.state === "ok" ? (
            tile.body
          ) : (
            // A real state with its own reason, not a blank frame. Tile 5 shows
            // one venue with enough fills beside one without; blanking the
            // second would imply it was fine.
            <PanelState
              status={tile.state === "insufficient_data" ? "insufficient_data" : "unavailable"}
              reason={tile.reason ?? "Not enough evidence in this window to draw this tile."}
            />
          )}
        </ChartTile>
      ))}
    </div>
  );
}

/** Unbounded: `fills` has no retention policy, so this pages and never caps. */
function Positions({ positions, onLoadOlder }: AlphaThreeSixtyProps) {
  const columns: readonly Column<PositionRow>[] = [
    { key: "where", header: "deployment · venue", width: "13rem", render: (r) => `${r.deploymentId} · ${r.venue}` },
    { key: "symbol", header: "symbol", width: "9rem", render: (r) => r.symbol },
    { key: "side", header: "side", width: "6rem", render: (r) => r.side },
    { key: "qty", header: "qty", width: "8rem", render: (r) => <span className="exec-num">{r.quantity}</span> },
    { key: "entry", header: "entry", width: "9rem", render: (r) => <Num value={r.entry} absent="not published" /> },
    { key: "mark", header: "mark", width: "9rem", render: (r) => <Num value={r.mark} absent="not marked" /> },
    { key: "upnl", header: "uPnL", width: "9rem", render: (r) => <Num value={r.unrealised} absent="not published" /> },
    { key: "ccy", header: "ccy", width: "6rem", render: (r) => r.currency },
  ];
  return positions ? (
    <KeysetTable
      label="Positions across every deployment in scope"
      columns={columns}
      page={positions}
      rowKey={(r) => `${r.deploymentId}-${r.symbol}-${r.side}`}
      minWidth={980}
      onLoadOlder={() => onLoadOlder("Positions")}
    />
  ) : (
    <PanelState status="loading" reason="Loading positions." />
  );
}

function Orders({ orders, onLoadOlder }: AlphaThreeSixtyProps) {
  const columns: readonly Column<OrderRow>[] = [
    { key: "at", header: "time (UTC)", width: "12rem", render: (r) => <span className="exec-num">{r.at}</span> },
    { key: "where", header: "deployment · venue", width: "13rem", render: (r) => `${r.deploymentId} · ${r.venue}` },
    { key: "symbol", header: "symbol", width: "9rem", render: (r) => r.symbol },
    { key: "qty", header: "qty", width: "8rem", render: (r) => <span className="exec-num">{r.quantity}</span> },
    { key: "price", header: "price", width: "9rem", render: (r) => <Num value={r.price} absent="no limit price" /> },
    { key: "status", header: "status", width: "10rem", render: (r) => r.status },
  ];
  return orders ? (
    <KeysetTable
      label="Orders and fills in scope"
      columns={columns}
      page={orders}
      rowKey={(r) => r.orderId}
      minWidth={980}
      onLoadOlder={() => onLoadOlder("Orders & Fills")}
    />
  ) : (
    <PanelState status="loading" reason="Loading orders." />
  );
}

function Audit({ audit, onLoadOlder }: AlphaThreeSixtyProps) {
  const columns: readonly Column<AuditRow>[] = [
    { key: "at", header: "time (UTC)", width: "12rem", render: (r) => <span className="exec-num">{r.at}</span> },
    { key: "actor", header: "actor", width: "9rem", render: (r) => r.actor },
    { key: "command", header: "command", width: "16rem", render: (r) => r.command },
    { key: "target", header: "target", width: "12rem", render: (r) => r.target },
    { key: "outcome", header: "outcome", width: "10rem", render: (r) => r.outcome },
  ];
  return audit ? (
    <KeysetTable
      label="Command journal for this alpha"
      columns={columns}
      page={audit}
      rowKey={(r) => `${r.at}-${r.command}-${r.target}`}
      minWidth={900}
      onLoadOlder={() => onLoadOlder("Audit")}
    />
  ) : (
    <PanelState status="loading" reason="Loading the command journal." />
  );
}

function Risk({ rows }: { rows: readonly RiskRow[] }) {
  return (
    <section className="exec-gate-panel">
      <div className="exec-tile-title">Risk utilization</div>
      <dl className="exec-360-facts">
        {rows.map((row) => (
          <div key={row.label} className="exec-alpha-contrib" data-canary={row.canaryEnvelope ? "true" : undefined}>
            <dt>
              {row.label}
              {/* Marked, because a canary envelope is a tighter limit than the
                  profile's and a reader comparing against the wrong one draws
                  the wrong conclusion. */}
              {row.canaryEnvelope ? <span className="exec-blotter-note"> canary envelope</span> : null}
            </dt>
            <dd>
              <Num value={row.value} />
              {row.limit ? <span className="exec-blotter-note"> / {row.limit}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Sessions({ rows }: { rows: readonly SessionRow[] }) {
  // An incomplete recovery always survives the cap. It is the only row in a
  // session log that changes what anyone does next.
  const shown = capPreserving(rows, SESSION_BUDGET, (row) => !row.complete);
  const notice = capNotice(shown, "session events");
  return (
    <section className="exec-gate-panel">
      <div className="exec-tile-title">Sessions — restart and recovery evidence</div>
      <div className="exec-scroll-x">
      <table className="exec-360-sync">
        <caption className="exec-blotter-note">Session and recovery events</caption>
        <thead>
          <tr>
            <th scope="col">time (UTC)</th>
            <th scope="col">deployment</th>
            <th scope="col">event</th>
            <th scope="col">recovered</th>
          </tr>
        </thead>
        <tbody>
          {shown.shown.map((row) => (
            <tr key={`${row.at}-${row.deploymentId}`} data-status={row.complete ? "OK" : "STALE"}>
              <th scope="row">
                <span className="exec-num">{row.at}</span>
              </th>
              <td>{row.deploymentId}</td>
              <td>{row.event}</td>
              <td>
                <Num value={row.recovered} absent="nothing recorded" />
                {!row.complete ? <StatusChip label="INCOMPLETE" tone="warn" /> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {notice ? <p className="exec-blotter-note">{notice}</p> : null}
    </section>
  );
}

function Accounting({ rows }: { rows: readonly AccountingRow[] }) {
  // 85 accounts across a few currencies is the normal shape, not the four the
  // wireframe draws. Rows missing a figure survive: an account we could not
  // read is the one worth chasing.
  const shown = capPreserving(rows, ACCOUNTING_BUDGET, (row) => row.allocated === null || row.used === null);
  const notice = capNotice(shown, "account/currency rows");
  return (
    <section className="exec-gate-panel">
      <div className="exec-tile-title">Accounting — per account and currency</div>
      <div className="exec-scroll-x">
      <table className="exec-360-sync">
        <caption className="exec-blotter-note">Accounting by account and currency</caption>
        <thead>
          <tr>
            <th scope="col">account</th>
            <th scope="col">ccy</th>
            <th scope="col">allocated</th>
            <th scope="col">used</th>
            <th scope="col">realised</th>
            <th scope="col">fees</th>
          </tr>
        </thead>
        <tbody>
          {shown.shown.map((row) => (
            <tr key={`${row.accountId}-${row.currency}`}>
              <th scope="row">{row.accountId}</th>
              <td>{row.currency}</td>
              <td><Num value={row.allocated} /></td>
              <td><Num value={row.used} /></td>
              <td><Num value={row.realised} /></td>
              <td><Num value={row.fees} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {notice ? <p className="exec-blotter-note">{notice}</p> : null}
      <p className="exec-blotter-note">
        canonical in the Execution cell · one row per account and currency, never one row per
        account
      </p>
    </section>
  );
}

function Reconciliation({ rows }: { rows: readonly ReconciliationRow[] }) {
  return (
    <section className="exec-gate-panel">
      <div className="exec-tile-title">Reconciliation — per venue policy freshness</div>
      <div className="exec-scroll-x">
      <table className="exec-360-sync">
        <caption className="exec-blotter-note">Reconciliation policy freshness</caption>
        <thead>
          <tr>
            <th scope="col">venue</th>
            <th scope="col">policy</th>
            <th scope="col">last run</th>
            <th scope="col">freshness</th>
            <th scope="col">findings</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.venue}>
              <th scope="row">{row.venue}</th>
              <td>{row.policy}</td>
              <td>{/* "never" is a claim that reconciliation has not run. An absent
                  timestamp is not that claim. */}
              <Num value={row.lastRun} absent="not published" /></td>
              <td>{row.freshness}</td>
              <td>
                {/* Zero findings is a real result; an unknown count is not. */}
                <Num value={row.findings !== null ? String(row.findings) : null} absent="not counted" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <p className="exec-blotter-note">paper deployments reconcile against nothing — N/A is correct there</p>
    </section>
  );
}
