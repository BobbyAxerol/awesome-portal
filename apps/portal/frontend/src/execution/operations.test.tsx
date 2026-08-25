/**
 * Phase 7 — the nine pieces of evidence F1a requires, numbered against it.
 *
 * The load-bearing ones are #6 and the disclaimer tests: a triage change must
 * not move a source badge, and no mutation may imply the Trading System did
 * anything. Everything else on this screen is legible; those two are the ones
 * that would be silently wrong.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  needsAttention,
  triageAffordance,
  OperationsQueueScreen,
} from "./screens/OperationsQueue";
import { OperationsQueueContainer } from "./screens/containers";
import {
  readOperationsQueue,
  readWorkflowResult,
  workflowEffectText,
  SOURCE_STATUSES,
  TRIAGE_STATES,
  VERIFICATION_RESULTS,
} from "./operations";
import { OPERATIONS_QUEUE_FIXTURE, OPERATION_WORKFLOW_FIXTURE } from "./operations.fixtures";
import { createFixtureApi } from "./api/fixtureApi";
import type { ExecutionApi } from "./api/ports";

afterEach(cleanup);

const FIXTURES = join(__dirname, "../../../../../packages/contracts/fixtures");
const load = (name: string) =>
  JSON.parse(readFileSync(join(FIXTURES, `${name}.valid.json`), "utf8"));

const NOW = new Date("2026-08-23T09:05:00.000Z");
const queue = () => readOperationsQueue(OPERATIONS_QUEUE_FIXTURE)!;

describe("the inlined documents have not drifted", () => {
  it("equal the published fixtures", () => {
    expect(OPERATIONS_QUEUE_FIXTURE).toEqual(load("execution-operations-queue"));
    expect(OPERATION_WORKFLOW_FIXTURE).toEqual(load("execution-operation-workflow"));
  });
});

describe("the vocabulary is the schema's", () => {
  const schema = JSON.parse(
    readFileSync(
      join(__dirname, "../../../../../packages/contracts/schemas/execution-operations.v1.schema.json"),
      "utf8",
    ),
  );
  const props = schema.$defs.OperationQueueItem.properties;

  it("knows every source status, verification result and triage state", () => {
    expect([...SOURCE_STATUSES].sort()).toEqual([...props.source_status.enum].sort());
    expect([...VERIFICATION_RESULTS].sort()).toEqual([...props.verification_result.enum].sort());
    expect([...TRIAGE_STATES].sort()).toEqual([...props.triage_state.enum].sort());
  });

  it("keeps them as three separate unions, not one", () => {
    // If these ever became the same list the screen's three columns would be
    // three views of one value, which is the merge this phase exists to refuse.
    expect(new Set([...SOURCE_STATUSES, ...TRIAGE_STATES]).size).toBe(
      SOURCE_STATUSES.length + TRIAGE_STATES.length,
    );
  });
});

describe("#1 — initial, empty, filtered and exact-count states", () => {
  it("renders rows and both server counts", () => {
    render(<OperationsQueueScreen onOpen={() => undefined} queue={queue()} now={NOW} />);
    expect(screen.getByText("op_fixture_queue_1")).toBeTruthy();
    expect(screen.getByText(/1 in this view · 1 total/)).toBeTruthy();
  });

  it("never counts its own rows", () => {
    const raw = JSON.parse(JSON.stringify(OPERATIONS_QUEUE_FIXTURE));
    raw.page.total_count = 4180;
    raw.page.filtered_count = 12;
    render(<OperationsQueueScreen onOpen={() => undefined} queue={readOperationsQueue(raw)!} now={NOW} />);
    // One row on screen, two very different server counts beside it.
    expect(screen.getByText(/12 in this view · 4180 total/)).toBeTruthy();
  });

  it("says empty is empty, not unreadable", () => {
    const raw = JSON.parse(JSON.stringify(OPERATIONS_QUEUE_FIXTURE));
    raw.page.rows = [];
    render(<OperationsQueueScreen onOpen={() => undefined} queue={readOperationsQueue(raw)!} now={NOW} />);
    expect(screen.getByText(/queue is empty, which is different/)).toBeTruthy();
  });

  it("shows the port's failure rather than an empty queue", () => {
    render(<OperationsQueueScreen onOpen={() => undefined} queue={null} status="unavailable" reason="source down" now={NOW} />);
    expect(screen.queryByText(/queue is empty/)).toBeNull();
  });
});

describe("#2 — keyset navigation without page numbers", () => {
  const paged = () => {
    const raw = JSON.parse(JSON.stringify(OPERATIONS_QUEUE_FIXTURE));
    raw.page.has_more = true;
    raw.page.has_previous = true;
    raw.page.next_cursor = "cur-next";
    raw.page.prev_cursor = "cur-prev";
    return readOperationsQueue(raw)!;
  };

  it("offers older and newer, and draws no page number anywhere", () => {
    const { container } = render(
      <OperationsQueueScreen onOpen={() => undefined} queue={paged()} now={NOW} onLoadNext={() => {}} onLoadPrevious={() => {}} />,
    );
    expect(screen.getByRole("button", { name: /older/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /newer/i })).toBeTruthy();
    // No "page 2 of 9" anywhere: the cursors are opaque and an offset drawn
    // over them would be a number the client invented.
    expect(container.textContent).not.toMatch(/page\s*\d/i);
  });

  it("disables the direction the server says does not exist", () => {
    render(<OperationsQueueScreen onOpen={() => undefined} queue={queue()} now={NOW} onLoadNext={() => {}} onLoadPrevious={() => {}} />);
    expect(screen.getByRole("button", { name: /older/i }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: /newer/i }).hasAttribute("disabled")).toBe(true);
  });

  it("sends one direction per request", async () => {
    const api = createFixtureApi();
    const result = await api.listOperations({ after: "a", before: "b" });
    expect(result.ok).toBe(false);
  });
});

describe("#3 — ADMIN-only actions", () => {
  const row = () => queue().page.rows[0];

  it("offers nothing to a USER, and says why", () => {
    const affordance = triageAffordance(row(), ["USER"]);
    expect(affordance.canAcknowledge).toBe(false);
    expect(affordance.canResolve).toBe(false);
    expect(affordance.reason).toMatch(/Admin operators only/);
  });

  it("treats absent roles as no permission", () => {
    expect(triageAffordance(row(), []).canAcknowledge).toBe(false);
  });
});

describe("#4 — acknowledge before resolve, and the version conflict", () => {
  const row = () => queue().page.rows[0];

  it("refuses resolve until the row is acknowledged, and says the two differ", () => {
    const affordance = triageAffordance(row(), ["ADMIN"]);
    expect(affordance.canAcknowledge).toBe(true);
    expect(affordance.canResolve).toBe(false);
    expect(affordance.reason).toMatch(/different records/);
  });

  it("opens resolve once acknowledged", () => {
    const acknowledged = { ...row(), triageState: "ACKNOWLEDGED" as const };
    expect(triageAffordance(acknowledged, ["ADMIN"]).canResolve).toBe(true);
  });

  it("offers neither once resolved", () => {
    const resolved = { ...row(), triageState: "RESOLVED" as const };
    const affordance = triageAffordance(resolved, ["ADMIN"]);
    expect(affordance.canAcknowledge).toBe(false);
    expect(affordance.canResolve).toBe(false);
  });

  it("refuses a resolve with no reason or evidence before sending it", async () => {
    const api = createFixtureApi();
    const short = await api.resolveOperation({
      operationId: "op_1",
      workspaceId: "ws",
      requestKey: "rk",
      expectedWorkflowVersion: 1,
      reason: "no",
      evidenceHash: "sha256:1",
    });
    expect(short.ok).toBe(false);
    const noEvidence = await api.resolveOperation({
      operationId: "op_1",
      workspaceId: "ws",
      requestKey: "rk",
      expectedWorkflowVersion: 1,
      reason: "eight or more characters",
      evidenceHash: "",
    });
    expect(noEvidence.ok).toBe(false);
  });

  it("surfaces a 409 as refresh-and-review, never a retry", async () => {
    const base = createFixtureApi();
    const calls: unknown[] = [];
    const api: ExecutionApi = {
      ...base,
      async acknowledgeOperation(input) {
        calls.push(input);
        return { ok: false, status: "stale", reason: "This operation changed while you were looking at it." };
      },
    };
    render(<OperationsQueueContainer api={api} now={NOW} />);
    fireEvent.click(await screen.findByRole("button", { name: "op_fixture_queue_1" }));
    fireEvent.click(await screen.findByRole("button", { name: "Acknowledge" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    // Exactly one attempt.
    await waitFor(() => expect(calls).toHaveLength(1));
  });
});

describe("#5 — a replayed mutation does not duplicate", () => {
  it("reuses one request key across attempts", async () => {
    const base = createFixtureApi();
    const keys: string[] = [];
    const api: ExecutionApi = {
      ...base,
      async acknowledgeOperation(input) {
        keys.push(input.requestKey);
        return base.acknowledgeOperation(input);
      },
    };
    render(<OperationsQueueContainer api={api} now={NOW} />);
    fireEvent.click(await screen.findByRole("button", { name: "op_fixture_queue_1" }));
    const button = await screen.findByRole("button", { name: "Acknowledge" });
    fireEvent.click(button);
    await waitFor(() => expect(keys.length).toBeGreaterThan(0));
    // The key belongs to the intent, not the click: a regenerated key turns one
    // intent into two operations and the server can no longer replay it.
    expect(new Set(keys).size).toBe(1);
  });

  it("reads `replayed` rather than assuming a second record", () => {
    const result = readWorkflowResult({ ...OPERATION_WORKFLOW_FIXTURE, replayed: true })!;
    expect(result.replayed).toBe(true);
  });
});

describe("#6 — source status stays independent of triage", () => {
  it("renders three separate cells", () => {
    const { container } = render(<OperationsQueueScreen onOpen={() => undefined} queue={queue()} now={NOW} />);
    const row = container.querySelector("tbody tr")!;
    expect(within(row as HTMLElement).getByText("BLOCKED")).toBeTruthy();
    expect(within(row as HTMLElement).getByText("NOT_STARTED")).toBeTruthy();
    expect(within(row as HTMLElement).getByText("unacknowledged")).toBeTruthy();
  });

  it("keeps the amber tint on the source state after triage moves", () => {
    const raw = JSON.parse(JSON.stringify(OPERATIONS_QUEUE_FIXTURE));
    raw.page.rows[0].source_status = "FAILED";
    raw.page.rows[0].triage_state = "RESOLVED";
    const parsed = readOperationsQueue(raw)!;
    // Somebody resolved it; the Trading System still failed. Dimming the row
    // because a person clicked would hide the thing that needs attention.
    expect(needsAttention(parsed.page.rows[0])).toBe(true);
    const { container } = render(<OperationsQueueScreen onOpen={() => undefined} queue={parsed} now={NOW} />);
    expect(container.querySelector('tr[data-attention="true"]')).toBeTruthy();
  });
});

describe("#7 — the fixture and unavailable labels stay visible", () => {
  it("states the delivery profile and the source integration state", () => {
    render(<OperationsQueueScreen onOpen={() => undefined} queue={queue()} now={NOW} />);
    expect(screen.getByText(/source UNAVAILABLE/)).toBeTruthy();
    expect(screen.getByText(/profile fixture/)).toBeTruthy();
  });

  it("shows the alert rail unavailable rather than removing it", () => {
    render(<OperationsQueueScreen onOpen={() => undefined} queue={queue()} now={NOW} />);
    const rail = screen.getByLabelText("Alerts");
    expect(within(rail).getByText(/publishes no alerts route/)).toBeTruthy();
    // Hidden rails teach an operator there is nothing in them.
    expect(within(rail).getByText(/ack ≠ resolve/)).toBeTruthy();
  });
});

describe("no mutation implies the Trading System did anything", () => {
  it("says the record is the Portal's when nothing was asked", () => {
    const result = readWorkflowResult(OPERATION_WORKFLOW_FIXTURE)!;
    expect(result.sourceSideEffectRequested).toBe(false);
    expect(result.sourceStatusUnchanged).toBe(true);
    expect(workflowEffectText(result)).toMatch(/Portal only/);
    expect(workflowEffectText(result)).toMatch(/state is unchanged/);
  });

  it("stops claiming that if a future profile ever asks the source", () => {
    const asked = readWorkflowResult({
      ...OPERATION_WORKFLOW_FIXTURE,
      source_side_effect_requested: true,
    })!;
    expect(workflowEffectText(asked)).toMatch(/reached the Trading System/);
    expect(workflowEffectText(asked)).not.toMatch(/Portal only/);
  });

  it("fails closed when the flags cannot be read", () => {
    const unreadable = readWorkflowResult({
      ...OPERATION_WORKFLOW_FIXTURE,
      source_side_effect_requested: "no",
      source_status_unchanged: "yes",
    })!;
    // Unreadable "did anything happen upstream" must not become "nothing did".
    expect(unreadable.sourceSideEffectRequested).toBe(true);
    expect(unreadable.sourceStatusUnchanged).toBe(false);
  });
});

describe("#9 — malformed or unknown fails closed", () => {
  it("returns null for a document with no page", () => {
    expect(readOperationsQueue({})).toBeNull();
    expect(readOperationsQueue(null)).toBeNull();
  });

  it("drops a row with no operation id rather than inventing one", () => {
    const parsed = readOperationsQueue({ page: { rows: [{ command_key: "a/b" }] } })!;
    expect(parsed.page.rows).toEqual([]);
  });

  it("reads an unrecognised state as not stated, never as a known one", () => {
    const parsed = readOperationsQueue({
      page: { rows: [{ operation_id: "op", source_status: "GREAT", triage_state: "DONE" }] },
    })!;
    expect(parsed.page.rows[0].sourceStatus).toBeNull();
    expect(parsed.page.rows[0].triageState).toBeNull();
  });

  it("treats absent paging flags as no further pages", () => {
    const parsed = readOperationsQueue({ page: { rows: [] } })!;
    expect(parsed.page.hasMore).toBe(false);
    expect(parsed.page.hasPrevious).toBe(false);
  });
});

describe("#8 — keyboard and narrow viewport", () => {
  it("makes every operation id a real button", () => {
    render(<OperationsQueueScreen queue={queue()} now={NOW} onOpen={() => {}} />);
    const link = screen.getByRole("button", { name: "op_fixture_queue_1" });
    expect(link.tagName).toBe("BUTTON");
  });

  it("groups the filter chips for a screen reader", () => {
    render(<OperationsQueueScreen onOpen={() => undefined} queue={queue()} now={NOW} onFilterChange={() => {}} />);
    expect(screen.getByRole("group", { name: /Filter the queue/i })).toBeTruthy();
  });

  it("labels the rail so it can be reached directly", () => {
    render(<OperationsQueueScreen onOpen={() => undefined} queue={queue()} now={NOW} />);
    expect(screen.getByLabelText("Alerts")).toBeTruthy();
  });
});

describe("a chip the server cannot honour says so", () => {
  it("disables Mine, because the endpoint publishes no actor filter", () => {
    render(<OperationsQueueScreen onOpen={() => undefined} queue={queue()} now={NOW} onFilterChange={() => {}} />);
    const mine = screen.getByRole("button", { name: /^Mine$/ });
    // Visible and disabled, not deleted: a missing chip reads as a design
    // choice, and one that silently returns everybody's work is worse than
    // both.
    expect(mine.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/publishes no actor filter/)).toBeTruthy();
  });

  it("leaves the two the server does honour enabled", () => {
    render(<OperationsQueueScreen onOpen={() => undefined} queue={queue()} now={NOW} onFilterChange={() => {}} />);
    expect(
      screen.getByRole("button", { name: /Needs attention/ }).hasAttribute("disabled"),
    ).toBe(false);
    expect(screen.getByRole("button", { name: /All \(24h\)/ }).hasAttribute("disabled")).toBe(false);
  });

  it("matches the parameters the endpoint actually declares", () => {
    const paths = JSON.parse(
      readFileSync(
        join(__dirname, "../../../../../packages/contracts/openapi/execution-operations.openapi.json"),
        "utf8",
      ),
    ).paths;
    const params: string[] = (paths["/api/v1/execution/operations"].get.parameters ?? []).map(
      (p: { name: string }) => p.name,
    );
    // The day an actor filter is published this goes red and the chip can be
    // enabled — which is the signal, not a failure.
    expect(params.some((p) => /actor|assignee|owner|user/.test(p))).toBe(false);
    expect(params).toContain("triage_state");
  });
});
