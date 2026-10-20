/**
 * The state behind the command confirmation flow: plan, typed confirmation, one send, a receipt, a status lookup.
 *
 * Idempotency-key discipline (the New request pattern, kept): a key is minted per send INTENT, and an intent is a payload. The key lives
 * in a session-wide table keyed by the payload fingerprint, so a screen that is unmounted during a send finds it again. Only a DEFINITE
 * answer (accepted, replayed, denied, a typed refusal, access stopped) releases it. While the last answer is UNKNOWN the payload is
 * LOCKED: the only ways on are a retry, which re-sends the stored payload verbatim under the SAME key, or a confirmed discard. There is no
 * code path that sends a stored intent under a second key.
 *
 * Double submit: `inFlight` is a ref, not state. React batches a double click's handlers before state lands, so the second click must be
 * refused synchronously. `submitting` (state) only drives the screen.
 *
 * Every send carries an attempt number. An answer that arrives after Discard or unmount updates the key table but never the screen.
 *
 * Nothing here runs on mount: no effect calls the port. Reading a plan, sending and looking up each need a click. A disabled port is
 * never called.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  EMPTY_CONFIRM,
  classifyPlan,
  classifySubmit,
  isDismissible,
  isSettled,
  isUncertain,
  payloadIdentity,
  planExpired,
  receiptCommandId,
  submitGate,
  validateConfirm,
  type ConfirmFields,
  type ConfirmValidation,
  type PlanLoad,
  type PlanView,
  type Receipt,
  type SubmitGate,
  type SubmitPayload,
  type CapitalIntentView,
} from "./model";
import { READ_DISABLED_REASON, sendBlockedReason, type CommandPort, type Lane } from "./port";
import { classifyLookup, type LookupView } from "./lookup";

export interface UseCommandFlowOptions {
  port: CommandPort;
  lane: Lane;
  /** The capital intent a capital plan previews. Unused by the F0 lane. */
  capital: CapitalIntentView;
  /** The story clock, or the real one. Read at render and at send; never in an effect. */
  now?: () => number;
  /** Why the host holds Submit for now (a pending "Discard?" question), or null. */
  holdReason?: string | null;
}

export type PlanState = { status: "idle" } | { status: "loading" } | { status: "ready"; view: PlanView } | { status: "failed"; load: Extract<PlanLoad, { kind: "failed" }> };

export interface CommandFlow {
  plan: PlanState;
  readPlan(): void;

  fields: ConfirmFields;
  setReason(text: string): void;
  setConfirmWord(text: string): void;
  setImpactAck(value: boolean): void;
  validation: ConfirmValidation;
  gate: SubmitGate;
  expired: boolean;

  submitting: boolean;
  receipt: Receipt | null;
  /** The idempotency key of the last send intent. Null before the first send. */
  requestKey: string | null;
  /** How many sends the current intent has had (a retry is the second). */
  attempts: number;
  uncertain: boolean;
  settled: boolean;
  /** Re-sends the stored payload of an UNKNOWN send, verbatim, under the SAME key. No-op in any other state. */
  retry(): void;
  /** Forgets an UNKNOWN send (its key included). The caller shows the warning first. */
  discardUncertain(): void;
  /** Hides a typed refusal that created nothing and returns to the form with the fields as they were. */
  dismissRefusal(): void;
  submit(): void;
  /** Back to no plan, no receipt, a new intent. A send still in flight keeps its key. */
  reset(): void;

  /** The command id the receipt carries, if any: the thing "query the same intent" asks about. */
  commandId: string | null;
  queryIntent(): void;
  querying: boolean;
  /** What the last query found (or why it found nothing). Never replaces the receipt. */
  queried: LookupView | null;

  /** Where focus should go after an action removed the control that had it (a dismissed refusal, a discard, a new plan). */
  focus: { tick: number; target: "reason" | "plan" };

  /** The reader holds something they could lose by leaving. */
  dirty: boolean;
  /** Why the send is blocked for this port, or null. */
  blockedReason: string | null;
  /** What answered: `fixture` is the scripted fake (a receipt from it is not a receipt from any source). */
  portKind: CommandPort["kind"];
}

function mintKey(): string {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `command_apply:${id}`;
}

interface StoredIntent {
  key: string;
  payload: SubmitPayload;
}

/** Keys of sends by payload fingerprint, for the life of the page. Only a definite answer removes an entry. */
const INTENTS = new Map<string, StoredIntent>();

/** Forgets every stored key. For tests and for a sign-out; never needed in normal use. */
export function clearCommandIntents(): void {
  INTENTS.clear();
}

