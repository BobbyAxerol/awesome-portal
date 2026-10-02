/**
 * QA 2026-10-02 (S09 / S13) — small display helpers shared by the report and compare screens.
 * Nothing here derives a value: each one only changes how a server string or number is written.
 */

/**
 * A server reason code is one long token. It breaks after an underscore, never mid-word
 * ("CERTIFICAT / ION_GRADE"); the text content stays the exact code.
 */
export function BreakableCode({ code }: { code: string }) {
  const parts = code.split("_");
  return (
    <>
      {parts.map((part, index) => (
        <span key={index}>
          {index > 0 ? (
            <>
              _<wbr />
            </>
          ) : null}
          {part}
        </span>
      ))}
    </>
  );
}

/** A raw enum token ("VALIDATION_CLAIM", "walk_forward_oos") reads as words; anything else is printed as sent. */
export function humanToken(text: string): string {
  return /^[A-Za-z0-9]+(?:_[A-Za-z0-9]+)+$/.test(text) ? text.toLowerCase().replace(/_/g, " ") : text;
}

/** Seconds in the unit a reader thinks in, `17 d 9 h`; the exact value stays in the caller's title. */
export function daysAndHours(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const hours = Math.round(seconds / 3600);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest === 0 ? `${days} d` : `${days} d ${rest} h`;
}

/** A long axis float to one decimal ("99.89888278338664" to "99.9"); a non-number comes back as sent. */
export function roundAxis(value: string, digits = 1): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(digits).replace("-", "−") : value;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** A UTC month start as "Jul 2026" (the strip's "7/26" read as 7 August). */
export function monthWords(ms: number): string {
  const date = new Date(ms);
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** Bytes for people: 524288 is "512 KB". Exact value stays in a title. */
export function kilobytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${Math.round(bytes / (1024 * 1024))} MB` : `${Math.round(bytes / 1024)} KB`;
}
