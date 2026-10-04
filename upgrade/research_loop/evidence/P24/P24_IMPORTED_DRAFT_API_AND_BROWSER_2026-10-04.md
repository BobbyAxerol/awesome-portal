# P24 — imported DRAFT real API and browser continuation

Recorded 2026-10-04. Verdict:
**IMPORTED_DRAFT_API_AND_READ_ONLY_BROWSER_CONTINUATION_ACCEPTED** for the exact
restricted, all-pin fixed imported profile. This is not a full GUI-import,
15-screen product, publication, engine-WFO or signed-release verdict.

## Scope, run and physical candidate

Owned clone `portal-research-p23-ol12`, loopback `8096` only. No shared8095,
dev/main/production, direct source write, activation or publication operation.
Root coordinated the worker start for **one** new child and stopped it after
completion. Browser resume created no child (job count **68 → 68**).

- Run: `rrun_534c60ecb6337bb1503e48f8726142b7`.
- AlphaVersion: `av_p23_section32_imported_0_1_0`, still **DRAFT**.
- Actual engine: **1.1.1**, adapter `p17.imported-signal-notional.v1`, adapter
  contract `b4fb03ec7c02707cd91f13d7e6392ca3c51721389d7cddba57a4492ab93593a6`.
- Source bytes SHA-256:
  `2f20f649e34a4bea4895da946af3c30727a98432d66b7773f0e04484db5dd560`.
- Real HMD `crypto-binance-1m`, `BTCUSDT/1h`; UTC IS `[2026-06-01, 2026-06-08)`,
  OOS `[2026-06-08, 2026-06-15)`, declared/sealed holdout `[2026-06-15, 2026-06-17)`.
- One trial, seed42, exact declared `scale=1000` pin. Source declaration uses
  `warmup_bars=2`. Holdout is not given to the confined execution child.
- Control image:
  `sha256:108c7d604b67ad34f201bbb0c485ad1770e0db7cecab3042900ab80e94cc07c0`.
- Final Web image:
  `sha256:eaf966b9c7833a041d665a7527984e11726759289dfd0e261abe32f16e0bbdfe`.
- Python and dispatched worker both:
  `sha256:c939a7b5639a9a17419af60ae40269546340af9a9ea0d712b4b58766c52e2738`.

## Real API path

The original `section32-imported-profile-receipt.mjs` authenticated fresh QA97
through bootstrap activation, own password replacement and normal login.
It used actual parse201 → seven import gates200/all-pass → register201/DRAFT.
Missing declared parameter pin returned preflight201 with `may_create_run=false`,
field `parameter_space_overrides`. Adding the exact declared pin returned
preflight201/`may_create_run=true`, then create202 and a real confined child.

Durable job `SUCCEEDED`, public Progress **COMPLETED**, terminal materialization
**READY**, one reported/done fold. Evidence, Split, Search, Freeze, Replay,
Report and RC composition all returned200. Actual child tape: **338 bars,
1 trade**. Engine-direct OOS ending equity **"20000"**; chronological OOS
return/drawdown **"0"** are actual results, not substituted missing values.

Freeze reports engine pin1.1.1 and exact imported adapter. Stage4 sealed/replay
parameter digests both
`a3e52e0c7ee49e47eaa11e3feab3876d66d28e0a815796156240d7a1573ac3cd`;
source/runtime bundle digests both
`301691d928f7c974a591ec3ab101c23a2c984f7aaf99126938b7492f19b85e25`.
Both pairs are **MATCH**. Byte-integrity verification remains accurately
`NOT_VERIFIED / P16_ARTIFACT_BYTES_NOT_VERIFIED_YET`; this lane did not call a
verification mutation or pretend materialization alone is byte verification.

Report revision:
`p18r1_232a8205ac83add0d99376f3fa8e7741d50a382888d064434a7dbbe0c4ff760e`.
Scope remains `CAPTURED_READ_REPRESENTATION`. Final audit is explicitly false,
not a missing WFO audit. RC cannot seal the DRAFT AlphaVersion:
`P21_ALPHA_VERSION_NOT_ACTIVE`; publish remains disabled/local-seal-required.
Registration signature and SBOM retain their typed `NOT_PUBLISHED` reasons.

