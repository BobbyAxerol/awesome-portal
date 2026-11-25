/**
 * G3 consumer compatibility: the Core response now carries an optional, opaque `profile_id` even when the query omitted it. Both Manager
 * ports are exercised through the real HTTP client (lane BFF_DOUBLE: `fetch` is stubbed and answers from the PUBLISHED canonical fixtures
 * `execution-manager-profile-selection`, `execution-manager-series-query` and the pre-G3 dataset/series fixtures; this is parser and
 * request-identity proof, not a live Core and not a source acceptance).
 *
 * Every negative is a mutation of a published fixture. The canonical series RESPONSE fixtures predate `profile_id`, so the "new" series body
 * is the canonical populated body plus the `profile_id` value of the canonical `series-query` fixture (disclosed: there is no published
 * series response that carries it yet).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DeliveryPolicy } from "../profile";
import { loadCanonical } from "../v2/testkit/loadCanonical";
import { readManagerDataset } from "../v2/readers/managerDataset";
import { encodeManagerSeriesQuery, readManagerSeries, type ManagerSeriesQuery } from "../v2/readers/managerSeries";
import { createHttpApi } from "./httpApi";
import { datasetQueryMismatch, encodeManagerDatasetQuery, type ManagerDatasetQuery } from "./managerDatasetQuery";

const OPEN: DeliveryPolicy = {
  policyRevision: 4, queryEnabled: true, projectionIngestionEnabled: true, sseEnabled: true, governanceWriteEnabled: true, paperCommandsEnabled: true,
  sandboxCommandsEnabled: true, liveProtectiveCommandsEnabled: true, liveRiskIncreasingCommandsEnabled: true,
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Draft = any;

afterEach(() => vi.unstubAllGlobals());

const api = () => createHttpApi({ policy: OPEN, readScope: {} });
function serve(body: unknown): string[] {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    calls.push(url);
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  });
  return calls;
}
const wireOf = (url: string) => Object.fromEntries(new URL(url, "http://portal.test").searchParams);
const reasonOf = (result: { ok: boolean } & Record<string, unknown>) => (result.ok ? "ok" : String(result.reason));

/* ───────────── dataset ───────────── */

interface SelectionCase { query: { environment: "paper"; workspace_id: string; profile_id: string }; response: Draft }
const selection = (): SelectionCase[] => loadCanonical<{ cases: SelectionCase[] }>("execution-manager-profile-selection.synthetic.valid.json").cases;
const oldDataset = (): Draft => loadCanonical<{ value: Draft }>("execution-manager-dataset.synthetic").value;
const allDataset = (): Draft => loadCanonical<{ value: Draft }>("execution-manager-dataset.all-environments.synthetic").value;
const asked = (c: SelectionCase): ManagerDatasetQuery => ({ surface: "FLEET", environment: c.query.environment, workspaceId: c.query.workspace_id, profileId: c.query.profile_id });

