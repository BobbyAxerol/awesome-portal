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
  if (!draft.alphaId.trim()) return "Cần alpha_id.";
  if (!draft.version.trim()) return "Cần version.";
  if (!draft.artifactRelpath.trim()) return "Cần artifact_relpath trong ingest inbox.";
  if (draft.artifactRelpath.includes("..")) {
    // The server is path-traversal safe; saying so here is faster feedback, not
    // the security boundary.
    return "artifact_relpath không được chứa `..` — server chỉ đọc trong ingest inbox.";
  }
  if (!DIGEST_PATTERN.test(draft.expectedDigest.trim())) {
    return "expected_digest phải có dạng sha256:<64 hex>.";
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
          setDenied(error.message || "Không đủ quyền để import. Mutation là ADMIN-only ở gateway.");
          return;
        }
        setRejection({
          message: error instanceof Error ? error.message : "Import bị từ chối.",
          requestId: error instanceof PortalApiError ? error.requestId : null,
        });
      })
      .finally(() => setSubmitting(false));
  };

  return (
    <form className="import-form" onSubmit={submit} noValidate data-testid="import-request-form">
      <p className="field-hint">
        Artifact phải được CI hoặc owner đặt sẵn trong ingest inbox của server. Form này chỉ
        gửi <strong>con trỏ</strong> tới file đó cộng digest mong đợi — browser không gửi code
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
            hint="Đường dẫn tương đối trong ingest inbox của server."
            placeholder="delta-rsi/0.2.0/artifact.whl"
            value={draft.artifactRelpath}
            onChange={(value) => set("artifactRelpath", value)}
            error={
              draft.artifactRelpath.includes("..")
                ? "Không được chứa `..` — server chỉ đọc trong ingest inbox."
                : undefined
            }
          />
        </FieldSpan>
        <FieldSpan>
          <TextField
            label="expected_digest"
            hint="sha256:<64 hex> — server tự tính lại và so."
            placeholder="sha256:…"
            value={draft.expectedDigest}
            onChange={(value) => set("expectedDigest", value)}
            error={
              draft.expectedDigest && !DIGEST_PATTERN.test(draft.expectedDigest.trim())
                ? "Digest phải có dạng sha256:<64 hex>."
                : undefined
            }
          />
        </FieldSpan>
        <FieldSpan>
          <TextField
            label="git_ref"
            hint="Tùy chọn — commit đã review sinh ra artifact này."
            value={draft.gitRef}
            onChange={(value) => set("gitRef", value)}
          />
        </FieldSpan>
      </FieldGrid>

      {problem ? <Callout tone="muted">{problem}</Callout> : null}

      {denied ? (
        // Not a validation error: the input was fine, the authority was not.
        <Callout tone="danger" title="Không đủ quyền">
          {denied}
        </Callout>
      ) : null}

      {rejection ? (
        <Callout tone="danger" title="Import bị từ chối">
          <p>{rejection.message}</p>
          {rejection.requestId ? (
            <p className="mono field-hint">request_id {rejection.requestId}</p>
          ) : null}
        </Callout>
      ) : null}

      {accepted ? (
        <Callout tone="warning" title="Đã nhận vào quarantine">
          {/* "Accepted" is not "runnable": that distinction is the pipeline. */}
          <p>
            <span className="mono">{accepted.alpha_id}</span> v
            <span className="mono">{accepted.version}</span> — state{" "}
            <span className="mono">{accepted.state}</span>. Alpha vẫn chưa chạy được cho tới khi
            có slice certification.
          </p>
        </Callout>
      ) : null}

      <button
        type="submit"
        className="btn-primary"
        disabled={submitting || Boolean(problem)}
        title={problem ?? undefined}
      >
        {submitting ? "Đang gửi…" : "Gửi import request"}
      </button>
    </form>
  );
}
