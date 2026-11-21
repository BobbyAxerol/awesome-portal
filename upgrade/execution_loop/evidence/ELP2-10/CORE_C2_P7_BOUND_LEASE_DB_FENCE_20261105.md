# C2 P7 exact-intent database fence — 2026-11-05

**SOURCE ONLY; NOT A PRODUCT MIGRATION OR ISSUER ACTIVATION.** Branch
`docs/research-loop-plan`, committed HEAD `2faa8968fddbde59b2e59525e334ba3d83886144`.
Changes remain in the shared WIP; no live database, image, identity, P7 grant,
listener, B2 signature or UI changed.

## Candidate

- New guarded leases retain both the P7 fence digest and exact owner intent ID;
  both columns are immutable. Issue, same-original resume, revalidation and
  ENTER compare the same locked intent, not an arbitrary current intent.
- The optional SQL candidate fences INSERT and ISSUED → ENTERED for the
  matching Paper scope. It rejects an unbound old writer, wrong/revoked or
  expired intent, mismatched owner/session/registry/revision, and a direct
  INSERT already at ENTERED. It locks and compares the original P7 record;
  an already-entered exact original can still resolve after revoke.
- Each inserted revocation advances a physical lease epoch. In a disposable
  test, a REPEATABLE READ snapshot predating revoke fails with `40001` when it
  attempts ENTER after the revoke commits. The trigger also refuses a scoped
  non-READ-COMMITTED insert/enter; neither behavior grants authority.
- Fence installation locks lease and scope tables and refuses while an
  unresolved matching historical lease exists. The forward candidate adds a
  nullable UUID to old schemas; it does not invent any historical intent.

## Evidence

- `scripts/test-elp2-c2-p7-pg.sh owner-intent`: **6/6 PASS** in a two-PG
  disposable cell, including same-owner contention, unbound/wrong-intent raw
  SQL, invalid initial phase, refusal to install over unresolved work,
  revocation versus held locks, stale snapshot, and exact-original terminal
  settlement. Synthetic attestation and owner only.
- `scripts/test-elp2-restore-inventory-rls.sh c2-owner`: **19/19 PASS** on
  the affected issuer/schema selection, including the old candidate forward
  upgrade and null historical pins. This suite does not install the optional
  bound-lease SQL, so it is not combined-migration or runtime proof.
- Targeted strict TypeScript check of changed issuer/composition sources:
  exit 0. This is not a full typecheck or normal hook.
- Disposable containers and network were removed by each runner's EXIT trap;
  a subsequent `docker ps -a` name check found no P7 test containers.

## Source pins

| File | SHA-256 |
| --- | --- |
| `c2-p7-bound-lease-fence-candidate.sql` | `ca9feca18d1edac7ac1a9d19212dd06c150360326c1f9b729695515f85ab975d` |
| `c2-p7-issuer-fence-candidate.ts` | `8bbea775c98d34c1b31212bfddee784a714298a8d0a087ba3d56753171c63173` |
| `current-human-candidate.ts` | `a96fa2cc34018df10a63cf68b3841fe0fc08b8ea9a02035202b54e8e0966f3cd` |
| `current-human-candidate.sql` | `efdfc8d3246acbd81df170cbdb5440925148d97abd0b0aa16f20c69fc17d7189` |
| `c2-human-issuer-upgrade-candidate.sql` | `83acce6eb8e350a0de21d73e958595a4bd7c205e0317812f5115a269c82edb26` |
| `c2-p7-owner-intent-candidate-pg.spec.ts` | `217df00a6a2ae43d9ce586bccea9ef9a1a7ca0b0a567755654870d571f717ff5` |
| `c2-owner-issuer-pg.spec.ts` | `c412f80c643870351764333fcb1fdf06e978cfb07491fa60396ea73c3fd510f5` |

Recheck the whole transitive selection before reusing evidence. Earlier
[issuer-fence receipt](CORE_C2_P7_ISSUER_FENCE_RETRY_20261105.md) pins are
historical where the above files changed; do not treat them as current pins.

## Remaining

This is not a defense against a table owner/superuser disabling triggers or a
privileged writer fabricating otherwise valid authority records. The exact
application DB role, schema/trigger ACL and privileges, source provenance,
rollout ordering, old-process and HTTP delivery fences, and combined upgrade
on a representative DB still need review and tests. The trigger is not an
authorized grant, actual current-human provider, accepted A2 or signed B2.
The live issuer remains hard-fenced; V2 restore remains denied. No frontend
consumer action is needed for this internal candidate.
