/**
 * F2 · S06 — fields the Search reads already publish and the screen did not read.
 *
 *  - `imported_alpha` (hub search read): an imported alpha's identity line; a
 *    built-in alpha publishes none and nothing is drawn.
 *  - the retained ledger is asked WITH the cursor's fold, named by the fold
 *    plan, so `ledger.fold_filter` is the server's answer rather than null.
 *  - `Trial.params_digest` in the ledger rows; `pool.frozen_at_utc_ms` (or its
 *    typed absence) in the pool funnel.
 *
 * The retained bodies are the published fixtures
 * (`research-current-source.search-surface` and `.split`); a test changes only
 * the one field it is about.
 */
import { act, cleanup, configure, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SearchScreen } from "./SearchDetail";
import { SearchRoute } from "./SearchRoute";
import { ImportedAlphaLine, importedAlphaDigestLabel, type ImportedAlphaBinding } from "./ImportedAlphaLine";
import { foldIdForCursor } from "./useFoldLedger";
import { forgetObservedFolds, DEFAULT_CURSOR } from "./evidenceCursor";
import { forgetSearchReads } from "./useSearch";
import { forgetRunIdentities } from "./retainedLane";
import { researchState } from "./state";
import type { CurrentSourceSearch, SearchDetail } from "./searchClient";

/* This file mounts the whole Search screen several times; under the full parallel suite the default 1 s waitFor
   and 5 s test timeout expired three times while it passed alone. A longer budget, not a retry. */
configure({ asyncUtilTimeout: 6000 });
vi.setConfig({ testTimeout: 20000 });

afterEach(cleanup);

const FIXTURES = join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures");
const read = (name: string) => JSON.parse(readFileSync(join(FIXTURES, name), "utf8"));
const SURFACE = read("research-current-source.search-surface.valid.json") as CurrentSourceSearch;
const SPLIT = read("research-current-source.split.valid.json") as { fold_plan: { folds: { source_ordinal: number; fold_id: string }[] } };
const W3B = JSON.parse(readFileSync(join(process.cwd(), "src", "research", "w3bRealWfo.fixture.json"), "utf8")) as {
  progress: unknown;
  requested_spec: unknown;
  hub_search: SearchDetail;
};
const RUN = SURFACE.run_id;
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const IMPORTED: ImportedAlphaBinding = {
  schema_version: "research.imported-alpha-read-binding.v1",
  source_digest: "abcd1234ef567890abcd1234ef567890abcd1234ef567890abcd1234ef567890",
  entrypoint: "delta_signal",
  parameter_bundle_digest: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  parameters: [
    { name: "window", kind: "int_range", value: 34 },
    { name: "ma_kind", kind: "categorical", value: "ema" },
    { name: "long_only", kind: "fixed", value: true },
  ],
};

let urls: string[] = [];

function stub(options: { search?: (fold: string | null) => [number, unknown]; split?: unknown } = {}) {
  urls = [];
  const search =
    options.search ??
    ((fold: string | null): [number, unknown] => [
      200,
      fold === null ? SURFACE : { ...copy(SURFACE), ledger: { ...copy(SURFACE.ledger), fold_filter: { fold_id: fold, rule: "TRIAL_FOLD_SCOPE_COVERS_FOLD", matched_rows: 2 } } },
    ]);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      const parsed = new URL(url, "http://x");
      const path = parsed.pathname;
      const [status, payload] = path.endsWith("/progress")
        ? [200, W3B.progress]
        : path.endsWith("/requested-spec")
          ? [200, W3B.requested_spec]
          : path.endsWith("/current-source/split")
            ? [200, options.split ?? SPLIT]
            : path.endsWith("/current-source/search")
              ? search(parsed.searchParams.get("fold"))
              : path.endsWith("/search")
                ? [200, W3B.hub_search]
                : [404, { error: { code: "UNEXPECTED" } }];
      return { ok: status < 300, status, statusText: String(status), headers: new Headers(), json: async () => payload } as unknown as Response;
    }),
  );
}

