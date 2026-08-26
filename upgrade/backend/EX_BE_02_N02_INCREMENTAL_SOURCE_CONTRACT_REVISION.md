# EX-BE-02 / N02 Incremental Source Contract Revision

Status: `PORTAL_REQUEST_VERIFIER_COMPLETE / NARROW_REQUEST_SUPERSEDED /
CONSOLIDATED_READ_PACK_PENDING / RUNTIME_V1_LOCKED`

Date: 2026-08-25

## 1. Outcome

Portal has completed the part of N02 that it owns: a non-secret, machine-readable
request contract, a strict import/acceptance verifier, and a synthetic compatibility
and error corpus. This work does not claim that Trading System has published
`d4.paper-read.v2`.

The currently accepted runtime contract remains `d4.paper-read.v1`. The D4 reader,
registry delivery profile, Query, analytics, SSE and command paths remain dark.
No network, AWS service, Trading System repository, database, source credential or
runtime state was changed.

## 2. Why an owner revision is required

The accepted v1 facade provides bounded snapshot/event reads for a finite D4
qualification window. It does not publish the steady-state facts required by N02:

- a consumer lease that produces zero source SELECTs after expiry;
- an immutable epoch-bound incremental cursor and retention floor;
- explicit UPSERT, DELETE and tombstone semantics;
- typed duplicate, replay, ahead, expired and gap behavior;
- a full-resync transition into a new BUILDING epoch;
- per-entity `EVENT_SOURCED`, `POLL_BOUNDED` or `UNKNOWN` completeness;
- page, body, rate and freshness bounds.

Portal cannot infer these facts from v1 or write them on behalf of the source owner.
Renaming v1 to v2 would create a false compatibility claim.

## 3. Read-only owner discovery

Read-only inspection of the AWS-HK Trading System worktree on 2026-08-25 found:

- worktree: `/home/bobby/.worktrees/trading-system-d4-paper-read`;
- branch: `feat/d4-paper-read-facade`;
- inspected HEAD: `6049a73`;
- published Portal-facing revision: `d4.paper-read.v1`;
- no owner-published v2 consumer-lease, retention-floor or per-entity
  completeness contract.

This inspection made no source or runtime change. The inspected commit is discovery
evidence only; it is not imported as an N02 owner acceptance.

## 4. Portal-owned request pack

The request-only pack lives at:

`services/portal-execution-edge-rs/contracts/d4-paper-read-v2-request/`

It contains:

- `incremental-contract.schema.json` — structural request schema;
- `incremental-contract.example.json` — exact semantic request example;
- `compatibility-fixtures.example.json` — required synthetic scenario names;
- `error-corpus.example.json` — required typed failure matrix;
- `owner-pack.manifest.example.json` — immutable publication/evidence envelope;
- `README.md` — owner workflow and non-authority boundary.

Every example is explicitly marked request-only and not runtime-consumable.

## 5. Exact owner return package

Trading System owner returns one directory containing exactly four regular,
non-symlink JSON files, with no credentials, DSN, API key, token, certificate,
business record or customer/account data:

1. `owner-pack.manifest.json`
2. `incremental-contract.json`
3. `compatibility-fixtures.json`
4. `error-corpus.json`

The manifest must bind the other three files by byte SHA-256, the already published
capability contract by SHA-256, the exact 40-character implementation commit, and
sanitized owner evidence references. It must keep all write, command, activation,
DB, Redis and CLI authority false.

## 6. Fail-closed verification workflow

Portal request self-check:

```bash
python3 scripts/execution-n02-contract-verify.py --mode template
```

Owner draft check, before acceptance:

```bash
python3 scripts/execution-n02-contract-verify.py \
  --mode candidate \
  --pack-dir /absolute/path/to/n02-owner-pack
```

Final owner-published check:

```bash
python3 scripts/execution-n02-contract-verify.py \
  --mode acceptance \
  --pack-dir /absolute/path/to/n02-owner-pack
```

The verifier:

- reads only the named bounded JSON files;
- rejects symlinks, extra files, duplicate JSON keys and digest drift;
- rejects v1, widened scope/method/authority and non-dormant lease behavior;
- locks ordering, cursor, tombstone, retention, resync, completeness and bounds;
- emits only a sanitized decision summary;
- never copies artifacts, opens traffic, loads credentials or starts a service.

## 7. Test evidence

`scripts/test_execution_n02_contract_verify.py` covers 15 cases:

- request-template validation and inability to claim owner acceptance;
- valid owner draft and accepted owner publication;
- v1, placeholder publication and placeholder evidence rejection;
- manifest/capability digest drift;
- unexpected files, symlinks, relative pack paths and duplicate JSON keys;
- zero source SELECTs after lease expiry;
- atomic cursor advance, strict gap handling and new BUILDING epoch resync;
- explicit tombstone/delete and bounded retention floor;
- per-entity completeness/poll bounds;
- exact fixture/error corpus and read-only authority.

The existing Rust `paper-source-contract` v1 tests remain part of the gate to prove
that N02 preparation did not silently change the accepted reader.

## 8. Acceptance and next phases

N02's Portal-owned slice is complete. N02's external exit gate remains open until a
byte-identical owner package passes `--mode acceptance`.

After owner publication:

1. import the exact four files and their verified digests in a dedicated contract-only
   commit;
2. rerun the verifier and existing v1 regression gates;
3. complete N03 with Trading-System-owned implementation/image/evidence;
4. only then start N04, the Portal Rust lease-aware shared consumer;
5. keep activation and delivery-profile promotion separate through N07/N08.

No owner package means no N03 acceptance, no N04 source consumer and no live Lane B.

The consolidated owner implementation request and exact return paths are in
[`TRADING_SYSTEM_D4_PAPER_READ_V2_IMPLEMENTATION_REQUEST.md`](./TRADING_SYSTEM_D4_PAPER_READ_V2_IMPLEMENTATION_REQUEST.md).
It supersedes piecemeal N02 questions; the owner should return one complete
N02+N03 handoff.
