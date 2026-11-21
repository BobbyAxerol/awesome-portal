# ELP2-04 — Exact heartbeat capture, not public commissioning

## Approved scope and entry

Existing backend02–11 batch; local branch `docs/research-loop-plan`, entry
f1f5fc7d. Apply only static collector catalogue, declared mirror key and a new
disposable-PG spec. No new source request job, route/schema/grant/default or
runtime activation. New code/tests **APPLIED/UNCOMMITTED/NOT_RUN** at entry.

Actual generated source identity is `managerServiceHeartbeatsPageV1`,
`manager.current.service-heartbeats`, `service_heartbeats`, declared TEXT PK
`service_name`. Capture exactly `service_name,last_seen_at,status`; omit
instance topology and arbitrary fields. `status` is uninterpreted source text,
not health/component/state. Null clocks remain null, not observation time.

## Changes and validation

`profile-projection.catalog.ts` adds one existing command-center binding per
enabled source profile. `durable-mirror.repository.ts` adds its exact PK;
no body-hash pseudoidentity. Same source name remains workspace/environment/
profile scoped. No table/migration or parallel collection path.

`elp204-heartbeat-capture.spec.ts` proposes15 cases through actual worker,
decoder, repository/mirror and disposable PG, all source envelopes synthetic:
finite catalogue/PK/allowlist, exact scalar capture, same-PK update, disabled/
retained profiles inert, profile isolation, PARTIAL/UNKNOWN/stale clocks,
10-page/2000-row complete-versus-continuation behavior, typed unavailable,
profile mismatch and cursor cycle. These are NOT source/TLS/runtime proof.
Existing profile-projection/bracket/mirror tests are impacted; validate once
with the coherent normal-hook batch. Source capacity/latency NOT_MEASURED.

## Explicit activation/publication boundary

There is no runtime change in this slice. **Deploying this static catalogue
into an already enabled worker would add a request on its next refresh**.
Therefore it is not described as an inert opt-in collector after deployment.
Existing legacy retained readers may surface these allowed fields if permitted
to read that snapshot. No guarantee of private-only capture is claimed.

V2 public purpose remains null. All29 null-purpose relations still require
review; this does not commission a technical reader. Exact ROOT maintenance
scope, reviewed public state/component semantics, source qualification and
consumer acceptance remain OPEN. No researcher business/linked scope fallback
is added. Estimated incremental bound is <=10pages/2000rows per enabled profile
per normal refresh, not measured load or approved production budget. Existing
Live concurrency2 and Paper/Sandbox1 are preserved, not flattened to one.

Claude has no new product field from this slice. UXM remains owner-held.
Backend can continue exact technical authorization/publication and other
named relations independently. Rollback removes the exact new binding/key in
a reviewed forward patch, preserving already retained rows and audit. Clean
only the shared gate's exact disposable resources; no service/flags/source,
SSE/command/Live, push, dev/main or deploy action.

## Private ROOT-scope follow-through —2026-10-17T12:27UTC

APPLIED/UNCOMMITTED, tests NOT_RUN. The earlier exact ROOT scope gap is now
implemented privately in `read-scope.ts`; this supersedes only that local
implementation gap, not the source/public-reader commissioning above.
Rechecked inputSHA256
`8158bd57c60dc2ca83bd3df22db46685dc7992c608e399935bdfc17981c1d70c`.
Independent draft/review contributed the finite branch; primary integrated it
only after the old gate became terminal. No private draft is itself a receipt.

`authorizeTechnicalProfile` preserves its three-argument behavior and adds
one optional internal dataset binding. Only maintenance.read + exact
`relation:manager.current.service-heartbeats:service_heartbeats`, null window,
explicit generation/catalogue and one current environment ROOT may use it.
Publication must identify exactly that ROOT, no economic tuples or linkage.
Common publication double-read, current Core grants/session/revision and
delivery fences remain. No business/researcher fallback, full accounting,
new grants, arbitrary technical dataset, public route, schema or DTO. Public
purpose remains null. Catalogue may explicitly be null under the existing
binding contract; omission is not a retained identity.

Independent review found the initial ROOT provider await outside the existing
safe error boundary. Reuse one sanitizer around the entire technical helper
and ordinary authorize: preserve typed errors, retry409, actor/resource404,
pending403, scope-limit503, otherwise fixed safe authority503. Never expose
SQL/provider prose. This also protects existing dataset-less technical calls.

`elp204-heartbeat-root-scope.spec.ts` adds42 expanded actual-Core-PG tests
with synthetic source/policy/grants only: exact maintenance positive without
business/qualified researcher policy, unrelated root/action/dataset and
publication negatives, no economic census, actual session/grant revoke,
publication/context drift, caller mutation, initial provider errors and retry
mapping with/without dataset. Run alongside impacted existing read-scope,
technical/runtime and capture suites in one bounded correctness cell.
No test is source, held cross-authority COMMIT, browser, latency or G2 proof.

Remaining04-008/009 work is still real: finite safe service/component/status
mapping and keyed identity, source clocks/qualification, reviewed public
purpose/DTO/reader and consumer acceptance. Other28 null-purpose relations
are unchanged; the heartbeat alias itself also stays closed. Claude still
has no new field to consume from this private increment.

**Impacted validation12:35UTC:** APIbuild and all42 ROOT-scope cases PASS
in the shared actual-PG cell. Capture14/15 PASS; the remaining new assertion
incorrectly expected an exception where the existing coordinator instead
persists RECOVERING and refuses the Paper commit. Exact failure and narrow
test-only correction are in [06 terminal](../ELP2-06/original-restated.md#elp206-restated-focus-1235).
No whole-batch PASS or restore receipt claimed. Normal hook will exercise the
corrected recovery/no-mirror/other-profile assertions. Public mapping/source
qualification and the sequential-versus-held-native-fence limitation stay OPEN.
