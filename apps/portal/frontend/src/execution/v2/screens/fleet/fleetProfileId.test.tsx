/**
 * G3 consumer: the Fleet dataset AND its publication probe carry the same workspace and profile (lane BFF_DOUBLE: the port is hand-controlled so
 * the ORDER of answers is the test; every body is a PUBLISHED canonical `execution-manager-profile-selection` response, judged by the real reader
 * and the real answers-this-question guard). Two Paper profiles are two scopes: never unioned, never inferred from environment or venue.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ExecutionApi, Result } from "../../../api/ports";
import { datasetQueryMismatch, encodeManagerDatasetQuery, type ManagerDatasetQuery } from "../../../api/managerDatasetQuery";
import { readManagerDataset, type ManagerDataset } from "../../readers/managerDataset";
import { loadCanonical } from "../../testkit/loadCanonical";
import { datasetKey, datasetQuery, datasetScopeOf, type DatasetFilters } from "./fleetDatasetModel";
import { useDatasetPublication, useFleetDataset } from "./useFleetDataset";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Draft = any;
interface Case { query: { environment: "paper"; workspace_id: string; profile_id: string }; response: Draft }
const CASES = loadCanonical<{ cases: Case[] }>("execution-manager-profile-selection.synthetic.valid.json").cases;
const [CASE_A, CASE_B] = [CASES[0]!, CASES[1]!];
const WS = CASE_A.query.workspace_id;
const A = CASE_A.query.profile_id;
const B = CASE_B.query.profile_id;

interface Pending { query: ManagerDatasetQuery; signal: AbortSignal | null; release(): void; deny(): void }

/** Answers wait for the test. A release answers with the canonical body of the PROFILE ASKED, judged by the real guard. */
function controlled(answerWith?: (query: ManagerDatasetQuery) => Case) {
  const pending: Pending[] = [];
  const port = (signal: AbortSignal | null): Record<string, unknown> => ({
    getManagerDataset: (query: ManagerDatasetQuery) =>
      new Promise<Result<ManagerDataset>>((resolve) => {
        pending.push({
          query, signal,
          deny: () => resolve({ ok: false, status: "denied", reason: "HTTP 403" }),
          release: () => {
            const chosen = answerWith ? answerWith(query) : query.profileId === B ? CASE_B : CASE_A;
            // The canonical body states its own page size; the probe asks `limit 1`, so the body's page echoes the ask (only the page size is adjusted).
            const body = structuredClone(chosen.response);
            if (query.limit !== undefined && body.page.returned_count <= query.limit) body.page.limit = query.limit;
            const read = readManagerDataset(body);
            if (read === null || read.kind !== "dataset") return resolve({ ok: false, status: "unavailable", reason: "refused" });
            const mismatch = datasetQueryMismatch(read.dataset, query);
            resolve(mismatch === null ? { ok: true, value: read.dataset } : { ok: false, status: "unavailable", reason: `answers another question (${mismatch})` });
          },
        });
      }),
    withReadSignal: (next: AbortSignal) => port(next),
  });
  return { api: port(null) as unknown as ExecutionApi, pending };
}

const filters = (extra: Partial<DatasetFilters> = {}): DatasetFilters => ({
  scope: { environment: "paper", stageFilter: [] }, q: null, owner: null, healths: [], sort: null, group: null, ...extra,
});

describe("Fleet model: profile identity", () => {
  it("datasetQuery carries the exact profile and workspace, and omits both when none is given", () => {
    expect(datasetQuery(filters({ workspaceId: WS, profileId: A }), null)).toMatchObject({ workspaceId: WS, profileId: A, environment: "paper" });
    const plain = datasetQuery(filters(), null);
    expect(plain).not.toHaveProperty("profileId");
    expect(plain).not.toHaveProperty("workspaceId");
  });

  it("datasetKey separates Paper profile A from B, from the default, and from another workspace; the key never carries the cursor", () => {
    const keys = [filters(), filters({ profileId: A }), filters({ profileId: B }), filters({ workspaceId: WS, profileId: A })].map((f) => datasetKey(f, null));
    expect(new Set(keys).size).toBe(4);
    expect(datasetKey(filters({ profileId: A }), null)).toBe(JSON.stringify(datasetQuery(filters({ profileId: A }), null)));
    // a cursor is a property of one query: the same profile with a cursor keeps the profile, and the key (without cursor) is unchanged
    expect(datasetQuery(filters({ profileId: A }), null, "cursor-1")).toMatchObject({ profileId: A, after: "cursor-1" });
  });

  it("the profile is never inferred from the environment or the lens: none given means none sent", () => {
    for (const lens of [datasetScopeOf(["paper"], false), datasetScopeOf(["sandbox"], false), datasetScopeOf(["canary", "live"], false)]) {
      expect(datasetQuery(filters({ scope: lens! }), null)).not.toHaveProperty("profileId");
    }
  });

  it("the All lens with a profile is a request the encoder refuses (no profile union); the screen then keeps the fleet read", () => {
    const all = datasetScopeOf([], false)!;
    expect(all.environment).toBe("ALL");
    expect(encodeManagerDatasetQuery(datasetQuery(filters({ scope: all, profileId: A }), null))).toBeNull();
    expect(encodeManagerDatasetQuery(datasetQuery(filters({ scope: all }), null))).not.toBeNull();
  });
});

