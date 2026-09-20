/**
 * Research Loop component fixtures — the isolated visual lane.
 *
 * Mirrors `/execution/_fixtures`: every Research component in every state, on
 * one page. It is **not** a product screen. It renders no live data, sits
 * outside the feature registry, never appears in navigation, and every block
 * on it is labelled as a fixture so it cannot be mistaken for the real thing.
 *
 * The recovery brief allows a fixture lane solely for visual/browser tests and
 * forbids one surviving as a product-route fallback. That is why the data here
 * is local to this file and why nothing on this page is exported for reuse by
 * a product route.
 */

import { useState } from "react";

import { ArtifactPanel } from "./ArtifactPanel";
import { EngineAtlas, type AtlasTab, ATLAS_TABS } from "./EngineAtlas";
import { QueuePanel } from "./QueuePanel";
import { ResearchPanel, ResearchValue } from "./ResearchPanel";
import type { AtlasDocument } from "./atlas";
import { RESEARCH_ARTIFACT_STATES } from "./artifacts";
import { RESEARCH_JOB_STATES } from "./scheduler";
import { researchState, type ResearchOutcome } from "./state";

const FIXTURE_OUTCOMES: [string, ResearchOutcome][] = [
  ["loading", { kind: "in-flight", hasAcceptedResponse: false }],
  ["stale", { kind: "in-flight", hasAcceptedResponse: true, retainedAsOf: "2026-09-20T00:00:00Z" }],
  ["available", { kind: "ok", rowCount: 12 }],
  ["empty", { kind: "ok", rowCount: 0 }],
  ["partial", { kind: "ok", rowCount: 12, declaredUnavailable: ["trials", "folds"] }],
  ["denied", { kind: "refusal", code: "RESEARCH_WORKSPACE_FORBIDDEN" }],
  ["conflict", { kind: "refusal", code: "RESEARCH_DRAFT_REVISION_CONFLICT" }],
  ["saturated", { kind: "refusal", code: "RESEARCH_ADMISSION_SATURATED" }],
  ["unavailable", { kind: "transport", status: 503, retryable: false }],
  ["terminal", { kind: "terminal", reason: "The engine refused this configuration." }],
];

