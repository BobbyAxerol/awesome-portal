/**
 * Alpha 360 (UXM-07 S2, flag key `alpha`).
 *
 * One alpha, one URL: the lifecycle spine, a strip of current facts, and the
 * tabs Performance, Deployments, Research Evidence, Orders & Fills, Activity &
 * Decisions and Trade Replay, with Regime Fit, Positions and Reconciliation
 * under More. V1's ten tabs fold into these (`v2/tabAliases.ts`): Overview and
 * Insight Charts become Performance, Sessions and Audit become Activity with
 * `type=`, Risk and Accounting land on Positions and Performance, and a label
 * nobody knows shows a notice and opens Performance.
 *
 * What it will not do. The current stage is the stage the alpha row names; the
 * spine's history, days in stage, criteria and decider are `Not published
 * (FE-027/028)` and no stage is ever drawn "done" from position. The Score chip
 * is `Not scored · policy not set` (FE-011). Windowed return and drawdown are
 * FE-006 and FE-025; nothing is computed from the equity line. Money is a
 * published decimal string per currency, labelled current, and never summed
 * across currencies or across the simulated and real-funded books.
 *
 * URL: `tab` (default Performance), `env` (the book for equity, orders, fills,
 * replay), `view` (Actual, Forward simulated, Research OOS), `type` (Activity
 * filter), `focus` (`order:<id>`, opens Replay), `sel=score` (the Score
 * drawer), `workspace_id` and `from` (carried).
 *
 * Roles: the capability set decides, never a role name. Without
 * `execution.accounts.read` the account links, the deployer column and the
 * replay's account chip are withheld and the page says "Your slice only"; the
 * server remains the boundary (FE-026 is undecided, so nothing more is hidden).
 *
 * | Cardinality | Break point | Degradation | Server contract | Invariant | Perf budget |
 * |---|---|---|---|---|---|
 * | 1 alpha, 4 stages, tens of deployments; orders and fills unbounded (no retention policy); timeline pages of 100; equity up to 2,048 points | over 200 rows in a table, or 5,000 chart points | tables show 200 and say "Top 200 of N"; keyset `Load more` for orders, fills and the timeline; charts keep min and max per bucket and print the envelope caption | resource + subject BFF cursors, `equity-chart` viewport_px with sampling metadata, observed-timeline `next_cursor`; FE-027/028 lifecycle, FE-031 event feed, FE-006/025 windows are requests | no figure is computed, summed across currencies or inferred; absent = `Not published (FE-xxx)` or `Not available`; partial and stale stay worded | resource and drift on open; every other read only when its tab opens; at most 200 table rows, under 150 chart nodes |
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { useSession } from "../../../../auth/session";
import type { ExecutionApi } from "../../../api/ports";
import { PanelState } from "../../../components/states";
import { utcStamp } from "../../../time";
import { DockAction, useDockMode, useDockSelection } from "../../Drawer";
import { withoutOrigin } from "../../backTo";
import { NotAvailableLine, notPublishedReason } from "../../blocks";
import { Flag } from "../../Flag";
import { useContextFacts } from "../../shell/contextFacts";
import { V2_CAPABILITY, holds } from "../../shell/roleNav";
import { applyTab, resolveTab } from "../../tabAliases";
import { useMediaQuery } from "../../useMediaQuery";
import { ENV_LABEL, serializeUrlParams, useExecUrlState, withContext, type ExecEnv } from "../../urlState";
import { alphaBack, replayBack } from "./backLinks";
import { Dec, Na } from "./cells";
import { ActivityTab } from "./ActivityTab";
import { LifecyclePanel } from "./Lifecycle";
import { OrdersTab } from "./OrdersTab";
import { PERFORMANCE_VIEWS, PerformanceTab, type PerformanceView } from "./PerformanceTab";
import { ScopeBanner } from "./ScopeBanner";
import { ScoreDrawer } from "./ScoreDrawer";
import { DeploymentsTab, EvidenceTab, PositionsTab, ReconciliationTab, RegimeTab } from "./TableTabs";
import {
  ALPHA_MORE_TABS,
  ALPHA_TABS,
  chooseEnv,
  equityInputs,
  focusTarget,
  freshnessFlag,
  isAlphaTab,
  humanize,
  stagePaths,
  type AlphaTabKey,
  type DeploymentRow,
  type PositionRow,
  type ReconRow,
} from "./model";
import { Np, WhyMark } from "./np";
import { alphaViewOf } from "./view";
import { ReplayView } from "./replay/ReplayView";
import {
  useActivityRollup,
  useAlphaResource,
  useEquityChart,
  useObservedFeed,
  useStageDrift,
  useSubjectBook,
} from "./useAlphaReads";
import type { SpineStageId } from "../../blocks";

import "../../css/alpha.css";

export const ALPHA_SCREEN_KEY = "alpha" as const;

/** Stable empties, so a memo or an effect keyed on them does not run again on every render. */
const NO_ENVS: readonly ExecEnv[] = [];
const NO_ROWS: readonly DeploymentRow[] = [];
const NO_POSITIONS: readonly PositionRow[] = [];
const NO_RECON: readonly ReconRow[] = [];
const NO_VENUE = (): null => null;

