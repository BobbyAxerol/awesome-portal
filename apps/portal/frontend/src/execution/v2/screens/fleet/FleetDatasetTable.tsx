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

import { CardsTable, type CardsColumn } from "../../cardsTable";
import { JourneySpine, NaWhy } from "../../blocks";
import { Flag } from "../../Flag";
import type { ManagerRow } from "../../readers/managerDataset";
import { healthView, humanize } from "./fleetModel";
import { inStageOf, lifecycleFlagOf, stageViewOf } from "./fleetDatasetModel";
import { spineStage } from "./FleetTable";

import "../../css/fleet.css";
import { formatInstant } from "../../boundary";

function StageCell({ row }: { row: ManagerRow }) {
  const view = stageViewOf(row);
  if (view.kind === "single") {
    // The six-node mini spine is drawn from the published current stage alone: no history is inferred (guide section 4, JourneySpine).
    const current = view.code === null ? null : spineStage(view.code);
    return (
      <span className="exec-fleet-stagecell">
        <span className="exec-fleet-stageline">
          <span className="exec-fleet-stage" data-stage={view.code ?? undefined}>{view.label}</span>
        </span>
        {current ? <JourneySpine variant="mini" current={current} label={`${row.name ?? row.alphaId} lifecycle`} /> : null}
      </span>
    );
  }
  if (view.kind === "unpublished") {
    return <NaWhy className="exec-fleet-np" text={view.label} reason={view.reason} />;
  }
  return (
    <span className="exec-fleet-stagecell">
      <span className="exec-fleet-stageline">
        <NaWhy className="exec-fleet-none" text={view.label} reason={view.reason} />
        {view.presence.length > 0 ? <span className="exec-fleet-also">in {view.presence.join(", ")}</span> : null}
      </span>
    </span>
  );
}

function InStageCell({ row }: { row: ManagerRow }) {
  const view = inStageOf(row, formatInstant);
  return view.published
    ? <span title={view.detail}>{view.text}</span>
    : <NaWhy className="exec-fleet-np" text={view.text} reason={view.detail} />;
}

export interface FleetDatasetTableProps {
  rows: readonly ManagerRow[];
  /** The Alpha 360 of the row's alpha, with the context the Fleet carries. */
  hrefFor(row: ManagerRow): string;
  empty?: ReactNode;
  /** The row's `sel` value when its peek is open. */
  selectedKey?: string | null;
  /** A click or Enter on the row opens the peek; the name stays a link to the alpha. */
  onOpen?(row: ManagerRow): void;
}

export function FleetDatasetTable({ rows, hrefFor, empty, selectedKey, onOpen }: FleetDatasetTableProps) {
  const columns: readonly CardsColumn<ManagerRow>[] = [
    {
      key: "alpha",
      label: "Alpha",
      render: (row) => (
        <span className="exec-fleet-alpha">
          <Link className="exec-fleet-name" to={hrefFor(row)} onClick={(event) => event.stopPropagation()}>{row.name ?? row.alphaId}</Link>
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
        const view = row.health === null ? null : healthView(row.health);
        const lifecycle = lifecycleFlagOf(row.lifecycle);
        if (view === null && lifecycle === null) return null;
        return (
          <span className="exec-fleet-stagecell">
            {view ? <Flag kind={view.kind} label={view.label} size="sm" /> : null}
            {lifecycle ? <Flag kind={lifecycle.kind} label={lifecycle.label} size="sm" /> : null}
          </span>
        );
      },
    },
    { key: "source", label: "Source", render: (row) => (row.sourceState === null ? null : humanize(row.sourceState)) },
  ];
  return <CardsTable label="Alpha fleet" columns={columns} rows={rows} rowKey={(row) => row.rowKey} selectedKey={selectedKey} onRowOpen={onOpen} empty={empty} />;
}
