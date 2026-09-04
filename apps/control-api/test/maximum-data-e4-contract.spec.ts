import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type JsonRecord = Record<string, unknown>;
type UtcEpochMs = number & { readonly __utcEpochMs: unique symbol };

interface ExactDecimal {
  value: string;
  currency: string;
  scale: number;
}

const PACK = resolve(
  __dirname,
  "../../../services/portal-execution-edge-rs/contracts/maximum-data-return-v1",
);
const EXPECTED_STATES = new Set([
  "POPULATED",
  "EMPTY",
  "PARTIAL",
  "STALE",
  "GAP",
  "DUPLICATE",
  "CORRECTION",
  "CONTINUATION",
]);
const EXPECTED_EVENT_COUNT = 36;

function load(name: string): JsonRecord {
  return JSON.parse(readFileSync(resolve(PACK, name), "utf8")) as JsonRecord;
}

function object(value: unknown, path: string): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as JsonRecord;
}

function list(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || !value || value.trim() !== value) {
    throw new Error(`${path} must be nonblank text`);
  }
  return value;
}

function utcEpochMs(value: unknown, path: string): UtcEpochMs {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`${path} must be a JSON safe integer epoch milliseconds`);
  }
  return value as UtcEpochMs;
}

function exactDecimal(value: unknown, path: string): ExactDecimal {
  const amount = object(value, path);
  if (typeof amount.value !== "string") {
    throw new Error(`${path} is not an exact decimal`);
  }
  const raw = text(amount.value, `${path}.value`);
  const currency = text(amount.currency, `${path}.currency`);
  const scale = amount.scale;
  if (
    typeof scale !== "number" ||
    !Number.isInteger(scale) ||
    scale < 0 ||
    !/^[A-Z]{3,12}$/.test(currency) ||
    !/^-?\d+(?:\.\d+)?$/.test(raw)
  ) {
    throw new Error(`${path} is not an exact decimal`);
  }
  const fraction = raw.includes(".") ? raw.split(".")[1]?.length ?? 0 : 0;
  if (fraction !== scale) throw new Error(`${path} scale drift`);
  return { value: raw, currency, scale };
}

function assertNoInventedReplay(coverage: readonly JsonRecord[]): void {
  for (const event of coverage) {
    if (event.status === "AVAILABLE" || event.replay_eligible !== false) {
      throw new Error("invented replay");
    }
  }
}

function firstFixture(document: JsonRecord): JsonRecord {
  return object(list(document.fixtures, "fixtures")[0], "fixture");
}

function decodeFixture(fixture: JsonRecord, sourceIds: ReadonlySet<string>): void {
  const state = text(fixture.state, "fixture.state");
  if (!EXPECTED_STATES.has(state) || fixture.synthetic_no_business_row !== true) {
    throw new Error("fixture state/provenance");
  }
  const envelope = object(fixture.envelope, "fixture.envelope");
  if (envelope.state !== state) throw new Error("envelope state drift");
  const lineage = object(envelope.lineage, "lineage");
  const health = object(envelope.source_health, "source_health");
  const page = object(envelope.page, "page");
  const profileId = text(lineage.profile_id, "lineage.profile_id");
  if (!["PAPER", "SANDBOX", "LIVE"].includes(text(lineage.mode, "lineage.mode"))) {
    throw new Error("lineage mode");
  }
  const sourceId = text(health.source_id, "source_health.source_id");
  if (!sourceIds.has(sourceId)) throw new Error("unknown source");
  utcEpochMs(health.observed_at_ms, "source_health.observed_at_ms");
  if (health.global_sequence !== null || health.source_epoch !== null) {
    throw new Error("fixture invents an event stream");
  }
  if (
    page.source_id !== sourceId ||
    page.profile_id !== profileId ||
    page.logical_operation_id !== envelope.logical_operation_id ||
    page.source_contract_revision !== envelope.source_contract_revision
  ) {
    throw new Error("continuation binding");
  }
  if (Boolean(page.has_more) !== (page.next_cursor !== null)) {
    throw new Error("cursor/has_more binding");
  }
  if (page.next_cursor !== null) {
    const token = text(object(page.next_cursor, "next_cursor").token, "next_cursor.token");
    if (token.length > 4096) throw new Error("cursor too long");
  }
  for (const name of ["earliest_available_time_ms", "newest_available_time_ms", "retention_floor_ms"]) {
    if (page[name] !== null) utcEpochMs(page[name], `page.${name}`);
  }
  const records = list(envelope.records, "records");
  for (const record of records) {
    const fact = object(record, "record");
    exactDecimal(fact.amount, "record.amount");
    const effective = utcEpochMs(fact.effective_at_ms, "record.effective_at_ms");
    const observed = utcEpochMs(fact.observed_at_ms, "record.observed_at_ms");
    if (observed < effective) throw new Error("record clock ordering");
  }
  if (state === "POPULATED" && records.length === 0) throw new Error("populated empty");
  if (state === "EMPTY" && records.length !== 0) throw new Error("empty populated");
  if (state === "PARTIAL" && page.completeness !== "PARTIAL") throw new Error("partial semantics");
  if (state === "STALE" && health.freshness !== "STALE") throw new Error("stale semantics");
  if (state === "GAP" && (page.completeness !== "GAP" || page.resnapshot_required !== true)) {
    throw new Error("gap semantics");
  }
  if (state === "DUPLICATE" && (envelope.duplicate_records_suppressed as number) < 1) {
    throw new Error("duplicate semantics");
  }
  if (state === "CORRECTION" && !records.some((record) => object(record, "record").correction_of_fixture_record_id)) {
    throw new Error("correction provenance");
  }
  if (state === "CONTINUATION" && page.has_more !== true) throw new Error("continuation semantics");
}

