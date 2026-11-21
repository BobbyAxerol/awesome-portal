# P7 retained-intent retry candidate — 2026-11-05

**Source-only candidate, not a restore barrier, P7 acceptance or A2.** On
`docs/research-loop-plan` at committed HEAD `2faa8968f`, the files below are
uncommitted working-tree changes; no runtime, schema, role or source was
installed. The P7 startup/issuer fences stay in place.

The independent witness store now has a bounded `retainedIntent` lookup. It
verifies the stored encrypted envelope before returning a cycle's intent ID;
an unreadable/tampered row fails rather than appearing absent. After verifying
the separately signed owner attestation, the signer uses this lookup. If a
witness exists it takes only the existing `resumeByKey` path and requires the
located intent to equal the retained ID. It cannot use the create path in
that observed state. If no witness exists, the existing create path remains.
The store lookup is not an authenticated owner session or source decision.

## Verification

`bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: **9/9 PASS**, exit 0,
with two disposable PostgreSQL clusters and synthetic owner/source/keys.
Existing same-original replay still succeeds. New cases reject a different
idempotency key without increasing the intent count, and simulate failure to
locate the original under the same key while a witness is retained; the
signer refuses without creating a new intent. The latter test temporarily
disables user triggers and changes a synthetic row in the disposable test
database, restores it, then re-enables the triggers. A wrong custody key also
fails rather than treating the retained row as absent. The test harness cleans
its own containers/network. It does not restore an actual backup or establish
an independent operational signer/provider.

Focused strict TypeScript checking of the modified signer and witness custody
sources completed with exit 0 (including the Fastify cookie type context).
This is not a full-project or test-inclusive typecheck, normal hook or build.

| Working-source input | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/c2-p7-owner-confirm-signer-candidate.ts` | `e07a24ba886868efa3312b5ddfbd2d44aab3faa52d08792fd83d9c06e757e29f` |
| `apps/control-api/src/execution-v2/c2-p7-owner-witness-custody-candidate.ts` | `59ce07f06ac54938801bc4339f1254c604bc1567df7431545014380654b04fe6` |
| `apps/control-api/src/execution-v2/c2-p7-review-candidate.service.ts` | `c18ebd1acab20e467cc5e11453394a659e57cbe7ea0c2b41f576f88ec72f3f4d` |
| `apps/control-api/test/c2-p7-owner-intent-candidate-pg.spec.ts` | `b1de893c10b82d28e8ca8c4a2959a915cd448eb20cec97645793078ce6ea740b` |
| `scripts/test-elp2-c2-p7-pg.sh` | `daa31f5783e43c1812dc355ab0a3e9e505aa54b3ca3b347ae544c9f3e15f60da` |

## Remaining limits

The observation is not held as a cross-database lock across intent creation:
a concurrent restore/old writer or an empty, lost or rolled-back witness
store can still invalidate it. It also does not cover a crash after intent
commit but before witness retention. Independent durable pre-creation
reservation/provenance and old-holder fencing remain necessary. Real owner
authentication, independently operated signer, schema/ACL qualification,
source/ACK census, representative restore and integrated hook are still open.
No frontend contract or action is introduced.
