/**
 * The form reads every instant as UTC and keeps it as typed (`2026-08-03T00:00`). The server's stricter recipes (the native fixed windows) refuse an
 * instant with no zone, so what is SENT says it: `…T00:00:00Z`. Only the declared window fields are touched, only when they carry no zone;
 * the draft, its comparisons and its stored form stay as typed.
 */
const NAIVE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2}(?:\.\d{1,3})?)?$/;

function utc(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const match = NAIVE.exec(value);
  return match === null ? value : `${match[1]}${match[2] ?? ":00"}Z`;
}

export function withUtcInstants<T>(spec: T): T {
  if (spec === null || typeof spec !== "object") return spec;
  const out = { ...(spec as Record<string, unknown>) };
  const windows = out.windows;
  if (windows !== null && typeof windows === "object") {
    out.windows = Object.fromEntries(
      Object.entries(windows as Record<string, unknown>).map(([name, window]) => [
        name,
        window !== null && typeof window === "object"
          ? { ...(window as Record<string, unknown>), ...(("start" in (window as object)) ? { start: utc((window as Record<string, unknown>).start) } : {}), ...(("end_exclusive" in (window as object)) ? { end_exclusive: utc((window as Record<string, unknown>).end_exclusive) } : {}) }
          : window,
      ]),
    );
  }
  const walk = out.walk_forward;
  if (walk !== null && typeof walk === "object") {
    const w = { ...(walk as Record<string, unknown>) };
    for (const key of ["start", "end_exclusive", "split_mode"]) if (key in w) w[key] = utc(w[key]);
    out.walk_forward = w;
  }
  return out as T;
}
