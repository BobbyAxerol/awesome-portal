/**
 * The trade log in plain words (hi-fi `trade-replay.js` rows): "Entry filled",
 * "Waiting for the price", "Take profit · Buy". A map from the raw codes the
 * source sends, never a replacement for them: every row keeps its raw status,
 * order type and flags, and the view prints them beside the word or on `title`,
 * so the log loses no information when it gets friendlier.
 *
 * An unknown code is not guessed at: it is spelled out as words with the code
 * kept (`Status: SOMETHING_NEW`).
 */
import type { LogRow } from "./tradeReplayModel";

/** Order type code to the word a manager uses. */
export const ORDER_TYPE_WORD: Readonly<Record<string, string>> = {
  MARKET: "Market",
  LIMIT: "Limit",
  STOP: "Stop",
  STOP_MARKET: "Stop",
  STOP_LIMIT: "Stop limit",
  TAKE_PROFIT: "Take profit limit",
  TAKE_PROFIT_MARKET: "Take profit",
  TAKE_PROFIT_LIMIT: "Take profit limit",
  TRAILING_STOP_MARKET: "Trailing stop",
  TRAILING_STOP: "Trailing stop",
  FILL: "Fill",
};

const spell = (code: string): string => {
  const words = code.trim().toLowerCase().replace(/[_\s]+/g, " ");
  return words === "" ? code : words.charAt(0).toUpperCase() + words.slice(1);
};

export const orderTypeWord = (code: string | null): string => (code === null ? "Order" : ORDER_TYPE_WORD[code.toUpperCase()] ?? spell(code));

export const EVENT_WORD: Readonly<Record<LogRow["event"], string>> = {
  FILL: "Fill",
  SUBMIT: "Submit",
  ACK: "Acknowledged",
  REJECT: "Reject",
  TRIGGER: "Trigger",
  CANCEL: "Cancel",
  EXPIRE: "Expire",
};

const LEG_WORD = { ENTRY: "Entry", TP: "Take profit", SL: "Stop loss", OTHER: "Other" } as const;

/** Order status code to a result sentence. */
const STATUS_RESULT: Readonly<Record<string, string>> = {
  INITIALIZED: "Sent to venue",
  SUBMITTED: "Sent to venue",
  NEW: "Sent to venue",
  ACCEPTED: "Working at the venue",
  WORKING: "Working at the venue",
  PARTIALLY_FILLED: "Partly filled",
  FILLED: "Order filled",
  TRIGGERED: "Triggered, waiting for the fill",
  CANCELED: "Cancelled",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
  PENDING_UPDATE: "Change pending",
  PENDING_CANCEL: "Cancel pending",
  UNKNOWN: "Status not known",
};

export interface PlainLogRow {
  event: string;
  /** The event as the log's raw code, for a title. */
  eventCode: string;
  leg: string;
  type: string;
  /** Time in force and flags ("GTC · reduce only"), muted beside the type. */
  flags: string | null;
  side: string | null;
  result: string;
  /** The raw status the word came from, kept as a chip; null on a fill row. */
  statusCode: string | null;
  /** Figures the result must not lose: realized PnL, the source's error text. */
  detail: string | null;
  fee: string;
  price: string | null;
}

/** An armed leg waits for its trigger price; an entry waits for the venue. */
const armed = (row: LogRow): boolean => (row.role === "TP" || row.role === "SL") && row.event === "SUBMIT" && (row.status === "NEW" || row.status === "WORKING" || row.status === "ACCEPTED" || row.status === "INITIALIZED" || row.status === "SUBMITTED");

export function plainRow(row: LogRow): PlainLogRow {
  const status = row.status;
  const legWord = row.role === "TP" ? "Take profit" : row.role === "SL" ? "Stop loss" : "Entry";
  let result: string;
  if (row.event === "FILL") {
    result = row.exitKind === "TP" ? "Take profit reached" : row.exitKind === "SL" ? "Stop loss reached" : row.exitKind === "EXIT" ? "Position closed" : row.role === "ENTRY" ? "Entry filled" : "Filled";
  } else if (row.event === "TRIGGER" && status === "FILLED") {
    result = `${legWord} reached`;
  } else if (row.event === "REJECT") {
    result = "Rejected by the venue";
  } else if (armed(row)) {
    result = "Waiting for the price";
  } else if (status === null) {
    result = "Status not published";
  } else {
    result = STATUS_RESULT[status] ?? `Status: ${status}`;
  }
  const detail = [row.realized !== null ? `realized ${row.realized}` : null, row.errorText].filter((x): x is string => x !== null).join(" · ") || null;
  const filledOrder = status === "FILLED" || status === "PARTIALLY_FILLED";
  const fee = row.event === "FILL"
    ? row.fee ?? "Not published"
    : row.event === "CANCEL" || row.event === "EXPIRE" || row.event === "REJECT"
      ? "No fill"
      : filledOrder ? "On the fill rows" : "No fill yet";
  return {
    event: armed(row) ? "Armed" : EVENT_WORD[row.event],
    eventCode: row.event,
    leg: row.event === "FILL" && row.role === "OTHER" ? "Other" : LEG_WORD[row.role],
    type: row.event === "FILL" && row.typeCode === null ? "Fill" : orderTypeWord(row.typeCode),
    flags: row.flags.length > 0 ? row.flags.map((f) => (f === "reduce_only" ? "reduce only" : f)).join(" · ") : null,
    side: row.side === null ? null : row.side.toUpperCase() === "BUY" ? "Buy" : row.side.toUpperCase() === "SELL" ? "Sell" : spell(row.side),
    result,
    statusCode: status,
    detail,
    fee,
    price: row.price === "market" ? "At market" : row.price,
  };
}

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** `16 Oct 20:01:30Z`, always with the date, on one line. */
export function plainTime(epochMs: number): string {
  const d = new Date(epochMs);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(d.getUTCDate())} ${MONTH[d.getUTCMonth()]} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())}Z`;
}
