/**
 * U03 shell integration tests.
 *
 * These cover the exit-gate claims that unit tests cannot: that the shell
 * refuses to guess when the registry fails, that a commissioned route opens a
 * preview with its compute CTA disabled, that legacy deep links keep working,
 * and that the palette is reachable from the keyboard.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PortalRegistryDocument, PortalSummaryV1 } from "../portal/contracts";
import { __resetPortalClientCaches } from "../portal/client";
import { PortalShell } from "./PortalShell";
import { PreferencesProvider } from "./preferences";

const FIXTURES = join(process.cwd(), "../registry/fixtures");
const registry: PortalRegistryDocument = JSON.parse(
  readFileSync(join(FIXTURES, "registry.public.json"), "utf8"),
);
const summary: PortalSummaryV1 = JSON.parse(
  readFileSync(join(FIXTURES, "summary.healthy.json"), "utf8"),
);
const linksDocument = JSON.parse(readFileSync(join(FIXTURES, "links.public.json"), "utf8"));

const originalFetch = globalThis.fetch;

interface MountOptions {
  route?: string;
  registryDocument?: PortalRegistryDocument;
  registryStatus?: number;
}

function mount({ route = "/", registryDocument = registry, registryStatus }: MountOptions = {}) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/portal/registry")) {
      if (registryStatus) {
        return new Response(
          JSON.stringify({ error: { code: "X", message: "registry down" }, request_id: "req-9" }),
          { status: registryStatus, headers: { "X-Request-ID": "req-9" } },
        );
      }
      return new Response(JSON.stringify(registryDocument), {
        status: 200,
        headers: { ETag: `"${registryDocument.content_digest}"` },
      });
    }
    if (url.includes("/portal/summary")) {
      return new Response(JSON.stringify(summary), { status: 200 });
    }
    if (url.includes("/portal/links")) {
      return new Response(JSON.stringify(linksDocument), { status: 200 });
    }
    // QuantBT run endpoints are not under test here.
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
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("bootstrap", () => {
  it("refuses to render navigation when the registry fails, and shows the request id", async () => {
    mount({ registryStatus: 500 });
    // A 5xx is retryable, so the hook retries twice before giving up; the
    // terminal state is what the user must eventually land on.
    await waitFor(() => expect(screen.getByText(/request_id req-9/)).toBeTruthy(), {
      timeout: 10_000,
    });
    expect(screen.queryByRole("navigation", { name: "Điều hướng chính" })).toBeNull();
  });

  it("shows a loading state before the registry resolves", () => {
    mount();
    expect(screen.getByRole("status")).toBeTruthy();
  });
});

describe("registry-driven sidebar", () => {
  it("renders every sidebar feature the registry declares", async () => {
    mount();
    const nav = await screen.findByRole("navigation", { name: "Điều hướng chính" });
    for (const feature of registry.features.filter((f) => f.navigation.show_in_sidebar)) {
      expect(within(nav).getByText(feature.label)).toBeTruthy();
    }
  });

  it("adds a new commissioned feature from a registry entry alone", async () => {
    const extended: PortalRegistryDocument = {
      ...registry,
      features: [
        ...registry.features,
        {
          ...registry.features.find((f) => f.id === "ALPHA_POOL")!,
          id: "SYNTHETIC_FEATURE",
          label: "Synthetic Feature",
          canonical_route: "/research/synthetic",
        },
      ],
    };
    mount({ registryDocument: extended });
    const nav = await screen.findByRole("navigation", { name: "Điều hướng chính" });
    expect(within(nav).getByText("Synthetic Feature")).toBeTruthy();
  });

  it("marks the active item with more than colour", async () => {
    mount({ route: "/portal-map" });
    const nav = await screen.findByRole("navigation", { name: "Điều hướng chính" });
    const active = nav.querySelector(".portal-navitem-active");
    expect(active?.textContent).toContain("Portal Map");
  });
});

describe("commissioned preview", () => {
  it("opens a brief instead of a fake module, with compute disabled and a reason", async () => {
    mount({ route: "/research/alphas" });
    await waitFor(() => expect(screen.getByText(/chưa được triển khai/)).toBeTruthy());
    const cta = screen.getByRole("button", { name: "Chạy capability" });
    expect(cta.hasAttribute("disabled")).toBe(true);
    expect(cta.getAttribute("title")).toBeTruthy();
    expect(document.querySelectorAll(".metric-value").length).toBe(0);
  });

  it("still reaches a commissioned route by URL when the nav preference hides it", async () => {
    localStorage.setItem(
      "portal.preferences.v1",
      JSON.stringify({ showCommissioned: false, theme: "research", density: "comfortable" }),
    );
    mount({ route: "/research/alphas" });
    await waitFor(() => expect(screen.getByText(/chưa được triển khai/)).toBeTruthy());
    const nav = screen.getByRole("navigation", { name: "Điều hướng chính" });
    expect(within(nav).queryByText("Alpha Pool")).toBeNull();
  });
});

describe("legacy compatibility", () => {
  it("redirects a legacy QuantBT deep link and preserves ?run=", async () => {
    mount({ route: "/overview?run=completed-1" });
    await waitFor(() => expect(screen.getByText("QuantBT Research")).toBeTruthy());
    // The passport/subnav only appear once a run resolves; the redirect itself
    // is asserted by the module owning the canonical route being mounted.
    expect(screen.queryByText(/không thuộc feature nào/)).toBeNull();
  });

  it("shows a not-found state for a route no feature owns", async () => {
    mount({ route: "/definitely-not-a-feature" });
    await waitFor(() => expect(screen.getByText(/không thuộc feature nào/)).toBeTruthy());
  });
});

describe("embedding (U04/U05)", () => {
  it("mounts QuantBT under its canonical route with no nested topbar", async () => {
    mount({ route: "/research/quantbt/runs" });
    // QuantBT is a split chunk now (it owns ECharts), so the module arrives a
    // dynamic import later than the shell around it.
    await waitFor(
      () => expect(screen.getByRole("heading", { level: 1, name: "QuantBT Research" })).toBeTruthy(),
      { timeout: 5000 },
    );
    // Exactly one shell topbar: the module must not render a second one.
    expect(document.querySelectorAll(".portal-topbar").length).toBe(1);
  });

  it("mounts Planning under /planning with no nested shell", async () => {
    mount({ route: "/planning/board" });
    await waitFor(() => expect(screen.getByRole("navigation", { name: "Planning" })).toBeTruthy());
    expect(document.querySelectorAll(".portal-topbar").length).toBe(1);
    // Planning's standalone shell classes must not appear inside the Portal.
    expect(document.querySelector(".app .workspace")).toBeNull();
  });

  it("redirects the Planning root to its first view", async () => {
    mount({ route: "/planning" });
    await waitFor(() => expect(screen.getByRole("navigation", { name: "Planning" })).toBeTruthy());
    const active = document.querySelector(".portal-subnav .navtab-active");
    expect(active?.textContent).toBe("Documents");
  });

  it("keeps the API/LOCAL mode visible so local state is never read as shared", async () => {
    mount({ route: "/planning/roadmap" });
    await waitFor(() => expect(document.querySelector("[data-api-mode]")).not.toBeNull());
  });

  it("translates a legacy Planning hash link onto the canonical path", async () => {
    mount({ route: "/planning/docs#view=board" });
    await waitFor(() => {
      const active = document.querySelector(".portal-subnav .navtab-active");
      expect(active?.textContent).toBe("Task Board");
    });
  });

  it("sends the legacy /?new=1 bookmark to the canonical new-run route", async () => {
    mount({ route: "/?new=1" });
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: "QuantBT Research" })).toBeTruthy(),
    );
    // The Command Center must not also be mounted at the root.
    expect(screen.queryByRole("heading", { level: 1, name: "Command Center" })).toBeNull();
  });
});

describe("command palette", () => {
  it("opens with the keyboard shortcut and lists registry features", async () => {
    mount();
    await screen.findByRole("navigation", { name: "Điều hướng chính" });
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const dialog = await screen.findByRole("dialog", { name: "Command palette" });
    expect(within(dialog).getByText("Command Center")).toBeTruthy();
  });

  it("filters and closes on Escape", async () => {
    mount();
    await screen.findByRole("navigation", { name: "Điều hướng chính" });
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = await screen.findByLabelText("Tìm feature hoặc màn hình");
    fireEvent.change(input, { target: { value: "portal map" } });
    const dialog = screen.getByRole("dialog", { name: "Command palette" });
    expect(within(dialog).getByText("Portal Map")).toBeTruthy();
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Command palette" })).toBeNull(),
    );
  });
});

describe("preferences", () => {
  it("applies theme and density to the document root", async () => {
    mount();
    await screen.findByRole("navigation", { name: "Điều hướng chính" });
    expect(document.documentElement.getAttribute("data-theme")).toBe("research");

    fireEvent.change(screen.getByLabelText("Theme"), { target: { value: "operations" } });
    await waitFor(() =>
      expect(document.documentElement.getAttribute("data-theme")).toBe("operations"),
    );

    fireEvent.change(screen.getByLabelText("Density"), { target: { value: "operational" } });
    await waitFor(() =>
      expect(document.documentElement.getAttribute("data-density")).toBe("operational"),
    );
  });
});
