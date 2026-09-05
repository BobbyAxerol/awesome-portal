import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

type JsonObject = Record<string, unknown>;

const PACK = resolve(
  process.env.EDS08_SOURCE_CONTINUITY_PACK
    ?? "/services/portal-execution-edge-rs/contracts/eds08-source-continuity-v1",
);
const E7_PACK = resolve(
  process.env.EDS02_SOURCE_PACK
    ?? "/services/portal-execution-edge-rs/contracts/maximum-data-return-v1",
);
const EXPECTED_LANES = new Set([
  "EVENT",
  "MARKET",
  "VALUATION",
  "OPERATIONS",
  "COMMAND",
  "ARTIFACT",
  "RESEARCH",
]);
const EVENT_CLASSES = new Map([
  ["position-version-history", "execution.position-lifecycle.v1"],
  ["fill-correction-replay", "execution.fill-lifecycle.v1"],
  ["risk-event-correction", "risk.decision-lifecycle.v1"],
]);
const CASES = new Set([
  "DUPLICATE",
  "GAP",
  "CORRECTION",
  "TOMBSTONE",
  "EPOCH_RESET",
  "RETENTION_BOUNDARY",
  "CROSS_PROFILE_REJECTION",
  "SNAPSHOT_TAIL",
]);

function load(pack: string, name: string): JsonObject {
  return JSON.parse(readFileSync(resolve(pack, name), "utf8")) as JsonObject;
}

function object(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonObject;
}

function objects(value: unknown, label: string): JsonObject[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((entry, index) => object(entry, `${label}[${index}]`));
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value || value.trim() !== value) {
    throw new Error(`${label} must be nonblank text`);
  }
  return value;
}

function exactSequence(value: unknown, label: string): bigint {
  if (typeof value !== "string") throw new Error(`${label} must be an exact decimal string`);
  const raw = text(value, label);
  if (!/^(0|[1-9][0-9]{0,19})$/.test(raw)) {
    throw new Error(`${label} must be an exact decimal string`);
  }
  const parsed = BigInt(raw);
  if (parsed > 18_446_744_073_709_551_615n) throw new Error(`${label} exceeds u64`);
  return parsed;
}

function profileKey(value: unknown, label: string): string {
  const profile = object(value, label);
  const fields = ["workspace_id", "mode", "profile_id", "venue_id", "resource_kind", "resource_id", "filter_digest"];
  if (new Set(Object.keys(profile)).size !== fields.length || !fields.every((field) => field in profile)) {
    throw new Error(`${label} shape`);
  }
  if (!["PAPER", "SANDBOX", "LIVE"].includes(text(profile.mode, `${label}.mode`))) {
    throw new Error(`${label}.mode`);
  }
  for (const field of fields.filter((field) => field !== "mode")) text(profile[field], `${label}.${field}`);
  return fields.map((field) => String(profile[field])).join("|");
}

function event(value: unknown, label: string): {
  profile: string;
  epoch: string;
  sequence: bigint;
  eventId: string;
  operation: string;
} {
  const entry = object(value, label);
  if (entry.schema_version !== "portal.execution.eds08.source-event.v1") {
    throw new Error(`${label} schema version`);
  }
  const profile = profileKey(entry.profile, `${label}.profile`);
  const epoch = text(entry.source_epoch, `${label}.source_epoch`);
  const sequence = exactSequence(entry.source_sequence, `${label}.source_sequence`);
  const eventId = text(entry.event_id, `${label}.event_id`);
  const operation = text(entry.operation, `${label}.operation`);
  if (!["UPSERT", "CORRECTION", "TOMBSTONE"].includes(operation)) {
    throw new Error(`${label}.operation`);
  }
  if (operation === "CORRECTION" && typeof entry.correction_of_event_id !== "string") {
    throw new Error(`${label} correction causal reference`);
  }
  if (operation === "TOMBSTONE" && typeof entry.tombstone_of_event_id !== "string") {
    throw new Error(`${label} tombstone causal reference`);
  }
  if (typeof entry.occurred_at_ms !== "number" || !Number.isSafeInteger(entry.occurred_at_ms)) {
    throw new Error(`${label}.occurred_at_ms`);
  }
  if (typeof entry.published_at_ms !== "number" || !Number.isSafeInteger(entry.published_at_ms)) {
    throw new Error(`${label}.published_at_ms`);
  }
  if (entry.published_at_ms < entry.occurred_at_ms) throw new Error(`${label} clock ordering`);
  if (object(entry.payload, `${label}.payload`).synthetic !== true) {
    throw new Error(`${label} must be synthetic`);
  }
  return { profile, epoch, sequence, eventId, operation };
}

function files(root: string, base = root): string[] {
  return readdirSync(root).flatMap((entry) => {
    const absolute = resolve(root, entry);
    if (statSync(absolute).isDirectory()) return files(absolute, base);
    return [relative(base, absolute)];
  });
}

