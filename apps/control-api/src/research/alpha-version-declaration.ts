/**
 * Safe, browser-readable declaration projected from one immutable AlphaVersion.
 *
 * `declared_contract` is deliberately broader than this DTO: it is retained as
 * immutable server evidence and can contain adapter/provenance fields that a
 * browser never needs.  The projector exposes only the four facts Screen 02
 * validates and rejects malformed persisted values instead of guessing or
 * silently widening an Alpha's declared parameter space.
 */

export type ResearchAlphaDeclarationScalar = string | number | boolean | null;

export type ResearchAlphaParameterDeclaration =
  | { kind: "fixed"; value: ResearchAlphaDeclarationScalar }
  | { kind: "int_range"; low: number; high: number; step: number }
  | { kind: "float_range"; low: number; high: number; step: number }
  | { kind: "categorical"; values: readonly ResearchAlphaDeclarationScalar[] };

export interface ResearchAlphaVersionDeclaration {
  schema_version: "research.alpha-version-declaration.v1";
  entrypoint: string;
  timeframes: readonly string[];
  required_columns: readonly ("open" | "high" | "low" | "close" | "volume")[];
  warmup_bars: number;
  determinism: { seed_required: boolean };
  parameter_space: Readonly<Record<string, ResearchAlphaParameterDeclaration>>;
}

export class ResearchAlphaVersionDeclarationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResearchAlphaVersionDeclarationError";
  }
}

const ENTRYPOINT = /^[A-Za-z][A-Za-z0-9_.:]{0,159}$/;
const TIMEFRAME = /^[1-9][0-9]*(?:m|h|d|w)$/;
const PARAMETER = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const MAX_PARAMETERS = 12;
const MAX_CATEGORICAL_VALUES = 64;

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new ResearchAlphaVersionDeclarationError(`${label} is not a safe object.`);
  }
  return value as Record<string, unknown>;
}

function scalar(value: unknown, label: string): ResearchAlphaDeclarationScalar {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new ResearchAlphaVersionDeclarationError(`${label} is not a JSON scalar.`);
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ResearchAlphaVersionDeclarationError(`${label} must be a finite number.`);
  }
  return value;
}

function range(kind: "int_range" | "float_range", low: unknown, high: unknown, step: unknown, label: string): ResearchAlphaParameterDeclaration {
  const normalizedLow = finiteNumber(low, `${label}.low`);
  const normalizedHigh = finiteNumber(high, `${label}.high`);
  const normalizedStep = finiteNumber(step, `${label}.step`);
  if (normalizedLow > normalizedHigh || normalizedStep <= 0) {
    throw new ResearchAlphaVersionDeclarationError(`${label} has invalid bounds or step.`);
  }
  if (kind === "int_range" && ![normalizedLow, normalizedHigh, normalizedStep].every(Number.isInteger)) {
    throw new ResearchAlphaVersionDeclarationError(`${label} integer range contains a non-integer.`);
  }
  return { kind, low: normalizedLow, high: normalizedHigh, step: normalizedStep };
}

function parameter(name: string, value: unknown): ResearchAlphaParameterDeclaration {
  const spec = object(value, `parameter_space.${name}`);
  const kind = spec.kind;
  if (kind === "fixed" && Object.keys(spec).length === 2 && "value" in spec) {
    return { kind, value: scalar(spec.value, `parameter_space.${name}.value`) };
  }
  if ((kind === "int_range" || kind === "float_range") && Object.keys(spec).length === 4) {
    return range(kind, spec.low, spec.high, spec.step, `parameter_space.${name}`);
  }
  if (kind === "categorical" && Object.keys(spec).length === 2 && Array.isArray(spec.values) &&
      spec.values.length > 0 && spec.values.length <= MAX_CATEGORICAL_VALUES) {
    return { kind, values: spec.values.map((item, index) => scalar(item, `parameter_space.${name}.values[${index}]`)) };
  }

  // P04 predates the P07 parser and records a conservative range shorthand.
  // Normalize it here so the browser gets one generated union, not two
  // hand-parsed dialects. No other P04 execution/provenance fields escape.
  if (Object.keys(spec).length === 3 && "minimum" in spec && "maximum" in spec && "step" in spec) {
    const values = [spec.minimum, spec.maximum, spec.step];
    const kind = values.every((item) => typeof item === "number" && Number.isInteger(item))
      ? "int_range" : "float_range";
    return range(kind, spec.minimum, spec.maximum, spec.step, `parameter_space.${name}`);
  }
  throw new ResearchAlphaVersionDeclarationError(`parameter_space.${name} is not an accepted immutable declaration.`);
}

