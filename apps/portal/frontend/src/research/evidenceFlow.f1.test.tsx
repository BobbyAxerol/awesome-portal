/**
 * F1 honesty batch — Screen 04 Evidence Flow (group S04_S09).
 *
 * Each test asserts that the lie is gone AND the honest state shows. Bodies
 * are the canonical captures the repo already carries: the real retained WFO
 * evidence (`w3RealWfo.fixture.json`), the real hub for the same run
 * (`w3bRealWfo.fixture.json`), and the contract fixtures
 * `research-retained-analytics.fixed.valid.json` and
 * `research-evidence.dataset-coverage.valid.json`. No body is hand-built when
 * one of those exists.
 *
 *  - FG 04-F        a hub that is loading or refused is "not read", not "not published"
 *  - 2_wiring S04   the Net return tile is `net_oos_return`, or it says "Account return"
 *  - 2_wiring codes no FE-invented reason code looks like a server code
 *  - 400-trial      the Claim tab does not contradict the Summary tab's per-fold table
 */
import { cleanup, fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EvidenceFlow } from "./EvidenceFlow";
import { toEvidenceRefusal, type CurrentSourceEvidence, type EvidenceHub, type RetainedAnalytics } from "./evidenceClient";
import { PortalApiError } from "../lib/api";
import { DEFAULT_CURSOR } from "./evidenceCursor";
import { researchState } from "./state";

afterEach(cleanup);

const FIXTURES = join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures");
const contractFixture = <T,>(name: string) => JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as T;
const local = <T,>(name: string) => JSON.parse(readFileSync(join(process.cwd(), "src", "research", name), "utf8")) as T;

const ANALYTICS = contractFixture<RetainedAnalytics>("research-retained-analytics.fixed.valid.json");
const COVERAGE = contractFixture<EvidenceHub["core"]["dataset_coverage"] & object>("research-evidence.dataset-coverage.valid.json");
const W3 = local<{ evidence: CurrentSourceEvidence }>("w3RealWfo.fixture.json");
const W3B = local<{ hub_evidence: EvidenceHub; progress: import("./progressClient").ProgressRead; requested_spec: import("./progressClient").RunRequestedSpec }>(
  "w3bRealWfo.fixture.json",
);
const IDENTITY = { state: "ready" as const, identity: { progress: W3B.progress, requested: W3B.requested_spec } };

const OK = researchState({ kind: "ok", rowCount: 5 });
const LOADING = researchState({ kind: "in-flight", hasAcceptedResponse: false });
const REFUSED = researchState({ kind: "refusal", code: "RESEARCH_WORKSPACE_FORBIDDEN" });

const retained = (overrides: Partial<CurrentSourceEvidence> = {}) =>
  ({ state: "ready" as const, evidence: { ...W3.evidence, ...overrides } as CurrentSourceEvidence });

function view(overrides: Partial<React.ComponentProps<typeof EvidenceFlow>> = {}) {
  return render(
    <MemoryRouter>
      <EvidenceFlow
        runId="R-WFO-118"
        hub={W3B.hub_evidence}
        state={OK}
        cursor={DEFAULT_CURSOR}
        onStage={vi.fn()}
        onFold={vi.fn()}
        onResetCursor={vi.fn()}
        series={new Map()}
        ensureSeries={vi.fn()}
        passport={{ state: "idle" }}
        ensurePassport={vi.fn()}
        onReread={vi.fn()}
        {...overrides}
      />
    </MemoryRouter>,
  );
}

const CLAIM_CURSOR = { ...DEFAULT_CURSOR, stage: "claim" as const };
/** The retained lane answered for a P04 run: it holds none, and nothing is pending. */
const LANE_SETTLED = {
  state: "refused" as const,
  refusal: toEvidenceRefusal(new PortalApiError("not admitted", 404, "RESEARCH_CURRENT_SOURCE_NOT_ADMITTED", null)),
};

