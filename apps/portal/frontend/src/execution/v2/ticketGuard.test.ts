// @vitest-environment node
/**
 * Source-level guard (QA3 R2-04): no module outside the tests builds display text that carries a request id in parentheses, the shape
 * `Not published (FE-013)` had. A request id is a code: it lives in `data-gap`, in an object key, in a comment. The words come from
 * `notPublishedText` / `gapTitle` / `notPublishedReason` (blocks/notPublished.tsx), which print the request's label instead.
 *
 * Together with the per-screen rendered-text tests (alpha/ticketIds, shell/shellText.hygiene, screens/ticketCodes) this keeps the ids out
 * of text nodes, titles, accessible names and visually hidden text.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CODE = "(?:FE-\\d{2,3}(?:/\\d{2,3})*|FE-CAT-\\d+|BQ-[A-Z][A-Z-]+)";
const IN_PARENS = new RegExp(`\\(\\s*${CODE}`);
const TEMPLATE_ID = /Not published \((?:\$)?\{/;
/** A request id interpolated into parentheses, in any text: `({FE.assignee})`, `(${FE_B1.links})`, `(${id})` after a name. The id is a code; the words come from the renderer (QA4 R3-12). */
const INTERPOLATED_ID = /\(\s*\$?\{\s*(?:FE|FE_[A-Z0-9]+)\./;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec|testbase|fixtures|smoke)\./.test(name) && !path.includes("/testkit/")) out.push(path);
  }
  return out;
}

/** Comments are prose for developers; only code and string literals can reach a reader. */
function withoutComments(source: string): string {
  const noBlocks = source.replace(/\/\*[\s\S]*?\*\//g, (block) => "\n".repeat(block.split("\n").length - 1));
  return noBlocks.split("\n").map((line) => line.replace(/(^|[\s;,{(])\/\/.*$/, "$1")).join("\n");
}

describe("no request id in parentheses in display strings", () => {
  const files = [...walk(join(ROOT, "execution"))].filter((path, index, all) => all.indexOf(path) === index);

  it("scans the Execution sources", () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it("finds no `(FE-nnn)` or `Not published (${id})` in code outside comments (V2 screens, blocks, charts, readers, api)", () => {
    const found: string[] = [];
    for (const path of files) {
      // The V1 Execution screens (execution/screens, execution/components) carry BR-EX ledger ids in their preview copy; only FE ids are guarded there.
      const v2 = path.includes(`${join("execution", "v2")}`);
      const lines = withoutComments(readFileSync(path, "utf8")).split("\n");
      lines.forEach((line, index) => {
        if ((v2 ? IN_PARENS : /\(\s*FE-\d{2,3}/).test(line) || TEMPLATE_ID.test(line) || INTERPOLATED_ID.test(line)) found.push(`${relative(ROOT, path)}:${index + 1}: ${line.trim().slice(0, 140)}`);
      });
    }
    expect(found).toEqual([]);
  });
});
