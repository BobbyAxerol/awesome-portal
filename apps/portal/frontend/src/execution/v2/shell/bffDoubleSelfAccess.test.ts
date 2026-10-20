/**
 * The e2e double for the two self-access reads is held to the same strict readers the app uses (FIXTURE_LAB / BFF_DOUBLE).
 * A double the reader would refuse proves nothing in a browser; a double that invents a row proves the wrong thing.
 */
import { describe, expect, it } from "vitest";

import {
  ELIGIBILITY_ROUTE, SELF_ACCESS_DOUBLE_WORKSPACES as WS, SELF_NAVIGATION_ROUTE, answerEligibility, answerSelfNavigation,
} from "../../../../e2e/bffDoubleSelfAccess";
import { readAccessEligibility, readAccessSelfNavigation, selfNavItem, type AccessSelfNavigation } from "../readers/accessSelf";
import { loadCanonical } from "../testkit/loadCanonical";

const CLOCK = { nowMs: 1_800_000_000_000, ceilingMs: 60_000 };
const q = (value: string) => new URLSearchParams(value);
const nav = (ws: string, env = "paper") => answerSelfNavigation("GET", SELF_NAVIGATION_ROUTE, q(`workspace_id=${ws}&environment=${env}`), CLOCK)!;
const readNav = (ws: string): AccessSelfNavigation => {
  const read = readAccessSelfNavigation(nav(ws).body);
  expect(read?.kind).toBe("navigation");
  return (read as { navigation: AccessSelfNavigation }).navigation;
};

describe("self-navigation double", () => {
  it("answers the canonical case, re-stamped to the caller's clock and echoing the asked scope", () => {
    const navigation = readNav("ws_other");
    expect(navigation).toMatchObject({ workspaceId: "ws_other", environment: "paper", observedAtMs: CLOCK.nowMs, validUntilMs: CLOCK.nowMs + CLOCK.ceilingMs });
    expect(navigation.features.map((item) => `${item.feature}:${item.state}`)).toEqual([
      "EXECUTION_PORTFOLIOS:ENTERABLE", "EXECUTION_ACCOUNTS_BINDINGS:ENTERABLE", "EXECUTION_OPERATIONS:HIDDEN", "EXECUTION_BLOTTER:ENTERABLE",
    ]);
    expect(readNav(WS.none).features.every((item) => item.state === "HIDDEN")).toBe(true);
    expect(selfNavItem(readNav(WS.legacy), "EXECUTION_PORTFOLIOS").state).toBe("HIDDEN");
  });

  it("changes nothing in the fixture's case but the scope and the two times", () => {
    const fixture = loadCanonical<{ cases: { type: string; case_name: string; value: Record<string, unknown> }[] }>("execution-access.synthetic");
    const canonical = fixture.cases.find((entry) => entry.type === "AccessSelfNavigation" && entry.case_name === "APP_ONLY_NOT_SOURCE_AUTHORITY")!.value;
    const served = nav("ws_other", "live").body as Record<string, unknown>;
    const { workspace_id: _w, environment: _e, observed_at_ms: _o, valid_until_ms: _v, ...rest } = served;
    const { workspace_id: _cw, environment: _ce, observed_at_ms: _co, valid_until_ms: _cv, ...canonicalRest } = canonical;
    expect(rest).toEqual(canonicalRest);
  });

  it("refuses like the controller: typed 403 / 503, strict query, GET only", () => {
    expect(nav(WS.denied)).toMatchObject({ status: 403, body: { error: { code: "ACCESS_DENIED" } } });
    expect(nav(WS.unavailable).status).toBe(503);
    expect(answerSelfNavigation("GET", SELF_NAVIGATION_ROUTE, q("workspace_id=ws_a"), CLOCK)?.status).toBe(400);
    expect(answerSelfNavigation("GET", SELF_NAVIGATION_ROUTE, q("workspace_id=ws_a&environment=paper&x=1"), CLOCK)?.status).toBe(400);
    expect(answerSelfNavigation("GET", SELF_NAVIGATION_ROUTE, q("workspace_id=ws_a&environment=staging"), CLOCK)?.status).toBe(400);
    expect(answerSelfNavigation("POST", SELF_NAVIGATION_ROUTE, q("workspace_id=ws_a&environment=paper"), CLOCK)).toBeNull();
    expect(answerSelfNavigation("GET", "/api/admin/other", q(""), CLOCK)).toBeNull();
  });

  it("the malformed workspace answers a body the strict reader refuses", () => {
    expect(readAccessSelfNavigation(nav(WS.malformed).body)).toBeNull();
  });
});

describe("eligibility double", () => {
  const ask = (ws: string, extra = "resource_kind=PORTFOLIO&resource_id=portfolio_TEST_ONLY&actions=portfolio.read") =>
    answerEligibility("GET", ELIGIBILITY_ROUTE, q(`workspace_id=${ws}&environment=paper&${extra}`), CLOCK)!;

  it("answers the one question the fixture states, through the strict reader", () => {
    const read = readAccessEligibility(ask(WS.appOnly).body);
    expect(read?.kind).toBe("eligibility");
    expect(read).toMatchObject({ eligibility: { workspaceId: WS.appOnly, observedAtMs: CLOCK.nowMs, validUntilMs: CLOCK.nowMs + CLOCK.ceilingMs } });
    const none = readAccessEligibility(ask(WS.none).body);
    expect(none?.kind).toBe("eligibility");
  });

  it("invents no row for any other question (typed 404), and keeps the strict query", () => {
    expect(ask(WS.appOnly, "resource_kind=PORTFOLIO&resource_id=portfolio_TEST_ONLY&actions=portfolio.update").status).toBe(404);
    expect(ask(WS.appOnly, "resource_kind=ACCOUNT&resource_id=portfolio_TEST_ONLY&actions=portfolio.read").status).toBe(404);
    expect(answerEligibility("GET", ELIGIBILITY_ROUTE, q("workspace_id=ws_a&environment=paper"), CLOCK)?.status).toBe(400);
    expect(ask(WS.denied).status).toBe(403);
    expect(ask(WS.unavailable).status).toBe(503);
    expect(answerEligibility("POST", ELIGIBILITY_ROUTE, q(""), CLOCK)).toBeNull();
  });
});
