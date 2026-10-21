/**
 * The self-navigation projection as the rail's input, with the session ceiling (FE-057). Bodies come from the published
 * fixture (`execution-access.synthetic.valid.json`, observed 1792094400000, ceiling 1792094405000), never a hand copy.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { PortalRegistryDocument } from "../../../portal/contracts";
import { sidebarGroups } from "../../../portal/navigation";
import { readAccessSelfNavigation, type AccessSelfNavigation } from "../readers/accessSelf";
import { loadCanonical } from "../testkit/loadCanonical";
import { V2_CAPABILITY, V2_NAV_TOKEN, applyV2Nav, goToEntries } from "./roleNav";
import { SELF_NAV_TOKEN, expiredNavigationMessage, navCapabilities, selfNavigationGate } from "./selfNavGate";

type Draft = any;
const FIXTURE = loadCanonical<{ cases: { type: string; case_name: string; value: Draft }[] }>("execution-access.synthetic");
const bodyOf = (name: string): Draft => FIXTURE.cases.find((entry) => entry.type === "AccessSelfNavigation" && entry.case_name === name)!.value;
const nav = (raw: Draft): AccessSelfNavigation => {
  const read = readAccessSelfNavigation(raw);
  expect(read?.kind).toBe("navigation");
  return (read as { navigation: AccessSelfNavigation }).navigation;
};
const APP_ONLY = nav(bodyOf("APP_ONLY_NOT_SOURCE_AUTHORITY"));
const HIDDEN = nav(bodyOf("ABSENT_PERMISSION"));
const OBSERVED = APP_ONLY.observedAtMs;
const UNTIL = APP_ONLY.validUntilMs;

const registry: PortalRegistryDocument = JSON.parse(readFileSync(join(process.cwd(), "../registry/fixtures/registry.public.json"), "utf8"));
const groups = sidebarGroups(registry, { capabilities: ["administration.profile_access.manage"] });
const railLabels = (capabilities: ReadonlySet<string>) => applyV2Nav(groups, capabilities).flatMap((group) => group.items.map((item) => item.label));

describe("the fixture the gate is tested with", () => {
  it("is the published ceiling: observed < valid_until, both integers, and APP_ONLY lists three of the four", () => {
    expect(OBSERVED).toBe(1792094400000);
    expect(UNTIL).toBe(1792094405000);
    expect(APP_ONLY.features.filter((item) => item.state === "ENTERABLE").map((item) => item.feature)).toEqual([
      "EXECUTION_PORTFOLIOS", "EXECUTION_ACCOUNTS_BINDINGS", "EXECUTION_BLOTTER",
    ]);
  });
});

describe("selfNavigationGate", () => {
  it("no projection read is today's behaviour: no token, not an error", () => {
    expect(selfNavigationGate(null, OBSERVED)).toEqual({ kind: "none", tokens: new Set() });
  });

  it("inside the ceiling: one token per ENTERABLE feature, and the ceiling is reported, not extended", () => {
    const gate = selfNavigationGate(APP_ONLY, UNTIL - 1);
    expect(gate.kind).toBe("live");
    expect([...gate.tokens].sort()).toEqual([V2_NAV_TOKEN.accounts, V2_NAV_TOKEN.blotter, V2_NAV_TOKEN.portfolios].sort());
    expect(gate).toMatchObject({ validUntilMs: UNTIL });
    // Every token is one the rail rules know; none is invented here.
    for (const token of Object.values(SELF_NAV_TOKEN)) expect(Object.values(V2_NAV_TOKEN)).toContain(token);
  });

  it("a token is the served feature id and nothing else: no invented capability name, and none in the server namespace (DEBT-UXM07-005)", () => {
    for (const [feature, token] of Object.entries(SELF_NAV_TOKEN)) expect(token).toBe(`nav:${feature}`);
    expect(Object.keys(SELF_NAV_TOKEN)).toEqual(["EXECUTION_PORTFOLIOS", "EXECUTION_ACCOUNTS_BINDINGS", "EXECUTION_OPERATIONS", "EXECUTION_BLOTTER"]);
    // The four names that read like server capabilities are gone from the client vocabulary altogether.
    const gone = ["execution.portfolios.read", "execution.accounts.read", "execution.operations.read", "portal.execution.blotter.read"];
    for (const value of [...Object.values(V2_CAPABILITY), ...Object.values(V2_NAV_TOKEN)]) expect(gone).not.toContain(value);
    // A menu token can never be mistaken for a session capability: the server's finite namespace is dotted lower-case.
    for (const token of Object.values(V2_NAV_TOKEN)) expect(token).toMatch(/^nav:[A-Z_]+$/);
  });

  it("a HIDDEN feature gives no token, live or not", () => {
    const gate = selfNavigationGate(HIDDEN, OBSERVED);
    expect(gate.kind).toBe("live");
    expect(gate.tokens.size).toBe(0);
  });

  it("at the ceiling, exactly: expired, no token, and a reason that says whose clock and what ended", () => {
    const gate = selfNavigationGate(APP_ONLY, UNTIL);
    expect(gate.kind).toBe("expired");
    expect(gate.tokens.size).toBe(0);
    if (gate.kind !== "expired") throw new Error("unreachable");
    expect(gate.reason).toBe("SESSION_CEILING_PASSED");
    expect(gate.message).toBe("The navigation read for your session ended at 2026-10-15T20:00:05.000Z (Portal clock) and is no longer shown. Retry to check again.");
    expect(gate.message).not.toMatch(/valid until|permission|expires? in/i);
  });

  it("one millisecond after the ceiling, a day after it, and with the clock at MAX_SAFE_INTEGER: all expired, no grace", () => {
    for (const now of [UNTIL + 1, UNTIL + 86_400_000, Number.MAX_SAFE_INTEGER]) {
      const gate = selfNavigationGate(APP_ONLY, now);
      expect(gate.kind, String(now)).toBe("expired");
      expect(gate.tokens.size, String(now)).toBe(0);
    }
  });

  it("an unreadable client clock shuts the rail with its own reason, not the session's", () => {
    for (const now of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const gate = selfNavigationGate(APP_ONLY, now);
      expect(gate).toMatchObject({ kind: "expired", reason: "CLOCK_UNREADABLE" });
      expect(gate.tokens.size).toBe(0);
    }
  });

  it("a ceiling beyond the Date range still reads honestly (no RangeError, no timestamp invented)", () => {
    const far = nav({ ...bodyOf("APP_ONLY_NOT_SOURCE_AUTHORITY"), observed_at_ms: 1, valid_until_ms: Number.MAX_SAFE_INTEGER });
    expect(selfNavigationGate(far, 10).kind).toBe("live");
    expect(expiredNavigationMessage("SESSION_CEILING_PASSED", Number.MAX_SAFE_INTEGER)).toBe("The navigation read for your session ended and is no longer shown. Retry to check again.");
  });

  it("is a pure function of its inputs: the clock is a parameter and the body is not mutated", () => {
    const frozen = JSON.stringify(APP_ONLY);
    const first = selfNavigationGate(APP_ONLY, UNTIL - 1);
    selfNavigationGate(APP_ONLY, UNTIL + 1);
    const again = selfNavigationGate(APP_ONLY, UNTIL - 1);
    expect(JSON.stringify(APP_ONLY)).toBe(frozen);
    expect([...again.tokens]).toEqual([...first.tokens]);
  });

  it("the gate is re-evaluated, not remembered: the same body is live at one time and shut at the next", () => {
    expect(selfNavigationGate(APP_ONLY, UNTIL - 1).kind).toBe("live");
    expect(selfNavigationGate(APP_ONLY, UNTIL).kind).toBe("expired");
  });
});

describe("the rail built from the gate", () => {
  const session = new Set<string>(["governance.r1.read"]);

  it("a live projection lists the entries it enterables, beside what the session itself holds", () => {
    const live = railLabels(navCapabilities(session, selfNavigationGate(APP_ONLY, OBSERVED)));
    expect(live).toEqual(expect.arrayContaining(["Overview", "Portfolios", "Alpha Fleet", "Accounts", "Approvals"]));
    expect(live).not.toContain("Operations");
  });

  it("an expired projection leaves exactly the session-only rail: no stale Portfolios/Accounts, and the session part is untouched", () => {
    const expired = railLabels(navCapabilities(session, selfNavigationGate(APP_ONLY, UNTIL)));
    expect(expired).toEqual(railLabels(session));
    expect(expired).not.toContain("Portfolios");
    expect(expired).not.toContain("Accounts");
    expect(expired).toContain("Approvals");
  });

  it("the command bar's Go to follows the same gate: Blotter is offered live, gone when expired", () => {
    const goTo = (now: number) => goToEntries(groups, navCapabilities(session, selfNavigationGate(APP_ONLY, now))).map((entry) => entry.label);
    expect(goTo(UNTIL - 1)).toContain("Blotter");
    expect(goTo(UNTIL)).not.toContain("Blotter");
    expect(goTo(UNTIL)).not.toContain("Portfolios");
  });

  it("the projection never removes anything the session holds, expired or not", () => {
    const withApprovals = new Set<string>(["governance.r2.read"]);
    for (const now of [OBSERVED, UNTIL, UNTIL + 1]) {
      expect(railLabels(navCapabilities(withApprovals, selfNavigationGate(HIDDEN, now)))).toContain("Approvals");
    }
  });
});
