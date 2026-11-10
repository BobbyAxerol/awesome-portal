/**
 * Portfolio 360 (UXM-07 S2, flag key `portfolios`, route `/deployments/portfolios/:portfolioId`).
 *
 * Six tabs from the hi-fi (Overview, Allocations, Alphas, Accounts, Risk and
 * Health, People and Activity); the V1 labels resolve through `tabAliases`
 * (`Capital Ledger` opens Allocations at `#ledger`, `Structure & Correlation`
 * opens Risk, `Approvals` and `Incidents` open People at their panel).
 *
 * What it shows, and from where: identity and membership from the EDS-04
 * portfolio resource; capital per environment from the EDS-05 derivation as
 * CURRENT facts; the equity series from the EDS-07 chart route (retained
 * snapshots, drawn exactly as served); the ledger and correlation from their
 * analytics reads. What the backend has not published is a sentence with its
 * request id: NAV, Net PnL, Return, Drawdown, Concentration, capital
 * statements, flow edges, the activity feed and the audit source. No figure is
 * added, converted or windowed here, and Real-funded and Simulated capital
 * are never in one block.
 *
 * The Actions rail lists every action disabled with its reason (FE-015,
 * FE-020). It is a dock selection (`sel=rail:actions`), so Back closes it.
 *
 * URL: `tab` (default Overview), `window` (shared context), `sel`
 * (`rail:actions`). Defaults are omitted.
 *
 * | Cell | Value |
 * |---|---|
 * | Cardinality | hi-fi 4 alphas, 5 deployments, 3 accounts; real 10 to 60 deployments, 5 to 20 accounts, ledgers of 10^2 to 10^4 entries, equity of 10^3 to 10^5 points |
 * | Break point | >200 DOM rows in a table; 6 tabs under 660px; a 5,000-point series |
 * | Degradation | tables cap at 200 rows, ledgers read bounded; the chart reduces to min and max per bucket and prints the envelope; tabs read their data on first open; cards at or below 660px |
 * | Server contract | portfolio resource, capital derivation, `capital-ledger` (bounded, no older page), `views/equity-chart` (downsample metadata); requested: ledger cursor, flow edges and receipts (FE-032), windowed metrics (FE-005/006/013/025) |
 * | Invariant | one currency per figure, never summed; Real-funded and Simulated apart; a balance is the account's; gaps stay gaps; PARTIAL and STALE keep their flag |
 * | Perf budget | 5 reads on open (resource, 3 capital, chart); at most 3 more per tab; <=200 rows per table; chart under 150 SVG elements |
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import type { ExecutionApi } from "../../../../api/ports";
import { PanelState } from "../../../../components/states";
import { useDockMode, useDockSelection } from "../../../Drawer";
import { Flag } from "../../../Flag";
import { holds, V2_NAV_TOKEN } from "../../../shell/roleNav";
import { applyTab, resolveTab } from "../../../tabAliases";
import { useExecUrlState, withContext } from "../../../urlState";
import { freshnessFlag, humanize } from "../format";
import { EXPORT_REASON } from "../fe";
import { COMPARE_OFF_REASON, DEFAULT_ROUTES, FROM_PORTFOLIO_PREFIX, joinQuery, type PortfolioRoutes } from "../routes";
import { IN_PARAM } from "../selection";
import { Allocations } from "./Allocations";
import { AccountsTab, AlphasTab } from "./AlphasAccounts";
import type { TabCtx } from "./ctx";
import { readAccounts, readDeployments, readIdentity, environmentsOf } from "./model";
import { Overview } from "./Overview";
import { PeopleTab } from "./People";
import { ActionsRail, RAIL_SELECTION } from "./Rail";
import { useRailEligibility } from "./useRailEligibility";
import { RiskTab } from "./Risk";
import { usePortfolioReads, type Visited } from "./use360";

import "../../../css/portfolios.css";
import { formatInstant } from "../../../boundary";
import { GapWhy } from "../../../blocks";

export const PORTFOLIO_SCREEN_KEY = "portfolios" as const;

export interface PortfolioScreenProps {
  api: ExecutionApi;
  /** The route's `:portfolioId`. Absent is a stated state, not a guess. */
  portfolioId?: string;
  /**
   * The session's capability list. When given, a caller without
   * `nav:EXECUTION_PORTFOLIOS` (menu token) gets the denial, and without
   * `nav:EXECUTION_ACCOUNTS_BINDINGS` (menu token) the Accounts tab and account links are off.
   */
  capabilities?: ReadonlySet<string>;
  routes?: PortfolioRoutes;
}

