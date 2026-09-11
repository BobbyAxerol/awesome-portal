/**
 * PHASE 5 (round 2) · "not found" says what happened, never what to do about it.
 *
 * Ten screens answer a 404 honestly today — `CANARY_ENVELOPE_NOT_FOUND`,
 * `No incident is published here` — and that was the whole of Phase 5's
 * frontend brief last round. It leaves the reader one question short. "Nothing
 * is published" reads identically whether the feature is unfinished, whether
 * the Trading System has not sent anything, or whether nobody has simply
 * clicked the button that creates one. Those need different actions and one of
 * them is not a defect at all.
 *
 * Every sentence below was traced to a writer in the backend, not guessed:
 * an operator route that exists, a source that publishes, or nothing at all.
 * Where the answer is "nothing at all", it says so — a screen that quietly
 * implies someone will get round to publishing a record no code writes is
 * worse than a blank one.
 */

/** Who, if anyone, puts a record of this kind into the system. */
export type ProducerKind =
  /** An operator creates it from a route that exists today. */
  | "OPERATOR"
  /** The Trading System publishes it; Portal only projects it. */
  | "SOURCE"
  /** Portal reads this record and nothing anywhere writes one. */
  | "UNBUILT";

export interface RecordProducer {
  readonly kind: ProducerKind;
  /** One sentence, in the reader's terms, naming what would put data here. */
  readonly sentence: string;
}

/**
 * Measured on 2026-09-10 against `apps/control-api/src`: for each record, the
 * INSERT was traced back to the route that reaches it, or its absence proven
 * by finding no writer in the service code, the migrations or the Rust cells.
 */
export const RECORD_PRODUCERS = {
  incident: {
    kind: "OPERATOR",
    sentence: "Incidents are opened by an operator from the Operations Queue. None has been opened in this workspace yet.",
  },
  "sandbox-certification": {
    kind: "OPERATOR",
    sentence: "A certification is opened by an operator against the sandbox deployment it certifies. None has been opened for this deployment yet.",
  },
  "canary-envelope": {
    kind: "OPERATOR",
    sentence: "A canary envelope is created by an operator before a canary starts. None has been created for this deployment yet.",
  },
  /*
   * Traced 2026-09-11, not guessed: `POST /governance/approvals`
   * (governance.controller.ts) reaches `INSERT INTO
   * governance_approval_requests` (governance.repository.ts:569), and the
   * frontend reaches that route from `/governance/approvals/new`, linked off
   * the Approval Inbox as "New request". So an approval is operator-created
   * and the screen can name where. R1, R2 and Live are gates ON that request,
   * not separate records — one absent request empties all three screens.
   */
  "governance-approval": {
    kind: "OPERATOR",
    sentence: "An approval request is opened by an operator from the Approval Inbox, and the R1, R2 and Live gates are stages of that one request. None is open at this reference.",
  },
  "paper-exit-review": {
    kind: "UNBUILT",
    sentence: "No exit review can exist yet: Portal reads this record, but nothing in the platform writes one, so a Paper-exit decision cannot be started here.",
  },
} as const satisfies Readonly<Record<string, RecordProducer>>;

export type RecordKind = keyof typeof RECORD_PRODUCERS;

/**
 * The sentence for a record kind, or null when we have not traced one.
 *
 * Null rather than a filler string: an invented explanation of an absence is
 * the same class of mistake as an invented value.
 */
export function producerSentence(kind: RecordKind): string {
  return RECORD_PRODUCERS[kind].sentence;
}

/**
 * The reason a screen shows, with the sentence appended once.
 *
 * `reason` is the contract's own code and stays first: it is the part an
 * operator quotes in a ticket. The sentence follows because it is the part
 * they act on.
 */
export function absenceReason(reason: string | null | undefined, kind: RecordKind): string {
  const code = typeof reason === "string" ? reason.trim() : "";
  return code.length > 0 ? `${code} ${producerSentence(kind)}` : producerSentence(kind);
}
