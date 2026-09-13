# R3-2 — Profile qualification, realtime/DR and governed-command closure

**Status:** `CODE_COMPLETE_DEV_CANDIDATE_READY_FOR_R3_4`  
**Date:** 2026-09-13  
**Branch:** `feat/execution-loop-next`  
**Runtime effect:** none — no service, profile flag, source route, command,
database, image or stable release was changed.

## Outcome

R3-2 turns the remaining R3 operational assertions into checked server-side
contracts. The Portal continues to consume current data only through its
same-origin named BFF and private Manager-v2 mTLS/delegated-JWT transport. It
does not access a Trading System database, `live_data_executor`, Source Proxy
upstream, Redis, broker or shell/CLI.

The phase delivers four versioned facts:

1. independently bound Paper, Sandbox and Live current-page qualification;
2. a strict Market Context source-gap record rather than a Portal fallback;
3. a bounded local realtime/DR contract with an honest R3-4 evidence boundary;
4. an exhaustive command/governance authority census with no generic relay.

## 1. Current-source qualification

The private D3 run `D3-AUDIT-20260913-R3-2` was performed separately for all
three profiles. It called only the Manager metadata endpoints
`catalogue`/`capabilities` plus the legacy compatibility observation. It never
requested a relation page, record, order, fill, event, cursor, source row or
command.

| Profile | Catalogue | Metadata capabilities | Transport | JWT negatives | Private evidence SHA-256 |
| --- | ---: | ---: | --- | ---: | --- |
| Paper | 96 | 5 | TLS 1.3, HTTP/2, mTLS | 13 | `sha256:8c73626aa8964df241946fa4d243b00fff198686fd4371381bb35485067fe987` |
| Sandbox | 96 | 5 | TLS 1.3, HTTP/2, mTLS | 13 | `sha256:f77687888d14c2349c412d243f44de38e8c72cac6fe85c0b87f4d9ff5e4c8a65` |
| Live | 96 | 5 | TLS 1.3, HTTP/2, mTLS | 13 | `sha256:4d982bb73abeee55e7b716f72713ad8b19a33f82b6696a9914da52390acc7257` |

Each run rejected missing assertion, wrong signature/key/issuer/audience,
expired/too-long/future token, wrong environment/scope/resource/profile, and
missing/incorrect client TLS identity. Private evidence is `0600` outside Git;
the committed manifest contains only its hash and summary.

`apps/control-api/src/execution/r3-profile-qualification-ledger.ts` combines
that transport fact with the immutable accepted E5 named-operation registry:

| Environment | Current page state | Empty semantics | Market Context state |
| --- | --- | --- | --- |
| Paper | `QUALIFIED_CURRENT_PAGE_READ` | exact current empty is returned by named BFF | `PAPER_TYPED_UNAVAILABLE_PENDING_REQUALIFICATION` |
| Sandbox | `QUALIFIED_CURRENT_PAGE_READ` | exact current empty is returned by named BFF | `PROFILE_NOT_QUALIFIED` |
| Live | `QUALIFIED_CURRENT_PAGE_READ_WITH_EMPTY_AUTHORITY` | authoritative empty is an honest result, never copied from Paper | `PROFILE_NOT_QUALIFIED` |

The 54 screen-bound relations remain fixed named operations with the existing
200-row / 1 MiB source-page ceiling. The full 96-relation disposition remains
in R3-1; this phase does not create browser relation selectors.

## 2. Market Context decision

The Paper one-shot sealed probe was repeated against the active topology under
the existing contract. mTLS and the profile-bound delegated JWT reached
Manager, but `latest` returned the typed `502`
`MANAGER_V2_SOURCE_CONTRACT_REJECTED`. Inspection confirmed the active Manager
image/config lacks the newer Market Context handler despite the Source Proxy
allowlisting the route family. The newer Trading System worktree contains an
adapter, but it is not deployed and R3-2 does not deploy it.

Therefore the Portal leaves Market Context typed unavailable. It must **not**:

- scrape the Data Layer, connect directly to a source DB/Redis, or use a
  public exchange as a disguised source fallback;
- infer Sandbox/Live acceptance from Paper;
- turn a proxy route or feature flag into runtime qualification;
- fabricate candles, ticks, benchmark, calendar or VNM values.

The exact owner action is narrow: deploy a signed Manager-v2 image/config with
the already specified bounded `latest` and `candles` adapter, then issue a
fresh Paper GET-only proof. Sandbox and Live are separate later proofs. This
is an external source capability state, not Portal technical debt.

