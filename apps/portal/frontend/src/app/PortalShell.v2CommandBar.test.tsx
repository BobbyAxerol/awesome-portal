/**
 * V2 CommandBar wired into the shell · routing between the two overlays.
 *
 * The build flag is read when the module loads, so each case stubs the env,
 * resets the module graph and imports the shell fresh (the `flagOn.test` pattern).
 * The session is mocked to a ready capability list: the same source the sidebar uses.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PortalRegistryDocument } from "../portal/contracts";

const session = vi.hoisted(() => ({ capabilities: [] as string[] }));
vi.mock("../auth/session", () => ({
  useSession: () => ({
    principal: null,
    access: {
      kind: "ready",
      access: { isOwner: false, capabilities: session.capabilities },
    },
  }),
  isOwnerAccess: () => false,
}));

const FIXTURES = join(process.cwd(), "../registry/fixtures");
const registry: PortalRegistryDocument = JSON.parse(readFileSync(join(FIXTURES, "registry.public.json"), "utf8"));
const summary = JSON.parse(readFileSync(join(FIXTURES, "summary.healthy.json"), "utf8"));
const links = JSON.parse(readFileSync(join(FIXTURES, "links.public.json"), "utf8"));
const originalFetch = globalThis.fetch;

async function mount(route: string, env: { manifest?: string; umbrella?: string }, capabilities: string[] = []) {
  session.capabilities = capabilities;
  vi.stubEnv("VITE_EXECUTION_PREVIEW_ENABLED", env.umbrella ?? "true");
  vi.stubEnv("VITE_EXECUTION_V2_SCREENS", env.manifest ?? "");
  vi.resetModules();
  const { PortalShell } = await import("./PortalShell");
  const { PreferencesProvider } = await import("./preferences");
  const { __resetPortalClientCaches } = await import("../portal/client");
  __resetPortalClientCaches();
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
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <PreferencesProvider>
          <PortalShell />
        </PreferencesProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByRole("navigation", { name: "Primary navigation" });
  return view;
}

const bar = () => screen.queryByRole("dialog", { name: "Command bar" });
const palette = () => screen.queryByRole("dialog", { name: "Command palette" });
const ctrlK = () => fireEvent.keyDown(window, { key: "k", ctrlKey: true });

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("shell flag on", () => {
  const ON = { manifest: "shell" };

  it.each(["/execution", "/execution/operations", "/deployments/alphas"])("%s: Ctrl+K opens the V2 bar and not the V1 palette", async (route) => {
    await mount(route, ON);
    ctrlK();
    expect(await screen.findByRole("dialog", { name: "Command bar" })).toBeTruthy();
    expect(palette()).toBeNull();
    expect(document.querySelector(".portal-palette")).toBeNull();
  });

  it("Meta+K does the same", async () => {
    await mount("/execution", ON);
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(await screen.findByRole("dialog", { name: "Command bar" })).toBeTruthy();
    expect(palette()).toBeNull();
  });

  it.each(["/", "/research/quantbt", "/planning", "/governance/approvals", "/portal-map"])(
    "%s: Ctrl+K opens the V1 palette, unchanged, and no V2 bar",
    async (route) => {
      await mount(route, ON);
      ctrlK();
      const dialog = await screen.findByRole("dialog", { name: "Command palette" });
      expect(within(dialog).getByLabelText("Search features and screens")).toBeTruthy();
      expect(bar()).toBeNull();
      expect(document.querySelector(".exec-cmdbar")).toBeNull();
    },
  );

  it("the topbar search button follows the same rule", async () => {
    await mount("/", ON);
    fireEvent.click(screen.getByRole("button", { name: /Search/ }));
    expect(await screen.findByRole("dialog", { name: "Command palette" })).toBeTruthy();
    expect(bar()).toBeNull();
  });

  it("mounts nothing until opened, and unmounts on Escape", async () => {
    await mount("/execution", ON);
    expect(document.querySelector(".exec-cmdbar")).toBeNull();
    ctrlK();
    const dialog = await screen.findByRole("dialog", { name: "Command bar" });
    fireEvent.keyDown(within(dialog).getByRole("combobox"), { key: "Escape" });
    await waitFor(() => expect(bar()).toBeNull());
    expect(document.querySelector(".exec-cmdbar")).toBeNull();
  });

  it("Escape returns focus to whatever had it when the bar opened", async () => {
    await mount("/execution", ON);
    const link = screen.getByRole("link", { name: "Skip to main content" });
    link.focus();
    ctrlK();
    const dialog = await screen.findByRole("dialog", { name: "Command bar" });
    const input = within(dialog).getByRole("combobox");
    await waitFor(() => expect(document.activeElement).toBe(input));
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(link));
  });

  it("offers only the Go to rows the session's capabilities allow (fail closed)", async () => {
    await mount("/execution", ON, []);
    ctrlK();
    const none = await screen.findByRole("dialog", { name: "Command bar" });
    const withNone = within(none).getAllByRole("option").map((option) => option.textContent);
    expect(withNone).toContain("Overview");
    expect(withNone).not.toContain("Accounts");
    expect(withNone).not.toContain("Operations");
    expect(withNone).not.toContain("Blotter");
    cleanup();

    await mount("/execution", ON, ["nav:EXECUTION_ACCOUNTS_BINDINGS", "nav:EXECUTION_BLOTTER"]);
    ctrlK();
    const some = await screen.findByRole("dialog", { name: "Command bar" });
    const withSome = within(some).getAllByRole("option").map((option) => option.textContent);
    expect(withSome).toEqual(expect.arrayContaining(["Overview", "Accounts", "Blotter"]));
    expect(withSome).not.toContain("Operations");
  });

  it("entity search stays disabled with its reason", async () => {
    await mount("/execution", ON);
    ctrlK();
    const dialog = await screen.findByRole("dialog", { name: "Command bar" });
    expect(within(dialog).getByText(/Not published \(FE-023\)/)).toBeTruthy();
  });

  it("choosing a row navigates and closes the bar", async () => {
    await mount("/execution?env=paper", ON, ["nav:EXECUTION_ACCOUNTS_BINDINGS"]);
    ctrlK();
    const dialog = await screen.findByRole("dialog", { name: "Command bar" });
    fireEvent.click(within(dialog).getByRole("option", { name: "Accounts" }));
    await waitFor(() => expect(bar()).toBeNull());
    expect(screen.getByRole("link", { name: "Skip to main content" })).toBeTruthy();
  });
});

describe("shell flag off", () => {
  it.each([
    ["manifest unset", { manifest: "" }],
    ["manifest lists other screens but not shell", { manifest: "fleet,ops" }],
    ["manifest lists shell but the Execution umbrella is off", { manifest: "shell", umbrella: "false" }],
  ])("%s: an Execution route still opens the V1 palette", async (_name, env) => {
    await mount("/execution", env);
    ctrlK();
    expect(await screen.findByRole("dialog", { name: "Command palette" })).toBeTruthy();
    expect(bar()).toBeNull();
    expect(document.querySelector(".exec-cmdbar")).toBeNull();
  });
});
