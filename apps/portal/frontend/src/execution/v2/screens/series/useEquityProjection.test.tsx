/**
 * Context isolation of `useEquityProjection` (Codex R-C 1), asserted at COMMIT level: a probe component records what the hook returns on EVERY
 * render, and each record is judged against the context it was rendered under. A body is stamped with the context it was read for
 * (deployment, workspace, window in `retention.policy_version`), so a record can say whose data it holds.
 */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { ExecutionApi } from "../../../api/ports";
import { fetchEquityProjection, type EquityProjectionQuery } from "../../readers/equityProjection";
import { projectionBody } from "./equityProjection.testbase";
import { projectionRequestKey, useEquityProjectionFor, type EquityProjectionRequest, type ProjectionState } from "./useEquityProjection";

afterEach(cleanup);

const stamp = (q: { workspaceId?: string | null; window?: string }) => `${q.workspaceId ?? "none"}|${q.window ?? "30d"}`;

/** A port whose every read waits for the test to answer it, so the order of replies is the test's. */
function controlledPort() {
  const reads: { query: EquityProjectionQuery; answer(status?: number): Promise<void> }[] = [];
  const method = (query: EquityProjectionQuery) => new Promise<Awaited<ReturnType<NonNullable<ExecutionApi["getEquityProjection"]>>>>((resolve) => {
    reads.push({
      query,
      answer: async (status = 200) => {
        const body = projectionBody(query.deploymentId, 4, {});
        (body as { analytics: { data: { retention: { policy_version: string } } } }).analytics.data.retention.policy_version = stamp(query);
        const fake = (async () => ({ ok: status === 200, status, json: async () => body }) as unknown as Response) as unknown as typeof fetch;
        resolve(await fetchEquityProjection(query, undefined, fake));
        await Promise.resolve();
      },
    });
  });
  return { reads, api: { getEquityProjection: method } as unknown as ExecutionApi, method };
}

interface Record_ { ctx: EquityProjectionRequest; state: ProjectionState }

function Probe({ api, request, log }: { api: ExecutionApi; request: EquityProjectionRequest; log: Record_[] }) {
  const state = useEquityProjectionFor(api, request);
  log.push({ ctx: request, state });
  return null;
}
const policyOf = (s: ProjectionState): string | null => (s.phase === "ready" ? s.projection.retention.policyVersion : null);

/** The invariant of every commit: ready data is the data of the context it is rendered under. */
function assertNoLeak(log: readonly Record_[], from = 0) {
  log.slice(from).forEach((r, i) => {
    if (r.state.phase !== "ready") return;
    expect(r.state.projection.deploymentId, `commit ${from + i}: deployment`).toBe(r.ctx.deploymentId);
    expect(policyOf(r.state), `commit ${from + i}: workspace and window`).toBe(stamp({ workspaceId: r.ctx.workspaceId, window: r.ctx.window }));
  });
}
const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

function mount(port: ReturnType<typeof controlledPort>, first: EquityProjectionRequest) {
  const log: Record_[] = [];
  const view = render(<Probe api={port.api} request={first} log={log} />);
  const set = (request: EquityProjectionRequest, api: ExecutionApi = port.api) => view.rerender(<Probe api={api} request={request} log={log} />);
  return { log, set, view };
}
const A: EquityProjectionRequest = { deploymentId: "dep_a", workspaceId: "ws_1", window: "30d", enabled: true };

async function readyOn(port: ReturnType<typeof controlledPort>, h: ReturnType<typeof mount>) {
  await act(async () => { await port.reads[port.reads.length - 1]!.answer(); });
  expect(h.log[h.log.length - 1]!.state.phase).toBe("ready");
}

describe("a changed context never shows the previous context's ready data", () => {
  it.each<[string, EquityProjectionRequest]>([
    ["workspace", { ...A, workspaceId: "ws_2" }],
    ["deployment", { ...A, deploymentId: "dep_b" }],
    ["window", { ...A, window: "7d" }],
    ["intent", { ...A, intent: "inspect" }],
  ])("%s: the very next commit is loading, never the old ready", async (_name, next) => {
    const port = controlledPort();
    const h = mount(port, A);
    expect(h.log[0]!.state.phase).toBe("loading");
    await readyOn(port, h);
    const before = h.log.length;
    act(() => h.set(next));
    expect(h.log[before]!.state.phase).toBe("loading"); // the first commit under the new context
    expect(h.log.slice(before).every((r) => r.state.phase !== "ready")).toBe(true);
    assertNoLeak(h.log);
    await act(async () => { await port.reads[port.reads.length - 1]!.answer(); });
    expect(h.log[h.log.length - 1]!.state.phase).toBe("ready");
    assertNoLeak(h.log);
  });

  it("disabling returns idle in the SAME commit, and re-enabling the same request starts from loading, not from a held answer", async () => {
    const port = controlledPort();
    const h = mount(port, A);
    await readyOn(port, h);
    const before = h.log.length;
    act(() => h.set({ ...A, enabled: false }));
    expect(h.log[before]!.state.phase).toBe("idle");
    await tick();
    act(() => h.set(A));
    expect(h.log[h.log.length - 1]!.state.phase).toBe("loading");
    assertNoLeak(h.log);
  });

  it("no deployment is idle at once", async () => {
    const port = controlledPort();
    const h = mount(port, A);
    await readyOn(port, h);
    act(() => h.set({ ...A, deploymentId: null }));
    expect(h.log[h.log.length - 1]!.state.phase).toBe("idle");
  });

  it("a different port is a different request: the old port's answer is not returned for the new one", async () => {
    const one = controlledPort();
    const two = controlledPort();
    const h = mount(one, A);
    await readyOn(one, h);
    const before = h.log.length;
    act(() => h.set(A, two.api));
    expect(h.log[before]!.state.phase).toBe("loading");
    expect(projectionRequestKey(one.api, A)).not.toBe(projectionRequestKey(two.api, A));
  });

  it("the key is complete: it changes with each of workspace, deployment, window, intent, enabled", () => {
    const port = controlledPort();
    const keys = [A, { ...A, workspaceId: "ws_2" }, { ...A, deploymentId: "dep_b" }, { ...A, window: "7d" as const }, { ...A, intent: "inspect" as const }, { ...A, enabled: false }].map((r) => projectionRequestKey(port.api, r));
    expect(keys.slice(0, 5).every((k) => k !== null)).toBe(true);
    expect(new Set(keys.slice(0, 5)).size).toBe(5);
    expect(keys[5]).toBeNull();
    expect(projectionRequestKey(port.api, A)).toBe(projectionRequestKey(port.api, { ...A }));
    expect(projectionRequestKey({} as ExecutionApi, A)).toBeNull();
  });

  it("the same key re-rendered asks once", async () => {
    const port = controlledPort();
    const h = mount(port, A);
    act(() => h.set({ ...A }));
    act(() => h.set({ ...A }));
    await tick();
    expect(port.reads).toHaveLength(1);
  });
});

