/**
 * The Alpha Fleet table, scoped to one portfolio or one account (WP-3 of the 10 Nov UI adjustment plan).
 *
 * Inside Portfolio 360 and Account 360 an alpha list is the Fleet's list, filtered: the same Manager DATASET rows (alpha version in a
 * portfolio), the same `FleetDatasetTable` on the shared CardsTable, so every default column the Fleet renders today (and tomorrow) is
 * rendered here. This file hard-codes no column. The filter is the SERVER's: `surface: PORTFOLIO | ACCOUNT` with the resource id, the
 * routes the Manager OpenAPI publishes (`/manager/portfolios/{id}/overview`, `/manager/accounts/{id}/overview`). Nothing is narrowed on
 * the client, and a truncated page is never filtered by hand.
 *
 * One environment per read: `ALL` is the Fleet surface's fan-out only (FE-CAT-3), so a scoped list says which environment it reads and
 * the caller offers the environments the resource has a book in. No window is asked (the Fleet asks none), so PNL and Alloc are the
 * Fleet's own figures. Keyset "Load more", the DOM cap and the count line are the Fleet's words.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { ManagerDatasetQuery } from "../../../api/managerDatasetQuery";
import type { ExecutionApi } from "../../../api/ports";
import { PanelState } from "../../../components/states";
import type { ManagerEnvironment, ManagerRow, ManagerSortField } from "../../readers/managerDataset";
import { FleetDatasetTable } from "../fleet/FleetDatasetTable";
import { datasetCountLine } from "../fleet/fleetDatasetModel";
import { askableSorts, cycleSort, type SortKey } from "../fleet/fleetMetricsModel";
import { PAGE_LIMIT, ROW_CAP } from "../fleet/fleetModel";
import { useFleetDataset } from "../fleet/useFleetDataset";
import { useFleetSparks } from "../fleet/useFleetSparks";
import { servesDataset } from "../portfolios/PartitionFigures";

import "../../css/fleet.css";

export type ScopedFleetScope = { surface: "PORTFOLIO" | "ACCOUNT"; id: string };

export interface ScopedFleetTableProps {
  api: ExecutionApi;
  scope: ScopedFleetScope;
  /** The one environment this list reads; `null` when the resource names none (then the list says so and asks nothing). */
  environment: ManagerEnvironment | null;
  workspaceId?: string | null;
  /** Alpha 360 of the row's alpha, with the context the host screen carries. */
  hrefFor(row: ManagerRow): string;
  /** Said when the scope holds no row in this environment. */
  emptyText: ReactNode;
  /** Said when `environment` is `null`. */
  noEnvironmentText: ReactNode;
}

/** The query this list asks: the Fleet's page size, the server's scope, one environment, the reader's sort. */
export function scopedFleetQuery(scope: ScopedFleetScope, environment: ManagerEnvironment, workspaceId: string | null | undefined, sorts: readonly SortKey[], after?: string | null): ManagerDatasetQuery {
  const query: ManagerDatasetQuery = { surface: scope.surface, id: scope.id, environment, limit: PAGE_LIMIT };
  if (workspaceId) query.workspaceId = workspaceId;
  if (sorts.length > 0) query.sort = sorts.map((key) => ({ field: key.field, direction: key.dir }));
  if (after) query.after = after;
  return query;
}

export function ScopedFleetTable({ api, scope, environment, workspaceId, hrefFor, emptyText, noEnvironmentText }: ScopedFleetTableProps) {
  const serves = servesDataset(api);
  const enabled = serves && environment !== null;
  const [sorts, setSorts] = useState<readonly SortKey[]>([]);
  // The fields the dataset offers for sorting come with its first page; they are kept while a new sort re-reads, so a sort never turns itself off.
  const [offered, setOffered] = useState<readonly ManagerSortField[] | null>(null);
  const asked = useMemo(() => askableSorts(sorts, offered, false).sort, [sorts, offered]);
  const key = `${scope.surface}|${scope.id}|${environment}|${workspaceId ?? ""}|${JSON.stringify(asked)}`;
  const dataset = useFleetDataset(api, enabled, key, (after) => scopedFleetQuery(scope, environment as ManagerEnvironment, workspaceId, asked, after));
  useEffect(() => {
    if (dataset.first !== null) setOffered((current) => (current !== null && current.join() === dataset.first!.queryOptions.sortFields.join() ? current : dataset.first!.queryOptions.sortFields));
  }, [dataset.first]);
  // A new scope is a new question: the reader's sort belongs to the old one.
  useEffect(() => setSorts([]), [scope.surface, scope.id, environment]);

  const rows = useMemo(() => dataset.rows.slice(0, ROW_CAP), [dataset.rows]);
  const sparks = useFleetSparks(api, enabled, rows, environment ?? "paper", workspaceId ?? undefined, dataset.first === null ? null : dataset.first.lineage.revision);

  if (!serves) return <PanelState status="unavailable" reason="The Manager dataset is not part of this port, so the alpha list is not available." />;
  if (environment === null) return <p className="exec-fleet-note" data-testid="scoped-fleet-gap">{noEnvironmentText}</p>;
  if (dataset.state.phase === "idle" || dataset.state.phase === "loading") return <PanelState status="loading" />;
  if (dataset.state.phase === "error") return <PanelState status={dataset.state.status} reason={dataset.state.reason} />;

  const capped = dataset.rows.length >= ROW_CAP;
  const count = datasetCountLine(rows.length, dataset.rows.length, dataset.total, dataset.nextCursor !== null, capped);
  const empty = <p className="exec-fleet-note">{emptyText}</p>;
  return (
    <>
      {rows.length === 0 ? empty : (
        <>
        <p className="exec-fleet-scrollhint" data-testid="scroll-hint">More columns sit to the right when the table is wider than the page: scroll it sideways (the Alpha column stays).</p>
        <FleetDatasetTable
          rows={rows}
          offeredSorts={offered}
          basisPinned={false}
          sorts={asked}
          onSort={(field) => setSorts(cycleSort(asked, field))}
          sparks={sparks}
          datasetEnvironment={environment}
          metricKeys={dataset.first === null ? null : dataset.first.queryOptions.metricKeys}
          hrefFor={hrefFor}
          empty={empty}
        />
        </>
      )}
      <div className="exec-fleet-foot">
        {count === null ? null : <span className="exec-fleet-count-line" role="status" aria-live="polite">{count}</span>}
        {dataset.nextCursor && !capped ? (
          <button type="button" className="exec-fleet-btn" disabled={dataset.loadingMore} title={dataset.loadingMore ? "Loading the next page" : "Load the next page"} onClick={dataset.loadMore}>
            {dataset.loadingMore ? "Loading" : "Load more"}
          </button>
        ) : null}
        {dataset.nextCursor && capped ? <span className="exec-fleet-note">Showing the first {ROW_CAP} rows.</span> : null}
      </div>
      {dataset.moreError ? <p className="exec-fleet-note" role="alert">The next page could not be read ({dataset.moreError}). The rows above are unchanged.</p> : null}
    </>
  );
}
