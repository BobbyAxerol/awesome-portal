import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { SessionGuard } from "../facade/session.guard";
import { CurrentSourceProxyError } from "./current-source.proxy";

@UseGuards(SessionGuard)
@Controller("/api/v1/execution/current-source")
export class ExecutionCurrentSourceController {
  @Get("/:environment/screens/:screenId")
  screen(@Param("environment") _environment: string, @Param("screenId") _screenId: string) {
    throw browserRawSourceForbidden();
  }

  @Get("/:environment/screens/:screenId/sources/:sourceId/relations/:relation")
  relation() {
    throw browserRawSourceForbidden();
  }
}

function browserRawSourceForbidden(): CurrentSourceProxyError {
  return new CurrentSourceProxyError("N20_RAW_SOURCE_BROWSER_FORBIDDEN", 410, {
    availability: "UNAVAILABLE",
    reason_code: "USE_CANONICAL_SCREEN_BFF",
    retryable: false,
  });
}
