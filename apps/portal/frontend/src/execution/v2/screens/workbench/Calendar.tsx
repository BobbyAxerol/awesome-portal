/**
 * The VN market calendar of the Paper workbench's VN variant (FE-070, `data.venue_calendar`).
 *
 * Every member is a Fact. Today the producer publishes each as `Not published` (`N28_VENUE_CALENDAR_NOT_ACTIVE`: no
 * trading-calendar source of truth is wired), so each prints `Not published (FE-070)` with the server's reason code in the
 * title. When the source publishes, the screen prints what it says and nothing more: windows and breaks are the SOURCE's
 * (a break is the published gap between two windows, not arithmetic done here), and "open" is the SOURCE's own statement
 * at its `as_of` - this file never decides PAUSED or AGING from window arithmetic, and never compares a window with the clock.
 */
import type { ReactNode } from "react";

import { NotPublished, SectionPanel } from "../../blocks";
import { Flag } from "../../Flag";
import { cell, timeCell, type FactCell } from "../../readers/stageFactViews";
import type { VenueCalendar, VenueWindow } from "../../../stageFacts";
import { timeText } from "../stage/factChips";

const KIND_WORD: Readonly<Record<VenueWindow["kind"], string>> = {
  TRADING_SESSION: "trading session",
  OPENING_AUCTION: "opening auction",
  CLOSING_AUCTION: "closing auction",
};

function Np({ reason, what }: { reason: string | null; what?: string }) {
  return (
    <NotPublished id="FE-070" titleReason={reason}>
      {what}
    </NotPublished>
  );
}

function OpenNow({ calendar }: { calendar: VenueCalendar }) {
  const open = cell(calendar.isOpen, (v) => v);
  if (open === null) return <Np reason={null} />;
  if (open.kind === "not-published") return <Np reason={open.reasonCode} />;
  const asOf: FactCell<number> | null = timeCell(calendar.asOf);
  const at = asOf !== null && asOf.kind === "value" ? timeText(asOf.value) : null;
  return (
    <span>
      <Flag kind={open.value ? "ok" : "neutral"} label={open.value ? "Open" : "Closed"} size="sm" />
      {at === null ? null : <span className="exec-wb-why">The source's statement as of {at}</span>}
    </span>
  );
}

/** The header line: the source's open/closed statement, or `Not published (FE-070)` with its reason. */
export function VenueCalendarLine({ calendar }: { calendar: VenueCalendar | null }) {
  return calendar === null ? <Np reason={null} /> : <OpenNow calendar={calendar} />;
}

function Value<T>({ fact, children }: { fact: VenueCalendar[keyof VenueCalendar]; children: (value: T) => ReactNode }) {
  const f = fact as { availability: "AVAILABLE"; value: T } | { availability: "NOT_PUBLISHED"; reasonCode: string };
  return f.availability === "NOT_PUBLISHED" ? <Np reason={f.reasonCode} /> : <>{children(f.value)}</>;
}

/** The calendar's members, one row each. Rendered only when the profile carries a calendar. */
export function VenueCalendarPanel({ calendar }: { calendar: VenueCalendar }) {
  return (
    <SectionPanel level={2} title="VN market sessions" aside="Venue-local time">
      <table className="exec-wb-kv">
        <tbody>
          <tr>
            <th scope="row">Open now</th>
            <td><OpenNow calendar={calendar} /></td>
          </tr>
          <tr>
            <th scope="row">Time zone</th>
            <td>
              <Value<string> fact={calendar.timezone}>{(zone) => <span className="exec-blk-id">{zone}</span>}</Value>
            </td>
          </tr>
          <tr>
            <th scope="row">Windows</th>
            <td>
              <Value<readonly VenueWindow[]> fact={calendar.windows}>
                {(windows) => (
                  <ul className="exec-wb-list">
                    {windows.map((w) => (
                      <li key={`${w.name}-${w.open}`}>
                        <b>{w.name}</b> <span className="exec-blk-num">{w.open}-{w.close}</span> <span className="exec-wb-why">{KIND_WORD[w.kind]}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Value>
            </td>
          </tr>
          <tr>
            <th scope="row">Breaks</th>
            <td>
              <Value<readonly { from: string; to: string }[]> fact={calendar.breaks}>
                {(breaks) => (breaks.length === 0 ? <span>None published</span> : <span className="exec-blk-num">{breaks.map((b) => `${b.from}-${b.to}`).join(", ")}</span>)}
              </Value>
            </td>
          </tr>
          <tr>
            <th scope="row">Holidays</th>
            <td>
              <Value<readonly { date: string; name: string | null }[]> fact={calendar.holidays}>
                {(holidays) =>
                  holidays.length === 0 ? (
                    <span>None published</span>
                  ) : (
                    <span>
                      <span className="exec-blk-num">{holidays.length.toLocaleString("en-US")}</span> published, first{" "}
                      <span className="exec-blk-num">{holidays[0]!.date}</span>
                      {holidays[0]!.name === null ? "" : ` ${holidays[0]!.name}`}
                    </span>
                  )
                }
              </Value>
            </td>
          </tr>
        </tbody>
      </table>
    </SectionPanel>
  );
}
