# Core → Edge / Claude — Manager source and financial composition follow-through

Coordinator/integrator: Codex/Core. Scope: Bobby's assigned ELP2-05/06/07/09/10/11,
Research only. This is an additive correction to cumulative §21, not a new
campaign or a replacement source authority. **SOURCE_COMMITTED /
ACTUAL_SOURCE_BYTES_VERIFIED / HUMAN_BFF_AND_CONNECTED_ACCEPTANCE_OPEN.**

## 1. Real defects addressed

1. **Tupleless source construction:** Core already permits an exact complete
   published dataset under explicit current `business.read_all`, provided no
   DENY and the final policy recheck still pass. Edge's new source validator
   rejected empty tuples before that decision. Remove only this construction
   rejection; present tuples still require all five correlated fields. Narrow
   account/researcher rights still cannot read tupleless rows. CURRENT does not
   grant STREAM, HISTORY, REPLAY or EXPORT. The earlier blanket statement that
   every Manager read needs missing alpha/version lineage was too broad.
2. **Stored v5 versus writer v6:** actual stored Paper rows use runtime.v5.
   Edge source change `f762730f` introduced v6 writer recurrence/cadence, not a
   different stored field envelope. Accept only exact supported v5/v6 CURRENT
   revisions and bind the actual revision into digests. Reject mixed rows,
   future versions and v5 relabelled v6. Do not claim financial/history or fresh
   source compatibility from this narrow CURRENT compatibility.
3. **Finite source probe:** a separate explicit binary command reads each exact
   pinned selection through the existing governed READ ONLY/REPEATABLE READ
   loader. Strict create-only private inputs, exact file hashes, source byte
   hashes, original timestamps and a maximum 300 s window apply. It opens no
   human-authority listener and creates no user/session/grant/source ACK.
4. **Financial HTTP shape:** PM's new authority endpoint returns a same-call
   envelope containing `wire` and authenticated sidecars. The worker previously
   handed the complete envelope to a parser expecting only original report
   bytes. A common `FinancialDataTransport` now supplies inner bytes; the same
   owning channel supplies exact financial-purpose sidecars to the authority.
   Wrong binding/receiver/kind/digest, duplicate/unknown proofs, changed original,
   expiry and limit violations refuse. Renew/page/delta/status/ACK retain the
   same original manifest/generation/cursor and real receiver receipt.
5. **Load-driver safety:** dispatch synchronously refuses an in-flight overflow;
   safety stops cancel active fetch/body and scheduled waits; bodies are counted
   chunk-by-chunk rather than buffered whole. No queued/downsampled workload,
   altered SLO, reduced tab count or invented numeric approval.
6. **Physical kind is not a business grain:** actual `ACCOUNT` rows comprise
   196 `manager.account`, 341 `relation.account_balances` and 185
   `relation.account_policies`. The first probe incorrectly required the account
   fields on every physical row and correctly got `ResyncRequired`. All722
   stored hashes, root epoch/cycle and adapter matched; missing fields were the
   actual cause, not hash drift or timing. Partition selections by actual
   `payload.source_feed`, with the complete field set actually present in each
   grain. Read ALL 722 rows in 4 selections, not a smaller 196-row subset to pass.
   This supersedes §21's imprecise “722accounts” description.

Financial channel remains SOURCE_ONLY until its injected real request issuer,
financial-purpose verifier, endpoint and authenticated APPLIED/status callback
are actually commissioned. A transport200, mTLS, current-human signature or
queue receipt is not financial proof. Additional bounded sidecar-cache bytes
are logical accounting, not a measured RSS result or production budget.

## 2. Test method and reuse

The first integrated Rust retake passed188/188 library cases. A newly authored
v5 test initially expected2rows with its own limit1; it now asserts the real
page limit and continuation. Strict Clippy then identified seven style issues;
those failures remain in the logs, not called a clean first run. The financial
refactor was followed by its21focused cases, strict Clippy and binary build.
Do not add repeated test counts as independent coverage.

