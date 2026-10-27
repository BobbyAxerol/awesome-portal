import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CapitalFlow, type FlowBlock } from "./CapitalFlow";
import { connectedNodes, layoutFlow, NODE_W } from "./flowLayoutProbe";

afterEach(cleanup);

const REAL: FlowBlock = {
  id: "real",
  label: "Real-funded",
  basis: "real",
  nodes: [
    { id: "init", label: "Initial funds", column: 0, value: "500000.00" },
    { id: "add", label: "Added funds", column: 0, value: "100000.00" },
    { id: "pnl", label: "Net PnL since start", column: 0, value: "12480.40", signed: true, tone: "series-3" },
    { id: "nav", label: "NAV", column: 1, value: "612480.40" },
    { id: "bud", label: "Approved budget", column: 2, value: "700000.00", note: "A limit set by the manager, not cash" },
    { id: "btc", label: "BTC-Trend v3", column: 3, value: "200000.00" },
    { id: "head", label: "Headroom", column: 3, value: "160000.00", hatched: true },
    { id: "src", label: "By funding source", column: 0, value: null, absent: "Not published: canary envelope compliance, rollback checks and trial calendar" },
  ],
  edges: [
    { id: "e1", from: "init", to: "nav", value: "500000.00" },
    { id: "e2", from: "add", to: "nav", value: "100000.00" },
    { id: "e3", from: "pnl", to: "nav", value: "12480.40" },
    { id: "lim", from: "nav", to: "bud", kind: "limit", value: null, label: "Limit, not cash" },
    { id: "e4", from: "bud", to: "btc", value: "200000.00" },
    { id: "e5", from: "bud", to: "head", value: "160000.00" },
  ],
};
const SIM: FlowBlock = {
  id: "sim",
  label: "Virtual funds",
  basis: "simulated",
  nodes: [
    { id: "sv", label: "Virtual funds", column: 0, value: "250000.00" },
    { id: "sbtc", label: "BTC-Trend v3 paper", column: 1, value: "120000.00" },
    { id: "sun", label: "Unallocated virtual", column: 1, value: "50000.00", hatched: true },
  ],
  edges: [
    { id: "s1", from: "sv", to: "sbtc", value: "120000.00" },
    { id: "s2", from: "sv", to: "sun", value: "50000.00" },
  ],
};
const BASIS = "Amounts in USDT, each block on its own basis";

describe("flow layout", () => {
  it("scales band height with the amount on one scale shared by every block", () => {
    const layout = layoutFlow([REAL, SIM], "money");
    const h = (block: number, id: string) => layout.blocks[block].nodes.find((n) => n.node.id === id)!.h;
    expect(h(0, "init") / h(0, "add")).toBeCloseTo(5, 3);
    // The simulated virtual-funds node is 250,000 against 500,000 real: half the height, same scale.
    expect(h(1, "sv") / h(0, "init")).toBeCloseTo(0.5, 3);
    const bands = layout.blocks[0].edges.filter((e) => e.kind === "flow" && e.drawn);
    expect(bands.find((b) => b.edge.id === "e1")!.h / bands.find((b) => b.edge.id === "e2")!.h).toBeCloseTo(5, 3);
  });

  it("gives a missing amount a hatched stub and no band, and never a zero-height node for a real amount", () => {
    const layout = layoutFlow([REAL], "money");
    const src = layout.blocks[0].nodes.find((n) => n.node.id === "src")!;
    expect(src.valid).toBe(false);
    expect(src.h).toBeGreaterThan(10);
    const tiny = layoutFlow([{ ...REAL, nodes: [...REAL.nodes, { id: "t", label: "Tiny", column: 1, value: "0.01" }] }], "money");
    expect(tiny.blocks[0].nodes.find((n) => n.node.id === "t")!.h).toBeGreaterThanOrEqual(5);
  });

  it("stacks the nodes of a column without overlap and draws a limit as a connector, not a band", () => {
    const layout = layoutFlow([REAL], "money");
    const col0 = layout.blocks[0].nodes.filter((n) => n.col === 0).sort((a, b) => a.cy - b.cy);
    for (let i = 1; i < col0.length; i += 1) expect(col0[i].cy - col0[i - 1].cy).toBeGreaterThanOrEqual(32);
    const lim = layout.blocks[0].edges.find((e) => e.edge.id === "lim")!;
    expect(lim.kind).toBe("limit");
    expect(lim.h).toBe(0);
    expect(lim.d.startsWith("M")).toBe(true);
    expect(lim.d).not.toContain("C");
    expect(NODE_W).toBe(12);
  });

  it("does not traverse a limit when tracing sources and uses", () => {
    expect([...connectedNodes(REAL, "nav")].sort()).toEqual(["add", "init", "nav", "pnl"]);
    expect([...connectedNodes(REAL, "bud")].sort()).toEqual(["btc", "bud", "head"]);
  });
});

