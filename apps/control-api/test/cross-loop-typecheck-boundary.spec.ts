import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readJson = (name: string) => JSON.parse(readFileSync(resolve(__dirname, "..", name), "utf8")) as Record<string, unknown>;

describe("cross-loop TypeScript boundary", () => {
  it("keeps both browser-dependent tests in the mandatory typecheck gate", () => {
    const nodeConfig = readJson("tsconfig.json");
    const crossConfig = readJson("tsconfig.cross-loop.json");
    const pkg = readJson("package.json");
    const tests = ["test/paper-history-depth.spec.ts", "test/paper-history-http.spec.ts"];
    expect(nodeConfig.exclude).toEqual(expect.arrayContaining(tests));
    expect(crossConfig.include).toEqual(expect.arrayContaining(tests));
    expect(crossConfig.exclude).toEqual(["node_modules", "dist"]);
    expect(crossConfig.compilerOptions).toMatchObject({ noEmit: true, jsx: "react-jsx" });
    expect(pkg.scripts).toMatchObject({ typecheck: "tsc --noEmit && tsc -p tsconfig.cross-loop.json" });
  });
});
