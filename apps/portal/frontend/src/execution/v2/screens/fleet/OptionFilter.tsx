/**
 * One single-value filter (Owner, Health on the fleet read) whose choices may or may not be the whole authorized population.
 *
 * - `complete`: the choices are the whole population the caller may filter by (the dataset published them). A plain select: choosing
 *   is the only way to filter, so a typo cannot happen.
 * - otherwise (the choices are only the rows loaded so far): a text field with a suggestion list. The person may pick a suggestion
 *   or type a value; either way the SERVER filters, so a value that is not among the suggestions is allowed and an unknown one
 *   comes back as an empty result, never as a client-side guess. The honest limit is worded once by the screen
 *   (`exec-fleet-limit`), and the field says it in its tooltip.
 *
 * Keyboard: the select is native; the text field commits on Enter, on leaving the field and on picking a suggestion, and Escape
 * puts back the committed value. An empty field clears the filter.
 */
import { useEffect, useId, useState } from "react";

export interface OptionFilterProps {
  /** Accessible name and the word before "all" (`Owner`). */
  name: string;
  /** The committed filter, or `null` for all. */
  value: string | null;
  options: readonly { value: string; label: string }[];
  /** The choices are the whole population (select) or only what is loaded (typed). */
  complete: boolean;
  /** Text of the tooltip when the choices are partial. */
  limit: string;
  disabled?: boolean;
  title?: string;
  describedBy?: string;
  onChange(next: string | null): void;
}

/** What the person typed, as the value the server knows: a suggestion matched by its value or its label, else the text as typed. */
export function resolveTyped(text: string, options: readonly { value: string; label: string }[]): string | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const lower = trimmed.toLowerCase();
  return options.find((option) => option.value.toLowerCase() === lower || option.label.toLowerCase() === lower)?.value ?? trimmed;
}

export function OptionFilter({ name, value, options, complete, limit, disabled, title, describedBy, onChange }: OptionFilterProps) {
  const listId = useId();
  const shown = (current: string | null) => (current === null ? "" : options.find((option) => option.value === current)?.label ?? current);
  // The field shows the committed filter; it follows the URL (a chip cleared, a link opened) but never a new options array.
  const committed = shown(value);
  const [text, setText] = useState(committed);
  useEffect(() => setText(committed), [committed]);

  if (complete) {
    return (
      <select
        className="exec-fleet-select"
        aria-label={name}
        value={value ?? ""}
        disabled={disabled}
        title={title}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
      >
        <option value="">{name}: all</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    );
  }

  const commit = (raw: string) => {
    const next = resolveTyped(raw, options);
    if (next !== value) onChange(next);
  };
  return (
    <>
      <input
        className="exec-fleet-input exec-fleet-typed"
        type="text"
        role="combobox"
        aria-label={name}
        aria-expanded={false}
        aria-autocomplete="list"
        autoComplete="off"
        list={listId}
        placeholder={`${name}: all`}
        value={text}
        disabled={disabled}
        title={title ?? limit}
        aria-describedby={describedBy}
        data-partial="true"
        onChange={(event) => {
          setText(event.target.value);
          // Picking a suggestion fires a change with exactly its value: that is a choice, not typing.
          if (options.some((option) => option.label === event.target.value)) commit(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit(text);
          if (event.key === "Escape" && text !== shown(value)) {
            // A pending edit is undone by this Esc; the drawer behind must not also close.
            event.preventDefault();
            event.stopPropagation();
            setText(shown(value));
          }
        }}
        onBlur={() => commit(text)}
      />
      <datalist id={listId}>
        {options.map((option) => <option key={option.value} value={option.label} />)}
      </datalist>
    </>
  );
}
