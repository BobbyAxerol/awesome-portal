/**
 * In-memory COMMAND STORY (WP-P, FIXTURE_LAB). Plan, apply, status and retry as one deterministic walk over a record that keeps ONE set of ids
 * (`operation_id`, `command_key`, `request_key`, `receipt_ref`), so the queue row, the dock, the audit line and the approval receipt preview can
 * show the same receipt. It is the fixture's own harness story, NOT a product route and NOT a model of the real relay:
 *
 *  - lane-internal paths under `/__fixture/command-story/` (the same family as `/__fixture/scenario`); the product routes are untouched, so the
 *    real transport is never reached and the delivery policy flags stay off;
 *  - answered only when the server runs with `FIXTURE_WRITES=doubles`; the default `refuse` is a 405 like every other write;
 *  - nothing is persisted: `resetCommandStory()` (called by every scenario switch and reset) empties it, ids restart from 001;
 *  - every body says `source_side_effect_requested: false` and `fixture: true`.
 *
 * Transitions: PLANNED --apply--> APPLIED, or (apply with `simulate_unknown_first: true`) UNKNOWN --retry--> APPLIED. The receipt exists only once
 * APPLIED. A second plan with the same `request_key` returns the same record (idempotency). Anything else is a typed 409/404.
 */
export type StoryState = "PLANNED" | "UNKNOWN" | "APPLIED";
export interface StoryAttempt { attempt: number; kind: "APPLY" | "RETRY"; outcome: "UNKNOWN" | "APPLIED" }
export interface StoryRecord {
  operation_id: string;
  command_key: string;
  request_key: string;
  receipt_ref: string | null;
  state: StoryState;
  attempts: StoryAttempt[];
}
export interface StoryResponse { status: number; body: unknown }

const PREFIX = "/__fixture/command-story";
let records = new Map<string, StoryRecord>();
let byRequestKey = new Map<string, string>();
let counter = 0;

export function resetCommandStory(): void {
  records = new Map();
  byRequestKey = new Map();
  counter = 0;
}

/** The receipt the audit feed uses for an applied story operation (the same shape the audit rows of the other operations carry). */
export const storyReceipt = (operationId: string): string => `FIXTURE_LAB:receipt-${operationId}-applied`;
/** Snapshot for the audit feed. */
export const storyRecords = (): readonly StoryRecord[] => [...records.values()];

const view = (record: StoryRecord): Record<string, unknown> => ({ ...record, attempts: record.attempts.map((attempt) => ({ ...attempt })), fixture: true, source_side_effect_requested: false });
const problem = (status: number, code: string, message: string): StoryResponse => ({ status, body: { error: { code, message }, fixture: true, source_side_effect_requested: false } });

/** `null` when the path is not the story's. The caller has already refused the method under FIXTURE_WRITES=refuse. */
export function commandStoryRoute(method: string, path: string, body: unknown): StoryResponse | null {
  if (path !== PREFIX && !path.startsWith(`${PREFIX}/`)) return null;
  const rest = path.slice(PREFIX.length).split("/").filter((part) => part !== "");
  const input = (body !== null && typeof body === "object" ? body : {}) as { command_key?: unknown; request_key?: unknown; simulate_unknown_first?: unknown };

  if (rest.length === 1 && rest[0] === "plan" && method === "POST") {
    const requestKey = typeof input.request_key === "string" && /^[A-Za-z0-9._:-]{1,96}$/.test(input.request_key) ? input.request_key : null;
    const commandKey = typeof input.command_key === "string" && /^[A-Za-z0-9._:-]{1,96}$/.test(input.command_key) ? input.command_key : "capital.top_up";
    if (requestKey !== null && byRequestKey.has(requestKey)) return { status: 200, body: view(records.get(byRequestKey.get(requestKey)!)!) };
    counter += 1;
    const n = String(counter).padStart(3, "0");
    const record: StoryRecord = { operation_id: `op_FIXTURE_LAB_story_${n}`, command_key: commandKey, request_key: requestKey ?? `rk_FIXTURE_LAB_story_${n}`, receipt_ref: null, state: "PLANNED", attempts: [] };
    records.set(record.operation_id, record);
    byRequestKey.set(record.request_key, record.operation_id);
    return { status: 201, body: view(record) };
  }

  const record = rest.length >= 1 ? records.get(rest[0]!) : undefined;
  if (rest.length === 2 && ["apply", "status", "retry"].includes(rest[1]!)) {
    if (record === undefined) return problem(404, "FIXTURE_STORY_OPERATION_NOT_FOUND", "No such planned operation in this fixture session.");
    const action = rest[1]!;
    if (action === "status" && method === "GET") return { status: 200, body: view(record) };
    if (action === "apply" && method === "POST") {
      if (record.state !== "PLANNED") return problem(409, "FIXTURE_STORY_ALREADY_APPLIED_OR_PENDING", `The operation is ${record.state}; apply once, then status or retry.`);
      const unknown = input.simulate_unknown_first === true;
      record.attempts.push({ attempt: 1, kind: "APPLY", outcome: unknown ? "UNKNOWN" : "APPLIED" });
      record.state = unknown ? "UNKNOWN" : "APPLIED";
      if (!unknown) record.receipt_ref = storyReceipt(record.operation_id);
      return { status: 200, body: view(record) };
    }
    if (action === "retry" && method === "POST") {
      if (record.state !== "UNKNOWN") return problem(409, "FIXTURE_STORY_NOT_RETRYABLE", `Only an UNKNOWN outcome is retried; the operation is ${record.state}.`);
      record.attempts.push({ attempt: record.attempts.length + 1, kind: "RETRY", outcome: "APPLIED" });
      record.state = "APPLIED";
      record.receipt_ref = storyReceipt(record.operation_id);
      return { status: 200, body: view(record) };
    }
    return problem(405, "FIXTURE_METHOD_NOT_ALLOWED", "Wrong method for this story step.");
  }
  return problem(404, "FIXTURE_ROUTE_NOT_SERVED", "Unknown command-story route.");
}
