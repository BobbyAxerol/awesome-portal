/**
 * B10 CHILD_AUDIT_CLOCKS. Data is built by typed builders from the generated
 * `research-child-audit-companion` / `research-current-source` types (no served
 * fixture exists for this operation yet); each builder is labelled as such.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChildAuditCompanionPanel } from "./ChildAuditCompanionPanel";
import { childAuditCompanionPath, type ChildAuditCompanionPage, type ChildAuditCompanionRow } from "./childAuditCompanionClient";
import { OrchestrationClocks, type P11StageEvents } from "./OrchestrationClocks";

type Full = Extract<ChildAuditCompanionPage, { custody: "FULL_SOURCE_RETAINED" }>;
type Legacy = Extract<ChildAuditCompanionPage, { custody: "LEGACY_SAMPLE" }>;

/* TYPED BUILDER (derived from the generated types, not a served fixture). */
const row = (ordinal: number, over: Partial<ChildAuditCompanionRow> = {}): ChildAuditCompanionRow => ({
  audit_ordinal: ordinal,
  candidate_id: "cand-" + ordinal,
  fold_id: "fold-1",
  seed: 7,
  context: "out-of-sample generation",
  lifecycle_kind: "spawn",
  policy: "isolated",
  certified_isolation: true,
  spawned: true,
  reset_called: true,
  warmup_called: true,
  warmup_bars: 30,
  closed: true,
  state_before: "fresh",
  cutoff_utc_ms: 1_700_000_000_000,
  train_start_utc_ms: null,
  train_end_utc_ms: null,
  test_start_utc_ms: null,
  test_end_utc_ms: null,
  strategy_fingerprint: "sha256:aaaaaaaaaaaaaaaa",
  market_fingerprint: null,
  run_fingerprint: "sha256:bbbbbbbbbbbbbbbb",
  ...over,
});

const digest = "sha256:" + "c".repeat(64);
const full = (rows: ChildAuditCompanionRow[], next: string | null): Full => ({
  schema_version: "research.child-audit-companion-page.v1",
  run_id: "run-1",
  availability: { state: "AVAILABLE", reason_code: null },
  custody: "FULL_SOURCE_RETAINED",
  revision: "rev-1",
  manifest: {
    schema_version: "research.child-audit-companion-manifest.v1",
    workspace_id: "ws",
    run_id: "run-1",
    artifact_id: "artifact-0001",
    artifact_revision: 3,
    manifest_digest: digest,
    source_transform_digest: digest,
    requested_spec_digest: digest,
    effective_spec_digest: digest,
    dataset_binding_digest: digest,
    execution_profile_id: "p",
    execution_profile_digest: digest,
    source_adapter_id: "adapter",
    profile_id: "profile",
    source_file_digest: digest,
    source_contract_digest: digest,
    rows_digest: digest,
    source_record_count: 130,
    records_dropped_by_source: null,
    source_total_count: null,
    source_run_fingerprint: null,
    policy: null,
    authority: "SOURCE_LIFECYCLE_OBSERVATIONS_NOT_GENERATION_CLOCK",
  },
  scope: "SOURCE_LIFECYCLE_OBSERVATIONS_NOT_GENERATION_CLOCK",
  counts: { full_source_retained: 130, records_dropped_by_source: null, source_total_if_known: null, matching_fold: 130, matching_filter: 130, legacy_sample_retained: null, returned: rows.length },
  rows,
  next_cursor: next,
});

const legacy = (): Legacy => ({
  schema_version: "research.child-audit-companion-page.v1",
  run_id: "run-1",
  availability: { state: "NOT_PUBLISHED", reason_code: "LEGACY_SAMPLE" },
  custody: "LEGACY_SAMPLE",
  revision: null,
  manifest: null,
  scope: "SOURCE_LIFECYCLE_OBSERVATIONS_NOT_GENERATION_CLOCK",
  counts: { full_source_retained: null, records_dropped_by_source: null, source_total_if_known: null, matching_fold: null, matching_filter: null, legacy_sample_retained: 64, returned: 0 },
  rows: [row(0), row(1)],
  next_cursor: null,
});

