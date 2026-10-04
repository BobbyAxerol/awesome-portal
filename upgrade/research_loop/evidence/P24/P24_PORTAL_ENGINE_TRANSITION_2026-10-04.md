# P24 — actual Portal engine transition qualification

Recorded: 2026-10-04, 08:34–08:40 UTC. Parent candidate base: `b7e0b867`,
`codex/be-gaps`, with the authored uncommitted engine changes recorded below.

Verdict: **ISOLATED_PORTAL_ENGINE_TRANSITION_ACCEPTED** for the exact fixed
Delta/HMD profile. This supersedes the earlier direct-wheel-only prerequisite
in [second-engine receipt](../P23/SECOND_ENGINE_UPGRADE_AND_HISTORICAL_SCOPE_2026-10-04.md).
It supplies actual Portal admission, confined execution, retention, reads,
in-flight pin preservation, exact reproduction and rollback evidence for the
engine lane of P23 T07/T13 and P24 T05. It does **not** declare whole P23/P24,
production activation, signed-release acceptance or owner visual approval.

## 1. Scope and authority

- Owned project: `portal-research-p24-engine-transition`, loopback `8097` only.
- No change to shared preview `8095`, parent candidate `8096`, dev, stable,
  main, Execution, historical source bytes or protected strategy kernel.
- No migration, new production engine default, unrestricted adapter admission,
  increased worker cap or relaxed namespace/resource fence.
- Production/source catalogue and normal gateway remain QuantBT **1.1.1**.
  The old engine is admitted only with `PORTAL_ENV=local`, `AUTH_MODE=dev`,
  exact operator qualification flag, exact immutable compatibility binding,
  fixed P04 algorithm, BTCUSDT/1h HMD, one trial and existing fixed parameters.
- Binding `p23.quantbt-110-fixed-qualification.v1`, SHA-256
  `195d7123933c9b76a27c1b56f945673969584b71e33236547517657660d1bc6b`.
  It explicitly identifies a compatibility qualification of the original
  P04 fixed algorithm/adapter declaration; it does not pretend that the
  original P04 adapter contract was authored for 1.1.0.
- The private old catalogue is qualification-only. Only its fixed route is
  admitted; this is not certification of the other copied route descriptors
  or optimizer claims for 1.1.0.

## 2. Exact physical runtime provenance

| Runtime | Physical image | Installed package/native |
| --- | --- | --- |
| Old qualified wheel image | `sha256:9a14f138a7feae74bcab88feaea63d495a5f8312b0d4ed989f9c252571abc717` | `1.1.0 / 0.4.1` |
| Current candidate image | `sha256:c939a7b5639a9a17419af60ae40269546340af9a9ea0d712b4b58766c52e2738` | `1.1.1 / 0.4.2` |
| Control base image | `sha256:9a0487e8b6615f72a0c1d7e56568a286153c97b061d1d42b82e3d91f7451ef13` | qualification Control API |
| Web image | `sha256:d887b0e9f89ddb66efa760b3b93eedc3080e748286e9928077ed73e9ec9a4e92` | unchanged product consumer |

Both Python versions used the same frozen read-only source overlay. Control
used an explicitly recorded read-only compiled-`dist` overlay to exercise the
new finite Freeze provenance schema without another full image build. These
are **qualification overlays**, not a claim that the base images contain the
final signed source. Parent orchestration builds/certifies the final image set.

The old image was previously built using `--require-hashes --no-deps` from
the published wheels in `engine-110-qualification.requirements.txt`; the wheel
SHA-256 pins are engine
`c319b24325230df99ce1803ae03df09c15acabd834dd2f6ccd17b21e70363e62`
and native
`f26681ad154aea38d9d0fc8f9e828a6c480176cf7f20041cbb86f06e1dd38b3d`.
This run independently read the installed distribution version and RECORD:

- engine RECORD: `80636aa284227b47593e9610dc8b82ab4dc08ed9ee09215a1da18320bce18f68`;
- native RECORD: `f8c064d2e0fa28ac35874739a8f6750d5d7fa53d56f20a870ab31eeebfea41d9`.

No 1.1.1 image was relabelled 1.1.0. No sibling/vendor QuantBT source was used.

## 3. Real public API runs

