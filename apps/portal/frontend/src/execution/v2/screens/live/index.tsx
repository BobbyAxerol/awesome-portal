/**
 * Live operations (UXM-07 S3, flag key `live`): the Real-funded stage with full capital at risk.
 *
 * One route, two bodies. `GET /deployments/{id}/live` answers the V1 live-full-operations body or, in a
 * SCOPED_V2 workspace, the V2 live-source-operations body (eleven panels of retained observations).
 * The version-aware port tags which one came back; this screen builds one `LiveModel` from either
 * (model.ts) and a body it does not read is worded by `unsupportedText`, never half-shown.
 *
 * What it will not do.
 * - Print a figure the source did not publish. Runtime and Reconciliation are `Not published (FE-067)` or
 *   `Not available`; KPIs, the Triad rows, the series, positions on a V1 body, the gap window and the
 *   Leverage and Ack latency columns are `Not published (FE-072/013)`. Never 0, never a dash.
 * - Show a broker figure while the figures disagree or the broker state is not verified. The V1 reader strips
 *   them (liveFull.ts); the Triad then says "Hidden while the figures disagree" only for MISMATCH.
 * - Offer a command. Halt, Reduce, Emergency close and the risk-increasing action are disabled
 *   `DockAction`s with "Live decisions are closed on this build" and a My access link, whatever the
 *   policy flags say (D6): there is no command route on this build.
 * - Redirect. A deployment whose V1 body names Canary gets one line with a link to the Canary control room (D5).
 *
 * URL: `tab` (exposure-orders by default; the V1 labels and short slugs resolve through tabAliases),
 * `workspace_id` and the context keys are carried. `panel` and `cursor` are internal read parameters,
 * never in the page URL.
 *
 * | Cardinality | Break point | Degradation | Server contract | Invariant | Perf budget |
 * |---|---|---|---|---|---|
 * | 1 deployment; 10 pageable panels of 200 rows per page (V2); one chart series (not published) | over 200 rows in a table | tables draw 200 and say "Top 200 of N loaded · total not published"; keyset `Load more` per panel with the server's opaque cursor; an expired cursor restarts that panel and says so | `?panel=&cursor=` (lps2 cursors), `exact_total: null`, FE-072 typed rows, FE-013 series, FE-067 runtime | a page size is never a total; a withheld broker figure never reaches the DOM; null is not zero; a gap or a mismatch replaces the chart | one read on open, one read per Load more; at most 200 rows per table |
 */
import { useMemo, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import type { ExecutionApi } from "../../../api/ports";
import { PanelSkeleton, PanelState } from "../../../components/states";
import { BlockerList, Kpi, KpiStrip, StageHeader, UrlTabs, type StageCrumb, type StageTab } from "../../blocks";
import { unsupportedText, type LiveFullVersionRead } from "../../readers/dispatch";
import { useExecUrlState, withContext } from "../../urlState";
import { ChartSlot } from "./parts";
import { ContinuityTab, ExposureTab, GuardRulesTab, PredecessorTab, ProtectiveLadder } from "./tabs";
import { ACCESS_PATH, FLEET_PATH, LIVE_TABS, canaryHref, liveModelOf, type KpiCell, type LiveModel } from "./model";
import { useLiveRead, usePanelPaging } from "./useLiveReads";

import "../../css/live.css";

export { LIVE_SCREEN_KEY } from "./model";

export interface LiveScreenProps {
  api: ExecutionApi;
  /** `/deployments/live/:deploymentId`. */
  deploymentId: string;
  /** Carried to the read (`workspace_id`); the URL's value wins. */
  workspaceId?: string;
}

const enc = encodeURIComponent;
const TAB_LIST: readonly StageTab[] = LIVE_TABS.map((tab) => ({ id: tab.id, label: tab.label }));

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="exec-liv-v2" data-screen="live-v2">
      {children}
    </div>
  );
}

function Denied() {
  const [params] = useSearchParams();
  return (
    <Frame>
      <header className="exec-liv-plainhead">
        <h1 className="exec-liv-title">Live operations</h1>
        <p className="exec-liv-sub">Operators, managers and reviewers</p>
      </header>
      <PanelState
        status="denied"
        title="You can't open this page"
        reason="Live operations is outside what your access allows."
        actions={
          <span className="exec-liv-actions">
            <Link className="exec-blk-link" to={withContext(ACCESS_PATH, params)}>See what you can access</Link>
            <Link className="exec-blk-link" to={withContext(FLEET_PATH, params)}>Alpha Fleet</Link>
          </span>
        }
      />
    </Frame>
  );
}

function kpiView(cell: KpiCell) {
  switch (cell.kind) {
    case "metric":
      return <Kpi key={cell.key} label={cell.label} metric={cell.metric} suffix={cell.suffix} basis={cell.basis} signed={cell.signed} />;
    case "hidden":
      return <Kpi key={cell.key} label={cell.label} value="Hidden" basis={cell.basis} />;
    case "not-published":
      return <Kpi key={cell.key} label={cell.label} notPublished="FE-072" />;
    case "absent":
      return <Kpi key={cell.key} label={cell.label} absentReason={cell.absentReason} />;
  }
}

