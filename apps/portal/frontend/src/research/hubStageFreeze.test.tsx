/**
 * Screen 04 · Stage 3 tab — the hub draws Screen 07's freeze body, not a
 * "not published" placeholder (HiFi 04 `isFreeze`).
 *
 * Fixtures are the canonical foundation bodies the e2e fixture router serves
 * (`e2e/research-foundation/evidence-hub.json`, `freeze-detail.json`, run
 * R-WFO-118, fixed P04 profile); the retained-source lanes refuse it exactly
 * as `e2e/fixtures.ts` does.
 */
import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EvidenceFlowRoute } from "./EvidenceFlowRoute";
import { FreezeRoute } from "./FreezeRoute";
import { forgetRunIdentities } from "./retainedLane";

afterEach(cleanup);

const FOUNDATION = join(process.cwd(), "e2e", "research-foundation");
const load = (name: string) => JSON.parse(readFileSync(join(FOUNDATION, name), "utf8")) as Record<string, unknown>;
const HUB = load("evidence-hub.json");
const FREEZE = load("freeze-detail.json");
const RUN = HUB.run_id as string;
const NOT_ADMITTED = {
  error: {
    code: "RESEARCH_CURRENT_SOURCE_NOT_ADMITTED",
    message: "This run was produced by the fixed P04 profile, which the retained-source lane does not admit.",
  },
};

function stub() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = new URL(url, "http://x");
      const path = u.pathname;
      const kind = u.searchParams.get("kind");
      const [status, payload] = path.includes("/current-source/")
        ? [404, NOT_ADMITTED]
        : path.endsWith("/evidence/series")
          ? [200, load(kind === "MONTHLY_RETURNS" ? "evidence-series-monthly.json" : kind === "ROLLING_RETURNS_20" ? "evidence-series-rolling.json" : "evidence-series-equity.json")]
          : path.endsWith("/evidence")
            ? [200, HUB]
            : path.endsWith("/freeze")
              ? [200, FREEZE]
              : [404, { error: { code: "UNEXPECTED" } }];
      return { ok: status < 300, status, statusText: String(status), headers: new Headers(), json: async () => payload } as unknown as Response;
    }),
  );
}

function mount(path: string, hash: string) {
  window.history.replaceState(null, "", `${path}${hash}`);
  return render(
    <MemoryRouter initialEntries={[`${path}${hash}`]}>
      <Routes>
        <Route path="/research/quantbt/runs/:runId/evidence" element={<EvidenceFlowRoute />} />
        <Route path="/research/quantbt/runs/:runId/freeze" element={<FreezeRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
  forgetRunIdentities();
  stub();
});

describe("Screen 04 · Freeze tab draws the Screen 07 body", () => {
  it("renders the freeze body blocks inside [data-panel='freeze'], not the preview placeholder", async () => {
    const { container } = mount(`/research/quantbt/runs/${RUN}/evidence`, "#stage=freeze&fold=1");
    await waitFor(() => expect(container.querySelector("[data-panel='freeze'] [data-panel='ordering']")).toBeTruthy());
    const tab = container.querySelector("[data-panel='freeze']") as HTMLElement;
    for (const block of ["ordering", "frozen-parameters", "digest-chain", "inspection"]) {
      expect(tab.querySelector(`[data-panel='${block}']`), block).toBeTruthy();
    }
    expect(tab.querySelector("[data-screen='freeze-detail'][data-embedded='hub']")).toBeTruthy();
    expect(tab.querySelector("[data-freeze-strip]")).toBeTruthy();
    /* The deep dive's own chrome is left to the hub. */
    expect(tab.querySelector("nav[aria-label='Breadcrumb']")).toBeNull();
    expect(tab.querySelector("h1")).toBeNull();
    expect(tab.querySelector("[data-header-actions]")).toBeNull();
    /* The hub keeps the HiFi tab title and the deep-dive link. */
    expect(tab.querySelector("[data-tab-heading]")?.textContent).toBe("Stage 3 · Freeze");
    const link = tab.querySelector("[data-deep-dive='freeze']") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toContain(`/research/quantbt/runs/${RUN}/freeze`);
    /* The untrue placeholder is gone for this stage. */
    expect(tab.textContent).not.toContain("the Evidence Hub publishes this stage's timeline");
    expect(tab.querySelector("[data-stage-shells]")).toBeNull();
  });

  it("the standalone deep dive still draws its own header (embedded=false unchanged)", async () => {
    const { container } = mount(`/research/quantbt/runs/${RUN}/freeze`, "#fold=1");
    await waitFor(() => expect(container.querySelector("[data-panel='ordering']")).toBeTruthy());
    const screen = container.querySelector("[data-screen='freeze-detail']") as HTMLElement;
    expect(screen.hasAttribute("data-embedded")).toBe(false);
    expect(screen.className).toContain("max-w-[1440px]");
    expect(screen.querySelector("nav[aria-label='Breadcrumb']")).toBeTruthy();
    expect(screen.querySelector("h1")?.textContent).toContain("S3 · Freeze — ordering & integrity");
    expect(screen.querySelector("[data-header-actions]")).toBeTruthy();
  });
});
