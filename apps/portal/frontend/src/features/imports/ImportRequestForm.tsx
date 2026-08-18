/**
 * Import submit — source reference only (R11, strategy import contract §5).
 *
 * §5 forbids importing files directly from the browser, and the endpoint now
 * matches: the browser submits a *pointer* to an artifact that CI or the owner
 * already staged in the ingest inbox, plus the digest it must hash to. The
 * server reads that file and verifies. No code crosses this form, and the server
 * does not fetch an arbitrary URI, so there is no SSRF surface either.
 *
 * There is deliberately no file input here, and a test asserts that.
 *
 * Writes are ADMIN-only at the gateway. This form does not decide that — it
 * reports what the server answered. A 403 is presented as "not permitted" rather
 * than as a validation error, because the input was fine and the authority was
 * not.
 */
import { useState } from "react";

import { FieldGrid, FieldSpan, TextField } from "../../components/form";
import { Callout } from "../../components/surface";
import { PortalApiError, api } from "../../lib/api";
import type { AlphaImportRecord } from "../../portal/contracts";

/** A digest the server will compare against, so the shape is checked up front. */
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

interface Draft {
  alphaId: string;
  version: string;
  artifactRelpath: string;
  expectedDigest: string;
  gitRef: string;
}

const EMPTY: Draft = {
  alphaId: "",
  version: "",
  artifactRelpath: "",
  expectedDigest: "",
  gitRef: "",
};

/** Local checks only avoid a round-trip the server would certainly reject. */
function localProblem(draft: Draft): string | null {
  if (!draft.alphaId.trim()) return "alpha_id is required.";
  if (!draft.version.trim()) return "version is required.";
  if (!draft.artifactRelpath.trim()) return "artifact_relpath inside the ingest inbox is required.";
  if (draft.artifactRelpath.includes("..")) {
    // The server is path-traversal safe; saying so here is faster feedback, not
    // the security boundary.
    return "artifact_relpath may not contain `..` — the server reads only inside the ingest inbox.";
  }
  if (!DIGEST_PATTERN.test(draft.expectedDigest.trim())) {
    return "expected_digest must look like sha256:<64 hex>.";
  }
  return null;
}

export function ImportRequestForm({ onSubmitted }: { onSubmitted: () => void }) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [rejection, setRejection] = useState<{ message: string; requestId: string | null } | null>(
    null,
  );
  const [denied, setDenied] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<AlphaImportRecord | null>(null);

  const problem = localProblem(draft);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting || problem) return;
    setSubmitting(true);
    setRejection(null);
    setDenied(null);
    setAccepted(null);
    void api
      .importAlpha({
        alpha_id: draft.alphaId.trim(),
        version: draft.version.trim(),
        artifact_relpath: draft.artifactRelpath.trim(),
        expected_digest: draft.expectedDigest.trim(),
        git_ref: draft.gitRef.trim() || null,
      })
      .then((record) => {
        setAccepted(record);
        setDraft(EMPTY);
        onSubmitted();
      })
      .catch((error: unknown) => {
        if (error instanceof PortalApiError && error.isForbidden) {
          setDenied(error.message || "Not authorised to import — mutations are ADMIN-only at the gateway.");
          return;
        }
        setRejection({
          message: error instanceof Error ? error.message : "The import was rejected.",
          requestId: error instanceof PortalApiError ? error.requestId : null,
        });
      })
      .finally(() => setSubmitting(false));
  };

  return (
    <form className="import-form" onSubmit={submit} noValidate data-testid="import-request-form">
      <p className="field-hint">
        CI or an owner must stage the artifact in the server's ingest inbox first. This form sends only a
        <strong>pointer</strong> to that file plus the expected digest — the browser never carries code
        (contract §5).
      </p>

      <FieldGrid columns={2}>
        <TextField
          label="alpha_id"
          value={draft.alphaId}
          onChange={(value) => set("alphaId", value)}
        />
        <TextField
          label="version"
          value={draft.version}
          onChange={(value) => set("version", value)}
        />
        <FieldSpan>
          <TextField
            label="artifact_relpath"
            hint="Path relative to the server's ingest inbox."
            placeholder="delta-rsi/0.2.0/artifact.whl"
            value={draft.artifactRelpath}
            onChange={(value) => set("artifactRelpath", value)}
            error={
              draft.artifactRelpath.includes("..")
                ? "May not contain `..` — the server reads only inside the ingest inbox."
                : undefined
            }
          />
        </FieldSpan>
        <FieldSpan>
          <TextField
            label="expected_digest"
            hint="sha256:<64 hex> — the server recomputes it and compares."
            placeholder="sha256:…"
            value={draft.expectedDigest}
            onChange={(value) => set("expectedDigest", value)}
            error={
              draft.expectedDigest && !DIGEST_PATTERN.test(draft.expectedDigest.trim())
                ? "The digest must look like sha256:<64 hex>."
                : undefined
            }
          />
        </FieldSpan>
        <FieldSpan>
          <TextField
            label="git_ref"
            hint="Optional — the reviewed commit this artifact was built from."
            value={draft.gitRef}
            onChange={(value) => set("gitRef", value)}
          />
        </FieldSpan>
      </FieldGrid>

      {problem ? <Callout tone="muted">{problem}</Callout> : null}

      {denied ? (
        // Not a validation error: the input was fine, the authority was not.
        <Callout tone="danger" title="Not authorised">
          {denied}
        </Callout>
      ) : null}

      {rejection ? (
        <Callout tone="danger" title="Import rejected">
          <p>{rejection.message}</p>
          {rejection.requestId ? (
            <p className="mono field-hint">request_id {rejection.requestId}</p>
          ) : null}
        </Callout>
      ) : null}

      {accepted ? (
        <Callout tone="warning" title="Accepted into quarantine">
          {/* "Accepted" is not "runnable": that distinction is the pipeline. */}
          <p>
            <span className="mono">{accepted.alpha_id}</span> v
            <span className="mono">{accepted.version}</span> — state{" "}
            <span className="mono">{accepted.state}</span>. The alpha still cannot run until the
            certification slice lands.
          </p>
        </Callout>
      ) : null}

      <button
        type="submit"
        className="btn-primary"
        disabled={submitting || Boolean(problem)}
        title={problem ?? undefined}
      >
        {submitting ? "Submitting…" : "Submit import request"}
      </button>
    </form>
  );
}
