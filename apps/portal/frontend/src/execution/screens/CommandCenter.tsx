/**
 * Command Center (HiFi 5a) — triage first, fleet second, on the V2 anatomy.
 *
 * ONE ranked queue merges incidents, overdue approvals and stuck operations.
 * Rank = severity, then SLA, then age — never screen order and never array
 * order: the server's `rank` wins; when it is absent the same three keys are
 * applied here. BUSY and QUIET are two real states: QUIET is "nothing needs
 * you" with the read timestamp, not an empty page.
 */
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
import { ExecutionSectionTitle } from "../components/typography";
import {
  ExecutionContextRail,
  ExecutionDecisionStrip,
  ExecutionPageHeader,
  ExecutionProvenanceDrawer,
  ExecutionWorkspace,
  type HeaderBadge,
  type RailBlocker,
} from "../components/workspace";
import type { SubscriptionState } from "../subscription";

const SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
const SLA_ORDER = ["OVERDUE", "DUE_SOON", "ON_TRACK"] as const;
function idx(list: readonly string[], v: string | null): number {
  const i = v ? list.indexOf(v) : -1;
  return i === -1 ? list.length : i;
}
/** severity → SLA → age (older first); server rank wins when published. */
export function rankTriage(items: readonly TriageItem[]): TriageItem[] {
  return [...items].sort((a, b) => {
    if (a.rank !== null && b.rank !== null && a.rank !== b.rank) return a.rank - b.rank;
    if (a.rank !== null && b.rank === null) return -1;
    if (a.rank === null && b.rank !== null) return 1;
    const s = idx(SEVERITY_ORDER, a.severity) - idx(SEVERITY_ORDER, b.severity);
    if (s !== 0) return s;
    const l = idx(SLA_ORDER, a.slaState) - idx(SLA_ORDER, b.slaState);
    if (l !== 0) return l;
    return (b.ageSeconds ?? -1) - (a.ageSeconds ?? -1);
  });
}

function PanelHead({ title, authority, freshness, meta }: { title: string; authority: NeedsYouPanel["authority"]; freshness: NeedsYouPanel["freshness"]; meta?: string }) {
  return (
    <header className="exec-cc-panelhead">
      <ExecutionSectionTitle>{title}</ExecutionSectionTitle>
      {authority ? <AuthorityWord authority={authority} /> : null}
      {freshness ? <FreshnessIndicator state={freshness} /> : null}
      {meta ? <span className="exec-cc-meta exec-role-meta">{meta}</span> : null}
    </header>
  );
}

function TriageRow({ item, position, onOpen }: { item: TriageItem; position: number; onOpen: (item: TriageItem) => void }) {
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
      <span className="exec-cc-rank exec-role-num">{position}</span>
      <span className="exec-cc-kind exec-role-th">{item.kind ?? "UNKNOWN"}</span>
      <span className="exec-cc-title">
        {item.title}
        <span className="exec-cc-summary exec-role-meta">{item.summary}</span>
      </span>
      <span className="exec-cc-sla exec-role-meta">{item.slaState ?? "—"}</span>
      <span className="exec-cc-action exec-role-control">{item.actionLabel ?? "Open"}</span>
    </button>
  );
}

export function NeedsYou({ panel, onOpen }: { panel: NeedsYouPanel; onOpen: (item: TriageItem) => void }) {
  const ranked = rankTriage(panel.items);
  return (
    <section className="exec-cc-panel" aria-label="Needs you now">
      <PanelHead title="Needs you now — ranked, cross-loop" authority={panel.authority} freshness={panel.freshness} meta={`${countLabel(panel.counts)}${panel.formulaVersion ? ` · ${panel.formulaVersion}` : ""}`} />
      {panel.state !== "ok" ? (
        <PanelState status={panel.state} />
      ) : ranked.length === 0 ? (
        <p className="exec-cc-quiet exec-role-body">Nothing needs you.</p>
      ) : (
        <div className="exec-cc-rows">
          {ranked.map((item, i) => (
            <TriageRow key={item.id} item={item} position={i + 1} onOpen={onOpen} />
          ))}
        </div>
      )}
      {panel.counts.truncated ? (
        <p className="exec-cc-note exec-role-meta">
          {countLabel(panel.counts)} shown — the rest are ranked behind these and open in the queue.
        </p>
      ) : null}
    </section>
  );
}

