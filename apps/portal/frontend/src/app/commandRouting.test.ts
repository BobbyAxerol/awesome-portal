/** Which overlay Cmd/Ctrl+K opens: the V2 bar only with the shell flag on AND on an Execution address. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { PortalRegistryDocument } from "../portal/contracts";
import { opensV2CommandBar } from "./commandRouting";

const registry: PortalRegistryDocument = JSON.parse(
  readFileSync(join(process.cwd(), "../registry/fixtures/registry.public.json"), "utf8"),
);

const EXECUTION_ROUTES = [
  "/execution",
  "/execution/operations",
  "/execution/operations/incidents/inc_1",
  "/deployments/alphas",
  "/deployments/alphas/al_1",
  "/deployments/accounts",
  "/deployments/portfolios",
  "/deployments/blotter",
  "/deployments/paper",
];
const OTHER_ROUTES = [
  "/",
  "/portal-map",
  "/research/quantbt",
  "/research/quantbt/runs/run_1",
  "/research/alphas",
  "/planning",
  "/planning/roadmap",
  "/backtests/approvals",
  "/data/catalog",
  "/governance",
  "/governance/approvals",
  "/governance/waivers",
  "/administration/profile-access",
];

describe("opensV2CommandBar", () => {
  it.each(EXECUTION_ROUTES)("shell flag on, %s -> V2 bar", (path) => {
    expect(opensV2CommandBar(registry, path, true)).toBe(true);
  });

  it.each(OTHER_ROUTES)("shell flag on, %s -> V1 palette", (path) => {
    expect(opensV2CommandBar(registry, path, false)).toBe(false);
    expect(opensV2CommandBar(registry, path, true)).toBe(false);
  });

  it.each([...EXECUTION_ROUTES, ...OTHER_ROUTES])("shell flag off, %s -> V1 palette", (path) => {
    expect(opensV2CommandBar(registry, path, false)).toBe(false);
  });

  it("defaults to the build's own shell flag, which is off in this suite", () => {
    expect(opensV2CommandBar(registry, "/execution")).toBe(false);
  });

  it("classifies /execution/* without a registry, so a bootstrap state never picks the wrong overlay", () => {
    expect(opensV2CommandBar(null, "/execution/fleet", true)).toBe(true);
    expect(opensV2CommandBar(null, "/", true)).toBe(false);
  });
});
