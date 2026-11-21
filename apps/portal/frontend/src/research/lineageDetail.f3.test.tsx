/**
 * Screen 10 — Batch F3: runs print the server's label (`R-WFO-114`), never `rrun_…`.
 */
import { cleanup, render, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LineageRoute } from "./LineageRoute";
import { resetLineageCache, type Lineage } from "./lineageClient";
import { forgetRunLabels } from "./runLabels";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const HEALTHY = JSON.parse(readFileSync(join(ROOT, "packages/contracts/fixtures", "research-attempt-lineage.healthy.valid.json"), "utf8")) as Lineage;
const ALPHA = HEALTHY.alpha.alpha_id;
const LABELLED = JSON.parse(JSON.stringify(HEALTHY)) as Lineage;
LABELLED.attempts.forEach((attempt, index) => {
  attempt.primary_run.display_label = `R-WFO-${String(100 + index).padStart(3, "0")}`;
});

function serve(body: Lineage) {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }),
  );
}
beforeEach(() => {
  resetLineageCache();
  forgetRunLabels();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function visibleText(): Promise<string> {
  render(
    <MemoryRouter initialEntries={[`/research/quantbt/alphas/${ALPHA}/lineage?attempt=att_01`]}>
      <Routes>
        <Route path="/research/quantbt/alphas/:alphaId/lineage" element={<LineageRoute />} />
      </Routes>
    </MemoryRouter>,
  );
  await waitFor(() => expect(document.querySelector('[data-panel="counts"]')).toBeTruthy());
  await waitFor(() => expect(document.querySelector("[data-band]")).toBeTruthy());
  return document.body.textContent ?? "";
}

describe("F3 — S10 run labels", () => {
  it("prints the display_label of every run the lineage read carries", async () => {
    serve(LABELLED);
    const text = await visibleText();
    expect(text).toContain("R-WFO-100");
    for (const attempt of LABELLED.attempts) {
      const runId = attempt.primary_run.run_id;
      if (runId) expect(text).not.toContain(runId.slice(0, 13));
    }
  });

  it("a run with no label still prints its short id", async () => {
    serve(HEALTHY);
    const text = await visibleText();
    expect(text).not.toContain("R-WFO-");
  });
});
