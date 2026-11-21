# C2 public inputs and P7 — focused retake

2026-11-05. Branch `docs/research-loop-plan`, committed HEAD
`2faa8968fddbde59b2e59525e334ba3d83886144`; these are uncommitted candidate
sources, not an image, installed schema, actual owner acceptance or A2.

## Tests

- A bounded run of 20 named A1/A2, B1/B2, P7, issuer, public-trust and
  original-recovery suites: **126/126 PASS**. It included the pinned public
  A1 directory (manifest SHA-256
  `7b063476b5daf2218382b31166f48a73218e09befd7804b0eb018b11fc642ab4`),
  B1 bytes SHA-256
  `409542f42012120f994f32600c7632ca3a13cfce8210c685218956a753de31fd`,
  and public P8 JWK SHA-256
  `0ad65ab92e0d64a62222b4a0e8980311dd51f0ea7fc7ee08246aebc2032576dc`.
  P8 was checked against the independently recorded candidate issuer and A1
  source SPKI pins. These are public candidate bytes; no private key was read
  or used. Tests with generated source signatures remain synthetic.
- `bash scripts/test-elp2-c2-p7-pg.sh acceptance`: **6/6 PASS** on a
  bounded, disposable PostgreSQL cell. It uses synthetic owner and source;
  it does not establish P7 authority, real revocation, or connected delivery.
  The script's teardown ran; a read-only Docker check found no remaining
  containers with prefix `elp2-c2-p7-`.
- A first grouped local run without public inputs had six skips; an intermediate
  run with A1/B1 had one P8 skip. The 126/126 run above is the final separate
  retake with all three supplied, not an addition to those counts. Direct
  execution of the non-executable shell script and its sandboxed Docker run
  failed before the isolated elevated `bash` run; neither is counted as PASS.

## Source pins

| Input | SHA-256 |
| --- | --- |
| `c2-p7-acceptance.ts` | `5c79f81783458e37be58d176185546a3f0b71f7d36ef1f1d6377237b9ac9cf7c` |
| `c2-p7-review-candidate.service.ts` | `0d9c88443135162789cdfd536c752dcf36bf4628eca4d4828b0b4b4b7b4b2d9d` |
| `c2-p7-acceptance-pg.spec.ts` | `29cf18661a0d65f29a6f90a56759a44859cf77964e0ca46296514f8e2c352dd8` |
| `c2-p8-public-key.spec.ts` | `82ea25be55442053d2ca83ed0e746ceba0f9cdeaeee68bb1fc40b3402a243260` |
| `test-elp2-c2-p7-pg.sh` | `fd46e6cfc77c1c202597cdcf2307585447399c757270142089e9968863257fa2` |

The prior [P8 receipt](CORE_C2_P8_PUBLIC_KEY_PREFLIGHT_20261105.md) pins the
previous version of the P8 test and its synthetic run. This retake adds an
actual public-candidate case; neither proves qualified key custody or P7.
Recheck the complete transitive dependency/schema/environment selection on the
final candidate. No complete typecheck, normal hook, migration, runtime
installation, A2 acceptance, signature or connected receipt is claimed.

## Next

Core must still complete actual P7/issuer same-authority enforcement,
independent recovery fencing and post-snapshot ACK census, signer custody and
same-original signing recovery, and review/integration/migration. Edge/TS
commissioning and qualification remain separate. Claude has no new consumer
contract from this internal retake.
