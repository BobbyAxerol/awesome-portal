import { Controller, Get, Header, Inject, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";

import { OwnerAccessService } from "../auth/owner-access.service";
import { SessionGuard } from "../facade/session.guard";
import type { PortalUser } from "../domain";

/**
 * A4-1 · `owner-access.v1` — the only authority the UI is allowed to consult.
 *
 * Deliberately NOT behind `OwnerAccessGuard`. Every authenticated caller must
 * be able to ask what they may do; answering "403" to a non-owner asking about
 * their own access would force the browser to guess, and guessing is exactly
 * what §20.2 rule 1 forbids. The answer is scoped to the caller: there is no
 * user id parameter, so this route cannot be used to enumerate anyone else.
 *
 * The response carries no secret, no role string to re-evaluate, no owner
 * username and no grant lineage — only the computed effect. A UI that hides a
 * menu is a convenience; the server refuses the route regardless.
 */
@UseGuards(SessionGuard)
@Controller("/api/admin/access")
export class OwnerAccessController {
  constructor(
    @Inject(OwnerAccessService) private readonly ownerAccess: OwnerAccessService,
  ) {}

  @Header("Cache-Control", "no-store")
  @Get("/self")
  async self(@Req() request: FastifyRequest) {
    const user = (request as unknown as { portalUser: PortalUser }).portalUser;
    const access = await this.ownerAccess.effectiveAccess(user.userId);
    return {
      schema_version: "portal.owner-access.v1",
      record_authority: "PORTAL_CONTROL",
      user_id: access.userId,
      is_owner: access.isOwner,
      /*
       * `OWNER_ANCHOR_UNCLAIMED` is reported to an authenticated caller on
       * purpose. "Nobody is the owner yet" and "you are not the owner" are
       * different operational facts, and a Portal that has never run the
       * bootstrap claim needs to be able to say so — otherwise the only
       * symptom is owner pages that silently refuse forever.
       */
      owner_state: access.ownerState,
      capabilities: access.capabilities,
      /*
       * What a mutation will require, stated by the server so the UI can
       * explain a refusal before making it rather than discovering it.
       */
      mutation_requirements: {
        origin: "REQUIRED",
        csrf: "REQUIRED",
        step_up: "REQUIRED_FOR_DESTRUCTIVE",
      },
    };
  }
}
