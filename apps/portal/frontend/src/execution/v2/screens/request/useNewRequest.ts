/**
 * The state behind New request: the page and the drawer both use it, so the two cannot
 * drift apart on validation, on the request key, or on what a double click does.
 *
 * Request-key discipline (N29 section 2, kept from V1): a key is minted per submit INTENT, and an intent is a payload.
 * The key lives in a session-wide table keyed by the payload (so a drawer that was unmounted during the POST finds it
 * again) and is dropped only by a DEFINITE answer: created, replayed, duplicate or a refusal. While the last answer is
 * UNCERTAIN (network, timeout, 5xx, an unreadable 2xx) the payload is locked: the only ways on are a same-key retry,
 * which re-sends the stored payload verbatim, or a confirmed discard. A definite refusal leaves the form editable and a
 * new key allowed, because the server did not create it.
 *
 * Every send carries an attempt number. An answer that arrives after Discard (or after unmount) updates the key table
 * but never the screen, so a late answer cannot land on a fresh form.
 *
 * Double submit: `inFlight` is a ref, not state. React batches a double click's handlers before
 * state lands, so the second click must be refused synchronously. `submitting` (state) only drives
 * the screen.
 *
 * Never optimistic: nothing is shown as created until the port says `created` or `replayed`.
 * Nothing here runs on mount: no effect calls the port. Prefill from the URL fills fields and stops.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ApprovalCreateOutcome, ExecutionApi } from "../../../api/ports";
import { useRunSuggestions, type RunOption, type RunSuggestions } from "../../../runSuggestions";
import {
  alphaChoices,
  claimView,
  EMPTY_FIELDS,
  failureKind,
  payloadIdentity,
  readOutcome,
  runChoices,
  submitGate,
  validateFields,
  type AlphaChoice,
  type ClaimView,
  type Prefill,
  type RequestFields,
  type SubmitGate,
  type SubmitPayload,
  type Validation,
} from "./model";

export interface UseNewRequestOptions {
  api: ExecutionApi;
  /**
   * Why the delivery policy does not allow a governance write, or null when it does
   * (`governanceWriteBlocked(policy)` from `profile.ts`). Undefined means the caller did not say:
   * the port still refuses before any request is made, and that refusal is shown.
   */
  writeBlockedReason?: string | null;
  /** Ids a link already named. Read once. */
  prefill?: Prefill;
  /** Notices about values of the link that were not used. */
  prefillNotices?: readonly string[];
  /** Start reading the Run Library. The drawer passes false until it has been opened once. */
  runsEnabled?: boolean;
  /** Why the host holds Submit for now (the drawer's pending "Discard this request?" question), or null/undefined. */
  holdReason?: string | null;
}

export interface NewRequest {
  fields: RequestFields;
  setAlpha(id: string): void;
  setRun(id: string): void;
  setClaim(id: string): void;
  setSummary(text: string): void;
  /** Applies a prefill once, only if the reader has not touched the form. */
  seed(prefill: Prefill, notices?: readonly string[]): void;

  runs: RunSuggestions;
  alphas: readonly AlphaChoice[];
  runOptions: readonly RunOption[];
  claim: ClaimView;
  notices: readonly string[];

  validation: Validation;
  gate: SubmitGate;
  submitting: boolean;
  outcome: ApprovalCreateOutcome | null;
  /** The idempotency key of the last submit intent; shown in Provenance. Null before the first submit. */
  requestKey: string | null;
  /** Hides a duplicate or a refusal and returns to the form with the fields as they were. An uncertain outcome is not dismissible. */
  dismissOutcome(): void;
  /** The last answer is uncertain: the fields are locked and only `retry` or `discardUncertain` move on. */
  uncertain: boolean;
  /** Re-sends the stored payload of an uncertain send, verbatim, under the SAME key. No-op in any other state. */
  retry(): void;
  /** Forgets an uncertain send (its key included) and unlocks the form with the fields as they were. The caller shows the warning first. */
  discardUncertain(): void;
  /** created or replayed: the request is recorded and the form is done. */
  settled: boolean;
  /** The reader has typed or picked something, so closing would lose it. */
  dirty: boolean;
  submit(): void;
  /** Back to an empty form, a new intent and no outcome. A send still in flight keeps its key; its late answer is ignored by the screen. */
  reset(): void;
}

function mintKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

interface StoredIntent {
  key: string;
  /** What was sent, verbatim: a retry re-sends this object, not whatever the fields say now. */
  payload: SubmitPayload;
}

/**
 * Keys of sends by payload fingerprint, for the life of the page. A host that unmounts during the POST and mounts again
 * with the same payload finds the key here. Only a definite answer removes an entry.
 */
