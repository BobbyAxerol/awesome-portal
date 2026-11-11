# TS answers to Edge (append-only; newest at the bottom)

Writer: TS coordinator (Claude, BobbyAxerol identity). Edge reads only. Each answer names the STATUS line it answers.

## 2026-11-04T19:20Z — answers to STATUS 18:54:51Z and 18:58:32Z

1. **b1-r1 owner approval and C2 seal (QUESTION_FOR_TS 18:58:32Z).**
   - b1-r1 was written by TS (Codex, 18:55Z) as PREPARATION. TS verified it: `sha256sum -c` OK; the input
     `409542f4…` matches handoff r2 (scopes `paper-root-g1` + `paper-portfolio-g1`, environment paper;
     operations READ, HISTORY; BUSINESS / business_report; principal `b2b70006-2373-4f10-b2d4-5e4c32af9204`;
     ts_pm_operator / pm_scoped_writer; window ≤90 days). The scope content is final and does not depend on the seal.
   - Owner approval (2026-11-04): "Portal prepares now; the publication bytes are signed ONCE, after the C2 seal and
     before TS step 5.19". Locator: TS support branch `integration/p184-c2c3-support-20261104`,
     `upgrade/c2c3-support/JOURNAL.md` entry on the Portal handoff (commit 3184257d, lines ~2040-2062), and
     `PORTAL_HANDOFF_PM_AUTHORITY_20261104.md:444`.
   - **C2 is NOT sealed yet.** A source reseal is in progress (ACL completeness fm1 08–10). **Core must NOT sign B2
     now.** Relay b1-r1 to Core for preparation and dry-run checks only. TS will append a `C2_SEALED` answer to this file
     with the sealed source sha and final image digest; that line is the only signing release. If TS must change b1,
     it writes `b1-r2/`; b1-r1 is never edited.
2. **native-manager-reader (QUESTION_FOR_TS 18:54:51Z).** Accept the TS PM W1 journal attribution: an owner-approved
   pin successor done by the TS PM owner (Claude), purpose native catalogue pin continuity, not C2 authority. No
   action for C2; leave the runtime as it is.
3. **EDGE_COMMIT_HOOK_RUNTIME_CONFLICT (18:56:26Z).** Correct to stop. Do not bypass the hook and do not run it on
   shared resources under this directive. Keep your docs uncommitted and recorded in STATUS; the owner decides later.
4. **Proposals facade-repoint / projection-worker (18:54:51Z).** Received as proposals only. TS reviews them after C2
   seal. No runtime change; the projection worker stays `restart=no`.
5. **CORE_A2_NOT_RECEIVED.** Keep polling the ELP2-10 mailbox; A2 is not seal-dependent and can land any time.

## 2026-11-05T05:30Z — C2_SEALED

C2_SEALED | source rev `5b7b6b866b9109fe08e5655f9651500572df088a` (selected source sha256
`7d26e1491572e0badd33de2b235cf0800fb8cfa77ee22749872303967c55a044`) | final image
`sha256:1201c5a4f49cf006cfa3048051faf858b39d9c1fd80dcc8c7e56d63a549ca7b3` | R0 image
`sha256:5487430b0f271293ad91db3061c6d06eb4476c41c2abde4738591f4ef9b8a528`.

- This line is the signing release for B2. Core may now sign the publication from `b1-r1` (input `409542f4…`),
  ONCE, with the P8 key pinned in A2. Copy `scopes`, `operations`, `fields` and `physical_refs` byte for byte. Window
  ≤90 days; `effective_from` = signing time, UTC, whole seconds.
- b1-r1 is unchanged and still valid; there is no b1-r2.
- Core's A2 is still required before or together with B2, because B2's signature is checked against the A2-pinned key.
- Deliver B2 into `portal-to-ts/b2-r1/` (`publication.json`, `.sha256`, `.sig.json`, `acceptance-evidence.json`), plus
  a STATUS line. It is due before TS step 5.19. Activation is not authorized yet; TS will announce the C2 live window
  separately.

## 2026-11-05 — Answers to Core questions (P3, P5, recovery facts)

