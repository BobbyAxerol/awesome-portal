/** B9-4 additive source-timestamped sparkline points; preserve unrelated OpenAPI bytes. */
import { readFileSync, writeFileSync } from "node:fs";

const path = new URL("../openapi/research-run-library.openapi.json", import.meta.url);
const original = readFileSync(path, "utf8");
const document = JSON.parse(original);
const response = document.components.schemas.RunSparklineResponse;
if (!response?.properties?.values || !response.properties.source || !response.properties.run_id) {
  throw new Error("Missing named RunSparklineResponse contract");
}
response.properties.points = {
  type: "array", maxItems: 24,
  description: "Optional additive source-timestamped points, one-for-one with values in the same order and exact decimal spelling. The existing extrema sample preserves the source first and last timestamps; no interpolation or synthetic spacing.",
  items: {
    type: "object", additionalProperties: false, required: ["at_utc_ms", "equity"],
    properties: {
      at_utc_ms: { $ref: "#/components/schemas/UtcMilliseconds" },
      equity: { $ref: "#/components/schemas/ExactDecimal" },
    },
  },
};
// Additive and optional: historical v1 responses gain no default or required field.
const componentLine = /^      "RunSparklineResponse": [^\n]+,$/m;
if (!componentLine.test(original)) throw new Error("RunSparklineResponse layout changed; refusing an unrelated rewrite");
const updated = original.replace(componentLine, `      "RunSparklineResponse": ${JSON.stringify(response)},`);
if (updated !== original) {
  if (process.argv.includes("--check")) throw new Error("Sparkline points generated drift");
  writeFileSync(path, updated);
}
process.stdout.write(`Sparkline source points ${process.argv.includes("--check") ? "verified" : "generated"}.\n`);
