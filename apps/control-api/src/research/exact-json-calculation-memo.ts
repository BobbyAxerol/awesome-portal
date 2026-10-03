// Only private structuredClone outputs can enter this set. Caller-supplied
// shallow-frozen objects/getters are not evidence of immutable JSON.
const immutablePlainJson = new WeakSet<object>();
const immutableJsonText = new WeakMap<object, string>();
const immutableJsonKeys = new WeakMap<object, string>();
/** Bounded pure JSON calculations; never caches a read, actor, grant or lease. */
export class ExactJsonCalculationMemo<T> {
  private readonly entries = new Map<string, { value: T; expires: number; bytes: number }>();
  private bytes = 0;
  constructor(private readonly maximumBytes = 4 * 1024 * 1024, private readonly maximumEntries = 32,
    private readonly ttlMs = 30_000, private readonly now = () => Date.now()) {
    if (![maximumBytes, maximumEntries, ttlMs].every(value => Number.isSafeInteger(value) && value > 0))
      throw new Error("EXACT_JSON_MEMO_POSITIVE_BOUNDS_REQUIRED");
  }

  calculate(input: unknown, compute: () => T): T {
    let plainJson = false;
    // Exact CURRENT input, not an advertised digest or object identity. toJSON
    // on a Date/class would conceal its different canonical meaning, so such
    // inputs bypass memoization. No source or authorization read is skipped.
    let key: string | undefined;
    try {
      plainJson = isPlainFiniteJson(input);
      // Reuse native JSON text only for our own privately cloned frozen roots;
      // never revisit every numeric field of a 500-KiB fold on a memo hit.
      // Fresh JSONB text needs no second escaping pass. A type prefix keeps a
      // string distinct from an object having that exact JSON representation.
      if (plainJson) key = input && typeof input === "object" && immutableJsonKeys.has(input)
        ? immutableJsonKeys.get(input) : typeof input === "string" ? `S:${input}` : `J:${exactPlainJsonText(input)}`;
    } catch { return compute(); }
    const now = this.now();
    for (const [text, item] of this.entries) if (item.expires <= now) this.remove(text, item.bytes);
    if (!plainJson || typeof key !== "string" || key.length * 2 > this.maximumBytes) return compute();
    const cached = this.entries.get(key);
    if (cached) {
      this.entries.delete(key); this.entries.set(key, cached);
      return cached.value;
    }
    const result = compute(); // Exceptions are never cached.
    let encoded: string | undefined;
    try {
      if (!isPlainFiniteJson(result)) return result;
      encoded = JSON.stringify(result);
    } catch { return result; }
    if (encoded === undefined) return result;
    // Count both encoded result text and its cloned JSON graph conservatively.
    const bytes = 2 * (key.length + 2 * encoded.length);
    if (bytes > this.maximumBytes) return result;
    // A cache entry must not retain or freeze the caller's mutable DB objects.
    const value = structuredClone(result);
    freeze(value);
    if (value && typeof value === "object" && immutablePlainJson.has(value)) {
      immutableJsonText.set(value, encoded);
      immutableJsonKeys.set(value, `J:${encoded}`);
    }
    while (this.entries.size >= this.maximumEntries || this.bytes + bytes > this.maximumBytes) {
      const oldest = this.entries.entries().next().value;
      if (!oldest) break;
      this.remove(oldest[0], oldest[1].bytes);
    }
    this.entries.set(key, { value, expires: now + this.ttlMs, bytes }); this.bytes += bytes;
    return value;
  }
  get retainedBytes(): number { return this.bytes; }
  get retainedEntries(): number { return this.entries.size; }
  private remove(key: string, bytes: number) { this.entries.delete(key); this.bytes -= bytes; }
}
/** Same bytes as native JSON, reusing only our privately cloned frozen roots. */
function exactPlainJsonText(value: unknown): string {
  if (!value || typeof value !== "object") return JSON.stringify(value)!;
  const cached = immutableJsonText.get(value);
  if (cached !== undefined) return cached;
  if (Array.isArray(value)) return `[${value.map(exactPlainJsonText).join(",")}]`;
  return `{${Object.keys(value).map(key => `${JSON.stringify(key)}:${exactPlainJsonText((value as Record<string, unknown>)[key])}`).join(",")}}`;
}
function isPlainFiniteJson(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (typeof (value as { toJSON?: unknown }).toJSON === "function") return false;
  if (immutablePlainJson.has(value)) return true;
  if (Array.isArray(value)) {
    for (const child of value) if (!isPlainFiniteJson(child)) return false;
    return true;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype) return false;
  for (const child of Object.values(value)) if (!isPlainFiniteJson(child)) return false;
  return true;
}
function freeze(value: unknown): void {
  if (!value || typeof value !== "object") return;
  for (const child of Object.values(value)) freeze(child);
  Object.freeze(value);
  if (isPlainFiniteJson(value)) immutablePlainJson.add(value);
}
