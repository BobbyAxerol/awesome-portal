/**
 * Phase 6 — Admin Action Drawer (hi-fi 1i, WF 1i, ops dark, no sidebar).
 *
 * Rebuilt against the canonical catalogue. The earlier version rendered
 * twenty-one commands derived by hand and offered plan/apply on the mutations;
 * revision 2 of the contract says every one of sixty-four is unreachable and
 * the capability itself is `DISABLED`. So this screen no longer offers a
 * command. It answers a different and, for now, more useful question: which
 * sixty-four exist, and exactly why each is out of reach.
 *
 * That is not a degraded version of the screen. An operator who cannot see the
 * catalogue assumes the Portal is complete and discovers the gap during an
 * incident — which is the failure the whole cluster is built to prevent. So
 * every entry is listed, every one says why, and none is dressed up as
 * something you could press.
 *
 * The four facts each row carries that a plainer list would drop:
 *
 *   * the PORTAL's risk tier, beside the source's when they differ — showing
 *     the source's alone understates what a command costs;
 *   * whether plan, apply and verify are required, since assuming all three is
 *     explicitly forbidden;
 *   * the route state, which separates "no route exists" from "we cannot tell
 *     which route is this one";
 *   * `owner_review_required`, which is not implied by the tier.
 */
import type { ReactNode } from "react";

import {
  blockedText,
  groupEntries,
  RISK_TIER_LABEL,
  type CatalogEntry,
  type CommandCatalogue,
} from "../adminCatalog";
import { ExecutionSurface } from "../ExecutionSurface";
import { PanelState } from "../components/states";
import { ExecutionSectionTitle } from "../components/typography";
import {
  ExecutionContextRail,
  ExecutionDecisionStrip,
  ExecutionPageHeader,
  ExecutionProvenanceDrawer,
  ExecutionWorkspace,
  type HeaderBadge,
} from "../components/workspace";
import { planApplicable, planOutcomeText, type CommandPlan } from "../commandPlan";
import type { PanelStatus } from "../contracts";

/** `PLAN → APPLY → VERIFY`, but only the steps this command actually requires. */
function StepRail({ entry }: { entry: CatalogEntry }) {
  const steps = [
    entry.planRequired ? "PLAN" : null,
    entry.applyRequired ? "APPLY" : null,
    entry.verifyRequired ? "VERIFY" : null,
  ].filter((s): s is string => s !== null);
  if (steps.length === 0) {
    // Said rather than left blank: a command with no plan step is a different
    // thing from one whose steps we failed to render.
    return <span className="exec-admin-steps" data-empty="true">no plan/apply/verify path</span>;
  }
  return <span className="exec-admin-steps">{steps.join(" → ")}</span>;
}

function EntryRow({
  entry,
  selected,
  onSelect,
}: {
  entry: CatalogEntry;
  selected: boolean;
  onSelect: (entry: CatalogEntry) => void;
}) {
  return (
    <button
      type="button"
      className="exec-admin-row"
      data-reachable={entry.portalReachable ? "true" : "false"}
      data-selected={selected ? "true" : undefined}
      aria-pressed={selected}
      onClick={() => onSelect(entry)}
    >
      <span className="exec-admin-rowhead">
        <span className="exec-admin-rowtitle">
          {entry.command} <span className="exec-admin-action">{entry.action}</span>
        </span>
        <span className="exec-admin-tag" data-tier={entry.riskTier ?? "UNKNOWN"}>
          {entry.riskTier ? RISK_TIER_LABEL[entry.riskTier] : "tier not stated"}
        </span>
        {entry.ownerReviewRequired ? (
          <span className="exec-admin-owner">owner review</span>
        ) : null}
        <span className="exec-admin-scope">{entry.routeState ?? "route not stated"}</span>
      </span>
      <span className="exec-admin-cli">
        {entry.httpMethod && entry.httpPath
          ? `${entry.httpMethod} ${entry.httpPath}`
          : "no HTTP route published"}
      </span>
    </button>
  );
}

/**
 * The detail pane.
 *
 * There is no plan/apply footer at any tier, because there is no reachable
 * command at any tier. Adding a disabled one would advertise a capability that
 * does not exist and teach an operator that the blocker is negotiable.
 */
