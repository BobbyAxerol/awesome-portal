/**
 * The workbench's masthead and the strip under it: breadcrumb, title and stage
 * tag, the three state chips, and the lifecycle panel (hi-fi `deployment.html`).
 *
 * Honesty (S3 plan D13):
 *   - the title is the strategy id; the Alpha is linked ONLY when the profile published `alpha_id`
 *     (FE-066, never promoted from the strategy id), and a name is printed only when it was published;
 *   - Runtime and Reconciliation come from `stage_facts` (FE-067): a closed runtime word, or `Not published (FE-067)`
 *     with the server's reason in the title; the source's own `active` flag rides beside Runtime as
 *     "Source flag: active" and never draws a green "Running";
 *   - Display freshness is the source's word and its as-of, never an age;
 *   - the spine marks only the current stage (Paper) and never draws R1 or R2
 *     "done": the lifecycle history is FE-027/028;
 *   - the exit-review action is disabled with its one-line reason and a My
 *     access link: no command route exists (UXM-09).
 */
import { Link } from "react-router-dom";

import { GapWhy, JourneySpine, NotPublished, SectionPanel, StageChipRow, type SpineStageId, type StageChips, type StageChipValue } from "../../blocks";
import { formatAsOf } from "../../boundary";
import { formatExact, type ExactUnit } from "../../../formatExact";
import { Flag } from "../../Flag";
import { DockAction } from "../../Drawer";
import { reconciliationFactOf, runtimeFactOf } from "../../readers/stageFactViews";
import type { StageFacts } from "../../../stageFacts";
import { AlphaNameLine } from "../stage/AlphaNameLine";
import { reconciliationChipFrom, runtimeChipFrom } from "../stage/factChips";
import { portfolioLabel, type StageIdentity } from "../stage/identity";
import { VenueCalendarLine } from "./Calendar";
import { GATE_FLAG, type DeploymentFacts, type FreshnessFacts, type GateFacts } from "./model";
import type { VenueCalendar } from "../../../stageFacts";

