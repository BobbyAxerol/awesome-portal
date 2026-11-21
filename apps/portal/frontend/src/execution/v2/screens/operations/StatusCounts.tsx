/**
 * Counts by status (FE-043): four tiles, one per dimension, every figure the
 * server's.
 *
 * The server counts inside the same snapshot as the page, over the whole
 * authorized scope and every filter EXCEPT the dimension's own, so the tile for
 * an active filter still shows its siblings. Nothing here adds, subtracts or
 * re-counts: a bucket and a `total` are printed as received, and when the
 * loaded rows disagree with them (a second page not fetched, the Range control
 * hiding rows) the tile does not move.
 *
 * Absent `status_counts` (an older server or body) is "Not published (FE-043)"
 * in every tile, never 0. Present and malformed never reaches here: the reader
 * voids the page.
 */
import type { StatusCountDimensionV2, StatusCountsV2 } from "../../readers/operationalQueue";
import { NotAvailableLine } from "../../blocks";
import { humanize } from "./outcome";

import "../../css/operations.css";

export const COUNTS_SCOPE =
  "Counted by the server across the whole filtered query, not just the loaded rows. The Range control does not change them.";
export const SUCCEEDED_NOTE = "Succeeded is the Portal queue record state only, not a financial, projection or venue result.";

interface Tile {
  /** The `field` of the matching entry in `applied_filters`. */
  field: string;
  label: string;
  pick(counts: StatusCountsV2): StatusCountDimensionV2<string> | undefined;
}

const TILES: readonly Tile[] = [
  { field: "triage_state", label: "Triage", pick: (c) => c.triageState },
  { field: "verification_result", label: "Verification", pick: (c) => c.verificationResult },
  { field: "source_status", label: "Source status", pick: (c) => c.sourceStatus },
  { field: "severity", label: "Severity", pick: (c) => c.severity },
];

const number = (n: number) => n.toLocaleString("en-US");

export interface StatusCountsProps {
  /** `undefined` = the server did not publish `status_counts`. */
  counts: StatusCountsV2 | undefined;
  appliedFilters: readonly { field: string; value: string }[];
  /** When the server read the page and the counts (one read), already formatted. */
  observed: string;
}

export function StatusCounts({ counts, appliedFilters, observed }: StatusCountsProps) {
  return (
    <section className="exec-ops-counts" aria-labelledby="exec-ops-counts-title">
      <h2 id="exec-ops-counts-title" className="exec-ops-counts-title" title={`${COUNTS_SCOPE}${counts ? ` Same server snapshot as the table, observed ${observed}.` : ""}`}>Counts by status</h2>
      {counts ? null : (
        <NotAvailableLine
          className="exec-ops-na-line"
          facts={TILES.map((tile) => ({ label: tile.label, id: "FE-043" as const, why: "Server-side status counts over the whole filtered query" }))}
          note="counts"
        />
      )}
      {counts === undefined ? null : <div className="exec-ops-counts-grid">
        {TILES.map((tile) => {
          const dimension = counts ? tile.pick(counts) : undefined;
          const own = appliedFilters.find((filter) => filter.field === tile.field);
          return (
            <div key={tile.field} className="exec-ops-dim" role="group" aria-label={`${tile.label} counts`} data-state={dimension ? "counted" : "absent"}>
              <h3 className="exec-ops-dim-label">{tile.label}</h3>
              {dimension ? (
                <>
                  <p className="exec-ops-dim-total">
                    <span className="exec-ops-dim-num">{number(dimension.total)}</span>
                    <span className="exec-ops-meta">
                      {dimension.ownFilterApplied ? `with the ${tile.label.toLowerCase()} filter ignored` : "under every filter"}
                    </span>
                  </p>
                  <ul className="exec-ops-dim-list" role="list">
                    {Object.entries(dimension.counts).map(([bucket, value]) => {
                      const selected = dimension.ownFilterApplied && own?.value === bucket;
                      return (
                        <li key={bucket} className="exec-ops-dim-row" data-selected={selected ? "true" : undefined}>
                          <span title={bucket === "SUCCEEDED" ? SUCCEEDED_NOTE : undefined}>{humanize(bucket)}{selected ? <span className="exec-ops-dim-tag"> (filtered)</span> : null}</span>
                          <span className="exec-ops-dim-num">{number(value)}</span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : (
                <p className="exec-ops-np">Not available</p>
              )}
            </div>
          );
        })}
      </div>}
    </section>
  );
}
