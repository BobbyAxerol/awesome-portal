# EDS-12 reader rollback runbook

Status: `PROFILE_LOCAL_READER_ROLLBACK_ONLY`.

## Trigger

Use this runbook for a source/network/Edge/Portal-DB/disk/cursor/epoch/schema,
corrupt-frame or late-correction gate failure. An uncertain command is outside
this runbook: commands remain disabled for EDS-12.

## Immediate containment

1. Disable only the affected named BFF read/SSE profile. Do this before
   changing the Edge or source side.
2. Preserve the existing append-only Portal observation rows, source/reader
   diagnostics, browser fault evidence and the preceding signed manifest.
3. Render `STALE`, `PARTIAL`, `RESNAPSHOT_REQUIRED` or typed unavailable as
   dictated by the envelope. Never return an empty result as fresh.
4. Do not retry a command, mutate the Trading System, truncate a projection,
   erase an audit record, copy a database across profiles or use one profile as
   a fallback for another.

## Recovery paths

| Fault | Safe recovery |
|---|---|
| Source / network / Edge | restore the exact previously signed reader image and re-run mTLS/JWT/catalogue/profile preflight |
| SGP DB / disk | restore Portal-owned backup or policy-approved partition only, then rebuild from the sealed Portal observation corpus |
| Cursor / epoch | retire the opaque cursor, write gap/resnapshot metadata and rebuild only that relation/profile |
| Schema/catalogue | leave the reader dark until a reviewed adapter/contract digest is compatible |
| Corrupt frame / correction | reject the input before reducer/SSE; keep diagnostic provenance and resnapshot or append a correction observation |

## Verification before re-enable

1. Static qualification and the affected negative test are green.
2. The selected profile's source, environment, audience and catalogue revision
   are exact.
3. Browser state is correctly stale/partial/unavailable while disabled, then
   ready or authoritative empty after recovery.
4. Profile isolation and redaction re-pass.
5. The release owner attaches a new sanitized evidence digest. Do not reuse a
   previous evidence row after a changed image, source contract or epoch.

Rollback changes readers and activation flags; it never deletes append-only
Portal evidence or alters Trading System source data.