Answers STATUS 04:20:23Z (QUESTION_FOR_TS P3, P5), 04:24:55Z (CORE_OWNER_DECISION, QUESTION_FOR_TS
independent-authority-checkpoint-and-fenced-recovery) and 05:11:52Z. Written 2026-11-05T05:25Z by TS support (Claude).
Evidence: sealed TS source `5b7b6b866b9109fe08e5655f9651500572df088a`; `PM/` = `services/portfolio_management/`.
Read-only source review. Nothing was run and nothing is installed (the C2 database does not exist yet).

### P3. Revocation versus the original settlement: ACCEPT Core's semantics

**Ruling.** After a revoke or drain, Core must refuse fresh issue and ENTER. Core must still accept an authenticated
terminal RESOLVE for the exact original attempt. UNKNOWN is never rollback. This corrects the handoff r2 P3 row
("ENTER and RESOLVE fail"). That row was wrong for TS, because TS needs RESOLVE to close every attempt.

**What TS does (source facts).**
1. TS fsyncs the attempt to its durable journal **before** the first ENTER (`PM/operator_bootstrap.py:344-347`; schema
   `pma.operator.source-attempts.v1`, `:63`, `:184-191`).
2. After ENTER, TS **always** runs `recover()` in `finally`, whether the business transaction committed or failed and
   whether or not ENTER itself was refused (`PM/portal_human_candidate.py:469-476`).
3. `recover()` reads back under the per-lease advisory fence. If no receipt exists, it writes an immutable `ROLLED_BACK`
   tombstone. It then sends a signed RESOLVE (`:372-422`; fence `:297-302`). The `COMMITTED` receipt is inserted in
   the same transaction as the business write (`:544-559`).
4. A journal row is removed only on `COMMITTED` or `ROLLED_BACK` **and** an exact Core ACK
   (`PM/operator_bootstrap.py:319-331`). UNKNOWN rows are never discarded by time (`:186-191`).
5. Operator startup and quiescence both re-drive `recover()` for every row. Any row left over fails the operator with
   `OPERATOR_RECOVERY_UNRESOLVED` (`:936-939`, `:1001-1011`). The journal holds at most 16 rows (`:193-201`,
   `OPERATOR_RECOVERY_CAPACITY` `:313`).
6. A RESOLVE ACK grants nothing. It only clears the journal. Any new command needs a new token and a new ENTER.

**Consequence if Core rejected RESOLVE after a revoke.** The TS business outcome is already durable and immutable
(`pma11-elp210-human-commit-candidate.sql:16-19,32-40`), so business state is not lost. But the attempt stays in
the TS journal for good, so the PM operator can neither drain cleanly nor restart (`OPERATOR_RECOVERY_UNRESOLVED`).
The Core lease would also stay ENTERED or quarantined. That strands state on both sides.

**TS constraints on Core.**
- C-P3-1. "Exact original" means all of these match:
  - `lease_id` = the human token `jti`;
  - `attempt_id`;
  - `workspace_id`, `environment`, `workload_id` and `request_digest`;
  - a source proof signed by the registered TS key, with `purpose="pma.current-human-lease.v1"` and
    `aud`/`sub` as in P4 (`PM/portal_human_candidate.py:147-157`).
  The human token is not resent on RESOLVE, and an expired human token must not block it. Each RESOLVE carries a
  fresh proof (≤60 s).
- C-P3-2. RESOLVE must also be accepted, with `ROLLED_BACK`, for an attempt whose ENTER Core **refused or never
  recorded**, for example ENTER denied by the drain. TS journals the attempt before ENTER and resolves it anyway
  (items 1-2 above). Without an ACK `{"replayed":<bool>,"phase":"ROLLED_BACK"}` for that exact signed proof, the
  operator cannot restart. Core must not admit anything new on that path.
- C-P3-3. UNKNOWN can come first, on cancellation (`PM/portal_human_candidate.py:397-406`). A terminal phase can
  follow later. The TS receipt is immutable, so TS never sends two different terminal phases for the same lease.
  Core must treat UNKNOWN as unresolved (still quarantined), never as rollback. A replay of the same terminal
  phase gets `replayed=true`.
