/**
 * Queue pane of the Approvals cockpit.
 *
 * Lane chips narrow server-side (the parent re-reads with the lane's view);
 * lenses narrow the loaded page on published fields only. The list is capped
 * at `MAX_QUEUE_DOM` rows and the footer says how many are shown of how many,
 * so a long queue never reads as a short one.
 */
import { useEffect, useRef } from "react";

import type { WaiverStateCode } from "../../../api/ports";
import { PanelSkeleton, PanelState } from "../../../components/states";
import type { PanelStatus } from "../../../contracts";
import type { DecidedRow } from "../../../screens/ApprovalInbox";
import { Flag } from "../../Flag";
import { WaiverFlag } from "./EvidenceFrame";
import type { InboxRowV2 } from "./inboxRowV2";
import {
  instantText,
  lapseView,
  isClosedRow,
  statusClassOf,
  isYours,
  KIND_TAG,
  kindOfGate,
  LANE_LABEL,
  LANES,
  LENS_LABEL,
  LENSES,
  FAMILY_LANES,
  quorumText,
  slaView,
  type FamilyLane,
  type Lane,
  type Lens,
  type Principal,
  type QueueItem,
} from "./laneModel";

/** DOM budget for the queue (S1 card: at most 150 nodes of rows). */
export const MAX_QUEUE_DOM = 150;

export const WAIVER_STATES = ["ALL", "OPEN", "EXPIRING", "WAIVED", "LAPSED"] as const satisfies readonly (WaiverStateCode | "ALL")[];
export type WaiverFilter = (typeof WAIVER_STATES)[number];
const WAIVER_STATE_LABEL: Readonly<Record<WaiverFilter, string>> = { ALL: "All", OPEN: "Open", EXPIRING: "Expiring", WAIVED: "Waived", LAPSED: "Lapsed" };

export interface QueueProps {
  lane: Lane;
  onLane(lane: Lane): void;
  /** A family panel (Archive, Reactivation, Capital) is open: no gate lane is pressed and the list gives way to its one line. */
  family?: FamilyLane | null;
  onFamily?(family: FamilyLane): void;
  lens: Lens;
  onLens(lens: Lens): void;
  waiverFilter: WaiverFilter;
  onWaiverFilter(filter: WaiverFilter): void;
  items: readonly QueueItem[];
  selectedKey: string | null;
  onSelect(key: string): void;
  loading: boolean;
  failure: { panel: Exclude<PanelStatus, "ok" | "loading">; reason: string } | null;
  /** Said when the page is real but some of it could not be read. */
  partialNote: string | null;
  /** Counts over the loaded page, not the queue. */
  lensCounts: Readonly<Record<Exclude<Lens, "closed">, number>> | null;
  /** Open requests per gate lane, counted over the last page the All lane loaded; `null` until that page has been read. */
  laneCounts?: Readonly<Record<Exclude<Lane, "waiver">, number>> | null;
  /** The All page had more rows than it loaded, so each lane count is an at-least number. */
  laneCountsAtLeast?: boolean;
  /** Opens the shortcut list (the `?` in the keys footer). */
  onHelp?: () => void;
  /** More pages exist, so the counts above are at-least numbers. */
  moreAvailable: boolean;
  onMore(): void;
  moreBusy: boolean;
  moreError: string | null;
  footer: string;
  principal: Principal;
  /** The `Closed` lens reads the decision history; this says it could not. */
  historyNote: string | null;
  /** The decisions made today (UTC) from that same history read; `note` is set when the read failed. Absent: no disclosure. */
  decidedToday?: { rows: readonly DecidedRow[]; note: string | null };
  /** The waiver register's own read time: the anchor of every lapse clock in the waiver lane. */
  waiverReadAt?: string | null;
}

function GateFlags({ row, principal }: { row: InboxRowV2; principal: Principal }) {
  const sla = slaView(row.sla);
  const required = row.quorumRequired;
  const met = row.quorumMet;
  const closed = isClosedRow(row);
  const unknownStatus = statusClassOf(row) === "unknown";
  return (
    <>
      {closed ? (
        <Flag kind="neutral" label={row.status ?? "Closed"} size="sm" />
      ) : unknownStatus ? (
        <Flag kind="unknown" label={`Status ${row.status}`} size="sm" />
      ) : sla?.overdue ? (
        <Flag kind="rejected" label="Overdue" size="sm" />
      ) : (
        <Flag kind="pending" label={met !== null && required !== null ? `Pending ${met}/${required}` : "Pending"} size="sm" />
      )}
      {row.gate === "LIVE_GATE" ? <Flag kind="paused" label="Live closed" size="sm" /> : null}
      {closed ? null : isYours(row, principal) ? (
        <Flag kind="na" label="Yours" size="sm" />
      ) : row.inert === "BLOCKED" || (row.blockerCount !== null && row.blockerCount > 0) ? (
        <Flag kind="incident" label="Blocker" size="sm" />
      ) : row.needsYou === true ? (
        <Flag kind="approval" label="Needs you" size="sm" />
      ) : row.inert === "QUORUM" ? (
        <Flag kind="neutral" label="Waiting on others" size="sm" />
      ) : null}
    </>
  );
}

