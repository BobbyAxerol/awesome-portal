# P24 continuation — canonical sample and actual sampler observations

Client date 2026-10-05 Asia/Saigon; executions 2026-10-04 UTC. Baseline
`99de587e`, worktree `portal-research-be`, branch `codex/be-gaps`.
Scope: Bobby's two approved requests, not another phase or engine upgrade.
Source delivery is complete; the normal grouped hook and post-commit Research
preview rollout are recorded separately below. No remote push, dev/main merge,
production operation or signed Portal 2.0.0 release is included.

## 1. One real, purpose-separated sample

[Authoritative source](../../../../apps/portal/frontend/src/research/samples/deltaRsiReference.py),
[researcher guide](../../examples/DELTA_RSI_REFERENCE.md),
[definition/security evidence](../P07/CANONICAL_DELTA_RSI_REFERENCE_2026-10-05.md).
The single raw source has three stateless classes/seven methods, a literal
contract and one public entrypoint. Parameters, indicators, signal policy
and entrypoint are documented separately. **Use sample** and **Code anatomy**
refer to that same source. Its SHA-256 is
`bd8a5b68e9a72023069731020a3e890463609eecb1565ef8c9ed713a87ebd2ac`.

Analyzer and actual child now share a bounded pure-definition validator for
helper modules; old single-function behavior remains. Imports, IO, reflection,
dunders, inheritance, instance state, recursion and authority shadowing remain
blocked. No protected strategy source or installed QuantBT source is changed.
The sample is explicitly a bounded-window reference, **not** a protected
full-history kernel parity claim, trading certification or Bobby-private code.

Actual pinned imported child receipt:

- QuantBT **1.1.1**, 500 bars from the existing golden market dataset.
- Exact final source hash above; no earlier source revision substituted.
- Execution profile digest
  `f1ed5dbccdd90ca7dd35be2755f3b3b5f7e9a29b1641beb08bd0136783c0f298`.
- `num_trades=1`, `final_equity=20000.0`: execution evidence, not a performance
  recommendation. This is the pinned child entrypoint test, not a GUI
  registration/create/activation receipt.
- Private receipt:
  `/home/bobby/.local/state/portal-research-p23/20261005/sample-sampler/canonical-real-child.log`.

## 2. Actual source-time trace, not a reconstructed ledger

[Producer/retention/parity packet](./P24_SAMPLER_PUBLIC_CAPTURE_2026-10-05.md).
The confined child observes the actual effective Optuna sampler's public
methods, calling each original once. Actual proposals/distributions, source
study/trial identity, sampler/pruner classes, UTC observation time and terminal
outcome are retained in a bounded immutable document. No extra RNG call,
private engine edit, broker call or ledger-based reconstruction is introduced.

Full artifact limit is 256 KiB/400 trials/16 studies; public summary is
8 KiB/8 samples. Capture completeness and summary sampling are separate.
P05 adds the exact source bytes to its manifest and source-transform digest.
Old seals without this artifact keep their original bytes/identity and return
`SAMPLER_PUBLIC_HOOK_TRACE_NOT_RECORDED`.

Wire boundary remains explicit:
`OPTUNA_PUBLIC_SAMPLER_INVOCATIONS_NOT_TPE_DENSITY`. Search now displays actual
execution observations when available. Constructor configuration and private
TPE density/ranking are not guessed; the old internal-trace absence is retained
as a distinct fact, not used to hide the new available execution trace.

### Actual historical-data confined child → P05 → TS read projection

- Read-only Historical Market Data: BTCUSDT / 1h,
  2026-06-01 through 2026-07-15; first OOS 2026-07-01; seed 42.
- QuantBT **1.1.1**, installed Optuna **4.8.0**; actual **TPESampler** and
  **DuplicatePruner**, source study `0`, direction `MAXIMIZE`.
- **1056 observations, 2 folds, 3 trials, 36 sampler invocations**.
- CPU 4.744 s, wall 5.176 s, peak RSS 310456320 bytes.
- Capture **AVAILABLE**, complete, zero omitted trials. Summary and retained
  source both record all three trials.
- P05 document bytes **2596**, SHA-256
  `794d1d2fdac6b856feb767c9866533b1fedfef8b190bd4189fba40f1cac73909`.
  Source, retained document, manifest and public summary agree byte-for-byte.
