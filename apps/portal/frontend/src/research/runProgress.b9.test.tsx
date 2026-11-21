/**
 * B8/B9 · S03 — published bases and fold reporting are read, never derived.
 *
 * Bodies are the committed `e2e/research-foundation` progress read with the
 * OPTIONAL generated-type fields added by typed builders (labelled below); a
 * body that omits them must keep the earlier header and tick bar unchanged.
 */
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ELAPSED_BASIS_HINT, PCT_BASIS_HINT, RunProgress, foldReportingWords } from "./RunProgress";
import type { ProgressRead } from "./progressClient";
import { researchState } from "./state";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const BASE = JSON.parse(readFileSync(join(ROOT, "apps/portal/frontend/e2e/research-foundation/progress-read.json"), "utf8")) as ProgressRead;

afterEach(cleanup);

type FoldReporting = NonNullable<ProgressRead["current"]["fold_reporting"]>;

/** Typed builder (generated `fold_reporting` schema): a failed run whose journal never reported a fold. */
function failedNoFolds(): { read: ProgressRead; fr: FoldReporting } {
  const fr: FoldReporting = {
    basis: "P08_ADMISSION_AND_P11_JOURNAL_V1",
    declared_count: 9,
    planned_count: 9,
    reported_count: null,
    done_count: null,
    failed_count: null,
    reason_code: "SOURCE_PROGRESS_NOT_PUBLISHED",
  };
  const read = structuredClone(BASE);
  read.current = { ...read.current, effective_status: "FAILED", may_cancel: false, fold_reporting: fr } as ProgressRead["current"];
  read.progress = {
    ...read.progress!,
    status: "FAILED",
    overall: { ...read.progress!.overall, pct_basis: "SOURCE_STAGE_WEIGHTED_V1", elapsed_basis: "SOURCE_JOURNAL_CREATED_TO_LAST_EVENT_V1" },
    folds: [],
  };
  return { read, fr };
}

function view(read: ProgressRead) {
  return render(
    <MemoryRouter>
      <RunProgress
        runId={read.run_id}
        read={read}
        snapshot={read.progress}
        state={researchState({ kind: "ok", rowCount: 1 })}
        transport="closed"
        lines={[]}
        linesDropped={false}
        onLoadOlder={vi.fn()}
        foldCursor={null}
        onPinFold={vi.fn()}
        cancelling={false}
        onCancel={vi.fn()}
      />
    </MemoryRouter>,
  );
}
const $ = (selector: string) => document.querySelector(selector) as HTMLElement | null;

describe("S03 fold_reporting keeps planned, declared and reported apart", () => {
  it("a failed run that reported no fold never reads 'x of 9 folds'", () => {
    const { read } = failedNoFolds();
    view(read);
    const meta = $("[data-fold-reporting]")!;
    expect(meta.textContent).toBe("none reported · 9 declared");
    expect(meta.textContent).not.toMatch(/of 9 folds/);
    expect(meta.getAttribute("title")).toContain("SOURCE_PROGRESS_NOT_PUBLISHED");
    expect(meta.getAttribute("title")).toContain("only reported folds were observed");
  });

  it("words: reported is its own count; planned shows only when it differs from declared; zero is a count, null is not", () => {
    const base: FoldReporting = { basis: "P08_ADMISSION_AND_P11_JOURNAL_V1", declared_count: 9, planned_count: 8, reported_count: 3, done_count: 2, failed_count: 1, reason_code: null };
    expect(foldReportingWords(base).text).toBe("3 reported · 9 declared · 8 planned");
    expect(foldReportingWords({ ...base, planned_count: 9 }).text).toBe("3 reported · 9 declared");
    expect(foldReportingWords({ ...base, reported_count: 0, done_count: 0, failed_count: 0, reason_code: "SOURCE_DID_NOT_REPORT_FOLDS" }).text).toBe("0 reported · 9 declared · 8 planned");
    expect(foldReportingWords({ ...base, declared_count: null, planned_count: null, reported_count: null }).text).toBe("none reported");
  });

  it("an older body without fold_reporting keeps the earlier header", () => {
    view(BASE);
    expect($("[data-fold-reporting]")).toBeNull();
    expect($("[data-research-panel='folds']")?.textContent).toMatch(/fold/);
  });
});

describe("S03 published bases", () => {
  it("pct and elapsed carry their server basis, the percentage is the server's and no fold ticks sit on a stage-weighted bar", () => {
    const { read } = failedNoFolds();
    const withPct = structuredClone(read);
    withPct.current = { ...withPct.current, effective_status: "RUNNING" } as ProgressRead["current"];
    withPct.progress = { ...withPct.progress!, overall: { ...withPct.progress!.overall, pct: 37 } };
    view(withPct);
    expect($("[data-progress-text]")?.getAttribute("data-pct-basis")).toBe("SOURCE_STAGE_WEIGHTED_V1");
    expect($("[data-progress-text]")?.getAttribute("title")).toBe(PCT_BASIS_HINT);
    expect($("[data-bar-pct]")?.getAttribute("data-bar-pct")).toBe("37");
    expect($("[data-elapsed]")?.getAttribute("title")).toBe(ELAPSED_BASIS_HINT);
    expect(document.querySelector("[data-fold-tick]")).toBeNull();
  });

  it("without a published basis nothing is added to the overall line", () => {
    view(BASE);
    expect($("[data-progress-text]")?.getAttribute("data-pct-basis")).toBeNull();
    expect($("[data-elapsed]")?.getAttribute("title")).toBeNull();
  });
});
