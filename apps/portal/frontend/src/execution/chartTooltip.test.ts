/**
 * The hover box shows the value the reader came for, and says the stamp once.
 */
import { describe, expect, it } from "vitest";

import { chartTooltip, tooltipStamp } from "./chartTooltip";

describe("the stamp", () => {
  it("is seconds, with no milliseconds and no T", () => {
    expect(tooltipStamp("2026-08-29T07:30:00.000Z")).toBe("2026-08-29 07:30:00 UTC");
    expect(tooltipStamp(1788639300000)).toBe("2026-09-05 20:15:00 UTC");
  });

  it("returns the original text rather than inventing a date it cannot read", () => {
    expect(tooltipStamp("bucket 4")).toBe("bucket 4");
    expect(tooltipStamp(null)).toBe("—");
  });
});

describe("the box", () => {
  it("never repeats as_of — the chart's caption already carries the envelope", () => {
    const html = chartTooltip({
      head: "2026-08-29T07:30:00.000Z",
      rows: [{ label: "Execution equity", value: "20,000.00" }],
      provenance: { authority: "EXECUTION", formula: "equity_projection.v1" },
    });
    expect(html).not.toMatch(/as.of/i);
    expect(html).toContain("2026-08-29 07:30:00 UTC");
    expect(html).toContain("EXECUTION · equity_projection.v1");
  });

  it("right-aligns values so two series read as a column", () => {
    const html = chartTooltip({ head: 0, rows: [{ label: "a", value: "1" }, { label: "bbbb", value: "22" }] });
    expect(html.match(/text-align:right/g)).toHaveLength(2);
    expect(html).toContain("tabular-nums");
  });

  it("escapes what the source wrote rather than trusting it into the DOM", () => {
    const html = chartTooltip({ rows: [{ label: "<img src=x>", value: "1 & 2" }] });
    expect(html).toContain("&lt;img src=x&gt;");
    expect(html).toContain("1 &amp; 2");
    expect(html).not.toContain("<img");
  });

  it("drops the head entirely when a chart has no x value to name", () => {
    const html = chartTooltip({ rows: [{ label: "a", value: "1" }] });
    expect(html.startsWith("<table")).toBe(true);
  });
});
