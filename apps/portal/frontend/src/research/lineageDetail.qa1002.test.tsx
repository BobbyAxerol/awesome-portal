/**
 * Screen 10 — QA 2026-10-02 fixes (U4 rc link, U5 run report, U6 default selection, U7 unknown ?attempt=,
 * U8 parent link, text clean-up). The lineage is the published contract fixture, copied and edited.
 */
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { defaultAttemptId, labelRunIds, newestRcRun, PENDING_REASON, runHasReport } from "./LineageDetail";
import { LineageRoute } from "./LineageRoute";
import { resetLineageCache, type Lineage } from "./lineageClient";
import { forgetRunLabels } from "./runLabels";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const HEALTHY = JSON.parse(readFileSync(join(ROOT, "packages/contracts/fixtures", "research-attempt-lineage.healthy.valid.json"), "utf8")) as Lineage;
const ALPHA = HEALTHY.alpha.alpha_id;
const copy = (): Lineage => JSON.parse(JSON.stringify(HEALTHY)) as Lineage;
/** No version names a promotion pick run: the header link can only come from an attempt's release candidate. */
function withoutPick(body: Lineage): Lineage {
  body.alpha.versions.forEach((version) => {
    Object.assign(version.promotion_pick, { state: "NOT_PUBLISHED", run_id: null });
  });
  return body;
}

function serve(body: Lineage | { status: number; problem: string }) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    "status" in body
      ? new Response(JSON.stringify({ type: "about:blank", title: "x", status: body.status, code: body.problem }), { status: body.status, headers: { "content-type": "application/problem+json" } })
      : new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }),
  );
}

async function open(search = "") {
  render(
    <MemoryRouter initialEntries={[`/research/quantbt/alphas/${ALPHA}/lineage${search}`]}>
      <Routes>
        <Route path="/research/quantbt/alphas/:alphaId/lineage" element={<LineageRoute />} />
      </Routes>
    </MemoryRouter>,
  );
  await waitFor(() => expect(document.querySelector('[data-panel="counts"]')).toBeTruthy());
  await waitFor(() => expect(document.querySelector("[data-band]")).toBeTruthy());
}
const q = (selector: string) => document.querySelector(selector);
const selectedId = () => q('[data-panel="selected"]')?.getAttribute("data-selected-attempt");

