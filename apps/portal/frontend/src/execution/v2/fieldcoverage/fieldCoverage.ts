/**
 * Field coverage (the fixture layer as a business schema).
 *
 * Two questions the conformance suites do not answer, because they only ask "is this payload valid":
 *
 * 1. Which fields does a published schema OFFER that the screen's reader never touches? (`unread`)
 * 2. Which fields does the reader touch that the schema does not publish? (`unknown`) A real Portal Edge that follows
 *    the schema would not send those, so the screen would be showing a value no contract promises.
 *
 * The answer comes from running the real reader on the canonical fixture through a recording Proxy, not from grepping
 * source: a field the reader reads through a helper or a loop still counts. Pure functions, no React.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { SCHEMA_DIR } from "../testkit/loadCanonical";

type Json = Record<string, unknown>;

const documents = new Map<string, Json>();
function document(file: string): Json {
  let doc = documents.get(file);
  if (!doc) {
    doc = JSON.parse(readFileSync(resolve(SCHEMA_DIR, file), "utf8")) as Json;
    documents.set(file, doc);
  }
  return doc;
}

function deref(doc: Json, node: Json): Json {
  const ref = node.$ref;
  if (typeof ref !== "string" || !ref.startsWith("#/")) return node;
  let target: unknown = doc;
  for (const part of ref.slice(2).split("/")) target = (target as Json | undefined)?.[part];
  return typeof target === "object" && target !== null ? deref(doc, target as Json) : node;
}

/** Every property path a schema offers. Arrays are `a[]`, a map with open keys is `a.*`. */
export function offeredPaths(file: string): Set<string> {
  const doc = document(file);
  const out = new Set<string>();
  const seen = new Set<string>();
  const walk = (raw: Json, path: string, depth: number): void => {
    if (depth > 12) return;
    const node = deref(doc, raw);
    const key = `${path}@${typeof node.$id === "string" ? node.$id : ""}${JSON.stringify(Object.keys(node))}`;
    if (seen.has(key) && depth > 6) return;
    seen.add(key);
    for (const combo of ["allOf", "oneOf", "anyOf"] as const) {
      const branches = node[combo];
      if (Array.isArray(branches)) for (const branch of branches) if (typeof branch === "object" && branch !== null) walk(branch as Json, path, depth + 1);
    }
    const props = node.properties as Json | undefined;
    if (props) {
      for (const [name, child] of Object.entries(props)) {
        const next = path === "" ? name : `${path}.${name}`;
        out.add(next);
        if (typeof child === "object" && child !== null) walk(child as Json, next, depth + 1);
      }
    }
    const items = node.items;
    if (typeof items === "object" && items !== null && !Array.isArray(items)) walk(items as Json, `${path}[]`, depth + 1);
    const extra = node.additionalProperties;
    if (typeof extra === "object" && extra !== null && !props) {
      out.add(`${path}.*`);
      walk(extra as Json, `${path}.*`, depth + 1);
    }
  };
  walk(doc, "", 0);
  return out;
}

/** The leaves: an offered path that no other offered path extends. A container read counts through its children. */
export function leaves(paths: ReadonlySet<string>): string[] {
  const all = [...paths];
  return all.filter((p) => !all.some((q) => q !== p && (q.startsWith(`${p}.`) || q.startsWith(`${p}[]`)))).sort();
}

/** Wrap a value so every property read is recorded as a normalised path (`rows[].owner`). */
export function recordReads(value: unknown, offered: ReadonlySet<string>): { proxy: unknown; reads: Set<string> } {
  const reads = new Set<string>();
  const wrap = (node: unknown, path: string): unknown => {
    if (typeof node !== "object" || node === null) return node;
    const isArray = Array.isArray(node);
    return new Proxy(node as object, {
      get(target, prop, receiver) {
        const got = Reflect.get(target, prop, receiver);
        if (typeof prop !== "string") return got;
        if (isArray) {
          if (/^\d+$/.test(prop)) return wrap(got, `${path}[]`);
          return got;
        }
        if (typeof got === "function") return got;
        let next = path === "" ? prop : `${path}.${prop}`;
        if (!offered.has(next) && offered.has(path === "" ? "*" : `${path}.*`)) next = path === "" ? "*" : `${path}.*`;
        reads.add(next);
        return wrap(got, next);
      },
    });
  };
  return { proxy: wrap(value, ""), reads };
}