export function useCommandFlow({ port, lane, capital, now = Date.now, holdReason }: UseCommandFlowOptions): CommandFlow {
  const [plan, setPlan] = useState<PlanState>({ status: "idle" });
  const [fields, setFields] = useState<ConfirmFields>(EMPTY_CONFIRM);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [requestKey, setRequestKey] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [querying, setQuerying] = useState(false);
  const [queried, setQueried] = useState<LookupView | null>(null);
  const [focus, setFocus] = useState<{ tick: number; target: "reason" | "plan" }>({ tick: 0, target: "plan" });
  const moveFocus = useCallback((target: "reason" | "plan") => setFocus((f) => ({ tick: f.tick + 1, target })), []);

  const planKey = useRef<string | null>(null);
  const lastSent = useRef<{ identity: string; key: string; payload: SubmitPayload } | null>(null);
  const attempt = useRef(0);
  const inFlight = useRef(false);
  const planFlight = useRef(false);
  const queryFlight = useRef(false);
  const mounted = useRef(true);
  const known = useRef<Set<string>>(new Set());
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const blockedReason = sendBlockedReason(port);
  const uncertain = isUncertain(receipt);
  const uncertainRef = useRef(uncertain);
  uncertainRef.current = uncertain;
  const settled = isSettled(receipt);

  const view = plan.status === "ready" ? plan.view : null;
  const expired = view !== null && planExpired(view, now());
  const validation = useMemo(() => (view === null ? { needs: [], reason: { state: "empty" as const, count: 0, hostile: [] }, wordMatches: false, payload: null } : validateConfirm(fields, view)), [fields, view]);
  const gate = submitGate({
    validation, plan: view, expired, submitting, settled, uncertain, blockedReason, held: holdReason,
  });

  const gateRef = useRef(gate);
  gateRef.current = gate;
  const payloadRef = useRef(validation.payload);
  payloadRef.current = validation.payload;
  const viewRef = useRef(view);
  viewRef.current = view;
  const nowRef = useRef(now);
  nowRef.current = now;
  const portRef = useRef(port);
  portRef.current = port;

  const readPlan = useCallback(() => {
    if (planFlight.current || uncertainRef.current) return;
    if (portRef.current.kind === "disabled") {
      setPlan({ status: "failed", load: { kind: "failed", tone: "unavailable", sentence: READ_DISABLED_REASON } });
      return;
    }
    planFlight.current = true;
    planKey.current ??= `command_plan:${mintKey().slice("command_apply:".length)}`;
    setPlan({ status: "loading" });
    let pending: Promise<unknown>;
    try {
      pending = Promise.resolve(portRef.current.plan({ lane, planKey: planKey.current }));
    } catch {
      pending = Promise.resolve({ kind: "no_response", why: "network" });
    }
    void pending.catch(() => ({ kind: "no_response", why: "network" })).then((raw) => {
      planFlight.current = false;
      if (!mounted.current) return;
      const answer = raw as Parameters<typeof classifyPlan>[1];
      const load = classifyPlan(lane, answer, capital);
      setPlan(load.kind === "ready" ? { status: "ready", view: load.view } : { status: "failed", load });
    });
  }, [lane, capital]);

  /** The one road to the port for a send, shared by a first send and a same-key retry. Never reached without an explicit click. */
  const send = useCallback(
    (identity: string, key: string, payload: SubmitPayload) => {
      inFlight.current = true;
      const mine = ++attempt.current;
      INTENTS.set(identity, { key, payload });
      lastSent.current = { identity, key, payload };
      setRequestKey(key);
      setAttempts((n) => n + 1);
      setSubmitting(true);
      let pending: Promise<unknown>;
      try {
        pending = Promise.resolve(
          portRef.current.submit({ lane: payload.lane, idempotencyKey: key, operationId: payload.operationId, digest: payload.digest, reason: payload.reason }),
        );
      } catch {
        pending = Promise.resolve({ kind: "no_response", why: "network" });
      }
      void pending.catch(() => ({ kind: "no_response", why: "network" })).then((raw) => {
        const answer = raw as Parameters<typeof classifySubmit>[0];
        const outcome = classifySubmit(answer, { operationId: payload.operationId, knownCommandIds: known.current });
        // A definite answer frees the key. UNKNOWN keeps it.
        if (!isUncertain(outcome) && INTENTS.get(identity)?.key === key) INTENTS.delete(identity);
        const id = receiptCommandId(outcome);
        if (id !== null) known.current.add(id);
        // After Discard, Reset or unmount, the answer belongs to nobody on screen.
        if (attempt.current !== mine || !mounted.current) return;
        inFlight.current = false;
        if (outcome.kind === "ACCESS_STOPPED") {
          // Access ended: the screen stops disclosing the plan, the typed reason and anything a lookup found.
          setPlan({ status: "failed", load: { kind: "failed", tone: "denied", sentence: "Your access to this command changed. Nothing is shown from the earlier plan or receipt." } });
          setFields(EMPTY_CONFIRM);
          setQueried(null);
        }
        setReceipt(outcome);
        setSubmitting(false);
      });
    },
    [],
  );

  const submit = useCallback(() => {
    // The explicit click is the only road to the port. Re-checked here so a stale render or a test cannot bypass the button.
    const payload = payloadRef.current;
    const current = viewRef.current;
    if (inFlight.current || !gateRef.current.open || payload === null || current === null) return;
    // The gate was computed at render; the clock moves on. A plan that expired since is not sent.
    if (planExpired(current, nowRef.current())) return;
    const identity = payloadIdentity(payload);
    setAttempts(0);
    send(identity, INTENTS.get(identity)?.key ?? mintKey(), payload);
  }, [send]);

  const retry = useCallback(() => {
    const sent = lastSent.current;
    if (inFlight.current || !uncertainRef.current || sent === null || portRef.current.kind === "disabled") return;
    // The stored payload, verbatim, under the stored key: never what the form says now.
    send(sent.identity, sent.key, sent.payload);
  }, [send]);

  const dismissRefusal = useCallback(() => {
    // A definite refusal created nothing: hide it and keep the fields as they were.
    setReceipt((r) => (isDismissible(r) ? null : r));
    moveFocus("reason");
  }, [moveFocus]);

  const discardUncertain = useCallback(() => {
    if (inFlight.current || !uncertainRef.current) return;
    const sent = lastSent.current;
    if (sent !== null) INTENTS.delete(sent.identity);
    lastSent.current = null;
    setRequestKey(null);
    setAttempts(0);
    setReceipt(null);
    moveFocus("reason");
  }, [moveFocus]);

  const reset = useCallback(() => {
    const sent = lastSent.current;
    if (sent !== null && !inFlight.current) INTENTS.delete(sent.identity);
    lastSent.current = null;
    attempt.current += 1;
    inFlight.current = false;
    planFlight.current = false;
    queryFlight.current = false;
    known.current = new Set();
    planKey.current = null;
    setSubmitting(false);
    setQuerying(false);
    setQueried(null);
    setRequestKey(null);
    setAttempts(0);
    setReceipt(null);
    setFields(EMPTY_CONFIRM);
    setPlan({ status: "idle" });
    moveFocus("plan");
  }, [moveFocus]);

  // The payload of an UNKNOWN send is not editable: its key belongs to exactly that payload.
  const setReason = useCallback((reason: string) => { if (!uncertainRef.current) setFields((f) => ({ ...f, reason })); }, []);
  const setConfirmWord = useCallback((confirmWord: string) => { if (!uncertainRef.current) setFields((f) => ({ ...f, confirmWord })); }, []);
  const setImpactAck = useCallback((impactAck: boolean) => { if (!uncertainRef.current) setFields((f) => ({ ...f, impactAck })); }, []);

  const commandId = receiptCommandId(receipt);
  const commandIdRef = useRef(commandId);
  commandIdRef.current = commandId;
  const queryIntent = useCallback(() => {
    const id = commandIdRef.current;
    if (id === null || queryFlight.current || portRef.current.kind === "disabled") return;
    queryFlight.current = true;
    const mine = attempt.current;
    setQuerying(true);
    let pending: Promise<unknown>;
    try {
      pending = Promise.resolve(portRef.current.lookup({ id }));
    } catch {
      pending = Promise.resolve({ kind: "no_response", why: "network" });
    }
    void pending.catch(() => ({ kind: "no_response", why: "network" })).then((raw) => {
      queryFlight.current = false;
      if (!mounted.current || attempt.current !== mine) return;
      const view = classifyLookup(raw as Parameters<typeof classifyLookup>[0]);
      if (view.kind === "command") known.current.add(view.status.commandId);
      setQueried(view);
      setQuerying(false);
    });
  }, []);

  const dirty = fields.reason.trim() !== "" || fields.confirmWord !== "" || fields.impactAck || receipt !== null || submitting;

  return {
    plan, readPlan, fields, setReason, setConfirmWord, setImpactAck, validation, gate, expired,
    submitting, receipt, requestKey, attempts, uncertain, settled, retry, discardUncertain, dismissRefusal, submit, reset,
    commandId, queryIntent, querying, queried, focus, dirty, blockedReason, portKind: port.kind,
  };
}