/** The three chips for a read that has settled. Runtime and Reconciliation are the server's `stage_facts` when the profile carries them. */
export function chipsOf(deployment: DeploymentFacts | null, freshness: FreshnessFacts, facts: StageFacts | null = null): StageChips {
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
  const sourceFlag = flag === null || flag === undefined ? undefined : `Source flag: ${flag ? "active" : "inactive"}`;
  const fact = runtimeFactOf(facts);
  const runtimeChip: StageChipValue = fact === null ? { state: "not-published", id: "FE-067" } : runtimeChipFrom(fact);
  return {
    // The source's `active` flag only ever rides beside a Runtime that is not published; a published word needs no companion.
    runtime: runtimeChip.state === "not-published" ? { ...runtimeChip, detail: sourceFlag } : runtimeChip,
    freshness: freshnessChip,
    reconciliation: reconciliationChipFrom(reconciliationFactOf(facts)),
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
  /** FE-066: the five identity keys; `published: false` = typed absence. */
  identity: StageIdentity;
  /** FE-070: the VN market calendar (the VN variant); `null` = not in the profile. */
  calendar: VenueCalendar | null;
  links: {
    alpha: string | null;
    fleet: string;
    portfolio: string | null;
    account: string | null;
    operations: string;
    /** The VN market variant of this deployment, only when the plain profile published a VN venue calendar (FE-070). */
    vnMarket?: string | null;
  };
  /** When the shown profile was read, and the refresh control. */
  read: { atLabel: string | null; refreshing: boolean; failure: string | null; onRefresh(): void };
}

/** A published decimal through the shared formatter, its exact text in the title; absent says so (never 0). */
function Limit({ value, unit }: { value: string | null; unit: ExactUnit }) {
  if (value === null) return <span className="exec-blk-na">Not published</span>;
  const shown = formatExact(value, unit);
  return <span title={shown.full}>{shown.display}</span>;
}

export function Header({ deploymentId, deployment, variant, chips, identity, calendar, links, read }: HeaderProps) {
  const strategy = deployment?.strategyId ?? null;
  // The design names the page by the alpha; the alpha NAME is printed only when the profile published one (FE-066), else the strategy id as before.
  const title = identity.alphaName ?? strategy ?? deploymentId;
  return (
    <header className="exec-wb-head">
      <div className="exec-wb-headmain">
        <nav className="exec-wb-path" aria-label="Breadcrumb">
          <ol>
            <li><Link className="exec-blk-link" to={links.fleet}>Alpha Fleet</Link></li>
            {strategy !== null ? links.alpha ? <li><Link className="exec-blk-link" to={links.alpha}>{identity.alphaName ?? strategy}</Link></li> : <li>{identity.alphaName ?? strategy}</li> : null}
            <li aria-current="page">Paper monitor</li>
          </ol>
        </nav>
        <h1 className="exec-wb-title">
          {title}
          <span className="exec-wb-stage" data-stage="paper"><i aria-hidden="true" />Paper</span>
          {variant === "vnm" ? <span className="exec-wb-stage" data-stage="vnm">VN market</span> : null}
          {variant === "paper" && links.vnMarket ? <Link className="exec-wb-stage" data-stage="vnm" to={links.vnMarket}>VN market</Link> : null}
        </h1>
        <p className="exec-wb-question">Tracking approved evidence? Ready to leave Paper?</p>
        <p className="exec-wb-sub">
          {links.portfolio && deployment?.portfolioId ? (
            <span>
              <Link className="exec-blk-link" to={links.portfolio}>{portfolioLabel(identity, deployment.portfolioId)}</Link>
              {identity.portfolioNameReasonCode ? <GapWhy name="Portfolio name, reason" rows={[identity.portfolioNameReasonCode]} /> : null}
            </span>
          ) : (
            <span>Portfolio not published</span>
          )}
          {links.account && deployment?.accountId ? <Link className="exec-blk-link" to={links.account}>{deployment.accountId}</Link> : <span>Account not published</span>}
          <span><AlphaNameLine identity={identity} /></span>
          {deployment?.accountPolicyId ? <span>Account policy <span className="exec-blk-id">{deployment.accountPolicyId}</span></span> : null}
          {deployment?.policyRisk ? (
            <>
              <span>Margin mode {deployment.policyRisk.marginMode ?? <span className="exec-blk-na">Not published</span>}</span>
              <span>Position accounting {deployment.policyRisk.positionAccounting ?? <span className="exec-blk-na">Not published</span>}</span>
              <span>
                Risk profile: max leverage <Limit value={deployment.policyRisk.maxLeverage} unit="qty" />
                {" / "}daily loss <Limit value={deployment.policyRisk.maxDailyLoss} unit="money" />
                {" / "}drawdown <Limit value={deployment.policyRisk.maxDrawdown} unit="ratio" />
                {" / "}state {deployment.policyRisk.tradingState ?? <span className="exec-blk-na">Not published</span>}
                {deployment.policyRisk.isActive === null ? null : deployment.policyRisk.isActive ? " (active)" : " (inactive)"}
              </span>
            </>
          ) : null}
          {deployment?.riskProfileId ? <span>Risk profile <span className="exec-blk-id">{deployment.riskProfileId}</span></span> : null}
          {variant === "vnm" ? <span>VN market calendar: <VenueCalendarLine calendar={calendar} /></span> : null}
        </p>
      </div>
      <div className="exec-wb-ctrls">
        {links.account ? <Link className="exec-blk-link" to={links.account}>Account</Link> : null}
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
  /** The stages the alpha has completed (the ticks), from its Manager dataset; `undefined` = the history is not published (FE-027). */
  history?: Partial<Record<SpineStageId, { outcome: "done" }>>;
  /** "3 of 7 criteria" of the stage the alpha is in, when the lifecycle read published it. */
  criteria?: { met: number; total: number } | null;
  /** The one-line reason the exit review cannot be requested from here (the request control itself is in the Exit gate panel). */
  exitReason?: string;
  /** Where "My access" lives (the grant behind the disabled action). */
  accessHref: string;
  /** A sentence when the alpha already left this stage: the stage is a closed record and no exit action is offered. */
  closed?: string | null;
  /** Says in words that the spine marks the stage being viewed, and where the published lifecycle has the alpha. */
  viewing?: string | null;
}

export function LifecyclePanel({ gate, history, criteria = null, exitReason, accessHref, closed = null, viewing = null }: LifecycleProps) {
  const verdict = GATE_FLAG[gate.verdict];
  return (
    <SectionPanel level={2}
      title="Lifecycle"
      aside={
        <span className="exec-wb-aside">
          {criteria === null ? null : <span className="exec-blk-num">Paper · {criteria.met} of {criteria.total} criteria · </span>}
          Observation gate <Flag kind={verdict.kind} label={verdict.label} size="sm" />
        </span>
      }
    >
      <div className="exec-wb-life">
        <div className="exec-wb-spine">
          <JourneySpine variant="compact" current="paper" blocked={gate.verdict === "blocked"} stages={history} lockAhead label="Deployment lifecycle" />
          {closed !== null ? <p className="exec-wb-cap" data-testid="stage-closed">{closed}</p> : exitReason === undefined ? null : (
            <div className="exec-wb-exitask">
              <DockAction label="Request exit review" reason={exitReason} accessHref={accessHref} />
            </div>
          )}
          {viewing === null ? null : <p className="exec-wb-cap" data-testid="spine-viewing">{viewing}</p>}
          <p className="exec-wb-cap">
            {history === undefined ? <NotPublished id="FE-027/028">Stage history, gate criteria and decider</NotPublished> : <NotPublished id="FE-028">Gate criteria and decider</NotPublished>}
          </p>
        </div>
      </div>
    </SectionPanel>
  );
}
