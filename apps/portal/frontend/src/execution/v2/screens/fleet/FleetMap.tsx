/**
 * Fleet Map (the artifact's third view): a heat map of the loaded Manager dataset rows.
 *
 * - Tile SIZE is the published `allocation` of ONE economic partition (domain, currency, basis, profile) that the reader picks in the
 *   segmented control. Rows are never compared across partitions: a Paper USDT book and a Real-funded USDT book are different maps,
 *   and a row that does not publish allocation in the chosen partition is listed under the map with the typed reason, not drawn.
 *   The size is geometry only (`toGeometry`, a flex weight): the figure on the tile is the exact published string, nothing
 *   derived is ever printed, and no total over tiles exists.
 * - Tile COLOUR is the published health word (`healthView`), with the health flag printed on the tile: colour is never the only cue.
 * - Published order is kept (no re-sorting by size), so the picture does not claim a ranking the server did not make.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { NaWhy } from "../../blocks";
import { toGeometry } from "../../charts/decimal";
import { Flag } from "../../Flag";
import type { ManagerRow } from "../../readers/managerDataset";
import type { ManagerPartition, ManagerPartitionedMetrics } from "../../readers/managerMetric";
import { MetricValue } from "../manager/MetricValue";
import { DOMAIN_LABEL } from "./PartitionFigures";
import { healthView, notPublished, stageLabel, type UnpublishedFact } from "./fleetModel";

import "./partitionFigures.css";

const SIZE_KEY = "allocation";
const ALLOCATION_GAP: UnpublishedFact = { fe: "BQ-FLEET-ALLOC", what: "Allocation" };

const identityOf = (partition: ManagerPartition): string =>
  JSON.stringify([partition.economicDomain, partition.currency, partition.basis, partition.nativeProfileRef]);
const tagOf = (partition: ManagerPartition): string => `${DOMAIN_LABEL[partition.economicDomain]} · ${partition.currency}`;
const inPartition = (row: ManagerRow, identity: string): ManagerPartitionedMetrics | null =>
  row.economicPartitions.find((entry) => identityOf(entry.partition) === identity) ?? null;

export interface FleetMapProps {
  rows: readonly ManagerRow[];
  metricKeys: readonly string[] | null;
  hrefFor(row: ManagerRow): string;
  selectedKey?: string | null;
  onOpen?(row: ManagerRow): void;
}

export function FleetMap({ rows, metricKeys, hrefFor, selectedKey, onOpen }: FleetMapProps) {
  // The partitions that publish at least one allocation figure, in first-seen (published) order.
  const partitions = useMemo(() => {
    const seen = new Map<string, ManagerPartition>();
    for (const row of rows) {
      for (const entry of row.economicPartitions) {
        const metric = entry.metrics.get(SIZE_KEY);
        if (metric !== undefined && metric.kind === "value" && !seen.has(identityOf(entry.partition))) seen.set(identityOf(entry.partition), entry.partition);
      }
    }
    return [...seen.entries()];
  }, [rows]);
  const [chosen, setChosen] = useState<string | null>(null);
  // Two partitions of one domain and currency (different book or basis) would read alike: then the profile is part of the label.
  const labelOf = (partition: ManagerPartition): string =>
    partitions.filter(([, other]) => tagOf(other) === tagOf(partition)).length > 1 ? `${tagOf(partition)} · ${partition.nativeProfileRef}` : tagOf(partition);
  const identity = chosen !== null && partitions.some(([key]) => key === chosen) ? chosen : partitions[0]?.[0] ?? null;

  if (metricKeys !== null && !metricKeys.includes(SIZE_KEY)) {
    return <div className="exec-fleet-nppanel" role="status"><strong>Map</strong><p>{notPublished(ALLOCATION_GAP)}: the Manager dataset does not carry allocation, which sizes the tiles.</p></div>;
  }
  if (identity === null) {
    return (
      <div className="exec-fleet-nppanel" role="status" data-testid="map-empty">
        <strong>Map</strong>
        <p>No loaded row publishes an allocation figure, so there is nothing to size the tiles by.</p>
      </div>
    );
  }

  const drawn: { row: ManagerRow; exact: string; weight: number }[] = [];
  const undrawn: { row: ManagerRow; entry: ManagerPartitionedMetrics | null }[] = [];
  for (const row of rows) {
    const entry = inPartition(row, identity);
    const metric = entry?.metrics.get(SIZE_KEY);
    if (metric !== undefined && metric.kind === "value") drawn.push({ row, exact: metric.exact, weight: Math.max(toGeometry(metric.exact), 0) });
    else undrawn.push({ row, entry });
  }
  const heaviest = drawn.reduce((max, tile) => Math.max(max, tile.weight), 0);
  // Geometry only: a flex weight between 1 and 100 (a zero or negative allocation still gets a minimal, visible tile).
  const grow = (weight: number): number => (heaviest > 0 ? Math.max(1, Math.round((weight / heaviest) * 100)) : 1);

  return (
    <div className="exec-fleet-map" data-testid="fleet-map">
      <div className="exec-fleet-map-head">
        {partitions.length > 1 ? (
          <span className="exec-fleet-seg" role="group" aria-label="Map partition">
            {partitions.map(([key, partition]) => (
              <button key={key} type="button" className="exec-fleet-segbtn" aria-pressed={key === identity} onClick={() => setChosen(key)}>{labelOf(partition)}</button>
            ))}
          </span>
        ) : <span className="exec-fleet-note">{labelOf(partitions[0]![1])}</span>}
        <span className="exec-fleet-note">Tile size is the published allocation of this one partition; colour is health. Partitions are never added together.</span>
      </div>
      <ul className="exec-fleet-tiles" role="list" aria-label="Allocation by alpha">
        {drawn.map(({ row, weight }) => {
          const health = row.health === null ? null : healthView(row.health);
          const metric = inPartition(row, identity)?.metrics.get(SIZE_KEY);
          return (
            <li key={row.rowKey} className="exec-fleet-tile" data-health={health === null ? "unknown" : health.kind} data-selected={selectedKey === row.rowKey ? "true" : undefined}
              style={{ flexGrow: grow(weight) }}>
              <Link className="exec-fleet-name" to={hrefFor(row)}>{row.name ?? row.alphaId}</Link>
              <span className="exec-fleet-version">{row.alphaVersionId} · {row.currentStage === null ? "No single stage" : stageLabel(row.currentStage)}</span>
              <MetricValue metric={metric} />
              {health ? <Flag kind={health.kind} label={health.label} size="sm" /> : <NaWhy className="exec-fleet-np" reason="The dataset published no health for this row." />}
              {onOpen ? <button type="button" className="exec-fleet-link" onClick={() => onOpen(row)}>Peek</button> : null}
            </li>
          );
        })}
      </ul>
      {undrawn.length > 0 ? (
        <div className="exec-fleet-map-rest" data-testid="map-undrawn">
          <span className="exec-fleet-note">Not drawn, no allocation figure in {labelOf(partitions.find(([key]) => key === identity)![1])}:</span>
          <ul role="list">
            {undrawn.map(({ row, entry }) => (
              <li key={row.rowKey}>
                <Link className="exec-fleet-name" to={hrefFor(row)}>{row.name ?? row.alphaId}</Link>{" "}
                {entry === null
                  ? <NaWhy className="exec-fleet-np" reason="This row has no economic partition matching the one the map shows." />
                  : <MetricValue metric={entry.metrics.get(SIZE_KEY) ?? null} />}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
