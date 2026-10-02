/**
 * Screen 10 — QA 2026-10-02 second wave: the clone reason names no raw run id in the panel, a root is said once,
 * no "counter — withheld" after a refusal, the reasoned "run report" dead end is keyboard-reachable.
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
const RAW = "rrun_464bf9c3dd8979af87e44388ea6910ef";
const copy = (): Lineage => JSON.parse(JSON.stringify(HEALTHY)) as Lineage;
const q = (selector: string) => document.querySelector(selector);

function serve(body: Lineage | { status: number; problem: string } | "hang") {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    if (body === "hang") return new Promise<Response>(() => undefined);
    return "status" in body
      ? new Response(JSON.stringify({ type: "about:blank", title: "x", status: body.status, code: body.problem }), { status: body.status, headers: { "content-type": "application/problem+json" } })
      : new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  });
}

function mount(search = "") {
  render(
    <MemoryRouter initialEntries={[`/research/quantbt/alphas/${ALPHA}/lineage${search}`]}>
      <Routes>
        <Route path="/research/quantbt/alphas/:alphaId/lineage" element={<LineageRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}
async function open(search = "") {
  mount(search);
  await waitFor(() => expect(q('[data-panel="counts"]')).toBeTruthy());
  await waitFor(() => expect(q("[data-band]")).toBeTruthy());
}

beforeEach(() => {
  resetLineageCache();
  forgetRunLabels();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("QA2 S10 clone reason in the panel", () => {
  it("prints no raw run id in the claim or the verdict of the selected attempt", async () => {
    const body = copy();
    body.attempts[2]!.run_facts.claim.text = `clone of ${RAW}`;
    serve(body);
    await open("?attempt=att_03");
    const panel = q('[data-panel="selected"]')?.textContent ?? "";
    expect(panel).toContain("clone of");
    expect(panel).not.toContain(RAW);
  });
});

describe("QA2 S10 root is said once", () => {
  it("the card has no root line, the panel says it in the parent row and a short diff note", async () => {
    serve(copy());
    await open("?attempt=att_01");
    expect(q('[data-attempt="att_01"]')?.textContent).not.toContain("no parent");
    const panel = q('[data-panel="selected"]')?.textContent ?? "";
    expect(panel).toContain("— root");
    expect(document.body.textContent).not.toContain("Root attempt — nothing to diff against");
    expect(q('[data-panel="diff"]')?.textContent).toContain("No parent to diff.");
  });
});

describe("QA2 S10 counter", () => {
  it("a refusal prints no 'counter — withheld'; the blocks stay quiet", async () => {
    serve({ status: 503, problem: "RESEARCH_LINEAGE_UNAVAILABLE" });
    mount();
    await waitFor(() => expect(q("[data-lineage-notice]:not([data-lineage-notice='loading'])")).toBeTruthy());
    expect(document.body.textContent).not.toContain("withheld");
    expect(q("[data-counter-pending]")).toBeNull();
  });

  it("loading still says so", async () => {
    serve("hang");
    mount();
    await waitFor(() => expect(q('[data-counter-pending="loading"]')).toBeTruthy());
    expect(q('[data-counter-pending="loading"]')?.textContent).toBe("counter — loading");
  });
});

describe("QA2 S10 run report dead end", () => {
  it("W1: a run that did not finish shows no dead-end report control at all", async () => {
    serve(copy());
    await open("?attempt=att_07");
    expect(q('[data-panel="selected"] [data-action-unrouted="run-report"]')).toBeNull();
    expect(q('[data-panel="selected"] [data-action="run-report"]')).toBeNull();
  });
});
