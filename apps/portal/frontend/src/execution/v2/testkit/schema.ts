/**
 * A small JSON Schema checker for the conformance gate (Rules 9.8.3: "every
 * fixture the frontend adds passes the published schema").
 *
 * It covers exactly the keywords the published execution schemas use. Any
 * other validating keyword makes it throw, so a schema that grows a keyword
 * this file does not know cannot silently pass everything.
 *
 * Returns the list of violations (empty means valid); it never throws on a
 * bad instance, only on a schema it cannot interpret.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { SCHEMA_DIR } from "./loadCanonical";

type Json = Record<string, unknown>;

/**
 * Keywords that annotate and never reject. `discriminator` is the OpenAPI hint for picking a `oneOf` branch;
 * the branches the published documents carry already pin the tag with a `const`, so ignoring the hint
 * accepts and refuses exactly what the branches do.
 */
const IGNORED = new Set(["$schema", "$id", "$defs", "$comment", "title", "description", "default", "examples", "format", "discriminator", "writeOnly"]);
const KNOWN = new Set([
  "type", "enum", "const", "required", "properties", "additionalProperties", "items", "minItems", "maxItems", "minimum",
  "maximum", "maxLength", "minLength", "pattern", "oneOf", "anyOf", "uniqueItems", "$ref", "prefixItems", "not", "allOf", "if", "then", "else", "contains", "minContains", "maxContains",
  "maxProperties", "propertyNames", "minProperties", "dependentRequired",
]);

const documents = new Map<string, Json>();
function document(file: string): Json {
  let doc = documents.get(file);
  if (!doc) {
    doc = JSON.parse(readFileSync(resolve(SCHEMA_DIR, file), "utf8")) as Json;
    documents.set(file, doc);
  }
  return doc;
}

function pointer(doc: Json, ptr: string): Json {
  let node: unknown = doc;
  for (const part of ptr.split("/").filter((segment) => segment.length > 0)) node = (node as Json | undefined)?.[part];
  if (typeof node !== "object" || node === null) throw new Error(`unresolvable $ref pointer ${ptr}`);
  return node as Json;
}

interface Scope { file: string }

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

