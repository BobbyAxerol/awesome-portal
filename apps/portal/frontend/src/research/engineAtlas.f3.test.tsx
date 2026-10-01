/**
 * F3 · S12 — 12-15 (read again + request id), 7_root (what-it-reads glyph strip),
 * FG 12-02 (tab aria-controls, deselect an open route row).
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AtlasDocument } from "./atlas";
import { EngineAtlas, readsGlyphKind, type AtlasTab } from "./EngineAtlas";
import { EngineAtlasRoute } from "./foundationRoutes";
import { __resetFoundationCaches } from "./foundationClient";
import { researchState } from "./state";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const DOC = (
  JSON.parse(readFileSync(join(__dirname, "../../e2e/research-foundation/atlas.json"), "utf8")) as { atlas: AtlasDocument }
).atlas;

function view(tab: AtlasTab, extra: Partial<React.ComponentProps<typeof EngineAtlas>> = {}) {
  render(
    <MemoryRouter>
      <EngineAtlas doc={DOC} state={researchState({ kind: "ok", rowCount: 1 })} tab={tab} onTabChange={vi.fn()} {...extra} />
    </MemoryRouter>,
  );
}

describe("F3 12-15 - a failed read keeps its request id and offers a re-read", () => {
  it("503: Read again calls onRetry; the request id is printed", () => {
    const onRetry = vi.fn();
    view("modes", {
      doc: null,
      state: { state: "unavailable", reason: "The Atlas could not be read.", mayRetry: true, retainsContent: false },
      requestId: "req_503",
      onRetry,
    });
    fireEvent.click(screen.getByRole("button", { name: "Read again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(document.querySelector("[data-request-id]")?.textContent).toBe("request req_503");
  });

  it("403: the request id is kept and there is no re-read", () => {
    view("modes", {
      doc: null,
      state: { state: "denied", reason: "No access.", mayRetry: false, retainsContent: false },
      requestId: "req_403",
      onRetry: vi.fn(),
    });
    expect(screen.queryByRole("button", { name: "Read again" })).toBeNull();
    expect(document.querySelector("[data-request-id]")?.textContent).toBe("request req_403");
  });

  it("no request id is printed when the read succeeded", () => {
    view("modes", { requestId: "req_old" });
    expect(document.querySelector("[data-request-id]")).toBeNull();
  });

  it("the route carries the server's request id through to the screen and re-reads on click", async () => {
    __resetFoundationCaches();
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        return {
          ok: false,
          status: 503,
          statusText: "",
          headers: { get: () => null },
          json: async () => ({ error: { code: "RESEARCH_FOUNDATION_UNAVAILABLE", message: "No answer." }, request_id: "req_route" }),
        } as unknown as Response;
      }),
    );
    render(
      <MemoryRouter initialEntries={["/research/quantbt/atlas"]}>
        <EngineAtlasRoute />
      </MemoryRouter>,
    );
    await waitFor(() => expect(document.querySelector("[data-request-id]")?.textContent).toBe("request req_route"));
    const before = calls;
    fireEvent.click(screen.getByRole("button", { name: "Read again" }));
    await waitFor(() => expect(calls).toBeGreaterThan(before));
  });
});

describe("F3 7_root - what it reads is a strip of cells from the served inputs", () => {
  it("draws one cell per selection input, the server token as its tooltip", () => {
    view("modes");
    for (const mode of DOC.modes) {
      const card = document.querySelector(`[data-mode="${mode.mode_id}"]`) as HTMLElement;
      const reads = (mode.facts as { reads: { state: string; selection_inputs: string[] } } | null)?.reads;
      if (!reads || reads.state !== "PUBLISHED") continue;
      const cells = Array.from(card.querySelectorAll<HTMLElement>("[data-reads-glyph]"));
      expect(cells.map((c) => c.getAttribute("title"))).toEqual(reads.selection_inputs);
    }
  });

  it("classifies by the token's name only; an unknown token is a plain cell", () => {
    expect(readsGlyphKind("oos_metrics")).toBe("oos");
    expect(readsGlyphKind("bootstrap_indices")).toBe("ghost");
    expect(readsGlyphKind("plateau_neighborhood")).toBe("plateau");
    expect(readsGlyphKind("is_metrics")).toBe("is");
    expect(readsGlyphKind("full_is_metrics")).toBe("is");
    expect(readsGlyphKind("decay_components")).toBe("other");
  });
});

describe("F3 FG 12-02 - tabs and route rows", () => {
  it("every tab names the panel it controls; the panel is labelled by the open tab", () => {
    view("claims");
    const panel = document.querySelector('[role="tabpanel"]') as HTMLElement;
    for (const tab of screen.getAllByRole("tab")) expect(tab.getAttribute("aria-controls")).toBe(panel.id);
    const open = screen.getAllByRole("tab").find((t) => t.getAttribute("aria-selected") === "true")!;
    expect(panel.getAttribute("aria-labelledby")).toBe(open.id);
    expect(screen.getByRole("tabpanel", { name: "Claims by contract" })).toBe(panel);
  });

  it("clicking the open route again deselects it", () => {
    const onLocationChange = vi.fn();
    const route = DOC.routes[0]!.route_id;
    view("routes", { location: { mode: null, schedule: null, route, run: null }, onLocationChange });
    fireEvent.click(document.querySelector(`[data-route-link="${route}"]`) as HTMLElement);
    expect(onLocationChange).toHaveBeenCalledWith({ route: null });
    onLocationChange.mockClear();
    cleanup();
    view("routes", { location: { mode: null, schedule: null, route: null, run: null }, onLocationChange });
    fireEvent.click(document.querySelector(`[data-route-link="${route}"]`) as HTMLElement);
    expect(onLocationChange).toHaveBeenCalledWith({ route });
  });

  it("G7 2.4: the unbroken claim-qualifier token wraps instead of scrolling the claims tab sideways", () => {
    view("claims");
    const qualifiers = Array.from(document.querySelectorAll<HTMLElement>("[data-claim-qualifier]"));
    expect(qualifiers.length).toBeGreaterThan(0);
    for (const q of qualifiers) expect(q.className).toContain("[overflow-wrap:anywhere]");
  });

  it("the release block can shrink below 260px instead of overrunning", () => {
    view("modes");
    const html = document.querySelector("details")?.parentElement?.innerHTML ?? document.body.innerHTML;
    expect(html).not.toContain("min-w-[260px]");
  });
});
