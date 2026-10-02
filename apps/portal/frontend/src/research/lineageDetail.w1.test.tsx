/**
 * W1 · G4 · S10 — the screen opens on the viewed attempt plus the newest 8; older probes sit behind ONE toggle
 * written to `?probes=1`; a failed run offers Progress instead of report / freeze / RC; a refusal is the notice only.
 *
 * Data: the published healthy lineage fixture (packages/contracts/fixtures), scaled by a typed builder that
 * appends plain NEW probes OLDER than every original attempt (builder output, not a captured read).
 */
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LINEAGE_RECENT, recentAttemptIds } from "./LineageDetail";
import { LineageRoute } from "./LineageRoute";
import { resetLineageCache, type Lineage } from "./lineageClient";
import { forgetRunLabels } from "./runLabels";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const HEALTHY = JSON.parse(readFileSync(join(ROOT, "packages/contracts/fixtures", "research-attempt-lineage.healthy.valid.json"), "utf8")) as Lineage;
const ALPHA = HEALTHY.alpha.alpha_id;
const OLDEST = Math.min(...HEALTHY.attempts.map((a) => a.created_at_utc_ms));

/** Builder: the healthy lineage plus `n` plain probes, each older than every original attempt (p10 is the newest of them). */
function scaled(n: number): Lineage {
  const body = JSON.parse(JSON.stringify(HEALTHY)) as Lineage;
  const template = body.attempts.find((a) => a.attempt_id === "att_07")!;
  for (let i = 1; i <= n; i += 1) {
    const id = `att_p${String(i).padStart(2, "0")}`;
    const copy = JSON.parse(JSON.stringify(template)) as Lineage["attempts"][number];
    copy.attempt_id = id;
    copy.parent_attempt_id = null;
    copy.parent_state = "ROOT";
    copy.state = "READY";
    copy.intent_kind = "NEW";
    copy.presentation_kind = "PROBE";
    copy.created_at_utc_ms = OLDEST - 100_000 + i;
    copy.primary_run = { ...copy.primary_run, run_id: `run-p${String(i).padStart(2, "0")}`, state: "READY", display_label: null };
    copy.child_runs = [];
    body.attempts.push(copy);
  }
  body.counts.total_attempts = body.attempts.length;
  body.counts.returned_attempts = body.attempts.length;
  return body;
}

function serve(body: Lineage | { status: number; problem: string }) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    "status" in body
      ? new Response(JSON.stringify({ type: "about:blank", title: "x", status: body.status, code: body.problem }), { status: body.status, headers: { "content-type": "application/problem+json" } })
      : new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }),
  );
}

function Where() {
  const location = useLocation();
  return <output data-where>{location.search}</output>;
}

async function open(search = "") {
  render(
    <MemoryRouter initialEntries={[`/research/quantbt/alphas/${ALPHA}/lineage${search}`]}>
      <Routes>
        <Route path="/research/quantbt/alphas/:alphaId/lineage" element={<><LineageRoute /><Where /></>} />
      </Routes>
    </MemoryRouter>,
  );
  await waitFor(() => expect(document.querySelector('[data-panel="counts"]')).toBeTruthy());
  await waitFor(() => expect(document.querySelector("[data-band]")).toBeTruthy());
}

const q = (selector: string) => document.querySelector(selector);
const ids = () => [...document.querySelectorAll("[data-attempt]")].map((el) => el.getAttribute("data-attempt"));
const selectedId = () => q('[data-panel="selected"]')?.getAttribute("data-selected-attempt");
const toggle = () => q('[data-action="toggle-probes"]') as HTMLButtonElement;
const counter = () => q("[data-counter]")?.textContent;

