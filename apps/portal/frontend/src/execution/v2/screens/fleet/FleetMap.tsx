/**
 * Fleet Map (the artifact's third view): a heat map of the loaded Manager dataset rows.
 *
 * - Tile SIZE is the published `allocation` of ONE economic partition (domain, currency, basis, profile) that the reader picks in the
 *   segmented control. Rows are never compared across partitions: a Paper USDT book and a Real-funded USDT book are different maps,
 *   and a row that does not publish allocation in the chosen partition is listed under the map with the typed reason, not drawn.
 *   The size is geometry only (`toGeometry`, a flex weight): the figure on the tile is the exact published string, nothing
 *   derived is ever printed, and no total over tiles exists.
 * - Tile COLOUR is, by the reader's choice, the published health word (`healthView`), the sign of the published 30-day return of the chosen
 *   partition, or the current stage; the word is printed on the tile each time and a legend names every colour: colour is never the only cue.
 * - Tiles are nested in a box per portfolio (QA1 R2-11); a portfolio box is as large as its tiles together, geometry only, never a figure.
 * - Size is Allocation or Equal (every tile the same weight): the reader's switch, named on the map.
 * - ALL reads (FE-CAT-3): the rows of every environment arrive together, and the map is still ONE partition at a time, so a row of another
 *   environment is not "missing an allocation": it belongs to another partition's map and is counted as such under the map, never drawn here.
 * - Published order is kept (no re-sorting by size), so the picture does not claim a ranking the server did not make.
 */
import { useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";

import { NaWhy } from "../../blocks";
import { toGeometry } from "../../charts/decimal";
import { useMediaQuery } from "../../useMediaQuery";
import { Flag } from "../../Flag";
import { ENVIRONMENT_DOMAIN, type ManagerRow } from "../../readers/managerDataset";
import type { ManagerPartition, ManagerPartitionedMetrics } from "../../readers/managerMetric";
import { MetricValue } from "../manager/MetricValue";
import { DOMAIN_LABEL } from "./PartitionFigures";
import { fixedDecimals } from "./fleetMetricsModel";
import { healthView, notPublished, stageLabel, type UnpublishedFact } from "./fleetModel";

import "./partitionFigures.css";

const SIZE_KEY = "allocation";
/** The smallest tile, as a share of the heaviest (of 100): small allocations stay legible instead of shrinking to a sliver. */
const MIN_GROW = 20;
/** Treemap height: enough area that the smallest tile can hold a name and a figure (about 150 x 56 px each, wide; 130 x 84 narrow). */
const TILE_HEIGHT_WIDE = 56;
const TILE_HEIGHT_NARROW = 96;
type SizeMode = "allocation" | "equal";
type ColourMode = "health" | "return" | "stage";
const COLOUR_MODES: readonly { id: ColourMode; label: string }[] = [{ id: "health", label: "Health" }, { id: "return", label: "Return" }, { id: "stage", label: "Stage" }];
const LEGEND: Readonly<Record<ColourMode, readonly { tone: string; label: string }[]>> = {
  health: [{ tone: "ok", label: "Ready" }, { tone: "attention", label: "Needs attention or finding" }, { tone: "neutral", label: "Other published health" }, { tone: "unknown", label: "No health published" }],
  return: [{ tone: "ok", label: "Return 30D above zero" }, { tone: "attention", label: "Return 30D below zero" }, { tone: "neutral", label: "Return 30D zero" }, { tone: "unknown", label: "No return published for this partition" }],
  stage: [{ tone: "stage-paper", label: "Paper" }, { tone: "stage-sandbox", label: "Sandbox" }, { tone: "stage-canary", label: "Canary" }, { tone: "stage-live", label: "Live" }, { tone: "unknown", label: "No single stage" }],
};
const ALLOCATION_GAP: UnpublishedFact = { fe: "BQ-FLEET-ALLOC", what: "Allocation" };

const identityOf = (partition: ManagerPartition): string =>
  JSON.stringify([partition.economicDomain, partition.currency, partition.basis, partition.nativeProfileRef, partition.domainProofRef]);
const tagOf = (partition: ManagerPartition): string => `${DOMAIN_LABEL[partition.economicDomain]} · ${partition.currency}`;
const inPartition = (row: ManagerRow, identity: string): ManagerPartitionedMetrics | null =>
  row.economicPartitions.find((entry) => identityOf(entry.partition) === identity) ?? null;

interface Rect { x: number; y: number; w: number; h: number }
/** A rect laid out in nominal pixels of its parent (`parent`), as percentages of that parent. */
const pctOf = (r: Rect, parent: { w: number; h: number }) => ({ left: `${(r.x / parent.w) * 100}%`, top: `${(r.y / parent.h) * 100}%`, width: `${(r.w / parent.w) * 100}%`, height: `${(r.h / parent.h) * 100}%` });
/** Nominal container width in px (wide / phone): squarifying in percent of a tall box would make slivers, so the layout is done in pixels. */
const NOMINAL_W_WIDE = 1100;
const NOMINAL_W_NARROW = 330;
const HEAD_PX = 22;

/**
 * Squarified treemap (Bruls et al.): every rectangle's AREA is proportional to its weight inside the parent. Weights are geometry only
 * (the published allocation's `toGeometry`, or 1 each in Equal mode); the larger weights are placed first, so the order is by size.
 */
export function squarify<T>(items: readonly { key: T; weight: number }[], rect: Rect): { key: T; rect: Rect }[] {
  const out: { key: T; rect: Rect }[] = [];
  const list = items.filter((item) => item.weight > 0).sort((a, b) => b.weight - a.weight);
  const total = list.reduce((sum, item) => sum + item.weight, 0);
  if (total <= 0) return out;
  const scale = (rect.w * rect.h) / total;
  let free = { ...rect };
  let row: typeof list = [];
  const worst = (candidate: typeof list, side: number): number => {
    const areas = candidate.map((item) => item.weight * scale);
    const sum = areas.reduce((x, y) => x + y, 0);
    return Math.max((side * side * Math.max(...areas)) / (sum * sum), (sum * sum) / (side * side * Math.min(...areas)));
  };
  const flush = () => {
    if (row.length === 0) return;
    const sum = row.reduce((x, item) => x + item.weight * scale, 0);
    if (free.w >= free.h) {
      const width = sum / free.h;
      let y = free.y;
      for (const item of row) { const height = (item.weight * scale) / width; out.push({ key: item.key, rect: { x: free.x, y, w: width, h: height } }); y += height; }
      free = { x: free.x + width, y: free.y, w: free.w - width, h: free.h };
    } else {
      const height = sum / free.w;
      let x = free.x;
      for (const item of row) { const width = (item.weight * scale) / height; out.push({ key: item.key, rect: { x, y: free.y, w: width, h: height } }); x += width; }
      free = { x: free.x, y: free.y + height, w: free.w, h: free.h - height };
    }
    row = [];
  };
  for (const item of list) {
    const side = Math.min(free.w, free.h);
    if (row.length === 0 || worst([...row, item], side) <= worst(row, side)) row.push(item);
    else { flush(); row.push(item); }
  }
  flush();
  return out;
}

export interface FleetMapProps {
  rows: readonly ManagerRow[];
  metricKeys: readonly string[] | null;
  hrefFor(row: ManagerRow): string;
  selectedKey?: string | null;
  onOpen?(row: ManagerRow): void;
}

export function FleetMap({ rows, metricKeys, hrefFor, selectedKey, onOpen }: FleetMapProps) {
  const phone = useMediaQuery("(max-width: 660px)");
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
  const [sizeMode, setSizeMode] = useState<SizeMode>("allocation");
  const [colourMode, setColourMode] = useState<ColourMode>("health");
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

  const chosenDomain = (JSON.parse(identity) as [string, ...unknown[]])[0];
  const drawn: { row: ManagerRow; exact: string; weight: number }[] = [];
  const undrawn: { row: ManagerRow; entry: ManagerPartitionedMetrics | null }[] = [];
  let elsewhere = 0;
  for (const row of rows) {
    // A row that names its environment (an ALL read) and is not of the chosen partition's environment belongs to another map.
    if (row.environment !== undefined && ENVIRONMENT_DOMAIN[row.environment] !== chosenDomain) { elsewhere += 1; continue; }
    const entry = inPartition(row, identity);
    const metric = entry?.metrics.get(SIZE_KEY);
    if (metric !== undefined && metric.kind === "value") drawn.push({ row, exact: metric.exact, weight: Math.max(toGeometry(metric.exact), 0) });
    else undrawn.push({ row, entry });
  }
  const heaviest = drawn.reduce((max, tile) => Math.max(max, tile.weight), 0);
  // Geometry only: a flex weight between 1 and 100 (a zero or negative allocation still gets a minimal, visible tile).
  // The floor is 20 of 100, not 1: a tile at 1% of the heaviest was 17px wide and unreadable (QA6 R1-08). The floor is still geometry only; the figure
  // on every tile is its own published allocation, and the sentence under the control says "Tile size is the published allocation" with the floor stated.
  const grow = (weight: number): number => (sizeMode === "equal" || heaviest <= 0 ? 1 : Math.max(MIN_GROW, Math.round((weight / heaviest) * 100)));
  const toneOf = (row: ManagerRow): string => {
    if (colourMode === "stage") return row.currentStage === null ? "unknown" : `stage-${row.currentStage.toLowerCase()}`;
    if (colourMode === "return") {
      const figure = inPartition(row, identity)?.metrics.get("return_30d_pct");
      if (figure === undefined || figure.kind !== "value") return "unknown";
      return figure.exact.startsWith("-") ? "attention" : /^0(\.0+)?$/.test(figure.exact) ? "neutral" : "ok";
    }
    return row.health === null ? "unknown" : healthView(row.health).kind;
  };
  // A box per portfolio, in the order the rows were published.
  const portfolios: { id: string; tiles: typeof drawn }[] = [];
  for (const tile of drawn) {
    let box = portfolios.find((candidate) => candidate.id === tile.row.portfolioId);
    if (box === undefined) { box = { id: tile.row.portfolioId, tiles: [] }; portfolios.push(box); }
    box.tiles.push(tile);
  }

  // The layout is done in nominal pixels so a tall map does not turn into slivers; the boxes are then placed in percent of the real container.
  const mapW = phone ? NOMINAL_W_NARROW : NOMINAL_W_WIDE;
  const mapH = phone ? Math.min(4200, Math.max(1100, drawn.length * TILE_HEIGHT_NARROW)) : Math.min(2600, Math.max(640, drawn.length * TILE_HEIGHT_WIDE));
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
        <span className="exec-fleet-seg" role="group" aria-label="Map size">
          <span className="exec-fleet-note">Size</span>
          <button type="button" className="exec-fleet-segbtn" aria-pressed={sizeMode === "allocation"} onClick={() => setSizeMode("allocation")}>Allocation</button>
          <button type="button" className="exec-fleet-segbtn" aria-pressed={sizeMode === "equal"} onClick={() => setSizeMode("equal")}>Equal</button>
        </span>
        <span className="exec-fleet-seg" role="group" aria-label="Map colour">
          <span className="exec-fleet-note">Colour</span>
          {COLOUR_MODES.map((mode) => (
            <button key={mode.id} type="button" className="exec-fleet-segbtn" aria-pressed={colourMode === mode.id} onClick={() => setColourMode(mode.id)}>{mode.label}</button>
          ))}
        </span>
        <span className="exec-fleet-note">
          {sizeMode === "allocation" ? "Tile size is the published allocation of this one partition, with a smallest size so a small allocation stays readable" : "Every tile is the same size"}. Partitions are never added together.
        </span>
      </div>
      <ul className="exec-fleet-legend" role="list" aria-label="Map legend" data-testid="map-legend">
        {LEGEND[colourMode].map((entry) => (
          <li key={entry.tone} className="exec-fleet-legend-item"><i className="exec-fleet-legend-swatch" data-tone={entry.tone} aria-hidden="true" />{entry.label}</li>
        ))}
        <li className="exec-fleet-legend-item"><i className="exec-fleet-legend-swatch" data-tone="simulated" aria-hidden="true" />Hatched: simulated (Paper or Sandbox)</li>
      </ul>
      <div className="exec-fleet-treemap" role="group" aria-label="Allocation by alpha, one box per portfolio" data-testid="treemap"
        style={{ "--tm-h": `${Math.min(2600, Math.max(640, drawn.length * TILE_HEIGHT_WIDE))}px`, "--tm-h-narrow": `${Math.min(4200, Math.max(1100, drawn.length * TILE_HEIGHT_NARROW))}px` } as CSSProperties}>
        {squarify(portfolios.map((box) => ({ key: box, weight: box.tiles.reduce((sum, tile) => sum + grow(tile.weight), 0) })), { x: 0, y: 0, w: mapW, h: mapH }).map(({ key: box, rect }) => (
          <section key={box.id} className="exec-fleet-pf" style={pctOf(rect, { w: mapW, h: mapH })} aria-label={`Portfolio ${box.id}`}>
            <header className="exec-fleet-pf-head"><strong title={box.id}>{box.id}</strong><span className="exec-fleet-note" title={`${box.tiles.length} ${box.tiles.length === 1 ? "alpha" : "alphas"} drawn`}>{box.tiles.length} {box.tiles.length === 1 ? "alpha" : "alphas"}</span></header>
            <ul className="exec-fleet-tiles" role="list" aria-label={`Allocation by alpha in ${box.id}`}>
              {squarify(box.tiles.map((tile) => ({ key: tile, weight: grow(tile.weight) })), { x: 0, y: 0, w: rect.w, h: Math.max(1, rect.h - HEAD_PX) }).map(({ key: { row, weight }, rect: tileRect }) => {
                const health = row.health === null ? null : healthView(row.health);
                const metric = inPartition(row, identity)?.metrics.get(SIZE_KEY);
                const figure = inPartition(row, identity)?.metrics.get("return_30d_pct");
                return (
                  <li key={row.rowKey} className="exec-fleet-tile" data-health={health === null ? "unknown" : health.kind} data-tone={toneOf(row)} data-weight={grow(weight)} data-selected={selectedKey === row.rowKey ? "true" : undefined}
                    data-simulated={row.environment === "paper" || row.environment === "sandbox" || row.currentStage === "PAPER" || row.currentStage === "SANDBOX" ? "true" : undefined}
                    title={`${row.name ?? row.alphaId} · ${row.alphaVersionId} · ${row.currentStage === null ? "No single stage" : stageLabel(row.currentStage)}${health ? ` · ${health.label}` : ""}`}
                    style={pctOf(tileRect, { w: rect.w, h: Math.max(1, rect.h - HEAD_PX) })}>
                    <Link className="exec-fleet-name" title={row.name ?? row.alphaId} to={hrefFor(row)}>{row.name ?? row.alphaId}</Link>
                    <span className="exec-fleet-version">{row.alphaVersionId} · {row.currentStage === null ? "No single stage" : stageLabel(row.currentStage)}</span>
                    <MetricValue metric={metric} />
                    <span className="exec-fleet-version">Return 30D {figure !== undefined && figure.kind === "value" ? <span className="exec-mgr-num" title={figure.exact}>{figure.exact.startsWith("-") || /^0(\.0+)?$/.test(figure.exact) ? "" : "+"}{fixedDecimals(figure.exact, 2)}%</span> : <MetricValue metric={figure ?? null} />}</span>
                    {health ? <Flag kind={health.kind} label={health.label} size="sm" /> : <NaWhy className="exec-fleet-np" reason="The dataset published no health for this row." />}
                    {onOpen ? <button type="button" className="exec-fleet-link" onClick={() => onOpen(row)}>Peek</button> : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      {elsewhere > 0 ? (
        <p className="exec-fleet-note" data-testid="map-elsewhere">
          {elsewhere} loaded {elsewhere === 1 ? "row belongs" : "rows belong"} to other environments. Choose their partition above to see them; environments are never drawn on one map.
        </p>
      ) : null}
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
