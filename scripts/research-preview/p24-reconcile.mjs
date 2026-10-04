#!/usr/bin/env node
/**
 * P24 cross-screen data + security reconciliation (AA).  READ-ONLY against the
 * deployed Research preview.  Only GETs, plus three NEGATIVE write probes that the
 * server must refuse (same-origin / CSRF guard) and that are verified not to change state.
 *
 *   export RESEARCH_PREVIEW_ORIGIN=$(sed -n 's/^PORTAL_PUBLIC_ORIGIN=//p' ~/.config/portal-research-preview/preview.env)
 *   node scripts/research-preview/p24-reconcile.mjs [--base http://localhost:8095] [--out upgrade/research_loop/evidence/P24] [--wait-ms 5000]
 *
 * Writes p24-reconcile-result.json and FE_RECONCILE_RECEIPT_<date>.md into --out.
 * Credentials are read from ~/.config/portal-research-preview/claude-preview.password and never printed.
 * Exit code 0 when the run completes (FAILs are findings, see the receipt); 2 on harness error.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const BASE = arg('--base', 'http://localhost:8095');
const OUT = resolve(ROOT, arg('--out', 'upgrade/research_loop/evidence/P24'));
const WAIT_MS = Number(arg('--wait-ms', '5000'));
const DATE = new Date().toISOString().slice(0, 10);
const HOME = process.env.HOME;
const CFG = `${HOME}/.config/portal-research-preview`;
const ORIGIN = process.env.RESEARCH_PREVIEW_ORIGIN;
const PW = process.env.PLAYWRIGHT_MODULE || '/home/bobby/portal-research-fe/apps/portal/frontend/node_modules/playwright/index.mjs';
const DEV_HEADERS = { 'x-dev-access-email': 'claude-preview@azdag.com' };
if (!ORIGIN) { console.error('RESEARCH_PREVIEW_ORIGIN is required'); process.exit(2); }

const sha = (v) => createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (o, p) => (p === '' ? o : p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o));
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
}
const canon = (v) => JSON.stringify(sortKeys(v));
const short = (v) => {
  if (v === undefined) return 'undefined';
  const s = typeof v === 'string' ? v : canon(v);
  return s.replace(/(?:sha256:)?[0-9a-f]{20,}/g, (m) => m.replace('sha256:', '').slice(0, 12)).slice(0, 160);
};
const wsFromCursor = (c) => {
  try { const p = c.split('.')[2]; return JSON.parse(Buffer.from(p, 'base64url').toString('utf8')).workspace_id; } catch { return undefined; }
};
const ms = (s) => Date.parse(/Z$|[+-]\d\d:\d\d$/.test(s) ? s : `${s}Z`);

/* ------------------------------------------------------------------ session */
const { chromium } = await import(pathToFileURL(PW).href);
const browser = await chromium.launch();
const ctx = await browser.newContext({ extraHTTPHeaders: DEV_HEADERS });
const page = await ctx.newPage();
const login = await page.request.post(`${BASE}/api/auth/login`, {
  data: { username: 'claude-preview', credential: readFileSync(`${CFG}/claude-preview.password`, 'utf8').trim() },
  headers: { origin: ORIGIN },
});
if (!login.ok()) { console.error('login failed', login.status()); await browser.close(); process.exit(2); }
await page.goto(`${BASE}/research/quantbt/journey`);
const rawGet = (u) => page.evaluate(async (u) => {
  const r = await fetch(u, { credentials: 'include' });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* not json */ }
  return { s: r.status, ct: r.headers.get('content-type') || '', j, len: t.length, t: j ? undefined : t.slice(0, 200) };
}, u);
const GETS = [];
const G = async (u) => { const r = await rawGet(u); GETS.push([u.replace(/rrun_[0-9a-f]{32}/g, (m) => m.slice(0, 12)), r.s]); return r; };

/* ------------------------------------------------------------ run discovery */
const lib = await G('/api/v1/quantbt/runs?limit=50');
const libRows = lib.j.items;
const labelOf = (l) => libRows.find((r) => r.display_label === l);
const firstStatus = (s) => libRows.find((r) => r.status === s);
const legacy = libRows.find((r) => r.source_kind !== 'RESEARCH_DURABLE' || r.row_kind !== 'LOGICAL_RUN' || r.binding_availability?.state !== 'AVAILABLE');
const PICK = [
  ['R-WFO-027', labelOf('R-WFO-027'), 'per_fold_causal, published RC'],
  ['R-WFO-023', labelOf('R-WFO-023'), 'sealed-local, stale'],
  ['R-WFO-022', labelOf('R-WFO-022'), 'stale seal'],
  ['R-P04-022', labelOf('R-P04-022'), 'three_window_decay'],
  [firstStatus('FAILED')?.display_label, firstStatus('FAILED'), 'FAILED'],
  [firstStatus('CANCELLED')?.display_label, firstStatus('CANCELLED'), 'CANCELLED'],
  [firstStatus('QUEUED')?.display_label, firstStatus('QUEUED'), 'QUEUED'],
].filter(([, row]) => row);
const RUNS = PICK.map(([label, row, why]) => ({ label, run_id: row.run_id, why, row }));
const LEGACY = {
  searched: `${libRows.length} library rows; counters.legacy_metadata_rows=${lib.j.counters?.legacy_metadata_rows}`,
  found: legacy ? legacy.display_label : null,
};
if (legacy && !RUNS.find((r) => r.run_id === legacy.run_id)) RUNS.push({ label: legacy.display_label, run_id: legacy.run_id, why: 'LEGACY/unbound', row: legacy });

/* ------------------------------------------------------------- read set */
const readsFor = (R, alphaId) => ({
  library_ids: `/api/v1/quantbt/runs?ids=${R}`,
  progress: `/api/v1/research/runs/${R}/progress`,
  spec: `/api/v1/research/runs/${R}/requested-spec`,
  evidence: `/api/v1/quantbt/runs/${R}/evidence`,
  cs_evidence: `/api/v1/quantbt/runs/${R}/current-source/evidence`,
  cs_split: `/api/v1/quantbt/runs/${R}/current-source/split`,
  cs_search: `/api/v1/quantbt/runs/${R}/current-source/search`,
  cs_freeze: `/api/v1/quantbt/runs/${R}/current-source/freeze`,
  cs_replay: `/api/v1/quantbt/runs/${R}/current-source/replay?limit=5`,
  sealed_replay: `/api/v1/quantbt/runs/${R}/execute/replay?limit=5`,
  report: `/api/v1/quantbt/runs/${R}/report`,
  rc: `/api/v1/quantbt/runs/${R}/release-candidate`,
  sparkline: `/api/v1/quantbt/runs/${R}/sparkline`,
  lineage: `/api/v1/research/alphas/${alphaId}/lineage`,
  compare_attempts: `/api/v1/research/alphas/${alphaId}/compare?mode=attempts`,
  compare_pair: `/api/v1/research/alphas/${alphaId}/compare?mode=pair&runs=${R},${RUNS[0].run_id === R ? RUNS[1].run_id : RUNS[0].run_id}`,
  compare_markets: `/api/v1/research/alphas/${alphaId}/compare?mode=markets`,
  atlas: '/api/v1/research/quantbt/atlas',
});

