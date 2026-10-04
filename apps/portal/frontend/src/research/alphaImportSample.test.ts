import { describe, expect, it } from "vitest";

import { ALPHA_SOURCE_SAMPLE, REQUIRED_FIELDS } from "./alphaImportSample";
import { rowsFromDeclaration } from "./ParameterSpaceTable";

function contractLiteral(source: string): string {
  const match = /^ALPHA_CONTRACT = (\{.*\})$/m.exec(source);
  if (!match) throw new Error("no literal ALPHA_CONTRACT");
  return match[1];
}

describe("ALPHA_SOURCE_SAMPLE", () => {
  it("is a Python literal: True, never a JSON boolean or null", () => {
    expect(ALPHA_SOURCE_SAMPLE).toContain("True");
    const outsideStrings = contractLiteral(ALPHA_SOURCE_SAMPLE).replace(/"[^"]*"/g, '""');
    expect(outsideStrings).not.toMatch(/\b(true|false|null)\b/);
  });

  it("declares every required field, one plain entrypoint, no imports", () => {
    const literal = contractLiteral(ALPHA_SOURCE_SAMPLE);
    for (const { field } of REQUIRED_FIELDS) expect(literal).toContain(`"${field}"`);
    expect(ALPHA_SOURCE_SAMPLE).toMatch(/^def generate_signals\(context\):$/m);
    expect(ALPHA_SOURCE_SAMPLE).not.toMatch(/^\s*(import|from)\s/m);
  });

  it("reads as three declared parameters of three kinds", () => {
    const contract = JSON.parse(contractLiteral(ALPHA_SOURCE_SAMPLE).replace(/\bTrue\b/g, "true"));
    const rows = rowsFromDeclaration(contract.parameter_space);
    expect(rows?.map((row) => row.kind)).toEqual(["int_range", "float_range", "categorical"]);
  });
});
