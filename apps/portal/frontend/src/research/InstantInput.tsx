/**
 * The precise UTC instant input of the Walk-forward step, shared by the form's windows and the linked calendar.
 *
 * `datetimeInputValue` and `InstantInput` are the exact behaviour NewRun's `datetimeInputValue` / `DateTimeInput`
 * had; NewRun should import them from here instead of keeping its own copy.
 */
import type { CSSProperties } from "react";

export const INPUT_CLASS = "mono rounded-[6px] border px-2 py-[5px] text-[11px]";
export const inputStyle = (bad?: boolean): CSSProperties => ({
  borderColor: bad ? "var(--bad)" : "var(--line)",
  background: "var(--paper-raised)",
  color: "var(--ink)",
});

/**
 * What a `datetime-local` input can be handed for a draft instant.
 *
 * A copied run carries its instants as the server stored them (`2026-05-01T00:00:00Z`); the input only takes
 * local text with no zone, so with the "Z" on it the browser dropped the value and showed a blank `mm/dd/yyyy`
 * box over a draft that held a real date. The draft keeps its own text; only what the input is given loses the
 * trailing "Z" (the form reads these instants as UTC everywhere). An instant the input cannot show at all - an
 * explicit offset, a stray format - comes back as `raw`, to be printed beside the input instead of vanishing.
 */
export function datetimeInputValue(draftValue: string): { input: string; raw: string | null } {
  if (draftValue === "") return { input: "", raw: null };
  const local = draftValue.endsWith("Z") ? draftValue.slice(0, -1) : draftValue;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/.test(local)
    ? { input: local, raw: null }
    : { input: "", raw: draftValue };
}

export function InstantInput({
  value,
  onChange,
  label,
  style,
  dataSplitMode = false,
  describedBy,
  invalid,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  style: CSSProperties;
  dataSplitMode?: boolean;
  describedBy?: string;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const shown = datetimeInputValue(value);
  return (
    <>
      <span className="flex items-center gap-1.5">
        <input
          type="datetime-local"
          className={`${INPUT_CLASS} min-w-0 flex-1`}
          style={style}
          value={shown.input}
          onChange={(event) => onChange(event.target.value)}
          aria-label={label}
          aria-describedby={describedBy}
          aria-invalid={invalid ? true : undefined}
          disabled={disabled}
          data-split-mode={dataSplitMode ? "" : undefined}
        />
        {/* The inputs render in the reader's locale; the form reads every instant as UTC. */}
        <span className="mono flex-none text-[9px]" style={{ color: "var(--ink-faint)" }} data-utc-suffix>UTC</span>
      </span>
      {shown.raw !== null ? (
        <span className="mono text-[9.5px]" style={{ color: "var(--accent-2)" }} data-instant-unshown>
          copied as {shown.raw} — this input cannot show it
        </span>
      ) : null}
    </>
  );
}
