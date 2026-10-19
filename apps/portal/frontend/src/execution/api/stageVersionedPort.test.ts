/**
 * W0b: the version-aware stage reads on the real HTTP client and the fixture
 * port (`getSandboxCertificationVersioned`, `getCanaryVersioned`,
 * `getLiveFullVersioned`), against a fake `fetch`.
 *
 * The same route answers a V1 or a V2 body (SCOPED_V2, consumer review
 * 2026-10-18 F8-01), so each method is checked for: the route and query it
 * asks, a V1 body (read by the V1 reader), a V2 body (read by the strict V2
 * reader), an unknown or foreign `schema_version` (an `ok` answer that is
 * `unsupported`, never a throw, never the body), the typed refusals
 * (403/404/503), a body that is not JSON, ~1 MiB bodies, and an aborted read.
 * L3: the testkit's negative generators run through the port; the port must
 * answer exactly what the dispatcher answers for the same wire text.
 *
 * Lane: FIXTURE (canonical bodies from packages/contracts/fixtures + the V1
 * lab fixtures through a stubbed `fetch`); not a real API.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { readCanaryControlRoom, readSandboxCertification } from "../certification";
import { CANARY_ROOM_FIXTURE, LIVE_FULL_FIXTURE, SANDBOX_CERTIFICATION_FIXTURE } from "../certification.fixtures";
import { readLiveFullOperations } from "../liveFull";
import type { DeliveryPolicy } from "../profile";
import { readCanaryByVersion, readLiveFullByVersion, readSandboxByVersion, type VersionRead } from "../v2/readers/dispatch";
import { readCanaryParentV2, readSandboxParentV2 } from "../v2/readers/governanceParents";
import { readLiveSourceOperationsV2 } from "../v2/readers/liveSourceOperations";
import { loadCanonical } from "../v2/testkit/loadCanonical";
import { getPath, type Draft } from "../v2/testkit/matrix";
import {
  leaked, pollutionCases, prototypeIsClean, requiredCases, rootCases, schemaVersionCases, type NegativeCase,
} from "../v2/testkit/negative";
import { cloneRows, MIB, serializedBytes } from "../v2/testkit/scale";
import { createFixtureApi } from "./fixtureApi";
import { createHttpApi } from "./httpApi";
import type { ExecutionApi, Result } from "./ports";

const OPEN: DeliveryPolicy = {
  policyRevision: 4,
  queryEnabled: true,
  projectionIngestionEnabled: true,
  sseEnabled: true,
  governanceWriteEnabled: true,
  paperCommandsEnabled: true,
  sandboxCommandsEnabled: true,
  liveProtectiveCommandsEnabled: true,
  liveRiskIncreasingCommandsEnabled: true,
};

afterEach(() => vi.unstubAllGlobals());

const clone = <T,>(value: T): T => structuredClone(value);
const parent = loadCanonical<Draft>("execution-positive-parent.synthetic");
const liveSource = loadCanonical<Draft>("execution-live-source.synthetic");

/** The text a body travels as; an in-memory-only value (function, undefined) is no JSON at all. */
function wire(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, item: unknown) => (typeof item === "bigint" ? `${item}n` : item)) ?? "";
  } catch {
    return "";
  }
}

/** What the port's reader sees for `text`: the parsed JSON, or `null` when it is not JSON. */
function parsed(text: string): unknown {
  try { return JSON.parse(text); } catch { return null; }
}

function serve(body: unknown, status = 200): string[] {
  const urls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    urls.push(url);
    return new Response(typeof body === "string" ? body : wire(body), { status, headers: { "content-type": "application/json" } });
  });
  return urls;
}

const api = (signal?: AbortSignal): ExecutionApi => createHttpApi({ policy: OPEN, readScope: {}, signal });

