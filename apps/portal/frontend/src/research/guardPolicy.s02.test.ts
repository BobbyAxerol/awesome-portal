/**
 * S02 guard rule (backend handoff §2, §5.4): requested-spec v1 carries no temporal guard, a clone never changes
 * its spec version, guards are required only of a declaration that really is v2, and an explicit v2 choice adopts
 * the published defaults into EMPTY fields only. Drafts come from the route's `emptyDraft()` and the serializer.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { RegistryListResponse } from "./alphaImportClient";
import type { AtlasDocument } from "./atlas";
import { admitsSpecV2, readProfiles } from "./dataDeclaration";
import { NewRunRoute as _route, constraintsFrom, emptyDraft } from "./NewRunRoute";
import {
  ZERO_APPLIES_NO_TEMPORAL_GUARD,
  type RunDraft,
  adoptGuardDefaults,
  advancedProblems,
  draftFromRequestedSpec,
  guardAppliesNoProtection,
  serializeRequestedSpec,
  usesSpecV2,
} from "./runDraft";

void _route;
const ROOT = join(__dirname, "..", "..", "..", "..", "..");
function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(ROOT, "packages/contracts/fixtures", name), "utf8")) as T;
}
const ATLAS = fixture<{ atlas: AtlasDocument }>("research-foundation.atlas-current.valid.json").atlas;
const REGISTRY = fixture<RegistryListResponse>("research-alpha-import.registry.valid.json");
const ALPHA = REGISTRY.entries[0]!;

const advancedBase = (wf: Partial<RunDraft["walkForward"]> = {}): RunDraft => {
  const draft: RunDraft = {
    ...emptyDraft(),
    bound: true,
    alphaId: ALPHA.alpha_id,
    alphaVersionId: ALPHA.alpha_version_id,
    strategyId: ALPHA.alpha_id,
    protocol: "advanced",
    datasetId: "crypto-binance-1m",
    symbol: "BTCUSDT",
    timeframe: "1h",
    optimizationMode: "mode_1_decay",
    optimizationSchedule: "global",
    optunaTrials: "3",
    engineReleaseId: ATLAS.current_release.release_id,
    configDigest: "sha256:cfg",
  };
  return { ...draft, walkForward: { ...draft.walkForward, start: "2026-01-01T00:00", endExclusive: "2026-06-01T00:00", splitMode: "2026-03-01T00:00", frequency: "weekly", windowMode: "expanding", ...wf } };
};
const limitsFor = (draft: RunDraft, profiles?: Parameters<typeof constraintsFrom>[3] extends infer D ? (D extends { profiles?: infer P } ? P : never) : never) =>
  constraintsFrom(ATLAS, REGISTRY.entries, ALPHA.alpha_version_id, { catalog: null, datasetId: draft.datasetId, profiles, usesSpecV2: usesSpecV2(draft) });

/** The Atlas's own advanced profiles, with one made to admit v2 so "another profile supports v2" is real. */
const PROFILES = readProfiles([
  { profile_id: "adv.v1", state: "ENABLED", protocol: "advanced", execution_route: "signal_notional", optimization_mode: "mode_1_decay", requested_spec_versions: ["research.requested-spec.v1"] },
  { profile_id: "adv.v2", state: "ENABLED", protocol: "advanced", execution_route: "signal_notional", optimization_mode: "mode_1_decay", requested_spec_versions: ["research.requested-spec.v1", "research.requested-spec.v2"] },
]);

