/**
 * The precise UTC DATE input of the whole-day Walk-forward step: same look as `InstantInput`, no hour or minute.
 *
 * The draft keeps its instant text; this input reads the date part and writes `YYYY-MM-DDT00:00` (UTC midnight). A value
 * whose time is not 00:00 (a cloned or server value) shows its date and, beside it, the time it still holds; editing the
 * date replaces that time with midnight, nothing is dropped silently.
 */
import type { CSSProperties } from "react";

import { INPUT_CLASS, inputStyle } from "./InstantInput";

/**
 * What a `date` input can be handed for a draft instant: its `YYYY-MM-DD`, and the time it keeps when that is not midnight
 * (`HH:MM`, with `:SS` only when seconds are not zero). A value that is not an instant at all comes back as `raw`.
 */
export function dateInputValue(draftValue: string): { input: string; kept: string | null; raw: string | null } {
  if (draftValue === "") return { input: "", kept: null, raw: null };
  const match = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?Z?)?$/.exec(draftValue.trim());
  if (match === null) return { input: "", kept: null, raw: draftValue };
  const [, date, hh = "00", mm = "00", ss = "00"] = match;
  const ms = /\.(\d{1,3})/.exec(draftValue)?.[1];
  const midnight = hh === "00" && mm === "00" && ss === "00" && (ms === undefined || Number(ms) === 0);
  return { input: date!, kept: midnight ? null : `+${hh}:${mm}${ss !== "00" || ms !== undefined ? `:${ss}` : ""}${ms !== undefined && Number(ms) !== 0 ? `.${ms}` : ""}`, raw: null };
}

export function DateInput({
  value,
  onChange,
  label,
  style,
  describedBy,
  invalid,
  disabled,
  dataSplitMode = false,
}: {
  value: string;
  onChange: (next: string) => void;
  label: string;
  style?: CSSProperties;
  describedBy?: string;
  invalid?: boolean;
  disabled?: boolean;
  /** Marks the first-OOS input for tests and the P02 field map. */
  dataSplitMode?: boolean;
}) {
  const shown = dateInputValue(value);
  return (
    <>
      <span className="flex flex-wrap items-center gap-1.5">
        <input
          type="date"
          className={`${INPUT_CLASS} min-w-0 flex-1`}
          style={style ?? inputStyle(invalid)}
          value={shown.input}
          onChange={(event) => onChange(event.target.value === "" ? "" : `${event.target.value}T00:00`)}
          aria-label={label}
          aria-describedby={describedBy}
          aria-invalid={invalid ? true : undefined}
          disabled={disabled}
          data-split-mode={dataSplitMode ? "" : undefined}
        />
        <span className="mono flex-none text-[9px]" style={{ color: "var(--ink-faint)" }} data-utc-suffix>UTC</span>
        {shown.kept !== null ? (
          <span className="mono flex-none text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-instant-time-kept>
            {shown.kept} UTC kept
          </span>
        ) : null}
      </span>
      {shown.raw !== null ? (
        <span className="mono text-[9.5px]" style={{ color: "var(--accent-2)" }} data-instant-unshown>
          copied as {shown.raw} — this input cannot show it
        </span>
      ) : null}
    </>
  );
}
