/**
 * B10 IS_FACTS - binding Codex's optional `by_window.is` (B8 `8fc17a03`) on S04 / S09.
 *
 * TEST DATA: the canonical `research-enriched-analysis.fixed-is` fixture (published, read with readFileSync) and the
 * canonical `healthy` fixture (WFO: no `by_window`). Malformed cases are typed mutations of the fixed-is fixture.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { IsWindowPanel, isTiles } from "./enrichedPanels";
import { AllTimeSupplement } from "./ReportAllTime";
import { readEnrichedAnalysis, readIsFacts, type EnrichedAnalysis } from "./enrichedAnalysis";
import { fixedIs, healthy } from "./enrichedAnalysis.fixtures";

afterEach(cleanup);

describe("B10 IS facts (by_window.is)", () => {
  it("the canonical fixed-is block passes the guard and reads as three IS-scoped rows", () => {
    expect(readEnrichedAnalysis(fixedIs()).kind).toBe("block");
    const read = readIsFacts(fixedIs());
    expect(read.kind).toBe("available");
    if (read.kind !== "available") return;
    expect(read.rows.map((r) => r.key)).toEqual(["return_fraction", "sharpe", "max_drawdown_fraction"]);
    for (const row of read.rows) {
      expect(row.fact.scope).toBe("IS");
      expect(row.title).toContain("start inclusive, end exclusive");
      expect(row.title).toContain("FULL_SOURCE_IS");
      expect(row.title).toContain("never summed or substituted");
    }
    expect(read.rows[0]!.title).toContain("FIRST_LAST_DECLARED_IS_EQUITY_V1");
  });

  it("S09 shows IS cells beside, not instead of, the OOS cells; values are the served ones", () => {
    const block = fixedIs();
    const { container } = render(<AllTimeSupplement read={{ kind: "block", block }} />);
    expect(container.querySelector("[data-all-time-facts]")?.getAttribute("data-is-facts")).toBe("available");
    const isCells = container.querySelectorAll("[data-fact-scope='IS']");
    expect(isCells).toHaveLength(3);
    const sharpe = container.querySelector("[data-all-time-fact='IS Sharpe'] dd") as HTMLElement;
    expect(sharpe.getAttribute("data-exact")).toBe(block.by_window!.is.facts.metrics.sharpe.value);
    expect(sharpe.textContent).toBe("3.585");
    const dd = container.querySelector("[data-all-time-fact='IS max DD'] dd") as HTMLElement;
    expect(dd.textContent?.startsWith("−")).toBe(true);
    // OOS Sharpe cell is still there and distinct.
    expect(container.querySelector("[data-all-time-fact='Sharpe'] dd")?.getAttribute("data-exact")).toBe(block.facts.metrics.sharpe.value);
    // No IS Sharpe decay is invented.
    expect(container.textContent).not.toMatch(/IS .*decay/i);
  });

  it("omitted by_window (WFO / historical) is absent with the served windows.is reason: no IS cell, no tile", () => {
    const block = healthy();
    const read = readIsFacts(block);
    expect(read).toEqual({ kind: "absent", state: block.windows.is.state === "NOT_APPLICABLE" ? "NOT_APPLICABLE" : "NOT_PUBLISHED", reason_code: block.windows.is.state === "AVAILABLE" ? null : block.windows.is.reason_code });
    expect(isTiles(read)).toHaveLength(0);
    const { container } = render(<AllTimeSupplement read={{ kind: "block", block }} />);
    expect(container.querySelectorAll("[data-fact-scope='IS']")).toHaveLength(0);
    expect(container.querySelector("[data-all-time-facts]")?.getAttribute("data-is-facts")).toBe("absent");
  });

  it("the IS window panel says not published with the served reason, never 0 or AVAILABLE", () => {
    const block: EnrichedAnalysis = healthy();
    (block.windows as { is: unknown }).is = { state: "NOT_PUBLISHED", reason_code: "RETAINED_NO_IS_ACCOUNT_PAYLOAD" };
    const read = readIsFacts(block);
    const { container } = render(<IsWindowPanel read={read} />);
    const node = container.querySelector("[data-is-window='absent']") as HTMLElement;
    expect(node.getAttribute("data-reason-code")).toBe("RETAINED_NO_IS_ACCOUNT_PAYLOAD");
    expect(node.textContent).toMatch(/not published/i);
    expect(node.textContent).not.toMatch(/^0|AVAILABLE/);
  });

  it("a window AVAILABLE by bounds without a payload is still absent, not AVAILABLE facts", () => {
    const block = fixedIs();
    delete (block as { by_window?: unknown }).by_window;
    const read = readIsFacts(block);
    expect(read.kind).toBe("absent");
  });

  it("a malformed IS payload is refused locally and does not touch the OOS block", () => {
    const block = fixedIs();
    (block.by_window!.is.facts.metrics.sharpe as { scope: string }).scope = "OOS";
    expect(readEnrichedAnalysis(block).kind).toBe("block");
    const read = readIsFacts(block);
    expect(read).toEqual({ kind: "refused", detail: "by_window.is.facts.sharpe" });
    const { container } = render(<IsWindowPanel read={read} />);
    expect(container.querySelector("[data-is-window='refused']")).not.toBeNull();
  });

  it("the IS window panel prints the three tiles and its scope line", () => {
    const { container } = render(<IsWindowPanel read={readIsFacts(fixedIs())} />);
    expect(container.querySelectorAll("[data-metric-lane='is']")).toHaveLength(3);
    expect(container.querySelector("[data-is-window-scope]")?.textContent).toContain("35 observations");
  });
});
