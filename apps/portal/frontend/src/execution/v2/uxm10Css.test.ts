/**
 * UXM-10 F-11 and F-12 · two CSS rules, pinned at the source (jsdom applies no stylesheet, so the browser proof is the coexistence
 * spec; these keep the rules, their scope and the V1 rule they must not touch from drifting).
 *
 * F-11  shell.css: `html { scroll-padding-top: var(--topbar-h) }` so a focus scroll never parks a control under the sticky top bar.
 * F-12  v2/css/blocks.css: the replay header's `<span>` chips get `cursor: default`, scoped to the V2 replay frame; the shared V1
 *       rule in execution.css is the same text it was.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (relative: string) => readFileSync(resolve(__dirname, relative), "utf8");
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const SHELL = strip(read("../../styles/shell.css"));
const BLOCKS = strip(read("css/blocks.css"));
const EXECUTION = strip(read("../execution.css"));

/** The body of the first rule whose selector is exactly `selector` (optionally inside a media query that starts at `from`). */
function body(css: string, selector: string, from = 0): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|[}\\s])${escaped}\\s*\\{([^{}]*)\\}`, "m").exec(css.slice(from));
  return match === null ? null : match[1]!;
}

describe("F-11 · scroll-padding-top equals the sticky top bar", () => {
  it("html keeps the bar's own height clear, from the bar's own variable", () => {
    expect(body(SHELL, "html")).toMatch(/scroll-padding-top:\s*var\(--topbar-h\);/);
  });

  it("the bar's min-height is that same variable, so the two cannot drift", () => {
    expect(body(SHELL, ".portal-topbar")).toMatch(/position:\s*sticky;[\s\S]*min-height:\s*var\(--topbar-h\);/);
  });

  it("on a small screen the bar is a fixed 56px and so is the padding", () => {
    const at = SHELL.indexOf("@media (max-width: 720px) {\n  html");
    expect(at).toBeGreaterThan(-1);
    expect(body(SHELL, "html", at)).toMatch(/scroll-padding-top:\s*56px;/);
    const small = SHELL.indexOf("@media (max-width: 720px) {\n  .portal-topbar,\n  :root[data-theme=\"execution-carbon\"] .portal-topbar {");
    expect(small).toBeGreaterThan(-1);
    expect(SHELL.slice(small, small + 400)).toMatch(/height:\s*56px;/);
  });

  it("paints nothing: the rule has no property but the scroll alignment", () => {
    expect(body(SHELL, "html")!.replace(/\s+/g, "")).toBe("scroll-padding-top:var(--topbar-h);");
  });
});

describe("F-12 · the replay header's span chips are not offered as controls", () => {
  it("the V2 frame sets cursor: default on span chips only, under .exec-blk-replay", () => {
    expect(body(BLOCKS, '.exec-blk-replay span[class~="exec-rp-chip"]')?.replace(/\s+/g, "")).toBe("cursor:default;");
  });

  it("no V2 stylesheet spells the V1 class (v2Hygiene), and the rule cannot reach a button or a select", () => {
    expect(BLOCKS).not.toMatch(/\.exec-rp-chip/);
    expect(BLOCKS).not.toMatch(/exec-rp-chip[^{]*(button|select)/);
  });

  it("the shared V1 rule is the text it was: cursor: pointer, disabled -> not-allowed (V1 pixel and pointer unchanged)", () => {
    expect(body(EXECUTION, ".exec-rp-chip")).toMatch(/cursor:\s*pointer;/);
    expect(body(EXECUTION, ".exec-rp-chip:disabled")).toMatch(/cursor:\s*not-allowed;/);
  });
});

describe("RV-05 · the two axe findings left on Sandbox and Workbench (F-5)", () => {
  const SANDBOX = strip(read("css/sandbox.css"));

  it("the compact spine's nodes do not overlap by -1px, so a row that fits does not scroll by 1px", () => {
    expect(body(BLOCKS, '.exec-blk-spine[data-variant="compact"] .exec-blk-spine-node')?.replace(/\s+/g, "")).toBe("margin-right:0;");
    expect(body(BLOCKS, ".exec-blk-spine-node")).toMatch(/margin-right:\s*-1px;/);
  });

  it("the Sandbox lineage ids are underlined (a non-colour cue) in that list only; the shared link is unchanged", () => {
    expect(body(SANDBOX, ".exec-sbx-lineage .exec-blk-link")).toMatch(/text-decoration:\s*underline;/);
    expect(body(BLOCKS, ".exec-blk-link")?.replace(/\s+/g, "")).toBe("color:var(--accent);");
  });
});
