/**
 * FE-057/058/038 (BE-P7) · `useSelfNavigation` when the address names NO workspace: the self-context decides.
 *
 * RESOLVED scopes the navigation read; AMBIGUOUS offers the candidates and asks nothing until the member chooses (and the choice is
 * the address's `workspace_id`); NONE and UNAVAILABLE are typed text; a failed context is its reason; a default workspace is never
 * invented. Bodies are the canonical `self_context_cases` / navigation case of `execution-access.synthetic.valid.json` with only the
 * clock and scope rewritten. Lane: FIXTURE_LAB over a BFF_DOUBLE port (an in-test fake of `SelfNavigationPort`; no network).
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readAccessSelfNavigation, type AccessSelfNavigation } from "../readers/accessSelf";
import { readAccessSelfContext, type AccessSelfContext } from "../readers/accessSelfContext";
import { loadCanonical } from "../testkit/loadCanonical";
import { V2_NAV_TOKEN } from "./roleNav";
import type { SelfContextOutcome, SelfContextQuestion, SelfNavigationOutcome, SelfNavigationPort, SelfNavigationQuestion } from "./selfNavigationPort";
import { SELF_CONTEXT_COPY, useSelfNavigation, type UseSelfNavigationOptions } from "./useSelfNavigation";

type Draft = any;
const FIXTURE = loadCanonical<{
  cases: { type: string; case_name: string; value: Draft }[];
  self_context_cases: { case_name: string; value: Draft }[];
}>("execution-access.synthetic");
const T0 = 1_800_000_000_000;

function context(name: string, observed = T0, validUntil = T0 + 60_000): AccessSelfContext {
  const body = { ...FIXTURE.self_context_cases.find((c) => c.case_name === name)!.value, observed_at_ms: observed, valid_until_ms: validUntil };
  const read = readAccessSelfContext(body);
  expect(read?.kind).toBe("self_context");
  return (read as { context: AccessSelfContext }).context;
}
function navigation(workspaceId: string, observed = T0, validUntil = T0 + 60_000): AccessSelfNavigation {
  const body = FIXTURE.cases.find((c) => c.type === "AccessSelfNavigation" && c.case_name === "APP_ONLY_NOT_SOURCE_AUTHORITY")!.value;
  const read = readAccessSelfNavigation({ ...body, workspace_id: workspaceId, environment: "paper", observed_at_ms: observed, valid_until_ms: validUntil });
  expect(read?.kind).toBe("navigation");
  return (read as { navigation: AccessSelfNavigation }).navigation;
}

interface PendingNav { question: SelfNavigationQuestion; signal: AbortSignal; resolve(outcome: SelfNavigationOutcome): void }
interface PendingCtx { question: SelfContextQuestion; signal: AbortSignal; resolve(outcome: SelfContextOutcome): void }
function manualPort(withContext = true) {
  const navReads: PendingNav[] = [];
  const ctxReads: PendingCtx[] = [];
  const port: SelfNavigationPort = {
    read: (question, signal) => new Promise<SelfNavigationOutcome>((resolve) => { navReads.push({ question, signal, resolve }); }),
    ...(withContext
      ? { readContext: (question: SelfContextQuestion, signal: AbortSignal) => new Promise<SelfContextOutcome>((resolve) => { ctxReads.push({ question, signal, resolve }); }) }
      : {}),
  };
  return { port, navReads, ctxReads };
}
const ctxOk = (c: AccessSelfContext): SelfContextOutcome => ({ kind: "ok", context: c });
const navOk = (n: AccessSelfNavigation): SelfNavigationOutcome => ({ kind: "ok", navigation: n });
const BASE = { enabled: true, sessionKey: "sess_1", workspaceId: null, environment: "paper" as const };
function mount(initial: Partial<UseSelfNavigationOptions>, port: SelfNavigationPort) {
  return renderHook((props: Partial<UseSelfNavigationOptions>) => useSelfNavigation({ ...BASE, ...props, port, now: () => Date.now() }), { initialProps: initial });
}

beforeEach(() => { vi.useFakeTimers({ now: T0 }); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("the address names a workspace: the context is never asked", () => {
  it("asks navigation only", async () => {
    const { port, navReads, ctxReads } = manualPort();
    const view = mount({ workspaceId: "ws_a" }, port);
    expect(ctxReads).toHaveLength(0);
    expect(navReads).toHaveLength(1);
    await act(async () => navReads[0]!.resolve(navOk(navigation("ws_a"))));
    expect(view.result.current.phase).toBe("live");
    expect(view.result.current.chooser).toBeNull();
    // The self-only entry rides the live projection and the address's workspace.
    expect(view.result.current.selfEntry).toEqual({ workspaceId: "ws_a" });
  });
});

describe("nothing is asked without a scope", () => {
  it.each([
    ["flag off", { enabled: false }],
    ["no session", { sessionKey: null }],
  ])("%s: idle, neither read", (_name, patch) => {
    const { port, navReads, ctxReads } = manualPort();
    const view = mount(patch, port);
    expect(navReads).toHaveLength(0);
    expect(ctxReads).toHaveLength(0);
    expect(view.result.current.phase).toBe("idle");
    expect(view.result.current.selfEntry).toBeNull();
  });

  it("a port that predates the context read keeps a workspace-less address idle, as before", () => {
    const { port, navReads } = manualPort(false);
    const view = mount({}, port);
    expect(navReads).toHaveLength(0);
    expect(view.result.current.phase).toBe("idle");
    expect(view.result.current.unavailable).toBeNull();
  });
});

describe("resolvedWorkspaceId (WP-D: the Access page's workspace when the address names none)", () => {
  it("is the resolved workspace as soon as the context says RESOLVED, even while the navigation is still loading or has failed", async () => {
    const { port, navReads, ctxReads } = manualPort();
    const view = mount({}, port);
    expect(view.result.current.resolvedWorkspaceId).toBeNull(); // context still loading
    await act(async () => ctxReads[0]!.resolve(ctxOk(context("RESOLVED_SOLE_WORKSPACE_WITH_CURRENT_GRANT_RECORD"))));
    expect(view.result.current.resolvedWorkspaceId).toBe("ws_TEST_ONLY_shared");
    await act(async () => navReads[0]!.resolve({ kind: "denied", status: 403, code: null, requestId: null }));
    expect(view.result.current.phase).toBe("failed");
    expect(view.result.current.resolvedWorkspaceId).toBe("ws_TEST_ONLY_shared");
  });

  it("is null when the address names the workspace (the address is the answer, nothing to resolve), when nothing is asked, and when the context failed", async () => {
    const named = manualPort();
    const a = mount({ workspaceId: "ws_a" }, named.port);
    await act(async () => named.navReads[0]!.resolve(navOk(navigation("ws_a"))));
    expect(a.result.current.resolvedWorkspaceId).toBeNull();

    const idle = manualPort();
    expect(mount({ enabled: false }, idle.port).result.current.resolvedWorkspaceId).toBeNull();

    const failed = manualPort();
    const f = mount({}, failed.port);
    await act(async () => failed.ctxReads[0]!.resolve({ kind: "denied", status: 403, code: null, requestId: null }));
    expect(f.result.current.phase).toBe("failed");
    expect(f.result.current.resolvedWorkspaceId).toBeNull();
  });
});

describe("RESOLVED", () => {
  it("asks the context once (session only), then the navigation for THAT workspace in the selected environment", async () => {
    const { port, navReads, ctxReads } = manualPort();
    const view = mount({}, port);
    expect(ctxReads).toHaveLength(1);
    expect(ctxReads[0]!.question).toEqual({ sessionKey: "sess_1" });
    expect(navReads).toHaveLength(0);
    expect(view.result.current.phase).toBe("loading");
    await act(async () => ctxReads[0]!.resolve(ctxOk(context("RESOLVED_SOLE_WORKSPACE_WITH_CURRENT_GRANT_RECORD"))));
    expect(navReads).toHaveLength(1);
    expect(navReads[0]!.question).toEqual({ workspaceId: "ws_TEST_ONLY_shared", environment: "paper", sessionKey: "sess_1" });
    await act(async () => navReads[0]!.resolve(navOk(navigation("ws_TEST_ONLY_shared"))));
    expect(view.result.current.phase).toBe("live");
    expect(view.result.current.gate.tokens.has(V2_NAV_TOKEN.portfolios)).toBe(true);
    expect(view.result.current.selfEntry).toEqual({ workspaceId: "ws_TEST_ONLY_shared" });
    expect(view.result.current.chooser).toBeNull();
  });

  it("the entry is offered only while the navigation is live: loading, failed and denied navigation offer none", async () => {
    const { port, navReads, ctxReads } = manualPort();
    const view = mount({}, port);
    await act(async () => ctxReads[0]!.resolve(ctxOk(context("RESOLVED_SOLE_MEMBERSHIP"))));
    expect(view.result.current.selfEntry).toBeNull(); // navigation still loading
    await act(async () => navReads[0]!.resolve({ kind: "denied", status: 403, code: null, requestId: null }));
    expect(view.result.current.phase).toBe("failed");
    expect(view.result.current.selfEntry).toBeNull();
  });

  it("a navigation answer for another workspace than the resolved one is a failure, never shown", async () => {
    const { port, navReads, ctxReads } = manualPort();
    const view = mount({}, port);
    await act(async () => ctxReads[0]!.resolve(ctxOk(context("RESOLVED_SOLE_MEMBERSHIP"))));
    await act(async () => navReads[0]!.resolve(navOk(navigation("ws_somebody_else"))));
    expect(view.result.current.phase).toBe("failed");
    expect(view.result.current.selfEntry).toBeNull();
    expect(view.result.current.gate.tokens.size).toBe(0);
  });
});

describe("AMBIGUOUS: the member chooses, nothing is guessed", () => {
  it("offers the candidates in the order published, asks no navigation, offers no entry", async () => {
    const { port, navReads, ctxReads } = manualPort();
    const view = mount({}, port);
    await act(async () => ctxReads[0]!.resolve(ctxOk(context("AMBIGUOUS_SEVERAL_WITH_GRANT_RECORDS"))));
    expect(view.result.current.phase).toBe("choosing");
    expect(view.result.current.chooser?.candidates.map((c) => c.workspaceId)).toEqual(["ws_TEST_ONLY_a", "ws_TEST_ONLY_b"]);
    expect(view.result.current.unavailable).toBeNull();
    expect(view.result.current.gate.tokens.size).toBe(0);
    expect(view.result.current.selfEntry).toBeNull();
    // An ambiguous context resolves no workspace for the Access page either: the member chooses.
    expect(view.result.current.resolvedWorkspaceId).toBeNull();
    expect(navReads).toHaveLength(0);
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(navReads).toHaveLength(0); // however long the member waits
  });

  it("once the address carries the choice, the navigation for that workspace is read and the chooser is gone", async () => {
    const { port, navReads, ctxReads } = manualPort();
    const view = mount({}, port);
    await act(async () => ctxReads[0]!.resolve(ctxOk(context("AMBIGUOUS_MEMBER_ONLY"))));
    view.rerender({ workspaceId: "ws_TEST_ONLY_b" });
    expect(navReads).toHaveLength(1);
    expect(navReads[0]!.question.workspaceId).toBe("ws_TEST_ONLY_b");
    expect(ctxReads).toHaveLength(1); // the address has a workspace: the context is not asked again
    expect(view.result.current.chooser).toBeNull();
    await act(async () => navReads[0]!.resolve(navOk(navigation("ws_TEST_ONLY_b"))));
    expect(view.result.current.phase).toBe("live");
  });
});

describe("typed absences", () => {
  it("NONE: 'No workspace membership.', nothing asked, no token, no entry", async () => {
    const { port, navReads, ctxReads } = manualPort();
    const view = mount({}, port);
    await act(async () => ctxReads[0]!.resolve(ctxOk(context("ABSENT_NO_MEMBERSHIP"))));
    expect(view.result.current.phase).toBe("absent");
    expect(view.result.current.unavailable).toEqual({ reason: SELF_CONTEXT_COPY.none, busy: false });
    expect(SELF_CONTEXT_COPY.none).toBe("No workspace membership.");
    expect(view.result.current.gate.tokens.size).toBe(0);
    expect(view.result.current.selfEntry).toBeNull();
    expect(navReads).toHaveLength(0);
  });

  it("UNAVAILABLE (too many memberships): its reason, never the first N", async () => {
    const { port, navReads, ctxReads } = manualPort();
    const view = mount({}, port);
    await act(async () => ctxReads[0]!.resolve(ctxOk(context("UNAVAILABLE_TOO_MANY_MEMBERSHIPS"))));
    expect(view.result.current.phase).toBe("absent");
    expect(view.result.current.unavailable).toEqual({ reason: SELF_CONTEXT_COPY.tooMany, busy: false });
    expect(view.result.current.chooser).toBeNull();
    expect(navReads).toHaveLength(0);
  });

  it("a failed context read is its reason; no default workspace appears and nothing is retried by itself", async () => {
    const { port, navReads, ctxReads } = manualPort();
    const view = mount({}, port);
    await act(async () => ctxReads[0]!.resolve({ kind: "unavailable", reason: "The Portal answered 500.", status: 500, code: null, requestId: null }));
    expect(view.result.current.phase).toBe("failed");
    expect(view.result.current.unavailable).toEqual({ reason: "The Portal answered 500.", busy: false });
    expect(navReads).toHaveLength(0);
    await act(async () => { vi.advanceTimersByTime(60 * 60_000); });
    expect(ctxReads).toHaveLength(1);
    act(() => view.result.current.retry());
    expect(ctxReads).toHaveLength(2);
    await act(async () => ctxReads[1]!.resolve(ctxOk(context("RESOLVED_SOLE_MEMBERSHIP", Date.now(), Date.now() + 60_000))));
    expect(navReads).toHaveLength(1);
  });

  it("denied keeps its status and the Portal's code and request id", async () => {
    const { port, ctxReads } = manualPort();
    const view = mount({}, port);
    await act(async () => ctxReads[0]!.resolve({ kind: "denied", status: 403, code: "ACCESS_DENIED", requestId: "req_1" }));
    expect(view.result.current.unavailable?.reason).toBe("The Portal did not permit the workspace read for this session (403). Code ACCESS_DENIED. Request req_1.");
  });
});

describe("scope, late answers and the session ceiling", () => {
  it("a session change shows nothing on its FIRST render and asks again; the old answer is dropped whatever it says", async () => {
    const { port, ctxReads } = manualPort();
    const view = mount({}, port);
    view.rerender({ sessionKey: "sess_2" });
    expect(ctxReads[0]!.signal.aborted).toBe(true);
    expect(view.result.current.phase).toBe("loading");
    await act(async () => ctxReads[0]!.resolve(ctxOk(context("AMBIGUOUS_MEMBER_ONLY")))); // the old session answers late
    expect(view.result.current.chooser).toBeNull();
    expect(ctxReads).toHaveLength(2);
    expect(ctxReads[1]!.question.sessionKey).toBe("sess_2");
  });

  it("an answered context of ANOTHER session is not visible under the new one, even for a frame", async () => {
    const { port, ctxReads } = manualPort();
    const view = mount({}, port);
    await act(async () => ctxReads[0]!.resolve(ctxOk(context("AMBIGUOUS_MEMBER_ONLY"))));
    expect(view.result.current.chooser).not.toBeNull();
    view.rerender({ sessionKey: "sess_2" });
    expect(view.result.current.chooser).toBeNull();
    expect(view.result.current.phase).toBe("loading");
  });

  it("Retry while a read is in flight joins it (single flight)", () => {
    const { port, ctxReads } = manualPort();
    const view = mount({}, port);
    act(() => view.result.current.retry());
    act(() => view.result.current.retry());
    expect(ctxReads).toHaveLength(1);
  });

  it("at valid_until_ms the context closes (the chooser and the workspace are dropped) and ONE re-read is made", async () => {
    const { port, navReads, ctxReads } = manualPort();
    const view = mount({}, port);
    await act(async () => ctxReads[0]!.resolve(ctxOk(context("RESOLVED_SOLE_MEMBERSHIP", T0, T0 + 5_000))));
    await act(async () => navReads[0]!.resolve(navOk(navigation("ws_TEST_ONLY_personal", T0, T0 + 600_000))));
    expect(view.result.current.phase).toBe("live");
    await act(async () => { vi.advanceTimersByTime(4_999); });
    expect(view.result.current.phase).toBe("live");
    await act(async () => { vi.advanceTimersByTime(1); }); // now === valid_until_ms of the context
    expect(ctxReads).toHaveLength(2);
    expect(view.result.current.gate.tokens.size).toBe(0); // the navigation scope depended on the context's workspace
    expect(view.result.current.selfEntry).toBeNull();
    expect(view.result.current.unavailable).toMatchObject({ busy: true });
    // The re-read is also expired: shut and honest, and no further read however long the tab waits.
    await act(async () => ctxReads[1]!.resolve(ctxOk(context("RESOLVED_SOLE_MEMBERSHIP", T0 + 5_000, T0 + 5_001))));
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(view.result.current.phase).toBe("expired");
    await act(async () => { vi.advanceTimersByTime(24 * 60 * 60_000); });
    expect(ctxReads).toHaveLength(2);
  });

  it("unmount aborts the read in flight and a later answer changes nothing", async () => {
    const { port, navReads, ctxReads } = manualPort();
    const view = mount({}, port);
    view.unmount();
    expect(ctxReads[0]!.signal.aborted).toBe(true);
    await act(async () => ctxReads[0]!.resolve(ctxOk(context("RESOLVED_SOLE_MEMBERSHIP"))));
    expect(navReads).toHaveLength(0);
  });

  it("no timer is left behind by an idle or absent member", async () => {
    const { port, ctxReads } = manualPort();
    mount({}, port);
    await act(async () => ctxReads[0]!.resolve(ctxOk(context("ABSENT_NO_MEMBERSHIP"))));
    // The one timeout armed for the context's ceiling is the only clock.
    expect(vi.getTimerCount()).toBeLessThanOrEqual(1);
  });
});
