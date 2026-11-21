/**
 * The ONE small dictionary that turns a code the server published into the plain name a reader sees (UXM-07 DEBT-048/4).
 *
 * Rules: a code in the table reads as its name; any other code reads as a humanized form of itself (`SOURCE_GAP` -> `Source gap`),
 * never a guess at meaning. The raw code is never drawn next to the name: `CodeName` keeps it in visually hidden text (known code)
 * or behind a `GapWhy` disclosure (unknown code). A name here is only a plain-word reading of a code that already exists on a
 * screen; it adds no claim the code did not make.
 */

/** Code -> plain name. Sentence case, no trailing full stop. */
export const CODE_NAMES: Readonly<Record<string, string>> = {
  // access and policy
  POLICY_PENDING: "Access policy pending",
  OWNER_RECOVERY_NOT_APPROVED: "Owner recovery not approved",
  // stage policy and grants
  PAPER_OBSERVATION: "Paper observation",
  paper_activation_authorization: "Paper activation authorization",
  // command catalogue: why an action is not live
  COMMAND_RELAY_DISABLED: "Command relay off",
  SOURCE_ROUTE_MAPPING_AMBIGUOUS: "Route not established",
  TRADING_SYSTEM_HTTP_ROUTE_UNPUBLISHED: "No Trading System route",
  TRADING_SYSTEM_TYPED_HTTP_ROUTE_UNPUBLISHED: "No typed Trading System route",
  GENERIC_REDIS_ACCESS_PROHIBITED: "Direct Redis access prohibited",
  DESTRUCTIVE_OR_LAB_ONLY_COMMAND_PROHIBITED: "Destructive or lab-only command",
  N16B_RUNTIME_ACTIVATION_PENDING: "Runtime activation pending",
  N27_COMMAND_TRANSPORT_NOT_ACTIVATED: "Command transport not active",
  R1_APPROVAL_REQUIRED: "R1 approval required",
};

/** The published sampling methods, in the words of what each keeps. A method not here reads `method not stated`. */
export const SAMPLING_METHOD_WORDS: Readonly<Record<string, string>> = {
  PER_SERIES_BUCKET_EXTREMA: "min and max kept per bucket",
  MIN_MAX_LAST_BUCKET_V1: "min, max and last value kept per bucket",
};

export const METHOD_NOT_STATED = "method not stated";

/** `SOURCE_GAP` -> `Source gap`. Only the fallback for a code the table does not know. */
export function humanizeCode(code: string): string {
  const words = code.replace(/[_\s-]+/g, " ").trim().toLowerCase();
  return words === "" ? code : words.charAt(0).toUpperCase() + words.slice(1);
}

export interface CodeNameResult {
  name: string;
  /** True when the dictionary named it; false when the name is only the humanized code. */
  known: boolean;
}

export function codeName(code: string): CodeNameResult {
  return Object.hasOwn(CODE_NAMES, code) ? { name: CODE_NAMES[code]!, known: true } : { name: humanizeCode(code), known: false };
}

export interface SamplingWords {
  words: string;
  known: boolean;
}

export function samplingWords(method: string): SamplingWords {
  return Object.hasOwn(SAMPLING_METHOD_WORDS, method) ? { words: SAMPLING_METHOD_WORDS[method]!, known: true } : { words: METHOD_NOT_STATED, known: false };
}
