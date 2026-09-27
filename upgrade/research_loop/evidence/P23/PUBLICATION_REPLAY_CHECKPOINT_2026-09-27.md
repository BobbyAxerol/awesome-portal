# P23 actual publication journey and terminal replay repair

Date: 2026-09-27 · Codex · branch `docs/research-loop-plan`.
This continues the original eight-group goal; full P23/P24 stays ACTIVE.
No push, shared preview 8095, dev/main merge, Production or AWS-HK/TS change.
No frontend, visual baseline, migration or generated contract change.

## Read/ownership boundary

Read the private goal, root AGENTS, Research A13.1–4, Unified live ledger and
P22/P23/P24, Guide P22 and P22 README/phase report, preceding P23 mixed/restore
packet and cleanup C4. The service/test are the Codex-owned P22 surface.
The existing response already types `replayed`; no new browser field or
source authority is introduced. All runtime actions below use only public
same-origin APIs in `portal-research-p23-ol12` on loopback 8096.

## Actual pre-fix source/product journey

Clean application candidate `b2e8b868` completed WFO
`rrun_90578b81460c44f1a2729b717b3c2c8b`. Its RC read publishes the actual
final-audit linkage and an eligible methodology claim: no additional engine
upgrade/audit adapter is required for this path.

Using only the public draft PATCH, seal POST and publish POST, the test owner
declared explicit test-only restrictions and honest partial/unpublished source
certificates, then sealed `rc_06GE8RZMKKJKK9WD166GZZ1EN0`. Publication returned
`DELIVERED` and created R1 `apr_06GE8S4Q2321P4DY2PPMNNMAK4`. Exact repeat POST
returned the same approval. Read-only cardinality is **one publication row**.

The journey assertion still FAILS: repeat POST says `replayed:false`.
Preserve this receipt, not a new request/approval or an edited PASS. Source
locator: `release-candidate-publication.service.ts`, terminal existing-intent
branch delegates to `publication()`, which intentionally returns a GET-shaped
`replayed:false`.

## Repair and focused proof

After unchanged actor/payload conflict checks, terminal `DELIVERED`/`REFUSED`
POST returns the existing composed read with `replayed:true`. The GET remains
unchanged. No downstream call, intent/receipt rewrite, R1 decision or migration.

Focused `research-release-candidate-publication.service.spec.ts`: **17/17 PASS**;
Control API TypeScript build: **PASS**. Added terminal DELIVERED/REFUSED tests
assert object-identical intent, one begin/downstream call, no retry transition,
same published receipt, GET false and actor/payload 409. The bare request-key/
summary test now also retries after delivery, preserving server-derived bytes.
The mandatory unbypassed workspace gate is captured privately as
`checkpoint/publication-replay-commit-gate.log`; its terminal result is separate
from the focused gate. Next operational proof: build/update only the owned
Control API and repeat the **existing** sealed RC request, retaining the failed
receipt and writing a separate corrected-replay receipt. Runtime correction
and full browser acceptance are not claimed by this pre-deploy checkpoint.

## Scoped tenant proof and graph status

Ten actual named-read/ETag probes PASS: owner reads are allowed; an authenticated
nonmember is refused, with no stale DTO or 304 leakage. This is scoped named
read/cache proof, **not** complete file/export/cache isolation T05.

The earlier coherent restore had an empty publication/selection graph. This
subsequent public journey now creates an actual RC/R1/publication. It does not
retroactively prove nonempty graph restore, GC or approved promotion selection.
T14 stays OPEN until the real graph/pins survive the declared tests.

## Private byte evidence and cleanup

Private root: `/home/bobby/.local/state/portal-research-p23/20260927/runtime/`.
Files are 0600; no raw business response, session/cookie or DSN is committed.

| Receipt | SHA-256 |
|---|---|
| `publication-journey-b2e8b868.json` — actual publish, failed replay assertion | `5b8387b8efb6c2e0a0717ee616adca437a1e9aececac06d427c7a7bd5db8de9a` |
| `publication-idempotency-cardinality-b2e8b868.json` — same R1, one row | `f4838f44f5db89e08735d0c33d53a20d66b13548fb33a74cc7941313ae2c730c` |
| `tenant-named-read-b2e8b868.json` — ten scoped checks | `5e5f01b48810e1fe47290cda0500500585436809c118329936aa9eacc6a3a5b4` |

The cell/evidence/immutable RC/R1 are retained for the still-active qualification.
No approval is removed/revoked as cleanup. Existing named C4 follow-up remains:
at qualification end revoke the 22 test sessions/principals, down only the owned
project without `-v`, and inventory exact DR volumes/backups/rollback images.
No broad prune and no rebuild of unchanged frontend/Python services for this fix.
