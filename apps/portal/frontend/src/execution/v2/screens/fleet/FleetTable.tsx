/**
 * Fleet table (UXM-07 S1a): identity columns only, on the shared CardsTable so
 * it is a real table above 660px and stacked cards at or below it.
 *
 * Every empty cell is a statement. A missing owner is "Not available" (the
 * read published no owner), and no cell ever prints a dash or a made-up zero.
 * Readiness x/7 (FE-027, FE-028) and Compare (FE-033) are not columns: their
 * "Not published" reasons are stated once, above the table and in the drawer.
 */
import type { ReactNode } from "react";

import { JourneySpine, SPINE_STAGE_IDS, type SpineStageId } from "../../blocks";
import { CardsTable, type CardsColumn } from "../../cardsTable";
import { Flag } from "../../Flag";
import { notPublished, type FleetRow } from "./fleetModel";

import "../../css/fleet.css";

const MAX_REASONS = 2;

export function NotPublishedText({ fact }: { fact: { fe: string; what: string } }) {
  return <span className="exec-fleet-np">{notPublished(fact)}</span>;
}

function AlphaCell({ row }: { row: FleetRow }) {
  return (
    <span className="exec-fleet-alpha">
      <span className="exec-fleet-name">{row.label}</span>
      <span className="exec-fleet-version">{row.version}</span>
    </span>
  );
}

/** The published current stage as a spine id; Research (and any word the spine does not know) has no lifecycle node. */
export function spineStage(code: string): SpineStageId | null {
  const id = code.toLowerCase();
  return (SPINE_STAGE_IDS as readonly string[]).includes(id) ? (id as SpineStageId) : null;
}

/** Stage hue square, the stage word, and the six-node mini spine drawn from the current stage alone (no history is inferred). */
function StageCell({ row }: { row: FleetRow }) {
  const current = spineStage(row.stageCode);
  return (
    <span className="exec-fleet-stagecell">
      <span className="exec-fleet-stageline">
        <span className="exec-fleet-stage" data-stage={row.stageCode}>{row.stage}</span>
        {row.otherStages.length > 0 ? <span className="exec-fleet-also">also {row.otherStages.join(", ")}</span> : null}
      </span>
      {current ? <JourneySpine variant="mini" current={current} label={`${row.label} lifecycle`} /> : null}
    </span>
  );
}

function HealthCell({ row }: { row: FleetRow }) {
  const shown = row.attention.slice(0, MAX_REASONS);
  const hidden = row.attention.length - shown.length;
  return (
    <span className="exec-fleet-stagecell">
      <Flag kind={row.health.kind} label={row.health.label} size="sm" />
      {shown.length > 0 ? (
        <span className="exec-fleet-reasons" title={row.attention.map((r) => r.code).join(", ")}>
          {shown.map((r) => r.label).join(", ")}
          {hidden > 0 ? `, and ${hidden} more` : ""}
        </span>
      ) : null}
    </span>
  );
}

function DeploymentsCell({ row }: { row: FleetRow }) {
  const { count, worst } = row.deployments;
  if (count === 0) return <span className="exec-fleet-none">None deployed</span>;
  // The alpha's own health is the Health column; a deployment flag is only added when it says something else.
  const differs = worst !== null && (worst.kind !== row.health.kind || worst.label !== row.health.label);
  return (
    <span className="exec-fleet-deps">
      <span className="exec-fleet-count">{count === 1 ? "1 deployment" : `${count} deployments`}</span>
      {worst && differs ? <Flag kind={worst.kind} label={worst.label} size="sm" /> : null}
    </span>
  );
}

export interface FleetTableProps {
  rows: readonly FleetRow[];
  selectedKey?: string | null;
  onOpen(row: FleetRow): void;
  empty?: ReactNode;
}

export function FleetTable({ rows, selectedKey, onOpen, empty }: FleetTableProps) {
  const columns: readonly CardsColumn<FleetRow>[] = [
    { key: "alpha", label: "Alpha", render: (row) => <AlphaCell row={row} /> },
    { key: "owner", label: "Owner", render: (row) => row.owner },
    {
      key: "portfolios",
      label: "Portfolios",
      render: (row) => (row.portfolios.length > 0 ? row.portfolios.join(", ") : <span className="exec-fleet-none">None attached</span>),
    },
    { key: "stage", label: "Stage", render: (row) => <StageCell row={row} /> },
    { key: "health", label: "Health", render: (row) => <HealthCell row={row} /> },
    { key: "deployments", label: "Deployments", render: (row) => <DeploymentsCell row={row} /> },
  ];
  return (
    <CardsTable
      label="Alpha fleet"
      columns={columns}
      rows={rows}
      rowKey={(row) => row.key}
      selectedKey={selectedKey}
      onRowOpen={onOpen}
      empty={empty}
    />
  );
}
