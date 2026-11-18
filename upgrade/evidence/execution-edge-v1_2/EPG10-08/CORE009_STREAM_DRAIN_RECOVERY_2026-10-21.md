# Core owns original STREAM drain recovery —21October2026,05:27UTC

Observed delegated cleanup-stream-1 official exit75,
`MANAGER_REVOKE_DRAIN_PENDING`, same artifact d9e3c07d, runtimef3fe876d;
receipt/result timestamp05:26:16.612. This is NOT committed revoke or PASS.
Core READONLY05:27:19:8retainednative rows, unresolved1/unfinished1. Two new
SSEframes SERVED/sourceACK; original third frame lease
`785387ba-ef57-455d-a7ba-f92663baae60`, attempt
`07becd72-1e11-4ab9-8a96-d5fd7339f1a0` remainsADMITTED/no_send_fenced:true,
no physicalreceipt/sourceACK yet. Preserve it; no fabricated abort/ACK.

**Core now owns exact retry2** through official sameartifact/samekey after
offline validator, per CLI's explicit exit75 recovery contract. Edge must not
retry, issue another client or revoke sourcehead concurrently. No forcekill or
restart while this custody remains. Return original stream timeline privately;
wait for terminal recovery before unaffectedREAD/denial checks. Same window,
no grant reissue, changed hash, manualSQL or evidence deletion.
