/**
 * Stateful preview controllers — EL-V2-03 (handoff §8).
 *
 * The rejected preview mounted five screens directly and left their callbacks
 * unset; optional chaining turned every click into silence, which "is worse
 * than a disabled control: it trains the user to distrust the product" (§2.3).
 * EL-V2-03 made those callbacks REQUIRED in the type, so a screen can no longer
 * be mounted enabled-but-inert. These controllers are what supplies them.
 *
 * Every control on a preview route falls into one §8.1 class, and each class
 * has one implementation here:
 *
 *   local UI interaction      tabs, filters, scope, lens, expand — real state,
 *                             mirrored into the URL so back navigation restores it
 *   canonical navigation      row/chip → the declared screen, entity and scope
 *                             carried in the path
 *   safe simulated workflow   sync/dry-run/load-older — an explicit fixture result
 *                             is announced (role=status) and recorded in a visible
 *                             ledger; local state changes
 *   unavailable mutation      nothing here pretends to reach a source: the screen
 *                             components render those disabled with a reason
 *
 * Nothing in this file constructs an HTTP adapter, an EventSource or a
 * Trading System client.
 */
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { FUNNEL_COMPLETE } from "./analytics.presentation.fixtures";
import { readOrderFunnel } from "./analytics";
import { account360 } from "./account360.fixtures";
import { alpha360 } from "./alpha360.fixtures";
import { BLOTTER_CROSS_FILTER, blotterPage } from "./blotter.fixtures";
import { GATE_MET, paperWorkbench } from "./paper.fixtures";
import { portfolio360 } from "./portfolio360.fixtures";
import { vnmWorkbench } from "./vnm.fixtures";
import { AccountBroker360 } from "./screens/AccountBroker360";
import { ALPHA_TABS, AlphaThreeSixty, type AlphaScope, type AlphaTab } from "./screens/AlphaThreeSixty";
import type { AlphaThreeSixtyData } from "./alpha360.fixtures";
import type { PortfolioThreeSixtyData } from "./portfolio360.fixtures";
import type { AccountBroker360Data } from "./account360.fixtures";
import type { PaperWorkbenchData } from "./paper.fixtures";
import { BLOTTER_FILTERS, FullBlotter, type BlotterRow } from "./screens/FullBlotter";
import type { BlotterFilter } from "./contracts";
import { PaperWorkbench, WORKBENCH_TABS, type WorkbenchTab } from "./screens/PaperWorkbench";
import { PORTFOLIO_TABS, PortfolioThreeSixty, type PortfolioTab } from "./screens/PortfolioThreeSixty";

/* -------------------------------------------------------------------------
 * Shared: URL-mirrored state, simulated-action ledger, canonical routes
 * ---------------------------------------------------------------------- */

/** Canonical routes, from the registry's screen table. Entity ids go in the path. */
export const ROUTES = {
  paper: (id: string) => `/deployments/paper/${id}`,
  vnm: (id: string) => `/deployments/paper/${id}/vn-market`,
  sandbox: (id: string) => `/deployments/sandbox/${id}`,
  canary: (id: string) => `/deployments/live/${id}/canary`,
  live: (id: string) => `/deployments/live/${id}`,
  alpha: (id: string) => `/deployments/alphas/${id}`,
  portfolio: (id: string) => `/deployments/portfolios/${id}`,
  account: (id: string) => `/deployments/accounts/${id}`,
  exitReview: (id: string) => `/governance/exit-reviews/${id}`,
  incident: (id: string) => `/execution/operations/incidents/${id}`,
  queue: () => "/execution/operations",
  blotter: () => "/deployments/blotter",
  adminActions: () => "/administration/actions",
} as const;

/** Stage → the workbench that owns a deployment at that stage. */
export function workbenchRouteFor(stage: string, deploymentId: string): string {
  switch (stage) {
    case "PAPER_OBSERVATION":
    case "PAPER":
      return ROUTES.paper(deploymentId);
    case "SANDBOX_VALIDATION":
    case "SANDBOX":
      return ROUTES.sandbox(deploymentId);
    case "LIVE_CANARY":
      return ROUTES.canary(deploymentId);
    case "LIVE_FULL":
    case "LIVE":
      return ROUTES.live(deploymentId);
    default:
      return ROUTES.paper(deploymentId);
  }
}

export interface SimulatedAction {
  at: number;
  action: string;
  result: string;
}

/**
 * One URL search param, typed by a list of allowed values. Anything not in the
 * list falls back to `fallback` — a hand-edited `?tab=x` cannot select a tab
 * that does not exist.
 */
