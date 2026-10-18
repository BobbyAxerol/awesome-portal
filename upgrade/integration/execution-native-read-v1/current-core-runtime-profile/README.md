# Current Core native Manager SSE and conditional runtime source

Status: **SOURCE_QUALIFIED**, not installed or connected acceptance.
This single43-file profile supersedes the unissued realtime-only draft and
includes the finite HTTP consumer, observation-based SSE, private configuration
loader and bounded-pool/rollback compatibility against immutable Core
`5291a80f68a11cbccad879d1e99bb6282634f636`. It preserves that base's later
membership and pending-recall protections. Never overwrite a peer checkout.

## Actual qualification

Fresh production and14-spec strict compilation PASS on this exact source.
The HK behavior runs have389unique cases across13suites and a separate4-case
actual PostgreSQL rollback suite:393distinct cases across two runs, zero
failure/error/skip. No historical213/233 or tainted SGP360 credit is inherited.
See [qualification.json](qualification.json) for source/log/JUnit hashes,
suite counts, interference observations, cleanup and the retained failed scope.

The tests use disposable PostgreSQL, mTLS, HTTP/SSE and controlled pg ACK faults.
The13loader cases mock filesystem/composition; they are NOT an actual loader
factory, commissioned authority or production network-failure qualification.
The separate PG15 schema reference installs no identities/acceptances and
does not prove runtime permissions. Full connected08 remains NOT_MET.

## Behavior and safe application

Finite reads and each selected SSE frame use the genuine same-pool/trust/
mutation composition. READ and STREAM are separate; selected denials do not
fall back to legacy. Observation cursors retain the original baseline and
honestly represent Portal observations, not TS global Event ordering or N03.
The existing bounded Hub owns queues/lifecycle; no new bulk-sync poller exists.

`manifest.json` pins43preimages/outputs and the full1154-file app closure;
three fixed auxiliary source pins are checked separately. Use an isolated
feature checkout at the exact source base, with the same root bootstrap source:

```sh
python3 -B /path/to/edge/scripts/epg10-08/publication.py \
  --packet /path/to/edge/upgrade/integration/execution-native-read-v1/current-core-runtime-profile \
  --target "$PWD"
git apply --unidiff-zero --check /path/to/edge/upgrade/integration/execution-native-read-v1/current-core-runtime-profile/qualified.patch
git apply --unidiff-zero /path/to/edge/upgrade/integration/execution-native-read-v1/current-core-runtime-profile/qualified.patch
```

Changed dependencies, partial application or symlinks refuse. Never force,
use rejects, or infer acceptance from patch exit alone; verify all output pins.
The manifest records the extra app-relative bootstrap layout used by tests.
Public dependencies must match the pinned lock/closure (undici7.29.1);
node_modules, ENV, keys, DB rows and runtime state are not published.

## Commissioning remains separate work inside08

The optional `CONTROL_API_NATIVE_CORE_CONFIG_FILE` and
`CONTROL_API_NATIVE_CORE_CONFIG_SHA256` pair selects reviewed private references;
partial/invalid configuration fails closed. Loading never installs owner
policies. Runtime verifies actual DB/system/current+session-role pins before
mounting and does not mutate an already cached pool to change its bounds.
Failed rollback preserves the original ambiguous error and destroys only the
broken borrower; COMMIT ACK loss never authorizes an automatic retry.

Commission genuine PM/provider/schema/identity and actual current Core factory,
then qualify revoke/cache/cursor/SSE and recovery. Keep receipt/custody and
selected-scope fail-closed behavior during rollback; do not unset configuration
as a permission fallback. No command/financial activation, source publication,
broker/Redis access, runtime restart or UI change is performed by this packet.
Continue the [original08 journal](../../../EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md#23207-original08--actual-provider-owning-boundary-and-connected-acceptance).