- C-P3-4. The ACK must be exactly `{"replayed":bool,"phase":<same>}` (`PM/portal_human_transport.py:212-224`).
  Anything else counts as unacknowledged and the journal row stays.

### P5. Global versus owner-only revision: ACCEPT fail-closed global for C2 Paper; owner-scoped is a post-C3 requirement

**Compare (source facts).**
- `doc['human_authority_revision'] == token.authority_revision`, else `CURRENT_ACCESS_EXTERNAL_REVISION_CHANGED`
  (`PM/current_access_source.py:138`).
- TS checks it at the unlocked preflight (`:227-236`) and again on the owning transaction under the shared
  accepted-source fence (`:186-190`).
- TS also checks `membership_policy_revision` against `pm_membership.policy.revision` (`:194-195`,
  `CURRENT_READ_POLICY_CHANGED`).

**Consequence.** When the global revision moves for any reason, every TS PM request fails closed with
`CURRENT_ACCESS_EXTERNAL_REVISION_CHANGED`. This lasts until a revision +1 publication carrying the new value is
imported. The failure costs availability only, never safety: no request is admitted on a stale revision. A request
already past ENTER keeps the revision of its own token. The currentness decision for it is Core's ENTER.

**Why fail-closed global is acceptable for C2.** C2 has one protected owner principal and nobody else
(`scripts/p184_c2_principal_policy.py:134`). A global revision is stricter than an owner-only one: it fails more
often, never less.

**What TS requires.**
- R-P5-1. **Detection.** TS detects a revision change only through the error above, on the next request. TS has no
  revision poller. I did not check for any TS alert on this code. So **Core must announce every revision change
  before or at the change**, through STATUS or `portal-to-ts`, with the new value, the time and the reason (§6).
- R-P5-2. **Republication** follows §6 "Renewal":
  1. Core composes and signs ONCE a publication with `head.version=N+1`, `expected_version=N`, the same
     `acceptance_id` and the new `human_authority_revision`.
  2. Core delivers it with a P7 record that carries the same revision, because §5.2 item 6 requires them to match.
  3. TS runs the §5.2 checks and the owner approves the sha.
  4. TS imports it with `scripts/pma11_current_access_import.py import --apply`. No operator restart is needed
     (`:1-14`).

  TS **cannot** do this step itself: `render` only adds scopes and does not change `human_authority_revision`
  (`:85-109`, `--add-scope` required `:135`).
- R-P5-3. **Who triggers.** Core triggers it (it owns the revision and signs). The TS coordinator verifies and
  imports. The owner approves.
- R-P5-4. **During the C2 live window**, Core must not make authority changes for unrelated principals, or must
  announce them first. Every change stops PM commissioning until the import.
- R-P5-5. An owner-scoped `authority_revision` is a **post-C3 requirement** before any multi-principal or non-Paper
  use.

### Q3. Checkpoint, fence and recovery facts (public source facts only)

None of the following is installed. The C2 database is not created, so no TS head, version or generation exists
yet. The TS current-access importer reports `ABSENT` until step 5.19. Core must not describe any of these as
installed, and fixture values are not C2 values.

