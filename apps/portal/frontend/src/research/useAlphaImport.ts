/**
 * Screen 14 container state (P07).
 *
 * Holds the wizard's five operations and the one rule that makes the receipts
 * mean anything: **a receipt belongs to exact bytes**. Editing the source, or
 * being told the receipt expired, drops everything downstream of it. Nothing
 * here retries automatically — a refusal is an answer, and re-sending the same
 * request cannot turn a `FAIL` into a `PASS`.
 *
 * Deliberately not react-query: these are four sequenced writes plus one read,
 * and a cache keyed by anything other than the source digest would be the very
 * bug this file exists to prevent.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  type ActivationResponse,
  type GatesResponse,
  type ImportRefusal,
  type RegistrationResponse,
  type RegistryEntry,
  type SourceResponse,
  alphaImportApi,
  toRefusal,
} from "./alphaImportClient";
import { awaitingStep } from "./AlphaImport";
import { researchState, type ResearchState } from "./state";

const IDLE = {
  parse: awaitingStep("Nothing parsed yet."),
  gates: awaitingStep("Parse a source first."),
  register: awaitingStep("Run gates first."),
} as const;

export type Step = "parse" | "gates" | "register" | "activate";

export interface AlphaImportController {
  sourceText: string;
  fileName: string | null;
  multiFileRejected: boolean;
  onSourceChange: (text: string, fileName: string | null) => void;
  onMultiFileRejected: () => void;

  parse: SourceResponse | null;
  gates: GatesResponse | null;
  registration: RegistrationResponse | null;
  activation: ActivationResponse | null;
  registry: readonly RegistryEntry[];
  /** `total` the server published for the list it served; null until a list returns. */
  registryTotal?: number | null;
  /** The `alpha_id` the served list was requested with ("" = unfiltered). */
  registryAlpha?: string;
  registryShowAll?: boolean;
  onToggleRegistryShowAll?: () => void;
  /** The server's opaque `next_cursor` (null = list complete). Sent back as served, never parsed. */
  registryNext?: string | null;
  /** State of the "load more" read; the rows already loaded stay whatever it answers. */
  registryMore?: "idle" | "loading" | "failed";
  onLoadMoreRegistry?: () => void;

  parseState: ResearchState;
  gatesState: ResearchState;
  registerState: ResearchState;
  registryState: ResearchState;
  /** Read the registry again (the way back from a failed read). */
  onRetryRegistry: () => void;
  activationPending: boolean;

  refusal: ImportRefusal | null;
  /** The one step the outstanding refusal belongs to; that step's panel prints it, nothing else does. */
  refusalStep?: Step | null;

  alphaId: string;
  onAlphaIdChange: (value: string) => void;

  onParse: () => void;
  onRunGates: () => void;
  onRegister: () => void;
  onActivate: () => void;
  onActivateEntry: (entry: RegistryEntry) => void;
  activationAttemptId: string | null;
  activationAdmitted: boolean;
  /** The step whose request is in flight; every write button is inert meanwhile. */
  busyStep: Step | null;
  /** A refusal of the activate request, shown beside the button that caused it. */
  activationRefusal: ImportRefusal | null;
}

const ALPHA_ID_PATTERN = /^[a-z][a-z0-9-]{2,63}$/;

