/**
 * R-3: the version-aware Alpha reads on the real HTTP client and the fixture port (`getAlpha360ResourceVersioned`,
 * `getSubjectActivityVersioned`), against a fake `fetch`.
 *
 * Per method: the route and query it asks (a workspace only when one is named, so the legacy request is byte-identical), a v1 body
 * (read by the legacy reader), a v2 body (read by the strict reader), a foreign or later `schema_version` and a body of the other
 * generation under a label (an `ok` answer that is `unsupported`, never a throw, never the body), the typed refusals, and a body
 * that is not JSON. The legacy methods are unchanged. Lane: FIXTURE_LAB (canonical bodies through a stubbed `fetch`).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DeliveryPolicy } from "../profile";
import { unsupportedText } from "../v2/readers/dispatch";
import { loadCanonical } from "../v2/testkit/loadCanonical";
import type { Draft } from "../v2/testkit/matrix";
import { createFixtureApi } from "./fixtureApi";
import { createHttpApi } from "./httpApi";
import type { ExecutionApi } from "./ports";

const OPEN: DeliveryPolicy = {
  policyRevision: 4, queryEnabled: true, projectionIngestionEnabled: true, sseEnabled: true, governanceWriteEnabled: true, paperCommandsEnabled: true,
  sandboxCommandsEnabled: true, liveProtectiveCommandsEnabled: true, liveRiskIncreasingCommandsEnabled: true,
};
afterEach(() => vi.unstubAllGlobals());

const scopedResource = loadCanonical<{ cases: Draft[] }>("execution-resource-scoped.synthetic.valid.json").cases.find((c) => c.schema_version === "execution.alpha-resource.v2" && c.state === "partial" && Object.keys(c.data).length > 2)!;
const legacyResource = loadCanonical<{ cases: { name: string; value: Draft }[] }>("execution-alpha-resource.v1.synthetic.valid.json").cases[0]!.value;
const scopedPage = loadCanonical<{ cases: { type: string; value: Draft }[] }>("execution-scoped-records.synthetic.valid.json").cases.find((c) => c.type === "ScopedSubjectRecordsResponse")!.value;
const legacyPage = loadCanonical<{ cases: { name: string; value: Draft }[] }>("execution-subject-records.v1.synthetic.valid.json").cases[0]!.value;

function serve(answer: (url: string) => { status: number; body: unknown; text?: string }): string[] {
  const urls: string[] = [];
  vi.stubGlobal("fetch", async (input: string | URL) => {
    const url = String(input);
    urls.push(url);
    const out = answer(url);
    return new Response(out.text ?? JSON.stringify(out.body), { status: out.status, headers: { "content-type": "application/json" } });
  });
  return urls;
}
const http = (): ExecutionApi => createHttpApi({ policy: OPEN, readScope: {} });
const QUERY = { environment: "live", subjectKind: "alpha", subjectId: "alpha_TEST_ONLY", relation: "orders", limit: 200 } as const;

describe("getAlpha360ResourceVersioned (http)", () => {
  it("asks the same route, with a workspace only when one is named", async () => {
    const urls = serve(() => ({ status: 200, body: legacyResource }));
    await http().getAlpha360ResourceVersioned("alpha_TEST_ONLY");
    await http().getAlpha360ResourceVersioned("alpha_TEST_ONLY", { workspaceId: "ws one" });
    await http().getAlpha360Resource("alpha_TEST_ONLY");
    expect(urls).toEqual([
      "/api/v1/execution/resources/alphas/alpha_TEST_ONLY",
      "/api/v1/execution/resources/alphas/alpha_TEST_ONLY?workspace_id=ws%20one",
      "/api/v1/execution/resources/alphas/alpha_TEST_ONLY",
    ]);
  });

  it("reads a legacy body as v1 and a scoped body as v2, by schema_version", async () => {
    serve((url) => ({ status: 200, body: url.includes("workspace_id") ? scopedResource : legacyResource }));
    const legacy = await http().getAlpha360ResourceVersioned("alpha_TEST_ONLY");
    expect(legacy).toMatchObject({ ok: true, value: { kind: "v1", value: { schemaVersion: "execution.alpha-resource.v1" } } });
    const scoped = await http().getAlpha360ResourceVersioned("alpha_TEST_ONLY", { workspaceId: "ws_TEST_ONLY" });
    expect(scoped).toMatchObject({ ok: true, value: { kind: "v2", schemaVersion: "execution.alpha-resource.v2", value: { shape: "full", authority: { totalsScope: "VISIBLE_ROWS_ONLY" } } } });
  });

  it("a later version, a v2 body under the v1 label and a v1 body under the v2 label are unsupported answers that name what they are", async () => {
    const cases: [string, unknown, RegExp][] = [
      ["later", { ...scopedResource, schema_version: "execution.alpha-resource.v3" }, /schema_version "execution.alpha-resource.v3", which this build does not read/],
      ["v2 as v1", { ...scopedResource, schema_version: "execution.alpha-resource.v1" }, /could not be read/],
      ["v1 as v2", { ...legacyResource, schema_version: "execution.alpha-resource.v2" }, /does not match that contract/],
      ["extra key", { ...scopedResource, surplus: 1 }, /does not match that contract/],
      ["not an object", [1, 2], /not a document this screen can read/],
    ];
    for (const [name, body, message] of cases) {
      serve(() => ({ status: 200, body }));
      const answer = await http().getAlpha360ResourceVersioned("alpha_TEST_ONLY");
      expect(answer.ok, name).toBe(true);
      if (!answer.ok) continue;
      expect(answer.value.kind, name).toBe("unsupported");
      if (answer.value.kind === "unsupported") expect(unsupportedText(answer.value), name).toMatch(message);
      expect(JSON.stringify(answer), name).not.toContain("TEST_ONLY-policy");
    }
  });

  it("a typed refusal stays a refusal, and a body that is not JSON is unsupported, not a throw", async () => {
    for (const [status, expected] of [[403, "denied"], [404, "unavailable"], [503, "unavailable"]] as const) {
      serve(() => ({ status, body: { error: { code: "X", message: "refused" } } }));
      const answer = await http().getAlpha360ResourceVersioned("alpha_TEST_ONLY");
      expect(answer.ok, String(status)).toBe(false);
      if (!answer.ok) expect(answer.status, String(status)).toMatch(new RegExp(expected === "denied" ? "denied" : "unavailable|empty|stale"));
    }
    serve(() => ({ status: 200, body: null, text: "<html>" }));
    expect(await http().getAlpha360ResourceVersioned("alpha_TEST_ONLY")).toMatchObject({ ok: true, value: { kind: "unsupported", reason: "NOT_AN_OBJECT" } });
  });
});

describe("getSubjectActivityVersioned (http)", () => {
  it("asks the same route; the workspace is appended last and only when named; the cursor is passed back whole", async () => {
    const urls = serve(() => ({ status: 200, body: legacyPage }));
    await http().getSubjectActivityVersioned(QUERY);
    await http().getSubjectActivityVersioned({ ...QUERY, workspaceId: "ws_TEST_ONLY", after: "kc1.a.b-c_d" });
    await http().getSubjectActivity(QUERY);
    expect(urls).toEqual([
      "/api/v1/execution/resources/alphas/alpha_TEST_ONLY/orders?environment=live&limit=200",
      "/api/v1/execution/resources/alphas/alpha_TEST_ONLY/orders?environment=live&limit=200&after=kc1.a.b-c_d&workspace_id=ws_TEST_ONLY",
      "/api/v1/execution/resources/alphas/alpha_TEST_ONLY/orders?environment=live&limit=200",
    ]);
  });

  it("reads a legacy page as v1 and a scoped page as v2; the other generation under a label is not read", async () => {
    serve((url) => ({ status: 200, body: url.includes("workspace_id") ? scopedPage : legacyPage }));
    expect(await http().getSubjectActivityVersioned(QUERY)).toMatchObject({ ok: true, value: { kind: "v1" } });
    expect(await http().getSubjectActivityVersioned({ ...QUERY, workspaceId: "ws" })).toMatchObject({ ok: true, value: { kind: "v2", value: { reasonCode: "SCOPED_RETAINED_WINDOW_NOT_TOTAL_HISTORY" } } });
    serve(() => ({ status: 200, body: { ...scopedPage, schema_version: "portal.execution.subject-records.v1" } }));
    expect(await http().getSubjectActivityVersioned(QUERY)).toMatchObject({ ok: true, value: { kind: "unsupported" } });
    serve(() => ({ status: 200, body: { ...legacyPage, schema_version: "portal.execution.subject-records.v2" } }));
    expect(await http().getSubjectActivityVersioned(QUERY)).toMatchObject({ ok: true, value: { kind: "unsupported", reason: "V2_MALFORMED" } });
  });
});

describe("the fixture port", () => {
  it("answers the legacy resource as a v1 read, and says the subject BFF is not part of the fixture set", async () => {
    const api = createFixtureApi();
    const resource = await api.getAlpha360ResourceVersioned("alpha_a");
    if (resource.ok) expect(resource.value.kind).toBe("v1");
    else expect(resource.status).toBeDefined();
    const records = await api.getSubjectActivityVersioned(QUERY);
    expect(records.ok).toBe(false);
  });
});
