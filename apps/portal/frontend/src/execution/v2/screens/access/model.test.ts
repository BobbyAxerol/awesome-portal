/**
 * Access self-view model: rows are derived from the capability set and from
 * nothing else, so the four presets of D12 (roleNav `V2_ROLE_PRESETS`) must
 * produce the rows their capabilities imply and no more.
 */
import { describe, expect, it } from "vitest";

import { V2_CAPABILITY, V2_ROLE_PRESETS } from "../../shell/roleNav";
import type { AccessGrant } from "../../readers/accessEffective";
import {
  ADMIN_CAPABILITY,
  ROW_CAP,
  grantWindow,
  doRows,
  needsText,
  otherCapabilities,
  reasonText,
  selectorText,
  seeRows,
  validUntilText,
  validFromText,
  environmentsText,
  type CapabilityRow,
} from "./model";

const none = new Set<string>();
const byId = (rows: CapabilityRow[]) => Object.fromEntries(rows.map((r) => [r.id, r]));
const allowed = (rows: CapabilityRow[]) => rows.filter((r) => r.allowed).map((r) => r.id);

describe("no capability", () => {
  it("shows the open entries as open and every guarded one as Not shown with what it needs", () => {
    const see = byId(seeRows(none));
    expect(see["nav:EXECUTION_COMMAND_CENTER"].allowed).toBe(true);
    expect(see["nav:EXECUTION_COMMAND_CENTER"].reason).toBe("No capability needed");
    expect(see["nav:PROFILE_ACCESS"].allowed).toBe(true);
    expect(see["nav:EXECUTION_PORTFOLIOS"].allowed).toBe(false);
    expect(see["nav:EXECUTION_PORTFOLIOS"].reason).toBe("Needs execution.portfolios.read");
    expect(see["nav:EXECUTION_APPROVALS"].reason).toMatch(/^Needs any of governance\.r1\.read, /);
    expect(see["gate:live"].allowed).toBe(false);
    expect(allowed(doRows(none))).toEqual([]);
  });

  it("does not list the hidden entries", () => {
    const ids = seeRows(none).map((r) => r.id);
    for (const hidden of ["EXECUTION_WAIVERS", "EXECUTION_EXIT_REVIEWS", "EXECUTION_ADMIN_ACTIONS", "PAPER_TRADING"]) {
      expect(ids).not.toContain(`nav:${hidden}`);
    }
  });
});

describe("the four presets", () => {
  it("manager sees everything the rail lists and decides at all four gates", () => {
    const caps = V2_ROLE_PRESETS.manager;
    expect(seeRows(caps).every((r) => r.allowed)).toBe(true);
    expect(allowed(doRows(caps))).toEqual(["decide:r1", "decide:r2", "decide:canary", "decide:live"]);
    const rows = byId(doRows(caps));
    expect(rows["manage:grants"].allowed).toBe(false);
    expect(rows["manage:grants"].reason).toBe("Needs administration.profile_access.manage");
    expect(rows["decide:r1"].reason).toBe("governance.r1.decide");
  });

  it("researcher sees only R1 and the open entries, and decides nothing", () => {
    const caps = V2_ROLE_PRESETS.researcher;
    const see = byId(seeRows(caps));
    expect(see["gate:r1"].allowed).toBe(true);
    expect(see["gate:r2"].allowed).toBe(false);
    expect(see["nav:EXECUTION_PORTFOLIOS"].allowed).toBe(false);
    expect(see["nav:EXECUTION_ACCOUNTS_BINDINGS"].allowed).toBe(false);
    expect(see["nav:EXECUTION_OPERATIONS"].allowed).toBe(false);
    expect(see["nav:EXECUTION_APPROVALS"].allowed).toBe(true);
    expect(see["nav:EXECUTION_APPROVALS"].reason).toBe("governance.r1.read");
    expect(allowed(doRows(caps))).toEqual([]);
  });

  it("operator sees the operational entries and no gate, and decides nothing", () => {
    const caps = V2_ROLE_PRESETS.operator;
    const see = byId(seeRows(caps));
    for (const id of ["nav:EXECUTION_PORTFOLIOS", "nav:EXECUTION_ACCOUNTS_BINDINGS", "nav:EXECUTION_OPERATIONS", "nav:EXECUTION_BLOTTER"]) {
      expect(see[id].allowed, id).toBe(true);
    }
    expect(see["nav:EXECUTION_APPROVALS"].allowed).toBe(false);
    expect(GATE_IDS.every((id) => !see[id].allowed)).toBe(true);
    expect(allowed(doRows(caps))).toEqual([]);
  });

  it("reviewer decides at all four gates but does not see accounts or operations", () => {
    const caps = V2_ROLE_PRESETS.reviewer;
    const see = byId(seeRows(caps));
    expect(see["nav:EXECUTION_PORTFOLIOS"].allowed).toBe(true);
    expect(see["nav:EXECUTION_ACCOUNTS_BINDINGS"].allowed).toBe(false);
    expect(see["nav:EXECUTION_OPERATIONS"].allowed).toBe(false);
    expect(see["nav:EXECUTION_BLOTTER"].allowed).toBe(false);
    expect(allowed(doRows(caps))).toEqual(["decide:r1", "decide:r2", "decide:canary", "decide:live"]);
  });

  it("an owner session (administration and governance, no execution names) manages grants and users", () => {
    const caps = new Set<string>([
      ADMIN_CAPABILITY.profileAccessManage, ADMIN_CAPABILITY.usersManage,
      V2_CAPABILITY.governanceR1Read, V2_CAPABILITY.governanceR1Decide,
    ]);
    const rows = byId(doRows(caps));
    expect(rows["manage:grants"].allowed).toBe(true);
    expect(rows["manage:users"].allowed).toBe(true);
    expect(rows["decide:r2"].allowed).toBe(false);
    expect(byId(seeRows(caps))["nav:EXECUTION_PORTFOLIOS"].allowed).toBe(false);
  });
});

