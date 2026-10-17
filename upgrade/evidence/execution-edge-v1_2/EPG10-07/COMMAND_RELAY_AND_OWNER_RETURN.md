# EPG10-07 — durable command relay / single owner return

Status: **IN_PROGRESS / OWNED_ISOLATED_PACKAGE_QUALIFIED / SOURCE_DARK**;
**full phase exit NOT_MET**. The governing
[main plan §23.16](../../../EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md#epg10-07-plan)
and [EDGE07 guide](../../../upgrade_v1.2/EXECUTION_PORTAL_EDGE_UPGRADE_GUIDE_v1.2_VI.md#epg10-07-thực-hiện-command-relay-có-durable-receipt)
remain authoritative. This is a backend implementation, not a UI or activation.

## Current original-round2 follow-through —17/10/2026,09:48 Asia/Saigon

PM HTTP byte binding is now1009PASS, not the historical1007PASS/2FAIL attempt.
PM0faf6ef0/461990f2/3fd02c18 supply durable original intent, full owning outcome
and private current-authorized handler; latest6e0424b7 adds current economic
history. Do not keep asking PM to implement these already qualified components.

Edge now consumes the frozen formats in [pm_source.rs](../../../../services/portal-execution-edge-rs/crates/command-relay/src/pm_source.rs):
exact delivered-byte HTTP digest, bounded full-outcome decode and original
source key/digest/resolved-target correlation; all15presentation fields and
source correlation metadata retained. Reuses existing exact decimal/state/
progress validation; rejects duplicate/unknown/missing fields and string counters.
No auth, URL, source-call, retry, route, grant or runtime flag is installed.
[Qualification](pm-source-qualification.json):75Rust PASS (14new/61regression),
strict Clippy/fmt PASS;2actual PM HTTP-vector checks separately. Includes all
3canonical modes×8capital shapes and6owning states, TEST_ONLY, not actual native
operations. Private416,098,563B source/cache target removed; own lease absent,
all23protected runtime tuples unchanged; no Docker artifact or shared prune.

**Next gap, not a new phase:**08-READ-TRUST/current provider commissioning is
the first read lane; command07 separately needs PM/TS to publish the mounted
authenticated transport for `EdgeCommandHandler.submit/status`, actual byte
delivery envelope/current human-workload-field providers and original resolved
binding. PM's source packet explicitly has no new HTTP wire/routes or installed
network transport. Never invent that wire by calling the reduced candidate API.
After that return, Edge implements the actual CommandPort against this codec and
runs07/08-COMMAND-COMMIT/09 loss/revoke/status/recovery cases on the exact target.
Retained original intent/proof must not be reconstructed from current profile;
UNKNOWN never permits automatic resend. Actual operation/profile qualification
and retention still required, but whole PM/TS upgrade is not a prerequisite.
Then affected09→10scoped cutover/rollback→11 acceptance, in the original round.
Full connected07/08/10/11 remains NOT_MET. Original approval remains valid.

Peer metadata observation: `pma11-14-private-edge-composition.json` repeats the
root `status` key (qualification and operation); PM owner should rename its
status-operation entry. We do not consume that ambiguous key or modify PM's
file. Full-outcome wire has its own schema/strict decoder; no extra Edge gate.

## Implemented boundary

- Existing Rust `command-relay`: immutable bounded PM JSON and local canonical
  digests; exact decimal-string partitions; delivery independent of PM business
  disposition; full source receipt, versions and monotonic progress.
- Existing Rust `projection-store-pg`: additive migration0021, governed pool,
  immutable correlation, cross-replica finite quota and indexed lookup. Persist
  before one-send CAS; SQL statement2s/lock250ms; no DB transaction over a source
  call. Source deadline50ms–30s and fail-fast1–32 active operations are explicit
  construction bounds, **not approved production capacity defaults**.
- `DurableCommandRelay` composes trusted current-authority and source ports.
  Same-key replay returns original; conflict never sends another payload. Once
  SENDING, crash/timeout/503/body`DENIED` is UNKNOWN and status-only, not resend.
  ACK is not APPLIED. A durable receipt commit followed by a local error still
  requires status recovery; it never authorizes another effect.
- Human report/status checks and private service-only recovery are separate.
  Recovery survives expired human login but returns no public data and cannot
  send. Revoked requester cannot inspect a receipt merely by knowing its key.
  The original intent actor/workload remain immutable; a different current
  manager can receive status only through explicitly resolved current report
  rights. That report grant cannot authorize submission as the original actor.
- Source ports must authenticate the actual native TS authority and preserve its
  business JSON. The local payload digest is **not** PM's resolved-recipient/
  authority source-intent digest. An eventual native adapter validates original
  `Outcome` key/digest/target before passing the full presentation into storage.

No existing read verifier, GET-retry transport, blocked F0 operation record,
in-memory journal or compatibility protective primitive became write authority.
No new generic command HTTP wire or browser actor envelope was invented.

Code entrypoints (all in this Portal repository):

- [Intent, full receipt and exact amount validation](../../../../services/portal-execution-edge-rs/crates/command-relay/src/durable.rs).
- [Current requester and separate service recovery gates](../../../../services/portal-execution-edge-rs/crates/command-relay/src/authority.rs).
- [Bounded async relay and durable store](../../../../services/portal-execution-edge-rs/crates/projection-store-pg/src/command.rs),
  [additive Portal migration0021](../../../../services/portal-execution-edge-rs/crates/projection-store-pg/migrations/0021_command_relay.sql).
- [Real-PG TEST_ONLY fault/restart tests](../../../../services/portal-execution-edge-rs/crates/projection-store-pg/tests/epg10_07_command.rs).

There is **no newly mounted command HTTP route** in this slice. Constructing
internal facts is not authentication, and setting a flag does not install the
missing transport. `DurableCommandRelay` starts with sends disabled; its trusted
composition must bind the actual requester's context separately from the
immutable original intent and independently authenticate native TS status/send.
One stable server-owned ledger ID/quota must be shared by all replicas of the
same binding and retained across restart; never derive a new ledger from a
browser request or use a fresh ledger to bypass idempotency/quota. Native TS
idempotency remains mandatory in addition to Portal's one-dispatch fence.

## Actual compatibility / publication

[Activation matrix](command-activation-matrix.json): eight capital shapes support
canonical Paper/Sandbox/Live structurally. **Zero qualified runtime operations**;
profile bindings are empty, not wildcard. The PM branch candidate is unmounted.
The nine legacy N12 entries remain unpublished/unreachable; its workload-only
Paper assertion does not prove the current PM human chain. Other PM control,
management/profile and order operations are not aliases to capital.
Canonical environments remain `paper`, `sandbox`, `live`; Canary is an explicitly
published native profile binding, not an invented fourth enum or a wildcard.
No venue or Paper-only target is hardcoded into the new provider-neutral core.

Research command origin `3d537127313fb3c282eda054fd180499fe4732ca` exposes its four BFF
contracts under `/api/v1/execution/capital-commands`: preview, submit, status and
reconcile. `command-trust.ts` is an internal seam with default-unqualified trust;
existing RS256 `execution.read` transport is not a command adapter. Public status
may be reduced, but Edge's sole durable receipt is **not** that reduced object:
it retains currency, before/after/source/policy/binding refs, current versions,
blockers, amount partition and `physical_transfer_performed=false` unchanged.
The current observed Research HEAD advanced to
`daf434875e28aa131105d7f27d910b2f0ca05792` during qualification: ELP2-08 workflow
contracts only,21 changed files; the five pinned command/trust/foundation/OpenAPI/
fixture hashes and command wiring are unchanged. Source advancement is not a
runtime deployment or command-authority return.

## Required source return — reuse this phase, no new generic approval gate

TS/PM owner must return one exact revision-bound publication containing:

1. Mounted command/status handlers and operation×environment×native-profile
   bindings; fixture/demo/native-provider classification and exact target IDs.
   Do not infer publication from code or an old Paper drill.
2. Authenticated wire/provider binding for current human/session/workload,
   delegation/membership/policy revisions, approvals where required, expected
   versions and TS commit-time leases/fences. Separate current service authority
   for accepted-intent status recovery and current requester report permission.
   Issuer/audience/PKI refs stay private; do not send secrets or raw assertions.
3. Native source-intent digest, original receipt/ref/revision/status semantics,
   idempotency/retention window and behavior when a receipt is missing/expired.
   UNKNOWN must remain UNKNOWN; no automatic new key or mutation retry.

Research owner binds its real `CommandTrust` adapter to that published wire and
maps the existing BFF DTO without forging human authority or reducing the sole
durable receipt. Edge then binds those exact adapters and reruns **EPG10-07**
connected T07-01…06. No TS/PM/Research source edits are authorized by this packet.

Source anchors for that same return (do not search old Git templates for private
runtime authority): PM `d16aa2b5` has
`services/portfolio_management/operator_api_contract.py`, `operator_runtime.py`
and `operator_session.py`; TS `4598e392` has
`services/portal_execution_owner/command/` and
`contracts/portal-execution-owner/ts-oc-08c/command-capability-catalogue.json`.
Research `3d537127` has
`apps/control-api/src/execution-v2/command-trust.ts`, `command.contract.ts` and
`packages/contracts/openapi/execution-trusted-commands.openapi.json`.
Use exact native publication per operation; no requirement to activate all eight
structural capital shapes together. The internal Rust facts/ports are not a
substitute for any of these sources' authenticated wire/commit-time authority.

## Verification and rollback

The isolated runner profile07 uses TEST_ONLY synthetic authority and a real
disposable PostgreSQL. It exercises source-commit/response-loss/restart,
same-key/conflict/CAS, stale/unauthorized/unpublished denial, ACK/nonterminal,
pending/cancel partition, timeout, rollback and private recovery. It is **not**
actual TS effects, native venue acceptance or production capacity. Exact counts,
source hashes and cleanup are recorded in
[verification](verification.json), [immutable qualification](qualification.json)
and the main journal. Final run: **416PASS /0FAIL/skip**, fmt and strict
zero-warning Clippy PASS;75runner +211library +38Edge +22bootstrap +29read
+8resource +11manager +22command cases. Six formal families pass in the isolated
scope, **zero actual TS connected qualifications**. The fresh-process child is
part of one command case, not counted twice.424source and4helper hashes exactly
match the local final candidate; source bytes stayed unchanged throughout.
[Attempt history](attempt-history.json) retains three failed qualifications and
the fixed copy-allowlist/timeout/doc-lint defects; their successes are not added
to the final416count. No lint suppression or weakened test selection.

[Cleanup receipt](cleanup-receipt.json): removed exactly the owned0700
`/tmp/epg10-07-gVjNCDAA`,7364943872allocated bytes; free bytes
160728117248→168093061120. Own PG/sampler/lock absent; public source and bounded
sanitized evidence remain in Git, disposable synthetic rows/logs/cache discarded.
No image build/pull/prune, volume/network/source-data deletion or runtime restart.
[Final reconciliation](final-reconciliation.json) records12HK+5SGP protected
tuples unchanged/restarts0, canonical/stable release locations, all6active Portal
worktrees, peer pins and Docker/BuildKit inventory. All preexisting operational
release/rollback artifacts retained; no new rollback artifact created. Shared
cache cleanup is outside this phase's owned scope/quiet window; SGP root free
25.246% is an observation, not a production capacity PASS.

Rollback disables new sends while retaining all accepted/unknown intent keys and
receipts and authorized status recovery. No automatic ledger TTL or deletion:
finite quota rejects new admission when full; unresolved records never expire
into a fresh executable key. A retention/compaction policy cannot be activated
until source idempotency retention is actually published. Additive migration
rollback must not drop operational receipts or undo/cancel economic amounts.

Reproduction uses `scripts/epg10-04/run.py` with
`EPG10_TEST_PROFILE=07`, exact full `EPG10_PORTAL_REVISION`, and explicit expected
counts: bootstrap22/read29/resource8/manager11/command22. Copy only the bounded
public monorepo inputs validated by the runner, plus its four named helper files,
to a private0700 `/tmp/epg10-07-*`. Honor the host lock and cached PG image digest.
First locked compile may explicitly fetch missing dependencies; every subsequent
Cargo command is offline. Profile07's expanded library regression is bounded at
600s, the total lease remains1500s, and logs stay private/capped8MiB per stage.
These are harness bounds, not production latency/capacity recommendations.
