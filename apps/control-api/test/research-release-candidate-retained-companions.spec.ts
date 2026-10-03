import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import { sha256ResearchJson } from "../src/research/preflight.service";
import { ResearchReleaseCandidateRepository } from "../src/research/release-candidate.repository";
import type { ReleaseCandidateRetainedSeal } from "../src/research/release-candidate.retained-lane";
import { DELTA_CAUSAL_INNER_PROFILE } from "../src/research/delta-causal-inner.profile";

const fixture = (name: string) => JSON.parse(readFileSync(join(
  process.env.PORTAL_CONTRACTS_DIR ?? join(__dirname, "../../../packages/contracts"), "fixtures", name,
), "utf8"));
const runId = "rrun_" + "a".repeat(32);
const workspace = "ws_rc_report";
const digest = "a".repeat(64);
const seal: ReleaseCandidateRetainedSeal = {
  artifactRevision: 2, sourceAdapterId: "rs02.quantbt-signal-notional-wfo.v1",
  profileId: "rs02.delta-signal-notional-wfo.v1", manifestDigest: digest, sourceTransformDigest: digest,
  retainedImportDigest: digest, requestedSpecDigest: digest, effectiveSpecDigest: digest,
  datasetBindingDigest: digest, tableRows: { OBSERVATION: 10000, FOLD: 1, TRIAL: 1, CANDIDATE: 1,
    SELECTION: 1 }, totalRows: 10004, summary: {},
};

function subject(rows: { enriched?: unknown; enriched_digest?: string; companions?: Record<string, unknown> } = {}) {
  const client = { query: vi.fn(async (sql: string, values: unknown[]) => {
    // Different workspaces/runs have no fallback or ambient companion.
    if (values[0] !== workspace || values[1] !== runId) return { rows: [], rowCount: 0 };
    const row = sql.includes("FROM (SELECT $1::text AS workspace_id")
      ? { enriched: rows.enriched, enriched_digest: rows.enriched_digest }
      : rows.companions;
    return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
  }) };
  const repository = new ResearchReleaseCandidateRepository({} as never) as unknown as {
    retainedCompanions(client: PoolClient, workspace: string, run: string, seal: ReleaseCandidateRetainedSeal): Promise<Partial<ReleaseCandidateRetainedSeal>>;
  };
  const read = (ws = workspace, run = runId, source = seal) => repository.retainedCompanions(client as unknown as PoolClient, ws, run, source);
  return { client, read };
}

