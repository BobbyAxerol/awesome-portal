/**
 * CapitalFlow · Sankey of nodes and edges, one block per basis.
 *
 * Band height is the amount on its own basis, on one scale for every block;
 * real-funded and simulated blocks are drawn apart and never summed. A limit
 * edge (a budget against NAV) is a dashed connector, not a band, and is never
 * traversed by the highlight. The diagram is the visual path; the table under
 * it is the keyboard and screen-reader path to the same facts.
 */
import { useMemo, useState } from "react";

import "../css/charts.css";
import type { ExactUnit } from "../../formatExact";
import { ChartStateFlags, ChartUnavailable } from "./ChartStateView";
import { readChartDecimal, showDecimal } from "./decimal";
import { layoutFlow, NODE_W, trace, WIDTH, type FlowBlock, type FlowEdge, type FlowNode, type PlacedBlock } from "./flowLayout";
import { useChartId } from "./hooks";
import type { ChartState } from "./types";

export type { FlowBlock, FlowEdge, FlowNode } from "./flowLayout";

export interface CapitalFlowProps {
  /** Accessible name and visible heading. */
  label: string;
  /** One block per basis (real-funded, simulated). Blocks share one scale and are never summed. */
  blocks: readonly FlowBlock[];
  /** What the bands measure: "Amounts in USDT, each block on its own basis". Required. */
  basis: string;
  /** Display class for node amounts. Default `money`. */
  unit?: ExactUnit;
  /** Printed once in the footnote, not on every node. */
  currency?: string;
  /** `unavailable` prints the caller's copy; `partial` and `stale` still draw and wear a Flag. */
  state?: ChartState;
  /** When `state` is unavailable, still draw the node names as hatched outlines with no values or bands. */
  structureWhenUnavailable?: boolean;
  /** Called with a node id when it is clicked in the diagram or chosen in the table. */
  onSelect?: (nodeId: string) => void;
  /** Above this many nodes the diagram is not drawn and the table stands alone. Default 80. */
  maxNodes?: number;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function CapitalFlow({ label, blocks, basis, unit = "money", currency, state = { kind: "ready" }, structureWhenUnavailable = false, onSelect, maxNodes = 80 }: CapitalFlowProps) {
  const id = useChartId("exec-flow");
  const [active, setActive] = useState<{ kind: "node" | "edge"; id: string; block: string } | null>(null);
  const structure = state.kind === "unavailable" && structureWhenUnavailable;
  const nodeCount = blocks.reduce((sum, b) => sum + b.nodes.length, 0);
  const tooMany = nodeCount > maxNodes;
  const layout = useMemo(() => (tooMany ? null : layoutFlow(blocks, unit, structure)), [blocks, unit, structure, tooMany]);

  if (state.kind === "unavailable" && !structure) return <ChartUnavailable label={label} copy={state.copy} reason={state.reason} height={240} />;
  if (nodeCount === 0) return <ChartUnavailable label={label} copy="Not available" reason="No nodes published." height={240} />;

  // Structure only: no amount may leak into the table either; the caller's copy stands in.
  const structureCopy = state.kind === "unavailable" ? state.copy : "Not available";
  const show = (n: FlowNode) => (structure ? structureCopy : n.value === null ? null : showDecimal(n.value, { unit, signed: n.signed }));
  const amount = (v: string | null) =>
    structure ? structureCopy : v === null ? "Not available" : readChartDecimal(v, unit) === null ? "Unreadable value" : showDecimal(v, { unit, signed: false });

  const highlight = (() => {
    if (active === null) return null;
    const block = blocks.find((b) => b.id === active.block);
    if (block === undefined) return null;
    if (active.kind === "node") {
      const up = trace(block, active.id, "up");
      const down = trace(block, active.id, "down");
      return { nodes: new Set([...up.nodes, ...down.nodes]), edges: new Set([...up.edges, ...down.edges]) };
    }
    const edge = block.edges.find((e) => e.id === active.id);
    if (edge === undefined) return null;
    if ((edge.kind ?? "flow") === "limit") return { nodes: new Set([edge.from, edge.to]), edges: new Set([edge.id]) };
    const up = trace(block, edge.from, "up");
    const down = trace(block, edge.to, "down");
    return { nodes: new Set([...up.nodes, ...down.nodes]), edges: new Set([...up.edges, ...down.edges, edge.id]) };
  })();

  const activeNode = active?.kind === "node" ? blocks.find((b) => b.id === active.block)?.nodes.find((n) => n.id === active.id) : undefined;
  const activeText = (() => {
    if (active === null) return "Hover or focus a node to trace its sources and uses.";
    const block = blocks.find((b) => b.id === active.block);
    if (block === undefined) return "";
    if (activeNode) return `${activeNode.label}: ${show(activeNode) ?? activeNode.absent ?? "Not available"}${activeNode.note ? ` · ${activeNode.note}` : ""}`;
    const e = block.edges.find((x) => x.id === active.id);
    if (!e) return "";
    const from = block.nodes.find((n) => n.id === e.from)?.label ?? e.from;
    const to = block.nodes.find((n) => n.id === e.to)?.label ?? e.to;
    return `${from} to ${to}: ${(e.kind ?? "flow") === "limit" ? "A limit, not cash" : amount(e.value)}`;
  })();

  const summaryId = `${id}-sum`;
  const edgeCount = blocks.reduce((sum, b) => sum + b.edges.length, 0);
  const summary = `${label}. ${nodeCount} nodes, ${edgeCount} links in ${blocks.length} ${blocks.length === 1 ? "block" : "blocks"}. Basis: ${basis}.${blocks.length > 1 ? " Blocks are never summed." : ""}`;

  const table = (
    <details className="exec-chart-table" open={tooMany || undefined}>
      <summary>Table view</summary>
      {blocks.map((b) => (
        <table key={b.id} className="exec-chart-tbl">
          <caption>{`${b.label} · ${b.basis === "simulated" ? "Simulated" : "Real-funded"}`}</caption>
          <thead><tr><th scope="col">Node</th><th scope="col">Column</th><th scope="col">Amount</th><th scope="col">Note</th></tr></thead>
          <tbody>
            {b.nodes.map((n) => (
              <tr key={n.id}>
                <th scope="row">
                  <button
                    type="button"
                    className="exec-flow-pick"
                    onFocus={() => setActive({ kind: "node", id: n.id, block: b.id })}
                    onBlur={() => setActive(null)}
                    onClick={() => onSelect?.(n.id)}
                  >
                    {n.label}
                  </button>
                </th>
                <td>{n.column}</td>
                <td>{show(n) ?? n.absent ?? "Not available"}</td>
                <td>{n.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
          {b.edges.length > 0 ? (
            <tbody>
              {b.edges.map((e: FlowEdge) => (
                <tr key={e.id} className="exec-chart-tbl-edge">
                  <th scope="row">{`${b.nodes.find((n) => n.id === e.from)?.label ?? e.from} to ${b.nodes.find((n) => n.id === e.to)?.label ?? e.to}`}</th>
                  <td>{(e.kind ?? "flow") === "limit" ? "Limit" : "Flow"}</td>
                  <td>{(e.kind ?? "flow") === "limit" ? "Not cash" : amount(e.value)}</td>
                  <td>{e.label ?? ""}</td>
                </tr>
              ))}
            </tbody>
          ) : null}
        </table>
      ))}
    </details>
  );

  if (tooMany || layout === null) {
    return (
      <figure className="exec-chart exec-flow" data-state={state.kind}>
        <figcaption className="exec-chart-head"><span className="exec-chart-title">{label}</span><ChartStateFlags state={state} /></figcaption>
        <p className="exec-chart-envelope" data-testid="too-many">{`${nodeCount} nodes are too many to draw legibly (limit ${maxNodes}). The table below holds every node and link.`}</p>
        <p className="exec-chart-basis" data-testid="basis">{`Basis: ${basis}`}</p>
        {table}
      </figure>
    );
  }

  const dim = highlight !== null;
  const nodeHi = (blockId: string, nodeId: string) => highlight !== null && active?.block === blockId && highlight.nodes.has(nodeId);
  const edgeHi = (blockId: string, edgeId: string) => highlight !== null && active?.block === blockId && highlight.edges.has(edgeId);

  const renderBlock = (pb: PlacedBlock) => {
    const sim = pb.block.basis === "simulated";
    return (
      <g key={pb.block.id} className="exec-flow-block" data-basis={pb.block.basis} transform={`translate(0 ${pb.top})`}>
        <text className="exec-flow-head" x={8} y={14}>{`${pb.block.label} · ${sim ? "Simulated" : "Real-funded"}`}</text>
        <line className="exec-chart-grid" x1={0} x2={WIDTH} y1={22} y2={22} />
        {pb.edges.map((e) => {
          if (!e.drawn) return null;
          const hi = edgeHi(pb.block.id, e.edge.id);
          const common = {
            "data-id": e.edge.id,
            "data-hi": hi ? "true" : undefined,
            onMouseEnter: () => setActive({ kind: "edge", id: e.edge.id, block: pb.block.id }),
            onMouseLeave: () => setActive(null),
          };
          if (e.kind === "limit") {
            const a = pb.nodes.find((n) => n.node.id === e.edge.from);
            const b = pb.nodes.find((n) => n.node.id === e.edge.to);
            const mx = a && b ? (a.x + NODE_W + b.x) / 2 : 0;
            const my = a && b ? (a.y + a.h / 2 + b.y + b.h / 2) / 2 : 0;
            return (
              <g key={e.edge.id} className="exec-flow-limit" data-testid="flow-limit" {...common}>
                <path d={e.d} />
                <rect x={mx - 56} y={my - 10} width={112} height={20} />
                <text x={mx} y={my + 4} textAnchor="middle">{e.edge.label ?? "Limit, not cash"}</text>
              </g>
            );
          }
          return (
            <g key={e.edge.id} className="exec-flow-link" data-testid="flow-band" {...common}>
              <path className="exec-flow-band" data-sim={sim ? "true" : "false"} data-tone={pb.nodes.find((n) => n.node.id === e.edge.from)?.node.tone ?? "series"} d={e.d} />
              {sim ? <path className="exec-flow-band-hatch" d={e.d} fill={`url(#${id}-hsim)`} /> : null}
            </g>
          );
        })}
        {pb.nodes.map((p) => {
          const n = p.node;
          const hatched = n.hatched || !p.valid;
          const hi = nodeHi(pb.block.id, n.id);
          const value = show(n);
          const name = clip(n.label, 26);
          return (
            <g
              key={n.id}
              className="exec-flow-node"
              data-id={n.id}
              data-hi={hi ? "true" : undefined}
              data-tone={sim ? "sim" : n.tone ?? "series"}
              data-testid="flow-node"
              onMouseEnter={() => setActive({ kind: "node", id: n.id, block: pb.block.id })}
              onMouseLeave={() => setActive(null)}
              onClick={() => onSelect?.(n.id)}
            >
              <title>{`${n.label}: ${value ?? n.absent ?? "Not available"}`}</title>
              <rect className="exec-flow-rect" data-hatch={hatched ? "true" : "false"} data-sim={sim ? "true" : "false"} data-hollow={p.valid && p.numeric === 0 ? "true" : "false"} x={p.x} y={p.y} width={NODE_W} height={p.h} fill={hatched ? `url(#${id}-${sim ? "hsim" : "hna"})` : undefined} />
              <text className="exec-flow-name" x={p.x + NODE_W + 8} y={p.cy - 2}>{name}</text>
              <text className="exec-flow-val" data-na={value === null ? "true" : "false"} x={p.x + NODE_W + 8} y={p.cy + 11}>
                {value ?? n.absent ?? "Not available"}
              </text>
            </g>
          );
        })}
      </g>
    );
  };

  return (
    <figure className="exec-chart exec-flow" data-state={state.kind}>
      <figcaption className="exec-chart-head"><span className="exec-chart-title">{label}</span><ChartStateFlags state={state} /></figcaption>
      {structure && state.kind === "unavailable" ? (
        <p className="exec-chart-envelope" data-testid="structure-note">{`${state.copy}${state.reason ? ` · ${state.reason}` : ""} · Structure only, no amounts`}</p>
      ) : null}
      <div className="exec-flow-scroll">
        <svg className="exec-chart-svg exec-flow-svg" viewBox={`0 0 ${WIDTH} ${layout.height}`} role="img" aria-label={label} aria-describedby={summaryId} data-dim={dim ? "true" : "false"}>
          <defs>
            <pattern id={`${id}-hsim`} className="exec-chart-pat" data-s="sim" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" /></pattern>
            <pattern id={`${id}-hna`} className="exec-chart-pat" data-s="gap" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" /></pattern>
          </defs>
          {layout.blocks.map(renderBlock)}
        </svg>
      </div>
      <p className="exec-flow-readout" role="status" data-testid="flow-readout">{activeText}</p>
      <p className="exec-chart-basis" data-testid="basis">{`Basis: ${basis}`}</p>
      <p className="exec-chart-envelope">{`Band height is the amount on its own basis · Hatched outline: no amount${blocks.length > 1 ? " · Blocks are never summed" : ""}${currency ? ` · ${currency}` : ""}`}</p>
      <div className="exec-chart-sr" id={summaryId}>{summary}</div>
      {table}
    </figure>
  );
}
