// @vitest-environment node
/** WP-P: the cross-screen ties (scripts/fixture-ties.mjs) hold on the positive default: the same quantity reads the same on every screen that shows it. */
import { join } from "node:path";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFixtureServer, loadConfig, resetFixtureGlobals } from "../../../fixture-bff/app";
import { resetScenario } from "../../../fixture-bff/scenario";

type Ties = { checked: number; mismatches: string[]; skipped: string[] };
let server: Server;
let base = "";
const get = async (path: string): Promise<{ status: number; body: any }> => { // eslint-disable-line @typescript-eslint/no-explicit-any
  const response = await fetch(`${base}${path}`);
  return { status: response.status, body: await response.json() };
};
const load = async (): Promise<(g: typeof get) => Promise<Ties>> => {
  const file = join(process.cwd(), "../../../scripts/fixture-ties.mjs");
  return (await import(/* @vite-ignore */ pathToFileURL(file).href)).runTies;
};

beforeAll(async () => {
  server = createFixtureServer(loadConfig({ PORT: "0", FIXTURE_HOST: "127.0.0.1", FIXTURE_REVIEW_PROFILE: "populated", FIXTURE_SCALE: "medium" }));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((done) => server.close(() => done()));
  resetFixtureGlobals();
  resetScenario();
});

describe("ties", () => {
  it("every checked quantity reads the same on every screen that shows it (positive default)", async () => {
    const result = await (await load())(get);
    expect(result.mismatches).toEqual([]);
    expect(result.checked).toBeGreaterThan(30);
  }, 60_000);
});