export interface Coverage {
  offered: number;
  read: number;
  /** Offered leaf fields the reader never touched. */
  unread: string[];
  /** Fields the reader touched that the schema does not publish. */
  unknown: string[];
}

export function coverageOf(schemaFile: string, fixture: unknown, reader: (raw: unknown) => unknown): Coverage & { result: unknown } {
  const offered = offeredPaths(schemaFile);
  const { proxy, reads } = recordReads(fixture, offered);
  const result = reader(proxy);
  const readLeafOrContainer = (path: string): boolean =>
    reads.has(path) || [...reads].some((r) => r.startsWith(`${path}.`) || r.startsWith(`${path}[]`));
  const unread = leaves(offered).filter((p) => !readLeafOrContainer(p));
  const unknown = [...reads].filter((r) => !offered.has(r)).sort();
  return { offered: offered.size, read: [...offered].filter((p) => reads.has(p)).length, unread, unknown, result };
}

/** Every property name any published schema carries, with where: the "does the contract carry it at all" lookup. */
export function schemaIndex(files: readonly string[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  const add = (key: string, where: string): void => {
    const list = index.get(key) ?? [];
    list.push(where);
    index.set(key, list);
  };
  for (const file of files) {
    const label = file.replace(".schema.json", "");
    for (const path of offeredPaths(file)) add((path.split(/[.[\]]+/).filter(Boolean).pop() ?? path).toLowerCase(), `${label}:${path}`);
    // An enum value is a published vocabulary word (`metric: NET_PNL`): indexed as `=net_pnl`.
    const text = readFileSync(resolve(SCHEMA_DIR, file), "utf8");
    for (const match of text.matchAll(/"enum"\s*:\s*\[([^\]]*)\]/g)) {
      for (const word of match[1].matchAll(/"([A-Za-z0-9_]+)"/g)) add(`=${word[1].toLowerCase()}`, `${label}:enum`);
    }
  }
  return index;
}

/* ── layer 2: what the screen's model uses of what its reader returned ───────────────────────────────────────── */

/** Every leaf path of a plain value (`page.rows[].owner`). Empty arrays and nulls count as a leaf at their own path. */
export function plainLeaves(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) {
    if (value.length === 0) return [path];
    return [...new Set(value.flatMap((item) => plainLeaves(item, `${path}[]`)))];
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Json);
    if (entries.length === 0) return [path];
    return entries.flatMap(([key, child]) => plainLeaves(child, path === "" ? key : `${path}.${key}`));
  }
  return [path];
}

/** Like `recordReads` but for a typed reader result, where no schema names the paths. */
export function recordPlain(value: unknown): { proxy: unknown; reads: Set<string> } {
  const reads = new Set<string>();
  const wrap = (node: unknown, path: string): unknown => {
    if (typeof node !== "object" || node === null) return node;
    const isArray = Array.isArray(node);
    return new Proxy(node as object, {
      get(target, prop, receiver) {
        const got = Reflect.get(target, prop, receiver);
        if (typeof prop !== "string") return got;
        if (isArray) return /^\d+$/.test(prop) ? wrap(got, `${path}[]`) : got;
        if (typeof got === "function") return got;
        const next = path === "" ? prop : `${path}.${prop}`;
        reads.add(next);
        return wrap(got, next);
      },
    });
  };
  return { proxy: wrap(value, ""), reads };
}

/** Leaves of the reader's result that the model never touched: a fact the read carried and the screen does not use. */
export function unusedByModel<T>(result: T, use: (recorded: T) => void): string[] {
  const { proxy, reads } = recordPlain(result);
  use(proxy as T);
  const touched = (path: string): boolean => reads.has(path) || [...reads].some((r) => r.startsWith(`${path}.`) || r.startsWith(`${path}[]`));
  return plainLeaves(result).filter((leaf) => leaf !== "" && !touched(leaf)).sort();
}
