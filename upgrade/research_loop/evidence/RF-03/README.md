# RF-03 backend repair ledger — 2026-09-23

P07/P08 compatibility correction: import/parser and registry projection now reject `warmup_bars > 100000`, matching P08's immutable preflight ceiling. Previously a source could pass registration but fail every bound preflight. Focused parser and Control API regressions cover `100001`; no runtime flag or persisted source data changed.

Branch: `docs/research-loop-plan`. This packet is a live evidence index, not a release or activation approval. Source/runtime data, Execution, dev and main are unchanged.

## Delivered code

| Request | Commit | Generated type / example | Evidence |
|---|---|---|---|
| CG-P02-01 | `3bb91fa5` | `research-preflight.d.ts:components.schemas.RequestedSpec`; `{schema_version:"research.requested-spec.v1", ...}` has no wire `$defs` | strict Zod round-trip + contract test; Control API build |
| CG-P06-04/05 | `b0277b4f` | Existing P06 failure vocabulary; `{code:"RESOURCE_EXCEEDED", cpu_seconds:1}` for bounded wall/CPU failure and fractional use | focused Python 21/21; default NATS test omitted only because local venv lacks `nats` |
| CG-P09-03/04 | `ea221dc2` | `research-foundation.d.ts:components.schemas.JourneyResponse`; `descriptor.revision=2`, 8 phases, 28 cards, 6 mapping rows, `target_fragment:"stage=claim"` | exact HiFi HTML count 3+3+2+2+2+9+3+4; immutable registry v1+v2; P09 PostgreSQL 7/7 |
| CG-P09-05/06 | `ea221dc2` | `research-foundation.d.ts:components.schemas.AtlasResponse`; historical example `{selected_release_kind:"HISTORICAL",atlas:null,historical_identity:{facts_state:"NOT_PUBLISHED"}}` | 32/8/16 max contract test; historical route/mode filter refuses 404; no 1.1.1 facts relabelled as 1.0.8 |
| CG-P10-03/05 | `f8217217` | Existing `RESEARCH_RUN_ALPHA_NOT_ACTIVE` / `RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE`; non-default mode/schedule is refused before dispatch | disposable PostgreSQL P10 5/5 |
| CG-P10-06 | `3bb91fa5` | `research-progress.d.ts` availability: `QUEUED_NO_SOURCE`, `CANCELLED_BEFORE_SOURCE`, `PENDING_SOURCE_CALLBACK` | focused progress service tests 5/5 |
| CG-P04-02 | `57cf04ee` | `research-foundation.d.ts:AtlasMode.invalid_schedules`; `{schedule:"per_fold_causal",admission:"NOT_ADMITTED",reason:"...inner_split_frequency...",source:[...]}` | pinned wheel SHA; P04 Python 32/32; contracts 7/7; Control API build |
| CG-P09-02 | `5069b39a`, `b1afae0c`, `1f8fbac9` | Journey v2, current/historical Atlas and P08 preflight canonical response fixtures | P08 disposable PostgreSQL 10/10; current Atlas producer parity; contract suites 7/7 + 4/4; snapshot parity 202/202 |
| CG-P04-03 | `05b4e96c` | `AtlasMode.invalid_schedules`; all five modes have a reason for every rejected schedule | 5×3 partition; pinned-wheel RECORD SHA and anchor checks; P04 Python 32/32 |
| CG-P06-01 | `390f179a` | `research-progress.d.ts:ProgressQueue/ProgressAttempt`; bounded ordinal/state/claim/start/end, queue class/time | disposable P11 PostgreSQL 9/9; generated contracts 3/3; Control API build + frontend tsc; no worker IDs/lease tokens |

All three response families are pinned: Journey v2, current/historical Atlas and P08 preflight. The latter comes from the disposable PostgreSQL P08 producer test, with only opaque token and expiry normalized. No frontend files were staged by Codex.

The full monorepo pre-commit gate passed on `3bb91fa5` and `ea221dc2`. Later P06/P10 commits used the already-run full gate plus their own focused regressions to avoid a second and third resource-heavy full run.

### P05 receipt-writer checkpoint — 2026-09-23

The feature-dark P05 bridge uses a signed private service principal and exact P06 lease to reserve/seal a verified one-row `run_receipt` Parquet artifact. It records a real `research.artifacts` row for S03. Lost-ACK replay reuses immutable bytes; failed/expired leases abort only WRITING candidates. No browser route, source DB, Execution, deployment or legacy artifact replacement was added. Both flags default `false`.

