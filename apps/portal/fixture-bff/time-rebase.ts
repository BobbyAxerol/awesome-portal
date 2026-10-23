/**
 * Preview-only clock anchor (FIXTURE_REBASE_TIME=1).
 *
 * The doubles are written against one fixed instant (OPERATIONS_V2_DOUBLE_NOW_ISO, 22 Aug 2026), which is right for the pixel
 * baselines (the browser clock is pinned to it there). A person looking at the live review preview has a real clock, so every
 * 24H or 7D window sees only "old" data and an Operations table draws no rows. This shifts the time-valued fields of a served body by
 * (real now minus the doubles' instant) so the fixture reads as current. It is OFF by default, so conformance tests, goldens and the
 * baselines are untouched, and it changes nothing but time: no figure, id, count, hash or cursor.
 *
 * What counts as a time: a string that is exactly an ISO-8601 UTC instant (`...Z`, millis kept as they were) or a plain
 * `YYYY-MM-DD` day (shifted by whole days), and a number under a key ending `_ms` that is a plausible epoch in milliseconds.
 * Anything else (durations, counters, ids, free text) is left alone.
 */

const INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,9})?Z$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MS_DAY = 86_400_000;
/** A plausible epoch in ms: 2017 to 2096. Smaller numbers under `_ms` keys are durations. */
const EPOCH_MS_MIN = 1.5e12;
const EPOCH_MS_MAX = 4e12;

export function rebaseTimes(value: unknown, deltaMs: number, key = ""): unknown {
  if (deltaMs === 0) return value;
  if (typeof value === "string") {
    const m = INSTANT.exec(value);
    if (m) {
      const at = Date.parse(value);
      if (!Number.isFinite(at)) return value;
      const shifted = new Date(at + deltaMs).toISOString();
      if (m[7] === undefined) return shifted.replace(/\.\d{3}Z$/, "Z");
      // Up to nine fraction places are legal (the queue keyset is six wide): the first three move with the clock, the rest are
      // kept as written, so the number of places is the one the body had.
      const places = m[7].slice(1);
      return places.length <= 3 ? shifted : `${shifted.slice(0, 19)}.${shifted.slice(20, 23)}${places.slice(3)}Z`;
    }
    if (DAY.test(value)) {
      const at = Date.parse(`${value}T00:00:00Z`);
      if (!Number.isFinite(at)) return value;
      return new Date(at + Math.round(deltaMs / MS_DAY) * MS_DAY).toISOString().slice(0, 10);
    }
    return value;
  }
  if (typeof value === "number") {
    return key.endsWith("_ms") && Number.isInteger(value) && value >= EPOCH_MS_MIN && value <= EPOCH_MS_MAX ? value + Math.round(deltaMs) : value;
  }
  if (Array.isArray(value)) return value.map((item) => rebaseTimes(item, deltaMs, key));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = rebaseTimes(v, deltaMs, k);
    return out;
  }
  return value;
}

/** Real now (to the minute, so two reads a moment apart agree) less the instant the doubles are written against. */
export function rebaseDelta(doubleNowIso: string, realNowMs: number): number {
  const anchor = Date.parse(doubleNowIso);
  return Math.floor(realNowMs / 60_000) * 60_000 - anchor;
}

/**
 * The instant a body says it was read, when it says so at the top level (`read_at` as an ISO instant or `read_at_ms`). The doubles are
 * not written against one instant (the operations double uses 22 Aug, the alpha doubles 17 Oct), so shifting every body by one global
 * delta would push some of them past the real clock. A body that names its own read time is shifted so that read time becomes "now";
 * everything inside it keeps its distance from that read time, which is what makes a window, a series and an event ribbon line up.
 */
export function bodyAnchor(body: unknown): number | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  const iso = record.read_at;
  if (typeof iso === "string" && INSTANT.test(iso)) {
    const at = Date.parse(iso);
    if (Number.isFinite(at)) return at;
  }
  const ms = record.read_at_ms;
  if (typeof ms === "number" && Number.isInteger(ms) && ms >= EPOCH_MS_MIN && ms <= EPOCH_MS_MAX) return ms;
  return null;
}

/** Keys whose instant is a deadline or a ceiling: allowed to lie in the future, and never the anchor of a body. */
const DEADLINE_KEY = /(^|_)(due|expires?|expiry|valid_until|until|deadline|next|ceiling|retention_floor|renew|rotate|opens|review|scheduled|planned)(_|$)/i;
/** Content may legitimately sit this far after the stated read time in a double (a series written against another clock); beyond it is a deadline. */
const CONTENT_WINDOW_MS = 120 * MS_DAY;

/** The latest instant of the body that is content (not a deadline) and within CONTENT_WINDOW_MS of `after`. */
export function latestContentInstant(value: unknown, after: number, key = ""): number {
  let latest = after;
  const consider = (at: number): void => { if (Number.isFinite(at) && at > latest && at <= after + CONTENT_WINDOW_MS) latest = at; };
  if (DEADLINE_KEY.test(key)) return latest;
  if (typeof value === "string") {
    if (INSTANT.test(value)) consider(Date.parse(value));
  } else if (typeof value === "number") {
    if (key.endsWith("_ms") && Number.isInteger(value) && value >= EPOCH_MS_MIN && value <= EPOCH_MS_MAX) consider(value);
  } else if (Array.isArray(value)) {
    for (const item of value) latest = Math.max(latest, latestContentInstant(item, after, key));
  } else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) latest = Math.max(latest, latestContentInstant(v, after, k));
  }
  return latest;
}

/**
 * Shift a served body to the real clock: by its own read time when it names one, else by the doubles' common instant. WP-P: when the content of
 * a body reaches past its stated read time (a series or an activity list written against a later clock than its envelope), the latest content
 * instant is the anchor, so no content lands after "now" (only deadline keys may). One constant shift per body, so distances are preserved.
 */
export function rebaseBody(body: unknown, doubleNowIso: string, realNowMs: number): unknown {
  const now = Math.floor(realNowMs / 60_000) * 60_000;
  const read = bodyAnchor(body);
  if (read === null) return rebaseTimes(body, now - latestContentInstant(body, Date.parse(doubleNowIso))); // no stated read time: the doubles' common instant, or later content
  return rebaseTimes(body, now - latestContentInstant(body, read));
}

/** Test and walker helper: every non-deadline instant of a body later than `limitMs`, as `path=value`. */
export function futureInstants(value: unknown, limitMs: number, path = "", key = ""): string[] {
  if (DEADLINE_KEY.test(key)) return [];
  if (typeof value === "string") return INSTANT.test(value) && Date.parse(value) > limitMs ? [`${path}=${value}`] : [];
  if (typeof value === "number") return key.endsWith("_ms") && Number.isInteger(value) && value >= EPOCH_MS_MIN && value <= EPOCH_MS_MAX && value > limitMs ? [`${path}=${new Date(value).toISOString()}`] : [];
  if (Array.isArray(value)) return value.flatMap((item, index) => futureInstants(item, limitMs, `${path}[${index}]`, key));
  if (value !== null && typeof value === "object") return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => futureInstants(v, limitMs, `${path}.${k}`, k));
  return [];
}
