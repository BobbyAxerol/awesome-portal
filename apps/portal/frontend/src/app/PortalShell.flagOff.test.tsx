/**
 * V2 CommandBar wiring · the flag-off proof for the shell.
 *
 * With VITE_EXECUTION_V2_SCREENS unset the shell must render exactly the tree
 * it rendered before the V2 command bar was wired in. The digests below were
 * captured from the shell at 8791b1d2, BEFORE the PortalShell edit; a diff here
 * is a change to every V1 screen's chrome. A digest rather than the markup:
 * the tree holds the whole registry sidebar, which nobody can review inline.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetPortalClientCaches } from "../portal/client";
import type { PortalRegistryDocument } from "../portal/contracts";
import { EXECUTION_V2_SCREENS, EXECUTION_V2_SHELL } from "../execution/v2/flags";
import { PortalShell } from "./PortalShell";
import { PreferencesProvider } from "./preferences";

const FIXTURES = join(process.cwd(), "../registry/fixtures");
const registry: PortalRegistryDocument = JSON.parse(readFileSync(join(FIXTURES, "registry.public.json"), "utf8"));
const summary = JSON.parse(readFileSync(join(FIXTURES, "summary.healthy.json"), "utf8"));
const links = JSON.parse(readFileSync(join(FIXTURES, "links.public.json"), "utf8"));
const originalFetch = globalThis.fetch;

function mount(route: string) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/portal/registry")) {
      return new Response(JSON.stringify(registry), { status: 200, headers: { ETag: `"${registry.content_digest}"` } });
    }
    if (url.includes("/portal/summary")) return new Response(JSON.stringify(summary), { status: 200 });
    if (url.includes("/portal/links")) return new Response(JSON.stringify(links), { status: 200 });
    return new Response(JSON.stringify([]), { status: 200 });
  }) as unknown as typeof fetch;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <PreferencesProvider>
          <PortalShell />
        </PreferencesProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/**
 * Digest of the shell CHROME: the screen inside <main> loads lazily and settles at a load-dependent
 * moment, and nothing this change touches renders there. Topbar, rail, drawer slots, palette and
 * the (absent) V2 bar are all inside the digest.
 */
function digest(root: HTMLElement): string {
  const copy = root.cloneNode(true) as HTMLElement;
  const main = copy.querySelector("main#portal-content");
  if (main) main.innerHTML = "";
  return createHash("sha256").update(copy.innerHTML).digest("hex").slice(0, 16);
}

beforeEach(() => {
  __resetPortalClientCaches();
  localStorage.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("shell with the V2 flag off", () => {
  it("the manifest is empty and the shell flag is off", () => {
    expect(EXECUTION_V2_SCREENS.size).toBe(0);
    expect(EXECUTION_V2_SHELL).toBe(false);
  });

  // Routes: Research home, an Execution route and a Governance route; Ctrl/Cmd+K opens only the V1 palette on each.
  it.each([
    ["/", "9120fd24852357e6", "769a3857250e1be7"],
    ["/execution", "05edc01a028b1c25", "d20e1bb50cb6d89d"],
    ["/governance/approvals", "99db84dedb4b8d8f", "fe27d9b2bcf194eb"],
  ])("%s renders the pre-wiring tree, closed and with the palette open", async (route, closedDigest, openDigest) => {
    const { container } = mount(route);
    await screen.findByRole("navigation", { name: "Primary navigation" });
    await waitFor(() => expect(container.querySelector("main#portal-content")).not.toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(container.querySelector(".exec-cmdbar")).toBeNull();
    expect(digest(container)).toBe(closedDigest);

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    await screen.findByRole("dialog", { name: "Command palette" });
    expect(screen.queryByRole("dialog", { name: "Command bar" })).toBeNull();
    expect(container.querySelector(".exec-cmdbar")).toBeNull();
    expect(digest(container)).toBe(openDigest);
  });
});
