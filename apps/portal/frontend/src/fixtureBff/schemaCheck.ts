/**
 * Judge a body against a published schema with the testkit checker.
 *
 * The checker throws on keywords it does not know. `discriminator` and `deprecated` are annotations
 * (dropping them changes nothing); `minProperties` and `unevaluatedProperties` are real constraints
 * it cannot check, so dropping them makes the verdict weaker, and `ignored` says which. Each schema
 * is judged from a copy written to a temp directory (the approach accessEffective.conformance.test.ts
 * takes for `discriminator`). Test support only.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { SCHEMA_DIR } from "../execution/v2/testkit/loadCanonical";
import { validateAgainst } from "../execution/v2/testkit/schema";
import type { SchemaRef } from "./routeTable";

const ANNOTATIONS = new Set(["discriminator", "deprecated"]);
const UNCHECKED = ["minProperties", "unevaluatedProperties"];

let dir: string | null = null;
const copies = new Map<string, { path: string; ignored: string[] }>();

const stripKeywords = (node: unknown): unknown =>
  Array.isArray(node) ? node.map(stripKeywords)
    : node !== null && typeof node === "object"
      ? Object.fromEntries(Object.entries(node).filter(([key]) => !ANNOTATIONS.has(key) && !UNCHECKED.includes(key)).map(([key, child]) => [key, stripKeywords(child)]))
      : node;

export function violationsOf(ref: SchemaRef, body: unknown): { violations: string[]; ignored: string[] } {
  let copy = copies.get(ref.file);
  if (!copy) {
    dir ??= mkdtempSync(join(tmpdir(), "fixture-bff-schema-"));
    const name = ref.file.endsWith(".openapi.json") ? ref.file : `${ref.file}.schema.json`;
    const text = readFileSync(resolve(SCHEMA_DIR, name), "utf8");
    const path = join(dir, name.split("/").pop()!);
    writeFileSync(path, JSON.stringify(stripKeywords(JSON.parse(text))));
    copy = { path, ignored: UNCHECKED.filter((keyword) => text.includes(`"${keyword}"`)) };
    copies.set(ref.file, copy);
  }
  return { violations: validateAgainst(copy.path, ref.ptr, body), ignored: copy.ignored };
}

export function disposeSchemaCheck(): void {
  if (dir !== null) rmSync(dir, { recursive: true, force: true });
  dir = null;
  copies.clear();
}
