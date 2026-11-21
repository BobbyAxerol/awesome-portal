/** RF-05 test helper: validate a value against one named OpenAPI component schema. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { expect } from "vitest";

const root = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");

export function openApiValidator(document: string, component: string) {
  const schemas = JSON.parse(readFileSync(resolve(root, "openapi", document), "utf8")).components.schemas;
  const ajv = new Ajv2020({ strict: false, allErrors: true, allowUnionTypes: true, unicodeRegExp: false });
  const defs = JSON.parse(JSON.stringify(schemas).replaceAll("#/components/schemas/", "#/$defs/"));
  const validate = ajv.compile({ $defs: defs, $ref: `#/$defs/${component}` });
  return {
    assert(value: unknown) {
      expect(validate(value), `${component}: ${JSON.stringify(validate.errors)}`).toBe(true);
    },
    check(value: unknown) {
      return validate(value) as boolean;
    },
  };
}
