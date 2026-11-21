/** Embed the shared canonical schema without reformatting unrelated OpenAPI. */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const canonical = JSON.parse(readFileSync(`${root}schemas/research-retained-analytics.v1.schema.json`, "utf8"));
const canonicalV2 = JSON.parse(readFileSync(`${root}schemas/research-retained-analytics.v2.schema.json`, "utf8"));
const check = process.argv.includes("--check");
const component = name => name === "Root" ? "RetainedAnalytics" : `RetainedAnalytics${name}`;
const local = value => JSON.parse(JSON.stringify(value).replaceAll("#/$defs/", "#/components/schemas/RetainedAnalytics"));
const localV2 = value => JSON.parse(JSON.stringify(value).replaceAll("#/$defs/", "#/components/schemas/RetainedAnalyticsV2"));
const { $schema, $defs, ...base } = canonical;
const { $schema: schemaV2, $id: idV2, $defs: defsV2, ...baseV2 } = canonicalV2;
const schemas = {
  RetainedAnalytics: local(base),
  ...Object.fromEntries(Object.entries($defs).map(([key, value]) => [component(key), local(value)])),
  RetainedAnalyticsV2: localV2(baseV2),
  ...Object.fromEntries(Object.entries(defsV2).map(([key, value]) => [`RetainedAnalyticsV2${key}`, localV2(value)])),
};
for (const file of ["research-evidence.openapi.json", "research-current-source.openapi.json", "research-run-library.openapi.json"]) {
  const path = `${root}openapi/${file}`;
  const old = readFileSync(path, "utf8");
  const without = old.replace(/^      "RetainedAnalytics[^"\n]*":.*\n/gm, "");
  const entries = Object.entries(schemas).map(([key, value]) => `      "${key}": ${JSON.stringify(value)},\n`).join("");
  let next = without.replace(/("schemas": \{\n)/, `$1${entries}`);
  next = next.replace("What this lane structurally does not hold. E11 adds in_sample_account (the HiFi's EChart 1 is IS vs stitched OOS; the retained tape is one stitched account, so the legend states the absence) and rolling_sharpe (QuantBT's rolling Sharpe needs daily returns, which the hourly tape has none of). Both are optional so a capture taken before E11 still validates; the server always emits them.",
    "Source-owned absences. A WFO final account is not selected-candidate IS equity. E11 source-time summary_analytics uses QuantBT daily resampling and rolling_sharpe(window=63); a qualified long run omits rolling_sharpe absence, while older or short seals publish their exact typed reason. Both optional fields preserve older captures.");
  if (next === without) throw new Error(`Missing schemas insertion anchor in ${file}`);
  if (file === "research-run-library.openapi.json") {
    if (check && next !== old) throw new Error(`Generated analytics components drifted: ${file}`);
    if (!check && next !== old) writeFileSync(path, next);
    continue;
  }
  const dto = file.startsWith("research-evidence.") ? "EvidenceHub" : "Evidence";
  const parsed = JSON.parse(next).components.schemas[dto];
  const properties = parsed.properties ?? parsed.allOf.find(value => value.properties).properties;
  if (!properties.summary_analytics) {
    const version = dto === "EvidenceHub" ? "research.evidence-hub.v1" : "research.current-source-evidence.v1";
    const anchor = `"schema_version": { "const": "${version}" },`;
    if (!next.includes(anchor)) throw new Error(`Missing ${dto} property insertion anchor`);
    next = next.replace(anchor, `${anchor} "summary_analytics": { "$ref": "#/components/schemas/RetainedAnalytics" },`);
  } else if (properties.summary_analytics.$ref !== "#/components/schemas/RetainedAnalytics") {
    throw new Error(`Conflicting typed summary_analytics reference in ${file}`);
  }
  if (!properties.summary_analytics_v2) {
    const anchor = `"summary_analytics": { "$ref": "#/components/schemas/RetainedAnalytics" },`;
    if (!next.includes(anchor)) throw new Error(`Missing ${dto} v1 analytics insertion anchor`);
    next = next.replace(anchor, `${anchor} "summary_analytics_v2": { "$ref": "#/components/schemas/RetainedAnalyticsV2" },`);
  } else if (properties.summary_analytics_v2.$ref !== "#/components/schemas/RetainedAnalyticsV2") {
    throw new Error(`Conflicting typed summary_analytics_v2 reference in ${file}`);
  }
  if (check && next !== old) throw new Error(`Generated analytics components drifted: ${file}`);
  if (!check && next !== old) writeFileSync(path, next);
}
process.stdout.write(`Research retained analytics components ${check ? "verified" : "generated"}.\n`);
