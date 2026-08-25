#!/usr/bin/env node
/**
 * Shadow parity (EL-V2-09): compare two projection documents field by field.
 *
 *   node scripts/shadow-parity.mjs <fixture.json> <shadow.json> [--json]
 *
 * Four lenses, each producing rows for the mismatch table:
 *   schema        — key present on one side only
 *   state         — enum-looking strings (UPPER_SNAKE) that differ
 *   decimal       — numeric strings that differ *as strings* (never as numbers)
 *   completeness  — *_count / has_more / truncated / returned fields that differ
 * A mismatch is printed, never smoothed over. Exit code 1 when any row exists.
 */
import { readFileSync } from "node:fs";

import { pathToFileURL } from "node:url";
const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
const [, , left, right, ...flags] = process.argv;
if (isCli && (!left || !right)) {
  console.error("usage: shadow-parity.mjs <fixture.json> <shadow.json> [--json]");
  process.exit(2);
}
if (isCli) {
  const a = JSON.parse(readFileSync(left, "utf8"));
  const b = JSON.parse(readFileSync(right, "utf8"));
  const rows = compare(a, b);
  if (flags.includes("--json")) console.log(JSON.stringify(rows, null, 2));
  else {
    console.log(`| lens | path | fixture | shadow |\n|---|---|---|---|`);
    for (const r of rows) console.log(`| ${r.lens} | ${r.path} | ${r.left} | ${r.right} |`);
    console.log(`\n${rows.length} mismatch row(s)`);
  }
  process.exit(rows.length ? 1 : 0);
}

export function compare(x, y, path = "", out = []) {
  if (Array.isArray(x) && Array.isArray(y)) {
    if (x.length !== y.length) out.push({ lens: "completeness", path: `${path}.length`, left: String(x.length), right: String(y.length) });
    const n = Math.min(x.length, y.length);
    for (let i = 0; i < n; i += 1) compare(x[i], y[i], `${path}[${i}]`, out);
    return out;
  }
  if (isObj(x) && isObj(y)) {
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
      if (!(k in x)) out.push({ lens: "schema", path: `${path}.${k}`, left: "∅", right: "present" });
      else if (!(k in y)) out.push({ lens: "schema", path: `${path}.${k}`, left: "present", right: "∅" });
      else compare(x[k], y[k], `${path}.${k}`, out);
    }
    return out;
  }
  if (x === y) return out;
  const lens = /(_count|has_more|truncated|returned|total)$/.test(path)
    ? "completeness"
    : typeof x === "string" && /^-?\d+(\.\d+)?$/.test(x)
      ? "decimal"
      : typeof x === "string" && /^[A-Z][A-Z0-9_]+$/.test(x)
        ? "state"
        : "value";
  out.push({ lens, path, left: JSON.stringify(x), right: JSON.stringify(y) });
  return out;
}
function isObj(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
