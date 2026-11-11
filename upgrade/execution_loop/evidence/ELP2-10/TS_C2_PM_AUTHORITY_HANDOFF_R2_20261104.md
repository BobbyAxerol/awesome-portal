# Portal Handoff: Genuine PM Authority for the TS C2 Paper Activation

Status: **READY TO SEND (owner)**. This is a request and an interface contract. It is not an owner approval, not an
accepted wire, and not an import input. Nothing in it is a value that TS may import.

| | |
|---|---|
| Date | 2026-11-04 |
| From | Trading System / PM, P18.4 C2 (support track, Claude). TS coordinator and sole integrator: Codex. |
| To | **Portal Core**: the agent/team that owns CORE-03 and the PM human/workload authority (current-human issuer, ENTER/RESOLVE, delegation, application/field acceptance). |
| Approver | The owner (Bobby, protected owner). Every pin below is approved by the owner, never by TS or Portal alone. |
| Replies to | CORE-03 in `awesome-portal` `upgrade/evidence/execution-edge-v1_2/EPG10-08/EDGE_TO_CORE_TS_PM_CONSOLIDATED_REQUEST_2026-10-22.md:79` (status there: OPEN, not OWNER_ACCEPTED). |
| Supersedes | The delivery (§4) and timing (§5) parts of `T4-portal-request.md` in this directory. Its field rules (§2) and refusals (§6) still apply and are repeated here. |
| TS code cited | Sealed C2 source **`3b28fbec`** (`integration/p184-c1-common-20261102`, worktree `/home/bobby/.worktrees/ts-p184-c1-common`). Every `file:line` below was re-read at that commit. |

## 0. Where to send this (Portal location)

The Portal Core source for CORE-03 is **not checked out on this host** (verified 2026-11-04):

| Candidate | Evidence | Role |
|---|---|---|
| **Portal Core, repo `awesome-portal`, `apps/control-api/src/execution-v2/current-human-*.ts`** (Core commit `6bf817f7a`; Core branch `chore/core-policy-wire-20261024` @ `c808a0de`, last seen at `/home/bobby/portal-core-policy-wire`, which no longer exists on this host) | `CORE_TO_EDGE_TS_PM_CONSOLIDATED_RETURN_2026-10-22.md:175-190` (issuer `current-human-candidate.ts:263`, ENTER `current-human-transport.ts:59-113`), `:1197` (Core checkout), `:2277` (CORE-03 → Core `6bf817f7a`). `git cat-file -t 6bf817f7a` fails in every local Portal worktree; no local worktree tracks `apps/control-api/src/execution-v2/`. The Portal plan places the full Portal on SGP (`EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md:106`). | **Primary recipient.** Owns the issuer, the lease routes and the acceptance. |
| Portal Edge coordinator: `/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2`, branch `feat/execution-edge-upgrade-v1_2` @ `636d58a7` | Holds the CORE-03 request, the Core returns and the Edge→Core disposition (`EPG10-08/EDGE_TO_CORE_TS_PM_CURRENT_INPUT_DISPOSITION_2026-10-22.md:22-40`). | Forwarding channel if the Core agent is not directly reachable. Edge does not sign. |
| `/home/bobby/.worktrees/portal-core-current-policy-wire-20261024`, branch `feat/core-current-policy-wire-20261024` @ `6c63d652` | Edge-side half of the Core policy-wire round (`:1197`); has no `execution-v2` Core sources. | Not the recipient. |
| `/home/bobby/.worktrees/portal-elp210-pm-provider-candidate` (`a03500ac`) | Remote is `ExecutorBroker` (the TS repo), not `awesome-portal`. | TS-side candidate, not Portal. |

**Owner action:** send this file to the Portal Core agent. If only the Edge coordinator is reachable, send it
there with the instruction "forward to Core, CORE-03".

## 1. Purpose and exact deliverables

TS needs genuine, current Portal authority so that the protected owner can run the C2 PM commissioning commands
on the new `trading_system` Paper database. TS accepts **no** fixture, `TEST_ONLY` value, synthetic PKI or the
expired Core009 trust. TS checks five inputs with five separate code paths (`T4-pm-authority-input-spec.md` §0).
Portal supplies its part of each one.

All deliverables are **public material or identifiers**. No private key, password, session secret or refresh
token ever crosses to TS (§4).

### P1. Human-token issuer and public JWKS (Phase A)

| Field | Requirement | TS check |
|---|---|---|
| `issuer` | Stable string, 1–128 bytes, no leading/trailing space, no control characters. **The same issuer is the protected owner's `ts_users.issuer`**: TS refuses a config whose human-policy issuers differ from the principal's issuer. | `operator_configuration.py:62-66,229-230`; `p184_c2_principal_policy.py:279-289` |
| `audience` | Same identifier rules. Must equal the token `aud` exactly (`strict_aud`). | `human.py:130-132` |
| `kid` | Same identifier rules. Must equal the token header `kid`. | `human.py:128` |
| JWKS file | JSON `{"keys":[…]}` containing **exactly one** key with that `kid`: `kty=OKP`, `crv=Ed25519`, `alg=EdDSA`, `use` absent or `sig`, string `x`, **no `d`**. | `manager.py:623-645` |
| JWKS sha256 | Lowercase 64-hex sha256 of the **exact file bytes**. TS refuses at startup if the mounted bytes differ. | `operator_bootstrap.py:765-766` |
| Environment / workspace | Paper only, one workspace (P6). | `operator_configuration.py:208`; `human.py:135` |

