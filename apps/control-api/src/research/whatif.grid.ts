/**
 * W5a · A10c — pure 9×9 what-if grid geometry and evaluation identity.
 *
 * No I/O, no engine, no interpolation. Given a run's frozen θ* and the
 * historical declaration of its two axis parameters this module answers:
 *   - the 81 display cells (row-major, x = entry_z/rvol, y = atr_mult/slpercent);
 *   - each cell's full effective configuration (θ* with the two axes moved),
 *     clamped to the declaration, as exact decimal strings;
 *   - the canonical evaluation key of that configuration (params + dataset +
 *     objective + seed + engine + profile), shared by cells that clamp to the
 *     same configuration, so 81 cells never mean 81 evaluations.
 */

import { createHash } from "node:crypto";

import { WHATIF_PROFILE, WHATIF_PROFILE_DIGEST } from "./whatif.profile";

const DECIMAL = /^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?$/;

export interface ExactDecimal { units: bigint; scale: number }

export function parseDecimal(value: string): ExactDecimal | null {
  const match = DECIMAL.exec(value);
  if (!match) return null;
  const fraction = match[3] ?? "";
  if (fraction.length > 18) return null;
  const units = BigInt(`${match[2]}${fraction}` || "0") * (match[1] === "-" ? -1n : 1n);
  return { units, scale: fraction.length };
}

function rescale(value: ExactDecimal, scale: number): bigint {
  return value.units * 10n ** BigInt(scale - value.scale);
}

/** Canonical text: no trailing fractional zeros, no "-0". `"1.20"` → `"1.2"`, `"2.0"` → `"2"`. */
export function formatDecimal(units: bigint, scale: number): string {
  const negative = units < 0n;
  let digits = (negative ? -units : units).toString().padStart(scale + 1, "0");
  let fraction = scale > 0 ? digits.slice(digits.length - scale) : "";
  const whole = scale > 0 ? digits.slice(0, digits.length - scale) : digits;
  fraction = fraction.replace(/0+$/, "");
  digits = fraction ? `${whole}.${fraction}` : whole;
  return negative && digits !== "0" ? `-${digits}` : digits;
}

export function canonicalDecimal(value: string): string | null {
  const parsed = parseDecimal(value);
  return parsed ? formatDecimal(parsed.units, parsed.scale) : null;
}

/** Exact `a − b` for two decimal strings (ΔJ), canonical text. */
export function subtractDecimal(a: string, b: string): string | null {
  const left = parseDecimal(a);
  const right = parseDecimal(b);
  if (!left || !right) return null;
  const scale = Math.max(left.scale, right.scale);
  return formatDecimal(rescale(left, scale) - rescale(right, scale), scale);
}

function canonicalJson(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
          .map(([key, nested]) => [key, normalize(nested)]),
      );
    }
    return input;
  };
  return JSON.stringify(normalize(value));
}

function sha256(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

export interface DeclaredAxisRange { minimum: string; maximum: string; step: string }

export interface GridAxis {
  parameter: string;
  hifi_name: string;
  minimum: string;
  maximum: string;
  step: string;
  base: string;
  /** Nine node values, θ* ± 4 steps, each clamped to the declaration. */
  values: string[];
  clamped: boolean[];
}

export interface GridCell {
  cell_id: string;
  x_index: number;
  y_index: number;
  /** The two moved parameters of this cell. */
  parameters: Record<string, string>;
  /** θ* with the two axes replaced — the exact configuration an evaluation runs. */
  configuration: Record<string, string>;
  evaluation_key: string;
  /** First cell (row-major) with the same evaluation key. */
  canonical_cell_id: string;
  clamped: boolean;
  is_base: boolean;
}

export interface EvaluationScope {
  dataset_binding_digest: string;
  requested_spec_digest: string;
  engine_release_id: string;
  random_seed: number;
}

export interface WhatIfGrid {
  axes: [GridAxis, GridAxis];
  cells: GridCell[];
  unique: { evaluation_key: string; configuration: Record<string, string>; cell_ids: string[] }[];
  base_evaluation_key: string;
  grid_key: string;
}

export class WhatIfGridError extends Error {}

function axis(parameter: string, hifiName: string, declared: DeclaredAxisRange, baseText: string): GridAxis {
  const base = parseDecimal(baseText);
  const minimum = parseDecimal(declared.minimum);
  const maximum = parseDecimal(declared.maximum);
  const step = parseDecimal(declared.step);
  if (!base || !minimum || !maximum || !step) throw new WhatIfGridError(`axis ${parameter} is not exact decimal`);
  const scale = Math.max(base.scale, minimum.scale, maximum.scale, step.scale);
  const b = rescale(base, scale);
  const lo = rescale(minimum, scale);
  const hi = rescale(maximum, scale);
  const s = rescale(step, scale);
  if (s <= 0n || hi < lo || b < lo || b > hi) throw new WhatIfGridError(`axis ${parameter} θ* is outside its declaration`);
  const radius = BigInt(WHATIF_PROFILE.radius_steps);
  const values: string[] = [];
  const clamped: boolean[] = [];
  for (let k = -radius; k <= radius; k += 1n) {
    const raw = b + k * s;
    const bounded = raw < lo ? lo : raw > hi ? hi : raw;
    values.push(formatDecimal(bounded, scale));
    clamped.push(bounded !== raw);
  }
  return {
    parameter,
    hifi_name: hifiName,
    minimum: formatDecimal(lo, scale),
    maximum: formatDecimal(hi, scale),
    step: formatDecimal(s, scale),
    base: formatDecimal(b, scale),
    values,
    clamped,
  };
}

export function evaluationKey(configuration: Record<string, string>, scope: EvaluationScope): string {
  return sha256({
    schema_version: "research.whatif-evaluation-key.v1",
    profile_digest: WHATIF_PROFILE_DIGEST,
    objective: WHATIF_PROFILE.objective,
    parameters: configuration,
    dataset_binding_digest: scope.dataset_binding_digest,
    requested_spec_digest: scope.requested_spec_digest,
    engine_release_id: scope.engine_release_id,
    random_seed: scope.random_seed,
  });
}

/** Canonicalize a parameter map to exact decimal text (refusing anything else). */
export function canonicalParameters(parameters: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(parameters)) {
    const canonical = canonicalDecimal(value);
    if (canonical === null) throw new WhatIfGridError(`parameter ${name} is not an exact decimal`);
    out[name] = canonical;
  }
  return out;
}

