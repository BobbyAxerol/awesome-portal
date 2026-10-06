/** FULL-01: one authoring table, deterministic image-owned TS/Python views. */
import {readFileSync, writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import Ajv from "ajv";

const root = new URL("../../../", import.meta.url), check = process.argv.includes("--check");
const sourcePath = "apps/portal/registry/research-execution-recipes.v1.json";
const source = readFileSync(new URL(sourcePath, root), "utf8"), table = JSON.parse(source);
const normalize = value => Array.isArray(value) ? value.map(normalize) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])])) : value;
const hash = value => createHash("sha256").update(JSON.stringify(normalize(value))).digest("hex");
const bytesHash = bytes => createHash("sha256").update(bytes).digest("hex");
const schema = JSON.parse(readFileSync(new URL("apps/portal/registry/research-execution-recipes.v1.schema.json", root)));
const validate = new Ajv({allErrors:true, strict:false}).compile(schema);
if (!validate(table)) throw new Error(JSON.stringify(validate.errors));
const refs = new Map();
for (const ref of table.qualification_references) {
  if (refs.has(ref.profile_id) || ref.receipt_path?.split("/").includes("..")) throw new Error("Duplicate/unsafe qualification binding");
  if (ref.kind !== "CANDIDATE_NOT_QUALIFIED"
      && bytesHash(readFileSync(new URL(ref.receipt_path, root))) !== ref.receipt_sha256) throw new Error(`Receipt drift: ${ref.profile_id}`);
  refs.set(ref.profile_id, ref);
}
const ids = new Set();
for (const row of table.recipes) {
  if (ids.has(row.profile_id)) throw new Error(`Ambiguous recipe: ${row.profile_id}`);
  ids.add(row.profile_id);
  if (row.descriptor.profile_id !== row.profile_id || row.public_profile.profile_id !== row.profile_id
      || row.descriptor.engine_release_id !== row.public_profile.engine_release_id
      || row.descriptor.execution_route !== row.public_profile.execution_route
      || row.descriptor.protocol !== row.public_profile.protocol) throw new Error(`Descriptor/policy mismatch: ${row.profile_id}`);
  if (row.profile_digest !== null && hash(row.descriptor) !== row.profile_digest) throw new Error(`Historical profile digest drift: ${row.profile_id}`);
  if (row.profile_digest === null && row.profile_id !== "p04.fixed-qualification.v1") throw new Error("Only legacy P04 has a null profile digest");
  const ref = refs.get(row.profile_id);
  if (!ref || hash(row) !== ref.recipe_digest) throw new Error(`Unqualified recipe policy change: ${row.profile_id}`);
  if (row.budgets.cpu_seconds !== row.descriptor.child_limits.cpu_seconds
      || row.budgets.wall_seconds !== row.descriptor.child_limits.wall_seconds) throw new Error("Child budget parity drift");
  if (row.public_profile.trial_count.min > row.public_profile.trial_count.max
      || row.public_profile.trial_default < row.public_profile.trial_count.min
      || row.public_profile.trial_default > row.public_profile.trial_count.max) throw new Error("Invalid trial budget");
  if (row.preview_override && (row.adapter_kind !== "DELTA_WFO" || row.public_profile.optimization_schedule !== "global"))
    throw new Error("Preview long budget cannot widen a causal or non-WFO recipe");
}
if (refs.size !== ids.size) throw new Error("Orphan qualification reference");

function emit(path, content) {
  const url = new URL(path, root);
  if (check) { if (readFileSync(url, "utf8") !== content) throw new Error(`${path} drift; regenerate recipes`); }
  else writeFileSync(url, content);
}
const revision = hash(table);
// Additive public retry detail; no raw database/transport diagnostic.
const preflightPath = "packages/contracts/openapi/research-preflight.openapi.json";
const preflight = JSON.parse(readFileSync(new URL(preflightPath, root)));
preflight.components.schemas.Problem.properties.details.properties.retry_after_seconds = {type:"integer",minimum:1,maximum:3600};
emit(preflightPath, JSON.stringify(preflight,null,2)+"\n");
emit("apps/control-api/src/research/execution-recipes.generated.ts",
  `// Generated from ${sourcePath}; do not hand-edit.\nexport const EXECUTION_RECIPE_TABLE = ${JSON.stringify(table, null, 2)} as const;\nexport const EXECUTION_RECIPE_REVISION = "${revision}" as const;\n`);
emit("apps/portal/backend/src/portal_api/domain/research_execution_recipes_generated.py",
  `"""Generated from ${sourcePath}; no engine/data/IO imports."""\nimport json\n\nEXECUTION_RECIPE_TABLE = json.loads(r'''${JSON.stringify(table, null, 2)}''')\nEXECUTION_RECIPE_REVISION = "${revision}"\n`);
console.log(`Research execution recipes: ${table.recipes.length} exact recipe bindings, revision ${revision}; ${check ? "verified" : "generated"}.`);