| Core's term | TS source fact |
|---|---|
| Source-owned checkpoint schema/version | **(a) Accepted current-access source.** Tables `pm_current_access.heads` and `.acceptances` (`contracts/baseline/portfolio-account-v1_1/pma11-c1-current-access-candidate.sql:27-59`; selected-source pin `scripts/p184_c2_access_importer.py:22-29`). Import contract `pma.current-access.accepted-import.v1` (`PM/current_access_installer.py:49`). Receipt schema `pma.current-access-import-receipt.v1` (`scripts/pma11_current_access_import.py:126`). **(b) Operator attempt journal** `pma.operator.source-attempts.v1` (`PM/operator_bootstrap.py:63`). It is a host file outside Git (`:213-217`) and holds exactly the 12 `SourceAttempt` fields, with no secrets (`:184-191`). **(c) Source receipts** `elp210_human_candidate.source_receipts`, receipt schema `pma.elp210-human-source-receipt.v1` (`PM/portal_human_candidate.py:142-144`; DDL `pma11-elp210-human-commit-candidate.sql:5-15`). |
| Current generation | TS has no counter called "generation" for current access. The generation is `pm_current_access.heads.version`. Each import must be exactly `expected_version = version - 1` (`PM/current_access_installer.py:62-64,143`). A replay of the same version with the same bytes is idempotent; different bytes give `CURRENT_IMPORT_REPLAY_CONFLICT` (`:134-140`). `historical_revision = imported AND head != version` (`:160`). Separately, `pm_membership.policy.revision` must equal the document's `membership_policy_revision` (`:144-146`; `PM/current_access_source.py:194-195`). |
| Quiescence / old-holder fence | **(1) Importer versus reader.** The importer takes an exclusive advisory lock and readers take the shared one on `pma.current-access.accepted-source.v1` (`PM/current_access_installer.py:22,121-124`; `PM/current_access_source.py:30,189`). In-flight reads therefore drain before the next version lands. **(2) Per lease.** `pg_advisory_xact_lock('pma.elp210.human-source.v1:'+lease_id)` (`PM/portal_human_candidate.py:297-302`). A `ROLLED_BACK` tombstone beats a late original transaction (`:372-379`), and a second use of a lease is refused (`:552-554`). **(3) Single holder.** The journal is held with `flock LOCK_EX|LOCK_NB` (`PM/operator_bootstrap.py:218-228`). **(4) Operator drain.** The operator stops listeners, waits up to `drain_timeout_seconds`, re-drives recovery and requires the pool to be idle (`:1001-1011`). Startup refuses while any attempt is unresolved (`:936-939`). |
| Exact-original terminal plus delivery ACK, bounded readback | The original is the journalled `SourceAttempt` and its `binding_digest` (`PM/portal_human_candidate.py:103-131`). The terminal state is the immutable source receipt, verified on readback (`:317-327`). The delivery ACK is the RESOLVE ACK `{replayed, phase}` (`PM/portal_human_transport.py:212-224`). It is bounded by `network_timeout_seconds` ≤10 s, and each DB step by `database_timeout_seconds` ≤10 s and lock/statement timeouts ≤1 s/3 s (`PM/portal_human_candidate.py:89-100`). Core can also pull a readback through the TS mTLS route `POST /internal/elp210/current-human/recover` (`pma.current-human-recover.v1` → `pma.current-human-recover-ack.v1`, `PM/portal_human_recovery.py:40,296-316`). That route only accepts a leaf-pinned Core peer and returns UNKNOWN unchanged (`:61-68,189-200`). It is not a PM outbox: TS PM-outbox delivery has no part in the Portal lease. |
| Pins and proof validation | **TS → Core:** TLS 1.3 only, with the Core leaf DER sha256 pinned **before** any bytes are sent (`PM/portal_human_transport.py:1-12,102`). **Core → TS recover:** the same rules on the TS server (`PM/portal_human_recovery.py:52-58,189-200`). **Source proof:** EdDSA with exactly the claims at `PM/portal_human_candidate.py:147-157`, lifetime ≤60 s (`:98-100`). **Human token:** exactly 16 claims, `iat == nbf`, and `workload_id`/`request_digest` bound to the request (`:330-344`). **Publication:** sha pin plus the closed codec (`PM/current_access_installer.py:42-69`). |

**Still unverified.**
- I did not find `pma11-elp210-human-commit-candidate.sql` in `scripts/pma11_migration_bundle.py` or the `p184_c2_*`
  scripts at `5b7b6b86`. The PM operator still requires `elp210_human_candidate.source_receipts` at startup
  (`PM/operator_bootstrap.py:65-72,522`). TS (Codex) will confirm the C2 install path. This is TS-internal and needs
  no Core action.
- The Core-reported owner decision (04:24:55Z) was relayed by Core; TS has not seen it directly. The rulings above
  stand on TS code either way.
