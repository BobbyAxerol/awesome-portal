# Core C2 prepared issuer + custody composition — 2026-11-05

**SOURCE_ONLY, unmounted; A2 NOT_READY; B2 NOT_SIGNED.** This extends the
prepared public JWKS/reverse-transport composition with an owner-pinned
`bind_custodied_issuer`. The caller supplies an authenticated actor, but
cannot supply a different owner: the registration pins that owner. Issue and
same-original resume go through the existing independent-custody coordinator;
the bearer is not returned before custody append and final revalidation.

The prepared issuer and reverse-settlement transport select the same custody
instance. A mismatching workspace, workload, owner, issuer/audience/kid, or
an attempt to select another store, fails closed; the selection is rechecked
after asynchronous TLS/trust verification. These are local checks, not proof
of source registration, actual authority, TLS installation, an HTTP delivery
fence, independent physical failure domains, or disaster-recovery cutover.
The original candidate still exposes a lower-level unpinned API internally;
it must not be mounted as an issuance route. Owner session/step-up and P7
acceptance are not created by this composition.

## Tests and scope

- `scripts/test-elp2-independent-custody-pg.sh`: **5/5 PASS** on two
  disposable PostgreSQL clusters, including public prepared issuer -> exact
  actor -> durable assertion -> same-original resume, and wrong-owner/store
  refusal. Test-only keys and data; no actual source or Edge ACK.
- `npm test -- test/c2-human-issuer-composition.spec.ts
  test/restore-core-quiescence.spec.ts test/elp210-current-human-transport.spec.ts`:
  **41/41 PASS**, including different-store refusal and selection race.
- Targeted strict TypeScript check: **PASS**.

## Source pins, SHA-256

| Input | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/c2-human-issuer-composition.ts` | `ce9e2ddf76c033a3cc94bac969aba52a493892b1d3ef1f47be2b99a041d8a202` |
| `apps/control-api/src/execution-v2/restore-independent-custody-candidate.ts` | `62ac0279a892179dfcfebdfafacd54ab0f95ff87b07dc4a6e46422bfd5b29bfe` |
| `apps/control-api/test/c2-human-issuer-composition.spec.ts` | `b6da375db2a3aa53c285b513ae2952728fa2f1f3ef353ec3cb3f9829327e48e6` |
| `apps/control-api/test/restore-independent-custody-candidate-pg.spec.ts` | `2a097eba75d01b316026f3f01d6914f8bf17ae592c7c4aab84b99394b6a994ed` |
| `scripts/test-elp2-independent-custody-pg.sh` | `83a59ce01c88d510b8a9aa90163b395fc5f8de3c498f457ff743c8eb269522d6` |

No image/config/schema installed; no real registration, P7, connected source
or ACK proved. Static R1 in the TS exchange is a partial candidate, not A2
acceptance. B2 remains unsigned even though the TS seal was relayed. Next:
complete runtime-bound actor/P7 and custody delivery, independent checkpoint
and post-snapshot original/terminal/ACK reconciliation, then commission and
run the integration gate once the entire candidate is stable.