export function useAlphaImport(workspaceId?: string, initialAlphaId = ""): AlphaImportController {
  const [sourceText, setSourceText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [multiFileRejected, setMultiFileRejected] = useState(false);
  const [alphaId, setAlphaId] = useState(initialAlphaId);

  const [parse, setParse] = useState<SourceResponse | null>(null);
  const [gates, setGates] = useState<GatesResponse | null>(null);
  const [registration, setRegistration] = useState<RegistrationResponse | null>(null);
  const [activation, setActivation] = useState<ActivationResponse | null>(null);
  const [activationAttemptId, setActivationAttemptId] = useState<string | null>(null);
  const [registry, setRegistry] = useState<readonly RegistryEntry[]>([]);
  const [registryTotal, setRegistryTotal] = useState<number | null>(null);
  const [registryAlpha, setRegistryAlpha] = useState("");
  const [registryNext, setRegistryNext] = useState<string | null>(null);
  const [registryMore, setRegistryMore] = useState<"idle" | "loading" | "failed">("idle");
  /* A list read that is no longer the latest (new filter, reload) must not append to the new list. */
  const registryEpoch = useRef(0);
  /* The server filters by alpha_id. The field is sent only once it is a whole,
     valid id and the typist has paused, so a half-typed id is never a request. */
  const [registryFilter, setRegistryFilter] = useState("");
  /* QA2 U11: the typed id narrows the list; one control lifts it so a new id never hides the registry. */
  const [registryShowAll, setRegistryShowAll] = useState(false);

  const [pending, setPending] = useState<Step | null>(null);
  const [refusal, setRefusal] = useState<ImportRefusal | null>(null);
  const [registryState, setRegistryState] = useState<ResearchState>(
    researchState({ kind: "in-flight", hasAcceptedResponse: false }),
  );

  /* Registry and registration are the only server responses permitted to tell
     this container whether the caller may activate. A 403 on the write path is
     not something to discover by offering the button and watching it fail. */
  const loadRegistry = useCallback(() => {
    const requested = registryFilter;
    const epoch = ++registryEpoch.current;
    alphaImportApi
      .registry(workspaceId, requested || undefined)
      .then((response) => {
        if (epoch !== registryEpoch.current) return;
        setRegistry(response.entries);
        setRegistryAlpha(requested);
        setRegistryNext(response.next_cursor ?? null);
        setRegistryMore("idle");
        setRegistryTotal(typeof response.total === "number" ? response.total : null);
        setRegistryState(researchState({ kind: "ok", rowCount: response.entries.length }));
      })
      .catch((error: unknown) => {
        if (epoch !== registryEpoch.current) return;
        const next = toRefusal(error);
        setRegistryState({
          state: next.state,
          reason: next.message,
          mayRetry: next.mayRetry,
          retainsContent: false,
        });
      });
  }, [registryFilter, workspaceId]);

  useEffect(loadRegistry, [loadRegistry]);

  /* S14: the next page of the same list, by the server's opaque cursor. Rows append; a failed
     page keeps what is loaded and offers the same button again. */
  const onLoadMoreRegistry = useCallback(() => {
    if (registryNext === null || registryMore === "loading") return;
    const epoch = registryEpoch.current;
    setRegistryMore("loading");
    alphaImportApi
      .registry(workspaceId, registryAlpha || undefined, registryNext)
      .then((response) => {
        if (epoch !== registryEpoch.current) return;
        setRegistry((current) => {
          const seen = new Set(current.map((entry) => entry.alpha_version_id));
          return [...current, ...response.entries.filter((entry) => !seen.has(entry.alpha_version_id))];
        });
        setRegistryNext(response.next_cursor ?? null);
        setRegistryTotal(typeof response.total === "number" ? response.total : null);
        setRegistryMore("idle");
      })
      .catch(() => {
        if (epoch !== registryEpoch.current) return;
        setRegistryMore("failed");
      });
  }, [registryAlpha, registryMore, registryNext, workspaceId]);

  useEffect(() => {
    const typed = alphaId.trim();
    const next = !registryShowAll && ALPHA_ID_PATTERN.test(typed) ? typed : "";
    if (next === registryFilter) return;
    const timer = setTimeout(() => setRegistryFilter(next), 250);
    return () => clearTimeout(timer);
  }, [alphaId, registryFilter, registryShowAll]);

  /** Everything the current bytes produced. Dropped whenever the bytes change. */
  const dropReceipts = useCallback(() => {
    setParse(null);
    setGates(null);
    setRegistration(null);
    setActivation(null);
    setActivationAttemptId(null);
    setRefusal(null);
  }, []);

  const onSourceChange = useCallback(
    (text: string, name: string | null) => {
      setSourceText(text);
      setFileName(name);
      setMultiFileRejected(false);
      dropReceipts();
    },
    [dropReceipts],
  );

  const fail = useCallback((error: unknown) => {
    const next = toRefusal(error);
    setRefusal(next);
    /* An expired or unknown receipt cannot be reused; force a fresh parse
       rather than letting the next step send a reference we know is dead. */
    if (next.invalidatesSource) {
      setParse(null);
      setGates(null);
    }
    setPending(null);
  }, []);

  const onParse = useCallback(() => {
    if (pending !== null || sourceText.trim().length === 0) return;
    setPending("parse");
    setRefusal(null);
    setGates(null);
    setRegistration(null);
    setActivation(null);
    alphaImportApi
      .parse({
        workspace_id: workspaceId,
        original_filename: fileName ?? "alpha.py",
        source_text: sourceText,
      })
      .then((response) => {
        setParse(response);
        setPending(null);
      })
      .catch(fail);
  }, [fail, fileName, pending, sourceText, workspaceId]);

  const onRunGates = useCallback(() => {
    if (pending !== null || !parse?.parse_ok) return;
    setPending("gates");
    setRefusal(null);
    setRegistration(null);
    setActivation(null);
    alphaImportApi
      .gates({ workspace_id: workspaceId, source_file_ref: parse.source_file_ref })
      .then((response) => {
        setGates(response);
        setPending(null);
      })
      .catch(fail);
  }, [fail, parse, pending, workspaceId]);

  const onRegister = useCallback(() => {
    if (pending !== null || !parse || !gates?.all_pass || alphaId.trim().length === 0 || !ALPHA_ID_PATTERN.test(alphaId.trim())) return;
    setPending("register");
    setRefusal(null);
    alphaImportApi
      .register({
        workspace_id: workspaceId,
        source_file_ref: parse.source_file_ref,
        alpha_id: alphaId.trim(),
        gate_receipt_id: gates.gate_receipt_id,
      })
      .then((response) => {
        setRegistration(response);
        setPending(null);
        loadRegistry();
      })
      .catch(fail);
  }, [alphaId, fail, gates, loadRegistry, parse, pending, workspaceId]);

  const onActivate = useCallback(() => {
    if (pending !== null || !registration) return;
    setPending("activate");
    setActivationAttemptId(registration.alpha_version_id);
    setRefusal(null);
    alphaImportApi
      .activate(registration.alpha_version_id, {
        workspace_id: workspaceId,
        /* Compare-and-set against the revision we were handed, so an
           activation raced by another actor is refused, not silently applied. */
        expected_alpha_revision: registration.alpha_revision,
      })
      .then((response) => {
        setActivation(response);
        setPending(null);
        loadRegistry();
      })
      .catch(fail);
  }, [fail, loadRegistry, pending, registration, workspaceId]);

  const onActivateEntry = useCallback((entry: RegistryEntry) => {
    if (pending !== null || entry.lifecycle_state !== "DRAFT" || !entry.may_activate) return;
    setPending("activate");
    setActivationAttemptId(entry.alpha_version_id);
    setRefusal(null);
    alphaImportApi.activate(entry.alpha_version_id, {
      workspace_id: workspaceId,
      expected_alpha_revision: entry.alpha_revision,
    }).then((response) => {
      if (registration?.alpha_version_id === entry.alpha_version_id) setActivation(response);
      setPending(null);
      loadRegistry();
    }).catch(fail);
  }, [fail, loadRegistry, pending, registration, workspaceId]);

  /* Which step the outstanding refusal belongs to. Attaching it to every panel
     would claim three failures where one happened. */
  const lastAttempted: Step | null = refusal
    ? activationAttemptId ? "activate" : registration
      ? "activate"
      : gates
        ? "register"
        : parse
          ? "gates"
          : "parse"
    : null;

  function stepState(step: Step, done: boolean, idle: ResearchState): ResearchState {
    if (pending === step) {
      return researchState({ kind: "in-flight", hasAcceptedResponse: false });
    }
    if (refusal && pending === null && lastAttempted === step) {
      return {
        state: refusal.state,
        reason: refusal.message,
        mayRetry: refusal.mayRetry,
        retainsContent: false,
      };
    }
    if (done) return researchState({ kind: "ok", rowCount: 1 });
    return idle;
  }

  return {
    sourceText,
    fileName,
    multiFileRejected,
    onSourceChange,
    onMultiFileRejected: () => setMultiFileRejected(true),

    parse,
    gates,
    registration,
    activation,
    registry,
    registryTotal,
    registryAlpha,
    registryShowAll,
    onToggleRegistryShowAll: () => setRegistryShowAll((current) => !current),
    registryNext,
    registryMore,
    onLoadMoreRegistry,

    parseState: stepState("parse", parse !== null, IDLE.parse),
    gatesState: stepState("gates", gates !== null, IDLE.gates),
    registerState: stepState("register", registration !== null, IDLE.register),
    registryState,
    onRetryRegistry: () => {
      setRegistryState(researchState({ kind: "in-flight", hasAcceptedResponse: false }));
      loadRegistry();
    },
    activationPending: pending === "activate",

    refusal,
    refusalStep: pending === null ? lastAttempted : null,

    alphaId,
    onAlphaIdChange: setAlphaId,

    onParse,
    onRunGates,
    onRegister,
    onActivate,
    onActivateEntry,
    activationAttemptId,
    /* The generated RegistrationResponse is the only authority for this
       affordance; never infer it from a browser-held role or lifecycle. */
    activationAdmitted: registration?.may_activate === true,
    busyStep: pending,
    activationRefusal: lastAttempted === "activate" && pending === null ? refusal : null,
  };
}