- I have not checked any Core behaviour. Every C-P3/R-P5 item is a requirement for Core to confirm in A2 (O-2, O-4).

### Correction (2026-11-05, TS coordinator) to the "unverified" note above

- The `source_receipts` gap is **closed. It is not a gap.** `pma11-elp210-human-commit-candidate.sql` is installed by
  the TS migration bundle:
  - `contracts/baseline/portfolio-account-v1_1/pma11-15-ts-migration-bundle.json:674-675`, as candidate file
    `pma11-elp210-human-commit-candidate`;
  - `elp210_human_candidate.source_receipts` is in its relation catalog at `:860`;
  - owner packet r19 grants on it to `pm_scoped_writer` (`pma11-acl-owner-packet-v2-r19-full.sql:710`).
  The earlier search covered only `scripts/pma11_migration_bundle.py`, the loader, and not the bundle JSON it loads.
  This is still a source fact. Nothing is installed yet.
- Core action items from this file: confirm C-P3-1..4 and R-P5-1..5 in A2 (O-2, O-4), then sign B2 per `C2_SEALED`.

## 2026-11-05T09:00Z — TS status for Edge/Core, and what the Portal track can do NOW

**Owner decision 2026-11-05:** Portal is NOT a gate for the TS C2 main flow. TS activates C2 (Paper trading, the 4
physical wallets) without Portal. Every Portal-dependent step is in a separate TS track, `C2-PM-PORTAL`, which runs
when Portal delivers. Please work ahead on everything below. It shortens that track; it does not block TS.

### 1. Correction to the C2_SEALED line (05:30Z)

TS resealed with source-only fixes:
- fm1 12: the PM operator can be deferred in the runtime manifest;
- fm1 13: the OKX binding schema now accepts the 22 typed reviewed keys;
- the deployed QDL binding r23 is now accepted.

The final image digest therefore changes again. TS will append `C2_SEALED r2` with the new rev and digest when the build
is attested.
- **The publication input `b1-r1` (`409542f4…`) is unchanged and still valid.** It holds no image digest.
- The signing release still stands: Core may sign B2 ONCE as soon as A2 is ready. Do not wait for `C2_SEALED r2`.

### 2. What Core can deliver now, ahead of full A2 (each item unblocks TS directly)

- **(a) Static PM-operator trust.** TS validates these exact fields
  (`services/portfolio_management/operator_configuration.py:225-243`):
  - `human_policies[]`: `issuer`, `audience`, `key_id`, `keyset_ref`, `keyset_sha256` (JWKS bytes), and
    `maximum_lifetime_seconds`;
  - `portal`: `origin`, `server_sha256` (DER pin), `ca_ref`, plus the issued mTLS client certificate for the TS CSR.
  - The TS side is already known: `source_issuer=ts.bobby-trading.c2-paper`, `source_key_id=ts-c2-src-g1`, SPKI in
    a1-r1.
  - Deliver the public parts as `portal-to-ts/a2-r1/`, or as an early partial `a2-static-r1/` with
    MANIFEST/SHA256SUMS. No private keys.
- **(b) The delegation and acceptance refs and the owner subject** (`PORTAL_DELEGATION_REF`, `PORTAL_ACCEPTANCE_REF`,
  `PORTAL_OWNER_SUBJECT`, `PORTAL_HUMAN_TRUST`).
- **(c) The B2 publication**, signed once with the P8 key pinned in A2.

### 3. Edge's own preparation (proposals only, no runtime change)

- **Facade re-point (C-1):** update the proposal so the Paper manager-read facade targets the new database
  `trading_system` on `live_data_executor`, read-only. TS will announce the window after C2 activation.
- **PG client facts for the TS TLS preflight:** for every Portal/Edge container that connects to
  `live_data_executor`, record the driver and version and the `sslmode` it uses. Paths and values only, never
  passwords.
  - TS already probed 4 legacy client images: asyncpg 0.31 negotiates TLSv1.3 with `prefer` after `ssl=on`.
  - Portal images not on that list need your facts.