describe("late and out-of-order replies", () => {
  it("a delayed reply for context A arriving after the switch to B changes nothing", async () => {
    const port = controlledPort();
    const h = mount(port, A);
    const B = { ...A, workspaceId: "ws_2" };
    act(() => h.set(B));
    const afterSwitch = h.log.length;
    await act(async () => { await port.reads[0]!.answer(); }); // A answers late
    expect(h.log.slice(afterSwitch).every((r) => r.state.phase === "loading")).toBe(true); // B is still loading: A's reply wrote nothing
    await act(async () => { await port.reads[1]!.answer(); });
    expect(h.log[h.log.length - 1]!.state.phase).toBe("ready");
    expect(policyOf(h.log[h.log.length - 1]!.state)).toBe(stamp(B));
    assertNoLeak(h.log);
  });

  it("A slow, B fast: only B is ever shown, and A's later reply does not replace it", async () => {
    const port = controlledPort();
    const h = mount(port, A);
    const B = { ...A, deploymentId: "dep_b" };
    act(() => h.set(B));
    await act(async () => { await port.reads[1]!.answer(); }); // B first
    const settled = h.log.length;
    await act(async () => { await port.reads[0]!.answer(); }); // then A
    expect(h.log.length).toBe(settled); // A's reply caused no commit at all
    expect(h.log[h.log.length - 1]!.state.phase === "ready" && (h.log[h.log.length - 1]!.state as { projection: { deploymentId: string } }).projection.deploymentId).toBe("dep_b");
    assertNoLeak(h.log);
  });

  it("B slow, A fast (switch away and back): the answer of A for the first visit does not fill the second", async () => {
    const port = controlledPort();
    const h = mount(port, A);
    const B = { ...A, window: "7d" as const };
    act(() => h.set(B));
    act(() => h.set(A)); // back to A: a second read for A
    expect(port.reads).toHaveLength(3);
    await act(async () => { await port.reads[1]!.answer(); }); // B answers late
    expect(h.log[h.log.length - 1]!.state.phase).toBe("loading");
    await act(async () => { await port.reads[2]!.answer(); }); // the current A
    expect(policyOf(h.log[h.log.length - 1]!.state)).toBe(stamp(A));
    await act(async () => { await port.reads[0]!.answer(); }); // the first A, late, is fenced by its own effect run
    assertNoLeak(h.log);
  });

  it("a reply arriving after unmount writes nothing and throws nothing", async () => {
    const port = controlledPort();
    const h = mount(port, A);
    h.view.unmount();
    const committed = h.log.length;
    await act(async () => { await port.reads[0]!.answer(); });
    expect(h.log.length).toBe(committed);
  });

  it("a reply arriving after the request was disabled writes nothing", async () => {
    const port = controlledPort();
    const h = mount(port, A);
    act(() => h.set({ ...A, enabled: false }));
    const committed = h.log.length;
    await act(async () => { await port.reads[0]!.answer(); });
    expect(h.log.length).toBe(committed);
    expect(h.log[h.log.length - 1]!.state.phase).toBe("idle");
  });
});

describe("answers by kind", () => {
  it("404 is absent, 403 is refused DENIED, both carry the key they were read for", async () => {
    const port = controlledPort();
    const h = mount(port, A);
    await act(async () => { await port.reads[0]!.answer(404); });
    expect(h.log[h.log.length - 1]!.state).toEqual({ phase: "absent", word: "NOT_FOUND" });
    act(() => h.set({ ...A, workspaceId: "ws_2" }));
    expect(h.log[h.log.length - 1]!.state.phase).toBe("loading"); // the absence of ws_1 is not ws_2's
    await act(async () => { await port.reads[1]!.answer(403); });
    expect(h.log[h.log.length - 1]!.state).toMatchObject({ phase: "refused", word: "DENIED" });
  });
});
