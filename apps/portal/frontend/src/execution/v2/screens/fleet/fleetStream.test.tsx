/**
 * The Fleet with its realtime STREAM chip (ELP2-09, flag key `fleet-stream`), screen level.
 * Lane: FIXTURE_LAB (unit, jsdom). The Fleet is the real screen over the REAL HTTP client and the dataset double; the barrier and the
 * event stream are the published synthetic cases served through a stubbed `fetch`. A stream here is a Response the test holds open.
 * Nothing proves a real source, a real cursor or a real revocation.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { alphaFleet } from "../../../../../e2e/bffDouble";
import { createHttpApi } from "../../../api/httpApi";
import type { AlphaFleetQuery, ExecutionApi } from "../../../api/ports";
import { readAlphaFleet } from "../../../api/profileRead";
import type { DeliveryPolicy } from "../../../profile";
import { ALPHA_FLEET_SNAPSHOT_PATH, ALPHA_FLEET_STREAM_PATH } from "../../readers/alphaFleetRealtime";
import { barrier, jsonResponse, problem, settle, streamResponse, wireCase, type FakeStream } from "../../fleetStream/fleetStream.testbase";
import { fleetStreamSessionCount } from "../../fleetStream/fleetStreamSession";
import { alphasOf, newDatasetDouble, wrapDatasetFetch, type DatasetDoubleState, type DoubleAlpha } from "./datasetDouble.testbase";
import FleetScreen from "./index";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const OPEN: DeliveryPolicy = {
  policyRevision: 4, queryEnabled: true, projectionIngestionEnabled: true, sseEnabled: true, governanceWriteEnabled: true, paperCommandsEnabled: true,
  sandboxCommandsEnabled: true, liveProtectiveCommandsEnabled: true, liveRiskIncreasingCommandsEnabled: true,
};
const LIVE_URL = "/execution/fleet?stage=canary,live";
const MIXED: DoubleAlpha[] = alphasOf(6, [["LIVE"], ["CANARY", "LIVE"], ["CANARY"]], { healths: ["READY", "ATTENTION", "FINDING"], owners: ["Lan-002", "Bobby-001"] });
const NEWER = `sha256:${"e".repeat(64)}`;

interface Rig {
  api: ExecutionApi;
  state: DatasetDoubleState;
  /** Requests to the realtime routes, in order (path only). */
  realtime: string[];
  /** The `lineage.revision` the dataset double last answered. */
  lineage: () => string | null;
  streams: FakeStream[];
  /** Every request of the page, in order, with the signal it was given. */
  requests: { path: string; signal: AbortSignal | null }[];
  /** What the barrier answers; the call index is passed so a test can move the head. */
  barrierFor: (index: number, lineage: string) => Response | Record<string, unknown>;
  streamFor: (index: number, stream: FakeStream) => Response;
}

