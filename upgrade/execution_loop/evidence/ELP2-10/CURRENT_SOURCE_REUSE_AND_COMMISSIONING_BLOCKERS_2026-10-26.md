# ELP2-10 — current-source reuse and actual commissioning blockers

Date: 26 October 2026 (Asia/Saigon). Coordinator: Codex. Documentation tier: R0.
Read-only source/runtime investigation followed by **actual local image packaging
and an isolated restore/forward-migration check** (§5). No production code,
shared-runtime, source authority or connected/browser PASS is claimed.
Entry `chore/backend-residuals-20261025@b6ebc605d137b05b550b84cca16234379e6d3a21`,
clean; production source remains `4e7deab1901539be64bfaf782746fc2d6dd53f5f`.
This refines the [final-gate ledger](FINAL_GATE_LEDGER_2026-10-26.md), without
rewriting its frozen receipt or treating historical source evidence as a new
Research connection. Bobby requested full phase closure, not weaker gates.

## 1. Newly verified: basic CURRENT is not globally source-dark

The official Edge maximum-data return pack contains **real historical** source
acceptance, not just examples or synthetic fixtures:

| Artifact under `contracts/maximum-data-return-v1/` | SHA256 | Scope |
| --- | --- | --- |
| `e6-acceptance.manifest.json` | `5081befce2c7d62a0a33abd95607e3caf02b7659448b39473e0208640a9e0ef5` | EDGE_SHADOW_VERIFIED, three profiles/57 relation observations, 4 September 2026 |
| `e6-domain-acceptance.v1.json` | `7789a0e9b1cacb50489a4eb198cecae825a61bbad61696e538930f622a238c3b` | Accounts/balances/margin/binding/sync: ACCEPTED_CURRENT_STATE_ONLY, no source-owner gap for that boundary |
| `e7-return-pack.manifest.json` | `d031134c4d49e741286948f62992ca334e7f7bc81d3bb8d546faf7180d9243bb` | Accepted current qualified reads plus explicit external gates; not runtime activation |
| `DEPLOYED_RUNTIME_MANIFEST.json` | `8c5dec0fac9fde8e40d9b1d95b3b7aae62d22ab8e1afacc7c23c1513ecbd1976` | Historical observed image/catalogue/policy tuple, not a current human grant |

Primary verified these public hashes from the cached owning source. Read-only
SSH then verified the actual running ordinary Paper Manager tuple on HK:

- Container `portal-manager-read-paper-v2-portal_manager_read-1`, image
  `sha256:28ea39588edd1b4fee1715d1e9ca6bd289effac82a573a920b217a8c350226b3`.
- Serving policy `b9fbe07d1a9826d3e9270798162c052dda3687d27a04809eb38c4ad9e1a054f3`.
- Relation catalogue `9040f0897d8f452a486e51ce35abb7f3165b2238d07221b6b0e684d9829b012e`.
- All three match the historical deployed manifest. Server certificate observed
  valid 16 October–15 November 2026 UTC; leaf SHA256
  `80788add88a7e4ff4a3ab72d418e50417996a85c7c48a741c724017b94a788ab`.
- Actual Edge image is instead
  `sha256:d6aa7a510ddfbc3fc2080b19eebfd70818377a4e59690247195ada7dd92aff2e`,
  OCI source revision `8814cd2a5f66aeac0828812dbb8340c4f0a4adbb`.
  It is **not** the old receipt's Edge `47ea4d78…`. No equivalence assumed.

**Disposition: historical basic-CURRENT source semantics are reusable after
impact review; current ordinary Manager image/catalogue/policy match directly.**
This does not prove current source contents, trust authorization, the newer
Edge hop, or Core→Edge→screen delivery. It does mean that basic Accounts CURRENT
must not wait for financial APPLIED, NET_PNL census, Score calibration, or the
alpha-version tuple required for narrower Fleet notices. Those are independent
semantics. Do not copy stable credentials/grants to consume this baseline.

The separate native Manager container uses the same base image **with an
additional mounted Python source release**. Image equality alone is therefore
insufficient for its compatibility. The invoking Research SSH user cannot read
that protected overlay/config; the read-only attempt returned Permission denied.
No sudo/read escalation, permission change, source replacement or credential
access was used to get around this boundary. Edge/source owner must provide its
sanitized overlay/config hash or select the owned reviewed candidate explicitly.

## 2. Actual Research target is not running the new CURRENT candidate

At `2026-10-26T08:59Z` and the following read-only check:

