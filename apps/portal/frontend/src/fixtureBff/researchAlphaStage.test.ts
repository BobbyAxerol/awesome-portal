// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { answerReviewManager } from "../../../fixture-bff/review-manager";
import { resetScenario, setScenario } from "../../../fixture-bff/scenario";
import { scaled, setFixtureScale } from "../../e2e/bffScale";
import { readAlphaFleetItem } from "../execution/api/profileRead";

afterEach(() => { resetScenario(); setFixtureScale("small"); });

it("serves each Research-only alpha as a readable resource across workspace queries", () => {
  setScenario("positive");
  setFixtureScale("medium");
  const alphas = scaled().alphas.filter((alpha) => alpha.deployments.length === 0 && alpha.stages.includes("RESEARCH"));
  expect(alphas.length).toBeGreaterThan(0);
  for (const alpha of alphas) {
    for (const query of ["", "workspace_id=ws_TEST_ONLY", "workspace_id=ws_TEST_ONLY&deployment_id=dep_unknown"]) {
      const response = answerReviewManager("GET", `/resources/alphas/${alpha.id}`, new URLSearchParams(query), "populated");
      expect(response?.status, `${alpha.id}?${query}`).toBe(200);
      const body = response?.body as { data: { alpha: unknown } };
      const read = readAlphaFleetItem(body.data.alpha);
      expect(read, `${alpha.id}?${query}`).toMatchObject({ alphaId: alpha.id, stage: "RESEARCH", stages: ["RESEARCH"], deployments: [] });
    }
  }
});
