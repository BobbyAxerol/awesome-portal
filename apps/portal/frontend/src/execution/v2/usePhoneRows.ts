/**
 * `usePhoneRows(step)`: how many rows of an already-loaded list a phone page draws.
 *
 * At 660px and narrower (the width where css/cards.css turns a table into cards) a card list of hundreds of rows is a
 * scroll of thousands of pixels, so the phone draws `step` rows and a `Load more` draws `step` more of the rows the
 * screen already holds. Above 660px, and where the browser cannot tell (jsdom), `phone` is false and the caller draws
 * what it drew before: the table layout is unchanged. Live (screens/live/parts.tsx) and the Blotter use the same
 * query and the same idea; Users and Alpha 360 Orders & Fills use this hook.
 */
import { useCallback, useState } from "react";

import { useMediaQuery } from "./useMediaQuery";

/** Where a table becomes cards (css/cards.css). */
export const PHONE_QUERY = "(max-width: 660px)";

export interface PhoneRows {
  phone: boolean;
  /** Rows a phone page draws now (always `step` or more; meaningful only while `phone`). */
  rows: number;
  /** Draw `step` more. */
  grow(): void;
  /** Back to the first page (a filter or a search changed). */
  reset(): void;
}

export function usePhoneRows(step: number): PhoneRows {
  const phone = useMediaQuery(PHONE_QUERY);
  const [rows, setRows] = useState(step);
  const grow = useCallback(() => setRows((n) => n + step), [step]);
  const reset = useCallback(() => setRows(step), [step]);
  return { phone, rows, grow, reset };
}
