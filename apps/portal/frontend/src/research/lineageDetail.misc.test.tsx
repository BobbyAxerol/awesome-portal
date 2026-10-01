/**
 * Batch F4/MISC · S10 — traced children are never folded behind "show probe attempts".
 * Canonical healthy lineage; att_07 is a PROBE with intent NEW (the only hideable one).
 */
import { cleanup, render, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isHideableProbe, isTracedChild } from "./LineageDetail";
import { LineageRoute } from "./LineageRoute";
import { resetLineageCache, type Lineage } from "./lineageClient";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const HEALTHY = JSON.parse(
  readFileSync(join(ROOT, "packages/contracts/fixtures/research-attempt-lineage.healthy.valid.json"), "utf8"),
) as Lineage;
const ALPHA = HEALTHY.alpha.alpha_id;

beforeEach(() => resetLineageCache());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function mount(body: Lineage) {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }),
  );
  render(
    <MemoryRouter initialEntries={[`/research/quantbt/alphas/${ALPHA}/lineage`]}>
      <Routes>
        <Route path="/research/quantbt/alphas/:alphaId/lineage" element={<LineageRoute />} />
      </Routes>
    </MemoryRouter>,
  );
  await waitFor(() => expect(document.querySelector('[data-panel="counts"]')).toBeTruthy());
  await waitFor(() => expect(document.querySelector("[data-band]")).toBeTruthy());
}
const ids = () => [...document.querySelectorAll("[data-attempt]")].map((el) => el.getAttribute("data-attempt"));
const toggle = () => document.querySelector('[data-action="toggle-probes"]') as HTMLButtonElement;

describe("S10 traced children", () => {
  it("classifies only clone / reproduction intents as traced", () => {
    expect(isTracedChild({ intent_kind: "CLONE_FOR_EXPERIMENT" })).toBe(true);
    expect(isTracedChild({ intent_kind: "REPRODUCE_EXISTING" })).toBe(true);
    expect(isTracedChild({ intent_kind: "NEW" })).toBe(false);
    expect(isTracedChild({ intent_kind: "UPGRADE_ENGINE_EXPERIMENT" })).toBe(false);
    expect(isHideableProbe({ presentation_kind: "PROBE", intent_kind: "CLONE_FOR_EXPERIMENT" })).toBe(false);
    expect(isHideableProbe({ presentation_kind: "PROBE", intent_kind: "NEW" })).toBe(true);
    expect(isHideableProbe({ presentation_kind: "STORIED", intent_kind: "NEW" })).toBe(false);
  });

  it("a probe-class clone is on screen by default; only the plain probe waits for the toggle", async () => {
    await mount(HEALTHY);
    expect(ids()).toContain("att_02"); // PROBE + CLONE_FOR_EXPERIMENT
    expect(ids()).not.toContain("att_07"); // PROBE + NEW
    expect(toggle().textContent).toBe("show 1 probe attempts");
  });

  it("a probe-class reproduction is on screen too, and with no hideable probe the toggle is inert", async () => {
    const body = JSON.parse(JSON.stringify(HEALTHY)) as Lineage;
    body.attempts.find((attempt) => attempt.attempt_id === "att_07")!.intent_kind = "REPRODUCE_EXISTING";
    await mount(body);
    expect(ids()).toContain("att_07");
    expect(toggle().disabled).toBe(true);
    expect(toggle().textContent).toBe("show 0 probe attempts");
  });
});
