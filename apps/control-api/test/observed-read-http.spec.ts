import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { HttpErrorFilter } from "../src/http-error.filter";
import { ObservedReadError } from "../src/execution-v2/observed-read.contract";

function replyTo(error: unknown, url = "/api/v1/execution/observed/overview?environment=paper") {
  const reply = { header: vi.fn(), status: vi.fn(), send: vi.fn() };
  for (const method of [reply.header, reply.status, reply.send]) method.mockReturnValue(reply);
  const request = { method: "GET", url, headers: { "x-request-id": "TEST_ONLY-request" } };
  const host = { switchToHttp: () => ({ getResponse: () => reply, getRequest: () => request }) };
  new HttpErrorFilter().catch(error, host as never);
  return reply;
}
describe("Observed read private HTTP errors", () => {
  it.each([
    ["EXECUTION_OBSERVED_READ_DISABLED", 404], ["EXECUTION_OBSERVED_QUERY_INVALID", 400],
    ["EXECUTION_OBSERVED_NOT_AVAILABLE_SCOPED_WORKSPACE", 409],
  ] as const)("publishes %s without caching an authority result", (code, status) => {
    const reply = replyTo(new ObservedReadError(code, status));
    expect(reply.header).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    expect(reply.status).toHaveBeenCalledWith(status);
    expect(reply.send).toHaveBeenCalledWith({ error: { code, message: "The requested observed read is not available." }, request_id: "TEST_ONLY-request" });
  });
  it("keeps pre-controller session refusals private without broadening neighboring route headers", () => {
    expect(replyTo(new UnauthorizedException()).header).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    expect(replyTo(new UnauthorizedException(), "/api/v1/execution/observed/not-a-route").header)
      .not.toHaveBeenCalledWith("Cache-Control", "private, no-store");
  });
});