export function buildWhatIfGrid(
  parentRunId: string,
  frozen: Record<string, string>,
  space: Readonly<Record<string, DeclaredAxisRange>>,
  scope: EvaluationScope,
): WhatIfGrid {
  const theta = canonicalParameters(frozen);
  const [xSpec, ySpec] = WHATIF_PROFILE.axes;
  const xDeclared = space[xSpec.parameter];
  const yDeclared = space[ySpec.parameter];
  if (!xDeclared || !yDeclared || theta[xSpec.parameter] === undefined || theta[ySpec.parameter] === undefined) {
    throw new WhatIfGridError("θ* does not carry both declared what-if axes");
  }
  const x = axis(xSpec.parameter, xSpec.hifi_name, xDeclared, theta[xSpec.parameter]!);
  const y = axis(ySpec.parameter, ySpec.hifi_name, yDeclared, theta[ySpec.parameter]!);
  const cells: GridCell[] = [];
  // The canonical cell of an evaluation is its unclamped node when one
  // exists (the value the engine actually runs), else the first clamped one.
  const canonical = new Map<string, string>();
  for (let yi = 0; yi < WHATIF_PROFILE.grid_size; yi += 1) {
    for (let xi = 0; xi < WHATIF_PROFILE.grid_size; xi += 1) {
      if (x.clamped[xi] || y.clamped[yi]) continue;
      const configuration = { ...theta, [x.parameter]: x.values[xi]!, [y.parameter]: y.values[yi]! };
      const key = evaluationKey(configuration, scope);
      if (!canonical.has(key)) canonical.set(key, `x${xi}y${yi}`);
    }
  }
  const unique = new Map<string, { configuration: Record<string, string>; cell_ids: string[] }>();
  const baseIndex = WHATIF_PROFILE.radius_steps;
  for (let yi = 0; yi < WHATIF_PROFILE.grid_size; yi += 1) {
    for (let xi = 0; xi < WHATIF_PROFILE.grid_size; xi += 1) {
      const configuration = { ...theta, [x.parameter]: x.values[xi]!, [y.parameter]: y.values[yi]! };
      const key = evaluationKey(configuration, scope);
      const cellId = `x${xi}y${yi}`;
      if (!canonical.has(key)) canonical.set(key, cellId);
      const entry = unique.get(key) ?? { configuration, cell_ids: [] };
      entry.cell_ids.push(cellId);
      unique.set(key, entry);
      cells.push({
        cell_id: cellId,
        x_index: xi,
        y_index: yi,
        parameters: { [x.parameter]: x.values[xi]!, [y.parameter]: y.values[yi]! },
        configuration,
        evaluation_key: key,
        canonical_cell_id: canonical.get(key)!,
        clamped: x.clamped[xi]! || y.clamped[yi]!,
        is_base: xi === baseIndex && yi === baseIndex,
      });
    }
  }
  const baseKey = evaluationKey(theta, scope);
  const uniqueList = [...unique.entries()].map(([evaluation_key, value]) => ({ evaluation_key, ...value }));
  const gridKey = sha256({
    schema_version: "research.whatif-grid-key.v1",
    parent_run_id: parentRunId,
    profile_digest: WHATIF_PROFILE_DIGEST,
    theta,
    axes: [x, y].map((entry) => ({ parameter: entry.parameter, values: entry.values })),
    evaluation_keys: uniqueList.map((entry) => entry.evaluation_key).sort(),
  });
  return { axes: [x, y], cells, unique: uniqueList, base_evaluation_key: baseKey, grid_key: gridKey };
}
