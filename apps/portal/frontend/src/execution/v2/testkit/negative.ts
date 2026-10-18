/**
 * L3 negative (Rules 9.8.3): payloads a reader must refuse, or map to
 * "unavailable", without throwing and without letting the bad value reach a
 * screen.
 *
 * Each generator takes a canonical object and a path and returns whole
 * mutated payloads with a stable name, a category and a `probe`: a distinctive
 * text that must not appear anywhere in what a reader answers. The suites
 * decide per reader which categories must be rejected outright and which may
 * be tolerated (an extra key, an unknown enum word that renders as "unknown");
 * what is never allowed is a throw, a leak of the probe, or an unknown word
 * turning into a success state.
 */
import { ABSENT, labelOf, setPath, type Path } from "./matrix";

export type NegativeCategory =
  | "wrong-type"
  | "number-as-decimal"
  | "exponent"
  | "negative-zero"
  | "malformed-decimal"
  | "unknown-enum"
  | "missing-required"
  | "null-vs-absent"
  | "duplicate-id"
  | "schema-swapped"
  | "truncated"
  | "huge-string"
  | "prototype-pollution"
  | "bad-integer"
  | "bad-root";

export interface NegativeCase {
  name: string;
  category: NegativeCategory;
  /** The whole mutated payload (or a bad root). */
  value: unknown;
  /** Text that must not appear in any answer built from this payload; null when the case has no distinctive text. */
  probe: string | null;
}

export const POLLUTION_MARKER = "polluted_by_testkit";

const ptext = (path: Path): string => path.join(".");

/** A fresh copy of `base` with `path` set (or removed with ABSENT); safe for in-memory only values (NaN, bigint). */
export function mutated(base: unknown, path: Path, value: unknown): unknown {
  const copy = structuredClone(base);
  setPath(copy, path, value);
  return copy;
}

function make(base: unknown, path: Path, category: NegativeCategory, label: string, value: unknown, probe: string | null = null): NegativeCase {
  return { name: `${category}: ${ptext(path)} <- ${label}`, category, value: mutated(base, path, value), probe };
}

/** A decimal field: wrong types, JS numbers, exponents, signed zeros, malformed text, oversized text. */
export function decimalCases(base: unknown, path: Path): NegativeCase[] {
  const out: NegativeCase[] = [];
  const add = (category: NegativeCategory, value: unknown, probe: string | null = null) =>
    out.push(make(base, path, category, labelOf(value), value, probe));
  for (const value of [true, false, [], ["7654321.125"], {}, { value: "7654321.125" }, () => 1]) add("wrong-type", value);
  for (const value of [7654321.125, 0, 1, -1, 1e21, 1e-7, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 12n]) {
    add("number-as-decimal", value, typeof value === "number" && Number.isFinite(value) && value !== 0 && value !== 1 && value !== -1 ? String(value) : null);
  }
  for (const value of ["1e5", "1E5", "1.5e-7", "9.99e12", "1e+21", "0e0"]) add("exponent", value, value);
  for (const value of ["-0", "-0.0", "-0.00", "-0.000000"]) add("negative-zero", value);
  for (const value of ["01", "00.5", ".5", "5.", "+5", "1,000", "1 000", " 1", "1 ", "0x1F", "NaN", "Infinity", "-", "--1", "1.2.3", "１２３", "1_000", "", "   ", "١٢٣", "1\n", "1\u0000", "null", "undefined"]) {
    add("malformed-decimal", value);
  }
  out.push({ name: `huge-string: ${ptext(path)} <- 70000 digits`, category: "huge-string", value: mutated(base, path, "9".repeat(70_000)), probe: null });
  return out;
}

/** An enum field: words outside the published set, in forms a lenient reader might accept. */
export function enumCases(base: unknown, path: Path, valid: readonly string[]): NegativeCase[] {
  const first = valid[0] ?? "X";
  const out: NegativeCase[] = [];
  const probeWord = "UNKNOWN_WORD_FROM_TESTKIT";
  const words: unknown[] = [
    probeWord, "", " ", first.toLowerCase(), `${first} `, ` ${first}`, `${first}_X`, "OK", "SUCCESS", "null", "undefined", "__proto__", "constructor",
    0, 1, true, {}, [], [first],
  ];
  for (const word of words) {
    out.push(make(base, path, "unknown-enum", labelOf(word), word, word === probeWord ? probeWord : null));
  }
  out.push({ name: `huge-string: ${ptext(path)} <- 70000 chars`, category: "huge-string", value: mutated(base, path, "X".repeat(70_000)), probe: null });
  return out;
}

/** Each path removed (missing-required) and set to null (null-vs-absent). */
export function requiredCases(base: unknown, paths: readonly Path[]): NegativeCase[] {
  return paths.flatMap((path) => [
    make(base, path, "missing-required", "absent", ABSENT),
    make(base, path, "null-vs-absent", "null", null),
  ]);
}

/** A non-negative integer field (a count, a minute figure, a limit). */
export function integerCases(base: unknown, path: Path): NegativeCase[] {
  const out: NegativeCase[] = [];
  const values: unknown[] = [-1, 1.5, "5", "", Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53, 2 ** 53 + 2, 1e21, 1e308, true, [], {}, null, ABSENT];
  for (const value of values) {
    const category: NegativeCategory = value === null ? "null-vs-absent" : value === ABSENT ? "missing-required" : "bad-integer";
    out.push(make(base, path, category, labelOf(value), value));
  }
  return out;
}

