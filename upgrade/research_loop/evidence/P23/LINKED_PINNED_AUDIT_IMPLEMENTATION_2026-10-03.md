# P23 — original-byte-pinned linked final audit

2026-10-03 · Codex · **IMPLEMENTED / FOCUSED_TESTED; PRODUCT_RECEIPT_PENDING**.
The delivery commit is the commit containing this receipt. Do not mark P23,
P24, all profiles or release GO from these focused results.

## Scope and authority read

Root/module AGENTS, backend architecture, Unified P22/P23/P24 and Research
A13 working rules; backend queue §31/addendum, §34–39; P22 reader runtime
receipt; P23 mixed-load/historical exception and independent WFO receipts;
P24 acceptance matrix and Claude FE-W1–W7 packet were reconciled. Shared
Research currently includes Claude's `e267d44f`…`a9ff796a`; this backend lane
does not edit or stage any frontend file.

The approved functional change is explicit `AUDIT_OF_SELECTION` admission for
an original global Delta selection whose retained replay cannot be reused.
QuantBT is still the installed pinned 1.1.1 wheel. There is no new optimizer,
selection, dataset load, parameter override, engine source or browser CLI.

## Delivered code boundary

- Named authenticated GET/POST `/api/v1/quantbt/runs/{run_id}/final-audit`.
  GET is read-only. POST requires existing ADMIN producer authority,
  same-origin Origin, session-bound `x-portal-csrf`, workspace membership and
  a strict body containing only client intent and the server target digest.
- Private target preparation verifies original sealed manifest/config/
  selection-Parquet/snapshot bytes. No path/raw config/params reach the
  browser. Source pin drift or unsupported precision is a typed refusal.
- Actor-bound idempotent allocation uses the same diagnostic/export/verify
  quota (workspace 4, actor 2), durable job/outbox and existing worker lease.
  The original snapshot metadata is copied into an actor-bound immutable
  preflight record; the audit does not impersonate the parent's actor or
  perform a fresh HMD preflight.
- Confined native evaluation preserves resolved source settings, account,
  windows, guards, seed and frozen params. `optimization_mode=none`, zero
  Optuna trials, no ranges or reselection. The native fixed-evaluation index
  0 is preserved as a native fact, never presented as an optimizer trial.
- Dedicated P05 Arrow/Parquet custody retains native equity, fold, account
  and lifecycle tables plus an audit result. ACK is conditional on actual
  observed manifest/parts/documents and the current lease fence. The worker
  may only finish after the immutable proof ACK.
- Migration 094 adds immutable RLS-scoped target/proof tables and preserves
  all old producer profiles. Report adds proof outside its frozen core;
  Lineage exposes verified children; a newly composed/sealed RC may freeze
  a proof only for exactly the original selected params. Old seals and
  Reports are never rewritten.
- P22 still promotes the **parent selection**, not the zero-trial child.
  A relationship label, READY state, missing proof or forged frozen proof
  is not sufficient publication authority. Same-run reusable audits remain
  supported by their existing sealed-pack rule.

Qualified linked profile: `p23.delta-pinned-final-audit.v1`, SHA-256
`457267c54edd02fcea53eceb92a81cdec9fdaefc8b9231638540b51a85b92491`.
It is a global, single-parameter-set Delta audit. Per-fold causal selection
must not be flattened to a last-fold map; it answers
`PER_FOLD_TARGET_SEQUENCE_REQUIRED` until an individual target sequence is
implemented. Imported strategies and unsupported native profiles remain
typed outside this exact profile, not fabricated audit runs.

## Focused evidence — no fixture-as-product claim

| Lane | Actual result | What it proves / what it does not |
| --- | --- | --- |
| Control audit/controller, Report and publication units | 61/61 | Origin/CSRF, no GET allocation, exact byte observation, stale target, typed outages, parent promotion/proof mapping; mocked ports, not a live product receipt. |
| RC retained units | 22/22 | Non-reusable generation history becomes linked only with matching verified params/proof; old frozen Report unchanged, mismatch remains absent. |
| Disposable PostgreSQL through migration 094 | 5/5 | Real admission, actor-bound snapshot identity, one outbox, RLS, in-flight conflict, lease/proof immutability, frozen-proof P22 positives/negatives and shared diagnostic quota. Bootstrap sources and terminal-state setup are explicitly synthetic. |
| Pinned Python native fixture suite | 21/21 | Actual installed native engine, isolated namespace child, zero optimizer trials, unchanged original bytes, target/config/selection/seed/path/precision negatives, native retention parity. Mocked Control ACK in the producer test is not a product ACK. |
| Canonical final-audit/progress fixtures | 5/5 | Seven named state examples and zero-trial progress; fixtures are explicitly synthetic. |
| Owned offline proof-script checks | exit 0 | Exact image/source mounts, zero-optimizer receipt validation and scope distinction. |
| Official generation / generator check / Control build | PASS | OpenAPI/generated types and strict source compile; normal grouped commit hook remains the landing gate. |

