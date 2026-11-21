# Recovery V2 — NOLOGIN checkpoint observation, 2026-11-05

**SOURCE/TEST ONLY, UNMOUNTED. Not restore authorization, independent fencing, or connected acceptance.** This addresses the compatibility gap in [local writer quarantine](CORE_C2_RECOVERY_LOCAL_WRITER_QUARANTINE_20261105.md), but the observation is not an authenticated quarantine proof. The existing V2 restore refusal remains enabled.

## Change and contract impact

- Split the writer role safety predicate from its LOGIN eligibility. Existing writer admission, rotation and database write enforcement still require LOGIN; their previous semantics remain in place.
- Add a separate frozen-checkpoint observation for an exact prior writer which is NOLOGIN, has no visible sessions or directly attributable prepared transactions, has no role membership or other non-superuser login that can assume it, and satisfies the same role/coverage checks. It holds the existing source locks through the independent journal append.
- Use a distinct `FROZEN_NOLOGIN_SOURCE_OBSERVATION` kind and digest domain. Existing frozen-capture kind and digest are unchanged; the two cannot be replayed as the same operation. This observation is not tied to a separately authenticated quarantine receipt.
- The candidate authority schema permits the new event kind on a **fresh** installation. A previously created candidate schema retains its old CHECK constraint: a verified forward schema upgrade and compatibility rehearsal are still required. No schema was installed or migrated on Research.

## Focused verification

- `scripts/test-elp2-restore-checkpoint-pg.sh`: **19/19 PASS** on two disposable PG clusters, including a separate actual migrated test database. The new negative cases reject LOGIN mode, a pre-existing writer session after NOLOGIN, excessive TRIGGER rights and rotation of the disabled writer; the existing LOGIN capture also rejects NOLOGIN. The new kind stores/replays the same event and cannot be replayed as the old kind.
- `scripts/test-elp2-restore-inventory-rls.sh` with `restore-fence`, `restore-c2-fence`, `restore-delivery-fence`: **2/2 each PASS** on disposable PG containers.
- Strict focused TypeScript compilation of `restore-checkpoint-authority.ts`: exit 0. No full compiler or normal integration hook was run.
- Initial sandbox execution could not use sudo; the approved elevated run completed. The runners own and clean up only their named disposable containers/networks; no persistent runtime database, privilege or service was modified. Resource ceilings were specified by the runners; peak use was not measured.

## Remaining gates and risks

This is a catalog observation at one instant: a privileged actor can change role/session state after the check; it does not fence an old database clone, other writers, HTTP in flight, prepared work from a different role, source systems or terminal/ACK delivery. Neither absence of sessions nor the two-cluster test establishes independent administrative authority or end-to-end recovery. Keep restoration fail-closed until independently qualified authority and old-holder/network fencing, complete source/terminal/ACK census, safe schema upgrade, and a representative restore/rollback rehearsal are demonstrated. P7/A2, Edge acceptance and final integration remain open.

No frontend contract or Claude consumer action was introduced. Rollback for this source-only candidate is to leave it unmounted and retain the existing refusal; no runtime state was changed.

| Candidate input | SHA-256 |
| --- | --- |
| `restore-checkpoint-authority.ts` | `1893913a50de38db6e74db8b0b3827fd400750e3afacef75a24397f69e19e266` |
| `restore-checkpoint-authority.sql` | `4c304a38cc6b0eb5b1225d4694582b2a75dbcb1d27f0b3d6dc7ed899957dceeb` |
| `restore-local-generation-fence-candidate.sql` | `de44ec0cb5b46252c9653b66673b163e3807669a04eecf2f34702c78e1e87b6a` |
| `restore-local-generation-c2-extension-candidate.sql` | `37b8a0ce400cb7d09009ebdba15d96acd4f379f5e52454020ae24dc435bac05c` |
| `restore-local-generation-delivery-extension-candidate.sql` | `0b3c5e8633379e9a0c047164093659454d6e509c2f6450d33f85ae91896a4249` |
| `restore-local-generation-public-extension-candidate.sql` | `a7b4656480b773d34bb156fe0fa137e433030054e5cc111d4701fa1c06223a89` |
| `restore-checkpoint-authority-pg.spec.ts` | `16bd9cbcc91ed0d483a267fa34a50c2c89c8f7769a8982b13e1c0cace9ea0a3d` |
