/**
 * Canary control room (UXM-07 S3, flag key `canary`, route `/deployments/live/:deploymentId/canary`).
 *
 * One deployment on a real-funded canary: the guard frame (double border, "Real
 * capital at risk"), five figures, the Live vs Paper vs Backtest return, four
 * tabs (Envelope, Positions & orders, Reconciliation, Guard rule) and a rail with
 * the promotion decisions, what blocks scale-up and rollback readiness.
 *
 * It reads `getCanaryVersioned`, so ONE screen handles both bodies a workspace
 * can answer on this route: the V1 control room, and the V2 following parent (the
 * Canary proposal only). `readCanaryView` turns either into one view; an answer
 * the dispatcher could not read is printed as `unsupportedText`, never half-drawn.
 *
 * What it will not do (S3 plan s4, D6, D7, D13): the source is dark today, so most
 * figures are `Not available` or `Not published (FE-xxx)`; no chip says Running,
 * Clean or Within envelope; nothing is divided (no Used %, no "8 days left"); the
 * four decisions are drawn disabled with their reason and My access, never enabled,
 * because there is no command route. The server is the permission boundary: a 403
 * reads as "You can't open this page", not as a role guess.
 *
 * URL: `tab` (envelope, positions-orders, reconciliation, guard-rule; V1 labels and
 * short slugs resolve through `tabAliases.ts`), `workspace_id` and `from` (carried).
 * Integration (the integrator wires, this file does not): `windowLock`
 * `{ reason: "The Canary trial fixes the window.", effective: "Trial window" }` and
 * `envLock` `{ reason: "The deployment fixes the environment.", effective: "live" }`.
 *
 * | Cardinality | Break point | Degradation | Server contract | Invariant | Perf budget |
 * |---|---|---|---|---|---|
 * | 1 deployment; 5 KPIs, 5 caps, 3 source panels, up to 16 blocker codes; positions and orders up to 200 rows per page (when typed) | over 200 rows in a table | tables print 200 and say "N of total" or "total not published"; blockers capped at 48 | FE-071 compliance, rollback and trial calendar; FE-072 typed rows and series; FE-029 chart; FE-066 names | no figure is computed or summed; absent = `Not available` or `Not published (FE-xxx)`; partial and stale stay worded | one read on open; 200 table rows and no chart nodes at most |
 */
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import type { ExecutionApi } from "../../../api/ports";
import { PanelState } from "../../../components/states";
import { KpiStrip, Kpi, NotPublished, SectionPanel, StageHeader, UrlTabs, type StageChips, type StageCrumb } from "../../blocks";
import { useContextFacts } from "../../shell/contextFacts";
import { useExecUrlState, withContext } from "../../urlState";
import type { SpineStageId } from "../../blocks";
import { EnvelopeTab } from "./EnvelopeTab";
import { PositionsOrdersTab } from "./PositionsOrdersTab";
import { BeforeScaleUp, DecisionPanel, RollbackPanel } from "./Rail";
import { GuardRuleTab, ReconciliationTab } from "./ReconGuardTabs";
import { TrialStrip } from "./TrialStrip";
import {
  ACCESS_PATH,
  CANARY_TABS,
  CANARY_TITLE,
  FE,
  LOADING_CHIPS,
  SPINE_ROUTES,
  bannersOf,
  chipsOf,
  kpiCells,
  panelLine,
  subtitleIds,
  trialOf,
} from "./model";
import { readCanaryView, type CanaryView } from "./readCanary";
import { useCanaryRead } from "./useCanaryRead";

import "../../css/canary.css";

export const CANARY_SCREEN_KEY = "canary" as const;

export interface CanaryScreenProps {
  api: ExecutionApi;
  deploymentId: string;
  /** Carried to the read as `workspace_id`; the URL's value wins. */
  workspaceId?: string;
}

const UNAVAILABLE_CHIPS: StageChips = {
  runtime: { state: "not-available", reason: "Not read" },
  freshness: { state: "not-available", reason: "Not read" },
  reconciliation: { state: "not-available", reason: "Not read" },
};

function SeriesPanel({ view }: { view: CanaryView }) {
  return (
    <SectionPanel title="Live vs Paper vs Backtest" aside="Return since canary start">
      <p className="exec-cny-series">
        <NotPublished id={FE.series}>Live, Paper and Backtest series</NotPublished> <span className="exec-blk-na">{panelLine(view.series)}.</span>
      </p>
    </SectionPanel>
  );
}

