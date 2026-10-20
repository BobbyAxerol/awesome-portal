/**
 * The strict command-catalogue reader, honesty rules (UXM-09, FIXTURE_LAB). The tiered conformance suite is `commandCatalogue.conformance.test.ts`;
 * this file holds the rules a screen leans on, each as a small readable case.
 */
import { describe, expect, it } from "vitest";

import { readCommandCatalogue } from "../../adminCatalog";
import { loadCanonical } from "../testkit/loadCanonical";
import { catalogueOf, readCommandCatalogueV2 } from "./commandCatalogue";

type Draft = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const CATALOGUE: Draft = loadCanonical("execution-command-catalog");
const clone = <T,>(value: T): T => structuredClone(value);
const reasonOf = (raw: unknown) => {
  const answer = readCommandCatalogueV2(raw);
  return answer.kind === "refused" ? answer.reason : answer.kind;
};

describe("commandCatalogue · what a read is", () => {
  it("the published body reads whole: 64 commands, nothing defaulted, null stays null", () => {
    const c = catalogueOf(CATALOGUE)!;
    expect(c.entries).toHaveLength(64);
    const unpublished = c.entries.find((e) => e.key === "ops/streams")!;
    expect(unpublished).toMatchObject({ httpMethod: null, httpPath: null, routeState: "UNPUBLISHED", blockedReason: "TRADING_SYSTEM_HTTP_ROUTE_UNPUBLISHED", classification: null });
    const observed = c.entries.find((e) => e.key === "account/policy")!;
    expect(observed).toMatchObject({ httpMethod: "PUT", httpPath: "/v1/admin/accounts/{account_id}/policy", riskTier: "R1_PAPER_MUTATION", sourceRiskTier: "R0_READ" });
  });

  it("both risk tiers travel and are not interchangeable: the Portal's is not the source's", () => {
    const c = catalogueOf(CATALOGUE)!;
    expect(c.entries.filter((e) => e.riskTier !== e.sourceRiskTier).length).toBeGreaterThan(0);
    for (const e of c.entries) expect(e.riskTier).toBe(CATALOGUE.entries.find((raw: Draft) => raw.key === e.key).risk_tier);
  });

  it("an empty catalogue is a real zero, not an unknown", () => {
    const body = clone(CATALOGUE);
    body.entries = [];
    body.returned_entries = 0;
    const c = catalogueOf(body)!;
    expect(c.returnedEntries).toBe(0);
    expect(c.entries).toEqual([]);
    expect(c.totalEntries).toBe(64);
  });

  it("agrees with the V1 reader on every entry fact the screens use, so the page cannot change", () => {
    const v1 = readCommandCatalogue(clone(CATALOGUE))!;
    const v2 = catalogueOf(CATALOGUE)!;
    expect(v2.entries.map((e) => [e.key, e.command, e.action, e.group, e.riskTier, e.sourceRiskTier, e.ownerReviewRequired, e.planRequired, e.applyRequired, e.verifyRequired, e.portalReachable, e.routeState, e.httpMethod, e.httpPath, e.blockedReason, e.sourceReference]))
      .toEqual(v1.entries.map((e) => [e.key, e.command, e.action, e.group, e.riskTier, e.sourceRiskTier, e.ownerReviewRequired, e.planRequired, e.applyRequired, e.verifyRequired, e.portalReachable, e.routeState, e.httpMethod, e.httpPath, e.blockedReason, e.sourceReference]));
  });

  it("reads a frozen body and leaves it as it was", () => {
    const body = clone(CATALOGUE);
    const before = JSON.stringify(body);
    const deepFreeze = (node: unknown): void => {
      if (typeof node === "object" && node !== null) {
        Object.values(node).forEach(deepFreeze);
        Object.freeze(node);
      }
    };
    deepFreeze(body);
    expect(catalogueOf(body)).not.toBeNull();
    expect(JSON.stringify(body)).toBe(before);
  });
});

