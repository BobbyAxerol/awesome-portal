import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { RetainedWindowPanel } from "./EvidenceFlow";
import type { CurrentSourceEvidence } from "./evidenceClient";
import { drawdownOption, equityOption } from "./EvidenceCharts";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Source fixture data only; real API/browser evidence is recorded separately.
const views = JSON.parse(readFileSync(resolve(process.cwd(), "../../../packages/contracts/fixtures/research-current-source.window-views.valid.json"), "utf8"));
const protocol = JSON.parse(readFileSync(resolve(process.cwd(), "../../../packages/contracts/fixtures/research-full02.protocol-disclosure.synthetic.valid.json"), "utf8")).protocol;
const sourceBase = JSON.parse(readFileSync(resolve(process.cwd(), "../../../packages/contracts/fixtures/research-current-source.split.valid.json"), "utf8"));
afterEach(cleanup);
const source = (overrides = {}): CurrentSourceEvidence => ({ ...sourceBase, window_views: views, ...overrides });
describe("Overview current window binding", () => {
  it("binds the current fold's IS facts, preserving null and separate-window meaning", () => {
    const second = { ...views.is.folds[0], source_ordinal: 1, fold_id: "engine-id-not-ordinal", is_sharpe: null, is_trade_count: "0", last_bar_utc_ms: 30 };
    const evidence = source({ window_views: { ...views, is: { ...views.is, folds: [...views.is.folds, second] } } });
    const { container, rerender } = render(<MemoryRouter><RetainedWindowPanel evidence={evidence} window="is" fold={1} /></MemoryRouter>);
    expect(screen.getByText("0.23")).toBeDefined();
    rerender(<MemoryRouter><RetainedWindowPanel evidence={evidence} window="is" fold={2} /></MemoryRouter>);
    expect(container.querySelector('[data-window-fold="2"]')).not.toBeNull();
    expect(container.textContent).toContain("not published");
    expect(container.textContent).toContain("not one combined IS account");
    expect(container.querySelector('[data-metric-value="TRADE_COUNT"]')?.getAttribute("data-exact")).toBe("0");
    expect(container.textContent).not.toContain("0.23");
  });
  it("never relabels OOS points or manufactures a Holdout payload", () => {
    const { container } = render(<MemoryRouter><RetainedWindowPanel evidence={source()} window="holdout" fold={1} /></MemoryRouter>);
    expect(container.innerHTML).toBe("");
    const points = protocol.window_series.is;
    expect((equityOption(points, [], [], { windowLabel: "IS" }) as any).series[0].name).toBe("IS equity");
    expect((drawdownOption(protocol.window_series.holdout, [], { windowLabel: "Holdout" }) as any).series[0].name).toBe("Holdout drawdown");
  });
});
