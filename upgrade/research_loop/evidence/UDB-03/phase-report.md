# UDB-03 — Backend delivery and retained-preview receipt

2026-10-10 · parent `56f2250b` · `docs/research-loop-plan`.
Scope: only the approved UDB-03 backend/contracts/local retained review and
rich-screen handoff. No frontend source/baseline, dev/main/stable, remote push,
AWS/Edge/Trading DB/Redis/broker/CLI, source refresh or command activation.

## Delivered

1. Versioned `EXECUTION_READ_PROFILE=retained_review_v1`, strict local/dev
   +isolated Execution DSN +exact Paper/Sandbox/Live profiles. Reader
   enablement is separate from refresh worker/transport. Current-source
   default behaviour and stale ceilings are preserved outside this profile.
2. Deterministic read-only projection view: latest accepted nonempty rows
   win; older current entities may fill refused/missing/empty relations with
   explicit earlier-observation reason. Original snapshot payload/digest,
   refusal, source clock and source acceptance never change. Field allowlists,
   profile/workspace isolation and10,000-row hydration bound enforced.
3. Existing list/resource/stage/Blotter/query/analytics/subject reads consume
   that view and bounded legacy history, without mirror-read activation or
   duplicate history. Legacy dimensions come from JSON fields, not invented
   physical columns. Exact decimal strings, UTC and coverage are preserved.
4. Existing54 named aliases get a local variant:200-row/1MiB page bound,
   signed opaque continuation≤128bytes, bound to actor/role/workspace/profile/
   operation/page size/view revision/key/expiry. No continuation DB writes,
   source selectors, upstream cursors or fallback. Uncaptured panel returns
   typed UNAVAILABLE, not authoritative empty. Invalid captured scalar/identity
   fails closed rather than changing its value.
5. Core migration132 adds a preview read-grant table, no role/membership/user
   clone. One owner-audited30-day GET-only grant for existing claude-preview;
   owner comes from immutable Core anchor, ADMIN alone is insufficient.
   Every request rechecks session/user/access; revoked/expired/disabled user,
   wrong resource/workspace/profile/cursor, direct mutations and streams deny.
   Core workflow/catalogues/Research RC→R1 retain their own workspace policy.
6. Typed GET context/OpenAPI/generated examples expose scoped actions,
   original source state separately from retained observations, TTL/expiry/
   revocation and genuine future TS resource-management absence. No invented
   resource-management support or new JWT claims.
7. Read-only streaming absence: bootstrap204/no cursor/private no-store,
   disabled-state header; direct stream404 before fanout/hijack. No fake
   heartbeat, resnapshot, background source work or delegated token.
8. Rich-mount local cost:16 bounded snapshot flights; retained data-view
   memo2s,≤3profiles/8MiB serialized bytes, never permissions. HTTPprivate
   no-store, permission cache0. Existing pool6/queue12 unchanged; saturation
   gets typed503/Retry-After1 instead of generic500. This is not a P23/UDB-04
   mixed-load/SLO qualification or an exact heap-size assertion.

## Actual gates and known attempts

| Gate | Receipt / outcome |
|---|---|
| T01 read/filter/paging/query/UTC/exact decimal | final actual222 HTTP checks PASS; all54 aliases ×3profiles plus actual continuations; account chart point matched stored exact decimal/UTC oracle |
| T02 Core policy/session/action/resource | focused real-PG guards + actual wrong scopes/cursor/source selector/stream checks PASS; Research publication/R1 explicit workspace read preserved; no new Research/Governance membership |
| T03 no upstream/hidden jobs | source snapshots/clocks unchanged across reads; cache0/lease0/source-cursor0/batches100/journal0 unchanged; worker unit proof idle; profile source/SSE/commands flags false |
| T04 rich routes/deep links | original web bundle,18routes+16tabs ×1280/660=68cells PASS;0console/failed requests/page errors/streams/product writes/external data calls; new-context consumer acceptance remains Claude-owned |
| Targeted regression | UDB03 real-PG8 cases; source-current authority4; existing named-operation6; chart/subject regression13; contracts3; configuration/syntax gates; normal grouped commit hook required |
| Custody | Core auth/users/passwords/activation/anchor/grants/membership and all Research run/job/producer/seal/RC/publication hashes unchanged; original19,047sessions preserved; migration125→126 exactly132 |

