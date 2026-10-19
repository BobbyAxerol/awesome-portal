/**
 * Fleet board (UXM-07 S1a, hi-fi modules/board.js): the same loaded rows as the
 * table, one column per lifecycle stage in spine order.
 *
 * What it is: a different arrangement of rows the page already read. It makes
 * no request of its own, uses the table's filters, keyset "Load more" and 200
 * row cap, and says it shows loaded rows only.
 *
 * What it will not do: derive. Readiness x/7 and days in stage are not in the
 * fleet read (FE-027), so each card says so; the mini spine marks only the
 * current stage; R1 and R2 are gates the read does not place anyone in, so
 * those columns can only be empty and say why. A stage count is printed only
 * when the summary states it.
 *
 * A card is a link (href = the alpha's Alpha 360 with the page's context). A
 * plain click opens the same peek the table row opens; a modified click or
 * "open in new tab" follows the href.
 */
import type { MouseEvent } from "react";
import { Link } from "react-router-dom";

import { JourneySpine } from "../../blocks";
import { Flag } from "../../Flag";
import {
  BOARD_READINESS, boardColumns, notPublished,
  type BoardColumn, type FleetRow,
} from "./fleetModel";
import { spineStage } from "./FleetTable";
import type { AlphaFleetSummary } from "../../../api/profileRead";

import "../../css/fleet.css";

const MAX_REASONS = 2;

export interface FleetBoardProps {
  rows: readonly FleetRow[];
  summary: AlphaFleetSummary | null;
  selectedKey?: string | null;
  /** Where a card's link goes: the alpha's page, with the page's context. */
  hrefFor(row: FleetRow): string;
  onOpen(row: FleetRow): void;
}

function Card({ row, selected, href, onOpen }: { row: FleetRow; selected: boolean; href: string; onOpen(row: FleetRow): void }) {
  const current = spineStage(row.stageCode);
  const shown = row.attention.slice(0, MAX_REASONS);
  const hidden = row.attention.length - shown.length;
  const click = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onOpen(row);
  };
  return (
    <li className="exec-fleet-card" data-selected={selected ? "true" : undefined} aria-current={selected ? "true" : undefined}>
      <Link className="exec-fleet-card-link" to={href} onClick={click}>
        <span className="exec-fleet-name">{row.label}</span>{" "}
        <span className="exec-fleet-version">{row.version}</span>
      </Link>
      <span className="exec-fleet-card-owner">
        {row.owner ? `Owner ${row.owner}` : <span className="exec-fleet-none">Owner Not available</span>}
      </span>
      {row.otherStages.length > 0 ? <span className="exec-fleet-also">also {row.otherStages.join(", ")}</span> : null}
      <span className="exec-fleet-card-health">
        <Flag kind={row.health.kind} label={row.health.label} size="sm" />
        {shown.length > 0 ? (
          <span className="exec-fleet-reasons" title={row.attention.map((r) => r.code).join(", ")}>
            {shown.map((r) => r.label).join(", ")}
            {hidden > 0 ? `, and ${hidden} more` : ""}
          </span>
        ) : null}
      </span>
      {current ? <JourneySpine variant="mini" current={current} label={`${row.label} lifecycle`} /> : null}
      <span className="exec-fleet-np exec-fleet-card-ready">Readiness: {notPublished(BOARD_READINESS)}</span>
    </li>
  );
}

function Column({ column, headingId, selectedKey, hrefFor, onOpen }: {
  column: BoardColumn; headingId: string; selectedKey?: string | null; hrefFor(row: FleetRow): string; onOpen(row: FleetRow): void;
}) {
  const n = column.rows.length;
  return (
    <section className="exec-fleet-lane" data-stage={column.code} aria-labelledby={headingId}>
      <header className="exec-fleet-lane-head">
        <h3 id={headingId} className="exec-fleet-lane-title">{column.label}</h3>
        <span className="exec-fleet-lane-count">{n} loaded</span>
        <span className="exec-fleet-lane-pub">In your scope: {column.published}</span>
      </header>
      {n === 0 ? (
        <p className="exec-fleet-lane-empty">
          {column.gate ? `No alpha is placed here: the fleet read does not publish a gate position (${BOARD_READINESS.fe}).` : "No loaded alpha is in this stage."}
        </p>
      ) : (
        <ul className="exec-fleet-lane-cards" aria-label={`${column.label}, ${n} loaded`}>
          {column.rows.map((row) => (
            <Card key={row.key} row={row} selected={row.key === selectedKey} href={hrefFor(row)} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function FleetBoard({ rows, summary, selectedKey, hrefFor, onOpen }: FleetBoardProps) {
  const columns = boardColumns(rows, summary);
  return (
    <div className="exec-fleet-board" role="group" aria-label="Alpha fleet board">
      {columns.map((column) => (
        <Column
          key={column.code}
          column={column}
          headingId={`exec-fleet-lane-${column.code.toLowerCase()}`}
          selectedKey={selectedKey}
          hrefFor={hrefFor}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}
