/**
 * BE-P13 task 5 · the served command catalogue and the published schema/fixture
 * describe the same bytes. Pure: no database, no HTTP, no source call.
 *
 * Before this the service added `classification` to every entry and the N16B
 * fields to ops/emergency-close, and could compute `capability_state: PARTIAL`,
 * while the schema fixed DISABLED, did not list the N16B vocabulary and the
 * canonical fixture carried no `classification` at all. The service output was
 * therefore not schema-valid and no test compared the two.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import type { PortalUser } from "../src/domain";
import { ExecutionOperationsService } from "../src/operations/operations.service";
import { EXECUTION_COMMAND_CATALOG } from "../src/operations/catalog.generated";
import { catalogueEntryClassification } from "../src/operations/operator-tasks";

const contracts = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
const schema = JSON.parse(readFileSync(resolve(contracts, "schemas/execution-operations.v1.schema.json"), "utf8"));
const fixture = JSON.parse(readFileSync(resolve(contracts, "fixtures/execution-command-catalog.served.valid.json"), "utf8"));
// Pinned byte-for-byte by the N16B acceptance record; deliberately NOT regenerated.
const extract = JSON.parse(readFileSync(resolve(contracts, "fixtures/execution-command-catalog.valid.json"), "utf8"));
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
ajv.addSchema(schema);
const catalogue = ajv.getSchema(`${schema.$id}#/$defs/ServedCommandCatalogue`)!;
const extractSchema = ajv.getSchema(`${schema.$id}#/$defs/CommandCatalogue`)!;
const entrySchema = ajv.getSchema(`${schema.$id}#/$defs/CommandCatalogueEntry`)!;
const admin = { userId: "usr_be_p13", role: "ADMIN" } as PortalUser;
// The catalogue() path touches none of the injected collaborators.
const service = new ExecutionOperationsService(null as never, null as never, null as never, {} as never);
const served = (query: Record<string, unknown> = {}) =>
  service.catalogue(admin, { environment: "PAPER", workspace_id: "ws_be_p13", ...query } as never);

describe("BE-P13 command catalogue: schema, fixture and service agree", () => {
  it("serves a body the published CommandCatalogue schema accepts", () => {
    const body = served();
    expect(catalogue(body), JSON.stringify(catalogue.errors)).toBe(true);
    expect(body.scope.capability_state).toBe("DISABLED");
    expect(body.entries).toHaveLength(64);
  });

  it("serves exactly the canonical fixture entries (the fixture is a function of the same extract)", () => {
    const body = served();
    expect(JSON.parse(JSON.stringify(body.entries))).toEqual(fixture.entries);
    // Everything but the per-request scope is the fixture; the scope differs only by caller.
    const { scope: _servedScope, entries: _servedEntries, ...servedRest } = JSON.parse(JSON.stringify(body));
    const { scope: _fixtureScope, entries: _fixtureEntries, ...fixtureRest } = fixture;
    expect(servedRest).toEqual(fixtureRest);
  });

  it("the served fixture validates and carries classification on every entry; the pinned extract still validates as the looser CommandCatalogue", () => {
    expect(catalogue(fixture), JSON.stringify(catalogue.errors)).toBe(true);
    for (const entry of fixture.entries) expect(entry.classification, entry.key).toBeDefined();
    expect(extractSchema(extract), JSON.stringify(extractSchema.errors)).toBe(true);
    expect(catalogue(extract)).toBe(false); // the extract is not what the route serves
    expect(extract.entries.map((entry: { key: string }) => entry.key))
      .toEqual(fixture.entries.map((entry: { key: string }) => entry.key));
  });

  it("never classifies an entry CONNECTED: portal_reachable is false everywhere, so no sendable claim", () => {
    for (const entry of served().entries) {
      expect(entry.portal_reachable, entry.key).toBe(false);
      expect(entry.classification.state, entry.key).not.toBe("CONNECTED");
    }
    for (const entry of EXECUTION_COMMAND_CATALOG.entries)
      expect(catalogueEntryClassification(entry).state, entry.key).not.toBe("CONNECTED");
  });

  it("keeps the N16B primitive confirmed but dark, only on ops/emergency-close", () => {
    const entries = served().entries as Array<Record<string, unknown>>;
    const confirmed = entries.filter((entry) => entry.source_route_state === "CURRENT_PRIMITIVE_CONFIRMED");
    expect(confirmed.map((entry) => entry.key)).toEqual(["ops/emergency-close"]);
    expect(confirmed[0]).toMatchObject({
      blocked_reason: "N16B_RUNTIME_ACTIVATION_PENDING", runtime_active: false, portal_reachable: false,
      current_primitive_state: "ACCEPTED_CURRENT_PRIMITIVE", current_capability_id: "live.emergency-close",
      accepted_environments: ["LIVE"], accepted_target_types: ["ACCOUNT"],
      classification: { state: "SUPPORTED_BUT_INACTIVE", reason_code: "N16B_COMPATIBLE_COMMAND_IDENTITY_NOT_ACTIVATED" },
    });
    for (const entry of entries.filter((candidate) => candidate.key !== "ops/emergency-close")) {
      expect(entry.current_primitive_state, String(entry.key)).toBeUndefined();
      expect(entry.blocked_reason, String(entry.key)).not.toBe("N16B_RUNTIME_ACTIVATION_PENDING");
    }
  });

  it("a risk-tier filtered page is still schema-valid and a strict subset of the fixture", () => {
    const body = served({ risk_tier: "R3_LIVE_PROTECTIVE" });
    expect(catalogue(body), JSON.stringify(catalogue.errors)).toBe(true);
    expect(body.returned_entries).toBe(body.entries.length);
    expect(body.total_entries).toBe(64);
    for (const entry of body.entries)
      expect(fixture.entries.find((candidate: { key: string }) => candidate.key === entry.key)).toEqual(
        JSON.parse(JSON.stringify(entry)));
  });

  it("rejects what the service must never emit", () => {
    const entry = fixture.entries[0];
    expect(entrySchema(entry)).toBe(true);
    const { classification: _classification, ...withoutClassification } = entry;
    expect(entrySchema(withoutClassification)).toBe(true); // optional on the entry, required by ServedCommandCatalogue
    expect(catalogue({ ...fixture, entries: [withoutClassification, ...fixture.entries.slice(1)], returned_entries: 64 })).toBe(false);
    expect(entrySchema({ ...entry, classification: { state: "CONNECTED", reason_code: "COMMAND_TRANSPORT_ACTIVE" } })).toBe(false);
    expect(entrySchema({ ...entry, portal_reachable: true })).toBe(false);
    expect(entrySchema({ ...entry, runtime_active: false })).toBe(false); // N16B extras are not free-floating
    expect(entrySchema({ ...entry, blocked_reason: "N16B_RUNTIME_ACTIVATION_PENDING" })).toBe(false);
    const body = served();
    expect(catalogue({ ...body, scope: { ...body.scope, capability_state: "PARTIAL" } })).toBe(false);
    const emergency = fixture.entries.find((candidate: { key: string }) => candidate.key === "ops/emergency-close");
    expect(entrySchema(emergency)).toBe(true);
    const { runtime_active: _runtimeActive, ...incomplete } = emergency;
    expect(entrySchema(incomplete)).toBe(false);
  });
});