function GateItem({ row, principal }: { row: InboxRowV2; principal: Principal }) {
  const sla = slaView(row.sla);
  // The subject id the request decides is printed as published; the row is a selectable button and the published row names no subject type, so no route is guessed for it.
  const context = [row.target, row.releaseCandidate, row.subjectId === null ? null : `subject ${row.subjectId}`].filter((part) => part !== null).join(" · ");
  return (
    <>
      <span className="exec-ck-qt">
        <span className="exec-ck-kd">{KIND_TAG[kindOfGate(row.gate)]}</span>
        <b>{row.subject}</b>
      </span>
      {context ? <span className="exec-ck-qm">{context}</span> : null}
      <span className="exec-ck-qf"><GateFlags row={row} principal={principal} /></span>
      {sla ? (
        <span className="exec-ck-sla" data-tone={sla.overdue ? "bad" : sla.dueSoon ? "warn" : undefined} role="img" aria-label={`SLA ${sla.phrase}, ${sla.detail}`}>
          <i style={{ width: `${sla.fill}%` }} />
        </span>
      ) : null}
      <span className="exec-ck-qm" title={sla?.detail}>
        {sla ? sla.phrase : "SLA not published"} · {quorumText(row.quorumMet, row.quorumRequired) ?? "approvers not published"}
      </span>
    </>
  );
}

function DecidedItem({ item }: { item: Extract<QueueItem, { kind: "decided" }> }) {
  const row = item.row;
  return (
    <>
      <span className="exec-ck-qt">
        <span className="exec-ck-kd">{KIND_TAG[kindOfGate(row.gate)]}</span>
        <b>{row.subject}</b>
      </span>
      <span className="exec-ck-qf"><Flag kind={row.outcome === "APPROVED" || row.outcome === "APPROVED_WITH_CONDITION" ? "applied" : "rejected"} label={row.outcome.replace(/_/g, " ").toLowerCase()} size="sm" /></span>
      <span className="exec-ck-qm">Decided by {row.decidedBy} · {instantText(row.decidedAt) ?? row.decidedAt}</span>
    </>
  );
}

function WaiverItem({ item, readAt }: { item: Extract<QueueItem, { kind: "waiver" }>; readAt: string | null }) {
  const row = item.row;
  const lapses = instantText(row.dueAt);
  const clock = lapseView(row.dueAt, readAt);
  return (
    <>
      <span className="exec-ck-qt">
        <span className="exec-ck-kd">WAIVER</span>
        <b>{row.label}</b>
      </span>
      <span className="exec-ck-qm">{row.subjectLabel} · {row.owner}</span>
      <span className="exec-ck-qf"><WaiverFlag state={row.state} /></span>
      {/* One short line in the 268px queue (hi-fi: "lapses in 1d 21h"); the exact instant is in the Condition panel. Without a read time to count from, the instant is all there is. */}
      <span className="exec-ck-qm" data-testid="ck-waiver-clock">
        {clock.kind === "none" ? clock.phrase : clock.kind === "unanchored" ? (lapses ? `Lapses ${lapses}` : "Lapse time not published") : `${clock.phrase[0]!.toUpperCase()}${clock.phrase.slice(1)}`}
      </span>
    </>
  );
}