| Observation | Direct result |
| --- | --- |
| Core image | `sha256:01692fc5702f21856f5c932efc0786d3f65ff47bb3ed7d1949ee18666f31458a` |
| Web image | `sha256:0653eece6e611c99e7f7fbb4bf38068ddf97ac8ddd05834a918fbe76c899c5b3` |
| Core DB identity | `portal_control`, role `portal`, system identifier `7688673963308855330` |
| Exact actual workspace | `ws_06G19F61YB8CFR7TEWMS7HQ660`, not the literal `research-workspace` |
| Stored grants | Seven `portal.manager-domain-grant.v1`; **zero interval-current/unrevoked** |
| Ordinary entity grants in that workspace | Zero rows; native domain grants are not entity roots |
| Policy audit events | 13, preserved |
| New native CURRENT custody table | `to_regclass('public.portal_native_current_read_obligations')` returned null |
| Existing private schema registry, later direct read | Version `research-current-human.v1`, schema digest `826e4e083c8db536fc80a0f0ec272e3a71387a5e5d53a9cde48563f41fe32728` matches new compiled SQL pin; ledger catalogue `8b2381a496860713ff490e32f45bb8c30ccf9b09832e8727a52043771669204d` |

Grant counts are a bounded aggregate of stored facts, **not** an access decision
or a session inventory. Both SQL inspections ran explicit READ ONLY transactions
with a 2-second statement timeout; no cookie, token or grant payload was output.
The missing table is supplied by the already committed forward migration
`apps/control-api/migrations/1723680000153_execution-native-current-relations-custody.sql`.
Do not create a second migration or manually insert grants/receipts to hide it.
The existing private schema is **not missing** and its registered SQL pin agrees
with the candidate. Do not recreate it or erase its custody to install153.
This registry observation is not a fresh full target/catalogue assertion.

Thus it would be false to ask Claude to take a positive receipt on the newly
implemented CURRENT adapter from this shared preview. Candidate code exists;
its actual image/schema/authority installation remains **Core-owned work**, not
an external Edge delivery and not a fresh compilation defect.

## 3. Ordered actions: bounded CURRENT need not wait for the full phase

| Order / owner | Exact action and completion evidence |
| --- | --- |
| Edge source selection | Select basic Accounts CURRENT from the accepted Paper image/catalogue/policy above; confirm current exact source/binding, allowed fields/census and source overlay pins. Return this lane independently. Missing financial originals, calendar and narrow-notice tuples do not invalidate this basic source baseline. |
| Core integration/install | Candidate image is now built; actual backup→clone→migrations152–154 PASS with limits in §5. Finish required integration/consumer gates before any shared installation, then verify registered schema before listeners. Preserve owner IDs, grant history, custody and rollback image. No shared preview replacement before its applicable landing/install gates. |
| Core/Edge current authority | Use the official writer and existing exact Research identity for a **new independently scoped** current READ; bind genuine source correspondence/rights and current-purpose trust. The seven stored grants with zero interval-current/unrevoked, ADMIN, mTLS and a JSON SOURCE_VERIFIED flag are not substitutes. Do not reopen retired slots or mint source originals. |
| Core then Claude | Actual finite Account/balance API response → existing reader → browser at 1280/660; check source/public image/config/schema pins, wrong workspace, revoke before disclosure, restart/recovery and cleanup. This is an independent current lane, not STREAM or full ELP2-10 PASS. |
| Edge/Core STREAM | Separate original REPLAY/STREAM permission and qualified new sealed baseline; native per-frame/cursor/cache/revoke/recovery acceptance. CURRENT does not grant this lane. |
| Edge-coordinated owners | Genuine financial-purpose original/verifier and COMMIT→APPLIED→durable ACK; economic mapping/census/partition; owning health/metadata facts; approved measured target/budget and calibration inputs, matched coexistence/G2. Existing factories remain reusable, not missing implementations. |

Calendar is explicitly absent in the owning E6 market-context acceptance. Core's
VN calendar seam does not supply a provider. **SOURCE_DARK remains true** until
Edge's owning provider supplies the operation/revision/permissions. A Binance-only
case can record calendar N/A with its exact case scope; that is not permission to
silently close the VN/calendar requirement or drop it from this campaign.

The full phase cannot be closed by relabelling these missing original authority
or provider facts. No further local adapter was added merely to produce a diff.
No new Bobby password/session request is needed for already approved development;
the concrete source-owner inputs and the Core install/consumer gates above are
the unblock conditions, not another generic window extension.

## 4. Claude handoff, checks and cleanup

