/**
 * Strategy picker — New Run step 1.
 *
 * Lists built-in strategies and imported alphas from the two projections the
 * import contract names (§1). Nothing is hard-coded: if the backend registers
 * another strategy or publishes another alpha, it appears here with no
 * frontend change.
 *
 * A strategy that cannot be run is still listed, with the specific reason —
 * quarantine, not registered in the runtime registry, or an endpoint the
 * installed engine release has not certified (§4).
 */
import { Check, PackageOpen, Puzzle } from "lucide-react";

import { AvailabilityBadge } from "../../components/semantic";
import { Callout } from "../../components/surface";
import { Collapsible, StateView } from "../../components/ui";
import type { CatalogEntry, StrategyOrigin } from "../../portal/strategyCatalog";

function OriginBadge({ origin }: { origin: StrategyOrigin }) {
  const builtin = origin === "builtin";
  return (
    <span className="badge-maturity" style={{ color: "var(--ink-faint)", borderColor: "var(--line)" }}>
      {builtin ? "BUILT-IN" : "IMPORTED"}
    </span>
  );
}

function EntryRow({
  entry,
  selected,
  onSelect,
}: {
  entry: CatalogEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  const blocked = entry.blockedReason !== null;
  const Icon = entry.origin === "builtin" ? Puzzle : PackageOpen;

  return (
    <li>
      <button
        type="button"
        className={`strategy-row${selected ? " strategy-row-selected" : ""}`}
        onClick={onSelect}
        disabled={blocked}
        title={entry.blockedReason ?? undefined}
        aria-pressed={selected}
        data-blocked={blocked}
        data-strategy-id={entry.strategyId}
      >
        <Icon size={15} aria-hidden="true" className="shrink-0" />
        <span className="strategy-row-main">
          <span className="strategy-row-title">
            {entry.displayName}
            {selected ? <Check size={13} aria-hidden="true" /> : null}
          </span>
          <span className="strategy-row-id mono">
            {entry.strategyId} · v{entry.version}
          </span>
        </span>
        <span className="strategy-row-meta">
          <OriginBadge origin={entry.origin} />
          {entry.family ? <span className="chip">{entry.family}</span> : null}
          {entry.certification ? <span className="chip">{entry.certification}</span> : null}
          {blocked ? <AvailabilityBadge state="unavailable" detail={entry.blockedReason} compact /> : null}
        </span>
      </button>
      {blocked ? <p className="strategy-row-reason mono">{entry.blockedReason}</p> : null}
    </li>
  );
}

export function StrategyPicker({
  entries,
  selectedId,
  onSelect,
  isLoading,
  isError,
  onRetry,
}: {
  entries: CatalogEntry[];
  selectedId: string | null;
  onSelect: (entry: CatalogEntry) => void;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  if (isLoading) return <StateView kind="loading" message="Đang tải danh mục strategy…" />;
  if (isError) {
    return (
      <StateView
        kind="failed"
        message="Không đọc được danh mục strategy. Không hiển thị strategy suy đoán."
        onRetry={onRetry}
      />
    );
  }
  if (entries.length === 0) {
    return (
      <StateView
        kind="empty"
        message="Registry chưa công bố strategy nào — chưa có gì để chạy."
      />
    );
  }

  const builtin = entries.filter((entry) => entry.origin === "builtin");
  const imported = entries.filter((entry) => entry.origin === "imported");

  return (
    <div className="space-y-4">
      <section>
        <h3 className="subsection-title mb-2">Built-in ({builtin.length})</h3>
        {builtin.length === 0 ? (
          <p className="field-hint">Không có strategy built-in nào trong registry hiện tại.</p>
        ) : (
          <ul className="strategy-list">
            {builtin.map((entry) => (
              <EntryRow
                key={entry.strategyId}
                entry={entry}
                selected={entry.strategyId === selectedId}
                onSelect={() => onSelect(entry)}
              />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="subsection-title mb-2">Imported alpha ({imported.length})</h3>
        {imported.length === 0 ? (
          <Callout tone="muted">
            Chưa có alpha nào được import. Import Wizard thuộc slice U14 — cho tới lúc đó, alpha
            được đăng ký qua pipeline review ở backend, không upload từ trình duyệt.
          </Callout>
        ) : (
          <ul className="strategy-list">
            {imported.map((entry) => (
              <EntryRow
                key={entry.strategyId}
                entry={entry}
                selected={entry.strategyId === selectedId}
                onSelect={() => onSelect(entry)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Contract detail for the strategy currently selected. */
/**
 * The selected strategy's contract, in two tiers.
 *
 * All of it used to be one twelve-row list open at step 1 — entrypoint, artifact
 * digest and lifecycle stage competing for attention with the three facts a reader
 * actually needs before choosing a dataset. Nothing is dropped; the identity and
 * audit rows move behind a disclosure, so the panel answers "can I run this on my
 * data?" first and "what exactly is it?" on request.
 */
export function StrategyDetail({ entry }: { entry: CatalogEntry | null }) {
  if (!entry) {
    return <p className="field-hint">Chọn một strategy để xem contract của nó.</p>;
  }
  const manifest = entry.manifest;
  const detail: [string, string][] = [
    ["Strategy ID", entry.strategyId],
    ["Version", entry.version],
  ];
  if (entry.warmupBars !== null) detail.push(["Warmup bars", String(entry.warmupBars)]);
  if (entry.supportedEndpointIds.length)
    detail.push(["Endpoint khai báo", entry.supportedEndpointIds.join(", ")]);
  if (manifest?.entrypoint) detail.push(["Entrypoint", manifest.entrypoint]);
  if (manifest?.artifactDigest)
    detail.push(["Artifact digest", `${manifest.artifactDigest.slice(0, 23)}…`]);
  if (entry.lifecycleStage) detail.push(["Lifecycle", entry.lifecycleStage]);

  return (
    <>
      {/* Tier 1: what decides whether this strategy can run on the reader's data. */}
      <dl className="portal-details">
        <div className="portal-detail-row">
          <dt className="label">Nguồn</dt>
          <dd className="mono">
            {entry.origin === "builtin" ? "built-in registry" : "imported alpha"} · v{entry.version}
          </dd>
        </div>
        <div className="portal-detail-row">
          <dt className="label">Cột bắt buộc</dt>
          <dd className="mono">{entry.requiredColumns.join(", ") || "—"}</dd>
        </div>
        <div className="portal-detail-row">
          <dt className="label">Timeframe</dt>
          <dd className="mono">
            {entry.defaultTimeframe ?? "—"}
            {entry.timeframes.length ? (
              <span className="field-hint"> · hỗ trợ {entry.timeframes.join(", ")}</span>
            ) : null}
          </dd>
        </div>
      </dl>

      {/* Tier 2: identity and audit trail, on request. */}
      <Collapsible title={`Contract chi tiết (${detail.length})`}>
        <dl className="portal-details">
          {detail.map(([label, value]) => (
            <div key={label} className="portal-detail-row">
              <dt className="label">{label}</dt>
              <dd className="mono" title={value}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </Collapsible>
    </>
  );
}
