/**
 * Activity & Decisions: the equity path with the event ribbon on the same time
 * axis, and the events behind it.
 *
 * The events are the Portal's observed timeline: the orders, fills, sessions
 * and command-journal rows the source holds, ordered by when they were
 * observed. That is not the unified subject event feed (FE-031: promotions,
 * approvals, capital commands, incidents, restarts), so the ribbon draws only
 * what the observed timeline can honestly place on its lanes (command-journal
 * rows on the Decision lane) and says that the other lanes are not published.
 * Who did it and the receipt are not in this source (FE-021, FE-032), so the
 * feed carries no actor column. Stage bands are where each stage published a
 * daily close, not a lifecycle history.
 */
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import { PanelState } from "../../../components/states";
import type { ObservedEntry, ObservedTimeline } from "../../../api/observedTimeline";
import { readUtcEpochMs } from "../../../screenDataContract";
import { readDecimal } from "../../boundary";
import { ChartTools, EquityPanel } from "../../charts";
import { EventFeed, SectionPanel, type EventFeedRow } from "../../blocks";
import { ENV_LABEL, type ExecEnv } from "../../urlState";
import { ROW_CAP, feedKind, orderFlag, type EquityPanelInput, type StagePath } from "./model";
import { lifeFeedRows, type LifeEvent, type StageSpan } from "./lifecycleModel";
import { useRibbon } from "./ribbonModel";
import { Np } from "./np";
import type { PagedRead, SubjectBook } from "./useAlphaReads";
import type { EventKind } from "../../charts";

/** `type=` values the legacy Sessions and Audit tabs map to (`tabAliases.ts`). */
const TYPE_FILTERS = [
  { id: "all", label: "All", match: null },
  { id: "order", label: "Orders", match: "ORDER_OBSERVED" },
  { id: "fill", label: "Fills", match: "FILL_OBSERVED" },
  { id: "session", label: "Sessions", match: "SESSION_OBSERVED" },
  { id: "audit", label: "Command journal", match: "COMMAND_JOURNAL_ROW_OBSERVED" },
] as const;

const price = (value: string | null) => (value === null ? null : readDecimal(value, { unit: "money" })?.display ?? null);
const qty = (value: string | null) => (value === null ? null : readDecimal(value, { unit: "qty" })?.display ?? null);

function outcomeOf(entry: ObservedEntry, book: SubjectBook): string {
  const q = qty(entry.values.quantity);
  const p = price(entry.values.price);
  const size = q === null ? "" : p === null ? ` · ${q}` : ` · ${q} at ${p}`;
  switch (entry.observationType) {
    case "ORDER_OBSERVED": {
      const order = book.orders.find((o) => o.orderId === entry.record.id);
      return `Order ${entry.record.id}${order ? `, ${orderFlag(order.status).label}` : ""}${size}`;
    }
    case "FILL_OBSERVED": return `Fill ${entry.record.id}${size}`;
    case "SESSION_OBSERVED": return `Session ${entry.record.id}`;
    case "COMMAND_JOURNAL_ROW_OBSERVED": return `Command journal row ${entry.record.id}`;
    default: return `${entry.record.kind} ${entry.record.id}${size}`;
  }
}

export interface ActivityTabProps {
  env: ExecEnv;
  alphaId: string;
  alphaLabel: string;
  inputs: readonly EquityPanelInput[];
  paths: readonly StagePath[];
  timeline: PagedRead<ObservedTimeline>;
  book: SubjectBook;
  /** The dataset's published lifecycle events (WP-C keys); empty with every kind missing when the dataset carries none. */
  life?: { events: readonly LifeEvent[]; missing: readonly EventKind[]; spans?: readonly StageSpan[]; future?: number };
}

const NO_LIFE = { events: [] as readonly LifeEvent[], missing: ["stage", "decision", "incident", "recall", "flow"] as readonly EventKind[] };

