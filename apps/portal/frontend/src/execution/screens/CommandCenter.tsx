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
import { ExecutionWorkspace } from "../components/workspace";
import type { SubscriptionState } from "../subscription";
import type { ReactNode } from "react";
import { advanceAsOf, ccSmoke, jitter, useSmokeTick, type MatrixCell, type Pipeline, type StageKey } from "../commandCenter.smoke";

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

/**
 * Panel frame per hi-fi 5a: 1px hairline, raised paper, a 10/14 header row
 * whose title is mono 11px uppercase and whose meta sits at the right, an
 * optional mono 10px footer note.
 */
function Panel({ title, authority, freshness, meta, footer, label, children }: { title: string; authority?: NeedsYouPanel["authority"]; freshness?: NeedsYouPanel["freshness"]; meta?: ReactNode; footer?: ReactNode; label: string; children: ReactNode }) {
  return (
    <section className="exec-cc-panel" aria-label={label}>
      <header className="exec-cc-panelhead">
        <h2 className="exec-cc-paneltitle">{title}</h2>
        {authority ? <AuthorityWord authority={authority} /> : null}
        {freshness ? <FreshnessIndicator state={freshness} /> : null}
        {meta ? <span className="exec-cc-meta">{meta}</span> : null}
      </header>
      <div className="exec-cc-panelbody">{children}</div>
      {footer ? <footer className="exec-cc-panelfoot">{footer}</footer> : null}
    </section>
  );
}

function slaLabel(item: TriageItem): string {
  const parts = [item.slaState ? item.slaState.replace("_", " ") : null, item.ageSeconds !== null ? ageLabel(item.ageSeconds) : null].filter(Boolean);
  return parts.join(" · ") || "—";
}
function ageLabel(seconds: number): string {
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

/**
 * SLA as time, not as a word: remaining = due − now; the window is the item's
 * age plus what is left, so the bar starts full when the item was raised and
 * empties at the deadline. OVERDUE counts up past it.
 */
function slaClock(item: TriageItem, readAt: string | null, elapsed: number): { label: string; frac: number; state: "overdue" | "due" | "ok" | "none" } {
  const due = item.slaDueAt ? Date.parse(item.slaDueAt) : NaN;
  const read = readAt ? Date.parse(readAt) : NaN;
  if (!Number.isFinite(due) || !Number.isFinite(read)) return { label: slaLabel(item), frac: 0, state: "none" };
  const now = read + elapsed * 1000;
  const remaining = (due - now) / 1000;
  const age = (item.ageSeconds ?? 0) + elapsed;
  const window = Math.max(1, age + Math.max(remaining, 0));
  if (remaining < 0) return { label: `OVERDUE · +${ageLabel(-remaining)}`, frac: 1, state: "overdue" };
  const frac = Math.max(0, Math.min(1, remaining / window));
  const state = item.slaState === "DUE_SOON" || remaining < 3600 ? "due" : "ok";
  return { label: `${state === "due" ? "DUE SOON" : "ON TRACK"} · ${ageLabel(remaining)} left`, frac, state };
}

function TriageRow({ item, position, onOpen, elapsed = 0, readAt = null }: { item: TriageItem; position: number; onOpen: (item: TriageItem) => void; elapsed?: number; readAt?: string | null }) {
  const clock = slaClock(item, readAt, elapsed);
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
      <span className="exec-cc-rank">{position}</span>
      <span className="exec-cc-kind">{item.kind ?? "UNKNOWN"}</span>
      <span className="exec-cc-title">
        {item.title}
        {item.summary ? <span className="exec-cc-summary"> — {item.summary}</span> : null}
      </span>
      <span className="exec-cc-spacer" />
      <span className="exec-cc-sla" data-clock={clock.state}>
        {clock.label}
        {clock.state !== "none" ? (
          <span className="exec-cc-slabar" role="meter" aria-valuemin={0} aria-valuemax={1} aria-valuenow={clock.frac} aria-label={`time left ${Math.round(clock.frac * 100)}%`}>
            <span className="exec-cc-slafill" style={{ width: `${clock.frac * 100}%` }} />
          </span>
        ) : null}
      </span>
      <span className="exec-cc-action">{item.actionLabel ?? "open"} →</span>
    </button>
  );
}

