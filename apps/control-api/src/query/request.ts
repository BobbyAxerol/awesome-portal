import {
  AppliedSort,
  FilterDefinition,
  FilterOperator,
  NormalizedFilter,
  NormalizedKeysetQuery,
  PostgresListResource,
  QueryContractError,
  QueryScalar,
  RawFilterInput,
  RawKeysetQuery,
  SortDirection,
} from "./contracts";

export const DEFAULT_PAGE_LIMIT = 100;
export const MAX_PAGE_LIMIT = 250;
export const MAX_SORT_FIELDS = 3;
const DEFAULT_MAX_FILTERS = 12;
const DEFAULT_MAX_FILTER_ITEMS = 50;
const DEFAULT_MAX_TEXT_LENGTH = 256;
const DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/;

function fail(code: string, message: string): never {
  throw new QueryContractError(code, message);
}

function parseCursor(value: unknown, field: "after" | "before"): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 4096) {
    fail("INVALID_CURSOR", `${field} must be an opaque cursor string.`);
  }
  return value;
}

function parseLimit(value: unknown): number {
  if (value === undefined || value === null || value === "") return DEFAULT_PAGE_LIMIT;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_PAGE_LIMIT) {
    fail("INVALID_PAGE_LIMIT", `limit must be between 1 and ${MAX_PAGE_LIMIT}.`);
  }
  return parsed;
}

function parseSortToken(token: string): AppliedSort {
  const trimmed = token.trim();
  if (!trimmed) fail("INVALID_SORT", "sort contains an empty field.");
  if (trimmed.startsWith("-")) {
    return { field: trimmed.slice(1), direction: "desc" };
  }
  if (trimmed.startsWith("+")) {
    return { field: trimmed.slice(1), direction: "asc" };
  }
  const [field, rawDirection, ...rest] = trimmed.split(":");
  if (rest.length > 0 || (rawDirection !== undefined && !["asc", "desc"].includes(rawDirection))) {
    fail("INVALID_SORT", `sort token ${trimmed} is invalid.`);
  }
  return { field, direction: (rawDirection ?? "asc") as SortDirection };
}

function parseSort(raw: unknown): AppliedSort[] {
  if (raw === undefined || raw === null || raw === "") return [];
  if (typeof raw === "string") {
    return raw.split(",").map(parseSortToken);
  }
  if (!Array.isArray(raw)) fail("INVALID_SORT", "sort must be a string or array.");
  return raw.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return fail("INVALID_SORT", "sort entries must be objects.");
    }
    const candidate = item as Record<string, unknown>;
    if (
      typeof candidate.field !== "string" ||
      (candidate.direction !== "asc" && candidate.direction !== "desc")
    ) {
      return fail("INVALID_SORT", "sort entries require field and asc/desc direction.");
    }
    return { field: candidate.field, direction: candidate.direction };
  });
}

function scalarText(raw: unknown, definition: FilterDefinition): string {
  if (typeof raw !== "string") fail("INVALID_FILTER_VALUE", "filter value must be a string.");
  const value = raw.trim();
  if (!value || value.length > (definition.maxLength ?? DEFAULT_MAX_TEXT_LENGTH)) {
    fail("INVALID_FILTER_VALUE", "filter string is empty or too long.");
  }
  return value;
}

function scalarValue(raw: unknown, definition: FilterDefinition): QueryScalar {
  switch (definition.kind) {
    case "text":
      return scalarText(raw, definition);
    case "enum": {
      const value = scalarText(raw, definition);
      if (!definition.enumValues?.includes(value)) {
        fail("INVALID_FILTER_VALUE", "filter enum value is not allowlisted.");
      }
      return value;
    }
    case "timestamp": {
      const value = scalarText(raw, definition);
      const timestamp = new Date(value);
      if (Number.isNaN(timestamp.valueOf())) {
        fail("INVALID_FILTER_VALUE", "filter timestamp must be RFC3339-compatible.");
      }
      return timestamp.toISOString();
    }
    case "integer": {
      const value = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isSafeInteger(value)) {
        fail("INVALID_FILTER_VALUE", "filter integer must be a safe integer.");
      }
      return value;
    }
    case "boolean":
      if (raw === true || raw === "true") return true;
      if (raw === false || raw === "false") return false;
      return fail("INVALID_FILTER_VALUE", "filter boolean must be true or false.");
    case "decimal": {
      const value = scalarText(raw, definition);
      if (!DECIMAL_PATTERN.test(value)) {
        fail("INVALID_FILTER_VALUE", "filter decimal must be an exact decimal string.");
      }
      return value;
    }
  }
}

