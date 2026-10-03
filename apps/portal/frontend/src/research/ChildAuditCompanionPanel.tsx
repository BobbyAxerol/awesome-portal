/**
 * Child-audit companion panel — the full available source lifecycle rows.
 *
 * Reads only on request (one click), then pages by the server's own cursor.
 * Three custodies are told apart by name and never blended:
 *  - FULL_SOURCE_RETAINED — every retained lifecycle row, paged here;
 *  - LEGACY_SAMPLE — only a bounded witness exists: not full rows, not
 *    authoritative generations, no rows are drawn from it;
 *  - NOT_RETAINED — nothing retained, typed with the server's reason.
 * The scope is observations of the source lifecycle, never a generation clock.
 * Counts, drops and totals are the server's; the screen adds nothing up.
 */

import { CHILD_AUDIT_CONTEXTS, CHILD_AUDIT_PAGE_SIZES, type ChildAuditCompanionPage, type ChildAuditCompanionRow } from "./childAuditCompanionClient";
import { useChildAuditCompanion } from "./useChildAuditCompanion";
import { formatCount, formatUtc, shortDigest, shortId } from "./researchFormat";

const FAINT = { color: "var(--ink-faint)" } as const;
const NOT_PUBLISHED = "not published";

export const CHILD_AUDIT_CUSTODY_WORDS: Record<ChildAuditCompanionPage["custody"], string> = {
  FULL_SOURCE_RETAINED: "full source lifecycle · retained",
  LEGACY_SAMPLE: "legacy sample only · not full rows",
  NOT_RETAINED: "source audit not retained",
};

function Count({ label, value, name }: { label: string; value: number | null; name: string }) {
  const text = formatCount(value);
  return (
    <span className="flex flex-col" data-count={name} data-count-state={text === null ? "NOT_PUBLISHED" : "PUBLISHED"}>
      <span className="mono text-[9px] uppercase tracking-[.07em]" style={FAINT}>
        {label}
      </span>
      {text !== null ? <span className="mono text-[11px]">{text}</span> : <span className="mono text-[10px] italic" style={FAINT}>{NOT_PUBLISHED}</span>}
    </span>
  );
}

function Cell({ value }: { value: string | number | boolean | null }) {
  if (value === null) {
    return (
      <span className="italic" style={FAINT}>
        {NOT_PUBLISHED}
      </span>
    );
  }
  return <>{typeof value === "boolean" ? (value ? "yes" : "no") : String(value)}</>;
}

function Utc({ ms }: { ms: number | null }) {
  const text = formatUtc(ms);
  return text === null ? <Cell value={null} /> : <span title={String(ms)}>{text}</span>;
}

function Digest({ value }: { value: string | null }) {
  const short = shortDigest(value);
  return short === null ? <Cell value={null} /> : <span title={value ?? undefined}>{short}</span>;
}

const COLUMNS: { key: string; label: string; cell: (row: ChildAuditCompanionRow) => React.ReactNode }[] = [
  { key: "audit_ordinal", label: "#", cell: (r) => r.audit_ordinal },
  { key: "fold_id", label: "fold", cell: (r) => <Cell value={r.fold_id} /> },
  { key: "context", label: "context", cell: (r) => <Cell value={r.context} /> },
  { key: "lifecycle_kind", label: "lifecycle", cell: (r) => <Cell value={r.lifecycle_kind} /> },
  { key: "candidate_id", label: "candidate", cell: (r) => (r.candidate_id === null ? <Cell value={null} /> : <span title={r.candidate_id}>{shortId(r.candidate_id, 8)}</span>) },
  { key: "seed", label: "seed", cell: (r) => <Cell value={r.seed} /> },
  { key: "policy", label: "policy", cell: (r) => <Cell value={r.policy} /> },
  { key: "certified_isolation", label: "certified isolation", cell: (r) => <Cell value={r.certified_isolation} /> },
  { key: "spawned", label: "spawned", cell: (r) => <Cell value={r.spawned} /> },
  { key: "reset_called", label: "reset", cell: (r) => <Cell value={r.reset_called} /> },
  { key: "warmup_called", label: "warmup", cell: (r) => <Cell value={r.warmup_called} /> },
  { key: "warmup_bars", label: "warmup bars", cell: (r) => <Cell value={r.warmup_bars} /> },
  { key: "closed", label: "closed", cell: (r) => <Cell value={r.closed} /> },
  { key: "state_before", label: "state before", cell: (r) => <Cell value={r.state_before} /> },
  { key: "cutoff_utc_ms", label: "cutoff", cell: (r) => <Utc ms={r.cutoff_utc_ms} /> },
  { key: "train_start_utc_ms", label: "train start", cell: (r) => <Utc ms={r.train_start_utc_ms} /> },
  { key: "train_end_utc_ms", label: "train end", cell: (r) => <Utc ms={r.train_end_utc_ms} /> },
  { key: "test_start_utc_ms", label: "test start", cell: (r) => <Utc ms={r.test_start_utc_ms} /> },
  { key: "test_end_utc_ms", label: "test end", cell: (r) => <Utc ms={r.test_end_utc_ms} /> },
  { key: "strategy_fingerprint", label: "strategy fp", cell: (r) => <Digest value={r.strategy_fingerprint} /> },
  { key: "market_fingerprint", label: "market fp", cell: (r) => <Digest value={r.market_fingerprint} /> },
  { key: "run_fingerprint", label: "run fp", cell: (r) => <Digest value={r.run_fingerprint} /> },
];

