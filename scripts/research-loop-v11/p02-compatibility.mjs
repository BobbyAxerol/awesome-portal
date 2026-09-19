#!/usr/bin/env node
/** Static companion gate for P02. Runtime proof lives in the focused Vitest suite. */
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const p02 = join(root, "upgrade/research_loop/evidence/P02");
const protectedMain = join(root, "apps/portal/strategy/main.py");
const expectedMainSha256 = "34dc1847d051ca40f9ae3d2fbbf2d7e8fdc6b8d1e853beb0cc480b69afe2054d";
const required = [
  "README.md",
  "contract-freeze.json",
  "endpoint-map.csv",
  "identity-map.md",
  "execution-compatibility-matrix.md",
  "action-side-effect-matrix.csv",
  "optimizer-binding.json",
  "cursor-codec.md",
  "final-audit-relationship.md",
  "decision-register.json",
  "phase-report.md",
  "handoff-claude.md",
  "rollback.md",
  "resource-inventory.json",
  "changes.json",
  "debt-register.json",
  "test-results.json",
];

const actual = createHash("sha256").update(await readFile(protectedMain)).digest("hex");
if (actual !== expectedMainSha256) {
  throw new Error(`Protected QuantBT checksum drifted: expected ${expectedMainSha256}, got ${actual}.`);
}
const seen = new Set(await readdir(p02));
for (const file of required) {
  if (!seen.has(file)) throw new Error(`P02 evidence is missing ${file}.`);
}
const freeze = JSON.parse(await readFile(join(p02, "contract-freeze.json"), "utf8"));
if (freeze.research_contract_version !== "research.run-request.v1") {
  throw new Error("P02 contract-freeze has an unexpected research contract version.");
}
if (freeze.execution_runtime_change !== false || freeze.execution_contract_change !== false) {
  throw new Error("P02 must not claim an Execution runtime or contract change.");
}
const forbidden = /(BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|postgres(?:ql)?:\/\/[^\s]+:[^\s]+@|AKIA[0-9A-Z]{16})/i;
for (const file of required) {
  const body = await readFile(join(p02, file), "utf8");
  if (forbidden.test(body)) throw new Error(`Sensitive-looking content detected in P02 evidence: ${file}.`);
}
console.log(JSON.stringify({
  gate: "P02-static-contract-freeze",
  status: "PASS",
  protected_main_sha256: actual,
  required_artifacts: required.length,
  execution_runtime_change: false,
}));
