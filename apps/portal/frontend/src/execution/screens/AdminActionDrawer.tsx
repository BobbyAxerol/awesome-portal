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
function EntryDetail({ entry }: { entry: CatalogEntry }) {
  return (
    <>
      <h2 className="exec-admin-seltitle">
        {entry.command} {entry.action}
      </h2>
      <p className="exec-admin-selmeta">{entry.key}</p>

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

      <p className="exec-admin-nofooter">
        No plan or apply is offered: the command relay is disabled for this catalogue revision, so
        there is nothing here to run.
      </p>
    </>
  );
}

export function AdminActionDrawerScreen({
  catalogue,
  status = "ok",
  reason,
  selected,
  onSelect,
  children,
}: {
  catalogue: CommandCatalogue | null;
  /** `denied` when the actor is not ADMIN; the catalogue is not fetched at all. */
  status?: PanelStatus;
  reason?: string;
  selected: CatalogEntry | null;
  onSelect: (entry: CatalogEntry) => void;
  children?: ReactNode;
}) {
  const groups = catalogue ? groupEntries(catalogue.entries) : [];

  return (
    <ExecutionSurface kind="deployments" className="exec-admin">
      <header className="exec-admin-head">
        <h1>Admin actions</h1>
        <p className="exec-admin-sub">
          Operator Admin scope · UI and CLI share ONE command authority — the browser never runs a
          shell
        </p>
        {catalogue ? (
          <p className="exec-admin-sub">
            catalogue revision {catalogue.revision ?? "not stated"} ·{" "}
            {catalogue.returnedEntries ?? catalogue.entries.length} of{" "}
            {catalogue.totalEntries ?? "an unpublished number of"} actions
            {catalogue.sourceCommit ? ` · source ${catalogue.sourceCommit.slice(0, 12)}` : null}
          </p>
        ) : null}
      </header>

      {status !== "ok" ? (
        <PanelState status={status} reason={reason} />
      ) : (
        <>
          {/* Stated once, at the top, because it is true of every row below and
              repeating it sixty-four times would turn it into wallpaper. */}
          {catalogue?.capabilityState === "DISABLED" ? (
            <p className="exec-admin-capability">
              The Portal&apos;s command relay is <b>disabled</b> for this catalogue
              {catalogue.capabilityReason ? ` (${catalogue.capabilityReason})` : null}. Every action
              below is listed so you know it exists — none of them can be run from here.
            </p>
          ) : null}

          <div className="exec-admin-panes">
            <div className="exec-admin-catalog">
              {groups.map((group) => (
                <section className="exec-admin-group" key={group.code ?? "ungrouped"}>
                  <h2 className="exec-admin-groupname">
                    {group.label} <span>{group.items.length}</span>
                  </h2>
                  {group.items.map((entry) => (
                    <EntryRow
                      key={entry.key}
                      entry={entry}
                      selected={entry.key === selected?.key}
                      onSelect={onSelect}
                    />
                  ))}
                </section>
              ))}
            </div>
            <aside className="exec-admin-drawer" aria-label="Command detail">
              {selected ? (
                <EntryDetail entry={selected} />
              ) : (
                <p className="exec-admin-empty">
                  Pick an action to see its risk tier, the steps it would require and why it is not
                  available here.
                </p>
              )}
              {children}
            </aside>
          </div>
        </>
      )}
    </ExecutionSurface>
  );
}
