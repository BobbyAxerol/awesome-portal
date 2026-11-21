/**
 * W1 · `useSelfNavigation`: scope isolation, late answers, single flight, 409 once, the expiry close and its one re-read.
 * Lane: FIXTURE_LAB (bodies are the published canonical fixture, `execution-access.synthetic.valid.json`, with only the clock
 * and scope rewritten) over a BFF_DOUBLE port (an in-test fake of `SelfNavigationPort`; no network).
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readAccessSelfNavigation, type AccessSelfNavigation } from "../readers/accessSelf";
import { loadCanonical } from "../testkit/loadCanonical";
import { V2_NAV_TOKEN } from "./roleNav";
import type { SelfNavigationOutcome, SelfNavigationPort, SelfNavigationQuestion } from "./selfNavigationPort";
import { useSelfNavigation, type UseSelfNavigationOptions } from "./useSelfNavigation";

type Draft = any;
const FIXTURE = loadCanonical<{ cases: { type: string; case_name: string; value: Draft }[] }>("execution-access.synthetic");
const bodyOf = (name: string): Draft => FIXTURE.cases.find((entry) => entry.type === "AccessSelfNavigation" && entry.case_name === name)!.value;

/** A projection from the canonical body for a scope and a clock: the shape is the fixture's, only the scope and the times move. */
function projection(scope: { workspaceId: string; environment: "paper" | "sandbox" | "live" }, observed: number, validUntil: number, name = "APP_ONLY_NOT_SOURCE_AUTHORITY"): AccessSelfNavigation {
  const read = readAccessSelfNavigation({ ...bodyOf(name), workspace_id: scope.workspaceId, environment: scope.environment, observed_at_ms: observed, valid_until_ms: validUntil });
  expect(read?.kind).toBe("navigation");
  return (read as { navigation: AccessSelfNavigation }).navigation;
}

const T0 = 1_800_000_000_000;
const PORTFOLIOS = V2_NAV_TOKEN.portfolios;

interface Pending {
  question: SelfNavigationQuestion;
  signal: AbortSignal;
  resolve(outcome: SelfNavigationOutcome): void;
}

/** A port whose every read stays open until the test answers it, so ordering (late answers) is under the test's control. */
function manualPort() {
  const reads: Pending[] = [];
  const port: SelfNavigationPort = {
    read: (question, signal) =>
      new Promise<SelfNavigationOutcome>((resolve) => {
        reads.push({ question, signal, resolve });
      }),
  };
  return { port, reads };
}

const ok = (navigation: AccessSelfNavigation): SelfNavigationOutcome => ({ kind: "ok", navigation });
const unavailable = (reason = "The Portal answered 500.", status: number | null = 500): SelfNavigationOutcome => ({ kind: "unavailable", reason, status, code: null, requestId: null });

const SCOPE = { enabled: true, sessionKey: "sess_1", workspaceId: "ws_a", environment: "paper" as const };

function mount(initial: Partial<UseSelfNavigationOptions>, port: SelfNavigationPort, now: () => number) {
  return renderHook((props: Partial<UseSelfNavigationOptions>) => useSelfNavigation({ ...SCOPE, ...props, port, now }), { initialProps: initial });
}