/** "Decided today · N": the decisions of the history read whose UTC day is today, a disclosure under the list (hi-fi). */
function DecidedToday({ rows, note, onSelect, selectedKey }: { rows: readonly DecidedRow[]; note: string | null; onSelect(key: string): void; selectedKey: string | null }) {
  return (
    <details className="exec-ck-decided" data-testid="ck-decided-today">
      <summary>Decided today · {note !== null ? "not read" : rows.length}</summary>
      {note !== null ? (
        <p className="exec-ck-note exec-ck-pad">The history read failed, so today's decisions are not counted.</p>
      ) : rows.length === 0 ? (
        <p className="exec-ck-note exec-ck-pad">No decision was recorded today in the history read.</p>
      ) : (
        <ul className="exec-ck-list" aria-label="Decided today">
          {rows.map((row) => (
            <li key={row.id}>
              <button type="button" className="exec-ck-qi" data-kind="decided" aria-current={row.id === selectedKey ? "true" : undefined} onClick={() => onSelect(row.id)}>
                <DecidedItem item={{ kind: "decided", key: row.id, row }} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

export function Queue(props: QueueProps) {
  const {
    lane, onLane, family = null, onFamily, lens, onLens, waiverFilter, onWaiverFilter, items, selectedKey, onSelect, loading, failure, partialNote,
    lensCounts, laneCounts = null, laneCountsAtLeast = false, onHelp, moreAvailable, onMore, moreBusy, moreError, footer, principal, historyNote,
    decidedToday: decided, waiverReadAt = null,
  } = props;
  const shown = items.slice(0, MAX_QUEUE_DOM);
  const selected = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (typeof selected.current?.scrollIntoView === "function") selected.current.scrollIntoView({ block: "nearest" });
  }, [selectedKey]);
  const suffix = moreAvailable ? "+" : "";

  return (
    <section className="exec-ck-panel exec-ck-q" aria-label="Decision queue">
      <div className="exec-ck-ph">
        <h2 className="exec-ck-pt">Queue</h2>
        <span className="exec-ck-pr">{family !== null ? "Not an approval gate" : lane === "waiver" ? "By last update" : "By SLA"}</span>
      </div>

      <div className="exec-ck-lanes" role="group" aria-label="Lane">
        {LANES.map((id) => (
          <button key={id} type="button" className="exec-ck-chip" aria-pressed={family === null && lane === id} onClick={() => onLane(id)}>
            {LANE_LABEL[id]}
            {id !== "waiver" && laneCounts ? ` ${laneCounts[id]}${laneCountsAtLeast ? "+" : ""}` : ""}
          </button>
        ))}
        {FAMILY_LANES.map((entry) => (
          <button key={entry.id} type="button" className="exec-ck-chip" aria-pressed={family === entry.id} onClick={() => onFamily?.(entry.id)}>
            {entry.label}
          </button>
        ))}
      </div>

      {family !== null ? (
        <p className="exec-ck-note exec-ck-pad" role="status">No rows: the contract publishes no list for this family.</p>
      ) : lane === "waiver" ? (
        <div className="exec-ck-lanes" role="group" aria-label="Waiver state">
          {WAIVER_STATES.map((id) => (
            <button key={id} type="button" className="exec-ck-chip" aria-pressed={waiverFilter === id} onClick={() => onWaiverFilter(id)}>
              {WAIVER_STATE_LABEL[id]}
            </button>
          ))}
        </div>
      ) : (
        <div className="exec-ck-lanes" role="group" aria-label="Lens">
          {LENSES.map((id) => (
            <button key={id} type="button" className="exec-ck-chip" aria-pressed={lens === id} onClick={() => onLens(id)}>
              {LENS_LABEL[id]}
              {id !== "closed" && lensCounts ? ` ${lensCounts[id]}${suffix}` : ""}
            </button>
          ))}
        </div>
      )}

      {family !== null ? null : loading ? <PanelSkeleton label="Loading queue" /> : null}
      {family !== null ? null : failure ? <div className="exec-ck-pad"><PanelState status={failure.panel} reason={failure.reason} /></div> : null}
      {family !== null ? null : partialNote ? <p className="exec-ck-note exec-ck-pad" role="status">{partialNote}</p> : null}
      {family === null && lens === "closed" && lane !== "waiver" && historyNote ? <p className="exec-ck-note exec-ck-pad">{historyNote}</p> : null}

      {family === null && !loading && !failure && shown.length === 0 ? (
        <div className="exec-ck-pad"><PanelState status="empty" title="Nothing in this view" reason={lane === "waiver" ? "No waivers match this state on the page the server returned." : "No requests match this lane and lens on the page the server returned."} /></div>
      ) : null}

      {family !== null ? null : (
      <ul className="exec-ck-list" aria-label={lane === "waiver" ? "Waivers" : "Requests"}>
        {shown.map((item) => (
          <li key={`${item.kind}:${item.key}`}>
            <button
              type="button"
              className="exec-ck-qi"
              data-kind={item.kind}
              aria-current={item.key === selectedKey ? "true" : undefined}
              ref={item.key === selectedKey ? selected : undefined}
              onClick={() => onSelect(item.key)}
            >
              {item.kind === "gate" ? <GateItem row={item.row} principal={principal} /> : item.kind === "decided" ? <DecidedItem item={item} /> : <WaiverItem item={item} readAt={waiverReadAt} />}
            </button>
          </li>
        ))}
      </ul>
      )}

      {family === null && lane !== "waiver" && decided !== undefined ? <DecidedToday rows={decided.rows} note={decided.note} onSelect={onSelect} selectedKey={selectedKey} /> : null}

      <div className="exec-ck-foot" hidden={family !== null}>
        <span>{footer}{items.length > MAX_QUEUE_DOM ? ` · top ${MAX_QUEUE_DOM} of ${items.length} shown` : ""}</span>
        {moreAvailable ? (
          <button type="button" className="exec-ck-more" disabled={moreBusy} aria-describedby={moreBusy ? "exec-ck-more-busy" : undefined} onClick={onMore}>
            {moreBusy ? "Loading" : "Load more"}
          </button>
        ) : null}
        {moreBusy ? <span id="exec-ck-more-busy" className="exec-ck-note">Reading the next page</span> : null}
        {moreError ? <span className="exec-ck-note" role="status">{moreError}</span> : null}
      </div>

      <div className="exec-ck-keys">
        <span><kbd>J</kbd> <kbd>K</kbd> move</span>
        <span><kbd>Esc</kbd> clear</span>
        <span><kbd>A</kbd> approve</span>
        <span><kbd>R</kbd> deny</span>
        <span><kbd>N</kbd> note</span>
        {onHelp ? <button type="button" className="exec-ck-keys-help" onClick={onHelp}><kbd>?</kbd> help</button> : <span><kbd>?</kbd> help</span>}
      </div>
    </section>
  );
}