/** A free-text or identifier field. */
export function stringCases(base: unknown, path: Path): NegativeCase[] {
  const out: NegativeCase[] = [];
  for (const value of [0, true, {}, [], ["x"], null, ABSENT]) {
    out.push(make(base, path, value === null ? "null-vs-absent" : value === ABSENT ? "missing-required" : "wrong-type", labelOf(value), value));
  }
  for (const value of ["", "   ", "\u0000", "‮evil", "a".repeat(70_000)]) {
    out.push(make(base, path, "huge-string", value.length > 40 ? `${value.length} chars` : JSON.stringify(value), value));
  }
  return out;
}

export interface ArrayOptions {
  /** Path inside an element that identifies it; enables the duplicate-id case. */
  idKey?: string;
}

/** An array field: not an array, bad elements, cut short, cut mid-element, duplicated. */
export function arrayCases(base: unknown, path: Path, options: ArrayOptions = {}): NegativeCase[] {
  const current = path.reduce<unknown>((node, step) => (node as Record<string | number, unknown> | undefined)?.[step], base);
  const items = Array.isArray(current) ? (current as unknown[]) : [];
  const out: NegativeCase[] = [];
  for (const value of [{}, "rows", 0, true, { length: 1, 0: {} }]) out.push(make(base, path, "wrong-type", `not an array: ${labelOf(value)}`, value));
  out.push(make(base, path, "null-vs-absent", "null", null));
  out.push(make(base, path, "missing-required", "absent", ABSENT));
  // A string is a fair element of a string array, so it is only a wrong type where the elements are not strings.
  const badElements: unknown[] = typeof items[0] === "string" || items.length === 0 ? [null, 7, [], true, {}] : [null, 7, "x", [], true];
  for (const value of badElements) {
    out.push(make(base, path, "wrong-type", `first element ${labelOf(value)}`, [value, ...items.slice(1)]));
  }
  if (items.length > 1) out.push(make(base, path, "truncated", `cut to ${Math.floor(items.length / 2)} of ${items.length}`, items.slice(0, Math.floor(items.length / 2))));
  const first = items[0];
  if (first && typeof first === "object" && !Array.isArray(first)) {
    const keys = Object.keys(first as object);
    const half = Object.fromEntries(Object.entries(first as object).slice(0, Math.ceil(keys.length / 2)));
    out.push(make(base, path, "truncated", "first element cut to half its keys", [half, ...items.slice(1)]));
    if (options.idKey) out.push(make(base, path, "duplicate-id", `first element twice by ${options.idKey}`, [first, structuredClone(first), ...items.slice(1)]));
  }
  return out;
}

/** The schema_version field: other published versions, case and spacing variants, wrong types. */
export function schemaVersionCases(base: unknown, path: Path, current: string, others: readonly string[]): NegativeCase[] {
  const values: unknown[] = [...others, current.toUpperCase(), `${current} `, ` ${current}`, current.replace(/\.v\d+$/, ".v999"), "", null, ABSENT, 2, {}];
  return values.map((value) => make(base, path, "schema-swapped", labelOf(value), value));
}

function plantOwn(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, enumerable: true, configurable: true, writable: true });
}

/** Own `__proto__`, `constructor` and `prototype` keys planted in each container path, carrying a marker. */
export function pollutionCases(base: unknown, containers: readonly Path[]): NegativeCase[] {
  const out: NegativeCase[] = [];
  for (const path of containers) {
    for (const key of ["__proto__", "constructor", "prototype"]) {
      const copy = structuredClone(base);
      const host = path.reduce<unknown>((node, step) => (node as Record<string | number, unknown>)[step], copy);
      if (typeof host !== "object" || host === null) throw new Error(`no container at ${ptext(path)}`);
      plantOwn(host as Record<string, unknown>, key, { [POLLUTION_MARKER]: POLLUTION_MARKER, prototype: { [POLLUTION_MARKER]: POLLUTION_MARKER } });
      out.push({ name: `prototype-pollution: ${ptext(path) || "root"} <- own ${key}`, category: "prototype-pollution", value: copy, probe: POLLUTION_MARKER });
    }
  }
  return out;
}

/** Things that are not an object at all. */
export function rootCases(): NegativeCase[] {
  const deep: Record<string, unknown> = {};
  let node = deep;
  for (let level = 0; level < 5000; level += 1) { const next: Record<string, unknown> = {}; node.n = next; node = next; }
  const roots: [string, unknown][] = [
    ["null", null], ["undefined", undefined], ["zero", 0], ["one", 1], ["empty string", ""], ["text", "text"], ["true", true], ["empty array", []],
    ["array of arrays", [[]]], ["empty object", {}], ["function", () => 1], ["date", new Date(0)], ["map", new Map()], ["nested 5000 deep", deep],
  ];
  return roots.map(([label, value]) => ({ name: `bad-root: ${label}`, category: "bad-root", value, probe: null }));
}

function safeText(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, item: unknown) => (typeof item === "bigint" ? `${item}n` : typeof item === "function" ? "[function]" : item)) ?? "undefined";
  } catch {
    return "[unserialisable]";
  }
}

/** True when `probe` shows up anywhere in the serialised answer. */
export function leaked(answer: unknown, probe: string | null): boolean {
  return probe !== null && safeText(answer).includes(probe);
}

/** The shared prototype must carry nothing the payload planted. */
export function prototypeIsClean(): boolean {
  const plain = {} as Record<string, unknown>;
  return plain[POLLUTION_MARKER] === undefined
    && !Object.prototype.hasOwnProperty.call(Object.prototype, POLLUTION_MARKER)
    && !Object.prototype.hasOwnProperty.call(Object.prototype, "prototype");
}