function digest(pack: string, name: string): string {
  return `sha256:${createHash("sha256").update(readFileSync(resolve(pack, name))).digest("hex")}`;
}

function assertRequest(packet: JsonObject, expectedGaps: Set<string>): void {
  if (packet.schema_version !== "portal.execution.eds08.source-continuity-owner-request.v1") {
    throw new Error("request schema");
  }
  const lanes = objects(packet.owner_lanes, "owner lanes");
  if (lanes.length !== 7 || new Set(lanes.map((lane) => text(lane.lane_id, "lane id"))).size !== 7) {
    throw new Error("owner lanes");
  }
  expect(new Set(lanes.map((lane) => String(lane.lane_id)))).toEqual(EXPECTED_LANES);
  const seen = new Set<string>();
  const eventClassByGap = new Map<string, string>();
  for (const lane of lanes) {
    const items = objects(lane.items, "lane items");
    for (const item of items) {
      const gapId = text(item.gap_id, "gap id");
      if (seen.has(gapId)) throw new Error(`duplicate gap ${gapId}`);
      seen.add(gapId);
      if (item.delivery_kind === "AUTHORITATIVE_EVENT_STREAM") {
        eventClassByGap.set(gapId, text(item.event_class_id, `event class ${gapId}`));
      }
    }
  }
  if (seen.size !== 18 || [...seen].some((gap) => !expectedGaps.has(gap))) {
    throw new Error("E7 source gap coverage");
  }
  expect(eventClassByGap).toEqual(EVENT_CLASSES);
}

function assertFixtureCases(document: JsonObject): void {
  if (document.synthetic_no_business_data !== true) throw new Error("fixture provenance");
  const cases = objects(document.cases, "cases");
  expect(cases).toHaveLength(8);
  expect(new Set(cases.map((entry) => String(entry.kind)))).toEqual(CASES);
  for (const entry of cases) {
    const kind = text(entry.kind, "case kind");
    const expected = object(entry.expected, `${kind}.expected`);
    const expectedProfile = profileKey(entry.expected_profile, `${kind}.expected_profile`);
    const decoded = objects(entry.events, `${kind}.events`).map((candidate, index) => event(candidate, `${kind}.events[${index}]`));
    if (kind === "DUPLICATE") {
      expect(decoded).toHaveLength(2);
      expect(decoded[0]).toEqual(decoded[1]);
      expect(decoded[0]?.profile).toBe(expectedProfile);
      expect(expected.decision).toBe("IDEMPOTENT_DUPLICATE_NO_VISIBLE_DUPLICATION");
    }
    if (kind === "GAP") {
      expect(decoded).toHaveLength(2);
      expect(decoded[0]?.profile).toBe(expectedProfile);
      expect(decoded[1]?.sequence).toBe(decoded[0]!.sequence + 2n);
      expect(expected.resnapshot_required).toBe(true);
    }
    if (kind === "CORRECTION") expect(decoded[0]?.operation).toBe("CORRECTION");
    if (kind === "TOMBSTONE") expect(decoded[0]?.operation).toBe("TOMBSTONE");
    if (kind === "EPOCH_RESET") {
      const prior = object(entry.previous_checkpoint, "epoch checkpoint");
      expect(decoded[0]?.epoch).not.toBe(prior.source_epoch);
      expect(decoded[0]?.sequence).toBe(1n);
      expect(expected.resnapshot_required).toBe(true);
    }
    if (kind === "RETENTION_BOUNDARY") {
      const requested = object(entry.requested_after, "requested after");
      const floor = object(entry.retention_floor, "retention floor");
      expect(exactSequence(floor.source_sequence, "floor sequence")).toBeGreaterThan(
        exactSequence(requested.source_sequence, "requested sequence"),
      );
      expect(expected.resnapshot_required).toBe(true);
    }
    if (kind === "CROSS_PROFILE_REJECTION") {
      expect(decoded[0]?.profile).not.toBe(expectedProfile);
      expect(expected.advance_checkpoint).toBe(false);
    }
    if (kind === "SNAPSHOT_TAIL") {
      const snapshot = object(entry.snapshot, "snapshot");
      const high = object(snapshot.snapshot_high_watermark, "high-watermark");
      const tail = object(snapshot.tail_starts_after, "tail start");
      expect(snapshot.schema_version).toBe("portal.execution.eds08.snapshot-tail.v1");
      expect(tail).toEqual(high);
      expect(decoded[0]?.profile).toBe(expectedProfile);
      expect(decoded[0]?.sequence).toBe(exactSequence(high.source_sequence, "high sequence") + 1n);
    }
  }
}