The probe TLS retake is separate: actual source DB requires `verify-full` and
the original Docker hostname/CA. Probe-only loader support retains those checks;
shared listener DSN validation is unchanged. **34/34runtime cases PASS**,
including4new TLS cases. Subsequent changes add only safe closed stage/unit-enum
errors; strict Clippy and final binary build PASS. Financial PG-feature tests
also compile: that check found/fixed a missing explicit client import in the
changed PG fixture, not a product DB run. Failed create-only preparation
directories remain protected; none is a successful source-read receipt.

Core driver:12new safety cases PASS. Existing workload selection10/10 and
reservation12/12 PASS outside subprocess sandbox; sandbox CLI tests failed
because `spawnSync` was denied EPERM and returned empty output. Exact source
was unchanged between those attempts. No test/helper was weakened. The older
Manager workload test file also passed. These are tool tests, not actual load.

Reused by impact, not rerun: the three real-PG Manager store cases from §21
because store SQL/schema files are unchanged; the phase11 backup/restore of
30relations and39,354rows because this slice changes no Core DB schema or
preservation helper. Their original source/log hashes remain in their receipts.
No full frontend test suite, repeated restore/load or full hook solely for
Markdown. Intermediate code follows campaign §10.10c; R0 docs follow §10.10d.
This is not a frozen full-product landing/hook certificate.

### 2.1 Commits and reproducible source/test pins

- **Edge candidate `7ab60fb4696d10da871b7a2216b31f2831aa34b1`**:
 19files,+3268/−41; parent73711b4e; branch
  `feat/core-current-policy-wire-20261024` in owned HK
  `/home/bobby/.worktrees/portal-core-current-policy-wire-20261024`.
  Normal scoped Git commit, clean. Active Edge/PM worktrees untouched.
 17Rust paths are frozen by manifest SHA256
 `09f3fc0694e57e867f9843bae4aa1a417b43e628f5c6b134f1b905d0f9ae6f3a`.
 The remaining2paths archive the exact non-secret probe scripts under this
 candidate's `upgrade/evidence/execution-edge-v1_2/EPG10-08/`.
- Exact preparation script SHA256
  `6e780dcd8fa080ee244bc3633e0b704ef2e33b9e9f72657da6b6cb50b03345e0`;
  exact cell runner
  `065e1a09ae5e4f2131b8c8cf47ad95696f3fe2beeaaf0d9edce9d80a29ae5f2d`.
- **Core `a2f0ebefd33a9d84f8b325281cc49721dd94ad6d`**:
 3files,+309/−32, only driver/stage wording/new12-case test. Intermediate R1
 commit under §10.10c; no remote push or full-product landing claimed.
- Final tested binary SHA256
 `015ff7b8f34cfe741e12b3919f33add04c27d4e9c1cce8f1f0a811f737a16db1`.
 No new persistent image digest: only the existing disposable base
 `28ea39588edd1b4fee1715d1e9ca6bd289effac82a573a920b217a8c350226b3`
 ran the hash-pinned binary by read-only mount.
- Library188 log `c988be3c3adeaea3c256ead68dcf7b879cac721d9a20a4370cf0fe803fcc5326`;
 financial21/Clippy/build `35483e8fc256ae26590c98eedc5405b764ca466eb5a2539d21e7a2b14b438341`;
 runtime34 log `9e6a1191ade5a1f71a51c16acd1a242752cd9737a548d1259170d9c8a6add5f1`;
 final strictClippy/build `e54529ed1aca10b036b5d67df01482d23d3c445517f2f0a802d714341a7ebbac`;
 financialPG compile `5b3960d39bc29f1e2858da921155faebb70abfe36725e5bdb422dd69b25a1fc7`.
 Original logs retained in `/tmp/elp210-edge-source-20261024.gt6Znz8L/` on SGP.
