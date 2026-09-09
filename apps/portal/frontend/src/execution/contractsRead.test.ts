/**
 * Phase 5 · the five contracts the §7.8 check kept naming as unread.
 *
 * Reading them properly meant finding out what they are. Two are screen
 * contracts with a live route and are read here from the **canonical
 * published fixture**, not from an object typed out by hand. Three are not
 * browser contracts at all, and the last test states the evidence for that
 * rather than leaving them on a list nobody can close.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { activationSentence, readStagedActivation } from "./stagedActivation";

const FIXTURES = join(__dirname, "../../../../../packages/contracts/fixtures");
const load = (name: string) => JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as unknown;

describe("staged activation capabilities — a live route nobody read", () => {
  const raw = load("execution-staged-activation.capabilities.valid.json");

  it("reads the published fixture, not a hand-typed copy of it", () => {
    const activation = readStagedActivation(raw)!;
    expect(activation.sourceIntegrationState).toBe("DARK");
    // `runtime_activation_requested: false` in the fixture is an explicit no,
    // which is the only thing that makes this false — an absent flag reads as
    // "an activation may have been requested" (the fail-closed registry).
    expect(activation.runtimeActivationRequested).toBe(false);
    expect(activation.capabilities.length).toBeGreaterThan(0);
    expect(activation.capabilities[0].capabilityKey).toBe("PROJECTION");
  });

  it("treats an absent activation request as possibly requested", () => {
    const patched = structuredClone(raw) as Record<string, unknown>;
    delete patched.runtime_activation_requested;
    delete patched.source_side_effect_requested;
    const activation = readStagedActivation(patched)!;
    expect(activation.runtimeActivationRequested).toBe(true);
    expect(activation.sourceSideEffectRequested).toBe(true);
  });

  it("treats an unreadable kill switch as engaged, and an unreadable enable as off", () => {
    const patched = structuredClone(raw) as Record<string, unknown>;
    const first = (patched.capabilities as Record<string, unknown>[])[0];
    delete first.kill_switch_engaged;
    delete first.source_enabled;
    const activation = readStagedActivation(patched)!;
    expect(activation.capabilities[0].killSwitchEngaged).toBe(true);
    expect(activation.capabilities[0].sourceEnabled).toBe(false);
  });

  it("names the first reason a capability is not live, in the order that decides it", () => {
    const activation = readStagedActivation(raw)!;
    expect(activationSentence(activation.capabilities[0])).toBe("kill switch engaged");
    expect(activationSentence({
      capabilityKey: "X", effectiveProfile: "live", desiredProfile: "live",
      sourceEnabled: true, runtimeEnabled: true, killSwitchEngaged: false, lastPlanId: null,
    })).toBe("live on live");
  });

  it("refuses another schema rather than reading it half-way", () => {
    expect(readStagedActivation({ ...(raw as Record<string, unknown>), schema_version: "other.v1" })).toBeNull();
  });
});

describe("canary live facts — published, and empty on purpose", () => {
  const raw = load("execution-canary-live-facts.empty.valid.json") as Record<string, unknown>;

  it("is a canary governance composition over live facts, in an empty state", () => {
    // The fixture's own words. A screen that renders this must not turn
    // `state: "empty"` into "no data yet" — the composition is the claim.
    expect(raw.composition).toBe("PORTAL_CANARY_GOVERNANCE_OVER_LIVE_FACTS");
    expect(raw.state).toBe("empty");
    expect(raw.completeness).toBe("COMPLETE");
    expect(raw.source_environment).toBe("live");
  });
});

describe("the other three are not browser contracts", () => {
  const cases = [
    ["execution-emergency-routing.source-dark.valid.json", "portal.execution.emergency-routing.v1"],
    ["execution-intercell-gateway.artifact-corpus.valid.json", "portal.execution.intercell-artifact-corpus.v1"],
    ["execution-production-readiness.game-day-corpus.valid.json", "portal.execution.production-readiness-game-day.v1"],
  ] as const;

  it("each says so in its own payload — source dark, or fixture only", () => {
    // This is why the unread-contract check kept naming them and no screen
    // could close them: they are EDS-12 evidence corpora, read by gates and
    // release evidence, never by a browser. The test records the evidence so
    // the next reader does not go looking for a screen to hang them on.
    for (const [file, schema] of cases) {
      const raw = load(file) as Record<string, unknown>;
      expect(raw.schema_version).toBe(schema);
      expect(raw.source_dark === true || raw.fixture_only === true).toBe(true);
    }
  });
});