Dataset `crypto-binance-1m`, symbol `BTCUSDT`, timeframe `1h`; UTC windows:
IS `[2026-06-01, 2026-06-08)`, OOS `[2026-06-08, 2026-06-15)`, sealed holdout
`[2026-06-15, 2026-06-17)`. The child still receives no holdout rows.

| Role | Run ID | Actual engine | Terminal/retained |
| --- | --- | --- | --- |
| Old in-flight job | `rrun_8f0d655cbeddf1cbd4530c0c1299690a` | 1.1.0 | COMPLETED / sealed |
| New-default regression | `rrun_a6168e6c39cf7f90be1bcb784cd1afda` | 1.1.1 | COMPLETED / sealed |
| Exact old-input reproduction | `rrun_fecf5a9856474627cd2ec054b18d371c` | 1.1.0 | COMPLETED / sealed |

Each used authenticated same-origin `POST /preflights` → `POST /research/runs`
(`202`), real P06 confined child, P05 retained receipts, terminal callback and
public Progress. No synthetic producer row or direct engine call substitutes
for those operations. All returned **636 actual bars, 4 trades, final equity
20130.193634373325** on the tested fixed route.

For each run, the product Evidence, Split, Search, Freeze and Report reads
returned `200`. Old Freeze correctly publishes:

```json
{
  "state": "AVAILABLE",
  "engine_version": "1.1.0",
  "execution_adapter_id": "p04.delta-rsi.v1",
  "adapter_contract_digest": "9ade757b5c1cd87681a2efb49011c84a96211939710dcd32c9fd1c7777e95784",
  "availability": { "state": "AVAILABLE", "reason_code": null }
}
```

Full exact responses remain private, not copied to browser fixtures or source.
Publication/commands were not invoked.

## 4. In-flight upgrade, reproduction and rollback assertions

1. Public Progress proved the old job `RUNNING`; its persisted producer pinned
   `er_quantbt_110` plus the exact qualification binding.
2. The API/default transition began at **08:34:51.756 UTC**, while that child
   was running. It completed at **08:34:59.108802 UTC**. The old worker's
   container identity was unchanged through the transition. There was no
   kill/requeue or reinterpretation of the job with the new wheel.
3. New Atlas became 1.1.1; the already accepted old job still completed,
   materialized and read as 1.1.0. Default-change start while the old child
   runs is established by timestamps; this does not assert it was still
   running when the replacement API finished its warm-up.
4. Submitting the old spec to new-default preflight returned honest `409`
   `RESEARCH_PREFLIGHT_RELEASE_STALE`, field `client.engine_release_id`.
   It never silently changed the pin to 1.1.1.
5. After the old child drained, a fresh 1.1.1 run completed normally.
6. Rolling back only this isolated API/catalogue/idle worker to the exact old
   physical image admitted `REPRODUCE_EXISTING` with `REPRODUCTION_OF` parent.
   Requested, effective, dataset-binding and input-manifest digests were
   **identical to the old parent's**, and actual fixed results matched.
   Reproduction remains `IMMUTABLE_INPUT_PINS`; unrecorded environment
   equivalence still reports its existing typed `NOT_PUBLISHED` reason.

Supported scope is explicit isolated rollback/qualified-old-runtime
reproduction, not transparent production multi-version scheduling.

## 5. Retained integrity and receipt hashes

Every sealed manifest path stayed inside its artifact root; all declared
document/Parquet sizes and SHA-256 hashes were independently re-read and
matched. **3/3 runs, 9/9 declared retained files verified**. Original bytes
were not rewritten, no historical missing-manifest exception was fabricated.

| Run role | `run_receipt.json` SHA-256 | Artifact `manifest.json` SHA-256 |
| --- | --- | --- |
| Old110 | `f191fd069a1a785cbaeb3b246ab3bfd3841fd4ddd1dd783132a7fec075f992eb` | `8cb0f856fda28ff31ba69910d0d3b60d1f5c6f324fb46721923adf1570bc6a39` |
| New111 | `579d32f4901342ad8a6fcb61d2f74b751d99f4ee7200688d100b3c07e47f1bcb` | `7b462138f5eaf9a940978629696b65f345fa703482d65d8691a3b07ff6dba519` |
| Reproduction110 | `7d5853982b3a4bef9e848c65c084307b25612158979556f899a490bc630a9b11` | `1f116035a3808487c7770b10d50aa14ce4f3b93146fea4eefb3ea0bf4fb66bb6` |

