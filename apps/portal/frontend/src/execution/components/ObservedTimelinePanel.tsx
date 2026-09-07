/**
 * Observed timeline — the EDS-09b / EDS-10b observation lane on screen
 * (FRONTEND_HANDOFF §8.51). Heading is "Observed timeline", never "Trade
 * Replay"; provenance `PORTAL_OBSERVATION`; each row is a current-page
 * observation of an order / fill / session / command-journal row ordered by
 * `observed_at_ms`, then clock class, then source identifier. The panel keeps
 * its layout in every state (READY / PARTIAL / STALE / EMPTY / UNAVAILABLE),
 * never infers omitted history, and never retries the source from the
 * browser. Motion is by real revision (G8): rows a new projection sequence
 * brought in flash once; the beat in the header restarts on that sequence.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { formatExact } from "../formatExact";
import { newEntryKeys, type ObservedEntry, type ObservedTimeline } from "../api/observedTimeline";
import type { PanelStatus } from "../contracts";
import { smokeMotionAllowed } from "../smokeMotion";
import { useRevisionBeat } from "../useRevision";

export interface ObservedTimelinePanelProps {
  timeline: ObservedTimeline | null;
  transport: PanelStatus;
  reason?: string | null;
  subjectLabel: string;
  /** read the next page with the Portal's own continuation token, unchanged */
  onLoadMore?: (after: string) => void;
  loadingMore?: boolean;
  /** rows appended from earlier pages (older); the panel shows page 1 first */
  olderEntries?: readonly ObservedEntry[];
  /** the environment being read, and the ones the subject is deployed in (a switch when there is more than one) */
  environment?: string | null;
  environments?: readonly string[];
  onEnvironment?: (environment: string) => void;
}

const money = (v: string | null) => (v ? formatExact(v, "money").display : "—");
const qty = (v: string | null) => (v ? formatExact(v, "qty").display : "—");
const stamp = (ms: number) => new Date(ms).toISOString().replace("T", " ").slice(0, 19) + "Z";
const ago = (ms: number | null, now: number) => (ms === null ? "—" : `${Math.max(0, Math.round((now - ms) / 1000))}s ago`);

const TYPE_CHIP: Record<string, { label: string; tone: "good" | "accent" | "mute" | "warn" }> = {
  ORDER_OBSERVED: { label: "ORDER", tone: "accent" },
  FILL_OBSERVED: { label: "FILL", tone: "good" },
  SESSION_OBSERVED: { label: "SESSION", tone: "mute" },
  COMMAND_JOURNAL_ROW_OBSERVED: { label: "JOURNAL", tone: "warn" },
};

