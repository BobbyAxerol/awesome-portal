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
import { FoldGantt } from "../../components/FoldGantt";
import type { SeriesPayload } from "../../lib/api";
import { seriesProvenance, tableProvenance, rowPopulation, type RunEvidence } from "./provenance";

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

/**
 * Renders a figure and returns its provenance envelope as `label value` pairs.
 *
 * The envelope is a label/value grid rather than one joined sentence, so the
 * assertions below read the pairs instead of substring-matching a line.
 */
function provenanceLine(node: React.ReactElement): string {
  const { container } = render(node);
  const root = container.querySelector(".chart-provenance");
  if (!root) return "";
  const fields = Array.from(root.querySelectorAll(".chart-provenance-field")).map(
    (field) =>
      `${field.querySelector("dt")?.textContent ?? ""} ${field.querySelector("dd")?.textContent ?? ""}`,
  );
  const warnings = Array.from(root.querySelectorAll(".chart-warnings li")).map(
    (item) => item.textContent ?? "",
  );
  return [...fields, ...warnings].join(" · ");
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
    expect(text).toContain("source series/oos");
    expect(text).toContain("segment oos");
    expect(text).toContain("units USD");
    expect(text).toContain("timezone UTC");
    expect(text).toContain("as-of 2026-08-15T18:00:00Z");
    expect(text).toContain("points 5000/128400");
    expect(text).toContain("reduction server stride 26");
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
    expect(text).toContain("as-of not published");
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
    expect(text).toContain("reduction method unknown");
    expect(text).not.toContain("max_points");
  });

  it("surfaces data-quality warnings alongside the chart", () => {
    const { container } = render(
      <ChartFigure
        figNumber={1}
        title="Trials"
        provenance={tableProvenance(
          { ...run, warnings: ["The server returned at most 5000 trials by objective."] },
          { source: "wfo/trials.parquet", available: 5_000, plotted: 5_000 },
        )}
      >
        <div />
      </ChartFigure>,
    );
    expect(container.querySelector(".chart-warnings")?.textContent).toContain("at most 5000 trials");
  });
});

/* -------------------------------------------------------------------------
 * Fold plan provenance
 * ---------------------------------------------------------------------- */

describe("FoldPlanProvenance", () => {
  const threeWindow = {
    protocol: "three_window_decay",
    folds: [
      { fold_id: 0, role: "is", start: "2024-01-01T00:00:00Z", end: "2024-06-01T00:00:00Z" },
      { fold_id: 1, role: "oos", start: "2024-06-01T00:00:00Z", end: "2024-09-01T00:00:00Z" },
    ],
  };

  it("cites as-of and the analysis-frame digest when the plan carries them", () => {
    const { container } = render(
      <FoldGantt
        plan={{
          ...threeWindow,
          producer: {
            service: "portal-api",
            artifact: "fold_plan.json",
            version: "0.1.0",
            as_of: "2026-08-17T05:00:00+00:00",
            source_artifact_digest: "sha256:1f0e3dad99908345f7439f8ffabdffc4",
          },
        }}
        studyStarts={0}
        bestByStudy={[]}
        running={false}
      />,
    );
    const line = container.querySelector(".chart-provenance")?.textContent ?? "";
    expect(line).toContain("source config/fold_plan.json");
    expect(line).toContain("protocol three_window_decay");
    expect(line).toContain("2 fold");
    expect(line).toContain("as-of 2026-08-17T05:00:00+00:00");
    expect(line).toContain("analysis frame sha256:1f0e3dad9990");
  });

  it("says the provenance is unpublished for a plan written before it existed", () => {
    // The fields are additive, so an older artifact has neither. Omitting the
    // line would read as "no provenance needed".
    const { container } = render(
      <FoldGantt plan={threeWindow} studyStarts={0} bestByStudy={[]} running={false} />,
    );
    const line = container.querySelector(".chart-provenance")?.textContent ?? "";
    expect(line).toContain("as-of not published");
    expect(line).toContain("analysis-frame digest not published");
  });
});

describe("rowPopulation", () => {
  it("reads truncation from the envelope", () => {
    expect(rowPopulation({ total_rows: 42_000, returned_rows: 5_000, rows: [] })).toEqual({
      total: 42_000,
      returned: 5_000,
      truncated: true,
    });
  });

  it("does not call a full artifact truncated just because it fills the page", () => {
    // This is the case the old `rows.length >= top_n` inference got wrong: a run
    // holding exactly the cap was warned about as if trials were missing.
    expect(rowPopulation({ total_rows: 5_000, returned_rows: 5_000, rows: [] })).toEqual({
      total: 5_000,
      returned: 5_000,
      truncated: false,
    });
  });

  it("claims nothing about the population before the payload arrives", () => {
    expect(rowPopulation(undefined)).toEqual({ total: null, returned: null, truncated: false });
  });
});

describe("rowPopulation across every row-table endpoint", () => {
  it("treats candidates and folds exactly like trials", () => {
    // All three carry RowEnvelope now, so one helper serves them and a future
    // `top_n` on candidates/folds cannot silently falsify their provenance —
    // which is precisely what was possible while they returned bare arrays.
    for (const payload of [
      { total_rows: 4, returned_rows: 4, rows: [] },
      { total_rows: 20, returned_rows: 20, rows: [] },
    ]) {
      expect(rowPopulation(payload).truncated).toBe(false);
      expect(rowPopulation(payload).total).toBe(payload.total_rows);
    }
    expect(rowPopulation({ total_rows: 900, returned_rows: 100, rows: [] })).toEqual({
      total: 900,
      returned: 100,
      truncated: true,
    });
  });
});
