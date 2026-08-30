import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  readScreenBffContract,
  SCREEN_BFF_UI_STATES,
  screenBffDataFetchAllowed,
} from "./screenBff";

const FIXTURES = join(__dirname, "../../../../../packages/contracts/fixtures");

describe("N20 canonical screen BFF consumer", () => {
  it("consumes the published typed-unavailable fixture without enabling a fetch", () => {
    const document = JSON.parse(readFileSync(
      join(FIXTURES, "execution-screen-bff.unavailable.valid.json"),
      "utf8",
    ));
    const contract = readScreenBffContract(document);
    expect(contract).not.toBeNull();
    expect(contract!.screen.screen_id).toBe("EXECUTION_ALPHA_360_SCREEN");
    expect(contract!.screen.supported_ui_states).toEqual(SCREEN_BFF_UI_STATES);
    expect(screenBffDataFetchAllowed(contract!)).toBe(false);
    expect(contract!.delivery).toMatchObject({
      state: "unavailable", payload: null, retryable: false,
    });
  });

  it("fails closed on version, state-set or delivery-status drift", () => {
    const document = JSON.parse(readFileSync(
      join(FIXTURES, "execution-screen-bff.unavailable.valid.json"),
      "utf8",
    ));
    expect(readScreenBffContract({ ...document, schema_version: "execution.screen-bff-contract.v2" }))
      .toBeNull();
    expect(readScreenBffContract({
      ...document,
      screen: { ...document.screen, supported_ui_states: ["ready"] },
    })).toBeNull();
    expect(readScreenBffContract({
      ...document,
      screen: { ...document.screen, data_api: { ...document.screen.data_api, status: "RAW_MANAGER" } },
    })).toBeNull();
  });
});