function rig(): Rig {
  const state = newDatasetDouble({ live: MIXED }, "ok");
  const dataset = wrapDatasetFetch(null, state);
  const realtime: string[] = [];
  let lineage: string | null = null;
  const streams: FakeStream[] = [];
  const requests: { path: string; signal: AbortSignal | null }[] = [];
  const r: Rig = {
    api: undefined as unknown as ExecutionApi, state, realtime, lineage: () => lineage, streams, requests,
    barrierFor: (_i, current) => barrier(current, (body) => { body.environment = "live"; }),
    streamFor: (_i, stream) => stream.response,
  };
  vi.stubGlobal("fetch", (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://portal.test");
    requests.push({ path: url.pathname, signal: init?.signal ?? null });
    if (url.pathname === ALPHA_FLEET_SNAPSHOT_PATH) {
      const index = realtime.filter((p) => p === url.pathname).length;
      realtime.push(url.pathname);
      const answer = r.barrierFor(index, lineage ?? "");
      return answer instanceof Response ? answer : jsonResponse(200, answer);
    }
    if (url.pathname === ALPHA_FLEET_STREAM_PATH) {
      const index = realtime.filter((p) => p === url.pathname).length;
      realtime.push(url.pathname);
      const stream = streamResponse();
      streams.push(stream);
      return r.streamFor(index, stream);
    }
    const response = await dataset(input, init);
    try {
      const body = (await response.clone().json()) as { lineage?: { revision?: string } };
      if (typeof body.lineage?.revision === "string") lineage = body.lineage.revision;
    } catch {
      /* not JSON */
    }
    return response;
  }) as typeof fetch);
  const http = createHttpApi({ policy: OPEN, readScope: {} });
  const getAlphaFleet = vi.fn(async (query: AlphaFleetQuery = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== "") params.set(key, String(value));
    const reply = alphaFleet(params);
    const envelope = reply.status === 200 ? readAlphaFleet(reply.body) : null;
    return envelope ? { ok: true as const, value: envelope } : { ok: false as const, status: "unavailable" as const, reason: "UNREADABLE_ALPHA_FLEET" };
  });
  // As in production, a read made under a signal goes through the real client's `withReadSignal`, so a cancelled read cancels its fetch.
  function portWith(signal: AbortSignal | null): ExecutionApi {
    const client = signal === null ? http : http.withReadSignal!(signal);
    return { getAlphaFleet, getManagerDataset: client.getManagerDataset, withReadSignal: portWith } as unknown as ExecutionApi;
  }
  r.api = portWith(null);
  return r;
}

const mount = (r: Rig, entry: string, props: { streamFlag?: boolean } = {}) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <FleetScreen api={r.api} {...props} />
    </MemoryRouter>,
  );
const table = () => screen.findByRole("table", { name: "Alpha fleet" });
const chip = () => screen.queryByTestId("fleet-stream");
const datasetPages = (r: Rig) => r.state.calls.filter((call) => call.query.get("limit") !== "1");
const only = (r: Rig, path: string) => r.realtime.filter((p) => p === path);

describe("flag off (the default)", () => {
  it("opens no stream and reads no barrier, and draws no chip", async () => {
    const r = rig();
    mount(r, LIVE_URL);
    await table();
    await act(async () => { await settle(); });
    expect(r.realtime).toEqual([]);
    expect(chip()).toBeNull();
    expect(fleetStreamSessionCount()).toBe(0);
  });

  it("is the same DOM as before the key existed: an explicit off and the default are the same markup", async () => {
    const a = rig();
    const first = mount(a, LIVE_URL);
    await table();
    // The table can render before its associated option effects. Compare the
    // two flag states after the same queued fixture work has settled.
    await act(async () => { await settle(); });
    // React's generated ids (`:r1:`) count renders across the file; the markup is compared without them.
    const plain = (html: string) => html.replace(/:r[0-9a-z]+:/g, ":r:");
    const markupDefault = plain(first.container.innerHTML);
    cleanup();
    const b = rig();
    const second = mount(b, LIVE_URL, { streamFlag: false });
    await table();
    await act(async () => { await settle(); });
    await waitFor(() => expect(plain(second.container.innerHTML)).toBe(markupDefault));
  });
});