export function FleetHealth({ panel }: { panel: FleetPanel }) {
  return (
    <section className="exec-cc-panel" aria-label="Fleet health">
      <PanelHead title="Fleet health" authority={panel.authority} freshness={panel.freshness} meta={panel.totalDeployments != null ? `${panel.exactTotal ? "" : "~"}${panel.totalDeployments} deployments` : "deployment count unavailable"} />
      {panel.state !== "ok" ? (
        <PanelState status={panel.state} />
      ) : (
        <ExecutionDecisionStrip metrics={panel.cells.map((cell) => ({ label: cell.label, value: cell.value === null ? null : String(cell.value) }))} />
      )}
    </section>
  );
}

export function PinnedWatchlist({ panel }: { panel: PinnedPanel }) {
  return (
    <section className="exec-cc-panel" aria-label="Pinned watchlist">
      <PanelHead title="Pinned watchlist" authority={panel.authority} freshness={panel.freshness} meta={panel.limit != null ? `${panel.total ?? panel.items.length} of max ${panel.limit}` : undefined} />
      {panel.state !== "ok" ? (
        <PanelState status={panel.state} />
      ) : panel.items.length === 0 ? (
        <p className="exec-cc-quiet exec-role-body">Nothing pinned. Pin from any workbench.</p>
      ) : (
        <ul className="exec-cc-pins">
          {panel.items.map((pin) => (
            <li className="exec-cc-pin" key={pin.entityId ?? pin.slot} data-target-state={pin.targetAvailable ? "available" : "unavailable"}>
              <span className="exec-cc-pinlabel">{pin.label}</span>
              {pin.targetAvailable ? (
                <>
                  <span className="exec-cc-pintarget exec-role-num">{pin.targetLabel ?? "—"}</span>
                  {pin.targetAuthority ? <AuthorityWord authority={pin.targetAuthority} /> : null}
                  {pin.targetFreshness ? <FreshnessIndicator state={pin.targetFreshness} /> : null}
                </>
              ) : (
                <span className="exec-cc-pinunavailable exec-role-meta">target unavailable from current sources</span>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="exec-cc-note exec-role-meta">A pin never mutes an alert.</p>
    </section>
  );
}

export function Today({ panel }: { panel: TodayPanel }) {
  return (
    <section className="exec-cc-panel" aria-label="Today">
      <PanelHead title="Today" authority={panel.authority} freshness={panel.freshness} meta={countLabel(panel.counts)} />
      {panel.state !== "ok" ? (
        <PanelState status={panel.state} />
      ) : (
        <ul className="exec-cc-today">
          {panel.items.map((item) => (
            <li key={item.id}>
              <span className="exec-cc-todaykind exec-role-th">{item.kind ?? "—"}</span>
              <a href={item.href ?? undefined}>{item.label}</a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function CommandCenterScreen({ snapshot, onOpen, live }: { snapshot: CommandCenterSnapshot; onOpen: (item: TriageItem) => void; live?: SubscriptionState | null }) {
  const gate = streamGate(snapshot);
  const ranked = rankTriage(snapshot.needsYou?.items ?? []);
  const critical = ranked.filter((i) => i.severity === "CRITICAL").length;
  const busy = ranked.length > 0;
  const badges: HeaderBadge[] = [
    { label: busy ? `BUSY · ${ranked.length}` : "QUIET", axis: "readiness", tone: busy ? "warn" : "good" },
    ...(critical > 0 ? [{ label: `${critical} CRITICAL`, axis: "other", tone: "bad" } as HeaderBadge] : []),
    {
      label: !gate.allowed ? "STREAM NOT PUBLISHED" : live?.phase === "auth_expired" ? "SESSION EXPIRED" : live?.phase === "source_lost" ? "SOURCE LOST" : live ? `LIVE · ${live.freshness}${live.coalescedEvents ? ` · ${live.coalescedEvents} coalesced` : ""}` : "STREAM PUBLISHED · NOT CONNECTED",
      axis: "broker-sync",
      tone: live?.phase === "auth_expired" || live?.phase === "source_lost" ? "bad" : live ? "good" : "mute",
    },
  ];
  const first = ranked[0] ?? null;
  const blockers: RailBlocker[] = ranked.filter((i) => i.severity === "CRITICAL").map((i) => ({ label: i.title, detail: `${i.kind ?? "UNKNOWN"} · ${i.slaState ?? "—"}`, severity: "blocking" as const }));
  const rail = (
    <ExecutionContextRail
      next={{
        title: first ? `#1 · ${first.kind ?? "UNKNOWN"}` : "Nothing needs you",
        detail: first ? (
          <span className="exec-role-body">
            {first.title} — {first.summary}
          </span>
        ) : (
          <span className="exec-role-body">Quiet as of {snapshot.readAt ?? "time not published"}. This is a real state, not hidden work.</span>
        ),
        action:
          first && first.href ? (
            <button type="button" className="exec-role-control exec-btn-apply" onClick={() => onOpen(first)}>
              {first.actionLabel ?? "Open"}
            </button>
          ) : undefined,
      }}
      blockers={blockers}
      freshness={
        <span className="exec-role-meta">as_of {snapshot.readAt ?? "not published"} · values are as read</span>
      }
      provenance={
        <ExecutionProvenanceDrawer
          items={[
            ...(snapshot.workspaceId ? [{ label: "workspace", short: snapshot.workspaceId, full: null }] : []),
            { label: "profile", short: snapshot.deliveryProfile ?? "not stated", full: null },
            ...(snapshot.projectionEpoch ? [{ label: "projection", short: `${snapshot.projectionEpoch} · seq ${snapshot.projectionSequence ?? "—"}`, full: null }] : []),
            ...(snapshot.mode ? [{ label: "mode", short: snapshot.mode, full: null }] : []),
          ]}
          onCopy={(full) => void navigator.clipboard?.writeText(full)}
        />
      }
    />
  );
  return (
    <ExecutionSurface kind="deployments" className="exec-cc">
      <ExecutionWorkspace layout="balanced" rail={rail}>
        <div className="exec-cc-head">
          <ExecutionPageHeader
            title={snapshot.actorName ? `Good morning, ${snapshot.actorName}` : "Command Center"}
            badges={badges}
            purpose="What needs you now, ranked across loops."
            secondary={
              !gate.allowed ? (
                <span className="exec-cc-sub exec-role-meta">{gate.reason} Reload to re-read.</span>
              ) : live?.phase === "auth_expired" ? (
                <span className="exec-cc-sub exec-role-body" role="alert" data-stream="auth_expired">{live.note ?? "Session expired. Sign in again to resume the live stream; values below are as read."}</span>
              ) : live?.phase === "source_lost" ? (
                <span className="exec-cc-sub exec-role-body" role="alert" data-stream="source_lost">{live.note ?? "Source lost. Values are as last read."}{live.lastGoodAsOf ? ` Last good as_of ${live.lastGoodAsOf}.` : ""}</span>
              ) : live ? (
                <span className="exec-cc-sub exec-role-meta" data-live="true">
                  Live — {live.freshness}
                  {live.phase ? ` · ${live.phase}` : null}
                  {live.note ? ` · ${live.note}` : null}
                </span>
              ) : (
                <span className="exec-cc-sub exec-role-meta">Stream published — not connected. Values are as read.</span>
              )
            }
          />
        </div>
        {snapshot.warnings.length > 0 ? (
          <ul className="exec-cc-warnings exec-role-body" role="status">
            {snapshot.warnings.map((w) => (
              <li key={w.code}>
                <b>{w.code}</b> {w.message}
              </li>
            ))}
          </ul>
        ) : null}
        {snapshot.needsYou ? <NeedsYou panel={snapshot.needsYou} onOpen={onOpen} /> : null}
        {snapshot.fleet ? <FleetHealth panel={snapshot.fleet} /> : null}
        <div className="exec-cc-twoup exec-grid-2">
          {snapshot.pinned ? <PinnedWatchlist panel={snapshot.pinned} /> : null}
          {snapshot.today ? <Today panel={snapshot.today} /> : null}
        </div>
      </ExecutionWorkspace>
    </ExecutionSurface>
  );
}
