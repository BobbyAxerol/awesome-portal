/**
 * Batch F1 · S01 honesty (FG 01-13, 2_wiring S01).
 *
 * Base rows come from the committed run-library fixture
 * (`e2e/research-foundation/run-library.json`), not a hand-built body.
 *
 *  - FG 01-13: a legacy 1.0.8 row picked from `?to=<screen>` linked to
 *    `/evidence` (alpha-scoped pick) or to a screen it does not have. It now
 *    opens only the legacy workspace; any other pick is a non-link with a reason.
 *  - 2_wiring S01: `rc === null` omitted the chip and never showed
 *    `rc_availability`. It now shows a short typed absence with the served reason.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RunLibrary, openTarget } from "./RunLibrary";
import type { Availability, RunLibraryItem, RunLibraryResponse } from "./runLibraryClient";
import type { LibraryFilters } from "./useRunLibrary";
import { researchState } from "./state";

const fixture = JSON.parse(
  readFileSync(join(__dirname, "../../e2e/research-foundation/run-library.json"), "utf8"),
) as RunLibraryResponse;

const base = (runId: string): RunLibraryItem => {
  const found = fixture.items.find((row) => row.run_id === runId);
  if (!found) throw new Error(`fixture has no ${runId}`);
  return found;
};

const LEGACY_RC: Availability = {
  state: "LEGACY_METADATA_ONLY",
  reason_code: "LEGACY_1_0_8_HAS_NO_RELEASE_CANDIDATE_RELATION",
};
const CURRENT = base("R-WFO-118");
const LEGACY: RunLibraryItem = {
  ...base("R-LEGACY-07"),
  rc: null,
  rc_availability: LEGACY_RC,
  binding: null,
};
const UNBOUND: RunLibraryItem = { ...CURRENT, run_id: "R-SCRATCH-01", binding: null };

const EMPTY: LibraryFilters = { q: "", status: [], mode: [], alpha: [], group: false, sel: [] };

function mount(items: RunLibraryItem[], to?: string, extra: Partial<RunLibraryItem> = {}) {
  const response = { ...fixture, items: items.map((row) => ({ ...row, ...extra })) };
  render(
    <MemoryRouter>
      <RunLibrary
        filters={to ? { ...EMPTY, to } : EMPTY}
        onFilters={vi.fn()}
        onToggleSel={vi.fn()}
        response={response}
        items={response.items}
        state={researchState({ kind: "ok", rowCount: response.items.length })}
        sparklines={new Map()}
        onVisible={vi.fn()}
        onLoadNext={vi.fn()}
        onLoadPrevious={vi.fn()}
      />
    </MemoryRouter>,
  );
}

const card = (runId: string) => document.querySelector(`[data-run="${runId}"]`) as HTMLElement;

afterEach(cleanup);

describe("FG 01-13 — a legacy row never links to a screen it lacks", () => {
  it("an alpha-scoped pick used to link the legacy row to /evidence; it is now a non-link with the reason", () => {
    const open = openTarget(LEGACY, "attempt_lineage");
    expect(open.to).toBeNull();
    expect(open.label).toBe("cannot open here");
    expect(open.title).toContain("Attempt Lineage");
    expect(open.title).toContain("legacy 1.0.8");
  });

  it.each(["evidence_hub", "split", "search_selection", "freeze", "execute_replay", "run_report", "run_progress", "compare_runs"])(
    "a pick for %s is a non-link for a legacy row",
    (key) => {
      expect(openTarget(LEGACY, key).to).toBeNull();
    },
  );

  it("a pick for the legacy workspace, and no pick at all, still open the legacy overview", () => {
    expect(openTarget(LEGACY, "run_progress_legacy").to).toBe("/research/quantbt/runs/R-LEGACY-07/overview");
    expect(openTarget(LEGACY).to).toBe("/research/quantbt/runs/R-LEGACY-07/overview");
    expect(openTarget(LEGACY).label).toBe("open legacy run →");
  });

  it("does not change a current-engine row: an unbound scratch row keeps its default with its reason", () => {
    const open = openTarget(UNBOUND, "attempt_lineage");
    expect(open.to).toBe("/research/quantbt/runs/R-SCRATCH-01/evidence");
    expect(open.title).toContain("names no alpha version");
    expect(openTarget(CURRENT, "attempt_lineage").to).toBe("/research/quantbt/alphas/alpha-momentum-btc/lineage");
  });

  it("renders the legacy card with no link of any kind to /evidence while an alpha-scoped pick is active", () => {
    mount([CURRENT, LEGACY], "attempt_lineage");
    const legacy = card("R-LEGACY-07");
    expect(legacy.querySelector("a[href*='/evidence']")).toBeNull();
    expect(legacy.querySelector("[data-open]")).toBeNull();
    const word = legacy.querySelector("[data-open-unavailable='R-LEGACY-07']") as HTMLElement;
    expect(word.tagName).toBe("SPAN");
    expect(word.textContent).toBe("cannot open here");
    expect(word.getAttribute("title")).toMatch(/legacy 1\.0\.8/);
    /* the current-engine row beside it still links to the picked screen */
    const current = card("R-WFO-118").querySelector("[data-open='R-WFO-118']") as HTMLAnchorElement;
    expect(current.getAttribute("href")).toBe("/research/quantbt/alphas/alpha-momentum-btc/lineage");
  });

  it("renders the legacy card's default link to the legacy workspace when no screen was picked", () => {
    mount([LEGACY]);
    const link = card("R-LEGACY-07").querySelector("[data-open='R-LEGACY-07']") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/research/quantbt/runs/R-LEGACY-07/overview");
    expect(card("R-LEGACY-07").querySelector("[data-open-unavailable]")).toBeNull();
  });
});

