# STATUS restored-link census — 2026-11-05

**SOURCE ONLY / NOT COMMISSIONED.** Branch `docs/research-loop-plan`, committed
HEAD `2faa8968fddbde59b2e59525e334ba3d83886144`; the changes are shared WIP,
uncommitted and not an installed image or runtime. No external identity,
business operation or Edge ACK was created. Existing WIP is retained.

## Gap and change

`CommandSourceAssertionAuthority.acknowledgeRetainedRead` previously used an
inner join from retained STATUS context links to leases. If a partially restored
database contained one acknowledged linked lease and a second link whose lease
was missing, the second link disappeared from the count and the remaining row
appeared fully acknowledged. Migration 157 does not declare an FK to the
candidate lease table. The disposable PostgreSQL regression reproduces the
former query returning `{total:1, unresolved:0}` for that synthetic two-link
state; this is a counterexample, not proof that any real deployment lost data.

The source now counts **all** links with a left join and treats a missing lease
as unresolved. It also checks contiguous sequence/previous-lease lineage, the
original/call/binding, current actor/session/workspace/workload, link-to-lease
request digest and the exact terminal ACK fields. Zero retained links remain a
refusal in the caller. It does not invent an ACK or authorize a source operation.

## Tests and resource disposition

- Final `npm test -- test/command-source-assertion.spec.ts`: **76/76 PASS**,
  including refusal on a synthetic unresolved restored link and verification
  of the census arguments.
- Focused `command-source-assertion.spec.ts` plus
  `edge-command-status-transport.spec.ts`: **100/100 PASS** after escalation
  for local loopback mTLS. The first sandboxed attempt had 76 PASS and 24 FAIL
  because binding `127.0.0.1` returned `EPERM`; it is not counted as a pass.
- `bash scripts/test-elp2-restore-checkpoint-pg.sh`: **17/17 PASS** over two
  disposable PostgreSQL clusters, including four new census cases. These use
  the actual migrations 156/157 for links and ACKs, but a deliberately minimal
  synthetic lease table; they are not an end-to-end restart or a real Edge ACK.
  The runner's cleanup trap completed; `sudo -n docker ps -a --filter
  name=elp2-ckpt-` returned no matching containers. Resource usage NOT_MEASURED;
  runner ceilings remain 0.4 CPU/320 MiB per PG, 1.2 CPU/896 MiB for Node.
- `git diff --check`: exit 0. Full project typecheck, normal hook, gateway and
  connected acceptance NOT RUN in this slice.

| Working-source input | SHA-256 |
| --- | --- |
| `command-status-ack-census.ts` | `5d3f378c126e82009168e16949bd43d1dc3f60705c70ab67ba4c7ffd8ca6ec87` |
| `command-source-assertion.ts` | `74fdee9d1e13ba2266b885a266992f7742725b83253a4dbe25bdf97013e6769f` |
| `command-status-ack-census-pg.spec.ts` | `8444afcf935f5bffb0cd9f4d0b7398c1648196f25006de9b09fe6defcd32cb2d` |
| `command-source-assertion.spec.ts` | `6b7c6df0de51802d969989bdafb2b5ace07870047df39e4889f0506f2e6723ee` |
| `test-elp2-restore-checkpoint-pg.sh` | `f33df23fc66c316ac880662c9dac705eb6d0fe7f04cd5f90d3e77aeeedbd120a` |

## Remaining and handoff

This read cannot detect a wholly missing suffix or all links being absent
without an independently retained source/checkpoint census. The census and
preparation consume are not yet proven atomic against every concurrent writer;
old-holder fencing and complete post-snapshot source/ACK enumeration remain
open. Do not use this fix to lift the V2 restore guard. Review and retest on the
integrated candidate, then commission actual STATUS original/ACK through Edge.
P7/A2, connected READ/STREAM, financial and qualification remain open. No
frontend contract changed; no Claude consumer change is requested.