## Actual browser continuation and diagnostics

QA97 API execution completed and its normal `finally` disabled/revoked it.
The initial browser matcher incorrectly accepted the HTML navigation whose
pathname ended with the same run/screen suffix. QA98 diagnosis established
this was a **harness matcher bug**, not a Portal read failure. Their failed
receipts were preserved; they are not counted as browser PASS.

The matcher now binds exact origin8096, `/api/v1/research/.../progress` or
`/api/v1/quantbt/.../{report,release-candidate}`, GET and status200 before
JSON parsing. Six cheap matcher checks pass, including refusing the HTML
route, wrong method/status/origin/run. No product code or RBAC was changed.

Root approved one fresh ordinary **USER** reviewer QA99 with **MEMBER** only
in this run's owned clone workspace. Its normal member API reads all returned
200 before browser navigation. Real Chromium then opened Progress → Report
and clicked the actual Report→RC link with preserved `workspace_id`.

- **3/3 browser pages PASS**, real named API responses200, no stubs/fixtures.
- Exact Report revision and imported AlphaVersion matched the API receipt.
- Report/RC show linked audit `NOT_APPLICABLE` and issue **zero** audit reads.
- RC's local seal is disabled; no activation, draft-save, seal or publish click.
- **0** browser product writes, **0** page errors, **0** console errors/warnings.
- Horizontal overflow **0 px** on all three1280px pages; PNGs hashed privately.
- API actor is QA97; browser reviewer is QA99. This is explicitly **not** a
  same-actor or every-button/full-GUI-import receipt.

## Read-truth caveat raised to parent

The imported Evidence response exposed one pre-existing compatibility mismatch:
legacy `metrics[BENCHMARK_RETURN_FRACTION]` has `value:null`,
`scope/origin:NOT_PUBLISHED`, but `availability:AVAILABLE`. In
`evidence.service.ts` the real analytics-v2 benchmark upgrades
`source_absences.benchmark`, while the legacy scalar still hard-codes null.
The analytics-v2 fact must stay available; the legacy scalar must either map
the true typed value/provenance or keep a typed legacy absence. No zero or
fake fact should be inserted. Parent was notified with exact source locator;
this engine/import harness agent did not change that product read.

Parent's later narrow amendment fixes the legacy scalar to
`NOT_PUBLISHED / P13_LEGACY_BENCHMARK_USE_ANALYTICS_V2` without erasing actual
analytics-v2 or rewriting the imported receipt/seal. One focused regression,
affected Control build and actual GET on the already-authorized earlier
imported run passed; no membership widening. See
[current-candidate amendment](./P24_CURRENT_CANDIDATE_CLOSEOUT_2026-10-04.md).
The API/browser pins above remain their actual original pins, not relabelled
as proof of that later Control image.

## Custody, hashes and C4

Private packet:
`/home/bobby/.local/state/portal-research-p23/20261004/imported-candidate-qa97/`.

| File | SHA-256 |
| --- | --- |
| Original QA97 API receipt | `016dd44fc52348683effdefe3e5eb4e5c03d87e952904492d48e630e9d763db2` |
| QA99 GET-only resume receipt | `b16d127c2c91ea321862ff2eca9b1c403d9f2567175c234d2a076ef671287659` |
| QA99 browser continuation receipt | `8b47d6ea88611b3503dafd5c624b47e36166c8c031f016d0a2b9f051d45c4871` |

Browsers/contexts closed. Independent persisted readback: QA97, QA98 and QA99
all **DISABLED**, active sessions **0**. QA99's interruption-safe private
password was removed after normal disable/revoke. No credential reset,
re-enabling old actors, owner bypass, public token/log or new job in resume.
Root owns final cell teardown and final candidate/Unified/queue acceptance.