function EntryDetail({ entry, plan }: { entry: CatalogEntry; plan?: CommandPlan | null }) {
  return (
    <>
      <p className="exec-admin-selmeta exec-role-meta">{entry.key}</p>

      <div className="exec-admin-blocked" role="note">
        <b>NOT EXPOSED IN PORTAL</b>
        <p>{blockedText(entry)}</p>
      </div>

      <dl className="exec-admin-facts">
        <div>
          <dt>Portal risk tier</dt>
          <dd>{entry.riskTier ? RISK_TIER_LABEL[entry.riskTier] : "not stated"}</dd>
        </div>
        {entry.sourceRiskTier && entry.sourceRiskTier !== entry.riskTier ? (
          // Only when they differ, and never in place of the Portal's. The
          // difference is the point: account/policy is a read at the source and
          // a paper mutation here.
          <div>
            <dt>Source proposed</dt>
            <dd>{RISK_TIER_LABEL[entry.sourceRiskTier]} — the Portal is bound by its own tier</dd>
          </div>
        ) : null}
        <div>
          <dt>Steps required</dt>
          <dd>
            <StepRail entry={entry} />
          </dd>
        </div>
        <div>
          <dt>Owner review</dt>
          <dd>{entry.ownerReviewRequired ? "required" : "not required"}</dd>
        </div>
        <div>
          <dt>Route</dt>
          <dd>
            {entry.httpMethod && entry.httpPath
              ? `${entry.httpMethod} ${entry.httpPath}`
              : "none published"}
            {entry.routeState ? ` · ${entry.routeState}` : null}
          </dd>
        </div>
        {entry.sourceReference ? (
          <div>
            <dt>Observed at</dt>
            <dd>
              <code>{entry.sourceReference}</code>
            </dd>
          </div>
        ) : null}
      </dl>

      {plan ? (
        // A plan that came back, shown for what it is. `operation_id` looks
        // like work started and is not — F0 records that the request was
        // understood and refused.
        <div className="exec-admin-plan">
          <h3>Plan {plan.operationId}</h3>
          <p>{planOutcomeText(plan)}</p>
          <p className="exec-admin-planfacts">
            status {plan.status ?? "not stated"} · relay {plan.relayCapability ?? "not stated"} ·{" "}
            {plan.replayed ? "replayed" : "new"}
            {plan.blockers.length > 0 ? ` · blocked: ${plan.blockers.join(", ")}` : null}
          </p>
          <p className="exec-admin-planfacts">{planApplicable(plan).reason}</p>
          {plan.payloadStoragePolicy === "HASH_ONLY_NO_RAW" ? (
            <p className="exec-admin-planfacts">
              The request payload is stored as a hash and never kept. It cannot be read back here,
              and this screen never repeats a refused value.
            </p>
          ) : null}
        </div>
      ) : null}

      <p className="exec-admin-nofooter">
        No plan or apply is offered: the command relay is disabled for this catalogue revision, so
        there is nothing here to run.
      </p>
    </>
  );
}

/**
 * Risk-tier narrowing, applied by the SERVER.
 *
 * Sixty-four entries in one column is three times what the hi-fi drew, and
 * "show me only the live-protective ones" is the question an operator arrives
 * with. The chips report a change and the caller re-queries; they do not filter
 * the loaded array.
 *
 * That distinction is not pedantry here even though the response currently
 * carries the whole population. `total_entries` equals `returned_entries` in
 * revision 2 and may not in the next one, and a browser-side filter that is
 * truthful today becomes a filter over a window tomorrow — silently, with the
 * count still reading as a total.
 */
export const TIER_FILTERS = [
  "ALL",
  "R0_READ",
  "R1_PAPER_MUTATION",
  "R2_SANDBOX",
  "R3_LIVE_PROTECTIVE",
  "R4_LIVE_RISK_INCREASING",
] as const;
export type TierFilter = (typeof TIER_FILTERS)[number];

const TIER_FILTER_LABEL: Record<TierFilter, string> = {
  ALL: "All",
  R0_READ: "R0 read",
  R1_PAPER_MUTATION: "R1 paper",
  R2_SANDBOX: "R2 sandbox",
  R3_LIVE_PROTECTIVE: "R3 protective",
  R4_LIVE_RISK_INCREASING: "R4 risk-increasing",
};

