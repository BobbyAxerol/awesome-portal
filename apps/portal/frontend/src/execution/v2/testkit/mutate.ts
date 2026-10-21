/**
 * L3 (Rules 9.8.3): whole-body mutations walked from a valid body, for suites that hold a reader to a published schema as the oracle.
 *
 * `negative.ts` generates cases per named path, chosen by the suite. This walks EVERY node of the body (an array only at its first
 * element, to a depth of 6) and, for each, deletes it, swaps it for a value of each wrong kind (null, a number, text, an empty object,
 * an empty array, a boolean, a negative number, a 9000-character string) and, for an object, adds an unknown member. The suite then asks
 * the schema whether each mutant is valid and holds the reader to the answer, so a reader that is looser (or stricter) than the schema
 * anywhere in the body is found without anyone having listed the path.
 *
 * `ZZ_PROBE` is the distinctive text planted in the "text" swap and the unknown member: a reader must never let it reach what it returns.
 */
import type { Draft } from "./matrix";

export type PathStep = string | number;
export interface Mutation {
  name: string;
  value: Draft;
  /** The node the mutation touched. */
  path: readonly PathStep[];
}

export const PROBE = "ZZ_PROBE";
const clone = <T,>(value: T): T => structuredClone(value);

const SWAPS: readonly [string, unknown][] = [
  ["null", null], ["42", 42], ["text", PROBE], ["empty object", {}], ["empty array", []], ["true", true], ["negative one", -1], ["long text", "x".repeat(9000)],
];

/** Every node of `node` (arrays only at index 0), with whether it is an object. */
export function walk(node: Draft, path: PathStep[] = [], depth = 0, out: { path: PathStep[]; object: boolean }[] = []): { path: PathStep[]; object: boolean }[] {
  if (node === null || typeof node !== "object" || depth > 6) return out;
  if (Array.isArray(node)) {
    if (node.length > 0) {
      out.push({ path: [...path, 0], object: typeof node[0] === "object" && node[0] !== null });
      walk(node[0], [...path, 0], depth + 1, out);
    }
    return out;
  }
  for (const key of Object.keys(node)) {
    out.push({ path: [...path, key], object: typeof node[key] === "object" && node[key] !== null });
    walk(node[key], [...path, key], depth + 1, out);
  }
  return out;
}

function at(draft: Draft, path: readonly PathStep[]): { parent: Draft; key: PathStep } {
  const parent = path.slice(0, -1).reduce<Draft>((node, step) => node[step], draft);
  return { parent, key: path[path.length - 1]! };
}

export interface MutateOptions {
  /** True for a node the schema says nothing about (a tolerated unpublished member): it is not mutated. */
  skip?(path: readonly PathStep[]): boolean;
}

export function mutationsOf(source: Draft, options: MutateOptions = {}): Mutation[] {
  const out: Mutation[] = [];
  const label = (path: readonly PathStep[]) => path.join(".");
  for (const { path, object } of walk(source)) {
    if (options.skip?.(path)) continue;
    const del = clone(source);
    const gone = at(del, path);
    if (Array.isArray(gone.parent)) gone.parent.splice(Number(gone.key), 1);
    else delete gone.parent[gone.key];
    out.push({ name: `delete ${label(path)}`, value: del, path });
    for (const [kind, value] of SWAPS) {
      const copy = clone(source);
      const target = at(copy, path);
      target.parent[target.key] = clone(value);
      out.push({ name: `${label(path)} <- ${kind}`, value: copy, path });
    }
    if (object) {
      const copy = clone(source);
      const target = at(copy, path);
      if (!Array.isArray(target.parent[target.key])) {
        target.parent[target.key].zz_extra = PROBE;
        out.push({ name: `${label(path)} + an extra member`, value: copy, path });
      }
    }
  }
  const extraRoot = clone(source);
  extraRoot.zz_extra = PROBE;
  out.push({ name: "root + an extra member", value: extraRoot, path: [] });
  return out;
}
