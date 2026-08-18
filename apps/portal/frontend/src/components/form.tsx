/**
 * Shared form primitives — v1 design system.
 *
 * Promoted out of ConfigWorkspace, which had grown private `NumericInput` /
 * `SelectInput` / `ToggleInput` copies. Every configuration surface uses these
 * so label typography, hint/error placement, focus ring and disabled reasons
 * behave identically instead of being re-decided per screen (v0.5 §11.2 #3).
 *
 * Each field carries its own error and hint slots because a validation message
 * that is not attached to its control is not accessible (v0.4 §26.4).
 */
import { useId, type ReactNode } from "react";

export interface FieldShellProps {
  label: string;
  /** Short explanation shown under the control. */
  hint?: ReactNode;
  /** Validation message. Presence switches the control into its error state. */
  error?: string | null;
  /** Unit or scale, rendered next to the label rather than inside the input. */
  suffix?: string;
  required?: boolean;
  className?: string;
  children: (ids: { controlId: string; describedBy: string | undefined }) => ReactNode;
}

/**
 * Label + control + hint/error, wired with `aria-describedby`.
 *
 * The render-prop shape exists so every concrete field below shares one
 * accessibility wiring rather than repeating it.
 */
export function FieldShell({
  label,
  hint,
  error,
  suffix,
  required,
  className,
  children,
}: FieldShellProps) {
  const controlId = useId();
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className={`field${className ? ` ${className}` : ""}`} data-invalid={Boolean(error)}>
      <label className="field-label" htmlFor={controlId}>
        <span>{label}</span>
        {required ? (
          <span className="field-required" aria-hidden="true">
            *
          </span>
        ) : null}
        {suffix ? <span className="field-suffix">{suffix}</span> : null}
      </label>
      {children({ controlId, describedBy })}
      {hint ? (
        <p className="field-hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="field-error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export interface NumberFieldProps extends Omit<FieldShellProps, "children"> {
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number | "any";
  disabled?: boolean;
  /** Reason shown when the control is disabled — never disable silently. */
  disabledReason?: string;
}

export function NumberField({
  value,
  onChange,
  min,
  max,
  step = "any",
  disabled,
  disabledReason,
  ...shell
}: NumberFieldProps) {
  return (
    <FieldShell {...shell}>
      {({ controlId, describedBy }) => (
        <input
          id={controlId}
          className="input w-full"
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={value ?? ""}
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
          aria-describedby={describedBy}
          aria-invalid={shell.error ? true : undefined}
          onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
        />
      )}
    </FieldShell>
  );
}

export interface TextFieldProps extends Omit<FieldShellProps, "children"> {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Applied on change, e.g. upper-casing a ticker. */
  transform?: (value: string) => string;
}

export function TextField({ value, onChange, placeholder, disabled, transform, ...shell }: TextFieldProps) {
  return (
    <FieldShell {...shell}>
      {({ controlId, describedBy }) => (
        <input
          id={controlId}
          className="input w-full"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          aria-describedby={describedBy}
          aria-invalid={shell.error ? true : undefined}
          onChange={(event) => onChange(transform ? transform(event.target.value) : event.target.value)}
        />
      )}
    </FieldShell>
  );
}

export interface SelectOption {
  value: string;
  label?: string;
  disabled?: boolean;
}

export interface SelectFieldProps extends Omit<FieldShellProps, "children"> {
  value: string;
  options: ReadonlyArray<SelectOption | string>;
  onChange: (value: string) => void;
  disabled?: boolean;
  disabledReason?: string;
}

export function SelectField({
  value,
  options,
  onChange,
  disabled,
  disabledReason,
  ...shell
}: SelectFieldProps) {
  const normalised = options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : option,
  );
  return (
    <FieldShell {...shell}>
      {({ controlId, describedBy }) => (
        <select
          id={controlId}
          className="input w-full"
          value={value}
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
          aria-describedby={describedBy}
          aria-invalid={shell.error ? true : undefined}
          onChange={(event) => onChange(event.target.value)}
        >
          {normalised.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label ?? option.value}
            </option>
          ))}
        </select>
      )}
    </FieldShell>
  );
}

export interface DateTimeFieldProps extends Omit<FieldShellProps, "children"> {
  /** ISO-8601 UTC string, or "" when unset. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * UTC datetime field.
 *
 * `<input type="datetime-local">` is timezone-naive, so the value is converted
 * explicitly rather than letting the browser's local zone leak into a run
 * boundary — window edges are audit-relevant (v0.4 §P0.24A).
 */
export function DateTimeField({ value, onChange, disabled, ...shell }: DateTimeFieldProps) {
  return (
    <FieldShell suffix="UTC" {...shell}>
      {({ controlId, describedBy }) => (
        <input
          id={controlId}
          className="input w-full"
          type="datetime-local"
          value={value ? value.slice(0, 16) : ""}
          disabled={disabled}
          aria-describedby={describedBy}
          aria-invalid={shell.error ? true : undefined}
          onChange={(event) =>
            onChange(event.target.value ? new Date(`${event.target.value}Z`).toISOString() : "")
          }
        />
      )}
    </FieldShell>
  );
}

export function ToggleField({
  label,
  checked,
  onChange,
  hint,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  hint?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="toggle-field">
      <label className="toggle-field-label" htmlFor={id}>
        <span>{label}</span>
        {hint ? <span className="field-hint">{hint}</span> : null}
      </label>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </div>
  );
}

/** Two-column field grid; collapses to one column below the tablet breakpoint. */
export function FieldGrid({ children, columns = 2 }: { children: ReactNode; columns?: 1 | 2 | 3 }) {
  return (
    <div className="field-grid" data-columns={columns}>
      {children}
    </div>
  );
}

/** Spans the full width of a `FieldGrid`. */
export function FieldSpan({ children }: { children: ReactNode }) {
  return <div className="field-span">{children}</div>;
}
