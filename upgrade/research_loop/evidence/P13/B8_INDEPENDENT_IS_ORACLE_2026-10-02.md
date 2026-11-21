# B8 — independent source-time IS numerical qualification

2026-10-02; approved six-group repair, group 3; source base `da185d7a`.
Status: **SCOPED_BACKEND_REAL_PRODUCT_PROOF_PASS**. Not full six-group,
frontend, clean/signed P23, P24 or production acceptance.

## Scope and custody

Existing fixed/imported `by_window.is` facts are unchanged. The earlier B8
receipt independently checked raw OOS numerically but only checked IS source
identity/count/bounds. This slice adds an operator-only source-time witness
and a separate JavaScript numerical oracle, not another browser capability.

`RESEARCH_IS_QUALIFICATION_CAPTURE` is literal-`true`, worker-only and defaults
false in the owned P23 overlay. Legacy callers without declared windows and
WFO keep their original environment/behaviour. The producer reads actual
QuantBT 1.1.1 equity, native positions/returns and the exact consumed close
stream, never reconstructing old samples or rerunning an old engine result.
Row/byte limits: 20,000 / 2 MiB; each canonical NDJSON line is bounded.

Three distinct hashes bind exact file bytes, normalized row-array bytes and
the existing `OBSERVATION_IS` stream. Run/job/attempt/lease, admitted half-open
windows and original benchmark locator are explicit. Parent validates before
copy; the worker joins the bounded copy under its live lease/cancellation
fence before scratch retirement. Private 0700 leaf/0600 files live outside
the P05 staged directory, public bundle and manifest. No public route, schema,
DB table, migration, raw-IS retention scope or historical seal is changed.
Symlink/unsafe-file, close-substitution, source mutation, hash/window/identity
mismatch and stale-fence cases are rejected; unsupported input stays typed.

## Actual owned-product receipts

Both runs use owner `p23-owner` in workspace `ws_06GE6XY0SKNPFS7TP8WCE938Z5`
on the isolated loopback :8096 stack. Each used real P08 preflight → P10
admission → confined child → P05 → authenticated named Hub/Report GETs.
Both terminal **COMPLETED/READY**, both GETs 200, original scratch and staged
market tape retired before independent proof. No direct engine invocation is
substituted for these product receipts.

| Lane | Actual run | IS / OOS / holdout UTC bounds | Proof |
| --- | --- | --- | --- |
| Weekly | `rrun_03727c86cc06ad5067890e95182e3445` | June 1–8 / June 8–15 / June 15–17, 2026 | 168 IS rows; genuine constant account equity; typed zero-variance Sharpe/histogram, benchmark and scalar/curve parity; unchanged same-window OOS baseline |
| Monthly | `rrun_627bd475a5c4ae273cdc54e1d3e391b9` | June 1–July 1 / July 1–August 1 / August 1–September 1, 2026 | 720 IS rows / 29 observed daily returns; actual AVAILABLE Sharpe and histogram; full independent metric/curve proof |

HMD reader 0.1.0rc3, read-only `crypto-binance-1m`, BTCUSDT/1h. Holdout is
declared but not passed to the child. Both preserve native `DEFAULT` /
`Position_DEFAULT`; authenticated dataset identity remains BTCUSDT. The
monthly preset changes only declared fixed windows, not profile/parameters.
A cached weekly run cannot be relabeled monthly. The monthly range differs,
so its OOS values are not falsely compared with the old weekly baseline.

Monthly source-derived IS examples: Sharpe `-0.3380898343022674`, return
fraction `-0.000421715940668038775102343690821326189491476278`, max drawdown
fraction `-0.006461326109604502`; signed-loss VaR95
`0.00109096012184477508`, CVaR95 `0.00186471295676993165`. These are measured
facts, not fixture values or a claim about strategy quality.

The independent JS oracle imports no Python metric implementation or engine.
It checks actual observed-UTC-day Sharpe (365 periods, sample deviation)
separately from the UTC-calendar daily distribution, Type-7 quantiles,
inclusive signed-loss tail, twelve histogram bins, endpoint return, max
drawdown and every emitted strategy/benchmark/drawdown point to 1e-12.
Single-day, missing-day, sampled/missing source and zero-variance semantics
have explicit focused tests. Hub and Report enrichment and captured→served
composite ancestry match. No new IS point acquires OOS/holdout authority.

## Exact provenance

