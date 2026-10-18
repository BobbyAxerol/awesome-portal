/**
 * Sankey geometry for CapitalFlow. Pure: nodes and edges in, rectangles and
 * bands out. A band's height is its edge's amount times one scale shared by
 * every block, so two blocks are comparable by eye and still never summed.
 */
import { readChartDecimal, toGeometry } from "./decimal";
import type { ExactUnit } from "../../formatExact";

export interface FlowNode {
  /** Stable key; edges refer to it. */
  readonly id: string;
  /** Name; clipped in the diagram, whole in the table and the title. */
  readonly label: string;
  /** Left-to-right position. Equal columns stack top to bottom in array order. */
  readonly column: number;
  /** The amount on this node's own basis, or `null` when the source published none. */
  readonly value: string | null;
  /** Copy for a node with no value ("Not available", "Not published (FE-xxx)"). */
  readonly absent?: string;
  /** Colour role of the node and its outgoing bands. Simulated blocks always use `sim`. */
  readonly tone?: "series" | "series-2" | "series-3" | "series-4" | "sim";
  /** Prefix `+` on a positive value (net PnL). */
  readonly signed?: boolean;
  /** A node that holds nothing yet (headroom, unallocated): hatched outline. */
  readonly hatched?: boolean;
  /** Extra line in the table and the readout. Must not carry an amount if the chart may be unavailable. */
  readonly note?: string;
}

export interface FlowEdge {
  /** Stable key. */
  readonly id: string;
  /** Source node id. */
  readonly from: string;
  /** Target node id. */
  readonly to: string;
  /** `flow` is cash/amount moving; `limit` is a dashed connector that is not traversed. */
  readonly kind?: "flow" | "limit";
  /** Exact amount, or `null` when unpublished (no band is drawn, the table says so). */
  readonly value: string | null;
  /** Words on a limit connector. Default "Limit, not cash". */
  readonly label?: string;
}

export interface FlowBlock {
  /** Stable key. */
  readonly id: string;
  /** Block heading. */
  readonly label: string;
  /** Simulated blocks are drawn hatched and never added to real ones. */
  readonly basis: "real" | "simulated";
  /** Nodes; equal `column` values stack in array order. */
  readonly nodes: readonly FlowNode[];
  /** Flow bands and limit connectors. */
  readonly edges: readonly FlowEdge[];
}

export const NODE_W = 12;
export const SLOT_MIN = 32;
export const NODE_PAD = 12;
export const HEAD_H = 30;
export const BLOCK_GAP = 28;
export const MIN_BAR = 5;
export const WIDTH = 1000;
const LABEL_LEFT = 8;
const LABEL_RIGHT = 200;
const PLOT_H = 300;

export interface PlacedNode {
  readonly node: FlowNode;
  readonly col: number;
  readonly x: number;
  /** Top of the rectangle. */
  readonly y: number;
  readonly h: number;
  /** Vertical centre of the label slot. */
  readonly cy: number;
  readonly numeric: number | null;
  readonly valid: boolean;
}

export interface PlacedEdge {
  readonly edge: FlowEdge;
  readonly kind: "flow" | "limit";
  /** Path `d` of the band (flow) or centre line (limit); empty when the amount is absent. */
  readonly d: string;
  readonly h: number;
  readonly drawn: boolean;
}

export interface PlacedBlock {
  readonly block: FlowBlock;
  readonly top: number;
  readonly height: number;
  readonly nodes: readonly PlacedNode[];
  readonly edges: readonly PlacedEdge[];
}

export interface FlowLayout {
  readonly blocks: readonly PlacedBlock[];
  readonly height: number;
  /** Pixels per unit of amount, shared by every block. */
  readonly k: number;
}

function amountOf(value: string | null, unit: ExactUnit): number | null {
  if (value === null) return null;
  const read = readChartDecimal(value, unit);
  if (read === null) return null;
  const n = Math.abs(toGeometry(read));
  return Number.isFinite(n) ? n : null;
}

function band(x0: number, y0: number, x1: number, y1: number, h: number): string {
  const xm = (x0 + x1) / 2;
  const f = (n: number) => Math.round(n * 10) / 10;
  return (
    `M${f(x0)},${f(y0)} C${f(xm)},${f(y0)} ${f(xm)},${f(y1)} ${f(x1)},${f(y1)} L${f(x1)},${f(y1 + h)} ` +
    `C${f(xm)},${f(y1 + h)} ${f(xm)},${f(y0 + h)} ${f(x0)},${f(y0 + h)} Z`
  );
}

