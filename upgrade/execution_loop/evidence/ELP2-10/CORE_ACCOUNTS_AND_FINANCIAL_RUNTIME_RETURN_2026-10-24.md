# Core → Edge / Claude — Accounts principal and financial runtime assembly

Coordinator: Codex/Core. Assignment: Bobby's six-phase follow-through,
ELP2-05/06/07/09/10/11; Research only. Baseline
`bac182083b953a7bb3608bcdab9f8f9584613d00`, `docs/research-loop-plan`.
**SOURCE_COMMITTED / FOCUSED_VERIFIED / NOT_INSTALLED.** Both named
implementation packages are committed and tested. Source-connected acceptance
and the six phase-wide exits are not claimed PASS.

This supplements, without erasing historical evidence,
[previous source return](CORE_MANAGER_FINANCIAL_SOURCE_FOLLOWTHROUGH_2026-10-24.md)
and [cumulative return §22](CORE_TO_EDGE_TS_PM_CONSOLIDATED_RETURN_2026-10-22.md).
The explicit gaps in their §§3.1–3.2 are implementation work, not a generic
request for another window. This packet records their actual replacement.

## 1. Accounts: what is implemented

Core commit `95f6b6707467309ea107135469c314743ccc48bc`: 13 files, +1052/−4,
no frontend/public schema/migration.
Independent review: **ACCEPT**. A full-product R2/connected certificate is not
implied by this intermediate R1 commit (campaign §10.10c).

- An independent private metadata publication enumerates all three actual
  CURRENT grains (`manager.account`, `relation.account_balances`,
  `relation.account_policies`). It binds the exact source epoch, generation,
  catalogue, adapter revision, clocks, row IDs and payload digests. ACCOUNT
  identifiers are explicit source facts, never parsed out of IDs.
- Metadata must match a separately pinned commissioning artifact and approval.
  The opaque commissioning handle has genuine provenance; a similarly shaped
  object is rejected. The opt-in manifest references private hash-pinned files,
  reread on delivery. Mutation, revocation or expiry refuses, not a stale ALLOW.
- `ManagerCurrentAccounts` uses the actual controller principal and the SAME
  current-view Core authority. Each grain read requires ordinary current
  `business.read_all` for these tupleless source rows, and the compound reply
  has an outer final authority fence. Native-domain READ grants are not cast
  into ordinary full-business authority. No role/username/admin fallback.
- Account identity and available per-currency balances map to the existing
  closed `execution.account-resource.v2` schema. Missing margin, equity history,
  PnL and financial totals remain typed absence. Duplicate currencies, changed
  source metadata or row digests, mismatched account IDs and malformed decimal
  or NULL values refuse.
- Existing BFF Account360 is the consumer. Only ACCOUNT/Paper is redirected;
  BINDING/Live and the default installation remain unchanged. A refused CURRENT
  request never falls back to a less protected legacy read.

### Important list boundary

The existing Accounts list `/broker-bindings` enumerates broker **BINDINGs**.
The verified 722 physical source rows are account/account-balance/account-policy
records, not 722 accounts and not broker credentials/bindings. This implementation
does **not** invent binding IDs/state or claim that list is populated. Edge must
provide the real binding dataset, or separately agree an account-list contract.
The Account360 mapping is ready to consume a qualified CURRENT source without
rewriting Claude's accepted component.

## 2. Financial: implementation and the retry defect

The Rust constructor now assembles the original pinned `WorkerStart::Resume`
manifest, concrete Core request issuer, one shared financial envelope channel,
real financial-purpose verifier dependency and existing financial worker. The
same channel supplies validated inner wire bytes and same-call sidecars; no
second truth/cache is reconstructed from unrelated calls. The explicit CLI
checks configuration; running still requires a real injected verifier, not an
accept-all default. This is read-only source work, not command activation.

Core's opt-in, initially UNBOUND composition uses ONE real
`CurrentHumanCandidate` for issuance and reverse ENTER/terminal/recovery. The
context is registered server-side with an actual actor and six exact source
paths. Neither HTTP request bodies nor workload certificates choose a human.
TLS1.3/mTLS, exact certificate/SAN/workload pins, strict UTF-8/JSON, raw PM
request digests, deadlines and retained in-flight DB ownership apply.

### Repeated Idle poll / ambiguous response

Review found a real gap: an unchanged delta cursor repeats the same request,
but its prior human lease is already COMMITTED. Blindly reusing that lease
breaks ordinary polling; rotating merely because the old lease is terminal
would mistake a lost PM response for a new read.

The repair therefore adds deterministic context-local `delivery_sequence` and
`previous_lease_id`, plus a separate authenticated completion request carrying
the exact verified raw response digest. The SAME sequence/request retains its
original promise/lease; no issue/send/timeout implicitly completes it. A next
sequence is admitted only after explicit delivery acknowledgement AND real
persisted source-terminal proof plus fresh Core authority. UNKNOWN/ENTERED,
expiry alone, retired/unentered leases, drain and changed session/policy are
not successor permission. Old custody is never deleted or relabelled.

