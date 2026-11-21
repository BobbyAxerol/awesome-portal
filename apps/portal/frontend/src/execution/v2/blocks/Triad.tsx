/**
 * Triad (hi-fi modules/triad.js): Internal, Broker and Difference side by side,
 * for Sandbox, Live and Account 360.
 *
 * The triad never computes. The Difference column prints what the source
 * published for the difference, including when the source says it is not
 * computed (a shared-binding balance has no per-alpha broker figure to subtract
 * from). Tone follows a published sign only, only in the Difference column, and
 * never on a partial value. A side that is absent prints `Not available` in
 * every row, so a missing broker report cannot look like a zero difference.
 *
 * `suppressed` (Live mismatch, S3): while Internal and Broker disagree the Broker and
 * Difference columns are not drawn at all (hi-fi policy: hide, not grey). They print
 * "Hidden while the figures disagree." in place of the rows, which is a different claim
 * from `Not available` (nothing was reported): here the figures exist and are withheld.
 * No broker row, value or as-of reaches the DOM, so a mismatch cannot leak the number.
 */
import { createElement, type ReactNode } from "react";

import type { Metric } from "../boundary";
import type { UtcEpochMs } from "../../screenDataContract";
import { MetricText, NO_VALUE_COPY } from "./metric";
import { GapWhy, NotPublished, type NotPublishedId } from "./notPublished";
import "../css/blocks.css";
import { formatInstant } from "../boundary";

/** The source says the figure is deliberately not computed, and why. */
export interface TriadNotComputed {
  kind: "not-computed";
  /** Why, in words or as the published code ("SHARED_BINDING"). */
  reason: string;
}

/** The server said it does not publish this figure (`Fact.availability: NOT_PUBLISHED`); the reason code rides in the tooltip. */
export interface TriadNotPublished {
  kind: "not-published";
  id: NotPublishedId;
  reasonCode?: string | null;
}

/**
 * One cell: a boundary `Metric`, a `TriadNotComputed`, a `TriadNotPublished`, `null` for a malformed
 * payload, or `undefined` for nothing provided.
 */
export type TriadCell = Metric | TriadNotComputed | TriadNotPublished | null | undefined;

export interface TriadRow {
  /** Stable key of the row (`cash`, `position`). Same row in all three columns. */
  key: string;
  /** Row label ("Cash balance"). */
  label: string;
  /** Unit word after the number ("USDT"). */
  suffix?: string;
  /** Virtual ledger value. */
  internal?: TriadCell;
  /** Venue report value. */
  broker?: TriadCell;
  /** Published difference. */
  difference?: TriadCell;
}

export interface TriadSide {
  /** When the side was read, UTC epoch ms. Absent prints `Not available`. */
  asOf?: UtcEpochMs | null;
}

export interface TriadProps {
  /** Rows, aligned across the three columns. */
  rows: readonly TriadRow[];
  /** Internal side meta. `null` = the side itself is not available. */
  internal?: TriadSide | null;
  /** Broker side meta. `null` = the side itself is not available. */
  broker?: TriadSide | null;
  /** Caption under Difference ("matching scopes only"). Defaults to that sentence. */
  differenceNote?: ReactNode;
  /** Accessible name of the group; default "Reconciliation". */
  label?: string;
  /**
   * The figures disagree and policy withholds the Broker and Difference columns. Their rows, values and
   * as-of are not rendered; the columns say "Hidden while the figures disagree". Internal is unaffected.
   * The caller maps its fail-closed reading to this flag: Live passes `suppressed` unless the server published
   * `broker_values_visible` as exactly true.
   */
  suppressed?: boolean;
  /** Heading level of the three column titles (default 3, under a panel's h2); a triad that follows the h1 directly passes 2. */
  titleLevel?: 2 | 3;
}

/** The sentence of the hi-fi triad when its columns are withheld (the column adds the full stop). */
export const TRIAD_SUPPRESSED_COPY = "Hidden while the figures disagree";

type Column = "internal" | "broker" | "difference";

const COLUMNS: readonly { id: Column; title: string }[] = [
  { id: "internal", title: "Internal" },
  { id: "broker", title: "Broker" },
  { id: "difference", title: "Difference" },
];

function isNotComputed(cell: TriadCell): cell is TriadNotComputed {
  return typeof cell === "object" && cell !== null && cell.kind === "not-computed";
}

function isNotPublished(cell: TriadCell): cell is TriadNotPublished {
  return typeof cell === "object" && cell !== null && cell.kind === "not-published";
}

function CellView({ cell, suffix, signed, sideMissing }: { cell: TriadCell; suffix?: string; signed: boolean; sideMissing: boolean }) {
  if (sideMissing) return <span className="exec-blk-na">{NO_VALUE_COPY}</span>;
  // The reason is said once under the block ("Shared binding: the balance difference is not computed"); per cell it is the tooltip and hidden text, not a repeated code.
  if (isNotComputed(cell)) {
    return (
      <span className="exec-blk-na" data-state="not-computed">
        <GapWhy className="exec-blk-na" text="Not computed" name="Not computed, reason" rows={[cell.reason]} next={null} />
      </span>
    );
  }
  if (isNotPublished(cell)) return <NotPublished id={cell.id} titleReason={cell.reasonCode} compact />;
  return <MetricText metric={cell} suffix={suffix} signed={signed} />;
}

function sub(column: Column, side: TriadSide | null | undefined, differenceNote: ReactNode, withheld: boolean): ReactNode {
  if (column === "difference") return differenceNote;
  const lead = column === "internal" ? "Virtual ledger" : "Venue report";
  if (withheld) return lead;
  const when = side === null || side === undefined || side.asOf === null || side.asOf === undefined ? NO_VALUE_COPY : formatInstant(side.asOf);
  return `${lead} · ${when}`;
}

/** The three-column reconciliation block. */
export function Triad({ rows, internal, broker, differenceNote = "Derived · matching scopes only", label = "Reconciliation", suppressed = false, titleLevel = 3 }: TriadProps) {
  const sides: Record<Column, TriadSide | null | undefined> = { internal, broker, difference: undefined };
  return (
    <div className="exec-blk-triad" role="group" aria-label={label}>
      {COLUMNS.map(({ id, title }) => {
        const side = sides[id];
        const sideMissing = id !== "difference" && side === null;
        const withheld = suppressed && id !== "internal";
        return (
          <section key={id} className="exec-blk-triad-col" data-col={id} data-state={withheld ? "suppressed" : undefined} aria-label={title}>
            {createElement(`h${titleLevel}`, { className: "exec-blk-triad-title" }, title)}
            <p className="exec-blk-triad-sub">{sub(id, side, differenceNote, withheld)}</p>
            {withheld ? (
              <p className="exec-blk-na" data-state="suppressed">{TRIAD_SUPPRESSED_COPY}.</p>
            ) : (
              <dl className="exec-blk-triad-rows">
                {rows.map((row) => (
                  <div key={row.key} className="exec-blk-triad-row">
                    <dt>{row.label}</dt>
                    <dd>
                      <CellView cell={row[id]} suffix={row.suffix} signed={id === "difference"} sideMissing={sideMissing} />
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        );
      })}
    </div>
  );
}
