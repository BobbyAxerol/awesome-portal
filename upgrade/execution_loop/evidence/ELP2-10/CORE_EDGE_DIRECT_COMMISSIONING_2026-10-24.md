# Direct Core ↔ Edge commissioning — 24 October 2026

## Scope and actual result

Bobby requested direct SSH implementation/commissioning on HK, not another
request-only round. This follows [the preceding source receipt](CORE_CANDIDATE_COMMISSIONING_2026-10-24.md).
Primary integrated the isolated Research candidates; three existing helpers
handled disjoint source preparation, financial implementation and independent
review. No frontend, remote Git push, stable/dev/main, provider28445, command
or Live change. No permissions were inferred from a TLS certificate or ADMIN.

**Actual isolated installation/exercise completed and was retired cleanly.**
Core and Edge connected over TLS1.3/mTLS through a dedicated SSH tunnel. Real
unauthorized/malformed requests were refused. This is machine transport and
fail-closed commissioning, **not a positive business READ, STREAM or six-phase
acceptance**. Shared Research preview is still on its preceding image.

## Pins and runtime facts

| Surface | Exact pin / disposition |
| --- | --- |
| Core source packaged | `docs/research-loop-plan@664433587050ab8673fa03318a5e74d8b33b146d` |
| Compiled production closure | 672 JS/JSON files; aggregate SHA256 `e8e9d9b16c4f5a94e7301647514d56c7d0f69a90a1f3dce3e987610bd9862435`; preceding production-build receipt reused, not a new compilation claim |
| Actual candidate image | `sha256:50939bb5784b58b0bc68121c4920c703abf208da7dfba74541934fe53e48e9b2`, 69,471,201 bytes; COPY-only package, not final R2 image |
| Core private runtime config | SHA256 `a76f23816b93c5e22ec0b99ab1c534d3e6b389e4f34bcc02dad318eb5e3b206d` |
| Owned Edge source at exercise | `/home/bobby/.worktrees/portal-core-current-policy-wire-20261024@8b010874af2237cddb3ad32c6c8083b2e0a52a56` |
| Actual Edge executable | SHA256 `3e0c4e53a06aa99b0b336de31c43201a7b839e1f0cd4bddbdc60ee628c003b03`, mounted in the existing pinned image; not falsely described as a new image |
| Edge runtime config | SHA256 `cf142e9d57e79237f9ce53601c09e18b560ad0075960e70cadb9a911f5550270`; retired finite config, not reusable READY |
| Source preparation script | SHA256 `d2acc89aa53c5880afa879786afb17ea122dc54864a4a5b07a2707f1677bbca5` |
| Native machine trust | Manifest SHA256 `95d892e9394dc71a808f722b35390b4277caebd8eb6296a1f13ca44c91f156e0`; existing fresh candidate trust, not a human grant |
| Actual Core target | DB `portal_control`, role `portal`, system ID `7688673963308855330`, owner `usr_5a38d5dfb08b44748f5776fbe04a1434`, existing workspace `ws_06G19F61YB8CFR7TEWMS7HQ660` |
| Peers preserved | Active Edge `8727e5303b1815d54bc2bdcb927a55457ff4da5b`, PM `6f474c72088f000a198a73324ad3083236f2bf5c`, including their WIP; Claude clean `00e7f6cff2fadbd88b8ed461fa870b28ee88ad94` |

The literal `research-workspace` is **not an existing Core workspace**. Corrected
private commissioning metadata to the actual workspace above; physical source
workspace remains `workspace_execution_manager`. This is an explicit binding,
not renaming source authority, copying stable rights or changing public DTOs.

Actual read-only source preparation kept all **722 physical ACCOUNT rows**:
196 account, 341 balance, 185 policy, four selections, original per-grain IDs,
payload hashes, source time, epoch and cycle. Source epoch
`01a05c70-81ec-7380-801d-45c706f937c0`; original source timestamp
`2026-10-20T13:31:29.218Z` was not replaced by fresh observation time. Private
DSN retained `verify-full`, source DNS and exact CA, without a plaintext bypass.
Publication metadata remained explicitly **UNAPPROVED**; reading source bytes
does not independently approve the census or the caller's access to it.

## What actually ran

| Check | Actual result / limit of proof |
| --- | --- |
| Core startup | Real AuthService, AccessService, ReadScopes, registered DB identity and CurrentViewCoreComposition; private listener `127.0.0.1:28664`; zero sessions/grants issued |
| Edge startup | Actual `core-manager-current-check` exit0 and isolated serve process; mTLS callback points to the real Core composition, no accepting test provider |
| Core → Edge | Actual TLS1.3 request without bearer/context returned **404** `RESOURCE_NOT_AVAILABLE`, `execution.scoped-error.v1`; not a positive data read |
| Edge → Core | Actual mTLS POST with invalid `{}` context returned **400** `CURRENT_VIEW_REQUEST_INVALID`, `portal.execution.current-view-error.v1`; no fabricated principal |
| Shutdown | Core emitted `DRAINED`; Core and Edge exit0, OOMfalse; both owned containers and dedicated tunnel removed |
| Image hygiene | Tiny no-network read-only container confirmed compiled app exists and no `/private`, runtime env or temporary TLS/signing key is baked into this image; new ordinary intake is not in the already-packaged image |