Do not reuse issuer `portal-control-api.native-manager-read` or its JWKS: the trust expired 2026-10-22T02:48:30Z and
its digests are hard-denied (`p184_c2_principal_policy.py:59-66`).

### P2. Human-token minting contract (live, one token per TS request)

Portal must mint a token **at the moment of each PM command**, for the exact TS request. A token cannot be issued in
advance.

- Header: `alg=EdDSA`, `typ=JWT`, `kid=<P1 kid>`, no `crit` (`human.py:127-129`; `portal_human_candidate.py:339`).
- Claims: **exactly these 16 and no others**: `iss, aud, sub, sid, jti, iat, nbf, exp, purpose, principal_kind,
  session_revision, authority_revision, workspace_id, environment, workload_id, request_digest`
  (`portal_human_candidate.py:336-338`).
- Values:
  - `purpose="pma.identity.v1"`, `principal_kind="human"` (`human.py:133`);
  - `environment="paper"`, `workspace_id=<P6 workspace_id>` (`human.py:135`);
  - `iat`, `nbf`, `exp`, `session_revision`, `authority_revision` are non-negative integers (`human.py:137-139`);
  - `iat == nbf < exp <= iat + 60` (`human.py:140`; `portal_human_candidate.py:340`). TS configures
    `maximum_lifetime_seconds` ≤ 60 (`operator_configuration.py:232`);
  - `workload_id` = the TS transport workload `source_workload_id` (P6) (`portal_human_candidate.py:341`);
  - `request_digest` = the string `sha256:<64 lowercase hex>` of the exact TS request, recomputed by TS (`portal_human_candidate.py:60-62,124,334,342,363`);
  - `sub` = the protected owner's subject (P5); `jti` unique per token (it becomes the lease id,
    `portal_human_transport.py:200`).
- Size: ≤ 8192 bytes on the lease transport (`portal_human_transport.py:26`). TS passes it as `Authorization:
  Bearer` (`scripts/p184_c2_commission_execution.py:406,414`).
- **`authority_revision` must equal the publication's `human_authority_revision` on every request**, or TS refuses
  with `CURRENT_ACCESS_EXTERNAL_REVISION_CHANGED` (`current_access_source.py:138`). See P5.

**Optional but recommended (Phase A):** one already-expired sample token from the real issuer, minted for
`request_digest = sha256("c2-portal-handoff-sample")`. TS checks its header, claim set and signature offline with
expiry ignored. A ≤60 s token that has already expired grants nothing.

### P3. Current-human lease endpoint, installed (Phase A)

| Item | Requirement | TS check |
|---|---|---|
| Routes | `POST /internal/elp210/current-human/enter` and `POST /internal/elp210/current-human/resolve` | `portal_human_transport.py:27-28` |
| ENTER request / ACK | Request `{"schema_version":"pma.current-human-enter.v1","human_token":…,"source_assertion":…}`. ACK must be **exactly** `{"schema_version":"pma.current-human-enter-ack.v1","lease_id":<human jti>,"attempt_id":<proof attempt_id>}` | `:198-210` |
| RESOLVE request / ACK | Request `{"schema_version":"pma.current-human-resolve.v1","source_assertion":…}` with phase `COMMITTED`, `ROLLED_BACK` or `UNKNOWN`. ACK must be **exactly** `{"replayed":<bool>,"phase":<same phase>}` | `:29,212-224` |
| HTTP | Status 200, `content-type: application/json`, body ≤ 32768 bytes | `:25,164,176-187` |
| `origin` | `https://host[:port]`, no path, query, fragment or userinfo, ASCII | `:50-63` |
| TLS | TLS 1.3 only, server certificate verified against the Portal CA with hostname check | `:41-47` |
| `server_sha256` | Lowercase hex sha256 of the **DER bytes of the Portal server leaf certificate**. TS compares it before sending data. A server-certificate rotation breaks the pin, so announce it as a new revision (§6). | `:114-118`; `operator_configuration.py:239` |
| mTLS CA | PEM of the CA that issued the Portal server certificate and that Portal uses to verify the TS client. Public only. | `operator_configuration.py:240-241`; `operator_bootstrap.py:153-166` |
| TS client certificate | **TS generates the key and a CSR** (P4). Portal signs the CSR and returns only the certificate. Validity ≥ 120 days (90-day window plus renewal margin). | same |
| Revocation behaviour | Confirm in writing: revoking the owner's session, application access or delegation changes `authority_revision` and makes ENTER and RESOLVE fail. | `T4-portal-request.md` §2.5 |

### P4. Source-proof key exchange (TS → Portal, Phase A)

TS signs a short-lived Ed25519 proof for every ENTER/RESOLVE. TS holds the private key; Portal never receives it.
TS sends to Portal:

| Field | Value |
|---|---|
| `source_issuer`, `source_key_id` | Chosen by TS, sent in the TS Phase A bundle (§3 step A1) |
| TS public key | Ed25519 public key (PEM `SubjectPublicKeyInfo` plus a JWK without `d`) and its sha256 |
| `source_audience` | **Portal names it**: the `aud` Portal expects on the proof |
| `source_workload_id` | **Portal assigns it** (P6): the `sub` of the proof and the `workload_id` of every human token |
| mTLS CSR | PKCS#10 CSR for the TS client certificate (P3) |

Portal must verify the proof as TS emits it (`portal_human_candidate.py:147-157`):
- header `alg=EdDSA`, `kid=source_key_id`, `typ=JWT`;
- claims `iss=source_issuer`, `aud=source_audience`, `sub=source_workload_id`, `jti`, `iat=nbf`, `exp` ≤ 60 s later
  (`:98-99,150`), `purpose="pma.current-human-lease.v1"`, `lease_id`, `attempt_id`, `workspace_id`, `environment`,
  `workload_id`, `request_digest`, `phase`, `source_receipt_id`, `source_receipt_digest`.

### P5. Principal identity (Phase A)

**D3 is decided: the protected owner is the only principal.** There is no acting second principal
(`p184_c2_principal_policy.py:134` `C2_PRINCIPAL_SINGLETON_OWNER_ONLY`).

| Field | Requirement |
|---|---|
| Owner `issuer` | = P1 `issuer` |
| Owner `subject` | Portal's stable subject for Bobby (protected owner): 1–512 bytes, no control characters (`p184_c2_principal_policy.py:140`). Identifier only, no secret. |
| `authority_revision` | The current integer. **Semantics to confirm:** it changes only when the owner's authority changes (grant, revoke, application or delegation change), never per login or per session refresh. Any change makes every TS request fail until a revision +1 publication carrying the new value is imported. |
| `session_revision` | Semantics only (TS does not compare it to the publication). |

TS binds `user_id = b2b70006-2373-4f10-b2d4-5e4c32af9204` to this issuer/subject pair at step 5.17 (§2).

### P6. Workspace and workload identifiers (Phase A)

| Field | Owner | Rule |
|---|---|---|
| `workspace_id` | Portal | The single Paper C2 workspace. Identifier, ≤128 bytes (`operator_configuration.py:141`). Same value in the token, the publication `head.workspace_id` and the TS config (`operator_bootstrap.py:772`; `current_access_source.py:128`). |
| `source_workload_id` | Portal | The TS transport workload, registered at Portal (P4). |
| `current_workload_ref` | Portal | The accepted-source workload that the delegation names. It becomes the publication `head.workload_ref` (`current_access_source.py:129`). It may differ from `source_workload_id`; TS checks the two separately (`operator_authority_binding.py:41-52,79-81`). |

### P7. Delegation and acceptance evidence (record in Phase A, final digest in Phase B)

TS's importer authenticates **only** the sha256 pin of the bytes. It does not verify grantor, delegation lineage or
any Portal signature (`current_access_installer.py:1-7,44`). The owner therefore approves the pin **only together
with this evidence** (finding F-T4-3). Portal delivers `acceptance-evidence.json`:

| Field | Content |
|---|---|
| `schema` | `portal.pm-current-access.acceptance-evidence.v1` |
| `acceptance_id` | Portal's stable acceptance id (same as publication `head.acceptance_id`) |
| `acceptance_record_digest` | sha256 of Portal's accepted record (the record, not the publication) |
| `delegation_id`, `delegation_record_digest` | The delegation from the protected owner to `current_workload_ref` |
| `grantor` | `{issuer, subject}` of the protected owner |
| `grantee_workload` | `current_workload_ref` and `source_workload_id` |
| `workspace_id`, `environment` | P6 value, `"paper"` |
| `application_revision` | Portal application-access revision |
| `authority_revision` | The value placed in `human_authority_revision` |
| `operations`, `fields`, `visibility`, `scopes` | Copied from the TS input file (§2) |
| `effective_from`, `expires_at` | As in the publication |
| `signer` | Name of the person and the service that approved it at Portal (Q-P2), plus the publication-signer `kid` (P8) |
| `publication_sha256` | Phase B only: sha256 of the publication bytes (P9) |

The evidence must be a Portal-side accepted record, not a "delivered" or "received" ACK
(`T4-portal-request.md` §6).

### P8. Publication-signer public key (Phase A)

A dedicated Ed25519 key, separate from the human-token key, signs the publication (P9). Portal delivers its public
JWK (`kty=OKP, crv=Ed25519, alg=EdDSA`, a `kid`, no `d`) and its sha256 **in Phase A**. The owner pins it before any
publication exists, so the key cannot arrive together with the bytes it vouches for.

### P9. Signed publication bytes (Phase B, signed **once**)

| File | Content |
|---|---|
| `publication.json` | The exact `pma.current-access.accepted-import.v1` bytes (§2.2) |
| `publication.json.sha256` | Lowercase 64-hex sha256 of those bytes |
| `publication.json.sig.json` | `{"schema":"portal.pm-current-access.publication-signature.v1","alg":"EdDSA","kid":<P8 kid>,"publication_sha256":<hex>,"signature":<base64url, no padding, of the pure Ed25519 (RFC 8032) signature over the exact publication.json bytes>,"signed_at":<UTC Z>}` |
| `acceptance-evidence.json` | P7, now including `publication_sha256` |