async function collect(run) {
  const reads = {};
  const alphaId = run.row.binding?.alpha_id || 'delta-rsi-polynomial-alpha';
  for (const [k, u] of Object.entries(readsFor(run.run_id, alphaId))) reads[k] = { path: u.replace(run.run_id, '{run}'), ...(await G(u)) };
  const fresh = await G('/api/v1/quantbt/runs?limit=50');
  reads.library = { path: '/api/v1/quantbt/runs?limit=50 (row)', s: fresh.s, j: fresh.j?.items?.find((r) => r.run_id === run.run_id) ?? null, list_as_of: fresh.j?.as_of_utc_ms };
  const rcid = reads.rc.j?.local_seal?.release_candidate_id || reads.library.j?.rc?.release_candidate_id || null;
  if (rcid) {
    const av = reads.rc.j?.run?.binding?.alpha_version_id || reads.library.j?.binding?.alpha_version_id;
    reads.pack = { path: '/api/v1/research/release-candidates/{rc}', ...(await G(`/api/v1/research/release-candidates/${rcid}`)) };
    reads.publication = { path: '/api/v1/research/release-candidates/{rc}/publication', ...(await G(`/api/v1/research/release-candidates/${rcid}/publication`)) };
    if (av) reads.av_publication = { path: '/api/v1/research/alpha-versions/{av}/publication', ...(await G(`/api/v1/research/alpha-versions/${av}/publication`)) };
  }
  return reads;
}

/* --------------------------------------------------------------- facts */
const lineageAttempt = (r, run) => r.lineage?.j?.attempts?.find((a) => a.primary_run?.run_id === run.run_id);
const cmpEntry = (r, run, which) => r[which]?.j?.result?.attempts?.find((a) => a.run_id === run.run_id);
const idv = (j, key) => j?.frozen_core?.identity?.find((f) => f.key === key)?.value;
const fieldv = (j, key) => j?.frozen_core?.fields?.find((f) => f.key === key)?.value ?? j?.fields?.find((f) => f.key === key)?.value;
const rail = (R, key) => R.rc?.j?.rail?.find?.((f) => f.key === key)?.value;
const CS = ['cs_evidence', 'cs_split', 'cs_search', 'cs_freeze', 'cs_replay'];
const csProv = (key) => CS.map((n) => [n, (R) => get(R[n]?.j, `provenance.${key}`)]);

