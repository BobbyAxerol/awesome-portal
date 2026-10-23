/**
 * Sidebar count badges (WP-D): a badge exists only for a count the owning read published, drawn only for an entry the rail lists,
 * read once per cadence and never invented.
 */
import { act, cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NO_NAV_BADGES, type NavBadges } from "../../../app/selfNavView";
import type { PortalRegistryDocument } from "../../../portal/contracts";
import type { ExecutionApi } from "../../api/ports";
import NavCounts, { APPROVALS_BADGE_LABEL, APPROVALS_FEATURE, OPERATIONS_BADGE_LABEL, OPERATIONS_FEATURE, listedBadgeFeatures, readApprovalsBadge, readOperationsBadge } from "./navCounts";
import { V2_ROLE_PRESETS } from "./roleNav";

vi.mock("../../../auth/session", () => ({
  useSession: () => ({ principal: { principalId: "p_1", username: "u", role: "VIEWER", sessionId: "sess_1" }, access: { kind: "unavailable", requestId: null } }),
}));

afterEach(cleanup);

const registry: PortalRegistryDocument = JSON.parse(readFileSync(join(process.cwd(), "../registry/fixtures/registry.public.json"), "utf8"));
const MANAGER = { capabilities: [...V2_ROLE_PRESETS.manager] };
const ok = <T,>(value: T) => ({ ok: true as const, value });
const fail = () => ({ ok: false as const, status: "unavailable" as const, reason: "no" });

const queue = (openException: unknown) => ok({ kind: "queue", queue: { page: { health: openException === undefined ? undefined : { openException } } } });
const inbox = (counts: unknown) => ok({ page: { rows: [] }, counts });

describe("readOperationsBadge (queue health open_exception_count, FE-CAT-2)", () => {
  const api = (answer: unknown) => ({ listOperationalQueueV2: vi.fn(async () => answer) }) as unknown as ExecutionApi & { listOperationalQueueV2: ReturnType<typeof vi.fn> };

  it("draws the published count, with the read named in its label", async () => {
    expect(await readOperationsBadge(api(queue({ count: 3, observedAt: {}, coverage: "COMPLETE" })), undefined)).toEqual({ count: 3, tone: "bad", label: `3 ${OPERATIONS_BADGE_LABEL}` });
  });

  it("a PARTIAL count is a floor and says so", async () => {
    expect((await readOperationsBadge(api(queue({ count: 3, observedAt: {}, coverage: "PARTIAL" })), undefined))?.label).toBe(`3 or more ${OPERATIONS_BADGE_LABEL}`);
  });

  it("a counted zero draws nothing; null (source did not report), no health, a refusal and an unsupported shape draw nothing", async () => {
    expect(await readOperationsBadge(api(queue({ count: 0, observedAt: {}, coverage: "COMPLETE" })), undefined)).toBeNull();
    expect(await readOperationsBadge(api(queue({ count: null, observedAt: null, coverage: "UNKNOWN" })), undefined)).toBeNull();
    expect(await readOperationsBadge(api(queue(undefined)), undefined)).toBeNull();
    expect(await readOperationsBadge(api(fail()), undefined)).toBeNull();
    expect(await readOperationsBadge(api(ok({ kind: "unsupported" })), undefined)).toBeNull();
  });

  it("a thrown read draws nothing and raises nothing", async () => {
    const thrower = { listOperationalQueueV2: async () => { throw new Error("x"); } } as unknown as ExecutionApi;
    expect(await readOperationsBadge(thrower, undefined)).toBeNull();
  });

  it("asks for one row only, and forwards the workspace when the address names one", async () => {
    const a = api(queue({ count: 1, observedAt: {}, coverage: "COMPLETE" }));
    await readOperationsBadge(a, "ws_1");
    await readOperationsBadge(a, undefined);
    expect(a.listOperationalQueueV2.mock.calls).toEqual([[{ limit: 1, workspaceId: "ws_1" }], [{ limit: 1 }]]);
  });
});

describe("readApprovalsBadge (approvals read counts.pending)", () => {
  const api = (answer: unknown) => ({ listApprovals: vi.fn(async () => answer) }) as unknown as ExecutionApi & { listApprovals: ReturnType<typeof vi.fn> };

  it("draws the pending count the read published", async () => {
    expect(await readApprovalsBadge(api(inbox({ pending: 4, overdue: null, dueSoon: null })), undefined)).toEqual({ count: 4, tone: "warn", label: `4 ${APPROVALS_BADGE_LABEL}` });
  });

  it("no counts published, zero pending, a refusal: no badge", async () => {
    expect(await readApprovalsBadge(api(inbox(null)), undefined)).toBeNull();
    expect(await readApprovalsBadge(api(inbox({ pending: 0, overdue: 0, dueSoon: 0 })), undefined)).toBeNull();
    expect(await readApprovalsBadge(api(fail()), undefined)).toBeNull();
  });

  it("asks for one row of the all view and forwards the workspace", async () => {
    const a = api(inbox({ pending: 1, overdue: null, dueSoon: null }));
    await readApprovalsBadge(a, "ws_9");
    expect(a.listApprovals.mock.calls).toEqual([[{ filter: "ALL", limit: 1, workspaceId: "ws_9" }]]);
  });
});