export function layoutFlow(blocks: readonly FlowBlock[], unit: ExactUnit, structureOnly = false): FlowLayout {
  // One shared scale: the tallest column sum in any block fits PLOT_H.
  let widest = 0;
  for (const b of blocks) {
    const sums = new Map<number, number>();
    for (const n of b.nodes) sums.set(n.column, (sums.get(n.column) ?? 0) + (amountOf(n.value, unit) ?? 0));
    for (const s of sums.values()) widest = Math.max(widest, s);
  }
  const k = widest > 0 ? PLOT_H / widest : 0;

  const placed: PlacedBlock[] = [];
  let cursor = 0;
  for (const block of blocks) {
    const columns = [...new Set(block.nodes.map((n) => n.column))].sort((a, b) => a - b);
    const span = columns.length > 1 ? (WIDTH - NODE_W - LABEL_LEFT - LABEL_RIGHT) / (columns.length - 1) : 0;
    const top = cursor + HEAD_H;
    let tallest = 0;
    const nodes: PlacedNode[] = [];
    for (const col of columns) {
      let y = top;
      for (const node of block.nodes.filter((n) => n.column === col)) {
        const numeric = structureOnly ? null : amountOf(node.value, unit);
        const hasValue = numeric !== null;
        const h = structureOnly ? 22 : hasValue ? (numeric === 0 ? 3 : Math.max(MIN_BAR, numeric * k)) : 18;
        const slot = Math.max(h, SLOT_MIN);
        nodes.push({
          node,
          col,
          x: LABEL_LEFT + columns.indexOf(col) * span,
          y: y + (slot - h) / 2,
          h,
          cy: y + slot / 2,
          numeric,
          valid: hasValue,
        });
        y += slot + NODE_PAD;
      }
      tallest = Math.max(tallest, y - top - NODE_PAD);
    }
    const byId = new Map(nodes.map((n) => [n.node.id, n]));
    const outOffset = new Map<string, number>();
    const inOffset = new Map<string, number>();
    const edges: PlacedEdge[] = [];
    for (const edge of block.edges) {
      const kind = edge.kind ?? "flow";
      const a = byId.get(edge.from);
      const b = byId.get(edge.to);
      if (structureOnly || a === undefined || b === undefined) {
        edges.push({ edge, kind, d: "", h: 0, drawn: false });
        continue;
      }
      if (kind === "limit") {
        const y0 = a.y + a.h / 2;
        const y1 = b.y + b.h / 2;
        edges.push({ edge, kind, d: `M${a.x + NODE_W},${y0} L${b.x},${y1}`, h: 0, drawn: true });
        continue;
      }
      // Geometry only: the magnitude is a pixel scale input, the label stays the exact string.
      const magnitude = amountOf(edge.value, unit);
      if (magnitude === null) {
        edges.push({ edge, kind, d: "", h: 0, drawn: false });
        continue;
      }
      const h = Math.max(1, magnitude * k);
      const y0 = a.y + (outOffset.get(a.node.id) ?? 0);
      const y1 = b.y + (inOffset.get(b.node.id) ?? 0);
      outOffset.set(a.node.id, (outOffset.get(a.node.id) ?? 0) + h);
      inOffset.set(b.node.id, (inOffset.get(b.node.id) ?? 0) + h);
      edges.push({ edge, kind, d: band(a.x + NODE_W, y0, b.x, y1, h), h, drawn: true });
    }
    const height = HEAD_H + tallest;
    placed.push({ block, top: cursor, height, nodes, edges });
    cursor += height + BLOCK_GAP;
  }
  return { blocks: placed, height: Math.max(cursor - BLOCK_GAP, HEAD_H), k };
}

/**
 * Everything reachable from `id` along flow edges in one direction. A limit
 * edge is never traversed: a budget is a ceiling, not cash that moved.
 */
export function trace(block: FlowBlock, id: string, direction: "up" | "down"): { nodes: Set<string>; edges: Set<string> } {
  const nodes = new Set<string>([id]);
  const edges = new Set<string>();
  const queue = [id];
  while (queue.length > 0) {
    const at = queue.pop() as string;
    for (const e of block.edges) {
      if ((e.kind ?? "flow") !== "flow") continue;
      const next = direction === "down" ? (e.from === at ? e.to : null) : e.to === at ? e.from : null;
      if (next === null) continue;
      edges.add(e.id);
      if (!nodes.has(next)) {
        nodes.add(next);
        queue.push(next);
      }
    }
  }
  return { nodes, edges };
}
