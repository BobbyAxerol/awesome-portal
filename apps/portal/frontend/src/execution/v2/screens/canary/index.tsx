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
import { CompactGaps, GapLine, KpiStrip, Kpi, SectionPanel, StageHeader, UrlTabs, type StageChips, type StageCrumb } from "../../blocks";
import { ChartTools, EquityPanel } from "../../charts";
import type { SeriesPoint as ChartPoint } from "../../charts/types";
import { readAsOf } from "../../boundary";
import { AlphaNameLine } from "../stage/AlphaNameLine";
import { alphaCrumb, portfolioLabel, stageIdentity } from "../stage/identity";
import { spineHistory, useStageLifecycle } from "../stage/useStageLifecycle";
import { useContextFacts } from "../../shell/contextFacts";
import { safeInternalHref } from "../../safeHref";
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
  trialCalendar,
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

/** The read did not answer: the chips say nothing (one `Not available` chip); the state panel below says why. */
const UNAVAILABLE_CHIPS: StageChips = {
  runtime: { state: "not-available" },
  freshness: { state: "not-available" },
  reconciliation: { state: "not-available" },
};

/**
 * The series the server published (FE-072): ONE deployment-level series with its own methodology, drawn as published (exact
 * decimal strings, no smoothing, no joining across a gap). The Paper and Backtest series of the hi-fi are a different request
 * (FE-029) and stay `Not published`; nothing is drawn from them.
 */
function PublishedSeries({ series }: { series: NonNullable<CanaryView["seriesPoints"]> }) {
  const points: ChartPoint[] = [];
  for (const p of series.points) {
    const at = readAsOf(Date.parse(p.t));
    if (at !== null) points.push({ t: at, v: p.value });
  }
  return (
    <div title={series.methodologyRef === null ? undefined : `Methodology ${series.methodologyRef}`}>
      <ChartTools label="Deployment series" columns={points.length === 0 ? [] : [{ key: "series", label: "Deployment series", points, unit: "money", currency: series.unit ?? undefined, signed: true }]}>
        <EquityPanel label="Deployment series" points={points} unit="money" currency={series.unit ?? undefined} signed height={200} />
      </ChartTools>
      <GapLine items={[{ label: "Paper and Backtest series", id: FE.series }]} />
    </div>
  );
}

function SeriesPanel({ view }: { view: CanaryView }) {
  return (
    <SectionPanel level={2} title="Live vs Paper vs Backtest" aside="Since canary start">
      {view.seriesPoints === null ? (
        <GapLine items={[{ label: "Live, Paper and Backtest series", id: FE.series }]} because={panelLine(view.series)} />
      ) : (
        <PublishedSeries series={view.seriesPoints} />
      )}
    </SectionPanel>
  );
}

export default function CanaryScreen(props: CanaryScreenProps) {
  return (
    <CompactGaps>
      <CanaryBody {...props} />
    </CompactGaps>
  );
}

function CanaryBody({ api, deploymentId, workspaceId }: CanaryScreenProps) {
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
  // The portfolio and the account are linked only when the read published their ids. The Alpha is linked ONLY when the
  // body published `alpha_id` (FE-066): never a link built from a strategy id or a guess.
  const identity = stageIdentity(view?.identity ?? null);
  const alpha = alphaCrumb(identity);
  // The stages the alpha has completed (FE-027): the ticks of the spine, from the alpha's Manager dataset when it publishes them.
  const history = spineHistory(useStageLifecycle(api, identity.alphaId, "canary", "live", wsId ?? null));
  const crumb: readonly StageCrumb[] = [
    { label: "Alpha Fleet", to: linkTo("/deployments/alphas") },
    ...(alpha === null ? [] : [{ label: alpha.label, to: linkTo(alpha.to) }]),
    { label: deploymentId },
    ...(view?.portfolioId ? [{ label: portfolioLabel(identity, view.portfolioId), to: linkTo(`/deployments/portfolios/${encodeURIComponent(view.portfolioId)}`) }] : []),
    ...(view?.accountId ? [{ label: view.accountId, to: linkTo(`/deployments/accounts/${encodeURIComponent(view.accountId)}`) }] : []),
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
    const href = safeInternalHref(view?.lineage.find((l) => l.kind === kind)?.href);
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
            <AlphaNameLine identity={identity} />
          </>
        )
      }
      actions={
        current === null ? undefined : (
          <button type="button" className="exec-cny-refresh" onClick={() => setRefresh((n) => n + 1)}>
            Refresh
          </button>
        )
      }
      chips={chips}
      spine={{ current: "canary", onSelect: spineSelect, stages: history, lockAhead: true }}
      extra={current === null ? undefined : <TrialStrip trial={trialOf(current)} calendar={trialCalendar(current)} />}
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
  const metrics = cells.flatMap((cell) => (cell.kind === "metric" ? [cell] : []));
  return (
    <div className="exec-cny-v2" data-screen="canary-v2" data-state="ready" data-body={result.view.body}>
      {header(chipsOf(result.view), result.view)}

      {banners.map((banner) => (
        <div key={banner.key} className="exec-blk-banner" role={banner.tone === "bad" ? "alert" : "status"} data-banner={banner.key} data-tone={banner.tone}>
          {banner.text}
        </div>
      ))}

      {/* A figure the source did not publish is not a tile holding the words: the missing ones are ONE line (reasons and request ids in its title). */}
      {metrics.length > 0 ? (
        <KpiStrip label="Canary figures" columns={metrics.length}>
          {metrics.map((cell) => (
            <Kpi key={cell.key} label={cell.label} metric={cell.metric} suffix={cell.suffix} signed={cell.signed} basis={cell.basis} />
          ))}
        </KpiStrip>
      ) : null}
      <GapLine
        items={cells.flatMap((cell) =>
          cell.kind === "metric" ? [] : [{ label: cell.label, id: cell.kind === "not-published" ? cell.fe : undefined, reason: cell.kind === "absent" ? cell.reason : undefined }],
        )}
      />

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
          <DecisionPanel view={result.view} />
          <BeforeScaleUp view={result.view} />
          <RollbackPanel view={result.view} />
        </div>
      </div>
    </div>
  );
}
