/** Additive public projections of immutable run/version inputs; no source-seal mutation. */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { replaceComponent } from "./generate-research-progress-truth.mjs";

const root = new URL("../", import.meta.url);
const nullable = value => ({ anyOf: [value, { type: "null" }] });
const object = properties => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const ref = name => ({ $ref: `#/$defs/${name}` });
const id = { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$" };
const digest = { type: "string", pattern: "^[0-9a-f]{64}$" };
const reason = { type: "string", pattern: "^[A-Z][A-Z0-9_]{2,159}$" };
const alpha = JSON.parse(readFileSync(new URL("schemas/research-alpha-import.v1.schema.json", root), "utf8"));
const request = JSON.parse(readFileSync(new URL("schemas/research-requested-spec.v1.schema.json", root), "utf8"));
const requestOverrides = structuredClone(request.properties.parameter_space_overrides);
requestOverrides.maxItems = 64;
const optimizationConfig = structuredClone(request.properties.optimization_config);
optimizationConfig.maxProperties = 64;
const declaration = structuredClone(alpha.$defs.AlphaVersionDeclaration);
// This read-only projection carries validator inputs, not an execution surface.
declaration.description = "Safe immutable AlphaVersion validator inputs, not raw source, provenance or mutable execution instructions.";
declaration.required = [...new Set([...declaration.required, "required_columns", "warmup_bars"])];
declaration.properties.warmup_bars.maximum = 100000;
const runDeclaration = {
  $schema: "https://json-schema.org/draft/2020-12/schema", $id: "research.run-declaration.v1",
  ...object({ schema_version: { const: "research.run-declaration.v1" },
    state: { enum: ["AVAILABLE", "NOT_PUBLISHED", "NOT_APPLICABLE"] },
    reason_code: nullable(reason), source_ref: { const: "IMMUTABLE_RUN_REQUEST_AND_ALPHA_VERSION_DECLARATION_V1" },
    alpha_binding: nullable(object({ alpha_id: id, alpha_version_id: id })),
    declaration_digest: nullable(digest), requested_spec_digest: nullable(digest),
    declaration: nullable(ref("AlphaVersionDeclaration")),
    requested_overrides: nullable(requestOverrides),
  }),
  $defs: { DeclarationScalar: alpha.$defs.DeclarationScalar, ParameterDeclaration: alpha.$defs.ParameterDeclaration,
    AlphaVersionDeclaration: declaration },
  allOf: [{ if: { properties: { state: { const: "AVAILABLE" } } },
    then: { properties: { reason_code: { type: "null" }, alpha_binding: { type: "object" }, declaration: { type: "object" },
      declaration_digest: digest, requested_spec_digest: digest, requested_overrides: { type: "array" } } },
    else: { properties: { reason_code: reason, declaration: { type: "null" }, declaration_digest: { type: "null" },
      requested_overrides: { type: "null" } } } }],
};
const sampler = {
  $schema: "https://json-schema.org/draft/2020-12/schema", $id: "research.sampler-evidence.v1",
  ...object({ schema_version: { const: "research.sampler-evidence.v1" },
    requested_configuration: { ...object({ state: { enum: ["AVAILABLE", "NOT_PUBLISHED"] },
      scope: { const: "RUN_REQUESTED_SPEC" }, reason_code: nullable(reason), source_ref: { const: "IMMUTABLE_RUN_REQUESTED_OPTIMIZER_CONFIG_V1" },
      requested_spec_digest: nullable(digest), optimization_config: nullable(optimizationConfig),
      random_seed: nullable({ type: "integer", minimum: 0, maximum: 2147483647 }),
    }), allOf: [{ if: { properties: { state: { const: "AVAILABLE" } } },
      then: { properties: { reason_code: { type: "null" }, requested_spec_digest: digest, optimization_config: { type: "object" } } },
      else: { properties: { reason_code: reason, optimization_config: { type: "null" }, random_seed: { type: "null" } } } }] },
    internal_trace: object({ state: { const: "NOT_PUBLISHED" },
      reason_code: { const: "QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_SAMPLER_INTERNAL_TRACE" }, source_ref: { const: "QUANTBT_1_1_1_RETAINED_NATIVE_WFO_RESULT_V2" } }),
    observed_trials: object({ state: { const: "AVAILABLE" },
      scope: { const: "RETAINED_SOURCE_TRIAL_ROWS_NOT_SAMPLER_INTERNAL_TRACE" }, source_ref: { const: "SEALED_RETAINED_TRIAL_LEDGER_V1" },
      source_trial_count: { type: "integer", minimum: 0, maximum: 4096 } }),
  }),
};
function emit(path, value, check) {
  const target = new URL(path, root), next = JSON.stringify(value, null, 2) + "\n";
  let old = ""; try { old = readFileSync(target, "utf8"); } catch {}
  if (old === next) return;
  if (check) throw new Error(`Run declaration contract drift: ${path}`);
  writeFileSync(target, next);
}
export function amendRunDeclaration(original, name) {
  const document = JSON.parse(original), updates = {};
  const bodyName = { "research-progress": "ProgressRead", "research-evidence": "EvidenceHub",
    "research-split": "SplitDetail", "research-current-source": "Common" }[name];
  const schema = structuredClone(document.components.schemas[bodyName]);
  if (!schema?.properties) throw new Error(`Missing ${bodyName}`);
  schema.properties.run_declaration = { $ref: "#/components/schemas/RunDeclaration",
    description: "Immutable bound version declaration and explicit requested overrides. Never current registry defaults or evidence of actual runtime/sampler execution. Optional during additive rollout." };
  updates[bodyName] = schema;
  // JSON Schema $defs are schema metadata, not a runtime response property.
  // Move definitions to OpenAPI components; external $defs otherwise become
  // required business fields in openapi-typescript 7.x.
  const openApiDeclaration = structuredClone(runDeclaration);
  delete openApiDeclaration.$schema; delete openApiDeclaration.$id; delete openApiDeclaration.$defs;
  const rewriteDefinitionRefs = value => {
    if (Array.isArray(value)) return value.map(rewriteDefinitionRefs);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) =>
      [key, key === "$ref" && typeof entry === "string" && entry.startsWith("#/$defs/")
        ? `#/components/schemas/RunDeclaration${entry.slice(8)}` : rewriteDefinitionRefs(entry)]));
    return value;
  };
  updates.RunDeclaration = rewriteDefinitionRefs(openApiDeclaration);
  for (const [key, value] of Object.entries(runDeclaration.$defs)) updates[`RunDeclaration${key}`] = rewriteDefinitionRefs(value);
  if (name === "research-current-source") {
    const search = structuredClone(document.components.schemas.Search);
    const body = search.properties ? search : search.allOf.find(part => part.properties?.schema_version);
    if (!body?.properties) throw new Error("Missing Search response body");
    body.properties.sampler_evidence = { $ref: "#/components/schemas/SamplerEvidence",
      description: "Explicit immutable requested config, retained trial observations and truthful source gap for sampler-internal trace. Request config never attests the effective sampler or proposal provenance." };
    updates.Search = search;
    updates.SamplerEvidence = structuredClone(sampler);
    delete updates.SamplerEvidence.$schema; delete updates.SamplerEvidence.$id;
  }
  let next = original;
  for (const [key, value] of Object.entries(updates)) {
    if (document.components.schemas[key]) next = replaceComponent(next, key, value, next.indexOf('"schemas": {'));
    else next = next.replace('"schemas": {\n', `"schemas": {\n      "${key}": ${JSON.stringify(value)},\n`);
  }
  return next;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  emit("schemas/research-run-declaration.v1.schema.json", runDeclaration, check);
  emit("schemas/research-sampler-evidence.v1.schema.json", sampler, check);
  for (const name of ["research-progress", "research-evidence", "research-split", "research-current-source"]) {
    const path = new URL(`openapi/${name}.openapi.json`, root), old = readFileSync(path, "utf8");
    const next = amendRunDeclaration(old, name);
    if (old === next) continue;
    if (check) throw new Error(`Run declaration OpenAPI drift: ${name}`);
    writeFileSync(path, next);
  }
}
