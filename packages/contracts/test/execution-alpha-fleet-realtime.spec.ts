import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import {
  ALPHA_FLEET_NAMED_SNAPSHOT_PATH, ALPHA_FLEET_SNAPSHOT_PATH, ALPHA_FLEET_STREAM_PATH, alphaFleetRealtimeQuery, alphaFleetRealtimeSnapshot,
  alphaFleetStreamQuery, serializeFleetFrame, terminalFleetFrame,
} from "../../../apps/control-api/src/execution-v2/alpha-fleet-realtime.contract";
import { scopedRealtimeFrame } from "../../../apps/control-api/src/execution-v2/realtime.contract";

const root = resolve(__dirname, "..");
const load = (path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const api = load("openapi/execution-alpha-fleet-realtime.openapi.json");
const schema = load("schemas/execution-alpha-fleet-realtime.v1.schema.json");
const valid = load("fixtures/execution-alpha-fleet-realtime.synthetic.valid.json");
const negative = load("fixtures/execution-alpha-fleet-realtime.synthetic.negative.json");
const frames = load("openapi/execution-scoped-realtime.openapi.json");
const foundation = load("openapi/execution-v2-foundation.openapi.json");
const ajv = new Ajv2020({ strict: false, allErrors: true });
ajv.addSchema(schema);
const validates = (name: string, value: unknown) => {
  const validator = ajv.getSchema(`${schema.$id}#/$defs/${name}`);
  if (!validator) throw new Error(`Missing generated schema ${name}`);
  return validator(value) as boolean;
};
const runtime: Record<string, { safeParse: (value: unknown) => { success: boolean } }> = {
  AlphaFleetRealtimeSnapshot: alphaFleetRealtimeSnapshot, ScopedRealtimeFrame: scopedRealtimeFrame,
};
const sample = (id: string) => structuredClone(valid.cases.find((c: any) => c.id === id).response);

describe("BE-P16 ELP2-09 alpha_fleet_overview: published operations", () => {
  it("publishes exactly the snapshot and the stream as real paths, with the stream frame unchanged", () => {
    expect(Object.keys(api.paths).sort()).toEqual([ALPHA_FLEET_SNAPSHOT_PATH, ALPHA_FLEET_STREAM_PATH].sort());
    expect(api.paths[ALPHA_FLEET_SNAPSHOT_PATH].get.operationId).toBe("executionAlphaFleetRealtimeSnapshotGetV1");
    expect(api.paths[ALPHA_FLEET_STREAM_PATH].get.operationId).toBe("executionAlphaFleetRealtimeStreamGetV1");
    // The frame is the ELP2-09 frame, byte for byte: no second dialect.
    expect(api.components.schemas.ScopedRealtimeFrame).toEqual(frames.components.schemas.ScopedRealtimeFrame);
    expect(api.components.schemas.Quality).toEqual(foundation.components.schemas.Quality);
    const ok = api.paths[ALPHA_FLEET_STREAM_PATH].get.responses[200];
    expect(Object.keys(ok.content)).toEqual(["text/event-stream"]);
    expect(ok.content["text/event-stream"]["x-sse-frame"].$ref).toBe("#/components/schemas/ScopedRealtimeFrame");
    // The schema-only handoff keeps its identity.
    expect(frames.paths).toEqual({});
  });

  it("is no-store on every response and session-guarded", () => {
    for (const path of Object.keys(api.paths)) {
      const operation = api.paths[path].get;
      expect(operation.security).toEqual([{ PortalSession: [] }]);
      for (const [status, response] of Object.entries<any>(operation.responses))
        expect(response.headers["Cache-Control"].schema.const, `${path} ${status}`).toBe("private, no-store");
    }
  });

  it("accepts no browser input beyond the closed query", () => {
    const names = (path: string) => api.paths[path].get.parameters.map((p: any) => p.name);
    expect(names(ALPHA_FLEET_SNAPSHOT_PATH)).toEqual(["environment", "workspace_id"]);
    expect(names(ALPHA_FLEET_STREAM_PATH)).toEqual(["environment", "workspace_id", "cursor", "Last-Event-ID"]);
    for (const extra of [{ ordinal: "1" }, { after: "x" }, { profile_id: "p" }, { cursor: "x" }])
      expect(alphaFleetRealtimeQuery.safeParse({ environment: "paper", ...extra }).success, JSON.stringify(extra)).toBe(false);
    expect(alphaFleetStreamQuery.safeParse({ environment: "paper", cursor: "TEST_ONLY_TOKEN" }).success).toBe(true);
    expect(alphaFleetStreamQuery.safeParse({ environment: "paper", cursor: "a b" }).success).toBe(false);
    expect(alphaFleetStreamQuery.safeParse({ environment: "all" }).success).toBe(false);
  });

  it("pairs with the published fleet read by name", () => {
    expect(ALPHA_FLEET_NAMED_SNAPSHOT_PATH).toBe("/api/v1/execution/manager/fleet");
    const models = load("openapi/execution-manager-models.openapi.json");
    expect(models.paths[ALPHA_FLEET_NAMED_SNAPSHOT_PATH].get.operationId).toBe("executionManagerFleetGetV1");
    expect(sample("AFR-SNAPSHOT-AVAILABLE").named_snapshot).toEqual({
      operation_id: "executionManagerFleetGetV1", path: ALPHA_FLEET_NAMED_SNAPSHOT_PATH, lineage_revision: sample("AFR-SNAPSHOT-AVAILABLE").baseline.revision });
  });
});

describe("BE-P16 ELP2-09 alpha_fleet_overview: fixtures agree between AJV 2020 and the producer validator", () => {
  it("is the synthetic lane, not production config", () => {
    for (const file of [valid, negative]) {
      expect(file.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
      expect(file.production_config).toBe(false);
    }
  });
  it.each(valid.cases)("$id validates in both", (entry: any) => {
    expect(validates(entry.schema, entry.response), "generated schema").toBe(true);
    expect(runtime[entry.schema].safeParse(entry.response).success, "runtime schema").toBe(true);
  });
  // JSON Schema cannot state a cross-field equality; the runtime validator and the browser reader hold it. Named, not hidden.
  const RUNTIME_ONLY = new Set(["revision-pairing-broken"]);
  it.each(negative.cases)("$id is refused ($rule)", (entry: any) => {
    expect(runtime[entry.schema].safeParse(entry.response).success, "runtime schema").toBe(false);
    if (!RUNTIME_ONLY.has(entry.id)) expect(validates(entry.schema, entry.response), "generated schema").toBe(false);
  });
  it("covers the five stream states and every typed reason the snapshot can give", () => {
    expect(new Set(valid.cases.filter((c: any) => c.schema === "ScopedRealtimeFrame").map((c: any) => c.response.event_type)))
      .toEqual(new Set(["revalidate", "heartbeat", "resync_required", "access_revoked", "unavailable"]));
    expect(new Set(valid.cases.filter((c: any) => c.response.stream?.state === "UNAVAILABLE").map((c: any) => c.response.stream.reason_code)))
      .toEqual(new Set(["WHOLE_FLEET_AUTHORITY_REQUIRED", "STREAM_AUTHORITY_NOT_GRANTED", "STREAM_CAPACITY_REACHED"]));
  });
  it("keeps an unavailable stream cursorless and an ordinal wider than a safe integer exact", () => {
    for (const c of valid.cases.filter((x: any) => x.response.stream?.state === "UNAVAILABLE")) expect(c.response.stream.resume_cursor).toBeNull();
    expect(sample("AFR-SNAPSHOT-ORDINAL-WIDER-THAN-SAFE-INTEGER").baseline.ordinal).toBe("9007199254740993");
  });
});

describe("BE-P16 ELP2-09 alpha_fleet_overview: SSE wire form", () => {
  it.each(valid.cases.filter((c: any) => c.wire !== undefined))("$id: event = event_type, id = resume_cursor on live frames only, one JSON data line", (entry: any) => {
    const lines = entry.wire.split("\n");
    expect(entry.wire.endsWith("\n\n")).toBe(true);
    expect(entry.wire).toBe(serializeFleetFrame(entry.response));
    const hasId = lines[0].startsWith("id: ");
    expect(hasId).toBe(!entry.response.terminal);
    if (hasId) expect(lines[0]).toBe(`id: ${entry.response.resume_cursor}`);
    expect(lines[hasId ? 1 : 0]).toBe(`event: ${entry.response.event_type}`);
    expect(JSON.parse(lines[hasId ? 2 : 1].slice("data: ".length))).toEqual(entry.response);
    expect(lines.filter((l: string) => l.startsWith("data: "))).toHaveLength(1);
  });
  it("answers every finite reason with one terminal frame that keeps nothing of the stream", () => {
    for (const reason of ["SNAPSHOT_REQUIRED", "CURSOR_INVALID_OR_EXPIRED", "GENERATION_CHANGED", "SOURCE_COVERAGE_UNPROVED", "SLOW_CLIENT",
      "SCOPE_CHANGED", "ACCESS_CHANGED", "SOURCE_UNAVAILABLE", "RECONNECT_LIMIT", "STOPPED"] as const) {
      const frame = terminalFleetFrame(reason);
      expect(frame).toMatchObject({ terminal: true, resume_cursor: null, projection_generation: null, quality: null, reason_code: reason });
      expect(serializeFleetFrame(frame)).not.toMatch(/^id: /);
    }
  });
});
