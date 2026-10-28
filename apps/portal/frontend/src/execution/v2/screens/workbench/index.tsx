/**
 * Paper workbench (UXM-07 S3, flag key `workbench`): one paper deployment, one
 * URL. Masthead with three state chips, the lifecycle strip, and the tabs
 * Overview, Orders, Fills, Positions and Sessions. It replaces V1's
 * `PaperWorkbenchRichContainer` (route `/deployments/paper/:deploymentId` and
 * its `/vn-market` variant; the variant is a prop, not a second screen).
 *
 * Reads (through the ExecutionApi port, no new endpoint): the deployment
 * profile `getPaperWorkbenchProfile` and the execution-quality derivation
 * `getDeploymentQuality`. Each is read once when the screen opens; the profile
 * is large (about 7.4 MB and ~6 s on dev, S3 plan D11/D12), so nothing polls
 * and the Refresh control re-reads while the old answer stays on screen.
 *
 * What it will not do (S3 plan D13): print "Running" or "Reconciling" without a
 * published state (FE-067), draw R1 or R2 as done (FE-027/028), print an age
 * such as "Stale 14m", draw an approved band (FE-029), derive a drawdown
 * (FE-013), show Long/Short/Gross (FE-051) or invent session rows (FE-067). The
 * verdict of the observation gate is the server's. Nothing here writes: the
 * exit-review action is disabled with its reason and a My access link.
 *
 * URL: `tab` (default Overview; V1 labels and `#accounting`/`#evidence` anchors
 * resolve through `tabAliases`), plus the shared context keys, carried on every
 * internal link. The environment is not a choice here: a paper deployment is
 * the Paper book.
 *
 * Roles: none. The session's capabilities narrow nothing (RK-1, DEBT-UXM07-005): the Account links
 * and the account line follow what the profile served ("Account not published" when it did not).
 *
 * | Cardinality | Break point | Degradation | Server contract | Invariant | Perf budget |
 * |---|---|---|---|---|---|
 * | 1 deployment; orders and fills in the thousands, positions tens, equity snapshots up to 1.4k; profile 0.1 to 7.4 MB | over 200 rows in a table, 5,000 chart points, or a profile read over ~6 s | tables keep the 200 newest and say "Showing 200 of N"; the chart keeps min and max per bucket and prints its envelope; one read plus Refresh | `execution.paper-workbench.shadow-panel.v1` keyset (asked of Codex, D12); FE-067 runtime, sessions and reconciliation; FE-028/029/027 gate, band and lifecycle; FE-066 names | a cap or a downsample is always worded; absent is `Not published (FE-xxx)` or `Not available`; PARTIAL and STALE stay worded | one profile read and one quality read on open; at most 200 table rows, under 150 chart nodes |
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import type { ExecutionApi } from "../../../api/ports";
import { Flag } from "../../Flag";
import { CompactGaps, GapWhy, PanelGate, StateBoundary, UrlTabs } from "../../blocks";
import { formatAsOf } from "../../boundary";
import { resolveTab } from "../../tabAliases";
import { useMediaQuery } from "../../useMediaQuery";
import { withContext } from "../../urlState";
import { stageIdentity } from "../stage/identity";
import { spineHistory, useStageCriteria, useStageExit, useStageLifecycle } from "../stage/useStageLifecycle";
import { FillsTab } from "./FillsTab";
import { Header, LOADING_CHIPS, LifecyclePanel, UNREAD_CHIPS, chipsOf } from "./Header";
import { OrdersTab } from "./OrdersTab";
import { OverviewTab } from "./OverviewTab";
import { PositionsTab } from "./PositionsTab";
import { SessionsTab } from "./SessionsTab";
import { StickySummary } from "./StickySummary";
import { DEFAULT_ACCESS_HREF, DEFAULT_ROUTES, WB_TABS, WORKBENCH_SCREEN_KEY, buildWorkbench, envelopeReadAt, exitReviewReason, type OrderRow, type WorkbenchRoutes } from "./model";
import { useWorkbenchReads } from "./useWorkbenchReads";

import "../../css/workbench.css";

export { WORKBENCH_SCREEN_KEY };

export interface PaperWorkbenchScreenProps {
  api: ExecutionApi;
  /** The route's deployment id. */
  deploymentId: string;
  /** `vnm` is the `/vn-market` route: the same screen with the VN calendar gap named (FE-070). */
  variant?: "paper" | "vnm";
  /** Link targets; any not given use the registry's canonical routes. */
  routes?: Partial<WorkbenchRoutes>;
  /** Where "My access" lives (the grant behind the disabled action and a denied read). */
  accessHref?: string;
}

