import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { expect } from "vitest";

const root = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname,"../../../packages/contracts");
export function assertCaptureContract(value: unknown, definition = "CaptureResponse") {
  const schema = JSON.parse(readFileSync(resolve(root,"schemas/execution-governance-review-capture.v1.schema.json"),"utf8"));
  const ajv = new Ajv2020({strict:true,allErrors:true});
  ajv.addSchema(schema);
  const validate = ajv.getSchema(`${schema.$id}#/$defs/${definition}`)!;
  expect(validate(value),JSON.stringify(validate.errors)).toBe(true);
}

export function assertLocalPortfolioContract(value: unknown, definition: string) {
  const schemas = JSON.parse(readFileSync(resolve(root,"openapi/execution-analytics.openapi.json"),"utf8")).components.schemas;
  const ajv = new Ajv2020({strict:true,allErrors:true,allowUnionTypes:true});
  addFormats(ajv);
  const defs = JSON.parse(JSON.stringify(schemas).replaceAll("#/components/schemas/","#/$defs/"));
  const validate = ajv.compile({$defs:defs,$ref:`#/$defs/${definition}`});
  expect(validate(value),JSON.stringify(validate.errors)).toBe(true);
}