- Driver safety log `0b1e9ba9a9cc08eb281d9827464651953789e0f22b26180632dd57e2180636b6`;
 workload10 retake `dfbbd2196072beb4a09d095e60fbf3f428e5ad8ba5e01fa9475ef4e2be5fda79`;
 reservation12 retake `d42d8e7c08d6ba6325c8a89d59be482ad60a97a0411dc56058a4a250516d752a`.

### 2.2 Actual Paper source-byte receipt, not fixture/API authority

Actual HK cell24Oct08:03:00.357736781–08:03:01.065938297UTC,
~0.708seconds,1CPU/512MiB/pids128, rootfs/read-only inputs, no new ports,
all caps dropped, actual Bobby UID1001, no OOM/exit0. Failed OCI attempt used
SGP's UID1000; corrected by actual UID/GID, not loosening0700/0600 custody.
No CPU/RSS peak claim is inferred from the configured cap.

| Original grain | Full source rows | Selections | Pinned published fields |
|---|---:|---:|---:|
| `manager.account` |196|1|11|
| `relation.account_balances` |341|2(256+85)|6|
| `relation.account_policies` |185|1|19|
| **Total physical ACCOUNT kind** |**722**|**4**|grain-specific, not one fabricated common schema|

Exact original adapter `portal.execution.manager-projection.manager-v2.runtime.v5`;
epoch `01a05c70-81ec-7380-801d-45c706f937c0`, cycle
`n24-cycle-3cdb719493ade1fb79def4f57cfef2204bfb1011ab484970004fc940d0045501`,
catalogue `sha256:0c71b72cd5d23cb21e902837d2a6c496d11da5bd09af70123dca3918cd9b1b44`.
Sealed kind digest
`sha256:52bee9782e606f57a90996fe469adfe295b917f00f722dac2f1348460f361e2f`.
All four selections preserve original source timestamp1792503089218ms, not
the probe observation time1792828981056ms or a v6/freshness label.

Actual receipt state: **SOURCE_VERIFIED_BYTES_ONLY_NOT_HUMAN_AUTHORIZED**.
Private retained HK evidence:
`/home/bobby/secure/core-manager-probe-20261024.3Fi2s4h6/`.
Safe aggregate receipt SHA256
`c368c8252a52d4177a7aadc9ee85ceb04d490807db8afb50f38bf0fb4d1b6227`;
cell metadata `4226ec18c4c6521f990ae221af151881d88c907794edce0f8a4b32eaa89388ec`;
preparation `64cb4032aba4a418901a753e1739d1f0816fe028a7a8cd3cd58e3879f234ba88`;
consumed private config `0f05f7ec4cd5d4ae985206db090f29ca24a13bfd588fc3aaeb3e2966e58c87fd`.
The finite config is not a reusable grant/listener activation. Reconstruct new
private inputs from current original metadata if another authorized probe is
needed; do not reopen this consumed window. Five ephemeral DSN copies from
these attempts were removed after the successful read; originals/CA/key/source
data remain untouched. Owned probe containers are absent.

## 3. Concrete Core wiring still required — not externalized to Edge

Read-only review at canonical `b3c818c7a` found:

- `apps/control-api/src/execution-v2/current-view-composition.ts:103`: `.read()`
  exists but no production Manager BFF calls it. Accounts needs a server-owned
  exact selection adapter carrying the actual controller principal; browser
  input cannot choose source pins or permission scope.
- `native-core-runtime.ts:222` starts with `unqualifiedAccessTrust`;
  `core-owner-commissioning.ts:128` forwards that existing `readPublication`.
  `read-scope.ts:880` therefore refuses a new Manager dataset before Edge I/O.
  Core needs an independently sourced exact publication-metadata adapter. It
  cannot call current-view `.read()` to obtain its own authorization input.
- `manager-model.service.ts:113` reads `alpha_fleet_overview` Manager documents.
  `manager-current:ACCOUNT` is a different grain, not a replacement Fleet
  aggregate. Do not rename it or fabricate missing Portfolio/Fleet facts.