export default function PaperWorkbenchScreen({ api, deploymentId, variant = "paper", routes, accessHref = DEFAULT_ACCESS_HREF }: PaperWorkbenchScreenProps) {
  const [params] = useSearchParams();
  const reads = useWorkbenchReads(api, deploymentId, variant);
  const r: WorkbenchRoutes = useMemo(() => ({ ...DEFAULT_ROUTES, ...routes }), [routes]);
  const ctx = (href: string) => withContext(href, params);

  const envelope = reads.profile.phase === "ready" ? reads.profile.value : null;
  const qualityValue = reads.quality.phase === "ready" ? reads.quality.value : null;
  const model = useMemo(() => (envelope === null ? null : buildWorkbench(envelope, qualityValue)), [envelope, qualityValue]);
  const showing = model !== null && model.page.replace === null;

  // `#accounting` and `#evidence` (and the V1 tab labels that implied them) land on their panel once it exists.
  const anchor = useRef<string | null>(resolveTab("paper", params.get("tab")).target.hash ?? (window.location.hash.slice(1) || null));
  useEffect(() => {
    if (!showing || anchor.current === null) return;
    const target = document.getElementById(`exec-wb-${anchor.current}`);
    anchor.current = null;
    target?.scrollIntoView?.();
  }, [showing]);

  const deployment = model?.deployment ?? null;
  const strategyId = deployment?.strategyId ?? null;
  const dep = deployment?.deploymentId ?? deploymentId;
  // The Alpha is linked ONLY when the profile published `alpha_id` (FE-066, S3-U5): a strategy id is never promoted to an alpha id.
  const identity = model?.identity ?? stageIdentity(null);
  const alphaHref = identity.alphaId === null ? null : ctx(r.alpha(identity.alphaId));
  const name = identity.alphaName ?? strategyId ?? deploymentId;
  // The stages the alpha has completed (FE-027): the ticks of the spine, from the alpha's Manager dataset when it publishes them.
  const history = spineHistory(useStageLifecycle(api, identity.alphaId, "paper", "paper", params.get("workspace_id")));
  const criteria = useStageCriteria(api, identity.alphaId, "PAPER", "paper", params.get("workspace_id"));
  // The alpha already left Paper (the published lifecycle says DONE with an exit instant): this page is a closed record (QA6 R2-05).
  const exited = useStageExit(api, identity.alphaId, "PAPER", "paper", params.get("workspace_id"));
  const closed = exited === null ? null : `Paper exit decided ${formatAsOf(exited.exitedAtMs)}${exited.decidedBy ? ` by ${exited.decidedBy}` : ""}. This stage is a closed record: no exit review is requested from here.`;

  const profileFailure = reads.profile.phase === "ready" ? reads.profile.refreshFailure : null;
  const qualityFailure = reads.quality.phase === "ready" ? reads.quality.refreshFailure : null;
  const failure = profileFailure ?? qualityFailure;
  const readAtMs = envelope === null ? null : envelopeReadAt(envelope);

  const actions = (denied: boolean) => (
    <div className="exec-wb-actions">
      <button type="button" className="exec-wb-btn" onClick={reads.refresh}>Try again</button>
      {denied ? <Link className="exec-blk-link" to={ctx(accessHref)}>My access</Link> : null}
    </div>
  );

  const body = (() => {
    if (reads.profile.phase === "loading") return <PanelGate status="loading" />;
    if (reads.profile.phase === "error") {
      const { status, reason } = reads.profile.failure;
      return <PanelGate status={status} reason={reason} actions={actions(status === "denied")} />;
    }
    if (model === null) return <PanelGate status="unavailable" reason="The profile could not be read." actions={actions(false)} />;
    if (model.page.replace !== null) {
      const { status, reason } = model.page.replace;
      return <StateBoundary status={status} reason={reason} actions={actions(status === "denied")} />;
    }
    return (
      <>
        {model.page.partial ? <div className="exec-blk-banner" role="status"><Flag kind="partial" label="Partial" size="sm" /> {model.page.partial}</div> : null}
        {model.page.stale ? <div className="exec-blk-banner" role="status"><Flag kind="stale" label="Stale" size="sm" /> {model.page.stale}</div> : null}
        {model.page.nq ? (
          <div className="exec-blk-banner" role="status">
            <span>Source not qualified.</span>
            {model.page.nq.reasons.length > 0 ? <GapWhy name="Why the source is not qualified" rows={[model.page.nq.reasons.join(" · ")]} /> : null}
          </div>
        ) : null}
        <LifecyclePanel gate={model.gate} accessHref={accessHref} history={history} criteria={criteria} exitReason={exitReviewReason(model.gate)} closed={closed} />
        <UrlTabs surface="paper" tabs={WB_TABS} label="Paper deployment sections">
          {(active) => {
            switch (active) {
              case "orders":
                return <OrdersTab table={model.orders} blotterHref={(row: OrderRow) => ctx(r.blotter(dep, row.orderId ?? row.clientOrderId))} />;
              case "fills":
                return <FillsTab table={model.fills} />;
              case "positions":
                return <PositionsTab positions={model.positions} sides={model.sides} />;
              case "sessions":
                return <SessionsTab counted={model.sessionsCounted} sessions={model.facts?.sessions ?? null} />;
              default:
                return <OverviewTab model={model} quality={reads.quality} exitReviewsHref={ctx(r.exitReviews)} closed={closed} exitRequest={{ api, deploymentId: dep, workspaceId: params.get("workspace_id") }} notQualified={model.page.nq !== null} />;
            }
          }}
        </UrlTabs>
      </>
    );
  })();

  // The summary bar repeats the header, so on a wide screen it appears only once the header has scrolled out above the viewport
  // (QA6 R4-10: it sat over the content at scroll 0). At phone width it is a static footer and always present.
  const wide = useMediaQuery("(min-width: 661px)");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const headerPast = useHeaderScrolledPast(rootRef, wide);
  const summaryShown = !wide || headerPast;

  // The root says what the body is, as the other stage screens do: `loading` until the profile has answered, so a reader (a person
  // waiting, a test, the M-1 harness) can tell "the body is mounted and has asked for what it needs" from "the first read is out".
  const state = reads.profile.phase === "loading" ? "loading" : reads.profile.phase === "error" ? reads.profile.failure.status : model === null ? "unavailable" : model.page.replace !== null ? model.page.replace.status : "ready";

  const chips = showing && model !== null ? chipsOf(model.deployment, model.freshness, model.facts) : reads.profile.phase === "loading" ? LOADING_CHIPS : UNREAD_CHIPS;
  return (
    <CompactGaps>
    <div className="exec-wb-v2" data-screen="workbench-v2" data-state={state} data-variant={variant} ref={rootRef}>
      <Header
        deploymentId={deploymentId}
        deployment={deployment}
        variant={variant}
        chips={chips}
        identity={identity}
        calendar={model?.calendar ?? null}
        links={{
          alpha: alphaHref,
          fleet: ctx(r.fleet),
          portfolio: deployment?.portfolioId ? ctx(r.portfolio(deployment.portfolioId)) : null,
          account: deployment?.accountId ? ctx(r.account(deployment.accountId)) : null,
          operations: ctx(r.operations),
          vnMarket: variant === "paper" && model?.calendar ? ctx(`/deployments/paper/${encodeURIComponent(dep)}/vn-market`) : null,
        }}
        read={{ atLabel: readAtMs === null ? null : formatAsOf(readAtMs), refreshing: reads.refreshing, failure: failure === null ? null : failure.reason, onRefresh: reads.refresh }}
      />
      {body}
      {showing && model !== null && summaryShown ? <StickySummary name={name} freshness={model.freshness} chips={chips} alphaHref={alphaHref} /> : null}
    </div>
    </CompactGaps>
  );
}

/**
 * True once the first child of `root` (the header) has left the viewport through the top. Where the browser has no
 * IntersectionObserver (jsdom) the answer is true, so nothing is hidden on a guess.
 */
function useHeaderScrolledPast(root: { current: HTMLElement | null }, active: boolean): boolean {
  const supported = typeof IntersectionObserver === "function";
  const [past, setPast] = useState(!supported);
  useEffect(() => {
    if (!active || !supported) return;
    const target = root.current?.firstElementChild;
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) setPast(!entry.isIntersecting && entry.boundingClientRect.bottom <= (entry.rootBounds?.top ?? 0));
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [active, supported, root]);
  return past;
}
