/** BR-F3-02 additive applied-guard proof; old Split captures stay valid. */
import { readFileSync, writeFileSync } from "node:fs";
import { replaceComponent } from "./generate-research-progress-truth.mjs";
const nullable = schema => ({ anyOf: [schema, { type: "null" }] });
const obj = properties => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const reason = { type: "string", pattern: "^[A-Z][A-Z0-9_]{2,159}$" };
const count = { type: "integer", minimum: 0, maximum: 2_000_000 };
const verdict = { enum: ["PASS", "FAIL", "NOT_CHECKABLE"] };
const fold = obj({ fold_id: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$" },
  verdict, reason_code: nullable(reason), configured_bars: nullable(count), observed_bars: nullable(count),
  clipping: nullable({ enum: ["NONE", "DATASET_TAIL"] }) });
fold.allOf = [{ if: { properties: { verdict: { const: "PASS" } } },
  then: { properties: { reason_code: { type: "null" }, configured_bars: count, observed_bars: count,
    clipping: { enum: ["NONE", "DATASET_TAIL"] } } },
  else: { properties: { reason_code: reason, clipping: { type: "null" } } } }];
const proof = obj({ verdict, basis: { const: "RETAINED_OBSERVATION_INDEX_AND_SOURCE_FOLD_GUARDS_V1" },
  reason_code: nullable(reason), folds: { type: "array", maxItems: 256, items: fold } });
proof.description = "Read-only checks against the same immutable retained observation index. Purge excludes exactly its configured bars before the label-horizon and test. Embargo follows the test and may be clipped only at the verified dataset tail. Zero is valid only when source windows explicitly publish zero; missing historical facts are NOT_CHECKABLE. This is not a strict-OOS selection/holdout/certification assertion.";
proof.allOf = [{ if: { properties: { verdict: { const: "PASS" } } },
  then: { properties: { reason_code: { type: "null" }, folds: { minItems: 2,
    items: { properties: { verdict: { const: "PASS" } } } } } },
  else: { properties: { reason_code: reason } } },
  { if: { properties: { verdict: { const: "FAIL" } } },
    then: { properties: { folds: { contains: { properties: { verdict: { const: "FAIL" } }, required: ["verdict"] } } } },
    else: { properties: { folds: { items: { properties: { verdict: { enum: ["PASS", "NOT_CHECKABLE"] } } } } } } },
  { if: { properties: { verdict: { const: "NOT_CHECKABLE" } } }, then: { anyOf: [
    { properties: { folds: { maxItems: 1 } } },
    { properties: { folds: { contains: { properties: { verdict: { const: "NOT_CHECKABLE" } }, required: ["verdict"] } } } },
  ] } }];
const path = new URL("../openapi/research-current-source.openapi.json", import.meta.url);
const old = readFileSync(path, "utf8"), schemas = JSON.parse(old).components.schemas;
const split = structuredClone(schemas.Split);
const fields = split.properties ?? split.allOf.find(row => row.properties)?.properties;
if (!fields?.guards?.properties?.train_test_disjoint) throw new Error("Missing S05 disjointness contract");
fields.guards.properties.purge_applied = { $ref: "#/components/schemas/AppliedTemporalGuardProof" };
fields.guards.properties.embargo_respected = { $ref: "#/components/schemas/AppliedTemporalGuardProof" };
let next = replaceComponent(old, "Split", split, old.indexOf('"schemas": {'));
if (schemas.AppliedTemporalGuardProof) next = replaceComponent(next, "AppliedTemporalGuardProof", proof, next.indexOf('"schemas": {'));
else next = next.replace('"schemas": {\n', `"schemas": {\n      "AppliedTemporalGuardProof": ${JSON.stringify(proof)},\n`);
if (process.argv.includes("--check")) { if (next !== old) throw new Error("Applied temporal guard contract drift"); }
else if (next !== old) writeFileSync(path, next);
