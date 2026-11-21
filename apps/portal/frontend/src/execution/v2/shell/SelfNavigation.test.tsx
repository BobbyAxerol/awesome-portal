/**
 * W3 · the notice and the controller's hand-off to the shell. Lane: FIXTURE_LAB (jsdom; port is an in-test fake, BFF_DOUBLE).
 * The shell-level behaviour (rail contents, scope changes, expiry) is in `app/PortalShell.selfNavigation.test.tsx`.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SelfNavShellView } from "../../../app/selfNavView";
import type { SelfNavigationOutcome, SelfNavigationPort } from "./selfNavigationPort";
import SelfNavigation, { NAVIGATION_UNAVAILABLE, SelfNavigationNotice } from "./SelfNavigation";

const session = vi.hoisted(() => ({ principal: { sessionId: "sess_1" } as { sessionId: string } | null }));
vi.mock("../../../auth/session", () => ({ useSession: () => ({ principal: session.principal, access: { kind: "unavailable", requestId: null } }) }));

afterEach(() => {
  cleanup();
  session.principal = { sessionId: "sess_1" };
});

describe("SelfNavigationNotice", () => {
  it("prints 'Navigation unavailable: <reason>' as a polite status, with a plain Retry button in the tab order", () => {
    const onRetry = vi.fn();
    render(<SelfNavigationNotice reason="The Portal answered 503." busy={false} collapsed={false} onRetry={onRetry} />);
    expect(screen.getByRole("status").textContent).toBe(`${NAVIGATION_UNAVAILABLE} The Portal answered 503.`);
    const button = screen.getByRole("button", { name: "Retry" });
    expect(button.tabIndex).toBe(0);
    expect(button.getAttribute("type")).toBe("button");
    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("while re-reading it says so in text and keeps the SAME enabled control (a disabled button would drop focus)", () => {
    const { rerender } = render(<SelfNavigationNotice reason="ended." busy={false} collapsed={false} onRetry={() => {}} />);
    const button = screen.getByRole("button", { name: "Retry" });
    button.focus();
    rerender(<SelfNavigationNotice reason="ended." busy collapsed={false} onRetry={() => {}} />);
    expect(screen.getByRole("button", { name: "Retry" })).toBe(button);
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(document.activeElement).toBe(button);
    expect(screen.getByRole("status").textContent).toContain("Checking again.");
  });

  it("collapsed rail: the sentence is the control's accessible name and tooltip, and is still announced", () => {
    render(<SelfNavigationNotice reason="The Portal answered 503." busy={false} collapsed onRetry={() => {}} />);
    const button = screen.getByRole("button", { name: "Navigation unavailable: The Portal answered 503. Retry" });
    expect(button.getAttribute("title")).toBe("Navigation unavailable: The Portal answered 503.");
    expect(screen.getByRole("status").textContent).toBe("Navigation unavailable: The Portal answered 503.");
  });
});

describe("the controller", () => {
  const fail = (): SelfNavigationOutcome => ({ kind: "unavailable", reason: "The Portal answered 500.", status: 500, code: null, requestId: null });
  function mount(route: string, port: SelfNavigationPort, enabled = true) {
    const views: SelfNavShellView[] = [];
    const onView = (view: SelfNavShellView) => { views.push(view); };
    const view = render(
      <MemoryRouter initialEntries={[route]}>
        <SelfNavigation onView={onView} port={port} enabled={enabled} />
      </MemoryRouter>,
    );
    return { views, view };
  }

  it("renders nothing itself; hands the shell a notice once the read fails", async () => {
    const read = vi.fn(async () => fail());
    const { views, view } = mount("/execution?workspace_id=ws_a&env=sandbox", { read });
    expect(view.container.innerHTML).toBe("");
    await waitFor(() => expect(views.at(-1)?.notice).not.toBeNull());
    expect(read).toHaveBeenCalledWith({ workspaceId: "ws_a", environment: "sandbox", sessionKey: "sess_1" }, expect.any(AbortSignal));
    render(<>{views.at(-1)!.notice!({ collapsed: false })}</>);
    expect(screen.getByRole("status").textContent).toBe("Navigation unavailable: The Portal answered 500.");
  });

  it("disabled, or without a session, it asks nothing and hands over the empty view; unmounting resets the shell", async () => {
    const read = vi.fn(async () => fail());
    const off = mount("/execution?workspace_id=ws_a", { read }, false);
    session.principal = null;
    const noSession = mount("/execution?workspace_id=ws_a", { read });
    expect(read).not.toHaveBeenCalled();
    for (const { views } of [off, noSession]) for (const view of views) expect(view.notice === null && view.tokens.size === 0).toBe(true);
    off.view.unmount();
    expect(off.views.at(-1)?.notice).toBeNull();
  });
});
