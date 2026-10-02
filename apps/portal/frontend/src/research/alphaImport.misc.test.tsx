/**
 * Batch F4/MISC · S14 — the registry list's `next_cursor`.
 *
 *  - while the server serves a `next_cursor`, a "load more" row reads the next page with that
 *    cursor exactly as served (opaque, never parsed) and appends its rows;
 *  - "top N / total" stays while the list is capped, and goes when it is complete;
 *  - no cursor = no row (the typed absence of a next page is the absence of the button);
 *  - a failed page keeps the loaded rows and says so.
 * The page shape is the published registry fixture.
 */
import { act, cleanup, fireEvent, render, renderHook, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AlphaImport, awaitingStep, type AlphaImportProps } from "./AlphaImport";
import { IMPORT_META } from "./AlphaImport";
import type { RegistryListResponse } from "./alphaImportClient";
import { researchState } from "./state";
import { useAlphaImport } from "./useAlphaImport";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const REGISTRY = JSON.parse(
  readFileSync(join(ROOT, "packages/contracts/fixtures/research-alpha-import.registry.valid.json"), "utf8"),
) as RegistryListResponse;
const ENTRY = REGISTRY.entries[0]!;
const entry = (id: string) => ({ ...ENTRY, alpha_version_id: id });
const CURSOR = "opaque/cursor+==?x=1&y";

function page(ids: string[], next: string | null, total: number): RegistryListResponse {
  return { ...REGISTRY, entries: ids.map(entry), next_cursor: next, total };
}

function serve(pages: Array<RegistryListResponse | "fail">) {
  const urls: string[] = [];
  let call = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      const body = pages[Math.min(call++, pages.length - 1)]!;
      if (body === "fail") {
        return { ok: false, status: 503, statusText: "", headers: { get: () => null }, json: async () => ({ error: { code: "X", message: "m" } }) } as unknown as Response;
      }
      return { ok: true, status: 200, statusText: "", headers: { get: () => null }, json: async () => body } as unknown as Response;
    }),
  );
  return urls;
}

describe("S14 registry next_cursor — hook", () => {
  it("sends the served cursor verbatim, appends the page, and stops when the cursor is null", async () => {
    const urls = serve([page(["av_a_1_0_0", "av_b_1_0_0"], CURSOR, 3), page(["av_c_1_0_0"], null, 3)]);
    const { result } = renderHook(() => useAlphaImport());
    await waitFor(() => expect(result.current.registryNext).toBe(CURSOR));
    expect(result.current.registry).toHaveLength(2);
    expect(urls[0]).not.toContain("cursor=");
    await act(async () => result.current.onLoadMoreRegistry?.());
    await waitFor(() => expect(result.current.registry).toHaveLength(3));
    expect(new URL(urls[1]!, "http://x").searchParams.get("cursor")).toBe(CURSOR);
    expect(result.current.registryNext).toBeNull();
    expect(result.current.registryMore).toBe("idle");
  });

  it("a null cursor on the first page is a complete list", async () => {
    serve([page(["av_a_1_0_0"], null, 1)]);
    const { result } = renderHook(() => useAlphaImport());
    await waitFor(() => expect(result.current.registry).toHaveLength(1));
    expect(result.current.registryNext).toBeNull();
  });

  it("a failed page keeps the loaded rows and the cursor, so the same button can try again", async () => {
    serve([page(["av_a_1_0_0"], CURSOR, 2), "fail"]);
    const { result } = renderHook(() => useAlphaImport());
    await waitFor(() => expect(result.current.registryNext).toBe(CURSOR));
    await act(async () => result.current.onLoadMoreRegistry?.());
    await waitFor(() => expect(result.current.registryMore).toBe("failed"));
    expect(result.current.registry).toHaveLength(1);
    expect(result.current.registryNext).toBe(CURSOR);
  });
});

describe("S14 registry next_cursor — row", () => {
  function props(overrides: Partial<AlphaImportProps> = {}): AlphaImportProps {
    return {
      sourceText: "",
      fileName: null,
      onSourceChange: vi.fn(),
      onMultiFileRejected: vi.fn(),
      parse: null,
      gates: null,
      registration: null,
      activation: null,
      registry: [entry("av_a_1_0_0")],
      registryTotal: 5,
      parseState: awaitingStep("No source has been parsed yet."),
      gatesState: awaitingStep("Gates run once a source parses."),
      registerState: awaitingStep("Registration opens once all seven gates pass."),
      registryState: researchState({ kind: "ok", rowCount: 1 }),
      refusal: null,
      alphaId: "",
      onAlphaIdChange: vi.fn(),
      onParse: vi.fn(),
      onRunGates: vi.fn(),
      onRegister: vi.fn(),
      onActivate: vi.fn(),
      activationAdmitted: false,
      reducedMotion: true,
      ...overrides,
    } as AlphaImportProps;
  }
  const mount = (p: AlphaImportProps) => render(<MemoryRouter><AlphaImport {...p} /></MemoryRouter>);
  const q = (s: string) => document.querySelector(s) as HTMLElement | null;

  it("shows a load-more row beside 'top N / total' while a cursor is served, and calls the handler", () => {
    const onLoadMoreRegistry = vi.fn();
    mount(props({ registryNext: CURSOR, onLoadMoreRegistry }));
    expect(q("[data-registry-total]")?.textContent).toContain("top 1 / 5");
    const button = q('[data-action="load-more-registry"]') as HTMLButtonElement;
    expect(button.textContent).toBe("load more");
    fireEvent.click(button);
    expect(onLoadMoreRegistry).toHaveBeenCalledTimes(1);
    /* The cursor is opaque: it is never printed. */
    expect(document.body.textContent).not.toContain(CURSOR);
  });

  it("no cursor, no row", () => {
    mount(props({ registryNext: null, onLoadMoreRegistry: vi.fn() }));
    expect(q('[data-action="load-more-registry"]')).toBeNull();
  });

  it("loading disables the button; a failed page says the loaded rows stay", () => {
    const { rerender } = mount(props({ registryNext: CURSOR, registryMore: "loading", onLoadMoreRegistry: vi.fn() }));
    expect((q('[data-action="load-more-registry"]') as HTMLButtonElement).disabled).toBe(true);
    rerender(<MemoryRouter><AlphaImport {...props({ registryNext: CURSOR, registryMore: "failed", onLoadMoreRegistry: vi.fn() })} /></MemoryRouter>);
    expect(q("[data-registry-more-failed]")?.textContent).toBe("Next page failed.");
    expect((q('[data-action="load-more-registry"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it("(f) the meta line names an endpoint family only, never a permission claim", () => {
    mount(props());
    expect(q("[data-meta]")).toBeNull();
    expect(IMPORT_META).not.toMatch(/ADMIN|admin|permission|role/);
    expect(document.body.textContent).not.toMatch(/activation ADMIN-only/);
  });
});