beforeEach(() => {
  resetLineageCache();
  forgetRunLabels();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("W1-S10 B4 default view", () => {
  it("lists the newest 8 and every non-probe; the older probes are counted behind one toggle", async () => {
    serve(scaled(10));
    await open();
    expect(LINEAGE_RECENT).toBe(8);
    expect(ids()).toContain("att_p10");
    expect(ids()).not.toContain("att_p09");
    expect(ids()).toHaveLength(8);
    expect(counter()).toBe("showing 8 of 17 attempts");
    expect(toggle().textContent).toBe("older probes (9)");
    expect(toggle().getAttribute("aria-pressed")).toBe("false");
  });

  it("the toggle and the band chip count the same probes", async () => {
    serve(scaled(10));
    await open();
    expect(q("[data-probe-chip]")?.textContent).toBe("+9 older");
    expect(toggle().textContent).toContain("(9)");
  });

  it("recentAttemptIds picks by the server's timestamp and never more than 8", () => {
    const body = scaled(10);
    const recent = recentAttemptIds(body.attempts);
    expect(recent.size).toBe(8);
    expect(recent.has("att_07")).toBe(true);
    expect(recent.has("att_p01")).toBe(false);
  });

  it("the toggle lists every probe and writes ?probes=1; again removes it", async () => {
    serve(scaled(10));
    await open();
    fireEvent.click(toggle());
    expect(ids()).toHaveLength(17);
    expect(q("[data-where]")?.textContent).toContain("probes=1");
    expect(toggle().getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(toggle());
    expect(ids()).toHaveLength(8);
    expect(q("[data-where]")?.textContent).not.toContain("probes");
  });

  it("?probes=1 opens with every probe listed", async () => {
    serve(scaled(10));
    await open("?probes=1");
    expect(ids()).toHaveLength(17);
    expect(toggle().getAttribute("aria-pressed")).toBe("true");
  });
});

describe("W1-S10 B4 ?run= opens the viewed attempt", () => {
  it("selects the attempt that holds the run, even a hidden-by-default probe, and keeps it listed", async () => {
    serve(scaled(10));
    await open("?run=run-p03");
    expect(selectedId()).toBe("att_p03");
    expect(ids()).toContain("att_p03");
    expect(toggle().textContent).toBe("older probes (8)");
    expect(q("[data-unknown-run]")).toBeNull();
  });

  it("?attempt= wins over ?run=", async () => {
    serve(scaled(10));
    await open("?attempt=att_01&run=run-p03");
    expect(selectedId()).toBe("att_01");
  });

  it("a run that is not in the graph says so in one line and opens the default", async () => {
    serve(scaled(10));
    await open("?run=run-nope");
    expect(q("[data-unknown-run]")?.textContent).toBe("That run is not in this graph.");
    expect(selectedId()).toBe("att_04");
  });
});

describe("W1-S10 selected attempt links follow the run's phase", () => {
  it("a completed run offers report, freeze and release candidate", async () => {
    serve(scaled(10));
    await open("?attempt=att_03");
    for (const action of ["run-report", "open-freeze", "open-release-candidate"]) expect(q(`[data-panel="selected"] a[data-action="${action}"]`), action).toBeTruthy();
    expect(q('[data-panel="selected"] a[data-action="open-progress"]')).toBeNull();
  });

  it("a failed run offers Progress and Evidence, never report, freeze or RC", async () => {
    serve(scaled(10));
    await open("?attempt=att_07");
    expect(q('[data-panel="selected"] a[data-action="open-evidence"]')).toBeTruthy();
    expect(q('[data-panel="selected"] a[data-action="open-progress"]')?.getAttribute("href")).toBe("/research/quantbt/runs/run-att_07/progress");
    for (const action of ["run-report", "open-freeze", "open-release-candidate"]) expect(q(`[data-panel="selected"] a[data-action="${action}"]`), action).toBeNull();
  });
});

describe("W1-S10 refusal", () => {
  it("a denied alpha is the notice and Open Run Library: no skeleton, no ghost panels", async () => {
    serve({ status: 403, problem: "RESEARCH_LINEAGE_FORBIDDEN" });
    render(
      <MemoryRouter initialEntries={[`/research/quantbt/alphas/${ALPHA}/lineage`]}>
        <Routes>
          <Route path="/research/quantbt/alphas/:alphaId/lineage" element={<LineageRoute />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(q('[data-lineage-state="denied"]')).toBeTruthy());
    expect([...document.querySelectorAll("[data-panel]")].map((el) => el.getAttribute("data-panel"))).toEqual(["header", "notice"]);
    expect(q("[data-lineage-pending]")).toBeNull();
    expect(q('a[data-action="open-run-library"]')?.getAttribute("href")).toBe("/research/quantbt/runs");
  });
});