Private state:
`/home/bobby/.local/state/portal-research-p23/20261004/portal-engine-transition-01/`.

- API receipt SHA-256: `52ea40e5a30954d11e0dd5a495097db9495eb7aa982b4cdb82a667702463cde5`.
- `retention-proof.json` SHA-256: `d04c48ddb7f02fb1915ea866da25079aed8dd92cd30b54f4a0c10a23912d6f72`.
- The retention proof records the seven exact frozen Python overlay hashes.
- Earlier harness attempts are preserved separately. One diagnostic query
  used the wrong DB column; one Atlas request observed expected API warm-up
  `503`. Neither is recorded as passing a product read. Bounded resume used
  the same temporary QA96 password/run; no credential reset or extra direct
  engine oracle was needed.

## 6. Code and focused tests

The smallest changes are local-only opt-in/config binding; fixed P10 producer
pin; exact Python gateway/supervisor/clean-child binding; truthful retained
engine provenance; and finite `1.1.0 | 1.1.1` read metadata in Progress
ingress/Evidence/Split/Search/Freeze. Ingress anchors old metadata to the
persisted exact producer binding, not just a caller-selected enum.

Generated contracts were regenerated through repo targets. In particular
`research-freeze` `components["schemas"]["EnginePin"]` now preserves the
actual old version rather than rejecting terminal Report assembly. Existing
1.1.1 payloads/defaults and absent optional binding bytes remain unchanged.

- Control API build: PASS.
- 4 focused Control suites: **22 PASS**, including foreign111 producer,
  missing110 binding, forged digest, valid pinned110 ingress, repository and
  Freeze contract regressions.
- Existing pinned Python environment, qualification/Gateway tests: **6 PASS**,
  including missing operator flag, production refusal, forged digest/wheel
  hash, confined-child missing/forged exact hash, and unchanged default111.
- Engine contract generation drift check: PASS; `git diff --check`: PASS.
- Final grouped hook/candidate tests belong to parent closeout; this packet
  does not claim an additional full hook or browser visual acceptance.

## 7. Cleanup and frontend handoff

QA95 and QA96 are `DISABLED`, active sessions `0`. The earlier temporary
owner session was explicitly revoked; owner-anchor protection was preserved
rather than bypassed to disable the sole owner in an offline disposable DB.
All owned8097 containers/network were stopped/removed with Compose **without
`-v`**. Port8097 is free; the four project volumes and private receipt files
remain for audit. No image/volume prune or unrelated cleanup occurred.

Frontend has no new action to activate110 and no design change. It should
display the typed actual engine pin if inspecting this qualification's
history; existing111 screens remain unchanged. Parent owns ledger/Unified
updates and the final candidate's product acceptance/release decision.

## 8. Independent closeout triage — archived Report source compatibility

This is a separate **read-only** R-WFO-020 provenance check, not another
engine run, local seal, publication or scenario PASS. The publication lane's
original refused receipt is preserved. The only missing RC pack item was
`METRICS_SEMANTICS / P21_RETAINED_REPORT_NOT_SEALED`, although its original
Report v2 and linked audit were already sealed/verified.

Run `rrun_3258a4c450816129d2d285f25b801061` retains Report
`p18r1_649daeca18b8a516b8e43aa9e95b5bb8e1148071a09c6a10392adf31bae911fe`.
Its captured Evidence revision is
`rs02_evidence_a32dede7286464e4c8c209d8e4276bd378b597ff9b7a232444b91390c5e1ebcb`.
The existing compiled `currentSourceSealDigest()` independently computed
**the exact same immutable source revision** from the current sealed bytes.
All five original `source_digests` also match the seal exactly: manifest,
source transform, requested spec, effective spec and dataset binding.

Only the companion-enriched current Evidence presentation differs
(`rs02_evidence_b94edc988cb8d50dfe10f30ce52ffb02bfd0c712ca98f112becb7c000eceaa78`).
`release-candidate.service.ts`'s `retainedValues()` compared that presentation
to the archived Report's capture. `current-source.service.ts` deliberately
keeps `source_revision` stable while its `currentSourceReadRevisions()` changes
for analytics/enrichment/distribution companions. Therefore this exact case
is an eligibility mismatch, **not lost Report bytes or changed source facts**.

