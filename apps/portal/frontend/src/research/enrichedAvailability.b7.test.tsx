/**
 * B7 - Codex's `enriched_analysis_availability` (`8829f7a0`) on Evidence Hub (S04) and Report (S09).
 * The generated `EnrichedAnalysisAvailability` is the shape; the absence fixture is the canonical
 * `research-enriched-analysis.old-seal-absent` (its state/reason_code ARE the served availability).
 * Value path: a block with `AVAILABLE` changes nothing. Absence path: the SERVED code is shown, never an invented one.
 * S01 is not here: the Library item serves no availability field (see the record's backend request).
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { components as EvidenceComponents } from "@portal/contracts-research-evidence";
import type { components as ReportComponents } from "@portal/contracts-research-report";

import { EvidenceFlow } from "./EvidenceFlow";
import { ReportRoute } from "./ReportRoute";
import { enrichedAbsenceOf, type EvidenceHub } from "./evidenceClient";
import { DEFAULT_CURSOR } from "./evidenceCursor";
import { enrichedAbsenceCode } from "./enrichedAvailability";
import { healthy, oldSealAbsent } from "./enrichedAnalysis.fixtures";
import { enrichedAbsenceOfReport, type ReportDetail } from "./reportClient";
import { forgetRunLabels } from "./runLabels";
import { researchState } from "./state";
import { forgetHeldReports } from "./useReport";

/* Compile-time: the served field is the generated type on both surfaces. */
type Served = EvidenceComponents["schemas"]["EnrichedAnalysisAvailability"];
const reportShape: ReportComponents["schemas"]["EnrichedAnalysisAvailability"] = { state: "AVAILABLE", reason_code: null };
const evidenceShape: Served = reportShape;
void evidenceShape;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  forgetHeldReports();
  forgetRunLabels();
  window.history.replaceState(null, "", "/");
});

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const local = <T,>(name: string) => JSON.parse(readFileSync(join(process.cwd(), "src", "research", name), "utf8")) as T;
const W3B = local<{ hub_evidence: EvidenceHub; progress: import("./progressClient").ProgressRead; requested_spec: import("./progressClient").RunRequestedSpec }>("w3bRealWfo.fixture.json");
const IDENTITY = { state: "ready" as const, identity: { progress: W3B.progress, requested: W3B.requested_spec } };

const guard = oldSealAbsent();
/** The served availability of the canonical absence fixture. */
const SERVED_ABSENT = { state: guard.state, reason_code: guard.reason_code } as Served;
const NOT_SEALED = { state: "NOT_PUBLISHED", reason_code: "SOURCE_EVIDENCE_NOT_SEALED" } as Served;
const AVAILABLE = { state: "AVAILABLE", reason_code: null } as Served;

