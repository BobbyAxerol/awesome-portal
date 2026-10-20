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
 * Roles: the capability set decides, never a role name. Without
 * `execution.accounts.read` the Account links are withheld and the sub-line says
 * "Account not available"; the server stays the boundary.
 *
 * | Cardinality | Break point | Degradation | Server contract | Invariant | Perf budget |
 * |---|---|---|---|---|---|
 * | 1 deployment; orders and fills in the thousands, positions tens, equity snapshots up to 1.4k; profile 0.1 to 7.4 MB | over 200 rows in a table, 5,000 chart points, or a profile read over ~6 s | tables keep the 200 newest and say "Showing 200 of N"; the chart keeps min and max per bucket and prints its envelope; one read plus Refresh | `execution.paper-workbench.shadow-panel.v1` keyset (asked of Codex, D12); FE-067 runtime, sessions and reconciliation; FE-028/029/027 gate, band and lifecycle; FE-066 names | a cap or a downsample is always worded; absent is `Not published (FE-xxx)` or `Not available`; PARTIAL and STALE stay worded | one profile read and one quality read on open; at most 200 table rows, under 150 chart nodes |
 */
import { useEffect, useMemo, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useSession } from "../../../../auth/session";
import type { ExecutionApi } from "../../../api/ports";
import { Flag } from "../../Flag";
import { CompactGaps, PanelGate, StateBoundary, UrlTabs } from "../../blocks";
import { formatAsOf } from "../../boundary";
import { V2_CAPABILITY, holds } from "../../shell/roleNav";
import { resolveTab } from "../../tabAliases";
import { withContext } from "../../urlState";
import { stageIdentity } from "../stage/identity";
import { FillsTab } from "./FillsTab";
import { Header, LOADING_CHIPS, LifecyclePanel, UNREAD_CHIPS, chipsOf } from "./Header";
import { OrdersTab } from "./OrdersTab";
import { OverviewTab } from "./OverviewTab";
import { PositionsTab } from "./PositionsTab";
import { SessionsTab } from "./SessionsTab";
import { StickySummary } from "./StickySummary";
import { DEFAULT_ACCESS_HREF, DEFAULT_ROUTES, WB_TABS, WORKBENCH_SCREEN_KEY, buildWorkbench, envelopeReadAt, type OrderRow, type WorkbenchRoutes } from "./model";
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
  /** The session's capabilities when the caller already holds them; otherwise read from the session. */
  capabilities?: ReadonlySet<string>;
}

export default function PaperWorkbenchScreen({ api, deploymentId, variant = "paper", routes, accessHref = DEFAULT_ACCESS_HREF, capabilities }: PaperWorkbenchScreenProps) {
  const [params] = useSearchParams();
  const { access } = useSession();
  const reads = useWorkbenchReads(api, deploymentId, variant);
  const r: WorkbenchRoutes = useMemo(() => ({ ...DEFAULT_ROUTES, ...routes }), [routes]);
  const ctx = (href: string) => withContext(href, params);

  // Unknown access states nothing (the link stays; the server is the boundary); a ready session without the grant narrows.
  const caps = capabilities ?? (access.kind === "ready" ? new Set(access.access.capabilities) : null);
  const accountsVisible = caps === null || holds(caps, { allOf: [V2_CAPABILITY.accountsRead] });

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
  const name = strategyId ?? deploymentId;

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
          <div className="exec-blk-banner" role="status" title={model.page.nq.reasons.length > 0 ? model.page.nq.reasons.join(" · ") : undefined}>
            <span>Source not qualified.</span>
          </div>
        ) : null}
        <LifecyclePanel gate={model.gate} accessHref={accessHref} />
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
                return <OverviewTab model={model} quality={reads.quality} exitReviewsHref={ctx(r.exitReviews)} exitRequest={{ api, deploymentId: dep, workspaceId: params.get("workspace_id") }} notQualified={model.page.nq !== null} />;
            }
          }}
        </UrlTabs>
      </>
    );
  })();

  const chips = showing && model !== null ? chipsOf(model.deployment, model.freshness, model.facts) : reads.profile.phase === "loading" ? LOADING_CHIPS : UNREAD_CHIPS;
  return (
    <CompactGaps>
    <div className="exec-wb-v2" data-screen="workbench-v2" data-variant={variant}>
      <Header
        deploymentId={deploymentId}
        deployment={deployment}
        variant={variant}
        chips={chips}
        identity={identity}
        calendar={model?.calendar ?? null}
        accountsVisible={accountsVisible}
        links={{
          alpha: alphaHref,
          fleet: ctx(r.fleet),
          portfolio: deployment?.portfolioId ? ctx(r.portfolio(deployment.portfolioId)) : null,
          account: deployment?.accountId ? ctx(r.account(deployment.accountId)) : null,
          operations: ctx(r.operations),
        }}
        read={{ atLabel: readAtMs === null ? null : formatAsOf(readAtMs), refreshing: reads.refreshing, failure: failure === null ? null : failure.reason, onRefresh: reads.refresh }}
      />
      {body}
      {showing && model !== null ? <StickySummary name={name} freshness={model.freshness} chips={chips} alphaHref={alphaHref} /> : null}
    </div>
    </CompactGaps>
  );
}
