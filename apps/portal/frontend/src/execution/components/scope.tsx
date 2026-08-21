/**
 * VenueScope — the venue filter, fed by the venue registry.
 *
 * Decision D5: venue is DATA. The five venues in service today are not a union
 * type anywhere in this file, and a sixth appears the moment the registry lists
 * one. Hardcoding them would mean a venue launch needs a frontend release.
 *
 * The scale pass documents a multiselect fallback above eight chips. It is
 * deliberately not implemented: five chips fit the row as drawn, and building
 * the fallback now would be speculative work on a threshold nothing is near.
 */
import type { VenueCode } from "../contracts";

export interface VenueOption {
  code: VenueCode;
  label: string;
}

/**
 * Multi-select chip row for aggregate screens (Alpha 360°, Blotter,
 * Portfolio 360°). `selected` empty means ALL — an explicit "no venue" state
 * would render an empty screen that looks like missing data.
 */
export function VenueScope({
  venues,
  selected,
  onChange,
  label = "VENUE",
}: {
  venues: readonly VenueOption[];
  selected: readonly VenueCode[];
  onChange: (next: VenueCode[]) => void;
  label?: string;
}) {
  const all = selected.length === 0;

  const toggle = (code: VenueCode) => {
    onChange(
      selected.includes(code) ? selected.filter((item) => item !== code) : [...selected, code],
    );
  };

  return (
    <div className="exec-scope" role="group" aria-label="Venue scope">
      <span className="exec-scope-label">{label}</span>
      <button
        type="button"
        className="exec-scope-chip"
        aria-pressed={all}
        onClick={() => onChange([])}
      >
        All
      </button>
      {venues.map((venue) => (
        <button
          type="button"
          key={venue.code}
          className="exec-scope-chip"
          aria-pressed={!all && selected.includes(venue.code)}
          onClick={() => toggle(venue.code)}
        >
          {venue.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Single-venue display for screens whose identity IS one account — a workbench
 * or Account 360°. Not a control: on those screens the venue is a fact about
 * the deployment, and offering it as a filter would imply the screen could show
 * another one.
 */
export function VenueIdentity({ venue }: { venue: VenueOption }) {
  return (
    <span className="exec-scope">
      <span className="exec-scope-label">VENUE</span>
      <span className="exec-chip" data-tone="mute">
        {venue.label}
      </span>
    </span>
  );
}