- First actual returned pins: `window=34`, `rsi_l=30`, `signalLength=16`,
  `len_atr1=14`, `len_atr2=30`, `rvol=1.2`, `len_vol=8`, `slpercent=2.3`;
  actual objective `-1.4435308120735202`.
- Existing replay/source export assertions pass; 10 bounded P05 batches,
  maximum batch bytes 160382. This is not a repeat of load/DR qualification.

Private evidence directory:
`/home/bobby/.local/state/portal-research-p23/20261005/sample-sampler/`.
`real-hmd-sampler.log` SHA-256
`e0e3780a323d113b131ee0c5b585624234a779974ca331b4a60e2d0d49105863`;
`sampler-public-trace.real.json` has the exact P05 hash above. Raw historical
rows stay private, not committed as a fixture or exposed to the browser.

The existing opt-in HMD harness uses synthetic identity `rrun_w1_real_hmd`.
The initial TS oracle incorrectly validated the entire product summary and
failed its unrelated enriched-analysis run-ID format. Corrected narrowly to
validate the actual **CurrentSourceFacts** block and project sampler evidence;
the public run-ID schema and original receipt were not weakened or rewritten.
The resulting actual-source TS test **1/1 PASS** verifies byte hash/size and
the available trace, with requested config/internal TPE facts still absent.
This does not claim a generated product run or GUI/browser real-run receipt.

## 3. Focused gates and frontend handoff

- Sampler/previous progress: **44/44 PASS**, including real seeded TPE
  proposal/objective parity, ask/tell, pruning/failure, 400-trial bounds and
  strict foreign/corrupt-source rejection.
- Canonical helper source: **36 original focused checks PASS**, plus added
  analyzer/child agreement and exact-source real pinned-child receipt.
- Affected Import tests: **98 PASS** across five files; sampler display tests
  **5 PASS**. No style/token/router/golden baseline change.
- Control sampler/current-source checks **25 PASS**, actual HMD source-block
  projection **1 PASS**; contract checks **8 PASS**.
- Frontend production build/typecheck and Control production-source no-emit
  typecheck PASS; generated schemas/types/snapshot refreshed.
- Protected kernel SHA-256 remains
  `34dc1847d051ca40f9ae3d2fbbf2d7e8fdc6b8d1e853beb0cc480b69afe2054d`.

Known verification dispositions, not hidden PASS: Control's broad test-TS
typecheck includes pre-existing test fixture errors; host `dist` is not writable
for a normal build. Production-source no-emit succeeds; the affected runtime
images are built through the existing Docker path. A mistaken Python helper
selected the whole test directory and was stopped; only its exact owned pytest
process was terminated. No full suite/load/DR rerun is inferred from it.

Claude needs no new layout: the existing Import note/anatomy and sampler read
now consume the additions. Historical absence remains visible. Generated
Search contract's optional `execution_trace` preserves older fixture consumers.
New effective sampler defaults are not inferred from requested settings.

## 4. Landing, review preview and cleanup

One grouped normal commit/hook; clean local fast-forward to
`docs/research-loop-plan`. Only changed Python/Control/Web images need rebuilding;
Roadmap is unchanged. Use the existing preview helper for rollout/identity at
loopback8095; preserve volumes, users, flags and the parked historical job.
No register, activate, New Run, command or business-data write is needed for
the post-build browser check. **Use sample → Parse** is sufficient to prove
source custody and the server-owned gates, at1280 and660 widths.

Post-commit runtime/browser evidence is stored next to the private raw receipts
as `preview-closeout.md`; it must name exact images/bundle and its actual scope,
not relabel this source receipt as signed production acceptance. No test
container/volume was created by the focused checks. Keep source receipts,
retained artifacts/current and rollback images; no broad cache/image prune.

Verdict: **SOURCE_DELIVERED — canonical sample and source-time sampler capture**.
Historical private TPE internals and owner/signed Portal2.0.0 release authority
are not fabricated. These two delivered items do not wait for an engine upgrade.

**Grouped-gate correction:** the first normal hook passed239 Control test files,
but the three newly added sampler cases used a host-relative fixture path that
does not exist in the isolated Docker cell. Corrected them to use the existing
`PORTAL_CONTRACTS_DIR` convention (`/contracts` in that cell). No source schema,
assertion or application behavior was weakened. The original failed hook log
is retained as `grouped-hook.log`; the normal commit retry uses
`grouped-hook-r02.log`. No actual HMD, load or DR receipt is fabricated from
that failed test-harness run.
