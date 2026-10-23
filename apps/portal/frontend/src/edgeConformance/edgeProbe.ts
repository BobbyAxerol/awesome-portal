/**
 * The pure parts of the connected conformance probe (ELP2-10 closeout §2): limits that must be finite and non-negative, the
 * classification of one answer (a 200 that is not JSON is a finding, not a crash), and the verdict of a whole run. A report-only
 * run is not a passing source-conformance verdict: `verdictOf` says PASS only when something was sent and every sent route is OK.
 */

export interface ProbeLimits { maxRequests: number; delayMs: number; timeoutMs: number }

export type EnvLike = Record<string, string | undefined>;

const DEFAULTS = { EDGE_MAX_REQUESTS: 150, EDGE_DELAY_MS: 250, EDGE_TIMEOUT_MS: 15_000 } as const;
const CEILING = { EDGE_MAX_REQUESTS: 1000, EDGE_DELAY_MS: 60_000, EDGE_TIMEOUT_MS: 120_000 } as const;

function limit(env: EnvLike, name: keyof typeof DEFAULTS): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return DEFAULTS[name];
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || (name !== "EDGE_DELAY_MS" && !Number.isInteger(value))) {
    throw new Error(`${name} must be a finite non-negative ${name === "EDGE_DELAY_MS" ? "number" : "integer"}, got "${raw}"`);
  }
  if (value > CEILING[name]) throw new Error(`${name} must be at most ${CEILING[name]}, got ${value}`);
  if (name === "EDGE_TIMEOUT_MS" && value === 0) throw new Error("EDGE_TIMEOUT_MS must be at least 1: a probe without a timeout can hang");
  return value;
}

export function parseLimits(env: EnvLike): ProbeLimits {
  return { maxRequests: limit(env, "EDGE_MAX_REQUESTS"), delayMs: limit(env, "EDGE_DELAY_MS"), timeoutMs: limit(env, "EDGE_TIMEOUT_MS") };
}

export type ProbeResult =
  | "OK" | "NOT_200" | "NON_JSON_BODY" | "SCHEMA_VIOLATIONS" | "READER_REFUSED" | "NETWORK_ERROR" | "TIMEOUT"
  | "SKIPPED_NO_REAL_ID" | "SKIPPED_REQUEST_CAP";

export interface Answer {
  status: number;
  /** The parsed JSON body, or `null` when the body was not JSON. */
  body: unknown;
  /** `true` when the body was announced or parsed as something other than JSON. */
  nonJson: boolean;
}

export interface Judgement { schemaViolations: number; readerAccepted: boolean | null }

/** Classify one answer. A 200 with no JSON body never reaches the schema or the reader (there is nothing to judge). */
export function classify(answer: Answer, judge: () => Judgement): ProbeResult {
  if (answer.status !== 200) return "NOT_200";
  if (answer.nonJson || answer.body === null) return "NON_JSON_BODY";
  const judgement = judge();
  if (judgement.schemaViolations > 0) return "SCHEMA_VIOLATIONS";
  if (judgement.readerAccepted === false) return "READER_REFUSED";
  return "OK";
}

export interface Verdict { verdict: "PASS" | "FAIL" | "NOTHING_SENT"; counts: Record<string, number> }

export function verdictOf(results: readonly ProbeResult[]): Verdict {
  const counts: Record<string, number> = {};
  for (const result of results) counts[result] = (counts[result] ?? 0) + 1;
  const sent = results.filter((result) => !result.startsWith("SKIPPED"));
  if (sent.length === 0) return { verdict: "NOTHING_SENT", counts };
  return { verdict: sent.every((result) => result === "OK") ? "PASS" : "FAIL", counts };
}