type AnyRead = VersionRead<unknown, unknown>;
interface Route {
  id: string;
  path: string;
  call: (port: ExecutionApi, id: string, options?: { workspaceId?: string; panel?: string; cursor?: string }) => Promise<Result<AnyRead>>;
  dispatch: (raw: unknown) => AnyRead;
  v1Body: Draft;
  v1Direct: (raw: unknown) => unknown;
  v2Body: Draft;
  v2Direct: (raw: unknown) => unknown;
  v2Schema: string;
  /** A V2 body of ANOTHER route: this route knows the schema or not, but must never read it. */
  foreign: Draft;
}
const ROUTES: Route[] = [
  {
    id: "sandbox", path: "certification",
    call: (port, id, o) => port.getSandboxCertificationVersioned(id, o) as Promise<Result<AnyRead>>,
    dispatch: readSandboxByVersion as (raw: unknown) => AnyRead,
    v1Body: loadCanonical<Draft>("execution-sandbox-certification.unavailable"), v1Direct: readSandboxCertification,
    v2Body: parent.sandbox, v2Direct: readSandboxParentV2, v2Schema: parent.sandbox.schema_version,
    foreign: parent.canary,
  },
  {
    id: "canary", path: "canary",
    call: (port, id, o) => port.getCanaryVersioned(id, o) as Promise<Result<AnyRead>>,
    dispatch: readCanaryByVersion as (raw: unknown) => AnyRead,
    v1Body: loadCanonical<Draft>("execution-canary-control-room.unavailable"), v1Direct: readCanaryControlRoom,
    v2Body: parent.canary, v2Direct: readCanaryParentV2, v2Schema: parent.canary.schema_version,
    foreign: liveSource.populated,
  },
  {
    id: "live", path: "live",
    call: (port, id, o) => port.getLiveFullVersioned(id, o) as Promise<Result<AnyRead>>,
    dispatch: readLiveFullByVersion as (raw: unknown) => AnyRead,
    v1Body: loadCanonical<Draft>("execution-live-full-operations.unavailable"), v1Direct: readLiveFullOperations,
    v2Body: liveSource.populated, v2Direct: readLiveSourceOperationsV2, v2Schema: liveSource.populated.schema_version,
    foreign: parent.sandbox,
  },
];

const DEPLOYMENT = "dep_TEST_ONLY_stage";