/** fact name -> list of [read, getter].  Equalities are asserted across every read that states the fact. */
const FACTS = {
  run_id: (run) => [
    ['library', (R) => R.library.j?.run_id], ['library_ids', (R) => R.library_ids.j?.items?.[0]?.run_id], ['progress', (R) => R.progress.j?.run_id],
    ['spec', (R) => R.spec.j?.run_id], ...CS.map((n) => [n, (R) => R[n].j?.run_id]),
    ['evidence(sealed)', (R) => R.evidence.j?.enriched_analysis?.run_id], ['report', (R) => R.report.j?.run_id],
    ['rc', (R) => R.rc.j?.run_id], ['rc.run.id', (R) => R.rc.j?.run?.id], ['rc.rail.run', (R) => rail(R, 'run')],
    ['pack', (R) => R.pack?.j?.run_id], ['publication', (R) => R.publication?.j?.run_id], ['pack.final_audit_run_id', (R) => fieldv(R.pack?.j, 'final_audit_run_id')],
    ['report.identity.run_id', (R) => idv(R.report.j, 'run_id')], ['sparkline', (R) => R.sparkline.j?.run_id], ['sealed_replay', (R) => R.sealed_replay.j?.run_id],
    ['lineage.primary_run', (R) => lineageAttempt(R, run)?.primary_run?.run_id], ['compare_attempts', (R) => cmpEntry(R, run, 'compare_attempts')?.run_id],
    ['compare_pair', (R) => cmpEntry(R, run, 'compare_pair')?.run_id],
  ],
  display_label: (run) => [
    ['library', (R) => R.library.j?.display_label], ['progress', (R) => R.progress.j?.run?.display_label], ['report', (R) => R.report.j?.display_label],
    ['rc', (R) => R.rc.j?.display_label], ['pack', (R) => R.pack?.j?.display_label],
    ['lineage.primary_run', (R) => lineageAttempt(R, run)?.primary_run?.display_label], ['compare_attempts', (R) => cmpEntry(R, run, 'compare_attempts')?.display_label],
    ['compare_pair', (R) => cmpEntry(R, run, 'compare_pair')?.display_label],
  ],
  alpha_id: () => [
    ['library.binding', (R) => R.library.j?.binding?.alpha_id], ['progress', (R) => R.progress.j?.run?.alpha?.alpha_id], ['spec', (R) => R.spec.j?.alpha_id],
    ['spec.alpha_binding', (R) => R.spec.j?.requested_spec?.alpha_binding?.alpha_id], ['cs_replay.identity', (R) => R.cs_replay.j?.identity?.alpha_id],
    ['rc.run.binding', (R) => R.rc.j?.run?.binding?.alpha_id], ['pack.fields', (R) => fieldv(R.pack?.j, 'alpha_id')], ['rc.fields', (R) => fieldv(R.rc.j, 'alpha_id')],
    ['rc.rail.alpha', (R) => rail(R, 'alpha')], ['publication', (R) => R.publication?.j?.alpha_id], ['lineage.alpha', (R) => R.lineage.j?.alpha?.alpha_id],
    ['report.identity', (R) => idv(R.report.j, 'alpha')], ['sealed_replay', (R) => R.sealed_replay.j?.identity?.alpha_id],
  ],
  alpha_version_id: (run) => [
    ['library.binding', (R) => R.library.j?.binding?.alpha_version_id], ['progress', (R) => R.progress.j?.run?.alpha?.alpha_version_id], ['spec', (R) => R.spec.j?.alpha_version_id],
    ['spec.alpha_binding', (R) => R.spec.j?.requested_spec?.alpha_binding?.alpha_version_id], ['cs_replay.identity', (R) => R.cs_replay.j?.identity?.alpha_version_id],
    ['rc.run.binding', (R) => R.rc.j?.run?.binding?.alpha_version_id], ['pack.fields', (R) => fieldv(R.pack?.j, 'alpha_version_id')], ['rc.fields', (R) => fieldv(R.rc.j, 'alpha_version_id')],
    ['rc.rail.alpha_version', (R) => rail(R, 'alpha_version')], ['publication', (R) => R.publication?.j?.alpha_version_id], ['av_publication', (R) => R.av_publication?.j?.alpha_version_id],
    ['lineage.attempt', (R) => lineageAttempt(R, run)?.alpha_version_id], ['report.identity', (R) => idv(R.report.j, 'alpha_version')],
    ['compare_attempts', (R) => cmpEntry(R, run, 'compare_attempts')?.alpha_version_id], ['sealed_replay', (R) => R.sealed_replay.j?.identity?.alpha_version_id],
  ],
  alpha_code_digest: (run) => [
    ['library.binding.digest', (R) => R.library.j?.binding?.digest], ['pack.fields', (R) => fieldv(R.pack?.j, 'alpha_code_digest')],
    ['rc.fields', (R) => fieldv(R.rc.j, 'alpha_code_digest')], ['rc.pack.ALPHA_VERSION_PASSPORT', (R) => R.rc.j?.pack?.find?.((p) => p.key === 'ALPHA_VERSION_PASSPORT')?.digest],
    ['lineage.version', (R) => { const av = lineageAttempt(R, run)?.alpha_version_id; return R.lineage.j?.alpha?.versions?.find((v) => v.alpha_version_id === av)?.code_digest; }],
  ],
  requested_spec_digest: () => [
    ['progress', (R) => R.progress.j?.run?.requested_spec_digest], ['spec', (R) => R.spec.j?.requested_spec_digest], ...csProv('requested_spec_digest'),
    ['report.source_digests', (R) => R.report.j?.frozen_core?.source_digests?.requested_spec_digest], ['pack.fields', (R) => fieldv(R.pack?.j, 'requested_spec_digest')],
    ['rc.fields', (R) => fieldv(R.rc.j, 'requested_spec_digest')],
  ],
  effective_spec_digest: (run) => [
    ...csProv('effective_spec_digest'), ['report.source_digests', (R) => R.report.j?.frozen_core?.source_digests?.effective_spec_digest],
    ['pack.fields', (R) => fieldv(R.pack?.j, 'effective_spec_digest')], ['rc.fields', (R) => fieldv(R.rc.j, 'effective_spec_digest')],
    ['lineage.primary_run', (R) => lineageAttempt(R, run)?.primary_run?.effective_spec_digest],
    ['compare_attempts.provenance', (R) => cmpEntry(R, run, 'compare_attempts')?.provenance?.effective_spec_digest],
  ],
  dataset_binding_digest: (run) => [
    ...csProv('dataset_binding_digest'), ['report.source_digests', (R) => R.report.j?.frozen_core?.source_digests?.dataset_binding_digest],
    ['pack.fields', (R) => fieldv(R.pack?.j, 'dataset_binding_digest')], ['lineage.primary_run', (R) => lineageAttempt(R, run)?.primary_run?.dataset_binding_digest],
    ['compare_attempts.provenance', (R) => cmpEntry(R, run, 'compare_attempts')?.provenance?.dataset_binding_digest],
  ],
  source_manifest_digest: (run) => [
    ...csProv('source_manifest_digest'), ['cs_freeze.integrity.expected', (R) => R.cs_freeze.j?.integrity?.expected_manifest_digest], ['cs_freeze.integrity.observed', (R) => R.cs_freeze.j?.integrity?.observed_manifest_digest],
    ['report.source_digests', (R) => R.report.j?.frozen_core?.source_digests?.manifest_digest], ['pack.fields', (R) => fieldv(R.pack?.j, 'manifest_digest')],
    ['publication.source.legacy_artifact_sha256', (R) => R.publication?.j?.source?.legacy_artifact_sha256?.replace('sha256:', '')],
    ['compare_attempts.provenance', (R) => cmpEntry(R, run, 'compare_attempts')?.provenance?.manifest_digest],
  ],
  source_transform_digest: () => [...csProv('source_transform_digest'), ['report.source_digests', (R) => R.report.j?.frozen_core?.source_digests?.source_transform_digest], ['pack.fields', (R) => fieldv(R.pack?.j, 'source_transform_digest')]],
  retained_import_digest: () => [...csProv('retained_import_digest'), ['cs_freeze.integrity.expected', (R) => R.cs_freeze.j?.integrity?.expected_retained_import_digest], ['cs_freeze.integrity.observed', (R) => R.cs_freeze.j?.integrity?.observed_retained_import_digest]],
  engine_release_id: (run) => [
    ['progress', (R) => R.progress.j?.run?.engine_release_id], ['spec.client', (R) => R.spec.j?.requested_spec?.client?.engine_release_id], ['pack.fields', (R) => fieldv(R.pack?.j, 'engine_release_id')],
    ['lineage.primary_run', (R) => lineageAttempt(R, run)?.primary_run?.engine_release_id], ['atlas.selected_release_id', (R) => R.atlas.j?.selected_release_id],
  ],
  config_digest: () => [['progress', (R) => R.progress.j?.run?.config_digest], ['spec.client', (R) => R.spec.j?.requested_spec?.client?.config_digest]],
  selected_trial_id: () => [
    ['cs_search.selection', (R) => R.cs_search.j?.selection?.selected_trial_id], ['cs_search.roles.selected', (R) => R.cs_search.j?.selection?.roles?.selected?.trial_id],
    ['cs_freeze.frozen_selection', (R) => R.cs_freeze.j?.frozen_selection?.selected_trial_id], ['rc.selected_params.source_id', (R) => R.rc.j?.selected_params?.selected_trial_source_id],
    ['publication.promotion_pick', (R) => R.publication?.j?.promotion_pick?.selected_trial_id ?? undefined],
  ],
  selected_trial_ordinal: () => [
    ['cs_search.selection', (R) => R.cs_search.j?.selection?.selected_trial_ordinal], ['cs_freeze.frozen_selection', (R) => R.cs_freeze.j?.frozen_selection?.selected_trial_ordinal],
    ['rc.selected_params', (R) => R.rc.j?.selected_params?.selected_trial_number],
  ],
  selected_trial_ordinal_scope: () => [
    ['cs_search.selection', (R) => R.cs_search.j?.selection?.selected_trial_ordinal_scope], ['cs_freeze.frozen_selection', (R) => R.cs_freeze.j?.frozen_selection?.selected_trial_ordinal_scope],
    ['rc.selected_params', (R) => R.rc.j?.selected_params?.selected_trial_number_scope],
  ],
  fold_selection_fold_id: () => [
    ['cs_search.selection', (R) => R.cs_search.j?.selection?.fold_id], ['cs_search.roles.selected', (R) => R.cs_search.j?.selection?.roles?.selected?.fold_id],
    ['cs_freeze.frozen_selection', (R) => R.cs_freeze.j?.frozen_selection?.fold_id], ['rc.selected_params.study_id', (R) => R.rc.j?.selected_params?.selected_trial_study_id],
  ],
  fold_selection_scope: () => [
    ['cs_search.selection', (R) => R.cs_search.j?.selection?.scope], ['cs_search.roles.selected', (R) => R.cs_search.j?.selection?.roles?.selected?.scope],
    ['cs_freeze.frozen_selection', (R) => R.cs_freeze.j?.frozen_selection?.scope],
  ],
  selected_parameters: () => [
    ['cs_search.selection', (R) => R.cs_search.j?.selection?.parameters], ['cs_freeze.frozen_selection', (R) => R.cs_freeze.j?.frozen_selection?.parameters],
  ],
  selected_params_digest: () => [
    ['rc.rail.selected_params', (R) => rail(R, 'selected_params')], ['pack.fields.parameter_bundle_digest', (R) => fieldv(R.pack?.j, 'parameter_bundle_digest')],
    ['rc.fields.parameter_bundle_digest', (R) => fieldv(R.rc.j, 'parameter_bundle_digest')],
  ],
  pack_digest: (run) => [
    ['rc.local_seal', (R) => R.rc.j?.local_seal?.pack_digest], ['pack', (R) => R.pack?.j?.pack_digest], ['publication', (R) => R.publication?.j?.pack_digest],
    ['lineage.release_candidate', (R) => lineageAttempt(R, run)?.release_candidate?.pack_digest],
  ],
  release_candidate_id: (run) => [
    ['library.rc', (R) => R.library.j?.rc?.release_candidate_id], ['rc.local_seal', (R) => R.rc.j?.local_seal?.release_candidate_id], ['pack', (R) => R.pack?.j?.release_candidate_id],
    ['publication', (R) => R.publication?.j?.release_candidate_id], ['pack.fields', (R) => fieldv(R.pack?.j, 'release_candidate_id')],
    ['lineage.release_candidate', (R) => lineageAttempt(R, run)?.release_candidate?.release_candidate_id],
  ],
  source_fingerprint: () => [
    ['rc', (R) => R.rc.j?.source_fingerprint], ['rc.draft', (R) => R.rc.j?.draft?.source_fingerprint], ['pack.frozen_core', (R) => R.pack?.j?.frozen_core?.source_fingerprint],
    ['pack.frozen_core.draft', (R) => R.pack?.j?.frozen_core?.draft?.source_fingerprint],
  ],
  report_revision: () => [['report', (R) => R.report.j?.report_revision], ['pack.fields', (R) => fieldv(R.pack?.j, 'report_revision')], ['rc.fields', (R) => fieldv(R.rc.j, 'report_revision')]],
  evidence_revision: (run) => [
    ['library.evidence_revision', (R) => R.library.j?.evidence_revision], ['cs_evidence.revision', (R) => R.cs_evidence.j?.revision], ['report.source_revisions', (R) => R.report.j?.frozen_core?.source_revisions?.evidence_revision],
    ['pack.fields', (R) => fieldv(R.pack?.j, 'evidence_revision')], ['rc.fields', (R) => fieldv(R.rc.j, 'evidence_revision')],
    ['compare_attempts.provenance', (R) => cmpEntry(R, run, 'compare_attempts')?.provenance?.evidence_revision ?? undefined],
  ],
  split_revision: () => [['cs_split.revision', (R) => R.cs_split.j?.revision], ['report.source_revisions', (R) => R.report.j?.frozen_core?.source_revisions?.split_revision]],
  search_revision: () => [['cs_search.revision', (R) => R.cs_search.j?.revision], ['report.source_revisions', (R) => R.report.j?.frozen_core?.source_revisions?.search_revision]],
  freeze_revision: () => [['cs_freeze.revision', (R) => R.cs_freeze.j?.revision], ['report.source_revisions', (R) => R.report.j?.frozen_core?.source_revisions?.freeze_revision]],
  replay_revision: () => [['cs_replay.revision', (R) => R.cs_replay.j?.revision], ['report.source_revisions', (R) => R.report.j?.frozen_core?.source_revisions?.replay_revision]],
  workspace_id: () => [
    ['cs_replay.page.next_cursor', (R) => (R.cs_replay.j?.replay?.page?.next_cursor ? wsFromCursor(R.cs_replay.j.replay.page.next_cursor) : undefined)],
    ['execution.approval-inbox', () => EXEC_BEFORE.inbox.workspace_id],
    ['execution.runtime-manifest', () => EXEC_BEFORE.manifest.workspace_id],
    ...['progress', 'spec', 'rc', 'report', 'pack', 'publication', 'lineage', 'compare_attempts', 'cs_search', 'cs_freeze'].map((n) => [`${n}.workspace_id`, (R) => R[n]?.j?.workspace_id]),
  ],
};

