# Core → Edge command STATUS composition — 25 October 2026

Status: **SOURCE_IMPLEMENTED / FOCUSED_PASS / NOT_INSTALLED**.
No SUBMIT route, command activation, Live, public DTO or UI change.

## Exact source and boundary

Core candidate `chore/core-provider-assembly-20261025`, parent
`d8e42cadac045468f4a1a9e11e69d64cb9255792`. Six new source/test files:
`command-source-assertion`, `command-source-assertion-transport`,
`edge-command-status-transport` under `apps/control-api`.
Edge source base `6d44b52c5c088e2f7ada8fe3aaee94f7599d3266` in its owned
`feat/core-current-policy-wire-20261024` candidate.

Core's concrete constructor uses the actual access service, operational audit
fence, command store and existing current-human candidate. It re-reads the real
historical original; the caller cannot register a browser-supplied actor or
replacement command. Core/PM original references and exact body digests remain
distinct. Current scope/policy/field-policy revisions are genuine separate facts,
not an aggregate epoch copied into session/membership/policy revision slots.

The two Edge routes are private ORIGINAL and STATUS only, exact-leaf mTLS / CA /
TLS 1.3 and signed delivered bytes. The Core→Edge STATUS proof has its own
purpose; only fresh actual Core authority can issue a distinct PM identity
assertion for the exact existing PM STATUS POST. READ/financial grants cannot
become command STATUS or ROOT permission.

The Edge constructor re-reads actual original custody from PgProjectionStore.
The optional PM completion hook runs only after verified full response bytes
are retained durably. ACK loss retries only the same completion, not PM POST,
ISSUE or a new identity. Unresolved ENTERED/UNKNOWN/expired/restarted contexts
remain unresolved. A local retained-read completion is explicitly different
from actual PM delivery and refuses pending PM acquisition; no invented ACK.
Legacy providers/default numeric SUBMIT authority remain unchanged.

## Actual validation

- Core three focused Vitest files: **87/87 PASS**, 6.23 s, one worker.
- Production-only `tsc -p tsconfig.build.json --noEmit`: **PASS**.
- Additional `command-source-assertion-pg.spec.ts`: **4/4 PASS** on real
  disposable Core PostgreSQL, actual password sessions, a different current
  reviewer, official command writer/original store, loopback pinned mTLS,
  signed UNKNOWN recovery and coordinated logout. External source/PKI remain
  TEST_ONLY. The mixed initial gate has unrelated CURRENT fixture failures;
  these four passes are not described as a whole mixed-gate/restore PASS.
- Rust authority selector: 22 PASS.
- Rust command_status selector: 13 distinct PASS.
- Rust pm_command_port selector: 21 PASS, including the same three completion
  cases already in command_status. Eight core_command_runtime cases PASS.
- Thus **61 distinct Rust cases**, not 64 or the larger count including
  repeated main/lib execution. Exact selected lanes exit 0, OOM false.
- Rust offline pinned toolchain/caches, no network/host port, 2 CPU / 1536 MiB;
  named test container removed. Core loopback listeners close in test teardown.

The real mTLS/raw-response/custody ordering tests use explicit synthetic source
authority. They do not certify an actual Research current requester, native
source registration, existing economic command or connected STATUS receipt.

## Installation requirements / handoff

The explicit constructor still needs source-owned original/PM custody mapping,
current requester/status workload registration, purpose-specific signer and
audience/kid, exact Core↔Edge callback mTLS pins and real native current-human
trust. No SQL seed, new command, replacement user or expired trust is accepted
as a substitute. No listener, image, grant/session, config or schema installed.

Claude: no public generated-type/component remapping is required. Keep existing
status consumer; real browser acceptance follows qualified runtime composition.
Core/Edge: use only the server-selected historical original, fresh current
STATUS permission and same-delivery recovery. Full ELP2-07/10 remain NOT_MET;
ELP2-11 is not opened by this source snapshot.

Verification: focused intermediate source commit under campaign §10.10c;
normal full gate belongs to the frozen integrated landing candidate. No push,
shared-preview/stable/dev/main/provider28445, command SUBMIT or Live changes.
Rollback is leaving the new constructor unmounted; retain all source custody.
