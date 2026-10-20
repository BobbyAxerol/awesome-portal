/**
 * The scripted fake port of the UXM-09 fixture story. FIXTURE ONLY: it never reaches a network.
 *
 * It holds no URL and imports no transport; `fakePort.test.ts` scans this file for `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`
 * and `sendBeacon` so that stays true. It emulates the one server behaviour the flow depends on: an idempotency key. The same key with
 * the same payload answers from the script's next step; the same key with a different payload is refused with the typed
 * `COMMAND_IDEMPOTENCY_CONFLICT`, as the contract says.
 *
 * What each scenario answers is in `storyData.ts`; this file only sequences it.
 */
import {
  COMMAND_ID_APPLIED,
  COMMAND_ID_DELIVERY_UNKNOWN,
  COMMAND_ID_LANDED,
  COMMAND_ID_REJECTED,
  COMMAND_ID_REVOKED,
  COMMAND_ID_UNVERIFIED,
  F0_APPLY_CONFLICT_BODY,
  F0_APPLY_DENIED_BODY,
  F0_APPLY_REPLAYED_BODY,
  F0_ATTEMPT_CONFLICT_BODY,
  F0_ATTEMPT_FOUND_BODY,
  F0_ATTEMPT_NONE_BODY,
  F0_OPERATION_BODY,
  F0_PLAN_BODY,
  STORY_NOW_MS,
  ackOnlyStatus,
  appliedLaggingStatus,
  capitalPreviewBody,
  deliveryUnknownSettledStatus,
  deliveryUnknownStatus,
  f0ApplyAnswer,
  problemBody,
  rejectedBusinessStatus,
  scenarioById,
  submitResultBody,
  type ScenarioId,
} from "./storyData";
import type { CommandPort, LookupInput, PlanInput, PortResponse, SubmitInput } from "./port";

export interface PortCall {
  method: "plan" | "submit" | "lookup";
  /** Idempotency key (submit), plan key (plan) or id (lookup). */
  key: string;
  /** The nth time this key was sent (submit only). */
  attempt?: number;
}

export interface FakeCommandPort extends CommandPort {
  readonly kind: "fixture";
  readonly calls: readonly PortCall[];
  setScenario(id: ScenarioId): void;
  scenario(): ScenarioId;
}

export interface FakePortOptions {
  scenario?: ScenarioId;
  /** The clock the plan's expiry is computed against. Defaults to the story clock. */
  now?: () => number;
  /** Awaited before every answer: a test holds a send here to prove a second click cannot start another. */
  latency?: (call: PortCall) => Promise<void>;
}

const respond = (status: number, body: unknown): PortResponse => ({ kind: "response", status, body });
/** F0 scenarios in which the server records the denial for the key it was sent under. */
const RECORDS_DENIAL: ReadonlySet<ScenarioId> = new Set<ScenarioId>(["f0-denied", "f0-denied-replayed", "f0-timeout-then-denied", "f0-plan-replayed", "f0-plan-expired"]);
const silence: PortResponse = { kind: "no_response", why: "timeout" };
const clone = <T,>(value: T): T => structuredClone(value);

/** A step knows the request key of the send it answers: the F0 apply bodies echo it, as the server does. */
type Step = (requestKey: string) => PortResponse;

/** The script of a scenario: its sends, in order. The last step repeats. */
function sends(id: ScenarioId): readonly Step[] {
  switch (id) {
    case "f0-denied": return [(key) => respond(409, f0ApplyAnswer(F0_APPLY_DENIED_BODY, key))];
    case "f0-denied-replayed": return [(key) => respond(409, f0ApplyAnswer(F0_APPLY_REPLAYED_BODY, key))];
    case "f0-key-conflict": return [(key) => respond(409, f0ApplyAnswer(F0_APPLY_CONFLICT_BODY, key))];
    // The first send was recorded before its answer was lost, so the retry gets the stored answer back: replayed.
    case "f0-timeout-then-denied": return [() => silence, (key) => respond(409, f0ApplyAnswer(F0_APPLY_REPLAYED_BODY, key))];
    case "f0-plan-replayed":
    case "f0-plan-expired": return [(key) => respond(409, f0ApplyAnswer(F0_APPLY_DENIED_BODY, key))];
    case "f0-unverified":
    case "unverified": return [() => respond(503, problemBody("COMMAND_STATUS_UNVERIFIED", "Could not verify the receipt."))];
    case "f0-unreadable":
    case "unreadable": return [() => respond(200, { receipt: "ok" })];
    case "f0-revoked":
    case "revoked": return [() => respond(403, problemBody("ACCESS_DENIED", "Your access changed."))];
    case "accepted": return [() => respond(200, ackOnlyStatus())];
    case "applied-lagging": return [() => respond(200, appliedLaggingStatus())];
    case "rejected-preview-changed": return [() => respond(409, problemBody("COMMAND_PREVIEW_CHANGED", "The preview changed."))];
    case "rejected-by-source": return [() => respond(200, rejectedBusinessStatus())];
    case "delivery-unknown": return [() => respond(200, deliveryUnknownStatus()), () => respond(200, deliveryUnknownSettledStatus())];
    case "timeout-then-landed": return [() => silence, () => respond(200, ackOnlyStatus())];
  }
}