function evalFact(name, run, R) {
  const stated = [];
  for (const [read, fn] of FACTS[name](run)) {
    let v; try { v = fn(R); } catch { v = undefined; }
    if (v === undefined || v === null) continue;
    // current-source reads of a non-RS02 lane (availability != AVAILABLE) carry placeholder revisions/digests: not a statement about the run
    const base = read.split('.')[0];
    if (base.startsWith('cs_') && R[base]?.j?.availability?.state && R[base].j.availability.state !== 'AVAILABLE') continue;
    stated.push([read, v]);
  }
  if (stated.length < 2) {
    return { result: 'NOT_APPLICABLE', detail: stated.length ? `only one read states it: ${stated[0][0]}=${short(stated[0][1])}` : 'no read states it', values: stated.map(([r, v]) => [r, short(v)]) };
  }
  const k0 = canon(stated[0][1]);
  const bad = stated.filter(([, v]) => canon(v) !== k0);
  return bad.length === 0
    ? { result: 'PASS', detail: `${stated.length} reads equal ${short(stated[0][1])} [${stated.map(([r]) => r).join(', ')}]`, values: stated.map(([r, v]) => [r, short(v)]) }
    : { result: 'FAIL', detail: `expected ${short(stated[0][1])} (${stated[0][0]}); differs: ${bad.map(([r, v]) => `${r}=${short(v)}`).join('; ')}`, expected: `${short(stated[0][1])} (${stated[0][0]})`, actual: bad.map(([r, v]) => `${r}=${short(v)}`).join('; '), endpoints: stated.map(([r]) => r), values: stated.map(([r, v]) => [r, short(v)]) };
}

/* ---------------------------------------------- chronology / stability / cutoff */
const VOLATILE = /^(as_of.*|read_at.*|request_id|.*cursor.*|.*issued.*|.*expires.*|list_as_of|generated.*|captured_at|presentation_digest)$/;
function strip(o) {
  if (Array.isArray(o)) return o.map(strip);
  if (o && typeof o === 'object') return Object.fromEntries(Object.entries(o).filter(([k]) => !VOLATILE.test(k)).map(([k, v]) => [k, strip(v)]));
  return o;
}
function diffPaths(a, b, p = '', out = []) {
  if (out.length > 4) return out;
  if (a && b && typeof a === 'object' && typeof b === 'object') { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diffPaths(a[k], b[k], `${p}.${k}`, out); }
  else if (canon(a) !== canon(b)) out.push(`${p}: ${short(a)} -> ${short(b)}`);
  return out;
}

