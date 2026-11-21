import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020";
// Pure generator imports never write the generated contract or fixtures.
import { buildFixedReplayCompanionOpenApi, fixedReplayCompanionFixtures } from "../tooling/generate-research-fixed-replay-companion.mjs";

describe("named fixed replay transport contract", () => {
  it("publishes one bounded observation GET and validates every canonical custody fixture", () => {
    const document = buildFixedReplayCompanionOpenApi();
    const schemas = document.components.schemas;
    expect(Object.keys(document.paths)).toEqual(["/api/v1/quantbt/runs/{runId}/replay/observations"]);
    expect(document.paths[Object.keys(document.paths)[0]].get.operationId).toBe("researchFixedReplayObservationsGetV1");
    const validate = new Ajv2020({ strict: false }).compile({ ...schemas.FixedReplayPage, components: { schemas } });
    const fixtures = fixedReplayCompanionFixtures();
    for (const value of Object.values(fixtures)) {
      expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
    }
    const available = fixtures["research-fixed-replay-companion.available.valid.json"];
    for (const bad of [
      { ...available, orders: [] },
      { ...available, rows: Array(201).fill(available.rows[0]) },
      { ...available, manifest: { ...available.manifest, execution_profile_digest: "0".repeat(64) } },
    ]) {
      expect(validate(bad)).toBe(false);
    }
  });
});