/**
 * Project the exact safe declaration for the version record.
 *
 * The separate `storedEntrypoint` is authoritative database identity. Matching
 * it prevents a corrupt JSON field from making the browser validate a different
 * function than the one the immutable AlphaVersion names.
 */
export function projectResearchAlphaVersionDeclaration(
  declaredContract: Record<string, unknown>,
  storedEntrypoint: string,
): ResearchAlphaVersionDeclaration {
  const contract = object(declaredContract, "declared_contract");
  const entrypoint = contract.entrypoint;
  if (typeof entrypoint !== "string" || !ENTRYPOINT.test(entrypoint) || entrypoint !== storedEntrypoint) {
    throw new ResearchAlphaVersionDeclarationError("declared_contract.entrypoint does not match immutable version identity.");
  }

  if (!Array.isArray(contract.timeframes) || contract.timeframes.length < 1 || contract.timeframes.length > 12 ||
      !contract.timeframes.every((item) => typeof item === "string" && TIMEFRAME.test(item)) ||
      new Set(contract.timeframes).size !== contract.timeframes.length) {
    throw new ResearchAlphaVersionDeclarationError("declared_contract.timeframes is not a bounded unique timeframe list.");
  }

  const allowedColumns = new Set(["open", "high", "low", "close", "volume"]);
  if (!Array.isArray(contract.required_columns) || contract.required_columns.length < 1 ||
      contract.required_columns.length > 5 ||
      !contract.required_columns.every((item) => typeof item === "string" && allowedColumns.has(item)) ||
      new Set(contract.required_columns).size !== contract.required_columns.length) {
    throw new ResearchAlphaVersionDeclarationError("declared_contract.required_columns is not a bounded candle column list.");
  }
  if (!Number.isInteger(contract.warmup_bars) || (contract.warmup_bars as number) < 0 ||
      (contract.warmup_bars as number) > 100_000) {
    throw new ResearchAlphaVersionDeclarationError("declared_contract.warmup_bars is invalid.");
  }

  const determinism = object(contract.determinism, "declared_contract.determinism");
  if (typeof determinism.seed_required !== "boolean") {
    throw new ResearchAlphaVersionDeclarationError("declared_contract.determinism.seed_required is not declared.");
  }

  const sourceParameters = object(contract.parameter_space, "declared_contract.parameter_space");
  const parameterNames = Object.keys(sourceParameters).sort();
  if (parameterNames.length > MAX_PARAMETERS || parameterNames.some((name) => !PARAMETER.test(name))) {
    throw new ResearchAlphaVersionDeclarationError("declared_contract.parameter_space is outside the bounded parameter vocabulary.");
  }
  const parameterSpace = Object.fromEntries(parameterNames.map((name) => [name, parameter(name, sourceParameters[name])])) as Record<string, ResearchAlphaParameterDeclaration>;

  return {
    schema_version: "research.alpha-version-declaration.v1",
    entrypoint,
    timeframes: [...contract.timeframes] as string[],
    required_columns: [...contract.required_columns] as ResearchAlphaVersionDeclaration["required_columns"],
    warmup_bars: contract.warmup_bars as number,
    determinism: { seed_required: determinism.seed_required },
    parameter_space: parameterSpace,
  };
}