describe.each(ROUTES)("$id · http port", (route) => {
  it("asks the V1 route, encoded, with no query by default", async () => {
    const urls = serve(route.v1Body);
    await route.call(api(), "dep/with space");
    expect(urls).toEqual([`/api/v1/execution/deployments/dep%2Fwith%20space/${route.path}`]);
  });

  it("forwards workspace_id", async () => {
    const urls = serve(route.v1Body);
    await route.call(api(), DEPLOYMENT, { workspaceId: "ws 1" });
    expect(urls).toEqual([`/api/v1/execution/deployments/${DEPLOYMENT}/${route.path}?workspace_id=ws+1`]);
  });

  it("a V1 body is a v1 read, the value the V1 reader answers directly", async () => {
    serve(route.v1Body);
    const result = await route.call(api(), DEPLOYMENT);
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.kind).toBe("v1");
    if (result.value.kind === "v1") {
      expect(result.value.value).toEqual(route.v1Direct(route.v1Body));
      expect(result.value.schemaVersion).toBe(typeof route.v1Body.schema_version === "string" ? route.v1Body.schema_version : null);
    }
  });

  it("a V2 body is a v2 read, the value the strict V2 reader answers directly, never V1-shaped", async () => {
    serve(route.v2Body);
    const result = await route.call(api(), DEPLOYMENT);
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.kind).toBe("v2");
    expect(result.value.schemaVersion).toBe(route.v2Schema);
    if (result.value.kind === "v2") expect(result.value.value).toEqual(route.v2Direct(route.v2Body));
  });

  it("the V1 method of the same route still refuses that V2 body (V1 screens behave as before)", async () => {
    serve(route.v2Body);
    const v1 = route.id === "sandbox" ? await api().getSandboxCertification(DEPLOYMENT)
      : route.id === "canary" ? await api().getCanaryControlRoom(DEPLOYMENT)
        : await api().getLiveFullOperations(DEPLOYMENT);
    expect(v1.ok).toBe(false);
  });

  it("an unknown schema_version is an ok `unsupported` answer that names the version and not the body", async () => {
    const probe = "BODY_PROBE_MUST_NOT_SURFACE";
    serve({ schema_version: "portal.execution.something-else.v9", secret: probe, data: { secret: probe } });
    const result = await route.call(api(), DEPLOYMENT);
    expect(result).toEqual({ ok: true, value: { kind: "unsupported", schemaVersion: "portal.execution.something-else.v9", reason: "UNKNOWN_SCHEMA_VERSION" } });
    expect(leaked(result, probe)).toBe(false);
  });

  it("another route's V2 body is never read here", async () => {
    serve(route.foreign);
    const result = await route.call(api(), DEPLOYMENT);
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.kind).toBe("unsupported");
  });

  it("a V2 body with a missing key is unsupported (V2_MALFORMED), not a partial read", async () => {
    const body = clone(route.v2Body);
    delete body.environment;
    delete body.workspace_id;
    serve(body);
    const result = await route.call(api(), DEPLOYMENT);
    if (!result.ok) throw new Error(result.reason);
    expect(result.value).toMatchObject({ kind: "unsupported", reason: "V2_MALFORMED", schemaVersion: route.v2Schema });
  });

  it.each([[403, "denied"], [401, "denied"], [404, "unavailable"], [409, "unavailable"], [503, "unavailable"], [500, "unavailable"]] as const)(
    "HTTP %i is a typed %s failure that keeps the server's code",
    async (status, panel) => {
      serve({ error: { code: "STAGE_TEST_CODE", message: "refused for the test" } }, status);
      const result = await route.call(api(), DEPLOYMENT);
      expect(result).toMatchObject({ ok: false, status: panel });
      if (!result.ok) expect(result.reason).toContain("STAGE_TEST_CODE");
    },
  );

  it("a failure whose body is not JSON still has a status", async () => {
    serve("<html>gateway</html>", 503);
    const result = await route.call(api(), DEPLOYMENT);
    expect(result).toMatchObject({ ok: false, status: "unavailable" });
  });

  it.each([["not json at all", "{not json"], ["an empty body", ""], ["a truncated body", wire(ROUTES[0].v2Body).slice(0, 40)]])(
    "%s is an ok `unsupported` NOT_AN_OBJECT, not a throw",
    async (_name, text) => {
      serve(text);
      const result = await route.call(api(), DEPLOYMENT);
      expect(result).toEqual({ ok: true, value: { kind: "unsupported", schemaVersion: null, reason: "NOT_AN_OBJECT" } });
    },
  );

  it.each([["null", "null"], ["an array", "[]"], ["a string", '"x"'], ["a number", "7"]])("a JSON %s is NOT_AN_OBJECT", async (_name, text) => {
    serve(text);
    const result = await route.call(api(), DEPLOYMENT);
    expect(result).toEqual({ ok: true, value: { kind: "unsupported", schemaVersion: null, reason: "NOT_AN_OBJECT" } });
  });

  it("a network failure is unavailable, not a throw", async () => {
    vi.stubGlobal("fetch", async () => { throw new TypeError("offline"); });
    const result = await route.call(api(), DEPLOYMENT);
    expect(result).toMatchObject({ ok: false, status: "unavailable" });
  });

  it("an already aborted signal makes no request and answers unavailable", async () => {
    const urls = serve(route.v1Body);
    const controller = new AbortController();
    controller.abort();
    const result = await route.call(api(controller.signal), DEPLOYMENT);
    expect(result).toMatchObject({ ok: false, status: "unavailable" });
    expect(urls).toEqual([]);
  });

  it("an abort while the response is pending answers unavailable and does not hang", async () => {
    vi.stubGlobal("fetch", () => new Promise<Response>(() => { /* never answers */ }));
    const controller = new AbortController();
    const pending = route.call(api(controller.signal), DEPLOYMENT);
    controller.abort();
    expect(await pending).toMatchObject({ ok: false, status: "unavailable" });
  });

  it("withReadSignal scopes the same dispatch to the child signal", async () => {
    serve(route.v2Body);
    const controller = new AbortController();
    const scoped = api().withReadSignal!(controller.signal);
    controller.abort();
    expect(await route.call(scoped, DEPLOYMENT)).toMatchObject({ ok: false, status: "unavailable" });
  });

  it("an unknown-version body of ~1 MiB is refused as unsupported without being read, inside a budget", async () => {
    const body = { schema_version: "portal.execution.something-else.v9", filler: "x".repeat(MIB) };
    serve(body);
    const { value, ms } = await (async () => {
      const start = performance.now();
      const answer = await route.call(api(), DEPLOYMENT);
      return { value: answer, ms: performance.now() - start };
    })();
    expect(serializedBytes(body)).toBeGreaterThan(MIB);
    expect(value).toEqual({ ok: true, value: { kind: "unsupported", schemaVersion: "portal.execution.something-else.v9", reason: "UNKNOWN_SCHEMA_VERSION" } });
    expect(ms).toBeLessThan(2000);
  });
});

