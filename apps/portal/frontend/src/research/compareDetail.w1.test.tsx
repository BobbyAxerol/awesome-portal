/**
 * W1 · G4 · S13 — run state in words, outputs only where they exist, no negative zero, a refusal with a way out.
 * Data: the published compare fixtures; only `run_state` is overridden (typed builder).
 */
import { cleanup, render, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { noNegativeZero, ppDelta } from "./CompareDetail";
import { CompareRoute } from "./CompareRoute";
import type { Compare } from "./compareClient";
import { forgetRunLabels } from "./runLabels";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  forgetRunLabels();
});

const FIXTURES = join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures");
const fixture = (name: string): Compare => JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as Compare;
const base = "/research/quantbt/alphas/delta-rsi-polynomial-alpha/compare";

function serve(status: number, body: unknown) {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () => new Response(JSON.stringify(body), { status, headers: { "content-type": status === 200 ? "application/json" : "application/problem+json" } }),
  );
}
function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/research/quantbt/alphas/:alphaId/compare" element={<CompareRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}
const page = () => document.querySelector('[data-screen="compare"]') as HTMLElement;
const settled = () => waitFor(() => expect(page().getAttribute("aria-busy")).toBe("false"));

/** Builder: the canonical attempts fixture with the first attempt's run state overridden. */
function withFirstState(state: "FAILED" | "CANCELLED" | "QUEUED"): { body: Compare; runId: string; otherId: string } {
  const body = fixture("research-compare.attempts.valid.json");
  if (body.result.mode !== "attempts") throw new Error("fixture guard");
  body.result.attempts[0]!.run_state = state;
  return { body, runId: body.result.attempts[0]!.run_id, otherId: body.result.attempts[1]!.run_id };
}

describe("W1-S13 run state words", () => {
  it.each([
    ["FAILED", "failed"],
    ["CANCELLED", "cancelled"],
    ["QUEUED", "queued"],
  ] as const)("a %s run prints '%s' and offers no report or RC", async (state, word) => {
    const { body, runId, otherId } = withFirstState(state);
    serve(200, body);
    renderAt(base);
    await settled();
    const card = document.querySelector(`[data-ladder-run="${runId}"]`) as HTMLElement;
    expect(card.querySelector("[data-run-state]")?.textContent).toBe(word);
    expect(card.querySelector("[data-report-link]")).toBeNull();
    expect(card.querySelector("[data-rc-link]")).toBeNull();
    /* A completed run keeps both links and does not spell its state on the card (it rides the tooltip). */
    const other = document.querySelector(`[data-ladder-run="${otherId}"]`) as HTMLElement;
    expect(other.querySelector("[data-report-link]")).toBeTruthy();
    expect(other.querySelector("[data-rc-link]")).toBeTruthy();
    expect(other.querySelector("[data-run-state]")).toBeNull();
    expect(other.querySelector("[data-run-line]")?.getAttribute("title")).toContain("completed");
  });

  it("no raw run-state token is visible on a ladder card", async () => {
    const body = fixture("research-compare.attempts.valid.json");
    serve(200, body);
    renderAt(base);
    await settled();
    for (const card of document.querySelectorAll("[data-ladder-run]")) expect(card.textContent).not.toMatch(/\bREADY\b|\bFAILED\b|\bCANCELLED\b/);
  });
});

describe("W1-S13 negative zero", () => {
  it("a tiny negative served value prints without a sign", () => {
    expect(noNegativeZero("−0.000")).toBe("0.000");
    expect(noNegativeZero("-0.00")).toBe("0.00");
    expect(noNegativeZero("−0.00%")).toBe("0.00%");
    expect(ppDelta("-0.0000001")).toBe("≈0 pp");
  });
  it("a real negative keeps the typographic minus", () => {
    expect(noNegativeZero("−0.001")).toBe("−0.001");
    expect(ppDelta("-0.0316")).toBe("−3.16 pp");
    expect(noNegativeZero(null)).toBeNull();
  });
});

describe("W1-S13 refusal", () => {
  it("a denied alpha is the notice and Open Run Library, with no mode tabs", async () => {
    serve(403, { type: "about:blank", title: "x", status: 403, code: "RESEARCH_COMPARE_FORBIDDEN" });
    renderAt(base);
    await waitFor(() => expect(page().getAttribute("data-compare-state")).toBe("denied"));
    expect(document.querySelector("[data-mode-option]")).toBeNull();
    expect(document.querySelector('a[data-action="open-run-library"]')?.getAttribute("href")).toBe("/research/quantbt/runs");
  });
});
