/**
 * G3 · D1-O1 follow-up — the shell names the run on a stage screen opened cold.
 *
 * Screens 03 and 04 read the run's identity, Screens 09, 11 and 13 publish the
 * label in their own read, and a retained Delta WFO run reaches its label
 * through the identity read a retained answer triggers. Stages 1–4 on a
 * fixed-profile run make no read that carries it, so a cold link to
 * `…/execute` printed `rrun_464bf9c3` where `R-P04-018` belongs. The shell asks
 * the Run Library for the one row instead — for those four screens, and only
 * when nothing has told the registry about the run yet.
 *
 * The label the Library answers with is the one the control-api published for
 * the canonical report fixture's run, so the crumb reads what the server said.
 */

import { cleanup, render, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { forgetRunLabels, rememberRunLabel, runLabelFor } from "../research/runLabels";
import { shortId } from "../research/researchFormat";
import { RUN_LABEL_READ_SEGMENTS, RUN_SCREEN_CRUMBS } from "./researchRunCrumb";
import { PreferencesProvider } from "./preferences";
import { PortalPresentationProvider } from "./presentation";
import { TopBar } from "./TopBar";

const FIXTURES = join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures");
const report = JSON.parse(readFileSync(join(FIXTURES, "research-report.wfo-retained.valid.json"), "utf8")) as {
  run_id: string;
  display_label: string | null;
};
const RUN = report.run_id;
/* The Run Library row is the source this test exercises, so it carries its own label. */
const LABEL = "R-WFO-017";

/** What the Run Library's poll-by-ids answers for this run: the one row, carrying the server's label. */
const libraryAnswer = { items: [{ run_id: RUN, display_label: LABEL }], next_cursor: null };

const idsReads = () =>
  vi.mocked(globalThis.fetch).mock.calls.map((call) => String(call[0])).filter((url) => url.includes("/api/v1/quantbt/runs?") && url.includes("ids="));

function stubLibrary(answer: { status: number; body?: unknown } = { status: 200, body: libraryAnswer }) {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () => new Response(answer.body === undefined ? null : JSON.stringify(answer.body), { status: answer.status, headers: { "content-type": "application/json" } }),
  );
}

function mountAt(path: string, breadcrumbs: Parameters<typeof TopBar>[0]["breadcrumbs"] = []) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PreferencesProvider>
        <PortalPresentationProvider registry={null}>
          <TopBar breadcrumbs={breadcrumbs} environment={null} onOpenPalette={() => {}} onToggleMobileNav={() => {}} />
        </PortalPresentationProvider>
      </PreferencesProvider>
    </MemoryRouter>,
  );
}

const crumbRun = () => document.querySelector<HTMLElement>(".portal-breadcrumbs a.mono")?.textContent ?? null;

beforeEach(() => forgetRunLabels());
afterEach(() => {
  /* Unmount BEFORE clearing: clearing announces to every mounted subscriber, and an update outside act is a defect. */
  cleanup();
  forgetRunLabels();
  vi.restoreAllMocks();
});

