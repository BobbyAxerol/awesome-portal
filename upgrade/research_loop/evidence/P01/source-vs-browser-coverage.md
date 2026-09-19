# P01 source-vs-browser coverage

This is a denominator ledger, not a product acceptance report. Parsing an HTML file is not proof that its assets, charts, handlers or controls render.

| Screen | Source label | Field records | Action records | Spec test IDs | Source lane | Browser lane |
| --- | --- | ---: | ---: | ---: | --- | --- |
| 00 | Journey Map | 2 | 3 | 14 | SOURCE_INSPECTED | NOT_BROWSER_VERIFIED |
| 01 | Run Library | 3 | 13 | 22 | SOURCE_INSPECTED | NOT_BROWSER_VERIFIED |
| 02 | New Run Preflight | 26 | 24 | 30 | SOURCE_INSPECTED | NOT_BROWSER_VERIFIED |
| 03 | Run Progress | 4 | 15 | 18 | SOURCE_INSPECTED | NOT_BROWSER_VERIFIED |
| 04 | Summary | 6 | 36 | 18 | SOURCE_INSPECTED | NOT_BROWSER_VERIFIED |
| 05 | S1 Split | 2 | 9 | 16 | SOURCE_INSPECTED | NOT_BROWSER_VERIFIED |
| 06 | S2 Search and Selection | 3 | 14 | 19 | SOURCE_INSPECTED | NOT_BROWSER_VERIFIED |
| 07 | S3 Freeze | 3 | 13 | 16 | SOURCE_INSPECTED | NOT_BROWSER_VERIFIED |
| 08 | S4 Execute Replay | 8 | 20 | 22 | SOURCE_INSPECTED | NOT_BROWSER_VERIFIED |
| 09 | Run Report | 2 | 2 | 10 | SOURCE_INSPECTED | NOT_BROWSER_VERIFIED |
| 10 | Attempt Lineage | 2 | 14 | 12 | SOURCE_INSPECTED | NOT_BROWSER_VERIFIED |
| 11 | Release Candidate & Publish | 4 | 8 | 14 | SOURCE_INSPECTED | NOT_BROWSER_VERIFIED |
| 12 | Engine Atlas | 3 | 8 | 10 | SOURCE_INSPECTED | NOT_BROWSER_VERIFIED |
| 13 | Compare | 2 | 8 | 11 | SOURCE_INSPECTED | NOT_BROWSER_VERIFIED |
| 14 | Alpha Import | 3 | 7 | 12 | SOURCE_INSPECTED | NOT_BROWSER_VERIFIED |

## Lane rules

- **SOURCE_INSPECTED**: HTML/spec bytes and source locators were parsed and hash-checked.
- **CONTRACT_MAPPED**: only static source contracts were mapped. It does not imply endpoint availability.
- **NOT_BROWSER_VERIFIED**: no rendered visual, a11y, resize, interaction or screenshot assertion exists yet.
- A missing font, chart asset, `doc-page.js`, browser trace or real build can never be upgraded to a visual PASS by this document.
