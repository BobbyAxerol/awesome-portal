import { afterEach, describe, expect, it, vi } from "vitest";

import { EXEC_V2_SCREEN_KEYS, isV2Screen, parseV2Manifest } from "./flags";

describe("parseV2Manifest", () => {
  it.each([undefined, "", "   ", ",,", " , "])("reads %j as nothing on", (raw) => {
    expect(parseV2Manifest(raw).size).toBe(0);
  });

  it("keeps known keys, trimmed and lower-cased", () => {
    expect([...parseV2Manifest(" Fleet , ALPHA,shell ")].sort()).toEqual(["alpha", "fleet", "shell"]);
  });

  it("drops unknown keys without touching the rest", () => {
    expect([...parseV2Manifest("fleet,fleets,v1,*,all,ops")].sort()).toEqual(["fleet", "ops"]);
  });

  it("knows every screen of review2/07 s5 plus the shell", () => {
    expect([...parseV2Manifest(EXEC_V2_SCREEN_KEYS.join(","))].sort()).toEqual(
      ["account", "admin", "alpha", "archived", "blotter", "cockpit", "compare", "fleet", "ops", "overview", "portfolios", "profile", "replay", "shell", "users", "workbench"],
    );
  });

  it("does not depend on duplicates", () => {
    expect(parseV2Manifest("fleet,fleet").size).toBe(1);
  });
});

describe("isV2Screen", () => {
  const set = parseV2Manifest("fleet,shell");

  it("is on only for listed keys under the umbrella", () => {
    expect(isV2Screen("fleet", set, true)).toBe(true);
    expect(isV2Screen("alpha", set, true)).toBe(false);
  });

  it("stays off for a listed key without the umbrella", () => {
    expect(isV2Screen("fleet", set, false)).toBe(false);
  });
});

describe("module constants", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function load(manifest: string | undefined, umbrella: string | undefined) {
    vi.resetModules();
    vi.stubEnv("VITE_EXECUTION_V2_SCREENS", manifest ?? "");
    vi.stubEnv("VITE_EXECUTION_PREVIEW_ENABLED", umbrella ?? "");
    return import("./flags");
  }

  it("is all V1 when the manifest is unset", async () => {
    const flags = await load(undefined, "true");
    expect(flags.EXECUTION_V2_SCREENS.size).toBe(0);
    expect(flags.EXECUTION_V2_SHELL).toBe(false);
    expect(flags.isV2Screen("fleet")).toBe(false);
  });

  it("turns the shell on only with the umbrella preview flag", async () => {
    const on = await load("shell,fleet", "true");
    expect(on.EXECUTION_V2_SHELL).toBe(true);
    expect(on.isV2Screen("fleet")).toBe(true);

    const noUmbrella = await load("shell,fleet", undefined);
    expect(noUmbrella.EXECUTION_V2_SCREENS.has("shell")).toBe(true);
    expect(noUmbrella.EXECUTION_V2_SHELL).toBe(false);
    expect(noUmbrella.isV2Screen("fleet")).toBe(false);
  });

  it("treats anything but the string true as no umbrella", async () => {
    expect((await load("shell", "1")).EXECUTION_V2_SHELL).toBe(false);
  });
});