describe("F1 FG 04-F — a hub that was not read is 'not read', never 'not published'", () => {
  it("loading: every claim field, the certificate and the cursor bar say 'reading…'", () => {
    const { container } = view({ hub: null, state: LOADING });
    const strip = container.querySelector("[data-claim-passport]") as HTMLElement;
    expect(strip).toBeTruthy();
    for (const name of [
      "validation_claim",
      "chronological_claim",
      "oos_used_for_selection",
      "holdout_state",
      "causality_claim",
      "execution_contract",
      "runtime authority",
    ]) {
      const cell = strip.querySelector(`[data-claim-field='${name}']`) as HTMLElement;
      expect(cell, name).toBeTruthy();
      expect(cell.textContent, name).toContain("reading…");
      expect(cell.textContent, name).not.toContain("not published");
      expect(cell.querySelector("[data-withheld='NOT_READ']"), name).toBeTruthy();
    }
    expect(strip.querySelector("[data-certificate-state='NOT_READ']")?.textContent).toContain("reading…");
    expect(strip.textContent).not.toContain("not published");
    const bar = container.querySelector("[data-cursor-bar]") as HTMLElement;
    expect(bar.querySelector("[data-fold-bound]")?.textContent).toContain("reading…");
    expect(bar.querySelector("[data-cursor-schedule]")?.textContent).toContain("reading…");
    expect(bar.textContent).not.toContain("not published");
  });

  it("refused: the same cells say 'not read' and carry no server reason code", () => {
    const { container } = view({ hub: null, state: REFUSED });
    const strip = container.querySelector("[data-claim-passport]") as HTMLElement;
    for (const name of ["validation_claim", "holdout_state", "execution_contract", "runtime authority"]) {
      const cell = strip.querySelector(`[data-claim-field='${name}']`) as HTMLElement;
      expect(cell.textContent, name).toContain("not read");
      expect(cell.textContent, name).not.toContain("not published");
      expect(cell.querySelector("[data-reason-code]"), name).toBeNull();
    }
    expect(strip.querySelector("[data-certificate-state='NOT_READ']")?.textContent).toContain("not read");
    expect(container.querySelector("[data-cursor-bar] [data-fold-bound]")?.textContent).toContain("not read");
    expect(container.querySelector("[data-cursor-bar]")?.textContent).not.toContain("not published");
  });

  it("a hub that WAS read and is silent still says 'not published', and its tooltip says no code was served", () => {
    const { container } = view();
    const cell = container.querySelector("[data-claim-field='validation_claim']") as HTMLElement;
    expect(cell.textContent).toContain("not published");
    expect(cell.textContent).not.toContain("not read");
    expect(cell.querySelector("[data-withheld='NOT_PUBLISHED']")?.getAttribute("title")).toContain("the server sent no reason code");
  });

  it("a served reason code is still printed as the server's (not swallowed by the new states)", () => {
    const { container } = view();
    const cert = container.querySelector("[data-certificate-state='NOT_PUBLISHED'] [data-withheld]") as HTMLElement;
    expect(cert.getAttribute("data-reason-code")).toBe(W3B.hub_evidence.claim.methodology_certificate.reason_code);
  });

  it("Claim tab: facts the retained lane has not answered yet read 'reading…', not 'not published'", () => {
    const { container } = view({ cursor: CLAIM_CURSOR, passport: { state: "loading" }, runIdentity: { state: "loading" } });
    const table = container.querySelector("[data-window-disclosure-panel]") as HTMLElement;
    expect(table.querySelector("[data-window-row='OOS']")?.textContent).toContain("validation_claim — reading…");
    expect(table.querySelector("[data-window-row='Holdout']")?.textContent).toContain("holdout — reading…");
    expect(table.querySelector("[data-window-row='Holdout'] [data-window-count]")?.textContent).toContain("reading…");
  });
});

describe("F1 2_wiring S04 — the Net return tile is net_oos_return, or it is called 'Account return'", () => {
  it("binds the served `summary_analytics.net_oos_return` under its own scope", () => {
    const { container } = view({ passport: retained({ summary_analytics: ANALYTICS } as Partial<CurrentSourceEvidence>), runIdentity: IDENTITY });
    const tile = container.querySelector("[data-metric='NET_RETURN_FRACTION']") as HTMLElement;
    expect(tile.textContent).toContain("Net OOS return");
    expect(tile.textContent).not.toMatch(/Net return/i);
    const value = tile.querySelector("[data-metric-value='NET_RETURN_FRACTION']") as HTMLElement;
    expect(value.getAttribute("data-exact")).toBe(ANALYTICS.net_oos_return.value);
    expect(value.textContent).toBe("+1.20%");
    expect(tile.querySelector("[data-metric-scope]")?.textContent).toBe("oos · percent · engine-direct");
  });

  it("without `net_oos_return` the account value stays, called 'Account return' with the account scope", () => {
    const { container } = view({ passport: retained(), runIdentity: IDENTITY });
    const tile = container.querySelector("[data-metric='NET_RETURN_FRACTION']") as HTMLElement;
    expect(tile.textContent).toContain("Account return");
    expect(tile.textContent).not.toMatch(/Net (OOS )?return/i);
    expect(tile.querySelector("[data-metric-value]")?.getAttribute("data-exact")).toBe(W3.evidence.passport.net_return_fraction);
    expect(tile.querySelector("[data-metric-scope]")?.textContent).toContain("retained stitched account");
  });

  it("a `net_oos_return` the server marked not published falls back to the labelled account tile, never to 0", () => {
    const absent = {
      ...ANALYTICS,
      net_oos_return: { ...ANALYTICS.net_oos_return, state: "NOT_PUBLISHED", reason_code: "P13_SOURCE_PREDATES_OOS_ANALYTICS", value: null },
    } as RetainedAnalytics;
    const { container } = view({ passport: retained({ summary_analytics: absent } as Partial<CurrentSourceEvidence>), runIdentity: IDENTITY });
    const tile = container.querySelector("[data-metric='NET_RETURN_FRACTION']") as HTMLElement;
    expect(tile.textContent).toContain("Account return");
    expect(tile.textContent).not.toContain("Net OOS return");
    expect(tile.textContent).not.toMatch(/(^|\s)0\.00%/);
  });

  it("the retained passport row is 'account return' too (same value, same name)", () => {
    const { container } = view({ cursor: { ...DEFAULT_CURSOR, stage: "summary" }, passport: retained(), runIdentity: IDENTITY });
    const row = container.querySelector("[data-passport-row='account return']");
    expect(row).toBeTruthy();
    expect(container.querySelector("[data-passport-row='net return']")).toBeNull();
  });
});