export function ActivityTab({ env, alphaLabel, inputs, paths, timeline, book, life = NO_LIFE }: ActivityTabProps) {
  const [params, setParams] = useSearchParams();
  const typeId = params.get("type") ?? "all";
  const filter = TYPE_FILTERS.find((f) => f.id === typeId) ?? TYPE_FILTERS[0];
  const lead = inputs[0] ?? null;
  const rb = useRibbon(timeline, life, paths, lead);
  const seen = rb.seen;
  const domain = rb.domain;

  const rows: EventFeedRow[] = useMemo(() => {
    const filtered = seen.filter((e) => filter.match === null || e.observationType === filter.match);
    const observed = [...filtered]
      .sort((a, b) => b.observedAtMs - a.observedAtMs || a.key.localeCompare(b.key))
      .slice(0, ROW_CAP)
      .flatMap((entry): EventFeedRow[] => {
        const at = readUtcEpochMs(entry.observedAtMs);
        if (at === null) return [];
        const kind = feedKind(entry.observationType);
        return [{
          id: entry.key,
          at,
          kind: kind.kind,
          kindLabel: kind.label,
          target: entry.resource.instrumentId ?? entry.resource.deploymentId ?? alphaLabel,
          outcome: outcomeOf(entry, book),
        }];
      });
    // The dataset's lifecycle events (stage moves, decisions, incidents, recalls, capital flows) sit beside the observed rows under All, newest first, with the actor as published.
    const published = filter.match === null ? lifeFeedRows(rb.lifeEvents, alphaLabel) : [];
    return [...published, ...observed].sort((a, b) => b.at - a.at || a.id.localeCompare(b.id)).slice(0, ROW_CAP);
  }, [seen, filter, book, alphaLabel, rb.lifeEvents]);
  const filteredTotal = seen.filter((e) => filter.match === null || e.observationType === filter.match).length;

  const loading = timeline.read.phase === "loading" || timeline.read.phase === "idle";
  const ribbon = rb.ribbon;

  return (
    <div className="exec-alp2-stack">
      <SectionPanel title="Equity path" aside={`${ENV_LABEL[env]} book`}>
        {rb.chips}
        {lead === null ? (
          <>
            <PanelState status="unavailable" reason="No equity series is published for this book, so the events have no axis to sit on." />
            {ribbon}
          </>
        ) : (
          <ChartTools
            label={`Equity path, ${ENV_LABEL[env]}${lead.currency ? `, ${lead.currency}` : ""}`}
            columns={lead.state.kind === "unavailable" ? [] : [{ key: lead.key, label: lead.label, points: lead.points, currency: lead.currency ?? undefined }]}
          >
            <EquityPanel
              label={`Equity path, ${ENV_LABEL[env]}${lead.currency ? `, ${lead.currency}` : ""}`}
              seriesName={lead.label}
              points={lead.points}
              currency={lead.currency ?? undefined}
              state={lead.state}
              segments={lead.segments}
              domain={domain ?? undefined}
              ribbon={ribbon}
              height={220}
            />
          </ChartTools>
        )}
        <p className="exec-alp2-cap">
          <span>Hatched is simulated, solid is actual</span>
          <span>Stage bands show where each stage published a daily close</span>
          {rb.gaps}
        </p>
      </SectionPanel>

      <div className="exec-alp2-filter" role="group" aria-label="Event type">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className="exec-alp2-segbtn"
            aria-pressed={filter.id === f.id}
            onClick={() => {
              const next = new URLSearchParams(params);
              if (f.id === "all") next.delete("type");
              else next.set("type", f.id);
              setParams(next, { replace: true });
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <PanelState status="loading" />
      ) : (
        <EventFeed
          scope={alphaLabel}
          rows={rows}
          status={timeline.read.phase === "error" ? timeline.read.status : "ok"}
          reason={timeline.read.phase === "error" ? timeline.read.reason : filter.match === null ? undefined : `No ${filter.label.toLowerCase()} rows in the timeline loaded so far.`}
          title="Events"
          cursor={timeline.hasMore || timeline.moreError ? { hasMore: timeline.hasMore, loadingMore: timeline.loadingMore, error: timeline.moreError, onLoadMore: timeline.loadMore } : undefined}
        />
      )}
      <p className="exec-alp2-cap">
        <span>{rows.length < filteredTotal ? `Top ${rows.length} of ${filteredTotal} observations loaded` : `${filteredTotal} observations loaded`}</span>
        <span>Observed timeline: a Portal observation of the current page, not an event replay</span>
        <span>Actor and receipt: <Np id="FE-021" /></span>
      </p>
    </div>
  );
}
