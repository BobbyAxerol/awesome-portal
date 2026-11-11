# Financial authority — terminal capability and selection snapshot

**SOURCE WIP ONLY; NOT MOUNTED OR CONNECTED.** Checkout
`docs/research-loop-plan@2faa8968fddb` has shared uncommitted changes. This
does not commission P7, financial publication, source authority or ACK.

## Findings and change

The unmounted C2 financial inner adapter deliberately exposes no terminal
proof, so the assertion authority must not allow completion or a successor
based on it. Previously the authority looked up `canReplaceResolvedIssue`
on the mutable adapter at completion time. A new synthetic unit regression
demonstrated that adding such a function *after construction* caused a fake
completion to succeed; this is not an actual Edge ACK or a production exploit.
The authority now captures the initially selected terminal method, if any,
and its receiver at construction. Adding or replacing the adapter property
later cannot create or change the selected terminal capability. An adapter
without that initial method continues to fail closed.

The same server-side registration copied its enclosing selection but passed
the path array directly to schema validation. A second synthetic regression
showed an index getter could run. Registration now copies the six own,
enumerable data elements from a plain non-proxy array before validation and
rejects accessors, holes, extra properties and invalid arrays.

These are internal composition hardenings, **not** independent source
authentication. A malicious implementation already chosen at construction,
or code able to mutate that implementation's internal state, is outside what
method capture proves. Real terminal proof still needs qualified custody and
source/Edge ACK. The financial context is still not durable across restart;
the public composition remains fenced. No public contract was changed.

## Verification and pins

- Before repair the focused two-test selection returned **2 FAIL / 52 SKIP**:
  fake terminal completion resolved and the path getter was accepted.
- After repair, financial assertion, transport and composition suites:
  **3 files / 151 tests PASS**, including synthetic/loopback mTLS. This was
  before a later test-only TypeScript annotation cleanup; the test assertions
  and runtime source remained unchanged.
- The focused source-and-test strict TypeScript check initially returned exit
  2 because earlier test mocks narrowed `Uint8Array` to `Buffer` and inferred
  `Promise<undefined>`. After correcting test types, the same check passed
  with a 768 MiB Node old-space limit; a retake of the changed assertion test
  file returned **55/55 PASS**. These counts overlap and must not be added.
  No full-project typecheck or normal hook is implied.
- Tests used in-process/loopback synthetic identities, no persistent test DB
  or container. Actual peak resource usage was not measured; `/home/bobby` had
  249 GiB free at observation. No runtime, Edge, credential or UI was changed.

| Working file | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/financial-source-assertion.ts` | `90dfab583d64969844178e1588b9a21bf8b206b258917e2d2e0069c18648099c` |
| `apps/control-api/test/financial-source-assertion.spec.ts` | `e36e6b8253a305dbb0fad9f7fcdd69f73757f6131406155a220b21f82e622a18` |
| `apps/control-api/src/execution-v2/c2-financial-assertion-inner-candidate.ts` | `167678eca95df660a12f3ef3aae82a3fc7fd70233739428bcd9fd6bef74cc6f5` |

Direct-file pins supersede earlier pins for changed files, not a complete
candidate/image/dependency hash. Continue durable original/context/lease
recovery, independently qualified owner/source/field authority and sole HTTP
custody, then genuine Edge APPLIED/ACK and candidate integration. Claude has
no new consumer field or action from this slice. Rollback is to leave the C2
candidate unmounted and retain the existing fail-closed configuration.
