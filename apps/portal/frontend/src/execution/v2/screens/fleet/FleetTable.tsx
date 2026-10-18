/**
 * Fleet table (UXM-07 S1a): identity columns only, on the shared CardsTable so
 * it is a real table above 660px and stacked cards at or below it.
 *
 * Every empty cell is a statement. A missing owner is "Not available" (the
 * read published no owner), the readiness x/7 is "Not published (FE-027,
 * FE-028)", and no cell ever prints a dash or a made-up zero.
 */
import { useId, type ReactNode } from "react";

import { CardsTable, type CardsColumn } from "../../cardsTable";
import { Flag } from "../../Flag";
import { FE, notPublished, type FleetRow } from "./fleetModel";

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

function StageCell({ row }: { row: FleetRow }) {
  const shown = row.attention.slice(0, MAX_REASONS);
  const hidden = row.attention.length - shown.length;
  return (
    <span className="exec-fleet-stagecell">
      <span className="exec-fleet-stageline">
        <span className="exec-fleet-stage" data-stage={row.stageCode}>{row.stage}</span>
        {row.otherStages.length > 0 ? <span className="exec-fleet-also">also {row.otherStages.join(", ")}</span> : null}
      </span>
      <span className="exec-fleet-stageline">
        <Flag kind={row.health.kind} label={row.health.label} size="sm" />
      </span>
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
  return (
    <span className="exec-fleet-deps">
      <span className="exec-fleet-count">{count === 1 ? "1 deployment" : `${count} deployments`}</span>
      {worst ? <Flag kind={worst.kind} label={worst.label} size="sm" /> : null}
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
  const reasonId = useId();
  const compare = notPublished(FE.compare);
  const columns: readonly CardsColumn<FleetRow>[] = [
    { key: "alpha", label: "Alpha", render: (row) => <AlphaCell row={row} /> },
    { key: "owner", label: "Owner", render: (row) => row.owner },
    {
      key: "portfolios",
      label: "Portfolios",
      render: (row) => (row.portfolios.length > 0 ? row.portfolios.join(", ") : <span className="exec-fleet-none">None attached</span>),
    },
    { key: "stage", label: "Stage", render: (row) => <StageCell row={row} /> },
    { key: "deployments", label: "Deployments", render: (row) => <DeploymentsCell row={row} /> },
    { key: "readiness", label: "Readiness", render: () => <NotPublishedText fact={FE.readiness} /> },
    {
      key: "actions",
      label: "Actions",
      render: (row) => (
        <button
          type="button"
          className="exec-fleet-btn"
          disabled
          title={compare}
          aria-describedby={reasonId}
          aria-label={`Compare ${row.label}`}
        >
          Compare
        </button>
      ),
    },
  ];
  return (
    <>
      <CardsTable
        label="Alpha fleet"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.key}
        selectedKey={selectedKey}
        onRowOpen={onOpen}
        empty={empty}
      />
      <p id={reasonId} className="exec-fleet-sr">Compare: {compare}</p>
    </>
  );
}