Core commit `6bf817f7ae36ea9a0428fe2ec1c43ea40c232120`: 8 files, +1670/−0.
The actual production class is shared by issuance and reverse source terminal
routes, not a second custody store. Independent review **ACCEPT** for candidate,
issuer, private transport and composition. The Rust counterpart is committed
as `06d835c6cb9aa0ae6225bb50c0c221f2f192d26f` in the owned HK candidate
`/home/bobby/.worktrees/portal-core-current-policy-wire-20261024`, branch
`feat/core-current-policy-wire-20261024`: 9 files, +2446/−26, clean.

Rust advances only after the exact completion ACK. If that ACK is lost, the
channel retains ONE bounded already-verified original response/body/output and
retries the SAME completion; it neither reacquires an identity nor sends PM
again. Sidecar refresh cannot bypass pending completion. A lost/unverified PM
response does not advance; the original obligation remains for authentic
source recovery. Missing context on restart fails closed, never synthesizes a
new context or source success. These are correctness guarantees, not a claim
that PM's real proof/verifier/recovery provider has been commissioned.

Independent final Rust lifecycle review: **ACCEPT**, with no blocker. One
nonblocking configuration-hardening note: the Rust private-config parser allows
a broader ASCII context than Core's opaque 43-character base64url format. Core
still rejects any invalid context; commissioning must supply the actual Core
context, not a human-readable placeholder.

## 3. Verification and preserved evidence

Intermediate lanes already observed before the delivery-sequence repair:

- Accounts metadata/BFF 65/65; affected installation 5/5 retake and original
  composition/resource/runtime lane passed. Native trust regressions 62/62.
- Private issuer transport 55/55 and composition 32/32, using ephemeral TEST_ONLY
  TLS and in-process lifecycle doubles. They do not prove a PM financial run.
- Genuine disposable PostgreSQL custody 101/101 (62.57 s, 2 CPU total/1536 MiB,
  no OOM), including authentic Ed25519 source ENTER/terminal proofs and proper
  drain→retire-unused→revoke. No app database, session or grant was changed.
- Source TypeScript passed in 178.56 s, compiler diagnostics 2224643 KiB. The
  earlier 180 s attempt timed out; it is not a successful run.
- Rust 209/209 library cases, strict production lib/bins Clippy and binary
  build passed before the delivery-sequence amendment. An exploratory
  `--all-targets` lint failed on test-style warnings; it is not recorded as a
  PASS. The normal production lint was retaken. Do not sum repeated cases.

### 3.1 Final delivery-sequence retake

| Lane | Actual result | Boundary |
| --- | --- | --- |
| Core assertion authority | 49/49 PASS, 1.47 s | TEST_ONLY identity orchestration; no automatic terminal rotation |
| Core private transport + composition | 90/90 PASS, 4.20 s | Includes 58 TLS/route/deadline/ACK tests and 32 lifecycle tests; real loopback TLS, not a real PM connection |
| Genuine disposable PostgreSQL | 105/105 PASS, 70.71 s | Actual current-session/authority DB and Ed25519 source proof; two identical Idle polls, UNKNOWN recovery, explicit completion, lost ACK, 8-way coalesced successor, drain/revoke; no app DB |
| Source TypeScript incremental | PASS exit 0, 68.72 s; 1431 files, 1328485 KiB compiler diagnostics | Source-only, no frontend/generated changes |
| Rust edge-service library | 217/217 PASS, 0.72 s test execution | Includes 8 new delivery/retry regressions; dependency compilation separate |
| Rust production lib/bins Clippy | PASS exit 0, 9.80 s | `--offline --locked ... --lib --bins -- -D warnings`; NOT an all-targets lint certificate |
| Rust executable build | PASS exit 0, 21.83 s | No persistent image build/install |

The initial sandbox TLS retake failed with `listen EPERM:127.0.0.1` before
listening. Only those two specs were rerun with loopback permission; their real
90/90 result is above. No assertion or security check was suppressed. The
first PG fixture attempt tried a raw session revoke while an ISSUED lease
existed; the real fence correctly rejected it. The test was repaired to use
the actual drain→retire-unused→revoke writer; SQL fences were not weakened.

- Final PG log SHA256
  `6f59edffb08940b7df6feb13c9604325e3d09b06cac237827b0153ffc47870c4`,
  `/tmp/elp210-accounts-financial-sequence-pg-20261024.log`.
- Final Rust test/lint/build log SHA256
  `7e1617b864b603c613fcca374de94c8719f480cebd1a2bf27518646d450f305b`,
  `/tmp/elp210-edge-source-20261024.gt6Znz8L/round3-financial-sequence-final.log`.
