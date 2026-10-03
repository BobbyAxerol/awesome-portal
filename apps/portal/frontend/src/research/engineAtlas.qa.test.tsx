/**
 * QA 2026-10-02 · S12 Engine Atlas fixes (group S00_S01_S12), rendered from the
 * published atlas fixtures (current and historical).
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AtlasDocument } from "./atlas";
import { EngineAtlas, constraintWords, declareModeHref } from "./EngineAtlas";
import { researchState } from "./state";

afterEach(cleanup);

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const DOC = JSON.parse(readFileSync(join(ROOT, "packages/contracts/fixtures/research-foundation.atlas-current.valid.json"), "utf8")).atlas as AtlasDocument;
const OK = researchState({ kind: "ok", rowCount: 1 });

function view(props: Partial<React.ComponentProps<typeof EngineAtlas>> = {}) {
  render(
    <MemoryRouter>
      <EngineAtlas doc={DOC} state={OK} tab="modes" onTabChange={vi.fn()} {...props} />
    </MemoryRouter>,
  );
}

describe("S12 UX-2 - declare carries the card's mode and schedule", () => {
  it("every card's link names its own mode and the schedule it shows", () => {
    view();
    for (const mode of DOC.modes) {
      const link = document.querySelector(`[data-mode="${mode.mode_id}"] [data-declare-mode]`) as HTMLElement;
      expect(link.getAttribute("href")).toBe(declareModeHref(mode.mode_id, mode.default_schedule));
    }
    const hrefs = new Set(Array.from(document.querySelectorAll("[data-declare-mode]")).map((n) => n.getAttribute("href")));
    expect(hrefs.size).toBe(DOC.modes.length);
  });

  it("choosing another schedule on the card changes the link", () => {
    view();
    const card = document.querySelector('[data-mode="mode_1_decay"]') as HTMLElement;
    fireEvent.click(card.querySelector('[data-schedule="per_fold_decay"]') as HTMLElement);
    expect(card.querySelector("[data-declare-mode]")?.getAttribute("href")).toBe(declareModeHref("mode_1_decay", "per_fold_decay"));
  });
});

describe("S12 - less text, honest words", () => {
  it("no 'Read from ...' subtitle repeats the release chip; no 'cert cap not published' on a cap that does not exist", () => {
    view({ selectedReleaseId: DOC.current_release.release_id, selectedReleaseKind: "CURRENT" });
    expect(document.body.textContent).not.toContain("Read from");
    /* W4: the shared absence is silent text; its reason is the tooltip of the tab. */
    expect(document.querySelector("[data-cert-cap]")).toBeNull();
    expect(document.querySelector("[data-cert-cap-shared]")?.getAttribute("title")).toMatch(/the same for every mode/);
    expect(document.body.textContent).not.toContain("no cert cap");
    expect(document.body.textContent).not.toContain("cert cap not published");
  });

  it("rule two is a sentence a reader can use", () => {
    view();
    /* W4: rule two is the tooltip of the Execution routes tab, not a second box. */
    expect(document.querySelector("[data-rule-two]")).toBeNull();
    expect(document.querySelector('[data-tab="routes"]')?.getAttribute("title")).toMatch(/Two selector layers, never mixed/);
  });

  it("the empty 'avoid when - not published' footer is gone; the typed absence is the heading's tooltip", () => {
    view();
    /* W4: the "when to reach for which mode" table is gone (each card carries its own use-when line). */
    expect(document.body.textContent).not.toContain("avoid when");
    expect(document.querySelector("[data-mode-table]")).toBeNull();
  });

  it("unavailable schedules are exposed as disabled to assistive technology", () => {
    view();
    const invalid = document.querySelector("[data-schedule-invalid]") as HTMLElement;
    expect(invalid.getAttribute("aria-disabled")).toBe("true");
  });
});

describe("S12 UX-18/20 - release facts", () => {
  function open() {
    view();
    return document.querySelector("[data-release-facts]") as HTMLDetailsElement;
  }

  it("Escape closes the drawer", () => {
    const facts = open();
    facts.open = true;
    fireEvent.keyDown(facts, { key: "Escape" });
    expect(facts.open).toBe(false);
  });

  it("a key other than Escape leaves it open", () => {
    const facts = open();
    facts.open = true;
    fireEvent.keyDown(facts, { key: "a" });
    expect(facts.open).toBe(true);
  });

  it("trial counts are labelled and constraint tokens read as words, token in the tooltip", () => {
    const facts = open();
    expect(facts.textContent).toContain("trials per run");
    expect(facts.querySelector('dt[title^="Trials the fixed"]')).not.toBeNull();
    expect(facts.querySelector('dt[title^="Most trials"]')).not.toBeNull();
    expect(facts.textContent).not.toMatch(/MUST_BE_NULL/);
    expect(facts.querySelector('[title="MUST_BE_NULL"]')?.textContent).toBe("must be unset");
    expect(constraintWords("MUST_BE_NULL")).toBe("must be unset");
  });
});

describe("S12 UX-6 - a retained release is reachable, and its page has no dead tabs", () => {
  const HIST = DOC.historical_releases[0];

  it("value path: the retained-history label links to its identity page", () => {
    expect(HIST).toBeTruthy();
    view({ selectedReleaseId: DOC.current_release.release_id, selectedReleaseKind: "CURRENT" });
    const link = document.querySelector("[data-historical-link]") as HTMLElement;
    expect(link.getAttribute("href")).toBe(`/research/quantbt/atlas?release_id=${encodeURIComponent(HIST!.release_id)}`);
  });

  const identity = {
    release_id: "er_quantbt_108",
    package: "quantbt-engine",
    version: "1.0.8",
    status: "HISTORICAL_IDENTITY_RETAINED",
    facts_state: "NOT_PUBLISHED",
    facts_reason: "Only the historical release identity is retained.",
  } as never;

  it("a retained-identity page hides the three tabs and offers the way back to the current release", () => {
    view({ doc: null, selectedReleaseId: "er_quantbt_108", selectedReleaseKind: "HISTORICAL", historicalIdentity: identity });
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(document.querySelector("[data-back-to-current]")?.getAttribute("href")).toBe("/research/quantbt/atlas");
    expect(document.querySelector("[data-facts-reason]")?.textContent).toBe("Only the historical release identity is retained.");
  });

  it("typed-absence path: the current release keeps its tabs and offers no 'back'", () => {
    view({ selectedReleaseId: DOC.current_release.release_id, selectedReleaseKind: "CURRENT" });
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(document.querySelector("[data-back-to-current]")).toBeNull();
  });

  it("embedded in the hub, history stays plain text (no navigation away from the run)", () => {
    view({ embedded: true, selectedReleaseId: DOC.current_release.release_id, selectedReleaseKind: "CURRENT" });
    expect(document.querySelector("[data-historical-link]")).toBeNull();
  });
});
