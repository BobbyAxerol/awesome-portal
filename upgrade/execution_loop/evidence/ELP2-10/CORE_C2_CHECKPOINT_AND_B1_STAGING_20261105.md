# C2 Core follow-through — checkpoint storage and pinned B1 staging

## Status and scope

Source preparation only on `docs/research-loop-plan` base
`2faa8968fddbde59b2e59525e334ba3d83886144` with uncommitted files. This is
**not** an installed A2, B2 signature, independent recovery barrier or
permission to resume the restored system. The legacy V2 DR refusal remains.
No UI, API contract, production/stable/dev database, command/Live, remote Git
or deployed configuration was changed.

## B1 exact-byte staging

The existing public B1 was read with the separately pinned SHA256
`409542f42012120f994f32600c7632ca3a13cfce8210c685218956a753de31fd`, validated,
then staged once at:

`/home/bobby/secure/core-c2-b1-stage-20261105/b1-409542f42012120f994f32600c7632ca3a13cfce8210c685218956a753de31fd.json`

The containing directory is owner `bobby`, mode `0700`; the regular file is
owner `bobby`, mode `0600`. The first process returned
`STAGED_NOT_AUTHORIZED`; an independent second Node process returned
`ALREADY_STAGED_NOT_AUTHORIZED`. The writer uses exclusive/no-follow creation
and fsyncs file and directory; incomplete or conflicting bytes fail closed.
The controlled file is public input, **not** a private key, acceptance record,
signed publication, seal, P7 or P8. Its staging does not prove power-loss
durability or guard against a malicious process with the same Unix identity.

Source SHA256 `c2-b1-stage.ts`
`e5919fab9b806b0325c946b5cad70d8b552b54dcc6431fb49e5281168e8e35b5`;
test SHA256 `c2-b1-stage.spec.ts`
`8ba8d4ab607523218b73a2f1f736f9e61faf317a2783385779195d32b73087ec`.
Focused stage test **5/5** and strict targeted TypeScript passed. The two
staging process calls above used the actual delivered public B1.

## Checkpoint store candidate

`restore-checkpoint-authority.ts` and the separately provisioned
`restore-checkpoint-authority.sql` prepare an operator-owned PostgreSQL store,
not a migration on the Portal source database. It checks the actual PostgreSQL
system identifiers, bounds the chain to 10,000 events, validates the chain to
its pinned head, uses serializable CAS, detects revision regression and
preserves the same operation ID after an ambiguous COMMIT. Return value is
always `STORED_NOT_CUTOVER`.

| File, relative to `apps/control-api/` | SHA256 |
|---|---|
| `src/execution-v2/restore-checkpoint-authority.ts` | `7d73d371ad7f18aff423b91b70413eb1e5498607e5e184c11434c10496d6b261` |
| `src/execution-v2/restore-checkpoint-authority.sql` | `4782a675d610638d45cdabb72c536bdf970b32bd02950ab3b407f34321d590ca` |
| `test/restore-checkpoint-authority.spec.ts` | `702c1820c91551ba85f216bf548b975fd4d6deea0c9335a7e9271d5e87502947` |
| `test/restore-checkpoint-authority-pg.spec.ts` | `3ac152205fdce91cf304a999fc5e0dec4643f5b8eee6a32270d1cad56520f3dd` |

`scripts/test-elp2-restore-checkpoint-pg.sh` SHA256
`885f2ab82891778bd65b163cb6c2d3bb5f5f393dddbbec5a9c3afcbdd7f402bd` ran under
`/tmp/portal-heavy.lock`: **4/4** tests passed on two temporary separate PG
clusters. It checks competing writers, a genuinely committed transaction with
injected lost response, same-operation retry, source/authority cluster mismatch
and corruption of an earlier chain entry. Unit **4/4**, strict targeted
TypeScript and `bash -n` passed. PG cells used 1 CPU / 768 MiB each, Node 2 CPU /
1.5 GiB, internal network and tmpfs; exact owned containers/network were
removed, and read-only inventory showed no matching residuals.

These tests show cluster separation, **not independent failure domains**.
An administrator able to rewrite the entire checkpoint database can also
rewrite its hash chain; caller-provided revision/digest is not a verified
source-current authority. Provisioned separation, authentication and an
independently held trusted head remain unqualified. No old process is fenced,
no writer revalidates a checkpoint at commit, and late source terminal/ACK
coverage after a snapshot is not yet proven. Do not enable cutover.

## Research identity observation

A read-only query in the preview `portal_control` DB on 5 November found an
active Portal owner anchor and two owner workspaces. The TS A1 principal UUID
does not match a Portal `user_id` or directly linked external `subject` there;
TS and Portal use different identity namespaces, so **this is not proof that
no legitimate cross-system mapping exists**. There are zero access-proposal
rows. Seven owner grant records have Paper `business.read_all` or
`stream.subscribe` actions; an aggregate count neither proves they are current
nor creates a P7 acceptance/delegation for B1's exact two portfolios, `HISTORY`
and `READ` operations. Use the qualified mapping/authority path and real
accepted record; do not synthesize a mapping or take these rows as P7.

The first metadata query used a nonexistent DB role and the second had an SQL
quoting error; both failed read-only. The corrected read-only queries above
succeeded. No credentials or row contents were exported.

## Remaining work

Core still owns real issuer/O-1, installed mTLS/source registration,
identity/workspace reconciliation, P7 acceptance and independently held P8
signer; full checkpoint integration/fencing/terminal/ACK reconciliation; and
the final hook/landing. Edge remains the only TS coordination path for P3/P5
source semantics, source-side generation/fence/readback and seal. B2 is
unsigned, and a one-hour post-seal commitment is not yet supportable.
