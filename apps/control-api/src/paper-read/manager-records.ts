import { CurrentSourceProxyError } from "../execution/current-source.proxy";

type Scalar = string | number | boolean | null;

export interface ManagerPage {
  asOf: string | null;
  freshness: "FRESH" | "AGING" | "STALE" | "UNKNOWN";
  completeness: "COMPLETE" | "PARTIAL" | "UNKNOWN";
  items: Array<Record<string, Scalar | readonly Scalar[]>>;
  nextCursor: string | null;
}

export interface ManagerReadContext {
  profileId: "PAPER_BINANCE_USDM" | "SANDBOX_BINANCE_USDM" | "LIVE_BINANCE_USDM";
  mode: "paper" | "sandbox" | "live";
  errorPrefix: "N22" | "N23";
}

const PAPER_CONTEXT: ManagerReadContext = {
  profileId: "PAPER_BINANCE_USDM",
  mode: "paper",
  errorPrefix: "N22",
};

const FORBIDDEN_FIELD = /(?:^|_)(?:raw|secret|credential|password|token|dsn)(?:_|$)/i;
const FRESHNESS = new Set(["FRESH", "AGING", "STALE", "UNKNOWN"]);
const COMPLETENESS = new Set(["COMPLETE", "PARTIAL", "UNKNOWN"]);

/**
 * Converts the versioned Manager-v2 tagged-value envelope into a narrow Portal
 * record. Opaque record keys, relation metadata and non-allowlisted fields are
 * deliberately discarded at this boundary.
 */
export function managerPage(
  response: unknown,
  expectedRelation: string,
  allowedFields: readonly string[],
  context: ManagerReadContext = PAPER_CONTEXT,
): ManagerPage {
  const bff = object(response, `${context.errorPrefix}_CURRENT_SOURCE_ENVELOPE_INVALID`);
  if (bff.profile_id !== context.profileId || bff.source_environment !== context.mode) {
    throw contractError(`${context.errorPrefix}_PROFILE_CONTEXT_MISMATCH`);
  }
  const source = object(bff.source, `${context.errorPrefix}_MANAGER_ENVELOPE_INVALID`);
  if (source.profile_id !== context.profileId || source.authority !== "EXECUTION_CELL") {
    throw contractError(`${context.errorPrefix}_MANAGER_AUTHORITY_MISMATCH`);
  }
  if (source.availability !== "AVAILABLE") {
    throw contractError(`${context.errorPrefix}_MANAGER_RELATION_UNAVAILABLE`);
  }
  const data = object(source.data, `${context.errorPrefix}_MANAGER_DATA_INVALID`);
  const relation = object(data.relation, `${context.errorPrefix}_MANAGER_RELATION_INVALID`);
  if (relation.schema !== "public" || relation.relation !== expectedRelation) {
    throw contractError(`${context.errorPrefix}_MANAGER_RELATION_MISMATCH`);
  }
  if (!Array.isArray(data.items) || data.items.length > 200) {
    throw contractError(`${context.errorPrefix}_MANAGER_PAGE_INVALID`);
  }
  const allowed = new Set(allowedFields);
  const items = data.items.map((raw) => {
    const record = object(raw, `${context.errorPrefix}_MANAGER_RECORD_INVALID`);
    const recordRelation = object(record.relation, `${context.errorPrefix}_MANAGER_RECORD_RELATION_INVALID`);
    if (recordRelation.schema !== "public" || recordRelation.relation !== expectedRelation) {
      throw contractError(`${context.errorPrefix}_MANAGER_RECORD_RELATION_MISMATCH`);
    }
    const fields = object(record.fields, `${context.errorPrefix}_MANAGER_FIELDS_INVALID`);
    const output: Record<string, Scalar | readonly Scalar[]> = {};
    for (const [name, tagged] of Object.entries(fields)) {
      if (!allowed.has(name) || FORBIDDEN_FIELD.test(name)) continue;
      output[name] = taggedValue(tagged, context.errorPrefix);
    }
    if (Object.keys(output).length === 0) {
      throw contractError(`${context.errorPrefix}_MANAGER_RECORD_EMPTY_AFTER_NARROWING`);
    }
    if (
      "mode" in output &&
      typeof output.mode === "string" &&
      output.mode.toLowerCase() !== context.mode
    ) {
      throw contractError(`${context.errorPrefix}_CROSS_PROFILE_ROW_REJECTED`);
    }
    return output;
  });
  const nextCursor = data.next_cursor;
  if (nextCursor !== null && (typeof nextCursor !== "string" || nextCursor.length > 4096)) {
    throw contractError(`${context.errorPrefix}_MANAGER_CURSOR_INVALID`);
  }
  const freshness = typeof source.freshness === "string" && FRESHNESS.has(source.freshness)
    ? source.freshness as ManagerPage["freshness"]
    : "UNKNOWN";
  const completeness = typeof source.completeness === "string" && COMPLETENESS.has(source.completeness)
    ? source.completeness as ManagerPage["completeness"]
    : "UNKNOWN";
  return {
    asOf: typeof source.as_of === "string" ? source.as_of : null,
    freshness,
    completeness,
    items,
    nextCursor,
  };
}

function taggedValue(value: unknown, errorPrefix: "N22" | "N23"): Scalar | readonly Scalar[] {
  const tagged = object(value, `${errorPrefix}_MANAGER_TAGGED_VALUE_INVALID`);
  const kind = tagged.kind;
  const item = tagged.value;
  if (kind === "NULL" && item === null) return null;
  if (kind === "BOOLEAN" && typeof item === "boolean") return item;
  if (kind === "INTEGER" && typeof item === "number" && Number.isSafeInteger(item)) return item;
  if (kind === "DECIMAL" && typeof item === "string" && /^-?\d+(?:\.\d+)?$/.test(item)) return item;
  if ((kind === "TEXT" || kind === "TIMESTAMP") && typeof item === "string") return item;
  if (kind === "ARRAY" && Array.isArray(item) && item.length <= 100) {
    if (item.every((entry) => entry === null || ["string", "number", "boolean"].includes(typeof entry))) {
      return item as Scalar[];
    }
  }
  // Manager OBJECT values can contain source-specific JSON. N22 does not
  // expose them until a dedicated product contract explicitly models them.
  throw contractError(`${errorPrefix}_MANAGER_VALUE_KIND_NOT_ACCEPTED`);
}

function object(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw contractError(code);
  return value as Record<string, unknown>;
}

function contractError(code: string): CurrentSourceProxyError {
  return new CurrentSourceProxyError(code, 502, {
    availability: "UNAVAILABLE",
    reason_code: "SOURCE_CONTRACT_REJECTED",
    retryable: false,
  });
}
