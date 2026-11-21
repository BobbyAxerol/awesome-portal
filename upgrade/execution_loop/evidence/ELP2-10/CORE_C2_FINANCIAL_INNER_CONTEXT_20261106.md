# C2 financial assertion inner composition — 2026-11-06

**SOURCE WIP ONLY / NOT MOUNTED.** Checkout is
`docs/research-loop-plan@2faa8968fddbde59b2e59525e334ba3d83886144` plus
shared uncommitted changes. No listener, runtime, authority, source, grant,
contract, migration, frontend or service was activated or installed.

## Change

The existing financial assertion authority previously called a candidate
with only a request digest. The C2 custodied issuer needs the actual request
bytes to recompute and fence that digest. The authority now also accepts an
internal exact-byte candidate port. An unmounted C2 inner adapter connects that
port to the existing C2 owner/workspace/workload and P7 custody checks.
Previously selected non-C2 candidate calls remain unchanged. Request buffers
are freshly reconstructed for issuance and revalidation from the validated
UTF-8 request; response bodies are not returned. The port does not provide
`canReplaceResolvedIssue`: terminal and successor issuance therefore remain
fail-closed rather than inferring an ACK from a source result.

This connects a useful local code path, **not** the production composition.
`FinancialSourceComposition.create` still refuses the C2 configuration and
no approved source-selection, independently authenticated owner or qualified
HTTP custody is supplied by this helper. Do not mount it. It also does not
persist the financial context or make restart recovery available.

## Verification and pins

- The two-disposable-PG P7 harness returned **9/9 PASS** with synthetic keys,
  actor and source. Its owner-intent case ran the actual financial context →
  C2 inner adapter → C2 custodied issuer, retried the same request and checked
  an altered body is rejected. A newly constructed adapter resumed the same
  lease separately. This is not an OS-process restart, real financial data,
  source acceptance or an Edge acknowledgement.
- Three impacted financial assertion/transport/composition files returned
  **148/148 PASS**, exit 0, including a bound-port test of independent request
  buffer reconstruction, refused terminal and refused vanished-context retry.
  mTLS tests use loopback and test identities. An earlier run before adding the
  bound-port negative returned 147/147; the counts overlap and must not be
  added together.
- Selected source-only strict TypeScript check passed with a 768 MiB Node
  old-space cap. This is not test-inclusive typecheck or the normal hook.
- The two-PG cell is bounded to an aggregate 2 CPU / 1.5 GiB and cleaned by
  its exit trap; root-Docker read-only listing found no `elp2-c2-p7-` test
  containers afterwards. Actual resource peaks NOT_MEASURED; root filesystem
  snapshot showed 250 GiB free.

| Direct working file | SHA-256 |
| --- | --- |
| `financial-source-assertion.ts` | `48d7132800ab68edc07a9a2fde14c6620744c2b0302f73d82abca416a4e8db2a` |
| `c2-financial-assertion-inner-candidate.ts` | `167678eca95df660a12f3ef3aae82a3fc7fd70233739428bcd9fd6bef74cc6f5` |
| `c2-financial-authority-adapter.ts` | `71b2db58505933fe47b4c54deb4643cc46deb7079f1c2673edc9e13bf6a7e4a4` |
| `c2-custodied-issuer-candidate.ts` | `7ddbe383142ccd24692e8ef936030890040e3f9551bb8f51953837768bc1f98f` |
| `c2-p7-owner-intent-candidate-pg.spec.ts` | `7dd6b8bde72771e3e079b193e6c7d33b782df01f01b804cd0ec9608ea39df8b9` |
| `financial-source-assertion.spec.ts` | `dcdcbbe7b82d9579a38cd1257ded0ecc6a6879ac0bc776b75b1a725520754ebb` |

These pins supersede earlier direct test/source pins where the same file has
changed; they do not pin the transitive tree, schema, image or runtime.

## Next / consumer and rollback

Core still needs durable context–original–lease linkage across process loss,
qualified owner/source/field authority and custody through actual HTTP finish,
plus terminal/ACK and independently fenced V2 restore. Edge must provide the
genuine financial source and APPLIED/ACK proof; fixture values are not that
proof. P7/A2, qualification, migration and final integration remain open. No
new frontend field or consumer change is requested; Claude can continue using
the separately identified fixture lane. Rollback: retain the existing
fail-closed C2 configuration and leave the inner candidate unmounted.
