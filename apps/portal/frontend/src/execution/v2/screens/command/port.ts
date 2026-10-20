/**
 * The command port (UXM-09, fixture lane).
 *
 * The confirmation flow talks to a port, never to the network. In this lane the only port that answers is a scripted fake
 * (`fakePort.ts`): it holds no URL, no `fetch`, no socket, and it is never reached from a product route. The one port the
 * product could construct, `DISABLED_PORT`, answers nothing and says why. There is NO connected port: a real one needs a
 * qualified source path (ELP2-07-001) and is a separate delivery.
 *
 * A port answers with the raw wire facts (`status` + `body`), or with "no answer" (`timeout`, `network`). The flow reads the body
 * through the strict readers; a port never hands the screen a typed value, so a fake cannot smuggle a state the readers refuse.
 */

/** The two families the fixture exercises. */
export type Lane = "F0" | "CAPITAL";

/** What a port returns: the HTTP status and the parsed body, or nothing at all. */
export type PortResponse =
  | { kind: "response"; status: number; body: unknown }
  | { kind: "no_response"; why: "timeout" | "network" | "not_connected" };

export interface PlanInput {
  lane: Lane;
  /** The request key of the plan (`POST /commands/plans` is idempotent by it). Re-sent verbatim on a reload. */
  planKey: string;
}

export interface SubmitInput {
  lane: Lane;
  /** The idempotency key of this intent. The same key for a retry, always. */
  idempotencyKey: string;
  /** F0: the plan's `operation_id` (apply is `POST /operations/{id}/apply`). Capital: null. */
  operationId: string | null;
  /** Capital: the preview digest the submit is bound to. F0: the plan digest. */
  digest: string | null;
  /** The typed reason, trimmed. Never echoed back by a server (HASH_ONLY_NO_RAW). */
  reason: string;
}

export interface LookupInput {
  /** `ecm_` + 32 hex (a capital command) or an operation id (an F0 operation). */
  id: string;
}

export interface CommandPort {
  /** `fixture`: scripted, no network. `disabled`: answers nothing. */
  readonly kind: "fixture" | "disabled";
  plan(input: PlanInput): Promise<PortResponse>;
  submit(input: SubmitInput): Promise<PortResponse>;
  lookup(input: LookupInput): Promise<PortResponse>;
}

/** The exact words a disabled send carries. */
export const SEND_DISABLED_REASON = "Command sends are not connected to a source: UXM-09 fixture";
/** The same, for the reads that precede a send. */
export const READ_DISABLED_REASON = "Command reads are not connected to a source: UXM-09 fixture";

const NOT_CONNECTED: PortResponse = { kind: "no_response", why: "not_connected" };

/** The only port a product mount can hold in this lane: it answers nothing, and the flow does not call it. */
export const DISABLED_PORT: CommandPort = {
  kind: "disabled",
  plan: async () => NOT_CONNECTED,
  submit: async () => NOT_CONNECTED,
  lookup: async () => NOT_CONNECTED,
};

/** Why a send is blocked for this port, or null when the port may be asked (a fixture port only). */
export function sendBlockedReason(port: CommandPort): string | null {
  return port.kind === "fixture" ? null : SEND_DISABLED_REASON;
}
