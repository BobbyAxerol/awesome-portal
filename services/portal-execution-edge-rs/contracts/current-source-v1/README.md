# Current-source compatibility contract v1

This contract is the N13B boundary between Portal-facing Execution screens and
the sources that exist today. It is deliberately not an idealized Trading
System API and is not permission to mutate Trading System state.

`capability-source-map.json` pins the source and adapter revisions, classifies
every read/action honestly, binds every reviewed screen to named contracts and
fixed sources, and keeps Paper, Sandbox, Live and Canary independent. Canary
uses Portal governance joined to Live facts; there is no Trading System
`canary` source profile.

The Rust `current-source-compat` crate validates this file before it can be
used. Manager relation references must also validate against the authenticated
runtime catalogue. Unknown screens, profiles, relations, capabilities and
actions fail closed. Command entries are inventory only in N13B and cannot be
classified `CONNECTED`.