function parseFilter(
  raw: RawFilterInput,
  definitions: Readonly<Record<string, FilterDefinition>>,
): NormalizedFilter {
  if (typeof raw.field !== "string" || !(raw.field in definitions)) {
    fail("FILTER_NOT_ALLOWED", "filter field is not allowlisted.");
  }
  const definition = definitions[raw.field];
  if (typeof raw.op !== "string" || !definition.operators.includes(raw.op as FilterOperator)) {
    fail("FILTER_OPERATOR_NOT_ALLOWED", "filter operator is not allowlisted for this field.");
  }
  const op = raw.op as FilterOperator;
  const incoming = op === "in" ? (Array.isArray(raw.value) ? raw.value : [raw.value]) : [raw.value];
  if (incoming.length === 0 || incoming.length > (definition.maxItems ?? DEFAULT_MAX_FILTER_ITEMS)) {
    fail("INVALID_FILTER_VALUE", "filter has an invalid number of values.");
  }
  const values = incoming.map((value) => scalarValue(value, definition));
  const canonical = op === "in"
    ? [...new Set(values.map(String))].sort().map((value) => scalarValue(value, definition))
    : values;
  return {
    field: raw.field,
    op,
    value: canonical.map(String).join(","),
    values: canonical,
  };
}

export function normalizeKeysetQuery<TRow extends Record<string, unknown>, TItem>(
  resource: PostgresListResource<TRow, TItem>,
  raw: RawKeysetQuery,
): NormalizedKeysetQuery {
  const after = parseCursor(raw.after, "after");
  const before = parseCursor(raw.before, "before");
  if (after && before) {
    fail("AMBIGUOUS_CURSOR", "after and before are mutually exclusive.");
  }

  let sort = parseSort(raw.sort);
  if (sort.length === 0) sort = [...resource.defaultSort];
  if (sort.length > MAX_SORT_FIELDS) {
    fail("INVALID_SORT", `at most ${MAX_SORT_FIELDS} sort fields are allowed.`);
  }
  const seenSorts = new Set<string>();
  for (const item of sort) {
    if (!(item.field in resource.sorts)) {
      fail("SORT_NOT_ALLOWED", "sort field is not allowlisted.");
    }
    if (seenSorts.has(item.field)) {
      fail("INVALID_SORT", "sort fields must be unique.");
    }
    seenSorts.add(item.field);
  }
  if (!seenSorts.has(resource.idSortField)) {
    sort.push({
      field: resource.idSortField,
      direction: sort.at(-1)?.direction ?? "asc",
    });
  }

  if (raw.filters !== undefined && !Array.isArray(raw.filters)) {
    fail("INVALID_FILTER", "filters must be an array.");
  }
  const incomingFilters = (raw.filters ?? []) as RawFilterInput[];
  if (incomingFilters.length > (resource.maxFilters ?? DEFAULT_MAX_FILTERS)) {
    fail("INVALID_FILTER", "too many filters were requested.");
  }
  const filters = incomingFilters.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return fail("INVALID_FILTER", "filter entries must be objects.");
    }
    return parseFilter(item, resource.filters);
  }).sort((left, right) =>
    left.field.localeCompare(right.field) ||
    left.op.localeCompare(right.op) ||
    left.value.localeCompare(right.value),
  );

  return {
    after,
    before,
    limit: parseLimit(raw.limit),
    filters,
    sort,
  };
}