Control API image unchanged:
`sha256:55a50647d3c0e2618e81df55124593c4f49bcab2c2f477dbf1ae98ecbc07ae79`.
Python API and worker:
`sha256:33db96daffaf7e9e2b5a77d4b05c786cf957aee56306a98ab96fce554838b352`.
All six changed Python modules match the running worker's source bytes.
First build preceded the helper's final two guards; that mismatch was caught,
then only Python was rebuilt. Neither Control API nor frontend was rebuilt.
Both product runs use the same corrected image. Dirty-source identity is
recorded honestly; these are functional receipts, not signed release evidence.

| Digest domain | Weekly | Monthly |
| --- | --- | --- |
| Witness file | `257ce077de90b975d6b38ca51d99205612862758884c657a1f0e4ee2b5be1277` | `49eedfdfefc1811e8d8f0232099cbd55bd85a798bbf88ea4e8a295eeda788fdb` |
| Normalized rows | `de5f6275986af9b45c9464093159e3167b09655656c627a3161144bebebd28d4` | `eaafdfe1b506f9d04a988d72f03a4189a4a22b60d29373d4f0b8075a19d42633` |
| OBSERVATION_IS | `77931c1ec38621a63731683b4e42127e7aca16540ff2353c5e96b0ad9aa9a670` | `14897ef39d357ad7a25ccf1e46bff9354a797b266e95a3e7cc0c299c64c4395f` |
| Composite enrichment | `26028c7c4b5dcfdddb86d10bdf2bb8bd8bdd322d08f408d79e7ea8ea99438247` | `a45c4f59f98be96deeda51469f7f2e55f037ace6ff9d4c442d7d77bdfecf0ea5` |
| Actual receipt file | `1034ce3a480cc2406ec99ef4ba481025412f69c2d9d1b95f4edc3c8a662042b1` | `5867f0262714e2ac48a95d26d19195992476b96098adbb639970900804ada4fe` |

Private receipt/witness files are 0600 under the owner state directory 0700:
`/home/bobby/.local/state/portal-research-p23/20260927/runtime/`.
Names: `b8-is-oracle-20261002{,-raw-private}.json` and
`b8-is-monthly-20261002{,-raw-private}.json`; raw market bytes are not in Git.
Monthly witness 49,976 bytes; weekly 11,296 bytes. Independent Report revisions
are retained in these receipts. Hashes above are file-byte hashes, not the
console's in-memory JSON-object hash domain.

## Tests, review and failed-attempt truth

Private source helper: 41/41 focused tests; retention/enrichment/cancellation
group: 22/22. Actual P06 legacy confinement with opt-in server flag: 1/1.
Fixed replay/producer regression run initially had 50 PASS / 1 FAIL: its old
test incorrectly applied the core 28-KiB cap to core plus separately bounded
64-KiB enrichment. The next targeted attempt exposed its second stale
assumption, banning all Parquet after full fixed replay had been delivered.
Final targeted regression PASS: retains both original runtime budgets, calls
the runtime source validator, permits only the exact byte-verified replay
companion and still requires scratch/input Parquet absent. The 50 unaffected
tests were not rerun. Failed attempts are not counted as successful gates.

JS oracle: 26 focused assertions PASS; receipt/preset: 5/5 PASS; owned-cell
and unchanged-profile test modules PASS. One oracle fixture aliasing defect
was corrected rather than changing a backend calculation. Independent
read-only review found and closed the missing composite ancestry assertion
before product proof; no remaining concrete custody/oracle blocker found.
The normal mandatory grouped commit hook remains required, never bypassed;
its exact output is retained as `is-oracle-commit-hook.log` in private state.
No public contract changed, so no unnecessary regeneration or FE build.

## Frontend handoff and remaining scope

No new FE operation/type or mapping is needed. Continue consuming the existing
`EvidenceHub/Report.enriched_analysis.by_window.is` contract from §23, keeping
IS/OOS authority separate and genuine zero-variance absence visible. Existing
Claude frontend, G-20 and subsequent commits are preserved, not rewritten.
This closes the independent raw-IS numerical backend proof, not browser/visual
acceptance. G-21/G-22 shared-preview evidence, actual VN calendar/instrument/
daily-profile qualification and previous P23/P24 gates remain separate.

C4: both owner sessions logged out; 0 ACTIVE sessions/jobs, 21 test identities
still DISABLED, owner anchor ACTIVE. Capture flag restored false. Owned cell
down without `--volumes`; evidence, source witnesses, backups and rollback
images retained. Snapshot: root 202 GiB free (~32%), RAM 13–14 GiB available;
deployment runner active. `NO_ACTION_NEEDED`: no prune, source/database/volume
deletion, shared :8095 restart, production action or remote push.