export function AdminActionDrawerScreen({
  catalogue,
  status = "ok",
  reason,
  selected,
  onSelect,
  tier = "ALL",
  onTierChange,
  plan,
  children,
}: {
  catalogue: CommandCatalogue | null;
  status?: PanelStatus;
  reason?: string;
  selected: CatalogEntry | null;
  onSelect: (entry: CatalogEntry) => void;
  tier?: TierFilter;
  onTierChange?: (tier: TierFilter) => void;
  plan?: CommandPlan | null;
  children?: ReactNode;
}) {
  const groups = catalogue ? groupEntries(catalogue.entries) : [];
  const reachable = catalogue ? catalogue.entries.filter((e) => e.portalReachable).length : 0;
  const relayDisabled = catalogue?.capabilityState === "DISABLED";
  const badges: HeaderBadge[] = [
    { label: "OPERATOR ADMIN", axis: "stage" },
    { label: relayDisabled ? "RELAY DISABLED" : `relay ${catalogue?.capabilityState ?? "not stated"}`, axis: "readiness", tone: relayDisabled ? "mute" : "warn" },
    ...(catalogue?.revision ? [{ label: `catalogue rev ${catalogue.revision}`, axis: "other" } as HeaderBadge] : []),
  ];
  const rail = (
    <ExecutionContextRail
      next={{
        title: selected ? `${selected.command} ${selected.action}` : "Pick an action",
        detail: (
          <div aria-label="Command detail" className="exec-admin-drawer">
            {selected ? (
              <EntryDetail entry={selected} plan={plan} />
            ) : (
              <p className="exec-admin-empty exec-role-body">Pick an action to see its risk tier and steps.</p>
            )}
            {children}
          </div>
        ),
      }}
      blockers={selected && !selected.portalReachable ? [{ label: `${selected.key} not reachable`, detail: null, severity: "blocking" as const }] : []}
      freshness={
        <span className="exec-role-meta">
          {relayDisabled ? "relay disabled — see the notice above" : "relay state as published"}
          {catalogue?.sourceCommit ? ` · source ${catalogue.sourceCommit.slice(0, 12)}` : ""}
        </span>
      }
      provenance={
        <ExecutionProvenanceDrawer
          items={[
            { label: "catalogue", short: `rev ${catalogue?.revision ?? "not stated"}`, full: null },
            ...(catalogue?.sourceCommit ? [{ label: "source commit", short: catalogue.sourceCommit.slice(0, 12), full: catalogue.sourceCommit }] : []),
            ...(selected?.sourceReference ? [{ label: "observed at", short: selected.sourceReference, full: null }] : []),
          ]}
          onCopy={(full) => void navigator.clipboard?.writeText(full)}
        />
      }
    />
  );
  return (
    <ExecutionSurface kind="deployments" className="exec-admin">
      <ExecutionWorkspace layout="balanced" rail={rail}>
        <div className="exec-admin-head">
          <ExecutionPageHeader
            title="Admin actions"
            badges={badges}
            purpose="Plan → Apply → Verify — one command authority."
            secondary={
              catalogue ? (
                <span className="exec-admin-sub exec-role-meta">
                  {catalogue.returnedEntries ?? catalogue.entries.length} of {catalogue.totalEntries ?? "an unpublished number of"} actions
                </span>
              ) : undefined
            }
          />
        </div>
        {status !== "ok" ? (
          <PanelState status={status} reason={reason} />
        ) : (
          <>
            {relayDisabled ? (
              <p className="exec-admin-capability exec-role-body" role="status">
                The Portal&apos;s command relay is <b>disabled</b> for this catalogue
                {catalogue?.capabilityReason ? ` (${catalogue.capabilityReason})` : null}. Every action below is listed so you know it exists — none of them can be run from here.
              </p>
            ) : null}
            <ExecutionDecisionStrip
              metrics={[
                { label: "Actions", value: catalogue ? String(catalogue.entries.length) : null },
                { label: "Reachable", value: catalogue ? String(reachable) : null, tone: reachable ? "good" : undefined },
                { label: "Not exposed", value: catalogue ? String(catalogue.entries.length - reachable) : null },
                { label: "Groups", value: String(groups.length) },
                { label: "Relay", value: catalogue?.capabilityState ?? null, tone: relayDisabled ? "bad" : "good" },
              ]}
            />
            {onTierChange ? (
              <div className="exec-admin-tiers" role="group" aria-label="Filter by risk tier">
                {TIER_FILTERS.map((option) => (
                  <button key={option} type="button" className="exec-inbox-filter" data-tier-filter={option} aria-pressed={option === tier} onClick={() => onTierChange(option)}>
                    {TIER_FILTER_LABEL[option]}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="exec-admin-panes">
              <div className="exec-admin-catalog">
                {groups.map((group) => (
                  <section className="exec-admin-group" key={group.code ?? "ungrouped"}>
                    <ExecutionSectionTitle>
                      {group.label} <span className="exec-role-meta">{group.items.length}</span>
                    </ExecutionSectionTitle>
                    {group.items.map((entry) => (
                      <EntryRow key={entry.key} entry={entry} selected={entry.key === selected?.key} onSelect={onSelect} />
                    ))}
                  </section>
                ))}
              </div>
            </div>
          </>
        )}
      </ExecutionWorkspace>
    </ExecutionSurface>
  );
}