describe("P21 Report companions share CurrentSource immutable verification and scope", () => {
  it("reads verified enrichment and both companions in the same caller snapshot, bound to exact seal revision/import", async () => {
    const enriched = { ...fixture("research-enriched-analysis.healthy.valid.json"), run_id: runId };
    const analytics = fixture("research-retained-analytics-v2.fixed.valid.json");
    const distributions = fixture("research-all-time-distributions.valid.json");
    const { read, client } = subject({ enriched, enriched_digest: sha256ResearchJson(enriched), companions: {
      analytics, analytics_digest: sha256ResearchJson(analytics), analytics_import_digest: digest, analytics_source_rows_digest: digest,
      distributions, distributions_digest: sha256ResearchJson(distributions), distributions_import_digest: digest,
      distributions_source_rows_digest: digest,
    } });
    expect(await read()).toEqual({ enrichedAnalysis: enriched,
      analyticsSidecar: { digest: sha256ResearchJson(analytics), sourceRowsDigest: digest, analytics },
      distributionsSidecar: { digest: sha256ResearchJson(distributions), distributions } });
    expect(client.query).toHaveBeenCalledTimes(2);
    const [enrichmentSql, enrichmentArgs] = client.query.mock.calls[0]!;
    expect(enrichmentArgs).toEqual([workspace, runId]);
    expect(enrichmentSql).toContain("enrichment.source_kind='WFO_RETAINED'");
    expect(enrichmentSql).toContain("seal.artifact_revision::text=enrichment.source_revision");
    expect(enrichmentSql).toContain("seal.retained_import_digest=enrichment.source_digest");
    expect(enrichmentSql).toContain("SELECT max(s.artifact_revision)");
    const [sql, args] = client.query.mock.calls[1]!;
    expect(args).toEqual([workspace, runId, 2, digest]);
    for (const pair of ["analytics", "distributions"]) {
      expect(sql).toContain(`${pair}.workspace_id = seal.workspace_id AND ${pair}.run_id = seal.run_id`);
      expect(sql).toContain(`${pair}.artifact_revision = seal.artifact_revision`);
    }
    expect(sql).toContain("seal.workspace_id = $1 AND seal.run_id = $2 AND seal.artifact_revision = $3");
    expect(sql).toContain("seal.retained_import_digest = $4");
    expect(client.query.mock.calls.every(([sql]) => !/INSERT|UPDATE|DELETE/.test(sql))).toBe(true);
  });

  it("does not borrow an enrichment from another run/workspace and rejects other-run or forged bodies", async () => {
    const enriched = { ...fixture("research-enriched-analysis.healthy.valid.json"), run_id: runId };
    const { read } = subject({ enriched, enriched_digest: sha256ResearchJson(enriched) });
    expect(await read("ws_other")).toEqual({});
    expect(await read(workspace, "rrun_" + "b".repeat(32))).toEqual({});
    const otherRun = { ...enriched, run_id: "rrun_" + "b".repeat(32) };
    await expect(subject({ enriched: otherRun, enriched_digest: sha256ResearchJson(otherRun) }).read())
      .rejects.toMatchObject({ code: "RESEARCH_RELEASE_CANDIDATE_UNAVAILABLE", status: 503 });
    await expect(subject({ enriched, enriched_digest: "0".repeat(64) }).read())
      .rejects.toMatchObject({ code: "RESEARCH_RELEASE_CANDIDATE_UNAVAILABLE", status: 503 });
  });

  it("rejects mismatched import/body/row-set identities, oversize distributions and conflicting embedded analytics", async () => {
    const analytics = fixture("research-retained-analytics-v2.fixed.valid.json");
    const distributions = fixture("research-all-time-distributions.valid.json");
    const valid = { analytics, analytics_digest: sha256ResearchJson(analytics), analytics_import_digest: digest,
      analytics_source_rows_digest: digest, distributions, distributions_digest: sha256ResearchJson(distributions),
      distributions_import_digest: digest, distributions_source_rows_digest: digest };
    for (const changed of [
      { analytics_import_digest: "b".repeat(64) }, { analytics_digest: "b".repeat(64) },
      { analytics_source_rows_digest: "not-a-digest" }, { distributions_import_digest: "b".repeat(64) },
      { distributions_digest: "b".repeat(64) }, { distributions_source_rows_digest: "b".repeat(64) },
    ]) await expect(subject({ companions: { ...valid, ...changed } }).read())
      .rejects.toMatchObject({ code: "RESEARCH_RELEASE_CANDIDATE_UNAVAILABLE", status: 503 });
    await expect(subject({ companions: valid }).read(workspace, runId, { ...seal,
      tableRows: { ...seal.tableRows, OBSERVATION: 0 } })).rejects.toMatchObject({ status: 503 });
    await expect(subject({ companions: valid }).read(workspace, runId, { ...seal,
      summary: { summary_analytics_v2: analytics } })).rejects.toMatchObject({ status: 503 });
  });

  it("preserves old immutable sources with no published companions", async () => {
    expect(await subject().read()).toEqual({});
  });

  it("reads causal native trial mapping only from the exact selected row at the caller's seal revision", async () => {
    const source = JSON.parse(gunzipSync(readFileSync(join(__dirname, "research-w5b-real-replay.fixture.json.gz"))).toString("utf8"));
    const id = "study_fold-b.trial_13"; // Evaluation identity != native Optuna 0.
    const payload = { ...source.rows.TRIAL[0].payload, trial_id: id,
      trial_facts: { ...source.rows.TRIAL[0].payload.trial_facts, study_id: "fold-b", source_trial_id: "0" } };
    source.summary.selection.trial_id = id;
    const lane = { seal: { ...seal, profileId: DELTA_CAUSAL_INNER_PROFILE.current_source.profile_id, summary: source.summary } };
    const client = { query: vi.fn().mockResolvedValue({ rows: [{ payload }], rowCount: 1 }) };
    const repository = new ResearchReleaseCandidateRepository({} as never) as unknown as {
      selectedTrialNativeFacts(client: unknown, workspace: string, run: string, lane: unknown): Promise<unknown>;
    };
    expect(await repository.selectedTrialNativeFacts(client, workspace, runId, lane))
      .toEqual({ trial_id: id, study_id: "fold-b", source_trial_id: "0" });
    expect(client.query.mock.calls[0]![1]).toEqual([workspace, runId, 2, id]);
    expect(client.query.mock.calls[0]![0]).toContain("table_kind = 'TRIAL' AND source_id = $4 LIMIT 1");
    client.query.mockResolvedValue({ rows: [{ payload: { ...payload, trial_id: "study_other.trial_0" } }], rowCount: 1 });
    expect(await repository.selectedTrialNativeFacts(client, workspace, runId, lane)).toBeUndefined();
    client.query.mockResolvedValue({ rows: [], rowCount: 0 });
    expect(await repository.selectedTrialNativeFacts(client, workspace, runId, lane)).toBeUndefined();
  });
});