function useParamState<T extends string>(key: string, allowed: readonly T[], fallback: T): [T, (next: T) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(key);
  const value = (allowed as readonly string[]).includes(raw ?? "") ? (raw as T) : fallback;
  const set = useCallback(
    (next: T) => {
      const copy = new URLSearchParams(params);
      if (next === fallback) copy.delete(key);
      else copy.set(key, next);
      setParams(copy, { replace: false });
    },
    [params, setParams, key, fallback],
  );
  return [value, set];
}

/**
 * The simulated-action ledger. Each safe workflow records what it did and
 * what the fixture answered; the region is `role="status"` so assistive
 * technology announces it, and the list is visible so a reviewer can see the
 * click did something without opening devtools.
 */
export function useSimulationLedger() {
  const [entries, setEntries] = useState<SimulatedAction[]>([]);
  const record = useCallback((action: string, result: string) => {
    setEntries((prev) => [...prev.slice(-9), { at: prev.length + 1, action, result }]);
  }, []);
  const view = (
    <div className="exec-sim" data-simulation-ledger={entries.length}>
      <p className="exec-role-meta exec-sim-live" role="status" aria-live="polite">
        {entries.length === 0
          ? "Simulated actions appear here."
          : `Simulated · ${entries[entries.length - 1].action} · ${entries[entries.length - 1].result}`}
      </p>
      {entries.length > 1 ? (
        <ol className="exec-sim-list">
          {entries.slice(0, -1).map((e) => (
            <li key={e.at} className="exec-role-meta">
              {e.action} · {e.result}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
  return { record, view, entries };
}

/* -------------------------------------------------------------------------
 * Paper Workbench (and its VN variant)
 * ---------------------------------------------------------------------- */

export function PaperWorkbenchPreview({
  deploymentId,
  variant = "paper",
  initial,
}: {
  deploymentId: string;
  variant?: "paper" | "vnm";
  /** Fixture overrides (e.g. STALE, GATE_MET) — the evidence page uses these. */
  initial?: Partial<PaperWorkbenchData>;
}) {
  const navigate = useNavigate();
  const [tab, setTab] = useParamState<WorkbenchTab>("tab", WORKBENCH_TABS, "Orders");
  const { record, view } = useSimulationLedger();
  const base = useMemo(
    () => (variant === "vnm" ? vnmWorkbench({ deploymentId, ...initial }) : paperWorkbench({ ...GATE_MET, deploymentId, ...initial })),
    [variant, deploymentId, initial],
  );
  return (
    <>
      <PaperWorkbench
        {...base}
        tab={tab}
        onTabChange={setTab}
        onLoadOlder={(which) => record(`load older · ${which}`, "fixture holds one page; no older rows exist")}
        onRequestExit={() => navigate(`${ROUTES.exitReview("EX-771")}?from=${encodeURIComponent(`${ROUTES.paper(deploymentId)}?tab=${tab}`)}`)}
        onAdminActions={() => navigate(ROUTES.adminActions())}
      />
      {view}
    </>
  );
}

/* -------------------------------------------------------------------------
 * Alpha 360
 * ---------------------------------------------------------------------- */

const ALPHA_VENUES = ["All", "BINANCE", "OKX", "DERIBIT", "VN MARKET"] as const;

/**
 * Scope narrows what is SHOWN; it never recomputes money. Deployment and venue
 * rows are filtered, and every KPI that the fixture publishes only for the
 * whole alpha is presented as absent with the reason — a per-venue KPI needs
 * a scoped query the fixture does not carry, and a browser-side sum would be
 * a frontend-invented financial fact.
 */
export function scopeAlpha(props: AlphaThreeSixtyData, venue: string): AlphaThreeSixtyData {
  if (venue === "All") return props;
  return {
    ...props,
    scope: { ...props.scope, venue },
    venues: props.venues.filter((v) => v.venue === venue),
    deployments: props.deployments.filter((d) => d.venue === venue),
    kpis: props.kpis.map((k) => ({
      ...k,
      value: null,
      absentReason: `not published for scope ${venue}; the fixture carries alpha-wide values only`,
    })),
  };
}

export function AlphaThreeSixtyPreview({ alphaId, initial }: { alphaId: string; initial?: Partial<AlphaThreeSixtyData> }) {
  const navigate = useNavigate();
  const [tab, setTab] = useParamState<AlphaTab>("tab", ALPHA_TABS, "Overview");
  const [venue, setVenue] = useParamState<(typeof ALPHA_VENUES)[number]>("venue", ALPHA_VENUES, "All");
  const { record, view } = useSimulationLedger();
  const base = useMemo(() => alpha360({ alphaId, ...initial }), [alphaId, initial]);
  const scoped = useMemo(() => scopeAlpha(base, venue), [base, venue]);
  const onScopeChange = (scope: AlphaScope) => {
    const next = (ALPHA_VENUES as readonly string[]).includes(scope.venue) ? (scope.venue as (typeof ALPHA_VENUES)[number]) : "All";
    setVenue(next);
    if (scope.window !== scoped.scope.window || scope.mode !== scoped.scope.mode || scope.portfolio !== scoped.scope.portfolio) {
      record("scope change", `window/mode/portfolio require a scoped query the fixture does not carry; venue applied (${next})`);
    }
  };
  return (
    <>
      <AlphaThreeSixty
        {...scoped}
        tab={tab}
        onTabChange={setTab}
        onScopeChange={onScopeChange}
        onLoadOlder={(which) => record(`load older · ${which}`, "fixture holds one page; no older rows exist")}
        onOpenDeployment={(row) => navigate(workbenchRouteFor(row.stage, row.deploymentId))}
        onOpenAccount={(accountId) => navigate(ROUTES.account(accountId))}
      />
      {view}
    </>
  );
}

/* -------------------------------------------------------------------------
 * Portfolio 360
 * ---------------------------------------------------------------------- */

export function PortfolioThreeSixtyPreview({ portfolioId, initial }: { portfolioId: string; initial?: Partial<PortfolioThreeSixtyData> }) {
  const navigate = useNavigate();
  const [tab, setTab] = useParamState<PortfolioTab>("tab", PORTFOLIO_TABS, "Overview");
  const [lens, setLens] = useState<number | null>(null);
  const base = useMemo(() => portfolio360({ portfolioId, ...initial }), [portfolioId, initial]);
  return (
    <PortfolioThreeSixty
      {...base}
      tab={tab}
      onTabChange={setTab}
      lensIndex={lens}
      onLensChange={setLens}
      onOpenAlpha={(alphaId) => navigate(ROUTES.alpha(alphaId))}
      onOpenAccount={(accountId) => navigate(ROUTES.account(accountId))}
    />
  );
}

/* -------------------------------------------------------------------------
 * Account / Broker 360
 * ---------------------------------------------------------------------- */

export function AccountBroker360Preview({ accountId, initial }: { accountId: string; initial?: Partial<AccountBroker360Data> }) {
  const { record, view } = useSimulationLedger();
  // The dev preview plays the operator persona (HiFi 1g's default); the
  // viewer variant is a fixture case on the evidence page. Visibility is
  // decided by this flag alone — never by whether a handler happens to exist.
  const base = useMemo(() => account360({ accountId, operatorAdmin: true, ...initial }), [accountId, initial]);
  return (
    <>
      <AccountBroker360
        {...base}
        onSyncNow={() => record("sync now", "fixture broker snapshot re-read · digest unchanged · age 0.9s · nothing was sent to a broker")}
        onDryRun={() => record("dry-run reconcile", "fixture reconciliation · 0 findings · no apply plan generated")}
      />
      {view}
    </>
  );
}

/* -------------------------------------------------------------------------
 * Full Blotter
 * ---------------------------------------------------------------------- */

export function FullBlotterPreview({ initialFilter = "ALL" }: { initialFilter?: BlotterFilter }) {
  const [filter, setFilter] = useParamState<BlotterFilter>("filter", BLOTTER_FILTERS, initialFilter);
  const [crossFilter, setCrossFilter] = useState<string | null>(BLOTTER_CROSS_FILTER);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { record, view } = useSimulationLedger();
  const page = useMemo(() => blotterPage(filter === "ALL" ? "ALL" : filter, crossFilter ? undefined : 0), [filter, crossFilter]);
  const funnel = useMemo(() => readOrderFunnel(FUNNEL_COMPLETE), []);
  return (
    <>
      <FullBlotter
        envelope={{ authority: "EXECUTION", asOf: "2026-08-22T10:42:01Z", freshness: "OK" }}
        page={page}
        filter={filter}
        onFilterChange={setFilter}
        crossFilter={crossFilter}
        onResetCrossFilter={() => {
          setCrossFilter(null);
          record("reset cross-filter", "selection cleared · counts follow the full scope");
        }}
        onLoadOlder={() => record("load older", `cursor ${page.nextCursor ?? "—"} · fixture holds one page; no older rows exist`)}
        expandedOrderId={expanded}
        funnel={expanded ? funnel : null}
        funnelStatus={expanded ? "ok" : undefined}
        onExpand={(row: BlotterRow) => setExpanded((cur) => (cur === row.orderId ? null : row.orderId))}
      />
      {view}
    </>
  );
}

export type { ReactNode };
