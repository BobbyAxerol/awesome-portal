import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RunDeclarationRead, rowsForRunDeclaration, type RunDeclaration } from "./RunDeclarationRead";

const fact: RunDeclaration = {
  schema_version: "research.run-declaration.v1", state: "AVAILABLE", reason_code: null,
  source_ref: "IMMUTABLE_RUN_REQUEST_AND_ALPHA_VERSION_DECLARATION_V1",
  alpha_binding: { alpha_id: "imported-alpha", alpha_version_id: "av_historical_0_1_0" },
  declaration_digest: "a".repeat(64), requested_spec_digest: "b".repeat(64),
  declaration: { schema_version: "research.alpha-version-declaration.v1", entrypoint: "strategy.build", timeframes: ["1h", "4h"], required_columns: ["close"], warmup_bars: 12,
    determinism: { seed_required: true }, parameter_space: {
      window: { kind: "int_range", low: 8, high: 64, step: 2 },
      risk: { kind: "float_range", low: 0.1, high: 0.5, step: 0.05 },
      side: { kind: "categorical", values: ["buy", "sell"] },
      fixed_flag: { kind: "fixed", value: false },
    } },
  requested_overrides: [{ kind: "pin", name: "window", value: 16 }, { kind: "sweep", name: "risk", low: 0.2, high: 0.4 }],
};
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("run-bound read-only declaration", () => {
  it("renders Claude parameter grammar from the immutable version with exact explicit request statuses", () => {
    const { container } = render(<RunDeclarationRead fact={fact} />);
    expect(container.querySelectorAll("[data-parameter-row]")).toHaveLength(4);
    expect(container.querySelector('[data-parameter-status="window"]')?.textContent).toBe("pinned 16");
    expect(container.querySelector('[data-parameter-status="risk"]')?.textContent).toBe("swept 0.2 … 0.4");
    expect(container.querySelector('[data-parameter-status="side"]')?.textContent).toBe("");
    expect(container.querySelector('[data-parameter-row="fixed_flag"]')?.textContent).toContain("false");
    expect(container.querySelector('[data-run-declaration-chips]')?.textContent).toContain("imported-alpha · av_historical_0_1_0");
    expect(container.querySelector('[data-declared-timeframes]')?.textContent).toBe("1h · 4h");
    expect(container.querySelector('[data-declared-seed]')?.textContent).toBe("fixed seed required");
    expect(container.querySelector('[data-run-declaration]')?.getAttribute("data-declaration-digest")).toBe(fact.declaration_digest);
    expect(container.querySelectorAll("input,select,button")).toHaveLength(0);
  });
  it("optional legacy field adds no layout or invented declaration", () => {
    expect(render(<RunDeclarationRead />).container.innerHTML).toBe("");
  });
  it.each(["NOT_PUBLISHED", "NOT_APPLICABLE"] as const)("%s is explicit and never promoted to available/zero", state => {
    const absent: RunDeclaration = { ...fact, state, reason_code: "P24_RUN_BOUND_ALPHA_VERSION_DECLARATION_NOT_RECORDED", alpha_binding: null,
      declaration_digest: null, declaration: null, requested_overrides: null };
    expect(rowsForRunDeclaration(absent)).toBeNull();
    const { container } = render(<RunDeclarationRead fact={absent} />);
    expect(container.querySelectorAll("[data-parameter-row]")).toHaveLength(0);
    expect(container.querySelector("[data-declaration-absence]")?.getAttribute("title")).toContain(absent.source_ref);
    expect(container.textContent).toContain(state === "NOT_APPLICABLE" ? "not applicable" : "not published");
  });
  it("switching facts never carries the preceding run's pins or alpha identity", () => {
    const { container, rerender } = render(<RunDeclarationRead fact={fact} />);
    rerender(<RunDeclarationRead fact={{ ...fact, alpha_binding: { alpha_id: "other-alpha", alpha_version_id: "av_other" }, requested_overrides: [] }} />);
    expect(container.textContent).not.toContain("pinned 16");
    expect(container.textContent).not.toContain("av_historical");
    expect(container.textContent).toContain("av_other");
  });
  it("the table is prop-only: mounting/opening never asks Registry, executes or writes", () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const { container } = render(<RunDeclarationRead fact={fact} />);
    container.querySelector("details")!.open = true;
    expect(fetch).not.toHaveBeenCalled();
  });
});