describe("B7 reader", () => {
  it("returns the served code only for a served NOT_PUBLISHED while no block was read", () => {
    const absent = { kind: "absent" } as const;
    expect(enrichedAbsenceCode({ enriched_analysis_availability: SERVED_ABSENT }, absent)).toBe("SEALED_ENRICHMENT_NOT_COMPUTED");
    expect(enrichedAbsenceCode({ enriched_analysis_availability: NOT_SEALED }, absent)).toBe("SOURCE_EVIDENCE_NOT_SEALED");
    /* field not served (older responder): no code is made up */
    expect(enrichedAbsenceCode({}, absent)).toBeNull();
    expect(enrichedAbsenceCode(null, absent)).toBeNull();
    /* AVAILABLE says nothing to show */
    expect(enrichedAbsenceCode({ enriched_analysis_availability: AVAILABLE }, absent)).toBeNull();
    /* a malformed served field is not turned into a code */
    expect(enrichedAbsenceCode({ enriched_analysis_availability: { state: "NOT_PUBLISHED", reason_code: null } }, absent)).toBeNull();
    expect(enrichedAbsenceCode({ enriched_analysis_availability: "SEALED_ENRICHMENT_NOT_COMPUTED" }, absent)).toBeNull();
    /* a block that was read (drawn or refused) keeps its own line */
    expect(enrichedAbsenceCode({ enriched_analysis_availability: SERVED_ABSENT }, { kind: "block", block: healthy() })).toBeNull();
    expect(enrichedAbsenceCode({ enriched_analysis_availability: SERVED_ABSENT }, { kind: "refused", reason: "UI_ENRICHED_ANALYSIS_HAS_ROLLING", detail: "rolling" })).toBeNull();
  });

  it("the Hub and Report wrappers read the TOP level and no other place", () => {
    expect(enrichedAbsenceOf({ enriched_analysis_availability: SERVED_ABSENT } as unknown as EvidenceHub)).toBe("SEALED_ENRICHMENT_NOT_COMPUTED");
    expect(enrichedAbsenceOf({ core: { enriched_analysis_availability: SERVED_ABSENT } } as unknown as EvidenceHub)).toBeNull();
    expect(enrichedAbsenceOfReport({ enriched_analysis_availability: NOT_SEALED } as unknown as ReportDetail)).toBe("SOURCE_EVIDENCE_NOT_SEALED");
    expect(enrichedAbsenceOfReport({ frozen_core: { enriched_analysis_availability: NOT_SEALED } } as unknown as ReportDetail)).toBeNull();
    expect(enrichedAbsenceOfReport({ enriched_analysis: healthy(), enriched_analysis_availability: SERVED_ABSENT } as unknown as ReportDetail)).toBeNull();
  });
});

/* ------------------------------------------------------------------ S04 */

function hubView(extra: Record<string, unknown>) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, headers: new Headers(), json: async () => ({}), text: async () => "" })));
  const hub = { ...clone(W3B.hub_evidence), ...extra } as unknown as EvidenceHub;
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <EvidenceFlow
        runId="R-P04-021"
        hub={hub}
        state={researchState({ kind: "ok", rowCount: 5 })}
        cursor={DEFAULT_CURSOR}
        onStage={vi.fn()}
        onFold={vi.fn()}
        onResetCursor={vi.fn()}
        series={new Map()}
        ensureSeries={vi.fn()}
        passport={{ state: "idle" }}
        ensurePassport={vi.fn()}
        onReread={vi.fn()}
        runIdentity={IDENTITY}
      />
    </MemoryRouter>,
  );
}
const settleHub = (container: HTMLElement) => waitFor(() => expect(container.querySelector("[data-metrics]")).toBeTruthy(), { timeout: 15_000 });
const line = (container: HTMLElement) => container.querySelector("[data-enriched-availability]") as HTMLElement | null;

describe("B7 S04 - the Hub's served reason replaces the code-less absence", () => {
  it.each([
    ["SEALED_ENRICHMENT_NOT_COMPUTED", SERVED_ABSENT],
    ["SOURCE_EVIDENCE_NOT_SEALED", NOT_SEALED],
  ])("old seal, served %s: one compact line with the code and a tooltip", async (code, served) => {
    const { container } = hubView({ enriched_analysis_availability: served });
    await settleHub(container);
    const el = line(container)!;
    expect(el).toBeTruthy();
    expect(container.querySelectorAll("[data-enriched-availability]")).toHaveLength(1);
    expect(el.getAttribute("data-reason-code")).toBe(code);
    expect(el.textContent).toContain(code);
    expect(el.textContent).toContain("not published");
    expect(el.getAttribute("title")).toContain(`server reason: ${code}`);
    expect(el.getAttribute("aria-label")).toContain(code);
    expect(container.querySelector("[data-enriched-chip]")).toBeNull();
    expect(container.querySelector("[data-enriched-refused]")).toBeNull();
  }, 20_000);

  it("field not served (older responder): today's behaviour, no line and no invented code", async () => {
    const { container } = hubView({});
    await settleHub(container);
    expect(line(container)).toBeNull();
  }, 20_000);

  it("value path: a block with AVAILABLE draws as before and adds no line", async () => {
    const { container } = hubView({ enriched_analysis: healthy(), enriched_analysis_availability: AVAILABLE });
    await settleHub(container);
    await waitFor(() => expect(container.querySelector("[data-enriched-chip]")).toBeTruthy(), { timeout: 15_000 });
    expect(line(container)).toBeNull();
  }, 25_000);

  it("a block present beats a stale served NOT_PUBLISHED: nothing changes", async () => {
    const { container } = hubView({ enriched_analysis: healthy(), enriched_analysis_availability: SERVED_ABSENT });
    await settleHub(container);
    await waitFor(() => expect(container.querySelector("[data-enriched-chip]")).toBeTruthy(), { timeout: 15_000 });
    expect(line(container)).toBeNull();
  }, 25_000);
});