describe("commandCatalogue · refusals are typed, never repaired", () => {
  it("a command that claims to be sendable is refused, not shown as enabled and not clamped to disabled", () => {
    const reach = clone(CATALOGUE);
    reach.entries[3].portal_reachable = true;
    expect(readCommandCatalogueV2(reach)).toEqual({ kind: "refused", reason: "sendable_claim", at: "$.entries[3].portal_reachable" });
    const connected = clone(CATALOGUE);
    connected.entries[5].classification = { state: "CONNECTED", reason_code: "COMMAND_TRANSPORT_ACTIVE" };
    expect(readCommandCatalogueV2(connected)).toEqual({ kind: "refused", reason: "sendable_claim", at: "$.entries[5].classification.state" });
    expect(catalogueOf(reach)).toBeNull();
  });

  it("an enabled capability, a live profile or a fresh scope is not this contract", () => {
    for (const [path, value] of [[["capability", "state"], "ENABLED"], [["delivery_profile"], "live"], [["scope", "freshness_state"], "FRESH"], [["scope", "capability_state"], "PARTIAL"]] as const) {
      const body = clone(CATALOGUE);
      let node = body;
      for (const step of path.slice(0, -1)) node = node[step];
      node[path[path.length - 1]!] = value;
      expect(reasonOf(body), path.join(".")).toBe("constant_mismatch");
    }
  });

  it("two entries with one operation key void the read, whichever order", () => {
    const body = clone(CATALOGUE);
    body.entries[10] = clone(body.entries[2]);
    expect(readCommandCatalogueV2(body)).toEqual({ kind: "refused", reason: "duplicate_operation", at: "$.entries[10].key" });
  });

  it("no unknown key at any level: a server message beside the codes is refused whole, and its words reach nobody", () => {
    for (const place of [[], ["capability"], ["source"], ["scope"], ["entries", 0]] as const) {
      const body = clone(CATALOGUE);
      let node = body;
      for (const step of place) node = node[step];
      node.message = "SERVER_PROSE_PROBE: this command is available";
      const answer = readCommandCatalogueV2(body);
      expect(answer).toMatchObject({ kind: "refused", reason: "unknown_key" });
      expect(JSON.stringify(answer)).not.toContain("SERVER_PROSE_PROBE");
    }
  });

  it("the read exposes codes and identifiers only: no field of an entry is prose the server chose for the screen", () => {
    const c = catalogueOf(CATALOGUE)!;
    for (const e of c.entries) {
      expect(Object.keys(e).sort()).toEqual([
        "action", "applyRequired", "blockedReason", "classification", "command", "group", "httpMethod", "httpPath", "key", "ownerReviewRequired", "planRequired",
        "portalReachable", "riskTier", "routeState", "sourceReference", "sourceRiskTier", "verifyRequired",
      ]);
    }
  });

  it("an unknown word is not a state: a group, tier, route state or reason outside the vocabulary refuses", () => {
    for (const [field, value] of [["group", "NEW_GROUP"], ["risk_tier", "R5_MADE_UP"], ["source_route_state", "CONFIRMED"], ["blocked_reason", "NOT_YET"], ["http_method", "TRACE"]] as const) {
      const body = clone(CATALOGUE);
      body.entries[0][field] = value;
      expect(reasonOf(body), field).toBe("bad_enum");
    }
  });

  it("a flag that cannot be read is not 'required' and not 'not required': the body is refused", () => {
    for (const field of ["owner_review_required", "plan_required", "apply_required", "verify_required"]) {
      for (const value of [null, "true", 1, undefined]) {
        const body = clone(CATALOGUE);
        if (value === undefined) delete body.entries[0][field];
        else body.entries[0][field] = value;
        expect(reasonOf(body), `${field}=${String(value)}`).toBe(value === undefined ? "missing_key" : "bad_value");
      }
    }
  });

  it("a stated count that is not the count held is refused, and a catalogue cannot hold more than 64", () => {
    const short = clone(CATALOGUE);
    short.returned_entries = 63;
    expect(reasonOf(short)).toBe("count_mismatch");
    const total = clone(CATALOGUE);
    total.total_entries = 65;
    expect(reasonOf(total)).toBe("constant_mismatch");
    const many = clone(CATALOGUE);
    many.entries.push(clone(many.entries[0]));
    many.returned_entries = 65;
    expect(reasonOf(many)).toBe("out_of_bounds");
  });

  it("a body of another schema_version is typed, and a non-body is not a catalogue", () => {
    expect(readCommandCatalogueV2({ ...clone(CATALOGUE), schema_version: "execution.command-catalog.v2" })).toEqual({ kind: "unsupported_shape", schemaVersion: "execution.command-catalog.v2" });
    for (const bad of [null, undefined, 0, "catalogue", [], () => 1]) expect(reasonOf(bad)).toBe("not_an_object");
  });

  it("never throws, even when a getter does", () => {
    const hostile = new Proxy(clone(CATALOGUE), { get() { throw new Error("boom"); }, ownKeys() { throw new Error("boom"); } });
    expect(() => readCommandCatalogueV2(hostile)).not.toThrow();
    expect(readCommandCatalogueV2(hostile).kind).toBe("refused");
  });
});