Each service used 0.75 CPU / 512 MiB / pids128, read-only root, dropped
capabilities and non-root user; combined 1.5 CPU / 1024 MiB, below the approved
2 CPU / 1536 MiB / 300-second correctness envelope. Only loopback candidate
ports28664/28665 and the dedicated SSH forwards were used. These are imposed
limits, **not measured production budgets or coexistence/G2 PASS**.

Initial HK launch failed because its private files belong to UID1001 whereas
the copied launcher specified UID1000. Retake used actual HK UID/GID1001:1001;
no permission broadening or guard weakening. First capped BuildKit attempt
could not resolve a local-only base digest; the local COPY-only build then
succeeded with no network/pull. Its first context included local private input
files, but the Dockerfile copied only `dist/`, no secret was sent to an external
builder/registry, and the actual image hygiene check passed. A strict allowlist
`.dockerignore` was added before any further build. Do not claim the initial
context itself was secret-free.

## Current policy investigation and missing implementation

Read-only checks on the **actual** Core workspace found 13 policy events and
seven stored grants. All seven are `portal.manager-domain-grant.v1`, with
zero currently unexpired/unrevoked grants. Preserve this history. The preceding
zero-row query concerned the non-existing literal `research-workspace`; it
does not establish absence of history in the real workspace.

Existing native Manager grants are neither ordinary entity roots nor implicit
`business.read_all` for the Accounts census. The actual Accounts BFF requires
complete independently published population authorization. Do not weaken its
guard or reattach an expired native grant to make the new read pass.

Concrete remaining bridge: the source must retain/verify the original root
membership receipt and hold current mapping/membership through Core COMMIT,
with exact ACCOUNT correspondence, or commission a separately accepted complete
population protocol. PM's `PinnedCurrentAccessInstaller` is financial portfolio
current-access, not a Core ACCOUNT root receipt. Its native observation helper
explicitly cannot authorize SERVE/COMMIT. This is missing implementation and
source qualification, **not another request for Bobby to re-approve login**.

### New Core ordinary-policy intake

`src/execution-v2/ordinary-policy-intake.ts` composes the **existing** official
policy writer using the same real pool, registered Research schema, coordinator
and source provider. Root-owned0600/hash/O_NOFOLLOW private artifact, exact
target/owner/principal/workspace, bounded Paper grants, no embedded TS receipt,
no onward delegation/native authority import. Constructor installs nothing.
Economic roots still need the independently held source receipt. A callback's
presence is not qualification; null verification continues to refuse reads.
ACK explicitly means `POLICY_INSTALL_ONLY`, never commissioned READ/STREAM.

Source/test commit **`bac63eec4`**: two code/test files +316/−0 and one
machine-readable verification record +71/−0. Strict affected production module
**and its actual transitive dependencies** compile PASS exit0 using the existing
production options; no declaration stubs or runtime guard were substituted.
No intake artifact/policy/grant was installed in this round.

### Concrete financial source proof, not an accepting callback

Owned PM candidate now contains an Ed25519 output signer and independent
verifier, composed into the actual original-publication authority wrapper.
Owned Edge contains the corresponding concrete `SourceProofVerifier` for the
existing financial runtime. Closed financial purpose differs from identity JWT:
exact original manifest/binding/generation, receiver, kind/input digest and
group/chunk association, canonical encoding, millisecond expiry ≤30s. No
generic sign-caller-bytes service, fixture key or identity-purpose fallback.

PM R1 commit `02174b3ff947dc5185c8fb641c55034329d2300d`: two files +490/−0.
Edge R1 commit `8183b22e174e97ac13cb8f8661beecb3c5cfc96d`: four files +621/−2,
including production dependency promotion and actual verifier registration;
Cargo.lock unchanged. Both owned HK candidates are clean. Source totals this
round: **8 code/test/build files +1427/−2**, across Core/Edge/PM; the JSON
verification record and Markdown are counted separately, not as more code.
Independent review ACCEPT applies to **SOURCE_ONLY / PROPOSED Research wire**.
It does not approve trust or claim genuine APPLIED. Authentic receiver
checkpoint/status after physical COMMIT and idempotent same-original source
ACK still need their actual provider binding; factories have no accepting
defaults. No new financial key, source policy, runtime mount or fake receipt.

