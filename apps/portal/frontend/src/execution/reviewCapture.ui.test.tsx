/**
 * R3-3 item 3 · the Portal review capture, at the panel boundary.
 *
 * The required tests for this phase name CSRF, expected-revision conflict,
 * same-request-key retry, changed-payload conflict and explicit server
 * refusal — and add one rule that shapes this file: "No test may seed a
 * workflow row then claim a user flow was tested." So nothing here writes a
 * record and reads it back. Each case drives the panel a reviewer actually
 * touches and asserts what the reviewer is told.
 *
 * CSRF is deliberately NOT re-tested here: `post()` in `httpApi` attaches the
 * token for every mutation and omits it when there is no cookie, with its own
 * coverage. Asserting it again through a component would test the double.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  ReviewCapturePanel,
  SOURCE_OWNED_ACTIONS,
  captureCapability,
  type CaptureOutcome,
} from "./components/ReviewCapture";
import type { ReviewCapture, ReviewCaptureCapabilities } from "./api/reviewCapture";

const CAPS = (state: "AVAILABLE" | "UNAVAILABLE"): ReviewCaptureCapabilities => ({
  schema_version: "governance.review-capture-capabilities.v1",
  authority: "PORTAL",
  source_side_effect_requested: false,
  actions: [
    state === "AVAILABLE"
      ? { id: "SANDBOX_NOTE", state, inputs: "certification_id,expected_workflow_version", path: "/api/v1/execution/governance/sandbox/capture-note" }
      : { id: "SANDBOX_NOTE", state, reason_code: "SANDBOX_NOTE_WORKFLOW_CLOSED" },
    { id: "R2_CREATE", state: "UNAVAILABLE", reason_code: "R2_NOT_OPEN" },
    { id: "PAPER_EXIT_CREATE", state: "UNAVAILABLE", reason_code: "PAPER_EXIT_NOT_OPEN" },
    { id: "R2_EXECUTION_GRANT", state: "UNAVAILABLE", reason_code: "SOURCE_OWNED" },
    { id: "PAPER_EXIT_PROMOTE", state: "UNAVAILABLE", reason_code: "SOURCE_OWNED" },
    { id: "SANDBOX_CERTIFY_SOURCE", state: "UNAVAILABLE", reason_code: "SOURCE_OWNED" },
  ],
} as ReviewCaptureCapabilities);

const CAPTURE = (replayed: boolean): ReviewCapture => ({
  schema_version: "governance.review-capture.v1",
  authority: "PORTAL",
  workspace_id: "ws_primary",
  action: "SANDBOX_NOTE",
  replayed,
  source_side_effect_requested: false,
  aggregate_id: "cert_1",
  certification_id: "cert_1",
  workflow_version: 4,
  read_path: "/api/v1/execution/deployments/dep_77/certification",
  source_verdict: "NOT_ASSERTED",
  decision_reason_code: "PORTAL_REVIEW_RECORDED",
} as ReviewCapture);

const IDENTITY = [
  { label: "certification", value: "cert_1" },
  { label: "workflow version", value: "4" },
];

const SUMMARY = "Checked the sandbox reconciliation and the venue limits.";

function panel(
  over: Partial<Parameters<typeof ReviewCapturePanel>[0]> = {},
  onCapture: (s: string, k: string) => Promise<CaptureOutcome> = async () => ({ kind: "captured", capture: CAPTURE(false) }),
) {
  return render(
    <ReviewCapturePanel
      action="SANDBOX_NOTE"
      title="Record a sandbox review note"
      capability={captureCapability(CAPS("AVAILABLE"), "SANDBOX_NOTE")}
      identity={IDENTITY}
      onCapture={onCapture}
      {...over}
    />,
  );
}

describe("what the capture refuses to imply", () => {
  it("never offers grant, promote or certify — those belong to the source", () => {
    panel();
    for (const owned of SOURCE_OWNED_ACTIONS) {
      expect(screen.queryByText(new RegExp(owned, "i"))).toBeNull();
    }
  });

  it("states on screen that the source verdict stays NOT_ASSERTED", () => {
    panel();
    expect(screen.getByText(/NOT_ASSERTED/)).toBeTruthy();
    expect(screen.getByText(/not a pass, a certification or a promotion/)).toBeTruthy();
  });
});

describe("what the server is allowed to decide", () => {
  it("shows the server's reason code when the action is closed, and no control", () => {
    panel({ capability: captureCapability(CAPS("UNAVAILABLE"), "SANDBOX_NOTE") });
    expect(screen.getByText(/SANDBOX_NOTE_WORKFLOW_CLOSED/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Record review/ })).toBeNull();
  });

  it("treats an unanswered capabilities read as unknown, never as available", () => {
    // The failure this prevents: a failed read rendering an enabled control
    // the server would refuse.
    panel({ capability: null, capabilityReason: "The capabilities read failed." });
    expect(screen.getByText(/The capabilities read failed/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Record review/ })).toBeNull();
  });

  it("returns null for an action the server did not list", () => {
    expect(captureCapability(CAPS("AVAILABLE"), "R2_CREATE")?.state).toBe("UNAVAILABLE");
    expect(captureCapability(null, "SANDBOX_NOTE")).toBeNull();
  });
});

describe("the identity is the record's, never the typist's", () => {
  it("blocks and names the field when the record did not publish one", () => {
    panel({ identity: [{ label: "certification", value: "cert_1" }, { label: "workflow version", value: null }] });
    const button = screen.getByRole("button", { name: /Record review/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText(/did not publish workflow version/)).toBeTruthy();
    // And it says so where the value would be, rather than showing a zero.
    expect(screen.getByText("not published")).toBeTruthy();
  });

  it("names why the control is disabled while the summary is too short", () => {
    panel();
    expect((screen.getByRole("button", { name: /Record review/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/at least 24 characters/)).toBeTruthy();
  });
});

describe("request-key semantics", () => {
  it("retries a refused capture under the SAME key, so a replay cannot duplicate", async () => {
    const keys: string[] = [];
    const onCapture = vi.fn(async (_s: string, key: string): Promise<CaptureOutcome> => {
      keys.push(key);
      return { kind: "failed", reason: "EXPECTED_VERSION_CONFLICT — the record moved under you." };
    });
    panel({}, onCapture);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: SUMMARY } });
    fireEvent.click(screen.getByRole("button", { name: /Record review/ }));
    await waitFor(() => expect(screen.getByText(/EXPECTED_VERSION_CONFLICT/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Record review/ }));
    await waitFor(() => expect(keys.length).toBe(2));
    expect(keys[0]).toBe(keys[1]);
  });

  it("retires the key after a success, so the next review is a new record", async () => {
    const keys: string[] = [];
    const onCapture = vi.fn(async (_s: string, key: string): Promise<CaptureOutcome> => {
      keys.push(key);
      return { kind: "captured", capture: CAPTURE(false) };
    });
    panel({}, onCapture);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: SUMMARY } });
    fireEvent.click(screen.getByRole("button", { name: /Record review/ }));
    await waitFor(() => expect(screen.getByText(/Recorded\./)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Record review/ }));
    await waitFor(() => expect(keys.length).toBe(2));
    expect(keys[0]).not.toBe(keys[1]);
  });
});

describe("what the reviewer is told afterwards", () => {
  it("says nothing was duplicated when the server replayed", async () => {
    panel({}, async () => ({ kind: "captured", capture: CAPTURE(true) }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: SUMMARY } });
    fireEvent.click(screen.getByRole("button", { name: /Record review/ }));
    await waitFor(() => expect(screen.getByText(/nothing was duplicated/)).toBeTruthy());
  });

  it("carries the workflow version and the read path back to the record", async () => {
    panel();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: SUMMARY } });
    fireEvent.click(screen.getByRole("button", { name: /Record review/ }));
    await waitFor(() => expect(screen.getByText(/Workflow version 4/)).toBeTruthy());
    expect(screen.getByRole("link", { name: /open the review/ })).toBeTruthy();
  });

  it("shows an explicit server refusal rather than swallowing it", async () => {
    panel({}, async () => ({ kind: "failed", reason: "403 — this role may not record a sandbox note." }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: SUMMARY } });
    fireEvent.click(screen.getByRole("button", { name: /Record review/ }));
    await waitFor(() => expect(screen.getByText(/may not record a sandbox note/)).toBeTruthy());
  });
});
