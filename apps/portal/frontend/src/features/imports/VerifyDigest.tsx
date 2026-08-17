/**
 * On-demand artifact digest verification.
 *
 * Recomputes the artifact hash server-side and compares it to the digest the
 * registry holds. Read-only: it verifies, it does not promote or repair.
 *
 * The result is stated as a comparison of two digests rather than a verdict word.
 * "Matches" alone hides which side disagreed, and when they differ that is the
 * only thing worth knowing.
 *
 * Fetched only when asked, so opening a screen never triggers a hashing pass.
 */
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { api } from "../../lib/api";
import type { AlphaVerifyResult } from "../../portal/contracts";

function Result({ result }: { result: AlphaVerifyResult }) {
  return (
    <dl className="import-verify mono">
      <div>
        <dt>registered</dt>
        <dd>{result.registered_digest.slice(0, 23)}…</dd>
      </div>
      <div>
        <dt>computed</dt>
        <dd>{result.computed_digest.slice(0, 23)}…</dd>
      </div>
      <div>
        <dt>kết quả</dt>
        <dd style={{ color: result.matches ? "var(--state-available)" : "var(--state-denied)" }}>
          {result.matches ? "hai digest khớp" : "hai digest KHÁC nhau"}
        </dd>
      </div>
    </dl>
  );
}

export function VerifyDigest({ alphaId, version }: { alphaId: string; version: string }) {
  const [enabled, setEnabled] = useState(false);
  const verify = useQuery({
    queryKey: ["alpha-verify", alphaId, version],
    queryFn: () => api.verifyAlpha(alphaId, version),
    enabled,
    retry: false,
  });

  if (!enabled) {
    return (
      <button type="button" className="btn-ghost" onClick={() => setEnabled(true)}>
        Verify digest
      </button>
    );
  }
  if (verify.isLoading) {
    return <span className="mono text-[11px] text-ink-faint">đang verify…</span>;
  }
  if (verify.isError || !verify.data) {
    return (
      <span className="mono text-[11px]" style={{ color: "var(--state-unavailable)" }}>
        không verify được — alpha version có thể chưa nằm trong registry bất biến
      </span>
    );
  }
  return <Result result={verify.data} />;
}
