# RF-03 backend repair ledger — 2026-09-23

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
| CG-P09-02 partial | `5069b39a` | Journey v2 and historical Atlas canonical response fixtures | contracts 6/6; snapshot parity 200/200; preflight fixture outstanding |

Only the Journey and historical Atlas responses are pinned. The preflight fixture remains outstanding, so `CG-P09-02` is PARTIAL, not delivered. No frontend files were staged by Codex.

The full monorepo pre-commit gate passed on `3bb91fa5` and `ea221dc2`. Later P06/P10 commits used the already-run full gate plus their own focused regressions to avoid a second and third resource-heavy full run.

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
