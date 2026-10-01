/**
 * F1 · S12 — an Atlas response without a document says why (CG-FG-S12-01).
 *
 * `selected_release_kind: "HISTORICAL"` arrives as `atlas: null` plus a served
 * `historical_identity`. The body used to be empty and the note hard-coded.
 * The identity below is the canonical fixture, not a hand-built body.
 */
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { EngineAtlas, type AtlasHistoricalIdentity } from "./EngineAtlas";
import type { AtlasResponse } from "./foundationClient";
import { researchState } from "./state";

afterEach(cleanup);

const served = JSON.parse(
  readFileSync(
    join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures", "research-foundation.historical-identity.valid.json"),
    "utf8",
  ),
) as AtlasResponse;
const identity = served.historical_identity as AtlasHistoricalIdentity;

function draw(props: Partial<React.ComponentProps<typeof EngineAtlas>>) {
  render(
    <MemoryRouter>
      <EngineAtlas
        doc={null}
        tab="modes"
        onTabChange={() => undefined}
        state={researchState({ kind: "ok", rowCount: 1 })}
        selectedReleaseId="er_quantbt_108"
        selectedReleaseKind="HISTORICAL"
        {...props}
      />
    </MemoryRouter>,
  );
}

describe("a HISTORICAL atlas response (canonical fixture)", () => {
  it("is the union member the contract names", () => {
    expect(served.selected_release_kind).toBe("HISTORICAL");
    expect(served.atlas).toBeNull();
    expect(identity.facts_state).toBe("NOT_PUBLISHED");
  });

  it("shows the served identity, state code and reason — and no invented claim", () => {
    draw({ historicalIdentity: identity });
    const note = document.querySelector("[data-historical-note]") as HTMLElement;
    expect(note.textContent).toBe(`${identity.package} ${identity.version} · ${identity.status}`);
    expect(note.getAttribute("data-historical-identity")).toBe(identity.release_id);
    expect(document.querySelector("[data-facts-state]")?.textContent).toBe(identity.facts_state);
    expect(document.querySelector("[data-facts-reason]")?.textContent).toBe(identity.facts_reason);
    expect(document.body.textContent).not.toMatch(/cannot run|not installed/);
    /* No tab body is drawn for a document that was not served. */
    expect(document.querySelector("[role='tabpanel']")).toBeNull();
  });

  it("without a served identity it still says what is absent, and invents no reason", () => {
    draw({ historicalIdentity: null });
    expect(document.querySelector("[data-historical-note]")).toBeNull();
    const absent = document.querySelector("[data-atlas-facts-absent]") as HTMLElement;
    expect(absent.textContent).toBe("route, mode and claim facts — not published");
    expect(document.querySelector("[data-facts-state]")).toBeNull();
    expect(document.querySelector("[data-facts-reason]")).toBeNull();
  });

  it("loading is not 'not published'", () => {
    draw({ state: researchState({ kind: "in-flight", hasAcceptedResponse: false }), historicalIdentity: null });
    expect(document.querySelector("[data-atlas-facts-absent]")).toBeNull();
  });
});