The signature is evidence for the owner's approval. The TS importer does not check it; it checks the sha256 pin
(`current_access_installer.py:44`).

## 2. Values TS provides

### 2.1 Fixed now

| Value | Fixed value | Source |
|---|---|---|
| `head.user_id` | **`b2b70006-2373-4f10-b2d4-5e4c32af9204`**: pinned before CREATE, generated by Claude 2026-11-04, approved by the owner, not secret. Recorded in `C2-PRINCIPAL-UUID.json`. | Owner decision D3; must be a canonical non-zero UUID (`p184_c2_principal_policy.py:115-121`; `current_access_installer.py:57-61`) |
| `head.environment`, scope `environment` | `"paper"` | `p184_c2_principal_policy.py:267-268`; `current_access_source.py:55` |
| `head.db_login` / `head.db_role` | `"ts_pm_operator"` / `"pm_scoped_writer"` (the operator's LOGIN/role, not the importer's) | Manifest s4.5; `current_access_installer.py:56,119-120`; `current_access_source.py:121-122` |
| `expected_version` / `head.version` | `0` / `1` for the first publication | `current_access_installer.py:62-64` |
| `document.field_revision` | `"pma-field-policy-20261016-r1"` (constant) | `current_access_source.py:50` |
| `document.visibility` / `fields` | `"BUSINESS"` / `["business_report"]` | `current_access_source.py:61-62` |
| `document.membership_policy_revision` | `1` (policy `v1`, `max_depth=1`; first revision). TS restates the value in the input file after the owner approves the principal-policy manifest. | Manifest s4.4; `current_access_installer.py:144-146`; `current_access_source.py:48,195` |
| `document.human_authority_revision` rule | Integer 0..2^53−1 = **Portal's current `authority_revision`** for the owner at signing. It must stay unchanged for the whole window. | `current_access_source.py:47-49,138` |
| `acceptance.revoked` | `false` | `p184_c2_principal_policy.py:267-268` |
| Window | `expires_at − effective_from ≤ 90 days` exactly; UTC with `Z` or `+00:00`; `effective_from < expires_at` | Owner D3; `p184_c2_principal_policy.py:269`; `current_access_installer.py:34-40,67-68` |
| Root grant | 1 year (`--expires-at` = activation + 365 d), written by TS at step 5.18. Portal does not write it, but its delegation should not end before the publication window. | Manifest 5.18 |

### 2.2 Publication: field-by-field ownership

Outer shape `{schema, expected_version, head{8}, acceptance{4}}`, no extra keys at any level, no duplicate keys, no
NaN/Infinity, ≤ 131072 bytes (`current_access_installer.py:19-21,24-29,42-53`). Every text field is non-empty, has no
leading/trailing whitespace, has no control characters and is ≤ 512 bytes (`membership_contract.py:50-53`).

| Path | Filled by | Value |
|---|---|---|
| `schema` | fixed | `pma.current-access.accepted-import.v1` |
| `expected_version` | TS input | `0` |
| `head.acceptance_id` | Portal | Stable across revisions |
| `head.user_id` | TS input | `b2b70006-2373-4f10-b2d4-5e4c32af9204` |
| `head.workspace_id` | Portal | P6 |
| `head.environment` | TS input | `paper` |
| `head.workload_ref` | Portal | P6 `current_workload_ref` |
| `head.db_login`, `head.db_role` | TS input | `ts_pm_operator`, `pm_scoped_writer` |
| `head.version` | TS input | `1` |
| `acceptance.effective_from` | Portal | Signing time, UTC `Z`, whole seconds |
| `acceptance.expires_at` | Portal | ≤ `effective_from` + 90 days |
| `acceptance.revoked` | TS input | `false` |
| `document.human_authority_revision` | Portal | P5 current `authority_revision` |
| `document.membership_policy_revision` | TS input | `1` |
| `document.application_revision` | Portal | Application-access revision (P7) |
| `document.field_revision` | TS input | `pma-field-policy-20261016-r1` |
| `document.acceptance_ref` | Portal | Opaque: acceptance record id plus `acceptance_record_digest` |
| `document.delegation_ref` | Portal | Opaque: delegation id. It becomes `WorkloadAccess.delegation_ref` (`current_access_source.py:139-140`) |
| `document.scopes` | **TS input, copied verbatim** | Root plus every registered portfolio (§2.3) |
| `document.operations` | TS input, copied verbatim | Proposed `["READ","HISTORY"]` (`T4-portal-request.md` §1). Only READ/HISTORY/EXPORT/STREAM are allowed; command operations are refused (`current_access_source.py:56-59`) |
| `document.visibility`, `fields` | TS input | `BUSINESS`, `["business_report"]` |
| `document.physical_refs` | TS input | `[]` (Q-P6) |

**Canonical bytes (mandatory).** Portal serialises exactly as the TS renderer does
(`scripts/pma11_current_access_import.py:81-82`), with no trailing newline:

```python
json.dumps(doc, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False).encode("ascii")
```

TS re-serialises the parsed document and refuses the bytes if the result differs.

