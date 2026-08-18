/**
 * Per-gate preflight results (R14).
 *
 * The Review step used to render three fixed `pass` badges — schema, boundaries,
 * content hash — regardless of what preflight actually returned. They asserted a
 * result nobody had checked, and when `valid` was false they still said pass.
 *
 * The response now names each gate, so this renders what the server reported and
 * nothing else. A gate the server did not mention is not shown as passing; it is
 * not shown at all, because we do not know it ran.
 */
import { Badge } from "../../components/ui";
import type { PreflightCheck } from "../../portal/contracts";

/** Human labels for the gates the backend publishes. */
const LABELS: Record<string, string> = {
  strategy: "Strategy",
  dataset: "Dataset",
  symbol: "Symbol",
  timeframe: "Timeframe",
  required_columns: "Required columns",
  parameter_space: "Parameter space",
};

function label(id: string): string {
  return LABELS[id] ?? id.replaceAll("_", " ");
}

export function PreflightChecks({ checks }: { checks: readonly PreflightCheck[] }) {
  if (checks.length === 0) {
    return (
      <p className="field-hint" data-testid="preflight-checks-absent">
        Preflight returned no list of checks, so the Portal infers nothing about which gates ran.
      </p>
    );
  }

  const failed = checks.filter((check) => !check.ok);

  return (
    <div className="preflight-checks" data-testid="preflight-checks">
      <div className="preflight-badges">
        {checks.map((check) => (
          <Badge key={check.id} tone={check.ok ? "pass" : "fail"}>
            {label(check.id)}
          </Badge>
        ))}
      </div>

      {failed.length > 0 ? (
        <dl className="preflight-failures" data-testid="preflight-failures">
          {failed.map((check) => (
            <div key={check.id} className="preflight-failure">
              <dt>{label(check.id)}</dt>
              <dd>
                {/* `missing` is the actionable part: the reader needs the names,
                  * not a count. */}
                {check.missing?.length ? (
                  <p>
                    Missing: <span className="mono">{check.missing.join(", ")}</span>
                  </p>
                ) : null}
                {check.detail ? <p className="preflight-detail">{check.detail}</p> : null}
                {!check.missing?.length && !check.detail ? (
                  <p className="preflight-detail">
                    The server reported this gate as failed without saying why.
                  </p>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
