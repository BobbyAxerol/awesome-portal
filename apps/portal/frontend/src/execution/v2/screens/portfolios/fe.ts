import { notPublishedText } from "../../blocks";
/**
 * What the backend has not published for Portfolios, Portfolio 360 and Compare,
 * said once, with the request id (FRONTEND_BACKEND_SYNC.md, review2/04).
 *
 * Both screens import this table so a request that closes changes one line. The
 * shared `NotPublished` block types its ids as a closed union that does not yet
 * hold FE-005, FE-006, FE-011, FE-013 or FE-017, so these screens keep the same
 * words (`Not published (FE-xxx)`) in their own table instead of widening a
 * shared file.
 *
 * A fact here is never a value: the cell that shows it must not be a dash, a
 * zero or a number the client worked out.
 */
export interface Unpublished {
  /** One or several request ids, as they print: `FE-005, FE-025`. */
  fe: string;
  /** What exactly is missing, in a few words. */
  what: string;
}

export const NOT_PUBLISHED_WORD = "Not published";

export const PF_FE = {
  /** NAV and every statement that needs the Manager financial publication. */
  nav: { fe: "FE-013", what: "NAV" },
  netPnl: { fe: "FE-005, FE-025", what: "Net PnL in a window" },
  ret: { fe: "FE-006, FE-025", what: "Return in a window" },
  drawdown: { fe: "FE-013, FE-025", what: "Drawdown (needs the NAV series)" },
  concentration: { fe: "FE-005", what: "Concentration (HHI)" },
  score: { fe: "FE-011", what: "Portfolio score" },
  statements: { fe: "FE-017", what: "Capital statements (initial, added, returned, budget)" },
  window: { fe: "FE-025", what: "Window" },
  flowEdges: { fe: "FE-032", what: "Capital flow edges and ledger receipts" },
  activity: { fe: "FE-031", what: "Activity feed" },
  audit: { fe: "FE-021", what: "Who did what (audit source)" },
  actions: { fe: "FE-015", what: "Per-row eligibility and the reason a control is off" },
  preview: { fe: "FE-020", what: "Command preview" },
  compareSeries: { fe: "FE-033", what: "Aligned series and the IN filter" },
  digest: { fe: "FE-024", what: "Change feed since your last visit" },
  share: { fe: "FE-005, FE-025", what: "Share of PnL in a window" },
} as const satisfies Record<string, Unpublished>;

/** `Not published: nav` as plain text, for a title, a reason or a table cell (the request id stays in code and in `data-gap`). */
export const npText = (fact: Unpublished): string => notPublishedText(fact.fe, fact.what);

/** The sentence a disabled control carries. */
export const npReason = (fact: Unpublished, because: string): string => `${npText(fact)}. ${because}`;

/** Copy of the one export refusal (decision D20): one sentence everywhere until export exists. */
export const EXPORT_REASON = "Export is not available yet.";
