/** R-S06-2 additive exact surface parameters; preserve unrelated OpenAPI bytes. */
import { readFileSync, writeFileSync } from "node:fs";

const path = new URL("../openapi/research-current-source.openapi.json", import.meta.url);
const original = readFileSync(path, "utf8");
const document = JSON.parse(original);
const point = document.components.schemas.SurfacePoint;
if (!point?.properties?.source_ordinal || !point.properties.trial_id || !point.properties.positions) {
  throw new Error("Missing named source-ordinal SurfacePoint contract");
}
point.properties.parameters = {
  type: "object", maxProperties: 24,
  propertyNames: { type: "string", pattern: "^[A-Za-z][A-Za-z0-9_]{0,63}$" },
  additionalProperties: { $ref: "#/components/schemas/Decimal" },
  description: "Exact persisted trial parameters for this source_ordinal, identical to ledger.parameters; never display-step rounded.",
};
// Additive and optional: no historical response gains a default or required field.
const componentLine = /^      "SurfacePoint": [^\n]+,$/m;
if (!componentLine.test(original)) throw new Error("SurfacePoint component layout changed; refusing an unrelated rewrite");
const updated = original.replace(componentLine, `      "SurfacePoint": ${JSON.stringify(point)},`);
if (updated !== original) {
  if (process.argv.includes("--check")) throw new Error("Search surface generated drift");
  writeFileSync(path, updated);
}
process.stdout.write(`Search surface parameters ${process.argv.includes("--check") ? "verified" : "generated"}.\n`);