The lead owns the narrow repair/regression and actual affected-API retake.
Compatibility must retain a valid immutable Report core and all five exact
source pins, and accept only a matching current representation or the verified
base-source revision. It must not accept arbitrary historical presentation
hashes, rewrite/reseal an old Report, or hide a genuine changed-source refusal.

Private proof: `p24-write-edges-final/p24-report-compatibility-read-only-proof.json`
under the approved `20261004` P23 state root; SHA-256
`137ac95f0dffc9312fdfd6c75dfc641ef6c00bbbf2c5c07d3b0001dcc69252d6`.
Only existing Report/seal SELECTs and private audit-file custody were performed;
the three coordinated QA actors remained enabled until the lead ordered cleanup
(final custody readback is recorded below).

## 9. Final GUI child byte proof and finite QA cleanup

This is an independent **read-only** check of the later actual GUI intake,
not a rerun of the engine transition above. Run
`rrun_144e04e13c07b5d65ca5a915b6e4e743` completed through the real P10 producer,
isolated child and P05 retention. Its sealed worker bundle is
`e4d5c26786e7bfb02117b40aa9a20daa121084f55786bf4e8ed6c99e07977f61`.

The content-addressed **actual worker** `config/request.json` remains in that
sealed bundle: SHA-256
`41bbbc65dddd925948a95433e1af5003c734b59f5d68cb7326b801a40e4ee361`,
2,369 bytes. Its full `requested_spec` exactly equals the real GUI marker,
not a reconstructed request. The separately sealed P11 requested/effective/
dataset identity receipts agree. Imported AlphaVersion
`av_p23_section32_imported_0_1_0`, `scale=1000`, seed42, one trial and both
request/effective digests match. The temporary `.p10-engine` directory is
removed **after** staging the actual config and retention, not instead of
retaining this proof.

- Actual child receipt: engine1.1.1, 338 bars, one trade, final equity20000.
- Holdout rows exposed to child: **0**.
- Five sealed JSON blobs independently hash-verified; three P05 retained
  declared files independently size/SHA-256-verified. The P05 child receipt
  and sealed bundle child receipt are exactly equal.
- P05 retained manifest SHA-256:
  `0c5190a8a4ab32e6095f258c4c1cb9ec91cad07599a8567d0dd9f57a6477246c`.
- Exact Python reader/worker image remains
  `sha256:c939a7b5639a9a17419af60ae40269546340af9a9ea0d712b4b58766c52e2738`;
  installed physical distributions are QuantBT1.1.1/native0.4.2. Actual GUI
  Control/Web pins are preserved in the raw marker; later source amendments
  are not falsely attributed to these original image bytes.

Private proof under `p24-write-edges-final/producer-browser-r01/`:
`actual-child-config-byte-proof.json`, measured11:28:17.505UTC, SHA-256
`ac033eada208a7d3a47f176ff11f00068917f411c9a4a3b474513456ccc2be15`.
No utility job, extra child, byte reconstruction, source mutation or new API
operation was used for this check.

The original three actors stayed ordinary USER/MEMBER. Actual producer
admission requires ADMIN in `run-admission.service.ts`; the lead therefore
approved a **separate fresh** `p24-edge-producer`, ADMIN/MEMBER only in the
imported test workspace of this disposable clone. No human account, existing
QA role, source permission or production RBAC was changed. The15-minute
cleanup deadline was an operator guard, **not** a fabricated auth TTL.

At **11:28:57.613UTC**, normal AdminService disable/revoke and persisted
readback verified all four exact actors (`p24-edge-a`, `p24-edge-b`,
`p24-edge-publish`, `p24-edge-producer`) **DISABLED**, active sessions **0**,
private passwords/cookies removed from per-actor and combined files.
`p24-edge-cleanup-1791113337613.json` SHA-256:
`a54f707bc3ce00564998e033a96851571911f0021fd8ee4a038f64a1195ab1f8`.
Browsers and worker were already closed; the lead owns exact stack C4.

The observed `NoStreamResponseError` is the caught non-authoritative
`quant.run.succeeded` notification in `_publish_terminal_event()`. Durable
bundle/attempt completion and the separate P11 HTTP relay reached
COMPLETED/READY. This is **not** claimed as a JetStream terminal notification
PASS or authoritative event replay proof. No stream, broker configuration,
engine or runtime change was made to hide that declared fallback.