- `manager-runtime.ts:38` materialization requires source/publication/
  commissioning and real recheck/acknowledge. No fabricated source ACK is added.

Shortest legitimate continuation: qualified publication metadata → Accounts
CURRENT adapter → actual-principal composition call → revoke/final-disclosure
acceptance. Broad source-reader success alone does not complete these steps.

## 4. Owner actions and phase disposition

| Row | Core work/state | Exact next action / owner |
|---|---|---|
| CORE-01 | Existing retired native READ/restart/active-revoke receipts retained | Edge correlate prior terminal/custody; do not rerun completed native cases or reopen slots |
| CORE-02 | Existing Research Manager cert/CSR/key retained; no new key | Core+Edge reconcile actual per-hop audience/profile/kid and install only the reviewed Research binding; run actual API after publication/provider wiring |
| CORE-03 | Exact v5 CURRENT reader and bounded source probe implemented; publication/BFF wiring remains Core-owned | Edge review/import owned candidate and exact source selection; Core implement metadata and Accounts adapter above; no grant inheritance |
| CORE-04 | PM endpoint and Edge same-call transport/worker seam source implemented | Edge coordinate PM financial-purpose issuer/verifier/canonical vectors plus real authenticated receiver APPLIED/status; mount exact wire, then positive COMMIT→APPLIED |
| CORE-05 | Existing original command submit/status/recovery source remains dark | Edge commission its existing gateway/pins and Core bind same original intent; no command/Live activation or direct Core→PM path |
| CORE-06 | CURRENT source/digest validation and driver safety improved | Core+Edge qualify each purpose separately and test cache/cursor/revoke; STREAM/HISTORY/REPLAY need their own source and rights, not CURRENT inference |
| CORE-07 | Safe workload dispatch/cancel/streamed bytes; proposal arithmetic retained | Return numeric target/workload/calibration approval through Edge before real load. B2=28tabs, M5=90min, combined≥185min before margin; C288 audit retention cannot be pruned to pass |

ELP2-05/06/07/09/10 remain open at the distinct gates above. ELP2-11 preservation
preparation is proven by its real backup receipt, but final matched-candidate
migration/consumer/release handoff is not complete. This packet never changes
83/86 exceptions, source qualifications or owner approval into absolute PASS.

## 5. Claude handoff

No new public browser DTO, enum, UI component, token, layout, HiFi or baseline
change. Keep accepted linked fixtures and components. Real Accounts must use
the exact server-owned CURRENT adapter only after qualified metadata, rather
than borrowing a Fleet dataset. The narrow unknown-enum attribution negative
from earlier review stays Claude-owned. Consumer/browser acceptance remains
separate from source bytes and transport test coverage.

Claude lane readback: `/home/bobby/portal-research-fe2`,
`claude/post-land-20261022@00e7f6cff2fadbd88b8ed461fa870b28ee88ad94`, clean
and no new committed intake at this round's check. No peer code was overwritten.

## 6. Runtime, rollback and delivery boundary

Installed Core remains image
`01692fc5702f21856f5c932efc0786d3f65ff47bb3ed7d1949ee18666f31458a`,
with current-view listener OFF. A disposable source-probe container is not a
replacement persistent runtime, mounted API or human-authorization deployment.
No migration, native/source intent, session/grant, command or economic write is
performed by this slice. No Git push, stable/dev/main/provider28445, production
budget/calibration or frontend change.

Rollback: leave new commands/listeners unmounted; review source revert if
necessary. Exact owned probe containers are removed by acquired ID plus owner
label; retain original DB/key/CA/source rows/custody and protected diagnostics.
Do not delete audit, grant history or peer volumes to reclaim headroom.

## 7. Tracking verification

**Verification: R0** (campaign §10.10d). Markdown-only receipt/phase/Unified/sync
update; `scripts/execution-tracking-test.sh` PASS and explicit path/link/diff
checks apply before commit. No full hook, build, restore or load is repeated
for this documentation. Source gates and their limits remain as recorded above.