Canonical remains clean `685bc1915db51c7869254c1fdfa68991d7e4aae4`; Claude remains
clean `00e7f6cff2fadbd88b8ed461fa870b28ee88ad94`. No new committed request/consumer
ACK was found. The earlier ten-file/158-test API fixture repair `c8e4ac08f` is
already an ancestor of this candidate; do not call those original 67 failures
unfixed code. Final normal R2 is still not a completed PASS. The recorded visual
213 FAIL must be triaged by exact consumer/fixture/baseline cause, not hidden or
re-recorded wholesale. No frontend file was edited.

One read-only agent completed the public publication audit and was reused for
independent packaging/restore review; a second triage
agent verified that repair ancestry, then hit model capacity and provided no
complete visual review. Primary verified the reported source pins independently;
no absent agent acceptance or extra test coverage is inferred. The independent
review **ACCEPTS the narrow clone result**, not complete privilege preservation,
RLS enforcement or connected qualification. Full hook/API/Rust suites were not
repeated: source unchanged, scoped304Core/24Rust receipts retain their limits.
An emitting production compile was required to package actual image bytes;
the preceding no-emit compiler result could not supply those outputs.

Initial source observations created no resources. The subsequent build/clone
resources and their exact teardown are recorded below. No session, grant,
credential, tunnel, source-bundle upload retry, push, landing or shared-runtime/
stable/dev/main/provider28445/command/Live change. Rollback remains leave the
candidate unmounted; preserve both histories and immutable source/audit.

## 5. Actual candidate package and Research clone migration — 09:15–09:24 UTC

### 5.1 Image, emitting compiler and package hygiene

- New local image **`sha256:70e6217f2ee312fa9415d9d343aeed5e768669b8514c94127753bbd2ea8653a4`**,
  tag `local/portal-research-current-candidate:4e7deab19-20261026`,72,373,718bytes,
  runtime user `node`, OCI revision `4e7deab1901539be64bfaf782746fc2d6dd53f5f`.
- Packaging base `sha256:50939bb5784b58b0bc68121c4920c703abf208da7dfba74541934fe53e48e9b2`.
  Production package/lock files have no difference from its earlier source
  `664433587050ab8673fa03318a5e74d8b33b146d`. Old `dist` was removed from
  the derived image before copying the new outputs, so stale JS cannot survive.
- **Emitting production tsc PASS**,1459files/239.80s, OOMfalse; pinned Node
  `sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32`,
 3CPU/3072MiB, heap2560MiB, read-only inputs/network none. This is the existing
  approved local build profile, not a widened service/load budget.
- Package allowlist:846JS/JSON/SQL/package files, sorted file-list digest
  `1a71c965ceed117cfb1fdbf08349be83f040a66bec7f59df6cd81bb76dd4ccee`.
  No market data, config, private input or source archive is in the context.
- **Image import/schema/hygiene PASS**: native CURRENT runtime preparation
  functions load; schema matches compiled pin
  `826e4e083c8db536fc80a0f0ec272e3a71387a5e5d53a9cde48563f41fe32728`;
  migrations152–154 exist; private/staging/source/.env/npm/TypeScript paths absent.
  Smoke container networknone/read-only/1CPU/256MiB, removed afterwards.

Retained failed attempts are not PASS: first compiler container lacked its
pre-created output mount; next emitting compile succeeded but BuildKit treated
the raw local image ID as a registry name; the classic-builder retake refused
`COPY --chmod`. Final private Dockerfile uses the exact local base and explicit
file permissions; final classic build PASS. No recompilation was repeated for
those image-only harness failures, and no source/private bundle was uploaded.

### 5.2 Genuine Research backup, disposable restore and forward migrations

Source DB `portal_control`, system identifier `7688673963308855330`; logical
backup was read-only to the serving DB. Archive31,171,366bytes, private only:
`~/.local/state/portal-backend-residuals/20261026/current-clone-RPCV1tOE/research.dump`,
SHA256 `ad54e74ea5b24cfda631d7fe2793f9acb3c1cfc799b53528670d946a1bbec7db`.
No credential material or backup bytes were sent to Git/HK/chat.

The disposable clone used the serving PG image
`sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685`.
Private internal network, no host port; PG1CPU/1024MiB + candidate1CPU/512MiB,
one heavy-lock command, **external `timeout --signal=TERM --kill-after=15s 300s`**.
The per-query15s bound is additional, not the aggregate deadline.

**PASS exit0/OOMfalse, official `runControlApiMigrations`, then repeat:**

- Exactly152ROOTcustody,153CURRENTcustody,154operation-health added.
- All190pre-existing application-table counts unchanged except the intentionally
  advancing migration ledger. Includes non-public application schemas.
