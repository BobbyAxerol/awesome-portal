/**
 * Commit-level context isolation of the keyed hooks (Codex R-C 1, sibling hooks): `useKeyedAnswer` and the three hooks that now use it
 * (`useApprovalEvidence`, `useEvidenceRead`, `useAlphaLifecycle`). A probe records what each hook returns on EVERY render.
 */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { ExecutionApi } from "../../../api/ports";
import { useAlphaLifecycle } from "../alpha/useAlphaReads";
import { useApprovalEvidence } from "../cockpit/evidenceExtra";
import { useEvidenceRead } from "../cockpit/EvidenceFrame";
import { identityOf, useKeyedAnswer } from "./keyedAnswer";
import { useState } from "react";

afterEach(cleanup);

function deferredReads<T>() {
  const pending: { resolve(value: T): void; key: string }[] = [];
  return { pending, ask: (key: string) => new Promise<T>((resolve) => { pending.push({ resolve, key }); }) };
}

type Rec<S> = { ctx: string; state: S };
function probe<S>(useIt: (ctx: string) => S) {
  const log: Rec<S>[] = [];
  function Probe({ ctx }: { ctx: string }) {
    const state = useIt(ctx);
    log.push({ ctx, state });
    return null;
  }
  const view = render(<Probe ctx="A" />);
  return { log, set: (ctx: string) => view.rerender(<Probe ctx={ctx} />), view, Probe };
}

describe("useKeyedAnswer", () => {
  function setup() {
    const reads = deferredReads<string>();
    const h = probe<string>((ctx) => useKeyedAnswer<string>(ctx === "off" ? null : ctx, "idle", "loading", (settle) => { void reads.ask(ctx).then(settle); }));
    return { reads, ...h };
  }
  it("a changed key is loading in the first commit; the old answer is never returned under the new key", async () => {
    const { reads, log, set } = setup();
    await act(async () => { reads.pending[0]!.resolve("answer-A"); });
    expect(log[log.length - 1]).toEqual({ ctx: "A", state: "answer-A" });
    const before = log.length;
    act(() => set("B"));
    expect(log[before]!.state).toBe("loading");
    await act(async () => { reads.pending[1]!.resolve("answer-B"); });
    for (const r of log) if (r.state.startsWith("answer-")) expect(r.state).toBe(`answer-${r.ctx}`);
  });
  it("null key is idle in the same commit; a late reply and a reply after unmount write nothing", async () => {
    const { reads, log, set, view } = setup();
    act(() => set("off"));
    expect(log[log.length - 1]!.state).toBe("idle");
    const n = log.length;
    await act(async () => { reads.pending[0]!.resolve("late-A"); });
    expect(log.length).toBe(n);
    act(() => set("B"));
    view.unmount();
    const m = log.length;
    await act(async () => { reads.pending[1]!.resolve("late-B"); });
    expect(log.length).toBe(m);
  });
  it("out of order: A slow, B fast", async () => {
    const { reads, log, set } = setup();
    act(() => set("B"));
    await act(async () => { reads.pending[1]!.resolve("answer-B"); });
    const n = log.length;
    await act(async () => { reads.pending[0]!.resolve("answer-A"); });
    expect(log.length).toBe(n);
    expect(log[log.length - 1]).toEqual({ ctx: "B", state: "answer-B" });
  });
  it("identityOf is stable per object and different between objects", () => {
    const a = {};
    const b = {};
    expect(identityOf(a)).toBe(identityOf(a));
    expect(identityOf(a)).not.toBe(identityOf(b));
    expect(identityOf(null)).toBe(0);
  });
});

describe("useApprovalEvidence", () => {
  it("another request shows loading in the same commit, never the last request's evidence", async () => {
    const reads = deferredReads<{ ok: true; value: unknown }>();
    const api = { getApprovalEvidence: (id: string) => reads.ask(id) } as unknown as ExecutionApi;
    const h = probe((ctx) => useApprovalEvidence(api, ctx === "off" ? null : ctx, "ws"));
    await act(async () => { reads.pending[0]!.resolve({ ok: true, value: { marker: "A" } }); });
    expect(h.log[h.log.length - 1]!.state.status).toBe("ready");
    const before = h.log.length;
    act(() => h.set("B"));
    expect(h.log[before]!.state.status).toBe("loading");
    act(() => h.set("off"));
    expect(h.log[h.log.length - 1]!.state.status).toBe("idle");
  });
  it("a port without the read is absent, not a hole", async () => {
    const h = probe((ctx) => useApprovalEvidence({} as ExecutionApi, ctx, undefined));
    await act(async () => { await Promise.resolve(); });
    expect(h.log[h.log.length - 1]!.state).toMatchObject({ status: "absent" });
  });
});

describe("useEvidenceRead", () => {
  it("another selection (or workspace) is loading in the same commit", async () => {
    const api = { getReviewCaptureCapabilities: async () => ({ ok: false, status: "unavailable", reason: "x" }) } as unknown as ExecutionApi;
    function Probe({ id, ws }: { id: string | null; ws: string }) {
      const [log] = useState<string[]>(() => (globalThis as { __log?: string[] }).__log ?? []);
      const state = useEvidenceRead(api, id === null ? null : { kind: "r1", id } as never, ws);
      log.push(`${id}|${ws}|${state.status}`);
      return null;
    }
    const log: string[] = [];
    (globalThis as { __log?: string[] }).__log = log;
    const view = render(<Probe id="x" ws="w1" />);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    const settled = log[log.length - 1]!.split("|")[2]!;
    expect(settled).not.toBe("loading");
    const before = log.length;
    act(() => view.rerender(<Probe id="x" ws="w2" />));
    expect(log[before]).toBe("x|w2|loading");
    act(() => view.rerender(<Probe id={null} ws="w2" />));
    expect(log[log.length - 1]).toBe("null|w2|idle");
    delete (globalThis as { __log?: string[] }).__log;
  });
});

describe("useAlphaLifecycle", () => {
  it("another alpha, book or workspace never shows the last one's lifecycle", async () => {
    const reads = deferredReads<{ ok: true; value: unknown }>();
    const api = { getAlphaLifecycle: (alpha: string) => reads.ask(alpha) } as unknown as ExecutionApi;
    const h = probe((ctx) => useAlphaLifecycle(api, ctx !== "off", ctx, "live", null));
    await act(async () => { reads.pending[0]!.resolve({ ok: true, value: { marker: "A" } }); });
    expect(h.log[h.log.length - 1]!.state).toEqual({ marker: "A" });
    const before = h.log.length;
    act(() => h.set("B"));
    expect(h.log[before]!.state).toBeNull();
    act(() => h.set("A"));
    // back to A: a new read; the held answer was for the key before B and is not shown as B's
    for (const r of h.log) if (r.state !== null) expect(r.ctx).toBe("A");
    act(() => h.set("off"));
    expect(h.log[h.log.length - 1]!.state).toBeNull();
  });
});
