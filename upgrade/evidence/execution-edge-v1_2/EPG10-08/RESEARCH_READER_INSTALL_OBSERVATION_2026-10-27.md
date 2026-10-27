# Research reader — actual installation and source observation, 27 October 2026

**INSTALLED / SOURCE OBSERVED / CONNECTED NOT_MET.** Bobby explicitly approved
direct HK installation and the Research/Paper follow-through. The fixed
selection is [Core binding](CORE_TO_EDGE_RESEARCH_READER_BINDING_2026-10-27.md).

## Actual installed state

- Source DB `live_data_executor`, system `7674585245102796834`, container
  `08df6d6d79e3eef7a3981d57bb6e0979a36a42ff050d9883eda851dff1867feb`,
  image `sha256:6343bdc87ca132c6b53acb26113a6bad1821d188fa39975a745f32ddd9757634`.
- PM source `fb9a7ce759fac3bbea58d4d9886c8ed6fd30fe5f`, clean at start.
  Edge source candidate `68344dad9042860f561c11873096314b9a9b2f73`.
- Backup manifest `/home/bobby/secure/edge-research-reader-20261027-iaecH4H5/manifest.json`
  SHA256 `aa8965b8a22ef2b50aecc0c5110ad41af14f11045776c417ff8e5cab20830778`;
  retained privately. Installer atomically rechecked catalogue
  `fd4a84a99e8e04e9ef18afb2d708e75dfaf65a83ea8306cf921965527f3b1266`, source
  fingerprint and the exact reviewed inherited Timescale metadata pin
  `6635b6bad6a117d8ae995909456f4475a9b26a32dcbab325eea38807096b6308`.
- Rendered SQL SHA256 `49a8514ebaeb68aadea6ecaae93c675b4737f90f57ad416c524e4eecf8a59f1b`
  was checked again before it was piped to `psql` with `ON_ERROR_STOP`; the
  transaction committed successfully. It created only the approved owner role,
  reader role, private schema/accessor and exact additive grants. No business
  row, old role, stable grant, shared ACL, or command/Live was changed.
- Subsequent read-only installer verification passed. Actual PostgreSQL
  function-definition SHA256 `a2c1d8785313b34e033d53ae2609d166ffd505812fc0daf46a72e58f35291fc2`,
  actual body SHA256 `42b4f53114414c89d63e3fa87480e6ce2f6bf2c2aee65b1e6a23dc87383609f2`.
  The newly created login authenticated locally as itself. Catalogue OID
  privilege checks reported direct `SELECT` false on `public.ts_users` and
  `pm_membership.memberships`, accessor `EXECUTE` true. A first metadata check
  by text regclass failed on the deliberately absent membership-schema USAGE;
  it was replaced with the OID check, not relabelled as a pass.
- Existing inherited Timescale PUBLIC metadata and TEMP rights remain as
  explicitly reviewed; this is not a claim of zero effective PUBLIC privileges.

## Actual source result

Using the new reader login, the pinned no-selector accessor ran in a bounded
read-only repeatable-read transaction. Actual result: **ACTIVE mapping, zero
Paper membership heads, zero matching receipts**. An independent second source
observation was written owner-only at HK private reference
`/home/bobby/secure/core-research-observation-20261027-IDReX1uc/research-source-observation-36a05caf-bdfa-4728-adfe-718e76f1fa80.json`,
SHA256 `12f052c9a0f41fc075b6d4b6d00208c831afca6df8ab2744c8821965afa9f4a4`.
The private operator checked fixed identity/workspace/workload, source identity,
function-definition pin and successful transaction completion. It was tested
locally (2 tests); its source SHA256 is
`7e6426af082c682c2603c7f2081f9afe5e7b787d26250d141a597ca2e39961a1`.
This is a source accessor observation, not PM→Edge→Core, an accepted original,
or authority to issue a grant. Zero scoped heads means no original can be
qualified from this result; do not fabricate one or infer permission.

## Trust and next boundaries

Two fresh separate Research-only candidate trust bundles were generated on SGP
using the existing approved provisioner, one per intended hop. They are private,
not installed/transferred and do not create source authority. The transient CA
signing keys are retired by that provisioner. Actual endpoint/peer pins,
configuration and connected acceptance remain to be assembled and tested.

Source PostgreSQL currently reports `ssl=off`; its HBA allows local/loopback
trust and requires SCRAM on other hosts. The PM adapter rejects plaintext
non-loopback. Do not weaken that check, expose plaintext on a network, reuse
stable credentials, or share the protected source network namespace merely to
force a PASS. A properly scoped secure local/tunnel transport or source TLS is
needed before commissioning the PM listener.

Because the real scoped membership census is zero, ROOT/CURRENT and STREAM
cannot be registered or qualified from this observation. The source authority
owner must determine the official Paper `SET_MEMBERSHIP`/delegation path; no
insertion, new membership, accepted fact or grant was made here. Full08/read09,
browser and ELP2-10 remain OPEN. Rollback first disables only the new reader's
admission/accessor through the reviewed operator; preserve all source rows,
existing roles, audit, custody and this private observation.
