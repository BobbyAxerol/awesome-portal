/**
 * The Overview's "Since your last visit" over Codex's visit digest (`portal.execution.visit-digest.v1`): the strict reader, the port
 * pass-through of the digest and the explicit Mark as seen. Lane BFF_DOUBLE for the rest of the page; the digest port is a stub that
 * serves bodies judged by the real reader.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetOverviewDouble, setOverviewDoubleVariants } from "../../../../../e2e/bffDoubleOverview";
import { httpApi, serveDoubles } from "../../../../../e2e/screensV2Harness";
import type { ExecutionApi } from "../../../api/ports";
import { visitDigestAnswers, visitDigestQuery, readVisitDigest, type VisitDigestMarkResult, type VisitDigestRead } from "../../readers/visitDigest";
import { newSeriesDouble, wrapFetch } from "../series/seriesDouble.testbase";
import { sessionOf } from "../alpha/testApi";
import { withDataset } from "../portfolios/datasetFixtures.testbase";
import OverviewScreen from "./index";

const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../../../auth/session", () => ({ useSession: () => session.current }));

const REV = "a".repeat(64);
const REV2 = "b".repeat(64);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;

function item(id: string, over: Body = {}): Body {
  return { id, kind: "APPROVAL", label: `Approval ${id}`, value: "Waiting", href: "/execution/operations", as_of: "2026-10-23T09:00:00Z", change: "NEW_OBSERVATION", seen: false, ...over };
}
function body(over: Body = {}): Body {
  return {
    schema_version: "portal.execution.visit-digest.v1", state: "READY", workspace_id: "ws_1", may_mark_seen: true, mark_seen_reason: null, reason_code: null,
    snapshot_revision: REV, observed_at: "2026-10-23T10:00:00Z", coverage: "BOUNDED_OBSERVATIONS",
    baseline: { version: 3, seen_at: "2026-10-22T08:00:00Z", snapshot_revision: REV2 },
    items: [item("i1"), item("i2", { kind: "INCIDENT", change: "CHANGED" })], unseen_count: 2,
    mark_seen: { snapshot_revision: REV, expected_baseline_version: 3 }, ...over,
  };
}
const FIRST = () => body({ state: "NO_BASELINE", baseline: null, reason_code: "NO_COMPARISON_BASELINE", items: [], unseen_count: 0, mark_seen: { snapshot_revision: REV, expected_baseline_version: 0 } });
const EMPTY = () => body({ state: "EMPTY", items: [], unseen_count: 0 });
const read = (b: Body): VisitDigestRead => {
  const r = readVisitDigest(b);
  if (r === null) throw new Error("fixture body refused by the reader");
  return r;
};

beforeEach(() => {
  session.current = { ...sessionOf(["governance.r1.read"]), principal: null };
  resetOverviewDouble();
  setOverviewDoubleVariants({ fleet: "multi-currency" });
  serveDoubles();
  vi.stubGlobal("fetch", wrapFetch(globalThis.fetch, newSeriesDouble("unavailable")));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("visit digest reader", () => {
  it("reads a populated body and keeps the mark_seen body as sent by the server", () => {
    const r = read(body());
    expect(r.kind === "digest" && r.digest.items.length).toBe(2);
    expect(r.kind === "digest" && r.digest.markSeen).toEqual({ snapshot_revision: REV, expected_baseline_version: 3 });
  });
  it("reads a first visit and an empty digest as their own states", () => {
    expect(read(FIRST())).toMatchObject({ digest: { state: "NO_BASELINE", baseline: null } });
    expect(read(EMPTY())).toMatchObject({ digest: { state: "EMPTY", unseenCount: 0 } });
  });
  it("refuses a body that breaks a stated rule, never repairing it", () => {
    expect(readVisitDigest(body({ coverage: "COMPLETE_HISTORY" }))).toBeNull();
    expect(readVisitDigest(body({ may_mark_seen: false, mark_seen_reason: null }))).toBeNull();
    expect(readVisitDigest(body({ may_mark_seen: true, mark_seen_reason: "READ_ONLY_PROFILE" }))).toBeNull();
    expect(readVisitDigest(body({ unseen_count: 5 }))).toBeNull();
    expect(readVisitDigest(body({ items: [item("i1"), item("i1")], unseen_count: 2 }))).toBeNull();
    expect(readVisitDigest(body({ items: [item("i1", { href: "https://evil.example/x" })], unseen_count: 1 }))).toBeNull();
    expect(readVisitDigest(body({ items: [item("i1", { seen: true })], unseen_count: 1 }))).toBeNull();
    expect(readVisitDigest(body({ mark_seen: { snapshot_revision: REV2, expected_baseline_version: 3 } }))).toBeNull();
    expect(readVisitDigest(body({ extra: 1 }))).toBeNull();
  });
  it("types an unknown item kind as UNKNOWN and another schema as unsupported_shape", () => {
    const r = read(body({ items: [item("i1", { kind: "FUTURE_KIND" })], unseen_count: 1 }));
    expect(r.kind === "digest" && r.digest.items[0]!.kind).toBe("UNKNOWN");
    expect(readVisitDigest({ schema_version: "portal.execution.visit-digest.v9" })).toEqual({ kind: "unsupported_shape", schemaVersion: "portal.execution.visit-digest.v9" });
  });
  it("answers only the workspace that was asked", () => {
    const r = read(body());
    if (r.kind !== "digest") throw new Error("shape");
    expect(visitDigestAnswers(r.digest, "ws_1")).toBe(true);
    expect(visitDigestAnswers(r.digest, "ws_2")).toBe(false);
    expect(visitDigestQuery("ws 1&x")).toBe("?workspace_id=ws%201%26x");
  });
});

interface Stub { api: ExecutionApi; gets: ReturnType<typeof vi.fn>; marks: ReturnType<typeof vi.fn> }
function stub(gets: Array<() => Body | "fail">, mark?: () => VisitDigestMarkResult): Stub {
  let n = 0;
  const get = vi.fn(async () => {
    const next = gets[Math.min(n, gets.length - 1)]!;
    n += 1;
    const b = next();
    return b === "fail" ? { ok: false as const, status: "unavailable" as const, reason: "The Portal could not read the digest." } : { ok: true as const, value: read(b) };
  });
  const marks = vi.fn(async () => (mark ? mark() : ({ kind: "unavailable", reason: "n/a" } as VisitDigestMarkResult)));
  const api = { ...withDataset(httpApi(), null), getVisitDigest: get, markVisitDigestSeen: marks } as unknown as ExecutionApi;
  return { api, gets: get, marks };
}
const mount = (api: ExecutionApi) =>
  render(<MemoryRouter initialEntries={["/execution?env=paper&window=30D&workspace=ws_1"]}><OverviewScreen api={api} sseFactory={null} workspaceId="ws_1" /></MemoryRouter>);
const digest = async () => screen.findByTestId("visit-digest");

describe("Overview visit digest", () => {
  it("draws a populated digest with label, value, as-of, the server href with context, and the coverage sentence once", async () => {
    const s = stub([() => body()]);
    mount(s.api);
    const root = await digest();
    expect(root.querySelectorAll(".exec-ov-vd-item").length).toBe(2);
    expect(root.textContent).toContain("Approval i1");
    expect(root.textContent).toContain("Waiting");
    const link = [...root.querySelectorAll("a")].find((a) => a.textContent === "Approval i1")!;
    expect(link.getAttribute("href")).toContain("/execution/operations");
    expect(link.getAttribute("href")).toContain("env=paper");
    expect(screen.getAllByTestId("digest-coverage").length).toBe(1);
    expect(document.body.textContent!.match(/not an event history/g)!.length).toBe(1);
    expect(s.marks).not.toHaveBeenCalled(); // reading never writes
  });

  it("a first visit is a first visit, not an empty history, and the button starts the comparison", async () => {
    mount(stub([() => FIRST()]).api);
    await digest();
    expect(screen.getByTestId("digest-first-visit").textContent).toMatch(/First visit/);
    expect(screen.queryByTestId("digest-empty")).toBeNull();
    expect(screen.getByRole("button", { name: "Start comparing from now" })).toBeTruthy();
  });

  it("after an acknowledgement an empty digest says nothing changed, not that nothing happened", async () => {
    mount(stub([() => EMPTY()]).api);
    await digest();
    const text = screen.getByTestId("digest-empty").textContent!;
    expect(text).toMatch(/^Nothing changed in these lists/);
    expect(text).not.toMatch(/history/i);
  });

  it("marks seen only when the user presses, with the server's own body, once even on a double press", async () => {
    const s = stub([() => body(), () => EMPTY()], () => ({ kind: "ok", digest: (read(EMPTY()) as Extract<VisitDigestRead, { kind: "digest" }>).digest }));
    mount(s.api);
    await digest();
    expect(s.marks).not.toHaveBeenCalled();
    const button = screen.getByRole("button", { name: "Mark as seen" });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByTestId("digest-empty")).toBeTruthy());
    expect(s.marks).toHaveBeenCalledTimes(1);
    expect(s.marks).toHaveBeenCalledWith("ws_1", { snapshot_revision: REV, expected_baseline_version: 3 });
    expect(screen.getByTestId("digest-notice").textContent).toBe("Marked as seen.");
  });

  it("a read-only profile cannot mark: the button is off with its reason, and a press sends nothing", async () => {
    const s = stub([() => body({ may_mark_seen: false, mark_seen_reason: "READ_ONLY_PROFILE" })]);
    mount(s.api);
    await digest();
    const button = screen.getByRole("button", { name: "Mark as seen" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-describedby")).toBe(screen.getByTestId("digest-read-only").id);
    fireEvent.click(button);
    expect(s.marks).not.toHaveBeenCalled();
  });

  it("a 409 reads the digest again, tells the user, and lets them act again", async () => {
    const calls: VisitDigestMarkResult[] = [{ kind: "conflict", code: "VISIT_DIGEST_BASELINE_CHANGED" }, { kind: "ok", digest: (read(EMPTY()) as Extract<VisitDigestRead, { kind: "digest" }>).digest }];
    let m = 0;
    const s = stub([() => body(), () => body({ baseline: { version: 4, seen_at: "2026-10-23T09:30:00Z", snapshot_revision: REV2 }, mark_seen: { snapshot_revision: REV, expected_baseline_version: 4 } })], () => calls[m++]!);
    mount(s.api);
    await digest();
    fireEvent.click(screen.getByRole("button", { name: "Mark as seen" }));
    await waitFor(() => expect(screen.getByTestId("digest-notice").textContent).toMatch(/Another tab/));
    expect(s.gets).toHaveBeenCalledTimes(2);
    const again = screen.getByRole("button", { name: "Mark as seen" }) as HTMLButtonElement;
    expect(again.disabled).toBe(false);
    fireEvent.click(again);
    await waitFor(() => expect(s.marks).toHaveBeenCalledTimes(2));
    expect(s.marks).toHaveBeenLastCalledWith("ws_1", { snapshot_revision: REV, expected_baseline_version: 4 });
  });

  it("a 503 on the acknowledgement keeps the prior baseline on screen with the sentence", async () => {
    const s = stub([() => body()], () => ({ kind: "unavailable", reason: "The Portal could not store the acknowledgement. Nothing changed." }));
    mount(s.api);
    await digest();
    fireEvent.click(screen.getByRole("button", { name: "Mark as seen" }));
    await waitFor(() => expect(screen.getByTestId("digest-notice").textContent).toMatch(/Nothing changed/));
    expect(screen.getAllByText(/Approval i1/).length).toBeGreaterThan(0);
    expect((screen.getByRole("button", { name: "Mark as seen" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("reads once on open (no polling) and again on Refresh; a failed reload keeps the last good digest", async () => {
    const s = stub([() => body(), () => "fail"]);
    mount(s.api);
    await digest();
    await new Promise((r) => setTimeout(r, 50));
    expect(s.gets).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(screen.getByTestId("digest-stale")).toBeTruthy());
    expect(s.gets).toHaveBeenCalledTimes(2);
    expect(screen.getAllByText(/Approval i1/).length).toBeGreaterThan(0);
  });

  it("a digest that cannot be read keeps the typed-absence frame and invents nothing", async () => {
    mount(stub([() => "fail"]).api);
    await waitFor(() => expect(document.querySelector("[data-digest-absence='NO_COMPARISON_BASELINE']")).not.toBeNull());
    expect(screen.queryByTestId("visit-digest")).toBeNull();
  });

  it("a reload re-asks the server: the new mount shows what the server now says", async () => {
    const first = stub([() => body()]);
    const view = mount(first.api);
    await digest();
    view.unmount();
    mount(stub([() => EMPTY()]).api);
    await waitFor(() => expect(screen.getByTestId("digest-empty")).toBeTruthy());
  });
});