**Forbidden content in any string** of `head` or `acceptance` (code-enforced; `p184_c2_principal_policy.py:59-89,266`):
- the substrings `test_only`/`test-only`, `fixture`, `placeholder`, `changeme`, `replace_me`/`replace-me`, any
  `<…>` and any `${…}`, in any case;
- the whole values `tbd`, `todo`, `dummy`, `example`, `none`, `null`, `n/a`, `unset`, `acceptance_ref`, `delegation_ref`,
  `publication`, `delegation`, `ref`;
- a 64-hex string of one repeated character; the zero UUID;
- the revoked Core009 metadata: acceptance `b922c105-…`, digests `43506806…`, `e28b9e32…`, `d54296c2…`, and the
  timestamp `2026-10-22T02:48:30Z`.

### 2.3 Scope list source

- `scopes` = `[{portfolio_id: ROOT_ID, environment: "paper"}]` **plus** every registered portfolio ID the operator
  acts on (the registered portfolio IDs from TS B1; currently one, `paper-portfolio-g1`, with four D1 leaves under it), deduplicated and sorted by `(portfolio_id, environment)`, as the renderer sorts them
  (`scripts/pma11_current_access_import.py:99`).
- There are **no** leaf, account, deployment or instance IDs. A D1 logical leaf is a `DEPLOYMENT_ACCOUNT` under its
  portfolio and is scoped by that portfolio (`operator_adapters.py:376,383,404-406`). ROOT operations need every
  registered portfolio scope (`paper_capital_authority.py:194-218`). The root entry alone does not cover its
  children (manifest s4.5).
- **Status:** `ROOT_ID` and `PORTFOLIO_ID_1..4` are **not yet produced**. The FILLED r1 manifest lists them as open
  Codex placeholders (`JOURNAL.md:1932`); no item30/item32 output under
  `/home/bobby/.local/state/trading-system/p184-c1-common-20261102/c2c3-coordination-20261104/` contains them
  (`section5-values-collected-r1.json` keys checked). They are owner-approved intents fixed **before CREATE**, so
  they exist before Portal signs.
- **Portal never chooses or edits scopes.** Portal copies `scopes`, `operations`, `fields` and `physical_refs`
  byte-for-byte from the TS input file (§3 step B1).

### 2.4 Not Portal's

Two other manifest placeholders are not Portal deliverables. Portal does nothing with them:
- `PH:WORKLOAD_APPROVAL_REF` is the owner's approval of the section 5 manifest (`S0-measurement-contract-c2.md:168`).
- `QDL_BINDING_REVISION` is the Data Layer binding (`r23` or `r29`), an owner/Codex decision.

## 3. Sequence and timing

The source seal has happened (`3b28fbec`). The operational seal (section 5 manifest) has not. Import is manifest
step **5.19 ACCEPTED_ACCESS**, after 5.17 PRINCIPAL_POLICY, 5.18 ROOT_AUTHORITY and 5.18a.

| Step | Who | What | When |
|---|---|---|---|
| **A1** | TS (Codex) | Generate the TS source-proof Ed25519 keypair and the mTLS client key + CSR, locally on the TS host. Send to Portal: `source_issuer`, `source_key_id`, the public key + sha256, the CSR, and the pinned `user_id`. | Now |
| **A2** | Portal | Deliver P1, P3 (origin, server pin, CA, signed client certificate), P4 registration (`source_audience`, `source_workload_id`), P5, P6, P8, the P7 record (without `publication_sha256`), and optionally the P2 sample token. | Now. Nothing here depends on a C2 value. |
| **A3** | TS | Run checks §5.1. On PASS, Codex fills `PORTAL_ISSUER`, `PORTAL_OWNER_SUBJECT`, `PORTAL_HUMAN_TRUST` and prepares the principal-policy manifest (`prepare`, manifest s4.4 step 2); the owner approves its sha. | Before the operational seal |
| **B1** | TS (Codex) | Once `ROOT_ID`/`PORTFOLIO_ID_1..4` and the policy revision are fixed, send `c2-publication-input.json` (schema `ts.c2.pm-current-access-publication-input.v1`) with every "TS input" value of §2.2, its sha256, and a note that the owner approved it. | After the scope intents are sealed, before CREATE |
| **B2** | Portal | Compose the publication from B1 plus Portal values, serialise canonically, sign **once** with P8, and deliver P9 + the final P7. | Within one working day of B1, and before step 5.19 |
| **B3** | TS | Run checks §5.2. The owner approves `GENUINE_PORTAL_PUBLICATION_SHA256` together with P7 (F-T4-3). Codex fills the pin plus `PORTAL_ACCEPTANCE_REF`/`PORTAL_DELEGATION_REF`. | Before the operational seal |
| **C1** | TS | Manifest steps 5.10 → 5.19: CREATE, PRINCIPAL_POLICY with the pinned UUID, ROOT_AUTHORITY, then the importer: status (`ABSENT`) → `--apply` → status (`IMPORTED`, `historical_revision=false`). | C2.4 execution |
| **C2** | Portal + owner | Issuer and ENTER/RESOLVE **live** during 5.20–5.21 (4 wallets × 8 stages = 40 commands, one live token each). An outage stops the stage, which is safe; TS substitutes nothing. | C2.4 and C2.5 windows; TS announces the window |

