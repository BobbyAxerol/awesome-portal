/**
 * Bundle gating for the V2 command bar, checked at the source.
 *
 * A flag-off build must emit no V2 chunk, and that depends on the dynamic
 * import being guarded by the RAW env string (the bundler folds
 * `undefined ? lazy(import(...)) : null` away). A static import of the V2
 * module, or a guard on a derived constant, would put the bar, its CSS and
 * `roleNav` into the entry graph of every build. Reading the files is the only
 * check that does not need a production build.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (name: string) => readFileSync(join(__dirname, name), "utf8");
const imports = (source: string) => [...source.matchAll(/^\s*import\s[^;]*?from\s+["']([^"']+)["']/gms)].map((match) => match[1]);

describe("V2 command bar gating", () => {
  const shell = read("PortalShell.tsx");

  it("PortalShell imports nothing from execution/v2 statically", () => {
    const fromV2 = imports(shell).filter((path) => /execution\/v2\//.test(path));
    expect(fromV2).toEqual([]);
  });

  it("the only route into the V2 bar is a lazy import behind the raw env string", () => {
    const guarded = /const V2CommandBar = import\.meta\.env\.VITE_EXECUTION_V2_SCREENS\s*\?\s*lazy\(\(\) => import\("\.\.\/execution\/v2\/shell\/ExecCommandBar"\)/;
    expect(shell).toMatch(guarded);
    // Two lazy V2 mounts, each behind the raw env string: the command bar above and the self-navigation controller (W3).
    expect([...shell.matchAll(/import\("[^"]*execution\/v2[^"]*"\)/g)]).toHaveLength(2);
  });

  it("the self-navigation controller is a lazy import behind the same raw env string, and the shell holds only its types-free view module", () => {
    const guarded = /const V2SelfNavigation = import\.meta\.env\.VITE_EXECUTION_V2_SCREENS\s*\?\s*lazy\(\(\) => import\("\.\.\/execution\/v2\/shell\/SelfNavigation"\)\)\s*:\s*null;/;
    expect(shell).toMatch(guarded);
    expect(imports(shell)).toContain("./selfNavView");
    expect(imports(read("selfNavView.ts"))).toEqual(["react"]);
    // Mounted only with the shell flag on, so a manifest without `shell` does not even load the chunk.
    expect(shell).toMatch(/V2SelfNavigation && V2_SHELL_ON/);
  });

  it("the routing helper pulls in only the flag constants and the shell's own classifier", () => {
    expect(imports(read("commandRouting.ts")).sort()).toEqual(["../execution/v2/flags", "../portal/contracts", "./presentation"].sort());
  });

  it("the V1 palette does not know the V2 bar exists", () => {
    const palette = read("CommandPalette.tsx");
    expect(imports(palette).filter((path) => /execution\/v2/.test(path))).toEqual([]);
    expect(palette).not.toMatch(/ExecCommandBar|CommandBar\b/);
  });
});
