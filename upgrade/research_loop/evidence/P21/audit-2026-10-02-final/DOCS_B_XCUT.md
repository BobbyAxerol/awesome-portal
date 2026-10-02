# DOCS_B cross-cutting: CODEX §19 rows, deferred FE list (read-only GETs on :8095, code at b965741e)

## (a) CODEX_BACKEND_GAPS §19 rows, verified on the preview
Method: GET via the auto-session (runs/library/evidence/search/replay/progress/compare/bar-metadata/catalog).

| row | verdict | evidence |
|---|---|---|
| G-01 pair S13 | DELIVERED | R-WFO-023xR-WFO-022 and reverse: 200, common_window AVAILABLE (1488 obs), chart_annotations per run; 020x023 200. WFO x P04 = typed REFUSED P20_CONTRACT_KEY_MISMATCH; P04 x P04 (021,022) common_window NOT_PUBLISHED (honest) |
| G-02 R-P04-021 two net returns | PARTIAL | now every number carries its basis (`return_basis` FIRST_LAST_RETAINED_OOS_EQUITY_V1 = -0.154%; engine `net_oos_return` +0.1217% quantbt.full_report.total_return_pct; last_30d +0.083%), but S09 still prints +0.12% and -0.15% as "net OOS return" without naming the path (see S09 N-03) |
| G-03 hub NOT_READY | DELIVERED (for these runs) | hub P04-021 readiness COMPLETE; WFO-023 PARTIAL, enriched AVAILABLE |
| G-04 failed-run counts | DELIVERED for P04-020 | reported 0 / declared 1, trials 0/1, `SOURCE_DID_NOT_REPORT_FOLDS`; but `overall.pct`=10 with basis SOURCE_STAGE_WEIGHTED_V1 on a FAILED run (check S03 does not show it as progress). 351 vs 350 WFO count not re-checked |
| G-05 split 409 for FAILED | DELIVERED | P04-020 split: 200 typed NOT_APPLICABLE |
| G-06 P04 OOS Sharpe, last-30D window | DELIVERED | P04-021 sharpe 0.744 ENGINE_DIRECT OOS; last_30d has window_start/end_utc_ms. Old seal R-P04-006 still not published (backend) |
| G-07 trial paging + surface params | DELIVERED | ledger.page next_cursor/has_more; surface.points[].parameters present (400 pts). Note: `offset=` param is a 400, only cursor works |
| G-08 blotter/MAE/order-fill WFO | OPEN | replay route_capabilities orders/fills NOT_PUBLISHED QUANTBT_ROUTE_EMITTED_NO_ORDER_RECORDS; trades_published 0 |
| G-09 local_seal lock flag | DELIVERED (per Codex/Claude 022 + S11 agent: sealed RC shows no edit), but S11 shows contradictory "local seal blocked" + "SEALED LOCALLY" (S11 new gap P2) |
| G-10 bar-metadata | PARTIAL | verified_range + earliest_start_with_warmup AVAILABLE; instrument facts typed NOT_PUBLISHED HMD_READER_INSTRUMENT_METADATA_NOT_PUBLISHED; supersedes_state HISTORICAL_NOT_RECORDED (typed) |
| G-11 old-seal backfill | PARTIAL | Library: 10 COMPLETED runs AVAILABLE incl. old WFO; 7 COMPLETED P04 runs enriched NOT_PUBLISHED SEALED_ENRICHMENT_NOT_COMPUTED; 10 have last_30d NOT_PUBLISHED |
| G-12 histogram stats | DELIVERED | mean/median/var_95/cvar_95 + policy |
| G-13 drawdown labels/regime | DELIVERED | label present; regime typed absence SOURCE_DID_NOT_PUBLISH_MARKET_REGIME |
| G-14 windows | DELIVERED | windows.is/oos/holdout; IS/holdout typed absences |
| G-15 sparkline at_utc_ms | DELIVERED | |
| G-16 rolling series | WONT_DO by D-AN-01 | `rolling: null` |
| G-17 compare annotations | DELIVERED | chart_annotations[] per run |
| G-18 non-Binance, executor v2 etc | OPEN (Codex) | |
| A-01..A-04 | ANSWERED, no FE wait | |
| FE-01 | DONE per Claude §28 receipt (not re-driven) |
| FE-02 | DONE per F7b |
| FE-03 | DONE (F5 visual closed) but S03 progress and S12 atlas have no baseline (below) |
Stale ledger: §19 status column still says OPEN for G-01..G-17; §22/§24/§28 already moved them.

## (b) Deferred / unaddressed FE list at HEAD
| item | status | evidence |
|---|---|---|
| S02 U21 | PARTIAL: Strategy step caption "not set" FIXED (NewRun.tsx:337); Route step stays "valid" with no version, SKIPPED by decision (fix2/S02.md) | |
| warn-before-leave on draft | OPEN by decision: no beforeunload/useBlocker anywhere in src; replaced by sessionStorage draft (runDraftStore.ts) so reload restores; navigating away inside the app silently drops it | |
| PortalApiError drops error.details | OPEN: apps/portal/frontend/src/lib/api.ts:192-203 has status/code/requestId only; live 400s carry `details.gate/field_paths` |
| FreezeRoute workspaceId | OPEN: FreezeRoute.tsx never passes workspaceId to FreezeScreen (FreezeDetail.tsx:1536,1602 accept it); child-audit companion read uses the default workspace |
| tsconfig aliases for companion contracts | LEDGER_STALE: childAuditCompanionClient.ts:14 imports by relative path; no alias needed (tsconfig has 18 research aliases, none for the two companions) |
| EChart `group`/connect, S08 dataZoom | OPEN (S08 agent: candle dataZoom sync pending) |
| evidenceCursor does not carry fold/playhead/window to all links | PARTIAL (S08 `window` in query only; S11 crumb loses #fold; S14 reset to fold=1) |
| skip link / copy-button aria / ink tokens (NEEDS-SHARED) | skip link present per S11/S12 agent, rest unverified |
| visual baselines | OPEN: e2e/research-loop.visual.spec.ts has 14 cells (28 PNGs); labels use "repo screen NN" numbering (slug rl-s03-search = repo screen 06, rl-s05-freeze = 07, rl-s06-split = 05) so names do not match S-numbers; no cell for S03 Run Progress, none for S12 Atlas |
| first-load blank | UNVERIFIED: one cold /research/quantbt/runs screenshot after networkidle+2.5s was entirely white, second load fine; maybe preview load, recheck |