describe("EX-DP-04 maximum-data E4 cross-language contract", () => {
  it("decodes the frozen schemas, all E3 bindings, every event ruling, and eight synthetic fixtures", () => {
    const schemaFiles = [
      ["e4-source-catalogue.v1.schema.json", "portal.execution.maximum-data.e4.source-catalogue.schema.v1"],
      ["e4-domain-capability.v1.schema.json", "portal.execution.maximum-data.e4.domain-capability.schema.v1"],
      ["e4-history-continuation.v1.schema.json", "portal.execution.maximum-data.e4.history-continuation.schema.v1"],
      ["e4-source-health.v1.schema.json", "portal.execution.maximum-data.e4.source-health.schema.v1"],
      ["e4-coverage-artifact.v1.schema.json", "portal.execution.maximum-data.e4.coverage-artifact.schema.v1"],
      ["e4-read-envelope.v1.schema.json", "portal.execution.maximum-data.e4.read-envelope.schema.v1"],
      ["e4-event-coverage.v1.schema.json", "portal.execution.maximum-data.e4.event-coverage.schema.v1"],
    ] as const;
    for (const [filename, id] of schemaFiles) {
      const schema = load(filename);
      expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
      expect(schema.$id).toBe(id);
      expect(schema.type).toBe("object");
      expect(schema.additionalProperties).toBe(false);
    }

    const sources = list(load("e4-source-catalogue.v1.json").sources, "sources").map((source) => object(source, "source"));
    const sourceIds = new Set(sources.map((source) => text(source.source_id, "source.source_id")));
    expect(sourceIds.size).toBe(6);
    const manager = sources.find((source) => source.source_id === "TRADING_SYSTEM_MANAGER_V2_PAPER");
    expect(manager?.supported_profile_ids).toEqual(["PAPER_BINANCE_USDM"]);
    expect(manager?.supported_modes).toEqual(["PAPER"]);

    const e3Fields = list(load("e3-field-definitions.v1.json").fields, "E3 fields").map((field) => text(object(field, "E3 field").field_id, "field_id"));
    const bindings = list(load("e4-operation-bindings.v1.json").bindings, "E4 bindings").map((binding) => object(binding, "binding"));
    expect(new Set(bindings.map((binding) => binding.field_id)).size).toBe(e3Fields.length);
    expect(new Set(bindings.map((binding) => binding.field_id))).toEqual(new Set(e3Fields));
    for (const binding of bindings) {
      const gap = binding.binding_status === "SOURCE_OWNER_GAP";
      expect(gap).toBe(binding.logical_operation_id === null);
      expect(gap).toBe(binding.typed_absence_id !== null);
    }

    const coverage = list(load("e4-event-coverage.v1.json").coverage, "event coverage").map((event) => object(event, "event"));
    expect(coverage).toHaveLength(EXPECTED_EVENT_COUNT);
    expect(new Set(coverage.map((event) => event.event_type)).size).toBe(EXPECTED_EVENT_COUNT);
    expect(() => assertNoInventedReplay(coverage)).not.toThrow();

    const fixtures = list(load("e4-golden-fixtures.v1.json").fixtures, "fixtures").map((fixture) => object(fixture, "fixture"));
    expect(new Set(fixtures.map((fixture) => fixture.state))).toEqual(EXPECTED_STATES);
    for (const fixture of fixtures) decodeFixture(fixture, sourceIds);
  });

  it("fails closed for float timestamps/decimals, missing lineage, raw cursor drift, and invented replay", () => {
    const fixtures = structuredClone(load("e4-golden-fixtures.v1.json"));
    const sourceIds = new Set(list(load("e4-source-catalogue.v1.json").sources, "sources").map((source) => object(source, "source").source_id as string));

    const floatTime = structuredClone(fixtures) as JsonRecord;
    const floatTimeEnvelope = object(firstFixture(floatTime).envelope, "envelope");
    object(floatTimeEnvelope.source_health, "health").observed_at_ms = 1760000000123.5;
    expect(() => decodeFixture(firstFixture(floatTime), sourceIds)).toThrow("safe integer");

    const floatDecimal = structuredClone(fixtures) as JsonRecord;
    const floatDecimalEnvelope = object(firstFixture(floatDecimal).envelope, "envelope");
    const firstRecord = list(floatDecimalEnvelope.records, "records")[0];
    object(firstRecord, "record").amount = { value: 12.34, currency: "USDT", scale: 2 };
    expect(() => decodeFixture(firstFixture(floatDecimal), sourceIds)).toThrow("exact decimal");

    const missingLineage = structuredClone(fixtures) as JsonRecord;
    const missingLineageEnvelope = object(firstFixture(missingLineage).envelope, "envelope");
    object(missingLineageEnvelope.lineage, "lineage").profile_id = "";
    expect(() => decodeFixture(firstFixture(missingLineage), sourceIds)).toThrow("profile_id");

    const rawCursor = structuredClone(fixtures) as JsonRecord;
    const rawCursorEnvelope = object(firstFixture(rawCursor).envelope, "envelope");
    object(rawCursorEnvelope.page, "page").next_cursor = { token: "cursor" };
    expect(() => decodeFixture(firstFixture(rawCursor), sourceIds)).toThrow("cursor/has_more");

    const replay = structuredClone(load("e4-event-coverage.v1.json"));
    object(list(replay.coverage, "coverage")[0], "event").status = "AVAILABLE";
    expect(() => assertNoInventedReplay(list(replay.coverage, "coverage").map((event) => object(event, "event")))).toThrow("invented replay");
  });
});