- Exact sorted-row hashes unchanged for12selected public tables
  (`auth_sessions`, `portal_users`, `portal_owner_anchor`, `external_identity_bindings`,
  `workspaces`, `workspace_members`, `portal_access_grants_v2`,
  `portal_access_policy_events`, `portal_access_policy_state`,
  `portal_capability_grants`, `portal_native_review_schema`,
  `execution_retained_review_access`) and all7existing `elp210_candidate` tables.
- `pg_policies` definitions and the inspected clone role attributes unchanged.
  The second official migrate changed neither counts, selected hashes, policy
  definitions nor migration ledger: **idempotency PASS**.

Scope limits: the connection is the clone superuser; **effective RLS enforcement
and original ACL/ownership/membership are NOT_TESTED**. Restore intentionally
used `--no-owner --no-acl`; policy definition equality is not an RLS-access test.
Other authentication tables such as password/activation credentials and audit
events have count-only coverage here, not new whole-table byte-hash claims.
Earlier source-matched authority tests retain their separate recorded scope.

First restore failed because role `portal_research_runtime` was absent in the
fresh clone. Direct source metadata established NOLOGIN/NOSUPERUSER/NOINHERIT;
the final harness pre-created that clone-only policy role, without passwords,
memberships or source grants, and reused the same verified backup. This is not
a shared authority change or restoration of the original database ACL.

### 5.3 Reproducibility pins, cleanup and remaining installation gate

Private evidence under `~/.local/state/portal-backend-residuals/20261026/`:

| Artifact | SHA256 |
| --- | --- |
| `current-candidate-package-retake.log` — emitting compile PASS / preserved first image failure | `e012932c583de0d1f8c11b2d25537798a50910ae91e5c525309ef543fe8c781d` |
| `current-candidate-image-compat-retake.log` — final image PASS | `9b5f102df9d52d841a747d13e053107eab82d2697184587137f8ecb97eff46ce` |
| `current-candidate-hygiene.log` | `9d371e69a70f7a003978c3e795137d47733d0e72b84e8e1b95367003a29e6e06` |
| `current-candidate-package-manifest.json` | `cd807cf70e920ebb5b6e17252c9a548d237718a183dca1bfcb5554ce95b236f4` |
| `CurrentCandidate.Dockerfile` | `0a838add4d42b4b04727476724c1f922ec20fe1e0bac870f33648819a9a61f46` |
| `current-candidate-migration.log` — first role-missing restore failure | `98de15e733bf61aba0b98d2c656c770e10ef1bf4bd023f4882c654399abbf27f` |
| `current-candidate-migration-retake.log` — final PASS and teardown | `e43beb5f203b1d690fe51e1792ab42219660c296316cde145907c536d6536487` |
| `current-clone-VGQUMqQ6/current-candidate-migration-result.json` | `404c0fe2620bf4b5ec8540a611aa969b10daaa661d4e632f031b2fd0c61d1009` |
| `current-candidate-migration-check.cjs` | `54b73ce3d8099dd206a8069e6c3aa70aef70fb31442378d80fa833a5b9296d56` |
| `run-current-candidate-migration.sh` | `45d0a559e4ec02799ec80ca6ead439f33f909c5e050d861611493b0a28717d23` |

Both exact owned clone PG/Node containers, their networks and volumes are
absent after trap cleanup; no packaging/smoke container remains. Private
backup/logs/package context and the new candidate image are preserved for
review/rollback, not broadly pruned. Root free217,963,290,624bytes/68%used;
**NO_ACTION_NEEDED**. This is a capacity sample, not peak RSS or G2 evidence.

Fresh shared-preview checks after the drill still observe old Core image01692…,
last migration151, missing CURRENT custody table and13policy audit events.
Web remains0653eece…; existing private-schema SQL registration matches the
compiled826e4e08… pin, so new public migration153 must not be confused with a
need to replace that schema or its audit/leases.
Canonical and Claude branches remain untouched. Thus the image/schema package
is now genuinely built/tested **locally**, not installed, current-authorized,
connected or browser-accepted. No further image build is needed just because
this Markdown is committed; final integration/install gates remain mandatory.

**Return status: LOCAL_CORE_PACKAGE_READY; CONNECTED_NOT_READY.** Edge may
return exact basic-CURRENT source/overlay/purpose-trust selection now, without
waiting for financial/Score/STREAM or a speculative short-lived window. Core
still owns the final integration/install gate and official current-authority
commissioning. Open a connected window only after both actual sides are ready;
this packet is not an ACK for a retired source or a pre-authorized source bind.

**Exit: ELP2-10 NOT_MET.** Independent basic CURRENT commissioning is next;
whole-phase qualification still requires the separate mandatory lanes above.
