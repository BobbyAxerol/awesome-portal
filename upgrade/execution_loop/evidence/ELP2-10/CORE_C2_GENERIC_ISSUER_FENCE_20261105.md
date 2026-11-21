# C2 generic issuer bypass — 2026-11-05

**SOURCE-ONLY, uncommitted and not installed.** The Research runtime and Edge
were not changed. A2 remains NOT_READY, B2 unsigned, and V2 restore refused.

## Finding and change

A disposable-PG negative test reproduced that an issuer configured with
`c2_delivery_schema_required=true` could still call the generic `issue` path
and mint an unbound human assertion without a P7 fence. The test used synthetic
keys and identities only. It does not establish exposure of an installed
issuer: this candidate remains uncommissioned.

The selected candidate now refuses generic issue, generic revalidation, and
generic STATUS issue/resume in that C2 configuration. It also refuses ENTER
of a previously issued lease that lacks the P7, assertion or custody binding.
The source-authenticated RESOLVE path is unchanged: the test shows that a
source-signed rollback of the exact unentered original is still accepted and
idempotently replayed. Non-C2 configuration keeps its legacy behavior.

This is not a full independent-owner boundary. The protected internal issuer
can still be exercised as a source-only preparation without a custody binding;
the C2 ENTER check refuses such an assertion. The protected issuer must not be
mounted/exposed directly: its production composition, independently operated
owner-auth provider, key custody, HTTP delivery fence and real source authority
remain to be commissioned. An older process that lacks these checks also needs
an independently proven old-holder fence. No new right, source or Live
operation is enabled.

## Evidence

- Reproduction: isolated two-PG C2 owner suite **21 pass, 1 fail**; the new
  negative failed because the generic path returned a synthetic token.
- First P7 retake after an over-strict intermediate change: **5 pass, 4 fail**;
  the first error changed expected ordering and the remaining cases depended on
  that aborted setup. It is not counted as a pass. The change was corrected.
- Final `scripts/test-elp2-restore-inventory-rls.sh c2-owner`: **23/23 pass**
  on two disposable PostgreSQL clusters, synthetic identities and keys.
- Final `scripts/test-elp2-c2-p7-pg.sh owner-intent`: **9/9 pass** on two
  disposable PostgreSQL clusters. This is not an owner acceptance receipt.
- Strict focused source-only TypeScript check with 1 GiB old-space and a
  120-second timeout: exit 0. This is not the full/test-inclusive typecheck.
- `git diff --check` and `scripts/execution-tracking-test.sh`: exit 0.
- Both scripts' own traps removed their bounded test cells; no user data was
  removed. No integrated normal hook or connected gate is claimed here.

| Input | SHA-256 |
|---|---|
| `apps/control-api/src/execution-v2/current-human-candidate.ts` | `dab17451b22a517922311f0ad627b8f61164e51683978bd3304de9982aa7727f` |
| `apps/control-api/test/c2-owner-issuer-pg.spec.ts` | `7f2129b76847ab820f62884a5aa75a7e9475b3bca4a221dd693e1ee4eab32769` |
| `apps/control-api/test/c2-p7-owner-intent-candidate-pg.spec.ts` | `ca9be458935c0ee5a74b893569a4b6a26174aa8a4853d1a25a45ed873b431757` |

## Next

Finish and qualify separate owner-auth and witness custody; prove that all
live callers use the protected composition and fence old holders; reconcile
terminal/ACK after snapshot and rehearse a representative restore. Re-evaluate
the above test pins against the final integrated candidate before reusing them.
