# Research screen presentation-state semantics v1

**Status:** P02 contract/spec amendment, 2026-09-19. This is a shared
implementation and fixture rule for all Research screens; it is **not** a
claim that a new backend endpoint, producer, or runtime availability envelope
already exists.

The canonical seven presentation states are:

| State | Truth condition | Required presentation | Forbidden shortcut |
|---|---|---|---|
| `loading` | A named request is in flight and no accepted response for its exact scope is available. | Keep the hi-fi composition and use local skeletons at the affected panel. | Replacing the whole route with a generic spinner or fixture screen. |
| `empty` | The authoritative response for the exact scope is successful and has zero rows/items. | Retain filters/scope, name the empty scope, and render the panel's designed empty state. | Calling a `401`, `403`, `502`, timeout, or absent field “empty”. |
| `partial` | The server explicitly declares some requested fields/panels unavailable while returning the remainder. | Render returned panels; mark only missing panels with the server reason and source scope. | Inferring a missing field as zero, `false`, or complete data. |
| `stale` | A previously accepted response is retained with authoritative `as_of`/freshness metadata. | Show the retained value, its timestamp/age, and refresh affordance. | Labelling a response stale without source freshness metadata. |
| `denied` | Server returns `401` or `403`, or a typed authorization refusal. | Preserve unsent local input only; stop automatic retries; render a permission/reauth path without revealing protected content. | Rendering `empty`, retrying an expired session forever, or inferring a role at the browser. |
| `unavailable` | Named dependency returns a transient transport/upstream failure (`502`, `503`, bounded timeout, offline). | Preserve local draft where applicable, retain the rich panel shell, and offer bounded user-triggered retry. | Falling back to mock data, treating failure as a terminal domain state, or silently polling forever. |
| `terminal` | A non-retryable protocol/domain result has been received for the current operation or a terminal run record is authoritative. | Render the named terminal reason and its safe recovery/navigation action; historical panels stay visible when source data exists. | Collapsing a completed/failed historical record into a generic error screen. |

## Authority and transport rules

1. The domain state (`DRAFT`, `PUBLISHED`, `COMPLETED`, and so on) is not the
   same as the presentation state. A screen can be `DRAFT` + `denied`, or
   `PUBLISHED` + `stale`; do not overwrite domain truth with a transport state.
2. Until a named server contract supplies an availability object, client code
   may derive only the presentation state from the concrete HTTP/result class.
   It must not fabricate `as_of`, coverage, a retry-after duration, or a server
   reason. P10/P21/P22 own future typed server envelopes.
3. A `409` correction/drift is terminal for the submitted request, but can have
   a defined recovery transition (for example refetch manifest while retaining
   draft). A `422` is terminal for that payload and must map a server
   `field_path` to the relevant panel when present.
4. `denied` and `unavailable` stop background mutation and stream retry. Any
   retry must be bounded, scoped to the named request, and cancelled on
   unmount/auth scope change. This carries forward RL-L02 and RL-L04.
5. The hi-fi composition survives all seven states. State changes substitute
   panel content, not the entire screen. Typed/empty/partial states never
   disclose data from another workspace or profile.

## Minimal future fixture envelope

P10/P21/P22 may use this fixture-level shape when a screen needs a common
outer state. It does not add a current API field by itself.

```ts
type ResearchPresentationStateV1 =
  | 'loading' | 'empty' | 'partial' | 'stale' | 'denied' | 'unavailable' | 'terminal';

interface ResearchPresentationMetaV1 {
  state: ResearchPresentationStateV1;
  /** Only from source; absent rather than guessed. */
  as_of?: string;
  reason_code?: string;
  display_message?: string;
  retryable: boolean;
}
```

`display_message` must be a safe server-provided message or a fixed local copy
for the raw status class. Never put raw upstream exceptions, credentials,
internal URLs, unbounded response bodies, or cross-workspace identifiers into
the browser.

## Immediate owner application

| Screen | Immediate amendment | Implementation owner |
|---|---|---|
| S02 New Run | Explicit `denied`, `unavailable`, `partial`, `stale`, and terminal recovery states for manifest/registry/preflight/create. | P10 |
| S11 Release Candidate | Explicit `denied` and `unavailable` semantics for publish/PATCH/mirror; source-domain state remains unchanged. | P21/P22 |
| Other screens | Link this contract and add screen-specific test cases before their phase exit. | Owning screen phase |

This shared contract closes the P01 review's *systemic* state-language gap.
It does not mark an unimplemented screen as browser-complete.