/* ------------------------------------------------------------------ S09 */

const FIXTURES = join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures");
type Body = Omit<ReportDetail, "frozen_core"> & { frozen_core: any };
const report = () => JSON.parse(readFileSync(join(FIXTURES, "research-report.wfo-retained.valid.json"), "utf8")) as Body;
function serve(body: Body) {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () => ({ ok: true, status: 200, statusText: "200", headers: new Headers(), json: async () => body }) as unknown as Response,
  );
}
function renderReport(runId: string) {
  return render(
    <MemoryRouter initialEntries={[`/research/quantbt/runs/${runId}/report`]}>
      <Routes>
        <Route path="/research/quantbt/runs/:runId/report" element={<ReportRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}
const panel = () => document.querySelector("[data-panel='all-time']") as HTMLElement;

describe("B7 S09 - the Report's served reason in the supplemental section", () => {
  it.each([
    ["SEALED_ENRICHMENT_NOT_COMPUTED", SERVED_ABSENT],
    ["SOURCE_EVIDENCE_NOT_SEALED", NOT_SEALED],
  ])("old report, served %s: the typed line carries the code and a tooltip; the sealed sheet is whole", async (code, served) => {
    const body = report();
    serve({ ...body, enriched_analysis_availability: served } as unknown as Body);
    renderReport(body.run_id);
    await screen.findByText("Claim passport");
    expect(panel().getAttribute("data-all-time")).toBe("absent");
    const absent = panel().querySelector("[data-absent-state='NOT_PUBLISHED']") as HTMLElement;
    expect(absent.textContent).toContain("not published");
    expect(absent.outerHTML).toContain(code);
    expect(panel().querySelector("[data-reason-code]")?.getAttribute("data-reason-code")).toBe(code);
    expect(absent.getAttribute("title")).toContain(`server reason: ${code}`);
    expect(absent.getAttribute("aria-label")).toContain(code);
    expect(panel().querySelector("svg")).toBeNull();
    expect(document.querySelector("[data-panel='promotion']")).toBeTruthy();
  });

  it("the canonical old-seal fixture pair (null block + served reason) is the same line", async () => {
    const body = report();
    serve({ ...body, enriched_analysis: guard.enriched_analysis, enriched_analysis_availability: SERVED_ABSENT } as unknown as Body);
    renderReport(body.run_id);
    await screen.findByText("Claim passport");
    expect(panel().querySelector("[data-reason-code]")?.getAttribute("data-reason-code")).toBe("SEALED_ENRICHMENT_NOT_COMPUTED");
  });

  it("field not served: the code-less line stays, nothing invented", async () => {
    const body = report();
    serve(body);
    renderReport(body.run_id);
    await screen.findByText("Claim passport");
    expect(panel().querySelector("[data-absent-state='NOT_PUBLISHED']")?.textContent).toContain("not published");
    expect(panel().querySelector("[data-reason-code]")).toBeNull();
  });

  it("value path: a block with AVAILABLE draws as before, with no absence line", async () => {
    const body = report();
    serve({ ...body, enriched_analysis: healthy(), enriched_analysis_availability: AVAILABLE } as unknown as Body);
    renderReport(body.run_id);
    await screen.findByText("Claim passport");
    expect(panel().getAttribute("data-all-time")).toBe("ready");
    expect(panel().querySelector("[data-all-time-facts]")).toBeTruthy();
    expect(panel().querySelector("[data-reason-code]")).toBeNull();
    expect(panel().querySelector("[data-absent]")).toBeNull();
  });
});
