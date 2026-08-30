import { Injectable } from "@nestjs/common";
import { PortalUser } from "../domain";
import { SCREEN_BFF_BY_ID, SCREEN_BFF_CATALOGUE } from "./catalogue";
import { SCREEN_BFF_UI_STATES, ScreenBffDefinition } from "./contracts";

export class ScreenBffError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

@Injectable()
export class ScreenBffService {
  catalogue(user: PortalUser, workspaceId: string) {
    const screens = SCREEN_BFF_CATALOGUE
      .filter((definition) => definition.requiredRoles.includes(user.role))
      .map((definition) => this.publicDefinition(definition));
    return {
      schema_version: "execution.screen-bff-catalogue.v1",
      record_authority: "PORTAL_CONTROL",
      workspace_id: workspaceId,
      read_at: new Date().toISOString(),
      actor: this.actor(user),
      exact_total: true,
      total_count: screens.length,
      screens,
    };
  }

  detail(user: PortalUser, workspaceId: string, screenId: string, resourceId?: string) {
    const definition = SCREEN_BFF_BY_ID.get(screenId);
    if (!definition) {
      throw new ScreenBffError("N20_SCREEN_NOT_FOUND", "Screen contract not found.", 404);
    }
    if (!definition.requiredRoles.includes(user.role)) {
      throw new ScreenBffError("N20_SCREEN_ACCESS_DENIED", "Access denied.", 403);
    }
    if (definition.resourceRequired && !resourceId) {
      throw new ScreenBffError("N20_RESOURCE_REQUIRED", "A bound resource is required.", 400);
    }
    if (!definition.resourceRequired && resourceId) {
      throw new ScreenBffError("N20_RESOURCE_NOT_ALLOWED", "This screen is workspace-scoped.", 400);
    }
    const unavailable = definition.dataApi.status === "TYPED_UNAVAILABLE";
    return {
      schema_version: "execution.screen-bff-contract.v1",
      record_authority: "PORTAL_CONTROL",
      workspace_id: workspaceId,
      resource: {
        kind: definition.resourceKind,
        id: resourceId ?? null,
      },
      read_at: new Date().toISOString(),
      actor: this.actor(user),
      screen: this.publicDefinition(definition),
      delivery: {
        state: unavailable ? "unavailable" : "ready",
        freshness: "UNKNOWN",
        completeness: "UNKNOWN",
        payload: null,
        reason_code: definition.dataApi.unavailableReason,
        retryable: false,
      },
    };
  }

  private publicDefinition(definition: ScreenBffDefinition) {
    return {
      screen_id: definition.screenId,
      ui_route_template: definition.uiRoute,
      resource_kind: definition.resourceKind,
      resource_required: definition.resourceRequired,
      required_roles: [...definition.requiredRoles],
      request_ids: [...definition.requestIds],
      source_authorities: [...definition.authorities],
      read_capabilities: [...definition.readCapabilities],
      supported_ui_states: [...SCREEN_BFF_UI_STATES],
      composition_policy: {
        source_join: "SERVER_ONLY",
        verdicts: "SERVER_ONLY",
        counts: "SERVER_ONLY",
        filtering: "SERVER_ONLY",
        sorting: "SERVER_ONLY",
        sla: "SERVER_ONLY",
        permissions: "SERVER_ONLY",
      },
      data_api: {
        status: definition.dataApi.status,
        operation_id: definition.dataApi.operationId,
        method: definition.dataApi.method,
        path_template: definition.dataApi.pathTemplate,
        response_contract: definition.dataApi.responseContract,
        unavailable_reason: definition.dataApi.unavailableReason,
        delivery_phase: definition.dataApi.deliveryPhase,
      },
    };
  }

  private actor(user: PortalUser) {
    return { user_id: user.userId, username: user.username, roles: [user.role] };
  }
}
