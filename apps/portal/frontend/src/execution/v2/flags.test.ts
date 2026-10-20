import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EXEC_V2_PENDING_KEYS,
  EXEC_V2_PERMANENT_RESERVED_KEYS,
  EXEC_V2_RESERVED_KEYS,
  EXEC_V2_SCREEN_KEYS,
  isV2Screen,
  parseV2Manifest,
} from "./flags";

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
      ["account", "admin", "alpha", "archived", "blotter", "canary", "cockpit", "command", "compare", "fleet", "live", "ops", "overview", "portfolios", "profile", "replay", "request", "sandbox", "scoped", "shell", "users", "workbench"],
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

describe("reserved keys", () => {
  const reserved: readonly string[] = EXEC_V2_RESERVED_KEYS;
  const mounting = EXEC_V2_SCREEN_KEYS.filter((key) => !reserved.includes(key));

  it("names the two permanent keys and one pending key, `command` (UXM-09 fixture story, not mounted); the five S3 keys are wired", () => {
    expect([...EXEC_V2_PERMANENT_RESERVED_KEYS].sort()).toEqual(["archived", "replay"]);
    expect([...EXEC_V2_PENDING_KEYS]).toEqual(["command"]);
    expect([...EXEC_V2_RESERVED_KEYS].sort()).toEqual(["archived", "command", "replay"]);
  });

  it("D2: every S3 stage screen has its own key (no shared `stages` key), the Paper key stays `workbench`, and each one mounts", () => {
    for (const key of ["workbench", "sandbox", "canary", "live", "request"] as const) {
      expect(parseV2Manifest(key).has(key), key).toBe(true);
      expect(isV2Screen(key, parseV2Manifest(key), true), key).toBe(true);
    }
    expect(parseV2Manifest("stages").size).toBe(0);
  });

  it("the permanent keys are still read from a manifest (so an env file that lists them is not a typo) but never turn a screen on", () => {
    const set = parseV2Manifest("fleet,archived,workbench,sandbox,canary,live,request,replay");
    expect(set.has("archived")).toBe(true);
    expect(set.has("replay")).toBe(true);
    for (const key of EXEC_V2_RESERVED_KEYS) expect(isV2Screen(key, set, true), key).toBe(false);
    expect(isV2Screen("fleet", set, true)).toBe(true);
  });

  it("the other keys still turn on from the manifest", () => {
    const set = parseV2Manifest(mounting.join(","));
    for (const key of mounting) expect(isV2Screen(key, set, true), key).toBe(true);
  });

  /** Production sources under src/: test and smoke files aside. */
  function sources(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) sources(path, out);
      else if (/\.(ts|tsx)$/.test(name) && !/\.(test|smoke)\.(ts|tsx)$/.test(name) && !/\.testbase\.ts$/.test(name)) out.push(path);
    }
    return out;
  }

  it("every other key is read by isV2Screen in source, and no reserved key is", () => {
    const text = sources(join(process.cwd(), "src"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    for (const key of mounting) expect(text.includes(`isV2Screen("${key}")`), `${key} mounts something`).toBe(true);
    for (const key of EXEC_V2_RESERVED_KEYS) expect(text.includes(`isV2Screen("${key}"`), `${key} must mount nothing`).toBe(false);
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