function LiveBody({ model, api, deploymentId, workspaceId, v2, reload }: { model: LiveModel; api: ExecutionApi; deploymentId: string; workspaceId: string | undefined; v2: Parameters<typeof usePanelPaging>[3]; reload(): void }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const paging = usePanelPaging(api, deploymentId, workspaceId, v2);
  const id = model.deploymentId ?? deploymentId;

  const crumb: StageCrumb[] = [
    { label: "Alpha Fleet", to: withContext(FLEET_PATH, params) },
    ...(model.portfolioId ? [{ label: model.portfolioId, to: withContext(`/deployments/portfolios/${enc(model.portfolioId)}`, params) }] : []),
    ...(model.accountId ? [{ label: model.accountId, to: withContext(`/deployments/accounts/${enc(model.accountId)}`, params) }] : []),
    { label: "Live" },
  ];
  const subtitle = [id, model.venue].filter((part): part is string => typeof part === "string" && part !== "").join(" · ");

  const blockerNotes = useMemo(
    () => (
      <ul className="exec-blocker-codes">
        {model.blockerProvenance.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    ),
    [model.blockerProvenance],
  );

  return (
    <Frame>
      <StageHeader
        stage="live"
        crumb={crumb}
        title="Live operations"
        subtitle={subtitle}
        chips={model.chips}
        spine={{
          current: model.stage,
          blocked: model.spineBlocked,
          onSelect: (stage) => {
            const to = model.spineTargets[stage];
            if (to !== undefined) navigate(withContext(to, params));
          },
        }}
        renderLink={(to, children) => <Link to={to}>{children}</Link>}
      />
      {model.inCanary ? (
        <p className="exec-liv-banner" data-kind="canary" role="status">
          This deployment is in Canary.{" "}
          <Link className="exec-blk-link" to={withContext(canaryHref(id), params)}>Open the Canary control room</Link>
        </p>
      ) : null}
      {model.notice ? (
        <p className="exec-liv-banner" data-kind={model.notice.kind} role={model.notice.kind === "untrusted" ? "alert" : "status"}>
          {model.notice.text}
        </p>
      ) : null}
      <div className="exec-liv-actions">
        {/* One read per press: the body is replaced by the loading frame until it answers, so there is no second in flight. */}
        <button type="button" className="exec-blk-btn" onClick={reload}>Refresh</button>
      </div>
      <KpiStrip label="Live figures" columns={5}>
        {model.kpis.map(kpiView)}
      </KpiStrip>
      <div className="exec-liv-grid">
        <div className="exec-liv-main">
          <ChartSlot slot={model.chart} />
          <UrlTabs surface="live" tabs={TAB_LIST} label="Live sections">
            {(active) => {
              switch (active) {
                case "continuity":
                  return <ContinuityTab model={model} v2={v2} paging={paging} />;
                case "predecessor-envelope":
                  return <PredecessorTab model={model} />;
                case "guard-rules":
                  return <GuardRulesTab model={model} />;
                default:
                  return <ExposureTab model={model} v2={v2} paging={paging} />;
              }
            }}
          </UrlTabs>
        </div>
        <aside className="exec-liv-rail" aria-label="Protective actions and blockers">
          <ProtectiveLadder model={model} />
          <BlockerList level={2} items={model.blockers} provenance={blockerNotes} />
        </aside>
      </div>
    </Frame>
  );
}

export default function LiveScreen({ api, deploymentId, workspaceId }: LiveScreenProps) {
  const url = useExecUrlState();
  const [params] = useSearchParams();
  const wsId = url.value.workspace_id ?? workspaceId;
  const { state, reload } = useLiveRead(api, deploymentId, wsId);

  if (state.phase === "loading") {
    return (
      <Frame>
        <header className="exec-liv-plainhead">
          <h1 className="exec-liv-title">Live operations</h1>
        </header>
        <PanelSkeleton label="Loading Live operations" />
      </Frame>
    );
  }
  if (state.phase === "error") {
    if (state.status === "denied") return <Denied />;
    return (
      <Frame>
        <header className="exec-liv-plainhead">
          <h1 className="exec-liv-title">Live operations</h1>
        </header>
        <PanelState
          status={state.status}
          reason={state.reason}
          actions={
            <span className="exec-liv-actions">
              <button type="button" className="exec-blk-btn" onClick={reload}>Try again</button>
              <Link className="exec-blk-link" to={withContext(FLEET_PATH, params)}>Alpha Fleet</Link>
            </span>
          }
        />
      </Frame>
    );
  }
  return <Ready read={state.read} api={api} deploymentId={deploymentId} workspaceId={wsId} reload={reload} />;
}

function Ready({ read, api, deploymentId, workspaceId, reload }: { read: LiveFullVersionRead; api: ExecutionApi; deploymentId: string; workspaceId: string | undefined; reload(): void }) {
  const built = useMemo(() => liveModelOf(read), [read]);
  if (built.kind === "unsupported") {
    return (
      <Frame>
        <header className="exec-liv-plainhead">
          <h1 className="exec-liv-title">Live operations</h1>
        </header>
        <PanelState status="unavailable" title="This response cannot be shown" reason={unsupportedText(built.read)} actions={<button type="button" className="exec-blk-btn" onClick={reload}>Try again</button>} />
      </Frame>
    );
  }
  return <LiveBody model={built.model} v2={built.v2} api={api} deploymentId={deploymentId} workspaceId={workspaceId} reload={reload} />;
}
