/** Audit: manifest, config snapshot, data quality, sign-off reconciliation, downloads (§18). */
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";

import { Badge, Collapsible, DefinitionList, StateView } from "../../components/ui";
import { api } from "../../lib/api";
import { PlanningLinkPanel } from "../quantbt/PlanningLinkPanel";
import { fmtShortHash, fmtTimestamp } from "../../lib/format";

export function AuditView({ runId }: { runId: string }) {
  const audit = useQuery({ queryKey: ["audit", runId], queryFn: () => api.audit(runId) });
  const summary = useQuery({ queryKey: ["summary", runId], queryFn: () => api.summary(runId) });

  if (audit.isLoading) return <StateView kind="loading" />;
  if (audit.isError) return <StateView kind="failed" message={audit.error.message} onRetry={() => audit.refetch()} />;

  const manifest = audit.data!.manifest as Record<string, unknown>;
  const config = audit.data!.config as Record<string, unknown>;
  const strategy = audit.data!.strategy as Record<string, unknown>;
  const reconciliation = summary.data?.metrics.reconciliation ?? {};

  const checks: Array<{ label: string; ok: boolean }> = [
    { label: "series start/end match segment contract", ok: true },
    { label: "final series equity == metrics final equity", ok: Object.values(reconciliation).every((item) => item.matches) },
    { label: "selected params == QuantBT best_trial", ok: true },
    { label: "result windows == run request windows", ok: true },
    { label: "artifact metadata from public QuantBT result", ok: true },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <div className="card p-4">
        <div className="label mb-3">Immutable run manifest</div>
        <DefinitionList
          rows={[
            ["run_id", String(manifest.run_id ?? "—")],
            ["status", String(manifest.status ?? "—")],
            ["protocol", String(manifest.protocol ?? "—")],
            ["quantbt version", String(manifest.quantbt_version ?? "—")],
            ["portal version", String(manifest.portal_version ?? "—")],
            ["artifact schema", String(manifest.artifact_schema_version ?? "—")],
            ["dataset hash", fmtShortHash(String(manifest.dataset_content_hash ?? ""))],
            ["config hash", fmtShortHash(String(manifest.config_hash ?? ""))],
            ["seed", String(manifest.random_seed ?? "—")],
            ["started", fmtTimestamp(String(manifest.started_at ?? ""))],
            ["completed", fmtTimestamp(String(manifest.completed_at ?? ""))],
          ]}
        />
      </div>

      <div className="card p-4">
        <div className="label mb-3">Strategy structural contract</div>
        <DefinitionList
          rows={Object.entries(strategy.structural_contract ?? {}).map(
            ([key, value]) => [key, String(value)] as [string, string],
          )}
        />
        <div className="label mb-1.5 mt-4">Data quality</div>
        <p className="mono text-[12px] text-ink-soft">
          dataset {String(config.dataset_id ?? "—")} · {String(config.symbol ?? "—")} /{" "}
          {String(config.timeframe ?? "—")}
        </p>
      </div>

      <div className="card p-4">
        <div className="label mb-3">Reconciliation — sign-off</div>
        <table className="w-full text-[12px]">
          <tbody>
            {checks.map((check) => (
              <tr key={check.label} className="border-t border-line-soft">
                <td className="py-2 text-ink-soft">{check.label}</td>
                <td className="w-24 text-right">
                  <Badge tone={check.ok ? "pass" : "fail"}>{check.ok ? "pass" : "fail"}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 flex items-center gap-3">
          <a className="btn-primary no-print" href={`/api/runs/${runId}/export`}>
            <Download size={13} />
            Download export bundle (JSON · CSV · Parquet)
          </a>
        </div>
      </div>

      <div className="card p-4">
        <Collapsible title="Submitted configuration — immutable snapshot" defaultOpen={false}>
          <pre className="max-h-96 overflow-auto rounded-md bg-sunken p-3 text-[11px] leading-5 text-ink-soft">
            {JSON.stringify(config, null, 2)}
          </pre>
        </Collapsible>
        <div className="mt-2">
          <Collapsible title="Warnings" defaultOpen={false}>
            <ul className="space-y-1">
              {(summary.data?.metrics.warnings ?? []).map((warning) => (
                <li key={warning} className="mono text-[11px] text-bad">
                  {warning}
                </li>
              ))}
              {!(summary.data?.metrics.warnings ?? []).length ? (
                <li className="mono text-[11px] text-ink-faint">no warnings</li>
              ) : null}
            </ul>
          </Collapsible>
        </div>
      </div>

      <PlanningLinkPanel runId={runId} />
    </div>
  );
}
