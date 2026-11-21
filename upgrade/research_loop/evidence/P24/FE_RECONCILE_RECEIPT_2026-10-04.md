# P24 FE reconcile receipt (AA) - 2026-10-04

Read-only against the Research preview `http://localhost:8095` (public `https://research-portal.primusspark.com`). Script: `scripts/research-preview/p24-reconcile.mjs` (re-runnable). Machine-readable: `p24-reconcile-result.json`. Digests truncated to 12 hex. Tests: P24-T14, FND-19, FND-07, FND-09, FND-16, FND-17.

Runs: R-WFO-027 (per_fold_causal, published RC); R-WFO-023 (sealed-local, stale); R-WFO-022 (stale seal); R-P04-022 (three_window_decay); R-P04-020 (FAILED); R-WFO-019 (CANCELLED); R-WFO-025 (QUEUED).

Legacy/historical run: NOT_APPLICABLE - none exists on this preview (50 library rows; counters.legacy_metadata_rows=0; every row is RESEARCH_DURABLE / LOGICAL_RUN / binding AVAILABLE).

Totals: PASS 182, FAIL 18, NOT_APPLICABLE 75, PASS_WITH_NOTE 6. Stability: two full read rounds >= 5s apart.

## Failures

| # | scope | check | endpoint(s) | expected | actual |
|---|---|---|---|---|---|
| 1 | R-WFO-027 | eq:source_manifest_digest | cs_evidence vs cs_split vs cs_search vs cs_freeze vs cs_replay vs cs_freeze.integrity.expected vs cs_freeze.integrity.observed vs report.source_digests vs pack. | 1df90ba5e094 (cs_evidence) | compare_attempts.provenance=d72af53355ac |
| 2 | R-WFO-027 | eq:split_revision | cs_split.revision vs report.source_revisions | rs02_split_d12ed6b8878f (cs_split.revision) | report.source_revisions=rs02_split_e08c93a775ce |
| 3 | R-WFO-027 | eq:search_revision | cs_search.revision vs report.source_revisions | rs02_search_cb72db4b48a7 (cs_search.revision) | report.source_revisions=rs02_search_907372db8e6d |
| 4 | R-WFO-027 | eq:freeze_revision | cs_freeze.revision vs report.source_revisions | rs02_freeze_9d0f43d1f3d2 (cs_freeze.revision) | report.source_revisions=rs02_freeze_e41d87877df9 |
| 5 | R-WFO-023 | eq:source_manifest_digest | cs_evidence vs cs_split vs cs_search vs cs_freeze vs cs_replay vs cs_freeze.integrity.expected vs cs_freeze.integrity.observed vs report.source_digests vs pack. | afc3d407ee73 (cs_evidence) | compare_attempts.provenance=39db7cf1bc7b |
| 6 | R-WFO-023 | eq:source_fingerprint | rc vs rc.draft vs pack.frozen_core | 74b266bcb64f (rc) | rc.draft=805ec9becf34; pack.frozen_core=805ec9becf34 |
| 7 | R-WFO-023 | eq:evidence_revision | cs_evidence.revision vs report.source_revisions vs pack.fields vs rc.fields | rs02_evidence_399badcf84a0 (cs_evidence.revision) | report.source_revisions=rs02_evidence_7533074a250a; pack.fields=rs02_evidence_7533074a250a |
| 8 | R-WFO-023 | eq:split_revision | cs_split.revision vs report.source_revisions | rs02_split_0929f7599740 (cs_split.revision) | report.source_revisions=rs02_split_7533074a250a |
| 9 | R-WFO-023 | eq:search_revision | cs_search.revision vs report.source_revisions | rs02_search_ecc5a8e1e96e (cs_search.revision) | report.source_revisions=rs02_search_7533074a250a |
| 10 | R-WFO-023 | eq:freeze_revision | cs_freeze.revision vs report.source_revisions | rs02_freeze_bce796b9e439 (cs_freeze.revision) | report.source_revisions=rs02_freeze_2cec6d9bcfd8 |
| 11 | R-WFO-023 | stability_5s | sparkline vs publication | identical digests (volatile keys stripped) and non-decreasing as_of | sparkline [/api/v1/quantbt/runs/{run}/sparkline]: 200->503 .schema_version: research.run-sparkline.v1 -> undefined \| .run_id: rrun_3d5633d2adb7 -> undefined \| . |
| 12 | R-WFO-022 | eq:source_manifest_digest | cs_evidence vs cs_split vs cs_search vs cs_freeze vs cs_replay vs cs_freeze.integrity.expected vs cs_freeze.integrity.observed vs report.source_digests vs pack. | 3c2f6cefdcfe (cs_evidence) | compare_attempts.provenance=39db7cf1bc7b |
| 13 | R-WFO-022 | eq:source_fingerprint | rc vs rc.draft vs pack.frozen_core | d2c4f2a6c1b4 (rc) | rc.draft=b38ff999f780; pack.frozen_core=b38ff999f780 |
| 14 | R-WFO-022 | eq:evidence_revision | cs_evidence.revision vs report.source_revisions vs pack.fields vs rc.fields | rs02_evidence_711378c42e61 (cs_evidence.revision) | report.source_revisions=rs02_evidence_6ba6db690d2e; pack.fields=rs02_evidence_6ba6db690d2e |
| 15 | R-WFO-022 | eq:split_revision | cs_split.revision vs report.source_revisions | rs02_split_cd3bb8ab50fd (cs_split.revision) | report.source_revisions=rs02_split_6ba6db690d2e |
| 16 | R-WFO-022 | eq:search_revision | cs_search.revision vs report.source_revisions | rs02_search_2b51a5908a84 (cs_search.revision) | report.source_revisions=rs02_search_6ba6db690d2e |
| 17 | R-WFO-022 | eq:freeze_revision | cs_freeze.revision vs report.source_revisions | rs02_freeze_27c289b1b381 (cs_freeze.revision) | report.source_revisions=rs02_freeze_8fa5ba6ffb09 |
| 18 | R-WFO-022 | stability_5s | sparkline vs publication | identical digests (volatile keys stripped) and non-decreasing as_of | sparkline [/api/v1/quantbt/runs/{run}/sparkline]: 200->503 .schema_version: research.run-sparkline.v1 -> undefined \| .run_id: rrun_a76afa62adb6 -> undefined \| . |

## Security negative probes

