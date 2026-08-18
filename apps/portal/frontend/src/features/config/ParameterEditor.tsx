/**
 * Parameter editor — New Run step 3.
 *
 * Every row is validated against the range the strategy publishes, so a value
 * outside the declared space is refused here rather than at preflight, after
 * the user has filled in the rest of the form.
 *
 * The declared bounds are shown next to each control: without them "high is above
 * the declared bound" is a message the user cannot act on.
 */
import { RotateCcw } from "lucide-react";

import { Callout } from "../../components/surface";
import { NumberField, TextField } from "../../components/form";
import type { ParameterSpec } from "../../lib/api";
import {
  gridPoints,
  validateSpec,
  type DeclaredSpace,
  type SpaceValidation,
} from "./parameterSpace";

const KINDS = ["int_range", "float_range", "fixed", "categorical"] as const;

function specForKind(kind: (typeof KINDS)[number], declaredLow: number, declaredHigh: number, declaredStep: number): ParameterSpec {
  switch (kind) {
    case "fixed":
      return { kind, value: declaredLow };
    case "categorical":
      return { kind, values: [] };
    default:
      return { kind, low: declaredLow, high: declaredHigh, step: kind === "int_range" ? Math.max(1, Math.round(declaredStep)) : declaredStep };
  }
}

function ParameterRow({
  name,
  spec,
  declared,
  onChange,
  onReset,
}: {
  name: string;
  spec: ParameterSpec;
  declared: DeclaredSpace[string] | undefined;
  onChange: (next: ParameterSpec) => void;
  onReset: () => void;
}) {
  const issues = validateSpec(name, spec, declared);
  const errorFor = (field: "low" | "high" | "step" | "value" | "values") =>
    issues.find((issue) => issue.severity === "error" && issue.message.startsWith(field))?.message ?? null;
  const blocking = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");

  return (
    <div className="param-row" data-invalid={blocking.length > 0}>
      <div className="param-row-head">
        <span className="param-name mono">{name}</span>
        {declared ? (
          <span className="param-declared mono" title="The range the strategy declares">
            [{declared.low} … {declared.high}] step {declared.step}
          </span>
        ) : (
          <span className="param-declared mono">not declared</span>
        )}
        <span className="param-points mono" title="Grid points for this parameter">
          {gridPoints(spec)} points
        </span>
        <select
          className="input param-kind"
          value={spec.kind}
          aria-label={`${name} kind`}
          onChange={(event) =>
            onChange(
              specForKind(
                event.target.value as (typeof KINDS)[number],
                declared?.low ?? 0,
                declared?.high ?? 1,
                declared?.step ?? 1,
              ),
            )
          }
        >
          {KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>
        {declared ? (
          <button
            type="button"
            className="portal-icon-btn"
            aria-label={`Reset ${name} to the declared range`}
            title="Reset to the range the strategy declares"
            onClick={onReset}
          >
            <RotateCcw size={13} />
          </button>
        ) : null}
      </div>

      {spec.kind === "int_range" || spec.kind === "float_range" ? (
        <div className="field-grid" data-columns="3">
          {(["low", "high", "step"] as const).map((field) => (
            <NumberField
              key={field}
              label={field}
              value={spec[field]}
              min={field === "step" ? undefined : declared?.low}
              max={field === "step" ? undefined : declared?.high}
              step={spec.kind === "int_range" ? 1 : "any"}
              error={errorFor(field)}
              onChange={(value) => onChange({ ...spec, [field]: value ?? 0 })}
            />
          ))}
        </div>
      ) : spec.kind === "fixed" ? (
        <NumberField
          label="value"
          value={typeof spec.value === "number" ? spec.value : null}
          min={declared?.low}
          max={declared?.high}
          error={errorFor("value")}
          onChange={(value) => onChange({ kind: "fixed", value })}
        />
      ) : (
        <TextField
          label="values"
          value={spec.values.join(", ")}
          placeholder="value1, value2"
          hint="Comma-separated."
          error={errorFor("values")}
          onChange={(value) =>
            onChange({
              kind: "categorical",
              values: value
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
            })
          }
        />
      )}

      {blocking.map((issue) => (
        <p key={issue.message} className="field-error" role="alert">
          {issue.message}
        </p>
      ))}
      {warnings.map((issue) => (
        <p key={issue.message} className="param-warning mono">
          {issue.message}
        </p>
      ))}
    </div>
  );
}

export function ParameterEditor({
  searchSpace,
  declared,
  validation,
  ceilingError,
  onChange,
  onResetAll,
}: {
  searchSpace: Record<string, ParameterSpec>;
  declared: DeclaredSpace;
  validation: SpaceValidation;
  ceilingError: string | null;
  onChange: (next: Record<string, ParameterSpec>) => void;
  onResetAll: () => void;
}) {
  const names = Object.keys(searchSpace);

  if (names.length === 0) {
    return (
      <StateEmpty />
    );
  }

  return (
    <div className="space-y-3">
      <div className="toolbar" data-align="between">
        <span className="mono text-[11px] text-ink-soft">
          {validation.searchedCount}/{names.length} parameters searched ·{" "}
          {validation.combinations.toLocaleString("en-US")} grid combinations
        </span>
        <button type="button" className="btn-ghost" onClick={onResetAll}>
          <RotateCcw size={12} />
          Reset all
        </button>
      </div>

      {ceilingError ? <Callout tone="danger">{ceilingError}</Callout> : null}

      {names.map((name) => (
        <ParameterRow
          key={name}
          name={name}
          spec={searchSpace[name]}
          declared={declared[name]}
          onChange={(next) => onChange({ ...searchSpace, [name]: next })}
          onReset={() => {
            const range = declared[name];
            if (!range) return;
            onChange({
              ...searchSpace,
              [name]: specForKind(
                Number.isInteger(range.low) && Number.isInteger(range.step) ? "int_range" : "float_range",
                range.low,
                range.high,
                range.step,
              ),
            });
          }}
        />
      ))}
    </div>
  );
}

function StateEmpty() {
  return (
    <Callout tone="muted">
      The selected strategy publishes no parameter space, so there is nothing to tune here. The run
      uses the strategy's own defaults.
    </Callout>
  );
}

/** Compact summary used by the review step. */
export function ParameterSummary({
  searchSpace,
  validation,
}: {
  searchSpace: Record<string, ParameterSpec>;
  validation: SpaceValidation;
}) {
  const entries = Object.entries(searchSpace);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Parameter</th>
            <th>Kind</th>
            <th>Range</th>
            <th className="text-right">Points</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([name, spec]) => (
            <tr key={name} data-invalid={validation.errors.some((issue) => issue.parameter === name)}>
              <td className="mono">{name}</td>
              <td className="mono">{spec.kind}</td>
              <td className="mono">
                {spec.kind === "fixed"
                  ? String(spec.value ?? "—")
                  : spec.kind === "categorical"
                    ? spec.values.join(", ") || "—"
                    : `${spec.low} … ${spec.high} / ${spec.step}`}
              </td>
              <td className="mono text-right">{gridPoints(spec)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
