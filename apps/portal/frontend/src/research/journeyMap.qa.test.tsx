/**
 * QA 2026-10-02 · S00 Journey Map fixes (group S00_S01_S12), drawn from the
 * published revision-4 descriptor.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { JourneyMapRoute } from "./foundationRoutes";
import { JourneyMap, isOffSequence } from "./JourneyMap";
import type { JourneyDescriptor } from "./foundationClient";
import { researchState } from "./state";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const V4 = JSON.parse(readFileSync(join(ROOT, "packages/contracts/fixtures/research-foundation.journey-v4.valid.json"), "utf8")) as {
  descriptor: JourneyDescriptor;
};

function draw(runId: string | null = null) {
  render(
    <MemoryRouter>
      <JourneyMap descriptor={V4.descriptor} inspection={null} state={researchState({ kind: "ok", rowCount: 1 })} runId={runId} />
    </MemoryRouter>,
  );
}

describe("S00 - one instruction per card, shorter title, no dangling arrows", () => {
  it("a picker card says 'pick a run' once; its kind is a tooltip, not a printed tag", () => {
    draw();
    const card = document.querySelector('[data-card-picks-run="split"]') as HTMLElement;
    expect(card.textContent?.match(/pick a run/gi)).toHaveLength(1);
    expect(card.textContent).not.toContain("PICK A RUN");
    expect(card.textContent).not.toMatch(/redesign/i);
    expect(card.getAttribute("title")).toContain("Redesigned Research screen");
  });

  it("a blocked card says BLOCKED once", () => {
    draw();
    const blocked = document.querySelector('[data-card-unreachable="BLOCKED"]') as HTMLElement;
    expect(blocked.textContent?.match(/BLOCKED/g)).toHaveLength(1);
  });

  it("the h1 is short and has no tooltip repeating itself", () => {
    draw();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Journey Map");
    expect(document.querySelector("h1")?.hasAttribute("title")).toBe(false);
  });

  it("the hash of the descriptor is hidden from assistive technology", () => {
    draw();
    expect(document.querySelector("[data-descriptor-digest]")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("no arrow runs into or out of Lineage, Atlas or Compare", () => {
    expect(isOffSequence({ target_key: "engine_atlas" })).toBe(true);
    expect(isOffSequence({ target_key: "attempt_lineage" })).toBe(true);
    expect(isOffSequence({ target_key: "compare_runs" })).toBe(true);
    expect(isOffSequence({ target_key: "execute_replay" })).toBe(false);
    draw();
    const phase = Array.from(document.querySelectorAll("[data-phase]")).find((p) => p.querySelector('[data-card="engine-atlas"]')) as HTMLElement;
    const cards = Array.from(phase.querySelectorAll("[data-card]"));
    for (const [index, card] of cards.entries()) {
      /* QA2 UX-16: the arrow now leads the card it points at. */
      const arrowAfter = (cards[index + 1]?.parentElement as HTMLElement | undefined)?.querySelector("[data-arrow]") != null;
      const next = cards[index + 1];
      const key = (el: Element | undefined) => (el ? V4.descriptor.phases.flatMap((p) => p.cards).find((c) => c.card_id === el.getAttribute("data-card"))?.target_key : undefined);
      if (isOffSequence({ target_key: key(card) ?? "" }) || (next && isOffSequence({ target_key: key(next) ?? "" }))) {
        expect(arrowAfter, `arrow after ${card.getAttribute("data-card")}`).toBe(false);
      }
    }
  });
});

describe("S00 UX-17 - a 409 keeps the saved map, like a 500 or 503", () => {
  function stub(status: number) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: { code: "X", message: "x" }, request_id: "req_1" }), { status, headers: { "content-type": "application/json" } })),
    );
  }
  async function open() {
    render(
      <MemoryRouter initialEntries={["/research/quantbt/journey"]}>
        <Routes>
          <Route path="/research/quantbt/journey" element={<JourneyMapRoute />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("value path: 409 draws the bundled map with a retry and the short stale line", async () => {
    stub(409);
    await open();
    await waitFor(() => expect(document.querySelector("[data-phases]")).not.toBeNull());
    expect(document.body.textContent).toContain("Showing the saved map. Live status unavailable.");
    expect(document.body.textContent).toContain("Retry map read");
  });

  it("typed-absence path: a 403 still draws no map", async () => {
    stub(403);
    await open();
    await waitFor(() => expect(document.querySelector("[data-research-panel]")).not.toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(document.querySelector("[data-phases]")).toBeNull();
  });
});
