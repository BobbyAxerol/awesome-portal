# Original08 — actual native READ database and producer commissioning

Status at 2026-10-18 22:25 UTC: **native DB installed and private producer
ACTIVE_COMMISSIONING_ONLY**. Full08 connected acceptance remains NOT_MET;
09connected has not started. This supersedes earlier “no native schema/provider”
statements only for the exact target and producer described here.

The source/runtime authority is the [original08 main journal](../../../EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md#23207-original08--actual-provider-owning-boundary-and-connected-acceptance),
the [detailed08 guide](../../../upgrade_v1.2/EXECUTION_PORTAL_EDGE_UPGRADE_GUIDE_v1.2_VI.md#epg10-08-hoàn-thiện-revocation-scope-và-tls),
the [qualified Core source](../current-core-runtime-profile/README.md) and
[genuine factory qualification](../current-core-runtime-factory/README.md).
The [bounded receipt](qualification.json) distinguishes actual installation,
isolated tests, transport probes and still-missing connected evidence.

## What is actually installed

- Verified TS database `live_data_executor`, PG150018, system
  `7674585245102796834`, volume `trading_system_pgdata`.
- Existing reviewed PM installer: three new native identities for the existing
  stable Portal accounts, protected Bobby policy, minimal native READ/fence
  stores and writer guards. No Portal account was created/reset or promoted.
- Exactly three new roles: `ts_portal_native_read_source` (2 connections),
  `ts_portal_native_read_control` (2), `ts_portal_native_read_maintenance` (1).
  Actual SCRAM target/role/settings checks pass. No old-role password/ACL change;
  no new-role privileges on old operational application relations.
- Six genuine at-install READ acceptances: Bobby/Stan × paper/sandbox/live,
  version1, independently read back. Thanh has no invented full-business grant.
  Stan's approved subordinate membership management remains a separate native
  entity-permission boundary; this installation neither grants nor removes it.

One new stable Compose service, `portal-native-manager-read-native-manager-read-1`,
binds only **WireGuard `10.70.0.2:28445`**. No published/public ports. Frozen PM
source closure is at
`/home/bobby/.local/share/portal-native-manager-read/releases/pm-f5ee331fc2b8-9e7d34554000`;
versioned config is at
`/home/bobby/.local/share/portal-native-manager-read/runtime/v1.0.0-9e7d3455`.
Image/config/source pins are in the receipt. These are runtime-owned paths,
not deployment worktrees. Serving mounts source/control credentials only;
no schema-admin/maintenance DSN or CA private key.

This is a private **authority producer**, not a new data-query or command API.
The existing five Manager data primitives/Source Proxy/Rust read path are
unchanged. The provider's fixed protocol prefix is
`/internal/elp210/business-root-read/` with `issue`, `enter`, `unknown`, `status`,
`cancel-unentered`, `resolve` (POST). Use the already-qualified typed Core
client/terminal coordinator; never call it from a browser, substitute a Portal
session, or infer command authority. Commissioning proves mTLS and fail-closed
transport, not positive connected business issue/COMMIT/final delivery.

## Reproducibility and the fixed compatibility defect

The fresh PG15 reference uses the exact five PM SQL pins and existing
`native_fence.py` from PM commit `f5ee331fc2b8334cb203ea406df7ed6f466920b7`.
The later PM `908169aa` changes tracking/tests only, not these runtime bytes.
The main journal records the complete source closure and reference manifest.

The operational DB has `pgcrypto`: the original explicit `public,pg_catalog`
install path selected `public.gen_random_uuid()` for the new `ts_users` default.
The empty reference selected PostgreSQL's builtin. No live hash was adopted:
[one isolated test](default-compatibility.py) reproduces the exact mismatch and
proves that qualifying **only the newly created column default** as
`pg_catalog.gen_random_uuid()` restores both original independent pins.
The native-only correction was guarded, then the original installer resumed
PREPARED→GUARDED. Existing tables/extensions/functions were not modified.

[role_credentials.py](role_credentials.py) is a private operator maintenance
helper, not application authentication or a public provisioning endpoint.
It accepts only the three literal new roles, refuses an existing different
password, and never outputs a password/verifier. Caller must independently
verify the target/schema/window and provide protected private references.
[Four unit tests](test_role_credentials.py) and
[one isolated PG15 real-SCRAM case](role-credential-compatibility.py) cover
encoding, actual auth/default settings, wrong password, no-op reapply and
overwrite refusal. The HBA file is **TEST_ONLY**, never an operational HBA.

Run the unit tests from this packet with `python3 -B -m unittest
test_role_credentials` after the shared-host guard. The two PG drivers require
a disposable `pm_native_golden_test`/owner `bobby` cell, pinned source mounted
at `/source` and helper at `/helpers/role_credentials.py`; they refuse the
known operational system identifiers. They are not production install scripts.
Do not run all TS migrations or copy a live catalogue as expected input.

## Boundaries, cleanup and next action

### Current Core private inputs — 2026-10-18,22:50UTC

Six actual native observations were captured in **one RR/READONLY source
transaction**, not copied from install templates. The private source return is
`/home/bobby/secure/portal-native-manager-read/v1/commissioning/core-inputs-v1/native-source-return.json`
(SHA256 `85e0c6f89f41f6679b26603ba76e5862552c9a28d79a08ccde8c82b51465ef38`).
It is observation-only, not a held grant or terminal outcome. Exact observation
bytes determine semantic pins; native counters stay decimal strings and the
native document stays opaque JSON text. No ISSUE/ENTER or database write occurred.

Fresh read-only SGP metadata confirms `portal_control`, system
`7675333655652302882`, role `portal`,39migration names and the real protected
Bobby ID. All three Portal accounts are ACTIVE in their existing workspaces;
no account, password, role or membership was recreated/promoted. Private Core
configuration `core-inputs-v1/native-core-runtime.json` (SHA256
`61a9204289326ac6f01a31d9aa88511ebe0f7ce9727de508995072b5cb177a28`)
prepares six Bobby/Stan×Paper/Sandbox/Live selections, two root-owned offline
owner intakes and12 **not installed** domain READ/STREAM grants. It adds no
Thanh default, entity delegation, command or financial grant. This does not
replace the separate approved native membership-management commissioning.

Actual-file preflight: **6PASS/0FAIL/SKIP**, no mocked filesystem or generated
identity/key, network=none and no DB connection/source call. It covers genuine
TLS/Ed25519 references, both owner artifacts, all six exact native pins and
wrong runtime hash, owner-artifact hash and Core-role pin denials. First attempt
failed in runner startup before test collection: Vite tried to write .vite-temp
below a read-only mount. Preserve that failure; only the config-loader invocation
was corrected, keeping all source/dependency/private mounts read-only. Seven
interference samples found zero overlaps. Both attempts removed their helper
and lease;41operational tuples remained unchanged. No image build/pull/rotation
or secret transfer occurred. Root0600 private inputs are deliberately retained.

**Do not blindly apply/deploy the frozen profile over current Core WIP.** Fresh
hash comparison of43authored paths on Core5291 finds14qualified-exact,
6base-exact,6missing and17peer-changed paths, including consumer/composition/
currentness/realtime logic. Two peer test containers are still active. Preserve
their source/index and job; reconcile current bytes in a private specimen,
qualify the exact merged source/schema/writers, then mount it in the existing
Core owning pool/coordinator. The config above is validated against the
published qualified profile, **not** those unqualified17new peer changes.
Its finite offline intake interval must be checked at installation; never
silently extend it or call it an operational change window. Stable Core remains
unchanged. Full08 connected acceptance remains NOT_MET;09connected not started.

Explicit commissioning caps are 8 unresolved/4096 retained native records,
source/control pools2 each, provider2 in-flight. These are finite safety bounds,
**not measured production capacity or indefinite retention**. No UNKNOWN/history
purge.01/06 still own connected capacity/storage/retention qualification.

All disposable PG/worker/network/leases from this slice are removed. The new
named producer, native DB state, private credentials/PKI, frozen source and
versioned config are deliberately retained as active commissioning inputs.
Old40HK services did not restart/change. The exact historical SSE transfer
directory on SGP is absent; peer PM/Core test resources are not ours to remove.
No new image build/pull/install or broad cache/volume/source cleanup occurred.

Continue in **the same08**: reconcile and mount the genuine current Core
composition on its verified DB/session and current mutation coordinator after
the actual peer job ends; configure protected Core-side references without
putting secrets in Git/chat. Then run connected revoke/cache/cursor/SSE,
unaffected-scope positives and durable physical completion/recovery. Do not
replace owner gate failures with isolated PASS. Command07, publisher03 and
capacity01/06 remain separate; only then09connected→10→11.
