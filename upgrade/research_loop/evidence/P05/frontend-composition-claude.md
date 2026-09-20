# P05 frontend composition — artifact readiness panel

**Status:** `FE_ARTIFACT_PANEL_COMPLETE` · Claude · 2026-09-20

`apps/portal/frontend/src/research/ArtifactPanel.tsx`, used by Run Progress and
Evidence Flow.

- All five states keep the panel: `WRITING`, `SEALED`, `CORRUPT`, `MISSING`,
  `ABORTED`, plus a transport `denied`/`unavailable` overlay. There is no
  `READY`.
- **Export requires three independent facts** — sealed, registered, and a server
  published action. The fixture lane renders the case that matters: *sealed on
  disk, unregistered*, which shows no control and states
  "Sealed on disk but not registered by the authority." Handing over bytes the
  authority has not accepted looks identical to handing over bytes it has.
- `CORRUPT` and `MISSING` keep the panel and its metadata, and remove the
  control rather than leaving it to fail.
- Decimals print byte-for-byte (`1234567890.123456789` survives), a timestamp
  without UTC milliseconds is refused rather than reformatted, and an absent
  number prints *not reported*.
- A denied request renders no metadata at all — asserted by test, because a
  withheld panel that still shows row counts has leaked the thing it refused.

Window captions read `50 of 1204 rows · more available`, never the page size
alone. The cursor is never decoded.

**Data lane:** typed inactive. No artifact DTO exists yet; P10/P11 own it. The
panel takes facts as props, so wiring it later changes no composition.
