import { Controller, Get, Header, Inject, Optional, Param, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuthSession, PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import { ExecutionReadScopeError } from "./read-scope";
import { ManagerCurrentAccounts } from "./manager-current-accounts";
import { SiblingNativeDelivery } from "./sibling-native-delivery";
import { CurrentViewAuthorityError } from "./current-view-authority";

interface Request extends FastifyRequest { portalUser: PortalUser; portalSession: AuthSession; portalWorkspaceId: string; portalViewerWorkspaceId?: string; }
const text = z.string().min(1).max(256).regex(/^[^\u0000-\u001f\u007f]+$(?![\s\S])/);
const id = z.string().min(1).max(191).regex(/^[A-Za-z0-9._:-]+$(?![\s\S])/);
const common = { workspace_id: text.optional() };
const basic = z.object(common).strict();
const profile = z.object({ ...common, environment: z.enum(["paper", "sandbox", "live"]).optional() }).strict();
const subject = z.object({ ...common, subject_type: text.optional(), subject_id: text.optional(),
  page_size: z.string().regex(/^(?:[1-9]|[1-9][0-9]|1[0-9]{2}|200)$(?![\s\S])/).optional(),
  cursor: z.string().min(1).max(4096).regex(/^[A-Za-z0-9_.-]+$(?![\s\S])/).optional() }).strict();
const subjectType = z.enum(["ALPHA", "PORTFOLIO", "ACCOUNT", "DEPLOYMENT", "OPERATION", "INCIDENT", "APPROVAL"]);

/** Order and subject readers remain dark. Account profile may use only the
 * separately commissioned Manager CURRENT native composition; workspace
 * membership or a client-supplied account is never resource authorization. */
@UseGuards(SessionGuard)
@Controller("/api/v1/execution")
export class SiblingSourceDarkController {
  constructor(@Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
    @Optional() @Inject(ManagerCurrentAccounts) private readonly accounts?: ManagerCurrentAccounts,
    @Optional() @Inject(SiblingNativeDelivery) private readonly siblings?: SiblingNativeDelivery) {}

  @Get("/orders/:order_id/detail") @Header("Cache-Control", "private, no-store")
  order(@Req() request: Request, @Param("order_id") orderId: string, @Query() query: unknown,
    @Res({ passthrough: true }) reply: FastifyReply) {
    return this.deliverSibling(request, query, basic, "order-detail", "ORDER", orderId, reply);
  }
  @Get("/accounts/:account_id/profile") @Header("Cache-Control", "private, no-store")
  async account(@Req() request: Request, @Param("account_id") accountId: string, @Query() raw: unknown,
    @Res({ passthrough: true }) reply: FastifyReply) {
    const query = profile.safeParse(raw);
    if (!query.success || !id.safeParse(accountId).success)
      throw new ExecutionReadScopeError("EXECUTION_READ_QUERY_INVALID", 400);
    const workspaceId = query.data.workspace_id ?? request.portalWorkspaceId;
    if (!await this.workspaces.canReadExecution(workspaceId, request.portalUser.userId, query.data.environment))
      throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
    if (!this.accounts?.hasNativeCurrentRelations() || query.data.environment && query.data.environment !== "paper")
      throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 503);
    let nativeOwnsResponse = false;
    try {
      await this.accounts.readNativeProfile({ user: request.portalUser, session: request.portalSession, workspaceId,
        viewerWorkspaceId: request.portalViewerWorkspaceId ?? request.portalWorkspaceId }, accountId, query.data.environment,
      reply.raw, () => {
        if (nativeOwnsResponse) return;
        if (reply.raw.headersSent || reply.raw.writableEnded || reply.raw.destroyed)
          throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
        reply.hijack(); nativeOwnsResponse = true;
      });
      // A provider that exits without taking physical ownership must never
      // fall through to Fastify's implicit empty success response.
      if (!nativeOwnsResponse) throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
    } catch (error) {
      if (nativeOwnsResponse || reply.raw.headersSent || reply.raw.destroyed || reply.sent) { reply.raw.destroy(); return; }
      throw error;
    }
  }
  @Get("/reconciliation") @Header("Cache-Control", "private, no-store")
  reconciliation(@Req() request: Request, @Query() query: unknown, @Res({ passthrough: true }) reply: FastifyReply) {
    return this.deliverSibling(request, query, subject, "reconciliation", undefined, undefined, reply);
  }
  @Get("/obligations") @Header("Cache-Control", "private, no-store")
  obligations(@Req() request: Request, @Query() query: unknown, @Res({ passthrough: true }) reply: FastifyReply) {
    return this.deliverSibling(request, query, subject, "obligations", undefined, undefined, reply);
  }

  private async deliverSibling(request: Request, raw: unknown, schema: typeof basic | typeof subject,
    family: "order-detail" | "reconciliation" | "obligations", targetType: string | undefined,
    targetId: string | undefined, reply: FastifyReply): Promise<void> {
    const query = schema.safeParse(raw);
    if (!query.success || targetId !== undefined && !id.safeParse(targetId).success)
      throw new ExecutionReadScopeError("EXECUTION_READ_QUERY_INVALID", 400);
    const workspaceId = query.data.workspace_id ?? request.portalWorkspaceId;
    if (!await this.workspaces.canReadExecution(workspaceId, request.portalUser.userId))
      throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
    if (!this.siblings?.hasNativeCurrentRelations()) throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 503);
    let page: { cursor: string | null; pageSize: number } | undefined;
    if (family !== "order-detail") {
      const selected = subject.safeParse(raw);
      if (!selected.success || !subjectType.safeParse(selected.data.subject_type).success || !id.safeParse(selected.data.subject_id).success)
        throw new ExecutionReadScopeError("EXECUTION_READ_QUERY_INVALID", 400);
      targetType = selected.data.subject_type; targetId = selected.data.subject_id;
      page = { cursor: selected.data.cursor ?? null, pageSize: Number(selected.data.page_size ?? "100") };
    }
    let owns = false;
    try {
      await this.siblings.deliver({ user: request.portalUser, session: request.portalSession, workspaceId,
        viewerWorkspaceId: request.portalViewerWorkspaceId ?? request.portalWorkspaceId }, family, targetType!, targetId!, reply.raw, () => {
        if (owns) return;
        if (reply.raw.headersSent || reply.raw.writableEnded || reply.raw.destroyed)
          throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
        reply.hijack(); owns = true;
      }, page);
      if (!owns) throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
    } catch (error) {
      if (owns || reply.raw.headersSent || reply.raw.destroyed || reply.sent) { reply.raw.destroy(); return; }
      if (error instanceof ExecutionReadScopeError) throw error;
      if (error instanceof CurrentViewAuthorityError && error.code === "CURRENT_VIEW_AUTHORITY_CHANGED")
        throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
      if (error instanceof Error && (error as Error & { code?: string }).code === "EXECUTION_POOL_BUSY") throw error;
      throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
    }
  }

}