function mount(hash = "") {
  const path = `/research/quantbt/runs/${RUN}/search`;
  window.history.replaceState(null, "", `${path}${hash}`);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/research/quantbt/runs/:runId/search" element={<SearchRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}

const ledgerCalls = () => urls.filter((url) => new URL(url, "http://x").pathname.endsWith("/current-source/search")).map((url) => new URL(url, "http://x").searchParams.get("fold"));

beforeEach(() => {
  vi.unstubAllGlobals();
  forgetSearchReads();
  forgetRunIdentities();
  forgetObservedFolds();
});

describe("F2 · S06 — the ledger asks with the cursor's fold", () => {
  it("names the cursor fold by the fold plan's own id and shows the served fold_filter", async () => {
    stub();
    const { container } = mount("#stage=search&fold=1");
    await waitFor(() => expect(container.querySelector("[data-inspection-fold='0']")).toBeTruthy());
    /* the first read is unfiltered (it learns the run); the second carries the plan's fold_id for fold 1 */
    expect(ledgerCalls()).toEqual([null, "0"]);
    expect(container.querySelector("[data-panel='inspection']")?.textContent).toContain("fold 0");
    expect(container.querySelector("[data-panel='inspection']")?.textContent).toContain("2 of 3");
    expect(container.querySelector("[data-panel='inspection']")?.textContent).toContain("TRIAL_FOLD_SCOPE_COVERS_FOLD");
    expect(container.querySelector("[data-ledger-scope]")?.textContent).toContain("fold filter 0");
  });

  it("a different cursor fold asks for that fold's id", async () => {
    stub();
    const { container } = mount("#stage=search&fold=2");
    await waitFor(() => expect(container.querySelector("[data-inspection-fold='1']")).toBeTruthy());
    expect(ledgerCalls()).toEqual([null, "1"]);
  });

  it("a cursor fold the plan does not list asks nothing and the unfiltered ledger says 'no fold filter'", async () => {
    stub();
    const { container } = mount("#stage=search&fold=9");
    await waitFor(() => expect(container.querySelector("[data-panel='inspection']")?.textContent).toContain("no fold filter"));
    await waitFor(() => expect(urls.some((url) => url.includes("/current-source/split"))).toBe(true));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(ledgerCalls()).toEqual([null]);
    expect(container.querySelector("[data-inspection-fold='']")).toBeTruthy();
  });

  it("a refused fold read keeps the unfiltered ledger and prints the server's code", async () => {
    stub({
      search: (fold) =>
        fold === null ? [200, SURFACE] : [400, { error: { code: "RESEARCH_CURRENT_SOURCE_INVALID", message: "The fold filter names no retained fold of this run." } }],
    });
    const { container } = mount("#stage=search&fold=1");
    await waitFor(() => expect(container.querySelector("[data-fold-filter-refused]")).toBeTruthy());
    expect(container.querySelector("[data-fold-filter-refused]")?.getAttribute("data-fold-filter-refused")).toBe("RESEARCH_CURRENT_SOURCE_INVALID");
    expect(container.querySelector("[data-ledger-scope]")?.textContent).toContain("fold filter none");
  });

  it("foldIdForCursor is the plan's id for the 1-based cursor fold, never a guess", () => {
    const plan = { state: "ready", folds: SPLIT.fold_plan.folds } as unknown as Parameters<typeof foldIdForCursor>[0];
    expect(foldIdForCursor(plan, 1)).toBe(SPLIT.fold_plan.folds[0]!.fold_id);
    expect(foldIdForCursor(plan, 99)).toBeNull();
    expect(foldIdForCursor({ state: "loading" }, 1)).toBeNull();
  });
});

describe("F2 · S06 — Trial.params_digest in the ledger rows", () => {
  it("prints the served digest short, the full value in the title", async () => {
    stub();
    const { container } = mount("#stage=search&fold=1");
    await waitFor(() => expect(container.querySelectorAll("[data-trial-digest]").length).toBe(SURFACE.ledger.trials.length));
    const first = SURFACE.ledger.trials[0]!;
    const cell = container.querySelector(`[data-trial='${first.trial_id}'] [data-trial-digest]`) as HTMLElement;
    expect(cell.getAttribute("data-trial-digest")).toBe(first.params_digest);
    expect(cell.textContent).toBe(first.params_digest!.slice(0, 8));
    expect(cell.querySelector("span")?.getAttribute("title")).toBe(first.params_digest);
  });

  it("a row without a digest says 'not published' — not an empty cell, not a made-up digest", async () => {
    const body = copy(SURFACE);
    delete (body.ledger.trials[0] as { params_digest?: string }).params_digest;
    stub({ search: () => [200, body] });
    const { container } = mount("#stage=search&fold=1");
    await waitFor(() => expect(container.querySelectorAll("[data-trial-digest]").length).toBe(body.ledger.trials.length));
    const cell = container.querySelector(`[data-trial='${body.ledger.trials[0]!.trial_id}'] [data-trial-digest]`) as HTMLElement;
    expect(cell.getAttribute("data-trial-digest")).toBe("");
    expect(cell.textContent).toBe("not published");
  });
});

describe("F2 · S06 — pool.frozen_at_utc_ms in the pool funnel", () => {
  it("prints the served freeze time in UTC", async () => {
    stub();
    const { container } = mount("#stage=search&fold=1");
    await waitFor(() => expect(container.querySelector("[data-frozen-at]")).toBeTruthy());
    const at = container.querySelector("[data-frozen-at]") as HTMLElement;
    expect(at.getAttribute("data-frozen-at")).toBe(String(SURFACE.pool!.frozen_at_utc_ms));
    expect(at.textContent).toBe("2026-09-24 17:00 UTC");
    expect(at.getAttribute("title")).toBe("P11_STAGE_COMPLETED_S4_EVENT");
  });

  it("a served absence is 'not published' with the server's reason code", async () => {
    const body = copy(SURFACE);
    body.pool!.frozen_at_utc_ms = null;
    body.pool!.frozen_at_source = null;
    body.pool!.frozen_at_reason_code = "P11_S4_COMPLETION_EVENT_NOT_RETAINED";
    stub({ search: () => [200, body] });
    const { container } = mount("#stage=search&fold=1");
    await waitFor(() => expect(container.querySelector("[data-pool-row='frozen-at']")).toBeTruthy());
    const row = container.querySelector("[data-pool-row='frozen-at']") as HTMLElement;
    expect(row.textContent).toContain("not published");
    expect(row.querySelector("[data-frozen-at-reason]")?.textContent).toBe("P11_S4_COMPLETION_EVENT_NOT_RETAINED");
    expect(row.textContent).not.toMatch(/1970|0 UTC/);
  });

  it("a server that sends neither field says 'not published' and invents no code", async () => {
    const body = copy(SURFACE);
    delete (body.pool as { frozen_at_utc_ms?: unknown }).frozen_at_utc_ms;
    delete (body.pool as { frozen_at_source?: unknown }).frozen_at_source;
    delete (body.pool as { frozen_at_reason_code?: unknown }).frozen_at_reason_code;
    stub({ search: () => [200, body] });
    const { container } = mount("#stage=search&fold=1");
    await waitFor(() => expect(container.querySelector("[data-pool-row='frozen-at']")).toBeTruthy());
    const row = container.querySelector("[data-pool-row='frozen-at']") as HTMLElement;
    expect(row.textContent).toContain("not published");
    expect(row.querySelector("[data-frozen-at-reason]")).toBeNull();
  });
});

describe("F2 · S06 — imported_alpha", () => {
  const view = (detail: SearchDetail) =>
    render(
      <MemoryRouter>
        <SearchScreen
          runId="R-IMPORTED"
          detail={detail}
          state={researchState({ kind: "ok", rowCount: 1 })}
          cursor={DEFAULT_CURSOR}
          ledger={{ state: "idle" }}
          ensureLedger={vi.fn()}
          onReread={vi.fn()}
        />
      </MemoryRouter>,
    );

  it("an imported run shows `imported · entrypoint · sha256:abcd1234…` and its categorical params", () => {
    const { container } = view({ ...copy(W3B.hub_search), imported_alpha: copy(IMPORTED) } as SearchDetail);
    const line = container.querySelector("[data-imported-alpha]") as HTMLElement;
    expect(line.textContent).toContain("imported");
    expect(line.querySelector("[data-imported-entrypoint]")?.textContent).toBe("delta_signal");
    expect(line.querySelector("[data-imported-digest]")?.textContent).toBe("sha256:abcd1234…");
    expect(line.querySelector("[data-imported-digest]")?.getAttribute("data-imported-digest")).toBe(IMPORTED.source_digest);
    expect(line.querySelector("[data-imported-param='ma_kind']")?.textContent).toBe("ma_kind=ema");
    /* only categorical parameters are chips; the numeric pins stay in the parameter table */
    expect(line.querySelectorAll("[data-imported-param]").length).toBe(1);
    expect(line.getAttribute("title")).toContain(`source_digest sha256:${IMPORTED.source_digest}`);
    expect(line.getAttribute("title")).toContain(`parameter_bundle_digest sha256:${IMPORTED.parameter_bundle_digest}`);
  });

  it("a built-in alpha (no imported_alpha) draws nothing", () => {
    const detail = copy(W3B.hub_search) as SearchDetail & { imported_alpha?: unknown };
    delete detail.imported_alpha;
    const { container } = view(detail);
    expect(container.querySelector("[data-imported-alpha]")).toBeNull();
    expect(container.textContent).not.toMatch(/imported ·/);
  });

  it("the line component itself draws nothing for null and the digest label is the served digest's first 8", () => {
    const { container } = render(<ImportedAlphaLine binding={null} />);
    expect(container.firstChild).toBeNull();
    expect(importedAlphaDigestLabel(IMPORTED)).toBe("sha256:abcd1234…");
  });
});
