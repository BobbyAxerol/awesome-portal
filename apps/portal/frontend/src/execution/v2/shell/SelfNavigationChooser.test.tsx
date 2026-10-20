/**
 * BE-P7 · the workspace chooser the rail shows for an AMBIGUOUS self-context. Lane: FIXTURE_LAB (jsdom; the port is an in-test fake).
 * The shell-level flow (choice into the address, then the navigation read) is in `app/PortalShell.selfNavigation.test.tsx`.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SelfNavShellView } from "../../../app/selfNavView";
import type { SelfContextOutcome, SelfNavigationPort } from "./selfNavigationPort";
import SelfNavigation, { SelfNavigationChooser, WORKSPACE_CHOOSER, canAddress } from "./SelfNavigation";

const session = vi.hoisted(() => ({ principal: { sessionId: "sess_1" } as { sessionId: string } | null }));
vi.mock("../../../auth/session", () => ({ useSession: () => ({ principal: session.principal, access: { kind: "unavailable", requestId: null } }) }));

afterEach(() => cleanup());

const CANDIDATES = [
  { workspaceId: "ws_a", accessBasis: "MEMBER_ONLY" },
  { workspaceId: "ws_b", accessBasis: "MEMBER_ONLY" },
] as const;

describe("SelfNavigationChooser", () => {
  it("lists the candidates in the order given, as plain buttons in a labelled group, and announces the sentence politely", () => {
    render(<SelfNavigationChooser candidates={CANDIDATES} collapsed={false} onChoose={() => {}} />);
    const group = screen.getByRole("group", { name: WORKSPACE_CHOOSER.group });
    expect([...group.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["ws_a", "ws_b"]);
    for (const button of group.querySelectorAll("button")) {
      expect(button.getAttribute("type")).toBe("button");
      expect(button.tabIndex).toBe(0);
    }
    expect(screen.getByRole("status").textContent).toBe(`${WORKSPACE_CHOOSER.lead} ${WORKSPACE_CHOOSER.body}`);
  });

  it("choosing reports exactly that id; nothing is pre-chosen and nothing takes focus", () => {
    const onChoose = vi.fn();
    render(<SelfNavigationChooser candidates={CANDIDATES} collapsed={false} onChoose={onChoose} />);
    expect(onChoose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(document.body);
    fireEvent.click(screen.getByRole("button", { name: "ws_b" }));
    expect(onChoose).toHaveBeenCalledWith("ws_b");
  });

  it("collapsed rail: the sentence is still announced (screen-reader text) and the choices stay reachable", () => {
    render(<SelfNavigationChooser candidates={CANDIDATES} collapsed onChoose={() => {}} />);
    expect(screen.getByRole("status").className).toContain("sr-only");
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("an id that cannot be put in the address is disabled and says why, instead of being silently dropped by the address", () => {
    const long = "w".repeat(129);
    expect(canAddress("ws_ok")).toBe(true);
    expect(canAddress(long)).toBe(false);
    expect(canAddress("a\u0007b")).toBe(false);
    const onChoose = vi.fn();
    render(<SelfNavigationChooser candidates={[{ workspaceId: "ws_ok", accessBasis: "MEMBER_ONLY" }, { workspaceId: long, accessBasis: "MEMBER_ONLY" }]} collapsed={false} onChoose={onChoose} />);
    const blocked = screen.getByTitle(WORKSPACE_CHOOSER.unaddressable) as HTMLButtonElement;
    expect(blocked.disabled).toBe(true);
    fireEvent.click(blocked);
    expect(onChoose).not.toHaveBeenCalled();
  });
});

describe("the controller", () => {
  function Where() {
    const location = useLocation();
    return <output data-testid="where">{`${location.pathname}${location.search}`}</output>;
  }
  const contextPort = (outcome: SelfContextOutcome): SelfNavigationPort => ({
    read: vi.fn(async () => ({ kind: "unavailable", reason: "x", status: null, code: null, requestId: null })),
    readContext: vi.fn(async () => outcome),
  });
  const ambiguous = async (): Promise<SelfContextOutcome> => {
    const { readAccessSelfContext } = await import("../readers/accessSelfContext");
    const { loadCanonical } = await import("../testkit/loadCanonical");
    const file = loadCanonical<{ self_context_cases: { case_name: string; value: any }[] }>("execution-access.synthetic");
    const body = { ...file.self_context_cases.find((c) => c.case_name === "AMBIGUOUS_MEMBER_ONLY")!.value, observed_at_ms: Date.now(), valid_until_ms: Date.now() + 60_000 };
    const read = readAccessSelfContext(body);
    if (read === null || read.kind !== "self_context") throw new Error("unreadable");
    return { kind: "ok", context: read.context };
  };

  it("hands the shell a chooser (no entry, no navigation read) while the member has not chosen", async () => {
    const views: SelfNavShellView[] = [];
    const port = contextPort(await ambiguous());
    render(
      <MemoryRouter initialEntries={["/execution?env=paper&q=x"]}>
        <SelfNavigation onView={(view) => { views.push(view); }} port={port} enabled />
        <Where />
      </MemoryRouter>,
    );
    await waitFor(() => expect(views.at(-1)?.notice).not.toBeNull());
    render(<>{views.at(-1)!.notice!({ collapsed: false })}</>, { container: document.body.appendChild(document.createElement("div")) });
    expect(screen.getByRole("group", { name: WORKSPACE_CHOOSER.group })).toBeTruthy();
    expect(views.at(-1)?.selfEntry).toBeNull(); // no entry before a workspace is chosen
    expect(port.read).not.toHaveBeenCalled(); // and nothing is read until then
  });

  it("a RESOLVED context does not rewrite the address", async () => {
    const views: SelfNavShellView[] = [];
    const { readAccessSelfContext } = await import("../readers/accessSelfContext");
    const { loadCanonical } = await import("../testkit/loadCanonical");
    const file = loadCanonical<{ self_context_cases: { case_name: string; value: any }[] }>("execution-access.synthetic");
    const read = readAccessSelfContext({ ...file.self_context_cases.find((c) => c.case_name === "RESOLVED_SOLE_MEMBERSHIP")!.value, observed_at_ms: Date.now(), valid_until_ms: Date.now() + 60_000 });
    const port = contextPort({ kind: "ok", context: (read as { context: never }).context });
    render(
      <MemoryRouter initialEntries={["/execution?env=paper"]}>
        <SelfNavigation onView={(view) => { views.push(view); }} port={port} enabled />
        <Where />
      </MemoryRouter>,
    );
    await waitFor(() => expect(port.read).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("where").textContent).toBe("/execution?env=paper");
    expect(port.read).toHaveBeenCalledWith({ workspaceId: "ws_TEST_ONLY_personal", environment: "paper", sessionKey: "sess_1" }, expect.any(AbortSignal));
  });
});
