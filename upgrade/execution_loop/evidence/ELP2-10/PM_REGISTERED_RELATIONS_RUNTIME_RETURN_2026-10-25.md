# PM registered CURRENT / ROOT — owning runtime return, 25Oct2026

Coordinator: Codex/Core. This closes an implementation gap in the separately
owned PM candidate; it is not an installed-provider or connected-source receipt.
Public return only: no credential, token, DSN, key, cookie or source records.

## 1. Source and authorization

Bobby assigned continuing source/provider integration within ELP2-10, preserving
shared preview, all originals/custody, stable/dev/main/provider28445 and
SUBMIT/Live. Edge remains the sole TS/PM coordination point. No source grants,
registrations, principals, originals, schema or new authority are manufactured.

Source is a real PM Git checkout, not a Portal vendor directory or `/tmp` copy:
`/home/bobby/pm-core-relations-20261025`, branch
`feat/core-registered-relations-runtime-20261025`, parent
`fad5e3fd876460f3aecfcf8ebd57a66610b6069c`.
Implementation commit **`c9be453491d488bbbcfdec6a8c9d8b9694380053`**:
**3 files, +904/-1** (runtime478 new lines, factory407 test lines and the
existing registered-native provider's scheduling/admission regression).

| Source | SHA256 |
| --- | --- |
| `services/portfolio_management/registered_relations_runtime.py` | `a8bbdc80ef6ce4848b573c8bbb1756e877237ff5129d5fb188fa77d5a4136704` |
| `tests/unit/test_pma11_registered_relations_runtime.py` | `4b91b1c39b9f19e7601c8e2cd6a9f2898515539ef919d3d2823ca54f15ac142b` |
| `tests/unit/test_pma11_registered_native_relations_provider.py` | `13a193ffe0cc30db8ec1f53b1a988da2de3ef3034b6f8a35564f467b21c6b4a3` |

Git bundle retained and `git bundle verify` PASS:
`/home/bobby/.local/state/portal-integrations/20261025/pm-registered-relations-c9be453.bundle`,
SHA256 `fabca60917a8b427f8503236aa10f16aa07c8fdd27a8e9137b3835978d9d8db0`.
It requires the exact parent above and contains the full implementation commit.
No remote push or new source transfer to HK is claimed. The earlier exact
source-upload authorization request remains unresolved; no retry/workaround.

## 2. What is now concrete

- Closed/hash-pinned private configuration, explicit enablement and material
  references; default absent means OFF. Hash approval is not source authority.
- Actual separate bounded asyncpg source/control pools, exact role/database
  pins, pinned mTLS listener and explicit source/terminal material hashes.
- Existing concrete selected/correspondence readers, held bridge and registered
  CURRENT and ROOT providers are constructed by one owning factory, not supplied
  as permissive caller callbacks.
- CURRENT requires explicit actor/principal/permitted-action mappings and READ
  terminals. ROOT has separate MUTATION binding, terminal audience and key
  profile. CURRENT never implies ROOT, STREAM, HISTORY, REPLAY or command rights.
- Fresh read-only repeatable-read preflight verifies catalogue/function hashes,
  fingerprint, admission, registration head/manifest, exact original, principal
  and native target observation before a private listener can bind.
- Shutdown stops admission, joins tracked accepted handlers without cancelling
  the source terminal, checks provider activity and closes only owned pools.
  Pending drain/close is retryable; local emptiness or a restart never becomes
  an external Core/source ACK. Existing attempts/UNKNOWN are not deleted.

This is an explicit owner factory (`RegisteredRelationsRuntime.create`,
`start`, `stop`), not automatic PM main startup. No caller in the existing PM
deployment selects it yet. Installation must pin and invoke it deliberately;
unit construction is not installed runtime.

## 3. Actual tests and failed attempts retained

Final actual result: **42 PASS, 0 FAIL**, 5.02s across:

```text
tests/unit/test_pma11_registered_relations_runtime.py
tests/unit/test_pma11_registered_current_relations_provider.py
tests/unit/test_pma11_registered_native_relations_provider.py
```

Python3.12.14 image ID
`sha256:cd7c412d000912f29075a1b8803e43cb2f38bb67f104019df526df5ceaf30569`;
exact dependency versions/wheel hashes from checked-in `uv.lock`; vendored SDK
2.4.0 hash verified. No import doubles added to hide missing real modules.
This is a locked source-unit environment, not the deployed PM image.

Private final log:
`/home/bobby/.local/state/portal-integrations/20261025/pm-relations-locked-unit-final-20261025.log`,
SHA256 `5898479b348c1de1594e860e621129d103743ec8ae41a12519a2c955e24dd15b`.

Earlier attempts remain failures, not passing coverage:

1. Collection failed because disposable `/tmp` was non-executable and native
   cryptography bindings could not map. Only that cell's tmpfs was adjusted to
   `exec,nosuid,nodev`; no host/runtime privilege or source guard changed.
   Log hash `1a730dd7dae1e3ff866514a0dde0a50b6f1ae12296dea1d2f4b750393c581026`.
2. Retake40PASS/1FAIL: an existing concurrent-ISSUE assertion depended on Python
   `wait_for` scheduling. A changed binding is rejected either at parse or at
   atomic admission, both before a second source issue. The test now permits
   only those two exact refusal codes and still checks first custody/one issue.
   A separate exact-duplicate test asserts the atomic admission refusal. No
   provider production code changed to make that assertion pass.
   Log hash `c948848e688a4f958917eb001b8fcc7e9b2a3780d2da7490b56901ee82f72bcc`.

Independent read-only source/lifecycle/permission review ACCEPT. Test doubles
are explicitly TEST_ONLY; these unit cases do not certify actual DB/TLS/source
catalogue, accepted registration, terminal recovery or financial publication.

## 4. Resources, cleanup and rollback

One disposable cell `portal-pm-relations-unit-20261025`:2CPU/1,536MiB,
300s process ceiling,512MiB tmpfs,128PIDs, read-only source/rootfs, no DB or
secrets, no public port, no-new-privileges/capabilities dropped. Actual final
exit0/OOMfalse; exact cell removed by its trap and post-run census empty.
No heavy gate overlap. Resource ceilings are not measured peak load or approved
production budget/calibration. No broad prune, source/authority/custody cleanup.

Rollback before installation: leave the new factory unselected and retain its
Git commit/bundle. It has not altered any running service or existing PM data.

## 5. Commissioning inputs and handoff

| Owner | Exact next action / input | Acceptance still required |
| --- | --- | --- |
| Core integrator | Preserve this source commit/bundle; deliver exact approved source artifacts to owned HK candidate when transfer is authorized | HK commit/file hashes, not an assumption that a local bundle is installed |
| Edge / PM source owner, through Edge only | Select real accepted registry/correspondence head, manifest/original, exact principal/actions and target catalogue/fingerprint/admission | Fresh read-only preflight matches every selected fact; no legacy grant inference or fabricated original |
| Core + Edge | Pin approved private config/material refs, purpose-specific unexpired trust and listener profile; install only the approved isolated candidate | Source/image/config/schema pins and actual original-bound READ/ROOT terminal/revoke/restart receipts; independent STREAM/HISTORY/REPLAY remain separate |
| Edge financial owner | Genuine source original, transaction-group/issuer verifier and committed APPLIED wire | Source COMMIT→Core durable APPLIED→source durable ACK, not mTLS or human signature alone |
| Edge command owner | Existing STATUS original/requester and commissioned gateway | STATUS/recovery on the same real intent; no synthetic SUBMIT or Live |
| Claude | No public type/enum/component change from this private factory; keep accepted consumer/fixtures | Actual API/browser receipt after qualified install on exact principal/workspace |

No new public OpenAPI/generated client or migration from this PM factory.
ELP2-05/06/07/09/10 remain incomplete; ELP2-11 is not entry-ready. Budget,
calibration, coexistence/G2 and real-source browser acceptance are separate gates.
Verification of this Markdown return: R0 path/hash/diff checks; no full hook
just for documentation, no installed/connected PASS inferred from unit tests.