beforeEach(() => {
  vi.useFakeTimers({ now: T0 });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("nothing is asked without a scope", () => {
  it.each([
    ["flag off", { enabled: false }],
    ["no session", { sessionKey: null }],
    ["no workspace in the address", { workspaceId: null }],
  ])("%s: idle, no read, no notice, no token", (_name, patch) => {
    const { port, reads } = manualPort();
    const view = mount(patch, port, () => Date.now());
    expect(reads).toHaveLength(0);
    expect(view.result.current.phase).toBe("idle");
    expect(view.result.current.unavailable).toBeNull();
    expect(view.result.current.gate.tokens.size).toBe(0);
  });
});

describe("the five phases", () => {
  it("loading -> live: asks once for exactly (workspace, environment, session), then lists the ENTERABLE tokens", async () => {
    const { port, reads } = manualPort();
    const view = mount({}, port, () => Date.now());
    expect(view.result.current.phase).toBe("loading");
    expect(view.result.current.gate.tokens.size).toBe(0);
    expect(reads).toHaveLength(1);
    expect(reads[0]!.question).toEqual({ workspaceId: "ws_a", environment: "paper", sessionKey: "sess_1" });
    await act(async () => reads[0]!.resolve(ok(projection(SCOPE, T0, T0 + 60_000))));
    expect(view.result.current.phase).toBe("live");
    expect(view.result.current.gate.kind).toBe("live");
    expect(view.result.current.gate.tokens.has(PORTFOLIOS)).toBe(true);
    expect(view.result.current.unavailable).toBeNull();
    expect(reads).toHaveLength(1);
  });

  it("failed: a non-409 failure is not retried by itself and prints its reason; Retry asks again", async () => {
    const { port, reads } = manualPort();
    const view = mount({}, port, () => Date.now());
    await act(async () => reads[0]!.resolve(unavailable()));
    expect(view.result.current.phase).toBe("failed");
    expect(view.result.current.unavailable).toEqual({ reason: "The Portal answered 500.", busy: false });
    expect(view.result.current.gate.tokens.size).toBe(0);
    await act(async () => { vi.advanceTimersByTime(10 * 60_000); });
    expect(reads).toHaveLength(1);
    act(() => view.result.current.retry());
    expect(reads).toHaveLength(2);
    await act(async () => reads[1]!.resolve(ok(projection(SCOPE, Date.now(), Date.now() + 60_000))));
    expect(view.result.current.phase).toBe("live");
  });

  it("denied keeps its status and the Portal's code and request id", async () => {
    const { port, reads } = manualPort();
    const view = mount({}, port, () => Date.now());
    await act(async () => reads[0]!.resolve({ kind: "denied", status: 403, code: "ACCESS_DENIED", requestId: "req_1" }));
    expect(view.result.current.unavailable?.reason).toBe("The Portal did not permit the navigation read for this session (403). Code ACCESS_DENIED. Request req_1.");
    expect(view.result.current.gate.tokens.size).toBe(0);
  });

  it("an answer for another workspace or environment than the one asked is a failure, never shown", async () => {
    const { port, reads } = manualPort();
    const view = mount({}, port, () => Date.now());
    await act(async () => reads[0]!.resolve(ok(projection({ workspaceId: "ws_other", environment: "paper" }, T0, T0 + 60_000))));
    expect(view.result.current.phase).toBe("failed");
    expect(view.result.current.unavailable?.reason).toMatch(/different workspace or environment/);
    expect(view.result.current.gate.tokens.size).toBe(0);
  });
});

describe("scope isolation and late answers", () => {
  it.each<[string, Partial<UseSelfNavigationOptions>]>([
    ["workspace", { workspaceId: "ws_b" }],
    ["environment", { environment: "live" }],
    ["session", { sessionKey: "sess_2" }],
  ])("a %s change shows nothing on its FIRST render and asks the new question", async (_name, patch) => {
    const { port, reads } = manualPort();
    const view = mount({}, port, () => Date.now());
    await act(async () => reads[0]!.resolve(ok(projection(SCOPE, T0, T0 + 60_000))));
    expect(view.result.current.gate.tokens.has(PORTFOLIOS)).toBe(true);

    // The very first result after the change is already empty: no effect had to run for the old rail to disappear.
    const seen: string[] = [];
    view.rerender(patch);
    seen.push(view.result.current.phase);
    expect(seen).toEqual(["loading"]);
    expect(view.result.current.gate.tokens.size).toBe(0);
    expect(reads).toHaveLength(2);
    expect(reads[1]!.question).toMatchObject({ workspaceId: patch.workspaceId ?? "ws_a", environment: patch.environment ?? "paper", sessionKey: patch.sessionKey ?? "sess_1" });
  });

  it("a late answer for the OLD scope is dropped whatever it says, even a good one", async () => {
    const { port, reads } = manualPort();
    const view = mount({}, port, () => Date.now());
    view.rerender({ workspaceId: "ws_b" });
    expect(reads[0]!.signal.aborted).toBe(true); // the read in flight for the old scope is cancelled
    // The old read (scope ws_a) answers after the switch.
    await act(async () => reads[0]!.resolve(ok(projection(SCOPE, T0, T0 + 60_000))));
    expect(view.result.current.phase).toBe("loading");
    expect(view.result.current.gate.tokens.size).toBe(0);
    await act(async () => reads[1]!.resolve(ok(projection({ workspaceId: "ws_b", environment: "paper" }, T0, T0 + 60_000, "ABSENT_PERMISSION"))));
    expect(view.result.current.phase).toBe("live");
    expect(view.result.current.gate.tokens.size).toBe(0); // ws_b's own answer lists nothing
  });

  it("switching away and back asks again; the first scope's answer is not kept", async () => {
    const { port, reads } = manualPort();
    const view = mount({}, port, () => Date.now());
    await act(async () => reads[0]!.resolve(ok(projection(SCOPE, T0, T0 + 60_000))));
    view.rerender({ workspaceId: "ws_b" });
    view.rerender({ workspaceId: "ws_a" });
    expect(view.result.current.phase).toBe("loading");
    expect(view.result.current.gate.tokens.size).toBe(0);
    expect(reads).toHaveLength(3);
  });

  it("leaving the scope entirely (no workspace) clears the projection and asks nothing", async () => {
    const { port, reads } = manualPort();
    const view = mount({}, port, () => Date.now());
    await act(async () => reads[0]!.resolve(ok(projection(SCOPE, T0, T0 + 60_000))));
    view.rerender({ workspaceId: null });
    expect(view.result.current.phase).toBe("idle");
    expect(view.result.current.gate.tokens.size).toBe(0);
    expect(reads).toHaveLength(1);
  });

  it("unmount aborts the read in flight and a later answer changes nothing", async () => {
    const { port, reads } = manualPort();
    const view = mount({}, port, () => Date.now());
    view.unmount();
    expect(reads[0]!.signal.aborted).toBe(true);
    await act(async () => reads[0]!.resolve(ok(projection(SCOPE, T0, T0 + 60_000))));
    expect(reads).toHaveLength(1);
  });
});

describe("single flight", () => {
  it("Retry while a read is in flight joins it: one request, not two", async () => {
    const { port, reads } = manualPort();
    const view = mount({}, port, () => Date.now());
    act(() => view.result.current.retry());
    act(() => view.result.current.retry());
    expect(reads).toHaveLength(1);
    await act(async () => reads[0]!.resolve(ok(projection(SCOPE, T0, T0 + 60_000))));
    expect(view.result.current.phase).toBe("live");
  });

  it("re-rendering with the same scope (a new port or clock identity) does not ask again", async () => {
    const { port, reads } = manualPort();
    const view = mount({}, port, () => Date.now());
    view.rerender({});
    view.rerender({ port: { ...port }, now: () => Date.now() });
    expect(reads).toHaveLength(1);
  });
});

describe("HTTP 409 is repeated once", () => {
  const conflict: SelfNavigationOutcome = { kind: "conflict", code: "ACCESS_CONFLICT", requestId: null };

  it("409 then a body: shown, after exactly two reads of the same question", async () => {
    const { port, reads } = manualPort();
    const view = mount({}, port, () => Date.now());
    await act(async () => reads[0]!.resolve(conflict));
    expect(reads).toHaveLength(2);
    expect(reads[1]!.question).toEqual(reads[0]!.question);
    await act(async () => reads[1]!.resolve(ok(projection(SCOPE, T0, T0 + 60_000))));
    expect(view.result.current.phase).toBe("live");
  });

  it("409 twice is a failure with its reason, and nothing more is asked by itself", async () => {
    const { port, reads } = manualPort();
    const view = mount({}, port, () => Date.now());
    await act(async () => reads[0]!.resolve(conflict));
    await act(async () => reads[1]!.resolve(conflict));
    expect(view.result.current.phase).toBe("failed");
    expect(view.result.current.unavailable?.reason).toMatch(/could not settle the navigation read after one retry \(409\)/);
    await act(async () => { vi.advanceTimersByTime(60 * 60_000); });
    expect(reads).toHaveLength(2);
  });

  it("a 409 that arrives after a scope change is not retried", async () => {
    const { port, reads } = manualPort();
    const view = mount({}, port, () => Date.now());
    view.rerender({ workspaceId: "ws_b" });
    await act(async () => reads[0]!.resolve(conflict));
    expect(reads).toHaveLength(2); // only ws_b's own first read
    expect(reads[1]!.question.workspaceId).toBe("ws_b");
  });

  it.each([
    ["500", unavailable()],
    ["401", { kind: "denied", status: 401, code: null, requestId: null } as SelfNavigationOutcome],
    ["unreachable", unavailable("The Portal could not be reached.", null)],
  ])("%s is never retried automatically", async (_name, outcome) => {
    const { port, reads } = manualPort();
    mount({}, port, () => Date.now());
    await act(async () => reads[0]!.resolve(outcome));
    await act(async () => { vi.advanceTimersByTime(60 * 60_000); });
    expect(reads).toHaveLength(1);
  });
});

describe("the session ceiling closes the rail, then one re-read", () => {
  it("inside the ceiling the rail is live; AT the ceiling it is shut with the reason, and exactly one re-read is made", async () => {
    const { port, reads } = manualPort();
    const view = mount({}, port, () => Date.now());
    await act(async () => reads[0]!.resolve(ok(projection(SCOPE, T0, T0 + 5_000))));
    expect(view.result.current.phase).toBe("live");

    await act(async () => { vi.advanceTimersByTime(4_999); });
    expect(view.result.current.phase).toBe("live");
    expect(reads).toHaveLength(1);

    await act(async () => { vi.advanceTimersByTime(1); }); // now === valid_until_ms: end-exclusive
    expect(reads).toHaveLength(2);
    expect(view.result.current.gate.tokens.size).toBe(0);
    expect(view.result.current.unavailable).toMatchObject({ busy: true });
    expect(view.result.current.unavailable?.reason).toMatch(/ended at .* \(Portal clock\) and is no longer shown\. Retry to check again\./);
  });

  it("the re-read answers expired again: shut, honest, and NO further read however long the tab waits (no timer storm)", async () => {
    const { port, reads } = manualPort();
    const view = mount({}, port, () => Date.now());
    await act(async () => reads[0]!.resolve(ok(projection(SCOPE, T0, T0 + 5_000))));
    await act(async () => { vi.advanceTimersByTime(5_000); });
    // The Portal still answers a ceiling in the past (or 1 ms ahead, over and over): that must not loop.
    await act(async () => reads[1]!.resolve(ok(projection(SCOPE, T0 + 5_000, T0 + 5_001))));
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(view.result.current.phase).toBe("expired");
    expect(view.result.current.unavailable).toMatchObject({ busy: false });
    await act(async () => { vi.advanceTimersByTime(24 * 60 * 60_000); });
    expect(reads).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("the re-read fails: the failure replaces the expiry sentence; still no further read", async () => {
    const { port, reads } = manualPort();
    const view = mount({}, port, () => Date.now());
    await act(async () => reads[0]!.resolve(ok(projection(SCOPE, T0, T0 + 5_000))));
    await act(async () => { vi.advanceTimersByTime(5_000); });
    await act(async () => reads[1]!.resolve({ kind: "denied", status: 401, code: null, requestId: null }));
    expect(view.result.current.phase).toBe("failed");
    expect(view.result.current.unavailable?.reason).toMatch(/\(401\)/);
    await act(async () => { vi.advanceTimersByTime(60 * 60_000); });
    expect(reads).toHaveLength(2);
  });

  it("the re-read returns a live projection: the rail is back, and it arms for the NEW ceiling", async () => {
    const { port, reads } = manualPort();
    const view = mount({}, port, () => Date.now());
    await act(async () => reads[0]!.resolve(ok(projection(SCOPE, T0, T0 + 5_000))));
    await act(async () => { vi.advanceTimersByTime(5_000); });
    await act(async () => reads[1]!.resolve(ok(projection(SCOPE, T0 + 5_000, T0 + 65_000))));
    expect(view.result.current.phase).toBe("live");
    expect(view.result.current.gate.tokens.has(PORTFOLIOS)).toBe(true);
    await act(async () => { vi.advanceTimersByTime(59_999); });
    expect(view.result.current.phase).toBe("live");
  });

  it("Retry after a second expiry restores the one automatic re-read", async () => {
    const { port, reads } = manualPort();
    const view = mount({}, port, () => Date.now());
    await act(async () => reads[0]!.resolve(ok(projection(SCOPE, T0, T0 + 5_000))));
    await act(async () => { vi.advanceTimersByTime(5_000); });
    await act(async () => reads[1]!.resolve(ok(projection(SCOPE, T0 + 5_000, T0 + 5_001))));
    await act(async () => { vi.advanceTimersByTime(1); });
    act(() => view.result.current.retry());
    expect(reads).toHaveLength(3);
    await act(async () => reads[2]!.resolve(ok(projection(SCOPE, T0 + 5_001, T0 + 9_000))));
    await act(async () => { vi.advanceTimersByTime(4_000); });
    expect(reads).toHaveLength(4); // the allowance was restored by the user's Retry
  });

  it("a ceiling already in the past is shut on the first answer (no flash of a live rail)", async () => {
    const { port, reads } = manualPort();
    const view = mount({}, port, () => Date.now());
    await act(async () => reads[0]!.resolve(ok(projection(SCOPE, T0 - 10_000, T0 - 5_000))));
    expect(view.result.current.gate.tokens.size).toBe(0);
    expect(view.result.current.unavailable).not.toBeNull();
  });

  it("an unreadable client clock is shut, not live", async () => {
    const { port, reads } = manualPort();
    const view = mount({}, port, () => Number.NaN);
    await act(async () => reads[0]!.resolve(ok(projection(SCOPE, T0, T0 + 60_000))));
    expect(view.result.current.gate.tokens.size).toBe(0);
    expect(view.result.current.unavailable?.reason).toMatch(/clock could not be read/);
  });

  it("a ceiling beyond what setTimeout holds is waited out in slices, never fired early and never as a storm", async () => {
    const { port, reads } = manualPort();
    const view = mount({}, port, () => Date.now());
    const far = 40 * 24 * 60 * 60_000; // 40 days: more than 2^31-1 ms
    await act(async () => reads[0]!.resolve(ok(projection(SCOPE, T0, T0 + far))));
    expect(vi.getTimerCount()).toBe(1);
    await act(async () => { vi.advanceTimersByTime(30 * 24 * 60 * 60_000); });
    expect(view.result.current.phase).toBe("live");
    expect(vi.getTimerCount()).toBe(1);
    await act(async () => { vi.advanceTimersByTime(10 * 24 * 60 * 60_000); });
    expect(reads).toHaveLength(2);
  });

  it("returning to the tab re-checks the ceiling with no request unless it has passed", async () => {
    const { port, reads } = manualPort();
    const view = mount({}, port, () => Date.now());
    await act(async () => reads[0]!.resolve(ok(projection(SCOPE, T0, T0 + 5_000))));
    act(() => { window.dispatchEvent(new Event("focus")); });
    expect(reads).toHaveLength(1);
    expect(view.result.current.phase).toBe("live");
    // A throttled background timer: the clock has moved past the ceiling without the timer firing.
    vi.setSystemTime(T0 + 6_000);
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(reads).toHaveLength(2);
  });
});

describe("no storage, no polling", () => {
  it("touches neither localStorage nor sessionStorage, and starts no interval, across a full life cycle", async () => {
    const touched = vi.fn();
    for (const store of [Storage.prototype]) {
      vi.spyOn(store, "getItem").mockImplementation(touched);
      vi.spyOn(store, "setItem").mockImplementation(touched);
      vi.spyOn(store, "removeItem").mockImplementation(touched);
    }
    const interval = vi.spyOn(globalThis, "setInterval");
    const { port, reads } = manualPort();
    const view = mount({}, port, () => Date.now());
    await act(async () => reads[0]!.resolve(ok(projection(SCOPE, T0, T0 + 5_000))));
    await act(async () => { vi.advanceTimersByTime(5_000); });
    await act(async () => reads[1]!.resolve(unavailable()));
    act(() => view.result.current.retry());
    view.unmount();
    expect(touched).not.toHaveBeenCalled();
    expect(interval).not.toHaveBeenCalled();
  });
});