describe("2_wiring S01 — a null rc shows the served rc_availability, not a silent gap", () => {
  it("the ordinary no-candidate row prints nothing and keeps the served reason as data", () => {
    mount([CURRENT]);
    const rcAbsent = [...card("R-WFO-118").querySelectorAll("[data-withheld]")].find(
      (node) => node.getAttribute("data-reason-code") === CURRENT.rc_availability.reason_code,
    );
    expect(rcAbsent).toBeUndefined();
    expect(card("R-WFO-118").getAttribute("data-rc-absent")).toBe(CURRENT.rc_availability.reason_code);
    expect(card("R-WFO-118").querySelector("[data-rc]")).toBeNull();
  });

  it("names the reader-disabled and incompatible-ref reasons by their own codes", () => {
    mount([CURRENT], undefined, {
      rc_availability: { state: "NOT_PUBLISHED", reason_code: "P21_RELEASE_CANDIDATE_READER_DISABLED" },
    });
    const disabled = card("R-WFO-118").querySelector("[data-reason-code='P21_RELEASE_CANDIDATE_READER_DISABLED']") as HTMLElement;
    expect(disabled.textContent).toBe("rc — not published");
    expect(disabled.getAttribute("title")).toBe("The release-candidate reader is switched off on this deployment.");
    cleanup();
    mount([CURRENT], undefined, {
      rc_availability: { state: "NOT_PUBLISHED", reason_code: "P21_RELEASE_CANDIDATE_REF_INCOMPATIBLE" },
    });
    const refused = card("R-WFO-118").querySelector("[data-reason-code='P21_RELEASE_CANDIDATE_REF_INCOMPATIBLE']") as HTMLElement;
    expect(refused.getAttribute("title")).toBe("The stored release-candidate relation did not match the published shape.");
  });

  it("a legacy row's absence reads legacy metadata, not 'not published'", () => {
    mount([LEGACY]);
    const absent = card("R-LEGACY-07").querySelector(
      "[data-reason-code='LEGACY_1_0_8_HAS_NO_RELEASE_CANDIDATE_RELATION']",
    ) as HTMLElement;
    expect(absent.textContent).toBe("rc — legacy metadata");
    expect(absent.getAttribute("data-withheld")).toBe("LEGACY_METADATA_ONLY");
  });

  it("a row that has a candidate still draws the chip and no absence for it", () => {
    mount([
      {
        ...CURRENT,
        rc: {
          kind: "ACTOR_DRAFT",
          release_candidate_id: null,
          draft_id: "rcd_1",
          delivery_state: null,
          approval_state: null,
          sealed_at_utc_ms: null,
        },
        rc_availability: { state: "AVAILABLE", reason_code: null },
      },
    ]);
    expect(card("R-WFO-118").querySelector("[data-rc]")).toBeTruthy();
    expect(card("R-WFO-118").textContent).not.toContain("rc — ");
  });
});