describe("live · query (panel and cursor)", () => {
  it("advances one panel with its cursor, workspace first", async () => {
    const urls = serve(liveSource.populated);
    await api().getLiveFullVersioned(DEPLOYMENT, { workspaceId: "ws_1", panel: "orders", cursor: "lps2.orders.00000001.1234567890.abc" });
    const query = new URL(urls[0], "http://portal.test").searchParams;
    expect(Object.fromEntries(query)).toEqual({ workspace_id: "ws_1", panel: "orders", cursor: "lps2.orders.00000001.1234567890.abc" });
  });

  it("a panel alone is sent; an empty cursor is not", async () => {
    const urls = serve(liveSource.populated);
    await api().getLiveFullVersioned(DEPLOYMENT, { panel: "fills", cursor: "" });
    expect(urls).toEqual([`/api/v1/execution/deployments/${DEPLOYMENT}/live?panel=fills`]);
  });

  it.each(["broker_sync", "nonsense", "", "Orders", "orders ", "__proto__"])("panel %j is refused without a request", async (panel) => {
    const urls = serve(liveSource.populated);
    const result = await api().getLiveFullVersioned(DEPLOYMENT, { panel });
    expect(result).toMatchObject({ ok: false, status: "unavailable" });
    expect(urls).toEqual([]);
  });

  it("a cursor with no panel is refused without a request", async () => {
    const urls = serve(liveSource.populated);
    const result = await api().getLiveFullVersioned(DEPLOYMENT, { cursor: "lps2.x" });
    expect(result).toMatchObject({ ok: false, status: "unavailable" });
    expect(urls).toEqual([]);
  });

  it("a panel page of 200 records x 5 wide texts (~1 MiB) reads as v2 inside a budget", async () => {
    const body = clone(liveSource.populated);
    const template = clone(body.data.orders.records[0]);
    body.data.orders.records = cloneRows(template, 200, (r: Draft, i: number) => {
      r.observation_id = `por1_${i.toString(16).padStart(64, "0")}`;
      for (const key of ["strategy_id", "account_id", "venue", "instrument_id", "order_id"]) r.values[key] = `${key}_${i}`.padEnd(1024, "x");
    });
    body.data.orders.returned_count = 200;
    expect(serializedBytes(body)).toBeGreaterThan(0.95 * MIB);
    serve(body);
    const { value, ms } = await (async () => {
      const start = performance.now();
      const answer = await api().getLiveFullVersioned(DEPLOYMENT, { panel: "orders" });
      return { value: answer, ms: performance.now() - start };
    })();
    if (!value.ok) throw new Error(value.reason);
    expect(value.value.kind).toBe("v2");
    expect(ms).toBeLessThan(2000);
  });
});

/* ── L3 · the testkit's negatives through the port ───────────────────────── */

