/**
 * ManagerSeriesPanel for a RETURN (FE-013, BE-P8): the scale the source states decides what is printed. Lane: FIXTURE_LAB; the bodies are
 * the published return fixtures read through the real reader, never hand-built objects.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { readManagerSeries, type ManagerSeries } from "../../readers/managerSeries";
import { fixtureValue, FIXTURE_RETURN, FIXTURE_RETURN_UNSCALED, withComparison } from "../../readers/managerSeries.testbase";
import { ManagerSeriesPanel } from "./ManagerSeriesPanel";

afterEach(cleanup);

const readSeries = (raw: unknown): ManagerSeries => {
  const result = readManagerSeries(raw);
  if (result === null || result.kind !== "series") throw new Error("expected a series");
  return result.series;
};
const oneSubject = (name: string, change: (body: ReturnType<typeof fixtureValue>) => void = () => {}) => {
  const body = fixtureValue(name);
  body.series = [body.series[0]];
  change(body);
  return readSeries(withComparison(body));
};

describe("ManagerSeriesPanel · RETURN", () => {
  it("a FRACTION is shown in percent (the point is moved in the string) and the caption says how", () => {
    const { container } = render(<ManagerSeriesPanel label="Portfolio return" read={{ phase: "ready", value: oneSubject(FIXTURE_RETURN), warnings: [] }} />);
    expect(screen.getByTestId("series-caption").textContent).toContain("Return, a ratio stated as a fraction (1.0 is 100%), shown in %");
    expect(container.textContent).toContain("%");
    // The published 0.0123 is never printed as a bare ratio.
    expect(container.textContent).not.toContain("0.0123");
  });

  it("a PERCENT is shown as published with the percent sign", () => {
    const value = oneSubject(FIXTURE_RETURN, (body) => { body.series[0].ratio_scale = "PERCENT"; body.series[0].points[1].value = "1.23"; });
    const { container } = render(<ManagerSeriesPanel label="Portfolio return" read={{ phase: "ready", value, warnings: [] }} />);
    expect(screen.getByTestId("series-caption").textContent).toContain("Return, a ratio stated as percent (100 is 100%)");
    expect(container.textContent).toContain("%");
  });

  it("a source that states no scale is the typed cell 'Not published' with the reason, and nothing is drawn", () => {
    const value = readSeries(fixtureValue(FIXTURE_RETURN_UNSCALED));
    const { container } = render(<ManagerSeriesPanel label="Portfolio return" read={{ phase: "ready", value, warnings: [] }} />);
    expect(container.querySelector("[data-state='UNAVAILABLE']")).not.toBeNull();
    expect(container.textContent).toContain("Not published");
    // UI review D12: the code is data-code on the chart, not part of the sentence.
    expect(container.querySelector('[data-code~="RATIO_SCALE_NOT_PUBLISHED"]')).not.toBeNull();
    expect(container.textContent).not.toContain("RATIO_SCALE_NOT_PUBLISHED");
    expect(container.textContent).toContain("states no ratio scale");
    expect(container.querySelectorAll("svg path")).toHaveLength(0);
  });
});
