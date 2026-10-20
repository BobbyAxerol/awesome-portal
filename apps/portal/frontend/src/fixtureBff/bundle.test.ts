// @vitest-environment node
/**
 * The artifact that ships: `node build.mjs` bundles the server, and the bundle, run as a separate
 * Node process, answers what the in-process server answers. It is the check that the relative
 * fixture path the doubles use still resolves from dist/, and that nothing in the bundle needs
 * node_modules.
 */
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { answerFixtureRequest, V2_OPTIONS } from "../../e2e/bffAnswerer";
import { resetFixtureGlobals } from "../../../fixture-bff/app";
import { setFixtureNow, setFixtureScale } from "../../e2e/bffScale";
import { setOverviewPlanMode } from "../../e2e/bffDoubleOverview";

const PACKAGE = resolve(__dirname, "../../../fixture-bff");
let child: ChildProcess | null = null;
let origin = "";

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createServer();
    probe.once("error", fail);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => done(port));
    });
  });
}

beforeAll(async () => {
  execFileSync(process.execPath, [resolve(PACKAGE, "build.mjs")], { stdio: "pipe" });
  expect(existsSync(resolve(PACKAGE, "dist/server.mjs"))).toBe(true);
  const port = await freePort();
  origin = `http://127.0.0.1:${port}`;
  // A clean environment: the process gets only what it is told, so nothing leaks in from here.
  child = spawn(process.execPath, [resolve(PACKAGE, "dist/server.mjs")], {
    env: { PATH: process.env.PATH ?? "", PORT: String(port), FIXTURE_HOST: "127.0.0.1", FIXTURE_SCALE: "medium" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise<void>((ready, fail) => {
    const timer = setTimeout(() => fail(new Error("the bundled server did not start")), 15_000);
    child!.stdout!.on("data", (chunk: Buffer) => {
      if (chunk.toString("utf8").includes("NOT acceptance evidence")) {
        clearTimeout(timer);
        ready();
      }
    });
    child!.once("exit", (code) => fail(new Error(`the bundled server exited ${code}`)));
  });
}, 60_000);

afterAll(async () => {
  if (child !== null && child.exitCode === null) {
    child.kill("SIGTERM");
    await new Promise<void>((done) => child!.once("exit", () => done()));
  }
  resetFixtureGlobals();
});

describe("the bundled server", () => {
  it("is the lane", async () => {
    const response = await fetch(`${origin}/__fixture/lane`);
    expect(response.headers.get("x-fixture-lane")).toBe("FIXTURE_LAB");
    expect(await response.json()).toMatchObject({ lane: "FIXTURE_LAB", not_acceptance: true, scale: "medium" });
  });

  it("answers what the in-process answerer answers, byte for byte", async () => {
    setFixtureScale("medium");
    setFixtureNow("2026-08-22T13:00:00Z");
    setOverviewPlanMode("blocked");
    try {
      for (const url of [
        "/api/v1/execution/alphas?limit=50",
        "/api/v1/execution/portfolios",
        "/api/v1/execution/operations?limit=100",
        "/api/v1/execution/screens/blotter?limit=100",
        "/api/v1/execution/governance/approvals?limit=50",
        "/api/v1/execution/broker-bindings?environment=live&limit=50",
        "/api/v1/execution/compositions/command-center",
        "/api/v1/execution/resources/portfolios/pf_TEST_ONLY_core",
        "/api/admin/accounts",
        "/api/admin/access/self",
        // The shell bootstrap: the registry, links and summary fixtures are inlined into the bundle at build time.
        "/api/auth/context",
        "/api/v1/portal/registry",
        "/api/v1/portal/links",
        "/api/v1/portal/summary",
      ]) {
        const [path, search = ""] = url.split("?");
        const direct = answerFixtureRequest({ method: "GET", path: path!, search, headers: {}, body: null }, V2_OPTIONS)!;
        const shipped = await fetch(`${origin}${url}`);
        expect(shipped.status, url).toBe(direct.status);
        expect(await shipped.text(), url).toBe(JSON.stringify(direct.body));
      }
    } finally {
      resetFixtureGlobals();
    }
  });

  it("stops on SIGTERM with exit code 0", async () => {
    child!.kill("SIGTERM");
    const code = await new Promise<number | null>((done) => child!.once("exit", (c) => done(c)));
    expect(code).toBe(0);
  });
});
