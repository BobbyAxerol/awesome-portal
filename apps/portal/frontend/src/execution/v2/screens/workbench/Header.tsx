/**
 * The workbench's masthead and the strip under it: breadcrumb, title and stage
 * tag, the three state chips, and the lifecycle panel (hi-fi `deployment.html`).
 *
 * Honesty (S3 plan D13):
 *   - the title is the strategy id: the profile publishes ids, not names (FE-066);
 *   - Runtime and Reconciliation are `Not published (FE-067)`; the source's own
 *     `active` flag rides beside Runtime as "Source flag: active" and never
 *     draws a green "Running";
 *   - Display freshness is the source's word and its as-of, never an age;
 *   - the spine marks only the current stage (Paper) and never draws R1 or R2
 *     "done": the lifecycle history is FE-027/028;
 *   - the exit-review action is disabled with its one-line reason and a My
 *     access link: no command route exists (UXM-09).
 */
import { Link } from "react-router-dom";

import { DockAction } from "../../Drawer";
import { JourneySpine, NotPublished, SectionPanel, StageChipRow, type StageChips } from "../../blocks";
import { formatAsOf } from "../../boundary";
import { Flag } from "../../Flag";
import { GATE_FLAG, exitReviewReason, type DeploymentFacts, type FreshnessFacts, type GateFacts } from "./model";

/** The three chips for a read that has settled. */
export function chipsOf(deployment: DeploymentFacts | null, freshness: FreshnessFacts): StageChips {
  const flag = deployment?.sourceActive;
  const freshnessChip: StageChips["freshness"] =
    freshness.kind === "not-published"
      ? { state: "not-available", reason: freshness.label }
      : {
          state: "dot",
          tone: freshness.kind === "fresh" ? "ok" : freshness.kind === "stale" || freshness.kind === "aging" ? "warn" : "mute",
          text: freshness.label,
          note: freshness.asOfMs === null ? undefined : `As of ${formatAsOf(freshness.asOfMs)}`,
        };
  return {
    runtime: { state: "not-published", id: "FE-067", detail: flag === null || flag === undefined ? undefined : `Source flag: ${flag ? "active" : "inactive"}` },
    freshness: freshnessChip,
    reconciliation: { state: "not-published", id: "FE-067" },
  };
}

export const LOADING_CHIPS: StageChips = { runtime: { state: "loading" }, freshness: { state: "loading" }, reconciliation: { state: "loading" } };

/** The profile was not read (denied, unavailable, empty): the chips say so instead of guessing. */
export const UNREAD_CHIPS: StageChips = {
  runtime: { state: "not-available", reason: "The profile was not read" },
  freshness: { state: "not-available", reason: "The profile was not read" },
  reconciliation: { state: "not-available", reason: "The profile was not read" },
};

export interface HeaderProps {
  /** The route's deployment id: the title while the profile has not named an alpha. */
  deploymentId: string;
  deployment: DeploymentFacts | null;
  variant: "paper" | "vnm";
  chips: StageChips;
  /** Whether the reader may open Account 360 (the capability set decides, never a role name). */
  accountsVisible: boolean;
  links: {
    alpha: string | null;
    fleet: string;
    portfolio: string | null;
    account: string | null;
    operations: string;
  };
  /** When the shown profile was read, and the refresh control. */
  read: { atLabel: string | null; refreshing: boolean; failure: string | null; onRefresh(): void };
}

export function Header({ deploymentId, deployment, variant, chips, accountsVisible, links, read }: HeaderProps) {
  const strategy = deployment?.strategyId ?? null;
  const title = strategy ?? deploymentId;
  return (
    <header className="exec-wb-head">
      <div className="exec-wb-headmain">
        <nav className="exec-wb-path" aria-label="Breadcrumb">
          <ol>
            {links.alpha ? <li><Link className="exec-blk-link" to={links.alpha}>← Alpha</Link></li> : null}
            <li><Link className="exec-blk-link" to={links.fleet}>Alpha Fleet</Link></li>
            {strategy !== null && links.alpha ? <li><Link className="exec-blk-link" to={links.alpha}>{strategy}</Link></li> : null}
            <li aria-current="page">Paper monitor</li>
          </ol>
        </nav>
        <h1 className="exec-wb-title">
          {title}
          <span className="exec-wb-stage" data-stage="paper"><i aria-hidden="true" />Paper</span>
          {variant === "vnm" ? <span className="exec-wb-stage" data-stage="vnm">VN market</span> : null}
        </h1>
        <p className="exec-wb-question">Tracking approved evidence? Ready to leave Paper?</p>
        <p className="exec-wb-sub">
          {links.portfolio && deployment?.portfolioId ? <Link className="exec-blk-link" to={links.portfolio}>{deployment.portfolioId}</Link> : <span>Portfolio not published</span>}
          {accountsVisible ? (
            links.account && deployment?.accountId ? <Link className="exec-blk-link" to={links.account}>{deployment.accountId}</Link> : <span>Account not published</span>
          ) : (
            <span>Account not available</span>
          )}
          <span>Simulated</span>
          <span>Names: <NotPublished id="FE-066" /></span>
          {variant === "vnm" ? <span>VN market calendar: <NotPublished id="FE-070" /></span> : null}
        </p>
      </div>
      <div className="exec-wb-ctrls">
        {links.alpha ? <Link className="exec-blk-link" to={links.alpha}>Alpha</Link> : null}
        {accountsVisible && links.account ? <Link className="exec-blk-link" to={links.account}>Account</Link> : null}
        <Link className="exec-blk-link" to={links.operations}>Operations</Link>
        <button type="button" className="exec-wb-btn" onClick={read.onRefresh} aria-busy={read.refreshing ? true : undefined}>
          {read.refreshing ? "Refreshing…" : "Refresh"}
        </button>
        {read.atLabel ? <span className="exec-wb-readat" aria-live="polite">Read {read.atLabel}</span> : null}
        {read.failure ? <span className="exec-wb-readfail" role="status">Refresh failed: {read.failure}</span> : null}
      </div>
      <div className="exec-wb-chips"><StageChipRow chips={chips} /></div>
    </header>
  );
}

export interface LifecycleProps {
  gate: GateFacts;
  /** Where "My access" lives (the grant behind the disabled action). */
  accessHref: string;
}

export function LifecyclePanel({ gate, accessHref }: LifecycleProps) {
  const verdict = GATE_FLAG[gate.verdict];
  return (
    <SectionPanel level={2}
      title="Lifecycle"
      aside={
        <span className="exec-wb-aside">
          Paper · observation gate <Flag kind={verdict.kind} label={verdict.label} size="sm" />
        </span>
      }
    >
      <div className="exec-wb-life">
        <div className="exec-wb-spine">
          <JourneySpine variant="compact" current="paper" blocked={gate.verdict === "blocked"} label="Deployment lifecycle" />
          <p className="exec-wb-cap">Stage history, gate criteria and decider: <NotPublished id="FE-027/028" /></p>
        </div>
        <div className="exec-wb-gate">
          <DockAction label="Request exit review" reason={exitReviewReason(gate)} accessHref={accessHref} />
        </div>
      </div>
    </SectionPanel>
  );
}