describe("listedBadgeFeatures: only entries the rail lists are read", () => {
  it("a manager lists both; a researcher only Approvals; nobody with no capability", () => {
    expect(listedBadgeFeatures(registry, MANAGER)).toEqual({ operations: true, approvals: true });
    expect(listedBadgeFeatures(registry, { capabilities: [...V2_ROLE_PRESETS.researcher] })).toEqual({ operations: false, approvals: true });
    expect(listedBadgeFeatures(registry, { capabilities: [] })).toEqual({ operations: false, approvals: false });
  });
});

describe("NavCounts component", () => {
  function mount(api: ExecutionApi, options = MANAGER, url = "/execution", onView: (b: NavBadges) => void = () => undefined) {
    return render(
      <MemoryRouter initialEntries={[url]}>
        <NavCounts registry={registry} options={options} onView={onView} api={api} enabled />
      </MemoryRouter>,
    );
  }
  const both = () =>
    ({
      listOperationalQueueV2: vi.fn(async () => queue({ count: 2, observedAt: {}, coverage: "COMPLETE" })),
      listApprovals: vi.fn(async () => inbox({ pending: 5, overdue: null, dueSoon: null })),
    }) as unknown as ExecutionApi & Record<"listOperationalQueueV2" | "listApprovals", ReturnType<typeof vi.fn>>;

  it("hands the shell one badge per published count, keyed by feature id", async () => {
    const seen: NavBadges[] = [];
    mount(both(), MANAGER, "/execution", (b) => seen.push(b));
    await act(async () => { await Promise.resolve(); });
    const last = seen[seen.length - 1];
    expect(last[OPERATIONS_FEATURE]).toMatchObject({ count: 2, tone: "bad" });
    expect(last[APPROVALS_FEATURE]).toMatchObject({ count: 5, tone: "warn" });
  });

  it("reads once on mount (one read per badge), not once per render", async () => {
    const api = both();
    const view = mount(api);
    await act(async () => { await Promise.resolve(); });
    expect(api.listOperationalQueueV2).toHaveBeenCalledTimes(1);
    expect(api.listApprovals).toHaveBeenCalledTimes(1);
    view.rerender(
      <MemoryRouter initialEntries={["/execution"]}>
        <NavCounts registry={registry} options={MANAGER} onView={() => undefined} api={api} enabled />
      </MemoryRouter>,
    );
    await act(async () => { await Promise.resolve(); });
    expect(api.listOperationalQueueV2).toHaveBeenCalledTimes(1);
  });

  it("a researcher's rail lists no Operations: that read is never made", async () => {
    const api = both();
    mount(api, { capabilities: [...V2_ROLE_PRESETS.researcher] });
    await act(async () => { await Promise.resolve(); });
    expect(api.listOperationalQueueV2).not.toHaveBeenCalled();
    expect(api.listApprovals).toHaveBeenCalledTimes(1);
  });

  it("with nothing listed it reads nothing and says there are no badges", async () => {
    const api = both();
    const seen: NavBadges[] = [];
    mount(api, { capabilities: [] }, "/execution", (b) => seen.push(b));
    await act(async () => { await Promise.resolve(); });
    expect(api.listOperationalQueueV2).not.toHaveBeenCalled();
    expect(api.listApprovals).not.toHaveBeenCalled();
    expect(seen[seen.length - 1]).toBe(NO_NAV_BADGES);
  });

  it("the address's workspace goes to both reads", async () => {
    const api = both();
    mount(api, MANAGER, "/execution/operations?workspace_id=ws_7");
    await act(async () => { await Promise.resolve(); });
    expect(api.listOperationalQueueV2).toHaveBeenCalledWith({ limit: 1, workspaceId: "ws_7" });
    expect(api.listApprovals).toHaveBeenCalledWith({ filter: "ALL", limit: 1, workspaceId: "ws_7" });
  });

  it("an unpublished count leaves that entry without a badge while the other stays", async () => {
    const api = both();
    api.listApprovals.mockResolvedValue(inbox(null));
    const seen: NavBadges[] = [];
    mount(api, MANAGER, "/execution", (b) => seen.push(b));
    await act(async () => { await Promise.resolve(); });
    const last = seen[seen.length - 1];
    expect(Object.keys(last)).toEqual([OPERATIONS_FEATURE]);
  });

  it("unmounting clears the badges, so none outlives the shell", async () => {
    const seen: NavBadges[] = [];
    const view = mount(both(), MANAGER, "/execution", (b) => seen.push(b));
    await act(async () => { await Promise.resolve(); });
    view.unmount();
    expect(seen[seen.length - 1]).toBe(NO_NAV_BADGES);
  });
});