const GATE_IDS = ["gate:r1", "gate:r2", "gate:canary", "gate:live"];

describe("derived text", () => {
  it("names a need in words", () => {
    expect(needsText(undefined)).toBeNull();
    expect(needsText({ allOf: ["a.b", "c.d"] })).toBe("a.b and c.d");
    expect(needsText({ anyOf: ["a.b", "c.d"] })).toBe("any of a.b, c.d");
    expect(needsText({ allOf: ["a.b"], anyOf: ["c.d"] })).toBe("a.b, plus c.d");
  });

  it("keeps capabilities no row names, sorted", () => {
    expect(otherCapabilities(new Set(["z.last", "governance.r1.read", "a.first"]))).toEqual(["a.first", "z.last"]);
    expect(otherCapabilities(V2_ROLE_PRESETS.manager)).toEqual([]);
  });

  it("knows only the reasons the contract names, and says so for any other", () => {
    expect(reasonText("POLICY_PENDING").known).toBe(true);
    expect(reasonText("OWNER_RECOVERY_NOT_APPROVED").known).toBe(true);
    expect(reasonText("SOMETHING_NEW")).toEqual({ text: "This reason is not in this build's dictionary.", known: false });
  });
});

describe("grant text", () => {
  const grant = (over: Partial<AccessGrant>): AccessGrant => ({
    grantId: "g1", action: "portfolio.read", effect: "ALLOW",
    selector: { kind: "OWN_ALPHA" }, environments: ["paper", "live"],
    validFrom: Date.UTC(2026, 9, 17, 9, 14) as never, validUntil: null,
    revision: "r1", current: true, tsAuthority: "NOT_REQUIRED", ...over,
  });

  it("prints UTC instants in house style and the published absence of an end", () => {
    expect(validFromText(grant({}))).toBe("17 Oct 09:14Z");
    expect(validUntilText(grant({}))).toBe("No end date");
    expect(validUntilText(grant({ validUntil: Date.UTC(2026, 11, 31, 23, 59) as never }))).toBe("31 Dec 23:59Z");
    expect(environmentsText(grant({}))).toBe("Paper, Live");
  });

  it("shortens a long id list and keeps the count honest", () => {
    expect(selectorText({ kind: "EXPLICIT_RESOURCE_SET", resourceKind: "PORTFOLIO", ids: ["a", "b", "c", "d", "e"] }))
      .toBe("Portfolio: a, b, c and 2 more");
    expect(selectorText({ kind: "PORTFOLIO_MEMBERSHIP", portfolioIds: ["pf1"] })).toBe("Portfolio membership: pf1");
    expect(selectorText({ kind: "ROOT_SCOPE", rootId: "root1" })).toBe("Root scope: root1");
    expect(selectorText({ kind: "OWN_ALPHA" })).toBe("Alphas you own");
  });
});

describe("grantWindow (200-row DOM cap)", () => {
  const grants = (n: number): AccessGrant[] => Array.from({ length: n }, (_, i) => ({
    grantId: `g${i}`, action: "portfolio.read", effect: "ALLOW", selector: { kind: "OWN_ALPHA" }, environments: ["paper"],
    validFrom: 1 as AccessGrant["validFrom"], validUntil: null, revision: "r", current: true, tsAuthority: "NOT_REQUIRED",
  }));

  it.each([[0, 0, null], [1, 1, null], [200, 200, null], [201, 200, "Showing 200 of 201 grants"], [500, 200, "Showing 200 of 500 grants"]])(
    "%i grants draws %i with label %s", (n, drawn, label) => {
      const view = grantWindow(grants(n));
      expect(ROW_CAP).toBe(200);
      expect(view.rows).toHaveLength(drawn);
      expect(view.total).toBe(n);
      expect(view.label).toBe(label);
    },
  );

  it("keeps the server order and never reorders or drops silently", () => {
    const all = grants(350);
    const view = grantWindow(all);
    expect(view.rows.map((g) => g.grantId)).toEqual(all.slice(0, 200).map((g) => g.grantId));
  });
});
