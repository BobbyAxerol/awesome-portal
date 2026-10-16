import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { edgeMetadataSchema } from "../../../apps/control-api/src/execution-v2/foundation.contract";
import {
  edgeScopedNotice,
  edgeScopedNoticeBatch,
  scopedRealtimeFrame,
} from "../../../apps/control-api/src/execution-v2/realtime.contract";

const root = resolve(__dirname, "..");
const load = (path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const api = load("openapi/execution-scoped-realtime.openapi.json");
const schema = load("schemas/execution-scoped-realtime.v1.schema.json");
const fixture = load("fixtures/execution-scoped-realtime.synthetic.valid.json");
const foundationApi = load("openapi/execution-v2-foundation.openapi.json");
const foundationSchema = load("schemas/execution-v2-foundation.v1.schema.json");
const ajv = new Ajv2020({ strict: false, allErrors: true });
ajv.addSchema(schema);

const runtime: Record<string, { safeParse: (value: unknown) => { success: boolean } }> = {
  ScopedRealtimeFrame: scopedRealtimeFrame,
  EdgeScopedNotice: edgeScopedNotice,
  EdgeScopedNoticeBatch: edgeScopedNoticeBatch,
  Quality: edgeMetadataSchema.shape.quality,
};
const validates = (name: string, value: unknown) => {
  const validator = ajv.getSchema(`${schema.$id}#/$defs/${name}`);
  if (!validator) throw new Error(`Missing generated realtime schema: ${name}`);
  return validator(value);
};
const parity = (name: string, value: unknown, expected: boolean) => {
  expect(validates(name, value), `${name}: generated schema`).toBe(expected);
  expect(runtime[name].safeParse(value).success, `${name}: runtime schema`).toBe(expected);
};
const sample = (name: string) => {
  const entry = fixture.cases.find((item: any) => item.schema === name);
  if (!entry) throw new Error(`Missing canonical realtime fixture: ${name}`);
  return structuredClone(entry.response);
};
const frame = (eventType: string) => {
  const entry = fixture.cases.find((item: any) => item.schema === "ScopedRealtimeFrame"
    && item.response.event_type === eventType);
  if (!entry) throw new Error(`Missing canonical realtime state: ${eventType}`);
  return structuredClone(entry.response);
};

describe("ELP2-09 scoped notification/revocation generated contract", () => {
  it("publishes schema-only synthetic examples, not a mounted source feed or production policy", () => {
    expect(api.paths).toEqual({});
    expect(fixture.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    expect(fixture.production_config).toBe(false);
    expect(new Set(fixture.cases.filter((item: any) => item.schema === "ScopedRealtimeFrame")
      .map((item: any) => item.response.event_type))).toEqual(new Set([
      "revalidate", "heartbeat", "resync_required", "access_revoked", "unavailable",
    ]));
    expect(fixture.cases.some((item: any) => item.schema === "EdgeScopedNotice")).toBe(true);
    expect(fixture.cases.some((item: any) => item.schema === "EdgeScopedNoticeBatch"
      && item.response.notices.length === 0)).toBe(true);
  });

  it.each(fixture.cases)("$id / $schema agrees between AJV2020 and runtime", (entry: any) => {
    expect(runtime[entry.schema], entry.id).toBeDefined();
    parity(entry.schema, entry.response, true);
    parity(entry.schema, { ...entry.response, jwt: "forbidden-browser-input" }, false);
  });

  it("reuses canonical Quality without creating a weaker realtime quality dialect", () => {
    expect(api.components.schemas.Quality).toEqual(foundationApi.components.schemas.Quality);
    expect(schema.$defs.Quality).toEqual(foundationSchema.$defs.Quality);
    const quality = sample("EdgeScopedNotice").quality;
    parity("Quality", quality, true);
    parity("Quality", { ...quality, source_as_of_ms: null }, true);
    parity("Quality", { ...quality, source_as_of_ms: 0 }, true);
    expect(quality).toHaveProperty("source_as_of_ms");
    const { source_as_of_ms: _removedSourceClock, ...missingClock } = quality;
    parity("Quality", missingClock, false);
  });

  it.each([
    ["revalidate", "READ_NAMED_SNAPSHOT", false, false],
    ["heartbeat", "RESUME_PORTAL_CURSOR", false, false],
    ["resync_required", "READ_NAMED_SNAPSHOT", true, true],
    ["access_revoked", "SIGN_IN_OR_REQUEST_ACCESS", true, false],
    ["unavailable", "WAIT", true, false],
  ])("%s has one precise action and lifecycle", (eventType, action, terminal, reconnect) => {
    const value = frame(String(eventType));
    expect(value).toMatchObject({
      schema_version: "portal.execution.scoped-realtime.v1", semantics: "NOTIFICATION_ONLY",
      next_action: action, terminal, reconnect_required: reconnect,
    });
    parity("ScopedRealtimeFrame", { ...value, terminal: !terminal }, false);
    parity("ScopedRealtimeFrame", { ...value, reconnect_required: !reconnect }, false);
    const wrongAction = action === "WAIT" ? "READ_NAMED_SNAPSHOT" : "WAIT";
    parity("ScopedRealtimeFrame", { ...value, next_action: wrongAction }, false);
  });

  it.each(["resync_required", "access_revoked", "unavailable"])(
    "%s never returns protected old-scope cursor, generation or quality", (eventType) => {
      const value = frame(eventType);
      expect(value).toMatchObject({ resume_cursor: null, projection_generation: null, quality: null });
      expect(value.reason_code).not.toBeNull();
      parity("ScopedRealtimeFrame", { ...value, reason_code: null }, false);
      parity("ScopedRealtimeFrame", { ...value, resume_cursor: "old_scope_cursor" }, false);
      parity("ScopedRealtimeFrame", { ...value, projection_generation: "old_scope_generation" }, false);
      parity("ScopedRealtimeFrame", { ...value, quality: sample("EdgeScopedNotice").quality }, false);
    },
  );

  it.each(["revalidate", "heartbeat"])("%s keeps continuation but has no invented refusal reason", (eventType) => {
    const value = frame(eventType);
    expect(value.reason_code).toBeNull();
    expect(value.resume_cursor).toBeTypeOf("string");
    expect(value.projection_generation).toBeTypeOf("string");
    parity("ScopedRealtimeFrame", { ...value, reason_code: "SOURCE_UNAVAILABLE" }, false);
    parity("ScopedRealtimeFrame", { ...value, resume_cursor: null }, false);
    parity("ScopedRealtimeFrame", { ...value, projection_generation: null }, false);
  });

  it("revalidation carries canonical quality; heartbeat cannot certify source completeness", () => {
    const revalidate = frame("revalidate"), heartbeat = frame("heartbeat");
    expect(revalidate.quality).not.toBeNull();
    expect(heartbeat.quality).toBeNull();
    parity("ScopedRealtimeFrame", { ...revalidate, quality: null }, false);
    parity("ScopedRealtimeFrame", { ...heartbeat, quality: revalidate.quality }, false);
    parity("ScopedRealtimeFrame", { ...revalidate, semantics: "AUTHORITATIVE_FINANCIAL_REPLAY" }, false);
  });

  it("hidden-only and idle batches stay opaque; transport caught-up is not financial completeness", () => {
    const empty = fixture.cases.filter((item: any) => item.schema === "EdgeScopedNoticeBatch"
      && item.response.notices.length === 0);
    expect(empty.length).toBeGreaterThan(0);
    for (const item of empty) {
      parity("EdgeScopedNoticeBatch", item.response, true);
      expect(item.response).not.toHaveProperty("hidden_count");
      expect(item.response).not.toHaveProperty("source_sequence");
      expect(item.response).not.toHaveProperty("quality");
    }
    const partial = { ...sample("EdgeScopedNotice"), quality: {
      ...sample("EdgeScopedNotice").quality, completeness: "PARTIAL", freshness: "UNKNOWN",
    } };
    parity("EdgeScopedNoticeBatch", { notices: [partial], next_cursor: partial.resume_cursor, caught_up: true }, true);
    expect(partial.quality.completeness).toBe("PARTIAL");
  });

  it("rejects extra financial rows, raw ordering, hidden counts and authority inputs at every public boundary", () => {
    const forbidden = ["source_sequence", "source_offset", "global_sequence", "ordinal", "hidden_count",
      "total_count", "rows", "payload", "event_id", "coverage_watermark", "actor", "policy_revision",
      "relation", "url", "sql", "mtls"];
    for (const name of ["ScopedRealtimeFrame", "EdgeScopedNotice", "EdgeScopedNoticeBatch"]) {
      const value = sample(name);
      for (const key of forbidden) parity(name, { ...value, [key]: "not-public-data" }, false);
    }
    const notice = sample("EdgeScopedNotice");
    parity("EdgeScopedNotice", { ...notice, quality: { ...notice.quality, hidden_count: 1 } }, false);
    parity("EdgeScopedNoticeBatch", { notices: [{ ...notice, source_sequence: 3 }], next_cursor: notice.resume_cursor,
      caught_up: true }, false);
  });

  it("validates canonical uppercase quality enums, safe UTC milliseconds and reason bounds", () => {
    const quality = sample("EdgeScopedNotice").quality;
    for (const [key, value] of [
      ["completeness", "complete"], ["freshness", "fresh"], ["coverage", "GLOBAL"], ["confidence", "TRUST_ME"],
    ]) parity("Quality", { ...quality, [key]: value }, false);
    for (const key of ["source_as_of_ms", "portal_observed_at_ms"]) {
      for (const value of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, "2026-10-16T00:00:00Z"])
        parity("Quality", { ...quality, [key]: value }, false);
      for (const value of [0, Number.MAX_SAFE_INTEGER]) parity("Quality", { ...quality, [key]: value }, true);
    }
    parity("Quality", { ...quality, portal_observed_at_ms: null }, false);
    parity("Quality", { ...quality, reasons: Array(32).fill("TEST_ONLY_REASON") }, true);
    parity("Quality", { ...quality, reasons: Array(33).fill("TEST_ONLY_REASON") }, false);
  });

  it("enforces source batch, cursor and schema bounds without an unbounded row replay payload", () => {
    const notice = sample("EdgeScopedNotice");
    parity("EdgeScopedNoticeBatch", { notices: Array(200).fill(notice), next_cursor: notice.resume_cursor, caught_up: true }, true);
    parity("EdgeScopedNoticeBatch", { notices: Array(201).fill(notice), next_cursor: notice.resume_cursor, caught_up: true }, false);
    for (const cursor of ["", "bad\ncursor", "https://source.invalid/cursor", "x".repeat(4097)])
      parity("EdgeScopedNotice", { ...notice, resume_cursor: cursor }, false);
    parity("EdgeScopedNotice", { ...notice, resume_cursor: "x".repeat(4096) }, true);
    parity("ScopedRealtimeFrame", { ...frame("revalidate"), schema_version: "portal.execution.profile-realtime.v1" }, false);
    parity("ScopedRealtimeFrame", { ...frame("revalidate"), event_type: "UPSERT" }, false);
    parity("ScopedRealtimeFrame", { ...frame("unavailable"), reason_code: "arbitrary server prose" }, false);
  });
});
