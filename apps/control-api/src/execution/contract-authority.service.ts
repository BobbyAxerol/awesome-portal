import { Injectable } from "@nestjs/common";
import { PortalUser } from "../domain";
import { executionContractAuthority } from "./contract-authority";

/** Metadata-only EDS-02 authority.  It never calls Edge, a source DB or a broker. */
@Injectable()
export class ExecutionContractAuthorityService {
  authority(user: PortalUser, workspaceId: string) {
    return executionContractAuthority(user, workspaceId);
  }
}
