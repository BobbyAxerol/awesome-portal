/** The bounded native optimization summary, from the published fixture: exact values, honest boundary, one component for every screen. */
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { NativeExecutionPanel, type NativeExecution } from "./NativeExecutionPanel";
import { NativeOptimizationSummary, type NativeOptimizationFacts } from "./NativeOptimizationSummary";

afterEach(cleanup);

const FIXTURE = JSON.parse(readFileSync(join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures", "research-native-optimization-result.valid.json"), "utf8")) as NativeExecution & { optimization: NativeOptimizationFacts };

describe("native optimization summary", () => {
  it("prints the engine's facts exactly as served and says what it is not", () => {
    const { container } = render(<NativeOptimizationSummary optimization={FIXTURE.optimization} />);
    const fact = (id: string) => container.querySelector(`[data-optimization-fact="${id}"] dd`)!.textContent;
    expect(fact("authority")).toBe("pinned QuantBT native optimizer · in-sample Sharpe");
    expect(fact("method")).toBe("QuantBT generic robust plateau — not the scalar Walk-forward algorithm");
    expect(fact("scope")).toBe("warm-up + in-sample window only");
    expect(fact("holdout")).toBe("not used");
    expect(fact("trials")).toBe("100 requested · 100 completed · 100 retained");
    expect(fact("distinct")).toBe("98");
    /* the engine's 0-based trial number and the exact decimal objective, never reformatted */
    expect(fact("selected")).toBe("trial 41 · sharpe 4.0101541621991");
    expect(fact("window")).toBe("2026-05-19 12:00Z → 2026-08-03 00:00Z (end excluded)");
    const params = Object.fromEntries([...container.querySelectorAll("[data-optimization-parameter]")].map((node) => [node.getAttribute("data-optimization-parameter"), node.getAttribute("data-exact")]));
    expect(params).toEqual(FIXTURE.optimization.selected_parameters);
    const boundary = container.querySelector("[data-optimization-boundary]")!;
    expect(boundary.textContent).toContain("sealed separately");
    expect(boundary.textContent).toContain("not published for this recipe");
    expect(boundary.querySelector("[title]")!.getAttribute("title")).toBe(FIXTURE.optimization.sha256);
  });

  it("the native panel shows the summary instead of 'not applicable — fixed input' when the server published one", () => {
    const { container } = render(<NativeExecutionPanel native={FIXTURE} />);
    expect(container.querySelector("[data-native-optimization]")).not.toBeNull();
    expect(container.querySelector('[data-native-fact="optimizer"]')!.textContent).toContain("pinned QuantBT native optimizer");
    expect(container.textContent).not.toContain("not applicable — fixed input");
  });

  it("a fixed native run (no optimization) keeps its old words and draws no summary", () => {
    const { optimization: _omit, ...fixed } = FIXTURE;
    const { container } = render(<NativeExecutionPanel native={fixed as NativeExecution} />);
    expect(container.querySelector("[data-native-optimization]")).toBeNull();
    expect(container.querySelector('[data-native-fact="optimizer"]')!.textContent).toContain("not applicable — fixed input, not a scalar optimizer");
  });
});
