/**
 * EL-V2-01 — the workspace changes together, or not at all.
 *
 * These tests exist because the rejected build had no such property: the shell
 * followed the user preference while the screen followed its own wrapper, and
 * nothing anywhere asserted that the two agreed. Every test here fails against
 * that architecture.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PortalRegistryDocument } from "../portal/contracts";
import { __resetPortalClientCaches } from "../portal/client";
import { PortalShell } from "./PortalShell";
import { PreferencesProvider } from "./preferences";
import { presentationModeFor } from "./presentation";

const FIXTURES = join(process.cwd(), "../registry/fixtures");
const registry: PortalRegistryDocument = JSON.parse(
  readFileSync(join(FIXTURES, "registry.public.json"), "utf8"),
);
const summary = JSON.parse(readFileSync(join(FIXTURES, "summary.healthy.json"), "utf8")) as unknown;
const linksDocument = JSON.parse(readFileSync(join(FIXTURES, "links.public.json"), "utf8")) as unknown;

const originalFetch = globalThis.fetch;

function mount(route: string) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/portal/registry")) {
      return new Response(JSON.stringify(registry), {
        status: 200,
        headers: { ETag: `"${registry.content_digest}"` },
      });
    }
    if (url.includes("/portal/summary")) return new Response(JSON.stringify(summary), { status: 200 });
    if (url.includes("/portal/links")) return new Response(JSON.stringify(linksDocument), { status: 200 });
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

beforeEach(() => {
  __resetPortalClientCaches();
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("presentationModeFor — the canonical classification", () => {
  it.each([
    ["/execution", "execution-carbon"],
    ["/execution/_fixtures", "execution-carbon"],
    ["/governance/approvals", "execution-carbon"],
    // Parameterised screen routes must classify by pattern, not literal match.
    ["/governance/approvals/AP-201/r1", "execution-carbon"],
    ["/deployments/live/dep_88/canary", "execution-carbon"],
    // A feature ROOT is an Execution address even when no screen row carries
    // that exact route.
    ["/deployments/paper", "execution-carbon"],
    ["/", "research-light"],
    ["/research/quantbt", "research-light"],
    ["/planning/roadmap", "research-light"],
    ["/portal-map", "research-light"],
  ] as const)("%s → %s", (path, expected) => {
    expect(presentationModeFor(registry, path)).toBe(expected);
  });

  it("classifies /execution/* without a registry, and nothing else", () => {
    // Bootstrap states have no registry yet; the only address that is Carbon
    // by construction rather than by classification is the execution-owned
    // path prefix.
    expect(presentationModeFor(null, "/execution/_fixtures")).toBe("execution-carbon");
    expect(presentationModeFor(null, "/governance/approvals")).toBe("research-light");
  });

  it("ignores delivery profile by construction", () => {
    // §4.2: visual mode must not be derived from delivery_profile. The
    // signature makes this structural — the function receives the registry
    // document and a pathname, and there is nothing else to consult.
    expect(presentationModeFor.length).toBe(2);
  });
});

describe("the workspace flips atomically at the route boundary", () => {
  it("applies Carbon to the root, and the selector says so, on an Execution route", async () => {
    mount("/governance/approvals");
    await waitFor(() =>
      expect(document.documentElement.getAttribute("data-theme")).toBe("execution-carbon"),
    );
    const selector = screen.getByLabelText(/Theme \(Execution Carbon/);
    expect((selector as HTMLSelectElement).disabled).toBe(true);
    // The rejected state: canvas Carbon while the control claimed Research
    // Light. Neither half may reappear.
    expect(screen.queryByText("Research Light")).toBeNull();
  });

  it("keeps Research routes on the stored preference, untouched", async () => {
    mount("/");
    await waitFor(() =>
      expect(document.documentElement.getAttribute("data-theme")).toBe("research"),
    );
    const selector = screen.getByLabelText("Theme") as HTMLSelectElement;
    expect(selector.disabled).toBe(false);
    expect(selector.value).toBe("research");
  });

  it("flips chrome and canvas in one navigation, and restores preference on the way back", async () => {
    mount("/");
    await waitFor(() =>
      expect(document.documentElement.getAttribute("data-theme")).toBe("research"),
    );

    // Into Execution via the sidebar the user actually clicks.
    const inbox = await screen.findAllByRole("link", { name: /Approval Inbox/ });
    fireEvent.click(inbox[0]);
    await waitFor(() =>
      expect(document.documentElement.getAttribute("data-theme")).toBe("execution-carbon"),
    );
    expect(screen.getByLabelText(/Theme \(Execution Carbon/)).toBeTruthy();

    // Back out: the mode was route-derived, so leaving restores the stored
    // preference rather than leaving Carbon smeared over Research.
    const home = screen.getAllByRole("link", { name: /Command Center/ });
    fireEvent.click(home[0]);
    await waitFor(() =>
      expect(document.documentElement.getAttribute("data-theme")).toBe("research"),
    );
    const selector = screen.getByLabelText("Theme") as HTMLSelectElement;
    expect(selector.value).toBe("research");
  });

  it("does not let an Execution route overwrite the STORED preference", async () => {
    mount("/governance/approvals");
    await waitFor(() =>
      expect(document.documentElement.getAttribute("data-theme")).toBe("execution-carbon"),
    );
    const stored = JSON.parse(localStorage.getItem("portal.preferences.v1") ?? "{}") as {
      theme?: string;
    };
    // The override is presentation, not preference: what the user chose must
    // survive the visit exactly as they chose it.
    expect(stored.theme ?? "research").toBe("research");
  });
});