describe("useDatasetPublication: the probe carries the same workspace and profile", () => {
  it("asks with the workspace and profile it was given, and publishes only that profile's dataset", async () => {
    const { api, pending } = controlled();
    const { result } = renderHook(() => useDatasetPublication(api, "paper", WS, A));
    await waitFor(() => expect(pending).toHaveLength(1));
    expect(pending[0]!.query).toMatchObject({ surface: "FLEET", environment: "paper", limit: 1, workspaceId: WS, profileId: A });
    act(() => pending[0]!.release());
    await waitFor(() => expect(result.current.phase).toBe("published"));
    expect(result.current.phase === "published" && result.current.dataset.profileId).toBe(A);
  });

  it("with no workspace or profile the probe sends neither (the server's pinned default)", async () => {
    const { api, pending } = controlled();
    renderHook(() => useDatasetPublication(api, "paper"));
    await waitFor(() => expect(pending).toHaveLength(1));
    expect(pending[0]!.query).not.toHaveProperty("profileId");
    expect(pending[0]!.query).not.toHaveProperty("workspaceId");
  });

  it("Paper A pending while B is selected: a new probe is asked for B, A's late answer is never published, and B is", async () => {
    const { api, pending } = controlled();
    const { result, rerender } = renderHook(({ profile }: { profile: string }) => useDatasetPublication(api, "paper", WS, profile), { initialProps: { profile: A } });
    await waitFor(() => expect(pending).toHaveLength(1));
    rerender({ profile: B });
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(pending[1]!.query.profileId).toBe(B);
    act(() => pending[1]!.release());
    await waitFor(() => expect(result.current.phase).toBe("published"));
    act(() => pending[0]!.release());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.phase === "published" && result.current.dataset.profileId).toBe(B);
  });

  it("a port that answers another profile or workspace than asked is not a publication (the hook does not trust it)", async () => {
    // a port with no guard of its own: it hands back profile A's body for a profile B question
    const lax = {
      getManagerDataset: async (): Promise<Result<ManagerDataset>> => {
        const read = readManagerDataset(CASE_A.response);
        if (read === null || read.kind !== "dataset") throw new Error("canonical body refused");
        return { ok: true, value: read.dataset };
      },
    } as unknown as ExecutionApi;
    const wrongProfile = renderHook(() => useDatasetPublication(lax, "paper", WS, B));
    await waitFor(() => expect(wrongProfile.result.current.phase).toBe("unpublished"));
    const wrongWorkspace = renderHook(() => useDatasetPublication(lax, "paper", "TEST_ONLY:other-workspace", A));
    await waitFor(() => expect(wrongWorkspace.result.current.phase).toBe("unpublished"));
    const right = renderHook(() => useDatasetPublication(lax, "paper", WS, A));
    await waitFor(() => expect(right.result.current.phase).toBe("published"));
  });

  it("ALL with a profile is a request the encoder refuses, so the probe can never publish a profile union", async () => {
    const encoded = encodeManagerDatasetQuery({ surface: "FLEET", environment: "ALL", limit: 1, profileId: A });
    expect(encoded).toBeNull();
  });
});

describe("useFleetDataset: Paper A to B and revoke", () => {
  const query = (profileId: string) => (after?: string | null): ManagerDatasetQuery =>
    ({ surface: "FLEET", environment: "paper", workspaceId: WS, profileId, limit: 100, ...(after ? { after } : {}) });

  it("A's first page still pending when B is selected: A is aborted, its late answer changes nothing, B's rows and profile are shown", async () => {
    const { api, pending } = controlled();
    const { result, rerender } = renderHook(({ profile }: { profile: string }) => useFleetDataset(api, true, datasetKey(filters({ workspaceId: WS, profileId: profile }), null), query(profile)), {
      initialProps: { profile: A },
    });
    await waitFor(() => expect(pending).toHaveLength(1));
    rerender({ profile: B });
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(pending[0]!.signal?.aborted).toBe(true);
    expect(pending[1]!.query.profileId).toBe(B);
    act(() => pending[1]!.release());
    await waitFor(() => expect(result.current.state.phase).toBe("ready"));
    expect(result.current.first?.profileId).toBe(B);
    act(() => pending[0]!.release());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.first?.profileId).toBe(B);
    expect(result.current.last?.profileId).toBe(B);
  });

  it("a page whose body names another profile than the question is refused by the guard, so a profile A page can never join B's rows", async () => {
    const { api, pending } = controlled(() => CASE_A);
    const { result } = renderHook(() => useFleetDataset(api, true, "k", query(B)));
    await waitFor(() => expect(pending).toHaveLength(1));
    act(() => pending[0]!.release());
    await waitFor(() => expect(result.current.state.phase).toBe("error"));
    expect(result.current.rows).toHaveLength(0);
    expect(result.current.state.phase === "error" && result.current.state.reason).toContain("profile");
  });

  it("a denied read (access revoked) drops the rows and the head for that profile", async () => {
    const { api, pending } = controlled();
    const { result } = renderHook(() => useFleetDataset(api, true, "k", query(A)));
    await waitFor(() => expect(pending).toHaveLength(1));
    act(() => pending[0]!.release());
    await waitFor(() => expect(result.current.state.phase).toBe("ready"));
    let refreshed: Promise<ManagerDataset | null> | undefined;
    act(() => { refreshed = result.current.refresh(); });
    await waitFor(() => expect(pending).toHaveLength(2));
    await act(async () => {
      pending[1]!.deny();
      expect(await refreshed).toBeNull();
    });
    await waitFor(() => expect(result.current.state.phase).toBe("error"));
    expect(result.current.state.phase === "error" && result.current.state.status).toBe("denied");
    expect(result.current.first).toBeNull();
    expect(result.current.rows).toHaveLength(0);
  });
});