Machine receipts stay private at
`/home/bobby/.local/state/portal-udb03/apply-20261010T124116Z`:
`core.dump`+SHA, before/after/final-custody, rollback image, actual response
JSONL+individual response hashes, browser screenshots/events and capacity.
No raw rows, backup, credential or environment file is committed.

Final frozen API image:
`sha256:ac7bb2950ecb2b3ec4ba0542f3725ea79205acc69deeeda25b668832a2ed0acd`,
healthy; existing frontend `index-hBXCtrBk.js` unchanged. API222 checks include
216 expected200,2 expected400 and4 expected404. All54 aliases ×3profiles
plus19 actual next-page reads=181 named responses validated against the
retained-page schema; context validated independently. Named pages in this
limit2 smoke max3,423bytes; the200row/1MiB cap is enforced by the validated
query/schema and response byte guard, not inferred from this small page.
Existing rich composite envelopes
can be larger (maximum3,050,463bytes here); that is not the named-page cap.
Serial HTTP p95=396ms,max751ms; **not** mixed-load/SLO qualification.
Browser logout201; closed custody verifies9/9 added sessions revoked and the
original session SHA unchanged. No running Research job was introduced.

Final evidence SHA-256 (private bytes, no raw data in Git):

| File under the private receipt directory | SHA-256 |
|---|---|
| `review-ready-readback.jsonl` | `7598b80da381288ce2710315d8738a8bfa1ae2e50e9c07c76d0506fe867ca961` |
| `browser-ready/browser.json` | `72ab3c75c9238bad4f85ab832d92ebf61f7c2b160e97ebab8bb42b4bda085bea` |
| `closed-custody.json` | `f80b12f3a21cd794f4948aabc2cfb6601f67f324ce7ddb3f033b266f68e2c312` |
| `core.dump` | `c06591fca6a8894ce3ae44e10e5a898a1080cb3e3c01830c245cc12e49c223a7` |

The first API attempts found strict query mismatches in the **test driver**
(Blotter has no environment parameter; analytics is server-bound), a missing
Nest optional injection annotation, legacy JSON-dimension assumptions, and
the chart's partial-state priority hiding stale data. All were fixed; failed
attempts remain separate from final PASS, not erased. Initial browser found
old workspace gates/disabled SSE attempts; backend metadata scopes, named
local readers and intentional204 were corrected. A later browser found one
Portfolio chart500 due to bounded-pool saturation; the2s data-view memo and
typed busy response address that without increasing pool/queue or changing UI.
Several preliminary API image builds were superseded during that diagnosis;
they are not release candidates or substitutes for final receipts.

External identity full-row hash changed through ordinary preview login's
`last_seen_at` telemetry. An offline backup COPY comparison proves both
original binding identities/authority fields unchanged:
`802846c665444dfd6cec276e5a26dd503247ee5fd9c9ed906f35114a12039611`.
No binding/role/user reset. Initial infrastructure review rejected ambiguous
pg_restore tooling in a live-container command; the safe alternative decoded
SQL text using explicit `--file=-`, network-none/read-only disposable tooling,
with **no database target/restore/SQL execution**. Only private comparison
files resulted; that tooling container auto-removed.

## Consumer boundary / no inflated completion

The backend enables the existing rich data paths; it does not certify every
new field as already consumed. New context/action/state labels, retained poll
suppression and existing Alpha360 desktop/R1 mobile visual findings have
exact Claude tasks in [handoff](./handoff.md) and [matrix](./screen-matrix.md).
No visual baseline was re-recorded. UDB-04 entry still requires reviewed FE
consumer receipts and Bobby approval; no source-live or ProductGO claim.

## Runtime / rollback / C4

