/**
 * Operations V2 URL state (M3): the window and the filters live in the query
 * string, so a reload, Back and a pasted link land on the same list.
 *
 * Screen-local params, canonical defaults omitted, written lower-case and read
 * in any case:
 *
 *   range         24h (default) | 7d | 30d | 90d | all   the local age window
 *   lens          attention (default) | all
 *   state         unacknowledged | acknowledged | resolved   the triage filter
 *   severity      info | warning | error | critical
 *   verification  not_started | pending | succeeded | ...
 *   target        account | portfolio | deployment          the target type
 *   environment   live | paper | sandbox                    an environment filter
 *   q             the command key search
 *   source        commands | journal                       the Source segment (absent = All). It chooses what the page
 *                                                          shows and is never forwarded to the read: every published row is
 *                                                          an execution command, and the admin journal publishes none (FE-021)
 *
 * `range` is not the shared `window` param: that one has no 24H and defaults
 * to 90D, and the queue's own default is the last 24 hours.
 *
 * A value that is present and not valid reads as the default and is listed in
 * `invalid`, so the screen can say it dropped it. `filter` is what V1's
 * command-center links write (`?filter=findings|broker_sync`); the queue has no
 * equivalent filter, so it is reported as `legacyFilter` and never applied.
 */
import {
  SEVERITIES_V2, TARGET_TYPES_V2, TRIAGE_STATES_V2, VERIFICATION_RESULTS_V2,
  type SeverityV2, type TargetTypeV2, type TriageStateV2, type VerificationResultV2,
} from "../../readers/operationalQueue";
import { EXEC_ENVS, type ExecEnv } from "../../urlState";

export type OpsWindow = "24H" | "7D" | "30D" | "90D" | "ALL";
export const OPS_WINDOWS: readonly OpsWindow[] = ["24H", "7D", "30D", "90D", "ALL"];
export const DEFAULT_RANGE: OpsWindow = "24H";

export type Lens = "attention" | "all";

export interface Filters {
  lens: Lens;
  triage: TriageStateV2 | "";
  severity: SeverityV2 | "";
  verification: VerificationResultV2 | "";
  targetType: TargetTypeV2 | "";
  env: ExecEnv | "";
  commandKey: string;
}
export const NO_FILTERS: Filters = { lens: "attention", triage: "", severity: "", verification: "", targetType: "", env: "", commandKey: "" };

/** The URL keys this screen owns, in the order they are written. */
export const OPS_KEYS = ["range", "lens", "state", "severity", "verification", "target", "environment", "q", "source"] as const;
export type OpsKey = (typeof OPS_KEYS)[number];

/** The Source segment of the hi-fi: All (absent), the command queue, or the admin journal (not published). */
export type OpsSource = "" | "commands" | "journal";
export const OPS_SOURCES: readonly ("commands" | "journal")[] = ["commands", "journal"];

export interface OpsUrl {
  filters: Filters;
  range: OpsWindow;
  /** Which source segment the link chose. */
  source: OpsSource;
  /** Keys that were present and not valid; they read as the default. */
  invalid: readonly OpsKey[];
  /** V1's `filter` value, or null when the URL carries none. Never applied. */
  legacyFilter: string | null;
}

const COMMAND_KEY_MAX = 200;

function pick<T extends string>(raw: string | null, allowed: readonly T[], empty: T | ""): { value: T | ""; ok: boolean } {
  const text = raw?.trim() ?? "";
  if (text === "") return { value: empty, ok: true };
  const upper = text.toUpperCase();
  const hit = allowed.find((candidate) => candidate.toUpperCase() === upper);
  return hit === undefined ? { value: empty, ok: false } : { value: hit, ok: true };
}

export function readOpsUrl(params: URLSearchParams): OpsUrl {
  const invalid: OpsKey[] = [];
  const take = <T extends string>(key: OpsKey, allowed: readonly T[], empty: T | ""): T | "" => {
    const read = pick(params.get(key), allowed, empty);
    if (!read.ok) invalid.push(key);
    return read.value;
  };
  const range = take("range", OPS_WINDOWS, DEFAULT_RANGE) || DEFAULT_RANGE;
  const lens = (take("lens", ["attention", "all"] as const, "attention") || "attention") as Lens;
  const triage = take("state", TRIAGE_STATES_V2, "");
  const severity = take("severity", SEVERITIES_V2, "");
  const verification = take("verification", VERIFICATION_RESULTS_V2, "");
  const targetType = take("target", TARGET_TYPES_V2, "");
  const env = take("environment", EXEC_ENVS.map((e) => e.toUpperCase()) as string[], "");
  let commandKey = (params.get("q") ?? "").trim();
  if (commandKey.length > COMMAND_KEY_MAX || /[\u0000-\u001f]/.test(commandKey)) {
    invalid.push("q");
    commandKey = "";
  }
  const segmentRaw = (params.get("source") ?? "").trim().toLowerCase();
  let source: OpsSource = "";
  if (segmentRaw !== "") {
    if ((OPS_SOURCES as readonly string[]).includes(segmentRaw)) source = segmentRaw as OpsSource;
    else invalid.push("source");
  }
  const legacy = params.get("filter")?.trim() ?? "";
  return {
    source,
    filters: { lens, triage, severity, verification, targetType, env: env === "" ? "" : (env.toLowerCase() as ExecEnv), commandKey },
    range,
    invalid,
    legacyFilter: params.has("filter") ? legacy : null,
  };
}

/** Writes `filters` and `range` over `base`: a default removes its key, every other param is kept. */
export function writeOpsUrl(base: URLSearchParams, state: { filters: Filters; range: OpsWindow; source?: OpsSource }): URLSearchParams {
  const next = new URLSearchParams(base);
  const put = (key: OpsKey, value: string | null) => {
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
  };
  const { filters, range } = state;
  put("range", range === DEFAULT_RANGE ? null : range.toLowerCase());
  put("lens", filters.lens === "attention" ? null : filters.lens);
  put("state", filters.triage === "" ? null : filters.triage.toLowerCase());
  put("severity", filters.severity === "" ? null : filters.severity.toLowerCase());
  put("verification", filters.verification === "" ? null : filters.verification.toLowerCase());
  put("target", filters.targetType === "" ? null : filters.targetType.toLowerCase());
  put("environment", filters.env === "" ? null : filters.env);
  put("q", filters.commandKey === "" ? null : filters.commandKey);
  // The segment is rewritten only by a caller that names it; every other write keeps the param it found.
  if (state.source !== undefined) put("source", state.source === "" ? null : state.source);
  return next;
}

/** What to say when a V1 link asked for a filter the queue does not have. */
export function legacyFilterNotice(value: string): string {
  const word = value === "" ? "a" : `the “${value}”`;
  return `This link asked for ${word} filter. The operations queue has no such filter, so the list is not narrowed by it.`;
}

/** What to say when a param was present and not valid. */
export function invalidNotice(keys: readonly OpsKey[]): string {
  return `Ignored ${keys.length === 1 ? "an unknown value" : "unknown values"} for ${keys.join(", ")} in the link; showing the default${keys.length === 1 ? "" : "s"}.`;
}
