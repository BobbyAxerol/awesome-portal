/**
 * W1 · G4 · S12 — an unknown release is one line and a way out; the cert cap every mode shares is said once.
 * Data: the published atlas fixture (the document the foundation read returns).
 */
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AtlasDocument } from "./atlas";
import { EngineAtlas, sharedCertCap } from "./EngineAtlas";
import { FOUNDATION_REFUSAL_SENTENCE } from "./foundationClient";
import { researchState, type ResearchState } from "./state";

afterEach(cleanup);

const DOC = (JSON.parse(readFileSync(join(__dirname, "../../e2e/research-foundation/atlas.json"), "utf8")) as { atlas: AtlasDocument }).atlas;

function view(doc: AtlasDocument | null, state: ResearchState, tab: "modes" | "routes" | "claims" = "modes") {
  return render(
    <MemoryRouter>
      <EngineAtlas doc={doc} state={state} tab={tab} onTabChange={vi.fn()} />
    </MemoryRouter>,
  );
}

describe("W1-S12 unknown release", () => {
  it("says 'Release not found.', offers Current release, and draws no tabs, panel or EMPTY", () => {
    const state: ResearchState = {
      state: "empty",
      reason: FOUNDATION_REFUSAL_SENTENCE.RESEARCH_FOUNDATION_RELEASE_NOT_FOUND!,
      mayRetry: false,
      retainsContent: false,
    };
    view(null, state);
    expect(document.querySelector("[data-atlas-not-found-message]")?.textContent).toBe("Release not found.");
    expect(document.querySelector("[data-back-to-current]")?.getAttribute("href")).toBe("/research/quantbt/atlas");
    expect(document.querySelector('[role="tablist"]')).toBeNull();
    expect(document.querySelector("[data-research-state]")).toBeNull();
    expect(document.body.textContent).not.toMatch(/EMPTY/i);
  });

  it("a loaded atlas is untouched", () => {
    view(DOC, researchState({ kind: "ok", rowCount: 1 }));
    expect(document.querySelector("[data-atlas-not-found]")).toBeNull();
    expect(document.querySelectorAll('[role="tab"]')).toHaveLength(3);
  });
});

describe("W1-S12 shared cert cap", () => {
  it("the fixture's five modes publish one reason, so one chip serves the tab", () => {
    expect(sharedCertCap(DOC.modes)).not.toBeNull();
    view(DOC, researchState({ kind: "ok", rowCount: 1 }));
    expect(document.querySelectorAll("[data-cert-cap]")).toHaveLength(1);
    expect(document.querySelectorAll('[data-not-published="cert_cap"]')).toHaveLength(0);
  });

  it("different reasons keep each mode's own cap", () => {
    const modes = JSON.parse(JSON.stringify(DOC.modes)) as AtlasDocument["modes"];
    const fact = modes[0]!.facts!.schedules[0]!;
    fact.cert_cap = { ...fact.cert_cap, reason: "A different reason." } as typeof fact.cert_cap;
    expect(sharedCertCap(modes)).toBeNull();
  });
});
