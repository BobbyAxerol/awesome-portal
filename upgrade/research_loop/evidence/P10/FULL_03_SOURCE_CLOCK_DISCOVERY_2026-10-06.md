# FULL-03 — Read-only source interval and clock discovery

Status: **SOURCE_BOUNDARY_VERIFIED — NOT_PRODUCT_RECIPE_QUALIFICATION**.
Measured: `2026-10-06T04:15:46.313246Z`. Owner: Codex source lane.
Base: `ebfe3c55929450ffc0b620494016f46cc12f435a`.
Parent packet: [FULL-03 indexed timeframes](./FULL_03_INDEXED_TIMEFRAMES_2026-10-06.md).
Guide: [FULL-03](../../S02_FULL_SUPPORT_STAGED_PLAN_2026-10-05.md#full-03).

## Authority and bounded method

Read only the existing approved Research preview's installed reader and its
immutable metadata index. No service restart, environment change, index publish,
profile activation, strategy edit, source write or engine upgrade took place.
No raw price row, source filesystem path or credential is included here.

For **each of the seven actually published/indexed intervals**, load exactly
three BTCUSDT target bars from `2026-08-01T00:00:00Z`, with half-open end
`start + 3 × interval`. Compare the approved adapter's native-token result with
the installed reader's canonical-token result (`check_val=true`, DuckDB).
Each pair has identical full OHLCV content hash, UTC-aligned open timestamps,
three rows and no timestamp beyond the requested end or indexed as-of clock.
Only these tiny source queries were used; no full-history price scan was run.
Metadata checks then verify the same three target bars and 300 predecessors
without reloading prices. This is source-boundary evidence, not a substitute
for ordinary P08 → P10 → child → P05 → named-read recipe receipts.

## Installed provenance — actual discovery, not a nominal menu

- Distribution/version: `primus-historical-market-data` / `0.1.0rc3`.
- Approved wheel SHA-256:
  `3b2a41b87ff834912556bb3039bf3e3c148bd859a1ced9ee4f52a3c658ca5663`.
- Loader contract: `hmd-loader-v1`; scopes: **backtest/research only**.
- Accepted source manifest:
  `f657851c3717835c460a8dbed28865cfaf5cc854f62a0e2570860c2e451a9d47`.
- Release commit: `18d6ec6502b34ab7c6f1d36f428578486726292b`;
  dataset release: `binance_perpetual_spot_quarterly`.
- Important correction: rc3's loader classes do **not** have a finite native
  `SUPPORTED_TIMEFRAMES` declaration. They publish fixed-interval normalization
  and resampling support. The seven-token list was Portal's published set;
  this receipt verifies every member against the actual native normalizer,
  mounted source, timestamp index and tiny real query. It does not call a
  static list an engine declaration or open arbitrary unqualified intervals.
- The adapter now uses any future explicit native interval declaration as
  authority; it does not widen that declaration with the old Portal list.

| Namespace | Mounted/available | BTCUSDT listed | Partition metadata |
| --- | --- | --- | --- |
| `crypto-binance-1m` | yes | yes | 2020-01…2026-10, 82 month partitions |
| `crypto-binance-spot-1m` | yes | yes | 2018-01…2026-10, 106 month partitions |
| `crypto-binance-quarterly-1m` | yes | **no** | no BTCUSDT namespace coverage |

Partition presence is not exact bar/session/listing completeness. This receipt's
seven real query pairs qualify **BTCUSDT / crypto-binance-1m only**. It does not
qualify spot or quarterly execution recipes or alias them to the primary source.

## Existing immutable index and target-bar warmup

Index revision (unchanged):
`f071401914c2734171308903cd6390422ac53a99a38dd3f89a8f52699a9a1374`.
Index as-of: `1790895894892` = `2026-10-01T23:04:54.892Z`.
All seven indexed BTCUSDT ranges start at `2020-01-01T00:00:00Z`.
Their measured gap and duplicate counts are zero inside that indexed range.
An index revision is not made fresh by changing a label or canonical alias.

| Native token → public identity | Closed target bars | Verified end (UTC, exclusive) | First research start with 300 indexed predecessor bars (UTC) |
| --- | ---: | --- | --- |
| `1min` → `1m` | 3,550,984 | 2026-10-01 23:04 | 2020-01-01 05:00 |
| `5min` → `5m` | 710,196 | 2026-10-01 23:00 | 2020-01-02 01:00 |
| `15min` → `15m` | 236,732 | 2026-10-01 23:00 | 2020-01-04 03:00 |
| `30min` → `30m` | 118,366 | 2026-10-01 23:00 | 2020-01-07 06:00 |
| `1h` → `1h` | 59,183 | 2026-10-01 23:00 | 2020-01-13 12:00 |
| `4h` → `4h` | 14,795 | 2026-10-01 20:00 | 2020-02-20 00:00 |
| `1D` → `1d` | 2,465 | 2026-10-01 00:00 | 2020-10-27 00:00 |

Thus the daily range has real metadata coverage for 300 **daily target bars**;
it is not a borrowed 300-hour rule. At the tested 2026-08-01 start all seven
metadata windows report 300 available predecessors and three target bars.
Crypto warmup remains `FIXED_INTERVAL_PREDECESSORS_V1`: bounded lookback by
the target interval plus observed-count checking, not an invented last-N scan
across arbitrary source gaps. Existing VN keeps its independently qualified
`OBSERVED_SOURCE_LOCAL_DATE_V1` / `LAST_N_OBSERVED_PREDECESSORS_V1`; no VN
calendar, untouched-holdout or execution capability is added by this slice.

## Real query fingerprints

Common UTC start: `1785542400000` (`2026-08-01T00:00:00Z`). Every row below has
3 rows; canonical/native hashes match; source manifest matches the index;
timestamp alignment, half-open end and indexed closed-as-of checks pass.

| Public interval | Query exclusive end (UTC) | Exact series content SHA-256 |
| --- | --- | --- |
| `1m` | 2026-08-01 00:03 | `42aa5c80677832bc4f8677f8e46a9661fed8e96afbf05c3bdddd065e2410d1ee` |
| `5m` | 2026-08-01 00:15 | `13335ec2eb96a4d1e5bc69fe2ce4be2c70d2b1cc9ab137dc4712e41187a4d9cf` |
| `15m` | 2026-08-01 00:45 | `c27a0b7514792a596a8c1f7458e8b71357cb987e94d4119e61e0c0410267047a` |
| `30m` | 2026-08-01 01:30 | `a1391385ac90f8639ecb3bc5e829f352ee93911c3105f736e91fc658d25dd9e0` |
| `1h` | 2026-08-01 03:00 | `f5205bc6579ffd4b2632202ccce50b6c4bba90151305360fb54c5641015a626c` |
| `4h` | 2026-08-01 12:00 | `934f85849fb26017431febcc30dfe67550d6d0d6c8e12a742434bd516e39ae2b` |
| `1d` | 2026-08-04 00:00 | `1945c0c4122fb5a41c7609d742fd732188b65bd844b17e64dd89eece4a5e3402` |

Canonical measurement SHA-256:
`5e6fb043ce39036511e87e99349f8c5e98a682f27ebb48280c0ebec21395b0d8`.
Private metadata-only summary `source-boundary-summary.v1.json`, mode0600,
SHA-256 `5e7d730bc6c0c60abc4b2b59ac8d0d0ebec7440f8f39c6fb04f667ee64537193`.
These are different documents and therefore different hashes. No raw price
output was stored. The full canonical measurement hash covers the measured
metadata/series hashes, not an image or product acceptance claim.

## Source-lane implementation and focused gates

- Canonical identities are computed from interval duration and translated to
  reader-published native tokens at load time. Old stored timeframe tokens,
  immutable index bytes/revisions and historical seals are not rewritten.
- Metadata alias lookup remains bound to dataset, symbol and exact duration;
  contradictory aliases are refused. New index append updates only the exact
  explicitly supplied interval in a new revision, retaining prior revisions.
- The private adapter captures an observed UTC clock, clips reader queries at
  closed interval ends and excludes returned open/future target bars. Returned
  symbol substitution and off-grid timestamps are rejected rather than relabelled.
- P08 additionally binds available matching immutable index provenance into
  the new dataset binding, effective-spec and snapshot consistently, verifying
  hydrated timestamp count and membership **before** sealing. Its existing
  `CLOSED_BARS_ONLY` literal stays unchanged; missing index provenance is not
  invented or made mandatory for historical no-index profiles. FULL-03's
  separate admission requires the exact verified fixed-UTC provenance.
- `--discover` is bounded metadata-only operator discovery, never implicit
  source reload or index mutation during a screen/estimator read.
- Timestamp-only planning keeps the 100k-bar ceiling; 300-bar warmup tests
  cover all seven identities. P08 SnapshotStore tests cover 1m/4h/1d and their
  actual target-bar warmup/timezone/quality/provenance. VN rules stay separate.
- Affected grouped gate: **198 passed / 14 external-data opt-in skips**; the
  independent real seven-interval boundary check above passed without fixtures.
  Tests do not claim those skips passed or that these source queries are
  product recipe receipts. Protected strategy SHA remains unchanged.
- Subsequent crypto-binding regression gate: **157 passed / 0 failed**, covering
  P08, FULL-03 and existing VN/index paths. Positive tests assert the same
  provenance in all three documents; source/index mismatch is typed and
  missing index retains legacy compatibility. This is not another HMD scan.

Remaining authority: ordinary product qualification for each enabled exact
FULL-03 recipe and source pair belongs to the parent FULL-03 packet. This
receipt neither enables recipes nor changes their budgets, AV or release pins.
