import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type JsonRecord = Record<string, unknown>;

const PACK = resolve(
  __dirname,
  "../../../services/portal-execution-edge-rs/contracts/maximum-data-return-v1",
);
const ALL_PROFILES = ["PAPER", "SANDBOX", "LIVE", "CANARY"];

function load(name: string): JsonRecord {
  return JSON.parse(readFileSync(resolve(PACK, name), "utf8")) as JsonRecord;
}

function list(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value;
}

function object(value: unknown, path: string): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as JsonRecord;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || !value || value.trim() !== value) {
    throw new Error(`${path} must be nonblank text`);
  }
  return value;
}

function digest(name: string): string {
  return `sha256:${createHash("sha256").update(readFileSync(resolve(PACK, name))).digest("hex")}`;
}

function validateEntry(entry: JsonRecord, e3: ReadonlyMap<string, JsonRecord>, e4: ReadonlyMap<string, JsonRecord>): void {
  const fieldId = text(entry.field_id, "field_id");
  const field = e3.get(fieldId);
  const binding = e4.get(fieldId);
  if (!field || !binding) throw new Error("E3/E4 field missing");
  const kind = text(entry.implementation, "implementation");
  const profiles = list(entry.profiles, "profiles");
  if (!profiles.length || new Set(profiles).size !== profiles.length) throw new Error("profile scope");
  if (kind === "MANAGER_RELATION_PAGE") {
    if (
      entry.manager_relation_id !== field.source_relation_or_operation ||
      binding.binding_status !== "E5_NAMED_OPERATION_REQUIRED" ||
      JSON.stringify(profiles) !== JSON.stringify(ALL_PROFILES.slice(0, 3))
    ) throw new Error("manager binding");
    for (const key of ["existing_contract_id", "portal_delegate_id", "typed_status_code", "typed_absence_id"]) {
      if (entry[key] !== null) throw new Error("manager widening");
    }
  }
  if (kind === "TYPED_SOURCE_OWNER_GAP") {
    if (binding.binding_status !== "SOURCE_OWNER_GAP" || entry.typed_absence_id !== binding.typed_absence_id) {
      throw new Error("typed owner gap");
    }
  }
  if (kind === "TYPED_UNAVAILABLE" && (
    fieldId !== "canary_drift" || entry.typed_status_code !== "E5_CANARY_TWIN_COMPARISON_NOT_QUALIFIED" ||
    JSON.stringify(profiles) !== JSON.stringify(["CANARY"])
  )) throw new Error("Canary typed status");
}

describe("EX-DP-05 maximum-data existing-data publication", () => {
  it("keeps every E3/E4 field in exactly one named, bounded publication outcome", () => {
    const registry = load("e5-existing-data-publication.v1.json");
    const e3 = list(load("e3-field-definitions.v1.json").fields, "E3 fields").map((item) => object(item, "E3 field"));
    const e4 = list(load("e4-operation-bindings.v1.json").bindings, "E4 bindings").map((item) => object(item, "E4 binding"));
    const entries = list(registry.entries, "entries").map((item) => object(item, "entry"));
    expect(registry.schema_version).toBe("portal.execution.maximum-data.e5.existing-data-publication.v1");
    expect(registry.status).toBe("EDGE_IMPLEMENTED_SOURCE_DARK");
    expect(entries).toHaveLength(34);
    expect(new Set(entries.map((entry) => entry.field_id))).toEqual(new Set(e3.map((field) => field.field_id)));
    const e3ById = new Map(e3.map((field) => [text(field.field_id, "field"), field]));
    const e4ById = new Map(e4.map((binding) => [text(binding.field_id, "binding"), binding]));
    for (const entry of entries) validateEntry(entry, e3ById, e4ById);
    expect(entries.filter((entry) => entry.implementation === "MANAGER_RELATION_PAGE")).toHaveLength(19);
    expect(entries.filter((entry) => entry.implementation === "PORTAL_DERIVED_DELEGATE")).toHaveLength(4);
    expect(entries.filter((entry) => entry.implementation === "TYPED_SOURCE_OWNER_GAP")).toHaveLength(6);
  });

  it("pins bounded frame semantics, typed unavailable states, and all publication file digests", () => {
    const registry = load("e5-existing-data-publication.v1.json");
    const fixtures = load("e5-golden-fixtures.v1.json");
    const manifest = load("e5-publication.manifest.json");
    expect(registry.page_bounds).toEqual({
      maximum_page_rows: 200,
      maximum_response_bytes: 1048576,
      maximum_cursor_bytes: 4096,
      total_history_cap: false,
    });
    const authority = object(registry.authority, "authority");
    expect(authority.direct_database_access).toBe(false);
    expect(authority.raw_relation_or_sql_selection).toBe(false);
    expect(authority.runtime_activation).toBe(false);
    expect(authority.typed_unavailable_retained).toBe(true);
    const states = new Map(list(fixtures.fixtures, "fixtures").map((item) => {
      const fixture = object(item, "fixture");
      return [fixture.state, fixture.expected_outcome];
    }));
    expect(states).toEqual(new Map([
      ["POPULATED", "NAMED_PAGE"], ["EMPTY", "NAMED_PAGE"], ["PARTIAL", "NAMED_PAGE"],
      ["STALE", "NAMED_PAGE"], ["DUPLICATE", "TYPED_SOURCE_REJECTION"],
      ["GAP", "NOT_OBSERVABLE_FROM_MANAGER_PAGE"], ["CORRECTION", "NOT_OBSERVABLE_FROM_MANAGER_PAGE"],
      ["CONTINUATION", "NAMED_PAGE"],
    ]));
    expect(manifest.files).toEqual({
      "e5-existing-data-publication.v1.schema.json": digest("e5-existing-data-publication.v1.schema.json"),
      "e5-named-page.v1.schema.json": digest("e5-named-page.v1.schema.json"),
      "e5-existing-data-publication.v1.json": digest("e5-existing-data-publication.v1.json"),
      "e5-golden-fixtures.v1.json": digest("e5-golden-fixtures.v1.json"),
    });
    for (const name of [
      "e5-existing-data-publication.v1.schema.json", "e5-named-page.v1.schema.json",
      "e5-existing-data-publication.v1.json", "e5-golden-fixtures.v1.json", "e5-publication.manifest.json",
    ]) {
      const raw = readFileSync(resolve(PACK, name), "utf8");
      expect(raw).not.toContain("postgres://");
      expect(raw).not.toContain("redis://");
      expect(raw).not.toContain("SELECT ");
      expect(raw).not.toContain("/portal/execution/v4");
    }
  });
});
