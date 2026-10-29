
## Snapshot-model spec (blockers read in the gate's own snapshot; ported harness)

Same harness (waits for the real gate response and status, explicit environment-fault detection with at most two annotated navigation retries, app assets served from `dist-ra` on disk), 11 cases at 1280 and 660 = 22 per run, against `claude/slice-followthrough` @ 04a0ceafe plus the fix below.

| Case | Screen shows |
|---|---|
| block available, count 2 | "Evidence incomplete" and one line "Blockers: 2 blockers · <summary>"; the inbox row's own summary is never shown |
| block available, count 0, summary null | "Evidence incomplete", no blocker line, no "no blockers", "0 blockers" or "clear gate" |
| block ABSENT with reason code | generic "Evidence incomplete", no line |
| block key omitted (purpose not authorized) | generic "Evidence incomplete", no line |
| block naming another approval id / another version | the reader refuses the whole body: no gate verdict, no "Evidence incomplete", no line |
| gate 403 / 404 | no gate verdict, no blocker text |
| gate body for another workspace | refused, no gate verdict, no blocker text (this case failed before the product fix, see below) |
| inbox denied / row paged out | the gate's own block still reads: the line is shown |

Runs: 10 consecutive full runs, 22 of 22 cases each (10/10 per case and width), 220 traces, zero ERR_NETWORK_CHANGED in them, no harness retry needed. sha256 of every trace zip: `snapshot-model-trace-sha256.txt`; run summary and run 1 log next to it.

Product defect found by the new workspace case: `getGovernanceParent` showed a well-formed V2 body whose `workspace_id` was another workspace (or whose approval id was another request) under the page's workspace. It now refuses such a body (typed unavailable). Tests: `governanceParent.answers.test.ts`. The `Evidence incomplete` heading was visible for that body before the fix (first run of this spec: 2 failures out of 22).

Not proven: this is the fixture lane; the `LIVE_BLOCKERS` seal is not installed in any real environment, the snapshot guarantee is the backend's real-DB receipt and is not exercised here; assets served from disk do not prove behaviour under a network change.