export function NeedsYou({ panel, onOpen, readAt = null }: { panel: NeedsYouPanel; onOpen: (item: TriageItem) => void; readAt?: string | null }) {
  const ranked = rankTriage(panel.items);
  const elapsed = useSmokeTick(1000);
  return (
    <Panel label="Needs you now" title="Needs you now — ranked across all loops" authority={panel.authority} freshness={panel.freshness} meta="rank = severity → SLA → age">
      {panel.state !== "ok" ? (
        <PanelState status={panel.state} />
      ) : ranked.length === 0 ? (
        <div className="exec-cc-quietblock">
          <div className="exec-cc-quiettitle">Nothing needs you.</div>
          <div className="exec-cc-quietmeta">Quiet as of {readAt ?? "time not published"} · 0 incidents · 0 overdue approvals · 0 stuck operations — pending work owned by others stays in its queues</div>
        </div>
      ) : (
        <div className="exec-cc-rows">
          {ranked.map((item, i) => (
            <TriageRow key={item.id} item={item} position={i + 1} onOpen={onOpen} elapsed={elapsed} readAt={readAt} />
          ))}
        </div>
      )}
      {panel.counts.truncated ? (
        <p className="exec-cc-note">{countLabel(panel.counts)} shown — the rest are ranked behind these and open in the queue.</p>
      ) : null}
    </Panel>
  );
}