export default function CanaryScreen({ api, deploymentId, workspaceId }: CanaryScreenProps) {
  const url = useExecUrlState();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [refresh, setRefresh] = useState(0);
  const wsId = url.value.workspace_id ?? workspaceId;
  const read = useCanaryRead(api, deploymentId, wsId, refresh);
  const result = useMemo(() => (read.phase === "ready" ? readCanaryView(read.read) : null), [read]);
  const view = result !== null && result.kind === "view" ? result.view : null;

  // The currency the screen states, for the context bar; nothing while the read is in flight.
  useContextFacts({ ccy: view === null ? undefined : (view.envelope?.currency ?? null) });

  const linkTo = (href: string) => withContext(href, params);
  const crumb: readonly StageCrumb[] = [
    { label: "Alpha Fleet", to: linkTo("/deployments/alphas") },
    { label: deploymentId },
    { label: "Canary" },
  ];
  const retry = (
    <button type="button" className="exec-cny-refresh" onClick={() => setRefresh((n) => n + 1)}>
      Retry
    </button>
  );

  /* ── the read refused: the server is the boundary ─────────────────────── */
  if (read.phase === "error" && read.status === "denied") {
    return (
      <div className="exec-cny-v2" data-screen="canary-v2" data-state="denied">
        <header>
          <h1 className="exec-cny-plain-title">{CANARY_TITLE}</h1>
          <p className="exec-cny-plain-sub">The server refused this read.</p>
        </header>
        <section className="exec-cny-state" aria-label="Access">
          <p>You can't open this page.</p>
          <p>
            <Link to={linkTo(ACCESS_PATH)}>See what you can access</Link> · <Link to={linkTo("/deployments/alphas")}>Alpha Fleet</Link>
          </p>
          <p className="exec-blk-na">{read.reason}</p>
        </section>
      </div>
    );
  }

  const spineSelect = (stage: SpineStageId) => {
    if (stage === "canary") return;
    const to = SPINE_ROUTES[stage]?.(deploymentId);
    if (to !== undefined) {
      navigate(linkTo(to));
      return;
    }
    // R1 and R2: the lineage link when the body gave one, else the Approval Inbox (a real route).
    const kind = stage === "r1" ? "R1_APPROVAL" : "R2_APPROVAL";
    const href = view?.lineage.find((l) => l.kind === kind)?.href ?? null;
    navigate(linkTo(href ?? "/governance/approvals"));
  };

  const header = (chips: StageChips, current: CanaryView | null) => (
    <StageHeader
      stage="canary"
      crumb={crumb}
      title={CANARY_TITLE}
      subtitle={
        current === null ? undefined : (
          <>
            {subtitleIds(current).join(" · ")}
            {subtitleIds(current).length > 0 ? " · " : ""}
            <NotPublished id={FE.names}>Alpha name</NotPublished>
          </>
        )
      }
      chips={chips}
      spine={{ current: "canary", onSelect: spineSelect }}
      extra={current === null ? undefined : <TrialStrip trial={trialOf(current)} />}
      renderLink={(to, children) => <Link to={to}>{children}</Link>}
    />
  );

  /* ── in flight ────────────────────────────────────────────────────────── */
  if (read.phase === "loading") {
    return (
      <div className="exec-cny-v2" data-screen="canary-v2" data-state="loading">
        {header(LOADING_CHIPS, null)}
        <PanelState status="loading" />
      </div>
    );
  }
  if (read.phase === "error") {
    return (
      <div className="exec-cny-v2" data-screen="canary-v2" data-state={read.status}>
        {header(UNAVAILABLE_CHIPS, null)}
        <PanelState status={read.status} reason={read.reason} actions={retry} />
      </div>
    );
  }

  /* ── answered, but not something this build reads ─────────────────────── */
  if (result === null || result.kind === "unsupported") {
    return (
      <div className="exec-cny-v2" data-screen="canary-v2" data-state="unsupported">
        {header(UNAVAILABLE_CHIPS, null)}
        <PanelState
          status="unavailable"
          title="This response is not supported"
          reason={result === null ? "The response could not be read." : result.text}
          actions={retry}
        />
      </div>
    );
  }

  /* ── the control room ─────────────────────────────────────────────────── */
  const banners = bannersOf(result.view);
  const cells = kpiCells(result.view);
  return (
    <div className="exec-cny-v2" data-screen="canary-v2" data-state="ready" data-body={result.view.body}>
      {header(chipsOf(result.view), result.view)}

      {banners.map((banner) => (
        <div key={banner.key} className="exec-blk-banner" role="status" data-banner={banner.key}>
          {banner.text}
        </div>
      ))}

      <div className="exec-cny-toolbar">
        <button type="button" className="exec-cny-refresh" onClick={() => setRefresh((n) => n + 1)}>
          Refresh
        </button>
      </div>

      <KpiStrip label="Canary figures" columns={5}>
        {cells.map((cell) => {
          if (cell.kind === "not-published") return <Kpi key={cell.key} label={cell.label} notPublished={cell.fe} />;
          if (cell.kind === "absent") return <Kpi key={cell.key} label={cell.label} absentReason={cell.reason} basis={cell.basis} />;
          return <Kpi key={cell.key} label={cell.label} metric={cell.metric} suffix={cell.suffix} signed={cell.signed} basis={cell.basis} />;
        })}
      </KpiStrip>

      <div className="exec-cny-grid">
        <div className="exec-cny-col">
          <SeriesPanel view={result.view} />
          <UrlTabs surface="canary" tabs={CANARY_TABS} label="Canary sections">
            {(active) => {
              switch (active) {
                case "positions-orders":
                  return <PositionsOrdersTab view={result.view} />;
                case "reconciliation":
                  return <ReconciliationTab view={result.view} />;
                case "guard-rule":
                  return <GuardRuleTab view={result.view} />;
                default:
                  return <EnvelopeTab view={result.view} />;
              }
            }}
          </UrlTabs>
        </div>
        <div className="exec-cny-rail">
          <DecisionPanel />
          <BeforeScaleUp view={result.view} />
          <RollbackPanel view={result.view} />
        </div>
      </div>
    </div>
  );
}
