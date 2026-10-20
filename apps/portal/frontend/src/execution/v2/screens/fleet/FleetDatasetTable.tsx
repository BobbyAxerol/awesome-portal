/**
 * Fleet rows read from the Manager DATASET (FE-012 / FE-027), on the shared CardsTable.
 *
 * One row is an alpha version in one portfolio, as the dataset publishes it (the legacy table is one row per alpha). The
 * columns are identity plus the stage lifecycle and nothing financial: money lives in per-currency partitions and this screen
 * prints none. Every absence is a statement: no owner is "Not available"; no single stage names why; days in stage is
 * `Not published (FE-027)` with the typed reason on its title, never a dash and never 0.
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { utcStamp } from "../../../time";
import { CardsTable, type CardsColumn } from "../../cardsTable";
import { Flag } from "../../Flag";
import type { ManagerRow } from "../../readers/managerDataset";
import { healthView, humanize } from "./fleetModel";
import { inStageOf, stageViewOf } from "./fleetDatasetModel";

import "../../css/fleet.css";

function StageCell({ row }: { row: ManagerRow }) {
  const view = stageViewOf(row);
  if (view.kind === "single") {
    return <span className="exec-fleet-stage" data-stage={view.code ?? undefined}>{view.label}</span>;
  }
  if (view.kind === "unpublished") {
    return <span className="exec-fleet-np" title={view.reason ?? undefined}>{view.label}</span>;
  }
  return (
    <span className="exec-fleet-stagecell">
      <span className="exec-fleet-stageline">
        <span className="exec-fleet-none" title={view.reason ?? undefined}>{view.label}</span>
        {view.presence.length > 0 ? <span className="exec-fleet-also">in {view.presence.join(", ")}</span> : null}
      </span>
    </span>
  );
}

function InStageCell({ row }: { row: ManagerRow }) {
  const view = inStageOf(row, utcStamp);
  return view.published
    ? <span title={view.detail}>{view.text}</span>
    : <span className="exec-fleet-np" title={view.detail}>{view.text}</span>;
}

export interface FleetDatasetTableProps {
  rows: readonly ManagerRow[];
  /** The Alpha 360 of the row's alpha, with the context the Fleet carries. */
  hrefFor(row: ManagerRow): string;
  empty?: ReactNode;
}

export function FleetDatasetTable({ rows, hrefFor, empty }: FleetDatasetTableProps) {
  const columns: readonly CardsColumn<ManagerRow>[] = [
    {
      key: "alpha",
      label: "Alpha",
      render: (row) => (
        <span className="exec-fleet-alpha">
          <Link className="exec-fleet-name" to={hrefFor(row)}>{row.name ?? row.alphaId}</Link>
          <span className="exec-fleet-version">{row.alphaVersionId}</span>
        </span>
      ),
    },
    { key: "owner", label: "Owner", render: (row) => row.ownerUserId },
    { key: "portfolio", label: "Portfolio", render: (row) => row.portfolioId },
    { key: "stage", label: "Current stage", render: (row) => <StageCell row={row} /> },
    { key: "in-stage", label: "In stage", render: (row) => <InStageCell row={row} /> },
    {
      key: "health",
      label: "Health",
      render: (row) => {
        if (row.health === null) return null;
        const view = healthView(row.health);
        return <Flag kind={view.kind} label={view.label} size="sm" />;
      },
    },
    { key: "source", label: "Source", render: (row) => (row.sourceState === null ? null : humanize(row.sourceState)) },
  ];
  return <CardsTable label="Alpha fleet" columns={columns} rows={rows} rowKey={(row) => row.rowKey} empty={empty} />;
}
