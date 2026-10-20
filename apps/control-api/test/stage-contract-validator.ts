import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { expect } from "vitest";

const root = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
let cached: Ajv2020 | null = null;

/** Every published schema registered together, as the contracts workspace does (cross-file $refs resolve). */
function published(): Ajv2020 {
  if (cached) return cached;
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  const dir = resolve(root, "schemas");
  for (const name of readdirSync(dir)) ajv.addSchema(JSON.parse(readFileSync(resolve(dir, name), "utf8")));
  cached = ajv;
  return ajv;
}

/** `file#/$defs/definition` (or the whole schema when no definition is named) must accept `value`. */
export function assertPublishedSchema(file: string, definition: string | null, value: unknown): void {
  const id = JSON.parse(readFileSync(resolve(root, "schemas", file), "utf8")).$id as string;
  const validate = published().getSchema(definition === null ? id : `${id}#/$defs/${definition}`);
  expect(validate, `${file}#${definition} is not registered`).toBeDefined();
  expect(validate!(value), JSON.stringify(validate!.errors)).toBe(true);
}

export function rejectsPublishedSchema(file: string, definition: string | null, value: unknown): boolean {
  const id = JSON.parse(readFileSync(resolve(root, "schemas", file), "utf8")).$id as string;
  const validate = published().getSchema(definition === null ? id : `${id}#/$defs/${definition}`);
  return validate !== undefined && !validate(value);
}
