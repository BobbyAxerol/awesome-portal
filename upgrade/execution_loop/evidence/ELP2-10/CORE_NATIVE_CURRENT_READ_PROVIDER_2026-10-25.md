# Core ordinary CURRENT READ provider — 25 October 2026

Status: SOURCE_IMPLEMENTED / FOCUSED_PG_RESTORE_PASS / NOT_INSTALLED.
Owned candidate `chore/core-provider-assembly-20261025`, input
`0fae408ee0340f27546b3687b19bd1cb196267f7`. No UI/public generated DTO,
shared-preview/stable/dev/main/provider28445, command SUBMIT or Live change.

## Source delivered

- Separate closed codec, fixed-path mTLS client, purpose-specific provider and
  `NativeCurrentRelationsPort`. A decoded object is not transport provenance.
  Native registry versions remain decimal BIGINT strings end to end.
- Actual actor, inspected principal and native human subject are independently
  bound to the exact registered original. Every action is explicitly permitted;
  missing issuer/principal closure refuses before any source call.
- `ExecutionAccessService` uses the optional native port for advisory current
  relations; an unentered observation is cancelled, not converted into a READ
  terminal or mutation authority.
- `ExecutionReadScopes.deliverNative` is the explicit physical finite HTTP
  boundary. Real response reservation precedes source ENTER. The final Core
  policy/snapshot check and durable SENDING physically COMMIT and release the
  pool connection before `NativeReadEgress` dispatches bytes. Only its one-use
  actual finish/abort witness creates a durable SERVED/ABORTED terminal.
- Additive migration153 preserves original/terminal custody, bounds retention
  without eviction and serializes genuine authority writers against unresolved
  reads. Default migration works without installing the private candidate.
- `CurrentHumanMutations` includes this real custody in both pending-state and
  error/retry handling. A pending read cannot cause the exact revoke intent to
  be marked REFUSED and its drain cleared. Recovery retries the same original.
- Lost cancellation ACK recovers from the authenticated CANCELLED observation
  by obtaining the actual same-original cancellation authority again; the
  observation itself is not an ACK. Restart/expiry without physical witness
  leaves UNKNOWN unresolved.
- Physical send deadlines include source/session expiry and future Core/native
  ALLOW/DENY/receipt/target transitions. Separate admission recovery permits
  only this instance's genuinely active flights within bounded custody caps;
  global mutation recovery still rejects all unresolved custody.

## Review and test scope

Independent c7 source review: ACCEPT after the two concrete recovery defects
above were corrected. Read-only review is not counted as a test execution.

- Codec: 9 PASS. Client: 8 PASS with actual loopback TLS 1.3/mTLS and wrong-peer
  negatives. Sandbox-only EPERM was retained, then the exact client selector
  retaken with approved loopback networking; no source workaround.
- PM counterpart: 85 provider/listener tests and 16 real-PG registry/ROOT/CURRENT
  cases PASS. See the separately committed PM source receipt and exact pins in
  the canonical consolidated owner return; external source inputs are TEST_ONLY.
- Initial Core mixed cell: ROOT73 and STATUS4 passed; CURRENT2 passed/5 failed
  due to a reused globally unique grant ID in the fixture. Fixture IDs now
  uniquely bind each workspace/original. No grant constraint was relaxed.
- Final official focused Core build/PG gate: **237/237 PASS**, 72.25 s Vitest
  execution: CURRENT11, current-human coordinator105, read-scope117, STATUS4.
  Production build and regular PostgreSQL dump/restore drill also PASS.
  These are real isolated PG/HTTP/TLS tests with explicitly synthetic external
  registrations, not actual Research source commissioning.
- Unchanged persistence-ledger test: **22/22 PASS** under a minimal Node-only
  configuration (438 ms). The initial frontend-config attempt could not load
  the absent React Vite plugin; no source/gate assertion was suppressed. This
  filesystem/JSON-only spec needs no frontend rebuild or visual baseline.

Exact official retake:
`flock -n /tmp/portal-heavy.lock bash scripts/control-api-test.sh
test/elp210-native-current-relations-provider.spec.ts
test/elp210-current-human-candidate.spec.ts test/elp2-read-scope.spec.ts
test/command-source-assertion-pg.spec.ts`.
Owned containers/network/dependency scratch are removed by the runner's trap;
no runtime DB, source grant or permission is installed by the test cell.

Final frozen public file hashes, also read back from the actual test container:

| File | SHA256 |
| --- | --- |
| provider source | `6a35108c1ec05ddf58c120001a49981c7406903ef83d291d3a5759c92a1cb062` |
| provider PG spec | `f29ab2e2261140ebcc38b8c1229e868e90980b3c13c634d5de07f2ae679308b2` |
| current-human-mutations | `e725cf36237bfb113c6a7b743a26bb5c6cc79b440bd31f21f5a359bb95b02958` |
| migration153 | `bd606264e579551df2c05e857d05068a76a2ef9411d86e93718b412786828b25` |

## Explicit composition and commissioning limitations

This is finite Paper CURRENT, not STREAM/HISTORY/REPLAY or a mutation fence.
Selecting the port deliberately makes old detached DTO-return/stream paths
fail closed. Existing controllers are not automatically converted to physical
native delivery. No app-module factory/listener or runtime source is installed.

The ordinary READ provider must currently compose outermost over the separate
ROOT/base provider, whose earlier explicit wrapper does not forward this new
optional port. More importantly, `ExecutionAccessService.transaction` refuses
mutations while this read-only provider is selected: ROOT/access/command
mutations need their own genuinely qualified mutation composition, not a READ
observation. Do not describe this as completed all-purpose runtime authority.

Backend next: compose the exact accepted registrations/trust/originals into the
owned runtime candidate, convert chosen finite reader entrypoints explicitly,
and commission through Edge with independent purposes. Preserve source-terminal
and UNKNOWN fences; no new identity or guessed receipt to force acceptance.

Claude: no public enum/type/component remap this round. Continue current UI and
fixtures; actual-source browser acceptance follows the qualified installation,
not these component vectors. Keep financial/read/ROOT/STATUS purposes distinct.

Rollback: leave these constructors unmounted; preserve every original, terminal,
permission and audit. Focused source intermediate verification under campaign
§10.10c; full integrated normal landing gate remains separate. No remote push.
