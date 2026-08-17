/**
 * Chart production contract tests (v0.5 §12.2).
 *
 * The failure these guard against is a chart that looks more complete than it
 * is: a reduced series drawn without saying so, a client-side top-N presented
 * as if it were the whole artifact, or a downsample method asserted that the
 * frontend never actually knew.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ChartFigure } from "../../components/ChartFigure";
import type { SeriesPayload } from "../../lib/api";
import { seriesProvenance, tableProvenance, type RunEvidence } from "./provenance";

afterEach(cleanup);

const run: RunEvidence = {
  runId: "run-123",
  asOf: "2026-08-15T18:00:00Z",
  digest: "sha256:4117b87006525d576aef7559c001002f18ea9f78e9fa83c64187d2776f4e9d18",
};

function series(overrides: Partial<SeriesPayload> = {}): SeriesPayload {
  return {
    segment: "oos",
    timestamps: [],
    series: {},
    source_rows: 128_400,
    returned_rows: 5_000,
    downsample_stride: 26,
    ...overrides,
  };
}

/** Renders a figure and returns its provenance line. */
function provenanceLine(node: React.ReactElement): string {
  const { container } = render(node);
  return container.querySelector(".chart-provenance")?.textContent ?? "";
}

describe("seriesProvenance", () => {
  it("reports the server's own row counts and stride", () => {
    const provenance = seriesProvenance(series(), run, { source: "series/oos" });
    expect(provenance.sourceRows).toBe(128_400);
    expect(provenance.returnedRows).toBe(5_000);
    expect(provenance.downsample).toBe("server stride 26");
  });

  it("claims no downsample when the server did not thin the payload", () => {
    const untouched = series({ source_rows: 900, returned_rows: 900, downsample_stride: 1 });
    expect(seriesProvenance(untouched, run, { source: "series/is" }).downsample).toBeNull();
  });

  it("reports unknown row counts as null, not zero, before the payload arrives", () => {
    // "Not loaded" is not "no rows"; a 0/0 would read as an empty artifact.
    const provenance = seriesProvenance(undefined, run, { source: "series/oos" });
    expect(provenance.sourceRows).toBeNull();
    expect(provenance.returnedRows).toBeNull();
  });

  it("falls back to the payload's own segment when the caller names none", () => {
    expect(seriesProvenance(series(), run, { source: "series/oos" }).segment).toBe("oos");
  });
});

describe("tableProvenance", () => {
  it("names the client-side reduction when fewer rows are drawn than fetched", () => {
    const provenance = tableProvenance(run, {
      source: "wfo/trials.parquet",
      available: 5_000,
      plotted: 200,
      reduction: "client top-200 theo objective",
    });
    expect(provenance.downsample).toBe("client top-200 theo objective");
  });

  it("claims no reduction when every fetched row is drawn", () => {
    const provenance = tableProvenance(run, {
      source: "wfo/candidates.parquet",
      available: 42,
      plotted: 42,
      reduction: "unused",
    });
    expect(provenance.downsample).toBeNull();
  });

  it("still admits a reduction when the caller forgot to name it", () => {
    const provenance = tableProvenance(run, {
      source: "wfo/trials.parquet",
      available: 5_000,
      plotted: 200,
    });
    expect(provenance.downsample).toBe("client-side subset");
  });
});

describe("rendered provenance line", () => {
  it("prints source, segment, units, timezone, as-of, rows and reduction", () => {
    const text = provenanceLine(
      <ChartFigure
        figNumber={1}
        title="Equity"
        provenance={seriesProvenance(series(), run, { source: "series/oos", units: "USD" })}
      >
        <div />
      </ChartFigure>,
    );
    expect(text).toContain("nguồn series/oos");
    expect(text).toContain("segment oos");
    expect(text).toContain("đơn vị USD");
    expect(text).toContain("timezone UTC");
    expect(text).toContain("as-of 2026-08-15T18:00:00Z");
    expect(text).toContain("5000/128400 điểm");
    expect(text).toContain("giảm điểm: server stride 26");
    expect(text).toContain("digest sha256:4117b8700652");
  });

  it("says the as-of is unpublished instead of omitting the line", () => {
    const text = provenanceLine(
      <ChartFigure
        figNumber={1}
        title="Equity"
        provenance={seriesProvenance(series(), { ...run, asOf: null }, { source: "series/oos" })}
      >
        <div />
      </ChartFigure>,
    );
    expect(text).toContain("as-of chưa công bố");
  });

  it("never guesses the reduction method when rows differ but none was named", () => {
    // The previous line hard-coded "server max_points", asserting a method the
    // frontend had no way to know.
    const text = provenanceLine(
      <ChartFigure
        figNumber={1}
        title="Trials"
        provenance={{ source: "wfo/trials.parquet", sourceRows: 900, returnedRows: 200 }}
      >
        <div />
      </ChartFigure>,
    );
    expect(text).toContain("giảm điểm: chưa rõ phương pháp");
    expect(text).not.toContain("max_points");
  });

  it("surfaces data-quality warnings alongside the chart", () => {
    const { container } = render(
      <ChartFigure
        figNumber={1}
        title="Trials"
        provenance={tableProvenance(
          { ...run, warnings: ["Server trả tối đa 5000 trial theo objective."] },
          { source: "wfo/trials.parquet", available: 5_000, plotted: 5_000 },
        )}
      >
        <div />
      </ChartFigure>,
    );
    expect(container.querySelector(".chart-warnings")?.textContent).toContain("tối đa 5000 trial");
  });
});