- Final tested binary SHA256
  `c4a5480060b9c34b0cfad5c59eeb737cf081020e86c74c63cb3dcb2cf1bcbdf7`.
  This is a binary pin, NOT an installed image/config pin.
- Core authority source SHA256
  `edc612f1f6927e46a83fe172f6e5e9d051f366ee9a0d40a6035d573e1ea205ae`;
  strict request/response/completion examples and 49 negative cases are in
  `apps/control-api/test/financial-source-assertion.spec.ts`.

Both correctness cells used 2 CPU/1536 MiB maximum, no OOM; PG 53.22 s actual
test-body time is included in its 70.71 s lane, not extra coverage. Containers
and the internal PG network were physically removed. No repeated full
frontend suite, engine run, source probe, restore or R2 hook for documentation.
Intermediate code commits follow campaign §10.10c. **R2 integrated gate is
pending**; focused results are not relabelled as full-product landing PASS.

Reused by impact: the actual verify-full TLS probe read all 722 rows in four
source selections (196 account identity, 341 balances, 185 policies), 0.708 s. That is
**SOURCE_VERIFIED_BYTES_ONLY_NOT_HUMAN_AUTHORIZED**, not BFF/browser acceptance.
The existing 30-relation/39,354-row preservation receipt is unchanged: this slice
adds no DB schema, data rewrite or backup restoration. Three peer tracked
Markdown WIP plus incoming mirrors on active HK Edge remain untouched.

## 4. Next exact owners and phase gates

| Phase | This package | Remaining owner/action before full exit |
| --- | --- | --- |
| ELP2-05 | Financial constructor and genuine identity issuer, source-only | Edge coordinates PM's financial-purpose proof verifier, original transaction-group association and receiver APPLIED-after-COMMIT/status. Transport200/identity signature/STORED are not substitutes. |
| ELP2-06 | Real-principal Account360/metadata BFF implemented | Core/Edge pin independent CURRENT metadata/commissioning/trust, use the actual Research actor's valid ordinary scope, then test API; real BINDING list publication is separate. Claude checks the unchanged consumer on that qualified source. |
| ELP2-07 | Existing submit/status/recovery remains source-dark | Edge supplies commissioned gateway/pins through the sole coordinator. Core tests the same original intent/custody/idempotency; do not enable command or Live. |
| ELP2-09 | Current-policy/metadata boundaries preserved | Edge binds qualified source and separately commissioned CURRENT/STREAM/HISTORY/REPLAY rights; Core runs only missing cache/cursor/SSE/revoke/restart/recovery lanes, never reuses retired grants/windows. |
| ELP2-10 | Focused implementation gates, not performance qualification | Freeze compatible runtime candidate after wiring; resolve real financial and trust inputs; submit actual budget/calibration artifact and numeric target before coexistence/G2. Claude performs source-backed browser acceptance. |
| ELP2-11 | Existing preservation evidence retained | Integrated install/migration/restore/rollback/manifest acceptance after the above, on exact candidate pins. No dev/main merge, signed release or production deployment. |

Machine-readable lane results, review dispositions and preserved failed
attempts: [test-results receipt](CORE_ACCOUNTS_FINANCIAL_2026-10-24.test-results.json).
Documentation reconciliation uses path/link/JSON validation,
`git diff --check` and `scripts/execution-tracking-test.sh`; no repeated full
gate solely for this evidence commit (campaign §10.10c). The source evidence
remains R1, with R2 integrated acceptance pending.

### Claude handoff

Keep accepted layouts/components, fixture mode and current frontend WIP. No new
browser endpoint or generated public DTO is introduced. Reuse the existing
Account360 reader when this opt-in source is commissioned. Do not substitute
account IDs for binding IDs, sum raw balances into portfolio equity, infer
history/STREAM from CURRENT, or turn absent finance into0. Financial issuer and
reverse routes are private Core↔Edge infrastructure, never browser calls.
The next browser receipt needs exact source/image/config/workspace/principal
pins, final-denial behavior and no cross-workspace leakage. Fixture checks can
continue independently; they are not counted as source-connected evidence.

## 5. Rollback / cleanup / current installation

All new listeners remain opt-in and unbound until explicitly composed/started;
default application behavior stays unchanged. Rollback is removal of the new
candidate mounts/config or a source revert, not deletion of identity/custody,
source transactions, audit, financial evidence or existing retained rows.
Disposable owned test containers/networks are removed; original failed-run logs
and source/backup evidence remain. No broad prune or peer process cleanup.

Installed Research API remains image
`sha256:01692fc5702f21856f5c932efc0786d3f65ff47bb3ed7d1949ee18666f31458a`;
the current-view listener stays OFF and model heads remain0. No new images,
keys, grant/session or runtime config have been installed in this slice. No
push, stable/dev/main/provider28445 change or command/Live activation.