function assertPendingReturn(document: JsonObject, expectedGaps: Set<string>): void {
  if (document.publication_state !== "PENDING_TEMPLATE_NOT_EVIDENCE" || document.owner_accepted !== false) {
    throw new Error("pending return identity");
  }
  const entries = objects(document.entries, "pending entries");
  if (entries.length !== 18 || new Set(entries.map((entry) => text(entry.gap_id, "pending gap"))).size !== 18) {
    throw new Error("pending return gap inventory");
  }
  for (const entry of entries) {
    if (!expectedGaps.has(text(entry.gap_id, "pending gap")) || entry.state !== "SOURCE_GAP_CONFIRMED") {
      throw new Error("pending return falsely accepts a source");
    }
    for (const field of [
      "contract_revision",
      "schema_sha256",
      "fixture_index_sha256",
      "acceptance_evidence_sha256",
      "event_class_id",
      "event_contract",
      "capability_contract",
    ]) {
      if (entry[field] !== null) throw new Error("pending return contract leakage");
    }
    text(entry.reason, "pending reason");
  }
}

describe("EDS-08 source continuity contract lane", () => {
  it("pins the E7 18-gap inventory into seven deduplicated source-owner lanes", () => {
    const request = load(PACK, "owner-request.v1.json");
    const sourceGaps = objects(load(E7_PACK, "SOURCE_OWNER_GAPS.json").gaps, "E7 source gaps");
    const expectedGaps = new Set(sourceGaps.map((gap) => text(gap.gap_id, "E7 gap id")));
    expect(expectedGaps).toHaveLength(18);
    expect(request.baseline).toMatchObject({
      e7_return_pack_manifest_sha256: digest(E7_PACK, "e7-return-pack.manifest.json"),
      source_owner_gaps_sha256: digest(E7_PACK, "SOURCE_OWNER_GAPS.json"),
      event_continuity_ruling_sha256: digest(E7_PACK, "EVENT_CONTINUITY_REPORT.md"),
    });
    assertRequest(request, expectedGaps);

    const pending = load(PACK, "owner-return.pending.example.json");
    assertPendingReturn(pending, expectedGaps);
  });

  it("binds schemas, complete digest manifest, and all eight synthetic continuity cases", () => {
    const manifestEntries = new Map(
      readFileSync(resolve(PACK, "MANIFEST.sha256"), "utf8")
        .trim()
        .split("\n")
        .map((line) => line.split("  ", 2))
        .map(([hash, name]) => [name, `sha256:${hash}`]),
    );
    const indexedFiles = files(PACK).filter((name) => name !== "MANIFEST.sha256");
    expect(new Set(manifestEntries.keys())).toEqual(new Set(indexedFiles));
    for (const name of indexedFiles) expect(manifestEntries.get(name)).toBe(digest(PACK, name));

    const eventSchema = load(PACK, "source-event-envelope.v1.schema.json");
    const snapshotSchema = load(PACK, "snapshot-tail.v1.schema.json");
    expect(eventSchema.$id).toBe("https://schemas.primusspark.com/portal/execution/eds08-source-event-envelope.v1.schema.json");
    expect(object(eventSchema.$defs, "event schema defs").DecimalU64).toMatchObject({type: "string"});
    expect(snapshotSchema.$id).toBe("https://schemas.primusspark.com/portal/execution/eds08-snapshot-tail.v1.schema.json");
    assertFixtureCases(load(PACK, "fixtures/continuity-cases.v1.json"));
  });

  it("fails closed for a duplicate gap, numeric sequence and a falsely accepted pending return", () => {
    const sourceGaps = objects(load(E7_PACK, "SOURCE_OWNER_GAPS.json").gaps, "E7 source gaps");
    const expectedGaps = new Set(sourceGaps.map((gap) => text(gap.gap_id, "E7 gap id")));
    const duplicateGap = structuredClone(load(PACK, "owner-request.v1.json"));
    const lanes = objects(duplicateGap.owner_lanes, "duplicate lanes");
    const existingItem = structuredClone(objects(lanes[0]?.items, "event items")[0]!);
    const marketItems = lanes[1]?.items;
    if (!Array.isArray(marketItems)) throw new Error("market items must be an array");
    marketItems.push(existingItem);
    expect(() => assertRequest(duplicateGap, expectedGaps)).toThrow("duplicate gap");

    const numericSequence = structuredClone(load(PACK, "fixtures/continuity-cases.v1.json"));
    const fixtureCases = objects(numericSequence.cases, "fixture cases");
    const duplicateEvents = fixtureCases[0]?.events;
    if (!Array.isArray(duplicateEvents)) throw new Error("duplicate events must be an array");
    object(duplicateEvents[0], "duplicate event").source_sequence = 101;
    expect(() => assertFixtureCases(numericSequence)).toThrow("exact decimal string");

    const pending = structuredClone(load(PACK, "owner-return.pending.example.json"));
    objects(pending.entries, "pending entries")[0]!.state = "EVENT_SOURCE_ACCEPTED";
    expect(() => assertPendingReturn(pending, expectedGaps)).toThrow("falsely accepts a source");
  });
});