Only Control API was rebuilt/recreated; existing nginx reloaded to its new
service IP, **web bundle unchanged** (`index-hBXCtrBk.js`). Forward Core132,
audited preview GET grant and private fixed-path profile marker applied using
`scripts/research-udb/retained-profile.sh`, not ad-hoc business SQL. All data
stores/artifacts/identities remain intact. No engine run/import/data rewrite.

Rollback: `retained-profile.sh rollback <recorded-state-dir>` removes only
the validated empty profile marker and restores preserved immutable API
`75e972a8f903c63b1ed79dce6eebbf57d80021484f5d414632b9b54092487325`.
Forward migration/grant/audit/data stay; the grant is inert outside this
profile. Original pool/store remains, no downgrade/destructive migration.
Reuse UDB-02's independent store/restart/restore/hash and actual rollback
proofs; do not rerun unrelated engine/full visual/24h gates.

Owned temporary PG/tool containers auto-removed, no named test volume.
Capacity observation: root168GiB free≈27% (below30% observation, above20%
stop), memory≈12GiB available, no broad prune or production service stop.
Docker inventory includes shared images/cache/volumes belonging to other
campaigns; those are **not** UDB-03 garbage. Backups/private evidence and
original rollback alias retained30days. Phase-owned superseded API image
cleanup must be exact/inactive and cannot delete shared images or volumes.
Runner service observed active; no runner restart/reconfiguration.

C4 completed after checking **all** container image references: removed only
three unreferenced UDB03 superseded API image aliases/images, without force:
`9e268429…`, `32241561…`, `9a16fce5…`. They are rebuildable from this source;
none contains a database volume or retained receipt. Current `ac7bb295…` and
rollback `75e972a8…` protected. No shared build cache/image/volume prune, no
other-phase or production container stop. Owned UDB03 test containers0.

## Closeout and next authority

**BACKEND_PASS / RETAINED_PREVIEW_REVIEW_READY / FE_HANDOFF_PENDING**.
Delivery must land through the repository's normal grouped commit hook;
the hook log is kept privately as `grouped-commit-hook.log`. Backend targeted
gates and current-source regressions are separate from that hook; the hook
does not replace real-PG/API/browser evidence. No rerun of unrelated engine,
visual baselines, unchanged UDB01/02 storage gates or24h soak.
The first hook stopped at the live route ledger: new retained-context GET
was not recorded. Regenerated the canonical ledger270→271, exactly one GET
added/no removals, before retrying the normal hook. Failed hook receipt is
preserved as `grouped-commit-hook-attempt1.log`; no gate was bypassed.
The next hook found the new context schema's draft07 dialect incompatible
with the repository-wide strict Ajv2020 validator. Standardised both new
schemas to2020-12, kept wire DTO values unchanged, registered both fixtures
in the common fixture gate and used strict Ajv2020 in the focused contract
tests. Revalidated the **existing actual** context+181named responses against
that final schema; no engine/API/browser rerun for a schema-dialect repair.
Focused contract+common fixture gates137/137 PASS; generated DTO unchanged.
The failed gate log stays as `grouped-commit-hook-attempt2.log`.
The full Control API gate also exposed old controller test doubles that only
implemented `isMember`, not the new scoped `canReadExecution` method. Updated
the Execution-only doubles/spies without changing the acceptance/denial
assertions or adding an authorization fallback. Research doubles untouched.
These are test-only changes: frozen backend/image and API/browser receipts
remain unchanged; the failed full run is retained as `grouped-commit-hook-attempt3.log`.
That run also found UDB01's historical-ledger assertion assumed130 was the
last migration forever. It now compares **all original ledger rows by original
IDs** byte-exact while permitting legitimate later forward additions132/etc;
identity custody/repair130/rerun-once assertions retained. No migration/identity
was altered to satisfy the test. Full run before these fixes:2463PASS/6FAIL/
3SKIP; five old mock failures plus one obsolete total-ledger assumption.
This phase supplies the rich-screen **handoff**, not a claim that Claude has
already consumed every new field. Review and implement FE-UDB03-01/02;
discuss FE-UDB03-03 visual changes with Bobby. Then request UDB04 approval.