describe("the shell asks the Run Library for the label of a stage screen opened cold", () => {
  it("names exactly the four screens whose own reads carry no label", () => {
    expect([...RUN_LABEL_READ_SEGMENTS].sort()).toEqual(["execute", "freeze", "search", "split"]);
    /* Every one of them is a screen the crumb already names; the others carry the label themselves. */
    for (const segment of RUN_LABEL_READ_SEGMENTS) expect(RUN_SCREEN_CRUMBS[segment]).toBeTruthy();
  });

  it.each(["split", "search", "freeze", "execute"])("%s: prints the short id first, then the server's label, after one read", async (segment) => {
    stubLibrary();
    mountAt(`/research/quantbt/runs/${RUN}/${segment}`);
    expect(crumbRun()).toBe(shortId(RUN));
    await waitFor(() => expect(crumbRun()).toBe(LABEL));
    expect(runLabelFor(RUN)).toBe(LABEL);
    expect(idsReads()).toEqual([`/api/v1/quantbt/runs?ids=${RUN}`]);
    /* The whole id is still the crumb's title: nothing that identifies the run was lost. */
    expect(document.querySelector<HTMLElement>(".portal-breadcrumbs a.mono")!.getAttribute("title")).toBe(RUN);
  });

  it("a cold stage deep link binds both its label read and Research crumbs to the explicit workspace only", async () => {
    stubLibrary();
    const workspace = "ws_explicit_cold_stage";
    mountAt(`/research/quantbt/runs/${RUN}/split?workspace_id=${workspace}`, [
      { label: "Runs", route: "/research/quantbt/runs" },
      { label: "Execution", route: "/execution" },
    ]);
    await waitFor(() => expect(crumbRun()).toBe(LABEL));
    expect(idsReads()).toHaveLength(1);
    const read = new URL(idsReads()[0], "http://localhost");
    expect(read.pathname).toBe("/api/v1/quantbt/runs");
    expect(Object.fromEntries(read.searchParams)).toEqual({ ids: RUN, workspace_id: workspace });
    const crumbs = [...document.querySelectorAll<HTMLAnchorElement>(".portal-breadcrumbs a")];
    expect(crumbs.find((node) => node.textContent === "Runs")?.getAttribute("href")).toBe(`/research/quantbt/runs?workspace_id=${workspace}`);
    expect(crumbs.find((node) => node.textContent === "Execution")?.getAttribute("href")).toBe("/execution");
    expect(document.querySelector<HTMLAnchorElement>(".portal-breadcrumbs a.mono")?.getAttribute("href")).toBe(`/research/quantbt/runs/${RUN}/evidence?workspace_id=${workspace}`);
  });

  it.each(["progress", "evidence", "report", "release-candidate"])("%s: asks nothing — its own read carries the label", async (segment) => {
    stubLibrary();
    mountAt(`/research/quantbt/runs/${RUN}/${segment}`);
    await Promise.resolve();
    expect(crumbRun()).toBe(shortId(RUN));
    expect(idsReads()).toEqual([]);
  });

  it("asks nothing when a read has already told the registry about the run, labelled or not", async () => {
    stubLibrary();
    rememberRunLabel(RUN, LABEL);
    mountAt(`/research/quantbt/runs/${RUN}/execute`);
    expect(crumbRun()).toBe(LABEL);
    expect(idsReads()).toEqual([]);

    cleanup();
    forgetRunLabels();
    rememberRunLabel(RUN, null); /* the server said: this run has no label */
    mountAt(`/research/quantbt/runs/${RUN}/execute`);
    expect(crumbRun()).toBe(shortId(RUN));
    expect(idsReads()).toEqual([]);
  });

  it("asks nothing outside a run", () => {
    stubLibrary();
    for (const path of ["/research/quantbt/runs", "/research/quantbt/runs/new", "/research/quantbt/overview", "/"]) {
      cleanup();
      mountAt(path);
    }
    expect(idsReads()).toEqual([]);
  });

  it("never invents a label when the Library refuses, has no such run or carries none", async () => {
    for (const answer of [
      { status: 503, body: { error: { code: "RESEARCH_RUN_LIBRARY_UNAVAILABLE" }, request_id: "req_1" } },
      { status: 200, body: { items: [], next_cursor: null } },
      { status: 200, body: { items: [{ run_id: RUN, display_label: null }], next_cursor: null } },
    ]) {
      cleanup();
      forgetRunLabels();
      vi.restoreAllMocks();
      stubLibrary(answer);
      mountAt(`/research/quantbt/runs/${RUN}/split`);
      await waitFor(() => expect(idsReads()).toHaveLength(1));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(crumbRun()).toBe(shortId(RUN));
      expect(runLabelFor(RUN)).toBeNull();
    }
  });

  it("stops asking when the reader leaves before the answer lands", async () => {
    let signal: AbortSignal | null | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
      signal = init?.signal;
      return new Promise<Response>(() => {});
    });
    mountAt(`/research/quantbt/runs/${RUN}/execute`);
    await waitFor(() => expect(signal).toBeTruthy());
    expect(signal!.aborted).toBe(false);
    cleanup();
    expect(signal!.aborted).toBe(true);
  });
});