This is **partial CG-P05-01**. Current P10 Delta has no admitted RS-02 Advanced-WFO observations/folds/trials/candidates/selection; S04–S07 remain typed `PENDING_RETENTION`. Next: P10 source admission and P06 trusted child progress, then wire the existing RS-02 importer. Do not claim RF-03 complete or show this one-row receipt as rich trial data.

### P07 source-backed registry checkpoint — 2026-09-23

`RegistryEntry` now projects alpha name, full source digest and server-owned strategy ID; its immutable declaration projects validated required candle columns and warmup bars. Python AST mirror adds literal version. Code commit: `a1926f25`. Source: `research.alphas.name`, `research.alpha_versions.code_digest` / import source digest and `declared_contract`, not browser input. Generated fields are additive for existing frontend fixtures; current server emits them. Tests: P07 disposable PostgreSQL 9/9, parser 9/9, contract 5/5, Control API build, frontend TypeScript, and full pre-commit 117/117 files, 813/813 Control API tests. `CG-P07-03` remains OPEN for the unproven 14-field mirror. `CG-P07-05` is DELIVERED by `349657bb`: migration `0057` stores the exact registration-time predecessor, replay cannot drift to the present active version, and historical rows are typed `HISTORICAL_NOT_RECORDED`. P07 PostgreSQL 9/9, contract 5/5, Control API build, frontend TypeScript and full hook passed. Warmup admission was aligned with P08 in `348632e5`. No runtime/auth change.


P05 evidence: Control API build, private-ingress/config 22/22, Python retention/worker/artifact 35/35, disposable PostgreSQL P05 5/5 and P11 10/10, P01 route inventory 227/collision 0. The final full monorepo hook passed after the three stale RS-01 test mocks were corrected in the P05 code commit `d820d5ce`. `npm run typecheck` reports pre-existing test-fixture errors unrelated to P05; `npm run build` passes. No runtime activation or frontend file was included.

## RF-02 backend review

P04 ruling `CG-P04-05`: QuantBT 1.1.1 does not publish a per-mode certification cap or a normative avoid-when instruction. The already-published `AtlasNotPublishedFact` is retained with an explicit reason; the cert-cap source locator is `quantbt/core/certification.py:164-195`, SHA-256 `9b1e9ff44f70850165fb48cc035887d688a5ef55989ac9899f12c23a8781ec35`. The absence of avoid-when guidance is recorded by the catalogue at `apps/portal/registry/research-engine-catalog.v1.json:502`; it is not promoted into a fabricated engine fact.

- `CG-RF02-06`: ACCEPT route gate `e5daa7e2`, private Python Atlas removal `a0d0004d`, cursor v2 `c7cc1ceb`/`dbe569e8`, retained-artifact typed read `c0166746`, sourced Atlas facts `d67a0fb4`, walk-forward options `99d5b2a5`, config digest `996eef6c`. Independently checked three pinned QuantBT source-locator tests: path/range/anchor and wheel RECORD digest all PASS. This accepts the declared facts, not any unpublished cert cap.
- `CG-RF02-02`: ACCEPT `5b2cf660` idle NATS pull timeout recovery by code review; local venv cannot run its NATS test because `nats-py` is absent. The preview-image test remains the runtime proof.
- `CG-RF02-04`: ACCEPT `12750366` warmup-inclusive timeline; the RS-01 ingress requires the same first instant and the existing regression covers it.

P07 ruling `CG-P07-06`: `may_activate` is the caller's server-derived permission, not a lifecycle promise. The registry publishes `lifecycle_state` separately; the meaningful first activation affordance is `may_activate && lifecycle_state === "DRAFT"`. Example `{"may_activate":true,"lifecycle_state":"DRAFT"}` allows the button for this actor and version; `{"may_activate":true,"lifecycle_state":"ACTIVE"}` is only an idempotent replay. SUPERSEDED/ABANDONED refuse at the repository CAS. Keep the boolean's published meaning stable; Claude should combine the two typed fields for the button.

- Preview auto-login `6a87f77b`: Bobby explicitly accepts a public research preview for now; it is isolated with its own preview volumes and local profile. It maps unauthenticated traffic to a configured preview principal, so **it must not be copied into dev/main/stable or treated as production authentication**. No runtime/auth change was made in this review.
- `CG-RF02-01` narrow seccomp/AppArmor and `CG-P05-01` artifact writer/retention are **not** accepted as complete; the preview's unconfined worker and pending retention remain named risks.

## Not yet delivered — do not claim RF-03 complete

