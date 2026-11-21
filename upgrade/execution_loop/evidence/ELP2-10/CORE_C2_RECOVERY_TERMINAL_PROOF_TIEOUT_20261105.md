# C2 recovery: exact terminal proof tie-out — 2026-11-05

**SOURCE_ONLY.** This extends the retained-source-proof candidate; it is not a
completed restore barrier, A2 delivery, or connected source acceptance.

## Change and scope

The optional original-recovery composition now reads the independent custody
chain and authenticates the retained source-signed terminal against the pinned
source key. It compares the exact original identity/binding and the terminal
receipt digest with the current Core row, rather than treating the phase-only
source recovery response as evidence of receipt identity. A correct match is
reported only as `TERMINAL_PROOF_MATCH_ACK_CENSUS_NOT_VERIFIED`; a missing proof
is separately reported, and invalid key/ciphertext fails closed. UNKNOWN has no
terminal digest and remains unresolved. The previous no-custody behavior is
unchanged. No proof or bearer is returned to callers.

The source-response mock in the test supplies a phase-only ACK over pinned mTLS;
it is not an Edge/TS receipt. Even a matching proof does not establish that the
recipient durably received the original response, completeness of the source
or independent journal, fencing of old holders, independent key custody, or a
restore/cutover decision. All remain mandatory.

## Tests and pins

- Two isolated PostgreSQL clusters plus pinned mTLS mock:
  `bash scripts/test-elp2-independent-custody-pg.sh`, **5/5 PASS**, including
  digest tie-out, missing custody and wrong key. The cell self-cleaned.
- Existing recovery lane `bash scripts/test-elp2-restore-inventory-rls.sh
  restore-original`: **7/7 PASS**, disposable PostgreSQL and mTLS fixture.
- `npm test -- test/restore-c2-original-recovery.spec.ts
  test/restore-c2-source-proof-vault.spec.ts`: **6/6 PASS**.
- Focused strict TypeScript with project decorator options: exit 0. An earlier
  ad-hoc TypeScript invocation omitted decorator options and failed TS1206;
  it is not counted as a pass. No full integration hook was run.

| Source / test | SHA-256, local WIP |
| --- | --- |
| `restore-c2-original-recovery.ts` | `8ab753634df363eb68cfc8c563274345b3911754be989e01e9eb51d428c56497` |
| `restore-independent-custody-candidate.ts` | `68d09595d25990192fc91ab01305ecd14c3c0f42f76edebe55c9cbd15c6514fe` |
| `restore-independent-custody-candidate-pg.spec.ts` | `de98a84c9a9d3ec53e36a7b2a80f905ba9f16a5148f327ab2190ed8668a4398d` |

## Remaining work

Commission a separately controlled checkpoint and vault key, establish
old-holder/HTTP fencing and complete post-snapshot source/recipient ACK census,
and rehearse actual restore. In parallel commission the Research issuer,
source registration and mTLS listener, authenticate the approved owner P7,
qualify the separate P8 signer, and obtain A2 acceptance. Reuse the verified
static bytes. B2 remains unsigned until genuine A2 acceptance and applicable
release conditions. No schema, service, Live/command or remote push was changed.
