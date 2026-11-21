# Financial and STATUS retry fences — 2026-11-06

**Source WIP only.** Neither transport nor issuer is newly mounted; no Edge,
source, credential, grant, command, Live or runtime was changed. Baseline is
`docs/research-loop-plan@2faa8968fddb` plus the shared uncommitted worktree.

## Findings and changes

For both financial and command STATUS, an exact retry could start a current
authority revalidation, pause, and return its old assertion after another
request completed that delivery and selected a successor. The isolated tests
use synthetic candidate ports; they establish this in-process race, not a
real-source exploit. Both live paths now verify that the delivery object is
still selected after the shared issue settles and after revalidation. STATUS
also checks again after its final asynchronous current-authority read.

Like the financial issue recorded in
`CORE_FINANCIAL_REVALIDATION_CAPACITY_20261106.md`, STATUS revalidations were
not included in the authority's shared pending count and limit. The STATUS
revalidation itself is now counted and bounded to 16 in-flight operations,
retains its context until settlement and releases the slot on either outcome.
Other STATUS authority reads and their end-to-end egress are **not certified by
this change**; review their independent bounds and all actual runtime paths.
Neither change creates an issue, ACK or source receipt.

## Focused verification

- Before repair, financial's new stale-retry test failed (**1 FAIL / 50 PASS**)
  because it returned the superseded synthetic assertion. The separate
  STATUS stale-retry and capacity tests each failed in focused runs
  (**1 FAIL / 83 SKIP**, **1 FAIL / 84 SKIP**, respectively).
- After repair, six financial/STATUS authority, transport and composition
  files passed **321/321**, exit 0, including local mTLS listeners. The
  synthetic tests do not qualify Edge, native ownership or HTTP custody.
- Strict source-only TypeScript checking of both modified authority roots and
  their imports passed with a 768 MiB Node old-space cap; this is not the
  full test-inclusive typecheck or normal hook. `git diff --check` on code
  and test paths passed. Resource peaks were not measured; the tests created
  no persistent container or database.

| Working file | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/financial-source-assertion.ts` | `ec55f66529895329a0433fab46f540e089b2493a3247653ed27fb7fe71aab744` |
| `apps/control-api/test/financial-source-assertion.spec.ts` | `e9c6f025cb0d32a7ebdf0c82b1dddbe5b83c0e0ff66f480d27526b320962ae0b` |
| `apps/control-api/test/financial-source-composition.spec.ts` | `1ad22a5585437e9ff9400c06b0d0d3a07d3cd6a20643591bfb9b0623d8dc955a` |
| `apps/control-api/src/execution-v2/command-source-assertion.ts` | `550aad00fd107071ea0dfb40b373100f518ba1b36e46ac7d3fb76d582fbd608c` |
| `apps/control-api/test/command-source-assertion.spec.ts` | `a718c7f7215e68a3af32466e04e5a7901efe1b9b851a060f39492b2ed4b33cba` |

The earlier financial receipt's hashes record its earlier source state and
must not be mistaken for the final files above. This retake is not a frozen
candidate or a dependency hash.

## Remaining

C2 financial still lacks durable context/original/lease composition and
qualified HTTP custody; its existing C2 refusal remains in place. STATUS
recovery still needs qualified runtime authority and genuine source/Edge ACK.
Independent P7 ownership, A2, recovery V2, financial source/APPLIED → ACK,
G2, browser and integrated gate remain open. No frontend action is requested.
Rollback is to keep candidate transports unmounted, not to remove the fences.
