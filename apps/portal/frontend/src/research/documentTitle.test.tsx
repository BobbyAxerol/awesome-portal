import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { researchDocumentTitle, runIdFromPath, useResearchDocumentTitle } from "./documentTitle";
import { forgetRunLabels } from "./runLabels";
import { formatAxisValue, formatCorrelation, formatFractionAxis, formatMetric, typographicMinus } from "./researchFormat";

const ROOT = "/research/quantbt";

afterEach(() => {
  cleanup();
  forgetRunLabels();
});

describe("F3 — one browser tab title per Research Loop screen (`<Screen> · <Run label>`)", () => {
  it.each([
    [`${ROOT}/journey`, "Journey"],
    [ROOT, "Journey"],
    [`${ROOT}/`, "Journey"],
    [`${ROOT}/runs`, "Library"],
    [`${ROOT}/runs/new`, "New run"],
    [`${ROOT}/atlas`, "Atlas"],
    [`${ROOT}/alpha-import`, "Import alpha"],
    [`${ROOT}/alphas/delta-rsi-polynomial-alpha/lineage`, "Lineage · delta-rsi-polynomial-alpha"],
    [`${ROOT}/alphas/delta-rsi-polynomial-alpha/compare`, "Compare · delta-rsi-polynomial-alpha"],
    [`${ROOT}/release-candidates/rc_1`, "Release candidate"],
  ])("%s", (path, title) => {
    expect(researchDocumentTitle(path, null)).toBe(title);
  });

  it("per-run screens carry the run label, the HiFi stage names and no run id when unlabelled", () => {
    expect(researchDocumentTitle(`${ROOT}/runs/rrun_1/evidence`, "R-WFO-118")).toBe("Evidence · R-WFO-118");
    expect(researchDocumentTitle(`${ROOT}/runs/rrun_1/report`, "R-WFO-118")).toBe("Report · R-WFO-118");
    expect(researchDocumentTitle(`${ROOT}/runs/rrun_1/split`, "R-WFO-118")).toBe("Split · R-WFO-118");
    expect(researchDocumentTitle(`${ROOT}/runs/rrun_1/search`, null)).toBe("Search");
    expect(researchDocumentTitle(`${ROOT}/runs/rrun_1/progress`, null)).toBe("Progress");
  });

  it("a path that is not a Research Loop screen keeps the shell's title", () => {
    expect(researchDocumentTitle("/research/quantbt/runs/rrun_1/overview", null)).toBeNull();
    expect(researchDocumentTitle("/planning/roadmap", null)).toBeNull();
    expect(runIdFromPath(`${ROOT}/runs/rrun_1/freeze`)).toBe("rrun_1");
    expect(runIdFromPath(`${ROOT}/runs/new`)).toBeNull();
  });

  it("the hook sets document.title and restores the previous one on leave", () => {
    document.title = "Shell";
    function Probe({ path }: { path: string }) {
      useResearchDocumentTitle(path);
      return null;
    }
    const view = render(<Probe path={`${ROOT}/runs`} />);
    expect(document.title).toBe("Library");
    view.unmount();
    expect(document.title).toBe("Shell");
  });
});

describe("F3 — the HiFi minus sign is display only", () => {
  it("formatters print U+2212 for negatives, not a hyphen", () => {
    expect(formatMetric("-1234.5", "currency")).toBe("−1,234.50");
    expect(formatMetric("-5.355", "ratio")).toBe("−5.355");
    expect(formatMetric("-0.0125", "fraction")).toBe("−1.25%");
    expect(formatFractionAxis(-0.05)).toBe("−5.00%");
    expect(formatAxisValue("-12.345")).toBe("−12.35");
    expect(formatCorrelation("-0.4")).toBe("−0.40");
  });

  it("positives, zero and non-numbers are untouched; only a leading minus before a digit changes", () => {
    expect(formatMetric("5.355", "ratio")).toBe("5.355");
    expect(typographicMinus("-a")).toBe("-a");
    expect(typographicMinus("12-3")).toBe("12-3");
    expect(formatAxisValue("n/a")).toBe("n/a");
  });
});
