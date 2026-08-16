/**
 * Parameter-space validation for the New Run editor.
 *
 * The strategy publishes its declared space (`StrategyResponse.parameter_space`,
 * import contract §2: always `(low, high, step)`). The editor lets a user
 * narrow that space for a search; it must not let them leave it, because
 * preflight would reject the run only after they had filled in the whole form.
 *
 * Pure functions — no React — so every rule is unit-testable against the real
 * strategy contract rather than through the DOM.
 */
import type { ParameterSpec } from "../../lib/api";

/** One entry of the declared space, as published by the strategy contract. */
export interface DeclaredRange {
  low: number;
  high: number;
  step: number;
}

export type DeclaredSpace = Record<string, DeclaredRange>;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Reads the declared space out of the untyped `parameter_space` map.
 *
 * Entries that do not carry a numeric `(low, high, step)` triple are skipped
 * rather than guessed: an unparsable declaration means "no bound to enforce",
 * not "bound is zero".
 */
export function readDeclaredSpace(raw: Record<string, unknown> | undefined): DeclaredSpace {
  const space: DeclaredSpace = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (typeof value !== "object" || value === null) continue;
    const entry = value as Record<string, unknown>;
    if (isFiniteNumber(entry.low) && isFiniteNumber(entry.high) && isFiniteNumber(entry.step)) {
      space[key] = { low: entry.low, high: entry.high, step: entry.step };
    }
  }
  return space;
}

/** Whether a declared range is integral, which decides the default spec kind. */
export function isIntegerRange(range: DeclaredRange): boolean {
  return Number.isInteger(range.low) && Number.isInteger(range.high) && Number.isInteger(range.step);
}

/** Seeds an editable search space from the declared one, unchanged. */
export function seedSearchSpace(space: DeclaredSpace): Record<string, ParameterSpec> {
  return Object.fromEntries(
    Object.entries(space).map(([key, range]) => [
      key,
      {
        kind: isIntegerRange(range) ? ("int_range" as const) : ("float_range" as const),
        low: range.low,
        high: range.high,
        step: range.step,
      },
    ]),
  );
}

export interface ParameterIssue {
  parameter: string;
  message: string;
  /** `error` blocks submission; `warning` is allowed but surfaced. */
  severity: "error" | "warning";
}

/** Rounds float comparison noise so `0.1 + 0.2` does not fail a bound check. */
function gt(a: number, b: number): boolean {
  return a - b > 1e-9;
}

/**
 * Validates one edited spec against its declared range.
 *
 * A parameter with no declaration is not an error — imported alphas may expose
 * parameters the built-in contract does not know about — but it is reported as
 * a warning so it cannot silently reach preflight.
 */
export function validateSpec(
  parameter: string,
  spec: ParameterSpec,
  declared: DeclaredRange | undefined,
): ParameterIssue[] {
  const issues: ParameterIssue[] = [];

  if (spec.kind === "int_range" || spec.kind === "float_range") {
    if (!isFiniteNumber(spec.low) || !isFiniteNumber(spec.high) || !isFiniteNumber(spec.step)) {
      issues.push({ parameter, message: "low, high và step đều phải là số.", severity: "error" });
      return issues;
    }
    if (gt(spec.low, spec.high)) {
      issues.push({ parameter, message: "low không được lớn hơn high.", severity: "error" });
    }
    if (spec.step <= 0) {
      issues.push({ parameter, message: "step phải lớn hơn 0.", severity: "error" });
    }
    if (spec.kind === "int_range" && !Number.isInteger(spec.step)) {
      issues.push({ parameter, message: "int_range yêu cầu step nguyên.", severity: "error" });
    }
    if (declared) {
      if (gt(declared.low, spec.low)) {
        issues.push({
          parameter,
          message: `low nhỏ hơn giới hạn strategy công bố (${declared.low}).`,
          severity: "error",
        });
      }
      if (gt(spec.high, declared.high)) {
        issues.push({
          parameter,
          message: `high vượt giới hạn strategy công bố (${declared.high}).`,
          severity: "error",
        });
      }
      if (gt(declared.step, spec.step)) {
        issues.push({
          parameter,
          message: `step mịn hơn step công bố (${declared.step}) — search sẽ đánh giá điểm ngoài lưới đã kiểm chứng.`,
          severity: "warning",
        });
      }
    }
  }

  if (spec.kind === "fixed") {
    if (spec.value === null || spec.value === undefined || spec.value === "") {
      issues.push({ parameter, message: "fixed cần một giá trị.", severity: "error" });
    } else if (declared && isFiniteNumber(spec.value)) {
      if (gt(declared.low, spec.value) || gt(spec.value, declared.high)) {
        issues.push({
          parameter,
          message: `giá trị nằm ngoài [${declared.low}, ${declared.high}] mà strategy công bố.`,
          severity: "error",
        });
      }
    }
  }

  if (spec.kind === "categorical") {
    if (!spec.values.length) {
      issues.push({ parameter, message: "categorical cần ít nhất một giá trị.", severity: "error" });
    }
  }

  if (!declared) {
    issues.push({
      parameter,
      message: "Không có trong parameter space strategy công bố — preflight có thể từ chối.",
      severity: "warning",
    });
  }

  return issues;
}

/** Number of grid points a range spans; used for the search-size estimate. */
export function gridPoints(spec: ParameterSpec): number {
  if (spec.kind === "fixed") return 1;
  if (spec.kind === "categorical") return Math.max(spec.values.length, 1);
  if (!isFiniteNumber(spec.low) || !isFiniteNumber(spec.high) || !isFiniteNumber(spec.step)) return 1;
  if (spec.step <= 0 || spec.high < spec.low) return 1;
  return Math.floor((spec.high - spec.low) / spec.step) + 1;
}

export interface SpaceValidation {
  issues: ParameterIssue[];
  errors: ParameterIssue[];
  warnings: ParameterIssue[];
  /** Total grid size, capped so a huge space cannot overflow the display. */
  combinations: number;
  /** Count of entries that vary, i.e. are not `fixed`. */
  searchedCount: number;
}

const MAX_COMBINATIONS = Number.MAX_SAFE_INTEGER;

export function validateSearchSpace(
  searchSpace: Record<string, ParameterSpec>,
  declared: DeclaredSpace,
): SpaceValidation {
  const issues = Object.entries(searchSpace).flatMap(([key, spec]) =>
    validateSpec(key, spec, declared[key]),
  );

  let combinations = 1;
  let searchedCount = 0;
  for (const spec of Object.values(searchSpace)) {
    const points = gridPoints(spec);
    if (spec.kind !== "fixed") searchedCount += 1;
    combinations = Math.min(combinations * points, MAX_COMBINATIONS);
  }

  return {
    issues,
    errors: issues.filter((issue) => issue.severity === "error"),
    warnings: issues.filter((issue) => issue.severity === "warning"),
    combinations,
    searchedCount,
  };
}

/**
 * Checks the space against the capability manifest's declared ceiling.
 *
 * Returns `null` when the manifest publishes no ceiling — the frontend does
 * not invent a resource limit (§4: declare, do not infer).
 */
export function checkResourceCeiling(
  entryCount: number,
  maxParameterSpaceEntries: number | null,
): string | null {
  if (maxParameterSpaceEntries === null) return null;
  if (entryCount <= maxParameterSpaceEntries) return null;
  return `Parameter space có ${entryCount} entry, vượt trần ${maxParameterSpaceEntries} mà engine release công bố.`;
}