| id | probe | expected | result | actual |
|---|---|---|---|---|
| S1 | unauthenticated GET /api/v1/quantbt/runs/{run}/evidence (no cookie, no dev header) | 401 | PASS | anon -> 401 {"error":{"code":"SESSION_REQUIRED","message":"Invalid session."},"request_id":"6c1cf360a9; dev-header-only without session cookie -> 401 |
| S1 | unauthenticated GET /api/v1/research/runs/{run}/progress (no cookie, no dev header) | 401 | PASS | anon -> 401 {"error":{"code":"SESSION_REQUIRED","message":"Invalid session."},"request_id":"5d7d96bed0; dev-header-only without session cookie -> 401 |
| S1 | unauthenticated GET /api/v1/quantbt/runs (no cookie, no dev header) | 401 | PASS | anon -> 401 {"error":{"code":"SESSION_REQUIRED","message":"Invalid session."},"request_id":"76be4d0284; dev-header-only without session cookie -> 401 |
| S1 | unauthenticated GET /api/v1/quantbt/runs/{run}/current-source/replay (no cookie, no dev header) | 401 | PASS | anon -> 401 {"error":{"code":"SESSION_REQUIRED","message":"Invalid session."},"request_id":"8edddbbb61; dev-header-only without session cookie -> 401 |
| S2 | /api/v1/quantbt/runs/{run}/evidence: unknown id and well-formed foreign id -> 404, identical body shape/code/message | 404, identical | PASS | unknown -> 404 RESEARCH_EVIDENCE_NOT_FOUND; foreign -> 404 RESEARCH_EVIDENCE_NOT_FOUND; shapes identical |
| S2w | /api/v1/quantbt/runs/{run}/evidence: under a foreign workspace_id an existing run and a nonexistent run answer identically (no run-existence oracle) | 404 RESEARCH_EVIDENCE_NOT_FOUND + same message | PASS | existing+foreign-ws -> 404 RESEARCH_EVIDENCE_NOT_FOUND "Research workspace was not found."; nonexistent+foreign-ws -> 404 RESEARCH_EVIDENCE_NOT_FOUND "Research  |
| S2m | /api/v1/quantbt/runs/{run}/evidence: foreign-workspace message vs own-workspace unknown-run message (workspace-existence wording) | informational | PASS_WITH_NOTE | foreign-ws "Research workspace was not found." vs unknown-run "Research run was not found." (same status 404/404, same code true); the wording tells a caller wh |
| S2 | /api/v1/research/runs/{run}/progress: unknown id and well-formed foreign id -> 404, identical body shape/code/message | 404, identical | PASS | unknown -> 404 RESEARCH_PROGRESS_NOT_FOUND; foreign -> 404 RESEARCH_PROGRESS_NOT_FOUND; shapes identical |
| S2w | /api/v1/research/runs/{run}/progress: under a foreign workspace_id an existing run and a nonexistent run answer identically (no run-existence oracle) | 404 RESEARCH_PROGRESS_NOT_FOUND + same message | PASS | existing+foreign-ws -> 404 RESEARCH_PROGRESS_NOT_FOUND "Research workspace was not found."; nonexistent+foreign-ws -> 404 RESEARCH_PROGRESS_NOT_FOUND "Research  |
| S2m | /api/v1/research/runs/{run}/progress: foreign-workspace message vs own-workspace unknown-run message (workspace-existence wording) | informational | PASS_WITH_NOTE | foreign-ws "Research workspace was not found." vs unknown-run "Research run was not found." (same status 404/404, same code true); the wording tells a caller wh |
| S2 | /api/v1/quantbt/runs/{run}/current-source/search: unknown id and well-formed foreign id -> 404, identical body shape/code/message | 404, identical | PASS | unknown -> 404 RESEARCH_CURRENT_SOURCE_NOT_FOUND; foreign -> 404 RESEARCH_CURRENT_SOURCE_NOT_FOUND; shapes identical |
| S2w | /api/v1/quantbt/runs/{run}/current-source/search: under a foreign workspace_id an existing run and a nonexistent run answer identically (no run-existence oracle) | 404 RESEARCH_CURRENT_SOURCE_NOT_FOUND + same message | PASS | existing+foreign-ws -> 404 RESEARCH_CURRENT_SOURCE_NOT_FOUND "Research workspace was not found."; nonexistent+foreign-ws -> 404 RESEARCH_CURRENT_SOURCE_NOT_FOUN |
| S2m | /api/v1/quantbt/runs/{run}/current-source/search: foreign-workspace message vs own-workspace unknown-run message (workspace-existence wording) | informational | PASS_WITH_NOTE | foreign-ws "Research workspace was not found." vs unknown-run "Research run was not found." (same status 404/404, same code true); the wording tells a caller wh |
| S2 | /api/v1/quantbt/runs/{run}/release-candidate: unknown id and well-formed foreign id -> 404, identical body shape/code/message | 404, identical | PASS | unknown -> 404 RESEARCH_RELEASE_CANDIDATE_NOT_FOUND; foreign -> 404 RESEARCH_RELEASE_CANDIDATE_NOT_FOUND; shapes identical |
| S2w | /api/v1/quantbt/runs/{run}/release-candidate: under a foreign workspace_id an existing run and a nonexistent run answer identically (no run-existence oracle) | 404 RESEARCH_RELEASE_CANDIDATE_NOT_FOUND + same message | PASS | existing+foreign-ws -> 404 RESEARCH_RELEASE_CANDIDATE_NOT_FOUND "Release Candidate was not found."; nonexistent+foreign-ws -> 404 RESEARCH_RELEASE_CANDIDATE_NOT |
| S2m | /api/v1/quantbt/runs/{run}/release-candidate: foreign-workspace message vs own-workspace unknown-run message (workspace-existence wording) | informational | PASS_WITH_NOTE | foreign-ws "Release Candidate was not found." vs unknown-run "Research run was not found." (same status 404/404, same code true); the wording tells a caller whi |
| S2 | /api/v1/quantbt/runs/{run}/report: unknown id and well-formed foreign id -> 404, identical body shape/code/message | 404, identical | PASS | unknown -> 404 RESEARCH_REPORT_NOT_FOUND; foreign -> 404 RESEARCH_REPORT_NOT_FOUND; shapes identical |
| S2w | /api/v1/quantbt/runs/{run}/report: under a foreign workspace_id an existing run and a nonexistent run answer identically (no run-existence oracle) | 404 RESEARCH_REPORT_NOT_FOUND + same message | PASS | existing+foreign-ws -> 404 RESEARCH_REPORT_NOT_FOUND "Research report was not found."; nonexistent+foreign-ws -> 404 RESEARCH_REPORT_NOT_FOUND "Research report  |
| S2m | /api/v1/quantbt/runs/{run}/report: foreign-workspace message vs own-workspace unknown-run message (workspace-existence wording) | informational | PASS | foreign-ws "Research report was not found." vs unknown-run "Research report was not found." (same status 404/404, same code true); the wording tells a caller wh |
| S2 | /api/v1/research/runs/{run}/requested-spec: unknown id and well-formed foreign id -> 404, identical body shape/code/message | 404, identical | PASS | unknown -> 404 RESEARCH_PROGRESS_NOT_FOUND; foreign -> 404 RESEARCH_PROGRESS_NOT_FOUND; shapes identical |
| S2w | /api/v1/research/runs/{run}/requested-spec: under a foreign workspace_id an existing run and a nonexistent run answer identically (no run-existence oracle) | 404 RESEARCH_PROGRESS_NOT_FOUND + same message | PASS | existing+foreign-ws -> 404 RESEARCH_PROGRESS_NOT_FOUND "Research workspace was not found."; nonexistent+foreign-ws -> 404 RESEARCH_PROGRESS_NOT_FOUND "Research  |
| S2m | /api/v1/research/runs/{run}/requested-spec: foreign-workspace message vs own-workspace unknown-run message (workspace-existence wording) | informational | PASS_WITH_NOTE | foreign-ws "Research workspace was not found." vs unknown-run "Research run was not found." (same status 404/404, same code true); the wording tells a caller wh |
| S2 | /api/v1/quantbt/runs/{run}/current-source/replay: unknown id and well-formed foreign id -> 404, identical body shape/code/message | 404, identical | PASS | unknown -> 404 RESEARCH_CURRENT_SOURCE_NOT_FOUND; foreign -> 404 RESEARCH_CURRENT_SOURCE_NOT_FOUND; shapes identical |
| S2w | /api/v1/quantbt/runs/{run}/current-source/replay: under a foreign workspace_id an existing run and a nonexistent run answer identically (no run-existence oracle) | 404 RESEARCH_CURRENT_SOURCE_NOT_FOUND + same message | PASS | existing+foreign-ws -> 404 RESEARCH_CURRENT_SOURCE_NOT_FOUND "Research workspace was not found."; nonexistent+foreign-ws -> 404 RESEARCH_CURRENT_SOURCE_NOT_FOUN |
| S2m | /api/v1/quantbt/runs/{run}/current-source/replay: foreign-workspace message vs own-workspace unknown-run message (workspace-existence wording) | informational | PASS_WITH_NOTE | foreign-ws "Research workspace was not found." vs unknown-run "Research run was not found." (same status 404/404, same code true); the wording tells a caller wh |
| S3 | write refused: no Origin header, no CSRF header | 403 (any 4xx refusal acceptable; never 2xx) | PASS | POST .../runs/R-WFO-023/cancel -> 403 RESEARCH_PROGRESS_FORBIDDEN |
| S3 | write refused: cross-site Origin (https://evil.example), no CSRF header | 403 (any 4xx refusal acceptable; never 2xx) | PASS | POST .../runs/R-WFO-023/cancel -> 403 RESEARCH_PROGRESS_FORBIDDEN |
| S3 | write refused: correct Origin, no x-portal-csrf header | 403 (any 4xx refusal acceptable; never 2xx) | PASS | POST .../runs/R-WFO-023/cancel -> 403 RESEARCH_PROGRESS_FORBIDDEN |
| S3-state | refused writes changed no run state | no library status change | PASS | all 50 library statuses unchanged |
| S4 | legacy GET /api/runs/{id}/export before prepare (R-WFO-027) | 404; no archive built/served | PASS | -> 404 content-type=application/json bytes=74 {"detail":"run not found","request_id":"f03a6e0d4f6c"} |
| S4 | legacy GET /api/runs/{id}/export before prepare (R-WFO-023) | 404; no archive built/served | PASS | -> 404 content-type=application/json bytes=74 {"detail":"run not found","request_id":"00adbc93c782"} |
| S4 | legacy GET /api/runs/{id}/export before prepare (R-WFO-022) | 404; no archive built/served | PASS | -> 404 content-type=application/json bytes=74 {"detail":"run not found","request_id":"1f1ffe312536"} |
| S5 | own workspace_id query yields the same body as no workspace_id | 200, identical | PASS | own -> 200, bare -> 200 |
| S5 | foreign workspace_id | refused (4xx) or body identical to own workspace; never foreign data | PASS | -> 404 RESEARCH_PROGRESS_NOT_FOUND |
| S5 | duplicate workspace_id (own then foreign) | refused (4xx) or body identical to own workspace; never foreign data | PASS | -> 400 RESEARCH_PROGRESS_INVALID |
| S5 | duplicate workspace_id (foreign then own) | refused (4xx) or body identical to own workspace; never foreign data | PASS | -> 400 RESEARCH_PROGRESS_INVALID |
| S5 | encoded injection workspace_id | refused (4xx) or body identical to own workspace; never foreign data | PASS | -> 400 RESEARCH_PROGRESS_INVALID |
| S5 | unknown extra params do not change scope | refused (4xx) or body identical to own workspace; never foreign data | PASS | -> 400 RESEARCH_PROGRESS_INVALID |
| S5 | library list with foreign workspace_id returns none of the own rows | 4xx or empty items | PASS | -> 404 items=n/a RESEARCH_RUN_LIBRARY_NOT_FOUND |
| S5 | current-source replay with foreign workspace_id | 404/403 | PASS | -> 404 RESEARCH_CURRENT_SOURCE_NOT_FOUND |
| S5 | own-workspace cursor replayed under foreign workspace_id | 4xx | PASS | -> 404 RESEARCH_CURRENT_SOURCE_NOT_FOUND |
| S6 | replay/evidence never serve rows at/after the declared cutoff (S08 replay lane) | max served bar time < declared OOS/WFO end | PASS | R-WFO-027: PASS served 1080/1080 bars 2026-06-01T00:00:00.000Z..2026-07-15T23:00:00.000Z max; declared walk_forward.end_exclusive=2026-07-16T00:00:00.000Z (excl |
| S7 | Execution endpoint counts unchanged by the probes (approval inbox, operations queue) | identical counts + stripped-body digests | PASS | before {"inbox_counts":{"pending":0,"overdue":0,"due_soon":0,"page":{"rows":[],"total_count":0,"filtered_count":0,"next_cursor":null,"prev_cursor":null,"has_mor |

## Run x check matrix

| check | R-WFO-027 | R-WFO-023 | R-WFO-022 | R-P04-022 | R-P04-020 | R-WFO-019 | R-WFO-025 |
|---|---|---|---|---|---|---|---|
| eq:run_id | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| eq:display_label | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| eq:alpha_id | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| eq:alpha_version_id | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| eq:alpha_code_digest | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| eq:requested_spec_digest | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| eq:effective_spec_digest | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| eq:dataset_binding_digest | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| eq:source_manifest_digest | FAIL | FAIL | FAIL | PASS | N/A | N/A | N/A |
| eq:source_transform_digest | PASS | PASS | PASS | N/A | N/A | N/A | N/A |
| eq:retained_import_digest | PASS | PASS | PASS | N/A | N/A | N/A | N/A |
| eq:engine_release_id | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| eq:config_digest | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| eq:selected_trial_id | PASS | PASS | PASS | N/A | N/A | N/A | N/A |
| eq:selected_trial_ordinal | PASS | PASS | PASS | N/A | N/A | N/A | N/A |
| eq:selected_trial_ordinal_scope | PASS | PASS | PASS | N/A | N/A | N/A | N/A |
| eq:fold_selection_fold_id | PASS | N/A | N/A | N/A | N/A | N/A | N/A |
| eq:fold_selection_scope | PASS | N/A | N/A | N/A | N/A | N/A | N/A |
| eq:selected_parameters | PASS | PASS | PASS | N/A | N/A | N/A | N/A |
| eq:selected_params_digest | PASS | PASS | PASS | PASS | N/A | N/A | N/A |
| eq:pack_digest | PASS | PASS | PASS | N/A | N/A | N/A | N/A |
| eq:release_candidate_id | PASS | PASS | PASS | N/A | N/A | N/A | N/A |
| eq:source_fingerprint | PASS | FAIL | FAIL | PASS | PASS | PASS | PASS |
| eq:report_revision | PASS | PASS | PASS | PASS | PASS | N/A | N/A |
| eq:evidence_revision | PASS | FAIL | FAIL | PASS | N/A | N/A | N/A |
| eq:split_revision | FAIL | FAIL | FAIL | N/A | N/A | N/A | N/A |
| eq:search_revision | FAIL | FAIL | FAIL | N/A | N/A | N/A | N/A |
| eq:freeze_revision | FAIL | FAIL | FAIL | N/A | N/A | N/A | N/A |
| eq:replay_revision | PASS | PASS | PASS | N/A | N/A | N/A | N/A |
| eq:workspace_id | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| chronology | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| stability_5s | PASS | FAIL | FAIL | PASS | PASS | PASS | PASS |
| as_of_monotone_across_rounds | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| replay_cutoff | PASS | PASS | PASS | N/A | N/A | N/A | N/A |

N/A = NOT_APPLICABLE (fewer than two reads state the value for that run, e.g. no RC, search or freeze for an unsealed, failed, cancelled or queued run).

## Per-run detail (actual values)

### R-WFO-027 - per_fold_causal, published RC (COMPLETED)

Read statuses: library_ids=200, progress=200, spec=200, evidence=200, cs_evidence=200, cs_split=200, cs_search=200, cs_freeze=200, cs_replay=200, sealed_replay=200 NOT_PUBLISHED, report=200, rc=200, sparkline=200, lineage=200, compare_attempts=200, compare_pair=200, compare_markets=200, atlas=200, library=200, pack=200, publication=200, av_publication=200

| check | result | values / detail |
|---|---|---|
| eq:run_id | PASS | 22 reads equal rrun_686af4b1d644 [library, library_ids, progress, spec, cs_evidence, cs_split, cs_search, cs_freeze, cs_replay, evidence(sealed), report, rc, rc |
| eq:display_label | PASS | 7 reads equal R-WFO-027 [library, progress, report, rc, pack, lineage.primary_run, compare_attempts] |
| eq:alpha_id | PASS | 13 reads equal delta-rsi-polynomial-alpha [library.binding, progress, spec, spec.alpha_binding, cs_replay.identity, rc.run.binding, pack.fields, rc.fields, rc.r |
| eq:alpha_version_id | PASS | 15 reads equal av_delta_rsi_polynomial_alpha_1_0_0 [library.binding, progress, spec, spec.alpha_binding, cs_replay.identity, rc.run.binding, pack.fields, rc.fie |
| eq:alpha_code_digest | PASS | 5 reads equal 34dc1847d051 [library.binding.digest, pack.fields, rc.fields, rc.pack.ALPHA_VERSION_PASSPORT, lineage.version] |
| eq:requested_spec_digest | PASS | 10 reads equal d09d6b35c729 [progress, spec, cs_evidence, cs_split, cs_search, cs_freeze, cs_replay, report.source_digests, pack.fields, rc.fields] |
| eq:effective_spec_digest | PASS | 10 reads equal f8cd5d367000 [cs_evidence, cs_split, cs_search, cs_freeze, cs_replay, report.source_digests, pack.fields, rc.fields, lineage.primary_run, compare |
| eq:dataset_binding_digest | PASS | 9 reads equal efe345160911 [cs_evidence, cs_split, cs_search, cs_freeze, cs_replay, report.source_digests, pack.fields, lineage.primary_run, compare_attempts.pr |
| eq:source_manifest_digest | FAIL | expected 1df90ba5e094 (cs_evidence); differs: compare_attempts.provenance=d72af53355ac |
| eq:source_transform_digest | PASS | 7 reads equal 4cad16ebad71 [cs_evidence, cs_split, cs_search, cs_freeze, cs_replay, report.source_digests, pack.fields] |
| eq:retained_import_digest | PASS | 7 reads equal 057f9d3d96eb [cs_evidence, cs_split, cs_search, cs_freeze, cs_replay, cs_freeze.integrity.expected, cs_freeze.integrity.observed] |
| eq:engine_release_id | PASS | 5 reads equal er_quantbt_111 [progress, spec.client, pack.fields, lineage.primary_run, atlas.selected_release_id] |
| eq:config_digest | PASS | 2 reads equal 69c9431ee0ca [progress, spec.client] |
| eq:selected_trial_id | PASS | 4 reads equal study_2.trial_1 [cs_search.selection, cs_search.roles.selected, cs_freeze.frozen_selection, rc.selected_params.source_id] |
| eq:selected_trial_ordinal | PASS | 3 reads equal 2 [cs_search.selection, cs_freeze.frozen_selection, rc.selected_params] |
| eq:selected_trial_ordinal_scope | PASS | 3 reads equal STUDY_LOCAL [cs_search.selection, cs_freeze.frozen_selection, rc.selected_params] |
| eq:fold_selection_fold_id | PASS | 4 reads equal 2 [cs_search.selection, cs_search.roles.selected, cs_freeze.frozen_selection, rc.selected_params.study_id] |
| eq:fold_selection_scope | PASS | 3 reads equal LAST_FOLD_DEPLOYMENT [cs_search.selection, cs_search.roles.selected, cs_freeze.frozen_selection] |
| eq:selected_parameters | PASS | 2 reads equal {"len_atr1":"8","len_atr2":"52","len_vol":"8","rsi_l":"30","rvol":"2.3","signalLength":"20","slpercent":"0.7","window":"48"} [cs_search.selection, |
| eq:selected_params_digest | PASS | 3 reads equal 8ea57bdd6881 [rc.rail.selected_params, pack.fields.parameter_bundle_digest, rc.fields.parameter_bundle_digest] |
| eq:pack_digest | PASS | 3 reads equal dca4974c3f3d [rc.local_seal, pack, publication] |
| eq:release_candidate_id | PASS | 6 reads equal rc_06GG2K1TN6QQNJJN3RJ5AS5XC1 [library.rc, rc.local_seal, pack, publication, pack.fields, lineage.release_candidate] |
| eq:source_fingerprint | PASS | 3 reads equal 13ccbd7a89a3 [rc, rc.draft, pack.frozen_core] |
| eq:report_revision | PASS | 3 reads equal p18r1_018d62ec6961 [report, pack.fields, rc.fields] |
| eq:evidence_revision | PASS | 4 reads equal rs02_evidence_def6a02fdc32 [cs_evidence.revision, report.source_revisions, pack.fields, rc.fields] |
| eq:split_revision | FAIL | expected rs02_split_d12ed6b8878f (cs_split.revision); differs: report.source_revisions=rs02_split_e08c93a775ce |
| eq:search_revision | FAIL | expected rs02_search_cb72db4b48a7 (cs_search.revision); differs: report.source_revisions=rs02_search_907372db8e6d |
| eq:freeze_revision | FAIL | expected rs02_freeze_9d0f43d1f3d2 (cs_freeze.revision); differs: report.source_revisions=rs02_freeze_e41d87877df9 |
| eq:replay_revision | PASS | 2 reads equal rs02_replay_e08c93a775ce [cs_replay.revision, report.source_revisions] |
| eq:workspace_id | PASS | 3 reads equal ws_06GCVTHWC9WVPGEPR85AB15K82 [cs_replay.page.next_cursor, execution.approval-inbox, execution.runtime-manifest] |
| chronology | PASS | 10 timestamps non-decreasing: library.created_at=1790960539851, progress.queued_at=1790960539851, cs.retained_at=1790960551602, cs_evidence.as_of=1790960551602, |
| stability_5s | PASS | 22 reads identical after 25s round gap (volatile as_of*/cursors stripped): library_ids=9f95dc302b1f, progress=8c5f69b38ca0, spec=a32b4726d952, evidence=0e3d79e8 |
| as_of_monotone_across_rounds | PASS | 15 reads with as_of: none regressed between rounds |
| replay_cutoff | PASS | served 1080/1080 bars 2026-06-01T00:00:00.000Z..2026-07-15T23:00:00.000Z max; declared walk_forward.end_exclusive=2026-07-16T00:00:00.000Z (exclusive); late rep |

### R-WFO-023 - sealed-local, stale (COMPLETED)

Read statuses: library_ids=200, progress=200, spec=200, evidence=200, cs_evidence=200, cs_split=200, cs_search=200, cs_freeze=200, cs_replay=200, sealed_replay=200 NOT_PUBLISHED, report=200, rc=200, sparkline=200, lineage=200, compare_attempts=200, compare_pair=200, compare_markets=200, atlas=200, library=200, pack=200, publication=200, av_publication=200

| check | result | values / detail |
|---|---|---|
| eq:run_id | PASS | 22 reads equal rrun_3d5633d2adb7 [library, library_ids, progress, spec, cs_evidence, cs_split, cs_search, cs_freeze, cs_replay, evidence(sealed), report, rc, rc |
| eq:display_label | PASS | 7 reads equal R-WFO-023 [library, progress, report, rc, pack, lineage.primary_run, compare_attempts] |
| eq:alpha_id | PASS | 13 reads equal delta-rsi-polynomial-alpha [library.binding, progress, spec, spec.alpha_binding, cs_replay.identity, rc.run.binding, pack.fields, rc.fields, rc.r |
| eq:alpha_version_id | PASS | 15 reads equal av_delta_rsi_polynomial_alpha_1_0_0 [library.binding, progress, spec, spec.alpha_binding, cs_replay.identity, rc.run.binding, pack.fields, rc.fie |
| eq:alpha_code_digest | PASS | 5 reads equal 34dc1847d051 [library.binding.digest, pack.fields, rc.fields, rc.pack.ALPHA_VERSION_PASSPORT, lineage.version] |
| eq:requested_spec_digest | PASS | 10 reads equal c990a312518c [progress, spec, cs_evidence, cs_split, cs_search, cs_freeze, cs_replay, report.source_digests, pack.fields, rc.fields] |
| eq:effective_spec_digest | PASS | 10 reads equal a7f84919b0c8 [cs_evidence, cs_split, cs_search, cs_freeze, cs_replay, report.source_digests, pack.fields, rc.fields, lineage.primary_run, compare |
| eq:dataset_binding_digest | PASS | 9 reads equal ffd476fad978 [cs_evidence, cs_split, cs_search, cs_freeze, cs_replay, report.source_digests, pack.fields, lineage.primary_run, compare_attempts.pr |
| eq:source_manifest_digest | FAIL | expected afc3d407ee73 (cs_evidence); differs: compare_attempts.provenance=39db7cf1bc7b |
| eq:source_transform_digest | PASS | 7 reads equal c42d08896ac1 [cs_evidence, cs_split, cs_search, cs_freeze, cs_replay, report.source_digests, pack.fields] |
| eq:retained_import_digest | PASS | 7 reads equal c1d27c7494b8 [cs_evidence, cs_split, cs_search, cs_freeze, cs_replay, cs_freeze.integrity.expected, cs_freeze.integrity.observed] |
| eq:engine_release_id | PASS | 5 reads equal er_quantbt_111 [progress, spec.client, pack.fields, lineage.primary_run, atlas.selected_release_id] |
| eq:config_digest | PASS | 2 reads equal 69c9431ee0ca [progress, spec.client] |
| eq:selected_trial_id | PASS | 4 reads equal 350 [cs_search.selection, cs_search.roles.selected, cs_freeze.frozen_selection, rc.selected_params.source_id] |
| eq:selected_trial_ordinal | PASS | 3 reads equal 351 [cs_search.selection, cs_freeze.frozen_selection, rc.selected_params] |
| eq:selected_trial_ordinal_scope | PASS | 3 reads equal RUN_GLOBAL [cs_search.selection, cs_freeze.frozen_selection, rc.selected_params] |
| eq:fold_selection_fold_id | N/A | no read states it |
| eq:fold_selection_scope | N/A | no read states it |
| eq:selected_parameters | PASS | 2 reads equal {"len_atr1":"20","len_atr2":"47","len_vol":"28","rsi_l":"14","rvol":"1","signalLength":"15","slpercent":"1.6","window":"54"} [cs_search.selection, |
| eq:selected_params_digest | PASS | 3 reads equal a74872817bf1 [rc.rail.selected_params, pack.fields.parameter_bundle_digest, rc.fields.parameter_bundle_digest] |
| eq:pack_digest | PASS | 3 reads equal a720a588558d [rc.local_seal, pack, publication] |
| eq:release_candidate_id | PASS | 6 reads equal rc_06GFFDG3SA17Y5WPBN58NFM5B2 [library.rc, rc.local_seal, pack, publication, pack.fields, lineage.release_candidate] |
| eq:source_fingerprint | FAIL | expected 74b266bcb64f (rc); differs: rc.draft=805ec9becf34; pack.frozen_core=805ec9becf34 |
| eq:report_revision | PASS | 3 reads equal p18r1_45e018386ed7 [report, pack.fields, rc.fields] |
| eq:evidence_revision | FAIL | expected rs02_evidence_399badcf84a0 (cs_evidence.revision); differs: report.source_revisions=rs02_evidence_7533074a250a; pack.fields=rs02_evidence_7533074a250a |
| eq:split_revision | FAIL | expected rs02_split_0929f7599740 (cs_split.revision); differs: report.source_revisions=rs02_split_7533074a250a |
| eq:search_revision | FAIL | expected rs02_search_ecc5a8e1e96e (cs_search.revision); differs: report.source_revisions=rs02_search_7533074a250a |
| eq:freeze_revision | FAIL | expected rs02_freeze_bce796b9e439 (cs_freeze.revision); differs: report.source_revisions=rs02_freeze_2cec6d9bcfd8 |
| eq:replay_revision | PASS | 2 reads equal rs02_replay_7533074a250a [cs_replay.revision, report.source_revisions] |
| eq:workspace_id | PASS | 3 reads equal ws_06GCVTHWC9WVPGEPR85AB15K82 [cs_replay.page.next_cursor, execution.approval-inbox, execution.runtime-manifest] |
| chronology | PASS | 10 timestamps non-decreasing: library.created_at=1790862239345, progress.queued_at=1790862239345, cs.retained_at=1790862291685, cs_evidence.as_of=1790862291685, |
| stability_5s | FAIL | sparkline [/api/v1/quantbt/runs/{run}/sparkline]: 200->503 .schema_version: research.run-sparkline.v1 -> undefined \| .run_id: rrun_3d5633d2adb7 -> undefined \| . |
| as_of_monotone_across_rounds | PASS | 15 reads with as_of: none regressed between rounds |
| replay_cutoff | PASS | served 2208/2208 bars 2026-06-01T00:00:00.000Z..2026-08-31T23:00:00.000Z max; declared walk_forward.end_exclusive=2026-09-01T00:00:00.000Z (exclusive); late rep |

### R-WFO-022 - stale seal (COMPLETED)

Read statuses: library_ids=200, progress=200, spec=200, evidence=200, cs_evidence=200, cs_split=200, cs_search=200, cs_freeze=200, cs_replay=200, sealed_replay=200 NOT_PUBLISHED, report=200, rc=200, sparkline=200, lineage=200, compare_attempts=200, compare_pair=200, compare_markets=200, atlas=200, library=200, pack=200, publication=200, av_publication=200

| check | result | values / detail |
|---|---|---|
| eq:run_id | PASS | 22 reads equal rrun_a76afa62adb6 [library, library_ids, progress, spec, cs_evidence, cs_split, cs_search, cs_freeze, cs_replay, evidence(sealed), report, rc, rc |
| eq:display_label | PASS | 7 reads equal R-WFO-022 [library, progress, report, rc, pack, lineage.primary_run, compare_attempts] |
| eq:alpha_id | PASS | 13 reads equal delta-rsi-polynomial-alpha [library.binding, progress, spec, spec.alpha_binding, cs_replay.identity, rc.run.binding, pack.fields, rc.fields, rc.r |
| eq:alpha_version_id | PASS | 15 reads equal av_delta_rsi_polynomial_alpha_1_0_0 [library.binding, progress, spec, spec.alpha_binding, cs_replay.identity, rc.run.binding, pack.fields, rc.fie |
| eq:alpha_code_digest | PASS | 5 reads equal 34dc1847d051 [library.binding.digest, pack.fields, rc.fields, rc.pack.ALPHA_VERSION_PASSPORT, lineage.version] |
| eq:requested_spec_digest | PASS | 10 reads equal c990a312518c [progress, spec, cs_evidence, cs_split, cs_search, cs_freeze, cs_replay, report.source_digests, pack.fields, rc.fields] |
| eq:effective_spec_digest | PASS | 10 reads equal a7f84919b0c8 [cs_evidence, cs_split, cs_search, cs_freeze, cs_replay, report.source_digests, pack.fields, rc.fields, lineage.primary_run, compare |
| eq:dataset_binding_digest | PASS | 9 reads equal ffd476fad978 [cs_evidence, cs_split, cs_search, cs_freeze, cs_replay, report.source_digests, pack.fields, lineage.primary_run, compare_attempts.pr |
| eq:source_manifest_digest | FAIL | expected 3c2f6cefdcfe (cs_evidence); differs: compare_attempts.provenance=39db7cf1bc7b |
| eq:source_transform_digest | PASS | 7 reads equal 539c0932fa32 [cs_evidence, cs_split, cs_search, cs_freeze, cs_replay, report.source_digests, pack.fields] |
| eq:retained_import_digest | PASS | 7 reads equal a6c74f30998e [cs_evidence, cs_split, cs_search, cs_freeze, cs_replay, cs_freeze.integrity.expected, cs_freeze.integrity.observed] |
| eq:engine_release_id | PASS | 5 reads equal er_quantbt_111 [progress, spec.client, pack.fields, lineage.primary_run, atlas.selected_release_id] |
| eq:config_digest | PASS | 2 reads equal 69c9431ee0ca [progress, spec.client] |
| eq:selected_trial_id | PASS | 4 reads equal 350 [cs_search.selection, cs_search.roles.selected, cs_freeze.frozen_selection, rc.selected_params.source_id] |
| eq:selected_trial_ordinal | PASS | 3 reads equal 351 [cs_search.selection, cs_freeze.frozen_selection, rc.selected_params] |
| eq:selected_trial_ordinal_scope | PASS | 3 reads equal RUN_GLOBAL [cs_search.selection, cs_freeze.frozen_selection, rc.selected_params] |
| eq:fold_selection_fold_id | N/A | no read states it |
| eq:fold_selection_scope | N/A | no read states it |
| eq:selected_parameters | PASS | 2 reads equal {"len_atr1":"20","len_atr2":"47","len_vol":"28","rsi_l":"14","rvol":"1","signalLength":"15","slpercent":"1.6","window":"54"} [cs_search.selection, |
| eq:selected_params_digest | PASS | 3 reads equal a74872817bf1 [rc.rail.selected_params, pack.fields.parameter_bundle_digest, rc.fields.parameter_bundle_digest] |
| eq:pack_digest | PASS | 3 reads equal 5b4b43450e67 [rc.local_seal, pack, publication] |
| eq:release_candidate_id | PASS | 6 reads equal rc_06GFW43NE42YF64NMXYDS6GD32 [library.rc, rc.local_seal, pack, publication, pack.fields, lineage.release_candidate] |
| eq:source_fingerprint | FAIL | expected d2c4f2a6c1b4 (rc); differs: rc.draft=b38ff999f780; pack.frozen_core=b38ff999f780 |
| eq:report_revision | PASS | 3 reads equal p18r1_20a374e4b9ae [report, pack.fields, rc.fields] |
| eq:evidence_revision | FAIL | expected rs02_evidence_711378c42e61 (cs_evidence.revision); differs: report.source_revisions=rs02_evidence_6ba6db690d2e; pack.fields=rs02_evidence_6ba6db690d2e |
| eq:split_revision | FAIL | expected rs02_split_cd3bb8ab50fd (cs_split.revision); differs: report.source_revisions=rs02_split_6ba6db690d2e |
| eq:search_revision | FAIL | expected rs02_search_2b51a5908a84 (cs_search.revision); differs: report.source_revisions=rs02_search_6ba6db690d2e |
| eq:freeze_revision | FAIL | expected rs02_freeze_27c289b1b381 (cs_freeze.revision); differs: report.source_revisions=rs02_freeze_8fa5ba6ffb09 |
| eq:replay_revision | PASS | 2 reads equal rs02_replay_6ba6db690d2e [cs_replay.revision, report.source_revisions] |
| eq:workspace_id | PASS | 3 reads equal ws_06GCVTHWC9WVPGEPR85AB15K82 [cs_replay.page.next_cursor, execution.approval-inbox, execution.runtime-manifest] |
| chronology | PASS | 10 timestamps non-decreasing: library.created_at=1790858607754, progress.queued_at=1790858607754, cs.retained_at=1790858655824, cs_evidence.as_of=1790858655824, |
| stability_5s | FAIL | sparkline [/api/v1/quantbt/runs/{run}/sparkline]: 200->503 .schema_version: research.run-sparkline.v1 -> undefined \| .run_id: rrun_a76afa62adb6 -> undefined \| . |
| as_of_monotone_across_rounds | PASS | 15 reads with as_of: none regressed between rounds |
| replay_cutoff | PASS | served 2208/2208 bars 2026-06-01T00:00:00.000Z..2026-08-31T23:00:00.000Z max; declared walk_forward.end_exclusive=2026-09-01T00:00:00.000Z (exclusive); late rep |

### R-P04-022 - three_window_decay (COMPLETED)

Read statuses: library_ids=200, progress=200, spec=200, evidence=200, cs_evidence=200 NOT_APPLICABLE, cs_split=200 NOT_APPLICABLE, cs_search=200 NOT_APPLICABLE, cs_freeze=200 NOT_APPLICABLE, cs_replay=200 NOT_APPLICABLE, sealed_replay=200, report=200, rc=200, sparkline=200, lineage=200, compare_attempts=200, compare_pair=200, compare_markets=200, atlas=200, library=200

| check | result | values / detail |
|---|---|---|
| eq:run_id | PASS | 14 reads equal rrun_9ec42333b812 [library, library_ids, progress, spec, evidence(sealed), report, rc, rc.run.id, rc.rail.run, report.identity.run_id, sparkline, |
| eq:display_label | PASS | 6 reads equal R-P04-022 [library, progress, report, rc, lineage.primary_run, compare_attempts] |
| eq:alpha_id | PASS | 10 reads equal delta-rsi-polynomial-alpha [library.binding, progress, spec, spec.alpha_binding, rc.run.binding, rc.fields, rc.rail.alpha, lineage.alpha, report. |
| eq:alpha_version_id | PASS | 11 reads equal av_delta_rsi_polynomial_alpha_1_0_0 [library.binding, progress, spec, spec.alpha_binding, rc.run.binding, rc.fields, rc.rail.alpha_version, linea |
| eq:alpha_code_digest | PASS | 4 reads equal 34dc1847d051 [library.binding.digest, rc.fields, rc.pack.ALPHA_VERSION_PASSPORT, lineage.version] |
| eq:requested_spec_digest | PASS | 4 reads equal cbe11c236d51 [progress, spec, report.source_digests, rc.fields] |
| eq:effective_spec_digest | PASS | 4 reads equal 0cfe2330d5fc [report.source_digests, rc.fields, lineage.primary_run, compare_attempts.provenance] |
| eq:dataset_binding_digest | PASS | 3 reads equal 16cc048b2605 [report.source_digests, lineage.primary_run, compare_attempts.provenance] |
| eq:source_manifest_digest | PASS | 2 reads equal 3fd03a552ea9 [report.source_digests, compare_attempts.provenance] |
| eq:source_transform_digest | N/A | only one read states it: report.source_digests=8924794d8e61 |
| eq:retained_import_digest | N/A | no read states it |
| eq:engine_release_id | PASS | 4 reads equal er_quantbt_111 [progress, spec.client, lineage.primary_run, atlas.selected_release_id] |
| eq:config_digest | PASS | 2 reads equal 69c9431ee0ca [progress, spec.client] |
| eq:selected_trial_id | N/A | no read states it |
| eq:selected_trial_ordinal | N/A | no read states it |
| eq:selected_trial_ordinal_scope | N/A | no read states it |
| eq:fold_selection_fold_id | N/A | no read states it |
| eq:fold_selection_scope | N/A | no read states it |
| eq:selected_parameters | N/A | no read states it |
| eq:selected_params_digest | PASS | 2 reads equal 2486e573470e [rc.rail.selected_params, rc.fields.parameter_bundle_digest] |
| eq:pack_digest | N/A | no read states it |
| eq:release_candidate_id | N/A | no read states it |
| eq:source_fingerprint | PASS | 2 reads equal c61dfd90c036 [rc, rc.draft] |
| eq:report_revision | PASS | 2 reads equal p18r1_1b90a117c82b [report, rc.fields] |
| eq:evidence_revision | PASS | 4 reads equal p13r1_19e3d1f931f7 [library.evidence_revision, report.source_revisions, rc.fields, compare_attempts.provenance] |
| eq:split_revision | N/A | only one read states it: report.source_revisions=p14r1_40d27e153360 |
| eq:search_revision | N/A | only one read states it: report.source_revisions=p15r1_052bfd981bbb |
| eq:freeze_revision | N/A | only one read states it: report.source_revisions=p16r1_09124de66dd2 |
| eq:replay_revision | N/A | only one read states it: report.source_revisions=p17r1_f9b402f4bd63 |
| eq:workspace_id | PASS | 2 reads equal ws_06GCVTHWC9WVPGEPR85AB15K82 [execution.approval-inbox, execution.runtime-manifest] |
| chronology | PASS | 5 timestamps non-decreasing: library.created_at=1790958699018, progress.queued_at=1790958699018, report.sealed_at=1790958710305, rc.as_of=1791088486524, library |
| stability_5s | PASS | 19 reads identical after 25s round gap (volatile as_of*/cursors stripped): library_ids=fcc2ea86a120, progress=dc954f21dcfb, spec=e39cce499248, evidence=2a5463ab |
| as_of_monotone_across_rounds | PASS | 8 reads with as_of: none regressed between rounds |
| replay_cutoff | N/A | cs_replay 200 NOT_APPLICABLE |

### R-P04-020 - FAILED (FAILED)

Read statuses: library_ids=200, progress=200, spec=200, evidence=200 NOT_PUBLISHED, cs_evidence=200 NOT_APPLICABLE, cs_split=200 NOT_APPLICABLE, cs_search=200 NOT_APPLICABLE, cs_freeze=200 NOT_APPLICABLE, cs_replay=200 NOT_APPLICABLE, sealed_replay=200 NOT_PUBLISHED, report=200, rc=200 PARTIAL, sparkline=200 NOT_PUBLISHED, lineage=200, compare_attempts=200, compare_pair=200, compare_markets=200, atlas=200, library=200

| check | result | values / detail |
|---|---|---|
| eq:run_id | PASS | 13 reads equal rrun_3955ea932446 [library, library_ids, progress, spec, report, rc, rc.run.id, rc.rail.run, report.identity.run_id, sparkline, sealed_replay, li |
| eq:display_label | PASS | 6 reads equal R-P04-020 [library, progress, report, rc, lineage.primary_run, compare_attempts] |
| eq:alpha_id | PASS | 10 reads equal delta-rsi-polynomial-alpha [library.binding, progress, spec, spec.alpha_binding, rc.run.binding, rc.fields, rc.rail.alpha, lineage.alpha, report. |
| eq:alpha_version_id | PASS | 11 reads equal av_delta_rsi_polynomial_alpha_1_0_0 [library.binding, progress, spec, spec.alpha_binding, rc.run.binding, rc.fields, rc.rail.alpha_version, linea |
| eq:alpha_code_digest | PASS | 4 reads equal 34dc1847d051 [library.binding.digest, rc.fields, rc.pack.ALPHA_VERSION_PASSPORT, lineage.version] |
| eq:requested_spec_digest | PASS | 3 reads equal c35406dc5d04 [progress, spec, rc.fields] |
| eq:effective_spec_digest | PASS | 3 reads equal 3ddc9f468edc [rc.fields, lineage.primary_run, compare_attempts.provenance] |
| eq:dataset_binding_digest | PASS | 2 reads equal ffd476fad978 [lineage.primary_run, compare_attempts.provenance] |
| eq:source_manifest_digest | N/A | only one read states it: compare_attempts.provenance=e202497b011b |
| eq:source_transform_digest | N/A | no read states it |
| eq:retained_import_digest | N/A | no read states it |
| eq:engine_release_id | PASS | 4 reads equal er_quantbt_111 [progress, spec.client, lineage.primary_run, atlas.selected_release_id] |
| eq:config_digest | PASS | 2 reads equal 69c9431ee0ca [progress, spec.client] |
| eq:selected_trial_id | N/A | no read states it |
| eq:selected_trial_ordinal | N/A | no read states it |
| eq:selected_trial_ordinal_scope | N/A | no read states it |
| eq:fold_selection_fold_id | N/A | no read states it |
| eq:fold_selection_scope | N/A | no read states it |
| eq:selected_parameters | N/A | no read states it |
| eq:selected_params_digest | N/A | only one read states it: rc.rail.selected_params=— selection not published |
| eq:pack_digest | N/A | no read states it |
| eq:release_candidate_id | N/A | no read states it |
| eq:source_fingerprint | PASS | 2 reads equal 0b849c9c4dae [rc, rc.draft] |
| eq:report_revision | PASS | 2 reads equal p18r1_38580e93d8b0 [report, rc.fields] |
| eq:evidence_revision | N/A | no read states it |
| eq:split_revision | N/A | no read states it |
| eq:search_revision | N/A | no read states it |
| eq:freeze_revision | N/A | no read states it |
| eq:replay_revision | N/A | no read states it |
| eq:workspace_id | PASS | 2 reads equal ws_06GCVTHWC9WVPGEPR85AB15K82 [execution.approval-inbox, execution.runtime-manifest] |
| chronology | PASS | 5 timestamps non-decreasing: library.created_at=1790862258682, progress.queued_at=1790862258682, report.sealed_at=1790862300968, rc.as_of=1791088488159, library |
| stability_5s | PASS | 19 reads identical after 25s round gap (volatile as_of*/cursors stripped): library_ids=77c52f944dfa, progress=3539627e3233, spec=3c060492e9b3, evidence=2ea684d1 |
| as_of_monotone_across_rounds | PASS | 8 reads with as_of: none regressed between rounds |
| replay_cutoff | N/A | cs_replay 200 NOT_APPLICABLE |

### R-WFO-019 - CANCELLED (CANCELLED)

Read statuses: library_ids=200, progress=200, spec=200, evidence=200 NOT_PUBLISHED, cs_evidence=409 RESEARCH_CURRENT_SOURCE_CONFLICT, cs_split=200 NOT_PUBLISHED, cs_search=409 RESEARCH_CURRENT_SOURCE_CONFLICT, cs_freeze=409 RESEARCH_CURRENT_SOURCE_CONFLICT, cs_replay=409 RESEARCH_CURRENT_SOURCE_CONFLICT, sealed_replay=200 NOT_PUBLISHED, report=404 RESEARCH_REPORT_NOT_FOUND, rc=200, sparkline=200 NOT_PUBLISHED, lineage=200, compare_attempts=200, compare_pair=200, compare_markets=200, atlas=200, library=200

| check | result | values / detail |
|---|---|---|
| eq:run_id | PASS | 11 reads equal rrun_ef3e10730fcb [library, library_ids, progress, spec, rc, rc.run.id, rc.rail.run, sparkline, sealed_replay, lineage.primary_run, compare_attem |
| eq:display_label | PASS | 5 reads equal R-WFO-019 [library, progress, rc, lineage.primary_run, compare_attempts] |
| eq:alpha_id | PASS | 9 reads equal delta-rsi-polynomial-alpha [library.binding, progress, spec, spec.alpha_binding, rc.run.binding, rc.fields, rc.rail.alpha, lineage.alpha, sealed_r |
| eq:alpha_version_id | PASS | 10 reads equal av_delta_rsi_polynomial_alpha_1_0_0 [library.binding, progress, spec, spec.alpha_binding, rc.run.binding, rc.fields, rc.rail.alpha_version, linea |
| eq:alpha_code_digest | PASS | 4 reads equal 34dc1847d051 [library.binding.digest, rc.fields, rc.pack.ALPHA_VERSION_PASSPORT, lineage.version] |
| eq:requested_spec_digest | PASS | 3 reads equal 9b8bede78011 [progress, spec, rc.fields] |
| eq:effective_spec_digest | PASS | 3 reads equal 0668e6418ba2 [rc.fields, lineage.primary_run, compare_attempts.provenance] |
| eq:dataset_binding_digest | PASS | 2 reads equal 8581c52986a4 [lineage.primary_run, compare_attempts.provenance] |
| eq:source_manifest_digest | N/A | only one read states it: compare_attempts.provenance=333558cc1b39 |
| eq:source_transform_digest | N/A | no read states it |
| eq:retained_import_digest | N/A | no read states it |
| eq:engine_release_id | PASS | 4 reads equal er_quantbt_111 [progress, spec.client, lineage.primary_run, atlas.selected_release_id] |
| eq:config_digest | PASS | 2 reads equal 69c9431ee0ca [progress, spec.client] |
| eq:selected_trial_id | N/A | no read states it |
| eq:selected_trial_ordinal | N/A | no read states it |
| eq:selected_trial_ordinal_scope | N/A | no read states it |
| eq:fold_selection_fold_id | N/A | no read states it |
| eq:fold_selection_scope | N/A | no read states it |
| eq:selected_parameters | N/A | no read states it |
| eq:selected_params_digest | N/A | only one read states it: rc.rail.selected_params=— selection not published |
| eq:pack_digest | N/A | no read states it |
| eq:release_candidate_id | N/A | no read states it |
| eq:source_fingerprint | PASS | 2 reads equal 599303fad59c [rc, rc.draft] |
| eq:report_revision | N/A | no read states it |
| eq:evidence_revision | N/A | no read states it |
| eq:split_revision | N/A | no read states it |
| eq:search_revision | N/A | no read states it |
| eq:freeze_revision | N/A | no read states it |
| eq:replay_revision | N/A | no read states it |
| eq:workspace_id | PASS | 2 reads equal ws_06GCVTHWC9WVPGEPR85AB15K82 [execution.approval-inbox, execution.runtime-manifest] |
| chronology | PASS | 4 timestamps non-decreasing: library.created_at=1790796008696, progress.queued_at=1790796008696, rc.as_of=1791088489708, library.list_as_of=1791088490722 |
| stability_5s | PASS | 19 reads identical after 25s round gap (volatile as_of*/cursors stripped): library_ids=655b8b6fb20b, progress=9b95226551f3, spec=cb3c5665191d, evidence=8a37006b |
| as_of_monotone_across_rounds | PASS | 8 reads with as_of: none regressed between rounds |
| replay_cutoff | N/A | cs_replay 409 RESEARCH_CURRENT_SOURCE_CONFLICT |

### R-WFO-025 - QUEUED (QUEUED)

Read statuses: library_ids=200, progress=200, spec=200, evidence=200 PENDING_SOURCE_CALLBACK, cs_evidence=409 RESEARCH_CURRENT_SOURCE_CONFLICT, cs_split=409 RESEARCH_CURRENT_SOURCE_CONFLICT, cs_search=409 RESEARCH_CURRENT_SOURCE_CONFLICT, cs_freeze=409 RESEARCH_CURRENT_SOURCE_CONFLICT, cs_replay=409 RESEARCH_CURRENT_SOURCE_CONFLICT, sealed_replay=200 PENDING_SOURCE_CALLBACK, report=404 RESEARCH_REPORT_NOT_FOUND, rc=200, sparkline=200 PENDING_SOURCE_CALLBACK, lineage=200, compare_attempts=200, compare_pair=200, compare_markets=200, atlas=200, library=200

| check | result | values / detail |
|---|---|---|
| eq:run_id | PASS | 11 reads equal rrun_5e1185f847dd [library, library_ids, progress, spec, rc, rc.run.id, rc.rail.run, sparkline, sealed_replay, lineage.primary_run, compare_attem |
| eq:display_label | PASS | 5 reads equal R-WFO-025 [library, progress, rc, lineage.primary_run, compare_attempts] |
| eq:alpha_id | PASS | 9 reads equal delta-rsi-polynomial-alpha [library.binding, progress, spec, spec.alpha_binding, rc.run.binding, rc.fields, rc.rail.alpha, lineage.alpha, sealed_r |
| eq:alpha_version_id | PASS | 10 reads equal av_delta_rsi_polynomial_alpha_1_0_0 [library.binding, progress, spec, spec.alpha_binding, rc.run.binding, rc.fields, rc.rail.alpha_version, linea |
| eq:alpha_code_digest | PASS | 4 reads equal 34dc1847d051 [library.binding.digest, rc.fields, rc.pack.ALPHA_VERSION_PASSPORT, lineage.version] |
| eq:requested_spec_digest | PASS | 3 reads equal d09d6b35c729 [progress, spec, rc.fields] |
| eq:effective_spec_digest | PASS | 3 reads equal f8cd5d367000 [rc.fields, lineage.primary_run, compare_attempts.provenance] |
| eq:dataset_binding_digest | PASS | 2 reads equal efe345160911 [lineage.primary_run, compare_attempts.provenance] |
| eq:source_manifest_digest | N/A | only one read states it: compare_attempts.provenance=d72af53355ac |
| eq:source_transform_digest | N/A | no read states it |
| eq:retained_import_digest | N/A | no read states it |
| eq:engine_release_id | PASS | 4 reads equal er_quantbt_111 [progress, spec.client, lineage.primary_run, atlas.selected_release_id] |
| eq:config_digest | PASS | 2 reads equal 69c9431ee0ca [progress, spec.client] |
| eq:selected_trial_id | N/A | no read states it |
| eq:selected_trial_ordinal | N/A | no read states it |
| eq:selected_trial_ordinal_scope | N/A | no read states it |
| eq:fold_selection_fold_id | N/A | no read states it |
| eq:fold_selection_scope | N/A | no read states it |
| eq:selected_parameters | N/A | no read states it |
| eq:selected_params_digest | N/A | only one read states it: rc.rail.selected_params=— selection not published |
| eq:pack_digest | N/A | no read states it |
| eq:release_candidate_id | N/A | no read states it |
| eq:source_fingerprint | PASS | 2 reads equal d28d6a48da2b [rc, rc.draft] |
| eq:report_revision | N/A | no read states it |
| eq:evidence_revision | N/A | no read states it |
| eq:split_revision | N/A | no read states it |
| eq:search_revision | N/A | no read states it |
| eq:freeze_revision | N/A | no read states it |
| eq:replay_revision | N/A | no read states it |
| eq:workspace_id | PASS | 2 reads equal ws_06GCVTHWC9WVPGEPR85AB15K82 [execution.approval-inbox, execution.runtime-manifest] |
| chronology | PASS | 4 timestamps non-decreasing: library.created_at=1790958717643, progress.queued_at=1790958717643, rc.as_of=1791088491281, library.list_as_of=1791088492300 |
| stability_5s | PASS | 19 reads identical after 25s round gap (volatile as_of*/cursors stripped): library_ids=d74eb324b597, progress=956b78906e64, spec=b0edceaaa1fc, evidence=86329195 |
| as_of_monotone_across_rounds | PASS | 8 reads with as_of: none regressed between rounds |
| replay_cutoff | N/A | cs_replay 409 RESEARCH_CURRENT_SOURCE_CONFLICT |

## Equalities checked

Each `eq:` row asserts that every listed read which states the value gives an identical one (reads absent/unpublished for a run are skipped; fewer than two = N/A):

- `run_id`: library == library_ids == progress == spec == cs_evidence == cs_split == cs_search == cs_freeze == cs_replay == evidence(sealed) == report == rc == rc.run.id == rc.rail.run == pack == publication == pack.final_audit_run_id == report.identity.run_id == sparkline == sealed_replay == lineage.primary_run == compare_attempts == compare_pair
- `display_label`: library == progress == report == rc == pack == lineage.primary_run == compare_attempts == compare_pair
- `alpha_id`: library.binding == progress == spec == spec.alpha_binding == cs_replay.identity == rc.run.binding == pack.fields == rc.fields == rc.rail.alpha == publication == lineage.alpha == report.identity == sealed_replay
- `alpha_version_id`: library.binding == progress == spec == spec.alpha_binding == cs_replay.identity == rc.run.binding == pack.fields == rc.fields == rc.rail.alpha_version == publication == av_publication == lineage.attempt == report.identity == compare_attempts == sealed_replay
- `alpha_code_digest`: library.binding.digest == pack.fields == rc.fields == rc.pack.ALPHA_VERSION_PASSPORT == lineage.version
- `requested_spec_digest`: progress == spec == cs_evidence == cs_split == cs_search == cs_freeze == cs_replay == report.source_digests == pack.fields == rc.fields
- `effective_spec_digest`: cs_evidence == cs_split == cs_search == cs_freeze == cs_replay == report.source_digests == pack.fields == rc.fields == lineage.primary_run == compare_attempts.provenance
- `dataset_binding_digest`: cs_evidence == cs_split == cs_search == cs_freeze == cs_replay == report.source_digests == pack.fields == lineage.primary_run == compare_attempts.provenance
- `source_manifest_digest`: cs_evidence == cs_split == cs_search == cs_freeze == cs_replay == cs_freeze.integrity.expected == cs_freeze.integrity.observed == report.source_digests == pack.fields == publication.source.legacy_artifact_sha256 == compare_attempts.provenance
- `source_transform_digest`: cs_evidence == cs_split == cs_search == cs_freeze == cs_replay == report.source_digests == pack.fields
- `retained_import_digest`: cs_evidence == cs_split == cs_search == cs_freeze == cs_replay == cs_freeze.integrity.expected == cs_freeze.integrity.observed
- `engine_release_id`: progress == spec.client == pack.fields == lineage.primary_run == atlas.selected_release_id
- `config_digest`: progress == spec.client
- `selected_trial_id`: cs_search.selection == cs_search.roles.selected == cs_freeze.frozen_selection == rc.selected_params.source_id == publication.promotion_pick
- `selected_trial_ordinal`: cs_search.selection == cs_freeze.frozen_selection == rc.selected_params
- `selected_trial_ordinal_scope`: cs_search.selection == cs_freeze.frozen_selection == rc.selected_params
- `fold_selection_fold_id`: cs_search.selection == cs_search.roles.selected == cs_freeze.frozen_selection == rc.selected_params.study_id
- `fold_selection_scope`: cs_search.selection == cs_search.roles.selected == cs_freeze.frozen_selection
- `selected_parameters`: cs_search.selection == cs_freeze.frozen_selection
- `selected_params_digest`: rc.rail.selected_params == pack.fields.parameter_bundle_digest == rc.fields.parameter_bundle_digest
- `pack_digest`: rc.local_seal == pack == publication == lineage.release_candidate
- `release_candidate_id`: library.rc == rc.local_seal == pack == publication == pack.fields == lineage.release_candidate
- `source_fingerprint`: rc == rc.draft == pack.frozen_core == pack.frozen_core.draft
- `report_revision`: report == pack.fields == rc.fields
- `evidence_revision`: library.evidence_revision == cs_evidence.revision == report.source_revisions == pack.fields == rc.fields == compare_attempts.provenance
- `split_revision`: cs_split.revision == report.source_revisions
- `search_revision`: cs_search.revision == report.source_revisions
- `freeze_revision`: cs_freeze.revision == report.source_revisions
- `replay_revision`: cs_replay.revision == report.source_revisions
- `workspace_id`: cs_replay.page.next_cursor == execution.approval-inbox == execution.runtime-manifest == progress.workspace_id == spec.workspace_id == rc.workspace_id == report.workspace_id == pack.workspace_id == publication.workspace_id == lineage.workspace_id == compare_attempts.workspace_id == cs_search.workspace_id == cs_freeze.workspace_id

Also: `chronology` (created <= retained <= sealed <= later as_of; pack.sealed_at == rc.local_seal.sealed_at), `stability_5s` (two reads 5s apart, volatile keys as_of*/cursors stripped, digests equal), `as_of_monotone_across_rounds`, `replay_cutoff` (all replay pages + evidence-series points strictly before the declared window end).

## Triage notes (context for the FAIL rows; none is downgraded)

- `*_revision` FAILs: the sealed report pins source revisions (`frozen_core.source_revisions`) that differ from the live `current-source/*` revisions. For R-WFO-023/022 (stale seals) the evidence/fingerprint drift is the expected stale-seal condition; for R-WFO-027 (fresh seal) evidence_revision matches but split/search/freeze do not, and split_revision == replay_revision inside the report - a real cross-screen identity gap to review.
- `eq:source_manifest_digest`: Compare(attempts).provenance.manifest_digest is a different value from every other manifest digest (and identical for R-WFO-022 and R-WFO-023), i.e. it is not the per-run source manifest.
- `stability_5s` on publication: `updated_at_utc_ms` moves between reads of the same unchanged publication (tracks wall clock, not a stored timestamp).
- `S2m` PASS_WITH_NOTE: error wording differs between foreign-workspace and unknown-run (same status and code).
- S7 note: the Execution approval inbox and operations queue are empty on this preview (fixture delivery profile), so the before/after equality is weak evidence for isolation.
