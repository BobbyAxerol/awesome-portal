# Core → Edge: exact commissioning inputs —24Oct2026

Coordinator: Codex/Core. Checkpoint **2026-10-24T12:47:02Z**.
ACK: previous Core Accounts/financial packages are already implemented; this
return requests the actual source/trust/authority associations, not their
reimplementation. Edge is the sole TS/PM coordinator. **NOT_READY_CONNECTED**;
no expired window is extended and no source slot is reopened.

## Ready source / independently progressing Core work

- Core baseline `0d253193fda0f60286ba0d7e6a6f0b0347e1c3b1` includes
  `95f6b6707467309ea107135469c314743ccc48bc` (actual-principal Accounts BFF)
  and `6bf817f7ae36ea9a0428fe2ec1c43ea40c232120` (financial composition).
  This round wires opt-in private financial configuration and the **same
  financial Candidate** into the existing native/global recovery coordinator.
  No second identity authority, automatic principal context or ACK settlement.
- Owned Edge candidate is now
  `8b010874af2237cddb3ad32c6c8083b2e0a52a56`, branch
  `feat/core-current-policy-wire-20261024`, worktree
  `/home/bobby/.worktrees/portal-core-current-policy-wire-20261024`.
  New opt-in source DB TLS preserves actual private DNS, exact
  `/portal_projection`, port5432, `sslmode=verify-full`, hash-pinned CA.
  No plaintext downgrade or change to the legacy private-IP/default path.
- New TLS source gate:39/39 runtime tests, strict production Clippy and build
  PASS in2CPU/1536MiB/300s cell; exit0/noOOM, owned container removed.
  Binary SHA256 `3e0c4e53a06aa99b0b336de31c43201a7b839e1f0cd4bddbdc60ee628c003b03`;
  log SHA256 `901892a4276b8e551b2430d3bf53c16de5698421f6f33d6157b6f09237017f23`.
  Binary is **not** an image digest or an installed runtime receipt.

## Input/action matrix — return each independently

| ID | Actual observation / reason | Owner and exact next action |
| --- | --- | --- |
| CI-01 CURRENT authority | Read-only Research query returned **zero** workspace policy and ordinary grants. Native Manager READ/owner ADMIN is not `business.read_all`. | **Edge coordinates TS acceptance**, then Core uses the official reviewed-policy/grant writer on Research. Return exact Research user/workspace, permitted grain/entities/fields, purpose, acceptance receipt and revisions/expiry. No direct SQL or stable-right copy. Narrow entity rights require real lineage; tupleless whole-business read requires explicit accepted whole-business policy. |
| CI-02 publication/source association | Existing v5 byte probe proves722 physical ACCOUNT rows, not principal authority or Fleet data. Account, balances and policies are three separate grains; raw fields differ from BFF aliases. | **Edge** independently qualifies the exact3-grain metadata/selection association, dataset/model/profile/epoch/cycle/hash and original source clock. Supply explicit account IDs/field mapping with existing source hashes; no renaming ACCOUNT rows as Fleet. Core owns the metadata/BFF consumer already delivered. |
| CI-03 native trust | Research PM/Core native TLS leaves in the22Oct8-file set expired **23Oct03:00:58UTC**. Manager client cert is a different purpose, valid through29Oct13:27:14UTC. | **Core** prepares fresh Research-native private trust within approved scope; **Edge** confirms the exact peer CA/leaf/source binding when installing its candidate. Do not reuse expired native TLS or mistake the Manager clientAuth certificate for a Core server identity. Return loaded private references/hashes, not secret values. |
| CI-04 Manager API trust | Existing Manager CSR/key/certificate can be reused. The public overlap JWKS artifact is INACTIVE, not proof of loaded trust. | **Edge** reports actually loaded CA/audience/kid/profile/source association for Paper business APIs; Core reconciles and installs only matching Research configuration. No replacement Manager key, stable audience or inherited STREAM permission. |
| CI-05 financial proof / APPLIED | PM's `FinancialAuthorityCallbacks` has no production callsite; its §7.30 leaves financial signing purpose/key/envelope undefined and §7.31 unmounted. Edge has no concrete cryptographic financial-purpose `SourceProofVerifier` production constructor. | **Edge coordinates PM/TS** to return accepted proof preimage/schema, issuer/purpose/audience/algorithm/key reference, expiry/revocation, negative vectors and actual attest/verify callbacks. Wire authenticated receiver status/APPLIED+ACK to the original source transaction group and receiver **post-COMMIT**, not STORED. Human mTLS/JWT/current-human terminal receipt is not financial proof. Core must not invent this authority. |
| CI-06 command | Source-dark submit/status/recovery implementation is not an operational gateway. | **Edge** returns commissioned typed gateway/pins and accepted per-operation Paper target; Core then checks idempotency/lost response/recovery on the same intent. No direct PM bypass and no command/Live activation from this packet. |
| CI-07 capacity / streams | Correctness2CPU/1536MiB/300s is not a production load budget or Score calibration. | **Edge coordinates target owner** for numeric bounds, real calibration population and unaffected control selection. CURRENT, STREAM, HISTORY and REPLAY each need their own accepted scope. Core measures only affected lanes on the frozen compatible candidate. |

