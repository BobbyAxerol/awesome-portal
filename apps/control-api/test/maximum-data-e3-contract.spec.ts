import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SCREEN_BFF_CATALOGUE } from "../src/screen-bff/catalogue";

interface E3Screen {
  screen_id: string;
  operation_id: string;
  response_contract: string;
  read_capabilities: readonly string[];
  required_surfaces: readonly string[];
}

interface E3Inventory {
  schema_version: string;
  screen_catalogue_contract: string;
  e2_semantic_registry_sha256: string;
  e2_semantic_contract_sha256: string;
  screens: readonly E3Screen[];
}

const E3_INVENTORY_PATH = resolve(
  __dirname,
  "../../../services/portal-execution-edge-rs/contracts/maximum-data-return-v1/e3-screen-inventory.v1.json",
);
const REQUIRED_SURFACES = [
  "shell_registry",
  "approval_inbox",
  "gate_r1",
  "gate_r2",
  "conditions_waivers",
  "paper_overview",
  "paper_workbench",
  "paper_exit_review",
  "full_blotter",
  "alpha_fleet",
  "alpha_360",
  "portfolio_360",
  "account_360",
  "accounts_and_bindings",
  "sandbox_execution_loop",
  "canary_execution_loop",
  "live_execution_loop",
  "operations_queue",
  "incident_detail",
  "command_center",
  "trade_replay",
  "vnm_execution_workbench",
] as const;

function inventory(): E3Inventory {
  return JSON.parse(readFileSync(E3_INVENTORY_PATH, "utf8")) as E3Inventory;
}

describe("EX-DP-03 maximum-data E3 screen inventory", () => {
  it("is an exact, drift-detecting projection of the frozen N20 screen catalogue", () => {
    const frozen = inventory();
    expect(frozen.schema_version).toBe("portal.execution.maximum-data.e3-screen-inventory.v1");
    expect(frozen.screen_catalogue_contract).toBe("portal.execution.screen-bff.v1");
    expect(frozen.e2_semantic_registry_sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(frozen.e2_semantic_contract_sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(frozen.screens).toHaveLength(23);
    expect(new Set(frozen.screens.map((screen) => screen.screen_id)).size).toBe(23);

    const actual = SCREEN_BFF_CATALOGUE.map((screen) => ({
      screen_id: screen.screenId,
      operation_id: screen.dataApi.operationId,
      response_contract: screen.dataApi.responseContract,
      read_capabilities: [...screen.readCapabilities],
    }));
    const expected = frozen.screens.map((screen) => ({
      screen_id: screen.screen_id,
      operation_id: screen.operation_id,
      response_contract: screen.response_contract,
      read_capabilities: [...screen.read_capabilities],
    }));
    expect(actual).toEqual(expected);
  });

  it("covers every required E3 demand surface without inventing another browser source", () => {
    const covered = new Set(inventory().screens.flatMap((screen) => screen.required_surfaces));
    for (const surface of REQUIRED_SURFACES) expect(covered.has(surface)).toBe(true);
  });
});
