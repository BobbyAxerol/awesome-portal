// @vitest-environment node
/**
 * The refactor changed nothing the Playwright specs can see.
 *
 * Golden: `golden/stub-golden.json`, recorded from `stubExecutionBff` (driven through a fake page,
 * exactly as Playwright drives it) BEFORE the answerer, the scale hooks and the optional request body
 * were added (`golden.capture.test.ts` is how it was made).
 *
 * Three claims, each asserted over every golden case:
 *   1. the stub still answers byte for byte what it answered then (status, content type, body digest);
 *   2. the new pure answerer answers the same bytes, headers aside, for every request it serves;
 *   3. where the stub answered its 501 `bff_double_gap`, the new answerer says "not mine" (null).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { answerFixtureRequest } from "../../e2e/bffAnswerer";
import { resetOverviewDouble } from "../../e2e/bffDoubleOverview";
import { OPTION_SETS, digest, walkMatrix, type Driver, type GoldenEntry, type Observed } from "./matrix";
import { stubDriver } from "./oldDriver";

const golden = JSON.parse(readFileSync(join(__dirname, "golden", "stub-golden.json"), "utf8")) as { cases: number; entries: Record<string, GoldenEntry> };

function newDriver(key: string): Driver {
  const options = OPTION_SETS.find((set) => set.key === key)!.options;
  return async (method, pathAndQuery, body) => {
    const url = new URL(pathAndQuery, "http://portal.test");
    const answered = answerFixtureRequest({ method, path: url.pathname, search: url.search, headers: {}, body: body ?? null }, options);
    if (answered === null) return { status: 501, contentType: "", bodyText: "", gap: true };
    const seen: Observed = {
      status: answered.status,
      contentType: answered.headers["content-type"] ?? "",
      bodyText: typeof answered.body === "string" ? answered.body : JSON.stringify(answered.body),
    };
    return seen;
  };
}

let viaStub: Map<string, Observed>;
let viaAnswerer: Map<string, Observed>;

beforeAll(async () => {
  const stubs = new Map(await Promise.all(OPTION_SETS.map(async (set) => [set.key, await stubDriver(set.options)] as const)));
  viaStub = await walkMatrix((key) => stubs.get(key)!, resetOverviewDouble);
  viaAnswerer = await walkMatrix(newDriver, resetOverviewDouble);
});

afterAll(() => resetOverviewDouble());

describe("fixture answerer equivalence", () => {
  it("holds the whole recorded matrix", () => {
    // 882 until the inbox served the published envelope (`page.next_cursor`): the approvals chain then walks its two further pages.
    expect(golden.cases).toBe(893);
    expect(Object.keys(golden.entries).length).toBe(golden.cases);
    expect(viaStub.size).toBe(golden.cases);
    expect(viaAnswerer.size).toBe(golden.cases);
    expect([...viaStub.keys()]).toEqual(Object.keys(golden.entries));
  });

  it("the Playwright stub still answers what it answered before the refactor", () => {
    const drift: string[] = [];
    for (const [key, entry] of Object.entries(golden.entries)) {
      const seen = viaStub.get(key)!;
      if (seen.status !== entry.status || seen.contentType !== entry.contentType || digest(seen.bodyText) !== entry.sha256 || Buffer.byteLength(seen.bodyText) !== entry.bytes) drift.push(key);
    }
    expect(drift).toEqual([]);
  });

  it("the pure answerer answers the same bytes for every request it serves", () => {
    const different: string[] = [];
    let served = 0;
    for (const [key, entry] of Object.entries(golden.entries)) {
      const seen = viaAnswerer.get(key)!;
      if (entry.gap) continue;
      served += 1;
      if (seen.gap || seen.status !== entry.status || seen.contentType !== entry.contentType || digest(seen.bodyText) !== entry.sha256) different.push(key);
    }
    expect(different).toEqual([]);
    expect(served).toBe(golden.cases - 48);
  });

  it("answers 'not mine' (null) exactly where the stub answered its gap 501", () => {
    const wrong: string[] = [];
    let gaps = 0;
    for (const [key, entry] of Object.entries(golden.entries)) {
      if (!entry.gap) continue;
      gaps += 1;
      if (viaAnswerer.get(key)!.gap !== true) wrong.push(key);
    }
    expect(wrong).toEqual([]);
    expect(gaps).toBe(48);
  });
});
