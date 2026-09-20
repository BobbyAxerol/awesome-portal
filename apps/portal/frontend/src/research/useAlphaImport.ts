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

import { useCallback, useEffect, useState } from "react";

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
  parse: awaitingStep("No source has been parsed yet."),
  gates: awaitingStep("Gates run once a source parses."),
  register: awaitingStep("Registration opens once all seven gates pass."),
} as const;

type Step = "parse" | "gates" | "register" | "activate";

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

  parseState: ResearchState;
  gatesState: ResearchState;
  registerState: ResearchState;
  registryState: ResearchState;
  activationPending: boolean;

  refusal: ImportRefusal | null;

  alphaId: string;
  onAlphaIdChange: (value: string) => void;

  onParse: () => void;
  onRunGates: () => void;
  onRegister: () => void;
  onActivate: () => void;
  activationAdmitted: boolean;
}

export function useAlphaImport(workspaceId?: string): AlphaImportController {
  const [sourceText, setSourceText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [multiFileRejected, setMultiFileRejected] = useState(false);
  const [alphaId, setAlphaId] = useState("");

  const [parse, setParse] = useState<SourceResponse | null>(null);
  const [gates, setGates] = useState<GatesResponse | null>(null);
  const [registration, setRegistration] = useState<RegistrationResponse | null>(null);
  const [activation, setActivation] = useState<ActivationResponse | null>(null);
  const [registry, setRegistry] = useState<readonly RegistryEntry[]>([]);

  const [pending, setPending] = useState<Step | null>(null);
  const [refusal, setRefusal] = useState<ImportRefusal | null>(null);
  const [registryState, setRegistryState] = useState<ResearchState>(
    researchState({ kind: "in-flight", hasAcceptedResponse: false }),
  );

  /* The registry read is the only GET, and it is the only thing allowed to
     tell us whether this actor may activate: a 403 on the write path is not
     something to discover by offering the button and watching it fail. */
  const loadRegistry = useCallback(() => {
    alphaImportApi
      .registry(workspaceId)
      .then((response) => {
        setRegistry(response.entries);
        setRegistryState(researchState({ kind: "ok", rowCount: response.entries.length }));
      })
      .catch((error: unknown) => {
        const next = toRefusal(error);
        setRegistryState({
          state: next.state,
          reason: next.message,
          mayRetry: next.mayRetry,
          retainsContent: false,
        });
      });
  }, [workspaceId]);

  useEffect(loadRegistry, [loadRegistry]);

  /** Everything the current bytes produced. Dropped whenever the bytes change. */
  const dropReceipts = useCallback(() => {
    setParse(null);
    setGates(null);
    setRegistration(null);
    setActivation(null);
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
    if (sourceText.trim().length === 0) return;
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
  }, [fail, fileName, sourceText, workspaceId]);

  const onRunGates = useCallback(() => {
    if (!parse?.parse_ok) return;
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
  }, [fail, parse, workspaceId]);

  const onRegister = useCallback(() => {
    if (!parse || !gates?.all_pass || alphaId.trim().length === 0) return;
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
  }, [alphaId, fail, gates, loadRegistry, parse, workspaceId]);

  const onActivate = useCallback(() => {
    if (!registration) return;
    setPending("activate");
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
  }, [fail, loadRegistry, registration, workspaceId]);

  /* Which step the outstanding refusal belongs to. Attaching it to every panel
     would claim three failures where one happened. */
  const lastAttempted: Step | null = refusal
    ? registration
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

    parseState: stepState("parse", parse !== null, IDLE.parse),
    gatesState: stepState("gates", gates !== null, IDLE.gates),
    registerState: stepState("register", registration !== null, IDLE.register),
    registryState,
    activationPending: pending === "activate",

    refusal,

    alphaId,
    onAlphaIdChange: setAlphaId,

    onParse,
    onRunGates,
    onRegister,
    onActivate,
    /* No published field says whether this actor may activate, so the control
       is withheld rather than offered optimistically. See `CG-P07-01` below. */
    activationAdmitted: false,
  };
}

/**
 * `CG-P07-01` — contract gap, backend request open.
 *
 * `POST /{alpha_version_id}/activate` exists and can answer
 * `RESEARCH_ALPHA_IMPORT_ACTIVATION_FORBIDDEN`, but nothing the browser may
 * read says in advance whether *this* actor may activate: `RegistryEntry`
 * carries the object's lifecycle, not the caller's rights over it. P05 settled
 * the precedent — `mayExport()` requires the server's own admission, because a
 * control that exists only to be refused teaches the reader that controls
 * lie.
 *
 * So the activation control is withheld here, and steps 1–3 close without it.
 * The fix is one boolean on the registration/registry DTO (`may_activate`),
 * not a client-side guess at a role.
 */
export const CG_P07_01_ACTIVATION_ADMISSION_UNPUBLISHED = true;
