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

import { AlphaImport, awaitingStep } from "./AlphaImport";
import { ArtifactPanel } from "./ArtifactPanel";
import { EngineAtlas, type AtlasTab, ATLAS_TABS } from "./EngineAtlas";
import { QueuePanel } from "./QueuePanel";
import { ResearchPanel, ResearchValue } from "./ResearchPanel";
import type {
  GateRow,
  GatesResponse,
  RegistrationResponse,
  RegistryEntry,
  SourceResponse,
} from "./alphaImportClient";
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

/* --------------------------------------------------------- P07 Screen 14 */

const FIXTURE_GATE_NAMES: GateRow["name"][] = [
  "contract-complete",
  "entrypoint-importable",
  "digest-unique",
  "parameter-space-sane",
  "determinism-declared",
  "data-contract-known",
  "no-lookahead-static-scan",
];

const FIXTURE_SOURCE: SourceResponse = {
  schema_version: "research.alpha-source.v1",
  source_file_ref: "sfr_fixture",
  source_digest: "sha256:4f1c2b9ae0d1",
  analysis_digest: "sha256:aa91b3ce7742",
  parse_ok: true,
  mirror: [
    { field: "entrypoint", state: "parsed", value: "alpha.delta_rsi:run" },
    { field: "warmup_bars", state: "parsed", value: 120 },
    { field: "parameter_space", state: "parsed", value: { rsi_len: [5, 30], poly_deg: [2, 4] } },
    { field: "determinism", state: "parsed", value: "seeded" },
    { field: "data_contract", state: "parsed", value: "ohlcv.1m.v2" },
  ],
};

const FIXTURE_SOURCE_INCOMPLETE: SourceResponse = {
  ...FIXTURE_SOURCE,
  parse_ok: false,
  mirror: [
    { field: "entrypoint", state: "parsed", value: "alpha.delta_rsi:run" },
    { field: "warmup_bars", state: "missing" },
    { field: "parameter_space", state: "parsed", value: { rsi_len: [5, 30] } },
    { field: "determinism", state: "missing" },
    { field: "data_contract", state: "parsed", value: "ohlcv.1m.v2" },
  ],
};

function fixtureGates(failAt: number | null): GatesResponse {
  return {
    schema_version: "research.alpha-import-gates.v1",
    gate_receipt_id: "grc_fixture",
    source_file_ref: "sfr_fixture",
    source_digest: "sha256:4f1c2b9ae0d1",
    analysis_digest: "sha256:aa91b3ce7742",
    all_pass: failAt === null,
    static_scan_disclosure: "Static scan — runtime causality is proven per run at Stage 3/4.",
    gates: FIXTURE_GATE_NAMES.map((name, index) => {
      const n = index + 1;
      if (failAt === null || n < failAt) {
        return { n, name, state: "PASS" as const, message: `${name} satisfied.`, ms: 4 + n };
      }
      if (n === failAt) {
        return {
          n,
          name,
          state: "FAIL" as const,
          message: "This exact source digest is already registered as av_0_2_0.",
          ms: 9,
        };
      }
      return { n, name, state: "SKIPPED" as const, message: "Not run: an earlier gate failed.", ms: 0 };
    }),
  };
}

const FIXTURE_REGISTRATION: RegistrationResponse = {
  schema_version: "research.alpha-registration.v1",
  alpha_id: "delta_rsi_polynomial",
  alpha_version_id: "av_0_3_0",
  version_label: "av_0_3_0",
  source_digest: "sha256:4f1c2b9ae0d1",
  lifecycle_state: "DRAFT",
  supersedes: "av_0_2_0",
  alpha_revision: 7,
  replayed: false,
};

const FIXTURE_REGISTRY: RegistryEntry[] = [
  {
    alpha_id: "delta_rsi_polynomial",
    alpha_version_id: "av_0_2_0",
    version_label: "av_0_2_0",
    lifecycle_state: "ACTIVE",
    entrypoint: "alpha.delta_rsi:run",
    source_digest_prefix: "sha256:11ab",
    alpha_revision: 6,
    registered_at_utc_ms: 1789836572369,
  },
  {
    alpha_id: "delta_rsi_polynomial",
    alpha_version_id: "av_0_1_0",
    version_label: "av_0_1_0",
    lifecycle_state: "SUPERSEDED",
    entrypoint: "alpha.delta_rsi:run",
    source_digest_prefix: "sha256:07dd",
    alpha_revision: 2,
    registered_at_utc_ms: 1789236572369,
  },
];

/**
 * One Screen 14 instance with local-only state. It issues no request: the
 * server facts are the constants above, so the lane stays a visual fixture
 * rather than a second, unlabelled way to reach the import API.
 */
function AlphaImportFixture({
  parse,
  gates,
  registration,
  activationAdmitted = false,
}: {
  parse: SourceResponse | null;
  gates: GatesResponse | null;
  registration?: RegistrationResponse | null;
  activationAdmitted?: boolean;
}) {
  const [sourceText, setSourceText] = useState("def run(ctx):\n    ...\n");
  const [alphaId, setAlphaId] = useState("delta_rsi_polynomial");
  const ok = researchState({ kind: "ok", rowCount: 1 });
  const noop = () => undefined;

  return (
    <AlphaImport
      sourceText={sourceText}
      fileName="delta_rsi_polynomial.py"
      onSourceChange={(text) => setSourceText(text)}
      parse={parse}
      gates={gates}
      registration={registration ?? null}
      activation={null}
      registry={FIXTURE_REGISTRY}
      parseState={parse ? ok : awaitingStep("No source has been parsed yet.")}
      gatesState={gates ? ok : awaitingStep("Gates run once a source parses.")}
      registerState={
        registration ? ok : awaitingStep("Registration opens once all seven gates pass.")
      }
      registryState={ok}
      refusal={null}
      alphaId={alphaId}
      onAlphaIdChange={setAlphaId}
      onParse={noop}
      onRunGates={noop}
      onRegister={noop}
      onActivate={noop}
      activationAdmitted={activationAdmitted}
    />
  );
}

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

      <Section title="P07 · Screen 14 Alpha Import — clean, failing and unparsed">
        <div className="flex flex-col gap-4">
          <AlphaImportFixture
            parse={FIXTURE_SOURCE}
            gates={fixtureGates(null)}
            registration={FIXTURE_REGISTRATION}
            activationAdmitted
          />
          <AlphaImportFixture parse={FIXTURE_SOURCE} gates={fixtureGates(3)} />
          <AlphaImportFixture parse={FIXTURE_SOURCE_INCOMPLETE} gates={fixtureGates(1)} />
          <AlphaImportFixture parse={null} gates={null} />
        </div>
      </Section>
    </div>
  );
}
