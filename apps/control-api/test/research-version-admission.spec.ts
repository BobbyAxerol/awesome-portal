import { describe, expect, it } from "vitest";

import { IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST, IMPORTED_ALPHA_ADAPTER_ID } from "../src/research/imported-alpha.profile";
import { P04_DELTA_ADAPTER_CONTRACT_DIGEST, P04_DELTA_ADAPTER_ID, P04_DELTA_ALPHA_ID, P04_DELTA_ALPHA_VERSION_ID } from "../src/research/p04-delta.binding";
import { researchRunVersionPrecheck } from "../src/research/version-admission";

type Version = Parameters<typeof researchRunVersionPrecheck>[2];
const admin = { role: "ADMIN", status: "ACTIVE", mustChangePassword: false } as const;
const enabled = { FEATURE_RESEARCH_RUN_PRODUCER: "true", FEATURE_RESEARCH_IMPORTED_EXECUTION: "true" } as const;
const imported: Version = {
  alphaId: "p07-alpha", alphaVersionId: "av_p07_alpha_1_0_0", lifecycleState: "DRAFT",
  declaredContract: { schema_version: "research.alpha-source.v1" }, entrypoint: "generate_signals",
  sourceDigest: "a".repeat(64),
  binding: { alphaId: "p07-alpha", alphaVersionId: "av_p07_alpha_1_0_0",
    adapterId: IMPORTED_ALPHA_ADAPTER_ID, contractDigest: IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST },
};

describe("P07 registry / P10 run-version admission parity", () => {
  it("admits only the installed DRAFT import at version-precheck level", () => {
    expect(researchRunVersionPrecheck(admin, enabled, imported)).toMatchObject({ may_create_run: true, code: null });
    expect(researchRunVersionPrecheck(admin, { ...enabled, FEATURE_RESEARCH_IMPORTED_EXECUTION: "false" }, imported))
      .toMatchObject({ may_create_run: false, code: "RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE" });
    expect(researchRunVersionPrecheck(admin, enabled, { ...imported, binding: null }))
      .toMatchObject({ may_create_run: false, code: "RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE" });
    expect(researchRunVersionPrecheck(admin, enabled, { ...imported, lifecycleState: "SUPERSEDED" }))
      .toMatchObject({ may_create_run: false, code: "RESEARCH_RUN_ALPHA_NOT_ACTIVE" });
  });

  it("preserves caller and producer gates before exposing installed-version facts", () => {
    expect(researchRunVersionPrecheck(admin, { ...enabled, FEATURE_RESEARCH_RUN_PRODUCER: "false" }, imported))
      .toMatchObject({ may_create_run: false, code: "RESEARCH_RUN_PRODUCER_UNAVAILABLE" });
    expect(researchRunVersionPrecheck({ ...admin, role: "USER" }, enabled, imported))
      .toMatchObject({ may_create_run: false, code: "RESEARCH_RUN_CREATE_FORBIDDEN" });
  });

  it("admits exactly the active fixed P04 version, never a lookalike binding", () => {
    const fixed: Version = {
      ...imported, alphaId: P04_DELTA_ALPHA_ID, alphaVersionId: P04_DELTA_ALPHA_VERSION_ID,
      lifecycleState: "ACTIVE", sourceDigest: null,
      binding: { alphaId: P04_DELTA_ALPHA_ID, alphaVersionId: P04_DELTA_ALPHA_VERSION_ID,
        adapterId: P04_DELTA_ADAPTER_ID, contractDigest: P04_DELTA_ADAPTER_CONTRACT_DIGEST },
    };
    expect(researchRunVersionPrecheck(admin, enabled, fixed)).toMatchObject({ may_create_run: true, code: null });
    expect(researchRunVersionPrecheck(admin, enabled, {
      ...fixed, binding: { ...fixed.binding!, contractDigest: "b".repeat(64) },
    })).toMatchObject({ may_create_run: false, code: "RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE" });
  });
});