describe("dataset: optional profile_id", () => {
  it("an old body without profile_id still reads and exposes no profile", () => {
    const read = readManagerDataset(oldDataset());
    if (read === null || read.kind !== "dataset") throw new Error("old body refused");
    expect(read.dataset.profileId).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(oldDataset(), "profile_id")).toBe(false);
  });

  it("each published selection body reads and exposes its opaque profile id unchanged", () => {
    for (const c of selection()) {
      const read = readManagerDataset(c.response);
      if (read === null || read.kind !== "dataset") throw new Error(`refused ${c.query.profile_id}`);
      expect(read.dataset.profileId).toBe(c.query.profile_id);
    }
    expect(new Set(selection().map((c) => c.query.profile_id)).size).toBe(2);
  });

  it("the encoder sends exactly the published query (environment, workspace_id, profile_id) and the matching body is accepted", async () => {
    for (const c of selection()) {
      const calls = serve(c.response);
      const result = await api().getManagerDataset(asked(c));
      if (!result.ok) throw new Error(result.reason);
      expect(wireOf(calls[0]!)).toEqual(c.query);
      expect(result.value.profileId).toBe(c.query.profile_id);
      vi.unstubAllGlobals();
    }
  });

  it("an omitted profile stays valid: with or without profile_id on the body, nothing profile-shaped is sent", async () => {
    const [first] = selection();
    for (const body of [oldDataset(), first!.response]) {
      const calls = serve(body);
      const result = await api().getManagerDataset({ surface: "FLEET", environment: "paper", workspaceId: body.workspace_id });
      expect(result.ok).toBe(true);
      expect(wireOf(calls[0]!)).not.toHaveProperty("profile_id");
      vi.unstubAllGlobals();
    }
  });

  it("a wrong PROFILE is refused: profile B asked, profile A answered", async () => {
    const [a, b] = selection();
    serve(a!.response);
    const result = await api().getManagerDataset(asked(b!));
    expect(result.ok).toBe(false);
    expect(reasonOf(result)).toContain("ANSWERS_ANOTHER_QUERY profile");
  });

  it("a profile asked of a body that names none is refused (an old server ignores the parameter and answers its default)", async () => {
    const [a] = selection();
    serve(oldDataset());
    const result = await api().getManagerDataset({ ...asked(a!), workspaceId: oldDataset().workspace_id });
    expect(result.ok).toBe(false);
    expect(reasonOf(result)).toContain("profile");
  });

  it("a wrong WORKSPACE is refused even when the profile matches", async () => {
    const [a] = selection();
    serve(a!.response);
    const result = await api().getManagerDataset({ ...asked(a!), workspaceId: "TEST_ONLY:other-workspace" });
    expect(result.ok).toBe(false);
    expect(reasonOf(result)).toContain("ANSWERS_ANOTHER_QUERY workspace");
  });

  it("the profile mismatch is a pure verdict too (datasetQueryMismatch)", () => {
    const [a, b] = selection();
    const read = readManagerDataset(a!.response);
    if (read === null || read.kind !== "dataset") throw new Error("refused");
    expect(datasetQueryMismatch(read.dataset, asked(a!))).toBeNull();
    expect(datasetQueryMismatch(read.dataset, asked(b!))).toBe("profile");
  });

  it("ALL with a profile is never sent", async () => {
    const calls = serve(allDataset());
    const result = await api().getManagerDataset({ surface: "FLEET", environment: "ALL", profileId: "TEST_ONLY:paper-default" });
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
    expect(encodeManagerDatasetQuery({ surface: "FLEET", environment: "ALL", profileId: "TEST_ONLY:paper-default" })).toBeNull();
    // and ALL without a profile is still a valid request (the three environment defaults)
    expect(encodeManagerDatasetQuery({ surface: "FLEET", environment: "ALL" })).not.toBeNull();
  });

  it("an ALL body that carries profile_id is refused by the reader (ALL is never a profile)", () => {
    expect(readManagerDataset(allDataset())).not.toBeNull();
    const body = allDataset();
    body.profile_id = "TEST_ONLY:paper-default";
    expect(readManagerDataset(body)).toBeNull();
  });

  it("a concrete-environment body is never accepted as the answer to an ALL ask, profile or not", async () => {
    const [a] = selection();
    serve(a!.response);
    const result = await api().getManagerDataset({ surface: "FLEET", environment: "ALL", workspaceId: a!.query.workspace_id });
    expect(result.ok).toBe(false);
    expect(reasonOf(result)).toContain("ANSWERS_ANOTHER_QUERY environment");
  });

  it("profile_id is bounded opaque text, and the closed root still refuses an unknown key", () => {
    for (const bad of ["", 7, null, "bad\u0000id", "x".repeat(300)]) {
      const body = selection()[0]!.response;
      body.profile_id = bad;
      expect(readManagerDataset(body)).toBeNull();
    }
    const body = selection()[0]!.response;
    body.profile_ref = "TEST_ONLY:not-a-key";
    expect(readManagerDataset(body)).toBeNull();
  });

  it("two profiles are two request identities, and a profile is not added to the cursor", () => {
    const [a, b] = selection();
    const wire = (q: ManagerDatasetQuery) => JSON.stringify(encodeManagerDatasetQuery(q)!.wire);
    expect(wire(asked(a!))).not.toBe(wire(asked(b!)));
    expect(encodeManagerDatasetQuery({ ...asked(a!), after: "cursor-1" })!.wire).toMatchObject({ profile_id: a!.query.profile_id, after: "cursor-1" });
  });
});

