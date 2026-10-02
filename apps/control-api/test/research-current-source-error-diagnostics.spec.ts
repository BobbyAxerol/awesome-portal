import { Logger, type ArgumentsHost } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { HttpErrorFilter } from "../src/http-error.filter";
import { ResearchCurrentSourceError } from "../src/research/current-source.error";

describe("bounded private retention diagnostics", () => {
  it("keeps only SQLSTATE in diagnostics, never the underlying SQL/value text", () => {
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const send = vi.fn(), status = vi.fn().mockReturnValue({send});
    const error = new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_UNAVAILABLE", "Current-source data is temporarily unavailable.", 503);
    (error as Error & {cause?: unknown}).cause = {code:"23514",message:"PRIVATE_ROW_DO_NOT_LOG",query:"PRIVATE_SQL"};
    const host = {switchToHttp:()=>({getRequest:()=>({headers:{"x-request-id":"p23-test"}}),getResponse:()=>({status})})} as unknown as ArgumentsHost;
    try {
      new HttpErrorFilter().catch(error,host);
      expect(warn).toHaveBeenCalledWith({event:"research_current_source_unavailable",code:error.code,sqlstate:"23514",request_id:"p23-test"});
      expect(JSON.stringify([warn.mock.calls,send.mock.calls])).not.toContain("PRIVATE_");
      expect(send.mock.calls[0][0]).toEqual({error:{code:error.code,message:error.message},request_id:"p23-test"});
    } finally {warn.mockRestore();}
  });
});