## 3. Local realtime and DR boundary

`r3-realtime-dr-contract.ts` freezes 12 scenarios:

- data-before-status cursor ordering and `Last-Event-ID` resume;
- membership revocation, downstream abort and hidden-tab coalescing;
- gap/resnapshot and source `429`/`502`/`503` pacing;
- Edge/JWT refusal, worker restart and profile isolation;
- source-dark stale-last-good and image-only rollback.

The Portal realtime authority is its own PostgreSQL projection journal with an
opaque `epoch:sequence` cursor. It is a local current-observation lane, **not**
an authoritative Trading System event replay: no global ordering, correction,
retention-floor or total-history claim is made.

The fixed local cost boundary is 250 ms tail polling, 1 s health polling,
16 scope groups, 256 subscribers per scope and 32 pending messages per scope.
Source reads remain bounded by the R3-1 cross-replica admission limits and
cannot grow per browser connection.

Existing test coverage already exercises two in-process API replicas sharing
PostgreSQL and separate same-origin EventSource/DOM behavior. R3-4 must run
the deliberately distinct deployment-shaped proof: two **OS processes** using
one disposable PostgreSQL instance, a real browser, rendered candidate image
and no-update visual baseline. This is an explicit release evidence boundary,
not a missing runtime implementation or an excuse to claim synthetic SLOs.

## 4. Governed commands and governance

The server-only `R3_GOVERNED_COMMAND_LEDGER` enumerates 100 entries from every
currently known Portal action, operator task and source command-catalogue row.

| State | Count | Meaning |
| --- | ---: | --- |
| `MUTATION_CONNECTED` | 5 | Portal-authored workflow with route policy, CSRF, resource versioning and audit outbox |
| `LOCAL_R0_READ_CONNECTED` | 4 | existing Portal-local read task; still subject to its feature/config gate |
| `READ_ONLY_SUPPORTED` | 2 | bounded read task, no source command relay |
| `POLICY_BLOCKED` | 51 | source command route exists but exact relay is disabled |
| `SOURCE_NOT_COMMISSIONED` | 35 | no exact source route/mapping is published |
| `NOT_APPLICABLE` | 3 | direct/destructive host procedure is intentionally not exposed |

Every row includes owner, actor role, browser CSRF/step-up state, idempotency,
audit lineage and plan/apply/verify semantics. `sourceSideEffectRequested` is
false for every row. Nothing in this phase enables a Trading System command,
generic CLI relay, broker mutation, promotion or certification.

## 5. Dev candidate and rollback

The candidate manifest binds:

- source contract revision/catalogue and the three fresh private D3 hashes;
- exact source hashes for the three R3-2 ledgers;
- a deterministic hash over tracked non-secret compose/config inputs;
- the Market Context typed gap, local realtime boundary and command census;
- required later signed-image/SBOM/provenance inputs and an image-only rollback
  pointer.

It is explicitly a dev handoff for R3-4, never a stable release declaration.
The rollback rule is forward-only additive migration plus image/config pointer
replacement: no `down -v`, volume deletion, cache/projection purge or source
data mutation.

See [`execution-r3-2-dev-candidate-and-rollback.md`](../../deploy/runbooks/execution-r3-2-dev-candidate-and-rollback.md).

## 6. Verification

Completed in this phase:

```text
Fresh D3 live read-only audit: Paper + Sandbox + Live: PASS
  96 catalogue relations / 5 metadata capabilities each
  TLS 1.3 + HTTP/2 + mTLS + 13 JWT negatives each
  no business row, raw payload, runtime mutation or command

Focused Control API Vitest: 5 files / 14 tests: PASS
Control API production TypeScript build: PASS
```

Static candidate verification additionally checks digest bindings, config
fingerprint, redaction, immutable release inputs, Market Context fail-closed
state, current-source D3 runner and offline Market Context proof.

## 7. Handoff

**R3-3 / frontend:** bind only the browser-safe runtime manifest capability
states; retain rich layouts and render empty/partial/stale/source-gap states
inside panels. Do not enable Market Context or a source mutation based on a
route's existence.

**R3-4 / integration:** render one dev-only immutable candidate, run two OS
Control API processes against one disposable PostgreSQL, then verify real
browser EventSource/DOM behavior, image/config identity and rollback pointer.
No stable/main rollout is implied by this document.