Failures are retained, not relabelled: preparation initially appended the
retained root twice (fixed by separating outer-store and resolved-artifact
verification); PG fixture initially missed the parent worker fence; the
P22 three-pack negative fixture initially reused the same draft/fingerprint
unique key (fixed fixture identities, constraint untouched). The Python
Numba cache now uses the test tmpfs, not a read-only source path. The
earlier native HMD proof remains below admission/registration, not a product
receipt; this slice does not reuse it as end-to-end acceptance.

The first normal commit hook stopped before the full suites: the P01 live
route ledger lacked the four new static routes (two public, two internal).
The official `--write-live-routes` generator adds those exact routes only,
removes none and preserves the protected-kernel digest; `--live-routes`
then passes. Capability inventory separately declares the public/private
Control ownership. The hook is retried after this required ownership-ledger
correction, not bypassed; the initial failure is not counted as PASS.

The second hook reached canonical contracts (266 pass / one failure): the
new emitter expanded two schemas that the existing causal generator owns in
compact canonical form. There was no semantic/custody change. The final
emitter now composes the existing causal amendment for those shared readers
instead of fighting its format; no test was weakened. The new audit security
scheme also names the actual `__Host-portal_session` cookie. Regeneration,
snapshot and the affected contract group are checked before normal retry.

The third hook passed canonical contracts and reached the full Control suite:
1,878 pass / one skip / one failure. The old P22 settlement fixture had an
empty frozen pack and relied on the child relationship label alone. It now
supplies explicit same-run sealed replay authority, with an eligibility
assertion; the new verified-child negatives remain unchanged. This is a
synthetic settlement fixture, not retroactive evidence for any live child.

The owned P23 helper had the same sudo source-stamp loss already fixed in the
shared-preview helper. Its Compose invocation now forwards only the validated
commit/dirty metadata, with no blanket environment preservation or secret
output. The exact-prefix/stamp negatives are checked before candidate build.

## Frontend handoff

Official generator: `npm run generate:research-final-audit` in
`packages/contracts`. New operations/types:
`researchLinkedFinalAuditGetV1`, `researchLinkedFinalAuditCreateV1`,
`components.schemas.Read` / `Create` / `VerifiedPinnedAudit` from generated
`research-final-audit.d.ts`. Report/RC/Lineage have additive optional proof
fields. Never parse claim/rail prose, infer proof from READY, use the child
as a promotion pick, or overwrite old Report/core values.

States: READY_TO_ADMIT, QUEUED, RUNNING, AWAITING_VERIFICATION, VERIFIED,
FAILED, CANCELLED. Respect server `may_create`, opaque `target_digest`,
`progress_href` and typed refusals. No automatic POST on mount/refresh.
The browser integration/real API acceptance is still pending; no layout,
colour, typography or baseline change is required by this backend slice.

## C4 and remaining full goal

The labelled disposable PG container `portal-pinned-audit-pg-20261003` was
stopped and removed after tests; its data was tmpfs with no persistent volume.
The isolated Python unit container removed itself. No image, runtime volume,
backup, source data, QA identity, shared :8095 worker or production resource
was deleted/changed. Disk 184 GiB free (71% used), RAM ~12 GiB available,
swap 0: **NO_ACTION_NEEDED** for cache pruning.

Next: normal hook/owned commit, safe rebase/FF onto clean shared Research;
build only changed owned :8096 dependencies and obtain genuine authenticated
admission → confined child → P05 proof ACK → Report/RC/Lineage receipt.
Then exact latest FE/BE candidate, authentic JSON 502, restored-DB browser
and image/bundle parity. Existing P22 GET receipt is already accepted.
Three original missing historical manifests (83/86), a genuine second
qualified engine and P24/signed release remain distinct unresolved gates.
No remote push, dev/main merge or production activation is authorized here.
