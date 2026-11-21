/**
 * Window authorisation guard for every script that touches a real Portal origin (M-2 tiers 3-4, M-3c, M-4b, M-5, M-6c, M-7).
 *
 * A window is granted by the SOURCE OWNER (Edge / Core ops / Codex), never by the script's operator and never by a chat
 * message. The grantor writes an authorisation record and tells the operator its sha256 out of band; the script refuses to
 * start unless the file's digest matches, the time is inside [starts_at_ms, ends_at_ms], the measurement and the lane are named
 * in it, and the target origin is the one it names. A missing record, a stale record or a mismatch is a hard stop (exit 3).
 *
 * Record (schema `portal.elp2-10.window-authorization.v1`):
 *   window_id, granted_by, granted_at_ms, starts_at_ms, ends_at_ms, measurements ["M-5", ...], lane, run_kind,
 *   base_url (origin only), max_rps, max_tabs, max_duration_ms, stop_rollback (text), repin (free-form pins), notes
 * No secret belongs in it. Credentials are passed as file paths on the command line and never written to a receipt.
 */
import { readFileSync } from "node:fs";

import { LANES, RUN_KINDS, sha256File } from "./receipt.mjs";

export const WINDOW_SCHEMA = "portal.elp2-10.window-authorization.v1";
export class WindowRefused extends Error {
  constructor(code, detail = "") { super(`WINDOW_REFUSED:${code}${detail ? `:${detail}` : ""}`); this.code = code; }
}

export function loadWindow(path, expectedSha256, { measurement, nowMs = Date.now(), allowLanes = LANES, selfTest = false } = {}) {
  if (!path || !expectedSha256) throw new WindowRefused("AUTHORISATION_AND_SHA256_REQUIRED");
  const actual = sha256File(path);
  if (actual !== expectedSha256) throw new WindowRefused("AUTHORISATION_DIGEST_MISMATCH", `${actual}`);
  const w = JSON.parse(readFileSync(path, "utf8"));
  if (w.schema_version !== WINDOW_SCHEMA) throw new WindowRefused("SCHEMA");
  for (const k of ["window_id", "granted_by", "base_url", "stop_rollback"]) if (typeof w[k] !== "string" || !w[k].trim()) throw new WindowRefused("FIELD_MISSING", k);
  for (const k of ["granted_at_ms", "starts_at_ms", "ends_at_ms", "max_rps", "max_tabs", "max_duration_ms"]) if (!Number.isFinite(w[k]) || w[k] <= 0) throw new WindowRefused("FIELD_INVALID", k);
  if (!Array.isArray(w.measurements) || !w.measurements.includes(measurement)) throw new WindowRefused("MEASUREMENT_NOT_AUTHORISED", measurement);
  if (!LANES.includes(w.lane) || !allowLanes.includes(w.lane)) throw new WindowRefused("LANE_NOT_ALLOWED", w.lane);
  if (!RUN_KINDS.includes(w.run_kind)) throw new WindowRefused("RUN_KIND");
  if (w.granted_at_ms > nowMs) throw new WindowRefused("GRANTED_IN_THE_FUTURE");
  if (nowMs < w.starts_at_ms) throw new WindowRefused("WINDOW_NOT_OPEN_YET");
  if (nowMs >= w.ends_at_ms) throw new WindowRefused("WINDOW_CLOSED");
  const origin = new URL(w.base_url);
  if (origin.pathname !== "/" || origin.search || origin.hash || origin.username) throw new WindowRefused("BASE_URL_MUST_BE_AN_ORIGIN");
  if (!selfTest && /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(origin.hostname)) throw new WindowRefused("LOCAL_ORIGIN_IS_NOT_A_REAL_WINDOW");
  return { ...w, origin: origin.origin, authorisation_sha256: actual };
}

/** Milliseconds this run may still use: the window end minus a guard band, and the record's own duration cap. */
export function remainingMs(w, nowMs = Date.now(), guardMs = 5_000) { return Math.max(0, Math.min(w.ends_at_ms - guardMs - nowMs, w.max_duration_ms)); }

export function assertSameOrigin(w, url) {
  if (new URL(url).origin !== w.origin) throw new WindowRefused("ORIGIN_MISMATCH", new URL(url).origin);
}