type TabKey = "overview" | "allocations" | "alphas" | "accounts" | "risk" | "people";

const TABS: readonly { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "allocations", label: "Allocations" },
  { key: "alphas", label: "Alphas" },
  { key: "accounts", label: "Accounts" },
  { key: "risk", label: "Risk and Health" },
  { key: "people", label: "People and Activity" },
];

/** V1 and V2 tab keys that open a panel of another tab. */
const ANCHORED: Readonly<Record<string, { tab: TabKey; anchor: string }>> = {
  approvals: { tab: "people", anchor: "approvals" },
  incidents: { tab: "people", anchor: "incidents" },
};

function isTabKey(value: string): value is TabKey {
  return TABS.some((tab) => tab.key === value);
}

export default function PortfolioScreen({ api, portfolioId, capabilities, routes = DEFAULT_ROUTES }: PortfolioScreenProps) {
  const url = useExecUrlState();
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const tabsId = useId();
  const { selection, select, close } = useDockSelection();
  const mode = useDockMode();

  const permitted = capabilities === undefined || holds(capabilities, { allOf: [V2_NAV_TOKEN.portfolios] });
  const mayOpenAccounts = capabilities === undefined || holds(capabilities, { allOf: [V2_NAV_TOKEN.accounts] });

  /* ── tab from the URL ─────────────────────────────────────────────── */
  const resolution = useMemo(() => resolveTab("portfolio", url.value.tab), [url.value.tab]);
  const anchored = ANCHORED[resolution.target.tab];
  const wanted: TabKey = anchored ? anchored.tab : isTabKey(resolution.target.tab) ? resolution.target.tab : "overview";
  const anchor = anchored?.anchor ?? (resolution.target.hash ?? null);
  const accountsRefused = wanted === "accounts" && !mayOpenAccounts;
  const activeTab: TabKey = accountsRefused ? "overview" : wanted;

  // A V1 label in the URL is rewritten once, with replace, to its V2 key.
  useEffect(() => {
    if (!resolution.legacy) return;
    const next = applyTab("portfolio", params, resolution);
    const query = next.search.toString();
    navigate({ pathname: location.pathname, search: query === "" ? "" : `?${query}`, hash: next.hash }, { replace: true });
  }, [resolution, params, navigate, location.pathname]);

  const [opened, setOpened] = useState<Visited>({ allocations: false, risk: false, people: false });
  const visited: Visited = {
    allocations: opened.allocations || activeTab === "allocations",
    risk: opened.risk || activeTab === "risk",
    people: opened.people || activeTab === "people",
  };
  useEffect(() => {
    if (activeTab === "allocations" || activeTab === "risk" || activeTab === "people") {
      setOpened((current) => (current[activeTab] ? current : { ...current, [activeTab]: true }));
    }
  }, [activeTab]);

  const id = portfolioId ?? "";
  // The caller's own eligibility for the capital actions the Actions rail names: asked once, only while the rail is open and the
  // address names a workspace (DEBT-UXM07-011). It words the rail's reasons; it never enables a control.
  const railEligibility = useRailEligibility(api, { enabled: selection === RAIL_SELECTION && permitted, workspaceId: url.value.workspace_id, environment: url.value.env, portfolioId: id });
  const reads = usePortfolioReads(api, id, permitted && id !== "", url.value.window, visited);

  const resource = reads.resource.phase === "ready" ? reads.resource.value : reads.resource.phase === "loading" || reads.resource.phase === "error" ? reads.resource.last : null;
  const identity = useMemo(() => (resource && id ? readIdentity(resource, id) : null), [resource, id]);
  const deployments = useMemo(() => (resource ? readDeployments(resource) : []), [resource]);
  const accounts = useMemo(() => (resource ? readAccounts(resource, deployments) : []), [resource, deployments]);
  const environments = useMemo(() => (resource ? environmentsOf(resource, deployments) : []), [resource, deployments]);

  // Move to the panel a V1 `Approvals` or `Incidents` link named.
  const scrolled = useRef<string | null>(null);
  useEffect(() => {
    if (anchor === null || scrolled.current === `${activeTab}#${anchor}` || identity === null) return;
    const target = document.getElementById(anchor);
    if (target !== null) {
      scrolled.current = `${activeTab}#${anchor}`;
      target.scrollIntoView?.();
    }
  }, [anchor, activeTab, identity, reads.operations.phase]);

  const goto = (key: TabKey) => url.set({ tab: key === "overview" ? null : key, sel: null });
  const visibleTabs = TABS.filter((tab) => tab.key !== "accounts" || mayOpenAccounts);
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = visibleTabs.length - 1;
    const next = event.key === "ArrowRight" ? (index === last ? 0 : index + 1)
      : event.key === "ArrowLeft" ? (index === 0 ? last : index - 1)
        : event.key === "Home" ? 0 : event.key === "End" ? last : null;
    if (next === null) return;
    event.preventDefault();
    goto(visibleTabs[next].key);
    document.getElementById(`${tabsId}-tab-${visibleTabs[next].key}`)?.focus();
  };

  if (!permitted) {
    return (
      <div className="exec-pf-v2" data-screen="portfolio-360-v2">
        <header className="exec-pf-head"><h1 className="exec-pf-h1">Portfolio</h1></header>
        <section className="exec-pf-denied" aria-label="Access">
          <PanelState status="denied" reason="Portfolios is not listed in your navigation read." />
          <Link to={routes.access}>See what you can access</Link>
        </section>
      </div>
    );
  }
  if (id === "") {
    return (
      <div className="exec-pf-v2" data-screen="portfolio-360-v2">
        <header className="exec-pf-head"><h1 className="exec-pf-h1">Portfolio</h1></header>
        <PanelState status="empty" reason="No portfolio was named in the address." />
        <Link to={withContext(routes.list, params)}>Back to Portfolios</Link>
      </div>
    );
  }

  const state = reads.resource;
  const body = (() => {
    if (state.phase === "idle" || (state.phase === "loading" && resource === null)) return <PanelState status="loading" />;
    if (state.phase === "error" && resource === null) return <PanelState status={state.status} reason={state.reason} />;
    if (resource === null) return <PanelState status="loading" />;
    if (identity === null) {
      return <PanelState status={resource.state === "empty" ? "empty" : "partial"} reason={`Portfolio ${id} is not present in the projected resource population.`} />;
    }
    const ctx: TabCtx = { api, portfolioId: id, identity, resource, deployments, accounts, environments, routes, search: params, reads, window: url.value.window, mayOpenAccounts };
    return (
      <>
        {resource.completeness !== null && resource.completeness.toUpperCase() !== "COMPLETE" ? (
          <p className="exec-pf-banner" role="status"><Flag kind="partial" label="Partial" size="sm" /> <span>Some relations may be missing</span><GapWhy name="Why relations may be missing" rows={[`The resource is ${humanize(resource.completeness).toLowerCase()}`]} next={null} /></p>
        ) : null}
        {resource.unavailableBranches.length > 0 ? (
          <p className="exec-pf-banner" role="status"><Flag kind="partial" label="Branch not whole" size="sm" /> Not available: {resource.unavailableBranches.map(humanize).join(", ")}</p>
        ) : null}
        {accountsRefused ? <p className="exec-pf-banner" role="status">Accounts is not listed in your navigation read, so the Accounts tab is off. Showing Overview.</p> : null}
        {resolution.notice ? <p className="exec-pf-banner" role="status">{resolution.notice}</p> : null}
        <div>
          <div className="exec-pf-tabs" role="tablist" aria-label="Portfolio sections">
            {visibleTabs.map((tab, index) => (
              <button
                key={tab.key}
                id={`${tabsId}-tab-${tab.key}`}
                type="button"
                role="tab"
                className="exec-pf-tab"
                aria-selected={activeTab === tab.key}
                aria-controls={`${tabsId}-panel`}
                tabIndex={activeTab === tab.key ? 0 : -1}
                onClick={() => goto(tab.key)}
                onKeyDown={(event) => onTabKey(event, index)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-tab-${activeTab}`} className="exec-pf-tabpanel">
            {activeTab === "overview" ? <Overview ctx={ctx} /> : null}
            {activeTab === "allocations" ? <Allocations ctx={ctx} /> : null}
            {activeTab === "alphas" ? <AlphasTab ctx={ctx} /> : null}
            {activeTab === "accounts" ? <AccountsTab ctx={ctx} /> : null}
            {activeTab === "risk" ? <RiskTab ctx={ctx} /> : null}
            {activeTab === "people" ? <PeopleTab ctx={ctx} /> : null}
          </div>
        </div>
      </>
    );
  })();

  const fresh = resource ? freshnessFlag(resource.freshness) : null;
  const subParts = [identity?.portfolioId ?? id, identity?.owner ?? null, identity?.baseCurrency ?? null].filter((part): part is string => part !== null);
  const compareHref = routes.compare === null
    ? null
    : withContext(joinQuery(routes.compare, `${IN_PARAM}=${encodeURIComponent(id)}&from=${FROM_PORTFOLIO_PREFIX}${encodeURIComponent(id)}`), params);

  return (
    <div className="exec-pf-v2" data-screen="portfolio-360-v2">
      <header className="exec-pf-head">
        <div>
          <p className="exec-pf-crumb"><Link to={withContext(routes.list, params)}>Portfolios</Link></p>
          <h1 className="exec-pf-h1">{identity?.name ?? id}</h1>
          <p className="exec-pf-sub">
            <span className="exec-pf-id">{subParts[0]}</span>
            {subParts.slice(1).map((part) => <span key={part}> · {part}</span>)}
            {identity && identity.owner === null ? <span> · Owner: Not available</span> : null}
            {identity && identity.baseCurrency === null ? <span> · Base currency: Not available</span> : null}
          </p>
        </div>
        <div className="exec-pf-ctrls">
          {identity ? <Flag kind={identity.stateKind} label={identity.stateLabel} size="sm" /> : null}
          {fresh ? <Flag kind={fresh.kind} label={fresh.label} size="sm" /> : null}
          {resource ? <span className="exec-pf-dim">{resource.asOf ? `As of ${formatInstant(resource.asOf)}` : "Source time not published"}</span> : null}
          <span className="exec-pf-report" data-testid="report-pack">
            <GapWhy className="exec-blk-np-word" gap="D20" text="Report pack: not available yet" name="Report pack: not available yet, reason" rows={[EXPORT_REASON, "A report pack needs the export contract; nothing is generated here."]} next={null} />
            {" · "}<Link to={withContext(routes.access, params)}>My access</Link>
          </span>
          {compareHref === null ? (
            <span className="exec-pf-btnwhy">
              <button type="button" className="exec-pf-btn" disabled aria-describedby={`${tabsId}-compare`}>Compare with</button>
              <span id={`${tabsId}-compare`} className="exec-pf-why">{COMPARE_OFF_REASON}</span>
            </span>
          ) : (
            <Link className="exec-pf-link-btn" to={compareHref}>Compare with</Link>
          )}
          <button type="button" className="exec-pf-btn" disabled={identity === null} title={identity === null ? "The portfolio has not resolved" : undefined} onClick={() => select(RAIL_SELECTION)}>Actions</button>
        </div>
      </header>
      <div className="exec-pf-main" data-docked={selection === RAIL_SELECTION && mode === "dock" ? "true" : undefined}>
        <div className="exec-pf-body">{body}</div>
        {selection === RAIL_SELECTION && identity !== null ? (
          <ActionsRail
            portfolioName={identity.name}
            mode={mode}
            onClose={close}
            access={<Link to={withContext(routes.access, params)}>See what you can access</Link>}
            statements={(reads.dataset.phase === "ready" ? reads.dataset.value : reads.dataset.phase === "loading" || reads.dataset.phase === "error" ? reads.dataset.last : null)?.capitalStatements ?? []}
            eligibility={railEligibility.view}
            onRetry={railEligibility.retry}
          />
        ) : null}
      </div>
    </div>
  );
}