const FIXTURE_ATLAS: AtlasDocument = {
  schema_version: "research-engine-atlas.v1",
  manifest_revision: 7,
  current_release: {
    release_id: "fixture-release",
    package: "quantbt-engine",
    expected_version: "1.1.1",
    installed_version: "1.1.1",
    verified: true,
    native_package: "quantbt-native",
    native_expected_version: "0.4.2",
    native_installed_version: "0.4.2",
    detail: null,
  },
  historical_releases: [
    {
      release_id: "fixture-historical",
      package: "quantbt-engine",
      version: "1.0.8",
      status: "HISTORICAL_IDENTITY_RETAINED",
    },
  ],
  routes: [
    {
      route_id: "signal_notional",
      family: "signal",
      backend: "python",
      reason: "Baseline admitted for P04.",
      execution_contract: "close_target_v2",
      report_levels: ["R0", "R1"],
      required_input_class: "signal",
      default_for_new_runs: true,
      axes: {
        engine: "ENGINE_SUPPORTED",
        integration: "ADAPTER_AVAILABLE",
        evidence: "EVIDENCE_MAPPED",
        admission: "P04_BASELINE_ONLY",
      },
    },
    {
      route_id: "arbitrage_triangular",
      family: "arbitrage",
      backend: "python",
      reason: "Schema-only in the support matrix: no Portal adapter.",
      execution_contract: "intrabar_bracket_v1",
      report_levels: ["R0"],
      required_input_class: "signal",
      default_for_new_runs: false,
      axes: {
        engine: "ENGINE_SUPPORTED",
        integration: "INTEGRATION_GAP",
        evidence: "EVIDENCE_GAP",
        admission: "NOT_ADMITTED",
      },
    },
    {
      route_id: "options_greeks",
      family: "options",
      backend: "native",
      reason: "Deferred by Portal until the options evidence contract lands.",
      execution_contract: "event_lifecycle",
      report_levels: ["R0", "R1", "R2"],
      required_input_class: "event",
      default_for_new_runs: false,
      axes: {
        engine: "ENGINE_DEFERRED",
        integration: "DEFERRED_BY_PORTAL",
        evidence: "NOT_APPLICABLE",
        admission: "DEFERRED",
      },
    },
  ],
  modes: [
    {
      mode_id: "m1",
      display_name: "selected best",
      objective_summary: "Maximise the in-sample objective, then read the out-of-sample spread.",
      when_to_use: "Reach for it when the objective surface is smooth.",
      suspect: "pretty S̄_OOS with fat σ_d; negative d̄ everywhere smells like leakage",
      rules: ["The claim comes from mode × schedule, never from the mode alone."],
      artifact_fields: ["selection_trace", "fold_summary"],
      default_schedule: "global",
      valid_schedules: ["global", "per_fold_decay"],
    },
  ],
  claims: [
    {
      contract_id: "close_target_v2",
      engine_certification: "L2",
      numeric_guarantee: "Deterministic bar-close accounting at binary64.",
      never_claims: "never claims intrabar SL/TP fills",
    },
  ],
  evidence_contract: {
    schema_id: "research-run-evidence.v1",
    writer_state: "P05_OWNED_NOT_ACTIVE",
    required_fields: ["engine_release_id", "route_id"],
  },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2
        className="mono text-[11px] uppercase tracking-[.08em]"
        style={{ color: "var(--ink-soft)" }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function ResearchFixtures() {
  const [tab, setTab] = useState<AtlasTab>("routes");

  return (
    <div
      data-research-fixtures
      className="flex flex-col gap-6 px-4 py-4"
      style={{ background: "var(--paper)", color: "var(--ink)" }}
    >
      <header className="flex flex-col gap-1">
        <h1 className="text-[20px] font-light" style={{ fontFamily: "Newsreader, Georgia, serif" }}>
          Research component fixtures
        </h1>
        <p
          className="mono text-[10.5px]"
          style={{ color: "var(--ink-soft)" }}
          data-fixture-warning
        >
          FIXTURE LANE — every value on this page is local test data. Nothing here is served by a
          Portal endpoint, and this route is outside the feature registry and navigation.
        </p>
      </header>

      <Section title="P03 · panel states">
        <div className="grid gap-3 md:grid-cols-2">
          {FIXTURE_OUTCOMES.map(([label, outcome]) => (
            <ResearchPanel
              key={label}
              title={`fixture · ${label}`}
              meta="fixture"
              state={researchState(outcome)}
              actions={<button type="button" className="btn-ghost">Export</button>}
            >
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
                <dt className="mono text-[10px]" style={{ color: "var(--ink-faint)" }}>
                  objective
                </dt>
                <dd>
                  <ResearchValue value="0.318204" />
                </dd>
                <dt className="mono text-[10px]" style={{ color: "var(--ink-faint)" }}>
                  selected trial
                </dt>
                <dd>
                  <ResearchValue value={null} />
                </dd>
              </dl>
            </ResearchPanel>
          ))}
        </div>
      </Section>

      <Section title="P04 · Engine Atlas, three tabs">
        <div className="flex gap-2">
          {ATLAS_TABS.map((candidate) => (
            <button
              key={candidate}
              type="button"
              className="btn-ghost mono text-[10px]"
              onClick={() => setTab(candidate)}
            >
              show {candidate}
            </button>
          ))}
        </div>
        <div className="rounded-[6px] border" style={{ borderColor: "var(--line)" }}>
          <EngineAtlas
            doc={FIXTURE_ATLAS}
            state={researchState({ kind: "ok", rowCount: 3 })}
            tab={tab}
            onTabChange={setTab}
          />
        </div>
        <div className="rounded-[6px] border" style={{ borderColor: "var(--line)" }}>
          <EngineAtlas
            doc={null}
            state={researchState({ kind: "transport", status: 503, retryable: false })}
            tab="routes"
            onTabChange={() => {}}
          />
        </div>
      </Section>

      <Section title="P05 · artifact readiness, every state">
        <div className="grid gap-3 md:grid-cols-2">
          {RESEARCH_ARTIFACT_STATES.map((state) => (
            <ArtifactPanel
              key={state}
              title={`artifact · ${state}`}
              facts={{ state, registered: true, serverAdmittedExport: true }}
              metadata={{
                rowCount: "1204",
                byteSize: "8421376",
                coverage: "0.9987",
                sealedAt: "2026-09-20T00:00:00.000Z",
                manifestRevision: 3,
              }}
              window={{ returnedRows: 50, totalRows: 1204, nextCursor: "opaque" }}
              exportAction={<button type="button" className="btn-ghost">Download</button>}
            />
          ))}
          <ArtifactPanel
            title="artifact · sealed on disk, unregistered"
            facts={{ state: "SEALED", registered: false, serverAdmittedExport: true }}
            metadata={{ rowCount: "1204", sealedAt: "2026-09-20T00:00:00.000Z" }}
            exportAction={<button type="button" className="btn-ghost">Download</button>}
          />
        </div>
      </Section>

      <Section title="P06 · queue and attempts, every state">
        <div className="grid gap-3 md:grid-cols-2">
          {RESEARCH_JOB_STATES.map((state) => (
            <QueuePanel
              key={state}
              title={`queue · ${state}`}
              run={{
                runId: "run_fixture",
                state,
                attempts: [
                  { ordinal: 1, state: "FAILED", message: "the worker stopped responding" },
                  { ordinal: 2, state, message: null },
                ],
                progress: state === "RUNNING" ? { completed: 3, total: 10 } : null,
              }}
            />
          ))}
          <QueuePanel
            title="queue · optional diagnostic failed"
            run={{
              runId: "run_fixture_diag",
              state: "SUCCEEDED",
              attempts: [{ ordinal: 1, state: "SUCCEEDED", message: null }],
              diagnostics: [{ id: "audit_trace", kind: "OPTIONAL", failed: true }],
            }}
          />
        </div>
      </Section>
    </div>
  );
}