The window starts at signing (B2). `effective_from` must be ≤ the time of import and of every request
(`current_access_source.py:137`). If B2 → C1 is long, the usable C2 period shrinks; renew (§6) rather than re-sign
with a future `effective_from`.

## 4. Delivery path and format

**Exchange root on the TS host** (outside Git; created by TS before A1):
`/home/bobby/.local/state/trading-system/p184-c2-portal-pm-authority/`

```text
ts-to-portal/a1-r1/         TS public key, CSR, identifiers, user_id      (TS writes)
ts-to-portal/b1-r1/         c2-publication-input.json                     (TS writes)
portal-to-ts/a2-r1/         P1 JWKS, P3 CA/server-cert/client-cert, P4-P8 (Portal writes)
portal-to-ts/b2-r1/         publication.json, .sha256, .sig.json, acceptance-evidence.json
```

- Each directory has a `MANIFEST.json`: `{schema:"ts-portal.pm-authority-exchange.v1", direction, step, revision,
  produced_by, produced_utc, files:[{path, bytes, sha256}]}`. It also has `SHA256SUMS` in `sha256sum` format.
  Directories are write-once: a correction is a new `-r2` directory, never an overwrite.
- If the Portal agent cannot write to this host, Portal hands the bundle to the owner, who copies it into place.
  TS verifies the manifest either way. Files are listed with sha256 so that any copy can be checked.
- Identifier answers (issuer, audience, kid, subject, workspace, workload ids, revisions, origin) go in one
  `identifiers.json` in `a2-r1`, not in prose.
- **Never sent to TS:** the Portal human-token private key, the publication-signer private key, the CA private key,
  any password, session or refresh token, DSN or cookie.
