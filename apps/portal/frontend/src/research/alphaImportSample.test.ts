import { describe, expect, it } from "vitest";

import { ALPHA_SOURCE_SAMPLE, REQUIRED_FIELDS } from "./alphaImportSample";
import { rowsFromDeclaration } from "./ParameterSpaceTable";
import { CODE_ANATOMY } from "./codeAnatomy";

function contractLiteral(source: string): string {
  // Test-only shape inspection. Product code sends these bytes to server AST.
  const match = /^ALPHA_CONTRACT = (\{[\s\S]*?^\})$/m.exec(source);
  if (!match) throw new Error("no literal ALPHA_CONTRACT");
  return match[1];
}

describe("ALPHA_SOURCE_SAMPLE", () => {
  it("is a Python literal: True, never a JSON boolean or null", () => {
    expect(ALPHA_SOURCE_SAMPLE).toContain("True");
    const outsideStrings = contractLiteral(ALPHA_SOURCE_SAMPLE).replace(/"[^"]*"/g, '""');
    expect(outsideStrings).not.toMatch(/\b(true|false|null)\b/);
  });

  it("declares every required field, one Portal entrypoint and no imports", () => {
    const literal = contractLiteral(ALPHA_SOURCE_SAMPLE);
    for (const { field } of REQUIRED_FIELDS) expect(literal).toContain(`"${field}"`);
    expect(ALPHA_SOURCE_SAMPLE).toMatch(/^def generate_signals\(context\):$/m);
    expect(ALPHA_SOURCE_SAMPLE).not.toMatch(/^\s*(import|from)\s/m);
    expect(ALPHA_SOURCE_SAMPLE).not.toContain("return context");
    expect(ALPHA_SOURCE_SAMPLE).toContain('"research.imported-signal-notional-output.v1"');
  });

  it("mirrors all eight current Delta-RSI parameter bounds", () => {
    const contract = JSON.parse(contractLiteral(ALPHA_SOURCE_SAMPLE).replace(/\bTrue\b/g, "true").replace(/,\s*([}\]])/g, "$1"));
    const rows = rowsFromDeclaration(contract.parameter_space);
    expect(rows?.map(({ name, kind, low, high, step }) => [name, kind, low, high, step])).toEqual([
      ["window", "int_range", 20, 60, 2],
      ["rsi_l", "int_range", 12, 30, 1],
      ["signalLength", "int_range", 3, 20, 1],
      ["len_atr1", "int_range", 5, 20, 1],
      ["len_atr2", "int_range", 25, 60, 1],
      ["rvol", "float_range", 1.0, 2.5, 0.1],
      ["len_vol", "int_range", 8, 40, 2],
      ["slpercent", "float_range", 0.7, 2.5, 0.1],
    ]);
    expect(contract.warmup_bars).toBe(256);
    expect(contract.timeframes).toEqual(["1h", "4h", "1d"]);
  });

  it("separates purposes and discloses its bounded-history execution scope", () => {
    for (const label of ["DECLARATION", "PARAMETERS", "INDICATORS", "POLICY", "PORTAL ENTRYPOINT"]) {
      expect(ALPHA_SOURCE_SAMPLE).toContain(label);
    }
    for (const name of ["DeltaRsiParameters", "DeltaRsiIndicators", "DeltaRsiPolicy"]) {
      expect(ALPHA_SOURCE_SAMPLE).toContain(`class ${name}:`);
    }
    expect(ALPHA_SOURCE_SAMPLE).toContain("NOT byte/parity-identical");
    expect(ALPHA_SOURCE_SAMPLE).toContain("No imports, external IO");
    expect(ALPHA_SOURCE_SAMPLE).toContain("QuantBT, not this alpha, owns fills");
  });

  it("documents every canonical helper class without claiming runtime proof", () => {
    const sketches = CODE_ANATOMY.map(({ code }) => code).join("\n");
    for (const name of ["DeltaRsiParameters", "DeltaRsiIndicators", "DeltaRsiPolicy"]) {
      expect(sketches).toContain(`class ${name}:`);
    }
    expect(sketches).toContain("@staticmethod");
    expect(sketches).toContain('"research.imported-signal-notional-output.v1"');
    expect(sketches).not.toContain("return context");
    expect(sketches).not.toContain('"seed_required":true');
    expect(CODE_ANATOMY.map(({ note }) => note).join(" ")).toContain("not protected full-history kernel parity");
  });
});
