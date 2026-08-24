/**
 * Phase 9 — Command Center (hi-fi 5a, WF 5a, ops dark).
 *
 * "Becomes the default landing route after this phase", which is why its
 * honesty rules matter more than any other screen's: this is the page an
 * operator reads before they know what is wrong, and the page they trust to
 * tell them nothing is.
 *
 * Four panels, four independent verdicts. A panel that cannot be read says so
 * in its own frame and the other three carry on — there is no page-level
 * "healthy" badge, because a green flag over a failed fleet query is precisely
 * the lie this cluster is built to prevent.
 *
 * The triage list arrives ranked by the server (`command-center.triage-rank.v1`)
 * and is rendered in the order it arrives. Nothing here sorts.
 */
import type { ReactNode } from "react";

import {
  countLabel,
  streamGate,
  type CommandCenter as CommandCenterSnapshot,
  type FleetPanel,
  type NeedsYouPanel,
  type PinnedPanel,
  type TodayPanel,
  type TriageItem,
} from "../commandCenter";
import { AuthorityWord, FreshnessIndicator } from "../components/badges";
import { ExecutionSurface } from "../ExecutionSurface";
import { PanelState } from "../components/states";
import type { SubscriptionState } from "../subscription";

/**
 * One panel frame.
 *
 * Authority and freshness sit in the header of each panel rather than the page,
 * so a stale Fleet cell cannot borrow the Needs-you panel's freshness.
 */
function Panel({
  title,
  state,
  authority,
  freshness,
  meta,
  reason,
  children,
}: {
  title: string;
  state: NeedsYouPanel["state"];
  authority: NeedsYouPanel["authority"];
  freshness: NeedsYouPanel["freshness"];
  meta?: ReactNode;
  reason?: string;
  children: ReactNode;
}) {
  return (
    <section className="exec-cc-panel" aria-label={title}>
      <header className="exec-cc-panelhead">
        <h2>{title}</h2>
        {authority ? <AuthorityWord authority={authority} /> : null}
        {freshness ? <FreshnessIndicator state={freshness} /> : null}
        {meta ? <span className="exec-cc-meta">{meta}</span> : null}
      </header>
      {state === "ok" ? children : <PanelState status={state} reason={reason} />}
    </section>
  );
}

function TriageRow({ item, onOpen }: { item: TriageItem; onOpen: (item: TriageItem) => void }) {
  return (
    <button
      type="button"
      className="exec-cc-row"
      data-severity={item.severity ?? undefined}
      data-sla={item.slaState ?? undefined}
      onClick={() => onOpen(item)}
      disabled={!item.href}
      title={item.href ? undefined : "The owning screen for this item was not published"}
    >
      {/* The server's rank, shown as given. The screen does not renumber. */}
      <span className="exec-cc-rank">{item.rank ?? "—"}</span>
      <span className="exec-cc-kind">{item.kind ?? "UNKNOWN"}</span>
      <span className="exec-cc-title">
        {item.title}
        <span className="exec-cc-summary">{item.summary}</span>
      </span>
      <span className="exec-cc-sla">{item.slaState ?? "—"}</span>
      <span className="exec-cc-action">{item.actionLabel ?? "Open"}</span>
    </button>
  );
}

export function NeedsYou({
  panel,
  onOpen,
}: {
  panel: NeedsYouPanel;
  onOpen: (item: TriageItem) => void;
}) {
  return (
    <Panel
      title="Needs you now"
      state={panel.state}
      authority={panel.authority}
      freshness={panel.freshness}
      meta={
        <>
          {countLabel(panel.counts)}
          {panel.formulaVersion ? ` · ${panel.formulaVersion}` : null}
        </>
      }
    >
      {panel.items.length === 0 ? (
        <p className="exec-cc-quiet">Nothing needs you.</p>
      ) : (
        <div className="exec-cc-rows">
          {panel.items.map((item) => (
            <TriageRow key={item.id} item={item} onOpen={onOpen} />
          ))}
        </div>
      )}
      {/* Truncation is stated, not implied by a short list. */}
      {panel.counts.truncated ? (
        <p className="exec-cc-note">
          Showing {panel.counts.returned ?? panel.items.length} of {countLabel(panel.counts)}. The
          rest are ranked behind these and open in the queue.
        </p>
      ) : null}
    </Panel>
  );
}

export function FleetHealth({ panel }: { panel: FleetPanel }) {
  return (
    <Panel
      title="Fleet health"
      state={panel.state}
      authority={panel.authority}
      freshness={panel.freshness}
      meta={
        panel.totalDeployments != null
          ? `${panel.exactTotal ? "" : "~"}${panel.totalDeployments} deployments`
          : "deployment count unavailable"
      }
    >
      <div className="exec-cc-cells">
        {panel.cells.map((cell) => (
          <a className="exec-cc-cell" key={cell.code ?? cell.label} href={cell.href ?? undefined}>
            <span className="exec-cc-cellvalue exec-num">
              {/* `—`, never 0. An unknown count and an empty stage are not the
                  same thing, and on this screen the difference is whether you
                  go and look. */}
              {cell.value ?? "—"}
            </span>
            <span className="exec-cc-celllabel">{cell.label}</span>
          </a>
        ))}
      </div>
    </Panel>
  );
}

