/**
 * Screen 04's Search tab draws Screen 06's body (HiFi 04 `sc-if isSearch`).
 *
 * Before: the tab printed four "not published — the Evidence Hub publishes
 * this stage's timeline, not its content" boxes while Screen 06 read and drew
 * that very data. The tab now mounts Screen 06's route container embedded:
 * same reads, same panels, no second header. The standalone route keeps its
 * header. Bodies are the real captures other hub/deep-dive tests load.
 */
import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EvidenceFlow } from "./EvidenceFlow";
import type { CurrentSourceSearch } from "./searchClient";
import type { SearchDetail } from "./searchClient";
import { SearchRoute } from "./SearchRoute";
import { DEFAULT_CURSOR, forgetObservedFolds } from "./evidenceCursor";
import { forgetSearchReads } from "./useSearch";
import { forgetRunIdentities } from "./retainedLane";
import { researchState } from "./state";

const W3B = JSON.parse(readFileSync(join(process.cwd(), "src", "research", "w3bRealWfo.fixture.json"), "utf8")) as {
  hub_evidence: React.ComponentProps<typeof EvidenceFlow>["hub"] & object;
  progress: unknown;
  requested_spec: unknown;
  hub_search: SearchDetail;
};
const W3 = JSON.parse(readFileSync(join(process.cwd(), "src", "research", "w3RealWfo.fixture.json"), "utf8")) as {
  search: CurrentSourceSearch;
  evidence: unknown;
};
const RUN = W3.search.run_id;
const PREVIEW_SENTENCE = "the Evidence Hub publishes this stage's timeline";

afterEach(cleanup);

beforeEach(() => {
  vi.unstubAllGlobals();
  forgetSearchReads();
  forgetRunIdentities();
  forgetObservedFolds();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = new URL(url, "http://x").pathname;
      const [status, payload]: [number, unknown] = path.endsWith("/progress")
        ? [200, W3B.progress]
        : path.endsWith("/requested-spec")
          ? [200, W3B.requested_spec]
          : path.endsWith("/current-source/search")
            ? [200, W3.search]
            : path.endsWith("/current-source/evidence")
              ? [200, W3.evidence]
              : path.endsWith("/search")
                ? [200, W3B.hub_search]
                : [404, { error: { code: "UNEXPECTED" } }];
      return {
        ok: status >= 200 && status < 300,
        status,
        statusText: String(status),
        headers: new Headers(),
        json: async () => payload,
      } as unknown as Response;
    }),
  );
});

function mountHub() {
  const path = `/research/quantbt/runs/${RUN}/evidence`;
  window.history.replaceState(null, "", `${path}#stage=search&fold=1`);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/research/quantbt/runs/:runId/evidence"
          element={
            <EvidenceFlow
              runId={RUN}
              hub={W3B.hub_evidence}
              state={researchState({ kind: "ok", rowCount: 5 })}
              cursor={{ ...DEFAULT_CURSOR, stage: "search" }}
              onStage={vi.fn()}
              onFold={vi.fn()}
              onResetCursor={vi.fn()}
              series={new Map()}
              ensureSeries={vi.fn()}
              passport={{ state: "idle" }}
              ensurePassport={vi.fn()}
              onReread={vi.fn()}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Screen 04 · Search tab draws Screen 06's body", () => {
  it("renders the deep-dive panels inside [data-panel='search'] and no preview boxes", async () => {
    const { container } = mountHub();
    const panel = () => container.querySelector("[data-panel='search']");
    await waitFor(() => expect(panel()?.querySelector("[data-readiness='READY']")).toBeTruthy());
    await waitFor(() => expect(panel()?.querySelector("[data-coverage-fact='sampler seed']")?.textContent).toContain("42"));
    await waitFor(() => expect(panel()?.textContent).not.toMatch(/reading…/));
    const tab = panel()!;
    // The HiFi's tab heading and the link to the deep dive stay.
    expect(tab.querySelector("[data-tab-heading] h2")?.textContent).toBe("Stage 2 · Search — why these params");
    expect(tab.querySelector("[data-deep-dive='search']")?.getAttribute("href")).toBe(
      `/research/quantbt/runs/${RUN}/search#stage=search&fold=1`,
    );
    // Screen 06's body, embedded: its blocks and data-* attributes, not a second header.
    const body = tab.querySelector("[data-hub-stage-body='search'] [data-screen='search-detail']");
    expect(body?.getAttribute("data-embedded")).toBe("hub");
    expect(body?.querySelector("[data-source-strip]")).toBeTruthy();
    expect(body?.querySelector("[data-claim-row]")).toBeTruthy();
    expect(body?.querySelector("[data-run-mode]")?.textContent).toBe("mode_1_decay");
    expect(body?.querySelector("[data-run-schedule]")?.textContent).toBe("global");
    expect(body?.querySelector("[data-panel='inspection']")).toBeTruthy();
    expect(body?.querySelector("header")).toBeNull();
    expect(body?.querySelector("[data-action='back-to-hub']")).toBeNull();
    expect(body?.querySelector("h1")).toBeNull();
    // The untrue "timeline, not its content" boxes are gone for Search.
    expect(tab.querySelector("[data-stage-shells]")).toBeNull();
    expect(tab.textContent).not.toContain(PREVIEW_SENTENCE);
  });
});

describe("Screen 06 standalone is unchanged (embedded=false)", () => {
  it("keeps its header, breadcrumb, title and frame", async () => {
    const path = `/research/quantbt/runs/${RUN}/search`;
    window.history.replaceState(null, "", path);
    const { container } = render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/research/quantbt/runs/:runId/search" element={<SearchRoute />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(container.querySelector("[data-readiness='READY']")).toBeTruthy());
    const screen = container.querySelector("[data-screen='search-detail']")!;
    expect(screen.hasAttribute("data-embedded")).toBe(false);
    expect(screen.className).toContain("max-w-[1560px]");
    expect(screen.querySelector("header [data-action='back-to-hub']")?.getAttribute("href")).toBe(
      `/research/quantbt/runs/${RUN}/evidence#stage=search&fold=1`,
    );
    expect(screen.querySelector("h1")).toBeTruthy();
  });
});