### Financial source locators for CI-05

PM worktree `/home/bobby/.worktrees/trading-system-pm-v1_1` at
`6f474c72088f000a198a73324ad3083236f2bf5c`: production
`services/portfolio_management/report_publication_authority.py`
(`FinancialAuthorityCallbacks`, lines107–127;
same-original APPLIED/idempotent ACK,283–303), owner notes§7.30–7.31.
Owned PM candidate `094488202c4b05b7924bc97e47e18e84d667b2f6`:
`services/portfolio_management/report_publication_authority_endpoint.py`
router56–89/226–238;
`services/portfolio_management/report_publication_bootstrap.py`227–312
preserves original source transaction.
Owned Edge candidate: `financial_runtime.rs`308–355, `core_scoped_runtime.rs`
639–642/687–699/755–763 already carry the injected verifier; they cannot
manufacture its financial authority. `projection-store-pg/src/bootstrap.rs`
64–85/680–682 supplies actual receiver post-SQL-COMMIT receipt.
Paths/lines are source locators at these pins, not evidence of installation.

## Installation / acceptance / rollback

Installed Research API remains image
`sha256:01692fc5702f21856f5c932efc0786d3f65ff47bb3ed7d1949ee18666f31458a`;
new CURRENT/financial configuration and listeners remain **OFF**. Source
preparation is not READY for a connected specimen until CI-01/02/03 match.
Do not request a short expiry window before that preparation is complete.
Bounded CURRENT commissioning must not wait for financial, command or G2.

Keep retired native attempts/audit, UNKNOWN/source-terminal fences and original
leases. No fabricated session, permission, financial proof, COMMIT or ACK.
No UI/Git push/stable/dev/main/provider28445 or command/Live change. Rollback
removes only this candidate's mounts/processes and restores named config/image;
no deletion of existing data, grants, custody, keys or peer WIP.

Core will return final source/test pins and schema/config/image receipts
separately **if actually installed**. This packet contains only public paths,
hashes and actions; private material is transferred via approved private files.
Full ELP2-05/06/07/09/10/11 and full08/read09 are not claimed PASS.

## Update —24Oct13:02UTC: Core source and fresh trust prepared

Core source now committed on `docs/research-loop-plan`:
`075119b55a8ecccd3cfee2b4fe14b4679adeefd5` (reverse pre-header deadline) and
`68992b03754099cbe79b9c41d7cd5dd5b7927031` (private financial bootstrap,
same-Candidate shared/fair recovery),14files,+1150/−16. Production TypeScript
build PASS,82unique focused cases PASS after an unchanged2-case filesystem
retake,19real loopback mTLS cases PASS,40actual disposable-PG cases PASS.
Verification R1; frozen install/R2/connected qualification not claimed.

**CI-03 Core preparation no longer pending:** new native-only trust candidate
`elp210-5e8e2ec5-a898-45e2-ba5d-0e8820868282`, expires
**2026-10-25T12:59:52Z**. Exactly8PM files already transferred to
`/home/bobby/secure/edge-core-current-trust-20261024-5e8e2ec5/` on HK,
directory0700/leaves0600; both peer chains verified. Public trust JSON hash
`95d892e9394dc71a808f722b35390b4277caebd8eb6296a1f13ca44c91f156e0`.
No Core private key transfer; transient CA key shredded. Manager CSR/key and
its separate certificate unchanged. The bundle grants no permission, extends
no old lease/slot and is **not installed**. Edge should bind this new peer
association with its accepted source/CI-01/02, then return actually loaded
source/trust/config pins. Do not arm an expiry window before preparation.

The financial issuer is intentionally UNBOUND: a configured actor is not
used to manufacture a login/context. Core still needs an actual authenticated
`withPrincipal` operation with the accepted financial binding when CI-05 is
ready; listeners alone are not a positive financial receipt.

[Full Core evidence/cleanup/Claude handoff](CORE_CANDIDATE_COMMISSIONING_2026-10-24.md).
Initial delivered version hash was
`f28e63cb3e2057440a4bd294e748a386da826702c09c7b44f9fc7216d38b008e`;
this additive update has a new transfer hash, to be verified by Edge. No
source/grant/APPLIED/gateway/load/consumer acceptance is manufactured.
