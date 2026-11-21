/**
 * Users entry · the V2 roster gets the My access link (audit D4/D10), flag off it is the V1 screen untouched.
 * Flags are read at module load, so each case stubs the env and imports the route table fresh.
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../features/admin/UsersAccess", () => ({ UsersAccess: () => <p data-testid="v1-users">v1</p> }));
vi.mock("../execution/v2/screens/users", () => ({
  default: (props: { legacyHref?: string; accessHref?: string }) => (
    <p data-testid="v2-users" data-legacy={props.legacyHref ?? ""} data-access={props.accessHref ?? ""}>v2</p>
  ),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function mountEntry(url: string, manifest: string) {
  vi.stubEnv("VITE_EXECUTION_PREVIEW_ENABLED", "true");
  vi.stubEnv("VITE_EXECUTION_V2_SCREENS", manifest);
  vi.resetModules();
  const { UsersEntry } = await import("./PortalRoutes");
  await act(async () => {
    render(<MemoryRouter initialEntries={[url]}><UsersEntry /></MemoryRouter>);
  });
}

describe("UsersEntry", () => {
  it("flag on: the roster gets accessHref with workspace_id and the other context, and no screen-local params", async () => {
    await mountEntry("/administration/users?workspace_id=ws_1&env=paper&q=bob", "users");
    const node = await screen.findByTestId("v2-users");
    const href = node.getAttribute("data-access") ?? "";
    expect(href.startsWith("/administration/profile-access?")).toBe(true);
    expect(Object.fromEntries(new URLSearchParams(href.split("?")[1]))).toEqual({ env: "paper", workspace_id: "ws_1" });
    expect(node.getAttribute("data-legacy")).toBe("/administration/users?view=legacy");
  });

  it("flag on, a bare URL: the plain My access path", async () => {
    await mountEntry("/administration/users", "users");
    expect((await screen.findByTestId("v2-users")).getAttribute("data-access")).toBe("/administration/profile-access");
  });

  it("?view=legacy and flag off keep the V1 screen", async () => {
    await mountEntry("/administration/users?view=legacy", "users");
    expect(await screen.findByTestId("v1-users")).toBeTruthy();
    cleanup();
    await mountEntry("/administration/users", "");
    expect(await screen.findByTestId("v1-users")).toBeTruthy();
    expect(screen.queryByTestId("v2-users")).toBeNull();
  });
});