export function PinnedWatchlist({ panel }: { panel: PinnedPanel }) {
  return (
    <Panel
      title="Pinned watchlist"
      state={panel.state}
      authority={panel.authority}
      freshness={panel.freshness}
      meta={panel.limit != null ? `${panel.total ?? panel.items.length} of max ${panel.limit}` : undefined}
    >
      {panel.items.length === 0 ? (
        <p className="exec-cc-quiet">Nothing pinned. Pin from any workbench.</p>
      ) : (
        <ul className="exec-cc-pins">
          {panel.items.map((pin) => (
            <li className="exec-cc-pin" key={pin.entityId ?? pin.slot} data-target-state={pin.targetAvailable ? "available" : "unavailable"}>
              <span className="exec-cc-pinlabel">{pin.label}</span>
              {pin.targetAvailable ? (
                <>
                  <span className="exec-cc-pintarget">{pin.targetLabel ?? "—"}</span>
                  {pin.targetAuthority ? <AuthorityWord authority={pin.targetAuthority} /> : null}
                  {pin.targetFreshness ? <FreshnessIndicator state={pin.targetFreshness} /> : null}
                </>
              ) : (
                // Kept visible on purpose. A pin whose target cannot be read is
                // information — silently dropping it tells the operator they
                // never pinned it.
                <span className="exec-cc-pinunavailable">
                  target unavailable — this pin cannot be shown from the current sources
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="exec-cc-note">A pin never mutes an alert.</p>
    </Panel>
  );
}

export function Today({ panel }: { panel: TodayPanel }) {
  return (
    <Panel
      title="Today"
      state={panel.state}
      authority={panel.authority}
      freshness={panel.freshness}
      meta={countLabel(panel.counts)}
    >
      <ul className="exec-cc-today">
        {panel.items.map((item) => (
          <li key={item.id}>
            <span className="exec-cc-todaykind">{item.kind ?? "—"}</span>
            <a href={item.href ?? undefined}>{item.label}</a>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function CommandCenterScreen({
  snapshot,
  onOpen,
  live,
}: {
  snapshot: CommandCenterSnapshot;
  onOpen: (item: TriageItem) => void;
  /**
   * Subscription state, when a stream was opened. Absent while dark, and the
   * screen must read the same as it does today when it is.
   */
  live?: SubscriptionState | null;
}) {
  const gate = streamGate(snapshot);
  const critical =
    snapshot.needsYou?.items.filter((i) => i.severity === "CRITICAL").length ?? 0;

  return (
    <ExecutionSurface kind="deployments" className="exec-cc">
      <header className="exec-cc-head">
        {/* EL-V2-02 pilot: the one screen migrated to a type role before the
            anatomy migration in EL-V2-04. Page identity is sans 24/32 — the
            first thing on the surface that is not 10px monospace. */}
        <h1 className="exec-role-title exec-page-title">
          {snapshot.actorName ? `Good morning, ${snapshot.actorName}` : "Command Center"}
          {critical > 0 ? <span className="exec-cc-critical">{critical} CRITICAL</span> : null}
        </h1>
        {/* No EventSource control while the stream is dark. A disabled live
            toggle would advertise a capability that does not exist yet, and an
            operator who sees one assumes the page updates itself.
            The sentence comes from `streamGate` rather than being written here,
            so the words the operator reads and the decision the transport makes
            are the same fact and cannot drift apart. */}
        {!gate.allowed ? (
          <p className="exec-cc-sub">{gate.reason} Reload to re-read.</p>
        ) : live ? (
          <p className="exec-cc-sub" data-live="true">
            Live — {live.freshness}
            {live.phase ? ` · ${live.phase}` : null}
            {live.note ? ` · ${live.note}` : null}
          </p>
        ) : (
          /* Published is not connected. This branch read `live?.freshness ??
             "UNKNOWN"` and printed `Live — UNKNOWN` under a `data-live="true"`
             marker while holding no subscription at all, which is the page
             claiming to be updating itself and naming its own ignorance as the
             freshness. A stream can be published and not yet open — the flag
             is the server's, the socket is ours — so the two are separate
             sentences and only the second one is `data-live`. */
          <p className="exec-cc-sub">Stream published — not connected. Values are as read.</p>
        )}
      </header>

      {snapshot.warnings.length > 0 ? (
        <ul className="exec-cc-warnings">
          {snapshot.warnings.map((w) => (
            <li key={w.code}>
              <b>{w.code}</b> {w.message}
            </li>
          ))}
        </ul>
      ) : null}

      {snapshot.needsYou ? <NeedsYou panel={snapshot.needsYou} onOpen={onOpen} /> : null}
      <div className="exec-cc-twoup">
        {snapshot.fleet ? <FleetHealth panel={snapshot.fleet} /> : null}
        {snapshot.pinned ? <PinnedWatchlist panel={snapshot.pinned} /> : null}
      </div>
      {snapshot.today ? <Today panel={snapshot.today} /> : null}
    </ExecutionSurface>
  );
}