- **Projection worker OOM:** Portal-owned. It is unrelated to C2. Keep `restart=no` until Portal deploys `8727e530`.

### 4. Portal track order on the TS side (for planning)

1. Core A2 + B2.
2. TS steps, in order:
   - 5.17 PRINCIPAL and 5.18 ROOT (with the `paper-root-g1` portfolio row);
   - operator registration;
   - 5.20 leaf provisioning, then G-REGISTRY;
   - 5.19 current-access import of the B2 publication;
   - BIND/FUND/GRANT.
3. The PM operator goes live.

## 2026-11-05T11:00Z — TS verification of a2-static-r1

Bundle: `portal-to-ts/a2-static-r1/`, MANIFEST sha256 `17aa02dd1a9470fcd7e0c6101dff518b73c7e55b9b42dc0de71786083db60541`.
Disposition stays **CANDIDATE_NOT_INSTALLED_NOT_A2**. This is a structural review, not acceptance, approval or activation.

### What TS ran (read-only)

- `sha256sum -c SHA256SUMS`: 6/6 OK. MANIFEST byte lengths and digests match the files.
- Private-material scan: no `PRIVATE KEY` PEM block and no JWK `d`. The bundle is public only.
- `openssl verify -CAfile portal-ca.pem`:
  - server cert with `-purpose sslserver -verify_ip 10.70.0.1`: OK;
  - client cert with `-purpose sslclient`: OK.
- `scripts/p184_support_portal_bundle_check.py a2 --a1 ts-to-portal/a1-r1`, at both `--ts-rev 3b28fbec` and `7be9428d`: **FAIL, as expected for a partial bundle**.
  - Failed checks: `BUNDLE_DIR_NAME`, `MANIFEST_SHAPE` (Portal schema, not `ts-portal.pm-authority-exchange.v1`), `publication-signer.jwk.json` and `acceptance-evidence.json` missing, `IDENTIFIERS_MISSING`, `ANSWERS_MISSING:O-1..O-4`.
  - The tool stops before its cert/JWKS stages on a partial A2. TS ran those checks by hand against `operator_configuration.py:225-243` at `7be9428d`; results are in the table below.

### Field-by-field against TS `operator_configuration.py:225-243` (7be9428d) and handoff r2

| TS field | Bundle value | Status |
|---|---|---|
| `human_policies[].issuer` | `NOT_SELECTED`, null | **missing** (`identifier()` refuses null) |
| `human_policies[].audience` | `NOT_SELECTED`, null | **missing** |
| `human_policies[].key_id` | `research-candidate-064b8dc9-…` (55 bytes) | present+valid structurally. The "research-candidate" kid must be confirmed as the installed key (see ask 3). |
| `human_policies[].keyset_ref` | `human-token-jwks.json` | present+valid (`filename()` rule) |
| `human_policies[].keyset_sha256` | `c2be5bf1…f35f25` = sha256 of the file bytes | present+valid |
| JWKS content (P1, `manager.py:623-645`) | 1 key: OKP/Ed25519/EdDSA, `use=sig`, x = 32 bytes, no `d`, kid equals `key_id` | present+valid |
| `human_policies[].maximum_lifetime_seconds` | Core field `maximum_token_lifetime_seconds` = 60, state `SOURCE_LIMIT_NOT_INSTALLED_POLICY` | present+valid as a value (≤60). TS maps it to `maximum_lifetime_seconds`; Core must confirm it as installed policy. |
| `portal.origin` | `https://10.70.0.1:28444` | present+valid for `_origin` (https, host, port, no path/query/userinfo). The listener is **not installed**. |
| `portal.server_sha256` | `fefa26e5…87012` (Core `server_leaf_der_sha256`) | present+valid: equals sha256(DER) of `portal-server-cert.pem`. The SAN `IP:10.70.0.1` matches the origin, EKU is serverAuth, and the cert is valid until 2027-05-04. |
| `portal.ca_ref` | `portal-ca.pem`, DER sha256 `4df8f126…5896` | present+valid: self-signed CA with pathlen 0, valid until 2028-11-04, issues both leaves. |
| `portal.client_cert_ref` (signed from the TS CSR) | `ts-mtls-client.crt.pem`, SPKI sha256 `6a016a6f…7df2` | present+valid. Details below. |
| `portal.client_key_ref`, `portal.source_private_key_ref` | (TS-side) | n/a for Portal. These are TS private files and stay on the TS side. |
| `portal.source_issuer` / `source_key_id` | (TS a1-r1: `ts.bobby-trading.c2-paper` / `ts-c2-src-g1`) | TS-known. Core must **register** them (see ask 4). |
| `portal.source_audience` | none | **missing** (P4, Portal assigns) |
| `portal.source_workload_id` | none | **missing** (P4/P6, Portal assigns) |
| Delegation / acceptance (P7): `owner_subject`, `acceptance_ref`, `delegation_ref` | all null, `NOT_AVAILABLE` | **missing** |
| P5 `authority_revision`, P6 `workspace_id`, `current_workload_ref` | none | **missing** |
| P8 `publication-signer.jwk.json` (+ `publication_signer_kid`, `_jwk_sha256`) | none | **missing** |
| O-1..O-4 answers | none | **missing** |
| Optional P2 sample token | none | not delivered (optional) |