const reply = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("child audit companion", () => {
  it("builds the query: ordinal wins over cursor, closed context is sent verbatim", () => {
    const url = childAuditCompanionPath("run-1", { context: "in-sample scoring", cursor: "c1", audit_ordinal: 4, limit: 50 });
    expect(url).toContain("/api/v1/quantbt/runs/run-1/current-source/child-audit-companion?");
    expect(url).toContain("audit_ordinal=4");
    expect(url).not.toContain("cursor=");
    expect(url).toContain("context=in-sample+scoring");
  });

  it("pages full rows by the server cursor and shows counts as served", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(() => reply(full([row(0), row(1)], "cursor-2")))
      .mockImplementationOnce(() => reply({ ...full([row(2)], null), counts: { ...full([], null).counts, returned: 1 } }));
    render(<ChildAuditCompanionPanel runId="run-1" />);
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "read rows" }));
    await waitFor(() => expect(document.querySelectorAll("tr[data-audit-ordinal]").length).toBe(2));
    expect(document.querySelector("[data-custody-label]")?.textContent).toBe("full source lifecycle · retained");
    expect(document.querySelector('[data-count="full_source_retained"]')?.textContent).toContain("130");
    /* dropped-by-source is null on this page: typed absence, never 0 */
    expect(document.querySelector('[data-count="records_dropped_by_source"]')?.textContent).toContain("not published");
    fireEvent.click(screen.getByRole("button", { name: "next page" }));
    await waitFor(() => expect(document.querySelectorAll("tr[data-audit-ordinal]").length).toBe(3));
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("cursor=cursor-2");
    expect((screen.getByRole("button", { name: "next page" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "next page" }).getAttribute("title")).toBeTruthy();
  });

  it("never draws a legacy witness as full rows and labels it", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => reply(legacy()));
    render(<ChildAuditCompanionPanel runId="run-1" />);
    fireEvent.click(screen.getByRole("button", { name: "read rows" }));
    await waitFor(() => expect(document.querySelector("[data-child-audit-legacy]")).not.toBeNull());
    expect(document.querySelector("[data-custody-label]")?.textContent).toBe("legacy sample only · not full rows");
    expect(document.querySelectorAll("tr[data-audit-ordinal]").length).toBe(0);
    expect(document.querySelector('[data-count="legacy_sample_retained"]')?.textContent).toContain("64");
    expect(document.querySelector('[data-reason="LEGACY_SAMPLE"]')).not.toBeNull();
  });
});

describe("orchestration clocks", () => {
  /* TYPED BUILDER from P11StageEvents. */
  const events: P11StageEvents = {
    schema_version: "research.p11-stage-event-clocks.v1",
    source: "P11_STAGE_EVENTS",
    semantics: "PORTAL_ORCHESTRATION_NOT_ENGINE_SEARCH_FREEZE_OR_OOS_READ",
    source_binding_digest: null,
    s3_completed_utc_ms: 1_700_000_000_000,
    s4_started_utc_ms: null,
    s4_completed_utc_ms: 1_700_000_600_000,
    reason_codes: { s3_completed: null, s4_started: "P11_S4_START_NOT_RETAINED", s4_completed: null },
  } as P11StageEvents;

  it("names them orchestration, never pool freeze or first-OOS read, and keeps the reason", () => {
    render(<OrchestrationClocks events={events} />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("orchestration · stage 3 completed");
    expect(text).toContain("orchestration · stage 4 completed");
    expect(text).not.toMatch(/pool frozen|frozen at|first oos read:/i);
    expect(document.querySelector('[data-orchestration-clock="s4_started_utc_ms"] [data-reason]')?.getAttribute("data-reason")).toBe("P11_S4_START_NOT_RETAINED");
  });

  it("renders nothing when the block is absent", () => {
    const { container } = render(<OrchestrationClocks events={undefined} />);
    expect(container.firstChild).toBeNull();
  });
});