/* ───────────── series ───────────── */

interface SeriesQueryCase { environment: "paper"; profile_id?: string; metric: "NAV"; window: "30D"; subjects: { subject_type: "FUND" }[] }
const seriesCases = (): SeriesQueryCase[] => loadCanonical<{ cases: SeriesQueryCase[] }>("execution-manager-series-query.synthetic.valid.json").cases;
const oldSeries = (): Draft => loadCanonical<{ value: Draft }>("execution-manager-series.populated.synthetic").value;
const withProfile = (profileId: string): Draft => ({ ...oldSeries(), profile_id: profileId });
const SERIES_ASK: ManagerSeriesQuery = {
  environment: "paper", metric: "NAV", window: "30D",
  subjects: [{ subjectType: "PORTFOLIO", subjectId: "TEST_ONLY:portfolio-a" }, { subjectType: "PORTFOLIO", subjectId: "TEST_ONLY:portfolio-b" }],
};

describe("series: optional profile_id", () => {
  const [pa, pb] = seriesCases();
  const A = pa!.profile_id!;
  const B = pb!.profile_id!;

  it("the canonical queries carry two distinct Paper profiles, and the encoder writes the published parameter", () => {
    expect(A).not.toBe(B);
    const wire = encodeManagerSeriesQuery({ environment: "paper", metric: "NAV", window: "30D", subjects: [{ subjectType: "FUND" }], profileId: A });
    expect(wire).toMatchObject({ environment: "paper", metric: "NAV", profile_id: A, window: JSON.stringify(pa!.window), subjects: JSON.stringify(pa!.subjects) });
    // omitted (third canonical case): no key at all
    expect(encodeManagerSeriesQuery({ environment: "paper", metric: "NAV", window: "30D", subjects: [{ subjectType: "FUND" }] })).not.toHaveProperty("profile_id");
  });

  it("an old body without profile_id still reads; profile_id is never a required key", () => {
    const read = readManagerSeries(oldSeries());
    if (read === null || read.kind !== "series") throw new Error("old body refused");
    expect(read.series.profileId).toBeUndefined();
  });

  it("a new body exposes the opaque profile id, and an omitted ask accepts it", async () => {
    const read = readManagerSeries(withProfile(A));
    if (read === null || read.kind !== "series") throw new Error("new body refused");
    expect(read.series.profileId).toBe(A);
    const calls = serve(withProfile(A));
    const result = await api().getManagerSeries(SERIES_ASK);
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.profileId).toBe(A);
    expect(wireOf(calls[0]!)).not.toHaveProperty("profile_id");
  });

  it("an explicit profile is sent and answered by that profile", async () => {
    const calls = serve(withProfile(B));
    const result = await api().getManagerSeries({ ...SERIES_ASK, profileId: B });
    if (!result.ok) throw new Error(result.reason);
    expect(wireOf(calls[0]!).profile_id).toBe(B);
    expect(result.value.profileId).toBe(B);
  });

  it("a wrong profile, or a profile asked of a body that names none, is refused", async () => {
    serve(withProfile(A));
    expect((await api().getManagerSeries({ ...SERIES_ASK, profileId: B })).ok).toBe(false);
    vi.unstubAllGlobals();
    serve(oldSeries());
    expect((await api().getManagerSeries({ ...SERIES_ASK, profileId: B })).ok).toBe(false);
  });

  it("a wrong workspace is refused even when the profile matches", async () => {
    serve(withProfile(A));
    const result = await api().getManagerSeries({ ...SERIES_ASK, profileId: A, workspaceId: "TEST_ONLY:other-workspace" });
    expect(result.ok).toBe(false);
  });

  it("profile_id is bounded opaque text and the closed root still refuses an unknown key", () => {
    for (const bad of ["", 7, null, "bad\u0000id"]) expect(readManagerSeries({ ...oldSeries(), profile_id: bad })).toBeNull();
    expect(readManagerSeries({ ...withProfile(A), profile_ref: "x" })).toBeNull();
  });

  it("an unreadable profile id is never sent", () => {
    expect(encodeManagerSeriesQuery({ ...SERIES_ASK, profileId: "" })).toBeNull();
  });
});
