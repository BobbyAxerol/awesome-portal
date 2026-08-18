/**
 * Cancel-run tests.
 *
 * The claims: the control exists only while the run can still be cancelled, it
 * confirms before firing, it posts to the cancel endpoint, and a 403 reads as
 * "not permitted" rather than as a failed cancel.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CancelRunButton } from "./CancelRunButton";

const originalFetch = globalThis.fetch;

function mount(status: string | null, handler?: (url: string, init?: RequestInit) => Response) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
    handler?.(String(input), init) ??
    new Response(JSON.stringify({ run_id: "r1", status: "CANCELLING" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <CancelRunButton runId="r1" status={status} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("when the control exists", () => {
  it("offers cancel for a run that is still running", () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    mount("RUNNING");
    expect(screen.getByRole("button", { name: /Cancel run r1/ })).toBeTruthy();
  });

  it.each(["COMPLETED", "FAILED", "CANCELLED"])(
    "offers nothing for a terminal run (%s)",
    (status) => {
      mount(status);
      // A control that cannot work is worse than no control (v0.5 §13).
      expect(screen.queryByRole("button", { name: /Cancel run/ })).toBeNull();
    },
  );

  it("offers nothing when the status is unknown", () => {
    // Without a state we cannot claim the run is still running.
    mount(null);
    expect(screen.queryByRole("button", { name: /Cancel run/ })).toBeNull();
  });
});

describe("confirmation", () => {
  it("does not post when the confirmation is declined", async () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    const fetchMock = vi.fn(() => new Response("{}", { status: 200 }));
    mount("RUNNING", fetchMock);

    fireEvent.click(screen.getByRole("button", { name: /Cancel run r1/ }));
    expect(confirm).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to the cancel endpoint once confirmed", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const calls: Array<[string, RequestInit | undefined]> = [];
    mount("RUNNING", (url, init) => {
      calls.push([url, init]);
      return new Response(JSON.stringify({ run_id: "r1", status: "CANCELLING" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    fireEvent.click(screen.getByRole("button", { name: /Cancel run r1/ }));
    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0][0]).toContain("/api/runs/r1/cancel");
    expect(calls[0][1]?.method).toBe("POST");
  });
});

describe("failures", () => {
  it("reports a 403 as missing authority, not as a failed cancel", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    mount(
      "RUNNING",
      () =>
        new Response(JSON.stringify({ error: { message: "Only an ADMIN may cancel a run." } }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
    );

    fireEvent.click(screen.getByRole("button", { name: /Cancel run r1/ }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Only an ADMIN"));
  });

  it("shows the server's message and request id for any other failure", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    mount(
      "RUNNING",
      () =>
        new Response(
          JSON.stringify({ error: { message: "the worker did not respond", request_id: "req-5" } }),
          { status: 502, headers: { "Content-Type": "application/json" } },
        ),
    );

    fireEvent.click(screen.getByRole("button", { name: /Cancel run r1/ }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("the worker did not respond"));
    expect(screen.getByRole("alert").textContent).toContain("req-5");
  });
});
