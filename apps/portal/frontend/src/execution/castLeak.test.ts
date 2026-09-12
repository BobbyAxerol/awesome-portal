/**
 * The reviewed cast belongs to the gallery, never to a product screen.
 *
 * The owner opened `adaptive_hma_cpp_00115m` on dev and the breadcrumb read
 * "Deployments / Paper Trading / Carry v3.2". The tail was derived from a
 * switch that named the showcase cast: every paper deployment became "Carry
 * v3.2", the VNM workbench was always "VnMomo v0.9", alpha `av_2041` became
 * "Grid v2.1", and the ids fell back to `dep_88`/`AP-201` when a route carried
 * none. On the fixtures page those were the records on screen; on dev they
 * named a record that was not open.
 *
 * This scans the product tree for those names. The gallery, the fixture API and
 * the anatomy demo are where the cast legitimately lives, so they are named
 * here rather than matched by directory — the same rule the other allowlists
 * in this suite follow.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..");

/** Where the reviewed cast is the subject, not an accident. */
const CAST_HOMES = [
  /fixtures?\./i,
  /Fixtures\.tsx$/,
  /\.(test|spec)\.tsx?$/,
  /smoke\.ts$/,
  /\/lab\//,
  /previewControllers\.tsx$/,
  /anatomyDemo\.tsx$/,
  /fixtureApi\.ts$/,
  /fixtureData\.ts$/,
  /testHandlers\.ts$/,
];

const CAST = /"(Carry v3\.2|VnMomo v0\.9|Grid v2\.1|dep_88|dep_77|dep_74|AP-201|AP-352|av_2041|EX-771|inc_fixture_44)"/;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name))
      : /\.(ts|tsx)$/.test(e.name) ? [join(dir, e.name)] : []);
}

describe("a product screen never names the reviewed cast", () => {
  const scanned = files(SRC)
    .map((f) => ({ rel: f.slice(SRC.length + 1), text: readFileSync(f, "utf8") }))
    .filter(({ rel }) => !CAST_HOMES.some((re) => re.test(rel)));

  it("scans a real number of product files, so a broken walk cannot pass quietly", () => {
    expect(scanned.length).toBeGreaterThan(60);
    // And the names it hunts really do exist somewhere, in their proper home.
    const homes = files(SRC).filter((f) => CAST_HOMES.some((re) => re.test(f.slice(SRC.length + 1))));
    expect(homes.some((f) => CAST.test(readFileSync(f, "utf8")))).toBe(true);
  });

  it("finds no cast name outside the gallery, fixtures and demos", () => {
    const offenders = scanned
      .filter(({ text }) => CAST.test(text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "")))
      .map(({ rel }) => rel);
    expect(offenders).toEqual([]);
  });
});