export function createFakeCommandPort(options: FakePortOptions = {}): FakeCommandPort {
  let current: ScenarioId = options.scenario ?? "f0-denied";
  const now = options.now ?? (() => STORY_NOW_MS);
  const calls: PortCall[] = [];
  /** Per key: how many sends it had and what payload it first carried. */
  const keys = new Map<string, { attempts: number; fingerprint: string }>();
  /** Ids this port has issued; a lookup of one of them finds a command. */
  const issued = new Set<string>([COMMAND_ID_LANDED, COMMAND_ID_APPLIED, COMMAND_ID_DELIVERY_UNKNOWN, COMMAND_ID_REJECTED]);

  /**
   * What recovery by key finds. The scenarios that record a denial (even one whose answer is lost) find it once the key has been sent; a key
   * conflict finds CONFLICT and never names the other operation; every other scenario recorded nothing, so NONE.
   */
  const attemptLookup = (operationId: string, requestKey: string): Record<string, unknown> => {
    const named = (body: typeof F0_ATTEMPT_NONE_BODY | typeof F0_ATTEMPT_FOUND_BODY | typeof F0_ATTEMPT_CONFLICT_BODY): Record<string, unknown> => {
      const out: Record<string, unknown> = clone(body);
      out.operation_id = operationId;
      out.request_key = requestKey;
      if (out.relay_decision !== null) out.relay_decision = { ...(out.relay_decision as Record<string, unknown>), operation_id: operationId };
      return out;
    };
    if (current === "f0-key-conflict") return named(F0_ATTEMPT_CONFLICT_BODY);
    return keys.has(requestKey) && RECORDS_DENIAL.has(current) ? named(F0_ATTEMPT_FOUND_BODY) : named(F0_ATTEMPT_NONE_BODY);
  };

  const wait = async (call: PortCall) => {
    calls.push(call);
    if (options.latency) await options.latency(call);
  };

  return {
    kind: "fixture",
    calls,
    setScenario(id) { current = id; },
    scenario: () => current,

    async plan(input: PlanInput): Promise<PortResponse> {
      await wait({ method: "plan", key: input.planKey });
      const scenario = scenarioById(current);
      if (input.lane === "F0") {
        const plan: Record<string, unknown> = clone(F0_PLAN_BODY);
        if (scenario.plan === "replayed") plan.replayed = true;
        if (scenario.plan === "expired") plan.expires_at = new Date(now() - 60_000).toISOString().replace(/\.\d{3}Z$/, "Z");
        return respond(201, plan);
      }
      return respond(200, capitalPreviewBody({ now: now(), expired: scenario.plan === "expired" }));
    },

    async submit(input: SubmitInput): Promise<PortResponse> {
      const fingerprint = JSON.stringify([input.lane, input.operationId, input.digest, input.reason]);
      const seen = keys.get(input.idempotencyKey);
      if (seen !== undefined && seen.fingerprint !== fingerprint) {
        await wait({ method: "submit", key: input.idempotencyKey, attempt: seen.attempts + 1 });
        // F0 apply gives its own typed conflict (REQUEST_KEY_PAYLOAD_CONFLICT, in the shared envelope); the capital routes give the CommandProblem.
        return input.lane === "F0"
          ? respond(409, f0ApplyAnswer(F0_APPLY_CONFLICT_BODY, input.idempotencyKey))
          : respond(409, problemBody("COMMAND_IDEMPOTENCY_CONFLICT", "Key reuse."));
      }
      const attempts = (seen?.attempts ?? 0) + 1;
      keys.set(input.idempotencyKey, { attempts, fingerprint });
      await wait({ method: "submit", key: input.idempotencyKey, attempt: attempts });
      const script = sends(current);
      const answer = script[Math.min(attempts, script.length) - 1]!(input.idempotencyKey);
      // The capital submit's 200 is a CommandSubmitResult: the status plus `replayed`. A known key (a retry) is answered with the existing
      // command and does not send again, so it is the one case where the bit is true. A body that is not a status is passed through unread.
      if (answer.kind === "response" && answer.status === 200 && typeof answer.body === "object" && answer.body !== null && "command_id" in answer.body) {
        return respond(200, submitResultBody(answer.body as Record<string, unknown>, attempts > 1));
      }
      return answer;
    },

    async lookup(input: LookupInput): Promise<PortResponse> {
      await wait({ method: "lookup", key: input.id });
      const { id } = input;
      // `GET /operations/f0/{id}/apply-attempts/{request_key}`: NONE until this port has seen the key, then what the scenario recorded.
      if (input.requestKey !== undefined) return respond(200, attemptLookup(id, input.requestKey));
      if (id === F0_OPERATION_BODY.operation_id) return respond(200, clone(F0_OPERATION_BODY));
      if (id === COMMAND_ID_REVOKED) return respond(403, problemBody("ACCESS_DENIED", "Your access changed."));
      if (id === COMMAND_ID_UNVERIFIED) return respond(503, problemBody("COMMAND_STATUS_UNVERIFIED", "Could not verify the receipt."));
      if (!issued.has(id)) return respond(404, problemBody("COMMAND_RESOURCE_NOT_FOUND", "No such command."));
      if (id === COMMAND_ID_APPLIED) return respond(200, appliedLaggingStatus());
      if (id === COMMAND_ID_REJECTED) return respond(200, rejectedBusinessStatus());
      if (id === COMMAND_ID_DELIVERY_UNKNOWN) return respond(200, deliveryUnknownSettledStatus());
      return respond(200, ackOnlyStatus());
    },
  };
}
