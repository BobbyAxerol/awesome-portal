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
 */
import type { ReactNode } from "react";

import type { Metric } from "../boundary";
import { formatAsOf } from "../boundary";
import type { UtcEpochMs } from "../../screenDataContract";
import { MetricText, NO_VALUE_COPY } from "./metric";
import "../css/blocks.css";

/** The source says the figure is deliberately not computed, and why. */
export interface TriadNotComputed {
  kind: "not-computed";
  /** Why, in words or as the published code ("SHARED_BINDING"). */
  reason: string;
}

/**
 * One cell: a boundary `Metric`, a `TriadNotComputed`, `null` for a malformed
 * payload, or `undefined` for nothing provided.
 */
export type TriadCell = Metric | TriadNotComputed | null | undefined;

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
}

type Column = "internal" | "broker" | "difference";

const COLUMNS: readonly { id: Column; title: string }[] = [
  { id: "internal", title: "Internal" },
  { id: "broker", title: "Broker" },
  { id: "difference", title: "Difference" },
];

function isNotComputed(cell: TriadCell): cell is TriadNotComputed {
  return typeof cell === "object" && cell !== null && cell.kind === "not-computed";
}

function CellView({ cell, suffix, signed, sideMissing }: { cell: TriadCell; suffix?: string; signed: boolean; sideMissing: boolean }) {
  if (sideMissing) return <span className="exec-blk-na">{NO_VALUE_COPY}</span>;
  if (isNotComputed(cell)) return <span className="exec-blk-na" data-state="not-computed">Not computed · {cell.reason}</span>;
  return <MetricText metric={cell} suffix={suffix} signed={signed} />;
}

function sub(column: Column, side: TriadSide | null | undefined, differenceNote: ReactNode): ReactNode {
  if (column === "difference") return differenceNote;
  const lead = column === "internal" ? "Virtual ledger" : "Venue report";
  const when = side === null || side === undefined || side.asOf === null || side.asOf === undefined ? NO_VALUE_COPY : formatAsOf(side.asOf);
  return `${lead} · ${when}`;
}

/** The three-column reconciliation block. */
export function Triad({ rows, internal, broker, differenceNote = "Derived · matching scopes only", label = "Reconciliation" }: TriadProps) {
  const sides: Record<Column, TriadSide | null | undefined> = { internal, broker, difference: undefined };
  return (
    <div className="exec-blk-triad" role="group" aria-label={label}>
      {COLUMNS.map(({ id, title }) => {
        const side = sides[id];
        const sideMissing = id !== "difference" && side === null;
        return (
          <section key={id} className="exec-blk-triad-col" data-col={id} aria-label={title}>
            <h3 className="exec-blk-triad-title">{title}</h3>
            <p className="exec-blk-triad-sub">{sub(id, side, differenceNote)}</p>
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
          </section>
        );
      })}
    </div>
  );
}
