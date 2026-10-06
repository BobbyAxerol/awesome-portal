/** P10 server-owned P04 Delta binding installation service. */

import { Injectable } from "@nestjs/common";

import { PortalUser } from "../domain";
import type { ResearchScope } from "./contracts";
import { P04_DELTA_BINDING } from "./p04-delta.binding";
import {FULL03_DELTA_BINDING} from "./full03-delta.binding";
import {FULL06_DELTA_BINDING} from "./full06-delta.binding";
import { ResearchMetadataRepository } from "./repository";
import { ResearchRunCreateError } from "./run-create.error";

export interface ResearchP04DeltaBindingResponse {
  schema_version: "research.p04-delta-binding.v1";
  alpha_id: string;
  alpha_version_id: string;
  execution_adapter_id: "p04.delta-rsi.v1";
  adapter_contract_digest: string;
  alpha_revision: number;
  replayed: boolean;
}
@Injectable()
export class ResearchP04DeltaBindingService {
  constructor(private readonly repository: ResearchMetadataRepository) {}

  /**
   * This is an admin setup operation, not an Alpha import or code upload.
   * The caller supplies no adapter/path/version field; all identity facts are
   * compiled from the protected P04 manifest above.
   */
  async install(
    user: PortalUser,
    scope: ResearchScope,
    installFull03 = false,
    installFull06 = false,
  ): Promise<ResearchP04DeltaBindingResponse> {
    if (user.role !== "ADMIN" || user.status !== "ACTIVE" || user.mustChangePassword) {
      throw new ResearchRunCreateError(
        "RESEARCH_RUN_CREATE_FORBIDDEN",
        "The current account is not eligible to install the Research P04 Delta binding.",
        403,
      );
    }
    const installed = await this.repository.ensureP04DeltaBinding(scope, P04_DELTA_BINDING);
    if(installFull03)await this.repository.ensureP04DeltaBinding(scope,FULL03_DELTA_BINDING);
    if(installFull06)await this.repository.ensureP04DeltaBinding(scope,FULL06_DELTA_BINDING);
    return {
      schema_version: "research.p04-delta-binding.v1",
      alpha_id: installed.alphaId,
      alpha_version_id: installed.alphaVersionId,
      execution_adapter_id: P04_DELTA_BINDING.adapterId,
      adapter_contract_digest: installed.adapterContractDigest,
      alpha_revision: installed.alphaRevision,
      replayed: installed.replayed,
    };
  }
}
