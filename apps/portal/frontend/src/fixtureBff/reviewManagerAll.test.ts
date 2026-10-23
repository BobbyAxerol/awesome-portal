// @vitest-environment node
/** FE-CAT-3 on the explicit SYNTHETIC review lane (FIXTURE_LAB): `environment=ALL`, judged by the schema AND the unmodified production HTTP port. */
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { answerReviewManager, type ReviewManagerProfile } from "../../../fixture-bff/review-manager";
import { setFixtureNow, setFixtureScale } from "../../e2e/bffScale";
import { createHttpApi } from "../execution/api/httpApi";
import type { DeliveryPolicy } from "../execution/profile";
import { disposeSchemaCheck, violationsOf } from "./schemaCheck";

const OPEN: DeliveryPolicy = { policyRevision: 4, queryEnabled: true, projectionIngestionEnabled: false, sseEnabled: false,
  governanceWriteEnabled: false, paperCommandsEnabled: false, sandboxCommandsEnabled: false,
  liveProtectiveCommandsEnabled: false, liveRiskIncreasingCommandsEnabled: false };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;
const prepare = (profile: ReviewManagerProfile): void => { setFixtureScale(profile === "layout-stress" ? "large" : "medium"); setFixtureNow("2026-10-22T12:00:00Z"); };
const ask = (extra: Record<string, string> = {}, profile: ReviewManagerProfile = "populated") => {
  prepare(profile);
  return answerReviewManager("GET", "/manager/fleet", new URLSearchParams({ environment: "ALL", ...extra }), profile) as { status: number; body: Body };
};
afterEach(() => vi.unstubAllGlobals());
afterAll(() => disposeSchemaCheck());

describe("the populated profile serves ALL", () => {
  it("is the published ALL shape: schema-valid, labelled rows of each environment, a typed absence, a degraded environment, no total", () => {
    const { status, body } = ask();
    expect(status).toBe(200);
    expect(violationsOf({ file: "execution-manager-dataset.v1", ptr: "" }, body).violations).toEqual([]);
    expect(body.environment).toBe("ALL");
    expect(body.environment_coverage.map((c: Body) => [c.environment, c.availability, c.reason_code])).toEqual([
      ["paper", "INCLUDED", null], ["sandbox", "UNAVAILABLE", "NOT_CONFIGURED"], ["live", "INCLUDED", null]]);
    expect(body.environment_coverage[0].quality).toMatchObject({ completeness: "PARTIAL", freshness: "STALE" });
    expect(body.quality.completeness).toBe("PARTIAL");
    const environments = new Set(body.items.map((row: Body) => row.environment));
    expect([...environments].sort()).toEqual(["live", "paper"]);
    const domainOf = { paper: "PAPER", live: "ACTUAL" } as Record<string, string>;
    for (const row of body.items) expect(row.economic_partitions.every((p: Body) => p.partition.economic_domain === domainOf[row.environment])).toBe(true);
    expect(body.page.authorized_filtered_count).toBe(body.environment_coverage.reduce((n: number, c: Body) => n + (c.authorized_filtered_count ?? 0), 0));
  });

  it("a stage that exists in one environment leaves the other a counted zero, not an absence", () => {
    const { body } = ask({ stage_filter: "LIVE" });
    const paper = body.environment_coverage.find((c: Body) => c.environment === "paper");
    expect(paper).toMatchObject({ availability: "INCLUDED", authorized_filtered_count: 0, returned_count: 0 });
    expect(body.items.every((row: Body) => row.environment === "live")).toBe(true);
  });

  it("pages with one cursor over one snapshot; group by lists each environment's partitions side by side", () => {
    const first = ask({ limit: "2", group_by: "health" });
    expect(first.body.page.next_cursor).toBeTruthy();
    const second = ask({ limit: "2", group_by: "health", after: first.body.page.next_cursor });
    expect(second.status).toBe(200);
    expect(second.body.snapshot_id).toBe(first.body.snapshot_id);
    const stale = ask({ limit: "2", group_by: "owner_user_id", after: first.body.page.next_cursor });
    expect(stale.status).toBe(409);
    for (const group of first.body.groups) {
      const identities = group.economic_partitions.map((p: Body) => JSON.stringify([p.partition.economic_domain, p.partition.currency, p.partition.basis, p.partition.native_profile_ref]));
      expect(new Set(identities).size).toBe(identities.length);
    }
  });

  it("the layout-stress profile and a window do not offer ALL (400), so the Portal keeps the fleet read", () => {
    expect(ask({}, "layout-stress").status).toBe(400);
    expect(ask({ window: JSON.stringify("30D") }).status).toBe(400);
  });

  it("is read by the unmodified production port as an ALL dataset", async () => {
    prepare("populated");
    vi.stubGlobal("fetch", async (input: string) => {
      const url = new URL(String(input), "http://fixture.test");
      const response = answerReviewManager("GET", url.pathname, url.searchParams, "populated");
      return new Response(JSON.stringify(response?.body ?? {}), { status: response?.status ?? 501, headers: { "content-type": "application/json" } });
    });
    const result = await createHttpApi({ policy: OPEN, readScope: {} }).getManagerDataset({ surface: "FLEET", environment: "ALL", limit: 50 });
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.environment).toBe("ALL");
    expect(result.value.environmentCoverage).toHaveLength(3);
    expect(result.value.items.every((row) => row.environment !== undefined)).toBe(true);
  });
});