describe("F1 2_wiring S04 codes — no screen-coined token looks like a server reason code", () => {
  it("while the retained lane's own reads are outstanding the cursor pills say 'reading…', not 'not served'", () => {
    const { container } = view({ passport: { state: "loading" } });
    for (const pill of ["trial", "params", "seq"]) {
      expect(container.querySelector(`[data-cursor-${pill}]`)?.textContent, pill).toContain("reading…");
      expect(container.querySelector(`[data-cursor-${pill}] [data-fe-absence]`), pill).toBeNull();
    }
  });

  const FORBIDDEN = /P13_PUBLISHES_NO_|SERIES_(SEGMENT|UNITS|DIGEST)_NOT_PUBLISHED|UI_RETAINED_LANE_HAS_NO|UI_HUB_LANE_HAS_NO/;

  it("hub lane (no retained answer): cursor pills, provenance and behaviour cells are short screen notes", () => {
    const { container } = view({ passport: LANE_SETTLED });
    expect(container.innerHTML).not.toMatch(FORBIDDEN);
    const notes = [...container.querySelectorAll("[data-fe-absence]")] as HTMLElement[];
    expect(notes.length).toBeGreaterThan(0);
    for (const note of notes) {
      expect(note.textContent).toContain("not served for this lane");
      expect(note.hasAttribute("data-reason-code")).toBe(false);
      expect(note.getAttribute("title")).toContain("not a server reason code");
    }
    expect(container.querySelector("[data-cursor-trial] [data-fe-absence]")?.getAttribute("data-fe-absence")).toBe("hub-lane-has-no-trial-cursor");
    expect(container.querySelector("[data-cursor-params] [data-fe-absence]")?.getAttribute("data-fe-absence")).toBe("hub-lane-has-no-params-digest");
    expect(container.querySelector("[data-behavior-tile='skew'] [data-fe-absence]")?.getAttribute("data-fe-absence")).toBe(
      "hub-lane-has-no-behavior-analytic",
    );
  });

  it("retained lane: the lane's missing fields are screen notes while the lane's own served codes stay codes", () => {
    const { container } = view({ passport: retained(), runIdentity: IDENTITY });
    expect(container.innerHTML).not.toMatch(FORBIDDEN);
    /* D-AN-01: the ten tiles the lane never carried are one line; its code is the served one. */
    expect(container.querySelector("[data-metric='OOS_SORTINO']")).toBeNull();
    const absent = container.querySelector("[data-analytics-v2-absent] [data-withheld]") as HTMLElement;
    expect(absent.getAttribute("data-reason-code")).toBe(W3.evidence.source_absences.benchmark.reason_code);
    expect(absent.hasAttribute("data-fe-absence")).toBe(false);
  });
});