describe("flag on", () => {
  it("a single-environment dataset table opens the stream once the table is read and shows Live", async () => {
    const r = rig();
    mount(r, LIVE_URL, { streamFlag: true });
    await table();
    await waitFor(() => expect(chip()?.getAttribute("data-state")).toBe("live"));
    expect(chip()?.textContent).toContain("Live");
    expect(only(r, ALPHA_FLEET_SNAPSHOT_PATH)).toHaveLength(1);
    expect(only(r, ALPHA_FLEET_STREAM_PATH)).toHaveLength(1);
    // paired with the table on screen: the table was not read again
    expect(datasetPages(r)).toHaveLength(1);
    expect(chip()?.querySelector("button")).toBeNull();
  });

  it("the All lens spans environments: no table of the barrier's fleet read, so no stream", async () => {
    const r = rig();
    mount(r, "/execution/fleet", { streamFlag: true });
    await table();
    await act(async () => { await settle(); });
    expect(r.realtime).toEqual([]);
    expect(chip()).toBeNull();
  });

  it("a filter change reloads the table and does not restart the stream", async () => {
    const r = rig();
    mount(r, LIVE_URL, { streamFlag: true });
    await table();
    await waitFor(() => expect(chip()?.getAttribute("data-state")).toBe("live"));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search alpha" }), { target: { value: "alpha" } });
    await waitFor(() => expect(datasetPages(r).length).toBeGreaterThanOrEqual(2));
    await act(async () => { await settle(); });
    expect(only(r, ALPHA_FLEET_STREAM_PATH)).toHaveLength(1);
    expect(only(r, ALPHA_FLEET_SNAPSHOT_PATH)).toHaveLength(1);
    expect(chip()?.getAttribute("data-state")).toBe("live");
  });

  it("a notice about a newer head re-reads the table in place and keeps the rows on screen meanwhile", async () => {
    const r = rig();
    r.barrierFor = (index, current) => barrier(index === 1 ? NEWER : current, (body) => { body.environment = "live"; });
    mount(r, LIVE_URL, { streamFlag: true });
    await table();
    await waitFor(() => expect(r.streams).toHaveLength(1));
    const pagesBefore = datasetPages(r).length;
    const rowsBefore = within(await table()).getAllByRole("row").length;
    r.streams[0]!.push(wireCase("AFR-WIRE-REVALIDATE"));
    await waitFor(() => expect(datasetPages(r).length).toBe(pagesBefore + 1), { timeout: 4000 });
    await waitFor(() => expect(only(r, ALPHA_FLEET_SNAPSHOT_PATH)).toHaveLength(3));
    expect(within(await table()).getAllByRole("row")).toHaveLength(rowsBefore);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(chip()?.getAttribute("data-state")).toBe("live");
    // the connection was not reopened for a notice
    expect(only(r, ALPHA_FLEET_STREAM_PATH)).toHaveLength(1);
  });

  it("a notice about the same head causes no re-read of the table", async () => {
    const r = rig();
    mount(r, LIVE_URL, { streamFlag: true });
    await table();
    await waitFor(() => expect(r.streams).toHaveLength(1));
    const pagesBefore = datasetPages(r).length;
    r.streams[0]!.push(wireCase("AFR-WIRE-REVALIDATE"));
    await waitFor(() => expect(only(r, ALPHA_FLEET_SNAPSHOT_PATH)).toHaveLength(2), { timeout: 4000 });
    expect(datasetPages(r)).toHaveLength(pagesBefore);
  });

  it("an access end (access_revoked frame) stops the chip, offers no Start over, and has the table read again so it says what READ says", async () => {
    const r = rig();
    mount(r, LIVE_URL, { streamFlag: true });
    await table();
    await waitFor(() => expect(r.streams).toHaveLength(1));
    const pagesBefore = datasetPages(r).length;
    r.streams[0]!.push(wireCase("AFR-WIRE-REVOKED"));
    await waitFor(() => expect(chip()?.getAttribute("data-state")).toBe("stopped"));
    expect(screen.queryByRole("button", { name: "Start over" })).toBeNull();
    await waitFor(() => expect(datasetPages(r)).toHaveLength(pagesBefore + 1));
    // READ is a separate authority: the table answered, so it stays
    expect(await table()).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Why the stream is stopped" }));
    expect(screen.getByText("Your access to this scope changed.")).toBeTruthy();
    expect(screen.getByText("ACCESS_CHANGED")).toBeTruthy();
    expect(only(r, ALPHA_FLEET_STREAM_PATH)).toHaveLength(1);
  });

  it("FLEET-1 access ended while the table's notice read is out: that read is cancelled, the independent READ still runs, and its denial clears the table", async () => {
    const r = rig();
    r.barrierFor = (index, current) => barrier(index === 1 ? NEWER : current, (body) => { body.environment = "live"; });
    mount(r, LIVE_URL, { streamFlag: true });
    await table();
    await waitFor(() => expect(r.streams).toHaveLength(1));
    // hold the table's next read (the notice's re-read), and let the READ that follows it answer 403
    let open!: () => void;
    const gate = new Promise<void>((resolve) => { open = resolve; });
    let held = 0;
    r.state.before = async (call) => {
      if (call.query.get("limit") === "50" && (held += 1) === 1) await gate;
    };
    r.state.variantFor = () => (held >= 2 ? "status:403" : "ok");
    const pagesBefore = datasetPages(r).length;
    r.streams[0]!.push(wireCase("AFR-WIRE-REVALIDATE"));
    await waitFor(() => expect(datasetPages(r).length).toBe(pagesBefore + 1), { timeout: 4000 });
    const cancelled = r.requests.filter((request) => request.path.endsWith("/manager/fleet")).at(-1)!;
    r.streams[0]!.push(wireCase("AFR-WIRE-REVOKED"));
    await waitFor(() => expect(chip()?.getAttribute("data-state")).toBe("stopped"));
    expect(cancelled.signal?.aborted).toBe(true);
    // the real client settles a cancelled read at once; the independent READ then runs (one more page request) and is refused
    await waitFor(() => expect(datasetPages(r)).toHaveLength(pagesBefore + 2));
    await waitFor(() => expect(screen.queryByRole("table", { name: "Alpha fleet" })).toBeNull());
    open();
    await act(async () => { await settle(); });
    expect(datasetPages(r)).toHaveLength(pagesBefore + 2);
    expect(only(r, ALPHA_FLEET_STREAM_PATH)).toHaveLength(1);
  });

  it("a typed refusal of the stream stops it with its code behind the disclosure and Start over reads the barrier again", async () => {
    const r = rig();
    r.streamFor = (index, stream) => (index === 0 ? problem(404, "EXECUTION_READ_NOT_AVAILABLE") : stream.response);
    mount(r, LIVE_URL, { streamFlag: true });
    await table();
    await waitFor(() => expect(chip()?.getAttribute("data-state")).toBe("stopped"));
    expect(screen.queryByText("EXECUTION_READ_NOT_AVAILABLE")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Why the stream is stopped" }));
    expect(screen.getByText("The read did not complete.")).toBeTruthy();
    expect(screen.getByText("EXECUTION_READ_NOT_AVAILABLE")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    await waitFor(() => expect(chip()?.getAttribute("data-state")).toBe("live"));
    expect(only(r, ALPHA_FLEET_SNAPSHOT_PATH)).toHaveLength(2);
  });

  it.each([
    ["AFR-SNAPSHOT-PARTIAL-VIEWER", "WHOLE_FLEET_AUTHORITY_REQUIRED"],
    ["AFR-SNAPSHOT-STREAM-NOT-GRANTED", "STREAM_AUTHORITY_NOT_GRANTED"],
    ["AFR-SNAPSHOT-CAPACITY", "STREAM_CAPACITY_REACHED"],
  ])("%s: the table is untouched, no stream is opened, and the chip says there is none", async (id, code) => {
    const r = rig();
    const { snapshotCase } = await import("../../fleetStream/fleetStream.testbase");
    r.barrierFor = () => {
      const body = snapshotCase(id);
      body.environment = "live";
      return body;
    };
    mount(r, LIVE_URL, { streamFlag: true });
    await table();
    await waitFor(() => expect(chip()?.getAttribute("data-state")).toBe("stopped"));
    expect(only(r, ALPHA_FLEET_STREAM_PATH)).toHaveLength(0);
    expect(datasetPages(r)).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Why the stream is stopped" }));
    expect(screen.getByText("This read has no live stream behind it.")).toBeTruthy();
    expect(screen.getByText(code)).toBeTruthy();
  });

  it("unmounting closes the connection and releases the scope", async () => {
    const r = rig();
    const view = mount(r, LIVE_URL, { streamFlag: true });
    await table();
    await waitFor(() => expect(r.streams).toHaveLength(1));
    expect(fleetStreamSessionCount()).toBe(1);
    view.unmount();
    await act(async () => { await settle(); });
    expect(r.streams[0]!.cancelled()).toBe(true);
    expect(fleetStreamSessionCount()).toBe(0);
    const calls = r.realtime.length;
    await act(async () => { await settle(); });
    expect(r.realtime).toHaveLength(calls);
  });

  it("a hidden tab pauses the chip and closes the connection; coming back resumes it", async () => {
    const r = rig();
    mount(r, LIVE_URL, { streamFlag: true });
    await table();
    await waitFor(() => expect(chip()?.getAttribute("data-state")).toBe("live"));
    const visibility = vi.spyOn(document, "visibilityState", "get");
    visibility.mockReturnValue("hidden");
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    await waitFor(() => expect(chip()?.getAttribute("data-state")).toBe("paused"));
    expect(r.streams[0]!.cancelled()).toBe(true);
    expect(only(r, ALPHA_FLEET_STREAM_PATH)).toHaveLength(1);
    visibility.mockReturnValue("visible");
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    await waitFor(() => expect(chip()?.getAttribute("data-state")).toBe("live"));
    expect(only(r, ALPHA_FLEET_STREAM_PATH)).toHaveLength(2);
    visibility.mockRestore();
  });

  it("changing the lens to another environment closes the old scope's stream and opens the new one's", async () => {
    const r = rig();
    r.barrierFor = (_i, current) => barrier(current, (body) => { body.environment = "live"; });
    mount(r, LIVE_URL, { streamFlag: true });
    await table();
    await waitFor(() => expect(r.streams).toHaveLength(1));
    // the Sandbox lens is another environment: its barrier is another scope
    r.barrierFor = (_i, current) => barrier(current, (body) => { body.environment = "sandbox"; });
    fireEvent.click(screen.getByRole("tab", { name: /Sandbox/ }));
    await waitFor(() => expect(r.streams.length).toBeGreaterThanOrEqual(2));
    expect(r.streams[0]!.cancelled()).toBe(true);
    await waitFor(() => expect(fleetStreamSessionCount()).toBe(1));
  });
});

/** Cancellation review (flag key `fleet-stream`): every request the stream causes is cancelled with its owner, and a dark stream adds nothing. */
describe("cancellation and the dark stream", () => {
  const signalsTo = (r: Rig, path: string) => r.requests.filter((request) => request.path === path).map((request) => request.signal);

  it("flag off: the requests are exactly the screen's own; flag on with no stream offered adds ONE (the barrier) and no table read", async () => {
    const off = rig();
    mount(off, LIVE_URL, { streamFlag: false });
    await table();
    await settle();
    const own = off.requests.map((request) => request.path).sort();
    expect(own.some((path) => path.includes("/manager/fleet/realtime-snapshot") || path.includes("/manager/fleet/stream"))).toBe(false);
    cleanup();

    const { snapshotCase } = await import("../../fleetStream/fleetStream.testbase");
    const dark = rig();
    dark.barrierFor = () => {
      const body = snapshotCase("AFR-SNAPSHOT-STREAM-NOT-GRANTED");
      body.environment = "live";
      return body;
    };
    mount(dark, LIVE_URL, { streamFlag: true });
    await table();
    await waitFor(() => expect(chip()?.getAttribute("data-state")).toBe("stopped"));
    await act(async () => { await settle(); });
    expect(dark.requests.map((request) => request.path).filter((path) => path !== ALPHA_FLEET_SNAPSHOT_PATH).sort()).toEqual(own);
    expect(only(dark, ALPHA_FLEET_SNAPSHOT_PATH)).toHaveLength(1);
    expect(only(dark, ALPHA_FLEET_STREAM_PATH)).toHaveLength(0);
  });

  it("unmount cancels the open stream's signal and an in-flight table refresh, and nothing is requested afterwards", async () => {
    const r = rig();
    r.barrierFor = (index, current) => barrier(index === 1 ? NEWER : current, (body) => { body.environment = "live"; });
    mount(r, LIVE_URL, { streamFlag: true });
    await table();
    await waitFor(() => expect(r.streams).toHaveLength(1));
    // hold the table's next read
    let open!: () => void;
    const gate = new Promise<void>((resolve) => { open = resolve; });
    r.state.before = async (call) => {
      if (call.query.get("limit") === "50") await gate;
    };
    const pagesBefore = r.requests.filter((request) => request.path.endsWith("/manager/fleet")).length;
    r.streams[0]!.push(wireCase("AFR-WIRE-REVALIDATE"));
    await waitFor(() => expect(r.requests.filter((request) => request.path.endsWith("/manager/fleet")).length).toBe(pagesBefore + 1), { timeout: 4000 });
    const refresh = r.requests.filter((request) => request.path.endsWith("/manager/fleet")).at(-1)!;
    expect(refresh.signal?.aborted).toBe(false);
    cleanup();
    expect(refresh.signal?.aborted).toBe(true);
    expect(signalsTo(r, ALPHA_FLEET_STREAM_PATH)[0]?.aborted).toBe(true);
    expect(r.streams[0]!.cancelled()).toBe(true);
    open();
    const total = r.requests.length;
    await settle();
    expect(r.requests).toHaveLength(total);
    expect(fleetStreamSessionCount()).toBe(0);
  });

  it("leaving the scope (the All lens) while a barrier is out cancels it and opens no stream", async () => {
    const r = rig();
    let release!: (response: Response) => void;
    r.barrierFor = () => new Response(null);
    const original = globalThis.fetch;
    vi.stubGlobal("fetch", ((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/manager/fleet/realtime-snapshot")) {
        r.requests.push({ path: ALPHA_FLEET_SNAPSHOT_PATH, signal: init?.signal ?? null });
        return new Promise<Response>((resolve) => { release = resolve; });
      }
      return original(input, init);
    }) as typeof fetch);
    mount(r, LIVE_URL, { streamFlag: true });
    await table();
    await waitFor(() => expect(signalsTo(r, ALPHA_FLEET_SNAPSHOT_PATH)).toHaveLength(1));
    expect(signalsTo(r, ALPHA_FLEET_SNAPSHOT_PATH)[0]?.aborted).toBe(false);
    fireEvent.click(screen.getByRole("tab", { name: /^All/ }));
    await waitFor(() => expect(signalsTo(r, ALPHA_FLEET_SNAPSHOT_PATH)[0]?.aborted).toBe(true));
    release(jsonResponse(200, barrier(r.lineage() ?? "", (body) => { body.environment = "live"; })));
    await act(async () => { await settle(); });
    expect(only(r, ALPHA_FLEET_STREAM_PATH)).toHaveLength(0);
    expect(chip()).toBeNull();
    expect(fleetStreamSessionCount()).toBe(0);
  });

  it("changing the lens to another environment cancels the old stream's signal", async () => {
    const r = rig();
    mount(r, LIVE_URL, { streamFlag: true });
    await table();
    await waitFor(() => expect(r.streams).toHaveLength(1));
    r.barrierFor = (_i, current) => barrier(current, (body) => { body.environment = "sandbox"; });
    fireEvent.click(screen.getByRole("tab", { name: /Sandbox/ }));
    await waitFor(() => expect(signalsTo(r, ALPHA_FLEET_STREAM_PATH)[0]?.aborted).toBe(true));
    expect(r.streams[0]!.cancelled()).toBe(true);
  });
});
