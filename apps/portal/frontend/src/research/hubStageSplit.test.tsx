/**
 * Screen 04's split tab draws Screen 05's body (HiFi 04 `isSplit`), not four
 * "not published" shells. The bodies are the real preview captures the hub
 * and split tests already load (w3RealWfo / w3bRealWfo).
 */

import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EvidenceFlow } from "./EvidenceFlow";
import { SplitRoute } from "./SplitRoute";
import { DEFAULT_CURSOR, forgetObservedFolds } from "./evidenceCursor";
import { forgetSplitReads } from "./useSplit";
import { forgetRunIdentities } from "./retainedLane";
import { researchState } from "./state";

function load<T>(name: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), "src", "research", name), "utf8")) as T;
}

const W3 = load<{ split: { run_id: string }; search: unknown; evidence: unknown }>("w3RealWfo.fixture.json");
const W3B = load<{
  progress: unknown;
  requested_spec: unknown;
  hub_split: unknown;
  hub_evidence: NonNullable<React.ComponentProps<typeof EvidenceFlow>["hub"]>;
}>("w3bRealWfo.fixture.json");
const RUN = W3.split.run_id;

let requested: string[] = [];

function stub() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      requested.push(url);
      const path = new URL(url, "http://x").pathname;
      const [status, payload]: [number, unknown] = path.endsWith("/progress")
        ? [200, W3B.progress]
        : path.endsWith("/requested-spec")
          ? [200, W3B.requested_spec]
          : path.endsWith("/current-source/split")
            ? [200, W3.split]
            : path.endsWith("/current-source/search")
              ? [200, W3.search]
              : path.endsWith("/current-source/evidence")
                ? [200, W3.evidence]
                : path.endsWith("/split")
                  ? [200, W3B.hub_split]
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
}

beforeEach(() => {
  requested = [];
  vi.unstubAllGlobals();
  forgetSplitReads();
  forgetRunIdentities();
  forgetObservedFolds();
});
afterEach(cleanup);

function hubOnSplit(onFold = vi.fn()) {
  return render(
    <MemoryRouter>
      <EvidenceFlow
        runId={RUN}
        hub={W3B.hub_evidence}
        state={researchState({ kind: "ok", rowCount: 1 })}
        cursor={{ ...DEFAULT_CURSOR, stage: "split", fold: 1 }}
        onStage={vi.fn()}
        onFold={onFold}
        onResetCursor={vi.fn()}
        series={new Map()}
        ensureSeries={vi.fn()}
        passport={{ state: "idle" }}
        ensurePassport={vi.fn()}
        onReread={vi.fn()}
      />
    </MemoryRouter>,
  );
}

async function settled(container: HTMLElement) {
  await waitFor(() => expect(container.querySelector("[data-panel='split'] [data-readiness]")).toBeTruthy());
  await waitFor(() => expect(container.querySelector("[data-panel='split'] [data-lane-reading]")).toBeNull());
  await waitFor(() => expect(container.querySelector("[data-panel='split'] [data-holdout-lane]")).toBeTruthy());
}

describe("Screen 04 split tab — Screen 05's body, inside the hub", () => {
  it("draws the fold construction, fold table and holdout in the split panel", async () => {
    stub();
    const { container } = hubOnSplit();
    await settled(container);
    const panel = container.querySelector("[data-panel='split']") as HTMLElement;
    expect(panel.querySelector("[data-hub-stage-body='split'] [data-screen='split-detail']")?.getAttribute("data-embedded")).toBe("hub");
    expect(panel.querySelector("[data-card='fold-construction']")).toBeTruthy();
    expect(panel.querySelector("[data-protocol]")?.textContent).toBe("advanced walk-forward · weekly · expanding");
    expect(panel.querySelectorAll("[data-fold-table-row]")).toHaveLength(2);
    expect(panel.querySelector("[data-holdout='retained'] [data-holdout-lane]")?.getAttribute("data-holdout-lane")).toBe("NOT_APPLICABLE");
    // Same reads as the deep dive, for this run.
    expect(requested.some((url) => url.includes(`/runs/${RUN}/split`))).toBe(true);
    expect(requested.some((url) => url.includes("/current-source/split"))).toBe(true);
  });

  it("drops the preview shells and the 'publishes this stage's timeline' sentence", async () => {
    stub();
    const { container } = hubOnSplit();
    await settled(container);
    expect(container.textContent).not.toContain("the Evidence Hub publishes this stage's timeline");
    expect(container.querySelector("[data-stage-shells='split']")).toBeNull();
    expect(container.querySelector("[data-stage-row]")).toBeNull();
  });

  it("keeps the tab's heading and the deep-dive link, and none of Screen 05's own header", async () => {
    stub();
    const { container } = hubOnSplit();
    await settled(container);
    const panel = container.querySelector("[data-panel='split']") as HTMLElement;
    expect(panel.querySelector("h2")?.textContent).toContain("Stage 1 · Split");
    expect(panel.querySelector("[data-deep-dive='split']")?.getAttribute("href")).toContain(`/runs/${RUN}/split#`);
    expect(panel.querySelector("h1")).toBeNull();
    expect(panel.querySelector("[data-action='back-to-hub']")).toBeNull();
    expect(panel.querySelector("nav[aria-label='Breadcrumb']")).toBeNull();
    expect(panel.querySelector("[data-cursor-notice]")).toBeNull();
  });

  it("a fold row moves the hub's cursor, not a second one", async () => {
    stub();
    const onFold = vi.fn();
    const { container } = hubOnSplit(onFold);
    await settled(container);
    const row = container.querySelector("[data-panel='split'] [data-fold-table-row='2']") as HTMLElement;
    row.click();
    expect(onFold).toHaveBeenCalledWith(2);
  });
});

describe("Screen 05 deep dive — unchanged", () => {
  it("still draws its own breadcrumb, title and evidence link", async () => {
    stub();
    const path = `/research/quantbt/runs/${RUN}/split`;
    window.history.replaceState(null, "", path);
    const { container } = render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/research/quantbt/runs/:runId/split" element={<SplitRoute />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(container.querySelector("[data-holdout-lane]")).toBeTruthy());
    const screen = container.querySelector("[data-screen='split-detail']") as HTMLElement;
    expect(screen.hasAttribute("data-embedded")).toBe(false);
    expect(screen.className).toContain("max-w-[1440px]");
    expect(screen.querySelector("h1")).toBeTruthy();
    expect(screen.querySelector("[data-action='back-to-hub']")?.getAttribute("href")).toContain(`/runs/${RUN}/evidence#stage=split`);
    expect(screen.querySelector("[data-rules-footer]")).toBeTruthy();
  });
});
