# N17A source-dark production and DR rehearsal

Status: `OFFLINE_ISOLATED / PRODUCTION_INACTIVE / NO_SOURCE_TRAFFIC`

## Admission

1. Run only from a clean feature worktree. Never point the harness at dev,
   stable, AWS-HK or Trading System resources.
2. Confirm every source/query/SSE/command/production flag remains false.
3. Use exact test-owned Docker resource names and a temporary evidence folder.
4. Treat v0.7 latency values as provisional qualification budgets. Do not set
   an availability target, error-budget burn policy, production RPO or RTO.
5. Abort if any test attempts an external network, source read or command.

## Isolated restore and rebuild

1. Create a disposable PostgreSQL primary with WAL archiving on an isolated
   Docker network.
2. Seed Portal-owned control data, take a base backup, append one accepted row,
   seal the target WAL LSN, then append a post-target row.
3. Recover a separate PostgreSQL data volume to the sealed LSN. The accepted
   row must exist and the post-target row must not.
4. Produce a separate custom-format logical backup, encrypt it with an
   ephemeral key, verify ciphertext differs from plaintext, decrypt it, verify
   SHA-256, and restore into another isolated database.
5. Rebuild a projection from a sealed event corpus and compare the exact sorted
   digest with the expected projection. Projection recovery never edits Trading
   System data.
6. Remove plaintext backup, ephemeral key, containers, networks and volumes.

This proves automation and isolation only. Encrypted production storage,
backup retention, cross-zone copies and measured RPO/RTO remain N17B evidence.

## Rotation and compromise

For each of mTLS read, mTLS command, delegated JWT signer, Portal session
signer and projection database identities:

1. disable command capabilities first;
2. issue a distinct replacement;
3. accept old+new only during the bounded overlap;
4. verify positive new and negative expired/revoked/incorrect-scope cases;
5. revoke old only after verification;
6. preserve audit and require Bobby's decision before re-enablement.

The N17A harness uses temporary fingerprints, never production certificates,
keys, passwords, tokens or DSNs.

## Rollback and game day

Exercise network partition, auth loss, source loss, command containment, control
DB PITR, projection rebuild, Portal release rollback and credential compromise.
Rollback engages capability kill switches first, preserves in-flight operation
visibility and selects a prior signed Portal manifest. It never represents a
202 acknowledgement as terminal and never retries an uncertain command.

## N17B handoff

N17B starts only after N13B–N16B are accepted for the same exact profile and an
owner change window exists. It must bind real owners, production identities,
encrypted backup/PITR storage, dashboards/alerts and the accepted Trading System
contract. Then it measures real SLO/error budgets/capacity and records witnessed
RPO/RTO, rotation, containment and rollback evidence. Bobby signs the exact
final acceptance record; N17A output cannot be relabelled as that record.