export function ObservedTimelinePanel({ timeline, transport, reason = null, subjectLabel, onLoadMore, loadingMore = false, olderEntries = [], environment = null, environments = [], onEnvironment }: ObservedTimelinePanelProps) {
  const sequence = timeline?.projection.sequence ?? null;
  const { beat, changedAtMs } = useRevisionBeat(sequence);
  const previous = useRef<readonly ObservedEntry[] | null>(null);
  const entries = timeline?.timeline.entries ?? [];
  const fresh = useMemo(() => newEntryKeys(previous.current, entries), [entries]);
  useEffect(() => { if (timeline) previous.current = entries; }, [timeline, entries]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!smokeMotionAllowed()) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(id);
  }, []);
  const state = timeline?.timeline.state ?? (transport === "loading" ? null : "UNAVAILABLE");
  const rows = [...entries, ...olderEntries];
  const motion = smokeMotionAllowed();

  return (
    <section className="exec-obs-panel" aria-label="Observed timeline" data-state={state ?? "loading"} data-revision={sequence ?? undefined} data-environment={environment ?? undefined}>
      <header className="exec-obs-head">
        <span className="exec-rp-title">Observed timeline</span>
        {environments.length > 1 ? (
          <span className="exec-obs-envs" role="group" aria-label="Environment">
            {environments.map((env) => (
              <button key={env} type="button" className="exec-obs-envbtn" data-active={env === environment ? "true" : undefined} aria-pressed={env === environment} onClick={() => onEnvironment?.(env)}>{env}</button>
            ))}
          </span>
        ) : environment ? <span className="exec-obs-chip" data-tone="mute" title="Environment">{environment}</span> : null}
        <span className="exec-obs-chip" data-tone="mute" title="Provenance">{timeline?.observationAuthority ?? "PORTAL_OBSERVATION"}</span>
        <span className="exec-obs-chip" data-tone="mute" title="Semantics">{timeline?.observationSemantics ?? "BOUNDED_CURRENT_PAGE"}</span>
        {state ? <span className="exec-obs-chip" data-tone={state === "READY" ? "good" : state === "PARTIAL" || state === "STALE" ? "warn" : state === "EMPTY" ? "mute" : "bad"}>{state}{timeline?.timeline.reasonCode ? ` · ${timeline.timeline.reasonCode}` : ""}</span> : <span className="exec-obs-chip" data-tone="mute">loading</span>}
        <span className="exec-obs-spacer" />
        {sequence !== null ? (
          <span className="exec-obs-rev" data-beat={beat} title="Projection sequence — the beat restarts when it advances">
            <span key={beat} className="exec-obs-beat" data-motion={motion && beat > 0 ? "on" : "off"} aria-hidden="true" />
            rev {sequence}{changedAtMs !== null ? <span className="exec-obs-mute"> · advanced {ago(changedAtMs, now)}</span> : null}
          </span>
        ) : null}
        <span className="exec-obs-mute">
          {timeline?.projection.sourceAsOfMs ? `source as_of ${stamp(timeline.projection.sourceAsOfMs)}` : "source as_of not published"}
          {timeline?.projection.completeness ? ` · ${timeline.projection.completeness}` : ""}
          {` · ${rows.length} observation${rows.length === 1 ? "" : "s"}`}
        </span>
      </header>
      {state === "UNAVAILABLE" || (state === null && transport !== "loading") ? (
        <div className="exec-gate-unverified">Observed timeline unavailable for {subjectLabel} · {timeline?.timeline.reasonCode ?? reason ?? transport}. The layout stays; nothing is inferred.</div>
      ) : null}
      {state === "EMPTY" ? <div className="exec-gate-unverified">No observation of {subjectLabel} in the current page. This is a bounded current-page observation, not a statement that nothing ever happened.</div> : null}
      {state === "STALE" ? <p className="exec-rp-smoke">Last valid observation retained · freshness {timeline?.timeline.asOfMs ? stamp(timeline.timeline.asOfMs) : "not published"} · the browser does not retry the source.</p> : null}
      {state === "PARTIAL" ? <p className="exec-rp-smoke">Partial current page · {timeline?.timeline.reasonCode ?? "reason not published"} · omitted history is not inferred.</p> : null}
      {rows.length > 0 ? (
        <div className="exec-scroll-x">
          <table className="exec-rp-table exec-obs-table">
            <thead><tr><th>observed (UTC)</th><th>type</th><th>record</th><th>clock</th><th data-numeric="true">price</th><th data-numeric="true">qty</th><th data-numeric="true">realized</th><th>resource</th></tr></thead>
            <tbody>
              {rows.map((e) => {
                const chip = TYPE_CHIP[e.observationType] ?? { label: e.record.kind, tone: "mute" as const };
                return (
                  <tr key={e.key} data-observation={e.key} data-new={fresh.has(e.key) && motion ? "true" : undefined}>
                    <td className="exec-rp-dim">{stamp(e.observedAtMs)}</td>
                    <td><span className="exec-rp-ev" data-tone={chip.tone}>{chip.label}</span></td>
                    <td><span className="exec-rp-mute">{e.record.kind.toLowerCase()} </span><span className="exec-num">{e.record.id}</span></td>
                    <td className="exec-rp-dim">{e.sourceClock ?? "—"}</td>
                    <td data-numeric="true">{money(e.values.price)}</td>
                    <td data-numeric="true">{qty(e.values.quantity)}</td>
                    <td data-numeric="true" data-tone={e.values.realizedPnl ? (Number(e.values.realizedPnl) >= 0 ? "good" : "bad") : undefined}>{money(e.values.realizedPnl)}</td>
                    <td className="exec-rp-dim">{[e.resource.instrumentId, e.resource.accountId, e.resource.sessionId ? `session ${e.resource.sessionId.slice(0, 12)}` : null].filter(Boolean).join(" · ") || "—"}{e.rejectedFields.length > 0 ? <span data-tone="warn"> · {e.rejectedFields.length} field{e.rejectedFields.length === 1 ? "" : "s"} rejected at the BFF</span> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {timeline?.page.hasMore && timeline.page.nextCursor && onLoadMore ? (
        <div className="exec-obs-more"><button type="button" className="exec-rp-chip" disabled={loadingMore} onClick={() => onLoadMore(timeline.page.nextCursor!)}>{loadingMore ? "loading…" : "older observations"}</button></div>
      ) : null}
      {timeline && timeline.timeline.segments.length > 0 ? (
        <div className="exec-rp-legend">
          {timeline.timeline.segments.map((s) => <span key={s.segment} data-tone="warn">Soon · {s.segment} · {s.state}{s.reasonCode ? ` · ${s.reasonCode}` : ""}</span>)}
        </div>
      ) : null}
      {timeline ? (
        <div className="exec-rp-legend" aria-label="DERIVED · mark-context">
          <span className="exec-rp-mute">{timeline.mark.label ?? "DERIVED · mark-context"} · {timeline.mark.state}{timeline.mark.reasonCode ? ` · ${timeline.mark.reasonCode}` : ""}</span>
          {timeline.mark.marks.slice(0, 6).map((m, i) => <span key={`${m.positionId ?? i}`}>{m.instrumentId ?? m.positionId ?? "position"} mark <b>{money(m.markPrice)}</b>{m.markPriceAtMs ? <span className="exec-rp-mute"> · {stamp(m.markPriceAtMs)}</span> : null}</span>)}
          {timeline.mark.marketContext.state ? <span data-tone="warn">market context {timeline.mark.marketContext.state}{timeline.mark.marketContext.reasonCode ? ` · ${timeline.mark.marketContext.reasonCode}` : ""}</span> : null}
        </div>
      ) : null}
      <footer className="exec-rp-foot">
        {timeline?.timeline.historySemantics ?? "BOUNDED_CURRENT_PAGE_OBSERVATION_NOT_AUTHORITATIVE_EVENT_REPLAY"} · ordering {timeline?.timeline.orderingRule ?? "OBSERVED_AT_MS_THEN_CLOCK_CLASS_THEN_SOURCE_IDENTIFIER_V1"} · read_at {timeline?.timeline.readAtMs ? stamp(timeline.timeline.readAtMs) : "—"} · continuation is a Portal token, passed back unchanged
      </footer>
    </section>
  );
}