The request-list statuses in `CODEX_REQUESTS_FROM_CLAUDE_P01_P10.md` remain authoritative. The larger contract/producer work still includes P02 advanced WF; P04 mode/schedule facts and route matrix; P05 artifact writer; P06 live child progress and attempt read; P07 registry/gates; P08 advanced preflight/catalog; P10 scoped adapter widening and progress facts; P11 snapshot completeness. DQ-03/05/07/10/11 were approved by Bobby, but approval is not implementation evidence. Source facts that cannot be proven remain typed `NOT_PUBLISHED`, never sample values.

Claude RF-04 may consume the delivered generated contracts now. For historical Atlas, branch on `selected_release_kind`; `atlas` is null with a typed historical identity. For Journey, use descriptor revision 2 and verify the 28-card HiFi inventory (the earlier audit said 27 incorrectly). Do not infer a reachable browser route solely from a server `AVAILABLE` badge; the frontend route map still owns path resolution.

## Continuation 2026-09-24 — partial source-backed P06/P07/P08

- `CG-P07-03` stays OPEN: the private AST parser publishes `check=VERIFY|GATED` and a per-field note on its eight literal mirror rows. VERIFY is not PASS. The class/output/route claims in HiFi are not source facts under Bobby's DQ-05 ruling; no 14-field value was invented.
- `CG-P07-04` stays OPEN: parse/gate receipts now expose server expiry in UTC milliseconds; parse optionally verifies caller-declared source SHA-256 before custody; failed gates emit exact `QUARANTINED_*` codes. `RUNNING` is only client request-in-flight state for this synchronous operation. Parser time is not attributable per gate.
- `CG-P06-02` stays OPEN for trial/fold/ETA: P06 reports a bounded heartbeat only while its confined child is observed alive via the existing P11 durable journal. It does not infer percent, tqdm, fold segments or resource use from elapsed time. Callback failure kills the exact process group.
- `CG-P08-05` stays OPEN for sweep/evaluation ceiling and full advanced-WF rules: P08 refuses trials above the current release's catalog-published ceiling and validates seed/pin/sweep against the immutable AlphaVersion declaration before snapshot serialization. P10 execution admission remains narrower than preflight.

Focused proof: P07 disposable PostgreSQL 9/9, Control API digest 2/2, generated contract 5/5, parser 10/10; P06/P10 real-child tests 11/11 excluding the known local `nats-py`-missing test; P08 snapshot 13/13; combined Python 45/45; Control API build and frontend TypeScript pass. NATS is NOT_RUN, not PASS. No runtime, dev/main, protected Execution, source DB or FE composition changed.

RF-04 handoff to Claude: consume regenerated `research-alpha-import.d.ts` fields in S14: actual parse/gate expiry, typed digest mismatch, gate `quarantine_code`, and mirror VERIFY distinct from PASS. Never synthesize absent 14-field values or a running gate from terminal receipts. Claude's uncommitted `foundation.test.tsx` was not staged or edited by Codex.

Next dependency order remains P10 executable current-source profile → P05 WFO retention/importer, then P06 child trial/fold facts and remaining P08 validation. A P07 imported source is not an installed executor; binding it to the fixed P04 Delta child would mislabel results. `CG-P10-02`, `CG-P05-01` and all remaining IDs remain OPEN until producer/retention receipts exist.

### P08 declared-optimization continuation — 2026-09-24

P08 now loads the immutable database entrypoint with the exact AlphaVersion declaration and rejects a missing required seed, undeclared parameter, pin/sweep outside a declared range/step, or categorical value outside the declared set before snapshot creation. The existing private adapter also refuses `optuna_trials` above the current release trial ceiling before sealing. This is **not** P10 execution admission: imported/DRAFT versions and WFO still require a real installed adapter. `CG-P08-05` remains OPEN for the independently sourced sweep/evaluation ceiling and full advanced-WF fields.

Evidence: generated-wire P08 focused 4/4, Control API build, isolated PostgreSQL preflight 10/10. No frontend file was staged or edited. RF-04 can consume the current typed refusal but must not display a green executable-WFO state from a successful preflight.

### Round-2 source feasibility probe — 2026-09-24

