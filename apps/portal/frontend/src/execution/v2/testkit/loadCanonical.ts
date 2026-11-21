/**
 * L0 loader (Rules 9.8.3): the canonical fixtures Codex publishes, read from
 * disk, byte for byte, by tests only.
 *
 * - A caller always receives a fresh parse, so a mutation in one test can never
 *   reach another test or the next call. The file on disk is never written.
 * - `canonicalDigest` lets a suite prove, at its end, that nothing it ran
 *   changed what L0 says (the file text and the digest taken at load time).
 * - Schemas live beside the fixtures; `loadSchema` reads them for the
 *   conformance gate (see schema.ts) and for deriving enum values, so a state
 *   matrix is built from the published vocabulary and not from a copy of it.
 *
 * Plain TypeScript, no React, nothing from the fixture or smoke producers.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

function findContractsDir(): string {
  let dir = __dirname;
  for (let step = 0; step < 12; step += 1) {
    const candidate = join(dir, "packages", "contracts");
    if (existsSync(join(candidate, "fixtures"))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("packages/contracts/fixtures not found above the testkit");
}

export const CONTRACTS_DIR = findContractsDir();
export const FIXTURE_DIR = resolve(CONTRACTS_DIR, "fixtures");
export const SCHEMA_DIR = resolve(CONTRACTS_DIR, "schemas");

/** `execution-alpha-fleet-list.v2` and `execution-alpha-fleet-list.v2.valid.json` name the same file. */
export function canonicalPath(name: string): string {
  const exact = resolve(FIXTURE_DIR, name);
  if (name.endsWith(".json") && existsSync(exact)) return exact;
  const valid = resolve(FIXTURE_DIR, `${name}.valid.json`);
  if (existsSync(valid)) return valid;
  throw new Error(`no canonical fixture named ${name}`);
}

export function listCanonical(): string[] {
  return readdirSync(FIXTURE_DIR).filter((file) => file.endsWith(".valid.json")).sort();
}

export function canonicalText(name: string): string {
  return readFileSync(canonicalPath(name), "utf8");
}

export function canonicalDigest(name: string): string {
  return createHash("sha256").update(readFileSync(canonicalPath(name))).digest("hex");
}

/** A fresh deep copy on every call; mutate it freely. */
export function loadCanonical<T = Record<string, unknown>>(name: string): T {
  return JSON.parse(canonicalText(name)) as T;
}

export function loadSchema(file: string): Record<string, unknown> {
  const name = file.endsWith(".json") ? file : `${file}.schema.json`;
  return JSON.parse(readFileSync(resolve(SCHEMA_DIR, name), "utf8")) as Record<string, unknown>;
}

/** The enum published at a JSON pointer inside a schema, e.g. `/$defs/MetricState/properties/state`. */
export function schemaEnum(file: string, pointer: string): readonly string[] {
  let node: unknown = loadSchema(file);
  for (const part of pointer.split("/").filter((segment) => segment.length > 0)) {
    node = (node as Record<string, unknown> | undefined)?.[part];
  }
  const values = (node as { enum?: unknown } | undefined)?.enum;
  if (!Array.isArray(values)) throw new Error(`no enum at ${file}#${pointer}`);
  return values as string[];
}
