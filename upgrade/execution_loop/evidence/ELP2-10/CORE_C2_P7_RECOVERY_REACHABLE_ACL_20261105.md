# P7 and local recovery: reachable role ACLs — 2026-11-05

**SOURCE/TEST ONLY, uncommitted and unmounted.** P7/A2 and V2 recovery are not commissioned; this is not an old-holder, source/HTTP or restore/cutover fence.

## Issue and repair

On the dedicated PostgreSQL cell a restricted P7 login with a membership edge explicitly set `INHERIT FALSE` had no effective column INSERT privilege. It could nevertheless `SET ROLE` to the parent with that privilege. Before the fix the necessary P7 restricted-role check accepted the login, and the separate rights fingerprint did not change when the parent received the grant. The same class of omission was reproduced in the base local-recovery fence with a parent granted schema CREATE. Catalogue ACL digest and rights digest have different scopes: the unchanged rights digest did not mean the catalogue digest was unchanged.

The P7 candidate now conservatively examines table mutation and schema CREATE privileges for every membership-reachable role, and includes reachable table/schema rights in the diagnostic fingerprint. The base, C2 and delivery local fences now likewise reject reachable role privileges over covered schema creation, relation triggers, fence tables and administrative fence functions. The public extension checks reachable role CREATE and TRIGGER on the explicitly listed public relations. This deliberately may reject roles whose membership does not allow SET; it is a necessary negative check, not an authority grant.

The role fingerprint changed; prior P7 rights fingerprints are not a qualified baseline for this source. Role changes after admission remain an independently fenced-control problem: in particular a later privilege to suppress triggers can prevent the trigger checks themselves from running. Do not commission or restore based on these checks alone.

## Validation and cleanup

- P7 schema observation: before fix **5/6**, with the intended rejection resolving instead; final **6/6**. The regression explicitly verifies SET ROLE and tests both a column INSERT and namespace CREATE. Two earlier setup attempts failed before reaching the security assertion: changing the role default alone did not change the existing PG16 membership edge, and then the login lacked direct schema USAGE. Both were corrected; neither is counted as passing evidence.
- Base fence: before fix **1/2**, with a reachable CREATE grant accepted; final **2/2**, including CREATE, TRIGGER, fence-column UPDATE and fence-function EXECUTE grants.
- C2 and delivery fence: each **2/2**, with reachable parent CREATE, fence-column UPDATE and function EXECUTE negatives.
- Two-PG checkpoint/upgrade/STATUS-census retake **19/19**; includes rejection of public schema CREATE and public table TRIGGER through a membership with INHERIT FALSE.
- Strict focused TypeScript check of `c2-p7-schema-observation.ts` and `git diff --check`: exit 0. No full compiler or normal hook is claimed.
- Runners used isolated disposable cells and owned teardown. A read-only container census found no `elp2-` or `control-api-test-postgres` containers. Shared filesystem showed 270 GiB available; peak memory/CPU was not measured. No production/dev/main/stable database, credentials, runtime, frontend or remote was changed.

## Source pins

| Input | SHA256 |
| --- | --- |
| `c2-p7-schema-observation.ts` | `9bd02a40b2dc57e6917e73268651b45d0b1cbb0469a1aa6e28672b1c77cca036` |
| `c2-p7-schema-observation-pg.spec.ts` | `1410db0048468ec9bcecfa2e15670474b2646c6d7121558d1e5e357b14b4f5fd` |
| `restore-local-generation-fence-candidate.sql` | `335e8a3daeb7375b9389007bbbedcca0af90fdd9d09f5066197c2cc450fe2f51` |
| `restore-local-generation-c2-extension-candidate.sql` | `9fe300235c33bf6864d467dce923ecc0b2d2f1682b07930cd983c32e78fff428` |
| `restore-local-generation-delivery-extension-candidate.sql` | `cc9becf02bffef7f23f57bb21c9f93df4817ac3a79d1265915d678ec674ce692` |
| `restore-local-generation-public-extension-candidate.sql` | `7d2de0546f81aa8081cde518cb676ab1f8fbce4555758c5acd35b8e769f42083` |
| `restore-local-generation-fence-pg.spec.ts` | `21c55fe5cd435523478d3bf28bc101e0991ed95cb43f5e8a6d81261d08d57bd8` |
| `restore-local-generation-c2-extension-pg.spec.ts` | `54ee20c63c3649fe935d6bc568d3ed08c2ae2e5d786cc06b6e8681a4039fd4db` |
| `restore-local-generation-delivery-extension-pg.spec.ts` | `8a7ac833b94d99cdf83d7ad5e08ed87d23f5314b1d7ed8dbd0dd76258cfb9eec` |
| `restore-checkpoint-authority-pg.spec.ts` | `7475a06f0302724e76056293b62a0598f4d92cca0d6ced211ff03c023870dcc5` |

## Next and consumer

Core must still implement/qualify independently controlled old-holder/privilege fencing, source terminal and ACK census, P7 owner/signer authority, and restore against the final candidate. Real Edge source/trust, financial/STATUS, calibration/G2 and browser qualification remain separate. No frontend contract or Claude consumer action is added by this source-only change. Rollback is to retain the unmounted state and existing V2 restore refusal; these checks do not authorize a restore.