export function FleetHealth({ panel }: { panel: FleetPanel }) {
  const smoke = ccSmoke();
  const tick = useSmokeTick(2000);
  return (
    <Panel
      label="Fleet health"
      title="Fleet health"
      authority={panel.authority}
      freshness={panel.freshness}
      meta={panel.totalDeployments != null ? `${panel.exactTotal ? "" : "~"}${panel.totalDeployments} deployments` : "deployment count unavailable"}
      footer={<>cells link to their stage list · counts only — amounts live in the 360° screens{smoke ? <span className="exec-cc-smoke"> · smoke sub-notes</span> : null}</>}
    >
      {panel.state !== "ok" ? (
        <PanelState status={panel.state} />
      ) : (
        <div className="exec-cc-cells">
          {panel.cells.map((cell) => {
            const x = smoke?.fleet[cell.label];
            const liveSub = smoke && cell.label === "Broker sync" ? `age ${(1.1 + jitter(tick, 3) * 0.4).toFixed(1)}s` : null;
            return (
              <div className="exec-cc-cell" key={cell.label}>
                <div className="exec-cc-celllabel">{cell.label}</div>
                <div className="exec-cc-cellvalue" data-absent={cell.value === null ? "true" : undefined} data-tone={cell.value === null ? undefined : x?.tone}>
                  {cell.value === null ? "—" : String(cell.value)}
                  {cell.value !== null && (x?.sub || liveSub) ? <span className="exec-cc-cellsub" data-tone={x?.subTone} data-smoke={liveSub ? "true" : undefined}> {x?.sub ?? liveSub}</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

export function PinnedWatchlist({ panel }: { panel: PinnedPanel }) {
  const smoke = ccSmoke();
  const tick = useSmokeTick(3000);
  const nudge = (figure: string): string => {
    const m = /^([+−-])(\d+)$/.exec(figure);
    if (!m) return figure;
    const base = Number(m[2]) + Math.round(jitter(tick, 5) * 2);
    return `${base >= 0 ? "+" : "−"}${Math.abs(base)}`;
  };
  return (
    <Panel label="Pinned watchlist" title="Pinned — your watchlist" authority={panel.authority} freshness={panel.freshness} meta={panel.limit != null ? `pin from any workbench header · max ${panel.limit}` : undefined} footer={<>user-owned order · a pin never mutes alerts{smoke ? <span className="exec-cc-smoke"> · smoke stage/status</span> : null}</>}>
      {panel.state !== "ok" ? (
        <PanelState status={panel.state} />
      ) : panel.items.length === 0 ? (
        <p className="exec-cc-quiet">Nothing pinned. Pin from any workbench.</p>
      ) : (
        <ul className="exec-cc-pins">
          {panel.items.map((pin) => (
            <li className="exec-cc-pin" key={pin.entityId ?? pin.slot} data-target-state={pin.targetAvailable ? "available" : "unavailable"}>
              {smoke?.pins[pin.label] ? <span className="exec-cc-stagechip" data-stage={smoke.pins[pin.label].stage}>{smoke.pins[pin.label].stage === "CANARY" ? "⛨ " : ""}{smoke.pins[pin.label].stage}</span> : null}
              <span className="exec-cc-pinlabel">
                {pin.label}
                {smoke?.pins[pin.label] ? <span className="exec-cc-pinmeta"> · {smoke.pins[pin.label].venue} · {smoke.pins[pin.label].deploymentId}</span> : null}
              </span>
              <span className="exec-cc-spacer" />
              {pin.targetAvailable ? (
                <>
                  {smoke?.pins[pin.label] ? (
                    <>
                      <span className="exec-cc-pinfigure" data-tone={smoke.pins[pin.label].figureTone} data-tick={tick % 2 ? "b" : "a"}>{nudge(smoke.pins[pin.label].figure)}</span>
                      <span className="exec-cc-status" data-status={smoke.pins[pin.label].status}>{smoke.pins[pin.label].status}</span>
                    </>
                  ) : (
                    <>
                      <span className="exec-cc-pintarget">{pin.targetLabel ?? "—"}</span>
                      {pin.targetAuthority ? <AuthorityWord authority={pin.targetAuthority} /> : null}
                    </>
                  )}
                  {pin.targetFreshness ? <FreshnessIndicator state={pin.targetFreshness} /> : null}
                </>
              ) : (
                <span className="exec-cc-pinunavailable">target unavailable from current sources</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function Today({ panel }: { panel: TodayPanel }) {
  return (
    <Panel label="Today" title="Today" authority={panel.authority} freshness={panel.freshness} meta={countLabel(panel.counts)}>
      {panel.state !== "ok" ? (
        <PanelState status={panel.state} />
      ) : (
        <ul className="exec-cc-today">
          {panel.items.map((item) => (
            <li key={item.id}>
              <span className="exec-cc-todaykind">{item.kind ?? "—"}</span>
              <a href={item.href ?? undefined}>{item.label}</a>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}


const STAGE_ORDER: StageKey[] = ["PAPER", "SANDBOX", "CANARY", "LIVE"];

function MatrixCellView({ cell }: { cell: MatrixCell }) {
  if (cell.kind === "none") return <span className="exec-cc-mx-none">—</span>;
  if (cell.kind === "done") {
    return (
      <span className="exec-cc-mx-done">
        <span className="exec-cc-mx-check">✓ {cell.label}</span>
        {cell.ref ? <span className="exec-cc-mx-chip">● {cell.ref}</span> : null}
        {cell.venue ? <span className="exec-cc-mx-venue"> {cell.venue}</span> : null}
        {cell.paused ? <span className="exec-cc-mx-paused" title="paused"> ⏸</span> : null}
      </span>
    );
  }
  return (
    <span className="exec-cc-mx-current">
      <span className="exec-cc-mx-chip">● {cell.label}</span>
      {cell.venue ? <span className="exec-cc-mx-venue"> {cell.venue}</span> : null}
    </span>
  );
}

/** Hi-fi 5a: funnel of alpha versions across the four stages, then the alpha × stage matrix. */
export function PromotionPipeline({ pipeline, warning }: { pipeline: Pipeline; warning?: string }) {
  const max = Math.max(...pipeline.stages.map((s) => s.entered), 1);
  return (
    <Panel label="Promotion pipeline" title="Promotion pipeline — alpha versions, all modes" meta={<>from registry · {pipeline.window} · <b>{pipeline.authority}</b></>} footer={<>one row = one alpha version · a cell = its deployment at that stage (venue) · ✓ links the exit decision · ● current<span className="exec-cc-spacer" />funnel counts versions, not deployments — a version on 2 venues is still one version{warning ? <span className="exec-cc-smoke"> · smoke</span> : null}</>}>
      <div className="exec-cc-funnel">
        {pipeline.stages.map((st) => (
          <div className="exec-cc-funnelstage" key={st.key} data-stage={st.key}>
            <div className="exec-cc-funnellabel">{st.label}</div>
            <div className="exec-cc-funnelrow">
              <span className="exec-cc-funnelnum">{st.entered}</span>
              {st.conversion ? (
                <span className="exec-cc-funnelconv">
                  {st.conversion.num}/{st.conversion.den} ↗<br />
                  {Math.round((st.conversion.num / st.conversion.den) * 100)}%
                </span>
              ) : null}
            </div>
            <div className="exec-cc-funnelbar"><div className="exec-cc-funnelfill" style={{ width: `${(st.entered / max) * 100}%` }} /></div>
            <div className="exec-cc-funnelnote">{st.note}</div>
          </div>
        ))}
      </div>
      <div className="exec-scroll-x">
        <table className="exec-cc-matrix">
          <thead>
            <tr>
              <th scope="col">Alpha · version</th>
              {STAGE_ORDER.map((k) => <th scope="col" key={k} data-stage={k}>{k}</th>)}
            </tr>
          </thead>
          <tbody>
            {pipeline.rows.map((row) => (
              <tr key={row.alpha}>
                <th scope="row"><a href={row.href}>{row.alpha}</a></th>
                {STAGE_ORDER.map((k) => <td key={k}><MatrixCellView cell={row.cells[k]} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export function CommandCenterScreen({ snapshot, onOpen, live }: { snapshot: CommandCenterSnapshot; onOpen: (item: TriageItem) => void; live?: SubscriptionState | null }) {
  const gate = streamGate(snapshot);
  const smoke = ccSmoke();
  const clock = useSmokeTick(1000);
  const asOf = smoke ? advanceAsOf(snapshot.readAt, clock) : snapshot.readAt;
  const ranked = rankTriage(snapshot.needsYou?.items ?? []);
  const critical = ranked.filter((i) => i.severity === "CRITICAL").length;
  const busy = ranked.length > 0;
  const streamBadge = !gate.allowed
    ? null
    : live?.phase === "auth_expired"
      ? { label: "SESSION EXPIRED", tone: "bad" }
      : live?.phase === "source_lost"
        ? { label: "SOURCE LOST", tone: "bad" }
        : null;
  const streamLine = !gate.allowed ? (
    <span className="exec-cc-sub" role="status">{gate.reason}</span>
  ) : live?.phase === "auth_expired" ? (
    <span className="exec-cc-sub exec-cc-sub-alert" role="alert" data-stream="auth_expired">{live.note ?? "Session expired. Sign in again to resume the live stream; values below are as read."}</span>
  ) : live?.phase === "source_lost" ? (
    <span className="exec-cc-sub exec-cc-sub-alert" role="alert" data-stream="source_lost">{live.note ?? "Source lost. Values are as last read."}{live.lastGoodAsOf ? ` Last good as_of ${live.lastGoodAsOf}.` : ""}</span>
  ) : live ? (
    <span className="exec-cc-sub" data-live="true">
      Live — {live.freshness}
      {live.phase ? ` · ${live.phase}` : null}
      {live.note ? ` · ${live.note}` : null}
    </span>
  ) : (
    <span className="exec-cc-sub">Stream published — not connected. Values are as read.</span>
  );
  return (
    <ExecutionSurface kind="deployments" className="exec-cc" data-hifi-exact="command-center-5a">
      <ExecutionWorkspace layout="dense">
        <div className="exec-cc-page">
          <header className="exec-cc-masthead">
            <h1 className="exec-cc-h1">{snapshot.actorName ? `Good morning, ${snapshot.actorName}` : "Command Center"}</h1>
            {critical > 0 ? <span className="exec-cc-critical">{critical} CRITICAL</span> : null}
            <span className="exec-cc-state" data-tone={busy ? "warn" : "good"}>{busy ? `BUSY · ${ranked.length}` : "QUIET"}</span>
            {streamBadge ? <span className="exec-cc-state" data-tone={streamBadge.tone}>{streamBadge.label}</span> : null}
            <span className="exec-cc-spacer" />
            <span className="exec-cc-asof" data-smoke-clock={smoke ? "true" : undefined}>as_of {asOf ?? "not published"} · every row links to its owning screen</span>
          </header>
          {streamLine}
          {snapshot.warnings.length > 0 ? (
            <ul className="exec-cc-warnings" role="status">
              {snapshot.warnings.map((w) => (
                <li key={w.code}>
                  <b>{w.code}</b> {w.message}
                </li>
              ))}
            </ul>
          ) : null}
          {snapshot.needsYou ? <NeedsYou panel={snapshot.needsYou} onOpen={onOpen} readAt={snapshot.readAt} /> : null}
          <div className="exec-cc-twoup">
            {snapshot.fleet ? <FleetHealth panel={snapshot.fleet} /> : null}
            {snapshot.pinned ? <PinnedWatchlist panel={snapshot.pinned} /> : null}
          </div>
          {smoke ? <PromotionPipeline pipeline={smoke.pipeline} warning={smoke.warning} /> : null}
          {snapshot.today ? <Today panel={snapshot.today} /> : null}
        </div>
      </ExecutionWorkspace>
    </ExecutionSurface>
  );
}