describe.each(ROUTES)("$id · L3 negative through the port", (route) => {
  const containers: (readonly (string | number)[])[] = [[], ["data"]].filter((p) => p.length === 0 || getPath(route.v2Body, p) !== undefined);
  const cases: NegativeCase[] = [
    ...schemaVersionCases(route.v2Body, ["schema_version"], route.v2Schema, [
      "governance.sandbox-certification.v1", "execution.canary-control-room.v1", "execution.live-full-operations.v1",
      "portal.execution.following-parent.v2", "portal.execution.live-source-operations.v2",
    ]),
    ...requiredCases(route.v2Body, Object.keys(route.v2Body).map((key) => [key] as const)),
    ...pollutionCases(route.v2Body, containers),
    ...rootCases(),
  ];

  it("has cases", () => {
    expect(cases.length).toBeGreaterThan(40);
  });

  it.each(cases.map((c) => [c.name, c] as const))("%s", async (_name, c) => {
    const text = wire(c.value);
    serve(text);
    let result: Result<AnyRead> | undefined;
    await expect((async () => { result = await route.call(api(), DEPLOYMENT); })()).resolves.toBeUndefined();
    // A 200 with a bad body is an answer, never a transport failure.
    expect(result).toEqual({ ok: true, value: route.dispatch(parsed(text)) });
    expect(leaked(result, c.probe)).toBe(false);
    expect(prototypeIsClean()).toBe(true);
    // A body that still names this route's V2 schema is never answered as V1.
    const named = typeof c.value === "object" && c.value !== null ? (c.value as Record<string, unknown>).schema_version : undefined;
    if (named === route.v2Schema && result?.ok) expect(result.value.kind).not.toBe("v1");
  });
});

/* ── the fixture port ────────────────────────────────────────────────────── */

describe("fixture port", () => {
  it("answers each V1 fixture as a v1 read, the value the V1 method answers", async () => {
    const port = createFixtureApi();
    const [sandbox, canary, live] = [
      await port.getSandboxCertificationVersioned(DEPLOYMENT),
      await port.getCanaryVersioned(DEPLOYMENT),
      await port.getLiveFullVersioned(DEPLOYMENT),
    ];
    for (const [read, direct] of [
      [sandbox, await port.getSandboxCertification(DEPLOYMENT)],
      [canary, await port.getCanaryControlRoom(DEPLOYMENT)],
      [live, await port.getLiveFullOperations(DEPLOYMENT)],
    ] as const) {
      if (!read.ok || !direct.ok) throw new Error("fixture read failed");
      expect(read.value).toEqual({ kind: "v1", schemaVersion: null, value: direct.value });
    }
    expect(readSandboxCertification(SANDBOX_CERTIFICATION_FIXTURE)).not.toBeNull();
    expect(readCanaryControlRoom(CANARY_ROOM_FIXTURE)).not.toBeNull();
    expect(readLiveFullOperations(LIVE_FULL_FIXTURE)).not.toBeNull();
  });

  it("each can be switched off by its own name, and the V1 name still gates the V1 route behind it", async () => {
    const port = createFixtureApi({ unavailableEndpoints: ["getSandboxCertificationVersioned", "getCanaryControlRoom", "getLiveFullVersioned"] });
    expect(await port.getSandboxCertificationVersioned(DEPLOYMENT)).toMatchObject({ ok: false, status: "unavailable" });
    expect(await port.getCanaryVersioned(DEPLOYMENT)).toMatchObject({ ok: false, status: "unavailable" });
    expect(await port.getLiveFullVersioned(DEPLOYMENT)).toMatchObject({ ok: false, status: "unavailable" });
    expect((await port.getSandboxCertification(DEPLOYMENT)).ok).toBe(true);
  });

  it("refuses the same live requests the http port refuses", async () => {
    const port = createFixtureApi();
    expect(await port.getLiveFullVersioned(DEPLOYMENT, { panel: "broker_sync" })).toMatchObject({ ok: false, status: "unavailable" });
    expect(await port.getLiveFullVersioned(DEPLOYMENT, { cursor: "lps2.x" })).toMatchObject({ ok: false, status: "unavailable" });
    expect((await port.getLiveFullVersioned(DEPLOYMENT, { panel: "orders" })).ok).toBe(true);
  });
});