function chronology(run, R) {
  const pk = R.pack?.j?.sealed_at_utc_ms, ls = R.rc.j?.local_seal?.sealed_at_utc_ms;
  const seq = [
    ['library.created_at', R.library.j?.created_at_utc_ms], ['progress.queued_at', R.progress.j?.queue?.queued_at_utc_ms],
    ['cs.retained_at', R.cs_evidence.j?.provenance?.retained_at_utc_ms], ['cs_evidence.as_of', R.cs_evidence.j?.as_of_utc_ms],
    ['report.sealed_at', R.report.j?.sealed_at_utc_ms], ['rc.local_seal.sealed_at', ls], ['pack.sealed_at', pk],
  ].filter(([, v]) => typeof v === 'number');
  const tail = [['publication.as_of', R.publication?.j?.as_of_utc_ms], ['rc.as_of', R.rc.j?.as_of_utc_ms], ['library.list_as_of', R.library.list_as_of]].filter(([, v]) => typeof v === 'number');
  const problems = [];
  for (let i = 1; i < seq.length; i++) if (seq[i][1] < seq[i - 1][1]) problems.push(`${seq[i][0]}(${seq[i][1]}) < ${seq[i - 1][0]}(${seq[i - 1][1]})`);
  const maxSeq = Math.max(0, ...seq.map(([, v]) => v));
  for (const [n, v] of tail) if (v < maxSeq) problems.push(`${n}(${v}) < latest sealed/retained(${maxSeq})`);
  if (typeof pk === 'number' && typeof ls === 'number' && pk !== ls) problems.push(`pack.sealed_at(${pk}) != rc.local_seal.sealed_at(${ls})`);
  if (seq.length + tail.length < 2) return { result: 'NOT_APPLICABLE', detail: `only ${seq.length + tail.length} timestamp(s) present` };
  const all = [...seq, ...tail];
  return problems.length ? { result: 'FAIL', detail: problems.join('; '), expected: 'non-decreasing created<=retained<=sealed<=later as_of', actual: problems.join('; '), endpoints: all.map(([n]) => n), values: all }
    : { result: 'PASS', detail: `${all.length} timestamps non-decreasing: ${all.map(([n, v]) => `${n}=${v}`).join(', ')}`, values: all };
}