function Rows({ rows }: { rows: ChildAuditCompanionRow[] }) {
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="source lifecycle rows" data-child-audit-companion-rows>
      <table className="mono w-full border-collapse text-[10px]">
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th key={c.key} className="whitespace-nowrap px-2 py-1 text-left text-[9px] font-normal uppercase tracking-[.07em]" style={FAINT}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.audit_ordinal} data-audit-ordinal={row.audit_ordinal} style={{ borderTop: "1px solid var(--line)" }}>
              {COLUMNS.map((c) => (
                <td key={c.key} className="whitespace-nowrap px-2 py-1">
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Manifest({ page }: { page: Extract<ChildAuditCompanionPage, { custody: "FULL_SOURCE_RETAINED" }> }) {
  const m = page.manifest;
  const entries: [string, string | number | null][] = [
    ["artifact", `${shortId(m.artifact_id, 8)} · rev ${m.artifact_revision}`],
    ["source file", shortDigest(m.source_file_digest)],
    ["rows digest", shortDigest(m.rows_digest)],
    ["manifest", shortDigest(m.manifest_digest)],
    ["source adapter", m.source_adapter_id],
    ["profile", m.profile_id],
    ["source policy", m.policy],
    ["source run fingerprint", shortDigest(m.source_run_fingerprint)],
  ];
  return (
    <details data-child-audit-manifest>
      <summary className="mono cursor-pointer text-[9px] uppercase tracking-[.07em]" style={FAINT}>
        seal · {m.authority}
      </summary>
      <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1.5">
        {entries.map(([label, value]) => (
          <span key={label} className="mono flex flex-col text-[10px]">
            <span className="text-[9px] uppercase tracking-[.07em]" style={FAINT}>
              {label}
            </span>
            {value === null ? <span className="italic" style={FAINT}>{NOT_PUBLISHED}</span> : value}
          </span>
        ))}
      </div>
    </details>
  );
}

export function ChildAuditCompanionPanel({ runId, workspaceId }: { runId: string; workspaceId?: string }) {
  const { slot, filter, setFilter, read, nextPage } = useChildAuditCompanion(runId, workspaceId);
  const page = slot.state === "idle" ? null : slot.page;
  const busy = slot.state === "loading";
  const ordinalSet = filter.ordinal.trim() !== "";
  return (
    <details
      className="flex flex-col gap-2 rounded-[8px] border px-4 py-3"
      data-panel="child-audit-companion"
      data-custody={page?.custody ?? "UNREAD"}
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
    >
      {/* One owner for the child audit: this screen. The scope sentence is the summary's tooltip. */}
      <summary
        className="mono cursor-pointer text-[10px] uppercase tracking-[.07em]"
        style={FAINT}
        title="Observations of the source lifecycle — not a generation clock."
        data-child-audit-scope
      >
        child audit · lifecycle rows
      </summary>

      <div className="flex flex-wrap items-end gap-2" data-child-audit-filters>
        <label className="flex flex-col gap-0.5 text-[9px] uppercase tracking-[.07em]" style={FAINT}>
          fold
          <input
            className="mono w-[92px] rounded-[4px] border px-1.5 py-0.5 text-[10.5px]"
            style={{ borderColor: "var(--line)", background: "var(--paper)", color: "var(--ink)" }}
            value={filter.foldId}
            onChange={(e) => setFilter({ ...filter, foldId: e.target.value })}
            data-filter="fold"
          />
        </label>
        <label className="flex flex-col gap-0.5 text-[9px] uppercase tracking-[.07em]" style={FAINT}>
          context
          <select
            className="mono rounded-[4px] border px-1.5 py-0.5 text-[10.5px]"
            style={{ borderColor: "var(--line)", background: "var(--paper)", color: "var(--ink)" }}
            value={filter.context}
            onChange={(e) => setFilter({ ...filter, context: e.target.value as typeof filter.context })}
            data-filter="context"
          >
            <option value="">all contexts</option>
            {CHILD_AUDIT_CONTEXTS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-[9px] uppercase tracking-[.07em]" style={FAINT}>
          exact #
          <input
            className="mono w-[72px] rounded-[4px] border px-1.5 py-0.5 text-[10.5px]"
            style={{ borderColor: "var(--line)", background: "var(--paper)", color: "var(--ink)" }}
            inputMode="numeric"
            value={filter.ordinal}
            onChange={(e) => setFilter({ ...filter, ordinal: e.target.value.replace(/[^0-9]/g, "") })}
            data-filter="audit-ordinal"
          />
        </label>
        <label className="flex flex-col gap-0.5 text-[9px] uppercase tracking-[.07em]" style={FAINT}>
          page size
          <select
            className="mono rounded-[4px] border px-1.5 py-0.5 text-[10.5px]"
            style={{ borderColor: "var(--line)", background: "var(--paper)", color: "var(--ink)" }}
            value={filter.limit}
            onChange={(e) => setFilter({ ...filter, limit: Number(e.target.value) })}
            data-filter="limit"
          >
            {CHILD_AUDIT_PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n} rows
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn-ghost mono text-[10px]" onClick={read} disabled={busy} title={busy ? "reading the audit" : "read the first page of the full source lifecycle"} data-action="read-child-audit-companion">
          {slot.state === "idle" ? "read rows" : "read again"}
        </button>
      </div>

      {slot.state === "loading" && page === null ? (
        <p className="mono text-[10px] italic" style={FAINT} data-child-audit-companion="loading">
          reading the source lifecycle…
        </p>
      ) : null}

      {slot.state === "refused" ? (
        <p className="flex flex-wrap items-center gap-2 text-[11px]" style={{ color: "var(--warn)" }} data-child-audit-companion="refused" data-reason={slot.refusal.code ?? ""}>
          <span>{slot.refusal.message}</span>
          {slot.refusal.code ? <span hidden>{slot.refusal.code}</span> : null}
        </p>
      ) : null}

      {page !== null ? (
        <div className="flex flex-col gap-2" data-child-audit-companion={page.custody}>
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="mono rounded-[3px] border px-[5px] text-[10px] leading-[16px]" style={{ borderColor: "var(--line)" }} data-custody-label title={page.availability.reason_code ?? undefined}>
              {CHILD_AUDIT_CUSTODY_WORDS[page.custody]}
            </span>
            {page.availability.reason_code ? <span hidden data-reason={page.availability.reason_code}>{page.availability.reason_code}</span> : null}
          </div>
          {page.custody === "LEGACY_SAMPLE" ? (
            <p className="text-[10.5px]" style={{ color: "var(--ink-soft)" }} data-child-audit-legacy title="Only a bounded legacy witness was kept for this run. It is not the full lifecycle and not an authoritative generation record, so no rows are shown from it.">
              Legacy witness only — no rows.
            </p>
          ) : null}
          {page.custody === "NOT_RETAINED" ? (
            <p className="text-[10.5px]" style={{ color: "var(--ink-soft)" }} data-child-audit-not-retained>
              No lifecycle audit retained.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-x-5 gap-y-1.5" data-child-audit-counts>
            <Count name="full_source_retained" label="retained" value={page.counts.full_source_retained} />
            <Count name="records_dropped_by_source" label="dropped by source" value={page.counts.records_dropped_by_source} />
            <Count name="source_total_if_known" label="source total" value={page.counts.source_total_if_known} />
            <Count name="matching_fold" label="matching fold" value={page.counts.matching_fold} />
            <Count name="matching_filter" label="matching filter" value={page.counts.matching_filter} />
            <Count name="legacy_sample_retained" label="legacy sample" value={page.counts.legacy_sample_retained} />
            <Count name="returned" label="this page" value={page.counts.returned} />
          </div>
          {page.custody === "FULL_SOURCE_RETAINED" ? <Manifest page={page} /> : null}
          {page.custody === "FULL_SOURCE_RETAINED" && slot.state !== "idle" && slot.rows.length > 0 ? <Rows rows={slot.rows} /> : null}
          {page.custody === "FULL_SOURCE_RETAINED" && slot.state !== "idle" ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="mono text-[10px]" style={FAINT} data-child-audit-shown>
                showing {formatCount(slot.rows.length)} of {formatCount(page.counts.matching_filter) ?? NOT_PUBLISHED}
              </span>
              <button
                type="button"
                className="btn-ghost mono text-[10px]"
                data-action="child-audit-next-page"
                onClick={nextPage}
                disabled={busy || !page.next_cursor || ordinalSet}
                title={
                  busy
                    ? "reading the next page"
                    : ordinalSet
                      ? "an exact # lookup returns that row only; clear it to page"
                      : !page.next_cursor
                        ? "this is the last page for the filter"
                        : "the next page for the same filter"
                }
              >
                next page
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </details>
  );
}
