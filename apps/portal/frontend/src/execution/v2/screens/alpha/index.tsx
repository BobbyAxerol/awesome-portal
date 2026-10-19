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
import { notPublishedReason } from "../../blocks";
import { Flag } from "../../Flag";
import { useContextFacts } from "../../shell/contextFacts";
import { V2_CAPABILITY, holds } from "../../shell/roleNav";
import { applyTab, resolveTab } from "../../tabAliases";
import { ENV_LABEL, serializeUrlParams, useExecUrlState, withContext, type ExecEnv } from "../../urlState";
import { alphaBack, replayBack } from "./backLinks";
import { Dec, Na } from "./cells";
import { ActivityTab } from "./ActivityTab";
import { LifecyclePanel } from "./Lifecycle";
import { OrdersTab } from "./OrdersTab";
import { PERFORMANCE_VIEWS, PerformanceTab, type PerformanceView } from "./PerformanceTab";
import { ScoreDrawer } from "./ScoreDrawer";
import { DeploymentsTab, EvidenceTab, PositionsTab, ReconciliationTab, RegimeTab } from "./TableTabs";
import {
  ALPHA_MORE_TABS,
  ALPHA_TABS,
  chooseEnv,
  currentStageOf,
  deployedEnvs,
  deploymentRows,
  equityInputs,
  focusTarget,
  freshnessFlag,
  isAlphaTab,
  humanize,
  positionRows,
  reconciliationRows,
  stagePaths,
  type AlphaTabKey,
} from "./model";
import { Np } from "./np";
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
  const resource = useAlphaResource(api, alphaId);
  const item = resource.phase === "ready" ? resource.value.item : null;
  const envelope = resource.phase === "ready" ? resource.value.envelope : null;
  const deployed = useMemo(() => deployedEnvs(item), [item]);
  const env: ExecEnv = chooseEnv(url.value.env, deployed);
  const settled = resource.phase === "ready" || resource.phase === "error";
  const wsId = url.value.workspace_id ?? workspaceId ?? envelope?.workspaceId ?? null;

  const drift = useStageDrift(api, alphaId, true);
  const equity = useEquityChart(api, alphaId, env, wsId, settled && (tab === "performance" || tab === "activity"));
  const rollup = useActivityRollup(api, alphaId, env, settled && tab === "orders");
  const timeline = useObservedFeed(api, alphaId, env, settled && tab === "activity");
  const book = useSubjectBook(api, alphaId, env, settled && (tab === "orders" || tab === "activity" || tab === "replay"));

  const current: SpineStageId | null = currentStageOf(item);
  const [stagePick, setStagePick] = useState<SpineStageId | null>(null);
  const paths = useMemo(() => stagePaths(drift.phase === "ready" ? drift.value : null), [drift]);
  const inputs = useMemo(() => {
    const why = equity.phase === "error" ? `The exact equity series could not be read (${equity.reason}).`
      : equity.phase === "ready" ? "The source published no exact equity series for this book." : null;
    return equityInputs(equity.phase === "ready" ? equity.value : null, drift.phase === "ready" ? drift.value : null, env, current, why);
  }, [equity, drift, current, env]);
  const rows = useMemo(() => deploymentRows(item), [item]);
  const label = item ? `${item.alphaLabel} v${item.version}` : alphaId;

  /* ── url writers ─────────────────────────────────────────────────────── */
  const openTab = (key: AlphaTabKey) => {
    const next = serializeUrlParams({ tab: key === "performance" ? null : key, sel: null }, params);
    if (key !== "activity") next.delete("type");
    if (key !== "replay" && key !== "orders") next.delete("focus");
    setParams(next);
    setMoreOpen(false);
  };
  const [moreOpen, setMoreOpen] = useState(false);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onTabKey = (event: KeyboardEvent, index: number) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next = (index + (event.key === "ArrowRight" ? 1 : -1) + ALPHA_TABS.length) % ALPHA_TABS.length;
    const key = ALPHA_TABS[next].key;
    tabRefs.current[key]?.focus();
    openTab(key);
  };
  const view: PerformanceView = PERFORMANCE_VIEWS.find((v) => v.id === url.value.view)?.id ?? "act";
  const focus = params.get("focus");
  const focusOrder = (() => {
    const target = focusTarget(focus);
    return target?.kind === "order" ? target.id : null;
  })();

  /* ── states ──────────────────────────────────────────────────────────── */
  const fresh = envelope ? freshnessFlag(envelope.freshness) : null;
  const incomplete = envelope !== null && (envelope.completeness ?? "").toUpperCase() !== "COMPLETE" && envelope.completeness !== null;
  const stale = envelope !== null && envelope.state.toLowerCase() === "stale";
  const body = (() => {
    if (resource.phase === "loading" || resource.phase === "idle") return <PanelState status="loading" />;
    if (resource.phase === "error") return <PanelState status={resource.status} reason={resource.reason} />;
    if (item === null) {
      return envelope?.state.toLowerCase() === "empty"
        ? <PanelState status="empty" reason={`Alpha ${alphaId} is not present in the current projected resource population.`} />
        : <PanelState status="unavailable" reason={`The alpha row for ${alphaId} could not be read.`} />;
    }
    return null;
  })();

  const panelId = `${uid}-panel`;
  const tabId = (key: string) => `${uid}-tab-${key}`;
  const inMore = ALPHA_MORE_TABS.some((t) => t.key === tab);

  return (
    <div className="exec-alp2-v2" data-screen="alpha-360-v2">
      <header className="exec-alp2-head">
        <div>
          <Link className="exec-alp2-back" to={back.to}>← {back.label}</Link>
          <h1 className="exec-alp2-title">
            {item ? item.alphaLabel : alphaId}
            {item ? <span className="exec-alp2-version">v{item.version}</span> : null}
            {item ? (
              <button type="button" className="exec-alp2-scorechip" aria-haspopup="dialog" onClick={() => select("score")}>
                <Flag kind="pending" label="Not scored · policy not set" size="sm" />
              </button>
            ) : null}
          </h1>
          {item ? (
            <p className="exec-alp2-meta">
              <span>Owner <b>{item.owner ?? "Not available"}</b></span>
              <span>Run <Np id="FE-029" /></span>
              <span>Evidence <Np id="FE-029" /></span>
              {item.portfolios.length > 0 ? <span>{item.portfolios.map((p) => p.name).join(", ")}</span> : null}
            </p>
          ) : null}
        </div>
        <div className="exec-alp2-fresh">
          {item ? (
            <div className="exec-alp2-requests" role="group" aria-label="Requests">
              <DockAction label="Request archive" reason={notPublishedReason("FE-034", "Archive requests cannot be recorded yet.")} accessHref={ACCESS_PATH} />
              <DockAction label="Request gate review" reason={notPublishedReason("FE-020", "Gate-review requests cannot be recorded yet.")} accessHref={ACCESS_PATH} />
            </div>
          ) : null}
          {fresh ? <Flag kind={fresh.kind} label={fresh.label} size="sm" /> : null}
          {envelope?.asOfMs ? <span>As of {utcStamp(new Date(envelope.asOfMs).toISOString())}</span> : envelope ? <span>Source time not published</span> : null}
        </div>
      </header>

      {sliceOnly ? <div className="exec-blk-banner" role="note">Your slice only. Peers and fund totals are hidden.</div> : null}
      {resolution.notice ? <div className="exec-blk-banner" role="status">{resolution.notice}</div> : null}
      {stale ? <div className="exec-blk-banner" role="status"><Flag kind="stale" label="Stale" size="sm" /> The source has not updated for this alpha within its freshness budget.</div> : null}
      {incomplete ? <div className="exec-blk-banner" role="status"><Flag kind="partial" label="Partial" size="sm" /> The read is {humanize(envelope?.completeness ?? "").toLowerCase()}: some rows may be missing.</div> : null}

      {body !== null ? (
        <section className="exec-alp2-state" aria-label="Alpha state">{body}</section>
      ) : (
        <div className="exec-alp2-main" data-docked={selection === "score" && mode === "dock" ? "true" : undefined}>
          <div className="exec-alp2-body">
            {tab === "replay" ? null : <LifecyclePanel item={item} current={current} selected={stagePick} onSelect={setStagePick} linkTo={linkTo} />}

            {tab === "replay" ? null : (
            <dl className="exec-blk-kpis exec-alp2-kpis" aria-label="Current facts">
              <Fig label="Net PnL, current" basis="All stages, current facts">
                {item && item.positionPnl.length > 0
                  ? item.positionPnl.map((p) => <span key={p.currency} className="exec-alp2-fig"><Dec value={p.net} currency={p.currency} signed /></span>)
                  : <Na />}
              </Fig>
              <Fig label="Exposure, current" basis="All stages, current facts">
                {item && item.exposure.length > 0 ? item.exposure.map((e) => <span key={e.currency} className="exec-alp2-fig"><Dec value={e.value} currency={e.currency} /></span>) : <Na />}
              </Fig>
              <Fig label="Return"><Np id="FE-006" /></Fig>
              <Fig label="Max drawdown"><Np id="FE-025" /></Fig>
              <Fig label="Regime fit" basis="Separate from score">
                <Np id="FE-011" />{" "}
                <Link className="exec-blk-link" to={linkTo(`/deployments/alphas/${encodeURIComponent(alphaId)}?tab=regime`)}>Open</Link>
              </Fig>
            </dl>
            )}

            <div className="exec-alp2-tabbar">
              <div className="exec-alp2-tabs" role="tablist" aria-label="Alpha detail">
                {ALPHA_TABS.map((t, index) => (
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
              <div className="exec-alp2-more-wrap">
                <button type="button" className="exec-alp2-tab" aria-haspopup="menu" aria-expanded={moreOpen} data-active={inMore ? "true" : undefined} onClick={() => setMoreOpen((open) => !open)}>
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
                <PerformanceTab item={item} env={env} equity={equity} drift={drift} inputs={inputs} paths={paths} view={view} onView={(next) => url.set({ view: next === "act" ? null : next })} />
              ) : null}
              {tab === "deployments" ? <DeploymentsTab rows={rows} canSeeAccounts={canSeeAccounts} linkTo={linkTo} /> : null}
              {tab === "evidence" ? <EvidenceTab item={item} researchReason={drift.phase === "ready" ? drift.value.researchReason : null} /> : null}
              {tab === "regime" ? <RegimeTab /> : null}
              {tab === "orders" ? <OrdersTab alphaId={alphaId} book={book} activity={rollup} focusOrder={focusOrder} linkTo={linkTo} /> : null}
              {tab === "activity" ? <ActivityTab env={env} alphaId={alphaId} alphaLabel={label} inputs={inputs} paths={paths} timeline={timeline} book={book} /> : null}
              {tab === "replay" ? (
                <ReplayView
                  api={api}
                  alphaId={alphaId}
                  alphaLabel={label}
                  env={env}
                  item={item}
                  book={book}
                  focus={focus}
                  canSeeAccounts={canSeeAccounts}
                  ordersHref={linkTo(`/deployments/alphas/${encodeURIComponent(alphaId)}?tab=orders`)}
                  back={replayBack(params, linkTo(`/deployments/alphas/${encodeURIComponent(alphaId)}?tab=orders`))}
                />
              ) : null}
              {tab === "positions" ? <PositionsTab rows={positionRows(envelope?.data.positions)} canSeeAccounts={canSeeAccounts} linkTo={linkTo} /> : null}
              {tab === "reconciliation" ? <ReconciliationTab rows={reconciliationRows(envelope?.data.reconciliation)} /> : null}
            </div>
          </div>

          {selection === "score" ? <ScoreDrawer item={item} mode={mode} onClose={close} /> : null}
        </div>
      )}
    </div>
  );
}