- **Never sent to Portal:** the TS source-proof private key, the TS mTLS client private key, any DB password.
- **Portal never writes TS state:** no SQL, no TS table row, no grant copy, no TS config file (CORE-03 "do not
  self-install TS rows"). Codex copies public material onto the operator materials mount, and TS records it as
  path + sha256 only (`scripts/p184_c2_commission.py:387-391`).

## 5. Acceptance checks TS will run, and what TS rejects

### 5.1 Phase A (offline, `python3 -B` in a scratch interpreter; no DB, no runtime)

1. The `MANIFEST.json` and `SHA256SUMS` match every file.
2. The JWKS loads through `HumanTrustPolicy` + `HumanVerifier` (`manager.py:623-645`): one key for `kid`, OKP/Ed25519/
   EdDSA, no `d`. Its sha256 is recorded as `keyset_sha256`.
3. The P8 publication-signer JWK passes the same structural rule and has a different `kid` from P1.
4. Identifiers pass `identifier()` (≤128 bytes) and the deny list. Issuer/subject pass `_identity_text`.
5. `origin` passes `_origin` (`portal_human_transport.py:50-63`). `server_sha256` equals the sha256 of the delivered
   server-certificate DER. The certificate chains to the delivered CA, and its SAN matches the origin host.
6. The client certificate chains to the CA, matches the TS CSR public key and is valid ≥ 120 days.
7. The optional sample token: exact 16-claim set, header, signature by the P1 key, `iat==nbf`, life ≤ 60 s,
   `workspace_id`/`environment`/`workload_id` as delivered.
8. Then the rendered operator configs pass `validate_production_configuration` (`p184_c2_principal_policy.py:279-289`)
   and `prepare_manifest`/`validate_manifest` (manifest s5 checks 2-3 in `T4-pm-authority-input-spec.md` §5).

A read-only TLS 1.3 handshake to `origin`, with the pin check and no ENTER, runs only inside an owner-approved
window.

### 5.2 Phase B (offline)

1. `sha256(publication.json)` equals `.sha256` and `sig.json.publication_sha256`. The Ed25519 signature verifies
   under the **Phase A-pinned** P8 key.
2. Canonical form: re-serialising (§2.2) gives identical bytes.
3. `decode(raw, pin, scope_limit)` passes (`current_access_installer.py:42-69`).
4. `validate_production_publication(raw, approved_sha256=pin, scope_limit=…, principal_policy=<approved
   manifest>)` passes. It checks the deny list, Paper, `revoked=false`, the window ≤ 90 days, and
   `user_id`/`membership_policy_revision` equal to the approved principal policy (`p184_c2_principal_policy.py:261-276`).
5. Every TS-input field equals the B1 file byte for byte. `scopes` covers the root and every registered portfolio listed in B1 (currently one portfolio; leaves are not scope entries).
6. `workspace_id`/`workload_ref` equal the Phase A values. `human_authority_revision` equals the P5 value and the
   P7 `authority_revision`. `acceptance_ref`/`delegation_ref` name the P7 record ids and digests.
7. Manual review: no fixture capital amounts (20000/15000/10000), no `human_authority_revision=7`, no historical IDs.

### 5.3 Installed (manifest 5.19 and 5.21)

- The importer status is `ABSENT`, then `IMPORTED` after `--apply`, and `AcceptedAccess` reports `CURRENT_IMPORTED`
  (`T4-pm-authority-input-spec.md` §5 steps 4-5).
- The first live command of 5.21 proves the token, ENTER and RESOLVE end to end.

### 5.4 TS rejects

| Case | Where |
|---|---|
| Bytes that differ from the approved pin | `CURRENT_IMPORT_UNAPPROVED_BYTES` (`current_access_installer.py:44`) |
| Extra or missing key, duplicate key, NaN, > 131072 bytes | `CURRENT_IMPORT_DOCUMENT_INVALID`/`_DUPLICATE_FIELD`/`_BYTE_LIMIT` (`:24-29,43-53`) |
| Non-UTC time, or `effective_from ≥ expires_at` | `CURRENT_IMPORT_UTC_REQUIRED`/`_INTERVAL_INVALID` (`:34-40,68`) |
| Window > 90 days, `revoked=true`, or not Paper | `C2_PRODUCTION_PUBLICATION_WINDOW`/`_CURRENT_PAPER_PUBLICATION_REQUIRED` (`p184_c2_principal_policy.py:267-269`) |
| `user_id` or policy revision that differs from the approved principal policy | `C2_PRODUCTION_PUBLICATION_PRINCIPAL_POLICY_CHANGED` (`:270-275`); `CURRENT_IMPORT_USER_UNAVAILABLE`/`_POLICY_CHANGED` (`current_access_installer.py:126,142,146`) |
| Fixture, placeholder or Core009 content | `C2_PRODUCTION_FIXTURE_OR_PLACEHOLDER`/`_REVOKED_CORE009_METADATA` (`p184_c2_principal_policy.py:76-89`) |
| Another `field_revision`; bad scopes; command operations; BUSINESS fields other than `business_report` | `current_access_source.py:50-62` |
| Same version with different bytes | `CURRENT_IMPORT_REPLAY_CONFLICT` (`current_access_installer.py:140`) |
| Token: wrong alg/kid, `crit`, purpose, workspace/environment, lifetime > 60 s, an extra or missing claim, wrong `workload_id`/`request_digest` | `human.py:127-141`; `portal_human_candidate.py:336-343` |
| Token `authority_revision` ≠ publication | `CURRENT_ACCESS_EXTERNAL_REVISION_CHANGED` (`current_access_source.py:138`) |
| JWKS with `d`, non-Ed25519, or more than one key for the `kid` | `MANAGER_JWT_JWKS_REJECTED` (`manager.py:630-641`) |
| An ENTER/RESOLVE ACK that is not exactly the specified object; non-200; wrong content type; body > 32 KiB; TLS < 1.3; pin mismatch | `portal_human_transport.py:114-118,164-187,207-223` |
| Review rules: a signature by a key not pinned in Phase A; a "delivered/received" ACK offered as acceptance; a locally computed hash offered as approval; inline secrets; Sandbox/Live/open-ended scope; `business.read_all` or heartbeat grants offered as financial commissioning; the expired Core009 issuer/acceptance/manifest | `T4-portal-request.md` §6 |

## 6. Renewal, rotation and revocation

**Renewal (every 90 days).**
1. At least 14 days before `expires_at`, TS sends `ts-to-portal/renew-<N+1>/c2-publication-input.json` with
   `expected_version=N`, `head.version=N+1` and the same `acceptance_id`. Scopes change only if TS added portfolios.
2. Portal re-checks that the delegation is current, composes, signs once with P8 and delivers
   `portal-to-ts/renew-<N+1>/`. It uses a fresh `effective_from`, `expires_at` ≤ +90 days, and the current
   `authority_revision`.
3. TS runs §5.2. The owner approves the new sha. TS imports it as revision N+1 with the same CLI. No operator
   restart is needed; the revision applies on the next request (`scripts/pma11_current_access_import.py:1-14`).
4. TS can also produce the next bytes offline with `render --expires-at` (`:85-109`). If it does, Portal signs those
   exact TS bytes instead of composing them. Either way there is one signature per revision.

**Change of `authority_revision`.** Any change (for example a re-grant) breaks every TS request until a revision
+1 with the new value is imported. Portal tells TS before such a change, and follows the renewal steps.

**Key or certificate rotation** (human-token key, server certificate, CA, client certificate). Portal announces it
as a new `a2-rN` bundle **before** the old one is retired. The TS operator reads the JWKS and TLS material at startup
(`operator_bootstrap.py:755-777`), so a rotation needs an owner-approved TS config revision and an operator
lifespan restart (*unverified:* the exact restart scope is Codex's to state).

**Revocation on incident.**
- Portal side (primary, immediate). Revoke the delegation, application or session. `authority_revision` changes
  and ENTER/RESOLVE fail, so TS refuses at once (`HUMAN_ACCESS_REVOKED_OR_UNKNOWN` /
  `CURRENT_ACCESS_EXTERNAL_REVISION_CHANGED`).
- Portal then notifies the owner and TS with the time, the reason and the new revision.
- TS side. The owner may stop the PM operator. TS may also import a `revoked=true` revision +1; a revoked revision
  never re-authorizes (`current_access_source.py:131`). *Unverified:* the C2 production guard refuses
  `revoked=true` (`p184_c2_principal_policy.py:267-268`), so a TS-side revocation import needs a Codex-defined path.
  Portal-side revocation does not depend on it.

## 7. Ownership, open questions and the message to send

| Party | Owns |
|---|---|
| Owner (Bobby) | All approvals: principal UUID (done), principal-policy sha, B1 input file, publication sha + evidence, windows, every rotation and renewal |
| Portal Core (CORE-03) | P1–P9; live issuer and lease routes during C2; revocation; renewals |
| Portal Edge coordinator (`feat/execution-edge-upgrade-v1_2`) | Forwarding only, if Core is not reachable directly |
| TS coordinator: Codex (`/home/bobby/.worktrees/ts-p184-c1-common`, `integration/p184-c1-common-20261102`) | A1, A3, B1, B3, C1; TS materials mount; manifest fill |
| TS support: Claude (`/home/bobby/.worktrees/ts-p184-c2c3-support`, `integration/p184-c2c3-support-20261104`) | This handoff and the input spec; no runtime |

**Questions Portal answers in `a2-r1/identifiers.json`:**
- **O-1.** The owner-facing mint path. How the TS `request_digest` for each of the 40 commands reaches the Portal
  issuer (`current-human-candidate.ts:263` per the Core return), and how the minted token reaches the TS commission
  tool. TS needs the token within its ≤60 s life.
- **O-2.** `authority_revision` semantics (P5): exactly which events change it.
- **O-3.** The Portal person and service that sign the acceptance and the publication (Q-P2).
- **O-4.** The Core repo/branch/commit that serves the installed ENTER/RESOLVE routes and the issuer. The return must
  say installed, not candidate.

**Unverified (E2).**
- Portal's installed state: issuer, JWKS, routes. No Portal runtime was queried, and the Core sources are not on
  this host.
- That Portal accepts a pre-pinned TS `user_id` (manifest s9).
- The exact `request_digest` derivation is TS-internal. Portal treats it as an opaque `sha256:<64hex>` string.

**Ready-to-paste message for the owner (to the Portal Core agent):**

```text
CORE-03 / TS C2 Paper: genuine PM authority handoff. Please deliver per the file below, no back-and-forth needed.
File (TS host): /home/bobby/.worktrees/ts-p184-c2c3-support/upgrade/c2c3-support/PORTAL_HANDOFF_PM_AUTHORITY_20261104.md
Owner decisions (fixed): protected owner is the ONLY principal; TS user_id = b2b70006-2373-4f10-b2d4-5e4c32af9204
(pinned, not secret); publication window <= 90 days, renew as revision +1; root grant 1 year (TS side);
TEST_ONLY/fixture/Core009 values are refused; contract pma.current-access.accepted-import.v1 unchanged in C2/C3.
NOW (Phase A, section 3 A2): issuer/aud/kid + public Ed25519 JWKS (+sha256), installed current-human ENTER/RESOLVE
origin + server-cert DER sha256 + CA + client cert signed from the TS CSR, source-proof registration of the TS public
key (source_audience, source_workload_id), owner issuer/subject + authority_revision semantics, workspace_id and
current_workload_ref, delegation/acceptance record, publication-signer PUBLIC key; answer O-1..O-4.
LATER (Phase B): when TS sends c2-publication-input.json (scopes = root + registered portfolios), compose the
publication in canonical JSON, sign ONCE (Ed25519, pinned signer), deliver bytes + sha256 + sig + evidence before
TS import step 5.19.
Deliver into /home/bobby/.local/state/trading-system/p184-c2-portal-pm-authority/portal-to-ts/<step>-r1/ with
MANIFEST.json + SHA256SUMS (or give the bundle to me to copy). Never send private keys, passwords or session secrets;
never write TS rows. Keep issuer + routes live during the C2 commissioning window.
```

## Revision r2 (2026-11-04): corrections before sending

1. **`request_digest` format.** It is `sha256:<64 lowercase hex>`, not a bare 64-hex value
   (`portal_human_candidate.py:60-62,124,334,342`).
2. **Scopes.** The scopes are the root plus every **registered portfolio** in TS's B1 file. Codex's
   current intent values give root `paper-root-g1` and portfolio `paper-portfolio-g1`. The four
   D1 leaves (one per physical wallet) sit under that portfolio and are **not** scope entries,
   per T4 Q-T4-5. Portal signs over whatever B1 lists.
3. **A2 file names.** TS's verifier (`scripts/p184_support_portal_bundle_check.py a2`) expects
   these default names in `portal-to-ts/a2-r1/`:

   | Content | File name |
   |---|---|
   | P1 JWKS | `human-token-jwks.json` |
   | P3 server certificate | `portal-server-cert.pem` |
   | P3 CA | `portal-ca.pem` |
   | P3 client certificate signed from the TS CSR | `ts-mtls-client.crt.pem` |
   | P8 publication signer (public) | `publication-signer.jwk.json` |
   | P7 evidence | `acceptance-evidence.json` |
   | Optional expired sample token | `sample-token.jwt` |

   Plus `identifiers.json`, `MANIFEST.json` and `SHA256SUMS`.
   - `identifiers.json` must also carry `jwks_sha256`, `publication_signer_kid`,
     `publication_signer_jwk_sha256` and the O-1..O-4 answers.
   - Portal may instead declare a `files` table in `identifiers.json` that maps each role to its
     file name.

