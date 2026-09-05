# Portal EDS-09 source-owner return

This is a sanitized immutable source-owner package, not a service release.
It is consumable by Portal as a truthful continuity ruling: all three requested
event classes were assessed across PAPER, SANDBOX, and LIVE, and no existing
source qualifies as an EDS-09 authoritative event source.

Start with `wire-contract.md`, then validate `RETURN_MANIFEST.sha256`,
`owner-return.v1.json`, and the files under `acceptance/`. The package carries
the canonical future envelope/snapshot schemas so a later owner-approved
source can adopt them without changing the Portal contract shape.

Run the repository-local validator from the Trading System checkout:

```text
python3 -B scripts/validate_portal_event_source_return.py
```

Then run the Portal-supplied EDS-08 validator against this package's
`owner-return.v1.json`. Neither validation starts a service, opens a source
connection, or grants Portal any runtime authority.