function matchesType(value: unknown, wanted: string): boolean {
  const actual = typeOf(value);
  return actual === wanted || (wanted === "number" && actual === "integer");
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function check(schema: Json | boolean, value: unknown, at: string, scope: Scope, out: string[]): void {
  // A boolean schema (JSON Schema 2020-12): `true` accepts anything, `false` accepts nothing. The catalogue's N16B `else` branch forbids the
  // five extra keys with `false` property schemas; without this they would be silently ignored and the oracle would be looser than the contract.
  if (schema === true) return;
  if (schema === false) {
    out.push(`${at}: not allowed`);
    return;
  }
  for (const key of Object.keys(schema)) {
    if (!KNOWN.has(key) && !IGNORED.has(key)) throw new Error(`schema keyword not supported by the testkit checker: ${key}`);
  }
  const ref = schema.$ref;
  if (typeof ref === "string") {
    const [file, ptr] = ref.split("#");
    const target = file ? file : scope.file;
    check(pointer(document(target), ptr ?? ""), value, at, { file: target }, out);
    return;
  }
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? (schema.type as string[]) : [schema.type as string];
    if (!types.some((wanted) => matchesType(value, wanted))) {
      out.push(`${at}: expected ${types.join("|")}, got ${typeOf(value)}`);
      return;
    }
  }
  if (schema.const !== undefined && !same(schema.const, value)) out.push(`${at}: expected const ${JSON.stringify(schema.const)}`);
  if (Array.isArray(schema.enum) && !schema.enum.some((member) => same(member, value))) out.push(`${at}: not in enum`);
  if (Array.isArray(schema.oneOf)) {
    const passing = schema.oneOf.filter((branch) => {
      const branchOut: string[] = [];
      check(branch as Json, value, at, scope, branchOut);
      return branchOut.length === 0;
    }).length;
    if (passing !== 1) out.push(`${at}: matched ${passing} oneOf branches`);
  }
  if (Array.isArray(schema.anyOf)) {
    const any = schema.anyOf.some((branch) => {
      const branchOut: string[] = [];
      check(branch as Json, value, at, scope, branchOut);
      return branchOut.length === 0;
    });
    if (!any) out.push(`${at}: matched no anyOf branch`);
  }
  if (Array.isArray(schema.allOf)) for (const branch of schema.allOf) check(branch as Json, value, at, scope, out);
  if (schema.if && typeof schema.if === "object") {
    const ifOut: string[] = [];
    check(schema.if as Json, value, at, scope, ifOut);
    const taken = ifOut.length === 0 ? schema.then : schema.else;
    if (taken && typeof taken === "object") check(taken as Json, value, at, scope, out);
  }
  if (schema.not && typeof schema.not === "object") {
    const notOut: string[] = [];
    check(schema.not as Json, value, at, scope, notOut);
    if (notOut.length === 0) out.push(`${at}: matched a forbidden (not) schema`);
  }
  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) out.push(`${at}: shorter than ${schema.minLength}`);
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) out.push(`${at}: longer than ${schema.maxLength}`);
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) out.push(`${at}: pattern ${schema.pattern}`);
  }
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) out.push(`${at}: below ${schema.minimum}`);
    if (typeof schema.maximum === "number" && value > schema.maximum) out.push(`${at}: above ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) out.push(`${at}: fewer than ${schema.minItems} items`);
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) out.push(`${at}: more than ${schema.maxItems} items`);
    if (schema.uniqueItems === true && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) out.push(`${at}: items not unique`);
    if (schema.contains && typeof schema.contains === "object") {
      const matching = value.filter((item) => {
        const itemOut: string[] = [];
        check(schema.contains as Json, item, at, scope, itemOut);
        return itemOut.length === 0;
      }).length;
      const min = typeof schema.minContains === "number" ? schema.minContains : 1;
      if (matching < min) out.push(`${at}: fewer than ${min} items match contains`);
      if (typeof schema.maxContains === "number" && matching > schema.maxContains) out.push(`${at}: more than ${schema.maxContains} items match contains`);
    }
    // Tuple form: `prefixItems` pins the leading positions; `items: false` forbids anything after them.
    const prefix = Array.isArray(schema.prefixItems) ? (schema.prefixItems as Json[]) : [];
    prefix.forEach((branch, index) => {
      if (index < value.length) check(branch, value[index], `${at}[${index}]`, scope, out);
    });
    if (schema.items === false && value.length > prefix.length) out.push(`${at}: more than ${prefix.length} items`);
    if (schema.items && typeof schema.items === "object") {
      value.slice(prefix.length).forEach((item, index) => check(schema.items as Json, item, `${at}[${index + prefix.length}]`, scope, out));
    }
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const record = value as Json;
    // `maxProperties`: the object has at most that many own members (a count, whatever the members are).
    if (typeof schema.maxProperties === "number" && Object.keys(record).length > schema.maxProperties) {
      out.push(`${at}: more than ${schema.maxProperties} properties`);
    }
    // `minProperties`: the object has at least that many own members.
    if (typeof schema.minProperties === "number" && Object.keys(record).length < schema.minProperties) {
      out.push(`${at}: fewer than ${schema.minProperties} properties`);
    }
    // `dependentRequired` (JSON Schema 2020-12 section 10.2.2.4): for each property named in the map that is
    // PRESENT in the instance, every property in its list must be present too. A property that is absent
    // imposes nothing; a present one whose value is null still counts as present.
    if (schema.dependentRequired && typeof schema.dependentRequired === "object" && !Array.isArray(schema.dependentRequired)) {
      for (const [trigger, needed] of Object.entries(schema.dependentRequired as Record<string, unknown>)) {
        if (!Array.isArray(needed)) throw new Error(`dependentRequired.${trigger} must be an array of property names`);
        if (!Object.prototype.hasOwnProperty.call(record, trigger)) continue;
        for (const name of needed as string[]) {
          if (!Object.prototype.hasOwnProperty.call(record, name)) out.push(`${at}.${name}: required when ${trigger} is present`);
        }
      }
    }
    // `propertyNames`: every member NAME, as a string instance, must satisfy the subschema (whether or not
    // `properties` also names it). A name that fails is reported at `$.path.<name>`, like a member would be.
    if (schema.propertyNames && typeof schema.propertyNames === "object") {
      for (const name of Object.keys(record)) {
        const nameOut: string[] = [];
        check(schema.propertyNames as Json, name, `${at}.${name}`, scope, nameOut);
        if (nameOut.length > 0) out.push(`${at}.${name}: property name refused (${nameOut.map((line) => line.replace(/^[^:]*: /, "")).join("; ")})`);
      }
    }
    const props = (schema.properties ?? {}) as Record<string, Json | boolean>;
    for (const name of (schema.required ?? []) as string[]) {
      if (!Object.prototype.hasOwnProperty.call(record, name)) out.push(`${at}.${name}: required`);
    }
    for (const [name, child] of Object.entries(record)) {
      const propSchema = Object.prototype.hasOwnProperty.call(props, name) ? props[name] : undefined;
      if (propSchema !== undefined) check(propSchema, child, `${at}.${name}`, scope, out);
      else if (schema.additionalProperties === false) out.push(`${at}.${name}: not allowed`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        check(schema.additionalProperties as Json, child, `${at}.${name}`, scope, out);
      }
    }
  }
}

/** Violations of `file#pointer` by `value`; empty when the value conforms. */
export function validateAgainst(file: string, ptr: string, value: unknown): string[] {
  const name = file.endsWith(".json") ? file : `${file}.schema.json`;
  const out: string[] = [];
  check(ptr === "" ? document(name) : pointer(document(name), ptr), value, "$", { file: name }, out);
  return out;
}
