/** QA7 N5-07: the envelope's USED column stacks the bar over its words so "at limit" / "over limit" are never cut (measured in a browser: 710/710 at 1440, 678/678 at 1024). */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("canary envelope gauge layout", () => {
  const css = readFileSync(join(__dirname, "../../css/canary.css"), "utf8");
  it("stacks the gauge text under the bar and lets it wrap inside the table", () => {
    expect(css).toMatch(/\.exec-cny-v2 \.exec-cards \.exec-gauge-wrap\s*\{[^}]*flex-direction:\s*column/);
    expect(css).toMatch(/\.exec-cny-v2 \.exec-cards \.exec-gauge-text\s*\{[^}]*white-space:\s*normal/);
  });
});
