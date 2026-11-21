/**
 * Small typed combinators for the closed sibling reads of WP-K (`siblings.generated.ts` is written by the contracts generator from the same definitions
 * that write the JSON Schemas, so the reader and the schema cannot drift apart; `siblings.test.ts` still judges each against the other).
 *
 * Rules every combinator keeps: an object is CLOSED (an unknown key fails), a number is a safe integer (never a float, never a numeric string), money and
 * ratios are exact decimal TEXT, a clock is a non-negative safe integer, text is printable and bounded. A section (`sec`) has three states:
 * key omitted -> NO_SOURCE, `null` -> NOT_READ, a value -> PUBLISHED. Nothing here throws: a failure is the `FAIL` symbol and the whole read is `null`.
 */
import type { UtcEpochMs } from "../../screenDataContract";
import { clockMs } from "./managerMetric";

export const FAIL: unique symbol = Symbol("strict-read-fail");
export type Fail = typeof FAIL;
export interface R<T> { (raw: unknown): T | Fail; section?: true }
export type Out<X> = X extends R<infer T> ? T : never;
export type Section<T> = { state: "NO_SOURCE" } | { state: "NOT_READ" } | { state: "PUBLISHED"; value: T };

const PRINTABLE = /^[^\u0000-\u001f\u007f]+$/;
const ID = /^[A-Za-z0-9._:-]{1,191}$/;
const DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const SHA = /^sha256:[a-f0-9]{64}$/;
const CODE = /^[A-Z][A-Z0-9_]{1,63}$/;
const PATH = /^\/[^\u0000-\u001f\u007f\s]*$/;

export const str = (max = 256): R<string> => (raw) => (typeof raw === "string" && raw.length >= 1 && raw.length <= max && PRINTABLE.test(raw) ? raw : FAIL);
const pattern = (re: RegExp, max: number): R<string> => (raw) => (typeof raw === "string" && raw.length <= max && re.test(raw) ? raw : FAIL);
export const id: R<string> = pattern(ID, 191);
export const dec: R<string> = pattern(DECIMAL, 80);
export const sha: R<string> = pattern(SHA, 71);
export const code: R<string> = pattern(CODE, 64);
export const path: R<string> = pattern(PATH, 512);
export const ms: R<UtcEpochMs> = (raw) => clockMs(raw) ?? FAIL;
export const int = (min = 0, max = Number.MAX_SAFE_INTEGER): R<number> => (raw) => (typeof raw === "number" && Number.isSafeInteger(raw) && raw >= min && raw <= max ? raw : FAIL);
export const bool: R<boolean> = (raw) => (typeof raw === "boolean" ? raw : FAIL);
export const lit = <V extends string | number | boolean>(value: V): R<V> => (raw) => (raw === value ? value : FAIL);
export const en = <V extends string>(...values: readonly V[]): R<V> => (raw) => (typeof raw === "string" && (values as readonly string[]).includes(raw) ? (raw as V) : FAIL);
export const nul = <T>(inner: R<T>): R<T | null> => (raw) => (raw === null ? null : inner(raw));
export const arr = <T>(inner: R<T>, max = 200, min = 0): R<readonly T[]> => (raw) => {
  if (!Array.isArray(raw) || raw.length > max || raw.length < min) return FAIL;
  const out: T[] = [];
  for (const item of raw) { const v = inner(item); if (v === FAIL) return FAIL; out.push(v); }
  return out;
};
/** A section: used as an object property, it may be omitted (no owning source) or null (not read). */
export const sec = <T>(inner: R<T>): R<Section<T>> => { const r = ((raw: unknown) => { const v = inner(raw); return v === FAIL ? FAIL : ({ state: "PUBLISHED", value: v } as Section<T>); }) as R<Section<T>>; r.section = true; return r; };
export const refine = <T>(inner: R<T>, ok: (value: T) => boolean): R<T> => (raw) => { const v = inner(raw); return v === FAIL || !ok(v) ? FAIL : v; };

export const obj = <S extends Record<string, R<unknown>>>(shape: S): R<{ [K in keyof S]: Out<S[K]> }> => (raw) => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return FAIL;
  const body = raw as Record<string, unknown>;
  for (const key of Object.keys(body)) if (!(key in shape)) return FAIL;
  const out: Record<string, unknown> = {};
  for (const [key, reader] of Object.entries(shape)) {
    const has = Object.prototype.hasOwnProperty.call(body, key);
    if (reader.section === true) {
      if (!has) { out[key] = { state: "NO_SOURCE" }; continue; }
      if (body[key] === null) { out[key] = { state: "NOT_READ" }; continue; }
    } else if (!has) return FAIL;
    const v = reader(body[key]);
    if (v === FAIL) return FAIL;
    out[key] = v;
  }
  return out as { [K in keyof S]: Out<S[K]> };
};

/** Run a reader and never throw: `null` is malformed. */
export function run<T>(reader: R<T>, raw: unknown): T | null {
  try { const v = reader(raw); return v === FAIL ? null : v; } catch { return null; }
}
