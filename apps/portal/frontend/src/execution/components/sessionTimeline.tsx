/**
 * Venue session timeline (EL-V2-06, HiFi 4h): the trading day as labelled
 * blocks — closed / auction / continuous / break — with a "now" marker.
 * Replaces sentences describing session state; the calendar is the venue's
 * own fact, and the marker is the venue-local clock the caller passed in.
 */
import type { VenueCalendar } from "../vnCalendar";

const DAY = 24 * 60;

function hhmm(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}
/** "2026-08-22T10:42:01" (venue-local, no zone) → minute of day; null when unreadable. */
export function localMinute(venueLocalTime: string): number | null {
  const m = /T(\d{2}):(\d{2})/.exec(venueLocalTime);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function SessionTimeline({
  calendar,
  venueLocalTime,
  phase,
}: {
  calendar: VenueCalendar;
  venueLocalTime: string | null;
  phase: "OPEN" | "CLOSED_BY_CALENDAR" | null;
}) {
  const blocks = calendar.phases?.length
    ? calendar.phases
    : [{ label: "session", kind: "continuous" as const, openMinute: calendar.window.openMinute, closeMinute: calendar.window.closeMinute }];
  const now = venueLocalTime ? localMinute(venueLocalTime) : null;
  const pct = (minute: number) => `${((minute / DAY) * 100).toFixed(2)}%`;
  return (
    <figure className="exec-session-timeline" aria-label={`${calendar.label} session timeline`} data-phase={phase ?? "UNKNOWN"}>
      <div className="exec-session-track" role="list">
        {blocks.map((b) => (
          <span
            key={`${b.label}-${b.openMinute}`}
            role="listitem"
            className="exec-session-block"
            data-kind={b.kind}
            style={{ left: pct(b.openMinute), width: pct(b.closeMinute - b.openMinute) }}
            title={`${b.label} ${hhmm(b.openMinute)}–${hhmm(b.closeMinute)}`}
          />
        ))}
        {now !== null ? (
          <span className="exec-session-now" style={{ left: pct(now) }} aria-label={`now ${hhmm(now)} venue time`} />
        ) : null}
      </div>
      {/* Labels sit under the track on the page surface, so they keep the
          meta role and AA contrast instead of fighting the block colours. */}
      <div className="exec-session-labels" aria-hidden="true">
        {blocks.map((b) => (
          <span key={`${b.label}-${b.openMinute}-l`} className="exec-role-meta exec-session-label" style={{ left: pct(b.openMinute), width: pct(b.closeMinute - b.openMinute) }}>
            {b.label}
          </span>
        ))}
      </div>
      <figcaption className="exec-role-meta exec-session-caption">
        {calendar.label} · {calendar.timezone} · open {hhmm(calendar.window.openMinute)}–{hhmm(calendar.window.closeMinute)}
        {now !== null ? ` · now ${hhmm(now)}` : " · venue clock not published"}
        {phase ? ` · ${phase === "OPEN" ? "SESSION OPEN" : "CLOSED BY CALENDAR"}` : ""}
      </figcaption>
    </figure>
  );
}
