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
  BOARD_READINESS, COUNT_NOT_AVAILABLE, boardColumns, notPublished,
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

/** `sharedGap`: every card in the lane carries the same readiness gap, so the lane header states it once (the card omits it). */
function Card({ row, selected, href, onOpen, sharedGap }: { row: FleetRow; selected: boolean; href: string; onOpen(row: FleetRow): void; sharedGap: boolean }) {
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
      {sharedGap ? null : <span className="exec-fleet-np exec-fleet-card-ready">Readiness: {notPublished(BOARD_READINESS)}</span>}
    </li>
  );
}

function Column({ column, headingId, selectedKey, hrefFor, onOpen }: {
  column: BoardColumn; headingId: string; selectedKey?: string | null; hrefFor(row: FleetRow): string; onOpen(row: FleetRow): void;
}) {
  const n = column.rows.length;
  const gateWords = `No alpha is placed here: the fleet read does not publish a gate position (${BOARD_READINESS.fe}).`;
  // A gate lane with nothing in it and no count the summary states is a slim labelled strip, not a 220px empty box. The
  // words stay in the DOM for assistive tech and in the tooltip; nothing is counted that was not published.
  if (column.gate && n === 0 && column.published === COUNT_NOT_AVAILABLE) {
    return (
      <section className="exec-fleet-lane" data-stage={column.code} data-collapsed="true" aria-labelledby={headingId} title={gateWords}>
        <header className="exec-fleet-lane-head">
          <h3 id={headingId} className="exec-fleet-lane-title">{column.label}</h3>
          <span className="exec-fleet-sr">{n} loaded</span>
          <span className="exec-fleet-sr">In your scope: {column.published}</span>
        </header>
        <p className="exec-fleet-lane-strip">
          <span className="exec-fleet-sr">{gateWords}</span>
          <span aria-hidden="true">Not available</span>
        </p>
      </section>
    );
  }
  // Today the fleet read publishes no readiness for any alpha, so every card in a lane carries the same gap: it is
  // stated once at the lane head, never dropped.
  const sharedGap = n > 0;
  return (
    <section className="exec-fleet-lane" data-stage={column.code} aria-labelledby={headingId}>
      <header className="exec-fleet-lane-head">
        <h3 id={headingId} className="exec-fleet-lane-title">{column.label}</h3>
        <span className="exec-fleet-lane-count">{n} loaded</span>
        <span className="exec-fleet-lane-pub" title="Counted over your whole scope, not only the loaded alphas">In your scope: {column.published}</span>
        {/* Readiness is named once on the toolbar line ("Not available: ... Readiness"); here it stays for assistive tech only. */}
        {sharedGap ? (
          <span className="exec-fleet-sr exec-fleet-lane-gap">Readiness: {notPublished(BOARD_READINESS)} for every alpha here</span>
        ) : null}
      </header>
      {n === 0 ? (
        <p className="exec-fleet-lane-empty">
          {column.gate ? gateWords : "No loaded alpha is in this stage."}
        </p>
      ) : (
        <ul className="exec-fleet-lane-cards" aria-label={`${column.label}, ${n} loaded`}>
          {column.rows.map((row) => (
            <Card key={row.key} row={row} selected={row.key === selectedKey} href={hrefFor(row)} onOpen={onOpen} sharedGap={sharedGap} />
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
