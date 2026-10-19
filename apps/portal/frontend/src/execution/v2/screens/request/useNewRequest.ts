/**
 * The state behind New request: the page and the drawer both use it, so the two cannot
 * drift apart on validation, on the request key, or on what a double click does.
 *
 * Request-key discipline (N29 section 2, kept from V1): a key is minted per submit INTENT.
 * It survives only to retry the SAME payload (a lost answer replays by key, so it never creates
 * two requests); change any field and the next submit is a new intent with a new key.
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
  /** created or replayed: the request is recorded and the form is done. */
  settled: boolean;
  /** The reader has typed or picked something, so closing would lose it. */
  dirty: boolean;
  submit(): void;
  /** Back to an empty form, a new intent and no outcome. */
  reset(): void;
}

function mintKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

const NOT_SENT: ApprovalCreateOutcome = {
  kind: "failed",
  status: "unavailable",
  reason: "The request may not have reached the Portal. Retry sends the SAME request key, so a submit that did land is replayed, not duplicated.",
  offline: true,
};

export function useNewRequest({ api, writeBlockedReason, prefill, prefillNotices, runsEnabled = true }: UseNewRequestOptions): NewRequest {
  const [fields, setFields] = useState<RequestFields>(() => ({
    alphaId: prefill?.alphaId ?? "",
    runId: prefill?.runId ?? "",
    claimId: prefill?.claimId ?? "",
    summary: "",
  }));
  const [touched, setTouched] = useState(false);
  const [notices, setNotices] = useState<readonly string[]>(prefillNotices ?? []);
  const [outcome, setOutcome] = useState<ApprovalCreateOutcome | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [requestKey, setRequestKey] = useState<string | null>(null);
  const runs = useRunSuggestions(runsEnabled);

  const intent = useRef<{ identity: string; key: string } | null>(null);
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

  /** An edit ends a refusal or a duplicate answer (they were about the old content). An uncertain outcome stays until it is settled. */
  const afterEdit = useCallback(() => {
    setTouched(true);
    setOutcome((o) => (o !== null && (o.kind === "duplicate" || (o.kind === "failed" && o.offline !== true)) ? null : o));
  }, []);

  const optionsRef = useRef<readonly RunOption[]>([]);
  optionsRef.current = runs.options;

  const setAlpha = useCallback(
    (alphaId: string) => {
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
      afterEdit();
      setFields((f) => ({ ...f, claimId }));
    },
    [afterEdit],
  );
  const setSummary = useCallback(
    (summary: string) => {
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
  const gate = submitGate({ validation, submitting, settled, writeBlockedReason });

  const seed = useCallback((p: Prefill, n: readonly string[] = []) => {
    if (seeded.current) return;
    seeded.current = true;
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

  const submit = useCallback(() => {
    // The explicit click is the only road to the port. Re-checked here so Enter in a field, a stale render or a test cannot bypass the button.
    const payload = payloadRef.current;
    if (inFlight.current || !gateRef.current.open || payload === null) return;
    inFlight.current = true;
    const identity = payloadIdentity(payload);
    if (!intent.current || intent.current.identity !== identity) intent.current = { identity, key: mintKey() };
    const key = intent.current.key;
    setRequestKey(key);
    setSubmitting(true);
    let pending: Promise<unknown>;
    try {
      pending = Promise.resolve(api.createApprovalRequest({ requestKey: key, ...payload }));
    } catch {
      pending = Promise.resolve(NOT_SENT);
    }
    void pending.catch(() => NOT_SENT).then((raw) => {
      inFlight.current = false;
      if (!mounted.current) return;
      setOutcome(readOutcome(raw));
      setSubmitting(false);
    });
  }, [api]);

  const dismissOutcome = useCallback(() => {
    setOutcome((o) => (o !== null && (o.kind === "duplicate" || (o.kind === "failed" && o.offline !== true)) ? null : o));
  }, []);

  const reset = useCallback(() => {
    intent.current = null;
    // A fresh form may be seeded again by the next opening of the drawer.
    seeded.current = false;
    setRequestKey(null);
    setOutcome(null);
    setFields(EMPTY_FIELDS);
    setTouched(false);
    setNotices([]);
  }, []);

  const dirty = touched || fields.summary.trim() !== "";

  return {
    fields: shown, setAlpha, setRun, setClaim, setSummary, seed,
    runs, alphas, runOptions, claim, notices,
    validation, gate, submitting, outcome, requestKey, dismissOutcome, settled, dirty, submit, reset,
  };
}
