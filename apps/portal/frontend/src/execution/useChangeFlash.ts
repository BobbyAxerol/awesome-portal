/**
 * Motion that means a number moved.
 *
 * The reviewed screens tick constantly because they are fed a demo clock. On
 * real data a constant tick would be theatre: it says "something is happening"
 * while nothing is, and once a reader learns that, they stop looking at the one
 * moment something does.
 *
 * So the only motion here is a change flash — a value lights briefly when it
 * actually changes, and sits still otherwise. A screen where nothing has
 * changed looks like a screen where nothing has changed. When the equity
 * projection starts publishing continuously (the owner's additional request,
 * 2026-09-08) these same figures will move continuously, without another line
 * of code: the flash follows the data, not a timer.
 */
import { useEffect, useRef, useState } from "react";

/** How long a changed value stays lit. Long enough to catch the eye, short
 *  enough that two changes in a row read as two changes. */
export const FLASH_MS = 900;

export type FlashDirection = "up" | "down" | "same";

export interface Flash {
  /** true while the value is lit */
  on: boolean;
  /** which way it moved, for numeric values; "same" for anything else */
  direction: FlashDirection;
  /** the attribute a flashing element carries, or undefined when it is still */
  data: "up" | "down" | "flash" | undefined;
}

const STILL: Flash = { on: false, direction: "same", data: undefined };

/**
 * Watches one value and reports a brief flash whenever it changes.
 *
 * The first value is never a change: a screen must not light up simply because
 * it has finished loading. `null` and `undefined` are watched like any other
 * value, so a figure that becomes unavailable flashes too — that is a change a
 * reader wants to see.
 */
export function useChangeFlash(value: string | number | null | undefined): Flash {
  const previous = useRef<string | number | null | undefined>(undefined);
  const seeded = useRef(false);
  const [flash, setFlash] = useState<Flash>(STILL);

  useEffect(() => {
    if (!seeded.current) {
      seeded.current = true;
      previous.current = value;
      return undefined;
    }
    if (Object.is(previous.current, value)) return undefined;
    // A direction is only claimed when both sides are genuinely numbers.
    // `Number(null)` is 0, so without this a figure that became unavailable
    // read as a fall to zero — the null-renders-as-zero failure, wearing a
    // colour. Absent is a change, and it flashes, but it has no direction.
    const numeric = (raw: string | number | null | undefined): number | null => {
      if (raw === null || raw === undefined || raw === "") return null;
      const parsed = typeof raw === "number" ? raw : Number(String(raw).replace(/[,\s]/g, ""));
      return Number.isFinite(parsed) ? parsed : null;
    };
    const before = numeric(previous.current);
    const after = numeric(value);
    const direction: FlashDirection = before !== null && after !== null && before !== after
      ? (after > before ? "up" : "down")
      : "same";
    previous.current = value;
    setFlash({ on: true, direction, data: direction === "same" ? "flash" : direction });
    const timer = setTimeout(() => setFlash(STILL), FLASH_MS);
    return () => clearTimeout(timer);
  }, [value]);

  return flash;
}