describe("F1 400-trial audit — the Claim tab does not contradict the Summary tab's per-fold table", () => {
  it("Summary draws the per-fold table from the retained lane", () => {
    const { container } = view({ cursor: DEFAULT_CURSOR, passport: retained(), runIdentity: IDENTITY });
    expect(container.querySelector("[data-retained-verdicts='AVAILABLE']")).toBeTruthy();
    expect(container.querySelectorAll("[data-verdict-row]").length).toBe(W3.evidence.fold_verdicts.rows.length);
  });

  it("Claim tab on the same run lists the lane's absences, and no 'per_fold_metrics — not published'", () => {
    const { container } = view({ cursor: CLAIM_CURSOR, passport: retained(), runIdentity: IDENTITY });
    const list = container.querySelector("[data-absences]") as HTMLElement;
    expect(list).toBeTruthy();
    expect(list.querySelector("[data-absence='per_fold_metrics']")).toBeNull();
    expect(list.textContent).not.toContain("per_fold_metrics");
    /* The hub-lane codes describe the P04 hub, not this run (HUB_LANE_REASON). */
    expect(list.innerHTML).not.toContain("P13_SOURCE_EVIDENCE_NOT_PUBLISHED");
    for (const [name, fact] of Object.entries(W3.evidence.source_absences)) {
      const row = list.querySelector(`[data-absence='${name}']`) as HTMLElement;
      expect(row, name).toBeTruthy();
      expect(row.querySelector("[data-withheld]")?.getAttribute("data-reason-code")).toBe((fact as { reason_code: string }).reason_code);
    }
  });

  it("when the lane itself did not publish per-fold rows, the Claim tab says so with the lane's code", () => {
    const base = W3.evidence.fold_verdicts;
    const evidence = {
      fold_verdicts: {
        ...base,
        state: "NOT_PUBLISHED",
        reason_code: "RS02_SEAL_PREDATES_W3_SOURCE_FACTS_V1",
        availability: { state: "NOT_PUBLISHED", reason_code: "RS02_SEAL_PREDATES_W3_SOURCE_FACTS_V1" },
      },
    } as Partial<CurrentSourceEvidence>;
    const { container } = view({ cursor: CLAIM_CURSOR, passport: retained(evidence), runIdentity: IDENTITY });
    const row = container.querySelector("[data-absences] [data-absence='per_fold_metrics']") as HTMLElement;
    expect(row).toBeTruthy();
    expect(row.querySelector("[data-withheld]")?.getAttribute("data-reason-code")).toBe("RS02_SEAL_PREDATES_W3_SOURCE_FACTS_V1");
  });

  it("hub lane (no retained answer): both tabs agree — the hub's absence list stays, and the Summary table is the hub's own 'not published'", () => {
    const summary = view({ cursor: DEFAULT_CURSOR });
    expect(summary.container.querySelector("[data-gap='per-fold-verdict']")?.textContent).toContain("per-fold metrics");
    expect(summary.container.querySelector("[data-retained-verdicts]")).toBeNull();
    cleanup();
    const claim = view({ cursor: CLAIM_CURSOR });
    const names = [...claim.container.querySelectorAll("[data-absences] [data-absence]")].map((el) => el.getAttribute("data-absence"));
    expect(names).toEqual(Object.keys(W3B.hub_evidence.source_absences));
  });
});

describe("F1 FG 04-F :915 — the dataset drawer shows served coverage instead of 'not published'", () => {
  const open = (hub: EvidenceHub) => {
    const rendered = view({ hub });
    fireEvent.click(rendered.container.querySelector("[aria-controls]") as Element);
    return rendered;
  };

  it("coverage that is served is printed as the server sent it", () => {
    const hub = { ...W3B.hub_evidence, core: { ...W3B.hub_evidence.core, dataset_coverage: COVERAGE } } as EvidenceHub;
    const { container } = open(hub);
    const panel = container.querySelector("[data-dataset-panel]") as HTMLElement;
    expect(panel.querySelector("[data-coverage='AVAILABLE']")).toBeTruthy();
    expect(panel.querySelector("[data-coverage-fact='rows']")?.textContent).toContain(String(COVERAGE.rows).replace(/\B(?=(\d{3})+(?!\d))/g, ","));
    expect(panel.querySelector("[data-coverage-fact='columns']")?.textContent).toContain(COVERAGE.columns.join(" · "));
    expect(panel.textContent).not.toContain("the Evidence contract publishes");
    /* An empty track beside served numbers would read as "0 covered": it is not drawn. */
    expect(panel.querySelector("[data-gap='dataset-coverage'] .h-4")).toBeNull();
  });

  it("coverage the server declared absent keeps its code; a responder that sent none says no code was served", () => {
    const absent = {
      ...W3B.hub_evidence,
      core: { ...W3B.hub_evidence.core, dataset_coverage: { ...COVERAGE, availability: { state: "NOT_PUBLISHED", reason_code: "P08_SNAPSHOT_METADATA_NOT_PUBLISHED" } } },
    } as EvidenceHub;
    const first = open(absent);
    expect(first.container.querySelector("[data-coverage='NOT_PUBLISHED'] [data-withheld]")?.getAttribute("data-reason-code")).toBe(
      "P08_SNAPSHOT_METADATA_NOT_PUBLISHED",
    );
    expect(first.container.querySelector("[data-gap='dataset-coverage'] .h-4")).toBeTruthy();
    cleanup();
    const unsent = { ...W3B.hub_evidence, core: { ...W3B.hub_evidence.core, dataset_coverage: undefined } } as EvidenceHub;
    const second = open(unsent);
    expect(second.container.querySelector("[data-coverage='UNSENT'] [data-withheld]")?.getAttribute("title")).toContain("the server sent no reason code");
  });
});