beforeEach(() => {
  resetLineageCache();
  forgetRunLabels();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("QA S10 U6 default selection", () => {
  it("opens on the newest meaningful attempt, not the oldest root", async () => {
    serve(copy());
    await open();
    expect(selectedId()).toBe("att_04");
  });

  it("prefers a sealed release candidate, then the newest READY storied attempt; a deep link still wins", () => {
    const body = copy();
    const nodes = body.attempts.map((attempt) => ({ attempt }));
    expect(defaultAttemptId(nodes)).toBe("att_04");
    const sealed = copy();
    sealed.attempts[2]!.release_candidate = { kind: "SEALED_LOCAL", release_candidate_id: "rc_x", draft_id: null, run_id: "run-att_03", delivery_state: null, approval_state: null, sealed_at_utc_ms: 1 } as never;
    expect(defaultAttemptId(sealed.attempts.map((attempt) => ({ attempt })))).toBe("att_03");
    expect(defaultAttemptId([])).toBeNull();
  });

  it("an explicit ?attempt= is not overridden", async () => {
    serve(copy());
    await open("?attempt=att_01");
    expect(selectedId()).toBe("att_01");
    expect(q("[data-unknown-attempt]")).toBeNull();
  });
});

describe("QA S10 U7 unknown ?attempt=", () => {
  it("says the attempt was not returned and what is shown instead", async () => {
    serve(copy());
    await open("?attempt=att_nope");
    const note = q("[data-unknown-attempt]");
    expect(note?.getAttribute("data-unknown-attempt")).toBe("att_nope");
    expect(note?.textContent).toContain("att_nope");
    expect(note?.textContent).toContain("not returned");
    expect(selectedId()).toBe("att_04");
  });
});

describe("QA S10 U4 rc & publish", () => {
  it("links to the newest release candidate's run when no promotion pick names one", async () => {
    const body = withoutPick(copy());
    body.attempts[2]!.release_candidate = { kind: "SEALED_LOCAL", release_candidate_id: "rc_x", draft_id: null, run_id: "run-att_03", delivery_state: null, approval_state: null, sealed_at_utc_ms: 1 } as never;
    serve(body);
    await open();
    const link = q('.ln-links [data-action="release-candidate"]') as HTMLAnchorElement;
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toContain("run-att_03");
    expect(q('[data-action-unrouted="release-candidate"]')).toBeNull();
  });

  it("stays a reasoned dead end when no attempt has a release candidate", async () => {
    const body = withoutPick(copy());
    body.attempts.forEach((attempt) => {
      attempt.release_candidate = null;
    });
    serve(body);
    await open();
    expect(q('[data-action-unrouted="release-candidate"]')).toBeTruthy();
    expect(q('.ln-links a[data-action="release-candidate"]')).toBeNull();
    expect(newestRcRun(body.attempts)).toBeNull();
  });

  it("prefers a sealed candidate over a newer draft", () => {
    const body = copy();
    body.attempts[0]!.release_candidate = { kind: "SEALED_LOCAL", release_candidate_id: "rc_x", draft_id: null, run_id: "run-att_01", delivery_state: null, approval_state: null, sealed_at_utc_ms: 1 } as never;
    expect(newestRcRun(body.attempts)).toBe("run-att_01");
  });
});

describe("QA S10 U5 run report", () => {
  it("is a link for a finished run and a reasoned dead end for a FAILED one", async () => {
    serve(copy());
    await open("?attempt=att_03");
    expect(q('[data-panel="selected"] a[data-action="run-report"]')).toBeTruthy();
    cleanup();
    resetLineageCache();
    serve(copy());
    await open("?attempt=att_07");
    expect(q('[data-panel="selected"] a[data-action="run-report"]')).toBeNull();
    expect(q('[data-panel="selected"] [data-action-unrouted="run-report"]')?.getAttribute("title")).toContain("did not finish");
  });

  it("runHasReport follows the run and attempt state", () => {
    const body = copy();
    expect(runHasReport(body.attempts[2]!)).toBe(true);
    expect(runHasReport(body.attempts[6]!)).toBe(false);
    expect(runHasReport(body.attempts[4]!)).toBe(false);
  });
});

describe("QA S10 U8 parent link", () => {
  it("selects the parent, revealing it when it is a hidden probe", async () => {
    serve(copy());
    await open("?attempt=att_03");
    const parent = q('[data-panel="selected"] [data-action="select-parent"]') as HTMLElement;
    expect(parent).toBeTruthy();
    fireEvent.click(parent);
    await waitFor(() => expect(selectedId()).toBe("att_02"));
    expect(q('[data-attempt="att_02"]')).toBeTruthy();
  });

  it("a root has no parent link", async () => {
    serve(copy());
    await open("?attempt=att_01");
    expect(q('[data-action="select-parent"]')).toBeNull();
  });
});

describe("QA S10 text", () => {
  it("names a cloned run by its label, never by its raw id", () => {
    expect(labelRunIds("clone of rrun_464bf9c3dd8979af87e44388ea6910ef", () => "R-P04-018")).toBe("clone of R-P04-018");
    expect(labelRunIds("no run here")).toBe("no run here");
  });

  it("the probe chip says what it toggles", async () => {
    serve(copy());
    await open();
    expect(q("[data-probe-chip]")?.getAttribute("title")).toBe("show probe attempts");
  });

  it("an empty filter says so in four words and offers one button that clears it", async () => {
    serve(copy());
    await open();
    fireEvent.click(q('[data-filter="ABANDONED"]') as HTMLElement);
    await waitFor(() => expect(q("[data-tree-empty]")).toBeTruthy());
    expect(q("[data-tree-empty]")?.textContent).toContain("No attempt matches.");
    expect(q("[data-tree-empty]")?.textContent).not.toContain("widened");
    fireEvent.click(q('[data-action="clear-filters"]') as HTMLElement);
    await waitFor(() => expect(q("[data-tree-empty]")).toBeNull());
  });

  it("a refused read prints the notice once; the blocks stay quiet (no repeated 'withheld' line, no 'authority pending')", async () => {
    serve({ status: 503, problem: "RESEARCH_LINEAGE_UNAVAILABLE" });
    render(
      <MemoryRouter initialEntries={[`/research/quantbt/alphas/${ALPHA}/lineage`]}>
        <Routes>
          <Route path="/research/quantbt/alphas/:alphaId/lineage" element={<LineageRoute />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(q("[data-lineage-notice]")).toBeTruthy());
    await waitFor(() => expect(q('[data-lineage-notice="unavailable"]') ?? q("[data-lineage-notice]:not([data-lineage-notice='loading'])")).toBeTruthy());
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("withheld — the notice above says why");
    expect(text).not.toContain("read authority pending");
    expect(Object.keys(PENDING_REASON)).toEqual(["loading"]);
  });
});
