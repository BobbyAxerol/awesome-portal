/**
 * EL-V2-02 — the shared anatomy behaves, not merely renders.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ExecutionContextRail,
  ExecutionDecisionStrip,
  ExecutionPageHeader,
  ExecutionProvenanceDrawer,
  ExecutionTabs,
  ExecutionTerminal,
  shortDigest,
  type TerminalRow,
} from "./components/workspace";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "#");
});

const TABS = [
  { key: "a", label: "Alpha" },
  { key: "b", label: "Beta", count: 3 },
  { key: "c", label: "Gamma" },
];

describe("ExecutionTabs", () => {
  it("switches the panel, updates aria state and mirrors the selection into the hash", () => {
    function Host() {
      const [t, setT] = useState("a");
      return (
        <ExecutionTabs tabs={TABS} active={t} onChange={setT} urlKey="s">
          <span data-testid="panel">{t}</span>
        </ExecutionTabs>
      );
    }
    render(<Host />);
    expect(screen.getByTestId("panel").textContent).toBe("a");
    fireEvent.click(screen.getByRole("tab", { name: /Beta/ }));
    expect(screen.getByTestId("panel").textContent).toBe("b");
    expect(screen.getByRole("tab", { name: /Beta/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: /Alpha/ }).getAttribute("aria-selected")).toBe("false");
    expect(window.location.hash).toContain("s=b");
    // The panel is labelled by the active tab — a click that changed content
    // without changing accessible state is the failure §6.2 names.
    const panel = screen.getByRole("tabpanel");
    expect(panel.getAttribute("aria-labelledby")).toBe(screen.getByRole("tab", { name: /Beta/ }).id);
  });

  it("deep-links in from the hash on mount", () => {
    window.history.replaceState(null, "", "#s=c");
    const onChange = vi.fn();
    render(
      <ExecutionTabs tabs={TABS} active="a" onChange={onChange} urlKey="s">
        <span />
      </ExecutionTabs>,
    );
    expect(onChange).toHaveBeenCalledWith("c");
  });

  it("moves with the arrow keys and wraps", () => {
    const onChange = vi.fn();
    render(
      <ExecutionTabs tabs={TABS} active="c" onChange={onChange}>
        <span />
      </ExecutionTabs>,
    );
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("a");
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("shows a count only when one is given", () => {
    render(
      <ExecutionTabs tabs={TABS} active="a" onChange={() => undefined}>
        <span />
      </ExecutionTabs>,
    );
    expect(screen.getByRole("tab", { name: /Beta/ }).textContent).toContain("3");
    expect(screen.getByRole("tab", { name: /Alpha/ }).textContent).not.toMatch(/\d/);
  });
});

describe("ExecutionDecisionStrip", () => {
  it("never renders an unpublished value as a number", () => {
    render(<ExecutionDecisionStrip metrics={[{ label: "Age", value: null }, { label: "Equity", value: "1.00", unit: "USDT" }]} />);
    expect(screen.getByText("not published")).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
    // The unit sits in the meta role, never inside the digits.
    expect(screen.getByText("USDT").className).toContain("exec-role-meta");
  });
});

describe("ExecutionPageHeader", () => {
  it("keeps the four state axes as separate badges", () => {
    render(
      <ExecutionPageHeader
        title="Carry v3.2"
        id="dep_74"
        badges={[
          { label: "PAPER_OBSERVATION", axis: "stage" },
          { label: "ACTIVE", axis: "runtime" },
          { label: "READY", axis: "readiness" },
          { label: "SYNC OK", axis: "broker-sync" },
        ]}
      />,
    );
    const axes = [...document.querySelectorAll("[data-axis]")].map((n) => n.getAttribute("data-axis"));
    expect(axes).toEqual(["stage", "runtime", "readiness", "broker-sync"]);
    expect(screen.getByRole("heading", { level: 1 }).className).toContain("exec-role-title");
  });
});

describe("ExecutionContextRail", () => {
  it("orders its sections next → blockers → freshness → alerts → provenance", () => {
    render(
      <ExecutionContextRail
        next={{ title: "Next" }}
        blockers={[{ label: "x", severity: "blocking" }]}
        freshness={<span>f</span>}
        alerts={<span>a</span>}
        provenance={<span>p</span>}
      />,
    );
    const order = [...document.querySelectorAll("[data-section]")].map((n) => n.getAttribute("data-section"));
    expect(order).toEqual(["next", "blockers", "freshness", "alerts", "provenance"]);
  });

  it("names blockers rather than counting them", () => {
    render(<ExecutionContextRail next={{ title: "Next" }} blockers={[{ label: "broker sync stale", severity: "blocking" }]} />);
    expect(screen.getByText("broker sync stale")).toBeTruthy();
    expect(screen.getByText("BLOCKING")).toBeTruthy();
  });
});

describe("ExecutionProvenanceDrawer", () => {
  it("shortens a digest to head-6 tail-2 and never prints the full value by default", () => {
    const full = "sha256:9f3c1a7b2e4d5c6f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1e2";
    expect(shortDigest(full)).toBe("sha256:9f3c1a…e2");
    const onCopy = vi.fn();
    render(<ExecutionProvenanceDrawer items={[{ label: "artifact", short: shortDigest(full), full }]} onCopy={onCopy} />);
    expect(document.body.textContent).not.toContain("9f3c1a7b2e4d");
    fireEvent.click(screen.getByRole("button", { name: /Copy full artifact/ }));
    expect(onCopy).toHaveBeenCalledWith(full);
  });
});

describe("ExecutionTerminal", () => {
  const rows: TerminalRow[] = [
    { ts: "10:00:00.000", phase: "APPLY", object: "op_1", message: "202 accepted", severity: "warn" },
  ];
  const handlers = () => ({
    onToggleFollow: vi.fn(),
    onCopy: vi.fn(),
    onExport: vi.fn(),
    onClear: vi.fn(),
  });

  it("cannot call a 202 success", () => {
    const h = handlers();
    render(<ExecutionTerminal title="t" rows={rows} verdict="ACCEPTED" source="s" following {...h} />);
    const verdict = document.querySelector(".exec-term-verdict")!;
    expect(verdict.textContent).toMatch(/not success/);
    expect(verdict.textContent).not.toMatch(/VERIFIED/);
  });

  it.each(["PARTIAL", "UNCERTAIN", "FAILED", "PENDING"] as const)("says %s in words, never green-by-colour alone", (v) => {
    const h = handlers();
    render(<ExecutionTerminal title="t" rows={rows} verdict={v} source="s" following {...h} />);
    expect(document.querySelector(".exec-term-verdict")!.textContent).toContain(v === "PENDING" ? "pending" : v);
  });

  it("renders severity as text and icon, not colour alone", () => {
    const h = handlers();
    render(<ExecutionTerminal title="t" rows={rows} verdict="PENDING" source="s" following {...h} />);
    expect(screen.getByLabelText("warn").textContent).toContain("! WARN");
  });

  it("wires follow/pause, copy full, export and clear to their handlers", () => {
    const h = handlers();
    render(<ExecutionTerminal title="t" rows={rows} verdict="PENDING" source="s" following {...h} />);
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(h.onToggleFollow).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Copy full" }));
    expect(h.onCopy).toHaveBeenCalledWith(expect.stringContaining("op_1"));
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(h.onExport).toHaveBeenCalledWith(rows);
    fireEvent.click(screen.getByRole("button", { name: "Clear view" }));
    expect(h.onClear).toHaveBeenCalled();
  });

  it("types a gap as a row, not a hidden console error", () => {
    const h = handlers();
    render(<ExecutionTerminal title="t" rows={[{ ts: "1", phase: "GAP", object: "stream", message: "gap 4,412 → 4,415", severity: "warn" }]} verdict="PENDING" source="s" following {...h} />);
    expect(document.querySelector('[data-phase="GAP"]')).not.toBeNull();
  });
});

describe("required handlers are required in the type", () => {
  it("does not compile a tab strip without onChange", () => {
    // @ts-expect-error — EL-V2-03 principle applied early: no enabled control without a handler.
    const bad = <ExecutionTabs tabs={TABS} active="a"><span /></ExecutionTabs>;
    expect(bad).toBeTruthy();
  });
});