/** D9: where a reader sees which grant a disabled action lacks. */
const ACCESS_PATH = "/administration/profile-access";

export interface AlphaScreenProps {
  api: ExecutionApi;
  alphaId: string;
  /** Carried to the reads that take it (`workspace_id`); the URL's value wins. */
  workspaceId?: string;
}

function Fig({ label, children, basis }: { label: string; children: ReactNode; basis?: string }) {
  return (
    <div className="exec-blk-kpi">
      <dt className="exec-blk-kpi-label">{label}</dt>
      <dd className="exec-blk-kpi-body">
        <span className="exec-blk-kpi-value">{children}</span>
        {basis ? <span className="exec-blk-kpi-note">{basis}</span> : null}
      </dd>
    </div>
  );
}

export default function AlphaScreen({ api, alphaId, workspaceId }: AlphaScreenProps) {
  const url = useExecUrlState();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { selection, select, close } = useDockSelection();
  const mode = useDockMode();
  const uid = useId();
  const { access } = useSession();
  const capabilities = useMemo(() => new Set(access.kind === "ready" ? access.access.capabilities : []), [access]);
  const canSeeAccounts = holds(capabilities, { allOf: [V2_CAPABILITY.accountsRead] });
  const sliceOnly = !canSeeAccounts && !holds(capabilities, { allOf: [V2_CAPABILITY.portfoliosRead] });
  // Only a READY session is narrowed; while access loads (empty set) the screen's banner shows, but the bar states nothing.
  useContextFacts({ scope: sliceOnly && access.kind === "ready" ? "Scope: Your slice" : undefined });
  // `from` and `back` belong to this page's own Back; onward links must not inherit them (Account 360 opened from here is not "from the Fleet").
  const linkTo = (href: string) => withContext(href, withoutOrigin(params));
  const back = alphaBack(params);

  /* ── tab, from the URL, with the V1 labels mapped ───────────────────── */
  const resolution = useMemo(() => resolveTab("alpha", url.value.tab), [url.value.tab]);
  const tab: AlphaTabKey = isAlphaTab(resolution.target.tab) ? resolution.target.tab : "performance";
  useEffect(() => {
    if (!resolution.legacy) return;
    // The alias's anchor (`#charts`, `#risk`, `#costs`) stays in the address, as on Portfolio 360.
    const next = applyTab("alpha", params, resolution);
    const query = next.search.toString();
    navigate({ pathname: location.pathname, search: query === "" ? "" : `?${query}`, hash: next.hash }, { replace: true });
  }, [resolution, params, navigate, location.pathname]);

  /* ── reads ───────────────────────────────────────────────────────────── */
  // The workspace the URL (or the caller) names, when it names one. Only that is sent on the resource and record reads; the
  // body's own `workspace_id` is never fed back as a request parameter.
  const explicitWs = url.value.workspace_id ?? workspaceId ?? null;
  const resource = useAlphaResource(api, alphaId, explicitWs);
  // One view over either body (legacy v1 or SCOPED_V2 v2): the sections below read it, never the raw body.
  const view = useMemo(() => (resource.phase === "ready" ? alphaViewOf(resource.value, alphaId) : null), [resource, alphaId]);
  const deployed = view?.envs ?? NO_ENVS;
  const env: ExecEnv = chooseEnv(url.value.env, deployed);
  const settled = resource.phase === "ready" || resource.phase === "error";
  const wsId = explicitWs ?? view?.workspaceId ?? null;

  const drift = useStageDrift(api, alphaId, true);
  const equity = useEquityChart(api, alphaId, env, wsId, settled && (tab === "performance" || tab === "activity"));
  const rollup = useActivityRollup(api, alphaId, env, settled && tab === "orders");
  const timeline = useObservedFeed(api, alphaId, env, settled && tab === "activity");
  const book = useSubjectBook(api, alphaId, env, settled && (tab === "orders" || tab === "activity" || tab === "replay"), explicitWs);

  const current: SpineStageId | null = view?.current ?? null;
  const [stagePick, setStagePick] = useState<SpineStageId | null>(null);
  const paths = useMemo(() => stagePaths(drift.phase === "ready" ? drift.value : null), [drift]);
  const inputs = useMemo(() => {
    const why = equity.phase === "error" ? `The exact equity series could not be read (${equity.reason}).`
      : equity.phase === "ready" ? "The source published no exact equity series for this book." : null;
    return equityInputs(equity.phase === "ready" ? equity.value : null, drift.phase === "ready" ? drift.value : null, env, current, why);
  }, [equity, drift, current, env]);
  const rows = view?.rows ?? NO_ROWS;
  const label = view?.titleWithVersion ?? alphaId;

  /* ── url writers ─────────────────────────────────────────────────────── */
  const openTab = (key: AlphaTabKey) => {
    const next = serializeUrlParams({ tab: key === "performance" ? null : key, sel: null }, params);
    if (key !== "activity") next.delete("type");
    if (key !== "replay" && key !== "orders") next.delete("focus");
    setParams(next);
    setMoreOpen(false);
  };
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButton = useRef<HTMLButtonElement | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const stripRef = useRef<HTMLDivElement | null>(null);
  /* At phone width the strip is one row that scrolls inside its own box and carries every tab, More's included:
     a pinned More button squeezes the labels, and would highlight "More" for Trade Replay instead of Trade Replay. */
  const narrow = useMediaQuery("(max-width: 660px)");
  const stripTabs: readonly { key: AlphaTabKey; label: string }[] = narrow ? [...ALPHA_TABS, ...ALPHA_MORE_TABS] : ALPHA_TABS;
  useEffect(() => {
    const strip = stripRef.current;
    const active = tabRefs.current[tab];
    if (!narrow || !strip || !active) return;
    strip.scrollLeft = Math.max(0, active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2);
  }, [tab, narrow]);
  const onTabKey = (event: KeyboardEvent, index: number) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next = (index + (event.key === "ArrowRight" ? 1 : -1) + stripTabs.length) % stripTabs.length;
    const key = stripTabs[next].key;
    tabRefs.current[key]?.focus();
    openTab(key);
  };
  const perfView: PerformanceView = PERFORMANCE_VIEWS.find((v) => v.id === url.value.view)?.id ?? "act";
  const focus = params.get("focus");
  const focusOrder = (() => {
    const target = focusTarget(focus);
    return target?.kind === "order" ? target.id : null;
  })();

  /* ── states ──────────────────────────────────────────────────────────── */
  const fresh = view ? freshnessFlag(view.freshness) : null;
  // A scoped read is always partial and says so in its scope label; the generic banner is the legacy body's.
  const incomplete = view !== null && view.variant === "legacy" && (view.completeness ?? "").toUpperCase() !== "COMPLETE" && view.completeness !== null;
  const stale = view !== null && view.state.toLowerCase() === "stale";
  const body = (() => {
    if (resource.phase === "loading" || resource.phase === "idle") return <PanelState status="loading" />;
    if (resource.phase === "error") return <PanelState status={resource.status} reason={resource.reason} />;
    if (view === null || !view.present) {
      return view?.state.toLowerCase() === "empty"
        ? <PanelState status="empty" reason={`Alpha ${alphaId} is not present in the current projected resource population.`} />
        : <PanelState status="unavailable" reason={`The alpha row for ${alphaId} could not be read.`} />;
    }
    return null;
  })();
  const present = view !== null && view.present;

  const panelId = `${uid}-panel`;
  const tabId = (key: string) => `${uid}-tab-${key}`;
  const inMore = !narrow && ALPHA_MORE_TABS.some((t) => t.key === tab);

  return (
    <div className="exec-alp2-v2" data-screen="alpha-360-v2">
      <header className="exec-alp2-head">
        <div>
          <Link className="exec-alp2-back" to={back.to}>← {back.label}</Link>
          <h1 className="exec-alp2-title">
            {view?.present ? view.title : alphaId}
            {view?.present && view.version !== null ? <span className="exec-alp2-version">v{view.version}</span> : null}
            {present ? (
              <button type="button" className="exec-alp2-scorechip" aria-haspopup="dialog" onClick={() => select("score")}>
                <Flag kind="pending" label="Not scored · policy not set" size="sm" />
              </button>
            ) : null}
          </h1>
          {view !== null && view.present ? (
            <>
              <p className="exec-alp2-meta">
                {view.owner.kind === "not-published" ? null : <span>Owner <b>{view.owner.kind === "value" ? view.owner.value : "Not available"}</b></span>}
                {view.portfolioNames.length > 0 ? <span>{view.portfolioNames.join(", ")}</span> : null}
              </p>
              {/* The gaps of the header (name, version, owner, run, evidence) are ONE line, not a "Not published" per fact. */}
              <NotAvailableLine
                facts={[
                  ...(view.name === null ? [{ label: "Name", id: "FE-066" as const, why: view.nameReason }] : []),
                  ...(view.version === null ? [{ label: "Version", id: "FE-066" as const, why: view.versionReason }] : []),
                  ...(view.owner.kind === "not-published" ? [{ label: "Owner", id: view.owner.id, why: view.owner.reason }] : []),
                  { label: "Run", id: "FE-029" as const },
                  { label: "Evidence", id: "FE-029" as const },
                ]}
              />
            </>
          ) : null}
        </div>
        <div className="exec-alp2-fresh">
          {present ? (
            <div className="exec-alp2-requests" role="group" aria-label="Requests">
              <DockAction label="Request archive" reason={notPublishedReason("FE-034", "Archive requests cannot be recorded yet.")} accessHref={ACCESS_PATH} />
              <DockAction label="Request gate review" reason={notPublishedReason("FE-020", "Gate-review requests cannot be recorded yet.")} accessHref={ACCESS_PATH} />
            </div>
          ) : null}
          {fresh ? <Flag kind={fresh.kind} label={fresh.label} size="sm" /> : null}
          {view?.asOfMs ? <span>As of {utcStamp(new Date(view.asOfMs).toISOString())}</span> : view ? <span>Source time not published</span> : null}
        </div>
      </header>

      {sliceOnly ? <div className="exec-blk-banner" role="note">Your slice only. Peers and fund totals are hidden.</div> : null}
      {view?.scope ? <ScopeBanner scope={view.scope} withheld={view.withheld} /> : null}
      {resolution.notice ? <div className="exec-blk-banner" role="status">{resolution.notice}</div> : null}
      {stale ? <div className="exec-blk-banner" role="status"><Flag kind="stale" label="Stale" size="sm" /> The source has not updated for this alpha within its freshness budget.</div> : null}
      {incomplete ? <div className="exec-blk-banner" role="status"><Flag kind="partial" label="Partial" size="sm" /> The read is {humanize(view?.completeness ?? "").toLowerCase()}: some rows may be missing.</div> : null}

      {body !== null ? (
        <section className="exec-alp2-state" aria-label="Alpha state">{body}</section>
      ) : (
        <div className="exec-alp2-main" data-docked={selection === "score" && mode === "dock" ? "true" : undefined}>
          <div className="exec-alp2-body">
            {tab === "replay" ? null : <LifecyclePanel rows={rows} current={current} selected={stagePick} onSelect={setStagePick} linkTo={linkTo} currentNote={view?.currentNote} withheld={view?.withheld} />}

            {tab === "replay" ? null : (
            <dl className="exec-blk-kpis exec-alp2-kpis" aria-label="Current facts">
              <Fig label="Net PnL, current" basis="All stages, current facts">
                {view?.money.published === false
                  ? <span><Np id="FE-005" /><WhyMark name="Money, reason" reason={view.money.reason} /></span>
                  : view?.money.published && view.money.netPnl.length > 0
                    ? view.money.netPnl.map((p) => <span key={p.currency} className="exec-alp2-fig"><Dec value={p.value} currency={p.currency} signed /></span>)
                    : <Na />}
              </Fig>
              <Fig label="Exposure, current" basis="All stages, current facts">
                {view?.money.published === false
                  ? <span><Np id="FE-005" /><WhyMark name="Money, reason" reason={view.money.reason} /></span>
                  : view?.money.published && view.money.exposure.length > 0
                    ? view.money.exposure.map((e) => <span key={e.currency} className="exec-alp2-fig"><Dec value={e.value} currency={e.currency} /></span>)
                    : <Na />}
              </Fig>
            </dl>
            )}
            {tab === "replay" ? null : <NotAvailableLine facts={[{ label: "Return", id: "FE-006" }, { label: "Max drawdown", id: "FE-025" }, { label: "Regime fit", id: "FE-011" }]} />}

            <div className="exec-alp2-tabbar">
              <div ref={stripRef} className="exec-alp2-tabs" role="tablist" aria-label="Alpha detail">
                {stripTabs.map((t, index) => (
                  <button
                    key={t.key}
                    ref={(node) => { tabRefs.current[t.key] = node; }}
                    type="button"
                    role="tab"
                    id={tabId(t.key)}
                    aria-selected={tab === t.key}
                    aria-controls={panelId}
                    tabIndex={tab === t.key || (inMore && index === 0) ? 0 : -1}
                    className="exec-alp2-tab"
                    onClick={() => openTab(t.key)}
                    onKeyDown={(event) => onTabKey(event, index)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {narrow ? null : (
              <div
                className="exec-alp2-more-wrap"
                onKeyDown={(event) => {
                  // Escape closes the menu and gives the focus back to its button; it stayed open before.
                  if (event.key !== "Escape" || !moreOpen) return;
                  event.preventDefault();
                  event.stopPropagation();
                  setMoreOpen(false);
                  moreButton.current?.focus();
                }}
              >
                <button ref={moreButton} type="button" className="exec-alp2-tab" aria-haspopup="menu" aria-expanded={moreOpen} data-active={inMore ? "true" : undefined} onClick={() => setMoreOpen((open) => !open)}>
                  More
                </button>
                {moreOpen ? (
                  <ul className="exec-alp2-menu" role="menu" aria-label="More tabs">
                    {ALPHA_MORE_TABS.map((t) => (
                      <li key={t.key} role="none">
                        <button type="button" role="menuitem" className="exec-alp2-menuitem" onClick={() => openTab(t.key)}>{t.label}</button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              )}
              {deployed.length > 1 && (tab === "performance" || tab === "orders" || tab === "activity" || tab === "replay") ? (
                <span className="exec-alp2-seg" role="group" aria-label="Book">
                  <span className="exec-alp2-dim exec-alp2-seg-label">Book</span>
                  {deployed.map((e) => (
                    <button key={e} type="button" className="exec-alp2-segbtn" aria-pressed={env === e} onClick={() => url.set({ env: e })}>{ENV_LABEL[e]}</button>
                  ))}
                </span>
              ) : null}
            </div>

            <div role="tabpanel" id={panelId} aria-labelledby={inMore ? undefined : tabId(tab)} aria-label={inMore ? ALPHA_MORE_TABS.find((t) => t.key === tab)?.label : undefined} className="exec-alp2-panel">
              {tab === "performance" ? (
                <PerformanceTab rows={rows} noTotals={view?.money.published === false ? view.money.reason : null} env={env} equity={equity} drift={drift} inputs={inputs} paths={paths} view={perfView} onView={(next) => url.set({ view: next === "act" ? null : next })} />
              ) : null}
              {tab === "deployments" ? (
                <DeploymentsTab
                  rows={rows}
                  canSeeAccounts={canSeeAccounts}
                  linkTo={linkTo}
                  scopedNoTotals={view?.money.published === false ? view.money.reason : null}
                  unplaced={view?.unplaced.deployments ?? 0}
                  withheld={view?.withheld ?? null}
                />
              ) : null}
              {tab === "evidence" ? <EvidenceTab view={view} researchReason={drift.phase === "ready" ? drift.value.researchReason : null} /> : null}
              {tab === "regime" ? <RegimeTab /> : null}
              {tab === "orders" ? <OrdersTab alphaId={alphaId} book={book} activity={rollup} focusOrder={focusOrder} linkTo={linkTo} /> : null}
              {tab === "activity" ? <ActivityTab env={env} alphaId={alphaId} alphaLabel={label} inputs={inputs} paths={paths} timeline={timeline} book={book} /> : null}
              {tab === "replay" ? (
                <ReplayView
                  api={api}
                  alphaId={alphaId}
                  alphaLabel={label}
                  env={env}
                  venueOf={view?.venueOf ?? NO_VENUE}
                  book={book}
                  focus={focus}
                  canSeeAccounts={canSeeAccounts}
                  ordersHref={linkTo(`/deployments/alphas/${encodeURIComponent(alphaId)}?tab=orders`)}
                  back={replayBack(params, linkTo(`/deployments/alphas/${encodeURIComponent(alphaId)}?tab=orders`))}
                />
              ) : null}
              {tab === "positions" ? (
                <PositionsTab rows={view?.positions ?? NO_POSITIONS} canSeeAccounts={canSeeAccounts} linkTo={linkTo} unplaced={view?.unplaced.positions ?? 0} withheld={view?.withheld ?? null} />
              ) : null}
              {tab === "reconciliation" ? <ReconciliationTab rows={view?.reconciliation ?? NO_RECON} scoped={view?.variant === "scoped"} withheld={view?.withheld ?? null} /> : null}
            </div>
          </div>

          {selection === "score" ? <ScoreDrawer view={view} mode={mode} onClose={close} /> : null}
        </div>
      )}
    </div>
  );
}