describe("temporal guards are required only of a v2 declaration", () => {
  it("the release offers guards in this fixture (the rule, not the fixture, decides)", () => {
    expect(ATLAS.current_release.walk_forward_options?.temporal_guards).toBeTruthy();
    expect(admitsSpecV2(PROFILES![1]!)).toBe(true);
  });

  it("a v1 draft needs no guard even though another enabled profile supports v2", () => {
    const draft = advancedBase();
    expect(usesSpecV2(draft)).toBe(false);
    const limits = limitsFor(draft, PROFILES);
    expect(limits.temporalGuardsRequired).toBe(false);
    expect(advancedProblems(draft, limits)).toEqual([]);
  });

  it("only v1 profiles served: no guard requirement, also when the draft is v2-shaped", () => {
    const onlyV1 = PROFILES!.filter((profile) => !admitsSpecV2(profile));
    expect(limitsFor(advancedBase({ declaredV2: true }), onlyV1).temporalGuardsRequired).toBe(false);
  });

  it("an explicit v2 declaration requires the three guards, each by name", () => {
    const draft = advancedBase({ declaredV2: true });
    expect(usesSpecV2(draft)).toBe(true);
    const problems = advancedProblems(draft, limitsFor(draft, PROFILES));
    expect(problems).toEqual(["Label horizon is required.", "Purge is required.", "Embargo is required."]);
    const typed = advancedBase({ labelHorizonBars: "5" });
    expect(advancedProblems(typed, limitsFor(typed, PROFILES))).toEqual(["Purge is required.", "Embargo is required."]);
  });
});

describe("clone keeps its spec version", () => {
  it("a v1 clone validates and serializes v1 with no guard fields", () => {
    const original = serializeRequestedSpec(advancedBase());
    expect(original.schema_version).toBe("research.requested-spec.v1");
    const clone = draftFromRequestedSpec(original, advancedBase());
    expect(usesSpecV2(clone)).toBe(false);
    expect(clone.walkForward.declaredV2).toBeUndefined();
    expect(advancedProblems(clone, limitsFor(clone, PROFILES))).toEqual([]);
    const again = serializeRequestedSpec(clone);
    expect(again.schema_version).toBe("research.requested-spec.v1");
    expect(again.walk_forward).toEqual(original.walk_forward);
    expect(JSON.stringify(again.walk_forward)).not.toMatch(/label_horizon|purge|embargo|train_window/);
  });

  it("a v2 clone stays v2 and keeps its values and units", () => {
    const original = serializeRequestedSpec(advancedBase({ windowMode: "rolling", trainWindow: "30D", labelHorizonBars: "4", purgeBars: "2", embargoBars: "1" }));
    expect(original.schema_version).toBe("research.requested-spec.v2");
    const clone = draftFromRequestedSpec(original, advancedBase());
    expect(usesSpecV2(clone)).toBe(true);
    expect(clone.walkForward).toMatchObject({ labelHorizonBars: "4", purgeBars: "2", embargoBars: "1", trainWindow: "30D", declaredV2: true });
    expect(advancedProblems(clone, limitsFor(clone, PROFILES))).toEqual([]);
    expect(serializeRequestedSpec(clone)).toEqual(original);
  });
});

describe("explicit v2 adopts published defaults into empty fields only", () => {
  const ZEROS = { labelHorizonBars: 0, purgeBars: 0, embargoBars: 0 };

  it("fills the empty guards, marks v2, and the draft then validates", () => {
    const draft = advancedBase();
    const adopted = { ...draft, walkForward: adoptGuardDefaults(draft.walkForward, ZEROS) };
    expect(adopted.walkForward).toMatchObject({ labelHorizonBars: "0", purgeBars: "0", embargoBars: "0", declaredV2: true });
    expect(usesSpecV2(adopted)).toBe(true);
    expect(advancedProblems(adopted, limitsFor(adopted, PROFILES))).toEqual([]);
    expect(serializeRequestedSpec(adopted).schema_version).toBe("research.requested-spec.v2");
  });

  it("keeps what the reader typed, whitespace-only counts as empty", () => {
    const draft = advancedBase({ labelHorizonBars: "12", purgeBars: "  ", embargoBars: "3" });
    const wf = adoptGuardDefaults(draft.walkForward, { labelHorizonBars: 0, purgeBars: 6, embargoBars: 0 });
    expect(wf).toMatchObject({ labelHorizonBars: "12", purgeBars: "6", embargoBars: "3" });
  });

  it("a zero is not protection: it carries the published zero semantics", () => {
    expect(ZERO_APPLIES_NO_TEMPORAL_GUARD).toBe("ZERO_APPLIES_NO_TEMPORAL_GUARD");
    expect(["0", "00", "0.0"].map(guardAppliesNoProtection)).toEqual([true, true, true]);
    expect(["", "  ", "1", undefined].map((v) => guardAppliesNoProtection(v))).toEqual([false, false, false, false]);
  });
});
