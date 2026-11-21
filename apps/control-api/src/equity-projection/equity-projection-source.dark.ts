import type { EquityProjectionSourcePort, EquitySourceRequest } from "./equity-projection-source.port";

/** The ONLY production implementation today. No Edge-qualified equity series and no approved Research band are commissioned, so it performs
 * no I/O, reads no table, runs no query and invents no value: both sections are typed absence. */
export class SourceNotCommissionedPort implements EquityProjectionSourcePort {
  private identity(request: EquitySourceRequest) { return { workspaceId: request.workspaceId, deploymentId: request.deploymentId, environment: request.environment } as const; }
  async series(request: EquitySourceRequest) { return { identity: this.identity(request), section: { availability: "ABSENT", reason_code: "SOURCE_NOT_COMMISSIONED" } as const }; }
  async band(request: EquitySourceRequest) { return { identity: this.identity(request), section: { availability: "ABSENT", reason_code: "SOURCE_NOT_COMMISSIONED" } as const }; }
}
