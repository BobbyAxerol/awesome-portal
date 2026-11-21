# STATUS HTTP custody test composition — 2026-11-06

**TEST-ONLY / UNMOUNTED; not runtime, source or Edge qualification.** Base
`docs/research-loop-plan@2faa8968f` with shared uncommitted changes. Neither
the issuer nor the privileged metadata reader used below is production
authority. No credentials, live database, listener or frontend were changed.

## What was connected

The existing mTLS STATUS transport now has a separate, explicitly TEST-ONLY
custody entry point; the normal transport retains its existing interface and
the generic composition still refuses the C2 candidate. The test seam validates
peer, context request and exact assertion response before invoking the custody
callback. A deadline while custody is outstanding destroys the response, and
in-flight capacity remains held until the real callback settles. Returning from
a callback without finishing a response does not count as successful send.
Completion remains a separate request; Node finishing a response is not ACK.

The disposable composition queries the immutable context/lease using the
digest of the supplied authenticated context and assertion, exact sequence,
binding, receiver, workspace, owner, workload, issuance/revision and expiry.
It derives original from that record, then sends the JSON through the
restricted delivery procedure and holds the authority transaction through HTTP
finish. The selected reader is deliberately privileged in the isolated test;
the test adapter refuses non-`portal_restore_rls_<8 hex>` database names and
checks reader/writer endpoint identity. Neither that check nor the callback is
an approved production authorization design. Exact role grants, independently
authenticated owner and source, safe runtime wiring and true restart recovery
are still required.

## Evidence

- `npm test -- test/command-source-assertion-transport.spec.ts`: final
  **61/61 PASS** on mTLS loopback with mocked authority, exit 0. The initial
  sandbox run was **8 PASS / 53 FAIL** because loopback listen returned
  `EPERM`; it is not a functional pass. The first permitted run was
  **60 PASS / 1 FAIL** because a finished response's closed socket was counted
  as unaccepted; code corrected, then the final retake passed. Test-only seam
  scenarios include separate completion, no-send refusal and timeout capacity.
- `bash scripts/test-elp2-restore-inventory-rls.sh c2-delivery-procedure`:
  final **4/4 PASS**, exit 0. One test combines mTLS loopback, synthetic
  issuer/context/owner, actual PostgreSQL link and restricted writer. Wrong
  assertion is denied without obligation; valid JSON retains the original from
  the stored context, settles `UNKNOWN`, and has no ACK row. Earlier combined
  run was **3/4 PASS / 1 FAIL** because the test read the committed state as
  soon as the client received bytes, before the delivery transaction settled;
  the retake waits for actual custody completion. Test data and certificates
  are synthetic, and do not establish a genuine Edge ACK or source record.
- Selected strict source `tsc --noEmit` for transport, test delivery and
  adapter with 768 MiB Node heap: exit 0. The selected transport test file also
  typechecked with exit 0. A separate strict typecheck of the large PG test
  exited **134 / heap OOM** at the same cap, not PASS; no full project typecheck
  or normal hook. Container cell configuration is at most 2 CPU / 1.5 GiB; peak usage
  was not measured. Cell cleanup completed and read-only checks found no
  `elp2-restore-rls-` container or network.

## Working-file pins

| Path | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/command-source-assertion-transport.ts` | `49a1437529ce6071969f2724ca76c3856266a87d90d19e953206057a827528bc` |
| `apps/control-api/src/execution-v2/c2-status-http-delivery-test-candidate.ts` | `a378960d7bde7f6d5b505e1231cd60b5d0fb1e2192b1374be8d29303ae6e2fda` |
| `apps/control-api/src/execution-v2/c2-p7-http-delivery-candidate.ts` | `6968fad8cd8d72480eda2876698f8ad24468abde59596bed5aad790278e889f2` |
| `apps/control-api/test/command-source-assertion-transport.spec.ts` | `04301efc1b4b185c85613695ead6ac34198bf7c1b56fc8411ddfc23abe7e63bc` |
| `apps/control-api/test/c2-delivery-procedure-pg.spec.ts` | `398ec710c4b323b6cf49118f03f2f1e3eb1a27d5086bec94f6b76a68c8e9fcde` |

This test pin supersedes the earlier test-file pin in
[role-boundary receipt](CORE_C2_STATUS_DELIVERY_ROLE_BOUNDARY_20261106.md).
Next Core work: combine the actual STATUS authority/preparation and P7 issuer
with the same custody path, qualify a least-privilege metadata reader and
same-original restart/ACK behavior, and verify against Edge when available.
V2 restore authority, A2, connected ELP2-07/09/10 and final candidate gate are
still OPEN. Keep all C2 delivery candidates unmounted; no frontend change.
