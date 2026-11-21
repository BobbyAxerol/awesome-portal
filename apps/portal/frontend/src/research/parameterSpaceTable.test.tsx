import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PARAMETER_SPACE_CAPTION, ParameterSpaceTable, rowsFromDeclaration, rowsFromEntries } from "./ParameterSpaceTable";
import { parameterEntriesFrom } from "./runDraft";

const SPACE = {
  window: { kind: "int_range", low: 20, high: 60, step: 2 },
  mode: { kind: "categorical", values: ["a", "b"] },
  fixedp: { kind: "fixed", value: 3 },
} as const;

describe("ParameterSpaceTable", () => {
  it("prints the declaration: kind, range, step or no grid, and the caption", () => {
    render(<ParameterSpaceTable rows={rowsFromDeclaration(SPACE)!} />);
    expect(screen.getByText("int_range")).toBeTruthy();
    expect(screen.getByText("20 … 60")).toBeTruthy();
    expect(screen.getByText("[a, b]")).toBeTruthy();
    expect(document.querySelector("[data-parameter-step='mode']")?.textContent).toBe("no grid");
    expect(screen.getByText(PARAMETER_SPACE_CAPTION)).toBeTruthy();
    expect(document.querySelector("th:last-child")?.textContent).not.toBe("status");
  });

  it("an unreadable declaration shape is shown raw, with its kind as typed absence", () => {
    render(<ParameterSpaceTable rows={rowsFromDeclaration({ x: [5, 30] })!} />);
    expect(screen.getByText("[5,30]")).toBeTruthy();
    expect(screen.getByText("not published")).toBeTruthy();
  });

  it("a draft's rows carry swept / pinned as the draft holds them", () => {
    const entries = parameterEntriesFrom(SPACE as never).map((entry) => (entry.name === "window" ? { ...entry, dimension: "pin" as const, low: "30" } : entry));
    render(<ParameterSpaceTable rows={rowsFromEntries(entries)} />);
    expect(document.querySelector("[data-parameter-status='window']")?.textContent).toBe("pinned 30");
    expect(document.querySelector("[data-parameter-status='mode']")?.textContent).toMatch(/^swept /);
  });
});