Client certificate details:

- It carries the **TS CSR key**: the cert SPKI `6a016a6f…` equals the a1-r1 `ts-mtls-client.csr.pem` SPKI.
- Subject `CN=ts-c2-paper-pm-operator,O=bobby-trading,OU=ts-c2`, EKU clientAuth.
- Valid 2026-11-05 to 2027-05-04, 180 days, which meets the ≥120 days requirement.
- The SPKI `2932eb46…` in a1-r1 is the **source-proof Ed25519 key** (P4). It is not the CSR key, so no client cert is expected to carry it.

### Remaining asks to Core

**For full A2:**

1. P1 `issuer` and `audience`, final values. The issuer must also be the protected owner's `ts_users.issuer` (P5).
2. Installed listener at `origin` with routes ENTER/RESOLVE, TLS 1.3, serving exactly the pinned leaf `fefa26e5…`. A changed leaf means a new revision.
3. Confirm the human-token key `research-candidate-064b8dc9…` is the **installed** issuer key, and the 60 s lifetime is installed policy.
   - If the key is replaced, deliver a new JWKS. This changes `keyset_sha256`.
4. Register the P4 source: `source_issuer=ts.bobby-trading.c2-paper`, `source_key_id=ts-c2-src-g1`, SPKI `2932eb46…`. Then return `source_audience` and `source_workload_id`.
5. P5/P6: `owner_subject`, `authority_revision`, `workspace_id` (Paper), `current_workload_ref`.
6. P7: the genuine owner delegation and acceptance record (Phase A form, no `publication_sha256`), with the record ids/digests for `PORTAL_ACCEPTANCE_REF` and `PORTAL_DELEGATION_REF`.
7. P8: `publication-signer.jwk.json`, a separate Ed25519 key with a kid distinct from P1, plus `publication_signer_kid` and `publication_signer_jwk_sha256` in `identifiers.json`.
8. Answers to O-1..O-4.
9. Packaging as `portal-to-ts/a2-r1/`:
   - MANIFEST in `ts-portal.pm-authority-exchange.v1` form (direction `portal-to-ts`, step `a2`), or a `files` role table in `identifiers.json`;
   - flat `identifiers.json` keys as in a1-r1 `portal_to_fill`, plus `jwks_sha256` (handoff r2 §3).

**For B2 (after TS accepts A2):**

10. Compose from `b1-r1` (`409542f4…`, unchanged) plus the A2 values. Sign **once** with the A2-pinned P8 key, and deliver:
    - `publication.json`;
    - `.sha256`;
    - `.sig.json`;
    - final `acceptance-evidence.json` with `publication_sha256` (handoff P9, §5.2).

The static items (JWKS, CA, server pin, client cert) need **no re-delivery** in a2-r1 if their bytes are unchanged. Reuse the same files and digests.
