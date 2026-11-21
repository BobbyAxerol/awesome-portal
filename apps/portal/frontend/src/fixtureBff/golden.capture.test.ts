// @vitest-environment node
/**
 * Re-records `golden/stub-golden.json` from the Playwright stub. Skipped unless
 * FIXTURE_BFF_CAPTURE=1: the golden file is the pre-refactor behaviour, so it is only
 * ever re-recorded on purpose, from a tree whose stub behaviour is the reference.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resetOverviewDouble } from "../../e2e/bffDoubleOverview";
import { OPTION_SETS, digest, isGapBody, walkMatrix, type GoldenEntry } from "./matrix";
import { stubDriver } from "./oldDriver";

describe.skipIf(process.env.FIXTURE_BFF_CAPTURE !== "1")("record the stub golden", () => {
  it("writes golden/stub-golden.json", async () => {
    const drivers = new Map(await Promise.all(OPTION_SETS.map(async (set) => [set.key, await stubDriver(set.options)] as const)));
    const seen = await walkMatrix((key) => drivers.get(key)!, resetOverviewDouble);
    const entries: Record<string, GoldenEntry> = {};
    for (const [key, observed] of seen) {
      entries[key] = {
        status: observed.status,
        contentType: observed.contentType,
        sha256: digest(observed.bodyText),
        bytes: Buffer.byteLength(observed.bodyText),
        gap: observed.status === 501 && isGapBody(observed.bodyText),
      };
    }
    resetOverviewDouble();
    const file = join(__dirname, "golden", "stub-golden.json");
    writeFileSync(file, `${JSON.stringify({ recorded_from: "stubExecutionBff before the fixture-bff refactor", cases: Object.keys(entries).length, entries }, null, 1)}\n`);
    expect(Object.keys(entries).length).toBeGreaterThan(500);
  });
});
