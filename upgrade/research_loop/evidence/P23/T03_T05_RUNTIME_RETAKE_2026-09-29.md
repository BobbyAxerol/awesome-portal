# P23 T03/T05 — clean candidate runtime retake

2026-09-29 · Codex · `docs/research-loop-plan` · **SCOPED_RETAKE_PASS / FULL_T03_T05_OPEN**.
This supersedes the pending-retake statements in the earlier
[source repair checkpoint](./T03_T05_SOURCE_REPAIR_2026-09-29.md), not the
remaining full qualification gates.

## Candidate and isolation

- Clean source `d4021790702f7ab7b6334ad6651374f8efe758d9`; P23 cell
  `portal-research-p23-ol12`, loopback `127.0.0.1:8096`, `dirty:false` in
  private `identity.json`. Portal API image
  `sha256:b4f23edda66d075bf024e02e9b9f74a7d711ea590a16b93f3718acb143615db2`;
  Control API image
  `sha256:04346dc658335f1a7844c9fc28767d60b4d907c017969d4b09f2157654bc81aa`.
- P23 cell services were healthy after Compose replacement; cell credentials,
  volumes and test data were retained. No dev, production, shared preview,
  Execution or Trading System service was restarted. The 22 P23 test sessions
  were checked/reauthenticated with their existing passwords; no reset or
  privilege change.

## T05: ten named personalized reads

Private receipt:
`/home/bobby/.local/state/portal-research-p23/20260927/runtime/t05-d4021790.json`
(0600). The first attempt halted before writing a receipt because an existing
test session had expired; after normal reauthentication the retake returned:

```json
{"actual_route_count":10,"member_boundary_passed":true,"cache_policy_passed":true,"revalidation_passed":true,"missing_policy":[],"bad_revalidation":[],"bad_authority":[],"full_t05_passed":false}
```

Each named read uses actual same-origin owner/nonmember/anonymous requests;
conditional reads include weak ETag handling. The script deliberately leaves
`full_t05_passed:false`: the separate private artifact/file and export
boundaries are not proved by this ten-route receipt. No body/DTO changed.

## T03: actual full filesystem, append and manifest

Created one fresh, disposable 64-MiB ext4 loop image under private P23 state.
`findmnt` showed `/dev/loop4`, `ext4`, `rw,nosuid,nodev,noexec`; usable total
was 58,675,200 bytes. Two `--rm` one-off runs of the pinned Portal API image
used UID/GID 10001, no network, read-only root, all capabilities dropped,
no-new-privileges, 600-MB memory/swap, 64 PIDs, and a 16-MiB private `/tmp`.
Only the test ext4 mount was writable. No DB row or shared artifact volume was
written by either probe.

| Probe | Actual result |
|---|---|
| Append at 4 MiB free | bounded part and seal succeeded. |
| Append at 0 bytes free | `RESEARCH_ARTIFACT_DISK_FULL`; original sealed manifest SHA-256 `6525fb898c01edb7c6df2d7affadbe1f582cec01eff6d29c4b06412c3a0b88a6` remained readable and unchanged; staging after abort `0`; a new seal recovered; `passed_writer_scope:true`, exit `0`. |
| 128-document manifest at 0 bytes free | `RESEARCH_ARTIFACT_DISK_FULL`, not raw errno 28; same original SHA readable; staging after abort `0`; new seal recovered; `passed_manifest_scope:true`, exit `0`. |

The test mount was unmounted, loop association verified absent, and **only**
the disposable 64-MiB image and its empty mount directory were deleted. The
synthetic test bytes are not recoverable; no Portal artifact/backup/business
data was removed.

## What this does and does not close

The previously failing T03 manifest path and T05 named-read cache path now
pass on a clean pinned candidate. A focused worker negative also proves the
existing `RESOURCE_EXCEEDED` terminal code, no false success and no private
path in the attempt ledger. These do **not** replace a complete P06 durable
run/API disk-full negative or the separate T05 file/export isolation receipt.
T03 and T05 remain partially qualified. W06 Run Library warm p95 remains a
separate FAIL; P23/P24 remain OPEN. No production-active claim.

### Follow-up before file/export retake

Two existing test export jobs returned HTTP 200 but `Cache-Control:null` on
their personalized status GET under the clean `d4021790` image. Download is
already `private, no-store`. The exact status route was amended with
`private, no-store`, 10 focused Control API tests and build passed; a new clean
image is required before counting the file/export boundary as runtime PASS.
