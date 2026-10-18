/**
 * EventFeed (hi-fi cockpit/alpha "Events"): what happened to one subject, newest
 * first as the source ordered it.
 *
 * A row is a UTC time, a kind chip, the target, and a one-line outcome. Rows
 * render in the order given: the feed never sorts, never fills a gap between
 * two events and never infers an event from a state change.
 *
 * Paging is a keyset contract the caller owns: the feed shows `Load more` while
 * the source says there is another page, and reports a failed page without
 * dropping the rows already read.
 */
import type { ReactNode } from "react";

import type { PanelStatus } from "../../contracts";
import { CardsTable, type CardsColumn } from "../cardsTable";
import { Flag } from "../Flag";
import type { FlagKind } from "../flagKinds";
import { formatAsOf } from "../boundary";
import type { UtcEpochMs } from "../../screenDataContract";
import { NotPublished, type NotPublishedId } from "./notPublished";
import { SectionPanel } from "./SectionPanel";
import { PanelGate } from "./StateBoundary";
import "../css/blocks.css";

export interface EventFeedRow {
  /** Stable id of the event (keyset cursor id); used as the React key. */
  id: string;
  /** When it happened, UTC epoch milliseconds (`readUtcEpochMs`). */
  at: UtcEpochMs;
  /** The kind chip. Chosen by the caller from the Flag enum, never inferred from the text. */
  kind: FlagKind;
  /** Chip label when the kind's default word is not the right one ("Recall applied"). */
  kindLabel?: string;
  /** What the event was about ("BTC-Trend v3", "Binance-02"). */
  target: string;
  /** One line: what came of it. */
  outcome: string;
  /** Link to the object, when the screen has a route for it. */
  href?: string;
  /** Who did it, when the source publishes actors. Omit the column's value, not the field, when it does not. */
  actor?: string | null;
  /** Receipt reference, when the source publishes it. */
  receipt?: string | null;
}

export interface EventFeedCursor {
  /** The source says there is another page after the last row. */
  hasMore: boolean;
  /** A page is being read; the button reports it and ignores clicks. */
  loadingMore?: boolean;
  /** The last page read failed; rows already read stay. */
  error?: string | null;
  /** Read the next page with the source's keyset cursor. */
  onLoadMore: () => void;
}

export interface EventFeedProps {
  /** The subject the feed belongs to ("BTC-Trend v3"). Names the table and the empty state. */
  scope: string;
  /** Events in source order. */
  rows: readonly EventFeedRow[];
  /** Panel state; `ok` with no rows is shown as empty. Default `ok`. */
  status?: PanelStatus;
  /** Why the state is what it is; required in practice for denied, unavailable and terminal. */
  reason?: string;
  /** When the whole feed has no source, the request that will publish it. Wins over everything. */
  notPublished?: NotPublishedId;
  /** Keyset paging contract. Omit when the source has one page. */
  cursor?: EventFeedCursor;
  /** Panel title; default `Events`. */
  title?: string;
  /** Render without the panel chrome, for a feed inside a drawer. */
  bare?: boolean;
  /** Whether to show an Actor column. Default: shown only when some row has an actor. */
  showActor?: boolean;
}

function isoOf(at: UtcEpochMs): string | undefined {
  try {
    return new Date(at).toISOString();
  } catch {
    return undefined;
  }
}

function columns(withActor: boolean): CardsColumn<EventFeedRow>[] {
  const base: CardsColumn<EventFeedRow>[] = [
    {
      key: "at",
      label: "When (UTC)",
      render: (r) => <time dateTime={isoOf(r.at)}>{formatAsOf(r.at)}</time>,
    },
    { key: "kind", label: "Kind", render: (r) => <Flag kind={r.kind} label={r.kindLabel} size="sm" /> },
    {
      key: "target",
      label: "Target",
      render: (r) => (r.href ? <a className="exec-blk-link" href={r.href}>{r.target}</a> : r.target),
    },
    { key: "outcome", label: "Outcome", render: (r) => r.outcome },
  ];
  if (withActor) {
    base.push({ key: "actor", label: "Actor", render: (r) => r.actor ?? "Not available" });
    base.push({ key: "receipt", label: "Receipt", render: (r) => r.receipt ?? "Not available" });
  }
  return base;
}

function LoadMore({ cursor }: { cursor: EventFeedCursor }): ReactNode {
  if (!cursor.hasMore && !cursor.error) return null;
  return (
    <div className="exec-blk-feed-more">
      {cursor.error ? (
        <p className="exec-blk-feed-error" role="alert">
          Could not load more events. {cursor.error}
        </p>
      ) : null}
      {cursor.hasMore ? (
        <button
          type="button"
          className="exec-blk-btn"
          aria-busy={cursor.loadingMore ? "true" : undefined}
          onClick={() => {
            if (!cursor.loadingMore) cursor.onLoadMore();
          }}
        >
          {cursor.loadingMore ? "Loading more" : cursor.error ? "Try again" : "Load more"}
        </button>
      ) : null}
    </div>
  );
}

/** The feed. */
export function EventFeed({
  scope,
  rows,
  status = "ok",
  reason,
  notPublished,
  cursor,
  title = "Events",
  bare = false,
  showActor,
}: EventFeedProps) {
  const body = notPublished ? (
    <p className="exec-blk-feed-np">
      <NotPublished id={notPublished}>The event feed for {scope} has no source yet.</NotPublished>
    </p>
  ) : (
    <FeedBody scope={scope} rows={rows} status={status} reason={reason} cursor={cursor} showActor={showActor} />
  );
  if (bare) return <div className="exec-blk-feed">{body}</div>;
  return (
    <SectionPanel title={title} aside={scope} flush>
      <div className="exec-blk-feed">{body}</div>
    </SectionPanel>
  );
}

function FeedBody({
  scope,
  rows,
  status,
  reason,
  cursor,
  showActor,
}: Pick<EventFeedProps, "scope" | "rows" | "reason" | "cursor" | "showActor"> & { status: PanelStatus }) {
  const effective: PanelStatus = status === "ok" && rows.length === 0 ? "empty" : status;
  const table = (
    <>
      <CardsTable
        columns={columns(showActor ?? rows.some((r) => r.actor != null || r.receipt != null))}
        rows={rows}
        rowKey={(r) => r.id}
        label={`Events for ${scope}`}
      />
      {cursor ? <LoadMore cursor={cursor} /> : null}
    </>
  );
  return (
    <PanelGate status={effective} reason={effective === "empty" ? (reason ?? `No events recorded for ${scope}.`) : reason}>
      {table}
    </PanelGate>
  );
}