const INTENTS = new Map<string, StoredIntent>();

/** Forgets every stored key. For tests and for a sign-out; never needed in normal use. */
export function clearRequestIntents(): void {
  INTENTS.clear();
}

const NOT_SENT: ApprovalCreateOutcome = {
  kind: "failed",
  status: "unavailable",
  reason: "The request may not have reached the Portal. Retry sends the SAME request key, so a submit that did land is replayed, not duplicated.",
  offline: true,
};

function isUncertain(o: ApprovalCreateOutcome | null): boolean {
  return o !== null && o.kind === "failed" && failureKind(o) === "uncertain";
}

export function useNewRequest({ api, writeBlockedReason, prefill, prefillNotices, runsEnabled = true, holdReason }: UseNewRequestOptions): NewRequest {
  const [fields, setFields] = useState<RequestFields>(() => ({
    alphaId: prefill?.alphaId ?? "",
    runId: prefill?.runId ?? "",
    claimId: prefill?.claimId ?? "",
    summary: "",
  }));
  const [notices, setNotices] = useState<readonly string[]>(prefillNotices ?? []);
  const [outcome, setOutcome] = useState<ApprovalCreateOutcome | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [requestKey, setRequestKey] = useState<string | null>(null);
  const runs = useRunSuggestions(runsEnabled);

  /** The send the screen is showing: its identity, key and verbatim payload. */
  const lastSent = useRef<{ identity: string; key: string; payload: SubmitPayload } | null>(null);
  const attempt = useRef(0);
  /** The ids a link named: the form is "untouched" while it still equals them. */
  const baseline = useRef<Prefill>({ alphaId: prefill?.alphaId ?? "", runId: prefill?.runId ?? "", claimId: prefill?.claimId ?? "" });
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const seeded = useRef(prefill !== undefined);

  const settled = outcome !== null && (outcome.kind === "created" || outcome.kind === "replayed");

  const uncertain = isUncertain(outcome);
  const uncertainRef = useRef(uncertain);
  uncertainRef.current = uncertain;

  /** An edit ends a refusal or a duplicate answer (they were about the old content). An uncertain outcome never ends by an edit: the fields are locked while it stands. */
  const afterEdit = useCallback(() => {
    setOutcome((o) => (o !== null && (o.kind === "duplicate" || (o.kind === "failed" && !isUncertain(o))) ? null : o));
  }, []);

  const optionsRef = useRef<readonly RunOption[]>([]);
  optionsRef.current = runs.options;

  const setAlpha = useCallback(
    (alphaId: string) => {
      // The payload of an uncertain send is not editable: its key belongs to exactly that payload.
      if (uncertainRef.current) return;
      afterEdit();
      setFields((f) => {
        if (f.alphaId === alphaId) return f;
        // A listed run belongs to one alpha: changing the alpha drops a run (and its claim) that was picked for another one.
        // A run typed by hand is the reader's own pairing, and the server decides it.
        const listed = optionsRef.current.find((o) => o.runId === f.runId);
        return listed && listed.alphaId !== alphaId ? { ...f, alphaId, runId: "", claimId: "" } : { ...f, alphaId };
      });
    },
    [afterEdit],
  );
  const setRun = useCallback(
    (runId: string) => {
      // The payload of an uncertain send is not editable: its key belongs to exactly that payload.
      if (uncertainRef.current) return;
      afterEdit();
      setFields((f) => {
        if (f.runId === runId) return f;
        // A run picked from the list also names its alpha, so a pair that cannot go together is not left on screen.
        const listed = optionsRef.current.find((o) => o.runId === runId);
        return { ...f, runId, claimId: "", ...(listed ? { alphaId: listed.alphaId } : {}) };
      });
    },
    [afterEdit],
  );
  const setClaim = useCallback(
    (claimId: string) => {
      // The payload of an uncertain send is not editable: its key belongs to exactly that payload.
      if (uncertainRef.current) return;
      afterEdit();
      setFields((f) => ({ ...f, claimId }));
    },
    [afterEdit],
  );
  const setSummary = useCallback(
    (summary: string) => {
      // The payload of an uncertain send is not editable: its key belongs to exactly that payload.
      if (uncertainRef.current) return;
      afterEdit();
      setFields((f) => ({ ...f, summary }));
    },
    [afterEdit],
  );

  const options = runs.options;
  const alphas = useMemo(() => alphaChoices(options), [options]);
  const runOptions = useMemo(() => runChoices(options, fields.alphaId), [options, fields.alphaId]);
  const claim = useMemo(() => claimView(options, fields.runId), [options, fields.runId]);

  // One claim listed for the run is the only choice the server could accept: take it, as V1 did (derived, not an effect, so it
  // is right on the render the list arrives in). Several or none stay the reader's; a claim the reader typed always wins.
  const only = claim.kind === "only" ? claim.claim.id : null;
  const shown = useMemo<RequestFields>(() => (fields.claimId === "" && only !== null ? { ...fields, claimId: only } : fields), [fields, only]);

  const validation = useMemo(() => validateFields(shown), [shown]);
  const gate = submitGate({ validation, submitting, settled, writeBlockedReason, uncertain, held: holdReason });

  const seed = useCallback((p: Prefill, n: readonly string[] = []) => {
    if (seeded.current || uncertainRef.current) return;
    seeded.current = true;
    baseline.current = { alphaId: p.alphaId ?? "", runId: p.runId ?? "", claimId: p.claimId ?? "" };
    setNotices(n);
    setFields((f) => ({
      ...f,
      alphaId: f.alphaId || p.alphaId || "",
      runId: f.runId || p.runId || "",
      claimId: f.claimId || p.claimId || "",
    }));
  }, []);

  const gateRef = useRef(gate);
  gateRef.current = gate;
  const payloadRef = useRef(validation.payload);
  payloadRef.current = validation.payload;

  /** The one road to the port, shared by a first send and a same-key retry. Never reached without an explicit click. */
  const send = useCallback(
    (identity: string, key: string, payload: SubmitPayload) => {
      inFlight.current = true;
      const mine = ++attempt.current;
      INTENTS.set(identity, { key, payload });
      lastSent.current = { identity, key, payload };
      setRequestKey(key);
      setSubmitting(true);
      let pending: Promise<unknown>;
      try {
        pending = Promise.resolve(api.createApprovalRequest({ requestKey: key, ...payload }));
      } catch {
        pending = Promise.resolve(NOT_SENT);
      }
      void pending.catch(() => NOT_SENT).then((raw) => {
        const answer = readOutcome(raw);
        // A definite answer frees the key (the server either recorded the request or refused it). An uncertain one keeps it.
        if (!isUncertain(answer) && INTENTS.get(identity)?.key === key) INTENTS.delete(identity);
        // After Discard, or after unmount, the answer belongs to nobody on screen.
        if (attempt.current !== mine || !mounted.current) return;
        inFlight.current = false;
        setOutcome(answer);
        setSubmitting(false);
      });
    },
    [api],
  );

  const submit = useCallback(() => {
    // The explicit click is the only road to the port. Re-checked here so a stale render or a test cannot bypass the button.
    const payload = payloadRef.current;
    if (inFlight.current || !gateRef.current.open || payload === null) return;
    const identity = payloadIdentity(payload);
    send(identity, INTENTS.get(identity)?.key ?? mintKey(), payload);
  }, [send]);

  const retry = useCallback(() => {
    const sent = lastSent.current;
    if (inFlight.current || !uncertainRef.current || sent === null) return;
    // The stored payload, verbatim, under the stored key: never what the form says now.
    send(sent.identity, sent.key, sent.payload);
  }, [send]);

  const dismissOutcome = useCallback(() => {
    setOutcome((o) => (o !== null && (o.kind === "duplicate" || (o.kind === "failed" && !isUncertain(o))) ? null : o));
  }, []);

  const discardUncertain = useCallback(() => {
    if (inFlight.current || !uncertainRef.current) return;
    const sent = lastSent.current;
    if (sent !== null) INTENTS.delete(sent.identity);
    lastSent.current = null;
    setRequestKey(null);
    setOutcome(null);
  }, []);

  const reset = useCallback(() => {
    // A send still in flight keeps its key in INTENTS (it may land); anything else is forgotten here.
    const sent = lastSent.current;
    if (sent !== null && !inFlight.current) INTENTS.delete(sent.identity);
    lastSent.current = null;
    attempt.current += 1;
    inFlight.current = false;
    setSubmitting(false);
    baseline.current = { alphaId: "", runId: "", claimId: "" };
    // A fresh form may be seeded again by the next opening of the drawer.
    seeded.current = false;
    setRequestKey(null);
    setOutcome(null);
    setFields(EMPTY_FIELDS);
    setNotices([]);
  }, []);

  const b = baseline.current;
  const dirty = fields.summary.trim() !== "" || fields.alphaId !== (b.alphaId ?? "") || fields.runId !== (b.runId ?? "") || fields.claimId !== (b.claimId ?? "");

  return {
    fields: shown, setAlpha, setRun, setClaim, setSummary, seed,
    runs, alphas, runOptions, claim, notices,
    validation, gate, submitting, outcome, requestKey, dismissOutcome, uncertain, retry, discardUncertain, settled, dirty, submit, reset,
  };
}