The approved read-only HMD loader and pinned `quantbt-engine==1.1.1` were exercised directly, without Portal admission or runtime activation. The loader reported release `primus-historical-market-data-deribit-quantbt-v1.0.0rc1`, manifest digest `f657851c3717835c460a8dbed28865cfaf5cc854f62a0e2570860c2e451a9d47`, dataset `crypto-binance-1m`, BTCUSDT 1h, 2026-06-01T00:00Z–2026-07-15T00:00Z, 1,056 closed bars, content hash `2c38237305c34a0d916573945d6472c5fa5a1b7a238ef3c26e9568cf0a8fb9a1`. The public `QuantBTEndpoint.walk_forward` with `target_mode=signal_notional`, first OOS 2026-07-01, weekly/expanding, Mode 1/global and three actual Optuna trials completed: `n_folds=2`, `n_optuna_trial_rows=3`, one study; measured compute was 3.623 CPU seconds, 3.176 wall seconds, max RSS 332,888 KiB. The public support matrix independently lists `signal_notional` as supported. This proves engine/source feasibility for a narrowly versioned adapter; it does **not** prove P10 admission, confined child resource use, P05 retention, preview API, imported/DRAFT Alpha execution or any RF-03 closeout. Do not extrapolate these small-run measurements into a production cap.


The Portal QuantBT gateway now has an explicit `signal_notional` argument guarded by the pinned source capability matrix while retaining the legacy `pct_equity` default. The real-HMD opt-in test executes through that gateway; a focused regression also executes the existing profile, and negative tests reject unsupported/unadmitted routes. This is a versioned-adapter seam, not a P10 admission or an imported-source executor. Focused suite: 5/5 PASS.
Repeatable opt-in gate: `cd apps/portal/backend && PORTAL_RUN_HMD_REAL_SMOKE=1 HISTORICAL_MARKET_DATA_ROOT=/srv/primus/historical-market-data/storage PYTHONPATH=src:.. ../.venv/bin/python -m pytest -q tests/test_historical_data_real.py::test_approved_btcusdt_signal_notional_walkforward_public_api` — PASS (2026-09-24). The test is skipped without the explicit real-HMD opt-in; this remains source-feasibility evidence, not a Portal preview run receipt.

### Additive Signal Notional P05 source adapter — 2026-09-24

- Added the separate profile `rs02.delta-signal-notional-wfo.v1` and adapter `rs02.quantbt-signal-notional-wfo.v1`; existing `rs02.delta-wfo-global.v1` / `pct_equity` remains the default with its wire identity unchanged.
- The WFO runner accepts `signal_notional` only as an explicit server-selected argument, checks the pinned QuantBT support matrix and rejects request/adapter mismatches. Generic calls still default to `pct_equity`.
- The current-source serializer checks target mode against the exact profile and seals the same bounded observations, folds, trials, candidates and selection relations under the new adapter identity. The profile pins the measured three-trial seed-42 global Mode 1 shape; it does not execute imported Python source.
- Verification: adapter, runner and fold-plan tests **23 passed**; the approved HMD public API signal-notional WFO probe **1 passed** against the read-only historical source. The opt-in HMD → QuantBT WFO → local P05 seal test also passed for BTCUSDT 1h (2026-06-01 through 2026-07-15), asserting multiple folds, three real optimizer trials, all five retained relations, and the byte-verified manifest digest; output is confined to pytest temporary storage.
- Partial only: no P10 durable admission/isolated child, imported/DRAFT Alpha execution, Control API artifact seal/import or current-branch preview receipt. This does not close `CG-P10-02`, `CG-P05-01` or RF-03.

Source-backed implementation boundary for `CG-P10-02`/`CG-P05-01`:

- Imported Alpha bytes are retained in Control API `research.import_sources` (`repository.ts:840–903`), but the P10 private DTO (`research_run_producer.py`) accepts only `p04.delta-rsi.v1` and the P06 child accepts only task `P04_DELTA_SMOKE`. An imported/DRAFT version therefore has no trusted installed executor or digest-bound source transfer to the isolated child. Do not admit it by merely relaxing `lifecycleState` or changing the adapter label.
- P07's restricted definition check explicitly does not call the function body or certify runtime safety (`research_alpha_analyzer.py:1–13,312–330`). P06 currently unshares the child network/user/mount namespaces but does not confine arbitrary imported Python to a private filesystem/seccomp policy (`research_supervisor.py:120–244`); `CG-RF02-01` remains open. Imported execution must not be enabled by this gateway seam.
- The RS-02 current-source artifact adapter (`current_source_artifacts.py`) pins `pct_equity` and profile `rs02.delta-wfo-global.v1`; it cannot be silently repurposed for the measured `signal_notional` result. A new profile/contract and sealed-table importer must preserve the v1 reader for existing artifacts.
- The preview identity file still names build `62d7d8640c8ebaf9955ad5f185a8d6f319f604ea`, not this branch's latest backend. No current-branch P10/P05 real-API receipt or `DELIVERED` claim follows from the direct engine test.