## Verification, reuse and cleanup

Verification tier **R1**, campaign§10.10c: intermediate source only, no push or
final ff-landing/R2 certificate. Existing unchanged 82 bootstrap/recovery,
19 real TLS and40 real-PG receipt remain reusable at their exact preceding
pins; they are not added to this round's test count. No browser/full-load gate
was run against the uncommissioned authority.

- New Core intake: **31/31 focused PASS**, explicitly schema/filesystem/writer
  doubles, not real policy installation or source acceptance.
- PM isolated suite: **128/128 PASS**,43new proof tests +85 unchanged original
  wrapper/authority/endpoint regressions; pinned SDK2.4.0; read-only/no-network,
  2 CPU/1536 MiB/pids128/300s, temporary container removed. Transcript SHA256
  `8d962b4d04d3af0a9f8a10cf4a292e1e1f1c78caeaf6c9917633c81dae85b082`.
- Full production tsc attempt150s timed out124; bounded retake293s exhausted
  the1450MiB Node heap, exit134. **Neither is PASS.** No increased production
  budget or full-test rerun was used to hide this. Narrow affected compilation
  with real transitive dependencies then **PASS exit0**; this does not erase
  the full-project resource failures.
- Rust **11/11 PASS**, real Ed25519/Python cross-language vector and actual
  runtime-trait composition; production `clippy --lib --bins -- -D warnings`
  PASS. Compile16.93s, tests0.12s, Clippy12.82s; offline/read-only source,
  2 CPU/1536 MiB/300s cell removed. Log SHA256
  `6d215077314e3f51647e885c9d5921a9cd2499f9b3c4fde3ebc0312dd78295d3`.

[Machine-readable dispositions](CORE_EDGE_DIRECT_COMMISSIONING_2026-10-24.test-results.json)
retain failures and positive/negative scope separately. No counts from this
round are combined with older receipts to manufacture new coverage.

Private operator evidence retained at
`/home/bobby/secure/core-edge-current-install-20261024-jkBGy6PN/`:
public preparation/runtime/config/terminal/request/response logs and exact
compiled-file inventory. HK retired candidate evidence:
`/home/bobby/secure/core-manager-current-install-20261024-jkbg-r2/`.
Public code/config pins above contain no secret values.

**Cleaned:** three local transient copies (runtime env, TLS key, signer key)
after matching retained originals, plus eight HK transient DSN/combined identity/
TLS-key/cursor-key copies across initial and retake directories. Shredded only
these named leaves; do not recover/reuse them. Original approved trust keys,
source rows, expired grant history, custody and audit remain intact. Original
fresh native trust is retained under its existing finite expiry, not active
source authority. No broad directory deletion, volume/image prune or peer WIP
cleanup. Image and sanitized logs retained for reproducibility, Core-owned.
Post-cleanup read-only capacity: SGP621GiB total/411GiB used/210GiB free;
HK484GiB total/324GiB used/161GiB free (both67%). No owned candidate container
or28664/28665 listener left; both owned HK source worktrees clean. Capacity
disposition **NO_ACTION_NEEDED** for retired test cells; retained exact image,
public evidence and finite original trust have Core ownership/expiry.

## Phase exits and consumer handoff

| Phase | Next actual exit, not an invented external wait |
| --- | --- |
| ELP2-05 | Accept/bind the concrete financial-purpose trust and real receiver COMMIT/checkpoint→APPLIED→same-original ACK providers; then actual publication receipt |
| ELP2-06 | Source-held ordinary current membership/complete Accounts authority + independently approved metadata; bind Manager business certificate/audience/profile and exercise actual authorized API |
| ELP2-07 | Commission exact Edge-only gateway submit/status/recovery; current work does not activate command/Live |
| ELP2-09 | Fresh independently permitted READ/STREAM and current source; positive cache/cursor/SSE/revoke/restart/recovery; separate HISTORY/REPLAY authority |
| ELP2-10 | Freeze compatible image/config/schema, approved numeric workload/budget/calibration, matched coexistence/G2 and real browser consumer |
| ELP2-11 | Integrate qualified source/permissions with applicable DR/rollback/restore/review; reuse unchanged verified backup rather than rerunning it |

**Claude next:** preserve accepted components and rich fixtures; no new public
OpenAPI/type/enum/layout/baseline in this slice. Existing API readers can consume
each actually qualified source independently. No human/browser success may be
inferred from this transport-negative receipt. No new committed Claude request
or consumer ACK was found/invented at the pinned clean worktree.

Rollback is already executed for the isolated runtime: owned processes/tunnel
stopped, temporary private copies retired, shared healthy Research image
`sha256:01692fc5702f21856f5c932efc0786d3f65ff47bb3ed7d1949ee18666f31458a`
unchanged. No migration was required or claimed. **Six phase exits stay open.**