describe("CapitalFlow", () => {
  it("draws every band, a dashed limit with its words, and the basis caption", () => {
    const { container } = render(<CapitalFlow label="Capital flow" blocks={[REAL]} basis={BASIS} />);
    expect(screen.getByRole("img", { name: "Capital flow" })).toBeTruthy();
    expect(container.querySelectorAll('[data-testid="flow-band"]')).toHaveLength(5);
    expect(container.querySelectorAll('[data-testid="flow-limit"]')).toHaveLength(1);
    expect(container.querySelector('[data-testid="flow-limit"] text')!.textContent).toBe("Limit, not cash");
    expect(screen.getByTestId("basis").textContent).toBe(`Basis: ${BASIS}`);
  });

  it("prints amounts from the published strings", () => {
    const { container } = render(<CapitalFlow label="Capital flow" blocks={[REAL]} basis={BASIS} />);
    const values = [...container.querySelectorAll(".exec-flow-val")].map((v) => v.textContent);
    expect(values).toContain("612,480.40");
    expect(values).toContain("+12,480.40");
    expect(values).toContain("Not published: canary envelope compliance, rollback checks and trial calendar");
    expect(container.textContent).not.toMatch(/[—–]/);
  });

  it("has an explicit unavailable node: hatched, worded, no band", () => {
    const { container } = render(<CapitalFlow label="Capital flow" blocks={[REAL]} basis={BASIS} />);
    const node = [...container.querySelectorAll('[data-testid="flow-node"]')].find((n) => n.getAttribute("data-id") === "src")!;
    expect(node.querySelector(".exec-flow-rect")!.getAttribute("data-hatch")).toBe("true");
    expect(node.textContent).toContain("Not published: canary envelope compliance, rollback checks and trial calendar");
  });

  it("draws simulated and real as separate blocks, never summed, simulated hatched", () => {
    const { container } = render(<CapitalFlow label="Capital flow" blocks={[REAL, SIM]} basis={BASIS} />);
    const blocks = container.querySelectorAll(".exec-flow-block");
    expect(blocks).toHaveLength(2);
    expect(blocks[1].querySelector(".exec-flow-head")!.textContent).toBe("Virtual funds · Simulated");
    expect(blocks[1].querySelectorAll(".exec-flow-band-hatch").length).toBeGreaterThan(0);
    expect(blocks[1].querySelector('.exec-flow-rect[data-sim="true"]')).not.toBeNull();
    expect(container.textContent).toContain("Blocks are never summed");
    expect(container.textContent).not.toContain("862,480.40");
    expect(container.textContent).not.toContain("862480.4");
  });

  it("traces upstream and downstream on hover and leaves a limit untraversed", () => {
    const { container } = render(<CapitalFlow label="Capital flow" blocks={[REAL]} basis={BASIS} />);
    const nav = [...container.querySelectorAll('[data-testid="flow-node"]')].find((n) => n.getAttribute("data-id") === "nav")!;
    fireEvent.mouseEnter(nav);
    const hi = [...container.querySelectorAll('[data-hi="true"]')].map((e) => e.getAttribute("data-id")).sort();
    expect(hi).toEqual(["add", "e1", "e2", "e3", "init", "nav", "pnl"]);
    expect(container.querySelector(".exec-flow-svg")!.getAttribute("data-dim")).toBe("true");
    expect(screen.getByTestId("flow-readout").textContent).toBe("NAV: 612,480.40");
    fireEvent.mouseLeave(nav);
    expect(container.querySelector(".exec-flow-svg")!.getAttribute("data-dim")).toBe("false");
  });

  it("gives keyboard users the same trace and the same selection through the table", () => {
    const onSelect = vi.fn();
    const { container } = render(<CapitalFlow label="Capital flow" blocks={[REAL]} basis={BASIS} onSelect={onSelect} />);
    const table = within(container.querySelector("details.exec-c2-table") as HTMLElement);
    const pick = table.getByRole("button", { name: "Approved budget" });
    fireEvent.focus(pick);
    expect([...container.querySelectorAll('[data-hi="true"]')].map((e) => e.getAttribute("data-id")).sort()).toEqual(["bud", "btc", "e4", "e5", "head"].sort());
    expect(screen.getByTestId("flow-readout").textContent).toBe("Approved budget: 700,000.00 · A limit set by the manager, not cash");
    fireEvent.click(pick);
    expect(onSelect).toHaveBeenCalledWith("bud");
    expect(table.getByText("Not cash")).toBeTruthy();
    expect(table.getAllByText("Not published: canary envelope compliance, rollback checks and trial calendar").length).toBeGreaterThan(0);
  });

  it("is an explicit unavailable state, with or without the structure", () => {
    const unavailable = { kind: "unavailable" as const, copy: "Not available", reason: "Source not qualified" };
    const plain = render(<CapitalFlow label="Capital flow" blocks={[REAL]} basis={BASIS} state={unavailable} />);
    expect(plain.container.querySelector("svg")).toBeNull();
    expect(screen.getByText("Source not qualified")).toBeTruthy();
    cleanup();
    const shape = render(<CapitalFlow label="Capital flow" blocks={[REAL]} basis={BASIS} state={unavailable} structureWhenUnavailable />);
    expect(shape.container.querySelectorAll('[data-testid="flow-band"]')).toHaveLength(0);
    expect(shape.container.querySelectorAll('.exec-flow-rect[data-hatch="true"]')).toHaveLength(8);
    expect(screen.getByTestId("structure-note").textContent).toBe("Not available · Source not qualified · Structure only, no amounts");
    // No amount leaks into a structure-only drawing.
    expect(shape.container.textContent).not.toMatch(/\d{3},\d{3}/);
  });

  it("falls back to the table alone beyond the node cap and says why", () => {
    const { container } = render(<CapitalFlow label="Capital flow" blocks={[REAL]} basis={BASIS} maxNodes={5} />);
    expect(container.querySelector("svg")).toBeNull();
    expect(screen.getByTestId("too-many").textContent).toContain("8 nodes are too many to draw legibly (limit 5)");
    expect(container.querySelector("details")!.hasAttribute("open")).toBe(true);
  });

  it("says nothing was published for an empty graph", () => {
    render(<CapitalFlow label="Capital flow" blocks={[]} basis={BASIS} />);
    expect(screen.getByText("No nodes published.")).toBeTruthy();
  });

  it("wears a Flag when partial and still draws", () => {
    const { container } = render(<CapitalFlow label="Capital flow" blocks={[REAL]} basis={BASIS} state={{ kind: "partial", reason: "Venue B margin missing" }} />);
    expect(container.querySelector('.exec-flag[data-k="partial"]')!.textContent).toContain("Venue B margin missing");
    expect(container.querySelectorAll('[data-testid="flow-band"]')).toHaveLength(5);
  });

  it("has a described summary and bounds the DOM: 60 nodes draw under the budget", () => {
    const many: FlowBlock = {
      id: "m",
      label: "Many",
      basis: "real",
      nodes: [
        { id: "root", label: "Root", column: 0, value: "6000.00" },
        ...Array.from({ length: 59 }, (_, i) => ({ id: `n${i}`, label: `Node ${i}`, column: 1, value: "100.00" })),
      ],
      edges: Array.from({ length: 59 }, (_, i) => ({ id: `x${i}`, from: "root", to: `n${i}`, value: "100.00" })),
    };
    const { container } = render(<CapitalFlow label="Capital flow" blocks={[many]} basis={BASIS} />);
    const img = screen.getByRole("img", { name: "Capital flow" });
    expect(container.querySelector(`#${img.getAttribute("aria-describedby")}`)!.textContent).toBe(`Capital flow. 60 nodes, 59 links in 1 block. Basis: ${BASIS}.`);
    // Budget: at most 20 elements per node (diagram, band and table row together); nodes are capped by maxNodes (80).
    expect(container.querySelectorAll("*").length).toBeLessThan(60 * 20);
  });
});
