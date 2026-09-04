import { CurrentSourceOperationPolicy } from "./current-source.proxy";
import { MAXIMUM_DATA_INTAKE_V1, MaximumDataEnvironment } from "./maximum-data-intake";

/**
 * Compile-time E5 authority.  The browser never selects a relation, schema,
 * source alias, Edge profile, audience, or capability; it selects at most a
 * page size and a Portal-issued opaque continuation for this one operation.
 */
export const MAXIMUM_DATA_OPERATION_REGISTRY = Object.freeze({
  maximumDataDeploymentPageV1: Object.freeze({
    logicalOperationId: "maximumDataDeploymentPageV1",
    fieldId: "deployment_current",
    publicationRevision: "portal.execution.maximum-data.e5.existing-data-publication.v1",
    sourceContractRevision: "trading-system.portal-execution.manager-v2.runtime.v1",
    sourceCatalogueSha256: MAXIMUM_DATA_INTAKE_V1.returnPack.catalogueDigest,
    sourceHistorySemantics: "CURRENT_STATE_ONLY_NO_SUPERSESSION_JOURNAL",
    sourceId: "manager.deployments",
    schema: "public",
    relation: "strategy_deployments",
    primaryResourceField: "deployment_id",
    allowedFields: Object.freeze([
      "deployment_id",
      "strategy_id",
      "account_id",
      "portfolio_id",
      "mode",
      "venue",
      "currency",
      "state",
      "active",
      "created_at",
      "updated_at",
    ]),
    pageBounds: Object.freeze({
      maximumRows: MAXIMUM_DATA_INTAKE_V1.pageBounds.maximumRows,
      maximumResponseBytes: MAXIMUM_DATA_INTAKE_V1.pageBounds.maximumResponseBytes,
      maximumCursorBytes: MAXIMUM_DATA_INTAKE_V1.pageBounds.maximumCursorBytes,
    }),
    profiles: Object.freeze({
      paper: Object.freeze({
        profileId: "PAPER_BINANCE_USDM",
        audience: "portal-execution-edge-paper",
        screenId: "PAPER_TRADING_SCREEN",
        profileMaximumConcurrency: 1,
      }),
      sandbox: Object.freeze({
        profileId: "SANDBOX_BINANCE_USDM",
        audience: "portal-execution-edge-sandbox",
        screenId: "SANDBOX_TRADING_SCREEN",
        profileMaximumConcurrency: 1,
      }),
      live: Object.freeze({
        profileId: "LIVE_BINANCE_USDM",
        audience: "portal-execution-edge-live",
        screenId: "LIVE_OPERATIONS_SCREEN",
        profileMaximumConcurrency: 2,
      }),
    }),
    sourceMaximumConcurrency: 4,
    adapterRevision: "PORTAL_E5_DEPLOYMENT_PAGE_V1",
  }),
} as const);

export type MaximumDataOperationId = keyof typeof MAXIMUM_DATA_OPERATION_REGISTRY;
export type MaximumDataDeploymentOperation =
  (typeof MAXIMUM_DATA_OPERATION_REGISTRY)["maximumDataDeploymentPageV1"];

export const MAXIMUM_DATA_DEPLOYMENT_OPERATION =
  MAXIMUM_DATA_OPERATION_REGISTRY.maximumDataDeploymentPageV1;

export function maximumDataDeploymentBinding(environment: MaximumDataEnvironment) {
  return MAXIMUM_DATA_DEPLOYMENT_OPERATION.profiles[environment];
}

export function maximumDataDeploymentPolicy(
  environment: MaximumDataEnvironment,
): CurrentSourceOperationPolicy {
  const operation = MAXIMUM_DATA_DEPLOYMENT_OPERATION;
  return {
    operationId: operation.logicalOperationId,
    sourceId: operation.sourceId,
    adapterRevision: operation.adapterRevision,
    maximumResponseBytes: operation.pageBounds.maximumResponseBytes,
    sourceMaximumConcurrency: operation.sourceMaximumConcurrency,
    profileMaximumConcurrency: maximumDataDeploymentBinding(environment).profileMaximumConcurrency,
  };
}