const cutoffFor = (spec) => {
  const rs = spec?.requested_spec; if (!rs) return null;
  if (rs.walk_forward?.end_exclusive) return { kind: 'walk_forward.end_exclusive', end: ms(rs.walk_forward.end_exclusive) };
  if (rs.end_exclusive) return { kind: 'end_exclusive', end: ms(rs.end_exclusive) };
  const w = rs.oos ? rs : (rs.windows || rs);
  if (w?.oos?.end_exclusive) return { kind: 'oos.end_exclusive (holdout never served)', end: ms(w.oos.end_exclusive) };
  return null;
};
const timesIn = (o, out = []) => {
  if (Array.isArray(o)) o.forEach((v) => timesIn(v, out));
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (/^(at_utc_ms|ts_utc_ms|time_utc_ms|observed_at_utc_ms)$/.test(k) && typeof v === 'number') out.push(v); else timesIn(v, out); }
  return out;
};
async function replayCutoff(run, R) {
  const wf = cutoffFor(R.spec.j);
  if (!wf) return { result: 'NOT_APPLICABLE', detail: `no declared window end in the requested spec (spec ${R.spec.s})` };
  if (R.cs_replay.s !== 200 || R.cs_replay.j?.availability?.state !== 'AVAILABLE') return { result: 'NOT_APPLICABLE', detail: `cs_replay ${R.cs_replay.s} ${R.cs_replay.j?.availability?.state ?? R.cs_replay.j?.error?.code}` };
  const times = []; let cursor = null; let pages = 0; const declared = R.cs_replay.j.replay.source_observation_count;
  do {
    const u = `/api/v1/quantbt/runs/${run.run_id}/current-source/replay?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const r = await G(u);
    if (r.s !== 200) return { result: 'FAIL', detail: `replay page ${pages + 1} -> ${r.s} ${r.j?.error?.code}`, expected: '200', actual: String(r.s), endpoints: [`GET ${u.split('&cursor')[0]}`] };
    times.push(...(r.j.replay.rows || []).map((x) => x.at_utc_ms)); cursor = r.j.replay.page.has_more ? r.j.replay.page.next_cursor : null; pages++;
  } while (cursor && pages < 40);
  const evTimes = timesIn(R.cs_evidence.j?.series);
  const maxBar = Math.max(...times), minBar = Math.min(...times), maxEv = evTimes.length ? Math.max(...evTimes) : null;
  const late = times.filter((t) => t >= wf.end).length, evLate = evTimes.filter((t) => t >= wf.end).length;
  const iso = (t) => new Date(t).toISOString();
  const detail = `served ${times.length}/${declared} bars ${iso(minBar)}..${iso(maxBar)} max; declared ${wf.kind}=${iso(wf.end)} (exclusive); late replay bars=${late}; evidence-series points=${evTimes.length}${maxEv ? ` max=${iso(maxEv)}` : ''} late=${evLate}`;
  return late || evLate
    ? { result: 'FAIL', detail, expected: `all at_utc_ms < ${iso(wf.end)}`, actual: `replay late=${late}, evidence late=${evLate}`, endpoints: ['GET .../current-source/replay', 'GET .../current-source/evidence'] }
    : { result: 'PASS', detail };
}

/* ------------------------------------------------------- execution snapshot */
const execSnap = async () => {
  const [inbox, ops, manifest] = await Promise.all([G('/api/v1/execution/governance/approvals'), G('/api/v1/execution/operations'), G('/api/v1/execution/runtime-manifest')]);
  const counts = (j) => Object.fromEntries(Object.entries(j || {}).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.length]));
  return { inbox: inbox.j || {}, ops: ops.j || {}, manifest: manifest.j || {}, statuses: [inbox.s, ops.s, manifest.s],
    summary: { inbox_counts: { ...counts(inbox.j), ...(inbox.j?.counts || {}), page: inbox.j?.page }, inbox_digest: sha(strip(inbox.j)).slice(0, 12), ops_counts: { ...counts(ops.j), page: ops.j?.page }, ops_digest: sha(strip(ops.j)).slice(0, 12) } };
};
const EXEC_BEFORE = await execSnap();
const LIB_STATUS_BEFORE = Object.fromEntries(libRows.map((r) => [r.run_id, r.status]));

/* ================================================================ per run */
const round1 = {}, round2 = {};
for (const run of RUNS) round1[run.run_id] = await collect(run);
const t1 = Date.now();
await sleep(WAIT_MS);
for (const run of RUNS) round2[run.run_id] = await collect(run);
const gapMs = Date.now() - t1;

const out = { generated_at: new Date().toISOString(), base: BASE, public_origin: ORIGIN, wait_ms: WAIT_MS, runs: [], legacy: LEGACY, security: [], summary: {} };
for (const run of RUNS) {
  const R = round1[run.run_id], R2 = round2[run.run_id];
  const checks = [];
  const add = (id, c) => checks.push({ id, ...c });
  for (const f of Object.keys(FACTS)) add(`eq:${f}`, evalFact(f, run, R));
  add('chronology', chronology(run, R));
  const diffs = []; const dig = {}; const asOfBack = [];
  for (const k of Object.keys(R)) {
    if (!R[k] || !R2[k]) continue;
    const a = strip(R[k].j), b = strip(R2[k].j); dig[k] = `${R[k].s}:${sha(a).slice(0, 12)}`;
    if (R[k].s !== R2[k].s || canon(a) !== canon(b)) diffs.push(`${k} [${R[k].path}]: ${R[k].s}->${R2[k].s} ${diffPaths(a, b).slice(0, 3).join(' | ')}`);
    const x = R[k].j?.as_of_utc_ms, y = R2[k].j?.as_of_utc_ms;
    if (typeof x === 'number' && typeof y === 'number' && y < x) asOfBack.push(`${k}: ${x} -> ${y}`);
  }
  add('stability_5s', diffs.length || asOfBack.length
    ? { result: 'FAIL', detail: [...diffs, ...asOfBack.map((s) => `as_of went backwards ${s}`)].join('; '), expected: 'identical digests (volatile keys stripped) and non-decreasing as_of', actual: [...diffs, ...asOfBack].join('; '), endpoints: diffs.map((d) => d.split(' ')[0]) }
    : { result: 'PASS', detail: `${Object.keys(dig).length} reads identical after ${Math.round(gapMs / 1000)}s round gap (volatile as_of*/cursors stripped): ${Object.entries(dig).filter(([, v]) => v.startsWith('200')).map(([k, v]) => `${k}=${v.slice(4)}`).join(', ')}` });
  add('as_of_monotone_across_rounds', (() => {
    const bad = []; let n = 0;
    for (const k of Object.keys(R)) { const x = R[k]?.j?.as_of_utc_ms, y = R2[k]?.j?.as_of_utc_ms; if (typeof x !== 'number' || typeof y !== 'number') continue; n++; if (y < x) bad.push(k); }
    return n ? (bad.length ? { result: 'FAIL', detail: `as_of regressed on ${bad.join(',')}`, expected: 'non-decreasing', actual: bad.join(','), endpoints: bad } : { result: 'PASS', detail: `${n} reads with as_of: none regressed between rounds` }) : { result: 'NOT_APPLICABLE', detail: 'no read states as_of' };
  })());
  add('replay_cutoff', await replayCutoff(run, R));
  const status = Object.fromEntries(Object.entries(R).map(([k, v]) => [k, `${v.s}${v.j?.error?.code ? ' ' + v.j.error.code : ''}${v.j?.availability?.state && v.j.availability.state !== 'AVAILABLE' ? ' ' + v.j.availability.state : ''}`]));
  out.runs.push({ label: run.label, run_id: run.run_id, why: run.why, library_status: run.row.status, read_statuses: status, checks });
}

/* ================================================================ security */
const sec = (id, name, expected, result, detail, extra = {}) => out.security.push({ id, name, expected, result, detail, ...extra });
const R027 = RUNS[0];
const rid = R027.run_id;
const ownWs = EXEC_BEFORE.inbox.workspace_id;
const FOREIGN_WS = 'ws_00000000000000000000000000';
const shapeOf = (j) => (j && typeof j === 'object' ? Object.keys(j).sort().join(',') + '|' + (j.error ? Object.keys(j.error).sort().join(',') : '') : typeof j);

// S1 unauthenticated
{
  const anon = await browser.newContext();
  const dev = await browser.newContext({ extraHTTPHeaders: DEV_HEADERS });
  for (const u of [`/api/v1/quantbt/runs/${rid}/evidence`, `/api/v1/research/runs/${rid}/progress`, '/api/v1/quantbt/runs?limit=5', `/api/v1/quantbt/runs/${rid}/current-source/replay?limit=1`]) {
    const a = await anon.request.get(BASE + u); const b = await dev.request.get(BASE + u);
    const body = await a.text();
    sec('S1', `unauthenticated GET ${u.replace(rid, '{run}').split('?')[0]} (no cookie, no dev header)`, '401', a.status() === 401 ? 'PASS' : 'FAIL',
      `anon -> ${a.status()} ${body.slice(0, 90).replace(/\s+/g, ' ')}; dev-header-only without session cookie -> ${b.status()}`, { endpoint: u.replace(rid, '{run}'), status: a.status(), dev_header_only_status: b.status() });
  }
  await anon.close(); await dev.close();
}

// S2 not-found uniformity
{
  const unknown = 'rrun_' + sha('p24-AA-unknown').slice(0, 32);
  const foreign = 'rrun_' + sha('p24-AA-foreign').slice(0, 32);
  const eps = [(r) => `/api/v1/quantbt/runs/${r}/evidence`, (r) => `/api/v1/research/runs/${r}/progress`, (r) => `/api/v1/quantbt/runs/${r}/current-source/search`, (r) => `/api/v1/quantbt/runs/${r}/release-candidate`, (r) => `/api/v1/quantbt/runs/${r}/report`, (r) => `/api/v1/research/runs/${r}/requested-spec`, (r) => `/api/v1/quantbt/runs/${r}/current-source/replay?limit=1`];
  for (const ep of eps) {
    const a = await G(ep(unknown)); const b = await G(ep(foreign));
    const q = (u) => u + (u.includes('?') ? '&' : '?') + `workspace_id=${FOREIGN_WS}`;
    const c = await G(q(ep(rid))); const d = await G(q(ep(unknown)));
    const name = ep('{run}').split('?')[0];
    const same = shapeOf(a.j) === shapeOf(b.j) && a.j?.error?.code === b.j?.error?.code && a.j?.error?.message === b.j?.error?.message;
    sec('S2', `${name}: unknown id and well-formed foreign id -> 404, identical body shape/code/message`, '404, identical', a.s === 404 && b.s === 404 && same ? 'PASS' : 'FAIL',
      `unknown -> ${a.s} ${a.j?.error?.code}; foreign -> ${b.s} ${b.j?.error?.code}; shapes ${same ? 'identical' : 'DIFFER'}`, { endpoint: name });
    const indist = c.s === d.s && c.j?.error?.code === d.j?.error?.code && c.j?.error?.message === d.j?.error?.message;
    sec('S2w', `${name}: under a foreign workspace_id an existing run and a nonexistent run answer identically (no run-existence oracle)`, `${d.s} ${d.j?.error?.code} + same message`, indist ? 'PASS' : 'FAIL',
      `existing+foreign-ws -> ${c.s} ${c.j?.error?.code} "${c.j?.error?.message ?? ''}"; nonexistent+foreign-ws -> ${d.s} ${d.j?.error?.code} "${d.j?.error?.message ?? ''}"`, { endpoint: `${name}?workspace_id=<foreign>`, status: c.s, code: c.j?.error?.code });
    const sameMsg = c.j?.error?.message === a.j?.error?.message;
    sec('S2m', `${name}: foreign-workspace message vs own-workspace unknown-run message (workspace-existence wording)`, 'informational', sameMsg ? 'PASS' : 'PASS_WITH_NOTE',
      `foreign-ws "${c.j?.error?.message ?? ''}" vs unknown-run "${a.j?.error?.message ?? ''}" (same status ${c.s}/${a.s}, same code ${c.j?.error?.code === a.j?.error?.code}); the wording tells a caller which of workspace/run was missing`, { endpoint: `${name}?workspace_id=<foreign>` });
  }
}

// S3 writes without same-origin / CSRF (target = COMPLETED run, so even a wrongly accepted cancel is a 409 no-op)
{
  const target = RUNS.find((r) => r.row.status === 'COMPLETED' && r.label !== 'R-WFO-027') || R027;
  const url = `${BASE}/api/v1/research/runs/${target.run_id}/cancel`;
  for (const [name, headers] of [['no Origin header, no CSRF header', {}], ['cross-site Origin (https://evil.example), no CSRF header', { origin: 'https://evil.example' }], ['correct Origin, no x-portal-csrf header', { origin: ORIGIN }]]) {
    const r = await page.request.post(url, { data: {}, headers, failOnStatusCode: false });
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* */ }
    const st = r.status();
    sec('S3', `write refused: ${name}`, '403 (any 4xx refusal acceptable; never 2xx)', st === 403 ? 'PASS' : (st >= 400 && st < 500 ? 'PASS_WITH_NOTE' : 'FAIL'),
      `POST .../runs/${target.label}/cancel -> ${st} ${j?.error?.code ?? t.slice(0, 80)}`, { endpoint: 'POST /api/v1/research/runs/{run}/cancel', status: st, code: j?.error?.code ?? null });
  }
  const after = await G('/api/v1/quantbt/runs?limit=50');
  const changed = after.j.items.filter((r) => LIB_STATUS_BEFORE[r.run_id] !== r.status).map((r) => `${r.display_label}:${LIB_STATUS_BEFORE[r.run_id]}->${r.status}`);
  sec('S3-state', 'refused writes changed no run state', 'no library status change', changed.length ? 'FAIL' : 'PASS', changed.length ? `status changed: ${changed.join(',')}` : `all ${after.j.items.length} library statuses unchanged`, { endpoint: 'GET /api/v1/quantbt/runs' });
}

// S4 legacy export before prepare
for (const run of [R027, RUNS[1], RUNS[2]].filter(Boolean)) {
  const r = await G(`/api/runs/${run.run_id}/export`);
  const archive = /zip|octet-stream|tar|gzip/i.test(r.ct) || r.len > 2000;
  sec('S4', `legacy GET /api/runs/{id}/export before prepare (${run.label})`, '404; no archive built/served', r.s === 404 && !archive ? 'PASS' : 'FAIL',
    `-> ${r.s} content-type=${r.ct.split(';')[0]} bytes=${r.len} ${JSON.stringify(r.j)?.slice(0, 80)}`, { endpoint: 'GET /api/runs/{run}/export', status: r.s, content_type: r.ct, bytes: r.len });
}

// S5 tampered / unknown query params
{
  const base = `/api/v1/research/runs/${rid}/progress`;
  const own = await G(`${base}?workspace_id=${ownWs}`);
  const none = await G(base);
  sec('S5', 'own workspace_id query yields the same body as no workspace_id', '200, identical', own.s === 200 && canon(strip(own.j)) === canon(strip(none.j)) ? 'PASS' : 'FAIL', `own -> ${own.s}, bare -> ${none.s}`, { endpoint: base.replace(rid, '{run}') });
  const bareSame = (r) => canon(strip(r.j)) === canon(strip(none.j));
  for (const [name, u, pred] of [
    ['foreign workspace_id', `${base}?workspace_id=${FOREIGN_WS}`, (r) => r.s === 404 || r.s === 403],
    ['duplicate workspace_id (own then foreign)', `${base}?workspace_id=${ownWs}&workspace_id=${FOREIGN_WS}`, (r) => r.s >= 400 || bareSame(r)],
    ['duplicate workspace_id (foreign then own)', `${base}?workspace_id=${FOREIGN_WS}&workspace_id=${ownWs}`, (r) => r.s >= 400 || bareSame(r)],
    ['encoded injection workspace_id', `${base}?workspace_id=${encodeURIComponent(ownWs + '&x=1')}`, (r) => r.s >= 400],
    ['unknown extra params do not change scope', `${base}?bogus=1&workspace_id_override=${FOREIGN_WS}`, (r) => r.s >= 400 || bareSame(r)],
  ]) { const r = await G(u); sec('S5', name, 'refused (4xx) or body identical to own workspace; never foreign data', pred(r) ? 'PASS' : 'FAIL', `-> ${r.s} ${r.j?.error?.code ?? ''}`, { endpoint: u.replace(rid, '{run}').replace(ownWs, '<own>'), status: r.s }); }
  const libF = await G(`/api/v1/quantbt/runs?limit=50&workspace_id=${FOREIGN_WS}`);
  sec('S5', 'library list with foreign workspace_id returns none of the own rows', '4xx or empty items', libF.s >= 400 || libF.j?.items?.length === 0 ? 'PASS' : 'FAIL', `-> ${libF.s} items=${libF.j?.items?.length ?? 'n/a'} ${libF.j?.error?.code ?? ''}`, { endpoint: '/api/v1/quantbt/runs?workspace_id=<foreign>', status: libF.s });
  const cs = await G(`/api/v1/quantbt/runs/${rid}/current-source/replay?limit=1&workspace_id=${FOREIGN_WS}`);
  sec('S5', 'current-source replay with foreign workspace_id', '404/403', cs.s === 404 || cs.s === 403 ? 'PASS' : 'FAIL', `-> ${cs.s} ${cs.j?.error?.code ?? ''}`, { endpoint: '/current-source/replay?workspace_id=<foreign>', status: cs.s });
  const nc = round1[rid].cs_replay.j?.replay?.page?.next_cursor;
  if (nc) { const r = await G(`/api/v1/quantbt/runs/${rid}/current-source/replay?limit=1&cursor=${encodeURIComponent(nc)}&workspace_id=${FOREIGN_WS}`); sec('S5', 'own-workspace cursor replayed under foreign workspace_id', '4xx', r.s >= 400 ? 'PASS' : 'FAIL', `-> ${r.s} ${r.j?.error?.code ?? ''}`, { endpoint: '/current-source/replay?cursor=<own>&workspace_id=<foreign>', status: r.s }); }
}

// S6 aggregate of per-run replay_cutoff (S08 replay lane)
{
  const rows = out.runs.map((r) => [r.label, r.checks.find((c) => c.id === 'replay_cutoff')]);
  sec('S6', 'replay/evidence never serve rows at/after the declared cutoff (S08 replay lane)', 'max served bar time < declared OOS/WFO end',
    rows.some(([, c]) => c.result === 'FAIL') ? 'FAIL' : (rows.some(([, c]) => c.result === 'PASS') ? 'PASS' : 'NOT_APPLICABLE'),
    rows.map(([l, c]) => `${l}: ${c.result} ${c.detail}`).join(' || '), { endpoint: 'GET .../current-source/replay (all pages) + /current-source/evidence' });
}

// S7 execution isolation
{
  const after = await execSnap();
  const same = canon(EXEC_BEFORE.summary) === canon(after.summary);
  sec('S7', 'Execution endpoint counts unchanged by the probes (approval inbox, operations queue)', 'identical counts + stripped-body digests', same ? 'PASS' : 'FAIL',
    `before ${JSON.stringify(EXEC_BEFORE.summary)}; after ${JSON.stringify(after.summary)}. GET /api/v1/execution/deployments does not exist (404), so no deployments list is readable.`, { endpoint: 'GET /api/v1/execution/governance/approvals, /api/v1/execution/operations', before: EXEC_BEFORE.summary, after: after.summary });
}
await browser.close();

/* ================================================================ summary + receipt */
const tally = { PASS: 0, FAIL: 0, NOT_APPLICABLE: 0, PASS_WITH_NOTE: 0 };
const failures = [];
for (const r of out.runs) for (const c of r.checks) { tally[c.result]++; if (c.result === 'FAIL') failures.push({ scope: r.label, id: c.id, endpoint: (c.endpoints || []).join(' vs '), expected: c.expected ?? '', actual: c.actual ?? c.detail }); }
for (const s of out.security) { tally[s.result] = (tally[s.result] || 0) + 1; if (s.result === 'FAIL') failures.push({ scope: 'security', id: s.id, endpoint: s.endpoint || s.name, expected: s.expected, actual: s.detail }); }
out.summary = { tally, failures: failures.length, runs: RUNS.length, gets_issued: GETS.length, wait_ms: WAIT_MS };
out.failures = failures;
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/p24-reconcile-result.json`, JSON.stringify(out, null, 2) + '\n');

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const md = [];
md.push(`# P24 FE reconcile receipt (AA) - ${DATE}`, '',
  `Read-only against the Research preview \`${BASE}\` (public \`${ORIGIN}\`). Script: \`scripts/research-preview/p24-reconcile.mjs\` (re-runnable). Machine-readable: \`p24-reconcile-result.json\`. Digests truncated to 12 hex. Tests: P24-T14, FND-19, FND-07, FND-09, FND-16, FND-17.`, '',
  `Runs: ${RUNS.map((r) => `${r.label} (${r.why})`).join('; ')}.`, '',
  `Legacy/historical run: ${LEGACY.found ? `used ${LEGACY.found}` : `NOT_APPLICABLE - none exists on this preview (${LEGACY.searched}; every row is RESEARCH_DURABLE / LOGICAL_RUN / binding AVAILABLE)`}.`, '',
  `Totals: PASS ${tally.PASS}, FAIL ${tally.FAIL}, NOT_APPLICABLE ${tally.NOT_APPLICABLE}${tally.PASS_WITH_NOTE ? `, PASS_WITH_NOTE ${tally.PASS_WITH_NOTE}` : ''}. Stability: two full read rounds >= ${WAIT_MS / 1000}s apart.`, '');
md.push('## Failures', '');
if (!failures.length) md.push('None.', '');
else {
  md.push('| # | scope | check | endpoint(s) | expected | actual |', '|---|---|---|---|---|---|');
  failures.forEach((f, i) => md.push(`| ${i + 1} | ${esc(f.scope)} | ${esc(f.id)} | ${esc(short(f.endpoint))} | ${esc(short(f.expected))} | ${esc(short(f.actual))} |`));
  md.push('');
}
md.push('## Security negative probes', '', '| id | probe | expected | result | actual |', '|---|---|---|---|---|');
for (const s of out.security) md.push(`| ${esc(s.id)} | ${esc(s.name)} | ${esc(s.expected)} | ${s.result} | ${esc(short(s.detail)).slice(0, 420)} |`);
md.push('', '## Run x check matrix', '');
const ids = out.runs[0].checks.map((c) => c.id);
md.push(`| check | ${out.runs.map((r) => r.label).join(' | ')} |`, `|---|${out.runs.map(() => '---').join('|')}|`);
for (const id of ids) md.push(`| ${id} | ${out.runs.map((r) => { const c = r.checks.find((x) => x.id === id); return c ? (c.result === 'NOT_APPLICABLE' ? 'N/A' : c.result) : '-'; }).join(' | ')} |`);
md.push('', 'N/A = NOT_APPLICABLE (fewer than two reads state the value for that run, e.g. no RC, search or freeze for an unsealed, failed, cancelled or queued run).', '', '## Per-run detail (actual values)', '');
for (const r of out.runs) {
  md.push(`### ${r.label} - ${r.why} (${r.library_status})`, '', `Read statuses: ${Object.entries(r.read_statuses).map(([k, v]) => `${k}=${v}`).join(', ')}`, '', '| check | result | values / detail |', '|---|---|---|');
  for (const c of r.checks) md.push(`| ${c.id} | ${c.result === 'NOT_APPLICABLE' ? 'N/A' : c.result} | ${esc(short(c.detail)).slice(0, 420)} |`);
  md.push('');
}
md.push('## Equalities checked', '', 'Each `eq:` row asserts that every listed read which states the value gives an identical one (reads absent/unpublished for a run are skipped; fewer than two = N/A):', '');
for (const f of Object.keys(FACTS)) md.push(`- \`${f}\`: ${[...new Set(FACTS[f](RUNS[0]).map(([n]) => n))].join(' == ')}`);
md.push('', 'Also: `chronology` (created <= retained <= sealed <= later as_of; pack.sealed_at == rc.local_seal.sealed_at), `stability_5s` (two reads 5s apart, volatile keys as_of*/cursors stripped, digests equal), `as_of_monotone_across_rounds`, `replay_cutoff` (all replay pages + evidence-series points strictly before the declared window end).', '');
md.push('## Triage notes (context for the FAIL rows; none is downgraded)', '',
  '- `*_revision` FAILs: the sealed report pins source revisions (`frozen_core.source_revisions`) that differ from the live `current-source/*` revisions. For R-WFO-023/022 (stale seals) the evidence/fingerprint drift is the expected stale-seal condition; for R-WFO-027 (fresh seal) evidence_revision matches but split/search/freeze do not, and split_revision == replay_revision inside the report - a real cross-screen identity gap to review.',
  '- `eq:source_manifest_digest`: Compare(attempts).provenance.manifest_digest is a different value from every other manifest digest (and identical for R-WFO-022 and R-WFO-023), i.e. it is not the per-run source manifest.',
  '- `stability_5s` on publication: `updated_at_utc_ms` moves between reads of the same unchanged publication (tracks wall clock, not a stored timestamp).',
  '- `S2m` PASS_WITH_NOTE: error wording differs between foreign-workspace and unknown-run (same status and code).',
  '- S7 note: the Execution approval inbox and operations queue are empty on this preview (fixture delivery profile), so the before/after equality is weak evidence for isolation.', '');
writeFileSync(`${OUT}/FE_RECONCILE_RECEIPT_${DATE}.md`, md.join('\n'));
console.log(JSON.stringify(out.summary), '\nwrote', OUT);
