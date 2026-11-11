/**
 * Account 360 (hi-fi account.html): one logical sleeve, and the physical
 * binding it sits on, in one route. `view=physical` swaps the sleeve for the
 * binding (D4); `tab` picks Overview, Positions, Allocations, Fees and
 * funding, Reconciliation or Activity; `ccy` picks the currency a multi-currency
 * ledger is read in. Nothing is summed across currencies or sleeves.
 *
 * The three authorities stay apart: the internal ledger of this sleeve, the
 * native (venue) report of the whole account, and the portal's budget for the
 * sleeve. A shared binding's native figures are never attributed to a sleeve
 * (`Not computed`, R10), and a difference is only ever the source's own.
 */
import { useEffect, useId, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";

import type { ExecutionApi } from "../../../api/ports";
import type { ProfileEnvelope } from "../../../api/profileRead";
import { PanelState } from "../../../components/states";
import { GapWhy, SectionPanel, StateBoundary } from "../../blocks";
import { NotFound } from "../../blocks/NotFound";
import { readUtcEpochMs, type UtcEpochMs } from "../../../screenDataContract";
import { formatAsOf } from "../../boundary";
import { Flag } from "../../Flag";
import { backLinkFor, withoutOrigin } from "../../backTo";
import { ENV_LABEL, useExecUrlState, withContext } from "../../urlState";
import { PhysicalBinding } from "./PhysicalBinding";
import { ActivityPanel, DrawdownBlock, EquityBlock } from "./readPanels";
import { AllocationsPanel, AuthorityKpis, FeesPanel, MarginPanel, PositionsPanel, ReconciliationPanel, SleevesPanel, type PanelContext } from "./panels";
import { EnvironmentWord, Fact, Na, PhysicalProvenance, PortfolioName, ProductWord, StateFlag, WITHHELD } from "./parts";
import { useAccountResource, useBindingDetail, useBindingExposure } from "./reads";
import {
  RELATION_LABEL, capitalRows, TABS, ageAtRead, chooseCurrency, credentialView, deploymentHref, freshnessFlag, humanize,
  populationOf, portfolioHref, readAccountView, readTab, readViewMode, resourceReason, resourceStatus, rotateCredential, timeOf, type TabId,
} from "./model";
import { useAccountOperations } from "./useAccountOperations";

import "../../css/account.css";

export interface Account360Props {
  api: ExecutionApi;
  accountId: string;
  capabilities: ReadonlySet<string>;
}

/**
 * The sentence under a partial or stale state when the source gave no reason of
 * its own (A360-B5): what the state means for the figures below it, from the
 * read's own clocks only. A reason the source did publish always wins.
 */
function boundaryReason(status: string, asOf: UtcEpochMs | null): string | undefined {
  if (status === "stale") {
    return `${asOf !== null ? `The source's last update was ${formatAsOf(asOf)}. ` : "The source did not publish when it last updated. "}The figures below are the last it published, not live.`;
  }
  if (status === "partial") return "The source published only part of this account. A figure it did not publish says so where it would be.";
  return undefined;
}

/** The lists that link into Account 360 and whose state Back restores. */
const ACCOUNT_BACK_SOURCES = ["accounts", "portfolio", "cockpit", "blotter"] as const;

export function Account360({ api, accountId }: Account360Props) {
  const [params] = useSearchParams();
  const resource = useAccountResource(api, accountId);
  // Back by source: the Accounts list as the reader left it, a Portfolio, or the Approvals cockpit (audit #8).
  const origin = backLinkFor(params, { kind: "accounts" }, ACCOUNT_BACK_SOURCES);
  const back = (
    <Link className="exec-acct-back" to={origin.to}>← {origin.label}</Link>
  );
  const state = resource.state;
  if (state.phase === "loading" || state.phase === "idle") {
    return (
      <div className="exec-acct-v2" data-screen="account-360-v2">
        {back}
        <h1 className="exec-acct-title">{accountId}</h1>
        <PanelState status="loading" />
      </div>
    );
  }
  if (state.phase === "error" && /NOT_FOUND|\b404\b/.test(state.reason)) {
    // A permanent not-found: no "Try again" (asking again cannot change the answer), a way back to the list the reader came from.
    return (
      <div className="exec-acct-v2" data-screen="account-360-v2">
        <h1 className="exec-acct-title">Account</h1>
        <NotFound what="Account" id={accountId} sentence="This account does not exist, or it is not visible to you (ACCOUNT_NOT_FOUND)." backTo={origin.to} backLabel={origin.label} />
      </div>
    );
  }
  if (state.phase === "error") {
    return (
      <div className="exec-acct-v2" data-screen="account-360-v2">
        {back}
        <h1 className="exec-acct-title">{accountId}</h1>
        <PanelState
          status={state.status}
          reason={state.reason}
          actions={<button type="button" className="exec-acct-btn" onClick={resource.reload}>Try again</button>}
        />
      </div>
    );
  }
  return (
    <Loaded
      api={api}
      accountId={accountId}
      profile={state.value}
      staleReason={state.stale}
      refreshing={resource.refreshing}
      reload={resource.reload}
      back={back}
    />
  );
}

interface LoadedProps {
  api: ExecutionApi;
  accountId: string;
  profile: ProfileEnvelope;
  staleReason: string | null;
  refreshing: boolean;
  reload(): void;
  back: ReactNode;
}

function Loaded({ api, accountId, profile, staleReason, refreshing, reload, back }: LoadedProps) {
  const url = useExecUrlState();
  const [params] = useSearchParams();
  const tabsId = useId();
  const view = useMemo(() => readAccountView(profile, accountId), [profile, accountId]);
  const currency = chooseCurrency(view, url.value.ccy);
  const { identity } = view;
  const environment = identity.environment;
  const exposure = useBindingExposure(api, identity.bindingId);
  const detail = useBindingDetail(api, identity.bindingId, environment === null ? ["paper", "sandbox", "live"] : [environment]);
  // The binding's own capital check (the one the Accounts list prints): any currency whose published headroom is below zero.
  const exceeded = exposure.state.phase === "ready" ? capitalRows(exposure.state.value).filter((row) => row.withinPhysical === false).map((row) => row.currency) : [];
  const population = populationOf(view, exposure.state.phase === "ready" ? exposure.state.value : null);
  const mode = readViewMode(url.value.view);
  const resolved = readTab(url.value.tab);
  const tab: TabId = resolved.tab;
  const [positionScope, setPositionScope] = useState<"sleeve" | "account">("sleeve");
  // "Rotate credential" is off for everyone (no capability opens it); the reason is the Portal's typed one when it published it.
  const rotate = rotateCredential(useAccountOperations(api));

  // A tab the screen does not have is explained and the URL is made canonical. The URL then no longer holds the
  // unknown value, so the sentence is kept in state: it must outlive the rewrite, and it goes when the reader picks a tab.
  const [tabNotice, setTabNotice] = useState<string | null>(null);
  useEffect(() => {
    if (resolved.notice === null) return;
    setTabNotice(resolved.notice);
    url.set({ tab: null }, { replace: true });
  }, [resolved.notice, url]);

  const status = resourceStatus(profile);
  const fresh = freshnessFlag(profile.freshness);
  // The ISO text is a fallback only when the numeric clock was not published.
  const asOf = readUtcEpochMs(profile.asOfMs) ?? timeOf({ at: profile.asOf }, "at");
  const age = ageAtRead(asOf, readUtcEpochMs(profile.readAtMs) ?? timeOf({ at: profile.readAt }, "at"));
  const brokerSync = view.sync.find((entry) => entry.source === "BROKER") ?? null;
  const credential = detail.state.phase === "ready" ? credentialView(detail.state.value.item.credentialState) : null;
  const credentialWord = detail.state.phase === "ready" ? detail.state.value.item.credentialState : null;

  const ctx: PanelContext = { profile, view, accountId, currency, population };
  const sleeve = mode === "sleeve";
  const title = sleeve ? identity.label : `${identity.venue ? humanize(identity.venue) : "Venue"} account`;
  const subtitle = sleeve
    ? [identity.portfolios.map((pf) => view.names.portfolios[pf] ?? pf).join(", "), identity.baseCurrency, environment ? ENV_LABEL[environment] : null].filter((part): part is string => part !== null && part !== "").join(" · ")
    : `${population.published} ${population.published === 1 ? "sleeve" : "sleeves"} · 1 physical binding`;

  const setMode = (next: "sleeve" | "physical") => url.set({ view: next === "sleeve" ? null : next });
  const setTab = (next: TabId) => {
    setTabNotice(null);
    url.set({ tab: next === "ov" ? null : next });
  };
  const tabKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    const at = TABS.findIndex((entry) => entry.id === tab);
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = TABS[(at + step + TABS.length) % TABS.length]!;
    setTab(next.id);
    requestAnimationFrame(() => document.getElementById(`${tabsId}-tab-${next.id}`)?.focus());
  };

  const body = (
    <>
      {sleeve ? (
        <div className="exec-acct-two" aria-label="Identity">
          <SectionPanel title="Logical sleeve" aside="Internal">
            <dl className="exec-acct-facts">
              <Fact label="Name">{identity.label}</Fact>
              <Fact label="Portfolio">
                {identity.portfolios.length === 0 ? <Na /> : identity.portfolios.map((pf, index) => (
                  <span key={pf}>{index > 0 ? ", " : ""}<PortfolioName id={pf} name={view.names.portfolios[pf] ?? null} reason={view.names.portfolioReasons[pf] ?? null} to={withContext(portfolioHref(pf), withoutOrigin(params))} /></span>
                ))}
              </Fact>
              <Fact label="Domain">{[environment ? ENV_LABEL[environment] : null, identity.baseCurrency].filter((part): part is string => part !== null).join(" · ") || <Na />}</Fact>
              <Fact label="Deployments">
                {view.deployments.length === 0 ? <Na /> : view.deployments.map((dep, index) => (
                  <span key={dep.id}>{index > 0 ? ", " : ""}<Link className="exec-acct-link" to={withContext(deploymentHref(dep.id, dep.mode, dep.stage), withoutOrigin(params))}>{view.names.deployments[dep.id] ?? dep.id}</Link></span>
                ))}
              </Fact>
            </dl>
            <details className="exec-acct-prov"><summary>Provenance</summary><p className="exec-acct-mono">{accountId}</p></details>
          </SectionPanel>
          <SectionPanel title="Physical binding" aside="Native">
            <dl className="exec-acct-facts">
              <Fact label="Venue">{identity.venue ?? <Na />}</Fact>
              <Fact label="Native account"><span className="exec-acct-withheld"><GapWhy text="Withheld" name="Withheld, reason" rows={[WITHHELD]} next={null} /></span></Fact>
              <Fact label="Product"><ProductWord product={identity.product} /></Fact>
              <Fact label="Margin mode">{identity.marginMode ?? <Na />}</Fact>
              <Fact label="Environment"><EnvironmentWord environment={environment ? ENV_LABEL[environment] : null} network={identity.network} proofAt={identity.networkProofAt} /></Fact>
              <Fact label="Credential">
                {credential ? <Flag kind={credential.kind} label={credential.label} size="sm" /> : detail.state.phase === "loading" ? "Loading" : <Na />}
              </Fact>
            </dl>
            <PhysicalProvenance
              lines={[
                { label: "Binding", value: identity.bindingId ?? <Na why="The account resource names no binding" /> },
                { label: "Record authority", value: detail.state.phase === "ready" ? detail.state.value.recordAuthority ?? <Na /> : <Na /> },
                { label: "Source authority", value: detail.state.phase === "ready" ? detail.state.value.sourceAuthority ?? <Na /> : <Na /> },
              ]}
            />
            <button type="button" className="exec-acct-btn" onClick={() => setMode("physical")}>Open physical binding view</button>
          </SectionPanel>
        </div>
      ) : null}

      <div>
        <div className="exec-acct-tabs" role="tablist" aria-label="Account sections" onKeyDown={tabKeys}>
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              id={`${tabsId}-tab-${entry.id}`}
              aria-selected={tab === entry.id}
              aria-controls={`${tabsId}-panel`}
              tabIndex={tab === entry.id ? 0 : -1}
              className="exec-acct-tab"
              onClick={() => setTab(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-tab-${tab}`} className="exec-acct-stack">
          {tab === "ov" ? (
            <>
              {sleeve ? null : <PhysicalBinding view={view} detail={detail.state} exposure={exposure.state} rotate={rotate} />}
              <AuthorityKpis ctx={ctx} physicalOnly={!sleeve} />
              <div className="exec-acct-two">
                <SleevesPanel ctx={ctx} />
                <MarginPanel ctx={ctx} />
              </div>
              {sleeve ? (
                <>
                  <EquityBlock api={api} accountId={accountId} environment={environment} workspaceId={profile.workspaceId} currency={currency} />
                  <DrawdownBlock api={api} accountId={accountId} environment={environment} workspaceId={profile.workspaceId} currency={currency} />
                </>
              ) : null}
            </>
          ) : null}
          {tab === "pos" ? <PositionsPanel ctx={ctx} scope={positionScope} onScope={setPositionScope} /> : null}
          {tab === "all" ? <AllocationsPanel ctx={ctx} api={api} /> : null}
          {tab === "fee" ? <FeesPanel ctx={ctx} /> : null}
          {tab === "rec" ? <ReconciliationPanel ctx={ctx} exposure={exposure.state.phase === "ready" ? exposure.state.value : null} /> : null}
          {tab === "act" ? <ActivityPanel api={api} accountId={accountId} environment={environment} /> : null}
        </div>
      </div>
    </>
  );

  const reason = resourceReason(profile);
  const chipStatesStale = status === "stale" && fresh.kind === "stale";
  return (
    <div className="exec-acct-v2" data-screen="account-360-v2" data-view={mode}>
      <header className="exec-acct-head">
        <div>
          {back}
          <h1 className="exec-acct-title">{title}</h1>
          {subtitle ? <p className="exec-acct-subtitle">{subtitle}</p> : null}
        </div>
        <div className="exec-acct-controls">
          <span className="exec-acct-seg" role="group" aria-label="View">
            <button type="button" className="exec-acct-segbtn" aria-pressed={sleeve} onClick={() => setMode("sleeve")}>Sleeve</button>
            <button type="button" className="exec-acct-segbtn" aria-pressed={!sleeve} onClick={() => setMode("physical")}>Physical binding</button>
          </span>
          {view.currencies.length > 1 ? (
            <label className="exec-acct-field">
              <span className="exec-acct-sr">Currency</span>
              <select className="exec-acct-select" value={currency ?? ""} onChange={(event) => url.set({ ccy: event.target.value === "" ? null : event.target.value })}>
                {view.currencies.map((code) => <option key={code} value={code}>{code}</option>)}
              </select>
            </label>
          ) : null}
          <span className="exec-acct-fresh">
            {fresh.kind !== "ok" ? <Flag kind={fresh.kind} label={age !== null ? `${fresh.label} ${age}` : fresh.label} size="sm" /> : null}
            <span>{asOf !== null ? `As of ${formatAsOf(asOf)}` : "Source time not published"}</span>
          </span>
          {brokerSync ? <Flag kind={brokerSync.status.kind} label={`Broker sync: ${brokerSync.status.label}`} size="sm" /> : <Flag kind="na" label="Broker sync not available" size="sm" />}
          {identity.state ? <StateFlag word={identity.state} /> : null}
          <button type="button" className="exec-acct-btn" disabled={refreshing} title={refreshing ? "Reading again" : "Read this account again"} onClick={reload}>
            {refreshing ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </header>

      {staleReason !== null ? (
        <div className="exec-acct-banner" role="status">
          <Flag kind="stale" size="sm" />
          <span>Showing the last good read</span><GapWhy name="Why the read is stale" rows={[`The last refresh failed (${staleReason}).`]} next={null} />
        </div>
      ) : null}
      {exceeded.length > 0 ? (
        <div className="exec-acct-banner" data-tone="attention" role="alert">
          <Flag kind="attention" label="Exceeded" size="sm" />
          <span>Virtual allocations on this binding exceed its physical equity in {exceeded.join(", ")}. The Accounts list shows the same check.</span>
        </div>
      ) : null}
      {population.shared ? (
        <div className="exec-acct-banner" role="note" data-tone="shared">
          <span>
            Shared account · {population.expected ?? population.published} sleeves
            {population.partial ? `. ${population.published} of ${population.expected} are published here` : ""}. Native figures are not sleeve capital.
          </span>
        </div>
      ) : null}
      {credential !== null && (credential.kind === "attention" || credential.kind === "stale") ? (
        <div className="exec-acct-banner" data-tone={credential.kind} role="alert">
          <Flag kind={credential.kind} label={credential.label} size="sm" />
          <span>
            {credential.kind === "attention"
              ? `The credential for this binding needs attention (${credentialWord}). Native figures may be out of date.`
              : `Broker sync for this binding is delayed (${credentialWord}). Native figures may be out of date.`}
          </span>
        </div>
      ) : null}
      {tabNotice !== null ? <p className="exec-acct-note" role="status">{tabNotice}</p> : null}
      {view.gaps.length > 0 ? (
        <p className="exec-acct-note" role="status">
          <span>Not available: {view.gaps.map((gap) => RELATION_LABEL[gap.relation] ?? gap.relation).join(", ")}</span>
          <GapWhy name="Why not available" rows={view.gaps.map((gap) => `${RELATION_LABEL[gap.relation] ?? gap.relation}: ${gap.code}`)} />
        </p>
      ) : null}
      {reason !== undefined && status !== "ok" ? <p className="exec-acct-note">Source reasons: {reason}</p> : null}

      {status === "empty" ? (
        <PanelState status="empty" reason="The account resource published no rows for this account." />
      ) : status === "unavailable" || status === "denied" ? (
        <PanelState status={status} reason={reason ?? "The account resource is withheld and gave no reason."} />
      ) : status === "ok" ? (
        body
      ) : (
        // The header chip already says "Stale" (and the as-of beside it): do not say it twice. Partial has no chip, so it keeps its sentence.
        <StateBoundary status={status} quiet={chipStatesStale} reason={reason ?? (chipStatesStale ? undefined : boundaryReason(status, asOf))}>{body}</StateBoundary>
      )}
    </div>
  );
}
